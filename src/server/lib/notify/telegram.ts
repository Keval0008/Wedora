import "server-only";
import { and, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { telegramLink } from "../../db/schema";
import { getEnv, telegramConfigured } from "../../env";

export type InlineButton = { text: string; callback_data?: string; url?: string };

/** Telegram's HTML parse mode needs these three escaped. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!data?.ok) {
    console.error(`[telegram] ${method} failed:`, data?.description ?? res.status);
    return null;
  }
  return data.result ?? null;
}

export async function sendTelegramMessage(chatId: string, html: string, buttons?: InlineButton[][]) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

/** Sends to each person who linked Telegram. Returns how many messages went out. */
export async function sendTelegram(userIds: string[], html: string, buttons?: InlineButton[][]): Promise<number> {
  if (!userIds.length || !telegramConfigured()) return 0;
  const links = await db
    .select({ chatId: telegramLink.chatId })
    .from(telegramLink)
    .where(and(inArray(telegramLink.userId, userIds), isNotNull(telegramLink.chatId)));
  const results = await Promise.allSettled(links.map((l) => sendTelegramMessage(l.chatId!, html, buttons)));
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}
