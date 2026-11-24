/**
 * Cloudflare's build command (Workers Builds, or `pnpm run deploy` locally).
 *
 * Like scripts/vercel-build.mjs, builds of the production branch apply pending
 * database migrations first, so the code and the tables always match. That only
 * happens when DATABASE_URL is also set under Settings → Build → Variables and
 * secrets; without it the build skips migrations and you run `pnpm db:migrate`
 * yourself. Builds of other branches never touch the database.
 */
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

const branch = process.env.WORKERS_CI_BRANCH;
const productionBranch = process.env.PRODUCTION_BRANCH ?? "main";

if (branch === productionBranch && process.env.DATABASE_URL) {
  console.log("→ Applying database migrations");
  run("pnpm exec drizzle-kit migrate");
} else if (branch === productionBranch) {
  console.log("→ Skipping migrations: DATABASE_URL is not a build variable. Run `pnpm db:migrate` after schema changes.");
} else {
  console.log(`→ Skipping migrations (branch: ${branch ?? "local build"})`);
}

// Runs `pnpm run build` (next build), then bundles the result into .open-next/ for Workers.
run("pnpm exec opennextjs-cloudflare build");
