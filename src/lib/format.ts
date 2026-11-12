import { differenceInCalendarDays, format, isThisYear } from "date-fns";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const toDate = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

/** "Overdue 2d", "Today 5:00 PM", "Fri", "12 Mar" — short enough for a dense row. */
export function formatDue(
  value: string | Date | null,
  now = new Date(),
): { label: string; tone: "overdue" | "today" | "soon" | "normal" } | null {
  if (!value) return null;
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return null;

  const days = differenceInCalendarDays(date, now);
  const time = format(date, "h:mm a");

  if (date < now && days === 0) return { label: `Today ${time}`, tone: "overdue" };
  if (days < 0) return { label: days === -1 ? "Yesterday" : `${Math.abs(days)}d overdue`, tone: "overdue" };
  if (days === 0) return { label: `Today ${time}`, tone: "today" };
  if (days === 1) return { label: `Tomorrow ${time}`, tone: "soon" };
  if (days < 7) return { label: `${format(date, "EEE")} ${time}`, tone: "soon" };
  return { label: format(date, isThisYear(date) ? "d MMM" : "d MMM yy"), tone: "normal" };
}

/** "Sat 15 Nov · 5:00 PM" */
export function formatWhen(value: string | Date | null): string {
  if (!value) return "";
  const date = toDate(value);
  return format(date, isThisYear(date) ? "EEE d MMM · h:mm a" : "EEE d MMM yyyy · h:mm a");
}

/** "2026-12-04" -> "Fri 4 Dec" */
export function formatDateKey(key: string | null, withYear = false): string {
  if (!key) return "";
  const date = new Date(`${key}T12:00:00`);
  return format(date, withYear ? "EEE d MMM yyyy" : "EEE d MMM");
}

/** "18:30" -> "6:30 PM" */
export function formatClock(hhmm: string | null): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`;
}

/** A local calendar date for a date field. */
export function toDateInputValue(value: string | Date | null): string {
  if (!value) return "";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
}

/** A local clock time for a time field. */
export function toTimeInputValue(value: string | Date | null): string {
  if (!value) return "";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "HH:mm");
}

/** A date field plus a time field, as an ISO instant in the browser's time zone. */
export function combineDateTime(dateKey: string, time: string | null): string | null {
  if (!dateKey) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh ?? 9, mm ?? 0, 0).toISOString();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** "₹1,25,000" */
export function rupees(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** 95 -> "1:35" */
export function mmss(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "1:35" or "95" -> 95; blank -> null; nonsense -> undefined. */
export function parseMmss(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d{1,4}$/.test(t)) return Number(t);
  return undefined;
}

/** Days from today to an IST date key; negative once it has passed. */
export function daysUntil(key: string | null, now = new Date()): number | null {
  if (!key) return null;
  return differenceInCalendarDays(new Date(`${key}T00:00:00`), now);
}

/** Digits for a wa.me / tel: link; Indian numbers without a country code get +91. */
export function phoneDigits(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits || null;
}
