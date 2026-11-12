"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, Download, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm";
import { useFunctions } from "@/components/tasks/use-tasks";
import { useTeam } from "@/components/team-context";
import { Button, Chip, Input, Label, Select } from "@/components/ui";
import { ApiError, api, type GiftInput } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn, rupees } from "@/lib/format";
import { GIFT_KIND_LABEL, GIFT_KINDS, type GiftKind, type GiftSide } from "@/lib/types";

/* ------------------------------------------------------------ offline outbox */

type Pending = GiftInput & { clientId: string };
const outboxKey = (teamId: string) => `wedora.giftOutbox.${teamId}`;

function readOutbox(teamId: string): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(outboxKey(teamId)) ?? "[]") as Pending[];
  } catch {
    return [];
  }
}

function writeOutbox(teamId: string, items: Pending[]) {
  try {
    localStorage.setItem(outboxKey(teamId), JSON.stringify(items));
  } catch {
    // Storage full or blocked: the entry stays in memory until the page closes.
  }
}

const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Entries made with no signal wait on this phone and go up when it's back.
 * Each carries a client id, so a retry never saves the same entry twice.
 */
function useOutbox(teamId: string | null, onSynced: () => void) {
  const [pending, setPending] = useState<Pending[]>([]);
  const syncing = useRef(false);

  useEffect(() => {
    if (teamId) setPending(readOutbox(teamId));
  }, [teamId]);

  const flush = useCallback(async () => {
    if (!teamId || syncing.current) return;
    const items = readOutbox(teamId);
    if (!items.length) return;
    syncing.current = true;
    const left: Pending[] = [];
    for (const item of items) {
      try {
        await api.addGift(teamId, item);
      } catch (e) {
        // Rejected by the server (not a network problem): drop it rather than retry forever.
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          toast.error(`Couldn't save ${item.giverName}: ${e.message}`);
          continue;
        }
        left.push(item);
      }
    }
    writeOutbox(teamId, left);
    setPending(left);
    syncing.current = false;
    if (left.length < items.length) onSynced();
  }, [teamId, onSynced]);

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => void flush(), 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [flush]);

  const enqueue = (item: Pending) => {
    if (!teamId) return;
    const next = [...readOutbox(teamId), item];
    writeOutbox(teamId, next);
    setPending(next);
  };

  return { pending, enqueue, flush };
}

/* ------------------------------------------------------------------- page */

