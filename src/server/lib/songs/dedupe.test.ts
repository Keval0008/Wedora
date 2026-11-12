import { describe, expect, it } from "vitest";
import { cleanDisplayTitle, findMatch, isNearMatch, normalizeArtist, normalizeTitle } from "./dedupe";

describe("normalizeTitle", () => {
  it("makes Spotify and YouTube titles of the same song equal", () => {
    const spotify = normalizeTitle('Kesariya (From "Brahmastra")', "Pritam, Arijit Singh, Amitabh Bhattacharya");
    const youtube = normalizeTitle(
      "Kesariya - Brahmastra | Ranbir Kapoor | Alia Bhatt | Pritam | Arijit Singh | Amitabh Bhattacharya",
      "Sony Music India",
    );
    expect(spotify).toBe("kesariya");
    expect(youtube).toBe("kesariya");
  });

  it("drops upload noise", () => {
    expect(normalizeTitle("Badtameez Dil Full Song | Yeh Jawaani Hai Deewani | Ranbir Kapoor, Deepika Padukone")).toBe("badtameez dil");
    expect(normalizeTitle("Kala Chashma | Baar Baar Dekho | Sidharth M Katrina K | Prem, Raag, Neha K, Badshah")).toBe("kala chashma");
    expect(normalizeTitle("Gallan Goodiyaan (Official Video) HD")).toBe("gallan goodiyaan");
    expect(normalizeTitle("London Thumakda (Full Video Song) | Queen")).toBe("london thumakda");
  });

  it("removes featured artists and Spotify version suffixes", () => {
    expect(normalizeTitle("Morni Banke (feat. Neha Kakkar)")).toBe("morni banke");
    expect(normalizeTitle("Dance Basanti - From \"Ungli\"")).toBe("dance basanti");
    expect(normalizeTitle("Mere Yaar Ki Shaadi Hai - Remastered 2002")).toBe("mere yaar ki shaadi hai");
  });

  it("uses the second segment when the first is the artist", () => {
    expect(normalizeTitle("Ed Sheeran - Perfect (Official Music Video)", "Ed Sheeran")).toBe("perfect");
  });

  it("keeps remix, mashup and other versions apart from the original", () => {
    expect(normalizeTitle("Kala Chashma (Remix)")).toBe("kala chashma remix");
    expect(normalizeTitle("Tum Hi Ho - Unplugged")).toBe("tum hi ho unplugged");
    expect(normalizeTitle("Kesariya (Lo-Fi)")).toBe("kesariya lofi");
    expect(normalizeTitle("Kala Chashma (Remix)")).not.toBe(normalizeTitle("Kala Chashma"));
  });

  it("ignores accents and apostrophes", () => {
    expect(normalizeTitle("Désí Girl")).toBe("desi girl");
    expect(normalizeTitle("Nachde Ne Saare (Baar Baar Dekho)")).toBe("nachde ne saare");
    expect(normalizeTitle("London Thumakda")).toBe(normalizeTitle("london  thumakda!"));
  });
});

describe("normalizeArtist", () => {
  it("strips YouTube's Topic channel suffix", () => {
    expect(normalizeArtist("Arijit Singh - Topic")).toBe("arijit singh");
  });
});

describe("cleanDisplayTitle", () => {
  it("drops (Official Video) and friends but keeps the useful parts", () => {
    expect(cleanDisplayTitle("Gallan Goodiyaan (Official Video) HD")).toBe("Gallan Goodiyaan HD");
    expect(cleanDisplayTitle("Kala Chashma | Baar Baar Dekho")).toBe("Kala Chashma | Baar Baar Dekho");
    expect(cleanDisplayTitle("Morni Banke (Lyrical Video)")).toBe("Morni Banke");
  });
});

describe("isNearMatch", () => {
  it("flags a title that contains the other", () => {
    expect(isNearMatch("london thumakda", "london thumakda queen")).toBe(true);
  });

  it("flags small spelling differences", () => {
    expect(isNearMatch("kesariya", "kesariyaa")).toBe(true);
  });

  it("does not flag a remix against its original", () => {
    expect(isNearMatch("kala chashma", "kala chashma remix")).toBe(false);
  });

  it("does not flag different songs", () => {
    expect(isNearMatch("kesariya", "kala chashma")).toBe(false);
    expect(isNearMatch("tum hi ho", "tum se hi")).toBe(false);
  });
});

describe("findMatch", () => {
  const existing = [
    { id: "a", normKey: "kesariya", spotifyId: "SPOTIFY000000000000001", youtubeId: null },
    { id: "b", normKey: "kala chashma", spotifyId: null, youtubeId: "yt000000001" },
    { id: "c", normKey: "london thumakda", spotifyId: null, youtubeId: null },
  ];

  it("matches the same link first", () => {
    expect(findMatch({ spotifyId: "SPOTIFY000000000000001", normKey: "whatever" }, existing)).toEqual({ type: "same-link", song: existing[0] });
  });

  it("matches the same song from the other platform by title", () => {
    expect(findMatch({ youtubeId: "ytNEW000001", normKey: "kesariya" }, existing)).toEqual({ type: "same-title", song: existing[0] });
  });

  it("reports near matches for the owner to check", () => {
    expect(findMatch({ normKey: "london thumakda queen" }, existing)).toEqual({ type: "near", song: existing[2] });
  });

  it("returns null for a new song", () => {
    expect(findMatch({ spotifyId: "SPOTIFY000000000000999", normKey: "gallan goodiyaan" }, existing)).toBeNull();
  });
});
