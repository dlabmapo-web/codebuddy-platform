import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import {
  runtimeDescriptorIdentity,
  brokerExecutionResultSchema,
  type RuntimeDescriptor,
  type BrokerExecutionInput,
  type BrokerExecutionResult,
} from "@cove/shared";
import { invariant } from "./errors.js";
import {
  verifyParent,
  prepareLeaf,
  limitLeaf,
  learnerOom,
  pidGroup,
  beneath,
  read,
  type LearnerLeaf,
} from "./cgroup.js";
import { join, dirname, basename } from "node:path";
import { MiB } from "./resource-bank.js";
import { BoundedCapture } from "./capture.js";
import type { Allocation, GuestDriver } from "./driver.js";
type Config = {
  socket: string;
  parent: string;
  systemdParent: string;
  daemonPidFile: string;
  daemonId: string;
  daemonDataRoot: string;
  owner: string;
  seccompPath: string;
  runtimes: readonly RuntimeDescriptor[];
};
type Live = {
  process: ChildProcessWithoutNullStreams;
  next: (signal?: AbortSignal) => Promise<Record<string, unknown>>;
  send: (v: unknown) => void;
  leaf?: LearnerLeaf;
  initPid: number;
  ready: boolean;
};
const name = (id: string) => {
  invariant(/^[a-f0-9-]{36}$/.test(id), "Invalid allocation ID");
  return `cove-grade-${id}`;
};
/** Fixed command/image/mount boundary. No caller-supplied container options. */
export function assertRootlessInfo(info: any) {
  invariant(
    info.CgroupVersion === "2" &&
      info.CgroupDriver === "systemd" &&
      info.SecurityOptions?.some((v: string) => v === "name=rootless"),
    "Requires rootless Docker with systemd cgroup v2",
  );
}
export class RootlessDriver implements GuestDriver {
  private live = new Map<string, Live>();
  private verified = false;
  private daemonPid = 0;
  private socketIdentity?: string;
  private uncertainCreates = new Set<string>();
  constructor(readonly config: Config) {
    invariant(/^[a-f0-9-]{36}$/.test(config.owner), "Invalid broker owner");
    invariant(
      config.socket.startsWith("/run/user/") && !config.socket.includes(".."),
      "Dedicated rootless socket required",
    );
    invariant(
      /^[a-zA-Z0-9_.-]+\.slice$/.test(config.systemdParent),
      "Invalid delegated systemd slice",
    );
  }
  private args(args: string[]) {
    return ["--host", `unix://${this.config.socket}`, ...args];
  }
  private command(args: string[], timeout = 15000): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn("docker", this.args(args), {
        stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
      let output = "";
      const err = new BoundedCapture(4096);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Container command timed out"));
      }, timeout);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (Buffer.byteLength(output) > 1024 * 1024) {
          child.kill("SIGKILL");
          reject(new Error("Container command output exceeded bound"));
        }
      });
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve(output.trim())
          : reject(new Error("Container command failed"));
      });
    });
  }
  private async attestEndpoint() {
    const info = JSON.parse(
      await this.command(["info", "--format", "{{json .}}"]),
    );
    assertRootlessInfo(info);
    invariant(
      info.ID === this.config.daemonId &&
        info.DockerRootDir === this.config.daemonDataRoot,
      "Dedicated daemon identity/data-root changed",
    );
    const socket = await stat(this.config.socket);
    invariant(
      socket.isSocket() && socket.uid === process.getuid?.(),
      "Daemon socket must belong to broker account",
    );
    const identity = `${socket.dev}:${socket.ino}`;
    invariant(
      !this.socketIdentity || this.socketIdentity === identity,
      "Daemon socket replaced; require restart reconciliation",
    );
    this.socketIdentity = identity;
  }
  async verify() {
    await this.attestEndpoint();
    const daemonPid = Number(
      (await readFile(this.config.daemonPidFile, "utf8")).trim(),
    );
    await verifyParent(this.config.parent, daemonPid);
    this.daemonPid = daemonPid;
    for (const runtime of this.config.runtimes) {
      const [image] = JSON.parse(
        await this.command(["image", "inspect", runtime.imageDigest]),
      );
      const labels = image.Config?.Labels;
      invariant(
        image.Id === runtime.imageDigest &&
          image.Os === "linux" &&
          image.Architecture === runtime.architecture,
        "Immutable guest image mismatch",
      );
      invariant(
        labels?.["io.cove.grading.package"] === runtime.packageManifestHash &&
          labels?.["io.cove.grading.shim"] === runtime.shimVersion &&
          labels?.["io.cove.grading.engine"] === runtime.engine &&
          labels?.["io.cove.grading.version"] === runtime.engineVersion &&
          labels?.["io.cove.grading.python"] === runtime.pythonVersion,
        "Guest package identity mismatch",
      );
    }
    this.verified = true;
  }
  async discover() {
    await this.attestEndpoint();
    const all = await this.command([
      "container",
      "ls",
      "--all",
      "--format",
      "{{.ID}}",
    ]);
    for (const id of all.split("\n").filter(Boolean)) {
      const [item] = JSON.parse(await this.command(["inspect", id]));
      invariant(
        item.Config.Labels?.["io.cove.grading.owner"] === this.config.owner,
        "Dedicated grading daemon contains an unowned container",
      );
    }
    const lines = await this.command([
      "container",
      "ls",
      "--all",
      "--filter",
      `label=io.cove.grading.owner=${this.config.owner}`,
      "--format",
      "{{.Names}}",
    ]);
    return lines
      ? lines.split("\n").map((n) => {
          invariant(
            /^cove-grade-[a-f0-9-]{36}$/.test(n),
            "Unknown owned container identity",
          );
          return n.slice(11);
        })
      : [];
  }
  async create(a: Allocation, signal: AbortSignal) {
    invariant(this.verified, "Driver not verified");
    await this.attestEndpoint();
    await verifyParent(this.config.parent, this.daemonPid);
    signal.throwIfAborted();
    invariant(
      this.config.runtimes.some(
        (r) =>
          runtimeDescriptorIdentity(r) === runtimeDescriptorIdentity(a.runtime),
      ),
      "Unregistered driver runtime",
    );
    try {
      const containerId = await this.command([
        "create",
        "--name",
        name(a.id),
        "--label",
        `io.cove.grading.owner=${this.config.owner}`,
        "--label",
        `io.cove.grading.allocation=${a.id}`,
        "--label",
        `io.cove.grading.generation=${a.generation}`,
        "--pull",
        "never",
        "--network",
        "none",
        "--read-only",
        "--cgroupns",
        "private",
        "--cgroup-parent",
        this.config.systemdParent,
        "--memory",
        String(a.budget.bytes),
        "--memory-swap",
        String(a.budget.bytes),
        "--pids-limit",
        "32",
        "--cpus",
        "1.5",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "SETUID",
        "--cap-add",
        "SETGID",
        "--cap-add",
        "KILL",
        "--security-opt",
        "no-new-privileges",
        "--security-opt",
        `seccomp=${this.config.seccompPath}`,
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=16777216,mode=1777",
        "--ulimit",
        "nofile=128:128",
        "--ulimit",
        "core=0:0",
        "--user",
        "0:0",
        "--hostname",
        "grading",
        "--env",
        `COVE_ENGINE=${a.runtime.engine}`,
        "--interactive",
        a.runtime.imageDigest,
      ]);
      invariant(
        /^[a-f0-9]{64}$/.test(containerId),
        "Invalid created immutable container ID",
      );
      a.containerId = containerId;
    } catch (e) {
      this.uncertainCreates.add(a.id);
      throw e;
    }
  }
  async ready(a: Allocation, signal: AbortSignal) {
    signal.throwIfAborted();
    const child = spawn(
      "docker",
      this.args(["start", "--attach", "--interactive", name(a.id)]),
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      },
    );
    const queue: Record<string, unknown>[] = [];
    let pending:
      | {
          resolve: (v: Record<string, unknown>) => void;
          reject: (e: Error) => void;
        }
      | undefined;
    let failure: Error | undefined;
    let bufferParts: Buffer[] = [];
    let bufferBytes = 0;
    const fail = (e: Error) => {
      failure = e;
      pending?.reject(e);
      pending = undefined;
    };
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.on("close", () => fail(new Error("Guest supervisor disconnected")));
    child.stderr.on("data", () => {});
    child.stdout.on("data", (chunk: Buffer) => {
      if (failure) return;
      let cursor = 0;
      while (cursor < chunk.length) {
        const newline = chunk.indexOf(10, cursor);
        const end = newline < 0 ? chunk.length : newline;
        const part = chunk.subarray(cursor, end);
        bufferBytes += part.length;
        if (bufferBytes > 64 * MiB) {
          fail(new Error("Guest control exceeded bound"));
          return;
        }
        bufferParts.push(part);
        cursor = end + (newline < 0 ? 0 : 1);
        if (newline < 0) break;
        const line = Buffer.concat(bufferParts, bufferBytes);
        bufferParts = [];
        bufferBytes = 0;
        try {
          const message = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(line),
          );
          if (pending) {
            pending.resolve(message);
            pending = undefined;
          } else {
            invariant(queue.length < 2, "Unexpected guest frames");
            queue.push(message);
          }
        } catch (e) {
          fail(e as Error);
        }
      }
    });
    const next = (readSignal?: AbortSignal) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        if (readSignal?.aborted) {
          reject(new Error("Guest operation cancelled"));
          return;
        }
        if (failure) {
          reject(failure);
          return;
        }
        if (queue.length) {
          resolve(queue.shift()!);
          return;
        }
        invariant(!pending, "Overlapping guest read");
        const abort = () => {
          pending?.reject(new Error("Guest operation cancelled"));
          pending = undefined;
        };
        const timer = setTimeout(() => {
          pending?.reject(new Error("Guest control timeout"));
          pending = undefined;
        }, 90000);
        readSignal?.addEventListener("abort", abort, { once: true });
        pending = {
          resolve: (v) => {
            clearTimeout(timer);
            readSignal?.removeEventListener("abort", abort);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            readSignal?.removeEventListener("abort", abort);
            reject(e);
          },
        };
      });
    const live: Live = {
      process: child,
      next,
      send: (v) => {
        child.stdin.write(`${JSON.stringify(v)}\n`);
      },
      initPid: 0,
      ready: false,
    };
    this.live.set(a.id, live);
    const gated = await next(signal);
    invariant(
      gated.type === "GATED" && Number.isSafeInteger(gated.pid),
      "Guest missing pre-init barrier",
    );
    const [inspection] = JSON.parse(
      await this.command(["inspect", name(a.id)]),
    );
    this.checkContainer(inspection, a);
    live.initPid = inspection.State.Pid;
    a.hostInitPid = live.initPid;
    a.cgroupPath = await pidGroup(live.initPid);
    invariant(
      basename(a.cgroupPath) === `docker-${inspection.Id}.scope`,
      "Guest systemd scope identity mismatch",
    );
    live.leaf = await prepareLeaf(
      this.config.parent,
      live.initPid,
      Number(gated.pid),
      a.budget.bytes,
    );
    signal.throwIfAborted();
    live.send({ type: "INIT" });
    const ready = await next(signal);
    invariant(ready.type === "READY", "Guest failed READY");
    invariant(
      ready.engine === a.runtime.engine &&
        ready.engineVersion === a.runtime.engineVersion &&
        ready.pythonVersion === a.runtime.pythonVersion &&
        ready.packageManifestHash === a.runtime.packageManifestHash &&
        ready.shimVersion === a.runtime.shimVersion,
      "Observed guest identity mismatch",
    );
    const learnerStatus = await readFile(
      `/proc/${live.leaf.pid}/status`,
      "utf8",
    );
    invariant(
      /^CapEff:\s+0+$/m.test(learnerStatus) &&
        /^NoNewPrivs:\s+1$/m.test(learnerStatus),
      "Learner privileges not dropped",
    );
    invariant(
      (await pidGroup(live.leaf.pid)) === live.leaf.learner,
      "Learner escaped before READY",
    );
    if (a.runtime.engine === "cpython")
      await limitLeaf(live.leaf, a.memoryLimitMb * MiB, a.budget.bytes);
    invariant(!(await learnerOom(live.leaf)), "OOM before checked readiness");
    live.ready = true;
  }
  private checkContainer(c: any, a: Allocation) {
    const h = c.HostConfig;
    invariant(
      c.Id === a.containerId &&
        c.Image === a.runtime.imageDigest &&
        c.Config.Labels["io.cove.grading.allocation"] === a.id &&
        c.Config.Labels["io.cove.grading.owner"] === this.config.owner,
      "Container identity mismatch",
    );
    invariant(
      h.ReadonlyRootfs &&
        h.NetworkMode === "none" &&
        h.CgroupnsMode === "private" &&
        !h.Privileged &&
        h.Memory === a.budget.bytes &&
        h.MemorySwap === a.budget.bytes &&
        h.PidsLimit === 32 &&
        h.NanoCpus === 1500000000,
      "Container isolation settings mismatch",
    );
    invariant(
      (h.Binds ?? []).length === 0 &&
        (c.Mounts ?? []).every((m: any) => m.Type === "tmpfs"),
      "Unexpected guest mount",
    );
    invariant(
      h.SecurityOpt.includes("no-new-privileges") && h.CapDrop.includes("ALL"),
      "Guest privilege boundary mismatch",
    );
  }
  async execute(
    a: Allocation,
    input: BrokerExecutionInput,
    signal: AbortSignal,
  ): Promise<BrokerExecutionResult> {
    const live = this.live.get(a.id);
    invariant(live?.ready && live.leaf, "Guest not READY_UNUSED");
    live.ready = false;
    signal.throwIfAborted();
    invariant(
      input.memoryLimitMb === a.memoryLimitMb,
      "Guest memory profile drift",
    );
    if (a.runtime.engine === "cpython")
      invariant(
        live.leaf.baseline > 0 &&
          (await read(live.leaf.learner, "memory.max")) ===
            String(live.leaf.baseline + a.memoryLimitMb * MiB) &&
          (await read(live.leaf.learner, "memory.swap.max")) === "0" &&
          (await pidGroup(live.leaf.pid)) === live.leaf.learner,
        "READY learner limit changed",
      );
    invariant(!(await learnerOom(live.leaf)), "OOM while guest was unused");
    const abort = () => live.process.stdin.destroy();
    signal.addEventListener("abort", abort, { once: true });
    try {
      live.send({ type: "RUN", input });
      const response = await live.next(signal);
      signal.throwIfAborted();
      invariant(response.type === "RESULT", "Invalid supervisor result");
      const result = brokerExecutionResultSchema.parse(response.result);
      const oom = await learnerOom(live.leaf);
      if (a.runtime.engine === "cpython" && oom)
        result.outcome = "MEMORY_LIMIT";
      else
        invariant(
          !oom,
          "Compatibility hard ceiling OOM is infrastructure failure",
        );
      return result;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
  async remove(id: string, facts?: Allocation) {
    await this.attestEndpoint();
    const matches = await this.command([
      "container",
      "ls",
      "--all",
      "--filter",
      `name=^/${name(id)}$`,
      "--format",
      "{{.ID}}",
    ]);
    if (!matches)
      invariant(
        !this.uncertainCreates.has(id) && facts?.creationState !== "creating",
        "Ambiguous create has no confirmed container identity",
      );
    let group = facts?.cgroupPath ?? this.live.get(id)?.leaf?.parent;
    if (group)
      invariant(
        beneath(this.config.parent, group) &&
          (!facts?.containerId ||
            basename(group) === `docker-${facts.containerId}.scope`),
        "Stored cgroup ownership mismatch",
      );
    if (matches) {
      const [inspection] = JSON.parse(
        await this.command(["inspect", name(id)]),
      );
      invariant(
        (!facts?.containerId || inspection.Id === facts.containerId) &&
          inspection.Config.Labels["io.cove.grading.owner"] ===
            this.config.owner &&
          inspection.Config.Labels["io.cove.grading.allocation"] === id,
        "Refusing removal of foreign container",
      );
      if (inspection.State.Running) {
        const current = await pidGroup(inspection.State.Pid);
        const actual =
          basename(current) === "control" ? dirname(current) : current;
        invariant(
          !group || group === actual,
          "Guest cgroup changed before cleanup",
        );
        group = actual;
        invariant(
          basename(group) === `docker-${inspection.Id}.scope`,
          "Cleanup scope identity mismatch",
        );
        invariant(
          beneath(this.config.parent, group),
          "Refusing cleanup outside execution family",
        );
        await writeFile(join(group, "cgroup.kill"), "1");
      }
      await this.command(["rm", "--force", inspection.Id]);
      this.uncertainCreates.delete(id);
    }
    invariant(
      !(await this.command([
        "container",
        "ls",
        "--all",
        "--filter",
        `name=^/${name(id)}$`,
        "--format",
        "{{.ID}}",
      ])),
      "Removal not acknowledged",
    );
    if (group) {
      try {
        const events = await read(group, "cgroup.events");
        invariant(
          /^populated 0$/m.test(events),
          "Descendants remain after container removal",
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    await this.attestEndpoint();
    if (facts) facts.creationState = "removed";
    const live = this.live.get(id);
    if (live) {
      live.process.kill("SIGKILL");
      this.live.delete(id);
    }
  }
}
