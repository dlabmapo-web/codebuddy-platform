import { type NativeNodeResources } from "@cove/shared";
export const NSJAIL_REVISION = "d8415bc8eea43cdd413daba25af63127019a1189";
/**
 * Longest case a prewarmed jail serves. A standby's supervisor backstop must
 * outlast its wait plus any case it may be given, so this bounds how long
 * learner code can outlive a crashed launcher. Longer cases start their own
 * jail, whose backstop is sized for that case alone.
 */
export const POOL_CASE_TIME_LIMIT_MS = 10_000;
export type JailPaths = {
  rootfs: string;
  policy: string;
  cgroup: string;
  log: string;
};
/**
 * The kernel CPU-time backstop for one case: whole seconds above the authored
 * limit, which the launcher's own cgroup sampling enforces first. The guest
 * bootstrap lowers its rlimit to this before GO; the launcher verifies it.
 */
export const cpuRlimitSeconds = (timeLimitMs: number) =>
  Math.ceil(timeLimitMs / 1000) + 1;
/**
 * Protobuf-text strings are escaped by JSON, never interpolated as shell syntax.
 *
 * Nothing here comes from a request: a jail is started for the node's largest
 * memory class and any case up to `caseTimeLimitMs`, so a verified standby can
 * serve any exercise within it. A case's own memory and CPU limits are applied,
 * and read back from the kernel, when it claims a jail and before its source runs.
 * `startupTimeoutMs` includes any time the jail may wait as a standby.
 */
export function jailConfig(
  paths: JailPaths,
  resources: NativeNodeResources,
  caseTimeLimitMs: number,
  startupTimeoutMs = 10000,
  cleanupTimeoutMs = 5000,
): string {
  const q = JSON.stringify;
  return `name: "cove-native-v1"
mode: ONCE
hostname: "learner"
cwd: "/tmp"
log_level: WARNING
log_file: ${q(paths.log)}
keep_env: false
envar: "LANG=C.UTF-8"
envar: "LC_ALL=C.UTF-8"
envar: "HOME=/tmp"
envar: "PATH=/usr/local/bin"
keep_caps: false
disable_no_new_privs: false
clone_newuser: true
clone_newns: true
clone_newpid: true
clone_newipc: true
clone_newnet: true
clone_newuts: true
clone_newcgroup: true
iface_no_lo: true
uidmap { inside_id: "65534" outside_id: "65534" count: 1 }
gidmap { inside_id: "65534" outside_id: "65534" count: 1 }
mount_proc: false
mount { src: ${q(paths.rootfs)} dst: "/" is_dir: true is_bind: true rw: false nosuid: true nodev: true }
mount { dst: "/tmp" is_dir: true fstype: "tmpfs" options: "size=${resources.scratchMb * 1024 * 1024},mode=1777" rw: true nosuid: true nodev: true noexec: true }
seccomp_policy_file: ${q(paths.policy)}
pass_fd: 3
use_cgroupv2: true
cgroupv2_mount: ${q(paths.cgroup)}
cgroup_mem_max: ${resources.maxCaseMemoryMb * 1024 * 1024}
cgroup_mem_swap_max: 0
cgroup_pids_max: ${resources.maxCasePids}
cgroup_cpu_ms_per_sec: 1000
rlimit_as_type: INF
rlimit_cpu: ${cpuRlimitSeconds(caseTimeLimitMs)}
rlimit_core: 0
rlimit_fsize: ${resources.scratchMb}
rlimit_nofile: 32
rlimit_nproc_type: HARD
rlimit_stack: 8
rlimit_stack_type: VALUE
time_limit: ${Math.ceil((startupTimeoutMs + caseTimeLimitMs + cleanupTimeoutMs) / 1000)}
exec_bin { path: "/usr/local/bin/python3.12" arg: "-I" arg: "-B" arg: "-u" arg: "/opt/cove/bootstrap.py" }
`;
}
/**
 * native-gcc compiler argv, run in `/src` so messages read `main.c:LINE:COL`.
 * C is compiled as Elice compiles it (GCC's default gnu11, no optimization);
 * C++ as judges do. The manifest's descriptor must carry exactly these, and a
 * C++ compile's options must match the precompiled header's.
 */
