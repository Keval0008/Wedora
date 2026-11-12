import { describe, expect, it } from "vitest";
import { extractLink, parseSongLink } from "./parse-link";

const SP = "4cOdK2wGLETKBW3PvgPWqT";
const YT = "dQw4w9WgXcQ";

const ok = (input: string) => {
  const r = parseSongLink(input);
  if (!r.ok) throw new Error(`expected ok for ${input}: ${r.message}`);
  return r;
};

describe("parseSongLink — Spotify", () => {
  it.each([
    `https://open.spotify.com/track/${SP}`,
    `https://open.spotify.com/track/${SP}?si=a1b2c3d4e5f6`,
    `https://open.spotify.com/intl-de/track/${SP}?si=x`,
    `https://open.spotify.com/intl-pt-BR/track/${SP}`,
    `open.spotify.com/track/${SP}`,
    `https://open.spotify.com/embed/track/${SP}`,
    `spotify:track:${SP}`,
    `https://play.spotify.com/track/${SP}`,
  ])("reads %s", (input) => {
    const r = ok(input);
    expect(r.platform).toBe("spotify");
    if (r.platform === "spotify") expect(r.id).toBe(SP);
  });

  it("finds the link inside a WhatsApp share text", () => {
    const r = ok(`Listen to Kesariya on Spotify: https://open.spotify.com/track/${SP}?si=abc. Love it!`);
    expect(r.platform === "spotify" && r.id).toBe(SP);
  });

  it("marks short links for resolving", () => {
    expect(ok("https://spotify.link/AbCdEf123").platform).toBe("spotify-short");
  });

  it("rejects playlists and albums with a friendly reason", () => {
    const p = parseSongLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    expect(p.ok).toBe(false);
    expect(!p.ok && p.reason).toBe("playlist");
    const a = parseSongLink("https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo");
    expect(!a.ok && a.reason).toBe("album");
  });

  it("rejects artists and podcast episodes", () => {
    expect(parseSongLink("https://open.spotify.com/artist/4YRxDV8wJFPHPTeXepOstw").ok).toBe(false);
    expect(parseSongLink("https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ").ok).toBe(false);
  });
});

describe("parseSongLink — YouTube", () => {
  it.each([
    `https://www.youtube.com/watch?v=${YT}`,
    `https://youtube.com/watch?v=${YT}&list=RDdQw4w9WgXcQ&start_radio=1`,
    `https://music.youtube.com/watch?v=${YT}&feature=share`,
    `https://m.youtube.com/watch?v=${YT}`,
    `https://youtu.be/${YT}?si=Zx91`,
    `https://www.youtube.com/shorts/${YT}`,
    `https://www.youtube.com/embed/${YT}`,
    `https://www.youtube.com/live/${YT}`,
    `https://www.youtube.com/watch?app=desktop&v=${YT}`,
    `youtu.be/${YT}`,
  ])("reads %s", (input) => {
    const r = ok(input);
    expect(r.platform).toBe("youtube");
    if (r.platform === "youtube") expect(r.id).toBe(YT);
  });

  it("rejects playlists", () => {
    const r = parseSongLink("https://music.youtube.com/playlist?list=OLAK5uy_abc");
    expect(!r.ok && r.reason).toBe("playlist");
  });

  it("rejects channels", () => {
    expect(parseSongLink("https://www.youtube.com/@TSeries").ok).toBe(false);
  });
});

describe("parseSongLink — everything else", () => {
  it("says which apps work for other music links", () => {
    const r = parseSongLink("https://www.jiosaavn.com/song/kesariya/abc");
    expect(!r.ok && r.reason).toBe("unsupported");
  });

  it("handles text with no link", () => {
    expect(parseSongLink("kesariya please!!").ok).toBe(false);
    expect(parseSongLink("").ok).toBe(false);
  });

  it("strips trailing punctuation from a link in a sentence", () => {
    expect(extractLink(`(https://youtu.be/${YT}).`)).toBe(`https://youtu.be/${YT}`);
  });
});
