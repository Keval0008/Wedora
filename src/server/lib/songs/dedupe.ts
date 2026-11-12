/**
 * Spotting the same song across platforms. Spotify says
 * `Kesariya (From "Brahmastra")`; YouTube says
 * `Kesariya - Brahmastra | Ranbir Kapoor | Alia Bhatt | Arijit Singh (Official Video)`.
 * Both normalize to `kesariya`.
 */

/** Words that make a different recording, so they survive normalization. */
const VERSION_WORDS = [
  "remix",
  "mashup",
  "unplugged",
  "reprise",
  "lofi",
  "acoustic",
  "slowed",
  "reverb",
  "cover",
  "live",
  "female",
  "male",
  "sad",
  "dhol",
  "instrumental",
  "karaoke",
] as const;

/** Phrases that only describe the upload. */
const NOISE = [
  "official music video",
  "official lyric video",
  "official lyrical video",
  "official video song",
  "official video",
  "official audio",
  "official song",
  "full video song",
  "full video",
  "video song",
  "full song",
  "full audio",
  "lyrical video",
  "lyric video",
  "lyrical",
  "lyrics",
  "lyric",
  "music video",
  "audio song",
  "audio",
  "video",
  "visualizer",
  "visualiser",
  "official",
  "remastered",
  "hd",
  "hq",
  "4k",
  "8k",
  "1080p",
  "720p",
  "new song",
  "latest song",
  "new",
  "latest",
];

function basicFold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ");
}

function words(s: string): string[] {
  return s.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}

function versionWordsIn(s: string): string[] {
  const w = words(s.replace(/lo-fi/g, "lofi"));
  return VERSION_WORDS.filter((v) => w.includes(v));
}

function stripNoise(s: string): string {
  let out = ` ${s} `;
  for (const phrase of NOISE) out = out.replace(new RegExp(`\\s${phrase.replace(/ /g, "\\s+")}(?=\\s)`, "g"), " ");
  return out.replace(/\b(19|20)\d{2}\b/g, " ");
}

/** "Arijit Singh - Topic" -> "arijit singh"; label channels stay as they are. */
export function normalizeArtist(artist: string | null | undefined): string {
  if (!artist) return "";
  return words(
    basicFold(artist)
      .replace(/\s*-\s*topic$/, "")
      .replace(/vevo$/, ""),
  ).join(" ");
}

/**
 * The title as a comparison key. Version words found anywhere (in brackets or
 * after a dash) are appended, so "Kala Chashma (Remix)" never matches the original.
 */
export function normalizeTitle(title: string, artist?: string | null): string {
  let t = basicFold(title);
  const versions = new Set(versionWordsIn(t));

  // Film credits and featured artists.
  t = t.replace(/\(\s*from\s[^)]*\)/g, " ").replace(/\[\s*from\s[^\]]*\]/g, " ");
  t = t.replace(/\s[-–]\s*from\s+"[^"]*"/g, " ");
  t = t.replace(/[([{][^)\]}]*[)\]}]/g, " ");
  t = t.replace(/\s(feat\.?|ft\.?|featuring)\s.*$/, " ");

  // YouTube titles: "Song | Film | Cast" or "Artist - Song" / "Song - Film".
  const segments = t.split(/\s[|│–—-]\s|\s\|\s?|\|/).map((s) => s.trim()).filter(Boolean);
  let main = segments[0] ?? t;
  const artistKey = normalizeArtist(artist);
  if (segments.length > 1 && artistKey && words(main).join(" ") === artistKey) main = segments[1]!;

  const key = words(stripNoise(main)).join(" ");
  const suffix = [...versions].filter((v) => !words(key).includes(v)).sort();
  return [key, ...suffix].join(" ").trim() || words(t).join(" ");
}

/** A cleaner title for display: drops "(Official Video)", "| Full Song" and friends. */
export function cleanDisplayTitle(title: string): string {
  let t = title.trim();
  t = t.replace(/\s*[([](?:[^)\]]*\b(?:official|lyric(?:al|s)?|full\s+(?:video|song|audio)|video\s+song|audio|hd|4k|hq|visuali[sz]er)\b[^)\]]*)[)\]]/gi, "");
  t = t.replace(/\s*\|\s*(?:official\s+)?(?:full\s+)?(?:video|audio|lyrical|lyrics?)(?:\s+song)?\s*$/i, "");
  return t.replace(/\s{2,}/g, " ").trim() || title.trim();
}

function bigrams(s: string): Map<string, number> {
  const compact = s.replace(/\s+/g, " ");
  const map = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice on character pairs: catches "kesariya" vs "kesariyaa". */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, n] of A) overlap += Math.min(n, B.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/** Share of the shorter title's words found in the longer one. */
export function containment(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  let hit = 0;
  for (const w of small) if (big.has(w)) hit++;
  return hit / small.size;
}

const hasVersion = (key: string) => key.split(" ").some((w) => (VERSION_WORDS as readonly string[]).includes(w));

/** Close enough that the owner should take a look, but not certain enough to merge. */
export function isNearMatch(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  // A remix next to its original is intentional, not a duplicate.
  if (hasVersion(a) !== hasVersion(b)) return false;
  const shorter = Math.min(a.split(" ").length, b.split(" ").length);
  if (shorter >= 2 && containment(a, b) >= 0.99) return true;
  return diceSimilarity(a, b) >= 0.85;
}

export type MatchCandidate = { id: string; normKey: string; spotifyId: string | null; youtubeId: string | null };

export type Match<T extends MatchCandidate> =
  | { type: "same-link"; song: T }
  | { type: "same-title"; song: T }
  | { type: "near"; song: T }
  | null;

/** How a new suggestion relates to the songs already on the list. */
export function findMatch<T extends MatchCandidate>(
  incoming: { spotifyId?: string | null; youtubeId?: string | null; normKey: string },
  existing: readonly T[],
): Match<T> {
  const byLink = existing.find(
    (s) =>
      (incoming.spotifyId && s.spotifyId === incoming.spotifyId) ||
      (incoming.youtubeId && s.youtubeId === incoming.youtubeId),
  );
  if (byLink) return { type: "same-link", song: byLink };

  const byTitle = existing.find((s) => s.normKey === incoming.normKey);
  if (byTitle) return { type: "same-title", song: byTitle };

  const near = existing.find((s) => isNearMatch(s.normKey, incoming.normKey));
  return near ? { type: "near", song: near } : null;
}
