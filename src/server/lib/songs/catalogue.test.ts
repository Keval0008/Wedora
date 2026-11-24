import { describe, expect, it } from "vitest";
import { fromItunes, itunesSearchUrl } from "./catalogue";

describe("itunesSearchUrl", () => {
  it("searches songs in the India store and encodes the term", () => {
    const u = new URL(itunesSearchUrl("tum hi ho & more"));
    expect(u.hostname).toBe("itunes.apple.com");
    expect(u.searchParams.get("country")).toBe("IN");
    expect(u.searchParams.get("entity")).toBe("song");
    expect(u.searchParams.get("term")).toBe("tum hi ho & more");
  });
});

describe("fromItunes", () => {
  it("maps a track and asks for bigger cover art", () => {
    const [r] = fromItunes({
      results: [
        {
          trackName: 'Kesariya (From "Brahmastra")',
          artistName: "Pritam",
          collectionName: "Brahmastra",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
          trackTimeMillis: 268_400,
        },
      ],
    });
    expect(r).toEqual({
      source: "itunes",
      title: 'Kesariya (From "Brahmastra")',
      artist: "Pritam",
      album: "Brahmastra",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/x/200x200bb.jpg",
      durationSec: 268,
      link: null,
    });
  });

  it("skips entries without a track name and tolerates an empty answer", () => {
    expect(fromItunes({ results: [{ artistName: "Someone" }] })).toEqual([]);
    expect(fromItunes(null)).toEqual([]);
    expect(fromItunes({})).toEqual([]);
  });
});
