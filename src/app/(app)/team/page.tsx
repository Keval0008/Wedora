"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageCircle, RefreshCw, ShieldCheck, UserMinus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm";
import { useTeam } from "@/components/team-context";
import { useMembers } from "@/components/tasks/use-tasks";
import { Avatar, Button, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import type { TeamMember } from "@/lib/types";

/** "K7QP4M2X" -> "K7QP-4M2X": easier to read aloud. */
function formatCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function timeAgo(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export default function TeamPage() {
  const { team, teamId } = useTeam();
  const { data: session } = useSession();
  const { data: members = [], isLoading } = useMembers();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);

  const myId = session?.user.id;
  const myRole = members.find((m) => m.userId === myId)?.role ?? "member";
  const canManage = myRole === "owner" || myRole === "admin";

  const { data: code } = useQuery({
    queryKey: ["team-code", teamId],
    queryFn: () => api.getTeamCode(teamId!),
    enabled: Boolean(teamId) && canManage,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["join-requests", teamId],
    queryFn: () => api.listJoinRequests(teamId!),
    enabled: Boolean(teamId) && canManage,
    refetchInterval: 15_000,
  });

  const canRemove = (m: TeamMember) =>
    canManage &&
    m.userId !== myId &&
    m.role !== "owner" &&
    !(m.role === "admin" && myRole !== "owner");

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(formatCode(code));
      toast.success("Family code copied");
    } catch {
      toast.error("Couldn't copy — select the code instead");
    }
  };

  const rotate = async () => {
    if (!teamId) return;
    const ok = await confirm({
      title: "Issue a new family code?",
      body: "The current code stops working straight away. Requests already sent are kept.",
      confirmLabel: "New code",
    });
    if (!ok) return;
    try {
      const next = await api.rotateTeamCode(teamId);
      qc.setQueryData(["team-code", teamId], next);
      toast.success("New code ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue a new code");
    }
  };

  const decide = async (id: string, accept: boolean, name: string) => {
    if (!teamId) return;
    setBusyId(id);
    try {
      if (accept) await api.acceptJoinRequest(teamId, id);
      else await api.rejectJoinRequest(teamId, id);
      toast.success(accept ? `${name} joined the wedding` : `Declined ${name}`);
      void qc.invalidateQueries({ queryKey: ["join-requests", teamId] });
      if (accept) void qc.invalidateQueries({ queryKey: ["members", teamId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (m: TeamMember) => {
    if (!teamId) return;
    const ok = await confirm({
      title: `Remove ${m.user.name}?`,
      body: "They lose access to this wedding straight away. Tasks assigned to them stay.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.removeMember(teamId, m.userId);
      toast(`${m.user.name} removed`);
      void qc.invalidateQueries({ queryKey: ["members", teamId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove them");
    }
  };

  const setRole = async (m: TeamMember, role: "admin" | "member") => {
    try {
      await api.setMemberRole(teamId!, m.userId, role);
      toast.success(role === "admin" ? `${m.user.name} is now an admin` : `${m.user.name} is now a member`);
      void qc.invalidateQueries({ queryKey: ["members", teamId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the role");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 md:px-6 md:py-8">
      <h1 className="font-display text-3xl leading-none tracking-tight md:text-4xl">
        {team?.name ?? "Family"}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Everyone here sees the wedding&apos;s to-dos, songs and vendors, and gets their own reminders.
        Owners and admins also see the full chandla register.
      </p>

      {canManage ? (
        <>
          {/* ------------------------------------------------------ team code */}
          <section className="mt-6 rounded-[10px] border border-rule-strong bg-raised p-3 md:p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
              Family code
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="select-all font-mono text-3xl tracking-[0.18em] text-ink md:text-4xl">
                {code ? formatCode(code) : "····-····"}
              </p>
              <div className="ml-auto flex gap-2">
                <Button size="sm" onClick={copyCode} disabled={!code}>
                  <Copy className="size-4" />
                  Copy
                </Button>
                <a
                  className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-rule-strong bg-raised px-2.5 text-[13px] font-medium text-ink hover:bg-sunken"
                  href={code ? `https://wa.me/?text=${encodeURIComponent(`Join our wedding planner on Wedora 💐
1. Open ${typeof window === "undefined" ? "" : window.location.origin}/signup
2. Choose "Join with a code" and type ${formatCode(code)}`)}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" />
                  WhatsApp
                </a>
                <Button size="sm" variant="ghost" onClick={rotate} disabled={!code}>
                  <RefreshCw className="size-4" />
                  New code
                </Button>
              </div>
            </div>
            <p className="mt-2 text-[13px] text-ink-muted">
              Send this to family who are helping. They enter it after signing up, and their
              request shows up below for you to accept.
            </p>
          </section>

          {/* ------------------------------------------------- join requests */}
          <section className="mt-6 overflow-hidden rounded-[10px] border border-rule-strong bg-raised">
            <p className="border-b border-rule bg-sunken/60 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted md:px-4">
              Join requests · {requests.length}
            </p>
            {requests.length === 0 ? (
              <p className="px-3 py-4 text-sm text-ink-muted md:px-4">No one is waiting.</p>
            ) : (
              requests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 border-b border-rule px-3 py-3 last:border-b-0 md:px-4"
                >
                  <Avatar name={r.user.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-ink">{r.user.name}</p>
                    <p className="truncate font-mono text-[12px] text-ink-muted">
                      {r.user.username ? `@${r.user.username} · ` : ""}
                      {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide(r.id, false, r.user.name)}
                      disabled={busyId === r.id}
                    >
                      <X className="size-4" />
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => decide(r.id, true, r.user.name)}
                      disabled={busyId === r.id}
                    >
                      <Check className="size-4" />
                      Accept
                    </Button>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      ) : (
        <p className="mt-6 rounded-[10px] border border-rule bg-sunken px-3 py-2.5 text-[13px] text-ink-muted">
          To bring someone in, ask the wedding&apos;s owner for the family code.
        </p>
      )}

      {/* ------------------------------------------------------------ members */}
      <section className="mt-6 overflow-hidden rounded-[10px] border border-rule-strong bg-raised">
        <p className="border-b border-rule bg-sunken/60 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted md:px-4">
          Members · {members.length}
        </p>
        {isLoading ? (
          <p className="p-4 font-mono text-xs text-ink-muted">Loading…</p>
        ) : members.length === 0 ? (
          <EmptyState title="No members" />
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 border-b border-rule px-3 py-3 last:border-b-0 md:px-4"
            >
              <Avatar name={m.user.name} image={m.user.image} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-ink">
                  {m.user.name}
                  {m.userId === myId && (
                    <span className="ml-2 font-mono text-[11px] text-ink-muted">you</span>
                  )}
                </p>
                {m.user.username && (
                  <p className="truncate font-mono text-[12px] text-ink-muted">@{m.user.username}</p>
                )}
              </div>
              <span className="rounded-full border border-rule-strong px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                {m.role}
              </span>
              {myRole === "owner" && m.role !== "owner" && m.userId !== myId && (
                <Button
                  variant="ghost"
                  size="sm"
                  title={m.role === "admin" ? "Make a regular member" : "Make an admin (sees the chandla register)"}
                  onClick={() => void setRole(m, m.role === "admin" ? "member" : "admin")}
                  aria-label={m.role === "admin" ? `Make ${m.user.name} a member` : `Make ${m.user.name} an admin`}
                >
                  <ShieldCheck className={m.role === "admin" ? "size-4 text-signal" : "size-4"} />
                </Button>
              )}
              {canRemove(m) && (
                <Button variant="ghost" size="sm" onClick={() => remove(m)} aria-label={`Remove ${m.user.name}`}>
                  <UserMinus className="size-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