export const GCC_COMPILE_ARGV = Object.freeze({
  C: Object.freeze([
    "/usr/bin/gcc-12", "main.c", "-o", "/out/main", "-std=gnu11", "-Wall",
    "-DONLINE_JUDGE", "-lm", "-fdiagnostics-color=never", "-fmax-errors=20",
  ]),
  CPP: Object.freeze([
    "/usr/bin/g++-12", "main.cpp", "-o", "/out/main", "-O2", "-Wall",
    "-std=gnu++17", "-DONLINE_JUDGE", "-I/opt/cove/pch", "-Winvalid-pch",
    "-fdiagnostics-color=never", "-fmax-errors=20",
  ]),
});
export const GCC_SOURCE_NAME = Object.freeze({ C: "main.c", CPP: "main.cpp" });
/** One compile: 10 s of CPU, a 20 s wall backstop, 64 MiB of scratch and binary. */
export const GCC_COMPILE_LIMITS = Object.freeze({
  cpuMs: 10_000,
  wallMs: 20_000,
  scratchMb: 64,
  binaryMb: 64,
  nofile: 64,
});
type GccJailPaths = { root: string; policy: string; cgroup: string; log: string };
const sharedJailOptions = (paths: GccJailPaths) => {
  const q = JSON.stringify;
  return `mode: ONCE
hostname: "learner"
log_level: WARNING
log_file: ${q(paths.log)}
keep_env: false
envar: "LANG=C.UTF-8"
envar: "LC_ALL=C.UTF-8"
envar: "HOME=/tmp"
envar: "PATH=/usr/bin"
envar: "TMPDIR=/tmp"
keep_caps: false
disable_no_new_privs: false
clone_newuser: true
clone_newns: true
clone_newpid: true
clone_newipc: true
clone_newnet: true
clone_newuts: true
clone_newcgroup: true
iface_no_lo: true
uidmap { inside_id: "65534" outside_id: "65534" count: 1 }
gidmap { inside_id: "65534" outside_id: "65534" count: 1 }
mount_proc: false
mount { src: ${q(paths.root)} dst: "/" is_dir: true is_bind: true rw: false nosuid: true nodev: true }
seccomp_policy_file: ${q(paths.policy)}
pass_fd: 3
use_cgroupv2: true
cgroupv2_mount: ${q(paths.cgroup)}
cgroup_mem_swap_max: 0
cgroup_cpu_ms_per_sec: 1000
rlimit_as_type: INF
rlimit_core: 0
rlimit_nproc_type: HARD
`;
};
/**
 * The compile jail: the toolchain root read-only, the launcher's source as a
 * read-only `/src`, an empty writable `/out` for the binary, and `/tmp` for
 * GCC's temporaries. Every writable mount is noexec. The exec gate execs the
 * driver after GO; it starts its stages within `maxCompilePids`.
 */
export function compileJailConfig(
  paths: GccJailPaths & { source: string; output: string },
  resources: NativeNodeResources,
  language: "C" | "CPP",
  startupTimeoutMs = 10000,
  cleanupTimeoutMs = 5000,
): string {
  const q = JSON.stringify;
  const l = GCC_COMPILE_LIMITS;
  return `name: "cove-native-gcc-compile-v1"
cwd: "/src"
${sharedJailOptions(paths)}mount { src: ${q(paths.source)} dst: "/src" is_dir: true is_bind: true rw: false nosuid: true nodev: true noexec: true }
mount { src: ${q(paths.output)} dst: "/out" is_dir: true is_bind: true rw: true nosuid: true nodev: true noexec: true }
mount { dst: "/tmp" is_dir: true fstype: "tmpfs" options: "size=${l.scratchMb * 1024 * 1024},mode=1777" rw: true nosuid: true nodev: true noexec: true }
cgroup_mem_max: ${resources.maxCaseMemoryMb * 1024 * 1024}
cgroup_pids_max: ${resources.maxCompilePids}
rlimit_cpu: ${cpuRlimitSeconds(l.cpuMs)}
rlimit_fsize: ${l.binaryMb}
rlimit_nofile: ${l.nofile}
rlimit_stack: 8
rlimit_stack_type: VALUE
time_limit: ${Math.ceil((startupTimeoutMs + l.wallMs + cleanupTimeoutMs) / 1000)}
exec_bin { path: "/opt/cove/exec-gate" arg: "exec" ${GCC_COMPILE_ARGV[language].map((arg) => `arg: ${q(arg)}`).join(" ")} }
`;
}
/**
 * The run jail for one case of a compiled program: the run root read-only,
 * the leased artifact bound read-only and executable at `/box/main`, `/tmp`
 * noexec. The exec gate forks the program and reports how it ended. The stack
 * may use the whole memory limit, so deep recursion behaves as on judges.
 */
export function binaryJailConfig(
  paths: GccJailPaths & { artifact: string },
  resources: NativeNodeResources,
  memoryLimitMb: number,
  caseTimeLimitMs: number,
  startupTimeoutMs = 10000,
  cleanupTimeoutMs = 5000,
): string {
  const q = JSON.stringify;
  return `name: "cove-native-gcc-run-v1"
cwd: "/tmp"
${sharedJailOptions(paths)}mount { src: ${q(paths.artifact)} dst: "/box/main" is_dir: false is_bind: true rw: false nosuid: true nodev: true }
mount { dst: "/tmp" is_dir: true fstype: "tmpfs" options: "size=${resources.scratchMb * 1024 * 1024},mode=1777" rw: true nosuid: true nodev: true noexec: true }
cgroup_mem_max: ${resources.maxCaseMemoryMb * 1024 * 1024}
cgroup_pids_max: ${resources.maxCasePids}
rlimit_cpu: ${cpuRlimitSeconds(caseTimeLimitMs)}
rlimit_fsize: ${resources.scratchMb}
rlimit_nofile: 32
rlimit_stack: ${memoryLimitMb}
rlimit_stack_type: VALUE
time_limit: ${Math.ceil((startupTimeoutMs + caseTimeLimitMs + cleanupTimeoutMs) / 1000)}
exec_bin { path: "/opt/cove/exec-gate" arg: "run" arg: "/box/main" }
`;
}
