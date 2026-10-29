import { test } from "node:test";
import assert from "node:assert/strict";
import { RootlessDriver } from "../dist/rootless-driver.js";
import { verifyParent, beneath } from "../dist/cgroup.js";
import { native } from "./fixtures.mjs";
test("rootless driver rejects mutable and arbitrary deployment parameters", () => {
  assert.throws(
    () =>
      new RootlessDriver({
        socket: "/var/run/docker.sock",
        parent: "/sys/fs/cgroup/x",
        systemdParent: "x.slice",
        owner: "10000000-0000-4000-8000-000000000001",
        seccompPath: "/profile",
        daemonPidFile: "/pid",
        runtimes: [native],
      }),
  );
  assert.equal(
    beneath("/sys/fs/cgroup/grade", "/sys/fs/cgroup/grade-other/child"),
    false,
  );
  assert.equal(
    beneath("/sys/fs/cgroup/grade", "/sys/fs/cgroup/grade/guest"),
    true,
  );
});
test(
  "this non-Linux host cannot attest native containment",
  { skip: process.platform === "linux" },
  async () => {
    await assert.rejects(
      verifyParent("/sys/fs/cgroup/grading.slice", process.pid),
      /non-root Linux/,
    );
  },
);
test("changed daemon attestation stops cleanup before any removal command", async () => {
  const driver = new RootlessDriver({
    socket: "/run/user/1000/grading/docker.sock",
    parent: "/sys/fs/cgroup/grading.slice",
    systemdParent: "grading.slice",
    owner: "10000000-0000-4000-8000-000000000001",
    seccompPath: "/profile",
    daemonPidFile: "/pid",
    daemonId: "expected",
    daemonDataRoot: "/data/grading",
    runtimes: [native],
  });
  let commands = 0;
  driver.command = async () => {
    commands++;
    return "";
  };
  driver.attestEndpoint = async () => {
    throw new Error("Dedicated daemon identity/data-root changed");
  };
  await assert.rejects(
    driver.remove("10000000-0000-4000-8000-000000000002"),
    /identity\/data-root changed/,
  );
  assert.equal(commands, 0);
});
test("parent-local OOM cannot masquerade as a learner verdict when its victim is a descendant", async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { learnerOom } = await import("../dist/cgroup.js");
  const root = await mkdtemp(join(tmpdir(), "cove-cgroup-counters-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const leaf = {
    family: join(root, "family"),
    parent: join(root, "guest"),
    control: join(root, "control"),
    learner: join(root, "learner"),
    familyOom: 0,
    parentOom: 0,
    controlOom: 0,
    oom: 0,
    pid: 1,
    baseline: 100,
  };
  for (const path of [leaf.family, leaf.parent, leaf.control, leaf.learner]) {
    await mkdir(path);
    await writeFile(join(path, "memory.events.local"), "oom 0\noom_kill 0\n");
  }
  await writeFile(
    join(leaf.learner, "memory.events.local"),
    "oom 1\noom_kill 1\n",
  );
  assert.equal(await learnerOom(leaf), true);
  await writeFile(
    join(leaf.parent, "memory.events.local"),
    "oom 1\noom_kill 0\n",
  );
  await assert.rejects(learnerOom(leaf), /infrastructure/);
});
