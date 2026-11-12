import "server-only";
import { appUrl } from "../../env";
import { sendPush } from "./push";
import { escapeHtml, sendTelegram, type InlineButton } from "./telegram";

export type Notice = {
  title: string;
  body: string;
  /** Path inside the app, e.g. /tasks?open=abc */
  path: string;
  tag?: string;
  /** Adds Done / Snooze buttons to the Telegram message. */
  taskId?: string;
};

/**
 * Sends a notice on every channel the people have set up. One channel failing
 * never stops the other.
 */
export async function notifyUsers(userIds: string[], notice: Notice) {
  const url = `${appUrl()}${notice.path}`;
  const buttons: InlineButton[][] = notice.taskId
    ? [
        [
          { text: "✅ Done", callback_data: `done:${notice.taskId}` },
          { text: "⏰ +1 h", callback_data: `snz:${notice.taskId}:60` },
          { text: "🌅 Tomorrow 9 AM", callback_data: `tmr:${notice.taskId}` },
        ],
        [{ text: "Open in Wedora", url }],
      ]
    : [[{ text: "Open in Wedora", url }]];

  const [push, telegram] = await Promise.allSettled([
    sendPush(userIds, { title: notice.title, body: notice.body, url, tag: notice.tag, taskId: notice.taskId }),
    sendTelegram(userIds, `<b>${escapeHtml(notice.title)}</b>\n${escapeHtml(notice.body)}`, buttons),
  ]);

  if (push.status === "rejected") console.error("[notify] push failed:", push.reason);
  if (telegram.status === "rejected") console.error("[notify] telegram failed:", telegram.reason);
  return {
    push: push.status === "fulfilled" ? push.value : 0,
    telegram: telegram.status === "fulfilled" ? telegram.value : 0,
  };
}
