"use client";

import { Check, CircleAlert, Loader2, Music, Plus, Search, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SongThumb } from "@/components/songs/song-bits";
import { findLinks, looseKey, PickedSong, pickToEntry, SongPicker, typedPick, type SongPick } from "@/components/songs/song-picker";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { ApiError, publicApi, type SongEntry } from "@/lib/api";
import { cn, parseMmss } from "@/lib/format";
import type { PublicList, SubmitResult } from "@/lib/types";

const NAME_KEY = "wedora.guestName";

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode: they'll type it again next time.
  }
}

/** A typed-but-not-added name still counts when the guest presses Send. */
function pendingPick(query: string): SongPick | null {
  const text = query.trim();
  if (text.length < 2 || findLinks(text).length) return null;
  return typedPick(text);
}

type Performance = { pick: SongPick | null; query: string; cutStart: string; cutEnd: string; notes: string };
const emptyPerformance = (): Performance => ({ pick: null, query: "", cutStart: "", cutEnd: "", notes: "" });

export function PublicSongForm({ slug, initial }: { slug: string; initial: PublicList }) {
  const [view, setView] = useState(initial);
  const [name, setName] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SubmitResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // baraat / other
  const [query, setQuery] = useState("");
  const [picks, setPicks] = useState<SongPick[]>([]);
  // sangeet
  const [performer, setPerformer] = useState("");
  const [performances, setPerformances] = useState<Performance[]>([emptyPerformance()]);

  useEffect(() => setName(readName()), []);

  const isSangeet = view.kind === "sangeet";

  /** Songs already on the list, so search results can say so. */
  const taken = useMemo(() => new Map(view.songs.map((s) => [looseKey(s.title, s.artist), isSangeet ? s.performer : null])), [view.songs, isSangeet]);

  const addPick = (p: SongPick) => setPicks((list) => (list.some((x) => x.key === p.key) ? list : [...list, p]));

  const entries: SongEntry[] = isSangeet
    ? performances.flatMap((p) => {
        const chosen = p.pick ?? pendingPick(p.query);
        if (!chosen) return [];
        return [
          {
            ...pickToEntry(chosen),
            performer: performer.trim() || null,
            cutStartSec: parseMmss(p.cutStart) ?? null,
            cutEndSec: parseMmss(p.cutEnd) ?? null,
            notes: p.notes.trim() || null,
          },
        ];
      })
    : [...picks, ...(pendingPick(query) && !picks.some((p) => p.key === pendingPick(query)!.key) ? [pendingPick(query)!] : [])].map(pickToEntry);

  const badCut = isSangeet && performances.some((p) => parseMmss(p.cutStart) === undefined || parseMmss(p.cutEnd) === undefined);
  const canSubmit = name.trim() && entries.length > 0 && !busy && !badCut && (!isSangeet || performer.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    saveName(name.trim());
    try {
      const { results } = await publicApi.submit(slug, { name: name.trim(), website: honeypot, entries });
      setResults(results);
      const ok = (r: SubmitResult) => r.status === "added" || r.status === "voted";
      if (isSangeet) {
        // Keep the songs that didn't go through, so they can pick another.
        // Results line up with the songs that were sent; empty blocks sent nothing.
        let next = 0;
        const left = performances.filter((p) => {
          if (!p.pick && !pendingPick(p.query)) return false;
          const r = results[next++];
          return !r || !ok(r);
        });
        setPerformances(left.length ? left.map((p) => ({ ...p, pick: null, query: "" })) : [emptyPerformance()]);
        if (results.every(ok)) setPerformer("");
      } else {
        setPicks((list) => list.filter((_, i) => !ok(results[i] ?? { status: "error", input: "", message: "" })));
        setQuery("");
      }
      setView(await publicApi.list(slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const shownSongs = view.songs.filter((s) => {
    const q = filter.trim().toLowerCase();
    return !q || `${s.title} ${s.artist ?? ""} ${s.performer ?? ""}`.toLowerCase().includes(q);
  });

  const sendLabel = isSangeet
    ? "Add our performance"
    : entries.length > 1
      ? `Send ${entries.length} songs`
      : entries.length === 1
        ? "Send song"
        : "Pick a song first";

  return (
    <div className="min-h-dvh">
      <div className="toran" aria-hidden />
      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-8">
        <header className="text-center">
          {view.coupleNames && <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-marigold">{view.coupleNames}</p>}
          <h1 className="mt-2 font-display text-5xl font-semibold leading-[1.02] tracking-tight text-ink">
            {isSangeet ? (
              <>
                Sangeet <span className="italic text-signal">night</span>
              </>
            ) : view.kind === "baraat" ? (
              <>
                Baraat <span className="italic text-signal">playlist</span>
              </>
            ) : (
              view.title
            )}
          </h1>
          <div className="flourish mx-auto mt-3 max-w-[14rem]" aria-hidden>
            ✿
          </div>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-ink-soft">
            {view.description ||
              (isSangeet
                ? "Performing? Find your song and tell us the part you'll dance to. One list goes to the DJ, and no two acts get the same song."
                : "Which songs should get everyone dancing in the baraat? Search by name or paste a Spotify / YouTube Music link. Duplicates are merged automatically.")}
          </p>
        </header>

        {!view.isOpen ? (
          <p className="mt-8 rounded-[12px] border border-rule-strong bg-raised p-5 text-center text-ink-soft">
            This list is closed now. Thank you for all the songs! 🎉
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5 rounded-[14px] border border-rule-strong bg-raised p-4 shadow-[0_1px_0_var(--rule)] sm:p-5">
            <div>
              <Label htmlFor="guest-name">Your name</Label>
              <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="So we know who asked" maxLength={80} required />
            </div>

            {/* Bots fill every field; people never see this one. */}
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />

            {isSangeet ? (
              <>
                <div>
                  <Label htmlFor="performer">Who&apos;s performing?</Label>
                  <Input
                    id="performer"
                    value={performer}
                    onChange={(e) => setPerformer(e.target.value)}
                    placeholder="e.g. Cousins group, Avani's friends, Mama-Mami"
                    maxLength={120}
                  />
                </div>
                {performances.map((p, i) => {
                  const set = (patch: Partial<Performance>) => setPerformances((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="space-y-3 rounded-[10px] border border-rule bg-paper/60 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">Song {performances.length > 1 ? i + 1 : ""}</p>
                        {performances.length > 1 && (
                          <button type="button" className="text-ink-muted hover:text-urgent" aria-label="Remove song" onClick={() => setPerformances(performances.filter((_, j) => j !== i))}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                      {p.pick ? (
                        <PickedSong pick={p.pick} onRemove={() => set({ pick: null })} removeLabel="Change" />
                      ) : (
                        <SongPicker
                          slug={slug}
                          query={p.query}
                          onQueryChange={(q) => set({ query: q })}
                          onPick={(pick) => set({ pick, query: "" })}
                          takenKeys={taken}
                          takenLabel="taken by"
                        />
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Cut from (m:ss)</Label>
                          <Input
                            value={p.cutStart}
                            onChange={(e) => set({ cutStart: e.target.value })}
                            placeholder="0:45"
                            inputMode="numeric"
                            className={parseMmss(p.cutStart) === undefined ? "border-urgent" : undefined}
                          />
                        </div>
                        <div>
                          <Label>To (m:ss)</Label>
                          <Input
                            value={p.cutEnd}
                            onChange={(e) => set({ cutEnd: e.target.value })}
                            placeholder="2:30"
                            inputMode="numeric"
                            className={parseMmss(p.cutEnd) === undefined ? "border-urgent" : undefined}
                          />
                        </div>
                      </div>
                      <Textarea
                        value={p.notes}
                        onChange={(e) => set({ notes: e.target.value })}
                        placeholder="Notes for the DJ — fade in, start on the dhol beat…"
                        className="min-h-16"
                        maxLength={2000}
                      />
                    </div>
                  );
                })}
                {performances.length < 4 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPerformances([...performances, emptyPerformance()])}>
                    <Plus className="size-4" /> Medley? Add another song
                  </Button>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Find a song</Label>
                  <SongPicker slug={slug} query={query} onQueryChange={setQuery} onPick={addPick} takenKeys={taken} />
                </div>
                {picks.length > 0 && (
                  <div>
                    <Label>Your songs · {picks.length}</Label>
                    <ul className="space-y-1.5">
                      {picks.map((p) => (
                        <li key={p.key}>
                          <PickedSong pick={p} onRemove={() => setPicks((list) => list.filter((x) => x.key !== p.key))} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-[8px] border border-urgent/30 bg-signal-soft px-3 py-2 text-[13px] text-urgent">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}

            <Button type="submit" variant="signal" className="h-12 w-full text-[15px]" disabled={!canSubmit}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />}
              {busy ? "Sending…" : sendLabel}
            </Button>
          </form>
        )}

        {results && (
          <ul className="mt-5 space-y-2" aria-live="polite">
            {results.map((r, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] border px-3 py-2",
                  r.status === "added" || r.status === "voted" ? "border-done/30 bg-done-soft" : "border-urgent/30 bg-signal-soft",
                )}
              >
                <SongThumb url={r.thumbnailUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{r.title ?? r.input}</p>
                  <p className={cn("text-[12px]", r.status === "added" || r.status === "voted" ? "text-done" : "text-urgent")}>{r.message}</p>
                </div>
                {(r.status === "added" || r.status === "voted") && <Check className="size-4 text-done" />}
              </li>
            ))}
          </ul>
        )}

        {view.showListToGuests && view.songs.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              {isSangeet ? "Performances so far" : "On the list"}
              <span className="ml-2 font-mono text-[13px] text-ink-muted">{view.songs.length}</span>
            </h2>
            {view.songs.length > 6 && (
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Is my song already there?" className="pl-9" />
              </div>
            )}
            <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-[12px] border border-rule-strong bg-raised">
              {shownSongs.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <SongThumb url={s.thumbnailUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-ink">{s.title}</p>
                    <p className="truncate text-[12px] text-ink-muted">
                      {isSangeet && s.performer ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" /> {s.performer}
                        </span>
                      ) : (
                        s.artist
                      )}
                    </p>
                  </div>
                  {!isSangeet && s.votes > 1 && (
                    <span className="shrink-0 rounded-full bg-marigold-soft px-2 py-0.5 font-mono text-[11px] text-marigold">×{s.votes}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-12 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          Made with Wed<span className="italic text-signal">ora</span>
        </p>
      </div>
    </div>
  );
}
