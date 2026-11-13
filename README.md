# Wedora

A small wedding planner for the family. It runs on free hosting: **Vercel Hobby** for the app and **TiDB Cloud Starter** for the MySQL-compatible database.

- **To-dos with assignees.** Each family member signs in with a username and a 6-digit passcode.
- **Reminders** at the exact time, for example "collect dress from XYZ, 15 Nov 5 PM":
  - push on the phone;
  - a **Telegram** message with ✅ Done / ⏰ +1 h buttons;
  - an 8 AM daily digest.
- **Baraat song collector.**
  - A public link you share on WhatsApp.
  - Friends paste Spotify or YouTube Music links, or type a name.
  - The same song from either app is merged into one entry with a vote count.
  - Near duplicates are flagged for you to merge.
- **Sangeet performances.**
  - The same collection method, plus performer, cut (m:ss → m:ss) and notes.
  - No two acts can take the same song.
  - You drag them into running order.
  - The **DJ link** is a read-only list with copy-as-text, CSV, print and play-all.
- **Vendors and payments.**
  - Agreed total, paid and balance, with call and WhatsApp buttons.
  - A due payment becomes a to-do with reminders. Ticking it marks the payment paid.
- **Functions and run-sheet.**
  - Date, venue, map link and dress code for each function, plus a who-does-what timeline.
  - An optional read-only link for the family group.
- **Chandla register.**
  - Fast phone entry at the desk, with name autocomplete.
  - Works offline: entries upload when the signal is back.
  - Only owners and admins see totals and the CSV export.

```
src/app/            pages (App Router). Guest pages: /s/<slug> songs · /dj/<slug> DJ list · /r/<slug> run-sheet
src/app/api/[[...route]]/route.ts   the whole API: a Hono app (src/server/app.ts)
src/server/         db (Drizzle + mysql2), auth (Better Auth + passcode plugin), routes, services
drizzle/            SQL migrations
scripts/            smoke test, build, VAPID keys, Telegram webhook
```

## Run it locally

You need Node 24, pnpm, and a MySQL 8 server (or a TiDB database).

```bash
pnpm install
cp .env.example .env.local        # fill in DATABASE_URL, BETTER_AUTH_SECRET, CRON_SECRET
pnpm exec drizzle-kit migrate      # creates the tables (reads DATABASE_URL from the environment)
pnpm dev                           # http://localhost:3200
```

`drizzle-kit` does not read `.env.local` by itself. In Git Bash, load the file first: `set -a; . ./.env.local; set +a`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 3200 |
| `pnpm test` | Unit tests: link parsing, duplicate rules, reminders, IST time, money |
| `pnpm smoke` | End-to-end check against the running app and its database (about 50 checks) |
| `pnpm lint` | ESLint and the TypeScript check |
| `pnpm db:generate` | Writes a new migration after a schema change |
| `pnpm vapid` | Prints a VAPID key pair for push notifications |

## Deploy for free

### 1. Database: TiDB Cloud Starter
1. On tidbcloud.com, create a **Starter** cluster in **Singapore (ap-southeast-1)**, or Mumbai if it's offered.
2. Set the cluster's **spending limit to $0**. It then stays free, and is throttled instead of billed if you ever hit the limit.
3. Open the SQL editor and run:
   ```sql
   CREATE DATABASE wedora CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   ```
4. Go to **Connect** and copy the connection string, with the database set to `wedora`. TLS switches on automatically for `*.tidbcloud.com`.

### 2. Code: GitHub
This folder needs its own repository:
```bash
git init && git add -A && git commit -m "Wedora"
gh repo create wedora --private --source . --push
```

### 3. App: Vercel Hobby
1. **Add New → Project** and import the repo. The framework is detected as Next.js, and `vercel.json` sets the build command and the `sin1` region.
2. Under **Settings → Environment Variables** (Production), add the variables from `.env.example`:
   - `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET`, `IP_HASH_SALT`;
   - the three `VAPID_*` keys, from `pnpm vapid`;
   - the three `TELEGRAM_*` values;
   - optionally the `SPOTIFY_*` pair.
