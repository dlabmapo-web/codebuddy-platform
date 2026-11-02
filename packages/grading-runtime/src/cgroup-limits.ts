import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NativeInfrastructureError } from "./contract.js";
import { readControl } from "./cgroups.js";

type Budget = { envelopeMemoryMb: number; cpuSlots: number };
export interface CgroupLimitReader {
  read(path: string): Promise<string>;
  mountInfo(): Promise<string>;
}
const systemReader: CgroupLimitReader = {
  read: readControl,
  mountInfo: () => readFile("/proc/self/mountinfo", "utf8"),
};
const unescapeMount = (value: string) =>
  value.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(parseInt(octal, 8)),
  );

/** The owned envelope always needs finite controls, even at a mount boundary. */
export async function verifyCgroupLimits(
  envelope: string,
  budget: Budget,
  io: CgroupLimitReader = systemReader,
): Promise<void> {
  if (
    (await io.read(join(envelope, "memory.max"))) !==
      String(budget.envelopeMemoryMb * 1024 * 1024) ||
    (await io.read(join(envelope, "memory.swap.max"))) !== "0"
  )
    throw new NativeInfrastructureError(
      "Node memory envelope is not kernel enforced",
    );
  const cpuLimit = (value: string): number => {
    const match = /^(max|[1-9]\d*) ([1-9]\d*)$/.exec(value);
    if (!match) throw new NativeInfrastructureError("Invalid kernel CPU limit");
    return match[1] === "max" ? Infinity : Number(match[1]) / Number(match[2]);
  };
  if (cpuLimit(await io.read(join(envelope, "cpu.max"))) !== budget.cpuSlots)
    throw new NativeInfrastructureError(
      "Node CPU envelope is not kernel enforced",
    );

  // mountinfo distinguishes the actual hierarchy mount (root '/') from a bind
  // mount of a delegated subtree. Do not infer a root merely from ENOENT.
  const mounts = (await io.mountInfo())
    .split("\n")
    .flatMap((line) => {
      const [left, right] = line.split(" - ");
      if (right?.split(" ")[0] !== "cgroup2") return [];
      const fields = left.split(" ");
      if (fields.length < 6)
        throw new NativeInfrastructureError("Invalid cgroup mountinfo");
      const root = unescapeMount(fields[3]);
      const path = unescapeMount(fields[4]);
      return envelope === path ||
        envelope.startsWith(path === "/" ? "/" : `${path}/`)
        ? [{ root, path }]
        : [];
    })
    .sort((a, b) => b.path.length - a.path.length);
  const mount = mounts[0];
  if (!mount || mounts[1]?.path === mount.path)
    throw new NativeInfrastructureError(
      "Cgroup mount boundary cannot be established",
    );
  if (envelope === mount.path) return;

  for (let ancestor = dirname(envelope); ; ancestor = dirname(ancestor)) {
    const genuineRoot = ancestor === mount.path && mount.root === "/";
    const readLimit = async (name: string): Promise<string | undefined> => {
      try {
        return await io.read(join(ancestor, name));
      } catch (error) {
        // Non-root interfaces are absent at the genuine hierarchy root only.
        // Permission/I/O errors, missing non-root controls and delegated mounts
        // remain failures; an existing root control is still checked below.
        if (genuineRoot && (error as NodeJS.ErrnoException).code === "ENOENT")
          return;
        throw error;
      }
    };
    const memory = await readLimit("memory.max");
    if (memory !== undefined && memory !== "max") {
      if (!/^\d+$/.test(memory) || !Number.isFinite(Number(memory)))
        throw new NativeInfrastructureError("Invalid kernel memory limit");
      if (Number(memory) < budget.envelopeMemoryMb * 1024 * 1024)
        throw new NativeInfrastructureError(
          "Ancestor memory limit is below the node envelope",
        );
    }
    const cpu = await readLimit("cpu.max");
    if (cpu !== undefined && cpuLimit(cpu) < budget.cpuSlots)
      throw new NativeInfrastructureError(
        "Ancestor CPU quota is below the node envelope",
      );
    if (ancestor === mount.path) break;
    if (ancestor === dirname(ancestor))
      throw new NativeInfrastructureError(
        "Cgroup mount boundary traversal failed",
      );
  }
}
