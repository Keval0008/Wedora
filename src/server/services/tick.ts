import "server-only";
import { and, asc, eq, isNull, lte, ne } from "drizzle-orm";
import { affectedRows, db, isDuplicateKey } from "../db";
import { jobState, member, reminder, task, user, vendor, vendorPayment, weddingFunction, weddingSettings } from "../db/schema";
import { notifyUsers } from "../lib/notify";
import { decideDueReminder, isDigestTime, reminderRecipients } from "../lib/reminders";
import { endOfIstDay, formatIst, istDateKey, istDaysUntil } from "../lib/time";

const BATCH = 50;

/** Claims a once-only job. True for exactly one caller, however many ticks race. */
export async function claimJob(key: string): Promise<boolean> {
  try {
    await db.insert(jobState).values({ key });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

function dueText(dueAt: Date | null, now: Date): string {
  if (!dueAt) return "No due time";
  const mins = Math.round((dueAt.getTime() - now.getTime()) / 60_000);
  if (mins > 0 && mins < 60) return `Due in ${mins} min · ${formatIst(dueAt, false)}`;
  if (mins <= 0 && mins > -5) return `Due now · ${formatIst(dueAt, false)}`;
  if (mins <= -5) return `Was due ${formatIst(dueAt)}`;
  return `Due ${formatIst(dueAt)}`;
}

/** Sends every reminder whose time has come, each exactly once. */
export async function sendDueReminders(now = new Date()) {
  const due = await db
    .select({
      id: reminder.id,
      remindAt: reminder.remindAt,
      taskId: task.id,
      title: task.title,
      status: task.status,
      dueAt: task.dueAt,
      assigneeId: task.assigneeId,
      createdById: task.createdById,
      notifyCreator: task.notifyCreator,
      functionName: weddingFunction.name,
    })
    .from(reminder)
    .innerJoin(task, eq(reminder.taskId, task.id))
    .leftJoin(weddingFunction, eq(task.functionId, weddingFunction.id))
    .where(and(isNull(reminder.sentAt), lte(reminder.remindAt, now)))
    .orderBy(asc(reminder.remindAt))
    .limit(BATCH);

  let sent = 0;
  let skipped = 0;
  for (const r of due) {
    try {
      // Claim first: a second tick running at the same moment gets 0 rows and moves on.
      const claim = await db
        .update(reminder)
        .set({ sentAt: now })
        .where(and(eq(reminder.id, r.id), isNull(reminder.sentAt)));
      if (affectedRows(claim) !== 1) continue;

      const decision = decideDueReminder({ remindAt: r.remindAt, taskStatus: r.status }, now);
      if (decision !== "send") {
        await db.update(reminder).set({ skipped: true }).where(eq(reminder.id, r.id));
        skipped++;
        continue;
      }

      const recipients = reminderRecipients(r);
      const where = r.functionName ? ` · ${r.functionName}` : "";
      await notifyUsers(recipients, {
        title: `⏰ ${r.title}`,
        body: `${dueText(r.dueAt, now)}${where}`,
        path: `/tasks?open=${r.taskId}`,
        tag: `task-${r.taskId}`,
        taskId: r.taskId,
      });
      sent++;
    } catch (error) {
      console.error(`[tick] reminder ${r.id} failed:`, error);
    }
  }
  return { sent, skipped, more: due.length === BATCH };
}

/** Each member's morning summary: their tasks for today, overdue ones and payments due. */
export async function sendDigests(now = new Date()) {
  const todayEnd = endOfIstDay(now);
  const people = await db
    .select({ userId: member.userId, organizationId: member.organizationId, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id));
  if (!people.length) return 0;

  const open = await db
    .select({ id: task.id, organizationId: task.organizationId, title: task.title, dueAt: task.dueAt, assigneeId: task.assigneeId, createdById: task.createdById })
    .from(task)
    .where(and(ne(task.status, "done"), lte(task.dueAt, todayEnd)));

  const payments = await db
    .select({ organizationId: vendorPayment.organizationId, amount: vendorPayment.amount, dueAt: vendorPayment.dueAt, vendorName: vendor.name })
    .from(vendorPayment)
    .innerJoin(vendor, eq(vendorPayment.vendorId, vendor.id))
    .where(and(isNull(vendorPayment.paidAt), lte(vendorPayment.dueAt, todayEnd)));

  const settings = await db.select().from(weddingSettings);
  const weddingDateOf = new Map(settings.map((s) => [s.organizationId, s.weddingDate]));
  const startToday = istDateKey(now);

  let sent = 0;
  for (const p of people) {
    const mine = open.filter((t) => t.organizationId === p.organizationId && (t.assigneeId ?? t.createdById) === p.userId);
    const overdue = mine.filter((t) => t.dueAt && istDateKey(t.dueAt) < startToday);
    const today = mine.filter((t) => t.dueAt && istDateKey(t.dueAt) === startToday);
    const pay = payments.filter((x) => x.organizationId === p.organizationId);
    if (!overdue.length && !today.length && !pay.length) continue;

    const lines: string[] = [];
    const wedding = weddingDateOf.get(p.organizationId);
    if (wedding) {
      const days = istDaysUntil(now, wedding);
      if (days > 0) lines.push(`🎉 ${days} day${days === 1 ? "" : "s"} to go`);
      if (days === 0) lines.push("🎉 Today is the day!");
    }
    if (today.length) lines.push(`Today: ${today.map((t) => `${t.title} (${formatIst(t.dueAt!, false)})`).join("; ")}`);
    if (overdue.length) lines.push(`Overdue: ${overdue.map((t) => t.title).join("; ")}`);
    if (pay.length) lines.push(`Payments due: ${pay.map((x) => `₹${x.amount.toLocaleString("en-IN")} to ${x.vendorName}`).join("; ")}`);

    await notifyUsers([p.userId], {
      title: `Good morning, ${p.name.split(" ")[0]}`,
      body: lines.join("\n"),
      path: "/",
      tag: `digest-${startToday}`,
    });
    sent++;
  }
  return sent;
}

/** One pass of the scheduler. cron-job.org calls it every minute. */
export async function runTick(now = new Date()) {
  const reminders = await sendDueReminders(now);
  let digests = 0;
  if (isDigestTime(now) && (await claimJob(`digest:${istDateKey(now)}`))) {
    digests = await sendDigests(now);
  }
  return { at: now.toISOString(), ...reminders, digests };
}

