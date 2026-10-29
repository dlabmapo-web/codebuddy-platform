import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, cp, readdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(root, "packages/api/package.json"));
const pyodide = dirname(require.resolve("pyodide/package.json"));
const base = resolve(root, "packages/grading-runtime/guest");
const out = resolve(base, "artifacts");
await mkdir(out, { recursive: true });
const runner = await readFile(
  resolve(root, "packages/api/src/judge/pyodide-runner.ts"),
  "utf8",
);
await writeFile(
  resolve(out, "pyodide-runner.mjs"),
  ts.transpileModule(
    runner.replace('from "pyodide"', 'from "/opt/pyodide/pyodide.mjs"'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText,
);
await cp(pyodide, resolve(out, "pyodide"), {
  recursive: true,
  dereference: true,
});
const sha = (v) => "sha256:" + createHash("sha256").update(v).digest("hex");
async function hashes(dir) {
  const result = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await hashes(path)));
    else if (entry.isFile())
      result.push([relative(base, path), sha(await readFile(path))]);
    else throw new Error("Unexpected artifact type");
  }
  return result;
}
for (const engine of ["cpython", "pyodide"]) {
  const sources = [
    "gated-launcher.c",
    "supervisor.py",
    "seccomp.json",
    engine === "cpython" ? "native.py" : "artifacts/pyodide-runner.mjs",
  ];
  const entries = await Promise.all(
    sources.map(async (p) => [p, sha(await readFile(resolve(base, p)))]),
  );
  if (engine === "pyodide") {
    entries.push(["upstream/pyodide-runner.ts", sha(runner)]);
    entries.push(...(await hashes(resolve(out, "pyodide"))));
  }
  const manifest = {
    version: 1,
    engine,
    pythonBaseIndex:
      "sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337",
    sources: entries,
  };
  const raw = JSON.stringify(manifest);
  await writeFile(resolve(out, engine + "-manifest.json"), raw + "\n");
  const identity = {
    engine,
    engineVersion:
      engine === "cpython"
        ? "3.12.16"
        : JSON.parse(await readFile(resolve(pyodide, "package.json"), "utf8"))
            .version,
    pythonVersion: engine === "cpython" ? "3.12.16" : "3.12.7",
    packageManifestHash: sha(raw),
    shimVersion: "cove-guest-1",
  };
  await writeFile(
    resolve(out, engine + "-identity.json"),
    JSON.stringify(identity) + "\n",
  );
  console.log(JSON.stringify(identity));
}
