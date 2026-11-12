import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, username } from "better-auth/plugins";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { appUrl, getEnv, isProd } from "../env";
import { passcode } from "./passcode-plugin";

function createAuth() {
  const env = getEnv();
  const base = appUrl();

  // Preview deployments get their own *.vercel.app address; let them sign in too.
  const trustedOrigins = [base];
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host) trustedOrigins.push(`https://${host}`);
  }

  return betterAuth({
    appName: "Wedora",
    baseURL: base,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "mysql", schema }),
    trustedOrigins,
    // No email and no passwords: people sign up and in with a username and passcode.
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 60, // 60 days: past the wedding without signing in again
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // Serverless instances don't share memory, so the counters live in the database.
    rateLimit: { enabled: true, storage: "database" },
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: isProd(),
        httpOnly: true,
      },
    },
    plugins: [
      // Supplies the unique `username` column. Its password sign-in goes unused.
      username({ minUsernameLength: 3, maxUsernameLength: 30 }),
      // Sign up and sign in with a name, a username and a 6-digit passcode.
      passcode(),
      // One organization is one wedding. People join through its code.
      organization({ allowUserToCreateOrganization: true, creatorRole: "owner" }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
