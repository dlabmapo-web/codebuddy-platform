import { build } from "esbuild";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// noVNC's npm distribution is CommonJS. Bundle it once for native browser use
// rather than letting Turbopack reinterpret its dynamic input helpers.
await build({
  plugins: [
    {
      name: "novnc-commonjs-codec-probe",
      setup(build) {
        build.onLoad(
          { filter: /lib[\/]util[\/]browser\.js$/ },
          async ({ path }) => {
            const contents = await readFile(path, "utf8");
            const probe = "await _checkWebCodecsH264DecodeSupport()";
            if (!contents.includes(probe))
              throw new Error(
                "Review noVNC codec compatibility patch after upgrading",
              );
            return { contents: contents.replace(probe, "false"), loader: "js" };
          },
        );
      },
    },
  ],
  stdin: {
    contents: 'export { default } from "@novnc/novnc/lib/rfb"; export { releaseCapture } from "@novnc/novnc/lib/util/events";',
    resolveDir: process.cwd(), sourcefile: 'cove-novnc-entry.js', loader: 'js',
  },
  bundle: true,
  format: "iife",
  globalName: "CoveVNC",
  platform: "browser",
  target: ["chrome100", "safari15"],
  minify: true,
  legalComments: "linked",
  outfile: "public/novnc-rfb.js",
});

// x11vnc uses ordinary RFB encodings; optional H264 is disabled to work around
// the upstream 1.6.0 npm CommonJS file containing a top-level await.
const root = dirname(require.resolve("@novnc/novnc/package.json"));
const notices = await Promise.all(
  (await readdir(join(root, "docs")))
    .filter((name) => name.startsWith("LICENSE"))
    .map((name) => readFile(join(root, "docs", name), "utf8")),
);
await writeFile(
  "public/novnc-LICENSE.txt",
  `noVNC 1.6.0 — optional H264 probe disabled by Cove build.\nSource: https://github.com/novnc/noVNC/tree/v1.6.0\n\n` +
    notices.join("\n\n"),
);
