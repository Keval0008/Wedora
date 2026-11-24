import "server-only";
import { getEnv } from "../../env";
import { dedupeResults, fromItunes, itunesSearchUrl, type ItunesSearch, type SearchResult } from "./catalogue";
import { spotifyTrackUrl } from "./parse-link";

export { dedupeResults };
export type { SearchResult };

const TIMEOUT_MS = 5000;

/* --------------------------------------------------------------- Spotify */

let spotifyToken: { value: string; expiresAt: number } | null = null;

async function spotifyAccessToken(): Promise<string | null> {
  const env = getEnv();
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 60_000) return spotifyToken.value;
  const basic = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  const data = res?.ok ? ((await res.json()) as { access_token?: string; expires_in?: number }) : null;
  if (!data?.access_token) return null;
  spotifyToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return spotifyToken.value;
}

type SpotifySearch = {
  tracks?: {
    items?: Array<{
      id: string;
      name: string;
      duration_ms?: number;
      artists?: Array<{ name: string }>;
      album?: { name?: string; images?: Array<{ url: string; width?: number }> };
    }>;
  };
};

async function searchSpotify(q: string): Promise<SearchResult[] | null> {
  const token = await spotifyAccessToken();
  if (!token) return null;
  const url = `https://api.spotify.com/v1/search?type=track&market=IN&limit=10&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as SpotifySearch;
  return (data.tracks?.items ?? []).map((t) => {
    const images = t.album?.images ?? [];
    const image = images.find((i) => (i.width ?? 0) <= 320) ?? images[0];
    return {
      source: "spotify" as const,
      title: t.name,
      artist: t.artists?.map((a) => a.name).join(", ") || null,
      album: t.album?.name ?? null,
      thumbnailUrl: image?.url ?? null,
      durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
      link: spotifyTrackUrl(t.id),
    };
  });
}

/* ---------------------------------------------------------------- iTunes */

async function searchItunes(q: string): Promise<SearchResult[] | null> {
  const res = await fetch(itunesSearchUrl(q), { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  // On Cloudflare Workers Apple answers 403/429: it rate-limits the IP addresses
  // every Worker shares. The guest's browser then searches iTunes itself.
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as ItunesSearch | null;
  return data ? fromItunes(data) : null;
}

/* ---------------------------------------------------------------- shared */

const cache = new Map<string, { at: number; results: SearchResult[] }>();
const CACHE_MS = 30 * 60_000;

export type SearchResponse = {
  results: SearchResult[];
  source: "spotify" | "itunes" | null;
  /** No catalogue answered (not "no match"): the browser should search iTunes itself. */
  unavailable?: true;
};

/** Spotify when keys are set (results carry a Spotify link), otherwise iTunes. */
export async function searchSongs(query: string): Promise<SearchResponse> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 100);
  if (q.length < 2) return { results: [], source: null };
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { results: hit.results, source: hit.results[0]?.source ?? null };

  const raw = (await searchSpotify(q)) ?? (await searchItunes(q));
  if (raw === null) return { results: [], source: null, unavailable: true };
  const results = dedupeResults(raw);
  if (cache.size > 1000) cache.clear();
  cache.set(key, { at: Date.now(), results });
  return { results, source: results[0]?.source ?? null };
}

/** Cover art guests may attach to a picked song: only the catalogues we search. */
export function isAllowedThumbnail(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (/\.mzstatic\.com$/.test(u.hostname) || u.hostname === "i.scdn.co" || u.hostname === "i.ytimg.com");
  } catch {
    return false;
  }
}
