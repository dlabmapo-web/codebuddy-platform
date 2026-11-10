import { spawn, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  chownSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile, mkdir, readlink, lstat, statfs } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { arch, availableParallelism, constants as osConstants, totalmem } from "node:os";
import type { Duplex } from "node:stream";
import {
  nativeReleaseManifestSchema,
  nativeRuntimeIdentity,
  type NativeReleaseManifest,
} from "@cove/shared";
import { gradingDataLimits } from "@cove/shared/grading-limits";
import {
  binaryRequestSchema,
  compileRequestSchema,
  requestSchema,
  COMPILE_DIAGNOSTICS_LIMIT,
  NativeInfrastructureError,
  terminationSignals,
  type NativeBinaryRequest,
  type NativeCompileRequest,
  type NativeCompileResult,
  type NativeExecutionRequest,
  type NativeExecutionResult,
} from "./contract.js";
import { CleanupUncertainError, type NativeBackend } from "./service.js";
import type { ResourceBank } from "./resource-bank.js";
import { ByteCapture } from "./framing.js";
import {
  binaryJailConfig,
  compileJailConfig,
  cpuRlimitSeconds,
  GCC_COMPILE_ARGV,
  GCC_COMPILE_LIMITS,
  GCC_SOURCE_NAME,
  jailConfig,
  NSJAIL_REVISION,
  POOL_CASE_TIME_LIMIT_MS,
} from "./policy.js";
import { ArtifactLeaseError, ArtifactStore, MAX_ARTIFACT_BYTES } from "./artifact-store.js";
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
  writeControl,
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
  /** Idle verified jails per CPU slot; 0 starts every case cold. */
  standbyPerSlot?: number;
  /** The native-gcc runtime's trees and stores, when the manifest carries one. */
  gcc?: NsJailGccOptions;
};
export type NsJailGccOptions = {
  rootPath: string;
  runRootPath: string;
  compilePolicyPath: string;
  runPolicyPath: string;
  /** Executable, nosuid/nodev tmpfs of `artifactStoreMb`, private to the launcher. */
  artifactPath: string;
  /** noexec tmpfs where compiles write; charged to each compile's own cgroup. */
  stagingPath: string;
};
/** What a jail is started for: its NsJail config and what verification expects. */
type JailProfile = {
  standby: boolean;
  config: (cgroup: string, log: string) => string;
  pidsMax: number;
  scratchBytes: number;
  /** Further mounts verified before GO: their mount options, present and absent. */
  mounts: Array<{ dst: string; has: string[]; lacks: string[] }>;
};
/** The case facts a flavour turns into its outcome, read after the supervisor exits. */
type CaseFacts = {
  exit: { code: number | null; signal: string | null };
  oom: number;
  timedOut: boolean;
  record: string;
};
const MiB = 1024 * 1024;
type TerminationSignal = (typeof terminationSignals)[number];
// Built from the reported names, not the host table: there SIGIOT aliases
// SIGABRT and a later alias would win.
const SIGNAL_NAMES = new Map<number, string>(
  terminationSignals
    .filter((name) => name !== "OTHER")
    .map((name) => [osConstants.signals[name as keyof typeof osConstants.signals], name]),
);
/** A probe exercising stdin, stdout and, for C++, the precompiled header. */
const GCC_PROBES = {
  C: '#include <stdio.h>\nint main(void) { int a, b; if (scanf("%d %d", &a, &b) != 2) return 1; printf("%d\\n", a * b); return 0; }\n',
  CPP: "#include <bits/stdc++.h>\nusing namespace std;\nint main() { int a, b; cin >> a >> b; cout << a * b << endl; }\n",
} as const;
/** Idle interpreter peaks near 10 MiB; claim raises this to the authored limit. */
const STANDBY_MEMORY_MB = 32;
/** Part of every standby's backstop (`standbyBackstopMs`), so kept short. */
const STANDBY_TTL_MS = 15_000;
/**
 * The longest a standby's learner code can run if the launcher dies mid-case
 * and nothing else stops the unit: the supervisor's own time limit.
 */
export const standbyBackstopMs = (startupTimeoutMs = 10000, cleanupTimeoutMs = 5000) =>
  Math.ceil((startupTimeoutMs + STANDBY_TTL_MS + POOL_CASE_TIME_LIMIT_MS + cleanupTimeoutMs) / 1000) * 1000;
/**
 * Verified idle jails kept per CPU slot. A short case finishes in a few
 * milliseconds and a jail takes tens to start, so sequential cases from every
 * slot need a pool rather than one replacement per claim. The standby memory
 * budget in `ResourceBank` caps the total below this on a small node.
 */
