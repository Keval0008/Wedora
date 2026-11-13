"use client";

import { Copy, Download, PlayCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { PlatformLinks, SongThumb, spotifyUrl, youtubeMusicUrl } from "@/components/songs/song-bits";
import { Button } from "@/components/ui";
import { mmss } from "@/lib/format";
import type { DjView } from "@/lib/types";

function cutText(start: number | null, end: number | null): string {
  if (start === null && end === null) return "";
  return `${start !== null ? mmss(start) : "start"} → ${end !== null ? mmss(end) : "end"}`;
}

function asText(view: DjView): string {
  const head = `${view.title}${view.coupleNames ? ` — ${view.coupleNames}` : ""}`;
  const lines = view.songs.map((s, i) => {
    const parts = [`${i + 1}. ${s.title}${s.artist ? ` — ${s.artist}` : ""}`];
    if (s.performer) parts.push(`   Performed by: ${s.performer}`);
    const cut = cutText(s.cutStartSec, s.cutEndSec);
    if (cut) parts.push(`   Cut: ${cut}`);
    if (s.notes) parts.push(`   Note: ${s.notes}`);
    if (s.spotifyId) parts.push(`   ${spotifyUrl(s.spotifyId)}`);
    if (s.youtubeId) parts.push(`   ${youtubeMusicUrl(s.youtubeId)}`);
    return parts.join("\n");
  });
  return [head, "", ...lines].join("\n");
}

function asCsv(view: DjView): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["#", "Song", "Artist", "Performer", "Cut from", "Cut to", "Notes", "Spotify", "YouTube Music", "Requests"];
  const rows = view.songs.map((s, i) =>
    [
      i + 1,
      s.title,
      s.artist,
      s.performer,
      s.cutStartSec !== null ? mmss(s.cutStartSec) : "",
      s.cutEndSec !== null ? mmss(s.cutEndSec) : "",
      s.notes,
      s.spotifyId ? spotifyUrl(s.spotifyId) : "",
      s.youtubeId ? youtubeMusicUrl(s.youtubeId) : "",
      s.votes,
    ]
      .map(cell)
      .join(","),
  );
  return `﻿${[header.join(","), ...rows].join("\r\n")}\r\n`;
}

/** The read-only run order the DJ opens on their phone or prints. */
export function DjSheet({ view }: { view: DjView }) {
  const isSangeet = view.kind === "sangeet";
  const youtubeIds = view.songs.flatMap((s) => (s.youtubeId ? [s.youtubeId] : [])).slice(0, 50);

  const download = () => {
    const blob = new Blob([asCsv(view)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${view.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-dvh">
      <div className="toran no-print" aria-hidden />
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule-strong pb-4">
          <div>
            {view.coupleNames && <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-marigold">{view.coupleNames}</p>}
            <h1 className="mt-1 font-display text-4xl font-semibold leading-none tracking-tight">{view.title}</h1>
            <p className="mt-1 font-mono text-[12px] text-ink-muted">
              {view.songs.length} {isSangeet ? (view.songs.length === 1 ? "performance" : "performances") : view.songs.length === 1 ? "song" : "songs"} · in running order
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void navigator.clipboard.writeText(asText(view)).then(() => toast.success("Copied — paste it in WhatsApp"))}>
              <Copy className="size-4" /> Copy as text
            </Button>
            <Button size="sm" onClick={download}>
              <Download className="size-4" /> CSV
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            {youtubeIds.length > 1 && (
              <a
                href={`https://www.youtube.com/watch_videos?video_ids=${youtubeIds.join(",")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-rule-strong bg-raised px-2.5 text-[13px] font-medium hover:bg-sunken"
              >
                <PlayCircle className="size-4 text-[#d32020]" /> Play all
              </a>
            )}
          </div>
        </header>

        {view.songs.length === 0 ? (
          <p className="py-16 text-center text-ink-muted">No songs yet.</p>
        ) : (
          <ol className="mt-2">
            {view.songs.map((s, i) => (
              <li key={s.id} className="flex gap-3 border-b border-rule py-3 break-inside-avoid">
                <span className="w-7 shrink-0 pt-0.5 text-right font-sans text-xl font-semibold leading-none tabular-nums text-marigold">{i + 1}</span>
                <SongThumb url={s.thumbnailUrl} size={48} className="no-print" />
                <div className="min-w-0 flex-1">
                  {isSangeet && s.performer && (
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-signal">{s.performer}</p>
                  )}
                  <p className="text-[16px] font-semibold leading-snug text-ink">{s.title}</p>
                  <p className="text-[13px] text-ink-muted">
                    {s.artist}
                    {s.durationSec ? ` · ${mmss(s.durationSec)}` : ""}
                    {!isSangeet && s.votes > 1 ? ` · requested by ${s.votes}` : ""}
                  </p>
                  {(s.cutStartSec !== null || s.cutEndSec !== null) && (
                    <p className="mt-1 inline-block rounded-[6px] bg-marigold-soft px-2 py-0.5 font-mono text-[12px] text-ink">
                      ✂ {cutText(s.cutStartSec, s.cutEndSec)}
                    </p>
                  )}
                  {s.notes && <p className="mt-1 text-[13px] text-ink-soft">“{s.notes}”</p>}
                  <div className="mt-1">
                    <PlatformLinks spotifyId={s.spotifyId} youtubeId={s.youtubeId} title={s.title} artist={s.artist} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
