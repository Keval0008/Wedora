import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { affectedRows, db, isDuplicateKey } from "../db";
import { joinRequest, member, organization, teamCode, user } from "../db/schema";
import { requireAuth, requireTeam, requireTeamAdmin, router } from "../hono";
import { badRequest, conflict, forbidden, notFound, parse, readJson } from "../lib/http";
import { newId, newTeamCode, normalizeTeamCode } from "../lib/ids";

export const teamsRouter = router();

async function isMember(teamId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, teamId), eq(member.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** The wedding's join code, created the first time an owner or admin asks for it. */
async function getOrCreateCode(teamId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db
      .select({ code: teamCode.code })
      .from(teamCode)
      .where(eq(teamCode.organizationId, teamId))
      .limit(1);
    if (existing) return existing.code;

    try {
      const code = newTeamCode();
      await db.insert(teamCode).values({ organizationId: teamId, code });
      return code;
    } catch (error) {
      // The code collided, or a parallel request created the row first: look again.
      if (!isDuplicateKey(error)) throw error;
    }
  }
  throw new Error("Could not create a join code");
}

/* -------------------------------------------------- the person asking to join */

/** POST /api/teams/join — ask to join the wedding that owns this code. */
teamsRouter.post("/join", requireAuth, async (c) => {
  const body = parse(z.object({ code: z.string().min(1, "Enter a code").max(20) }), await readJson(c.req.raw));
  const me = c.get("user");

  const code = normalizeTeamCode(body.code);
  const [team] = await db
    .select({ id: organization.id, name: organization.name })
    .from(teamCode)
    .innerJoin(organization, eq(teamCode.organizationId, organization.id))
    .where(eq(teamCode.code, code))
    .limit(1);

  if (!team) throw notFound("No wedding uses that code. Check it with the person who shared it.");
  if (await isMember(team.id, me.id)) throw conflict(`You're already in ${team.name}`);

  const [pending] = await db
    .select({ id: joinRequest.id, createdAt: joinRequest.createdAt })
    .from(joinRequest)
    .where(
      and(
        eq(joinRequest.organizationId, team.id),
        eq(joinRequest.userId, me.id),
        eq(joinRequest.status, "pending"),
      ),
    )
    .limit(1);

  if (pending) {
    return c.json({
      request: { id: pending.id, teamId: team.id, teamName: team.name, status: "pending", createdAt: pending.createdAt },
    });
  }

  const id = newId();
  await db.insert(joinRequest).values({ id, organizationId: team.id, userId: me.id, status: "pending" });
  return c.json(
    { request: { id, teamId: team.id, teamName: team.name, status: "pending", createdAt: new Date() } },
    201,
  );
});

/** GET /api/teams/my-requests — your own requests, newest first. */
teamsRouter.get("/my-requests", requireAuth, async (c) => {
  const requests = await db
    .select({
      id: joinRequest.id,
      teamId: organization.id,
      teamName: organization.name,
      status: joinRequest.status,
      createdAt: joinRequest.createdAt,
    })
    .from(joinRequest)
    .innerJoin(organization, eq(joinRequest.organizationId, organization.id))
    .where(eq(joinRequest.userId, c.get("user").id))
    .orderBy(desc(joinRequest.createdAt))
    .limit(20);
  return c.json({ requests });
});

/** DELETE /api/teams/my-requests/:id — withdraw a request that is still pending. */
teamsRouter.delete("/my-requests/:id", requireAuth, async (c) => {
  const result = await db
    .delete(joinRequest)
    .where(
      and(
        eq(joinRequest.id, c.req.param("id")),
        eq(joinRequest.userId, c.get("user").id),
        eq(joinRequest.status, "pending"),
      ),
    );
  if (affectedRows(result) === 0) throw notFound("Request not found");
  return c.body(null, 204);
});

/* ------------------------------------------------------------ team members */

/** GET /api/teams/members */
teamsRouter.get("/members", requireAuth, requireTeam, async (c) => {
  const rows = await db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
      name: user.name,
      username: user.username,
      image: user.image,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, c.get("team").id))
    .orderBy(asc(member.createdAt));

  return c.json({
    members: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      role: r.role,
      user: { id: r.userId, name: r.name, username: r.username, image: r.image },
    })),
  });
});