const STANDBY_PER_SLOT = 4;
/** Shortest wait between CPU-time samples once a case nears its limit. */
const CPU_SAMPLE_MIN_MS = 5;
const NAMESPACES = ["mnt", "pid", "ipc", "net", "uts", "user", "cgroup"] as const;
export class NsJailBackend implements NativeBackend {
  private prepared = false;
  private closing = false;
  private bank?: ResourceBank;
  private own?: { filters: number; namespaces: Map<string, string> };
  /** One pool for every exercise: jails no longer carry a case's limits until claimed. */
  private readonly standby: Jail[] = [];
  private warming = 0;
  private readonly background = new Set<Promise<void>>();
  private probing = false;
  private manifest: NativeReleaseManifest;
  private options: NsJailOptions;
  /** The leaf this service runs in; its memory must stay within the overhead. */
  private serviceLeaf?: string;
  private store?: ArtifactStore;
  private gccReady = false;
  /** Why the GCC runtime is not ready, for operators; never a learner value. */
  gccFailure?: string;
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
      ) {
        enclosed = true;
        this.serviceLeaf = group;
      }
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
    // A GCC failure withdraws only GCC readiness; Python is ready either way.
    if (this.manifest.gcc)
      try {
        await this.prepareGcc();
      } catch (error) {
        this.gccFailure = error instanceof Error ? error.message : String(error);
        if (error instanceof CleanupUncertainError) this.bank?.quarantine();
      }
    // Fill the pool before the first case asks for it.
    this.replenish();
  }
  /** Ready for compiles and compiled programs: identity, mounts, memory and probes passed. */
  get gccAvailable() {
    return this.gccReady;
  }
  /** Call after any GCC failure that is not a cleanup uncertainty. */
  withdrawGcc(reason: string) {
    this.gccReady = false;
    this.gccFailure ??= reason;
  }
  /**
   * The service leaf (launcher, worker and comparator, plus the artifact
   * store's pages) within its overhead. Checked on every health probe, so a
   * cache that grew too far withdraws readiness instead of taking memory that
   * cases and standbys were promised.
   */
  withinServiceOverhead(): boolean {
    if (!this.serviceLeaf) return true;
    return (
      Number(readFileSync(join(this.serviceLeaf, "memory.current"), "utf8").trim()) <=
      this.manifest.resources.serviceOverheadMb * MiB
    );
  }
  private async prepareGcc() {
    const g = this.options.gcc,
      d = this.manifest.gcc!,
      r = this.manifest.resources;
    if (!g) throw new NativeInfrastructureError("GCC runtime paths are not configured");
    for (const p of Object.values(g))
      if (!p.startsWith("/") || resolve(p) !== p)
        throw new NativeInfrastructureError("Trusted paths must be canonical absolute paths");
    if (
      d.nsjailRevision !== NSJAIL_REVISION ||
      JSON.stringify(d.compile.C.argv) !== JSON.stringify(GCC_COMPILE_ARGV.C) ||
      JSON.stringify(d.compile.CPP.argv) !== JSON.stringify(GCC_COMPILE_ARGV.CPP) ||
      (await fileDigest(g.compilePolicyPath)) !== d.compilePolicyDigest ||
      (await fileDigest(g.runPolicyPath)) !== d.runPolicyDigest ||
      (await fileDigest(join(g.rootPath, "opt/cove/exec-gate"))) !== d.execGateDigest ||
      (await fileDigest(join(g.runRootPath, "opt/cove/exec-gate"))) !== d.execGateDigest ||
      (await fileDigest(join(g.rootPath, "opt/cove/pch/bits/stdc++.h.gch"))) !== d.compile.CPP.pchDigest ||
      (await fileDigest(join(g.rootPath, "opt/cove/packages.json"))) !== d.packageManifestDigest ||
      (await rootfsDigest(g.rootPath)) !== d.toolchainRootfsDigest ||
      (await rootfsDigest(g.runRootPath)) !== d.runRootfsDigest
    )
      throw new NativeInfrastructureError("Immutable GCC build identity mismatch");
    const mounts = readFileSync("/proc/self/mountinfo", "utf8").split("\n");
    const mount = (point: string) => {
      const line = mounts.find((x) => x.split(" ")[4] === point);
      if (!line || !line.includes(" - tmpfs "))
        throw new NativeInfrastructureError(`${point} must be its own tmpfs`);
      return line.split(" ")[5].split(",");
    };
    const store = mount(g.artifactPath),
      staging = mount(g.stagingPath);
    if (!["rw", "nosuid", "nodev"].every((x) => store.includes(x)) || store.includes("noexec"))
      throw new NativeInfrastructureError("Artifact store must be executable, nosuid and nodev");
    if (!["rw", "nosuid", "nodev", "noexec"].every((x) => staging.includes(x)))
      throw new NativeInfrastructureError("Compile staging must be noexec, nosuid and nodev");
    // The kernel's tmpfs bound is what makes the store's memory accountable.
    const fs = await statfs(g.artifactPath);
    if (Number(fs.blocks) * Number(fs.bsize) > r.artifactStoreMb * MiB)
      throw new NativeInfrastructureError("Artifact store is larger than artifactStoreMb");
    for (const p of [g.artifactPath, g.stagingPath]) {
      const st = await lstat(p);
      if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid?.())
        throw new NativeInfrastructureError("GCC stores must be owned directories");
      for (const name of readdirSync(p)) rmSync(join(p, name), { recursive: true, force: true });
      // NsJail resolves a bind source inside the jail's user namespace, where
      // the launcher's ownership grants nothing: path components must be
      // traversable. Traverse-only (0711): nothing can be listed, read or
      // written, and every name below is random or a content digest.
      chmodSync(p, 0o711);
      if (((await lstat(p)).mode & 0o7777) !== 0o711)
        throw new NativeInfrastructureError("GCC stores must be traverse-only");
    }
    if (
      Number(await readControl(join(this.options.cgroupRoot, "memory.current"))) +
        (r.artifactStoreMb + 1) * MiB >
      r.serviceOverheadMb * MiB
    )
      throw new NativeInfrastructureError("Service overhead cannot hold a full artifact store");
    this.store = new ArtifactStore({ root: g.artifactPath, capacityBytes: r.artifactStoreMb * MiB });
    // Both languages through the real jails, as the CPython probe does.
    this.probing = true;
    try {
      for (const language of ["C", "CPP"] as const) {
        const compiled = await this.compile(
          { language, code: GCC_PROBES[language], leaseMs: 60_000 },
          new AbortController().signal,
          () => {},
        );
        if (compiled.status !== "COMPILED" || compiled.diagnostics)
          throw new NativeInfrastructureError(`GCC ${language} readiness compile failed`, {
            cause: { diagnostics: compiled.diagnostics },
          });
        const run = await this.executeBinary(
          { artifact: compiled.artifact, lease: compiled.lease, stdin: "6 7\n", timeLimitMs: 1000, memoryLimitMb: Math.min(64, r.maxCaseMemoryMb), outputLimitBytes: 64 },
          new AbortController().signal,
          () => {},
        );
        this.store.release(compiled.lease);
        if (run.outcome !== "PASSED" || run.stdout !== "42\n" || run.stderr || run.termination?.hasOwnProperty("signal"))
          throw new NativeInfrastructureError(`GCC ${language} readiness probe failed`);
      }
    } finally {
      this.probing = false;
      this.store.clear();
    }
    this.gccReady = true;
  }
  private get standbyTarget() {
    return (
      this.manifest.resources.cpuSlots *
      (this.options.standbyPerSlot ?? STANDBY_PER_SLOT)
    );
  }
  private async verifyGatedChild(jail: Jail, profile: JailProfile) {
    const children = await childGroups(jail.cgroup);
    if (children.length !== 1)
      throw new NativeInfrastructureError(
        "Expected exactly one gated jail cgroup",
      );
    const child = children[0],
      r = this.manifest.resources;
    if (
      (await readControl(join(child, "memory.max"))) !==
        String(r.maxCaseMemoryMb * 1024 * 1024) ||
      (await readControl(join(child, "memory.swap.max"))) !== "0" ||
      (await readControl(join(child, "pids.max"))) !== String(profile.pidsMax) ||
      (await readControl(join(child, "cpu.max"))) !== "1000000 1000000"
    )
      throw new NativeInfrastructureError("Jail kernel controls mismatch");
    const pids = (await readControl(join(child, "cgroup.procs"))).split(/\s+/);
    if (pids.length !== 1 || !/^\d+$/.test(pids[0]))
      throw new NativeInfrastructureError("Expected one gated guest process");
    jail.inner = child;
    jail.pid = pids[0];
    const proc = `/proc/${pids[0]}`;
    const status = readFileSync(`${proc}/status`, "utf8");
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
      if (readlinkSync(`${proc}/ns/${ns}`) === own.namespaces.get(ns))
        throw new NativeInfrastructureError(`Missing private ${ns} namespace`);
    const mounts = readFileSync(`${proc}/mountinfo`, "utf8");
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
      Number(size[1]) * multipliers[size[2]] > profile.scratchBytes
    )
      throw new NativeInfrastructureError("Guest scratch is not bounded");
    for (const expected of profile.mounts) {
      const line = mounts.split("\n").find((x) => x.split(" ")[4] === expected.dst);
      const options = line?.split(" ")[5].split(",") ?? [];
      if (
        !line ||
        !expected.has.every((x) => options.includes(x)) ||
        expected.lacks.some((x) => options.includes(x))
      )
        throw new NativeInfrastructureError(`Guest mount ${expected.dst} policy absent`);
    }
  }
  private pythonProfile(standby: boolean, caseTimeLimitMs: number): JailProfile {
    const o = this.options,
      r = this.manifest.resources;
    return {
      standby,
      pidsMax: r.maxCasePids,
      scratchBytes: r.scratchMb * MiB,
      mounts: [],
      config: (cgroup, log) =>
        jailConfig(
          { rootfs: o.rootfsPath, policy: o.policyPath, cgroup, log },
          r,
          caseTimeLimitMs,
          // The supervisor's own backstop also covers the longest standby wait.
          (o.startupTimeoutMs ?? 10000) + (standby ? STANDBY_TTL_MS : 0),
          o.cleanupTimeoutMs ?? 5000,
        ),
    };
  }
  /**
   * Spawns and fully verifies a jail gated before its request; never runs
   * learner code. A standby waits at the lowest CPU weight and serves any case
   * within the pool's limit; a jail started for a waiting case serves that
   * case's limit, with no standby wait in its backstop.
   */
  private async startJail(profile: JailProfile, signal?: AbortSignal): Promise<Jail> {
    const o = this.options,
      r = this.manifest.resources;
    const jail: Jail = {
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
      mkdirSync(jail.cgroup, { mode: 0o700 });
      jail.created = true;
      // An unclaimed jail is kernel-capped well below any authored limit; claim raises it.
      writeControl(
        join(jail.cgroup, "memory.max"),
        String(STANDBY_MEMORY_MB * 1024 * 1024),
      );
      writeControl(join(jail.cgroup, "memory.swap.max"), "0");
      writeControl(join(jail.cgroup, "memory.oom.group"), "1");
      writeControl(join(jail.cgroup, "pids.max"), String(r.maxCasePids));
      writeControl(join(jail.cgroup, "cpu.max"), "100000 100000");
      // A waiting standby yields CPU to running cases; claim restores the default.
      if (profile.standby) writeControl(join(jail.cgroup, "cpu.weight"), "1");
      writeControl(
        join(jail.cgroup, "cgroup.subtree_control"),
        "+cpu +memory +pids",
      );
      jail.directory = mkdtempSync(join(o.workRoot, "case-"));
      writeFileSync(
        join(jail.directory, "jail.cfg"),
        profile.config(jail.cgroup, join(jail.directory, "nsjail.log")),
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
      await this.verifyGatedChild(jail, profile);
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
        rmSync(jail.directory, { recursive: true, force: true });
      } catch (cause) {
        cleanupError = new CleanupUncertainError(
          "Native scratch cleanup uncertain",
          { cause },
        );
      }
    if (cleanupError) throw cleanupError;
  }
  /** Claims a verified idle jail, if one is ready. */
  private claimStandby(): Jail | undefined {
    while (this.standby.length) {
      const jail = this.standby.shift()!;
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
  /**
   * Startup burns CPU that running cases would otherwise get, and their wall
   * time counts against their limit. Warm on slots no running case holds; when
   * every slot is busy, start one jail only while the pool holds fewer than one
   * per slot, so a sustained burst never leaves every case waiting for its own.
   */
  private get warmingAllowance() {
    const idle = this.bank?.idleSlots ?? 0;
    if (idle > 0) return idle;
    return this.standby.length + this.warming < this.manifest.resources.cpuSlots
      ? 1
      : 0;
  }
  /** Keeps the pool full ahead of demand, within the warming allowance. */
  private replenish() {
    while (
      this.prepared &&
      !this.closing &&
      this.bank &&
      this.standby.length + this.warming < this.standbyTarget &&
      this.warming < this.warmingAllowance
    ) {
      const release = this.bank.reserveStandby(
        STANDBY_MEMORY_MB,
        this.standbyTarget,
      );
      if (!release) return;
      this.warming++;
      let started = false;
      const warming = this.startJail(this.pythonProfile(true, POOL_CASE_TIME_LIMIT_MS))
        .then(
          (jail) => {
            jail.release = release;
            if (this.closing) {
              this.discard(jail);
              return;
            }
            jail.expiry = setTimeout(() => this.expire(jail), STANDBY_TTL_MS);
            jail.expiry.unref();
            this.standby.push(jail);
            started = true;
          },
          (error) => {
            // startJail has already attempted disposal; uncertainty stays charged.
            if (error instanceof CleanupUncertainError) this.bank?.quarantine();
            else release();
          },
        )
        .finally(() => {
          this.warming--;
          // Continue filling after a success only. A failed start is never retried
          // in a loop; the next real case cold-starts and reports the failure.
          if (started) this.replenish();
        });
      this.background.add(warming);
      void warming.finally(() => this.background.delete(warming));
    }
  }
  /** Recycles an aged standby and starts its replacement. */
  private expire(jail: Jail) {
    const index = this.standby.indexOf(jail);
    if (index < 0) return;
    this.standby.splice(index, 1);
    this.discard(jail);
    this.replenish();
  }
  /**
   * Applies one case's limits to a gated jail and reads every one back from
   * the kernel before GO: memory on both case cgroups, normal CPU weight, and
   * the CPU-time rlimit the bootstrap lowers once it holds the request.
   */
  private async arm(
    jail: Jail,
    request: { bytes: Buffer; memoryLimitMb: number; timeLimitMs: number },
    signal: AbortSignal,
  ) {
    const r = this.manifest.resources;
    const inner = String(request.memoryLimitMb * 1024 * 1024);
    const outer = String((request.memoryLimitMb + r.scratchMb) * 1024 * 1024);
    writeControl(join(jail.inner!, "memory.max"), inner);
    writeControl(join(jail.cgroup, "memory.max"), outer);
    writeControl(join(jail.cgroup, "cpu.weight"), "100");
    if (
      (await readControl(join(jail.inner!, "memory.max"))) !== inner ||
      (await readControl(join(jail.cgroup, "memory.max"))) !== outer ||
      (await readControl(join(jail.cgroup, "cpu.weight"))) !== "100"
    )
      throw new NativeInfrastructureError("Jail kernel controls mismatch");
    const gate = jail.gate!;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new NativeInfrastructureError("Native limit deadline")),
        this.options.startupTimeoutMs ?? 10000,
      );
      const finish = (error?: unknown) => {
        clearTimeout(timer);
        gate.off("data", onData);
        gate.off("end", onEnd);
        signal.removeEventListener("abort", onCancel);
        if (error) reject(error);
        else resolve();
      };
      const onData = (bytes: Buffer) =>
        finish(
          bytes.length === 1 && bytes[0] === 65
            ? undefined
            : new NativeInfrastructureError("Invalid bootstrap limit acknowledgement"),
        );
      const onEnd = () =>
        finish(new NativeInfrastructureError("Jail failed before learner start"));
      const onCancel = () =>
        finish(new NativeInfrastructureError("Native execution cancelled"));
      gate.once("data", onData);
      gate.once("end", onEnd);
      signal.addEventListener("abort", onCancel, { once: true });
      if (signal.aborted) onCancel();
      jail.child!.stdin!.end(request.bytes);
    });
    const seconds = String(cpuRlimitSeconds(request.timeLimitMs));
    const limits = readFileSync(`/proc/${jail.pid}/limits`, "utf8");
    const cpu = /^Max cpu time\s+(\S+)\s+(\S+)\s+seconds\s*$/m.exec(limits);
    if (!cpu || cpu[1] !== seconds || cpu[2] !== seconds)
      throw new NativeInfrastructureError("Jail CPU rlimit mismatch");
  }
  async close() {
    this.closing = true;
    for (const jail of this.standby.splice(0)) {
      clearTimeout(jail.expiry);
      this.discard(jail);
    }
    while (this.background.size) await Promise.allSettled([...this.background]);
    this.store?.clear();
  }
  async execute(
    raw: NativeExecutionRequest,
    signal: AbortSignal,
    draining: () => void,
    deliver?: (result: NativeExecutionResult) => void,
  ): Promise<NativeExecutionResult> {
    if (!this.prepared && !this.probing)
      throw new NativeInfrastructureError("Native backend is not prepared");
    const { signal: ignored, ...data } = raw;
    const request = requestSchema.parse(data),
      r = this.manifest.resources;
    if (request.memoryLimitMb > r.maxCaseMemoryMb)
      throw new NativeInfrastructureError("Memory exceeds native certificate");
    return this.runCase(
      {
        claim: async () => {
          const standby =
            this.probing || request.timeLimitMs > POOL_CASE_TIME_LIMIT_MS
              ? undefined
              : this.claimStandby();
          return standby
            ? { jail: standby, prewarmed: true }
            : { jail: await this.startJail(this.pythonProfile(false, request.timeLimitMs), signal), prewarmed: false };
        },
        bytes: guestRequest(request),
        memoryLimitMb: request.memoryLimitMb,
        timeLimitMs: request.timeLimitMs,
        wallLimitMs: request.timeLimitMs,
        outputLimitBytes: request.outputLimitBytes ?? gradingDataLimits.stdoutBytes,
      },
      ({ exit, oom, timedOut }) => {
        if (exit.signal && !timedOut)
          throw new NativeInfrastructureError(
            "Native supervisor terminated unexpectedly",
          );
        return {
          outcome:
            oom > 0
              ? "MEMORY_LIMIT"
              : timedOut
                ? "TIME_LIMIT"
                : exit.code === 0
                  ? "PASSED"
                  : "RUNTIME_ERROR",
        };
      },
      signal,
      draining,
      deliver,
    );
  }
  /**
   * One case of a compiled program in a fresh run jail: the leased artifact at
   * `/box/main`, its exec gate reporting how the program ended. No pool: a jail
   * can hold only the binary it was started with.
   */
  async executeBinary(
    raw: NativeBinaryRequest,
    signal: AbortSignal,
    draining: () => void,
    deliver?: (result: NativeExecutionResult) => void,
  ): Promise<NativeExecutionResult> {
    if (!this.gccReady && !this.probing)
      throw new NativeInfrastructureError("GCC runtime is not ready");
    const { signal: ignored, ...data } = raw;
    const request = binaryRequestSchema.parse(data),
      r = this.manifest.resources,
      g = this.options.gcc!;
    if (request.memoryLimitMb > r.maxCaseMemoryMb)
      throw new NativeInfrastructureError("Memory exceeds native certificate");
    const artifact = this.store?.resolve(request.artifact, request.lease);
    if (!artifact) throw new ArtifactLeaseError("Artifact lease is not live");
    const o = this.options;
    const profile: JailProfile = {
      standby: false,
      pidsMax: r.maxCasePids,
      scratchBytes: r.scratchMb * MiB,
      mounts: [{ dst: "/box/main", has: ["ro", "nosuid", "nodev"], lacks: ["noexec"] }],
      config: (cgroup, log) =>
        binaryJailConfig(
          { root: g.runRootPath, policy: g.runPolicyPath, cgroup, log, artifact },
          r,
          request.memoryLimitMb,
          request.timeLimitMs,
          o.startupTimeoutMs ?? 10000,
          o.cleanupTimeoutMs ?? 5000,
        ),
    };
    return this.runCase(
      {
        claim: async () => ({ jail: await this.startJail(profile, signal), prewarmed: false }),
        bytes: gateRequest(Buffer.from(request.stdin, "utf8"), request.timeLimitMs),
        memoryLimitMb: request.memoryLimitMb,
        timeLimitMs: request.timeLimitMs,
        wallLimitMs: request.timeLimitMs,
        outputLimitBytes: request.outputLimitBytes ?? gradingDataLimits.stdoutBytes,
        record: true,
      },
      ({ exit, oom, timedOut, record }) => {
        // Host decisions outrank the record: the whole cgroup was killed.
        if (oom > 0) return { outcome: "MEMORY_LIMIT" };
        if (timedOut) return { outcome: "TIME_LIMIT" };
        const ending = /^([XS]) (\d{1,3})\n$/.exec(record);
        if (exit.signal || exit.code !== 0 || !ending)
          throw new NativeInfrastructureError("Exec gate reported no ending");
        const number = Number(ending[2]);
        if (ending[1] === "X")
          return number === 0
            ? { outcome: "PASSED" }
            : { outcome: "RUNTIME_ERROR", termination: { exit: number } };
        // The kernel's CPU-time backstop fired before the host's own sampling.
        if (number === osConstants.signals.SIGXCPU) return { outcome: "TIME_LIMIT" };
        const signalName = (SIGNAL_NAMES.get(number) ?? "OTHER") as TerminationSignal;
        return { outcome: "RUNTIME_ERROR", termination: { signal: signalName } };
      },
      signal,
      draining,
      deliver,
    );
  }
  private compileKey(language: "C" | "CPP", code: string) {
    return createHash("sha256")
      .update(nativeRuntimeIdentity(this.manifest.gcc!))
      .update("\0")
      .update(language)
      .update("\0")
      .update(code, "utf8")
      .digest("hex");
  }
  /**
   * A cached compile of this exact source, leased for the attempt. Needs no
   * CPU slot: nothing runs.
   */
  cachedCompile(raw: NativeCompileRequest): NativeCompileResult | undefined {
    if (!this.gccReady || !this.store) return undefined;
    const { signal: ignored, ...data } = raw;
    const request = compileRequestSchema.parse(data);
    const key = this.compileKey(request.language, request.code);
    const cached = this.store.lookup(key);
    if (!cached) return undefined;
    return cached.artifact
      ? {
          status: "COMPILED",
          artifact: cached.artifact,
          lease: this.store.lease(key, request.leaseMs),
          diagnostics: cached.diagnostics,
          compileMs: 0,
          cached: true,
        }
      : { status: "COMPILE_ERROR", reason: "ERRORS", diagnostics: cached.diagnostics, compileMs: 0, cached: true };
  }
  releaseLease(lease: string) {
    this.store?.release(lease);
  }
  /**
   * Compiles in a fresh compile jail. The binary is copied into the store and
   * staging is deleted while the compile's cgroup, which its pages are charged
   * to, still exists; the cgroup is removed after, and the caller releases the
   * reservation last.
   */
  async compile(
    raw: NativeCompileRequest,
    signal: AbortSignal,
    draining: () => void,
  ): Promise<NativeCompileResult> {
    if (!this.gccReady && !this.probing)
      throw new NativeInfrastructureError("GCC runtime is not ready");
    const { signal: ignored, ...data } = raw;
    const request = compileRequestSchema.parse(data),
      r = this.manifest.resources,
      g = this.options.gcc!,
      store = this.store!;
    const key = this.compileKey(request.language, request.code);
    // Room for this compile's binary is promised before the compiler runs.
    const reservation = store.reserve();
    const staging = mkdtempSync(join(g.stagingPath, "compile-"));
    const source = join(staging, "src"),
      output = join(staging, "out");
    let outcome: NativeCompileResult | undefined;
    try {
      // Traverse-only, for NsJail's bind-mount lookup (see prepareGcc).
      chmodSync(staging, 0o711);
      mkdirSync(source, { mode: 0o755 });
      writeFileSync(join(source, GCC_SOURCE_NAME[request.language]), request.code, { mode: 0o444 });
      mkdirSync(output, { mode: 0o700 });
      chownSync(output, 65534, 65534);
      const o = this.options,
        started = performance.now();
      const profile: JailProfile = {
        standby: false,
        pidsMax: r.maxCompilePids,
        scratchBytes: GCC_COMPILE_LIMITS.scratchMb * MiB,
        mounts: [
          { dst: "/src", has: ["ro", "nosuid", "nodev", "noexec"], lacks: [] },
          { dst: "/out", has: ["rw", "nosuid", "nodev", "noexec"], lacks: [] },
        ],
        config: (cgroup, log) =>
          compileJailConfig(
            { root: g.rootPath, policy: g.compilePolicyPath, cgroup, log, source, output },
            r,
            request.language,
            o.startupTimeoutMs ?? 10000,
            o.cleanupTimeoutMs ?? 5000,
          ),
      };
      await this.runCase(
        {
          claim: async () => ({ jail: await this.startJail(profile, signal), prewarmed: false }),
          bytes: gateRequest(Buffer.alloc(0), GCC_COMPILE_LIMITS.cpuMs),
          memoryLimitMb: r.maxCaseMemoryMb,
          timeLimitMs: GCC_COMPILE_LIMITS.cpuMs,
          wallLimitMs: GCC_COMPILE_LIMITS.wallMs,
          outputLimitBytes: COMPILE_DIAGNOSTICS_LIMIT,
          beforeDispose: () => rmSync(staging, { recursive: true, force: true }),
        },
        ({ exit, oom, timedOut }, stderr) => {
          const diagnostics = boundedDiagnostics(stderr);
          const compileMs = Math.max(0, performance.now() - started);
          if (oom > 0 || timedOut) {
            const limit = oom > 0
              ? `${r.maxCaseMemoryMb} MiB of memory`
              : `${GCC_COMPILE_LIMITS.cpuMs / 1000} s of compile time`;
            outcome = {
              status: "COMPILE_ERROR",
              reason: "LIMITS",
              diagnostics: boundedDiagnostics(`${diagnostics}${diagnostics && !diagnostics.endsWith("\n") ? "\n" : ""}The compiler stopped: compiling this program needs more than ${limit}.\n`),
              compileMs,
              cached: false,
            };
          } else if (exit.signal || exit.code === null || exit.code >= 125) {
            // GCC exits 1 for errors and 4 for an internal compiler error. 125 and
            // 126 are the gate's own faults, above 128 a killed driver (a missing
            // syscall in the policy): ours, never the learner's compile error.
            throw new NativeInfrastructureError("Compiler exited abnormally", { cause: { code: exit.code, signal: exit.signal, diagnostics } });
          } else if (exit.code === 0) {
            const binary = readStagedBinary(join(output, "main"));
            const artifact = store.insert(key, reservation, { binary: { path: join(output, "main"), bytes: binary }, diagnostics })!;
            outcome = { status: "COMPILED", artifact, lease: store.lease(key, request.leaseMs), diagnostics, compileMs, cached: false };
          } else {
            store.insert(key, reservation, { diagnostics });
            outcome = { status: "COMPILE_ERROR", reason: "ERRORS", diagnostics, compileMs, cached: false };
          }
          // Staged pages leave while still charged to this compile's cgroup.
          rmSync(staging, { recursive: true, force: true });
          return { outcome: "PASSED" };
        },
        signal,
        draining,
      );
      if (!outcome) throw new NativeInfrastructureError("Compile produced no result");
      return outcome;
    } finally {
      reservation.release();
      rmSync(staging, { recursive: true, force: true });
    }
  }
  /**
   * One gated case, from claim to proven cleanup: arm its limits, GO, enforce
   * wall and CPU time, wait for the supervisor and every pipe, then let the
   * flavour decide the outcome from the kernel's and the gate's facts.
   */
  private async runCase(
    options: {
      claim: () => Promise<{ jail: Jail; prewarmed: boolean }>;
      bytes: Buffer;
      memoryLimitMb: number;
      timeLimitMs: number;
      wallLimitMs: number;
      outputLimitBytes: number;
      /** Read the exec gate's status record from FD 3 after GO. */
      record?: boolean;
      /** Runs after the case is killed and before its cgroup is removed. */
      beforeDispose?: () => void;
    },
    finish: (facts: CaseFacts, stderr: string) => Pick<NativeExecutionResult, "outcome" | "termination">,
    signal: AbortSignal,
    draining: () => void,
    deliver?: (result: NativeExecutionResult) => void,
  ): Promise<NativeExecutionResult> {
    const executionCallStarted = performance.now();
    let cleanupStarted: number | undefined;
    let completedResult: NativeExecutionResult | undefined;
    let timedOut = false,
      started: number | undefined,
      cpuStart = 0,
      monitor: ReturnType<typeof setTimeout> | undefined,
      // A sample still in flight when the case ends must not schedule another.
      watching = true,
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
      ({ jail, prewarmed } = await options.claim());
      if (!this.probing) this.replenish();
      const { child, gate, stderr } = jail;
      const stdout = new ByteCapture(options.outputLimitBytes);
      jail.stdout = stdout;
      if (jail.exited || jail.earlyOutput)
        throw new NativeInfrastructureError("Jail failed before learner start");
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted)
        throw new NativeInfrastructureError("Native execution cancelled");
      await this.arm(jail, options, signal);
      // The gate's ending arrives on FD 3 after GO; nothing else may use it.
      const record = new ByteCapture(32);
      if (options.record) gate!.on("data", (chunk: Buffer) => record.append(chunk));
      cpuStart = await cpuUsec(jail.cgroup);
      started = performance.now();
      gate!.end("G");
      wall = setTimeout(() => {
        timedOut = true;
        abort();
      }, options.wallLimitMs);
      const cgroup = jail.cgroup;
      // The case group runs on at most one CPU (its verified `cpu.max`), so its
      // CPU time can reach the limit no sooner than the remaining allowance from
      // now. Sample then rather than every 10 ms: a short case is never sampled.
      const watch = (afterMs: number) => {
        if (!watching) return;
        monitor = setTimeout(() => {
          sample = cpuUsec(cgroup)
            .then(
              (usage) => {
                const remainingMs =
                  options.timeLimitMs - (usage - cpuStart) / 1000;
                if (remainingMs <= 0) {
                  timedOut = true;
                  abort();
                } else watch(Math.max(CPU_SAMPLE_MIN_MS, remainingMs));
              },
              (error) => {
                fault = error;
                abort();
              },
            )
            .finally(() => {
              sample = undefined;
            });
        }, afterMs);
      };
      watch(options.timeLimitMs);
      const exit = await jail.processClosed!;
      clearTimeout(wall);
      watching = false;
      clearTimeout(monitor);
      await sample;
      const runtimeMs = Math.max(0, performance.now() - started);
      cleanupStarted = performance.now();
      if (fault) throw fault;
      const oom = await oomKills(cgroup);
      if (signal.aborted)
        throw new NativeInfrastructureError("Native execution cancelled");
      const decided = finish(
        { exit, oom, timedOut, record: record.truncated ? "" : record.text() },
        stderr.text(),
      );
      completedResult = {
        stdout: stdout.text(),
        stderr: stderr.text(),
        outcome: decided.outcome,
        runtimeMs,
        ...(stdout.truncated ? { outputTruncated: true } : {}),
        ...(decided.termination ? { termination: decided.termination } : {}),
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
      watching = false;
      clearTimeout(monitor);
      if (completedResult) {
        // The supervisor has exited and every output pipe has closed, and policy
        // forbids process creation: nothing further can change this verdict.
        // Deliver it now; capacity stays charged until cleanup is proven below.
        completedResult.timings = {
          startupMs: Math.max(0, started! - executionCallStarted),
          executionMs: completedResult.runtimeMs,
          cleanupMs: Math.max(0, performance.now() - cleanupStarted),
          prewarmed,
        };
        deliver?.(completedResult);
      }
      let cleanupError: unknown;
      try {
        await sample;
        await stop();
      } catch (cause) {
        cleanupError = new CleanupUncertainError("Native cleanup uncertain", {
          cause,
        });
      }
      try {
        options.beforeDispose?.();
      } catch (cause) {
        cleanupError ??= new CleanupUncertainError("Native staging cleanup uncertain", { cause });
      }
      // startJail already disposed a jail that failed before it was returned.
      if (jail)
        try {
          await this.disposeJail(jail);
        } catch (cause) {
          cleanupError = cause;
        }
      if (cleanupError) throw cleanupError;
      // A slot may be idle now; refill after a burst instead of at the next claim.
      if (!this.probing) this.replenish();
    }
  }
}
/** The exec gate's request: one header line, then exactly the stdin bytes. */
export function gateRequest(stdin: Buffer, timeLimitMs: number): Buffer {
  return Buffer.concat([
    Buffer.from(`cove-gate-1 ${stdin.length} ${timeLimitMs}\n`),
    stdin,
  ]);
}
/** GCC's messages within their byte bound, cut at a character boundary. */
function boundedDiagnostics(text: string): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= COMPILE_DIAGNOSTICS_LIMIT) return text;
  const marker = "\n[…]\n";
  return (
    new TextDecoder().decode(
      bytes.subarray(0, COMPILE_DIAGNOSTICS_LIMIT - Buffer.byteLength(marker)),
      { stream: true },
    ) + marker
  );
}
/**
 * The compiler's output, read without following a name the learner could
 * have chosen: a regular ELF file within the binary bound, or nothing.
 */
