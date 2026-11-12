/**
 * End-to-end check against a running app and its real database. It drives
 * the API the way a browser and the cron pinger would:
 * accounts and joining, the song collector's duplicate rules, reminders
 * through the tick endpoint, vendor payments, the chandla register's
 * visibility, and the public run-sheet.
 *
 *   pnpm dev            (in another terminal)
 *   pnpm smoke          (reads CRON_SECRET from .env.local)
 *
 * SMOKE_BASE_URL points it at a deployed copy instead.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3200";
const ORIGIN = new URL(BASE).origin;
const CRON_SECRET =
  process.env.CRON_SECRET ??
  (() => {
    try {
      return readFileSync(".env.local", "utf8").match(/^CRON_SECRET=(.+)$/m)?.[1]?.trim();
    } catch {
      return undefined;
    }
  })();
const stamp = Date.now().toString(36);

let failures = 0;
function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail && !ok ? ` -> ${detail}` : ""}`);
}
const note = (label) => console.log(`SKIP  ${label}`);

function makeActor(name) {
  return {
    name,
    cookies: new Map(),
    header() {
      return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        this.cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
      }
    },
  };
}

async function call(actor, path, { method = "GET", body, teamId, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(teamId ? { "x-team-id": teamId } : {}),
      ...(actor?.cookies.size ? { cookie: actor.header() } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  actor?.absorb(res);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}
const post = (actor, path, body = {}, teamId) => call(actor, path, { method: "POST", body, teamId });
const patch = (actor, path, body = {}, teamId) => call(actor, path, { method: "PATCH", body, teamId });
const guest = { cookies: new Map(), header: () => "", absorb() {} };

/* ---------------------------------------------------------- accounts & joining */

const keval = makeActor("keval");
const riya = makeActor("riya");

const kSign = await post(keval, "/api/auth/sign-up/passcode", { name: "Keval Test", username: `keval_${stamp}`, passcode: "482913" });
check("owner signs up with a passcode", kSign.status === 200, JSON.stringify(kSign.body));
const rSign = await post(riya, "/api/auth/sign-up/passcode", { name: "Riya Test", username: `riya_${stamp}`, passcode: "915273" });
const riyaId = rSign.body?.user?.id;
check("helper signs up", rSign.status === 200 && riyaId, JSON.stringify(rSign.body));

const org = await post(keval, "/api/auth/organization/create", { name: `Smoke Wedding ${stamp}`, slug: `smoke-${stamp}` });
const T = org.body?.id;
check("owner creates the wedding", org.status === 200 && T, JSON.stringify(org.body));

const code = (await call(keval, "/api/teams/code", { teamId: T })).body?.code;
const join = await post(riya, "/api/teams/join", { code });
check("helper asks to join with the family code", join.status === 201, JSON.stringify(join.body));
const reqs = await call(keval, "/api/teams/requests", { teamId: T });
const accept = await post(keval, `/api/teams/requests/${reqs.body?.requests?.[0]?.id}/accept`, {}, T);
check("owner accepts the request", accept.status === 200, JSON.stringify(accept.body));
check("helper can now read the wedding", (await call(riya, "/api/tasks", { teamId: T })).status === 200);

const settings = await patch(keval, "/api/settings", { coupleNames: "Keval & Avani", weddingDate: "2026-12-04" }, T);
check("owner sets the couple and the date", settings.status === 200 && settings.body?.settings?.weddingDate === "2026-12-04", JSON.stringify(settings.body));
check("a helper can't change wedding settings", (await patch(riya, "/api/settings", { coupleNames: "x" }, T)).status === 403);

/* ------------------------------------------------------------- song collector */

const baraat = (await post(keval, "/api/song-lists", { kind: "baraat" }, T)).body?.list;
check("a baraat list gets guest and DJ links", baraat?.submitSlug && baraat?.djSlug);
const submit = (slug, body) => call(guest, `/api/public/lists/${slug}/submit`, { method: "POST", body, headers: { "x-real-ip": `10.0.${stamp.length}.7` } });

