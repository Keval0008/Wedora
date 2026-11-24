// Pure functions, shared by the server's song search and the guest's browser
// (which searches iTunes itself when the server can't reach it).
import { cleanDisplayTitle, normalizeArtist, normalizeTitle } from "./dedupe";

export type SearchResult = {
  source: "spotify" | "itunes";
  title: string;
  artist: string | null;
  /** Album or film, shown under the title. */
  album: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  /** A Spotify track link when the result came from Spotify. */
  link: string | null;
};

const LIMIT = 6;

/* ---------------------------------------------------------------- iTunes */

export type ItunesSearch = {
  results?: Array<{
    trackName?: string;
    artistName?: string;
    collectionName?: string;
    artworkUrl100?: string;
    trackTimeMillis?: number;
  }>;
};

/** Apple's public catalogue: no key, and strong on Bollywood in the India store. */
export function itunesSearchUrl(q: string): string {
  return `https://itunes.apple.com/search?entity=song&country=IN&limit=15&term=${encodeURIComponent(q)}`;
}

export function fromItunes(data: ItunesSearch | null | undefined): SearchResult[] {
  return (data?.results ?? [])
    .filter((r) => r.trackName)
    .map((r) => ({
      source: "itunes" as const,
      title: cleanDisplayTitle(r.trackName!),
      artist: r.artistName ?? null,
      album: r.collectionName ?? null,
      // 100x100 is tiny on a phone; the same URL serves larger sizes.
      thumbnailUrl: r.artworkUrl100?.replace("100x100bb", "200x200bb") ?? null,
      durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
      link: null,
    }));
}

/* ---------------------------------------------------------------- shared */

/** The same recording often appears several times (single, album, film soundtrack). */
export function dedupeResults<T extends { title: string; artist: string | null }>(results: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of results) {
    const firstArtist = normalizeArtist(r.artist?.split(/,|&/)[0]);
    const key = `${normalizeTitle(r.title, r.artist)}|${firstArtist}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.slice(0, LIMIT);
}
