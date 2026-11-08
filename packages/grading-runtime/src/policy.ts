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
