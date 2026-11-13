import "server-only";
import { z } from "zod";

/**
 * Server configuration. It is validated on first use rather than at import:
 * `next build` imports route modules to read their config, and a missing
 * variable must not fail a build that never touches the database.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see .env.example)"),
  /** "true" forces TLS, "false" turns it off. Default: on for TiDB Cloud hosts. */
  DATABASE_SSL: z.enum(["true", "false"]).optional(),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 chars"),
  /** Public URL of the app. On Vercel it falls back to the production domain. */
  BETTER_AUTH_URL: z.url().optional(),

  /** Bearer token that cron-job.org and Vercel Cron send to /api/cron/tick. */
  CRON_SECRET: z.string().min(16).optional(),
  /** Salt for hashing guest IP addresses on the public song form. */
  IP_HASH_SALT: z.string().min(8).default("wedora-dev-salt"),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:wedora@example.invalid"),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  /** YouTube Data API key: finds a YouTube link for songs added without one. */
  YOUTUBE_API_KEY: z.string().optional(),

  // Set by Vercel itself.
  VERCEL_ENV: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  // Empty strings from a half-filled .env mean "not set".
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** `env.X` reads validate everything on first access. */
export const env: Env = new Proxy({} as Env, {
  get: (_target, key) => getEnv()[key as keyof Env],
});

export const isProd = () => getEnv().NODE_ENV === "production";

/** The app's public origin, e.g. https://wedora.vercel.app */
export function appUrl(): string {
  const e = getEnv();
  if (e.BETTER_AUTH_URL) return e.BETTER_AUTH_URL.replace(/\/+$/, "");
  if (e.VERCEL_PROJECT_PRODUCTION_URL) return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (e.VERCEL_URL) return `https://${e.VERCEL_URL}`;
  return "http://localhost:3200";
}

export const pushConfigured = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
export const telegramConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
