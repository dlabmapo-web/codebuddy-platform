import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { COMPARATOR_HARNESS } from "./comparator-runner.js";

export const COMPARATOR_SEMANTICS_VERSION = "cove-python-comparator-v1";
/** Measured from the actual trusted package assets and harness, also used by manifest generation. */
export async function actualComparatorIdentity() {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("pyodide/package.json"));
  const hash = createHash("sha256");
  for (const file of ["package.json", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "pyodide-lock.json", "python_stdlib.zip"]) {
    const bytes = await readFile(join(root, file));
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  hash.update(`harness\0${COMPARATOR_HARNESS}`);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
  return { engine: "pyodide" as const, version: pkg.version, packageDigest: `sha256:${hash.digest("hex")}`, semanticsVersion: COMPARATOR_SEMANTICS_VERSION };
}
