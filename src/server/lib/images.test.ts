import { describe, expect, it } from "vitest";
import { sniffImage } from "./images";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("sniffImage", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses anything else, whatever it is called", () => {
    expect(sniffImage(text("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(sniffImage(text("%PDF-1.7"))).toBeNull();
    expect(sniffImage(text("<html><script>"))).toBeNull();
    expect(sniffImage(bytes())).toBeNull();
  });
});
