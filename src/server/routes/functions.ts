import { and, asc, count, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { affectedRows, db, isDuplicateKey } from "../db";
import { member, runItem, task, user, weddingFunction, weddingSettings } from "../db/schema";
import { requireAuth, requireTeam, requireTeamAdmin, router } from "../hono";
import { badRequest, notFound, parse, readJson } from "../lib/http";
import { newId, newSlug } from "../lib/ids";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-04");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 18:30");

/* ================================================================ settings */

export const settingsRouter = router();
settingsRouter.use(requireAuth, requireTeam);

/** The wedding's settings row, created on first read. */
export async function getOrCreateSettings(teamId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await db.select().from(weddingSettings).where(eq(weddingSettings.organizationId, teamId)).limit(1);
    if (row) return row;
    try {
      await db.insert(weddingSettings).values({ organizationId: teamId, runSheetSlug: newSlug() });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  throw new Error("Could not create wedding settings");
}

settingsRouter.get("/", async (c) => {
  return c.json({ settings: await getOrCreateSettings(c.get("team").id) });
});

settingsRouter.patch("/", requireTeamAdmin, async (c) => {
  const input = parse(
    z.object({
      coupleNames: z.string().trim().max(200).nullable().optional(),
      weddingDate: dateKey.nullable().optional(),
      runSheetPublic: z.boolean().optional(),
      rotateRunSheetLink: z.boolean().optional(),
    }),
    await readJson(c.req.raw),
  );
  const teamId = c.get("team").id;
  await getOrCreateSettings(teamId);
  const { rotateRunSheetLink, ...rest } = input;
  await db
    .update(weddingSettings)
    .set({ ...rest, ...(rotateRunSheetLink ? { runSheetSlug: newSlug() } : {}) })
    .where(eq(weddingSettings.organizationId, teamId));
  return c.json({ settings: await getOrCreateSettings(teamId) });
});

/* =============================================================== functions */

export const functionsRouter = router();
functionsRouter.use(requireAuth, requireTeam);

const FunctionInput = z.object({
  name: z.string().trim().min(1, "Name the function").max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #b4232c").optional(),
  date: dateKey.nullable().optional(),
  startTime: clock.nullable().optional(),
  venue: z.string().trim().max(200).nullable().optional(),
  mapUrl: z.url().max(600).nullable().optional().or(z.literal("").transform(() => null)),
  dressCode: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  archived: z.boolean().optional(),
});

/**
 * GET /api/functions — in date order, each with its open task count. The
 * counts are a separate grouped query (see the note on GET /api/song-lists).
 */
functionsRouter.get("/", async (c) => {
  const includeArchived = c.req.query("includeArchived") === "true";
  const teamId = c.get("team").id;
  const rows = await db
    .select({
      id: weddingFunction.id,
      name: weddingFunction.name,
      color: weddingFunction.color,
      date: weddingFunction.date,
      startTime: weddingFunction.startTime,
      venue: weddingFunction.venue,
      mapUrl: weddingFunction.mapUrl,
      dressCode: weddingFunction.dressCode,
      notes: weddingFunction.notes,
      archived: weddingFunction.archived,
      sortOrder: weddingFunction.sortOrder,
    })
    .from(weddingFunction)
    .where(
      includeArchived
        ? eq(weddingFunction.organizationId, teamId)
        : and(eq(weddingFunction.organizationId, teamId), eq(weddingFunction.archived, false)),
    )
    .orderBy(sql`${weddingFunction.date} is null`, asc(weddingFunction.date), asc(weddingFunction.startTime), asc(weddingFunction.name));

  const counts = await db
    .select({ functionId: task.functionId, n: count() })
    .from(task)
    .where(and(eq(task.organizationId, teamId), ne(task.status, "done"), eq(task.isPersonal, false), isNotNull(task.functionId)))
    .groupBy(task.functionId);
  const open = new Map(counts.map((r) => [r.functionId, Number(r.n)]));

  return c.json({ functions: rows.map((f) => ({ ...f, openCount: open.get(f.id) ?? 0 })) });
});

functionsRouter.post("/", async (c) => {
  const input = parse(FunctionInput, await readJson(c.req.raw));
  const row = {
    id: newId(),
    organizationId: c.get("team").id,
    name: input.name,
    color: input.color ?? "#b4232c",
    date: input.date ?? null,
    startTime: input.startTime ?? null,
    venue: input.venue ?? null,
    mapUrl: input.mapUrl ?? null,
    dressCode: input.dressCode ?? null,
    notes: input.notes ?? null,
    createdById: c.get("user").id,
  };
  await db.insert(weddingFunction).values(row);
  return c.json({ function: { ...row, archived: false, openCount: 0 } }, 201);
});

functionsRouter.patch("/:id", async (c) => {
  const input = parse(FunctionInput.partial(), await readJson(c.req.raw));
  const teamId = c.get("team").id;
  const id = c.req.param("id");
  if (Object.keys(input).length) {
    const result = await db
      .update(weddingFunction)
      .set(input)
      .where(and(eq(weddingFunction.id, id), eq(weddingFunction.organizationId, teamId)));
    if (affectedRows(result) === 0) {
      const [exists] = await db.select({ id: weddingFunction.id }).from(weddingFunction).where(and(eq(weddingFunction.id, id), eq(weddingFunction.organizationId, teamId))).limit(1);
      if (!exists) throw notFound("Function not found");
    }
  }
  const [row] = await db.select().from(weddingFunction).where(eq(weddingFunction.id, id)).limit(1);
  return c.json({ function: row });
});

/** DELETE /api/functions/:id — owners/admins only. Its tasks survive, unlinked. */
functionsRouter.delete("/:id", requireTeamAdmin, async (c) => {
  const result = await db
    .delete(weddingFunction)
    .where(and(eq(weddingFunction.id, c.req.param("id")), eq(weddingFunction.organizationId, c.get("team").id)));
  if (affectedRows(result) === 0) throw notFound("Function not found");
  return c.body(null, 204);
});

/* ============================================================== run items */

async function loadFunction(teamId: string, id: string) {
  const [row] = await db
    .select()
    .from(weddingFunction)
    .where(and(eq(weddingFunction.id, id), eq(weddingFunction.organizationId, teamId)))
    .limit(1);
  if (!row) throw notFound("Function not found");
  return row;
}

export const runItemColumns = {
  id: runItem.id,
  functionId: runItem.functionId,
  time: runItem.time,
  title: runItem.title,
  ownerUserId: runItem.ownerUserId,
  ownerName: runItem.ownerName,
  ownerUserName: user.name,
  notes: runItem.notes,
  sortOrder: runItem.sortOrder,
  done: runItem.done,
};

/** Timeline order: by time when set, otherwise by manual order. */
export const runItemOrder = [sql`${runItem.time} is null`, asc(runItem.time), asc(runItem.sortOrder), asc(runItem.createdAt)];

functionsRouter.get("/:id/items", async (c) => {
  const fn = await loadFunction(c.get("team").id, c.req.param("id"));
  const items = await db
    .select(runItemColumns)
    .from(runItem)
    .leftJoin(user, eq(runItem.ownerUserId, user.id))
    .where(eq(runItem.functionId, fn.id))
    .orderBy(...runItemOrder);
  return c.json({ items });
});

const RunItemInput = z.object({
  time: clock.nullable().optional(),
  title: z.string().trim().min(1, "What happens?").max(200),
  ownerUserId: z.string().max(36).nullable().optional(),
  ownerName: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  done: z.boolean().optional(),
});

async function assertOwnerInTeam(teamId: string, userId?: string | null) {
  if (!userId) return;
  const [m] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, teamId), eq(member.userId, userId)))
    .limit(1);
  if (!m) throw badRequest("That person is not part of this wedding");
}

