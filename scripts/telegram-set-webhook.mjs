/**
 * Points your Telegram bot at the deployed app. Run once after the first deploy:
 *
 *   node scripts/telegram-set-webhook.mjs https://your-app.vercel.app
 *
 * Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the environment
 * (or in .env.local).
 */
import { readFileSync } from "node:fs";

function fromEnvFile(name) {
  try {
    return readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN ?? fromEnvFile("TELEGRAM_BOT_TOKEN");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? fromEnvFile("TELEGRAM_WEBHOOK_SECRET");
const base = (process.argv[2] ?? process.env.APP_URL ?? "").replace(/\/+$/, "");

if (!token || !secret || !/^https:\/\//.test(base)) {
  console.error("Usage: node scripts/telegram-set-webhook.mjs https://your-app.vercel.app");
  console.error("with TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET set.");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${base}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});
const data = await res.json();
console.log(data.ok ? `Webhook set to ${base}/api/telegram/webhook` : `Telegram said: ${data.description}`);
process.exit(data.ok ? 0 : 1);
