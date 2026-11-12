import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { affectedRows, db } from "../db";
import { paymentMethods, reminderPresets, task, vendor, vendorPayment, type VendorPayment } from "../db/schema";
import { requireAuth, requireTeam, requireTeamAdmin, router } from "../hono";
import { notFound, parse, readJson } from "../lib/http";
import { newId } from "../lib/ids";
import { rupees, vendorTotals } from "../lib/money";
import { assertRefsInTeam, replaceReminders, shiftPresetReminders } from "../services/tasks";

export const vendorsRouter = router();
vendorsRouter.use(requireAuth, requireTeam);

const VendorInput = z.object({
  name: z.string().trim().min(1, "Name the vendor").max(150),
  category: z.string().trim().min(1).max(40).default("other"),
  contactName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(20).regex(/^[+\d\s()-]*$/, "Use digits only for the phone").nullable().optional(),
  totalAmount: z.number().int().min(0).max(1_000_000_000).default(0),
  notes: z.string().max(5000).nullable().optional(),
});

async function loadVendor(teamId: string, id: string) {
  const [row] = await db.select().from(vendor).where(and(eq(vendor.id, id), eq(vendor.organizationId, teamId))).limit(1);
  if (!row) throw notFound("Vendor not found");
  return row;
}

/** GET /api/vendors — every vendor with its payments and totals, plus the overall budget. */
vendorsRouter.get("/", async (c) => {
  const teamId = c.get("team").id;
  const vendors = await db.select().from(vendor).where(eq(vendor.organizationId, teamId)).orderBy(asc(vendor.category), asc(vendor.name));
  const payments = vendors.length
    ? await db
        .select({ payment: vendorPayment, taskAssigneeId: task.assigneeId, taskId: task.id })
        .from(vendorPayment)
        .leftJoin(task, eq(task.vendorPaymentId, vendorPayment.id))
        .where(inArray(vendorPayment.vendorId, vendors.map((v) => v.id)))
        .orderBy(asc(vendorPayment.dueAt), asc(vendorPayment.createdAt))
    : [];

  const rows = vendors.map((v) => {
    const own = payments.filter((p) => p.payment.vendorId === v.id);
    return {
      ...v,
      payments: own.map((p) => ({ ...p.payment, taskId: p.taskId, assigneeId: p.taskAssigneeId })),
      totals: vendorTotals(v.totalAmount, own.map((p) => p.payment)),
    };
  });

  const summary = rows.reduce(
    (acc, v) => {
      acc.committed += v.totalAmount;
      acc.paid += v.totals.paid;
      acc.balance += v.totals.balance;
      const cat = (acc.byCategory[v.category] ??= { committed: 0, paid: 0, balance: 0 });
      cat.committed += v.totalAmount;
      cat.paid += v.totals.paid;
      cat.balance += v.totals.balance;
      return acc;
    },
    { committed: 0, paid: 0, balance: 0, byCategory: {} as Record<string, { committed: number; paid: number; balance: number }> },
  );
  return c.json({ vendors: rows, summary });
});

vendorsRouter.post("/", async (c) => {
  const input = parse(VendorInput, await readJson(c.req.raw));
  const id = newId();
  await db.insert(vendor).values({ id, organizationId: c.get("team").id, ...input, contactName: input.contactName ?? null, phone: input.phone ?? null, notes: input.notes ?? null });
  return c.json({ vendor: await loadVendor(c.get("team").id, id) }, 201);
});

vendorsRouter.patch("/:id", async (c) => {
  const input = parse(VendorInput.partial(), await readJson(c.req.raw));
  const v = await loadVendor(c.get("team").id, c.req.param("id"));
  if (Object.keys(input).length) await db.update(vendor).set(input).where(eq(vendor.id, v.id));
  // A renamed vendor renames its payment tasks.
  if (input.name && input.name !== v.name) {
    const pays = await db.select().from(vendorPayment).where(eq(vendorPayment.vendorId, v.id));
    for (const p of pays) await db.update(task).set({ title: paymentTaskTitle(p.amount, input.name) }).where(eq(task.vendorPaymentId, p.id));
  }
  return c.json({ vendor: await loadVendor(c.get("team").id, v.id) });
});

vendorsRouter.delete("/:id", requireTeamAdmin, async (c) => {
  const v = await loadVendor(c.get("team").id, c.req.param("id"));
  const pays = await db.select({ id: vendorPayment.id }).from(vendorPayment).where(eq(vendorPayment.vendorId, v.id));
  if (pays.length) await db.delete(task).where(inArray(task.vendorPaymentId, pays.map((p) => p.id)));
  await db.delete(vendor).where(eq(vendor.id, v.id));
  return c.body(null, 204);
});

/* -------------------------------------------------------------- payments */

const paymentTaskTitle = (amount: number, vendorName: string) => `Pay ${rupees(amount)} to ${vendorName}`;
const PAYMENT_REMINDERS = ["1d", "morning"] as const;

const PaymentInput = z.object({
  amount: z.number().int().min(1, "Enter an amount").max(1_000_000_000),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  paid: z.boolean().default(false),
  method: z.enum(paymentMethods).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  /** Who should get the reminder for a due payment. Defaults to whoever added it. */
  assigneeId: z.string().max(36).nullable().optional(),
  reminderPresets: z.array(z.enum(reminderPresets)).optional(),
});

