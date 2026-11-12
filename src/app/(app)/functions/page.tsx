"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, Link2, MapPin, MessageCircle, Pencil, Plus, Shirt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm";
import { useFunctionMutations, useFunctions, useMembers } from "@/components/tasks/use-tasks";
import { useTeam } from "@/components/team-context";
import { Button, DateField, EmptyState, Input, Label, Select, Sheet, Textarea, TimeField } from "@/components/ui";
import { api, type FunctionInput } from "@/lib/api";
import { cn, formatClock, formatDateKey } from "@/lib/format";
import type { RunItem, WeddingFunction } from "@/lib/types";

const COLORS = ["#b4232c", "#c77c00", "#4c7a3a", "#2f6f8f", "#7a3b8f", "#d0507a", "#8a6c62"];
const SUGGESTED = ["Mehndi", "Haldi", "Sangeet", "Mandap Muhurat", "Hast Melap", "Reception"];

export default function FunctionsPage() {
  const { teamId, team } = useTeam();
  const qc = useQueryClient();
  const { data: functions = [], isLoading } = useFunctions();
  const { create } = useFunctionMutations();
  const [editing, setEditing] = useState<WeddingFunction | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["settings", teamId],
    queryFn: () => api.getSettings(teamId!),
    enabled: Boolean(teamId),
  });
  const { data: members = [] } = useMembers();

  const saveSettings = async (input: Parameters<typeof api.updateSettings>[1]) => {
    try {
      await api.updateSettings(teamId!, input);
      void qc.invalidateQueries({ queryKey: ["settings", teamId] });
      void qc.invalidateQueries({ queryKey: ["dashboard", teamId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Only owners and admins can change this");
    }
  };

  const runSheetUrl = settings && typeof window !== "undefined" ? `${window.location.origin}/r/${settings.runSheetSlug}` : "";
  const missing = SUGGESTED.filter((s) => !functions.some((f) => f.name.toLowerCase() === s.toLowerCase()));

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 md:px-6 md:py-8">
      <h1 className="font-display text-4xl font-semibold leading-none tracking-tight md:text-5xl">Functions</h1>

      {settings && (
        <section className="mt-5 grid gap-3 rounded-[12px] border border-rule-strong bg-raised p-3 sm:grid-cols-2 md:p-4">
          <div>
            <Label htmlFor="couple">Couple</Label>
            <Input
              id="couple"
              defaultValue={settings.coupleNames ?? team?.name ?? ""}
              onBlur={(e) => e.target.value !== (settings.coupleNames ?? "") && void saveSettings({ coupleNames: e.target.value.trim() || null })}
            />
          </div>
          <div>
            <Label htmlFor="wdate">Main day (countdown)</Label>
            <DateField id="wdate" value={settings.weddingDate ?? ""} onChange={(v) => void saveSettings({ weddingDate: v || null })} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-[14px] text-ink">
              <input type="checkbox" checked={settings.runSheetPublic} onChange={(e) => void saveSettings({ runSheetPublic: e.target.checked })} />
              Share a read-only run-sheet with the family
            </label>
            {settings.runSheetPublic && (
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`🪔 Wedding schedule — timings, venues and maps:\n${runSheetUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#1f9d55] px-2.5 text-[13px] font-medium text-white"
                >
                  <MessageCircle className="size-4" /> Share
                </a>
                <Button size="sm" onClick={() => void navigator.clipboard.writeText(runSheetUrl).then(() => toast.success("Link copied"))}>
                  <Copy className="size-4" /> Copy link
                </Button>
                <Link href={`/r/${settings.runSheetSlug}`} target="_blank" className="inline-flex h-8 items-center gap-1 px-2 text-[13px] text-signal hover:underline">
                  <Link2 className="size-4" /> Open
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">Functions · {functions.length}</h2>
        <Button size="sm" variant="signal" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Function
        </Button>
      </div>

      {missing.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {missing.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => create.mutate({ name, color: COLORS[(functions.length + i) % COLORS.length] })}
              className="rounded-full border border-dashed border-rule-strong px-2.5 py-1 text-[12px] text-ink-soft hover:border-signal hover:text-signal"
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="mt-6 font-mono text-xs text-ink-muted">Loading…</p>
      ) : functions.length === 0 ? (
        <EmptyState title="No functions yet" hint="Tap a suggestion above, or add your own. Give each a date, time and venue — then a timeline of who does what." />
      ) : (
        <div className="mt-4 space-y-3">
          {functions.map((f) => (
            <section key={f.id} className="overflow-hidden rounded-[12px] border border-rule-strong bg-raised">
              <div className="flex items-start gap-3 p-3 md:p-4" style={{ boxShadow: `inset 4px 0 0 ${f.color}` }}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(openId === f.id ? null : f.id)}>
                  <h3 className="flex items-center gap-2 font-display text-2xl font-semibold leading-tight text-ink">
                    {f.name}
                    <ChevronDown className={cn("size-4 text-ink-muted transition-transform", openId === f.id && "rotate-180")} />
                  </h3>
                  <p className="text-[13px] text-ink-soft">
                    {f.date ? formatDateKey(f.date) : "Date not set"}
                    {f.startTime ? ` · ${formatClock(f.startTime)}` : ""}
                  </p>
                  {f.venue && (
                    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-muted">
                      <MapPin className="size-3.5" /> {f.venue}
                    </p>
                  )}
                  {f.dressCode && (
                    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-muted">
                      <Shirt className="size-3.5" /> {f.dressCode}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(f)} aria-label="Edit function">
                    <Pencil className="size-4" />
                  </Button>
                  {f.openCount > 0 && (
                    <Link href={`/tasks?functionIds=${f.id}`} className="font-mono text-[11px] text-signal hover:underline">
                      {f.openCount} to-do{f.openCount === 1 ? "" : "s"}
                    </Link>
                  )}
                </div>
              </div>
              {openId === f.id && <RunSheet fn={f} members={members.map((m) => ({ id: m.userId, name: m.user.name }))} />}
            </section>
          ))}
        </div>
      )}

      <FunctionSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function RunSheet({ fn, members }: { fn: WeddingFunction; members: Array<{ id: string; name: string }> }) {
  const { teamId } = useTeam();
  const qc = useQueryClient();
  const key = ["runItems", teamId, fn.id];
  const { data: items = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.listRunItems(teamId!, fn.id),
    enabled: Boolean(teamId),
  });
  const [time, setTime] = useState(fn.startTime ?? "18:00");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [ownerText, setOwnerText] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  const add = async () => {
    if (!title.trim()) return;
    try {
      await api.createRunItem(teamId!, fn.id, {
        time,
        title: title.trim(),
        ownerUserId: owner && owner !== "other" ? owner : null,
        ownerName: owner === "other" ? ownerText.trim() || null : null,
      });
      setTitle("");
      setOwnerText("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add");
    }
  };

  const toggle = (item: RunItem) => void api.updateRunItem(teamId!, fn.id, item.id, { done: !item.done }).then(refresh);
  const remove = (item: RunItem) => void api.deleteRunItem(teamId!, fn.id, item.id).then(refresh);

  return (
    <div className="border-t border-rule bg-paper/50 p-3 md:p-4">
      {fn.notes && <p className="mb-3 whitespace-pre-line text-[13px] text-ink-soft">{fn.notes}</p>}
      {isLoading ? (
        <p className="font-mono text-xs text-ink-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No timeline yet. Add the first moment below — e.g. 6:00 PM · Baraat leaves the house · Mama.</p>
      ) : (
        <ol className="relative ml-2 border-l border-rule-strong">
          {items.map((item) => (
            <li key={item.id} className="group relative flex items-start gap-3 py-1.5 pl-4">
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-label={item.done ? "Mark not done" : "Mark done"}
                className={cn(
                  "absolute -left-[7px] top-2.5 flex size-3.5 items-center justify-center rounded-full border",
                  item.done ? "border-done bg-done text-paper" : "border-marigold bg-raised",
                )}
              >
                {item.done && <Check className="size-2.5" strokeWidth={4} />}
              </button>
              <span className="w-16 shrink-0 pt-px font-mono text-[12px] text-ink-muted">{formatClock(item.time)}</span>
              <div className={cn("min-w-0 flex-1", item.done && "text-ink-muted line-through")}>
                <p className="text-[14px] text-ink">{item.title}</p>
                {(item.ownerUserName || item.ownerName) && <p className="text-[12px] text-ink-muted">{item.ownerUserName ?? item.ownerName}</p>}
              </div>
              <button type="button" onClick={() => remove(item)} className="text-ink-muted opacity-60 hover:text-urgent group-hover:opacity-100" aria-label="Remove">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 grid grid-cols-[7rem_1fr] gap-2">
        <TimeField value={time} onChange={setTime} />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What happens" onKeyDown={(e) => e.key === "Enter" && void add()} />
        <Select
          value={owner}
          onChange={setOwner}
          size="sm"
          wrapperClassName="col-span-2 sm:col-span-1"
          options={[{ value: "", label: "Who (optional)" }, ...members.map((m) => ({ value: m.id, label: m.name })), { value: "other", label: "Someone else…" }]}
        />
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          {owner === "other" && <Input value={ownerText} onChange={(e) => setOwnerText(e.target.value)} placeholder="Mama, Pandit ji…" className="h-9" />}
          <Button size="sm" className="ml-auto h-9" onClick={() => void add()} disabled={!title.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function FunctionSheet({ value, onClose }: { value: WeddingFunction | "new" | null; onClose: () => void }) {
  const { create, update, remove } = useFunctionMutations();
  const confirm = useConfirm();
  const existing = value && value !== "new" ? value : null;
  const [form, setForm] = useState<FunctionInput>({ name: "" });
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = value === "new" ? "new" : (existing?.id ?? null);
  if (key !== openedFor) {
    setOpenedFor(key);
    setForm(
      existing
        ? {
            name: existing.name,
            color: existing.color,
            date: existing.date,
            startTime: existing.startTime,
            venue: existing.venue,
            mapUrl: existing.mapUrl,
            dressCode: existing.dressCode,
            notes: existing.notes,
          }
        : { name: "", color: COLORS[0] },
    );
  }
  if (!value) return null;

  const save = () => {
    const input: FunctionInput = {
      ...form,
      name: form.name.trim(),
      venue: form.venue?.trim() || null,
      mapUrl: form.mapUrl?.trim() || null,
      dressCode: form.dressCode?.trim() || null,
      notes: form.notes?.trim() || null,
    };
    if (existing) update.mutate({ id: existing.id, ...input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? existing.name : "New function"}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!(await confirm({ title: `Delete ${existing.name}?`, body: "Its to-dos stay, moved to General. Its timeline is deleted.", confirmLabel: "Delete", tone: "danger" }))) return;
                remove.mutate(existing.id, { onSuccess: onClose });
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button size="sm" variant="primary" className="ml-auto" disabled={!form.name.trim()} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="f-name">Name</Label>
          <Input id="f-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sangeet" autoFocus />
        </div>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => setForm({ ...form, color: c })}
              className={cn("size-7 rounded-full border-2", form.color === c ? "border-ink" : "border-transparent")}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <Label htmlFor="f-date">Date</Label>
            <DateField id="f-date" value={form.date ?? ""} onChange={(v) => setForm({ ...form, date: v || null })} />
          </div>
          <div className="w-32">
            <Label>Starts</Label>
            <TimeField value={form.startTime ?? "18:00"} onChange={(v) => setForm({ ...form, startTime: v })} />
          </div>
        </div>
        <div>
          <Label htmlFor="f-venue">Venue</Label>
          <Input id="f-venue" value={form.venue ?? ""} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Party plot, wadi, home…" />
        </div>
        <div>
          <Label htmlFor="f-map">Google Maps link</Label>
          <Input
            id="f-map"
            value={form.mapUrl ?? ""}
            onChange={(e) => setForm({ ...form, mapUrl: e.target.value })}
            placeholder="https://www.google.com/maps/place/…"
            inputMode="url"
          />
        </div>
        <div>
          <Label htmlFor="f-dress">Dress code</Label>
          <Input id="f-dress" value={form.dressCode ?? ""} onChange={(e) => setForm({ ...form, dressCode: e.target.value })} placeholder="Yellow / green for haldi" />
        </div>
        <div>
          <Label htmlFor="f-notes">Notes</Label>
          <Textarea id="f-notes" value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
    </Sheet>
  );
}
