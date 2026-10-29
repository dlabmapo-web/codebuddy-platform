import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { invariant } from "./errors.js";
import { MiB } from "./resource-bank.js";
export async function read(path: string, name: string) {
  return (await readFile(join(path, name), "utf8")).trim();
}
export async function counter(path: string, key: string) {
  const text = await read(path, "memory.events.local");
  const match = new RegExp(`^${key} (\\d+)$`, "m").exec(text);
  invariant(match, "Missing cgroup event counter");
  return Number(match[1]);
}
export async function pidGroup(pid: number) {
  invariant(Number.isSafeInteger(pid) && pid > 0, "Invalid PID");
  const data = await readFile(`/proc/${pid}/cgroup`, "utf8");
  const match = /^0::(\/[^\n]*)$/m.exec(data);
  invariant(match, "Missing unified cgroup mapping");
  return realpath(join("/sys/fs/cgroup", match[1]));
}
export function beneath(parent: string, child: string) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
export async function verifyParent(parent: string, daemonPid: number) {
  invariant(
    process.platform === "linux" && process.getuid?.() !== 0,
    "Dedicated non-root Linux broker required",
  );
  invariant(parent.startsWith("/sys/fs/cgroup/"), "Invalid parent path");
  invariant((await realpath(parent)) === parent, "Parent cannot be a symlink");
  const controllers = (await read(parent, "cgroup.controllers")).split(" ");
  invariant(
    ["cpu", "memory", "pids"].every((c) => controllers.includes(c)),
    "Missing delegated controllers",
  );
  invariant(
    (await read(parent, "memory.max")) === String(1280 * MiB),
    "Execution family memory ceiling mismatch",
  );
  invariant(
    (await read(parent, "memory.swap.max")) === "0",
    "Execution family swap must be zero",
  );
  invariant(
    (await read(parent, "pids.max")) === "256",
    "Execution family PID ceiling mismatch",
  );
  const cpu = (await read(parent, "cpu.max")).split(" ").map(Number);
  invariant(
    cpu.length === 2 && cpu[0] / cpu[1] === 1.5,
    "Execution CPU ceiling mismatch",
  );
  for (const pid of [process.pid, daemonPid])
    invariant(
      beneath(parent, await pidGroup(pid)),
      "Broker/daemon not contained in execution parent",
    );
}
export type LearnerLeaf = {
  family: string;
  familyOom: number;
  parent: string;
  control: string;
  learner: string;
  pid: number;
  baseline: number;
  oom: number;
  parentOom: number;
  controlOom: number;
};
export async function prepareLeaf(
  family: string,
  initPid: number,
  namespacePid: number,
  hardBytes: number,
): Promise<LearnerLeaf> {
  const parent = await pidGroup(initPid);
  invariant(beneath(family, parent), "Guest escaped execution parent");
  invariant(
    (await read(parent, "memory.max")) === String(hardBytes),
    "Guest hard ceiling ignored",
  );
  invariant(
    (await read(parent, "memory.swap.max")) === "0" &&
      (await read(parent, "pids.max")) === "32",
    "Guest limits ignored",
  );
  const children = (
    await readFile(`/proc/${initPid}/task/${initPid}/children`, "utf8")
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
  invariant(children.length === 1, "Unexpected pre-init children");
  const pid = children[0]!;
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  const ns = /^NSpid:\s+(.+)$/m.exec(status);
  invariant(
    ns && Number(ns[1].trim().split(/\s+/).at(-1)) === namespacePid,
    "Learner namespace PID mismatch",
  );
  invariant(
    (await pidGroup(pid)) === parent,
    "Learner initial cgroup mismatch",
  );
  const control = join(parent, "control"),
    learner = join(parent, "learner");
  await mkdir(control);
  await mkdir(learner);
  await writeFile(join(control, "cgroup.procs"), String(initPid));
  await writeFile(join(learner, "cgroup.procs"), String(pid));
  await writeFile(join(parent, "cgroup.subtree_control"), "+memory +pids +cpu");
  await writeFile(join(learner, "memory.swap.max"), "0");
  await writeFile(join(learner, "memory.oom.group"), "1");
  invariant(
    (await pidGroup(pid)) === learner && (await pidGroup(initPid)) === control,
    "Leaf assignment failed",
  );
  return {
    family,
    familyOom: await counter(family, "oom"),
    parent,
    control,
    learner,
    pid,
    baseline: 0,
    oom: await counter(learner, "oom_kill"),
    parentOom: await counter(parent, "oom"),
    controlOom: await counter(control, "oom"),
  };
}
export async function limitLeaf(
  leaf: LearnerLeaf,
  allowance: number,
  hardBytes: number,
) {
  invariant(
    (await pidGroup(leaf.pid)) === leaf.learner,
    "Learner moved before READY",
  );
  const baseline = Number(await read(leaf.learner, "memory.current"));
  invariant(
    Number.isSafeInteger(baseline) &&
      baseline > 0 &&
      baseline + allowance + 64 * MiB <= hardBytes,
    "READY baseline exceeds funded headroom",
  );
  leaf.baseline = baseline;
  await writeFile(
    join(leaf.learner, "memory.max"),
    String(baseline + allowance),
  );
  invariant(
    (await read(leaf.learner, "memory.max")) === String(baseline + allowance) &&
      (await read(leaf.learner, "memory.swap.max")) === "0",
    "Learner kernel ceiling unproved",
  );
  leaf.oom = await counter(leaf.learner, "oom_kill");
}
export async function learnerOom(leaf: LearnerLeaf) {
  // Parent-local `oom`, not `oom_kill`: the latter counts victims in that
  // cgroup and can be zero when a parent OOM kills a descendant learner.

  invariant(
    (await counter(leaf.family, "oom")) === leaf.familyOom &&
      (await counter(leaf.parent, "oom")) === leaf.parentOom &&
      (await counter(leaf.control, "oom")) === leaf.controlOom,
    "Guest parent/control OOM is infrastructure failure",
  );
  return (await counter(leaf.learner, "oom_kill")) > leaf.oom;
}
