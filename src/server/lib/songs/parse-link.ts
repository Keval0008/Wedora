/**
 * Turns whatever a guest pastes — a bare link, a WhatsApp share text with a
 * link inside, a spotify: URI — into a platform and a track id.
 */

export type ParsedLink =
  | { ok: true; platform: "spotify"; id: string; url: string }
  | { ok: true; platform: "youtube"; id: string; url: string }
  /** spotify.link short links must be resolved over the network first. */
  | { ok: true; platform: "spotify-short"; url: string }
  | { ok: false; reason: "no-link" | "playlist" | "album" | "not-a-song" | "unsupported"; message: string };

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

const fail = (reason: Extract<ParsedLink, { ok: false }>["reason"], message: string): ParsedLink => ({
  ok: false,
  reason,
  message,
});

const SINGLE_SONG = "Please share a link to a single song, not a playlist or album.";

/** The first URL-looking thing in the text. */
export function extractLink(text: string): string | null {
  const uri = text.match(/spotify:track:[A-Za-z0-9]{22}/);
  if (uri) return uri[0];
  const url = text.match(/https?:\/\/[^\s<>"']+/i) ?? text.match(/\b(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|open\.spotify\.com|spotify\.link)\/[^\s<>"']+/i);
  if (!url) return null;
  // Trailing punctuation from a sentence is not part of the link.
  return url[0].replace(/[).,!?\]]+$/, "");
}

export function spotifyTrackUrl(id: string) {
  return `https://open.spotify.com/track/${id}`;
}

export function youtubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeMusicUrl(id: string) {
  return `https://music.youtube.com/watch?v=${id}`;
}

export function parseSongLink(input: string): ParsedLink {
  const raw = extractLink(input.trim());
  if (!raw) return fail("no-link", "That doesn't look like a link.");

  const uri = raw.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uri) return { ok: true, platform: "spotify", id: uri[1]!, url: spotifyTrackUrl(uri[1]!) };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return fail("no-link", "That doesn't look like a link.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  /* ------------------------------------------------------------- Spotify */
  if (host === "spotify.link" || host === "spotify.app.link") {
    return { ok: true, platform: "spotify-short", url: url.toString() };
  }
  if (host === "open.spotify.com" || host === "play.spotify.com") {
    // Localised links look like /intl-de/track/<id>; embeds like /embed/track/<id>.
    const rest = parts.filter((p, i) => !(i === 0 && (/^intl-[a-z-]+$/i.test(p) || p === "embed")));
    const [type, id] = rest;
    if (type === "track" && id && SPOTIFY_ID.test(id)) {
      return { ok: true, platform: "spotify", id, url: spotifyTrackUrl(id) };
    }
    if (type === "playlist") return fail("playlist", SINGLE_SONG);
    if (type === "album") return fail("album", SINGLE_SONG);
    return fail("not-a-song", "That Spotify link isn't a song. Open the song and use Share → Copy link.");
  }

  /* ------------------------------------------------------------- YouTube */
  const isYouTube =
    host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com";
  if (host === "youtu.be") {
    const id = parts[0];
    if (id && YOUTUBE_ID.test(id)) return { ok: true, platform: "youtube", id, url: youtubeWatchUrl(id) };
    return fail("not-a-song", "That YouTube link is incomplete.");
  }
  if (isYouTube) {
    const v = url.searchParams.get("v");
    if (parts[0] === "watch" && v && YOUTUBE_ID.test(v)) {
      return { ok: true, platform: "youtube", id: v, url: youtubeWatchUrl(v) };
    }
    if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "") && parts[1] && YOUTUBE_ID.test(parts[1])) {
      return { ok: true, platform: "youtube", id: parts[1], url: youtubeWatchUrl(parts[1]) };
    }
    if (parts[0] === "playlist" || (parts[0] === "watch" && !v && url.searchParams.get("list"))) {
      return fail("playlist", SINGLE_SONG);
    }
    if (parts[0] === "browse" || parts[0] === "channel" || parts[0]?.startsWith("@")) {
      return fail("album", SINGLE_SONG);
    }
    return fail("not-a-song", "That YouTube link isn't a song. Open the song and use Share → Copy link.");
  }

  return fail(
    "unsupported",
    "Only Spotify and YouTube / YouTube Music links work here. You can also type the song name instead.",
  );
}
