// Explicit destructive-to-fixture test: config must point to an otherwise idle,
// isolated delegated envelope. Never use a production/shared launcher config.
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { NativeExecutionClient, NsJailBackend } from "../dist/index.js";
const path = process.argv[2];
if (!path) throw new Error("Supply isolated crash-fixture config");
const config = JSON.parse(await readFile(path, "utf8"));
const service = spawn(
  process.execPath,
  [fileURLToPath(new URL("../dist/main.js", import.meta.url)), path],
  { stdio: ["ignore", "ignore", "pipe"], shell: false },
);
const client = new NativeExecutionClient({
  socketPath: config.socketPath,
  descriptor: config.manifest.descriptor,
  lane: "official",
});
const groups = async () =>
  (await readdir(config.cgroupRoot)).filter((x) => x.startsWith("case-"));
try {
  for (let tries = 0; ; tries++) {
    try {
      assert.equal((await client.health()).ready, true);
      break;
    } catch (error) {
      if (tries > 100) throw error;
      await delay(100);
    }
  }
  const run = client.run({
    code: "import time; time.sleep(60)",
    stdin: "",
    memoryLimitMb: 128,
    timeLimitMs: 2000,
  });
  void run.catch(() => {});
  for (let tries = 0; !(await groups()).length; tries++) {
    if (tries > 100) throw new Error("Case never allocated");
    await delay(10);
  }
  await delay(200);
  service.kill("SIGKILL");
  await assert.rejects(run);
  // NsJail's independent failsafe is <= startup + budget + cleanup + one tick.
  const end = performance.now() + 19_000;
  for (;;) {
    const events = await Promise.all(
      (await groups()).map((g) =>
        readFile(`${config.cgroupRoot}/${g}/cgroup.events`, "utf8"),
      ),
    );
    if (events.every((x) => /^populated 0$/m.test(x))) break;
    if (performance.now() > end)
      throw new Error("Launcher crash leaked live learner processes");
    await delay(100);
  }
  assert.ok(
    (await groups()).length > 0,
    "Retain crash evidence until reviewed cleanup",
  );
  await assert.rejects(
    new NsJailBackend(config).prepare(),
    /Stale case cgroup|unaccounted allocations|Launcher must run/,
  );
  console.log(
    JSON.stringify({
      gate: "launcher-crash",
      status: "PASS",
      cleanup: "Stale empty case remains; new readiness refused",
    }),
  );
} finally {
  service.kill("SIGKILL");
  await client.dispose();
}
