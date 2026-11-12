"use client";

import { Music2 } from "lucide-react";
import { cn } from "@/lib/format";

/** Album art, or a note glyph when a typed-in song has none. */
export function SongThumb({ url, size = 44, className }: { url: string | null | undefined; size?: number; className?: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- covers come from Spotify and YouTube CDNs
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={cn("shrink-0 rounded-[6px] bg-sunken object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[6px] border border-rule bg-sunken text-ink-muted", className)}
      style={{ width: size, height: size }}
    >
      <Music2 className="size-4" />
    </span>
  );
}

export function spotifyUrl(id: string) {
  return `https://open.spotify.com/track/${id}`;
}

export function youtubeMusicUrl(id: string) {
  return `https://music.youtube.com/watch?v=${id}`;
}

/** Small "Spotify" / "YouTube" links next to a song. */
export function PlatformLinks({ spotifyId, youtubeId }: { spotifyId: string | null; youtubeId: string | null }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px]">
      {spotifyId && (
        <a href={spotifyUrl(spotifyId)} target="_blank" rel="noreferrer" className="text-[#1d9a4d] hover:underline">
          Spotify
        </a>
      )}
      {youtubeId && (
        <a href={youtubeMusicUrl(youtubeId)} target="_blank" rel="noreferrer" className="text-[#d32020] hover:underline">
          YouTube
        </a>
      )}
    </span>
  );
}

/** One share sheet for the guest link: WhatsApp, copy, and a QR code for printing. */
export function shareText(kind: "baraat" | "sangeet" | "other", url: string, couple?: string | null) {
  const who = couple ? ` for ${couple}'s wedding` : "";
  if (kind === "sangeet") {
    return `💃 Performing at the sangeet${who}? Add your song (and the cut you want) here so we can send one list to the DJ:\n${url}`;
  }
  if (kind === "baraat") {
    return `🎺 Help us build the baraat playlist${who}! Paste Spotify or YouTube links of songs you want to dance to:\n${url}`;
  }
  return `🎶 Suggest songs${who}:\n${url}`;
}