/** DELETE /api/teams/members/:userId — owners remove anyone but owners; admins remove members. */
teamsRouter.delete("/members/:userId", requireAuth, requireTeam, requireTeamAdmin, async (c) => {
  const userId = c.req.param("userId");
  const me = c.get("user");
  const team = c.get("team");
  if (userId === me.id) throw badRequest("You can't remove yourself");

  const [target] = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, team.id), eq(member.userId, userId)))
    .limit(1);

  if (!target) throw notFound("Not part of this wedding");
  if (target.role === "owner") throw forbidden("An owner can't be removed");
  if (target.role === "admin" && team.role !== "owner") throw forbidden("Only an owner can remove an admin");

  await db.delete(member).where(eq(member.id, target.id));
  return c.body(null, 204);
});

/** PATCH /api/teams/members/:userId — owners make someone an admin or a member. */
teamsRouter.patch("/members/:userId", requireAuth, requireTeam, async (c) => {
  const team = c.get("team");
  if (team.role !== "owner") throw forbidden("Only an owner can change roles");
  const body = parse(z.object({ role: z.enum(["admin", "member"]) }), await readJson(c.req.raw));
  const userId = c.req.param("userId");

  const [target] = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, team.id), eq(member.userId, userId)))
    .limit(1);
  if (!target) throw notFound("Not part of this wedding");
  if (target.role === "owner") throw forbidden("An owner's role can't be changed");

  await db.update(member).set({ role: body.role }).where(eq(member.id, target.id));
  return c.json({ ok: true });
});

/* ------------------------------------------------------ owner & admin tools */

teamsRouter.get("/code", requireAuth, requireTeam, requireTeamAdmin, async (c) => {
  return c.json({ code: await getOrCreateCode(c.get("team").id) });
});

/** POST /api/teams/code/rotate — the old code stops working immediately. */
teamsRouter.post("/code/rotate", requireAuth, requireTeam, requireTeamAdmin, async (c) => {
  const teamId = c.get("team").id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newTeamCode();
    try {
      const result = await db.update(teamCode).set({ code }).where(eq(teamCode.organizationId, teamId));
      if (affectedRows(result) === 0) await db.insert(teamCode).values({ organizationId: teamId, code });
      return c.json({ code });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  throw new Error("Could not issue a new code");
});

/** GET /api/teams/requests — people waiting to be let in. */
teamsRouter.get("/requests", requireAuth, requireTeam, requireTeamAdmin, async (c) => {
  const rows = await db
    .select({
      id: joinRequest.id,
      createdAt: joinRequest.createdAt,
      userId: user.id,
      name: user.name,
      username: user.username,
    })
    .from(joinRequest)
    .innerJoin(user, eq(joinRequest.userId, user.id))
    .where(and(eq(joinRequest.organizationId, c.get("team").id), eq(joinRequest.status, "pending")))
    .orderBy(asc(joinRequest.createdAt));

  return c.json({
    requests: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      user: { id: r.userId, name: r.name, username: r.username },
    })),
  });
});

/**
 * Accept or reject in one transaction. The status update only matches a
 * pending row, so two owners clicking at once cannot both decide it.
 */
async function decide(teamId: string, requestId: string, deciderId: string, decision: "accepted" | "rejected") {
  const [request] = await db
    .select()
    .from(joinRequest)
    .where(and(eq(joinRequest.id, requestId), eq(joinRequest.organizationId, teamId)))
    .limit(1);

  if (!request) throw notFound("Request not found");
  if (request.status !== "pending") throw conflict(`This request was already ${request.status}`);

  await db.transaction(async (tx) => {
    const result = await tx
      .update(joinRequest)
      .set({ status: decision, decidedById: deciderId, decidedAt: new Date() })
      .where(and(eq(joinRequest.id, request.id), eq(joinRequest.status, "pending")));
    if (affectedRows(result) === 0) throw conflict("This request was already decided");

    if (decision === "accepted") {
      const [already] = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.organizationId, teamId), eq(member.userId, request.userId)))
        .limit(1);
      if (!already) {
        await tx.insert(member).values({
          id: newId(),
          organizationId: teamId,
          userId: request.userId,
          role: "member",
          createdAt: new Date(),
        });
      }
    }
  });
}

teamsRouter.post("/requests/:id/accept", requireAuth, requireTeam, requireTeamAdmin, async (c) => {
  await decide(c.get("team").id, c.req.param("id"), c.get("user").id, "accepted");
  return c.json({ ok: true });
});

teamsRouter.post("/requests/:id/reject", requireAuth, requireTeam, requireTeamAdmin, async (c) => {
  await decide(c.get("team").id, c.req.param("id"), c.get("user").id, "rejected");
  return c.json({ ok: true });
});