const typed1 = await submit(baraat.submitSlug, { name: "Friend One", entries: [{ title: "Kesariya", artist: "Arijit Singh" }] });
check("a guest adds a typed song without logging in", typed1.body?.results?.[0]?.status === "added", JSON.stringify(typed1.body));
const typed2 = await submit(baraat.submitSlug, { name: "Friend Two", entries: [{ title: 'Kesariya (From "Brahmastra")' }] });
check('"Kesariya (From Brahmastra)" folds into "Kesariya" as a vote', typed2.body?.results?.[0]?.status === "voted", JSON.stringify(typed2.body));
const remix = await submit(baraat.submitSlug, { name: "Friend Three", entries: [{ title: "Kala Chashma (Remix)" }, { title: "Kala Chashma" }] });
check(
  "a remix and its original stay two songs",
  remix.body?.results?.every((r) => r.status === "added"),
  JSON.stringify(remix.body),
);

const bot = await submit(baraat.submitSlug, { name: "Bot", website: "http://spam", entries: [{ title: "Spam song" }] });
const afterBot = await call(guest, `/api/public/lists/${baraat.submitSlug}`);
check("the honeypot swallows bot submissions", bot.status === 200 && !afterBot.body?.songs?.some((s) => s.title === "Spam song"));

// Real links: needs the internet. The same song from Spotify and YouTube must merge.
const SPOTIFY = "https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8?si=smoke";
const YOUTUBE = "https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share";
const preview = await call(guest, `/api/public/lists/${baraat.submitSlug}/preview?url=${encodeURIComponent(YOUTUBE)}`);
if (preview.body?.ok) {
  const a = await submit(baraat.submitSlug, { name: "Spotify Friend", entries: [{ link: SPOTIFY }] });
  const b = await submit(baraat.submitSlug, { name: "YouTube Friend", entries: [{ link: YOUTUBE }] });
  const c = await submit(baraat.submitSlug, { name: "Same Friend", entries: [{ link: YOUTUBE.replace("&feature=share", "") }] });
  check("a Spotify link is added", a.body?.results?.[0]?.status === "added", JSON.stringify(a.body));
  check("the same song as a YouTube Music link becomes a vote", b.body?.results?.[0]?.status === "voted", JSON.stringify(b.body));
  check("the same link again is a vote, not a new row", c.body?.results?.[0]?.status === "voted", JSON.stringify(c.body));
  const owner = await call(keval, `/api/song-lists/${baraat.id}/songs`, { teamId: T });
  const rick = owner.body?.songs?.find((s) => s.spotifyId === "4PTG3Z6ehGkBFwjybzWkR8");
  check("the merged song keeps both links and three votes", rick?.youtubeId === "dQw4w9WgXcQ" && rick?.votes === 3, JSON.stringify(rick));
} else {
  note(`real Spotify/YouTube links (no internet from the server?): ${JSON.stringify(preview.body)}`);
}
const bad = await submit(baraat.submitSlug, { name: "Oops", entries: [{ link: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" }] });
check("a playlist link is refused with a reason", bad.body?.results?.[0]?.status === "error", JSON.stringify(bad.body));

const songsNow = (await call(keval, `/api/song-lists/${baraat.id}/songs`, { teamId: T })).body?.songs ?? [];
const reversed = songsNow.map((s) => s.id).reverse();
await call(keval, `/api/song-lists/${baraat.id}/order`, { method: "PUT", body: { ids: reversed }, teamId: T });
const dj = await call(guest, `/api/public/dj/${baraat.djSlug}`);
check("the DJ link shows the songs in the owner's order", dj.status === 200 && dj.body?.songs?.[0]?.id === reversed[0], JSON.stringify(dj.body?.songs?.map((s) => s.title)));
check("the guest link can't open the DJ view", (await call(guest, `/api/public/dj/${baraat.submitSlug}`)).status === 404);

const sangeet = (await post(keval, "/api/song-lists", { kind: "sangeet" }, T)).body?.list;
const act1 = await submit(sangeet.submitSlug, {
  name: "Cousin",
  entries: [{ title: "Gallan Goodiyaan", performer: "Cousins group", cutStartSec: 45, cutEndSec: 150, notes: "Start on the dhol" }],
});
check("a sangeet act is added with performer and cut", act1.body?.results?.[0]?.status === "added", JSON.stringify(act1.body));
const act2 = await submit(sangeet.submitSlug, { name: "Friend", entries: [{ title: "Gallan Goodiyaan (Official Video)", performer: "College friends" }] });
check("the same song for another act is refused as taken", act2.body?.results?.[0]?.status === "taken" && /Cousins group/.test(act2.body?.results?.[0]?.message), JSON.stringify(act2.body));
const djSangeet = await call(guest, `/api/public/dj/${sangeet.djSlug}`);
const g = djSangeet.body?.songs?.[0];
check("the DJ sees performer, cut and notes", g?.performer === "Cousins group" && g?.cutStartSec === 45 && g?.cutEndSec === 150 && g?.notes, JSON.stringify(g));

await patch(keval, `/api/song-lists/${baraat.id}`, { isOpen: false }, T);
check("a closed list refuses new songs", (await submit(baraat.submitSlug, { name: "Late", entries: [{ title: "Late song" }] })).status === 410);

/* ------------------------------------------------------- tasks & reminders */

const soon = new Date(Date.now() + 1500).toISOString();
const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
const t1 = await post(keval, "/api/tasks", { title: "Collect dress from tailor", assigneeId: riyaId, dueAt: due, reminders: { presets: ["1h", "at"], custom: [soon] } }, T);
check("a task is created with an assignee, due time and reminders", t1.status === 201 && t1.body?.task?.reminders?.length === 3, JSON.stringify(t1.body));
check("cron tick refuses a request without the secret", (await call(guest, "/api/cron/tick")).status === 401);

if (CRON_SECRET) {
  await new Promise((r) => setTimeout(r, 2500));
  const tick = (headers) => call(guest, "/api/cron/tick", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const first = await tick();
  check("the first tick sends the due reminder", first.status === 200 && first.body?.sent >= 1, JSON.stringify(first.body));
  const second = await tick();
  check("a second tick doesn't send it again", second.status === 200 && second.body?.sent === 0, JSON.stringify(second.body));
  const after = await call(riya, `/api/tasks/${t1.body.task.id}`, { teamId: T });
  const sentOne = after.body?.task?.reminders?.filter((r) => r.sentAt);
  check("the reminder is marked sent; the others still wait", sentOne?.length === 1 && after.body.task.reminders.length === 3, JSON.stringify(after.body?.task?.reminders));
} else {
  note("tick tests (no CRON_SECRET)");
}

const moved = await patch(keval, `/api/tasks/${t1.body.task.id}`, { dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString() }, T);
const oneHour = moved.body?.task?.reminders?.find((r) => r.preset === "1h");
check(
  "moving the due time moves its preset reminders",
  oneHour && Math.abs(new Date(moved.body.task.dueAt) - new Date(oneHour.remindAt) - 3_600_000) < 1000,
  JSON.stringify(moved.body?.task),
);
const snooze = await post(riya, `/api/tasks/${t1.body.task.id}/snooze`, { minutes: 60 }, T);
check("the assignee can snooze", snooze.status === 200 && snooze.body?.task?.reminders?.some((r) => !r.preset && !r.sentAt));

/* ---------------------------------------------------------- vendors & money */

const v = (await post(keval, "/api/vendors", { name: "Shree Caterers", category: "caterer", phone: "98250 12345", totalAmount: 125000 }, T)).body?.vendor;
check("a vendor is added", v?.id);
await post(keval, `/api/vendors/${v.id}/payments`, { amount: 25000, paid: true, method: "upi" }, T);
const p2 = await post(keval, `/api/vendors/${v.id}/payments`, { amount: 50000, dueAt: due, assigneeId: riyaId }, T);
const vendors1 = await call(keval, "/api/vendors", { teamId: T });
const sv = vendors1.body?.vendors?.find((x) => x.id === v.id);
check("totals add up: paid 25k, balance 100k", sv?.totals?.paid === 25000 && sv?.totals?.balance === 100000, JSON.stringify(sv?.totals));
const payTaskId = sv?.payments?.find((p) => p.id === p2.body?.payment?.id)?.taskId;
check("a due payment creates a to-do for the person reminded", Boolean(payTaskId));
const payTask = await call(riya, `/api/tasks/${payTaskId}`, { teamId: T });
check("…titled with the amount, with reminders", /Pay ₹50,000 to Shree Caterers/.test(payTask.body?.task?.title) && payTask.body?.task?.reminders?.length >= 1, JSON.stringify(payTask.body?.task));
await post(riya, `/api/tasks/${payTaskId}/toggle`, {}, T);
const vendors2 = await call(keval, "/api/vendors", { teamId: T });
check("ticking the to-do marks the payment paid", vendors2.body?.vendors?.find((x) => x.id === v.id)?.totals?.paid === 75000);
await patch(keval, `/api/vendors/${v.id}/payments/${p2.body.payment.id}`, { paid: false }, T);
const reopened = await call(riya, `/api/tasks/${payTaskId}`, { teamId: T });
check("marking it unpaid reopens the to-do", reopened.body?.task?.status === "todo", JSON.stringify(reopened.body?.task?.status));
check("the payment's to-do can't be deleted on its own", (await call(keval, `/api/tasks/${payTaskId}`, { method: "DELETE", teamId: T })).status === 400);

/* --------------------------------------------------------------- functions */

const fn = (await post(keval, "/api/functions", { name: "Sangeet", date: "2026-12-02", startTime: "19:00", venue: "Party plot" }, T)).body?.function;
check("a function is added", fn?.id);
await post(riya, `/api/functions/${fn.id}/items`, { time: "19:30", title: "Couple entry", ownerName: "Mama" }, T);
const rs = (await call(keval, "/api/settings", { teamId: T })).body?.settings;
check("the run-sheet is private until shared", (await call(guest, `/api/public/runsheet/${rs.runSheetSlug}`)).status === 404);
await patch(keval, "/api/settings", { runSheetPublic: true }, T);
const shared = await call(guest, `/api/public/runsheet/${rs.runSheetSlug}`);
check("once shared, the family sees functions and timeline", shared.status === 200 && shared.body?.functions?.[0]?.items?.[0]?.owner === "Mama", JSON.stringify(shared.body));

/* ---------------------------------------------------------------- chandla */

const clientId = `smoke-${stamp}`;
const gift1 = await post(riya, "/api/gifts", { giverName: "Rameshbhai Patel", amount: 1100, kind: "cash", side: "groom", functionId: fn.id, clientId }, T);
const gift1again = await post(riya, "/api/gifts", { giverName: "Rameshbhai Patel", amount: 1100, kind: "cash", clientId }, T);
check("a helper writes a chandla entry", gift1.status === 201);
check("an offline retry with the same client id is stored once", gift1again.body?.duplicate === true, JSON.stringify(gift1again.body));
await post(keval, "/api/gifts", { giverName: "Sureshbhai Shah", amount: 2100, kind: "cash", side: "bride" }, T);
const riyaList = await call(riya, "/api/gifts", { teamId: T });
check("a helper sees only their own entries", riyaList.body?.gifts?.length === 1 && riyaList.body?.canSeeAll === false, JSON.stringify(riyaList.body));
check("a helper can't read the totals", (await call(riya, "/api/gifts/summary", { teamId: T })).status === 403);
const summary = await call(keval, "/api/gifts/summary", { teamId: T });
check("the owner sees the full total", summary.body?.total?.cash === 3200 && summary.body?.total?.entries === 2, JSON.stringify(summary.body?.total));
const csv = await fetch(`${BASE}/api/gifts/export.csv?teamId=${T}`, { headers: { cookie: keval.header() } });
const csvText = await csv.text();
check("the owner downloads the register as CSV", csv.status === 200 && csvText.includes("Rameshbhai Patel") && csvText.includes("2100"));

/* --------------------------------------------------------------- dashboard */

const dash = await call(riya, "/api/dashboard", { teamId: T });
check("the dashboard loads with the wedding date and song counts", dash.status === 200 && dash.body?.settings?.weddingDate === "2026-12-04" && dash.body?.songs?.length === 2, JSON.stringify(dash.body?.songs));

/* ------------------------------------------------------- machine endpoints */

check("the Telegram webhook refuses calls without its secret", (await call(guest, "/api/telegram/webhook", { method: "POST", body: {} })).status === 401);
const outsider = makeActor("outsider");
await post(outsider, "/api/auth/sign-up/passcode", { name: "Outsider", username: `out_${stamp}`, passcode: "274951" });
check("someone outside the wedding gets nothing", (await call(outsider, "/api/tasks", { teamId: T })).status === 403);

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
