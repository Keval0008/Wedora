import "server-only";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { db } from "./db";
import { member, organization } from "./db/schema";
import { getAuth } from "./lib/auth";
import { badRequest, forbidden, unauthorized } from "./lib/http";

export type SessionUser = { id: string; name: string; email: string; image?: string | null };
export type TeamContext = { id: string; slug: string; name: string; role: string };

export type AppEnv = {
  Variables: {
    user: SessionUser;
    team: TeamContext;
  };
};

export const router = () => new Hono<AppEnv>();

/** Rejects the request unless a valid Better Auth session cookie is present. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) throw unauthorized();
  c.set("user", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  });
  await next();
});

/**
 * Resolves the wedding for this request from the `x-team-id` header and checks
 * the caller belongs to it. The API never trusts a team id sent in a body.
 */
export const requireTeam = createMiddleware<AppEnv>(async (c, next) => {
  const teamId = (c.req.header("x-team-id") ?? c.req.query("teamId") ?? "").trim();
  if (!teamId) throw badRequest("Missing wedding (send an x-team-id header)");

  const [row] = await db
    .select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.organizationId, teamId), eq(member.userId, c.get("user").id)))
    .limit(1);

  if (!row) throw forbidden("You are not part of this wedding");
  c.set("team", row);
  await next();
});

export const isTeamAdmin = (role: string) => role === "owner" || role === "admin";

/** Owners and admins only. */
export const requireTeamAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isTeamAdmin(c.get("team").role)) throw forbidden("Only the wedding's owners and admins can do this");
  await next();
});
