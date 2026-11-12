import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { affectedRows, db, isDuplicateKey } from "../db";
import { song, songList, songListKinds, songSubmission } from "../db/schema";
import { requireAuth, requireTeam, requireTeamAdmin, router } from "../hono";
import { badRequest, conflict, notFound, parse, readJson } from "../lib/http";
import { newId, newSlug } from "../lib/ids";
import { normalizeTitle } from "../lib/songs/dedupe";
import { lookupSong, MetaError } from "../lib/songs/metadata";
import { submitMany } from "../services/songs";

export const songListsRouter = router();
songListsRouter.use(requireAuth, requireTeam);

const DEFAULT_TITLES: Record<(typeof songListKinds)[number], string> = {
  baraat: "Baraat songs",
  sangeet: "Sangeet performances",
  other: "Song requests",
};

async function loadList(teamId: string, id: string) {
  const [row] = await db
    .select()
    .from(songList)
    .where(and(eq(songList.id, id), eq(songList.organizationId, teamId)))
    .limit(1);
  if (!row) throw notFound("Song list not found");
  return row;
}

/**
 * GET /api/song-lists — each list with its song count.
 *
 * The counts come from a separate grouped query. A correlated subquery in the
 * select list doesn't work here: on a single-table select Drizzle leaves column
 * names unqualified, so `list_id = id` would compare a song with itself.
 */
songListsRouter.get("/", async (c) => {
  const lists = await db
    .select()
    .from(songList)
    .where(eq(songList.organizationId, c.get("team").id))
    .orderBy(asc(songList.createdAt));
  if (!lists.length) return c.json({ lists: [] });

  const counts = await db
    .select({
      listId: song.listId,
      songCount: sql<number>`sum(case when ${song.hidden} = false then 1 else 0 end)`.mapWith(Number),
      dupCount: sql<number>`sum(case when ${song.possibleDupOf} is not null then 1 else 0 end)`.mapWith(Number),
    })
    .from(song)
    .where(inArray(song.listId, lists.map((l) => l.id)))
    .groupBy(song.listId);
  const byList = new Map(counts.map((r) => [r.listId, r]));

  return c.json({
    lists: lists.map((l) => ({
      ...l,
      songCount: byList.get(l.id)?.songCount ?? 0,
      dupCount: byList.get(l.id)?.dupCount ?? 0,
    })),
  });
});

songListsRouter.post("/", async (c) => {
  const input = parse(
    z.object({
      kind: z.enum(songListKinds),
      title: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(2000).nullable().optional(),
    }),
    await readJson(c.req.raw),
  );
  const id = newId();
  await db.insert(songList).values({
    id,
    organizationId: c.get("team").id,
    kind: input.kind,
    title: input.title ?? DEFAULT_TITLES[input.kind],
    description: input.description ?? null,
    submitSlug: newSlug(),
    djSlug: newSlug(),
    createdById: c.get("user").id,
  });
  return c.json({ list: await loadList(c.get("team").id, id) }, 201);
});

songListsRouter.patch("/:id", async (c) => {
  const input = parse(
    z.object({
      title: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(2000).nullable().optional(),
      isOpen: z.boolean().optional(),
      showListToGuests: z.boolean().optional(),
      rotateSubmitLink: z.boolean().optional(),
      rotateDjLink: z.boolean().optional(),
    }),
    await readJson(c.req.raw),
  );
  const list = await loadList(c.get("team").id, c.req.param("id"));
  const { rotateSubmitLink, rotateDjLink, ...rest } = input;
  const patch = {
    ...rest,
    ...(rotateSubmitLink ? { submitSlug: newSlug() } : {}),
    ...(rotateDjLink ? { djSlug: newSlug() } : {}),
  };
  if (Object.keys(patch).length) await db.update(songList).set(patch).where(eq(songList.id, list.id));
  return c.json({ list: await loadList(c.get("team").id, list.id) });
});

