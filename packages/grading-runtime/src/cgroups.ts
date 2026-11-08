import { readFileSync, writeFileSync, readdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { NativeInfrastructureError } from "./contract.js";
import { CleanupUncertainError } from "./service.js";
/*
 * Cgroup and /proc control files are kernel pseudo-files answered from memory,
 * never a disk. Each case touches about forty; accessing them synchronously
 * avoids a thread-pool round trip and a promise for every one.
 */
export const readControl = async (path: string) =>
  readFileSync(path, "utf8").trim();
export const writeControl = (path: string, value: string) =>
  writeFileSync(path, value);
export async function childGroups(path: string): Promise<string[]> {
  return readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(path, e.name));
}
export async function cpuUsec(path: string): Promise<number> {
  const stat = await readControl(join(path, "cpu.stat"));
  const match = /^usage_usec (\d+)$/m.exec(stat);
  if (!match)
    throw new NativeInfrastructureError("Missing kernel CPU accounting");
  return Number(match[1]);
}
export async function oomKills(path: string): Promise<number> {
  const events = await readControl(join(path, "memory.events"));
  const match = /^oom_kill (\d+)$/m.exec(events);
  if (!match)
    throw new NativeInfrastructureError("Missing kernel OOM accounting");
  return Number(match[1]);
}
export async function killCgroup(path: string) {
  writeControl(join(path, "cgroup.kill"), "1");
}
export async function cleanupCgroup(path: string, timeoutMs = 5000) {
  const end = performance.now() + timeoutMs;
  try {
    await killCgroup(path);
    while (
      !/^populated 0$/m.test(await readControl(join(path, "cgroup.events")))
    ) {
      if (performance.now() >= end) throw new Error("Cgroup still populated");
      await delay(10);
    }
    const remove = async (p: string) => {
      for (const child of await childGroups(p)) await remove(child);
      rmdirSync(p);
    };
    await remove(path);
  } catch (cause) {
    throw new CleanupUncertainError(
      "Could not prove empty and remove case cgroup",
      { cause },
    );
  }
}
