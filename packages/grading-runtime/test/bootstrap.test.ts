import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile, symlink, chmod } from "node:fs/promises";
import { rootfsDigest } from "../src/identity.js";
const bootstrap = fileURLToPath(
  new URL("../guest/bootstrap.py", import.meta.url),
);
/** Trusted synthetic semantic test only: never used for learner execution/containment. */
async function guest(code: string, stdin = "", inputPromptPolicy = "INCLUDE", timeLimitMs = 1000) {
  const child = spawn("python3", ["-I", "-B", "-u", bootstrap], {
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (b) => (stdout += b));
  child.stderr.on("data", (b) => (stderr += b));
  const gate = child.stdio[3] as Duplex;
  // The launcher's order: ready, then the request, the limit acknowledgement, GO.
  let control = "";
  gate.on("data", (b) => {
    control += b;
    if (control === "R")
      child.stdin.end(JSON.stringify({ code, stdin, inputPromptPolicy, timeLimitMs }));
    else if (control === "RA") gate.end("G");
  });
  const exit = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
  return { stdout, stderr, exit };
}
test("bootstrap preserves Unicode, prompt policy, binary stdin and normal exits", async () => {
  assert.deepEqual(await guest('print(input("이름: "))', "학생\n"), {
    stdout: "이름: 학생\n",
    stderr: "",
    exit: 0,
  });
  assert.deepEqual(await guest('print(input("이름: "))', "학생\n", "IGNORE"), {
    stdout: "학생\n",
    stderr: "",
    exit: 0,
  });
  assert.equal(
    (
      await guest(
        "import sys; print(sys.stdin.buffer.read().decode())",
        "bytes",
      )
    ).stdout,
    "bytes\n",
  );
  for (const code of ["import sys; sys.exit(0)", "import sys; sys.exit(None)"])
    assert.equal((await guest(code)).exit, 0);
  assert.notEqual((await guest("import sys; sys.exit(7)")).exit, 0);
});
test("bootstrap closes trusted gate before source can forge control or execute", async () => {
  const r = await guest(
    'import os\ntry:\n os.write(3,b"fake ready")\nexcept OSError:\n print("closed")\nprint("{\\"ready\\":true}")',
  );
  assert.equal(r.exit, 0);
  assert.equal(r.stdout, 'closed\n{"ready":true}\n');
  const syntax = await guest("await missing()");
  assert.notEqual(syntax.exit, 0);
  assert.match(syntax.stderr, /SyntaxError/);
  const positive = await guest(
    'import asyncio; await asyncio.sleep(0); print("ok")',
  );
  assert.notEqual(positive.exit, 0);
  assert.match(positive.stderr, /SyntaxError/);
});
test("Python and Node canonical rootfs digests agree and include symlink/mode changes", async () => {
  const dir = await mkdtemp("/tmp/cove-tree-");
  try {
    await writeFile(`${dir}/hello`, "한글");
    await symlink("hello", `${dir}/link`);
    const script = fileURLToPath(
      new URL("../guest/tree-digest.py", import.meta.url),
    );
    const python = spawn("python3", ["-B", script, dir]);
    let stdout = "";
    python.stdout.on("data", (b) => (stdout += b));
    await new Promise<void>((resolve, reject) => {
      python.once("error", reject);
      python.once("close", (code) =>
        code === 0 ? resolve() : reject(new Error("tree digest failed")),
      );
    });
    const first = await rootfsDigest(dir);
    assert.equal(stdout.trim(), first);
    await chmod(`${dir}/hello`, 0o600);
    assert.notEqual(await rootfsDigest(dir), first);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("IGNORE keeps input positional-only argument errors and script filename", async () => {
  for (const code of ["input(prompt='x')", "input('x','y')"])
    assert.match((await guest(code, "value\n", "IGNORE")).stderr, /TypeError/);
  assert.equal((await guest("print(__file__)")).stdout, "main.py\n");
});

test("SystemExit integer wrapping and monkeypatched builtins preserve failure", async () => {
  for (const value of ["256", "-256", "True", "7", "10**100"])
    assert.notEqual((await guest(`import sys; sys.exit(${value})`)).exit, 0);
  for (const value of ["0", "None", "False"])
    assert.equal((await guest(`import sys; sys.exit(${value})`)).exit, 0);
  const mutated = await guest(
    "import sys, builtins\nbuiltins.SystemExit = RuntimeError\nbuiltins.int = lambda *args: 0\nbuiltins.isinstance = lambda *args: True\nsys.exit(256)",
  );
  assert.notEqual(mutated.exit, 0);
});

test("bootstrap lowers the CPU-time rlimit to the case before acknowledging", async () => {
  const result = await guest(
    "import resource; print(resource.getrlimit(resource.RLIMIT_CPU))",
    "",
    "INCLUDE",
    2500,
  );
  assert.deepEqual(result, { stdout: "(4, 4)\n", stderr: "", exit: 0 });
  const raised = await guest(
    "import resource\ntry:\n resource.setrlimit(resource.RLIMIT_CPU, (100, 100))\nexcept ValueError:\n print('refused')",
  );
  assert.equal(raised.stdout, "refused\n");
});
test("learner globals belong to the registered __main__ without bootstrap state", async () => {
  const result = await guest(
    "x = 7\nimport __main__\nprint(__main__.x)\nprint(__main__.__dict__ is globals())\nprint(hasattr(__main__, 'run_script'), hasattr(__main__, 'payload'))",
  );
  assert.deepEqual(result, {
    stdout: "7\nTrue\nFalse False\n",
    stderr: "",
    exit: 0,
  });
});
test("learner-defined dataclasses can be pickled through registered __main__", async () => {
  const result = await guest(
    "import pickle\nfrom dataclasses import dataclass\n@dataclass\nclass Example:\n value: int\nx = Example(7)\nrestored = pickle.loads(pickle.dumps(x))\nprint(restored.value, type(restored) is Example)",
  );
  assert.deepEqual(result, { stdout: "7 True\n", stderr: "", exit: 0 });
});
