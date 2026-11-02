import { type NativeNodeResources } from "@cove/shared";
import type { NativeExecutionRequest } from "./contract.js";
export const NSJAIL_REVISION = "d8415bc8eea43cdd413daba25af63127019a1189";
export type JailPaths = {
  rootfs: string;
  policy: string;
  cgroup: string;
  log: string;
};
/** Protobuf-text strings are escaped by JSON, never interpolated as shell syntax. */
export function jailConfig(
  paths: JailPaths,
  request: NativeExecutionRequest,
  resources: NativeNodeResources,
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
mount { src: ${q(paths.rootfs)} dst: "/" is_bind: true rw: false nosuid: true nodev: true }
mount { dst: "/tmp" fstype: "tmpfs" options: "size=${resources.scratchMb * 1024 * 1024},mode=1777" rw: true nosuid: true nodev: true noexec: true }
seccomp_policy_file: ${q(paths.policy)}
pass_fd: 3
use_cgroupv2: true
cgroupv2_mount: ${q(paths.cgroup)}
cgroup_mem_max: ${request.memoryLimitMb * 1024 * 1024}
cgroup_mem_swap_max: 0
cgroup_pids_max: ${resources.maxCasePids}
cgroup_cpu_ms_per_sec: 1000
rlimit_as_type: INF
rlimit_cpu: ${Math.ceil(request.timeLimitMs / 1000) + 1}
rlimit_core: 0
rlimit_fsize: ${resources.scratchMb}
rlimit_nofile: 32
rlimit_nproc_type: INF
rlimit_stack: 8
rlimit_stack_type: VALUE
time_limit: ${Math.ceil((startupTimeoutMs + request.timeLimitMs + cleanupTimeoutMs) / 1000)}
exec_bin { path: "/usr/local/bin/python3.12" arg: "-I" arg: "-B" arg: "-u" arg: "/opt/cove/bootstrap.py" }
`;
}
