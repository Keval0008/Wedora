import { and, asc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { reminder, task, user, vendor, vendorPayment, weddingFunction } from "../db/schema";
import { requireAuth, requireTeam, router } from "../hono";
import { addDays, endOfIstDay, istDateKey } from "../lib/time";
import { getOrCreateSettings } from "./functions";
import { songCounts } from "./songs";
import { taskColumns, withReminders } from "./tasks";

export const dashboardRouter = router();
dashboardRouter.use(requireAuth, requireTeam);

/** GET /api/dashboard — everything the Today screen shows, in one request. */
dashboardRouter.get("/", async (c) => {
  const me = c.get("user");
  const teamId = c.get("team").id;
  const now = new Date();
  const todayEnd = endOfIstDay(now);
  const weekEnd = endOfIstDay(addDays(now, 6));

  const mineOrUnassigned = or(eq(task.assigneeId, me.id), and(isNull(task.assigneeId), eq(task.createdById, me.id)));
  const visible = and(eq(task.organizationId, teamId), or(eq(task.isPersonal, false), eq(task.createdById, me.id)));

  const [settings, myTasksRaw, upcomingRaw, reminders, payments, functions, songs] = await Promise.all([
    getOrCreateSettings(teamId),
    // Mine, due today or already late.
    db
      .select(taskColumns)
      .from(task)
      .leftJoin(weddingFunction, eq(task.functionId, weddingFunction.id))
      .leftJoin(user, eq(task.assigneeId, user.id))
      .where(and(visible, mineOrUnassigned, ne(task.status, "done"), lte(task.dueAt, todayEnd)))
      .orderBy(asc(task.dueAt))
      .limit(50),
    // Mine, coming up this week.
    db
      .select(taskColumns)
      .from(task)
      .leftJoin(weddingFunction, eq(task.functionId, weddingFunction.id))
      .leftJoin(user, eq(task.assigneeId, user.id))
      .where(and(visible, mineOrUnassigned, ne(task.status, "done"), sql`${task.dueAt} > ${todayEnd}`, lte(task.dueAt, weekEnd)))
      .orderBy(asc(task.dueAt))
      .limit(20),
    // My next reminders.
    db
      .select({ id: reminder.id, remindAt: reminder.remindAt, taskId: task.id, title: task.title })
      .from(reminder)
      .innerJoin(task, eq(reminder.taskId, task.id))
      .where(and(visible, mineOrUnassigned, isNull(reminder.sentAt), ne(task.status, "done"), gte(reminder.remindAt, now)))
      .orderBy(asc(reminder.remindAt))
      .limit(5),
    // Payments due within a week (or already late).
    db
      .select({ id: vendorPayment.id, amount: vendorPayment.amount, dueAt: vendorPayment.dueAt, vendorId: vendor.id, vendorName: vendor.name })
      .from(vendorPayment)
      .innerJoin(vendor, eq(vendorPayment.vendorId, vendor.id))
      .where(and(eq(vendorPayment.organizationId, teamId), isNull(vendorPayment.paidAt), lte(vendorPayment.dueAt, weekEnd)))
      .orderBy(asc(vendorPayment.dueAt))
      .limit(10),
    // Functions from today on.
    db
      .select()
      .from(weddingFunction)
      .where(and(eq(weddingFunction.organizationId, teamId), eq(weddingFunction.archived, false), gte(weddingFunction.date, istDateKey(now))))
      .orderBy(asc(weddingFunction.date), asc(weddingFunction.startTime))
      .limit(4),
    songCounts(teamId),
  ]);

  return c.json({
    settings,
    today: await withReminders(myTasksRaw),
    upcoming: await withReminders(upcomingRaw),
    reminders,
    payments,
    functions,
    songs,
  });
});
