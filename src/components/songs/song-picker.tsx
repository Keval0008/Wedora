"use client";

import { Check, CircleAlert, Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SongThumb } from "@/components/songs/song-bits";
import { publicApi, type SongEntry } from "@/lib/api";
// Pure string functions, shared with the server so the hint matches what it will do.
import { normalizeTitle } from "@/server/lib/songs/dedupe";
import { cn, mmss } from "@/lib/format";
import type { SearchResult, SongMeta } from "@/lib/types";

/** A song the guest has chosen but not sent yet. */
export type SongPick = {
  key: string;
  source: "spotify" | "youtube" | "itunes" | "typed";
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  link: string | null;
};

const LINK_RE = /(spotify:track:[A-Za-z0-9]{22}|https?:\/\/[^\s<>"']+|\b(?:open\.spotify\.com|spotify\.link|youtu\.be|(?:www\.|m\.|music\.)?youtube\.com)\/[^\s<>"']+)/gi;

export function findLinks(text: string): string[] {
  return [...new Set((text.match(LINK_RE) ?? []).map((l) => l.replace(/[).,!?\]]+$/, "")))];
}

/** The server's duplicate key, so "already on the list" means exactly that. */
export function looseKey(title: string, artist?: string | null): string {
  return normalizeTitle(title, artist);
}

export function pickToEntry(p: SongPick): SongEntry {
  return p.link
    ? { link: p.link }
    : { title: p.title, artist: p.artist, thumbnailUrl: p.thumbnailUrl, durationSec: p.durationSec };
}

export function typedPick(text: string): SongPick {
  const title = text.trim();
  return { key: `typed:${title.toLowerCase()}`, source: "typed", title, artist: null, thumbnailUrl: null, durationSec: null, link: null };
}

function fromSearch(r: SearchResult): SongPick {
  return {
    key: r.link ?? `${r.source}:${r.title.toLowerCase()}|${(r.artist ?? "").toLowerCase()}`,
    source: r.source,
    title: r.title,
    artist: r.artist,
    thumbnailUrl: r.thumbnailUrl,
    durationSec: r.durationSec,
    link: r.link,
  };
}

function fromMeta(link: string, m: SongMeta): SongPick {
  return { key: m.url, source: m.platform, title: m.title, artist: m.artist, thumbnailUrl: m.thumbnailUrl, durationSec: m.durationSec, link };
}

type LinkState = { state: "loading" } | { state: "ok"; meta: SongMeta } | { state: "error"; message: string };

/**
 * One box for everything a guest might do: type a song name and pick from
 * search results, paste one or more Spotify / YouTube links, or just add the
 * name as typed when nothing matches.
 */
