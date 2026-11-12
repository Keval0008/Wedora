import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wedora — wedding planner",
    short_name: "Wedora",
    description: "To-dos, reminders, songs, vendors and chandla for the wedding.",
    start_url: "/today",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf5ec",
    theme_color: "#a3172a",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
