import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { reminder, reminderPresets, task, taskPriorities, taskStatuses, user, weddingFunction } from "../db/schema";
import { requireAuth, requireTeam, router } from "../hono";
import { badRequest, parse, readJson } from "../lib/http";
import { newId } from "../lib/ids";
import { addDays, endOfIstDay, istTomorrowAt, startOfIstDay } from "../lib/time";
import {
  addSnooze,
  assertMayEdit,
  assertRefsInTeam,
  loadVisibleTask,
  replaceReminders,
  setTaskDone,
  shiftPresetReminders,
  visibleTasks,
} from "../services/tasks";

export const tasksRouter = router();
tasksRouter.use(requireAuth, requireTeam);

const csv = z
  .string()
  .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
  .pipe(z.array(z.string()).max(50));

const FilterQuery = z.object({
  q: z.string().trim().max(200).optional(),
  functionIds: csv.optional(), // may contain the literal "none"
  assigneeIds: csv.optional(), // may contain the literal "unassigned"
  status: csv.optional(),
  priority: csv.optional(),
  due: z.enum(["overdue", "today", "week", "none"]).optional(),
  scope: z.enum(["all", "mine", "personal", "created"]).default("all"),
  showCompleted: z.enum(["true", "false"]).default("false"),
  sort: z.enum(["due", "priority", "created", "updated"]).default("due"),
  limit: z.coerce.number().int().min(1).max(500).default(300),
});

/** Columns every task list returns, with the function and assignee joined in. */
export const taskColumns = {
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  priority: task.priority,
  dueAt: task.dueAt,
  notifyCreator: task.notifyCreator,
  isPersonal: task.isPersonal,
  vendorPaymentId: task.vendorPaymentId,
  completedAt: task.completedAt,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  createdById: task.createdById,
  functionId: task.functionId,
  functionName: weddingFunction.name,
  functionColor: weddingFunction.color,
  assigneeId: task.assigneeId,
  assigneeName: user.name,
  assigneeImage: user.image,
};

/** Attaches each task's reminders (upcoming first, then sent). */
export async function withReminders<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return [];
  const all = await db
    .select({ id: reminder.id, taskId: reminder.taskId, preset: reminder.preset, remindAt: reminder.remindAt, sentAt: reminder.sentAt, skipped: reminder.skipped })
    .from(reminder)
    .where(inArray(reminder.taskId, rows.map((r) => r.id)))
    .orderBy(asc(reminder.remindAt));
  const byTask = new Map<string, typeof all>();
  for (const r of all) byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), r]);
  return rows.map((r) => ({ ...r, reminders: (byTask.get(r.id) ?? []).map(({ taskId: _t, ...rest }) => rest) }));
}

async function loadOne(taskId: string) {
  const rows = await db
    .select(taskColumns)
    .from(task)
    .leftJoin(weddingFunction, eq(task.functionId, weddingFunction.id))
    .leftJoin(user, eq(task.assigneeId, user.id))
    .where(eq(task.id, taskId))
    .limit(1);
  const [one] = await withReminders(rows);
  return one;
}

