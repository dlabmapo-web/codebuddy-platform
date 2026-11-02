/** Release gate: invoke ONLY in an isolated production-equivalent Linux fixture. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  NativeExecutionService,
  NativeExecutionClient,
  NsJailBackend,
} from "../src/index.js";
import type { NsJailOptions } from "../src/index.js";
const path = process.argv[2];
if (!path)
  throw new Error("Usage: pnpm smoke /absolute/path/to/isolated-config.json");
const config = JSON.parse(await readFile(path, "utf8")) as NsJailOptions & {
  socketPath: string;
};
const backend = new NsJailBackend(config),
  service = new NativeExecutionService({ ...config, backend });
try {
  await service.listen();
} catch (error) {
  console.error(
    JSON.stringify({
      gate: "native-linux-containment",
      status: "UNSUPPORTED_OR_FAILED",
      error: String(error),
    }),
  );
  process.exitCode = 78;
  throw error;
}
const client = new NativeExecutionClient({
  socketPath: config.socketPath,
  descriptor: config.manifest.descriptor,
  lane: "official",
});
let passed = 0;
const run = (code: string, extra = {}) =>
  client.run({
    code,
    stdin: "",
    memoryLimitMb: 128,
    timeLimitMs: 1000,
    outputLimitBytes: 1024,
    ...extra,
  });
try {
  assert.equal((await client.health()).ready, true);
  passed++;
  assert.equal(
    (await run('print(input("이름: "))', { stdin: "학생\n" })).stdout,
    "이름: 학생\n",
  );
  passed++;
  assert.equal(
    (
      await run('print(input("이름: "))', {
        stdin: "학생\n",
        inputPromptPolicy: "IGNORE",
      })
    ).stdout,
    "학생\n",
  );
  passed++;
  assert.equal(
    (await run('import asyncio; await asyncio.sleep(0); print("ok")')).outcome,
    "RUNTIME_ERROR",
  );
  passed++;
  for (const code of [
    "import sys; sys.exit(None)",
    "import sys; sys.exit(0)",
  ]) {
    assert.equal((await run(code)).outcome, "PASSED");
    passed++;
  }
  for (const code of [
    "import sys; sys.exit(7)",
    "import sys; sys.exit(256)",
    "import sys; sys.exit(-256)",
    "import sys; sys.exit(True)",
    "raise Exception('student')",
    "await missing()",
  ]) {
    assert.equal((await run(code)).outcome, "RUNTIME_ERROR");
    passed++;
  }
  assert.equal(
    (await run("import os; print(sorted(os.environ)); print(os.getuid())"))
      .stdout,
    "['HOME', 'LANG', 'LC_ALL', 'PATH']\n65534\n",
  );
  passed++;
  assert.equal(
    (
      await run(
        'import os; print(os.path.exists("/proc"), os.path.exists("/run"), os.path.exists("/etc/shadow"))',
      )
    ).stdout,
    "False False False\n",
  );
  passed++;
  assert.equal(
    (await run('open("/persist", "w").write("x")')).outcome,
    "RUNTIME_ERROR",
  );
  passed++;
  assert.equal(
    (await run("import socket; socket.socket()")).outcome,
    "RUNTIME_ERROR",
  );
  passed++;
  assert.equal(
    (await run("import socket; socket.socket(socket.AF_UNIX)")).outcome,
    "RUNTIME_ERROR",
  );
  passed++;
  assert.equal((await run("import os; os.fork()")).outcome, "RUNTIME_ERROR");
  passed++;
  assert.equal(
    (
      await run(
        "import threading; threading.Thread(target=lambda: None).start()",
      )
    ).outcome,
    "RUNTIME_ERROR",
  );
  passed++;
  assert.equal(
    (await run('import os; os.write(3,b"{\\"ready\\":true}")')).outcome,
    "RUNTIME_ERROR",
  );
  passed++;
  assert.equal(
    (await run("while True: pass", { timeLimitMs: 50 })).outcome,
    "TIME_LIMIT",
  );
  passed++;
  assert.equal(
    (await run("import time; time.sleep(10)", { timeLimitMs: 50 })).outcome,
    "TIME_LIMIT",
  );
  passed++;
  assert.equal(
    (
      await run("x=[]\nwhile True: x.append(bytearray(10*1024*1024))", {
        memoryLimitMb: 32,
        timeLimitMs: 2000,
      })
    ).outcome,
    "MEMORY_LIMIT",
  );
  passed++;
  const flood = await run('print("한"*10000)', { outputLimitBytes: 100 });
  assert.equal(flood.outputTruncated, true);
  assert.ok(Buffer.byteLength(flood.stdout) <= 100);
  passed++;
  await run('open("/tmp/private", "w").write("first")');
  assert.equal(
    (await run('import os; print(os.path.exists("/tmp/private"))')).stdout,
    "False\n",
  );
  passed++;
  const pair = await Promise.all([
    run('open("/tmp/private", "w").write("a"); print("a")'),
    run('open("/tmp/private", "w").write("b"); print("b")'),
  ]);
  assert.deepEqual(
    pair.map((r) => r.stdout),
    ["a\n", "b\n"],
  );
  passed++;
  const cancellation = new AbortController();
  const cancelled = run("while True: pass", {
    signal: cancellation.signal,
    timeLimitMs: 5000,
  });
  setTimeout(() => cancellation.abort(), 100);
  await assert.rejects(cancelled);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await client.health()).active, 0);
  passed++;
  assert.equal(
    (await readdir(config.cgroupRoot)).filter((x) => x.startsWith("case-"))
      .length,
    0,
  );
  passed++;
  console.log(
    JSON.stringify({
      gate: "native-linux-containment",
      status: "PASS",
      passed,
      descriptor: config.manifest.descriptor,
    }),
  );
} finally {
  await client.dispose();
  await service.close();
}
