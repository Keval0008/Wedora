import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { affectedRows, db, isDuplicateKey } from "../db";
import { gift, giftKinds, giftSides, user, weddingFunction } from "../db/schema";
import { isTeamAdmin, requireAuth, requireTeam, requireTeamAdmin, router } from "../hono";
import { forbidden, notFound, parse, readJson } from "../lib/http";
import { newId } from "../lib/ids";
import { istDateKey } from "../lib/time";

/**
 * The chandla register. Anyone in the wedding can write entries at the desk;
 * only owners and admins see the whole list and the totals.
 */
export const giftsRouter = router();
giftsRouter.use(requireAuth, requireTeam);

const GiftInput = z.object({
  giverName: z.string().trim().min(1, "Who gave it?").max(150),
  relation: z.string().trim().max(80).nullable().optional(),
  side: z.enum(giftSides).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  // Not .default(): it would also apply to PATCH and reset the kind.
  kind: z.enum(giftKinds).optional(),
  amount: z.number().int().min(0).max(100_000_000).nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  functionId: z.string().max(36).nullable().optional(),
  /** From the offline outbox: the same entry sent twice is stored once. */
  clientId: z.string().max(40).optional(),
});

const columns = {
  id: gift.id,
  giverName: gift.giverName,
  relation: gift.relation,
  side: gift.side,
  city: gift.city,
  kind: gift.kind,
  amount: gift.amount,
  description: gift.description,
  functionId: gift.functionId,
  functionName: weddingFunction.name,
  recordedById: gift.recordedById,
  recordedByName: user.name,
  createdAt: gift.createdAt,
};

function scopeFor(teamId: string, userId: string, admin: boolean): SQL {
  return admin ? eq(gift.organizationId, teamId) : and(eq(gift.organizationId, teamId), eq(gift.recordedById, userId))!;
}

async function assertFunctionInTeam(teamId: string, functionId?: string | null) {
  if (!functionId) return;
  const [f] = await db
    .select({ id: weddingFunction.id })
    .from(weddingFunction)
    .where(and(eq(weddingFunction.id, functionId), eq(weddingFunction.organizationId, teamId)))
    .limit(1);
  if (!f) throw notFound("Function not found");
}

/** GET /api/gifts?q=&functionId=&side= */
giftsRouter.get("/", async (c) => {
  const team = c.get("team");
  const admin = isTeamAdmin(team.role);
  const where: SQL[] = [scopeFor(team.id, c.get("user").id, admin)];
  const q = c.req.query("q")?.trim();
  if (q) where.push(sql`(${gift.giverName} like ${`%${q}%`} or ${gift.city} like ${`%${q}%`} or ${gift.relation} like ${`%${q}%`})`);
  const functionId = c.req.query("functionId");
  if (functionId) where.push(functionId === "none" ? sql`${gift.functionId} is null` : eq(gift.functionId, functionId));
  const side = c.req.query("side");
  if (side === "groom" || side === "bride") where.push(eq(gift.side, side));

  const rows = await db
    .select(columns)
    .from(gift)
    .leftJoin(weddingFunction, eq(gift.functionId, weddingFunction.id))
    .leftJoin(user, eq(gift.recordedById, user.id))
    .where(and(...where))
    .orderBy(desc(gift.createdAt))
    .limit(2000);

  return c.json({ gifts: rows, canSeeAll: admin });
});

/** GET /api/gifts/summary — totals per function and side (owners and admins). */
giftsRouter.get("/summary", requireTeamAdmin, async (c) => {
  const teamId = c.get("team").id;
  const byFunction = await db
    .select({
      functionId: gift.functionId,
      functionName: weddingFunction.name,
      entries: sql<number>`count(*)`.mapWith(Number),
      cash: sql<number>`coalesce(sum(case when ${gift.kind} = 'cash' then ${gift.amount} else 0 end), 0)`.mapWith(Number),
      valued: sql<number>`coalesce(sum(${gift.amount}), 0)`.mapWith(Number),
    })
    .from(gift)
    .leftJoin(weddingFunction, eq(gift.functionId, weddingFunction.id))
    .where(eq(gift.organizationId, teamId))
    .groupBy(gift.functionId, weddingFunction.name);
  const bySide = await db
    .select({
      side: gift.side,
      entries: sql<number>`count(*)`.mapWith(Number),
      cash: sql<number>`coalesce(sum(case when ${gift.kind} = 'cash' then ${gift.amount} else 0 end), 0)`.mapWith(Number),
    })
    .from(gift)
    .where(eq(gift.organizationId, teamId))
    .groupBy(gift.side);
  const total = byFunction.reduce((a, r) => ({ entries: a.entries + r.entries, cash: a.cash + r.cash, valued: a.valued + r.valued }), { entries: 0, cash: 0, valued: 0 });
  return c.json({ total, byFunction, bySide });
});

