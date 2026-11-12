import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDuplicateKey } from "../db";
import { pushSubscription, telegramLink } from "../db/schema";
import { env, pushConfigured, telegramConfigured } from "../env";
import { requireAuth, router } from "../hono";
import { badRequest, parse, readJson } from "../lib/http";
import { newId, newLinkCode } from "../lib/ids";
import { notifyUsers } from "../lib/notify";

export const notifyRouter = router();
notifyRouter.use(requireAuth);

/** GET /api/notify/status — what is set up for me, and what the server supports. */
notifyRouter.get("/status", async (c) => {
  const me = c.get("user");
  const [devices] = await db.select({ n: count() }).from(pushSubscription).where(eq(pushSubscription.userId, me.id));
  const [tg] = await db.select().from(telegramLink).where(eq(telegramLink.userId, me.id)).limit(1);
  return c.json({
    push: { configured: pushConfigured(), publicKey: env.VAPID_PUBLIC_KEY ?? null, devices: Number(devices?.n ?? 0) },
    telegram: { configured: telegramConfigured(), linked: Boolean(tg?.chatId), botUsername: env.TELEGRAM_BOT_USERNAME ?? null },
  });
});

const Subscription = z.object({
  endpoint: z.url().max(700),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

notifyRouter.post("/push/subscribe", async (c) => {
  const sub = parse(Subscription, await readJson(c.req.raw));
  const me = c.get("user");
  const userAgent = c.req.header("user-agent")?.slice(0, 300) ?? null;
  try {
    await db.insert(pushSubscription).values({
      id: newId(),
      userId: me.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent,
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    // The same device subscribing again (or after someone else signed in on it).
    await db
      .update(pushSubscription)
      .set({ userId: me.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent })
      .where(eq(pushSubscription.endpoint, sub.endpoint));
  }
  return c.json({ ok: true });
});

notifyRouter.post("/push/unsubscribe", async (c) => {
  const { endpoint } = parse(z.object({ endpoint: z.string().max(700) }), await readJson(c.req.raw));
  await db.delete(pushSubscription).where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, c.get("user").id)));
  return c.json({ ok: true });
});

/** POST /api/notify/telegram/link — a one-time t.me deep link that connects this account. */
notifyRouter.post("/telegram/link", async (c) => {
  if (!telegramConfigured()) throw badRequest("Telegram isn't set up on this server yet");
  const me = c.get("user");
  const code = newLinkCode();
  const expires = new Date(Date.now() + 15 * 60_000);
  const [existing] = await db.select().from(telegramLink).where(eq(telegramLink.userId, me.id)).limit(1);
  if (existing) {
    await db.update(telegramLink).set({ linkCode: code, linkExpiresAt: expires }).where(eq(telegramLink.userId, me.id));
  } else {
    await db.insert(telegramLink).values({ userId: me.id, linkCode: code, linkExpiresAt: expires });
  }
  return c.json({ url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${code}`, expiresAt: expires });
});

notifyRouter.post("/telegram/unlink", async (c) => {
  await db.delete(telegramLink).where(eq(telegramLink.userId, c.get("user").id));
  return c.json({ ok: true });
});

/** POST /api/notify/test — a test notification to all my devices and Telegram. */
notifyRouter.post("/test", async (c) => {
  const me = c.get("user");
  const result = await notifyUsers([me.id], {
    title: "🔔 Wedora test",
    body: "If you can read this, reminders will reach you here.",
    path: "/account",
    tag: "test",
  });
  return c.json(result);
});
