import { describe, expect, it } from "vitest";
import { dedupeResults, isAllowedThumbnail, type SearchResult } from "./search";

const r = (title: string, artist: string, album = ""): SearchResult => ({
  source: "itunes",
  title,
  artist,
  album,
  thumbnailUrl: null,
  durationSec: null,
  link: null,
});

describe("dedupeResults", () => {
  it("collapses the same recording listed on several albums", () => {
    const out = dedupeResults([
      r("Kesariya (From \"Brahmastra\")", "Pritam, Arijit Singh & Amitabh Bhattacharya", "Brahmastra"),
      r("Kesariya", "Pritam, Arijit Singh & Amitabh Bhattacharya", "Kesariya - Single"),
      r("Kesariya (Dance Mix) [From \"Brahmastra\"]", "Pritam, Shashwat Singh", "Brahmastra"),
    ]);
    expect(out.map((x) => x.title)).toEqual(['Kesariya (From "Brahmastra")', 'Kesariya (Dance Mix) [From "Brahmastra"]']);
  });

  it("keeps the same title by different artists", () => {
    expect(dedupeResults([r("Dil Le Gayee", "Jassi"), r("Dil Le Gayee", "Arijit Singh")])).toHaveLength(2);
  });

  it("returns at most six", () => {
    expect(dedupeResults(Array.from({ length: 12 }, (_, i) => r(`Song ${i}`, "X")))).toHaveLength(6);
  });
});

describe("isAllowedThumbnail", () => {
  it("accepts cover art from the catalogues we search", () => {
    expect(isAllowedThumbnail("https://is1-ssl.mzstatic.com/image/thumb/Music/x/200x200bb.jpg")).toBe(true);
    expect(isAllowedThumbnail("https://i.scdn.co/image/ab67616d0000b273")).toBe(true);
    expect(isAllowedThumbnail("https://i.ytimg.com/vi/abc/mqdefault.jpg")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isAllowedThumbnail("https://evil.example/cat.jpg")).toBe(false);
    expect(isAllowedThumbnail("http://is1-ssl.mzstatic.com/x.jpg")).toBe(false);
    expect(isAllowedThumbnail("https://mzstatic.com.evil.example/x.jpg")).toBe(false);
    expect(isAllowedThumbnail("javascript:alert(1)")).toBe(false);
    expect(isAllowedThumbnail(null)).toBe(false);
  });
});
