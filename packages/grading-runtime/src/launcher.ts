import { spawn, type ChildProcess } from "node:child_process";
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
import type { ResourceBank } from "./resource-bank.js";
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
/** Idle interpreter peaks near 10 MiB; claim raises this to the authored limit. */
const STANDBY_MEMORY_MB = 32;
const STANDBY_TTL_MS = 30_000;
/**
 * Jail startup outlasts a short case several times over, so one replacement per
 * claim cannot keep up with sequential cases; keep a shallow pipeline per certificate.
 */
const STANDBY_DEPTH = 4;
/** Aged standbys are replaced only while their certificate saw recent demand. */
const STANDBY_DEMAND_WINDOW_MS = 60_000;
const NAMESPACES = ["mnt", "pid", "ipc", "net", "uts", "user", "cgroup"] as const;
export class NsJailBackend implements NativeBackend {
  private prepared = false;
  private closing = false;
  private bank?: ResourceBank;
  private own?: { filters: number; namespaces: Map<string, string> };
  private readonly standby = new Map<string, Jail[]>();
  private readonly warming = new Map<string, number>();
  private warmingTotal = 0;
  private readonly lastDemand = new Map<string, number>();
  private readonly background = new Set<Promise<void>>();
  private probing = false;
  private manifest: NativeReleaseManifest;
  private options: NsJailOptions;
  constructor(options: NsJailOptions) {
    this.manifest = nativeReleaseManifestSchema.parse(options.manifest);
    this.options = { ...options, manifest: this.manifest };
  }
  attach(bank: ResourceBank) {
    this.bank = bank;
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
    // The launcher's own isolation facts never change; read them once, not per case.
    this.own = {
      filters: Number(
        /^Seccomp_filters:\s+(\d+)$/m.exec(
          await readFile("/proc/self/status", "utf8"),
        )?.[1] ?? 0,
      ),
      namespaces: new Map(
        await Promise.all(
          NAMESPACES.map(
            async (ns) => [ns, await readlink(`/proc/self/ns/${ns}`)] as const,
          ),
        ),
      ),
    };
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
    const own = this.own!;
    const guestFilters = Number(
      /^Seccomp_filters:\s+(\d+)$/m.exec(status)?.[1] ?? 0,
    );
    if (guestFilters <= own.filters)
      throw new NativeInfrastructureError(
        "Guest seccomp filter was not installed",
      );
    for (const ns of NAMESPACES)
      if ((await readlink(`${proc}/ns/${ns}`)) === own.namespaces.get(ns))
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
  /** Spawns and fully verifies a jail gated before its request; never runs learner code. */
  private async startJail(
    request: NativeExecutionRequest,
    standby: boolean,
    signal?: AbortSignal,
  ): Promise<Jail> {
    const o = this.options,
      r = this.manifest.resources;
    const jail: Jail = {
      key: jailKey(request),
      memoryLimitMb: request.memoryLimitMb,
      timeLimitMs: request.timeLimitMs,
      cgroup: join(o.cgroupRoot, `case-${randomUUID()}`),
      created: false,
      stderr: new ByteCapture(gradingDataLimits.stderrBytes),
      exited: false,
      earlyOutput: false,
    };
    const cancelled = () =>
      new NativeInfrastructureError("Native execution cancelled");
    // Cancellation during startup kills and reaps promptly instead of awaiting readiness.
    const onAbort = () => {
      if (jail.created) void killCgroup(jail.cgroup).catch(() => {});
      jail.child?.kill("SIGKILL");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      // Mark created before setting controls, so a partial setup still gets cleaned.
      await mkdir(jail.cgroup, { mode: 0o700 });
      jail.created = true;
      // An idle standby is kernel-capped well below the authored limit; claim raises it.
      await writeFile(
        join(jail.cgroup, "memory.max"),
        String(
          (standby
            ? STANDBY_MEMORY_MB
            : request.memoryLimitMb + r.scratchMb) *
            1024 *
            1024,
        ),
      );
      await writeFile(join(jail.cgroup, "memory.swap.max"), "0");
      await writeFile(join(jail.cgroup, "memory.oom.group"), "1");
      await writeFile(join(jail.cgroup, "pids.max"), String(r.maxCasePids));
      await writeFile(join(jail.cgroup, "cpu.max"), "100000 100000");
      // A waiting standby yields CPU to running cases; claim restores the default.
      if (standby) await writeFile(join(jail.cgroup, "cpu.weight"), "1");
      await writeFile(
        join(jail.cgroup, "cgroup.subtree_control"),
        "+cpu +memory +pids",
      );
      jail.directory = await mkdtemp(join(o.workRoot, "case-"));
      await writeFile(
        join(jail.directory, "jail.cfg"),
        jailConfig(
          {
            rootfs: o.rootfsPath,
            policy: o.policyPath,
            cgroup: jail.cgroup,
            log: join(jail.directory, "nsjail.log"),
          },
          request,
          r,
          // The supervisor's own backstop also covers the longest standby wait.
          (o.startupTimeoutMs ?? 10000) + (standby ? STANDBY_TTL_MS : 0),
          o.cleanupTimeoutMs ?? 5000,
        ),
        { mode: 0o600 },
      );
      if (signal?.aborted) throw cancelled();
      // Require mount_setattr/open_tree rather than legacy remounts that clear
      // locked inherited flags in a user namespace. Never fall back silently.
      const child = spawn(o.nsjailPath, ["--config", join(jail.directory, "jail.cfg"), "--experimental_mnt", "new"], {
        env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8" },
        cwd: jail.directory,
        stdio: ["pipe", "pipe", "pipe", "pipe"],
        shell: false,
      });
      jail.child = child;
      jail.processClosed = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => {
          jail.exited = true;
          resolve({ code, signal });
        });
      });
      // Prevent an early exit rejection while readiness is being awaited.
      void jail.processClosed.catch(() => {});
      // Output before a request is claimed cannot come from learner code; discard such a jail.
      child.stdout!.on("data", (chunk) => {
        if (jail.stdout) jail.stdout.append(chunk);
        else jail.earlyOutput = true;
      });
      child.stderr!.on("data", (chunk) => jail.stderr.append(chunk));
      child.stdin!.on("error", () => {});
      const gate = child.stdio[3] as Duplex;
      jail.gate = gate;
      gate.on("error", () => {});
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
          signal?.removeEventListener("abort", onCancel);
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
        const onCancel = () => finish(cancelled());
        gate.once("data", onData);
        gate.once("end", onEnd);
        signal?.addEventListener("abort", onCancel, { once: true });
        if (signal?.aborted) onCancel();
        void jail.processClosed!.then(() => onEnd(), finish);
      });
      await this.verifyGatedChild(jail.cgroup, request.memoryLimitMb);
      if (signal?.aborted) throw cancelled();
      return jail;
    } catch (cause) {
      let failure: unknown = signal?.aborted ? cancelled() : cause;
      if (jail.directory && !signal?.aborted) {
        // EOF on the control pipe may arrive before stderr/exit notifications.
        // Keep diagnostics bounded without delaying cleanup indefinitely.
        let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;
        let supervisorExit: { code: number | null; signal: string | null } | undefined;
        try {
          await Promise.race([
            jail.processClosed?.then(exit => { supervisorExit = exit; }).catch(() => {}),
            new Promise<void>(resolve => { diagnosticTimer = setTimeout(resolve, 1500); }),
          ]);
        } finally { clearTimeout(diagnosticTimer); }
        failure = new NativeInfrastructureError(
          cause instanceof NativeInfrastructureError ? cause.message : "Native launcher failure",
          { cause: { startupLog: await readStartupLog(join(jail.directory, "nsjail.log")), startupStderr: jail.stderr.text().slice(0, 8192), supervisorExit, original: cause } },
        );
      } else if (!(cause instanceof NativeInfrastructureError))
        failure = new NativeInfrastructureError("Native launcher failure", { cause });
      // A cleanup uncertainty outranks the startup failure, as before.
      await this.disposeJail(jail);
      throw failure;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
  /** Kills and reaps every descendant; uncertainty MUST throw CleanupUncertainError. */
  private async disposeJail(jail: Jail) {
    const o = this.options;
    let cleanupError: unknown;
    try {
      try {
        if (jail.created) await killCgroup(jail.cgroup);
      } finally {
        jail.child?.kill("SIGKILL");
      }
      if (jail.processClosed) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            jail.processClosed,
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
      if (jail.created)
        await cleanupCgroup(jail.cgroup, o.cleanupTimeoutMs ?? 5000);
    } catch (cause) {
      cleanupError = new CleanupUncertainError("Native cleanup uncertain", {
        cause,
      });
    }
    if (jail.directory)
      try {
        await rm(jail.directory, { recursive: true, force: true });
      } catch (cause) {
        cleanupError = new CleanupUncertainError(
          "Native scratch cleanup uncertain",
          { cause },
        );
      }
    if (cleanupError) throw cleanupError;
  }
  /** Claims a verified idle jail for exactly this memory/time certificate, if one is ready. */
  private claimStandby(key: string): Jail | undefined {
    const idle = this.standby.get(key);
    while (idle?.length) {
      const jail = idle.shift()!;
      clearTimeout(jail.expiry);
      if (!jail.exited && !jail.earlyOutput) {
        // The claiming request's own allocation now covers this jail's memory.
        jail.release?.();
        return jail;
      }
      this.discard(jail);
    }
    return undefined;
  }
  /**
   * Background disposal. The standby reservation stays charged until cleanup is
   * proven; an uncertain cleanup keeps it and removes this generation from admission.
   */
  private discard(jail: Jail) {
    const disposal = this.disposeJail(jail).then(
      () => jail.release?.(),
      (error) => {
        if (error instanceof CleanupUncertainError) this.bank?.quarantine();
        else jail.release?.();
      },
    );
    this.background.add(disposal);
    void disposal.finally(() => this.background.delete(disposal));
  }
  /** Tops up verified jails ahead of the next cases with the same certificate. */
  private replenish(request: NativeExecutionRequest) {
    const key = jailKey(request);
    while (
      !this.closing &&
      this.bank &&
      (this.standby.get(key)?.length ?? 0) + (this.warming.get(key) ?? 0) <
        STANDBY_DEPTH &&
      // Startup burns CPU: warm only on slots no admitted work holds.
      this.warmingTotal < this.bank.idleSlots
    ) {
      const release = this.bank.reserveStandby(
        STANDBY_MEMORY_MB,
        this.manifest.resources.cpuSlots * STANDBY_DEPTH,
      );
      if (!release) return;
      this.warming.set(key, (this.warming.get(key) ?? 0) + 1);
      this.warmingTotal++;
      const warming = this.startJail(
        {
          code: "",
          stdin: "",
          timeLimitMs: request.timeLimitMs,
          memoryLimitMb: request.memoryLimitMb,
        },
        true,
      )
        .then(
          (jail) => {
            jail.release = release;
            if (this.closing) {
              this.discard(jail);
              return;
            }
            jail.expiry = setTimeout(() => this.expire(jail), STANDBY_TTL_MS);
            jail.expiry.unref();
            const idle = this.standby.get(key) ?? [];
            idle.push(jail);
            this.standby.set(key, idle);
          },
          (error) => {
            // startJail has already attempted disposal; uncertainty stays charged.
            if (error instanceof CleanupUncertainError) this.bank?.quarantine();
            else release();
            // Never retry in a loop; the next real case cold-starts and reports failure.
          },
        )
        .finally(() => {
          this.warming.set(key, this.warming.get(key)! - 1);
          this.warmingTotal--;
        });
      this.background.add(warming);
      void warming.finally(() => this.background.delete(warming));
    }
  }
  /** Recycles an aged standby; only real requests count as demand for a replacement. */
  private expire(jail: Jail) {
    const idle = this.standby.get(jail.key);
    const index = idle?.indexOf(jail) ?? -1;
    if (index < 0) return;
    idle!.splice(index, 1);
    this.discard(jail);
    if (
      performance.now() - (this.lastDemand.get(jail.key) ?? -Infinity) <
      STANDBY_DEMAND_WINDOW_MS
    )
      this.replenish({
        code: "",
        stdin: "",
        timeLimitMs: jail.timeLimitMs,
        memoryLimitMb: jail.memoryLimitMb,
      });
  }
  async close() {
    this.closing = true;
    for (const idle of this.standby.values())
      for (const jail of idle.splice(0)) {
        clearTimeout(jail.expiry);
        this.discard(jail);
      }
    while (this.background.size) await Promise.allSettled([...this.background]);
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
      r = this.manifest.resources;
    if (request.memoryLimitMb > r.maxCaseMemoryMb)
      throw new NativeInfrastructureError("Memory exceeds native certificate");
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
    let jail: Jail | undefined;
    let prewarmed = false;
    let stopPromise: Promise<void> | undefined;
    const stop = () =>
      (stopPromise ??= (async () => {
        try {
          if (jail?.created) await killCgroup(jail.cgroup);
        } finally {
          jail?.child?.kill("SIGKILL");
        }
      })());
    const abort = () => {
      void stop().catch((error) => {
        fault = error;
      });
    };
    try {
      if (signal.aborted)
        throw new NativeInfrastructureError("Cancelled before launch");
      jail = this.probing ? undefined : this.claimStandby(jailKey(request));
      prewarmed = Boolean(jail);
      if (jail) {
        // Raise the idle caps to the authored certificate and prove them before GO.
        const limit = String(
          (request.memoryLimitMb + r.scratchMb) * 1024 * 1024,
        );
        await writeFile(join(jail.cgroup, "memory.max"), limit);
        await writeFile(join(jail.cgroup, "cpu.weight"), "100");
        if (
          (await readControl(join(jail.cgroup, "memory.max"))) !== limit ||
          (await readControl(join(jail.cgroup, "cpu.weight"))) !== "100"
        )
          throw new NativeInfrastructureError("Jail kernel controls mismatch");
      } else jail = await this.startJail(request, false, signal);
      if (!this.probing) {
        this.lastDemand.set(jailKey(request), performance.now());
        this.replenish(request);
      }
      const { child, gate, stderr } = jail;
      const stdout = new ByteCapture(
        request.outputLimitBytes ?? gradingDataLimits.stdoutBytes,
      );
      jail.stdout = stdout;
      if (jail.exited || jail.earlyOutput)
        throw new NativeInfrastructureError("Jail failed before learner start");
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted)
        throw new NativeInfrastructureError("Native execution cancelled");
      child!.stdin!.end(JSON.stringify(request));
      cpuStart = await cpuUsec(jail.cgroup);
      started = performance.now();
      gate!.end("G");
      wall = setTimeout(() => {
        timedOut = true;
        abort();
      }, request.timeLimitMs);
      const cgroup = jail.cgroup;
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
      const exit = await jail.processClosed!;
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
      } catch (cause) {
        cleanupError = new CleanupUncertainError("Native cleanup uncertain", {
          cause,
        });
      }
      // startJail already disposed a jail that failed before it was returned.
      if (jail)
        try {
          await this.disposeJail(jail);
        } catch (cause) {
          cleanupError = cause;
        }
      if (cleanupError) throw cleanupError;
      if (completedResult)
        completedResult.timings = {
          startupMs: Math.max(0, started! - executionCallStarted),
          executionMs: completedResult.runtimeMs,
          cleanupMs: Math.max(0, performance.now() - cleanupStarted),
          prewarmed,
        };
    }
  }
}
type Jail = {
  key: string;
  memoryLimitMb: number;
  timeLimitMs: number;
  cgroup: string;
  created: boolean;
  directory?: string;
  child?: ChildProcess;
  processClosed?: Promise<{ code: number | null; signal: string | null }>;
  gate?: Duplex;
  stdout?: ByteCapture;
  stderr: ByteCapture;
  exited: boolean;
  earlyOutput: boolean;
  release?: () => void;
  expiry?: ReturnType<typeof setTimeout>;
};
/** Everything baked into a jail's supervisor config before its request exists. */
const jailKey = (request: Pick<NativeExecutionRequest, "memoryLimitMb" | "timeLimitMs">) =>
  `${request.memoryLimitMb}:${request.timeLimitMs}`;
