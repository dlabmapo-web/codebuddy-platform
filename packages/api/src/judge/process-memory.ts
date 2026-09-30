import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Charged process memory, including pages compressed/swapped out by the OS. */
export function linuxMemoryMb(status: string): number | null {
  const rss = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
  const swap = /^VmSwap:\s+(\d+)\s+kB$/m.exec(status);
  if (!rss || !swap) return null;
  const kb = Number(rss[1]) + Number(swap[1]);
  return Number.isFinite(kb) && kb > 0 ? kb / 1024 : null;
}

let macHelper: string | null | undefined;
/**
 * Darwin's `ps rss` excludes compressed pages. On an 8GB development machine
 * the OS can compress the runner as it allocates, turning a 640MB allocation
 * into a passing result against a 128MB limit. libproc's physical footprint
 * includes that charge. The small helper is parent-owned, never exposed to
 * Python, and uses the public SDK rather than parsing vmmap's slow report.
 *
 * macOS development requires Xcode Command Line Tools. Linux production uses
 * /proc directly and never needs a compiler. Missing telemetry fails closed.
 */
function macMemoryHelper(): string | null {
  if (macHelper !== undefined) return macHelper;
  macHelper = null;
  const directory = mkdtempSync(join(tmpdir(), "cove-memory-"));
  const executable = join(directory, "footprint");
  try {
    execFileSync("/usr/bin/cc", ["-O2", "-x", "c", "-", "-o", executable], {
      input: `#include <libproc.h>
#include <sys/resource.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>
int main(int argc, char **argv) {
  if (argc != 2) return 1;
  char *end;
  long pid = strtol(argv[1], &end, 10);
  if (*end || pid <= 0 || pid > INT_MAX) return 1;
  struct rusage_info_v2 usage = {0};
  if (proc_pid_rusage((int)pid, RUSAGE_INFO_V2, (rusage_info_t *)&usage)) return 1;
  printf("%llu\\n", (unsigned long long)usage.ri_phys_footprint);
  return 0;
}
`,
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    macHelper = executable;
    process.once("exit", () =>
      rmSync(directory, { recursive: true, force: true }),
    );
  } catch {
    rmSync(directory, { recursive: true, force: true });
  }
  return macHelper;
}

export function readProcessMemoryMb(pid: number): number | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === "linux")
      return linuxMemoryMb(readFileSync(`/proc/${pid}/status`, "utf8"));
    if (process.platform === "darwin") {
      const helper = macMemoryHelper();
      if (!helper) return null;
      const bytes = Number(
        execFileSync(helper, [String(pid)], {
          encoding: "utf8",
          timeout: 1000,
          stdio: ["ignore", "pipe", "pipe"],
        }).trim(),
      );
      return Number.isFinite(bytes) && bytes > 0 ? bytes / 1024 / 1024 : null;
    }
  } catch {
    // The runner exited, or telemetry failed. The engine distinguishes those.
  }
  return null;
}
