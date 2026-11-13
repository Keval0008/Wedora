import "server-only";
import { createHash } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, isDuplicateKey } from "../db";
import { song, songList, songSubmission, type Song, type SongList } from "../db/schema";
import { getEnv } from "../env";
import { newId } from "../lib/ids";
import { findMatch, normalizeTitle } from "../lib/songs/dedupe";
import { lookupSong, MetaError, type SongMeta } from "../lib/songs/metadata";
import { isAllowedThumbnail } from "../lib/songs/search";
import { findYoutubeId, youtubeConfigured } from "../lib/songs/youtube";

export const SUBMISSIONS_PER_WINDOW = 20;
export const WINDOW_MS = 10 * 60_000;
export const MAX_LINKS_PER_SUBMIT = 10;

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${getEnv().IP_HASH_SALT}:${ip}`).digest("hex");
}

/** The caller's address as Vercel reports it. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function recentSubmissionCount(ipHash: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(songSubmission)
    .where(and(eq(songSubmission.ipHash, ipHash), gte(songSubmission.createdAt, new Date(now.getTime() - WINDOW_MS))));
  return Number(row?.n ?? 0);
}

/** One song as the guest form and the owner's add box send it. */
export const SongEntrySchema = z.object({
  link: z.string().trim().max(600).nullable().optional(),
  title: z.string().trim().max(300).nullable().optional(),
  artist: z.string().trim().max(300).nullable().optional(),
  thumbnailUrl: z.string().max(600).nullable().optional(),
  durationSec: z.number().int().min(0).max(36_000).nullable().optional(),
  performer: z.string().trim().max(120).nullable().optional(),
  cutStartSec: z.number().int().min(0).max(3600).nullable().optional(),
  cutEndSec: z.number().int().min(0).max(3600).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type SubmitEntry = {
  /** A pasted link, or empty when the guest typed a title instead. */
  link?: string | null;
  title?: string | null;
  artist?: string | null;
  /** From a search pick (iTunes/Spotify cover art); checked against an allow-list. */
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  // sangeet
  performer?: string | null;
  cutStartSec?: number | null;
  cutEndSec?: number | null;
  notes?: string | null;
};

export type SubmitResult = {
  input: string;
  status: "added" | "voted" | "taken" | "error";
  title?: string;
  artist?: string | null;
  thumbnailUrl?: string | null;
  message: string;
};

type ListSongRow = Pick<Song, "id" | "normKey" | "spotifyId" | "youtubeId" | "title" | "performer" | "thumbnailUrl">;

async function listSongs(listId: string): Promise<ListSongRow[]> {
  return db
    .select({
      id: song.id,
      normKey: song.normKey,
      spotifyId: song.spotifyId,
      youtubeId: song.youtubeId,
      title: song.title,
      performer: song.performer,
      thumbnailUrl: song.thumbnailUrl,
    })
    .from(song)
    .where(eq(song.listId, listId));
}

async function nextSortOrder(listId: string): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${song.sortOrder}), -1) + 1`.mapWith(Number) })
    .from(song)
    .where(eq(song.listId, listId));
  return row?.next ?? 0;
}

/**
 * Adds one suggestion to a list, folding it into an existing song when it is
 * the same track (same link, or the same normalized title from another platform).
 */
