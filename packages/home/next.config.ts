import type { NextConfig } from "next";

/*
 * Deliberately thin.
 *
 * Note what is *not* here: `@cove/web` sets `Cross-Origin-Embedder-Policy:
 * require-corp` across every path so Pyodide can reach `SharedArrayBuffer`.
 * That header blocks every cross-origin embed — a map, a video, a tag
 * manager — which a marketing site eventually wants. Not inheriting it is one
 * of the reasons this is a separate app rather than a route group.
 * See docs/superpowers/specs/2026-08-11-coveedu-marketing-site-design.md §1.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@cove/i18n"],
};

export default nextConfig;