/** GET /api/gifts/names?q= — giver names seen before, for the desk's autocomplete. */
giftsRouter.get("/names", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  if (q.length < 2) return c.json({ names: [] });
  const rows = await db
    .selectDistinct({ giverName: gift.giverName, city: gift.city, relation: gift.relation, side: gift.side })
    .from(gift)
    .where(and(eq(gift.organizationId, c.get("team").id), sql`${gift.giverName} like ${`${q}%`}`))
    .limit(8);
  return c.json({ names: rows });
});

/** GET /api/gifts/export.csv — the full register for the vyavhar notebook. */
giftsRouter.get("/export.csv", requireTeamAdmin, async (c) => {
  const rows = await db
    .select(columns)
    .from(gift)
    .leftJoin(weddingFunction, eq(gift.functionId, weddingFunction.id))
    .leftJoin(user, eq(gift.recordedById, user.id))
    .where(eq(gift.organizationId, c.get("team").id))
    .orderBy(gift.createdAt);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Date", "Name", "Relation", "Side", "City", "Function", "Kind", "Amount", "Description", "Recorded by"];
  const lines = rows.map((r) =>
    [istDateKey(r.createdAt), r.giverName, r.relation, r.side, r.city, r.functionName, r.kind, r.amount, r.description, r.recordedByName]
      .map(cell)
      .join(","),
  );
  // A BOM so Excel opens Gujarati and Hindi names correctly.
  return new Response(`﻿${[header.join(","), ...lines].join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="chandla-${istDateKey(new Date())}.csv"`,
    },
  });
});

giftsRouter.post("/", async (c) => {
  const input = parse(GiftInput, await readJson(c.req.raw));
  const teamId = c.get("team").id;
  await assertFunctionInTeam(teamId, input.functionId);
  const id = newId();
  try {
    await db.insert(gift).values({
      id,
      organizationId: teamId,
      giverName: input.giverName,
      relation: input.relation ?? null,
      side: input.side ?? null,
      city: input.city ?? null,
      kind: input.kind ?? "cash",
      amount: input.amount ?? null,
      description: input.description ?? null,
      functionId: input.functionId ?? null,
      recordedById: c.get("user").id,
      clientId: input.clientId ?? null,
    });
  } catch (error) {
    if (input.clientId && isDuplicateKey(error)) {
      const [existing] = await db.select({ id: gift.id }).from(gift).where(eq(gift.clientId, input.clientId)).limit(1);
      return c.json({ id: existing?.id ?? null, duplicate: true });
    }
    throw error;
  }
  return c.json({ id }, 201);
});

async function loadEditable(teamId: string, id: string, userId: string, admin: boolean) {
  const [row] = await db.select().from(gift).where(and(eq(gift.id, id), eq(gift.organizationId, teamId))).limit(1);
  if (!row) throw notFound("Entry not found");
  if (!admin && row.recordedById !== userId) throw forbidden("Only the person who wrote this entry (or an admin) can change it");
  return row;
}

giftsRouter.patch("/:id", async (c) => {
  const team = c.get("team");
  const input = parse(GiftInput.partial().omit({ clientId: true }), await readJson(c.req.raw));
  const row = await loadEditable(team.id, c.req.param("id"), c.get("user").id, isTeamAdmin(team.role));
  await assertFunctionInTeam(team.id, input.functionId);
  if (Object.keys(input).length) await db.update(gift).set(input).where(eq(gift.id, row.id));
  return c.json({ ok: true });
});

giftsRouter.delete("/:id", async (c) => {
  const team = c.get("team");
  const row = await loadEditable(team.id, c.req.param("id"), c.get("user").id, isTeamAdmin(team.role));
  const result = await db.delete(gift).where(eq(gift.id, row.id));
  if (affectedRows(result) === 0) throw notFound("Entry not found");
  return c.body(null, 204);
});
