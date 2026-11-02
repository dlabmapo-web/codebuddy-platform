import { readFile, writeFile, readdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { NativeInfrastructureError } from "./contract.js";
import { CleanupUncertainError } from "./service.js";
export const readControl = async (path: string) =>
  (await readFile(path, "utf8")).trim();
export async function childGroups(path: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true }))
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
  await writeFile(join(path, "cgroup.kill"), "1");
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
      await rmdir(p);
    };
    await remove(path);
  } catch (cause) {
    throw new CleanupUncertainError(
      "Could not prove empty and remove case cgroup",
      { cause },
    );
  }
}
