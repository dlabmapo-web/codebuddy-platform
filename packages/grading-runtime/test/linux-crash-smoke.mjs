// Explicit destructive-to-fixture test: config must point to an otherwise idle,
// isolated delegated envelope. Never use a production/shared launcher config.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Export the qualification flow so focused fixtures can exercise its failure
// paths without claiming real Linux/NsJail containment.
export async function qualifyLauncherCrash({
  config,
  service,
  client,
  backend,
  markerTimeoutMs = 15_000,
  pollMs = 10,
  procRoot = "/proc",
  log = console.log,
}) {
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
      code: 'open("/tmp/native-crash-started","w").write("started"); import time; time.sleep(60)',
      stdin: "",
      memoryLimitMb: 128,
      timeLimitMs: 2000,
    });
    void run.catch(() => {});
    // Cgroup creation precedes spawn, readiness, kernel verification and GO.
    // Only this known learner's marker in its private tmpfs proves execution.
    const markerDeadline = performance.now() + markerTimeoutMs;
    let runningPid;
    while (!runningPid) {
      for (const group of await groups()) {
        const directory = join(config.cgroupRoot, group);
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const pids = (await readFile(join(directory, entry.name, "cgroup.procs"), "utf8"))
            .trim().split(/\s+/).filter(Boolean);
          for (const pid of pids) {
            try {
              if (await readFile(join(procRoot, pid, "root/tmp/native-crash-started"), "utf8") === "started")
                runningPid = pid;
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
          }
        }
      }
      if (performance.now() > markerDeadline)
        throw new Error("Known fixture source never proved running before crash");
      if (!runningPid) await delay(pollMs);
    }
    service.kill("SIGKILL");
    await assert.rejects(run);
    // NsJail's independent failsafe is <= startup + budget + cleanup + one tick.
    const end = performance.now() + 19_000;
    for (;;) {
      const events = await Promise.all(
        (await groups()).map((g) =>
          readFile(join(config.cgroupRoot, g, "cgroup.events"), "utf8"),
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
      backend.prepare(),
      /Stale case cgroup requires verified cleanup before readiness/,
    );
    log(JSON.stringify({
      gate: "launcher-crash",
      status: "PASS",
      sourceReachedExecution: true,
      cleanup: "Stale empty case remains; new readiness refused",
    }));
  } finally {
    service.kill("SIGKILL");
    await client.dispose();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error("Supply isolated crash-fixture config");
  const config = JSON.parse(await readFile(path, "utf8"));
  const { NativeExecutionClient, NsJailBackend } = await import("../dist/index.js");
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
  await qualifyLauncherCrash({ config, service, client, backend: new NsJailBackend(config) });
}
