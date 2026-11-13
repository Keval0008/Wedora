"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, Eye, EyeOff, GitMerge, GripVertical, Pencil, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm";
import { ShareButtons } from "@/components/songs/share-panel";
import { PlatformLinks, SongThumb } from "@/components/songs/song-bits";
import { looseKey, pickToEntry, SongPicker, type SongPick } from "@/components/songs/song-picker";
import { useTeam } from "@/components/team-context";
import { Button, EmptyState, Input, Label, Sheet, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, mmss, parseMmss } from "@/lib/format";
import { LIST_KIND_LABEL, type Song } from "@/lib/types";

export default function SongListPage() {
  const { id } = useParams<{ id: string }>();
  const { teamId } = useTeam();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const key = ["songs", teamId, id];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.listSongs(teamId!, id),
    enabled: Boolean(teamId && id),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings", teamId],
    queryFn: () => api.getSettings(teamId!),
    enabled: Boolean(teamId),
  });

  const [order, setOrder] = useState<Song[]>([]);
  useEffect(() => setOrder(data?.songs ?? []), [data?.songs]);
  const [editing, setEditing] = useState<Song | null>(null);
  const [adding, setAdding] = useState("");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["song-lists", teamId] });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading || !data) return <p className="p-6 font-mono text-xs text-ink-muted">Loading…</p>;
  const { list } = data;
  const isSangeet = list.kind === "sangeet";
  const byId = new Map(order.map((s) => [s.id, s]));
  const dups = order.filter((s) => s.possibleDupOf && byId.has(s.possibleDupOf));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.findIndex((s) => s.id === e.active.id);
    const to = order.findIndex((s) => s.id === e.over!.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    void api.reorderSongs(teamId!, list.id, next.map((s) => s.id)).catch((err: Error) => {
      toast.error(err.message);
      refresh();
    });
  };

  const addPick = async (pick: SongPick) => {
    try {
      const [r] = await api.addSongs(teamId!, list.id, [pickToEntry(pick)]);
      if (r && (r.status === "added" || r.status === "voted")) toast.success(`${r.title ?? pick.title}: ${r.message}`);
      else toast.error(`${pick.title}: ${r?.message ?? "Could not add"}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    }
  };

  const patch = async (song: Song, changes: Parameters<typeof api.updateSong>[2]) => {
    try {
      await api.updateSong(teamId!, song.id, changes);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  };

  const merge = async (source: Song, into: Song) => {
    try {
      await api.mergeSong(teamId!, source.id, into.id);
      toast.success(`Merged into “${into.title}”`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not merge");
    }
  };

  const remove = async (song: Song) => {
    if (!(await confirm({ title: `Remove “${song.title}”?`, body: "Its votes go with it. Hide it instead to keep them.", confirmLabel: "Remove", tone: "danger" }))) return;
    await api.deleteSong(teamId!, song.id);
    refresh();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 md:px-6 md:py-8">
      <Link href="/songs" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All lists
      </Link>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-marigold">{LIST_KIND_LABEL[list.kind]}</p>
      <h1 className="font-display text-4xl font-semibold leading-none tracking-tight md:text-5xl">{list.title}</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {order.length} {isSangeet ? (order.length === 1 ? "performance" : "performances") : order.length === 1 ? "song" : "songs"} · drag to set the order the DJ plays them in
      </p>
      <div className="mt-4">
        <ShareButtons list={list} coupleNames={settings?.coupleNames} />
      </div>

      {dups.length > 0 && (
        <section className="mt-6 rounded-[12px] border border-marigold/50 bg-marigold-soft/60 p-3">
          <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <CircleAlert className="size-4 text-marigold" /> Same song?
          </p>
          <ul className="mt-2 space-y-2">
            {dups.map((s) => {
              const other = byId.get(s.possibleDupOf!)!;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-[8px] bg-raised p-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <b className="font-medium">{s.title}</b> <span className="text-ink-muted">and</span> <b className="font-medium">{other.title}</b>
                  </span>
                  <Button size="sm" variant="primary" onClick={() => void merge(s, other)}>
                    <GitMerge className="size-4" /> Merge
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void patch(s, { dismissDuplicate: true })}>
                    Different songs
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <Label>Add songs yourself</Label>
        <SongPicker
          slug={list.submitSlug}
          query={adding}
          onQueryChange={setAdding}
          onPick={(p) => void addPick(p)}
          takenKeys={new Map(order.map((s) => [looseKey(s.title, s.artist), isSangeet ? s.performer : null]))}
          takenLabel="taken by"
        />
      </section>

      {order.length === 0 ? (
        <EmptyState title="Waiting for the first song" hint="Share the guest link on WhatsApp — songs appear here as friends add them." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ol className="mt-6 overflow-hidden rounded-[12px] border border-rule-strong bg-raised">
              {order.map((s, i) => (
                <SortableSong
                  key={s.id}
                  song={s}
                  index={i}
                  isSangeet={isSangeet}
                  onEdit={() => setEditing(s)}
                  onToggleHidden={() => void patch(s, { hidden: !s.hidden })}
                  onRemove={() => void remove(s)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <EditSongSheet song={editing} isSangeet={isSangeet} onClose={() => setEditing(null)} onSave={(changes) => (editing ? patch(editing, changes) : undefined)} />
    </div>
  );
}

function SortableSong({
  song,
  index,
  isSangeet,
  onEdit,
  onToggleHidden,
  onRemove,
}: {
  song: Song;
  index: number;
  isSangeet: boolean;
  onEdit: () => void;
  onToggleHidden: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id });
  const cut = song.cutStartSec !== null || song.cutEndSec !== null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-start gap-2 border-b border-rule bg-raised px-2 py-2.5 last:border-b-0",
        isDragging && "relative z-10 shadow-[var(--shadow-sheet)]",
        song.hidden && "opacity-45",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-2 cursor-grab touch-none text-ink-muted active:cursor-grabbing"
        aria-label={`Drag ${song.title}`}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="mt-2 w-5 shrink-0 text-right font-mono text-[12px] text-ink-muted">{index + 1}</span>
      <SongThumb url={song.thumbnailUrl} size={44} />
      <div className="min-w-0 flex-1">
        {isSangeet && song.performer && (
          <p className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-signal">
            <Users className="size-3" /> {song.performer}
          </p>
        )}
        <p className="text-[15px] leading-snug text-ink">{song.title}</p>
        <p className="text-[12px] text-ink-muted">
          {[song.artist, cut && `✂ ${song.cutStartSec !== null ? mmss(song.cutStartSec) : "start"}–${song.cutEndSec !== null ? mmss(song.cutEndSec) : "end"}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <PlatformLinks spotifyId={song.spotifyId} youtubeId={song.youtubeId} title={song.title} artist={song.artist} />
          <span className="text-[11px] text-ink-muted" title={song.submitters.join(", ")}>
            {song.votes > 1 ? `×${song.votes} · ` : ""}
            {song.submitters.slice(0, 3).join(", ")}
            {song.submitters.length > 3 ? ` +${song.submitters.length - 3}` : ""}
          </span>
        </div>
        {song.notes && <p className="mt-0.5 text-[12px] text-ink-soft">“{song.notes}”</p>}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row">
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit">
          <Pencil className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggleHidden} aria-label={song.hidden ? "Show" : "Hide"} title={song.hidden ? "Show to DJ" : "Hide from DJ"}>
          {song.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remove">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function EditSongSheet({
  song,
  isSangeet,
  onClose,
  onSave,
}: {
  song: Song | null;
  isSangeet: boolean;
  onClose: () => void;
  onSave: (changes: Parameters<typeof api.updateSong>[2]) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [performer, setPerformer] = useState("");
  const [cutStart, setCutStart] = useState("");
  const [cutEnd, setCutEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    if (!song) return;
    setTitle(song.title);
    setArtist(song.artist ?? "");
    setPerformer(song.performer ?? "");
    setCutStart(song.cutStartSec !== null ? mmss(song.cutStartSec) : "");
    setCutEnd(song.cutEndSec !== null ? mmss(song.cutEndSec) : "");
    setNotes(song.notes ?? "");
    setLink("");
  }, [song]);

  if (!song) return null;
  const start = parseMmss(cutStart);
  const end = parseMmss(cutEnd);
  const valid = title.trim() && start !== undefined && end !== undefined;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit song"
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!valid}
            onClick={async () => {
              await onSave({
                title: title.trim(),
                artist: artist.trim() || null,
                performer: performer.trim() || null,
                cutStartSec: start ?? null,
                cutEndSec: end ?? null,
                notes: notes.trim() || null,
                ...(link.trim() ? { link: link.trim() } : {}),
              });
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="song-title">Title</Label>
          <Input id="song-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="song-artist">Artist / film</Label>
          <Input id="song-artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </div>
        {isSangeet && (
          <div>
            <Label htmlFor="song-performer">Performed by</Label>
            <Input id="song-performer" value={performer} onChange={(e) => setPerformer(e.target.value)} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cut-start">Cut from (m:ss)</Label>
            <Input id="cut-start" value={cutStart} onChange={(e) => setCutStart(e.target.value)} placeholder="0:45" className={start === undefined ? "border-urgent" : undefined} />
          </div>
          <div>
            <Label htmlFor="cut-end">To (m:ss)</Label>
            <Input id="cut-end" value={cutEnd} onChange={(e) => setCutEnd(e.target.value)} placeholder="2:30" className={end === undefined ? "border-urgent" : undefined} />
          </div>
        </div>
        <div>
          <Label htmlFor="song-notes">Notes for the DJ</Label>
          <Textarea id="song-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="song-link">{song.spotifyId || song.youtubeId ? "Add the other app's link" : "Attach a link"}</Label>
          <Input id="song-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Spotify or YouTube link" inputMode="url" />
        </div>
        {song.submissions.length > 0 && (
          <div>
            <Label>Suggested by</Label>
            <ul className="space-y-1 text-[13px] text-ink-soft">
              {song.submissions.map((s, i) => (
                <li key={i}>
                  {s.submitterName}
                  {s.note ? <span className="text-ink-muted"> — {s.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
