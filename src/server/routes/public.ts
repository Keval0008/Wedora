import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { organization, runItem, user, weddingFunction, weddingSettings } from "../db/schema";
import { router } from "../hono";
import { HttpError, notFound, parse, readJson, tooMany } from "../lib/http";
import { lookupSong, MetaError } from "../lib/songs/metadata";
import { songsWithVotes } from "./songs";
import { runItemColumns, runItemOrder } from "./functions";
import {
  clientIp,
  hashIp,
  loadListBySlug,
  MAX_LINKS_PER_SUBMIT,
  recentSubmissionCount,
  submitMany,
  SUBMISSIONS_PER_WINDOW,
} from "../services/songs";

/** No login on these routes: they back the links shared with guests and the DJ. */
export const publicRouter = router();

async function coupleNamesFor(teamId: string): Promise<string | null> {
  const [s] = await db
    .select({ coupleNames: weddingSettings.coupleNames, orgName: organization.name })
    .from(organization)
    .leftJoin(weddingSettings, eq(weddingSettings.organizationId, organization.id))
    .where(eq(organization.id, teamId))
    .limit(1);
  return s?.coupleNames || s?.orgName || null;
}

/** Public data for the guest form at /s/<slug>. */
export async function publicListView(slug: string) {
  const list = await loadListBySlug("submitSlug", slug);
  if (!list) return null;
  const songs = list.showListToGuests ? await songsWithVotes(list.id, { includeHidden: false }) : [];
  return {
    title: list.title,
    description: list.description,
    kind: list.kind,
    isOpen: list.isOpen,
    showListToGuests: list.showListToGuests,
    coupleNames: await coupleNamesFor(list.organizationId),
    songs: songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      thumbnailUrl: s.thumbnailUrl,
      performer: s.performer,
      votes: s.votes,
    })),
  };
}

publicRouter.get("/lists/:slug", async (c) => {
  const view = await publicListView(c.req.param("slug"));
  if (!view) throw notFound("This song list doesn't exist (or its link was changed).");
  return c.json(view);
});

/* A small per-instance brake on the link preview, which calls out to Spotify and YouTube. */
const previewHits = new Map<string, { n: number; resetAt: number }>();
function allowPreview(key: string): boolean {
  const now = Date.now();
  const hit = previewHits.get(key);
  if (!hit || hit.resetAt < now) {
    if (previewHits.size > 5000) previewHits.clear();
    previewHits.set(key, { n: 1, resetAt: now + 60_000 });
    return true;
  }
  hit.n++;
  return hit.n <= 40;
}

/** GET /api/public/lists/:slug/preview?url= — album art and title while the guest types. */
publicRouter.get("/lists/:slug/preview", async (c) => {
  const list = await loadListBySlug("submitSlug", c.req.param("slug"));
  if (!list) throw notFound("This song list doesn't exist.");
  if (!allowPreview(hashIp(clientIp(c.req.raw.headers)))) throw tooMany();
  const url = z.string().min(1).max(600).safeParse(c.req.query("url"));
  if (!url.success) return c.json({ ok: false, message: "Paste a link" });
  try {
    const meta = await lookupSong(url.data);
    return c.json({ ok: true, meta });
  } catch (error) {
    return c.json({ ok: false, message: error instanceof MetaError ? error.message : "Couldn't read that link." });
  }
});

const SubmitInput = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  /** Honeypot: people never see this field, bots fill it in. */
  website: z.string().max(200).optional(),
  note: z.string().trim().max(500).optional(),
  entries: z
    .array(
      z.object({
        link: z.string().trim().max(600).nullable().optional(),
        title: z.string().trim().max(300).nullable().optional(),
        artist: z.string().trim().max(300).nullable().optional(),
        performer: z.string().trim().max(120).nullable().optional(),
        cutStartSec: z.number().int().min(0).max(3600).nullable().optional(),
        cutEndSec: z.number().int().min(0).max(3600).nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .min(1, "Add at least one song")
    .max(MAX_LINKS_PER_SUBMIT, `Up to ${MAX_LINKS_PER_SUBMIT} songs at a time`),
});

publicRouter.post("/lists/:slug/submit", async (c) => {
  const list = await loadListBySlug("submitSlug", c.req.param("slug"));
  if (!list) throw notFound("This song list doesn't exist.");
  if (!list.isOpen) throw new HttpError(410, "This list is closed. Thank you!");

  const input = parse(SubmitInput, await readJson(c.req.raw));
  // Pretend success to bots so they don't retry.
  if (input.website) return c.json({ results: input.entries.map((e) => ({ input: e.link ?? e.title ?? "", status: "added", message: "Added ✓" })) });

  const ipHash = hashIp(clientIp(c.req.raw.headers));
  const used = await recentSubmissionCount(ipHash);
  if (used + input.entries.length > SUBMISSIONS_PER_WINDOW) {
    throw tooMany("That's a lot of songs! Wait ten minutes and send the rest.");
  }

  const results = await submitMany(list, input.entries, {
    submitterName: input.name,
    ipHash,
    note: input.note || null,
  });
  return c.json({ results });
});

/** Read-only run order for the DJ at /dj/<slug>. */
export async function djView(slug: string) {
  const list = await loadListBySlug("djSlug", slug);
  if (!list) return null;
  const songs = await songsWithVotes(list.id, { includeHidden: false });
  return {
    title: list.title,
    kind: list.kind,
    coupleNames: await coupleNamesFor(list.organizationId),
    songs: songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      thumbnailUrl: s.thumbnailUrl,
      spotifyId: s.spotifyId,
      youtubeId: s.youtubeId,
      durationSec: s.durationSec,
      performer: s.performer,
      cutStartSec: s.cutStartSec,
      cutEndSec: s.cutEndSec,
      notes: s.notes,
      votes: s.votes,
    })),
  };
}

publicRouter.get("/dj/:slug", async (c) => {
  const view = await djView(c.req.param("slug"));
  if (!view) throw notFound("This DJ link doesn't exist (or it was changed).");
  return c.json(view);
});

/** The family run-sheet at /r/<slug>, when the owner has made it public. */
export async function runSheetView(slug: string) {
  const [settings] = await db.select().from(weddingSettings).where(eq(weddingSettings.runSheetSlug, slug)).limit(1);
  if (!settings || !settings.runSheetPublic) return null;

  const functions = await db
    .select()
    .from(weddingFunction)
    .where(and(eq(weddingFunction.organizationId, settings.organizationId), eq(weddingFunction.archived, false)))
    .orderBy(asc(weddingFunction.date), asc(weddingFunction.startTime));
  const items = await db
    .select(runItemColumns)
    .from(runItem)
    .leftJoin(user, eq(runItem.ownerUserId, user.id))
    .where(eq(runItem.organizationId, settings.organizationId))
    .orderBy(...runItemOrder);

  return {
    coupleNames: await coupleNamesFor(settings.organizationId),
    weddingDate: settings.weddingDate,
    functions: functions.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      date: f.date,
      startTime: f.startTime,
      venue: f.venue,
      mapUrl: f.mapUrl,
      dressCode: f.dressCode,
      notes: f.notes,
      items: items
        .filter((i) => i.functionId === f.id)
        .map((i) => ({ id: i.id, time: i.time, title: i.title, owner: i.ownerUserName ?? i.ownerName, notes: i.notes, done: i.done })),
    })),
  };
}

publicRouter.get("/runsheet/:slug", async (c) => {
  const view = await runSheetView(c.req.param("slug"));
  if (!view) throw notFound("This run-sheet isn't shared right now.");
  return c.json(view);
});
