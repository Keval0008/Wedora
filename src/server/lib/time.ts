/**
 * India Standard Time helpers. Vercel functions run in UTC and do not allow
 * setting TZ, so every "today", "8 AM" and "tomorrow 9 AM" is computed here.
 * IST is a fixed UTC+05:30 with no daylight saving, which keeps this exact.
 */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** The IST wall-clock parts of an instant. */
export function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-12-04" — the IST calendar date of an instant. */
export function istDateKey(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The instant of an IST wall-clock time. `date` is "YYYY-MM-DD", `time` is "HH:MM". */
export function fromIst(date: string, time = "00:00"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d) throw new Error(`Bad date "${date}"`);
  return new Date(Date.UTC(y, m - 1, d, hh ?? 0, mm ?? 0) - IST_OFFSET_MS);
}

export function startOfIstDay(d: Date): Date {
  return fromIst(istDateKey(d), "00:00");
}

export function endOfIstDay(d: Date): Date {
  return new Date(startOfIstDay(d).getTime() + 86_400_000 - 1);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** The given IST clock time on the day after `d` (IST). */
export function istTomorrowAt(d: Date, time: string): Date {
  return fromIst(istDateKey(addDays(d, 1)), time);
}

/** The given IST clock time on the IST date of `d`. */
export function istSameDayAt(d: Date, time: string): Date {
  return fromIst(istDateKey(d), time);
}

/** "Sat 15 Nov, 5:00 PM" in IST — for notification text written on the server. */
export function formatIst(d: Date, withDate = true): string {
  const p = istParts(d);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const time = `${h12}:${pad(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`;
  if (!withDate) return time;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[p.weekday]} ${p.day} ${months[p.month - 1]}, ${time}`;
}

/** Whole IST calendar days from `from` to the IST date `toKey` ("YYYY-MM-DD"). */
export function istDaysUntil(from: Date, toKey: string): number {
  const a = fromIst(istDateKey(from)).getTime();
  const b = fromIst(toKey).getTime();
  return Math.round((b - a) / 86_400_000);
}