songListsRouter.delete("/:id", requireTeamAdmin, async (c) => {
  const list = await loadList(c.get("team").id, c.req.param("id"));
  await db.delete(songList).where(eq(songList.id, list.id));
  return c.body(null, 204);
});

/** Songs on a list in running order, each with who asked for it. */
export async function songsWithVotes(listId: string, opts: { includeHidden: boolean }) {
  const rows = await db
    .select()
    .from(song)
    .where(opts.includeHidden ? eq(song.listId, listId) : and(eq(song.listId, listId), eq(song.hidden, false)))
    .orderBy(asc(song.sortOrder), asc(song.createdAt));
  if (!rows.length) return [];

  const subs = await db
    .select({ songId: songSubmission.songId, submitterName: songSubmission.submitterName, rawUrl: songSubmission.rawUrl, note: songSubmission.note, createdAt: songSubmission.createdAt })
    .from(songSubmission)
    .where(inArray(songSubmission.songId, rows.map((r) => r.id)))
    .orderBy(asc(songSubmission.createdAt));
  const bySong = new Map<string, typeof subs>();
  for (const s of subs) bySong.set(s.songId, [...(bySong.get(s.songId) ?? []), s]);

  return rows.map((r) => {
    const list = bySong.get(r.id) ?? [];
    return {
      ...r,
      votes: list.length,
      submitters: [...new Set(list.map((s) => s.submitterName))],
      submissions: list.map(({ songId: _s, ...rest }) => rest),
    };
  });
}

songListsRouter.get("/:id/songs", async (c) => {
  const list = await loadList(c.get("team").id, c.req.param("id"));
  return c.json({ list, songs: await songsWithVotes(list.id, { includeHidden: true }) });
});

/** POST /api/song-lists/:id/songs — the owner adds songs directly, like a guest would. */
songListsRouter.post("/:id/songs", async (c) => {
  const list = await loadList(c.get("team").id, c.req.param("id"));
  const input = parse(
    z.object({
      entries: z
        .array(
          z.object({
            link: z.string().max(600).nullable().optional(),
            title: z.string().max(300).nullable().optional(),
            artist: z.string().max(300).nullable().optional(),
            performer: z.string().max(120).nullable().optional(),
            cutStartSec: z.number().int().min(0).max(3600).nullable().optional(),
            cutEndSec: z.number().int().min(0).max(3600).nullable().optional(),
            notes: z.string().max(2000).nullable().optional(),
          }),
        )
        .min(1)
        .max(10),
    }),
    await readJson(c.req.raw),
  );
  const results = await submitMany(list, input.entries, { submitterName: c.get("user").name.slice(0, 80), ipHash: "owner" });
  return c.json({ results });
});

songListsRouter.put("/:id/order", async (c) => {
  const list = await loadList(c.get("team").id, c.req.param("id"));
  const { ids } = parse(z.object({ ids: z.array(z.string().max(36)).max(1000) }), await readJson(c.req.raw));
  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.update(song).set({ sortOrder: index }).where(and(eq(song.id, id), eq(song.listId, list.id)));
    }
  });
  return c.json({ ok: true });
});

/* ------------------------------------------------------------- one song */

export const songsRouter = router();
songsRouter.use(requireAuth, requireTeam);

async function loadSong(teamId: string, id: string) {
  const [row] = await db
    .select({ song, list: songList })
    .from(song)
    .innerJoin(songList, eq(song.listId, songList.id))
    .where(and(eq(song.id, id), eq(songList.organizationId, teamId)))
    .limit(1);
  if (!row) throw notFound("Song not found");
  return row;
}