export default function GiftsPage() {
  const { teamId } = useTeam();
  const { data: session } = useSession();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: functions = [] } = useFunctions();

  const [q, setQ] = useState("");
  const [filterFn, setFilterFn] = useState("");
  const [filterSide, setFilterSide] = useState("");

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["gifts", teamId] });
    void qc.invalidateQueries({ queryKey: ["gift-summary", teamId] });
  }, [qc, teamId]);
  const outbox = useOutbox(teamId, refresh);

  const { data } = useQuery({
    queryKey: ["gifts", teamId, q, filterFn, filterSide],
    queryFn: () => api.listGifts(teamId!, { q, functionId: filterFn, side: filterSide }),
    enabled: Boolean(teamId),
    placeholderData: (prev) => prev,
  });
  const canSeeAll = data?.canSeeAll ?? false;
  const { data: summary } = useQuery({
    queryKey: ["gift-summary", teamId],
    queryFn: () => api.giftSummary(teamId!),
    enabled: Boolean(teamId) && canSeeAll,
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 md:px-6 md:py-8">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold leading-none tracking-tight md:text-5xl">Chandla</h1>
        {canSeeAll && (
          <a
            href={`/api/gifts/export.csv?teamId=${teamId}`}
            className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-rule-strong bg-raised px-2.5 text-[13px] font-medium hover:bg-sunken"
          >
            <Download className="size-4" /> Excel / CSV
          </a>
        )}
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        {canSeeAll ? "Everyone at the desk writes here. You see every entry and the totals." : "Entries you write are saved for the family. You see only your own."}
      </p>

      <EntryForm
        functions={functions.map((f) => ({ id: f.id, name: f.name, date: f.date }))}
        onSaved={refresh}
        onOffline={outbox.enqueue}
      />

      {outbox.pending.length > 0 && (
        <button
          type="button"
          onClick={() => void outbox.flush()}
          className="mt-3 flex w-full items-center gap-2 rounded-[10px] border border-marigold/50 bg-marigold-soft px-3 py-2 text-left text-[13px] text-ink"
        >
          <CloudOff className="size-4 text-marigold" />
          {outbox.pending.length} entr{outbox.pending.length === 1 ? "y" : "ies"} saved on this phone — will upload when online. Tap to retry.
        </button>
      )}

      {canSeeAll && summary && summary.total.entries > 0 && (
        <section className="mt-6 rounded-[12px] border border-rule-strong bg-raised p-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">Cash total</p>
              <p className="font-display text-3xl font-semibold text-signal">{rupees(summary.total.cash)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">Entries</p>
              <p className="font-display text-3xl font-semibold text-ink">{summary.total.entries}</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1 border-t border-rule pt-2 text-[13px]">
            {summary.byFunction.map((r) => (
              <li key={r.functionId ?? "none"} className="flex justify-between">
                <span className="text-ink-soft">{r.functionName ?? "No function"}</span>
                <span className="font-mono text-ink">
                  {rupees(r.cash)} · {r.entries}
                </span>
              </li>
            ))}
            {summary.bySide
              .filter((s) => s.side)
              .map((s) => (
                <li key={s.side} className="flex justify-between text-ink-muted">
                  <span>{s.side === "groom" ? "Groom's side" : "Bride's side"}</span>
                  <span className="font-mono">
                    {rupees(s.cash)} · {s.entries}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, relation" className="pl-9" />
          </div>
          <Select
            value={filterFn}
            onChange={setFilterFn}
            size="sm"
            wrapperClassName="min-w-0 flex-1 sm:w-36 sm:flex-none"
            options={[{ value: "", label: "All functions" }, ...functions.map((f) => ({ value: f.id, label: f.name }))]}
          />
          <Select
            value={filterSide}
            onChange={setFilterSide}
            size="sm"
            wrapperClassName="min-w-0 flex-1 sm:w-32 sm:flex-none"
            options={[
              { value: "", label: "Both sides" },
              { value: "groom", label: "Groom's" },
              { value: "bride", label: "Bride's" },
            ]}
          />
        </div>
        <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-[12px] border border-rule-strong bg-raised">
          {(data?.gifts ?? []).length === 0 && <li className="p-4 text-sm text-ink-muted">No entries yet.</li>}
          {(data?.gifts ?? []).map((g) => (
            <li key={g.id} className="group flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-ink">{g.giverName}</p>
                <p className="truncate text-[12px] text-ink-muted">
                  {[g.relation, g.city, g.functionName, g.side === "groom" ? "groom's side" : g.side === "bride" ? "bride's side" : null, g.description]
                    .filter(Boolean)
                    .join(" · ")}
                  {canSeeAll && g.recordedById !== session?.user.id && g.recordedByName ? ` · by ${g.recordedByName}` : ""}
                </p>
              </div>
              <span className={cn("shrink-0 font-mono text-[14px]", g.kind === "cash" ? "text-ink" : "text-marigold")}>
                {g.amount ? rupees(g.amount) : GIFT_KIND_LABEL[g.kind]}
                {g.kind !== "cash" && g.amount ? ` ${GIFT_KIND_LABEL[g.kind].toLowerCase()}` : ""}
              </span>
              <button
                type="button"
                aria-label="Delete entry"
                className="text-ink-muted opacity-50 hover:text-urgent group-hover:opacity-100"
                onClick={async () => {
                  if (!(await confirm({ title: `Delete ${g.giverName}'s entry?`, confirmLabel: "Delete", tone: "danger" }))) return;
                  try {
                    await api.deleteGift(teamId!, g.id);
                    refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not delete");
                  }
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- entry form */

const LAST_FN_KEY = "wedora.giftFunction";
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function EntryForm({
  functions,
  onSaved,
  onOffline,
}: {
  functions: Array<{ id: string; name: string; date: string | null }>;
  onSaved: () => void;
  onOffline: (item: Pending) => void;
}) {
  const { teamId } = useTeam();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<GiftKind>("cash");
  const [side, setSide] = useState<GiftSide | "">("");
  const [city, setCity] = useState("");
  const [relation, setRelation] = useState("");
  const [description, setDescription] = useState("");
  const [functionId, setFunctionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Default to today's function, else the last one used at this desk.
  useEffect(() => {
    if (functionId || !functions.length) return;
    const today = functions.find((f) => f.date === todayKey());
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_FN_KEY);
    } catch {
      last = null;
    }
    setFunctionId(today?.id ?? (functions.some((f) => f.id === last) ? last! : ""));
  }, [functions, functionId]);

  const { data: names = [] } = useQuery({
    queryKey: ["gift-names", teamId, name.trim().toLowerCase()],
    queryFn: () => api.giftNames(teamId!, name.trim()),
    enabled: Boolean(teamId) && name.trim().length >= 2 && suggestOpen,
    staleTime: 60_000,
  });
  const suggestions = useMemo(() => names.filter((n) => n.giverName.toLowerCase() !== name.trim().toLowerCase()), [names, name]);

  const amountNumber = Number(amount.replace(/[^\d]/g, "") || 0);
  const canSave = name.trim() && (kind !== "cash" || amountNumber > 0) && !busy;

  const save = async () => {
    if (!canSave || !teamId) return;
    const item: Pending = {
      clientId: newClientId(),
      giverName: name.trim(),
      amount: amountNumber || null,
      kind,
      side: side || null,
      city: city.trim() || null,
      relation: relation.trim() || null,
      description: description.trim() || null,
      functionId: functionId || null,
    };
    try {
      localStorage.setItem(LAST_FN_KEY, functionId);
    } catch {
      // ignore
    }
    setBusy(true);
    try {
      await api.addGift(teamId, item);
      toast.success(`${item.giverName} · ${item.amount ? rupees(item.amount) : GIFT_KIND_LABEL[kind]}`);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
        setBusy(false);
        return;
      }
      onOffline(item);
      toast("No signal — saved on this phone, will upload later");
    }
    setBusy(false);
    setName("");
    setAmount("");
    setCity("");
    setRelation("");
    setDescription("");
    setKind("cash");
    nameRef.current?.focus();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="mt-5 space-y-3 rounded-[14px] border border-rule-strong bg-raised p-3 md:p-4"
    >
      <div className="relative">
        <Label htmlFor="g-name">Name</Label>
        <Input
          id="g-name"
          ref={nameRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSuggestOpen(true);
          }}
          onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
          placeholder="Rameshbhai Patel"
          autoComplete="off"
          className="h-12 text-[17px]"
        />
        {suggestOpen && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-[10px] border border-rule-strong bg-raised shadow-[var(--shadow-sheet)]">
            {suggestions.map((s) => (
              <li key={`${s.giverName}-${s.city}`}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-2 px-3 py-2 text-left text-[14px] hover:bg-sunken"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setName(s.giverName);
                    setCity(s.city ?? "");
                    setRelation(s.relation ?? "");
                    if (s.side) setSide(s.side);
                    setSuggestOpen(false);
                  }}
                >
                  <span className="text-ink">{s.giverName}</span>
                  <span className="text-[12px] text-ink-muted">{[s.relation, s.city].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {GIFT_KINDS.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
            {GIFT_KIND_LABEL[k]}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="g-amount">{kind === "cash" ? "Amount ₹" : "Value ₹ (optional)"}</Label>
          <Input id="g-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="1100" className="h-12 font-mono text-[18px]" />
        </div>
        <div>
          <Label>Function</Label>
          <Select value={functionId} onChange={setFunctionId} options={[{ value: "", label: "—" }, ...functions.map((f) => ({ value: f.id, label: f.name }))]} />
        </div>
      </div>

      {kind !== "cash" && (
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it? (saree, ring, dinner set…)" />
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Relation (mama, friend…)" />
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City / village" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={side === "groom"} onClick={() => setSide(side === "groom" ? "" : "groom")}>
          Groom&apos;s side
        </Chip>
        <Chip active={side === "bride"} onClick={() => setSide(side === "bride" ? "" : "bride")}>
          Bride&apos;s side
        </Chip>
        <Button type="submit" variant="signal" className="ml-auto h-11 px-6" disabled={!canSave}>
          Save
        </Button>
      </div>
    </form>
  );
}
