import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The home folder has its own package-lock.json; this app's root is here.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  // Native-ish Node packages: load them from node_modules at runtime instead of bundling.
  serverExternalPackages: ["mysql2", "web-push"],
  async headers() {
    return [
      {
        // The service worker must never be cached, or a fix would take days to reach phones.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
