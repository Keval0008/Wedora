"use client";

import { BellRing, X } from "lucide-react";
import { Chip, DateField, Label, TimeField } from "@/components/ui";
import { cn, combineDateTime, formatWhen, toDateInputValue, toTimeInputValue } from "@/lib/format";
import { PRESET_LABEL, REMINDER_PRESETS, type Reminder, type ReminderPreset } from "@/lib/types";

/** When a preset would fire for a task due at `dueAt` (mirrors the server). */
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
    case "morning": {
      const d = new Date(dueAt);
      d.setHours(8, 0, 0, 0);
      return d;
    }
  }
}

export const DEFAULT_PRESETS: ReminderPreset[] = ["1h", "at"];

/**
 * Due date + time, and which reminders to send. Presets whose moment has
 * already passed are shown but can't be picked.
 */
export function DueAndReminders({
  dueAt,
  presets,
  onDueChange,
  onPresetsChange,
  reminders = [],
  onRemoveReminder,
  disabled,
  idPrefix = "due",
}: {
  dueAt: string | null;
  presets: ReminderPreset[];
  onDueChange: (iso: string | null) => void;
  onPresetsChange: (presets: ReminderPreset[]) => void;
  /** Already stored reminders (custom times and snoozes are listed separately). */
  reminders?: Reminder[];
  onRemoveReminder?: (id: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const dateKey = toDateInputValue(dueAt);
  const time = toTimeInputValue(dueAt) || "09:00";
  const due = dueAt ? new Date(dueAt) : null;
  const now = new Date();

  const custom = reminders.filter((r) => !r.preset && !r.sentAt);
  const sent = reminders.filter((r) => r.sentAt);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <Label htmlFor={`${idPrefix}-date`}>Due</Label>
          <DateField
            id={`${idPrefix}-date`}
            value={dateKey}
            disabled={disabled}
            onChange={(v) => onDueChange(v ? combineDateTime(v, time) : null)}
          />
        </div>
        <div className={cn("w-32", !dateKey && "pointer-events-none opacity-40")}>
          <Label htmlFor={`${idPrefix}-time`}>Time</Label>
          <TimeField id={`${idPrefix}-time`} value={time} onChange={(v) => onDueChange(combineDateTime(dateKey, v))} />
        </div>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
          <BellRing className="size-3.5" /> Remind
        </p>
        {!due ? (
          <p className="text-[13px] text-ink-muted">Set a due date to get reminders.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {REMINDER_PRESETS.map((p) => {
              const at = presetTime(p, due);
              const past = at <= now;
              const active = presets.includes(p) && !past;
              return (
                <Chip
                  key={p}
                  active={active}
                  disabled={disabled || past}
                  title={past ? "Already passed" : formatWhen(at)}
                  className={past ? "opacity-40 line-through" : undefined}
                  onClick={() => onPresetsChange(active ? presets.filter((x) => x !== p) : [...presets, p])}
                >
                  {PRESET_LABEL[p]}
                </Chip>
              );
            })}
          </div>
        )}
      </div>

      {(custom.length > 0 || sent.length > 0) && (
        <ul className="space-y-1 text-[13px]">
          {custom.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-ink-soft">
              <BellRing className="size-3.5 text-marigold" />
              Snoozed to {formatWhen(r.remindAt)}
              {onRemoveReminder && (
                <button
                  type="button"
                  onClick={() => onRemoveReminder(r.id)}
                  className="ml-auto text-ink-muted hover:text-urgent"
                  aria-label="Remove this reminder"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
          {sent.slice(-3).map((r) => (
            <li key={r.id} className="text-ink-muted">
              {r.skipped ? "Skipped" : "Sent"} {formatWhen(r.sentAt)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The presets currently stored (unsent) on a task. */
export function storedPresets(reminders: Reminder[]): ReminderPreset[] {
  return reminders.filter((r) => r.preset && !r.sentAt).map((r) => r.preset!) as ReminderPreset[];
}