functionsRouter.post("/:id/items", async (c) => {
  const teamId = c.get("team").id;
  const fn = await loadFunction(teamId, c.req.param("id"));
  const input = parse(RunItemInput, await readJson(c.req.raw));
  await assertOwnerInTeam(teamId, input.ownerUserId);
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${runItem.sortOrder}), -1) + 1`.mapWith(Number) })
    .from(runItem)
    .where(eq(runItem.functionId, fn.id));
  const id = newId();
  await db.insert(runItem).values({
    id,
    organizationId: teamId,
    functionId: fn.id,
    time: input.time ?? null,
    title: input.title,
    ownerUserId: input.ownerUserId ?? null,
    ownerName: input.ownerName ?? null,
    notes: input.notes ?? null,
    sortOrder: next,
    done: input.done ?? false,
  });
  return c.json({ ok: true, id }, 201);
});

functionsRouter.patch("/:id/items/:itemId", async (c) => {
  const teamId = c.get("team").id;
  const fn = await loadFunction(teamId, c.req.param("id"));
  const input = parse(RunItemInput.partial(), await readJson(c.req.raw));
  await assertOwnerInTeam(teamId, input.ownerUserId);
  const result = await db
    .update(runItem)
    .set(input)
    .where(and(eq(runItem.id, c.req.param("itemId")), eq(runItem.functionId, fn.id)));
  if (affectedRows(result) === 0 && Object.keys(input).length) {
    const [exists] = await db.select({ id: runItem.id }).from(runItem).where(and(eq(runItem.id, c.req.param("itemId")), eq(runItem.functionId, fn.id))).limit(1);
    if (!exists) throw notFound("Item not found");
  }
  return c.json({ ok: true });
});

functionsRouter.delete("/:id/items/:itemId", async (c) => {
  const fn = await loadFunction(c.get("team").id, c.req.param("id"));
  const result = await db.delete(runItem).where(and(eq(runItem.id, c.req.param("itemId")), eq(runItem.functionId, fn.id)));
  if (affectedRows(result) === 0) throw notFound("Item not found");
  return c.body(null, 204);
});
