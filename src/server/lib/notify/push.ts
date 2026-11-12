import "server-only";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db } from "../../db";
import { pushSubscription } from "../../db/schema";
import { getEnv, pushConfigured } from "../../env";

export type PushPayload = {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string;
  taskId?: string;
};

let configured = false;
function setup(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    const env = getEnv();
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

/** Sends to every device the people have enabled. Returns how many deliveries the push services accepted. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!userIds.length || !setup()) return 0;
  const subs = await db.select().from(pushSubscription).where(inArray(pushSubscription.userId, userIds));

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        // Keep it for a day if the phone is off; urgent so Android wakes for it.
        { TTL: 24 * 60 * 60, urgency: "high" },
      ),
    ),
  );

  let delivered = 0;
  await Promise.all(
    results.map(async (r, i) => {
      if (r.status === "fulfilled") {
        delivered++;
        return;
      }
      const status = (r.reason as { statusCode?: number })?.statusCode;
      // The browser unsubscribed or the app was uninstalled: forget the device.
      if (status === 404 || status === 410) {
        await db.delete(pushSubscription).where(eq(pushSubscription.id, subs[i]!.id));
      } else {
        console.error("[push] delivery failed:", status, (r.reason as Error)?.message);
      }
    }),
  );
  return delivered;
}