3. Deploy. Production builds run the migrations before `next build`, so the tables are created on the first deploy.
4. If you add a custom domain later, set `BETTER_AUTH_URL` to it.

### 4. Reminders every minute: cron-job.org
Vercel Hobby crons run only once a day. `vercel.json` keeps one at 08:00 IST as a backstop. The every-minute tick comes from cron-job.org, which is free:
1. Create a job for `https://<your-app>.vercel.app/api/cron/tick`, running **every 1 minute**.
2. Under Advanced, add the header `Authorization: Bearer <your CRON_SECRET>`.
3. Turn on failure notifications.

That comes to about 43,000 calls a month, each a single indexed query. This fits well inside the free tiers of both Vercel and TiDB.

### 5. Telegram bot
1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token and the bot username into Vercel (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`).
2. Pick any long random `TELEGRAM_WEBHOOK_SECRET`, then redeploy.
3. Run this once:
   ```bash
   TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… node scripts/telegram-set-webhook.mjs https://<your-app>.vercel.app
   ```
4. Each family member then opens **Account → Telegram → Connect** and taps START.

### 6. Optional: Spotify search, YouTube links, analytics
- **Spotify** (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`):
  1. Go to developer.spotify.com, open Dashboard and choose Create app.
  2. Tick **Web API** and save.
  3. Copy the Client ID and the Client secret from the app's Settings.

  The song form then searches Spotify instead of Apple Music, so every pick carries a Spotify link.
- **YouTube** (`YOUTUBE_API_KEY`):
  1. In console.cloud.google.com, create a project.
  2. Enable **YouTube Data API v3**.
  3. Under Credentials, create an **API key** and restrict it to that API.

  Each song added without a YouTube link gets one found automatically, about 100 songs a day on the free quota. The song list page also has **Find YouTube links** for older songs.
- **Analytics:** on Vercel, open Project → **Analytics** → Enable. The `<Analytics />` component is already in the layout.

Add the keys in Vercel → Settings → Environment Variables, then **Redeploy**. New variables only apply to new deployments.

### 7. Phone notifications
1. Each person opens **Account → Turn on**.
2. On an **iPhone**, first tap Share → **Add to Home Screen**, then open Wedora from the home screen. iOS only delivers push to installed apps.
3. Use **Send me a test alert** to check it works.

### 8. First use
1. Sign up and choose **Start a wedding**. This creates the baraat and sangeet lists.
2. Under **Family**, share the code on WhatsApp. Accept each person as they join, and make the people at the chandla desk **admins** only if they should see the totals.
3. Under **Songs**, use **Share on WhatsApp** to send each list.
4. Send the DJ link (**Copy DJ link**) to the DJ a few days before the sangeet.

## How it fits together
- **Times:** everything is stored in UTC. IST conversion is explicit in `src/server/lib/time.ts`, because Vercel doesn't allow `TZ`.
- **Reminders:** `GET /api/cron/tick` claims each due reminder with a conditional `UPDATE … WHERE sent_at IS NULL`.
  - That makes overlapping ticks safe, so the same reminder is never sent twice.
  - A reminder more than 12 hours late is skipped rather than sent.
  - The digest is claimed once per IST day through `job_state`.
- **Songs:** `src/server/lib/songs/` parses links, looks up details, and normalizes titles.
  - Details come from YouTube oEmbed (no key needed) and from the Spotify API, or Spotify oEmbed when no keys are set.
  - Normalization strips `(From "…")`, `| Film | Cast`, `Official Video` and so on, but keeps remix, unplugged and lofi.
- **Limits:** guests are limited to 20 songs per 10 minutes per hashed IP, and the form has a honeypot field. Sign-in attempts are rate-limited in the database.
