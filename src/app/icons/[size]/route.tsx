import { ImageResponse } from "next/og";

const SIZES = new Set([96, 180, 192, 512]);

/** PNG app icons for Android, iOS and notification badges: a marigold on kumkum red. */
export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = SIZES.has(Number(raw)) ? Number(raw) : 192;
  const petal = size * 0.17;
  const ring = size * 0.19;
  const petals = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { x: size / 2 + Math.cos(a) * ring - petal / 2, y: size / 2 + Math.sin(a) * ring - petal / 2 };
  });

  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", position: "relative", background: "#a3172a" }}>
        <div
          style={{
            position: "absolute",
            left: size * 0.2,
            top: size * 0.2,
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: size,
            background: "#f2a516",
          }}
        />
        {petals.map((p, i) => (
          <div
            key={i}
            style={{ position: "absolute", left: p.x, top: p.y, width: petal, height: petal, borderRadius: size, background: "#c77c00" }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: size * 0.38,
            top: size * 0.38,
            width: size * 0.24,
            height: size * 0.24,
            borderRadius: size,
            background: "#f6c35c",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: size * 0.45,
            top: size * 0.45,
            width: size * 0.1,
            height: size * 0.1,
            borderRadius: size,
            background: "#a3172a",
          }}
        />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