export async function submitOne(
  list: SongList,
  entry: SubmitEntry,
  who: { submitterName: string; ipHash: string; note?: string | null },
  existing: ListSongRow[],
): Promise<SubmitResult> {
  const input = (entry.link || entry.title || "").trim();

  let meta: SongMeta | null = null;
  if (entry.link?.trim()) {
    try {
      meta = await lookupSong(entry.link);
    } catch (error) {
      return { input, status: "error", message: error instanceof MetaError ? error.message : "Couldn't read that link." };
    }
  } else if (!entry.title?.trim()) {
    return { input, status: "error", message: "Paste a link or type the song name." };
  }

  const title = meta?.title ?? entry.title!.trim();
  const artist = meta?.artist ?? (entry.artist?.trim() || null);
  const normKey = normalizeTitle(title, artist).slice(0, 300);
  const incoming = {
    spotifyId: meta?.platform === "spotify" ? meta.id : null,
    youtubeId: meta?.platform === "youtube" ? meta.id : null,
    normKey,
  };

  const match = findMatch(incoming, existing);
  const pickedThumb = isAllowedThumbnail(entry.thumbnailUrl) ? entry.thumbnailUrl! : null;
  const thumbnailUrl = meta?.thumbnailUrl ?? pickedThumb;
  const durationSec = meta?.durationSec ?? (entry.durationSec && entry.durationSec > 0 ? Math.round(entry.durationSec) : null);
  const shown = { title, artist, thumbnailUrl };

  if (match && match.type !== "near") {
    if (list.kind === "sangeet") {
      const by = match.song.performer ? ` by ${match.song.performer}` : "";
      return { input, status: "taken", ...shown, message: `"${match.song.title}" is already taken${by}. Pick another song?` };
    }
    // Same track from the other platform: remember both links.
    const fill: Partial<Song> = {};
    if (incoming.spotifyId && !existing.some((s) => s.spotifyId === incoming.spotifyId)) {
      const target = existing.find((s) => s.id === match.song.id);
      if (target && !target.spotifyId) {
        fill.spotifyId = incoming.spotifyId;
        target.spotifyId = incoming.spotifyId;
      }
    }
    if (incoming.youtubeId && !existing.some((s) => s.youtubeId === incoming.youtubeId)) {
      const target = existing.find((s) => s.id === match.song.id);
      if (target && !target.youtubeId) {
        fill.youtubeId = incoming.youtubeId;
        target.youtubeId = incoming.youtubeId;
      }
    }
    // A typed song gets the cover art of a later, better suggestion.
    const target = existing.find((s) => s.id === match.song.id);
    if (target && !target.thumbnailUrl && thumbnailUrl) {
      fill.thumbnailUrl = thumbnailUrl.slice(0, 600);
      target.thumbnailUrl = fill.thumbnailUrl;
    }
    if (Object.keys(fill).length) await db.update(song).set(fill).where(eq(song.id, match.song.id)).catch(() => undefined);
    await db.insert(songSubmission).values({
      id: newId(),
      songId: match.song.id,
      listId: list.id,
      submitterName: who.submitterName,
      rawUrl: entry.link?.slice(0, 600) ?? null,
      note: who.note ?? null,
      ipHash: who.ipHash,
    });
    return { input, status: "voted", ...shown, title: match.song.title, message: "Already on the list. We counted your vote ✓" };
  }

  const id = newId();
  try {
    await db.insert(song).values({
      id,
      listId: list.id,
      spotifyId: incoming.spotifyId,
      youtubeId: incoming.youtubeId,
      title: title.slice(0, 300),
      artist: artist?.slice(0, 300) ?? null,
      thumbnailUrl: thumbnailUrl?.slice(0, 600) ?? null,
      durationSec,
      normKey,
      possibleDupOf: match?.type === "near" ? match.song.id : null,
      sortOrder: await nextSortOrder(list.id),
      performer: entry.performer?.trim().slice(0, 120) || null,
      cutStartSec: entry.cutStartSec ?? null,
      cutEndSec: entry.cutEndSec ?? null,
      notes: entry.notes?.trim().slice(0, 2000) || null,
    });
  } catch (error) {
    // Two guests submitted the same link at the same moment: count it as a vote.
    if (isDuplicateKey(error)) {
      const fresh = await listSongs(list.id);
      existing.splice(0, existing.length, ...fresh);
      return submitOne(list, entry, who, existing);
    }
    throw error;
  }

  await db.insert(songSubmission).values({
    id: newId(),
    songId: id,
    listId: list.id,
    submitterName: who.submitterName,
    rawUrl: entry.link?.slice(0, 600) ?? null,
    note: who.note ?? null,
    ipHash: who.ipHash,
  });
  existing.push({ id, normKey, spotifyId: incoming.spotifyId, youtubeId: incoming.youtubeId, title, performer: entry.performer ?? null, thumbnailUrl });
  // Find it on YouTube for the DJ after replying, so the guest doesn't wait.
  if (!incoming.youtubeId && youtubeConfigured()) waitUntil(attachYoutube(id, title, artist, !thumbnailUrl));
  return { input, status: "added", ...shown, message: "Added ✓" };
}

/**
 * Looks the song up on YouTube and stores the video id (and its thumbnail when
 * the song had none). Skips quietly if another song on the list already has
 * that video, or if the day's YouTube quota is used up.
 */
export async function attachYoutube(songId: string, title: string, artist: string | null, needsThumbnail: boolean): Promise<boolean> {
  try {
    const youtubeId = await findYoutubeId(title, artist);
    if (!youtubeId) return false;
    await db
      .update(song)
      .set({ youtubeId, ...(needsThumbnail ? { thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg` } : {}) })
      .where(and(eq(song.id, songId), isNull(song.youtubeId)));
    return true;
  } catch (error) {
    if (!isDuplicateKey(error)) console.error("[youtube] could not attach a link:", error);
    return false;
  }
}

export async function submitMany(
  list: SongList,
  entries: SubmitEntry[],
  who: { submitterName: string; ipHash: string; note?: string | null },
): Promise<SubmitResult[]> {
  const existing = await listSongs(list.id);
  const results: SubmitResult[] = [];
  // One at a time, so two links for the same song in one paste merge correctly.
  for (const entry of entries.slice(0, MAX_LINKS_PER_SUBMIT)) {
    results.push(await submitOne(list, entry, who, existing));
  }
  return results;
}

export async function loadListBySlug(column: "submitSlug" | "djSlug", slug: string) {
  const [row] = await db
    .select()
    .from(songList)
    .where(eq(column === "submitSlug" ? songList.submitSlug : songList.djSlug, slug))
    .limit(1);
  return row ?? null;
}
