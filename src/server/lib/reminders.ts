import type { ReminderPreset } from "../db/app-schema";
import { istParts, istSameDayAt } from "./time";

/** A reminder more than this late (e.g. the pinger was down) is skipped, not sent. */
export const STALE_AFTER_MS = 12 * 60 * 60_000;
/** The daily digest goes out at the first tick after this IST hour. */
export const DIGEST_HOUR_IST = 8;

/** When a preset fires for a task due at `dueAt`. */
export function presetTime(preset: ReminderPreset, dueAt: Date): Date {
  switch (preset) {
    case "at":
      return dueAt;
    case "15m":
      return new Date(dueAt.getTime() - 15 * 60_000);
    case "1h":
      return new Date(dueAt.getTime() - 60 * 60_000);
    case "1d":
      return new Date(dueAt.getTime() - 24 * 60 * 60_000);
    case "morning":
      return istSameDayAt(dueAt, `${String(DIGEST_HOUR_IST).padStart(2, "0")}:00`);
  }
}

export type PlannedReminder = { preset: ReminderPreset | null; remindAt: Date };

/**
 * The reminders to store for a task. Times already in the past are dropped (a
 * reminder that fires the moment you save is noise), and two presets landing
 * on the same minute become one.
 */
export function planReminders(
  dueAt: Date | null,
  presets: readonly ReminderPreset[],
  custom: readonly Date[],
  now: Date,
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  if (dueAt) for (const p of presets) planned.push({ preset: p, remindAt: presetTime(p, dueAt) });
  for (const at of custom) planned.push({ preset: null, remindAt: at });

  const seen = new Set<number>();
  return planned
    .filter((r) => r.remindAt.getTime() > now.getTime())
    .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime())
    .filter((r) => {
      const minute = Math.floor(r.remindAt.getTime() / 60_000);
      if (seen.has(minute)) return false;
      seen.add(minute);
      return true;
    });
}

export type DueDecision = "send" | "skip-done" | "skip-stale";

/** What the tick does with a claimed reminder. */
export function decideDueReminder(
  r: { remindAt: Date; taskStatus: string },
  now: Date,
): DueDecision {
  if (r.taskStatus === "done") return "skip-done";
  if (now.getTime() - r.remindAt.getTime() > STALE_AFTER_MS) return "skip-stale";
  return "send";
}

/** The assignee (or the creator when nobody is assigned), plus the creator when asked. */
export function reminderRecipients(t: {
  assigneeId: string | null;
  createdById: string;
  notifyCreator: boolean;
}): string[] {
  const ids = new Set<string>([t.assigneeId ?? t.createdById]);
  if (t.notifyCreator) ids.add(t.createdById);
  return [...ids];
}

/** True once it is past the digest hour in IST. The job key makes it once a day. */
export function isDigestTime(now: Date): boolean {
  return istParts(now).hour >= DIGEST_HOUR_IST;
}