function readStagedBinary(path: string): Buffer {
  let fd: number | undefined;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const st = fstatSync(fd);
    if (!st.isFile() || st.size < 4 || st.size > MAX_ARTIFACT_BYTES)
      throw new NativeInfrastructureError("Compiler output is not a bounded regular file");
    const bytes = Buffer.alloc(st.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (read <= 0) throw new NativeInfrastructureError("Compiler output changed while reading");
      offset += read;
    }
    if (bytes.readUInt32BE(0) !== 0x7f454c46)
      throw new NativeInfrastructureError("Compiler output is not an ELF executable");
    return bytes;
  } catch (cause) {
    if (cause instanceof NativeInfrastructureError) throw cause;
    throw new NativeInfrastructureError("Compiler produced no readable program", { cause });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
/**
 * The request as the guest bootstrap reads it: one header line, then the
 * source and stdin bytes it counts. Plain bytes keep `json` out of every case.
 */
export function guestRequest(request: NativeExecutionRequest): Buffer {
  const code = Buffer.from(request.code, "utf8");
  const stdin = Buffer.from(request.stdin, "utf8");
  const policy = request.inputPromptPolicy ?? "INCLUDE";
  return Buffer.concat([
    Buffer.from(`cove-request-1 ${code.length} ${stdin.length} ${policy} ${request.timeLimitMs}\n`),
    code,
    stdin,
  ]);
}
type Jail = {
  cgroup: string;
  /** NsJail's own child group, holding the one gated Python process. */
  inner?: string;
  pid?: string;
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