songsRouter.patch("/:id", async (c) => {
  const input = parse(
    z.object({
      title: z.string().trim().min(1).max(300).optional(),
      artist: z.string().trim().max(300).nullable().optional(),
      hidden: z.boolean().optional(),
      performer: z.string().trim().max(120).nullable().optional(),
      cutStartSec: z.number().int().min(0).max(3600).nullable().optional(),
      cutEndSec: z.number().int().min(0).max(3600).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      /** Attach a Spotify or YouTube link to a song that was typed in. */
      link: z.string().max(600).optional(),
      dismissDuplicate: z.boolean().optional(),
    }),
    await readJson(c.req.raw),
  );
  const { song: current } = await loadSong(c.get("team").id, c.req.param("id"));
  const { link, dismissDuplicate, ...rest } = input;
  const patch: Partial<typeof song.$inferInsert> = { ...rest };

  if (rest.title !== undefined || rest.artist !== undefined) {
    patch.normKey = normalizeTitle(rest.title ?? current.title, rest.artist ?? current.artist).slice(0, 300);
  }
  if (dismissDuplicate) patch.possibleDupOf = null;
  if (link) {
    try {
      const meta = await lookupSong(link);
      if (meta.platform === "spotify") patch.spotifyId = meta.id;
      else patch.youtubeId = meta.id;
      if (!current.thumbnailUrl && meta.thumbnailUrl) patch.thumbnailUrl = meta.thumbnailUrl;
      if (!current.artist && meta.artist && rest.artist === undefined) patch.artist = meta.artist;
      if (!current.durationSec && meta.durationSec) patch.durationSec = meta.durationSec;
    } catch (error) {
      throw badRequest(error instanceof MetaError ? error.message : "Couldn't read that link");
    }
  }

  try {
    if (Object.keys(patch).length) await db.update(song).set(patch).where(eq(song.id, current.id));
  } catch (error) {
    if (isDuplicateKey(error)) throw conflict("Another song on this list already has that link. Merge them instead.");
    throw error;
  }
  const [row] = await db.select().from(song).where(eq(song.id, current.id)).limit(1);
  return c.json({ song: row });
});

/** POST /api/songs/:id/merge — fold this song into another on the same list. */
songsRouter.post("/:id/merge", async (c) => {
  const { intoId } = parse(z.object({ intoId: z.string().max(36) }), await readJson(c.req.raw));
  const teamId = c.get("team").id;
  const { song: source } = await loadSong(teamId, c.req.param("id"));
  const { song: target } = await loadSong(teamId, intoId);
  if (source.id === target.id) throw badRequest("Pick a different song to merge into");
  if (source.listId !== target.listId) throw badRequest("Songs must be on the same list");

  await db.transaction(async (tx) => {
    await tx.update(songSubmission).set({ songId: target.id }).where(eq(songSubmission.songId, source.id));
    await tx.update(song).set({ possibleDupOf: null }).where(and(eq(song.listId, source.listId), eq(song.possibleDupOf, source.id)));
    await tx.delete(song).where(eq(song.id, source.id));
    // The source is gone, so its links can move without tripping the unique indexes.
    await tx
      .update(song)
      .set({
        spotifyId: target.spotifyId ?? source.spotifyId,
        youtubeId: target.youtubeId ?? source.youtubeId,
        artist: target.artist ?? source.artist,
        thumbnailUrl: target.thumbnailUrl ?? source.thumbnailUrl,
        durationSec: target.durationSec ?? source.durationSec,
        possibleDupOf: target.possibleDupOf === source.id ? null : target.possibleDupOf,
      })
      .where(eq(song.id, target.id));
  });
  return c.json({ ok: true });
});

songsRouter.delete("/:id", async (c) => {
  const { song: current } = await loadSong(c.get("team").id, c.req.param("id"));
  const result = await db.delete(song).where(eq(song.id, current.id));
  if (affectedRows(result) === 0) throw notFound("Song not found");
  await db.update(song).set({ possibleDupOf: null }).where(eq(song.possibleDupOf, current.id));
  return c.body(null, 204);
});

/** Song counts per list, for the dashboard. */
export async function songCounts(teamId: string) {
  return db
    .select({ id: songList.id, title: songList.title, kind: songList.kind, count: count(song.id) })
    .from(songList)
    .leftJoin(song, and(eq(song.listId, songList.id), eq(song.hidden, false)))
    .where(eq(songList.organizationId, teamId))
    .groupBy(songList.id, songList.title, songList.kind)
    .orderBy(desc(sql`count(${song.id})`));
}
