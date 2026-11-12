"use client";

import { Check, CircleAlert, Loader2, Music, Plus, Search, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SongThumb } from "@/components/songs/song-bits";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { ApiError, publicApi, type SongEntry } from "@/lib/api";
import { cn, parseMmss } from "@/lib/format";
import type { PublicList, SongMeta, SubmitResult } from "@/lib/types";

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

type Preview = { state: "loading" } | { state: "ok"; meta: SongMeta } | { state: "error"; message: string };

/** Looks up album art and title for each pasted line, a moment after typing stops. */
function useLinkPreviews(slug: string, lines: string[]) {
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const line of lines) {
        if (!line || asked.current.has(line)) continue;
        asked.current.add(line);
        setPreviews((p) => ({ ...p, [line]: { state: "loading" } }));
        publicApi
          .preview(slug, line)
          .then((r) => setPreviews((p) => ({ ...p, [line]: r.ok ? { state: "ok", meta: r.meta } : { state: "error", message: r.message } })))
          .catch((e: Error) => {
            asked.current.delete(line);
            setPreviews((p) => ({ ...p, [line]: { state: "error", message: e.message } }));
          });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [slug, lines]);

  return previews;
}

type TypedSong = { title: string; artist: string };
type Performance = { link: string; title: string; artist: string; cutStart: string; cutEnd: string; notes: string };
const emptyPerformance = (): Performance => ({ link: "", title: "", artist: "", cutStart: "", cutEnd: "", notes: "" });

export function PublicSongForm({ slug, initial }: { slug: string; initial: PublicList }) {
  const [view, setView] = useState(initial);
  const [name, setName] = useState("");
  const [links, setLinks] = useState("");
  const [typed, setTyped] = useState<TypedSong[]>([]);
  const [performer, setPerformer] = useState("");
  const [performances, setPerformances] = useState<Performance[]>([emptyPerformance()]);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SubmitResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => setName(readName()), []);

  const isSangeet = view.kind === "sangeet";
  const lines = useMemo(
    () =>
      isSangeet
        ? performances.map((p) => p.link.trim()).filter(Boolean)
        : links
            .split(/\n+/)
            .map((l) => l.trim())
            .filter(Boolean),
    [links, performances, isSangeet],
  );
  const previews = useLinkPreviews(slug, lines);

  const entries: SongEntry[] = isSangeet
    ? performances
        .filter((p) => p.link.trim() || p.title.trim())
        .map((p) => ({
          link: p.link.trim() || null,
          title: p.link.trim() ? null : p.title.trim(),
          artist: p.link.trim() ? null : p.artist.trim() || null,
          performer: performer.trim() || null,
          cutStartSec: parseMmss(p.cutStart) ?? null,
          cutEndSec: parseMmss(p.cutEnd) ?? null,
          notes: p.notes.trim() || null,
        }))
    : [
        ...lines.map((link) => ({ link })),
        ...typed.filter((t) => t.title.trim()).map((t) => ({ title: t.title.trim(), artist: t.artist.trim() || null })),
      ];

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
      // Keep only what didn't go through, so they can fix it.
      const failed = new Set(results.filter((r) => r.status === "error" || r.status === "taken").map((r) => r.input));
      if (isSangeet) {
        const left = performances.filter((p) => failed.has((p.link || p.title).trim()));
        setPerformances(left.length ? left : [emptyPerformance()]);
      } else {
        setLinks(lines.filter((l) => failed.has(l)).join("\n"));
        setTyped(typed.filter((t) => failed.has(t.title.trim())));
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

  return (
    <div className="min-h-dvh">
      <div className="toran" aria-hidden />
      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-8">
        <header className="text-center">
          {view.coupleNames && (
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-marigold">{view.coupleNames}</p>
          )}
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
                ? "Performing? Tell us your song and the part you'll dance to. One list goes to the DJ, and no two acts get the same song."
                : "Which songs should get everyone dancing in the baraat? Paste Spotify or YouTube Music links. Duplicates are merged automatically.")}
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
                  const preview = p.link.trim() ? previews[p.link.trim()] : undefined;
                  const set = (patch: Partial<Performance>) => setPerformances(performances.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="space-y-3 rounded-[10px] border border-rule bg-paper/60 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
                          Song {performances.length > 1 ? i + 1 : ""}
                        </p>
                        {performances.length > 1 && (
                          <button type="button" className="text-ink-muted hover:text-urgent" aria-label="Remove song" onClick={() => setPerformances(performances.filter((_, j) => j !== i))}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                      <Input value={p.link} onChange={(e) => set({ link: e.target.value })} placeholder="Spotify or YouTube link" inputMode="url" />
                      {preview && <PreviewLine preview={preview} />}
                      {!p.link.trim() && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder="…or song name" />
                          <Input value={p.artist} onChange={(e) => set({ artist: e.target.value })} placeholder="Singer / film" />
                        </div>
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
              <>
                <div>
                  <Label htmlFor="links">Song links</Label>
                  <Textarea
                    id="links"
                    value={links}
                    onChange={(e) => setLinks(e.target.value)}
                    placeholder={"Paste one link per line\nhttps://open.spotify.com/track/…\nhttps://music.youtube.com/watch?v=…"}
                    className="min-h-28 font-mono text-[13px]"
                  />
                  {lines.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {lines.map((l) => (
                        <li key={l}>{previews[l] ? <PreviewLine preview={previews[l]} /> : <PreviewLine preview={{ state: "loading" }} />}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {typed.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input value={t.title} onChange={(e) => setTyped(typed.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Song name" />
                    <Input value={t.artist} onChange={(e) => setTyped(typed.map((x, j) => (j === i ? { ...x, artist: e.target.value } : x)))} placeholder="Singer / film" />
                    <Button type="button" size="sm" variant="ghost" aria-label="Remove" onClick={() => setTyped(typed.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <button type="button" className="text-[13px] font-medium text-signal hover:underline" onClick={() => setTyped([...typed, { title: "", artist: "" }])}>
                  No link? Type a song name instead
                </button>
              </>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-[8px] border border-urgent/30 bg-signal-soft px-3 py-2 text-[13px] text-urgent">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}

            <Button type="submit" variant="signal" className="h-12 w-full text-[15px]" disabled={!canSubmit}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />}
              {busy ? "Sending…" : isSangeet ? "Add our performance" : `Add ${entries.length > 1 ? `${entries.length} songs` : "song"}`}
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
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-3xl font-semibold text-ink">
                {isSangeet ? "Performances so far" : "On the list"}
                <span className="ml-2 font-mono text-[13px] text-ink-muted">{view.songs.length}</span>
              </h2>
            </div>
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

function PreviewLine({ preview }: { preview: Preview }) {
  if (preview.state === "loading") {
    return (
      <p className="flex items-center gap-2 text-[12px] text-ink-muted">
        <Loader2 className="size-3.5 animate-spin" /> Looking up…
      </p>
    );
  }
  if (preview.state === "error") {
    return (
      <p className="flex items-start gap-2 text-[12px] text-urgent">
        <CircleAlert className="mt-px size-3.5 shrink-0" /> {preview.message}
      </p>
    );
  }
  const m = preview.meta;
  return (
    <div className="flex items-center gap-2.5 rounded-[8px] border border-rule bg-paper/70 px-2 py-1.5">
      <SongThumb url={m.thumbnailUrl} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{m.title}</p>
        <p className="truncate text-[11px] text-ink-muted">
          {m.artist ?? ""} · {m.platform === "spotify" ? "Spotify" : "YouTube"}
        </p>
      </div>
      <Check className="size-4 shrink-0 text-done" />
    </div>
  );
}
