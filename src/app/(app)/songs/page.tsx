"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleAlert, Lock, Plus, Unlock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ShareButtons } from "@/components/songs/share-panel";
import { useTeam } from "@/components/team-context";
import { Button, EmptyState, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { LIST_KIND_LABEL, type SongListKind } from "@/lib/types";
import { useState } from "react";

export default function SongsPage() {
  const { teamId } = useTeam();
  const qc = useQueryClient();
  const [kind, setKind] = useState<SongListKind>("other");

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["song-lists", teamId],
    queryFn: () => api.listSongLists(teamId!),
    enabled: Boolean(teamId),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings", teamId],
    queryFn: () => api.getSettings(teamId!),
    enabled: Boolean(teamId),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["song-lists", teamId] });
  const create = useMutation({
    mutationFn: (k: SongListKind) => api.createSongList(teamId!, { kind: k }),
    onSuccess: () => {
      invalidate();
      toast.success("List created — share its link");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleOpen = useMutation({
    mutationFn: ({ id, isOpen }: { id: string; isOpen: boolean }) => api.updateSongList(teamId!, id, { isOpen }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 md:px-6 md:py-8">
      <h1 className="font-display text-4xl font-semibold leading-none tracking-tight md:text-5xl">Songs</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Share a list&apos;s link with friends. They paste Spotify or YouTube Music links; the same song from either app becomes one entry.
      </p>

      {isLoading ? (
        <p className="mt-8 font-mono text-xs text-ink-muted">Loading…</p>
      ) : lists.length === 0 ? (
        <EmptyState
          title="No song lists yet"
          hint="Start with the two that matter: baraat and sangeet."
          action={
            <div className="flex gap-2">
              <Button variant="signal" onClick={() => create.mutate("baraat")}>Baraat list</Button>
              <Button onClick={() => create.mutate("sangeet")}>Sangeet list</Button>
            </div>
          }
        />
      ) : (
        <div className="mt-6 space-y-4">
          {lists.map((list) => (
            <section key={list.id} className="rounded-[12px] border border-rule-strong bg-raised p-3 md:p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-marigold">{LIST_KIND_LABEL[list.kind]}</p>
                  <Link href={`/songs/${list.id}`} className="group mt-0.5 flex items-center gap-1">
                    <h2 className="truncate font-display text-2xl font-semibold leading-tight text-ink group-hover:text-signal">{list.title}</h2>
                    <ChevronRight className="size-5 text-ink-muted" />
                  </Link>
                  <p className="mt-0.5 text-[13px] text-ink-muted">
                    {list.songCount ?? 0} {list.kind === "sangeet" ? (list.songCount === 1 ? "performance" : "performances") : list.songCount === 1 ? "song" : "songs"}
                    {!list.isOpen && " · closed to guests"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleOpen.mutate({ id: list.id, isOpen: !list.isOpen })}
                  title={list.isOpen ? "Stop taking suggestions" : "Open for suggestions again"}
                >
                  {list.isOpen ? <Unlock className="size-4" /> : <Lock className="size-4 text-signal" />}
                  {list.isOpen ? "Open" : "Closed"}
                </Button>
              </div>

              {(list.dupCount ?? 0) > 0 && (
                <Link
                  href={`/songs/${list.id}`}
                  className="mt-3 flex items-center gap-2 rounded-[8px] border border-marigold/40 bg-marigold-soft px-3 py-2 text-[13px] text-ink-soft"
                >
                  <CircleAlert className="size-4 text-marigold" />
                  {list.dupCount} possible duplicate{list.dupCount === 1 ? "" : "s"} to check
                </Link>
              )}

              <div className={cn("mt-3", !list.isOpen && "opacity-60")}>
                <ShareButtons list={list} coupleNames={settings?.coupleNames} />
              </div>
            </section>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select
              value={kind}
              onChange={(v) => setKind(v as SongListKind)}
              ariaLabel="List type"
              size="sm"
              wrapperClassName="w-40"
              options={[
                { value: "baraat", label: "Baraat" },
                { value: "sangeet", label: "Sangeet" },
                { value: "other", label: "Other (mehndi…)" },
              ]}
            />
            <Button size="sm" onClick={() => create.mutate(kind)} disabled={create.isPending}>
              <Plus className="size-4" /> New list
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
