import { describe, expect, it } from "vitest";
import { vendorTotals } from "./money";
import { decideDueReminder, isDigestTime, planReminders, presetTime, reminderRecipients, STALE_AFTER_MS } from "./reminders";
import { endOfIstDay, formatIst, fromIst, istDateKey, istDaysUntil, istTomorrowAt, startOfIstDay } from "./time";

// 15 Nov 2026, 5:00 PM IST == 11:30 UTC
const DUE = new Date("2026-11-15T11:30:00.000Z");

describe("IST time helpers", () => {
  it("converts IST wall-clock times to UTC instants", () => {
    expect(fromIst("2026-11-15", "17:00").toISOString()).toBe(DUE.toISOString());
    expect(fromIst("2026-12-04", "00:00").toISOString()).toBe("2026-12-03T18:30:00.000Z");
  });

  it("uses the IST date, not the UTC date, around midnight", () => {
    // 20:00 UTC on the 14th is 01:30 IST on the 15th.
    const lateUtc = new Date("2026-11-14T20:00:00.000Z");
    expect(istDateKey(lateUtc)).toBe("2026-11-15");
    expect(startOfIstDay(lateUtc).toISOString()).toBe("2026-11-14T18:30:00.000Z");
    expect(endOfIstDay(lateUtc).toISOString()).toBe("2026-11-15T18:29:59.999Z");
  });

  it("finds tomorrow 9 AM in IST", () => {
    expect(istTomorrowAt(DUE, "09:00").toISOString()).toBe("2026-11-16T03:30:00.000Z");
  });

  it("writes times the way people read them", () => {
    expect(formatIst(DUE)).toBe("Sun 15 Nov, 5:00 PM");
    expect(formatIst(fromIst("2026-11-15", "00:05"), false)).toBe("12:05 AM");
  });

  it("counts days to the wedding in IST", () => {
    expect(istDaysUntil(new Date("2026-11-13T05:00:00.000Z"), "2026-12-04")).toBe(21);
    expect(istDaysUntil(fromIst("2026-12-04", "23:00"), "2026-12-04")).toBe(0);
  });
});

describe("presetTime", () => {
  it("places each preset relative to the due time", () => {
    expect(presetTime("at", DUE).toISOString()).toBe(DUE.toISOString());
    expect(presetTime("15m", DUE).toISOString()).toBe("2026-11-15T11:15:00.000Z");
    expect(presetTime("1h", DUE).toISOString()).toBe("2026-11-15T10:30:00.000Z");
    expect(presetTime("1d", DUE).toISOString()).toBe("2026-11-14T11:30:00.000Z");
    // 8 AM IST on the due day
    expect(presetTime("morning", DUE).toISOString()).toBe("2026-11-15T02:30:00.000Z");
  });
});

describe("planReminders", () => {
  it("drops times already in the past", () => {
    const now = new Date("2026-11-15T11:00:00.000Z"); // 4:30 PM IST
    const planned = planReminders(DUE, ["1d", "morning", "1h", "15m", "at"], [], now);
    expect(planned.map((p) => p.preset)).toEqual(["15m", "at"]);
  });

  it("sorts and merges reminders that land on the same minute", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    const planned = planReminders(DUE, ["at", "1h"], [new Date(DUE.getTime() + 20_000)], now);
    expect(planned).toHaveLength(2);
    expect(planned[0]!.preset).toBe("1h");
  });

  it("only keeps custom times when there is no due date", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    expect(planReminders(null, ["at", "1h"], [DUE], now)).toEqual([{ preset: null, remindAt: DUE }]);
  });
});

describe("decideDueReminder", () => {
  it("sends a reminder that is due", () => {
    expect(decideDueReminder({ remindAt: DUE, taskStatus: "todo" }, new Date(DUE.getTime() + 30_000))).toBe("send");
  });

  it("skips tasks already done", () => {
    expect(decideDueReminder({ remindAt: DUE, taskStatus: "done" }, DUE)).toBe("skip-done");
  });

  it("skips reminders far too late to be useful", () => {
    expect(decideDueReminder({ remindAt: DUE, taskStatus: "todo" }, new Date(DUE.getTime() + STALE_AFTER_MS + 1))).toBe("skip-stale");
    expect(decideDueReminder({ remindAt: DUE, taskStatus: "todo" }, new Date(DUE.getTime() + STALE_AFTER_MS - 1))).toBe("send");
  });
});

describe("reminderRecipients", () => {
  it("goes to the assignee", () => {
    expect(reminderRecipients({ assigneeId: "riya", createdById: "mom", notifyCreator: false })).toEqual(["riya"]);
  });
  it("falls back to the creator when nobody is assigned", () => {
    expect(reminderRecipients({ assigneeId: null, createdById: "mom", notifyCreator: false })).toEqual(["mom"]);
  });
  it("adds the creator when asked, once", () => {
    expect(reminderRecipients({ assigneeId: "riya", createdById: "mom", notifyCreator: true })).toEqual(["riya", "mom"]);
    expect(reminderRecipients({ assigneeId: "mom", createdById: "mom", notifyCreator: true })).toEqual(["mom"]);
  });
});

describe("isDigestTime", () => {
  it("is false before 8 AM IST and true after", () => {
    expect(isDigestTime(fromIst("2026-11-15", "07:59"))).toBe(false);
    expect(isDigestTime(fromIst("2026-11-15", "08:00"))).toBe(true);
    expect(isDigestTime(fromIst("2026-11-15", "23:30"))).toBe(true);
  });
});

describe("vendorTotals", () => {
  it("adds up paid and scheduled instalments", () => {
    const t = vendorTotals(125000, [
      { amount: 25000, paidAt: new Date(), dueAt: null },
      { amount: 50000, paidAt: null, dueAt: DUE },
    ]);
    expect(t).toEqual({ paid: 25000, scheduled: 50000, balance: 100000, unscheduled: 50000, overpaid: 0 });
  });

  it("never shows a negative balance", () => {
    const t = vendorTotals(10000, [{ amount: 12000, paidAt: new Date(), dueAt: null }]);
    expect(t.balance).toBe(0);
    expect(t.overpaid).toBe(2000);
  });
});
