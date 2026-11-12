"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, CalendarHeart, ChevronRight, IndianRupee, MapPin, Music } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { useTaskMutations } from "@/components/tasks/use-tasks";
import { useTeam } from "@/components/team-context";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { daysUntil, formatClock, formatDateKey, formatWhen, rupees } from "@/lib/format";
import type { Task } from "@/lib/types";

function Countdown({ date, couple }: { date: string | null; couple: string | null }) {
  const days = daysUntil(date);
  return (
    <section className="relative overflow-hidden rounded-[16px] border border-rule-strong bg-raised px-4 pb-5 pt-7 text-center">
      <div className="toran absolute inset-x-0 top-0" aria-hidden />
      {couple && <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-marigold">{couple}</p>}
      {days === null ? (
        <p className="mt-2 font-display text-3xl font-semibold text-ink">Set the wedding date in Functions</p>
      ) : days > 0 ? (
        <>
          <p className="mt-1 font-display text-7xl font-semibold leading-none tracking-tight text-signal">{days}</p>
          <p className="mt-1 font-display text-2xl italic text-ink-soft">{days === 1 ? "day to go" : "days to go"}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">{formatDateKey(date, true)}</p>
        </>
      ) : days === 0 ? (
        <p className="mt-2 font-display text-5xl font-semibold text-signal">Shubh Vivah! 🎉</p>
      ) : (
        <p className="mt-2 font-display text-3xl font-semibold text-ink">Married {Math.abs(days)} days ago 💛</p>
      )}
    </section>
  );
}

export default function TodayPage() {
  const { teamId } = useTeam();
  const { data: session } = useSession();
  const [open, setOpen] = useState<Task | null>(null);
  const { toggle } = useTaskMutations();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", teamId],
    queryFn: () => api.dashboard(teamId!),
    enabled: Boolean(teamId),
    refetchInterval: 60_000,
  });

  const firstName = session?.user.name.split(" ")[0] ?? "";

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 md:px-6 md:py-8">
      <p className="mb-3 font-display text-3xl font-semibold leading-none tracking-tight md:text-4xl">
        Namaste{firstName ? `, ${firstName}` : ""}
      </p>
      <Countdown date={data?.settings.weddingDate ?? null} couple={data?.settings.coupleNames ?? null} />

      <div className="-mx-3 mt-5 md:mx-0 md:overflow-hidden md:rounded-[12px] md:border md:border-rule-strong">
        <QuickAdd />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
          <span>Today &amp; overdue · yours</span>
          <Link href="/tasks?scope=mine" className="text-signal hover:underline">
            all mine
          </Link>
        </h2>
        <div className="overflow-hidden rounded-[12px] border border-rule-strong bg-raised">
          {isLoading ? (
            <p className="p-4 font-mono text-xs text-ink-muted">Loading…</p>
          ) : !data?.today.length ? (
            <p className="p-4 text-sm text-ink-muted">Nothing due today. 🌼</p>
          ) : (
            data.today.map((t, i) => <TaskRow key={t.id} task={t} index={i} onToggle={(x) => toggle.mutate(x)} onOpen={setOpen} />)
          )}
        </div>
      </section>

      {data && data.upcoming.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">This week</h2>
          <div className="overflow-hidden rounded-[12px] border border-rule-strong bg-raised">
            {data.upcoming.map((t, i) => (
              <TaskRow key={t.id} task={t} index={i} onToggle={(x) => toggle.mutate(x)} onOpen={setOpen} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {data && data.reminders.length > 0 && (
          <Card title="Next reminders" icon={<BellRing className="size-4 text-marigold" />} href="/account" linkLabel="alerts">
            {data.reminders.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 text-[13px]">
                <span className="truncate text-ink">{r.title}</span>
                <span className="shrink-0 font-mono text-[12px] text-ink-muted">{formatWhen(r.remindAt)}</span>
              </li>
            ))}
          </Card>
        )}

        {data && data.payments.length > 0 && (
          <Card title="Payments due" icon={<IndianRupee className="size-4 text-signal" />} href="/vendors" linkLabel="vendors">
            {data.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 text-[13px]">
                <span className="truncate text-ink">
                  {rupees(p.amount)} · {p.vendorName}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-ink-muted">{p.dueAt ? formatWhen(p.dueAt) : ""}</span>
              </li>
            ))}
          </Card>
        )}

        {data && data.functions.length > 0 && (
          <Card title="Coming up" icon={<CalendarHeart className="size-4 text-signal" />} href="/functions" linkLabel="run-sheet">
            {data.functions.map((f) => (
              <li key={f.id} className="text-[13px]">
                <span className="flex items-center gap-2 text-ink">
                  <span className="size-2 rounded-full" style={{ background: f.color }} aria-hidden />
                  {f.name}
                  <span className="ml-auto font-mono text-[12px] text-ink-muted">
                    {formatDateKey(f.date)} {formatClock(f.startTime)}
                  </span>
                </span>
                {f.venue && (
                  <span className="mt-0.5 flex items-center gap-1 pl-4 text-[12px] text-ink-muted">
                    <MapPin className="size-3" />
                    {f.mapUrl ? (
                      <a href={f.mapUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {f.venue}
                      </a>
                    ) : (
                      f.venue
                    )}
                  </span>
                )}
              </li>
            ))}
          </Card>
        )}

        {data && data.songs.length > 0 && (
          <Card title="Songs" icon={<Music className="size-4 text-marigold" />} href="/songs" linkLabel="lists">
            {data.songs.map((s) => (
              <li key={s.id} className="flex justify-between text-[13px]">
                <span className="text-ink">{s.title}</span>
                <span className="font-mono text-[12px] text-ink-muted">
                  {s.count} {s.kind === "sangeet" ? (s.count === 1 ? "act" : "acts") : s.count === 1 ? "song" : "songs"}
                </span>
              </li>
            ))}
          </Card>
        )}
      </div>

      <TaskSheet task={open} currentUserId={session?.user.id ?? ""} onClose={() => setOpen(null)} />
    </div>
  );
}

function Card({
  title,
  icon,
  href,
  linkLabel,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-rule-strong bg-raised p-3">
      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink">
        {icon}
        {title}
        <Link href={href} className="ml-auto inline-flex items-center font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-signal hover:underline">
          {linkLabel}
          <ChevronRight className="size-3" />
        </Link>
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}
