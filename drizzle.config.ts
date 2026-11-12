import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit talks to the database directly, so it needs TLS for TiDB Cloud.
 * Reads DATABASE_URL from the environment (or .env.local via `--env-file`).
 */
const url = new URL(process.env.DATABASE_URL ?? "mysql://root@localhost:3306/wedora");
const tls = process.env.DATABASE_SSL ? process.env.DATABASE_SSL === "true" : /tidbcloud\.com/i.test(url.hostname);

export default defineConfig({
  dialect: "mysql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ...(tls ? { ssl: { rejectUnauthorized: true } } : {}),
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
