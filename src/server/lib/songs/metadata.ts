import "server-only";
import { getEnv } from "../../env";
import { cleanDisplayTitle } from "./dedupe";
import { parseSongLink, spotifyTrackUrl, youtubeWatchUrl, type ParsedLink } from "./parse-link";

export type SongMeta = {
  platform: "spotify" | "youtube";
  id: string;
  url: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
};

export class MetaError extends Error {}

const TIMEOUT_MS = 6000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------- YouTube */

async function youtubeMeta(id: string): Promise<SongMeta> {
  const data = await getJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeWatchUrl(id))}`,
  );
  if (!data?.title) throw new MetaError("That YouTube video is private, removed or not embeddable.");
  return {
    platform: "youtube",
    id,
    url: youtubeWatchUrl(id),
    title: cleanDisplayTitle(data.title),
    artist: data.author_name?.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/, "").trim() || null,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    durationSec: null,
  };
}

/* ---------------------------------------------------------------- Spotify */

let spotifyToken: { value: string; expiresAt: number } | null = null;

async function spotifyAccessToken(): Promise<string | null> {
  const env = getEnv();
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 60_000) return spotifyToken.value;

  const basic = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const data = await getJson<{ access_token?: string; expires_in?: number }>("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }).catch(() => null);
  if (!data?.access_token) return null;
  spotifyToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return spotifyToken.value;
}

type SpotifyTrack = {
  name?: string;
  duration_ms?: number;
  artists?: Array<{ name: string }>;
  album?: { images?: Array<{ url: string; width?: number }> };
};

async function spotifyMeta(id: string): Promise<SongMeta> {
  const url = spotifyTrackUrl(id);
  const token = await spotifyAccessToken();
  if (token) {
    const track = await getJson<SpotifyTrack>(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (track?.name) {
      const images = track.album?.images ?? [];
      const image = images.find((i) => (i.width ?? 0) <= 320) ?? images[0];
      return {
        platform: "spotify",
        id,
        url,
        title: track.name,
        artist: track.artists?.map((a) => a.name).join(", ") || null,
        thumbnailUrl: image?.url ?? null,
        durationSec: track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
      };
    }
  }

  // No API keys (or the API said no): oEmbed still gives the title and cover.
  const data = await getJson<{ title?: string; thumbnail_url?: string }>(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
  ).catch(() => null);
  if (!data?.title) throw new MetaError("Couldn't find that Spotify song. Is the link right?");
  return { platform: "spotify", id, url, title: data.title, artist: null, thumbnailUrl: data.thumbnail_url ?? null, durationSec: null };
}

/** spotify.link/abc redirects (sometimes via an HTML page) to open.spotify.com/track/<id>. */
async function resolveSpotifyShort(shortUrl: string): Promise<ParsedLink> {
  const res = await fetch(shortUrl, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (!res) return { ok: false, reason: "no-link", message: "Couldn't open that Spotify link." };
  const direct = parseSongLink(res.url);
  if (direct.ok && direct.platform === "spotify") return direct;
  const body = await res.text().catch(() => "");
  const found = body.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/);
  if (found) return { ok: true, platform: "spotify", id: found[1]!, url: spotifyTrackUrl(found[1]!) };
  return direct.ok ? { ok: false, reason: "not-a-song", message: "That Spotify link isn't a song." } : direct;
}

/* ------------------------------------------------------------------ cache */

const cache = new Map<string, SongMeta>();
const CACHE_MAX = 500;

/** Parses, resolves and looks up a pasted link. Throws MetaError with a guest-friendly message. */
export async function lookupSong(input: string): Promise<SongMeta> {
  let parsed = parseSongLink(input);
  if (parsed.ok && parsed.platform === "spotify-short") parsed = await resolveSpotifyShort(parsed.url);
  if (!parsed.ok) throw new MetaError(parsed.message);
  if (parsed.platform === "spotify-short") throw new MetaError("Couldn't open that Spotify link.");

  const key = `${parsed.platform}:${parsed.id}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let meta: SongMeta;
  try {
    meta = parsed.platform === "spotify" ? await spotifyMeta(parsed.id) : await youtubeMeta(parsed.id);
  } catch (error) {
    if (error instanceof MetaError) throw error;
    throw new MetaError("Couldn't reach Spotify/YouTube just now. Try again in a minute.");
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, meta);
  return meta;
}
