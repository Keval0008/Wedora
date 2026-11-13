import "server-only";
import { getEnv } from "../../env";

/**
 * Finds a song on YouTube with the YouTube Data API. Each search costs 100 of
 * the free 10,000 daily quota units (about 100 searches a day), which is far
 * too few for search-as-you-type. So this runs once per new song that arrived
 * without a YouTube link, to give the DJ something to play.
 */
export function youtubeConfigured(): boolean {
  return Boolean(getEnv().YOUTUBE_API_KEY);
}

type YoutubeSearch = { items?: Array<{ id?: { videoId?: string } }> };

const cache = new Map<string, string | null>();

export async function findYoutubeId(title: string, artist?: string | null): Promise<string | null> {
  const key = getEnv().YOUTUBE_API_KEY;
  if (!key) return null;
  // The first credited artist sharpens the search; long credit lists blur it.
  const firstArtist = artist?.split(/,|&/)[0]?.trim();
  const q = [title, firstArtist].filter(Boolean).join(" ").slice(0, 120);
  const cacheKey = q.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const params = new URLSearchParams({
    part: "id",
    type: "video",
    videoCategoryId: "10", // Music
    maxResults: "1",
    regionCode: "IN",
    q,
    key,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!res?.ok) {
    // 403 usually means the day's quota is used up; try again for the next song.
    if (res) console.warn("[youtube] search failed:", res.status);
    return null;
  }
  const data = (await res.json().catch(() => null)) as YoutubeSearch | null;
  const id = data?.items?.[0]?.id?.videoId ?? null;
  const valid = id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  if (cache.size > 1000) cache.clear();
  cache.set(cacheKey, valid);
  return valid;
}