/** GET /api/tasks — filtered list. */
tasksRouter.get("/", async (c) => {
  const f = parse(FilterQuery, c.req.query());
  const me = c.get("user");
  const team = c.get("team");
  const where: SQL[] = [visibleTasks(team.id, me.id)];

  if (f.q) {
    const like = `%${f.q}%`;
    where.push(or(sql`${task.title} like ${like}`, sql`${task.description} like ${like}`)!);
  }

  const idFilter = (ids: string[] | undefined, column: typeof task.functionId | typeof task.assigneeId, none: string) => {
    if (!ids?.length) return;
    const real = ids.filter((id) => id !== none);
    const clauses: SQL[] = [];
    if (real.length) clauses.push(inArray(column, real));
    if (ids.includes(none)) clauses.push(isNull(column));
    if (clauses.length) where.push(clauses.length === 1 ? clauses[0]! : or(...clauses)!);
  };
  idFilter(f.functionIds, task.functionId, "none");
  idFilter(f.assigneeIds, task.assigneeId, "unassigned");

  if (f.status?.length) {
    const valid = f.status.filter((s): s is (typeof taskStatuses)[number] => (taskStatuses as readonly string[]).includes(s));
    if (valid.length) where.push(inArray(task.status, valid));
  }
  if (f.priority?.length) {
    const valid = f.priority.filter((p): p is (typeof taskPriorities)[number] => (taskPriorities as readonly string[]).includes(p));
    if (valid.length) where.push(inArray(task.priority, valid));
  }

  const now = new Date();
  if (f.due === "overdue") where.push(and(lt(task.dueAt, now), ne(task.status, "done"))!);
  else if (f.due === "today") where.push(and(gte(task.dueAt, startOfIstDay(now)), lte(task.dueAt, endOfIstDay(now)))!);
  else if (f.due === "week") where.push(and(gte(task.dueAt, startOfIstDay(now)), lte(task.dueAt, endOfIstDay(addDays(now, 6))))!);
  else if (f.due === "none") where.push(isNull(task.dueAt));

  if (f.scope === "mine") where.push(eq(task.assigneeId, me.id));
  if (f.scope === "created") where.push(eq(task.createdById, me.id));
  if (f.scope === "personal") where.push(eq(task.isPersonal, true));
  if (f.scope === "all") where.push(eq(task.isPersonal, false));

  const asksForDone = f.status?.includes("done") ?? false;
  if (f.showCompleted === "false" && !asksForDone) where.push(ne(task.status, "done"));

  const order: SQL[] =
    f.sort === "due"
      ? [sql`${task.dueAt} is null`, asc(task.dueAt), desc(task.createdAt)]
      : f.sort === "priority"
        ? [sql`field(${task.priority}, 'urgent', 'high', 'medium', 'low')`, desc(task.createdAt)]
        : f.sort === "updated"
          ? [desc(task.updatedAt)]
          : [desc(task.createdAt)];

  const rows = await db
    .select(taskColumns)
    .from(task)
    .leftJoin(weddingFunction, eq(task.functionId, weddingFunction.id))
    .leftJoin(user, eq(task.assigneeId, user.id))
    .where(and(...where))
    .orderBy(...order)
    .limit(f.limit);

  return c.json({ tasks: await withReminders(rows) });
});

/** GET /api/tasks/:id — one task, e.g. opened from a notification. */
tasksRouter.get("/:id", async (c) => {
  const existing = await loadVisibleTask(c.req.param("id"), c.get("team").id, c.get("user").id);
  return c.json({ task: await loadOne(existing.id) });
});

const RemindersInput = z.object({
  presets: z.array(z.enum(reminderPresets)).max(reminderPresets.length).default([]),
  custom: z.array(z.iso.datetime({ offset: true })).max(10).default([]),
});

const TaskInput = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(300),
  description: z.string().max(10_000).nullable().optional(),
  functionId: z.string().max(36).nullable().optional(),
  status: z.enum(taskStatuses).optional(),
  priority: z.enum(taskPriorities).optional(),
  assigneeId: z.string().max(36).nullable().optional(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  notifyCreator: z.boolean().optional(),
  isPersonal: z.boolean().optional(),
  reminders: RemindersInput.optional(),
});

/** POST /api/tasks */
tasksRouter.post("/", async (c) => {
  const input = parse(TaskInput, await readJson(c.req.raw));
  const me = c.get("user");
  const team = c.get("team");
  const isPersonal = input.isPersonal ?? false;

  await assertRefsInTeam(team.id, input.functionId, isPersonal ? null : input.assigneeId);

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const id = newId();
  await db.insert(task).values({
    id,
    organizationId: team.id,
    title: input.title,
    description: input.description ?? null,
    functionId: input.functionId ?? null,
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    // Personal tasks are always your own.
    assigneeId: isPersonal ? me.id : (input.assigneeId ?? null),
    createdById: me.id,
    dueAt,
    notifyCreator: input.notifyCreator ?? false,
    isPersonal,
    completedAt: input.status === "done" ? new Date() : null,
  });

  if (input.reminders) {
    await replaceReminders(id, dueAt, input.reminders.presets, input.reminders.custom.map((s) => new Date(s)));
  }
  return c.json({ task: await loadOne(id) }, 201);
});