/**
 * Keeps a payment's task in step with it: an unpaid payment with a due date has
 * an open task (with reminders); a paid one has a done task; no due date, no task.
 */
async function syncPaymentTask(
  p: VendorPayment,
  vendorName: string,
  opts: { teamId: string; userId: string; assigneeId?: string | null; presets?: readonly (typeof reminderPresets)[number][] },
) {
  const [existing] = await db.select().from(task).where(eq(task.vendorPaymentId, p.id)).limit(1);

  if (!p.dueAt && !existing) return;
  if (!p.dueAt && existing && !p.paidAt) {
    await db.delete(task).where(eq(task.id, existing.id));
    return;
  }

  if (!existing) {
    if (p.paidAt) return; // Paid on the spot: nothing to remind about.
    const id = newId();
    await db.insert(task).values({
      id,
      organizationId: opts.teamId,
      title: paymentTaskTitle(p.amount, vendorName),
      description: p.note ? `Payment note: ${p.note}` : null,
      priority: "high",
      assigneeId: opts.assigneeId ?? opts.userId,
      createdById: opts.userId,
      dueAt: p.dueAt,
      vendorPaymentId: p.id,
    });
    await replaceReminders(id, p.dueAt, opts.presets ?? PAYMENT_REMINDERS, []);
    return;
  }

  const patch: Partial<typeof task.$inferInsert> = { title: paymentTaskTitle(p.amount, vendorName) };
  if (opts.assigneeId !== undefined) patch.assigneeId = opts.assigneeId ?? opts.userId;
  const dueMoved = (existing.dueAt?.getTime() ?? null) !== (p.dueAt?.getTime() ?? null);
  if (dueMoved) patch.dueAt = p.dueAt;
  await db.update(task).set(patch).where(eq(task.id, existing.id));
  if (opts.presets) await replaceReminders(existing.id, p.dueAt, opts.presets, []);
  else if (dueMoved) await shiftPresetReminders(existing.id, p.dueAt);

  const isDone = existing.status === "done";
  if (Boolean(p.paidAt) !== isDone) {
    await db
      .update(task)
      .set({ status: p.paidAt ? "done" : "todo", completedAt: p.paidAt ? new Date() : null })
      .where(eq(task.id, existing.id));
  }
}

vendorsRouter.post("/:id/payments", async (c) => {
  const input = parse(PaymentInput, await readJson(c.req.raw));
  const teamId = c.get("team").id;
  const v = await loadVendor(teamId, c.req.param("id"));
  await assertRefsInTeam(teamId, null, input.assigneeId);
  const id = newId();
  await db.insert(vendorPayment).values({
    id,
    organizationId: teamId,
    vendorId: v.id,
    amount: input.amount,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    paidAt: input.paid ? new Date() : null,
    method: input.method ?? null,
    note: input.note ?? null,
    createdById: c.get("user").id,
  });
  const [p] = await db.select().from(vendorPayment).where(eq(vendorPayment.id, id)).limit(1);
  await syncPaymentTask(p!, v.name, { teamId, userId: c.get("user").id, assigneeId: input.assigneeId, presets: input.reminderPresets });
  return c.json({ payment: p }, 201);
});

vendorsRouter.patch("/:id/payments/:paymentId", async (c) => {
  const input = parse(PaymentInput.partial(), await readJson(c.req.raw));
  const teamId = c.get("team").id;
  const v = await loadVendor(teamId, c.req.param("id"));
  await assertRefsInTeam(teamId, null, input.assigneeId);
  const [current] = await db
    .select()
    .from(vendorPayment)
    .where(and(eq(vendorPayment.id, c.req.param("paymentId")), eq(vendorPayment.vendorId, v.id)))
    .limit(1);
  if (!current) throw notFound("Payment not found");

  const patch: Partial<typeof vendorPayment.$inferInsert> = {};
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.paid !== undefined) patch.paidAt = input.paid ? (current.paidAt ?? new Date()) : null;
  if (input.method !== undefined) patch.method = input.method;
  if (input.note !== undefined) patch.note = input.note;
  if (Object.keys(patch).length) await db.update(vendorPayment).set(patch).where(eq(vendorPayment.id, current.id));

  const [p] = await db.select().from(vendorPayment).where(eq(vendorPayment.id, current.id)).limit(1);
  await syncPaymentTask(p!, v.name, { teamId, userId: c.get("user").id, assigneeId: input.assigneeId, presets: input.reminderPresets });
  return c.json({ payment: p });
});

vendorsRouter.delete("/:id/payments/:paymentId", async (c) => {
  const v = await loadVendor(c.get("team").id, c.req.param("id"));
  const paymentId = c.req.param("paymentId");
  const result = await db.delete(vendorPayment).where(and(eq(vendorPayment.id, paymentId), eq(vendorPayment.vendorId, v.id)));
  if (affectedRows(result) === 0) throw notFound("Payment not found");
  await db.delete(task).where(eq(task.vendorPaymentId, paymentId));
  return c.body(null, 204);
});

