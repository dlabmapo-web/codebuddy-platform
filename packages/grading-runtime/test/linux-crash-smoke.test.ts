import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qualifyLauncherCrash } from "./linux-crash-smoke.mjs";

// These synthetic cgroup/proc files test qualification decisions only. They do
// not exercise Linux controls, learner execution, or NsJail crash containment.
async function fixture(t: TestContext, options: {
  marker?: string;
  restartError?: string;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "native-crash-gate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cgroupRoot = join(root, "cgroup");
  const leaf = join(cgroupRoot, "case-fixture", "leaf");
  const procRoot = join(root, "proc");
  await mkdir(leaf, { recursive: true });
  await writeFile(join(leaf, "cgroup.procs"), "123\n");
  const events = join(cgroupRoot, "case-fixture", "cgroup.events");
  await writeFile(events, "populated 1\n");
  if (options.marker !== undefined) {
    const scratch = join(procRoot, "123", "root", "tmp");
    await mkdir(scratch, { recursive: true });
    await writeFile(join(scratch, "native-crash-started"), options.marker);
  }
  const kills: string[] = [], output: string[] = [];
  let rejectRun: (error: Error) => void;
  let disposed = false, prepares = 0;
  const run = new Promise<never>((_, reject) => { rejectRun = reject; });
  // Failure-path cleanup also rejects the pending fixture request.
  void run.catch(() => {});
  return {
    kills, output,
    get disposed() { return disposed; },
    get prepares() { return prepares; },
    qualify: () => qualifyLauncherCrash({
      config: { cgroupRoot }, procRoot,
      markerTimeoutMs: options.marker === "started" ? 1000 : 40, pollMs: 1,
      service: { kill: (signal: string) => {
        kills.push(signal);
        writeFileSync(events, "populated 0\n");
        rejectRun(new Error("Fixture launcher killed"));
      } },
      client: {
        health: async () => ({ ready: true }),
        run: (request: { code: string }) => {
          assert.match(request.code, /open\("\/tmp\/native-crash-started","w"\)\.write\("started"\)/);
          return run;
        },
        dispose: async () => { disposed = true; },
      },
      backend: { prepare: async () => {
        prepares++;
        throw new Error(options.restartError ?? "Stale case cgroup requires verified cleanup before readiness");
      } },
      log: (message: string) => output.push(message),
    }),
  };
}

test("created cgroup with a learner PID but no post-GO marker cannot pass crash qualification", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.qualify(), /Known fixture source never proved running before crash/);
  assert.deepEqual(f.kills, ["SIGKILL"], "only finally cleanup may kill before execution proof");
  assert.equal(f.prepares, 0);
  assert.deepEqual(f.output, []);
  assert.equal(f.disposed, true);
});

test("an unexpected learner marker cannot certify execution", async (t) => {
  const f = await fixture(t, { marker: "not started" });
  await assert.rejects(f.qualify(), /never proved running/);
  assert.equal(f.kills.length, 1);
  assert.deepEqual(f.output, []);
});

test("post-GO marker plus expected stale-allocation refusal can pass the decision flow", async (t) => {
  const f = await fixture(t, { marker: "started" });
  await f.qualify();
  assert.deepEqual(f.kills, ["SIGKILL", "SIGKILL"]);
  assert.equal(f.prepares, 1);
  assert.equal(f.disposed, true);
  assert.deepEqual(f.output.map(line => JSON.parse(line)), [{
    gate: "launcher-crash", status: "PASS", sourceReachedExecution: true,
    cleanup: "Stale empty case remains; new readiness refused",
  }]);
});

for (const restartError of [
  "Launcher must run in a direct service leaf of the node envelope",
  "Unsupported: delegated cpu/memory/pids controls required",
  "Node envelope contains unaccounted allocations",
]) {
  test(`restart refusal cannot pass for unrelated failure: ${restartError}`, async (t) => {
    const f = await fixture(t, { marker: "started", restartError });
    await assert.rejects(f.qualify(), /Stale case cgroup requires verified cleanup before readiness/);
    assert.equal(f.prepares, 1);
    assert.deepEqual(f.output, []);
    assert.equal(f.disposed, true);
  });
}
