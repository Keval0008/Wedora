import { timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { member, task, telegramLink, user } from "../db/schema";
import { env } from "../env";
import { router } from "../hono";
import { HttpError, unauthorized } from "../lib/http";
import { escapeHtml, sendTelegramMessage, telegramApi } from "../lib/notify/telegram";
import { formatIst, istTomorrowAt } from "../lib/time";
import { addSnooze, setTaskDone } from "../services/tasks";
import { runTick } from "../services/tick";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ===================================================================== cron */

export const cronRouter = router();

/**
 * GET /api/cron/tick — sends due reminders and the morning digest.
 * cron-job.org calls it every minute; Vercel Cron calls it once a day as a backstop.
 * Both send `Authorization: Bearer <CRON_SECRET>`.
 */
cronRouter.get("/tick", async (c) => {
  const secret = env.CRON_SECRET;
  if (!secret) throw new HttpError(503, "CRON_SECRET is not set on the server");
  const header = c.req.header("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) throw unauthorized("Bad cron secret");
  return c.json(await runTick());
});

/* ================================================================= telegram */

export const telegramRouter = router();

type TgUpdate = {
  message?: { chat: { id: number }; text?: string; from?: { first_name?: string } };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number; text?: string };
  };
};

async function userForChat(chatId: string) {
  const [row] = await db
    .select({ userId: telegramLink.userId, name: user.name })
    .from(telegramLink)
    .innerJoin(user, eq(telegramLink.userId, user.id))
    .where(eq(telegramLink.chatId, chatId))
    .limit(1);
  return row ?? null;
}

/** The task, if this person may act on it (same wedding, and not someone else's personal task). */
async function taskForUser(taskId: string, userId: string) {
  const [row] = await db
    .select({ id: task.id, title: task.title, isPersonal: task.isPersonal, createdById: task.createdById })
    .from(task)
    .innerJoin(member, and(eq(member.organizationId, task.organizationId), eq(member.userId, userId)))
    .where(eq(task.id, taskId))
    .limit(1);
  if (!row || (row.isPersonal && row.createdById !== userId)) return null;
  return row;
}

/** POST /api/telegram/webhook — /start <code> links an account; buttons act on tasks. */
telegramRouter.post("/webhook", async (c) => {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !safeEqual(c.req.header("x-telegram-bot-api-secret-token") ?? "", secret)) {
    throw unauthorized("Bad webhook secret");
  }
  const update = (await c.req.json().catch(() => ({}))) as TgUpdate;

  try {
    if (update.message?.text) {
      const chatId = String(update.message.chat.id);
      const [command, code] = update.message.text.trim().split(/\s+/, 2);
      if (command === "/start" && code) {
        const [link] = await db
          .select({ userId: telegramLink.userId, name: user.name })
          .from(telegramLink)
          .innerJoin(user, eq(telegramLink.userId, user.id))
          .where(and(eq(telegramLink.linkCode, code), gt(telegramLink.linkExpiresAt, new Date())))
          .limit(1);
        if (!link) {
          await sendTelegramMessage(chatId, "That link has expired. Open Wedora → Account → Connect Telegram to get a fresh one.");
        } else {
          // A chat belongs to one account at a time.
          await db.update(telegramLink).set({ chatId: null }).where(eq(telegramLink.chatId, chatId));
          await db
            .update(telegramLink)
            .set({ chatId, linkCode: null, linkExpiresAt: null })
            .where(eq(telegramLink.userId, link.userId));
          await sendTelegramMessage(chatId, `Connected ✅ Hi ${escapeHtml(link.name)}! Your Wedora reminders will arrive here.`);
        }
      } else {
        const who = await userForChat(chatId);
        await sendTelegramMessage(
          chatId,
          who
            ? `You're connected as ${escapeHtml(who.name)}. Reminders arrive here automatically.`
            : "Hi! To get Wedora reminders here, open Wedora → Account → Connect Telegram.",
        );
      }
    }

    const cb = update.callback_query;
    if (cb?.data && cb.message) {
      const chatId = String(cb.message.chat.id);
      const who = await userForChat(chatId);
      const [action, taskId, minutes] = cb.data.split(":");
      const t = who && taskId ? await taskForUser(taskId, who.userId) : null;

      let reply = "Not allowed";
      if (t && who) {
        if (action === "done") {
          await setTaskDone(t.id, true);
          reply = "Marked done ✅";
        } else if (action === "snz") {
          const at = new Date(Date.now() + Number(minutes || 60) * 60_000);
          await addSnooze(t.id, at);
          reply = `I'll remind you at ${formatIst(at, false)}`;
        } else if (action === "tmr") {
          const at = istTomorrowAt(new Date(), "09:00");
          await addSnooze(t.id, at);
          reply = "I'll remind you tomorrow at 9 AM";
        }
        await telegramApi("editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: cb.message.message_id,
          reply_markup: { inline_keyboard: [] },
        });
        await sendTelegramMessage(chatId, `${escapeHtml(t.title)}: ${escapeHtml(reply)} (by ${escapeHtml(who.name)})`);
      }
      await telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: reply });
    }
  } catch (error) {
    // Always 200: Telegram retries failed webhooks, and a retry storm helps nobody.
    console.error("[telegram] webhook error:", error);
  }
  return c.json({ ok: true });
});