/** PATCH /api/tasks/:id */
tasksRouter.patch("/:id", async (c) => {
  const input = parse(TaskInput.partial(), await readJson(c.req.raw));
  const me = c.get("user");
  const team = c.get("team");
  const existing = await loadVisibleTask(c.req.param("id"), team.id, me.id);
  assertMayEdit(existing, me.id);
  await assertRefsInTeam(team.id, input.functionId, input.assigneeId);

  const patch: Partial<typeof task.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.functionId !== undefined) patch.functionId = input.functionId;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.notifyCreator !== undefined) patch.notifyCreator = input.notifyCreator;
  if (input.assigneeId !== undefined && !existing.isPersonal) patch.assigneeId = input.assigneeId;
  const dueChanged = input.dueAt !== undefined;
  if (dueChanged) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;

  if (Object.keys(patch).length) await db.update(task).set(patch).where(eq(task.id, existing.id));
  if (input.status !== undefined && (input.status === "done") !== (existing.status === "done")) {
    await setTaskDone(existing.id, input.status === "done");
  } else if (input.status !== undefined) {
    await db.update(task).set({ status: input.status }).where(eq(task.id, existing.id));
  }

  const dueAt = dueChanged ? (patch.dueAt ?? null) : existing.dueAt;
  if (input.reminders) {
    await replaceReminders(existing.id, dueAt, input.reminders.presets, input.reminders.custom.map((s) => new Date(s)));
  } else if (dueChanged) {
    await shiftPresetReminders(existing.id, dueAt);
  }

  return c.json({ task: await loadOne(existing.id) });
});

/** POST /api/tasks/:id/toggle — flip between done and todo. */
tasksRouter.post("/:id/toggle", async (c) => {
  const me = c.get("user");
  const existing = await loadVisibleTask(c.req.param("id"), c.get("team").id, me.id);
  assertMayEdit(existing, me.id);
  await setTaskDone(existing.id, existing.status !== "done");
  return c.json({ task: await loadOne(existing.id) });
});

/** POST /api/tasks/:id/snooze — remind again in N minutes, or tomorrow at 9 AM. */
tasksRouter.post("/:id/snooze", async (c) => {
  const body = parse(
    z.union([z.object({ minutes: z.number().int().min(5).max(7 * 24 * 60) }), z.object({ until: z.literal("tomorrow") })]),
    await readJson(c.req.raw),
  );
  const existing = await loadVisibleTask(c.req.param("id"), c.get("team").id, c.get("user").id);
  const now = new Date();
  const at = "minutes" in body ? new Date(now.getTime() + body.minutes * 60_000) : istTomorrowAt(now, "09:00");
  await addSnooze(existing.id, at);
  return c.json({ task: await loadOne(existing.id) });
});

/** DELETE /api/tasks/:id/reminders/:reminderId — drop one upcoming reminder. */
tasksRouter.delete("/:id/reminders/:reminderId", async (c) => {
  const me = c.get("user");
  const existing = await loadVisibleTask(c.req.param("id"), c.get("team").id, me.id);
  assertMayEdit(existing, me.id);
  await db
    .delete(reminder)
    .where(and(eq(reminder.id, c.req.param("reminderId")), eq(reminder.taskId, existing.id), isNull(reminder.sentAt)));
  return c.json({ task: await loadOne(existing.id) });
});

/** DELETE /api/tasks/:id */
tasksRouter.delete("/:id", async (c) => {
  const me = c.get("user");
  const existing = await loadVisibleTask(c.req.param("id"), c.get("team").id, me.id);
  assertMayEdit(existing, me.id);
  if (existing.vendorPaymentId) throw badRequest("This task belongs to a vendor payment. Delete the payment instead.");
  await db.delete(task).where(eq(task.id, existing.id));
  return c.body(null, 204);
});
