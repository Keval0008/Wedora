/**
 * Vercel's build command. Production builds apply pending database migrations
 * first, so the code and the tables always match; preview builds never touch
 * the database.
 */
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set for Production. Add it in Vercel → Settings → Environment Variables.");
    process.exit(1);
  }
  console.log("→ Applying database migrations");
  run("pnpm exec drizzle-kit migrate");
} else {
  console.log(`→ Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "local"})`);
}

run("pnpm exec next build");
