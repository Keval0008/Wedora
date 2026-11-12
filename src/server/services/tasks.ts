import "server-only";
import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "../db";
import { member, reminder, task, vendorPayment, weddingFunction, type ReminderPreset } from "../db/schema";
import { badRequest, forbidden, notFound } from "../lib/http";
import { newId } from "../lib/ids";
import { planReminders, presetTime } from "../lib/reminders";

/**
 * Every task query goes through this: a task is visible when it belongs to the
 * wedding AND (it is a shared task OR the caller created it).
 */
export function visibleTasks(teamId: string, userId: string): SQL {
  return and(eq(task.organizationId, teamId), or(eq(task.isPersonal, false), eq(task.createdById, userId)))!;
}

export async function loadVisibleTask(taskId: string, teamId: string, userId: string) {
  const [row] = await db
    .select()
    .from(task)
    .where(and(eq(task.id, taskId), visibleTasks(teamId, userId)))
    .limit(1);
  if (!row) throw notFound("Task not found");
  return row;
}

/** A personal task may only be changed by the person who created it. */
export function assertMayEdit(existing: { isPersonal: boolean; createdById: string }, userId: string) {
  if (existing.isPersonal && existing.createdById !== userId) throw forbidden("This is someone else's personal task");
}

/** Rejects references to functions or people outside this wedding. */
export async function assertRefsInTeam(teamId: string, functionId?: string | null, assigneeId?: string | null) {
  if (functionId) {
    const [f] = await db
      .select({ id: weddingFunction.id })
      .from(weddingFunction)
      .where(and(eq(weddingFunction.id, functionId), eq(weddingFunction.organizationId, teamId)))
      .limit(1);
    if (!f) throw badRequest("That function is not part of this wedding");
  }
  if (assigneeId) {
    const [m] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, teamId), eq(member.userId, assigneeId)))
      .limit(1);
    if (!m) throw badRequest("That person is not part of this wedding");
  }
}

/** Replaces a task's unsent reminders. Sent ones stay as history. */
export async function replaceReminders(
  taskId: string,
  dueAt: Date | null,
  presets: readonly ReminderPreset[],
  custom: readonly Date[],
  now = new Date(),
) {
  await db.delete(reminder).where(and(eq(reminder.taskId, taskId), isNull(reminder.sentAt)));
  const planned = planReminders(dueAt, presets, custom, now);
  if (planned.length) {
    await db.insert(reminder).values(planned.map((p) => ({ id: newId(), taskId, preset: p.preset, remindAt: p.remindAt })));
  }
}

/** After the due time moves, preset reminders move with it; custom ones stay put. */
export async function shiftPresetReminders(taskId: string, dueAt: Date | null, now = new Date()) {
  const unsent = await db
    .select()
    .from(reminder)
    .where(and(eq(reminder.taskId, taskId), isNull(reminder.sentAt)));
  const presets = unsent.flatMap((r) => (r.preset ? [r.preset] : []));
  if (!presets.length) return;

  await db.delete(reminder).where(and(eq(reminder.taskId, taskId), isNull(reminder.sentAt), inArray(reminder.preset, presets)));
  if (!dueAt) return;
  const planned = planReminders(dueAt, presets, [], now);
  if (planned.length) {
    await db.insert(reminder).values(planned.map((p) => ({ id: newId(), taskId, preset: p.preset, remindAt: p.remindAt })));
  }
}

export async function addSnooze(taskId: string, at: Date) {
  await db.insert(reminder).values({ id: newId(), taskId, preset: null, remindAt: at });
}

/**
 * Marks a task done or open. A task made for a vendor payment keeps the
 * payment in step: finishing the task records the payment as paid.
 */
export async function setTaskDone(taskId: string, done: boolean) {
  const [row] = await db.select().from(task).where(eq(task.id, taskId)).limit(1);
  if (!row) throw notFound("Task not found");

  await db
    .update(task)
    .set({ status: done ? "done" : "todo", completedAt: done ? new Date() : null })
    .where(eq(task.id, taskId));

  if (row.vendorPaymentId) {
    await db
      .update(vendorPayment)
      .set({ paidAt: done ? new Date() : null })
      .where(eq(vendorPayment.id, row.vendorPaymentId));
  }
}

export { presetTime };
