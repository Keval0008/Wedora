"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm";
import { useMembers } from "@/components/tasks/use-tasks";
import { useTeam } from "@/components/team-context";
import { Button, DateField, EmptyState, Input, Label, Select, Sheet, Textarea, TimeField } from "@/components/ui";
import { api, type PaymentInput, type VendorInput } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn, combineDateTime, formatWhen, phoneDigits, rupees, toDateInputValue, toTimeInputValue } from "@/lib/format";
import { METHOD_LABEL, PAYMENT_METHODS, VENDOR_CATEGORIES, type PaymentMethod, type Vendor, type VendorPayment } from "@/lib/types";

const categoryLabel = (value: string) => VENDOR_CATEGORIES.find((c) => c.value === value)?.label ?? value;

/** Digits only, so "1,25,000" and "125000" both work. */
const toAmount = (text: string) => Number(text.replace(/[^\d]/g, "") || 0);

export default function VendorsPage() {
  const { teamId } = useTeam();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [paying, setPaying] = useState<{ vendor: Vendor; payment: VendorPayment | null } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["vendors", teamId],
    queryFn: () => api.listVendors(teamId!),
    enabled: Boolean(teamId),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["vendors", teamId] });
    void qc.invalidateQueries({ queryKey: ["tasks", teamId] });
    void qc.invalidateQueries({ queryKey: ["dashboard", teamId] });
  };

  const markPaid = async (v: Vendor, p: VendorPayment, paid: boolean) => {
    try {
      await api.updatePayment(teamId!, v.id, p.id, { paid });
      toast.success(paid ? `${rupees(p.amount)} paid to ${v.name}` : "Marked unpaid");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    }
  };

  const vendors = data?.vendors ?? [];
  const summary = data?.summary;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 md:px-6 md:py-8">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold leading-none tracking-tight md:text-5xl">Vendors</h1>
        <Button size="sm" variant="signal" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Vendor
        </Button>
      </div>

      {summary && vendors.length > 0 && (
        <section className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["Committed", summary.committed, "text-ink"],
            ["Paid", summary.paid, "text-done"],
            ["Balance", summary.balance, "text-signal"],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="rounded-[12px] border border-rule-strong bg-raised px-2 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">{label}</p>
              <p className={cn("mt-1 font-display text-2xl font-semibold leading-none md:text-3xl", tone as string)}>{rupees(value as number)}</p>
            </div>
          ))}
        </section>
      )}

      {isLoading ? (
        <p className="mt-8 font-mono text-xs text-ink-muted">Loading…</p>
      ) : vendors.length === 0 ? (
        <EmptyState
          title="No vendors yet"
          hint="Add the caterer, decorator, DJ, mehndi artist… with their number, the agreed amount and when the next payment is due. You'll get a reminder before each one."
          action={<Button variant="signal" onClick={() => setEditing("new")}>Add a vendor</Button>}
        />
      ) : (
        <div className="mt-6 space-y-3">
          {vendors.map((v) => {
            const digits = phoneDigits(v.phone);
            const pct = v.totalAmount ? Math.min(100, Math.round((v.totals.paid / v.totalAmount) * 100)) : 0;
            return (
              <section key={v.id} className="rounded-[12px] border border-rule-strong bg-raised p-3 md:p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-marigold">{categoryLabel(v.category)}</p>
                    <h2 className="truncate font-display text-2xl font-semibold leading-tight text-ink">{v.name}</h2>
                    {v.contactName && <p className="text-[13px] text-ink-muted">{v.contactName}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {digits && (
                      <>
                        <a href={`tel:+${digits}`} className="inline-flex size-8 items-center justify-center rounded-[8px] border border-rule-strong hover:bg-sunken" aria-label={`Call ${v.name}`}>
                          <Phone className="size-4" />
                        </a>
                        <a
                          href={`https://wa.me/${digits}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex size-8 items-center justify-center rounded-[8px] border border-rule-strong text-[#1f9d55] hover:bg-sunken"
                          aria-label={`WhatsApp ${v.name}`}
                        >
                          <MessageCircle className="size-4" />
                        </a>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(v)} aria-label="Edit vendor">
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-ink-soft">
                      Paid <b className="font-semibold text-done">{rupees(v.totals.paid)}</b> of {rupees(v.totalAmount)}
                    </span>
                    <span className="font-semibold text-signal">{rupees(v.totals.balance)} left</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-done transition-[width]" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {v.payments.length > 0 && (
                  <ul className="mt-3 divide-y divide-rule rounded-[8px] border border-rule">
                    {v.payments.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 px-2.5 py-2 text-[13px]">
                        <button
                          type="button"
                          onClick={() => void markPaid(v, p, !p.paidAt)}
                          className={cn(
                            "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border",
                            p.paidAt ? "border-done bg-done text-paper" : "border-rule-strong bg-raised hover:border-signal",
                          )}
                          aria-label={p.paidAt ? "Mark unpaid" : "Mark paid"}
                        >
                          {p.paidAt && <Check className="size-3" strokeWidth={3} />}
                        </button>
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPaying({ vendor: v, payment: p })}>
                          <span className={cn("font-medium", p.paidAt ? "text-ink-muted" : "text-ink")}>{rupees(p.amount)}</span>
                          <span className="ml-2 text-ink-muted">
                            {p.paidAt
                              ? `paid ${formatWhen(p.paidAt).split(" · ")[0]}${p.method ? ` · ${METHOD_LABEL[p.method]}` : ""}`
                              : p.dueAt
                                ? `due ${formatWhen(p.dueAt)}`
                                : "no date yet"}
                          </span>
                          {p.note && <span className="block truncate text-[12px] text-ink-muted">{p.note}</span>}
                        </button>
                        {!p.paidAt && p.taskId && <BellRing className="size-3.5 shrink-0 text-marigold" aria-label="Reminder set" />}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setPaying({ vendor: v, payment: null })}>
                    <Plus className="size-4" /> Payment
                  </Button>
                  {v.totals.unscheduled > 0 && v.payments.length > 0 && (
                    <span className="self-center text-[12px] text-ink-muted">{rupees(v.totals.unscheduled)} not scheduled yet</span>
                  )}
                </div>
                {v.notes && <p className="mt-2 whitespace-pre-line text-[13px] text-ink-soft">{v.notes}</p>}
              </section>
            );
          })}
        </div>
      )}

      <VendorSheet
        vendor={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
        onDelete={async (v) => {
          if (!(await confirm({ title: `Delete ${v.name}?`, body: "Its payments and their reminders go too.", confirmLabel: "Delete", tone: "danger" }))) return;
          try {
            await api.deleteVendor(teamId!, v.id);
            setEditing(null);
            refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Only owners and admins can delete vendors");
          }
        }}
      />
      <PaymentSheet state={paying} onClose={() => setPaying(null)} onSaved={refresh} />
    </div>
  );
}

function VendorSheet({
  vendor,
  onClose,
  onSaved,
  onDelete,
}: {
  vendor: Vendor | "new" | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (v: Vendor) => void;
}) {
  const { teamId } = useTeam();
  const existing = vendor && vendor !== "new" ? vendor : null;
  const [form, setForm] = useState<VendorInput & { amountText: string }>({ name: "", category: "caterer", amountText: "" });
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  const key = vendor === "new" ? "new" : (existing?.id ?? null);
  if (key !== openedFor) {
    setOpenedFor(key);
    setForm(
      existing
        ? {
            name: existing.name,
            category: existing.category,
            contactName: existing.contactName,
            phone: existing.phone,
            notes: existing.notes,
            amountText: existing.totalAmount ? String(existing.totalAmount) : "",
          }
        : { name: "", category: "caterer", amountText: "" },
    );
  }
  if (!vendor) return null;

  const save = async () => {
    const input: VendorInput = {
      name: form.name.trim(),
      category: form.category,
      contactName: form.contactName?.trim() || null,
      phone: form.phone?.trim() || null,
      notes: form.notes?.trim() || null,
      totalAmount: toAmount(form.amountText),
    };
    try {
      if (existing) await api.updateVendor(teamId!, existing.id, input);
      else await api.createVendor(teamId!, input);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? "Edit vendor" : "New vendor"}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button size="sm" variant="danger" onClick={() => onDelete(existing)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button size="sm" variant="primary" className="ml-auto" disabled={!form.name.trim()} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="v-name">Name</Label>
          <Input id="v-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Shree Caterers" autoFocus />
        </div>
        <div>
          <Label htmlFor="v-cat">Category</Label>
          <Select id="v-cat" value={form.category ?? "other"} onChange={(v) => setForm({ ...form, category: v })} options={VENDOR_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="v-contact">Contact person</Label>
            <Input id="v-contact" value={form.contactName ?? ""} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="v-phone">Phone</Label>
            <Input id="v-phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="98250 12345" />
          </div>
        </div>
        <div>
          <Label htmlFor="v-total">Agreed total (₹)</Label>
          <Input id="v-total" value={form.amountText} onChange={(e) => setForm({ ...form, amountText: e.target.value })} inputMode="numeric" placeholder="1,25,000" />
        </div>
        <div>
          <Label htmlFor="v-notes">Notes</Label>
          <Textarea id="v-notes" value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Menu, plates count, what's included…" />
        </div>
      </div>
    </Sheet>
  );
}

function PaymentSheet({
  state,
  onClose,
  onSaved,
}: {
  state: { vendor: Vendor; payment: VendorPayment | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { teamId } = useTeam();
  const { data: session } = useSession();
  const { data: members = [] } = useMembers();
  const confirm = useConfirm();
  const [amountText, setAmountText] = useState("");
  const [paid, setPaid] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("10:00");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  const key = state ? (state.payment?.id ?? `new-${state.vendor.id}`) : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    const p = state?.payment;
    setAmountText(p ? String(p.amount) : state ? String(state.vendor.totals.unscheduled || "") : "");
    setPaid(Boolean(p?.paidAt));
    setDueDate(p?.dueAt ? toDateInputValue(p.dueAt) : "");
    setDueTime(p?.dueAt ? toTimeInputValue(p.dueAt) : "10:00");
    setMethod(p?.method ?? "");
    setNote(p?.note ?? "");
    setAssigneeId(p?.assigneeId ?? "");
  }
  if (!state) return null;
  const { vendor, payment } = state;

  const save = async () => {
    const input: PaymentInput = {
      amount: toAmount(amountText),
      paid,
      dueAt: paid ? (payment?.dueAt ?? null) : combineDateTime(dueDate, dueTime),
      method: method || null,
      note: note.trim() || null,
      assigneeId: assigneeId || null,
    };
    try {
      if (payment) await api.updatePayment(teamId!, vendor.id, payment.id, input);
      else await api.addPayment(teamId!, vendor.id, input);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${payment ? "Payment" : "New payment"} · ${vendor.name}`}
      footer={
        <div className="flex gap-2">
          {payment && (
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!(await confirm({ title: "Delete this payment?", confirmLabel: "Delete", tone: "danger" }))) return;
                await api.deletePayment(teamId!, vendor.id, payment.id);
                onSaved();
                onClose();
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button size="sm" variant="primary" className="ml-auto" disabled={!toAmount(amountText)} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="p-amount">Amount (₹)</Label>
          <Input id="p-amount" value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="numeric" autoFocus />
        </div>
        <div className="flex gap-2">
          {[
            [false, "Due later"],
            [true, "Already paid"],
          ].map(([value, label]) => (
            <Button key={String(value)} size="sm" variant={paid === value ? "primary" : "outline"} onClick={() => setPaid(value as boolean)}>
              {label as string}
            </Button>
          ))}
        </div>
        {!paid && (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <Label htmlFor="p-due">Due on</Label>
                <DateField id="p-due" value={dueDate} onChange={setDueDate} placeholder="No date yet" />
              </div>
              <div className={cn("w-32", !dueDate && "pointer-events-none opacity-40")}>
                <Label>Time</Label>
                <TimeField value={dueTime} onChange={setDueTime} />
              </div>
            </div>
            {dueDate && (
              <div>
                <Label htmlFor="p-who">Remind</Label>
                <Select
                  id="p-who"
                  value={assigneeId}
                  onChange={setAssigneeId}
                  options={[
                    { value: "", label: session?.user.name ? `${session.user.name} (you)` : "Me" },
                    ...members.filter((m) => m.userId !== session?.user.id).map((m) => ({ value: m.userId, label: m.user.name })),
                  ]}
                />
                <p className="mt-1.5 text-[12px] text-ink-muted">A to-do is made with reminders a day before and at 8 AM that day.</p>
              </div>
            )}
          </>
        )}
        <div>
          <Label htmlFor="p-method">How</Label>
          <Select
            id="p-method"
            value={method}
            onChange={(v) => setMethod(v as PaymentMethod | "")}
            options={[{ value: "", label: "—" }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))]}
          />
        </div>
        <div>
          <Label htmlFor="p-note">Note</Label>
          <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Advance, balance after the event…" />
        </div>
      </div>
    </Sheet>
  );
}
