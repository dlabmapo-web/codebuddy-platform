import { spawn } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  readlink,
  lstat,
  statfs,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { arch, availableParallelism, totalmem } from "node:os";
import type { Duplex } from "node:stream";
import {
  nativeReleaseManifestSchema,
  type NativeReleaseManifest,
} from "@cove/shared";
import { gradingDataLimits } from "@cove/shared/grading-limits";
import {
  requestSchema,
  NativeInfrastructureError,
  type NativeExecutionRequest,
  type NativeExecutionResult,
} from "./contract.js";
import { CleanupUncertainError, type NativeBackend } from "./service.js";
import { ByteCapture } from "./framing.js";
import { jailConfig, NSJAIL_REVISION } from "./policy.js";
import { fileDigest, rootfsDigest } from "./identity.js";
import { verifyCgroupLimits } from "./cgroup-limits.js";
import { readStartupLog } from "./startup-log.js";
import {
  readControl,
  childGroups,
  cpuUsec,
  oomKills,
  killCgroup,
  cleanupCgroup,
} from "./cgroups.js";
export type NsJailOptions = {
  manifest: NativeReleaseManifest;
  nsjailPath: string;
  rootfsPath: string;
  policyPath: string;
  cgroupRoot: string;
  workRoot: string;
  startupTimeoutMs?: number;
  cleanupTimeoutMs?: number;
};
export class NsJailBackend implements NativeBackend {
  private prepared = false;
  private probing = false;
  private manifest: NativeReleaseManifest;
  private options: NsJailOptions;
  constructor(options: NsJailOptions) {
    this.manifest = nativeReleaseManifestSchema.parse(options.manifest);
    this.options = { ...options, manifest: this.manifest };
  }
  async prepare() {
    if (this.prepared) return;
    const o = this.options,
      d = this.manifest.descriptor,
      r = this.manifest.resources;
    if (process.platform !== "linux")
      throw new NativeInfrastructureError(
        "Unsupported: Linux namespaces and cgroup v2 required",
      );
    if (
      d.architecture !==
      (arch() === "arm64"
        ? "arm64"
        : arch() === "x64"
          ? "amd64"
          : "unsupported")
    )
      throw new NativeInfrastructureError("Native architecture mismatch");
    if (totalmem() / 1024 / 1024 < r.physicalMemoryMb)
      throw new NativeInfrastructureError(
        "Manifest physical memory exceeds host",
      );
    if (r.cpuSlots > availableParallelism())
      throw new NativeInfrastructureError(
        "Manifest CPU slots exceed effective CPU affinity",
      );
    if (d.nsjailRevision !== NSJAIL_REVISION)
      throw new NativeInfrastructureError("Unreviewed NsJail revision");
    for (const p of [
      o.nsjailPath,
      o.rootfsPath,
      o.policyPath,
      o.cgroupRoot,
      o.workRoot,
    ])
      if (!p.startsWith("/") || resolve(p) !== p)
        throw new NativeInfrastructureError(
          "Trusted paths must be canonical absolute paths",
        );
    if (
      (await fileDigest(o.nsjailPath)) !== d.nsjailBinaryDigest ||
      (await fileDigest(o.policyPath)) !== d.sandboxPolicyDigest ||
      (await fileDigest(join(o.rootfsPath, "opt/cove/bootstrap.py"))) !==
        d.guestBootstrapDigest ||
      (await fileDigest(join(o.rootfsPath, "opt/cove/packages.json"))) !==
        d.packageManifestDigest ||
      (await rootfsDigest(o.rootfsPath)) !== d.rootfsDigest
    )
      throw new NativeInfrastructureError(
        "Immutable native build identity mismatch",
      );
    if (Number((await statfs(o.cgroupRoot)).type) !== 0x63677270)
      throw new NativeInfrastructureError(
        "Unsupported: cgroup v2 filesystem required",
      );
    const controllers = (
      await readControl(join(o.cgroupRoot, "cgroup.subtree_control"))
    ).split(/\s+/);
    if (!["cpu", "memory", "pids"].every((x) => controllers.includes(x)))
      throw new NativeInfrastructureError(
        "Unsupported: delegated cpu/memory/pids controls required",
      );
    await verifyCgroupLimits(o.cgroupRoot, r);
    // The service must be inside the same envelope in its own leaf (no internal processes).
    const groups = await childGroups(o.cgroupRoot);
    let enclosed = false;
    for (const group of groups)
      if (
        (await readControl(join(group, "cgroup.procs")))
          .split(/\s+/)
          .includes(String(process.pid))
      )
        enclosed = true;
    for (const group of groups) {
      const pids = (await readControl(join(group, "cgroup.procs")))
        .split(/\s+/)
        .filter(Boolean);
      if (group.split("/").at(-1)?.startsWith("case-"))
        throw new NativeInfrastructureError(
          "Stale case cgroup requires verified cleanup before readiness",
        );
      if (
        !pids.includes(String(process.pid)) &&
        (pids.length ||
          /^populated 1$/m.test(
            await readControl(join(group, "cgroup.events")),
          ))
      )
        throw new NativeInfrastructureError(
          "Node envelope contains unaccounted allocations",
        );
    }
    if (
      Number(await readControl(join(o.cgroupRoot, "memory.current"))) >
      r.serviceOverheadMb * 1024 * 1024
    )
      throw new NativeInfrastructureError(
        "Service exceeds its reserved baseline memory",
      );
    if (!enclosed)
      throw new NativeInfrastructureError(
        "Launcher must run in a direct service leaf of the node envelope",
      );
    await mkdir(o.workRoot, { recursive: true, mode: 0o700 });
    const mode = await lstat(o.workRoot);
    if (
      !mode.isDirectory() ||
      mode.isSymbolicLink() ||
      (mode.mode & 0o077) !== 0 ||
      mode.uid !== process.getuid?.()
    )
      throw new NativeInfrastructureError(
        "Work root must be private and owned",
      );
    // This executes through the SAME jail path; a binary/version string alone never means ready.
    this.probing = true;
    let result: NativeExecutionResult;
    try {
      result = await this.execute(
        {
          code: "import sys; print(sys.version.split()[0])",
          stdin: "",
          timeLimitMs: 1000,
          memoryLimitMb: Math.min(128, r.maxCaseMemoryMb),
          outputLimitBytes: 128,
        },
        new AbortController().signal,
        () => {},
      );
    } finally {
      this.probing = false;
    }
    if (
      result.outcome !== "PASSED" ||
      result.stdout.trim() !== d.pythonVersion ||
      result.stderr
    )
      throw new NativeInfrastructureError(
        "Native CPython readiness probe failed",
      );
    this.prepared = true;
  }
  private async verifyGatedChild(cgroup: string, memoryMb: number) {
    const children = await childGroups(cgroup);
    if (children.length !== 1)
      throw new NativeInfrastructureError(
        "Expected exactly one gated jail cgroup",
      );
    const child = children[0],
      r = this.manifest.resources;
    if (
      (await readControl(join(child, "memory.max"))) !==
        String(memoryMb * 1024 * 1024) ||
      (await readControl(join(child, "memory.swap.max"))) !== "0" ||
      (await readControl(join(child, "pids.max"))) !== String(r.maxCasePids) ||
      (await readControl(join(child, "cpu.max"))) !== "1000000 1000000"
    )
      throw new NativeInfrastructureError("Jail kernel controls mismatch");
    const pids = (await readControl(join(child, "cgroup.procs"))).split(/\s+/);
    if (pids.length !== 1 || !/^\d+$/.test(pids[0]))
      throw new NativeInfrastructureError("Expected one gated Python process");
    const proc = `/proc/${pids[0]}`;
    const status = await readFile(`${proc}/status`, "utf8");
    if (
      !/^Uid:\s+65534\s+65534\s+65534\s+65534$/m.test(status) ||
      !/^Gid:\s+65534\s+65534\s+65534\s+65534$/m.test(status) ||
      !/^CapEff:\s+0+$/m.test(status) ||
      !/^CapPrm:\s+0+$/m.test(status) ||
      !/^CapInh:\s+0+$/m.test(status) ||
      !/^CapAmb:\s+0+$/m.test(status) ||
      !/^NoNewPrivs:\s+1$/m.test(status) ||
      !/^Seccomp:\s+2$/m.test(status)
    )
      throw new NativeInfrastructureError(
        "Guest privilege/seccomp controls absent",
      );
    const ownStatus = await readFile("/proc/self/status", "utf8");
    const ownFilters = Number(
      /^Seccomp_filters:\s+(\d+)$/m.exec(ownStatus)?.[1] ?? 0,
    );
    const guestFilters = Number(
      /^Seccomp_filters:\s+(\d+)$/m.exec(status)?.[1] ?? 0,
    );
    if (guestFilters <= ownFilters)
      throw new NativeInfrastructureError(
        "Guest seccomp filter was not installed",
      );
    for (const ns of ["mnt", "pid", "ipc", "net", "uts", "user", "cgroup"])
      if (
        (await readlink(`${proc}/ns/${ns}`)) ===
        (await readlink(`/proc/self/ns/${ns}`))
      )
        throw new NativeInfrastructureError(`Missing private ${ns} namespace`);
    const mounts = await readFile(`${proc}/mountinfo`, "utf8");
    const root = mounts.split("\n").find((x) => x.split(" ")[4] === "/");
    const tmp = mounts.split("\n").find((x) => x.split(" ")[4] === "/tmp");
    if (
      !root ||
      !["ro", "nosuid", "nodev"].every((x) =>
        root.split(" ")[5].split(",").includes(x),
      ) ||
      !tmp ||
      !["rw", "nosuid", "nodev", "noexec"].every((x) =>
        tmp.split(" ")[5].split(",").includes(x),
      ) ||
      !tmp.includes(" - tmpfs ")
    )
      throw new NativeInfrastructureError("Guest filesystem policy absent");
    const size = /\bsize=(\d+)([kmg]?)(?:,|$)/.exec(tmp);
    const multipliers: Record<string, number> = {
      "": 1,
      k: 1024,
      m: 1024 ** 2,
      g: 1024 ** 3,
    };
    if (
      !size ||
      Number(size[1]) * multipliers[size[2]] > r.scratchMb * 1024 * 1024
    )
      throw new NativeInfrastructureError("Guest scratch is not bounded");
  }
  async execute(
    raw: NativeExecutionRequest,
    signal: AbortSignal,
    draining: () => void,
  ): Promise<NativeExecutionResult> {
    if (!this.prepared && !this.probing)
      throw new NativeInfrastructureError("Native backend is not prepared");
    const { signal: ignored, ...data } = raw;
    const request = requestSchema.parse(data),
      o = this.options,
      r = this.manifest.resources;
    if (request.memoryLimitMb > r.maxCaseMemoryMb)
      throw new NativeInfrastructureError("Memory exceeds native certificate");
    const cgroup = join(o.cgroupRoot, `case-${randomUUID()}`);
    let directory: string | undefined;
    let created = false;
    let processClosed:
      | Promise<{ code: number | null; signal: string | null }>
      | undefined;
    let child: ReturnType<typeof spawn> | undefined;
    const executionCallStarted = performance.now();
    let cleanupStarted: number | undefined;
    let completedResult: NativeExecutionResult | undefined;
    let timedOut = false,
      started: number | undefined,
      cpuStart = 0,
      monitor: ReturnType<typeof setInterval> | undefined,
      wall: ReturnType<typeof setTimeout> | undefined;
    let sample: Promise<void> | undefined;
    let fault: unknown;
    let stopPromise: Promise<void> | undefined;
    const stop = () =>
      (stopPromise ??= (async () => {
        try {
          if (created) await killCgroup(cgroup);
        } finally {
          child?.kill("SIGKILL");
        }
      })());
    const abort = () => {
      void stop().catch((error) => {
        fault = error;
      });
    };
    try {
      // Mark created before setting controls, so a partial setup still gets cleaned.
      await mkdir(cgroup, { mode: 0o700 });
      created = true;
      await writeFile(
        join(cgroup, "memory.max"),
        String((request.memoryLimitMb + r.scratchMb) * 1024 * 1024),
      );
      await writeFile(join(cgroup, "memory.swap.max"), "0");
      await writeFile(join(cgroup, "memory.oom.group"), "1");
      await writeFile(join(cgroup, "pids.max"), String(r.maxCasePids));
      await writeFile(join(cgroup, "cpu.max"), "100000 100000");
      await writeFile(
        join(cgroup, "cgroup.subtree_control"),
        "+cpu +memory +pids",
      );
      directory = await mkdtemp(join(o.workRoot, "case-"));
      await writeFile(
        join(directory, "jail.cfg"),
        jailConfig(
          {
            rootfs: o.rootfsPath,
            policy: o.policyPath,
            cgroup,
            log: join(directory, "nsjail.log"),
          },
          request,
          r,
          o.startupTimeoutMs ?? 10000,
          o.cleanupTimeoutMs ?? 5000,
        ),
        { mode: 0o600 },
      );
      if (signal.aborted)
        throw new NativeInfrastructureError("Cancelled before launch");
      // Require mount_setattr/open_tree rather than legacy remounts that clear
      // locked inherited flags in a user namespace. Never fall back silently.
      child = spawn(o.nsjailPath, ["--config", join(directory, "jail.cfg"), "--experimental_mnt", "new"], {
        env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8" },
        cwd: directory,
        stdio: ["pipe", "pipe", "pipe", "pipe"],
        shell: false,
      });
      processClosed = new Promise((resolve, reject) => {
        child!.once("error", reject);
        child!.once("close", (code, signal) => resolve({ code, signal }));
      });
      // Prevent an early exit rejection while readiness is being awaited.
      void processClosed.catch(() => {});
      const stdout = new ByteCapture(
          request.outputLimitBytes ?? gradingDataLimits.stdoutBytes,
        ),
        stderr = new ByteCapture(gradingDataLimits.stderrBytes);
      child.stdout!.on("data", (chunk) => stdout.append(chunk));
      child.stderr!.on("data", (chunk) => stderr.append(chunk));
      child.stdin!.on("error", () => {});
      child.stdin!.end(JSON.stringify(request));
      const gate = child.stdio[3] as Duplex;
      gate.on("error", () => {});
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            finish(new NativeInfrastructureError("Native startup deadline")),
          o.startupTimeoutMs ?? 10000,
        );
        const finish = (error?: unknown) => {
          clearTimeout(timer);
          gate.off("data", onData);
          gate.off("end", onEnd);
          if (error) reject(error);
          else resolve();
        };
        const onData = (bytes: Buffer) =>
          finish(
            bytes.length === 1 && bytes[0] === 82
              ? undefined
              : new NativeInfrastructureError("Invalid bootstrap readiness"),
          );
        const onEnd = () =>
          finish(
            new NativeInfrastructureError("Jail failed before learner start"),
          );
        gate.once("data", onData);
        gate.once("end", onEnd);
        void processClosed!.then(() => onEnd(), finish);
      });
      await this.verifyGatedChild(cgroup, request.memoryLimitMb);
      cpuStart = await cpuUsec(cgroup);
      started = performance.now();
      gate.end("G");
      wall = setTimeout(() => {
        timedOut = true;
        abort();
      }, request.timeLimitMs);
      monitor = setInterval(() => {
        if (sample) return;
        sample = cpuUsec(cgroup)
          .then(
            (usage) => {
              if (usage - cpuStart >= request.timeLimitMs * 1000) {
                timedOut = true;
                abort();
              }
            },
            (error) => {
              fault = error;
              abort();
            },
          )
          .finally(() => {
            sample = undefined;
          });
      }, 10);
      const exit = await processClosed;
      clearTimeout(wall);
      clearInterval(monitor);
      await sample;
      const runtimeMs = Math.max(0, performance.now() - started);
      cleanupStarted = performance.now();
      if (fault) throw fault;
      const oom = await oomKills(cgroup);
      if (signal.aborted)
        throw new NativeInfrastructureError("Native execution cancelled");
      if (exit.signal && !timedOut)
        throw new NativeInfrastructureError(
          "Native supervisor terminated unexpectedly",
        );
      completedResult = {
        stdout: stdout.text(),
        stderr: stderr.text(),
        outcome:
          oom > 0
            ? "MEMORY_LIMIT"
            : timedOut
              ? "TIME_LIMIT"
              : exit.code === 0
                ? "PASSED"
                : "RUNTIME_ERROR",
        runtimeMs,
        ...(stdout.truncated ? { outputTruncated: true } : {}),
      };
      return completedResult;
    } catch (cause) {
      if (started === undefined && directory) {
        throw new NativeInfrastructureError(
          cause instanceof NativeInfrastructureError ? cause.message : "Native launcher failure",
          { cause: { startupLog: await readStartupLog(join(directory, "nsjail.log")), original: cause } },
        );
      }
      if (cause instanceof NativeInfrastructureError) throw cause;
      throw new NativeInfrastructureError("Native launcher failure", { cause });
    } finally {
      cleanupStarted ??= performance.now();
      draining();
      signal.removeEventListener("abort", abort);
      clearTimeout(wall);
      clearInterval(monitor);
      let cleanupError: unknown;
      try {
        await sample;
        await stop();
        if (processClosed) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              processClosed,
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(
                      new CleanupUncertainError(
                        "Supervisor/pipe cleanup deadline",
                      ),
                    ),
                  o.cleanupTimeoutMs ?? 5000,
                );
                timer.unref();
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        }
        if (created) await cleanupCgroup(cgroup, o.cleanupTimeoutMs ?? 5000);
      } catch (cause) {
        cleanupError = new CleanupUncertainError("Native cleanup uncertain", {
          cause,
        });
      }
      if (directory)
        try {
          await rm(directory, { recursive: true, force: true });
        } catch (cause) {
          cleanupError = new CleanupUncertainError(
            "Native scratch cleanup uncertain",
            { cause },
          );
        }
      if (cleanupError) throw cleanupError;
      if (completedResult)
        completedResult.timings = {
          startupMs: Math.max(0, started! - executionCallStarted),
          executionMs: completedResult.runtimeMs,
          cleanupMs: Math.max(0, performance.now() - cleanupStarted),
        };
    }
  }
}