export function SongPicker({
  slug,
  query,
  onQueryChange,
  onPick,
  takenKeys,
  takenLabel = "on the list",
  autoFocus,
  placeholder = "Type a song name, or paste a Spotify / YouTube link",
}: {
  slug: string;
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (pick: SongPick) => void;
  /** looseKey()s of songs already on the list, mapped to a label (e.g. the performer). */
  takenKeys?: Map<string, string | null>;
  takenLabel?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const links = useMemo(() => findLinks(query), [query]);
  const isLinks = links.length > 0;
  const term = isLinks ? "" : query.trim();

  /* ------------------------------------------------------------ search */
  const [results, setResults] = useState<SearchResult[]>([]);
  const [source, setSource] = useState<"spotify" | "itunes" | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const latest = useRef("");

  useEffect(() => {
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    latest.current = term;
    const timer = setTimeout(() => {
      publicApi
        .search(slug, term)
        .then((r) => {
          if (latest.current !== term) return;
          setResults(r.results);
          setSource(r.source);
          setSearchError(null);
        })
        .catch((e: Error) => latest.current === term && setSearchError(e.message))
        .finally(() => latest.current === term && setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, term]);

  /* ------------------------------------------------------------- links */
  const [previews, setPreviews] = useState<Record<string, LinkState>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const link of links) {
      if (asked.current.has(link)) continue;
      asked.current.add(link);
      setPreviews((p) => ({ ...p, [link]: { state: "loading" } }));
      publicApi
        .preview(slug, link)
        .then((r) => setPreviews((p) => ({ ...p, [link]: r.ok ? { state: "ok", meta: r.meta } : { state: "error", message: r.message } })))
        .catch((e: Error) => {
          asked.current.delete(link);
          setPreviews((p) => ({ ...p, [link]: { state: "error", message: e.message } }));
        });
    }
  }, [slug, links]);

  const pickLink = (link: string, meta: SongMeta) => {
    onPick(fromMeta(link, meta));
    onQueryChange(query.replace(link, "").trim());
  };
  const readyLinks = links.flatMap((l) => {
    const p = previews[l];
    return p?.state === "ok" ? [{ link: l, meta: p.meta }] : [];
  });

  const pick = (p: SongPick) => {
    onPick(p);
    onQueryChange("");
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (isLinks) {
              for (const r of readyLinks) pickLink(r.link, r.meta);
            } else if (results[0] && !searching) {
              pick(fromSearch(results[0]));
            } else if (term) {
              pick(typedPick(term));
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          enterKeyHint="search"
          autoComplete="off"
          className="tb-field h-12 w-full rounded-[10px] border border-rule-strong bg-raised pl-9 pr-9 text-[15px] text-ink transition-colors placeholder:text-ink-muted/70 hover:border-ink-muted focus:border-signal"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {isLinks && (
        <ul className="mt-2 space-y-1.5">
          {links.map((l) => {
            const p = previews[l] ?? { state: "loading" as const };
            return (
              <li key={l}>
                {p.state === "loading" ? (
                  <p className="flex items-center gap-2 px-1 text-[12px] text-ink-muted">
                    <Loader2 className="size-3.5 animate-spin" /> Looking up the link…
                  </p>
                ) : p.state === "error" ? (
                  <p className="flex items-start gap-2 px-1 text-[12px] text-urgent">
                    <CircleAlert className="mt-px size-3.5 shrink-0" /> {p.message}
                  </p>
                ) : (
                  <ResultRow
                    pick={fromMeta(l, p.meta)}
                    sourceLabel={p.meta.platform === "spotify" ? "Spotify" : "YouTube"}
                    taken={takenKeys?.get(looseKey(p.meta.title, p.meta.artist))}
                    takenLabel={takenLabel}
                    isTaken={takenKeys?.has(looseKey(p.meta.title, p.meta.artist))}
                    onAdd={() => pickLink(l, p.meta)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!isLinks && term.length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-[10px] border border-rule bg-paper/60">
          {searching && results.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </p>
          ) : (
            <ul className={cn("divide-y divide-rule", searching && "opacity-60")}>
              {results.map((r) => (
                <li key={`${r.source}-${r.title}-${r.artist}-${r.album}`}>
                  <ResultRow
                    pick={fromSearch(r)}
                    subtitle={[r.artist, r.album && r.album !== r.title ? r.album : null].filter(Boolean).join(" · ")}
                    taken={takenKeys?.get(looseKey(r.title, r.artist))}
                    isTaken={takenKeys?.has(looseKey(r.title, r.artist))}
                    takenLabel={takenLabel}
                    onAdd={() => pick(fromSearch(r))}
                    flat
                  />
                </li>
              ))}
            </ul>
          )}
          {searchError && <p className="px-3 py-2 text-[12px] text-urgent">{searchError}</p>}
          {!searching && results.length === 0 && !searchError && (
            <p className="px-3 pt-3 text-[13px] text-ink-muted">No match found. You can still add it as you typed it.</p>
          )}
          <button
            type="button"
            onClick={() => pick(typedPick(term))}
            className="flex w-full items-center gap-2 border-t border-rule px-3 py-2.5 text-left text-[13px] text-ink-soft hover:bg-sunken"
          >
            <Plus className="size-4 shrink-0 text-signal" />
            <span className="min-w-0 truncate">
              Add “<span className="font-medium text-ink">{term}</span>” as typed
            </span>
          </button>
          {source && results.length > 0 && (
            <p className="border-t border-rule px-3 py-1 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
              results from {source === "spotify" ? "Spotify" : "Apple Music"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  pick,
  subtitle,
  sourceLabel,
  isTaken,
  taken,
  takenLabel,
  onAdd,
  flat,
}: {
  pick: SongPick;
  subtitle?: string;
  sourceLabel?: string;
  isTaken?: boolean;
  taken?: string | null;
  takenLabel: string;
  onAdd: () => void;
  flat?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 px-2.5 py-2", !flat && "rounded-[10px] border border-rule bg-paper/60")}>
      <SongThumb url={pick.thumbnailUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{pick.title}</p>
        <p className="truncate text-[12px] text-ink-muted">
          {subtitle ?? [pick.artist, sourceLabel].filter(Boolean).join(" · ")}
          {pick.durationSec ? ` · ${mmss(pick.durationSec)}` : ""}
        </p>
        {isTaken && (
          <p className="text-[11px] font-medium text-marigold">
            ✓ {taken ? `${takenLabel} ${taken}` : "already on the list — adding counts as a vote"}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[8px] bg-signal px-2.5 text-[13px] font-medium text-paper hover:brightness-110"
      >
        <Plus className="size-3.5" /> Add
      </button>
    </div>
  );
}

/** A chosen song, with a way to take it back. */
export function PickedSong({ pick, onRemove, removeLabel = "Remove" }: { pick: SongPick; onRemove: () => void; removeLabel?: string }) {
  const where =
    pick.source === "spotify" ? "Spotify" : pick.source === "youtube" ? "YouTube" : pick.source === "itunes" ? null : "typed by you";
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-done/30 bg-done-soft/60 px-2.5 py-2">
      <SongThumb url={pick.thumbnailUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{pick.title}</p>
        <p className="truncate text-[12px] text-ink-muted">{[pick.artist, where].filter(Boolean).join(" · ")}</p>
      </div>
      <Check className="size-4 shrink-0 text-done" />
      <button type="button" onClick={onRemove} className="shrink-0 text-[12px] text-ink-muted hover:text-urgent" aria-label={removeLabel}>
        {removeLabel === "Remove" ? <X className="size-4" /> : removeLabel}
      </button>
    </div>
  );
}
