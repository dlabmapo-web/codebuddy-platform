// Strict negative gate probe for an ordinary Docker container; no host mounts,
// no privilege escalation and no attempt to repair missing delegated controls.
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { arch, totalmem } from "node:os";
import { NsJailBackend, fileDigest, rootfsDigest } from "../dist/index.js";
import { jailConfig, NSJAIL_REVISION } from "../dist/policy.js";
const rootfsPath = "/opt/cove/rootfs",
  policyPath = "/opt/cove/python.policy",
  nsjailPath = "/usr/local/bin/nsjail";
const descriptor = {
  schemaVersion: 1,
  engine: "native-cpython",
  pythonVersion: "3.12.12",
  architecture: arch() === "arm64" ? "arm64" : "amd64",
  rootfsDigest: (await readFile("/opt/cove/rootfs.digest", "utf8")).trim(),
  packageManifestDigest: await fileDigest(
    rootfsPath + "/opt/cove/packages.json",
  ),
  nsjailRevision: NSJAIL_REVISION,
  nsjailBinaryDigest: await fileDigest(nsjailPath),
  sandboxPolicyVersion: "nsjail-cpython-v1",
  sandboxPolicyDigest: await fileDigest(policyPath),
  guestBootstrapDigest: await fileDigest(rootfsPath + "/opt/cove/bootstrap.py"),
  comparator: {
    engine: "pyodide",
    version: "fixture-only-not-certified",
    semanticsVersion: "fixture-only",
    packageDigest: "sha256:" + "0".repeat(64),
  },
};
if ((await rootfsDigest(rootfsPath)) !== descriptor.rootfsDigest)
  throw new Error("Built rootfs digest mismatch");
const resources = {
  physicalMemoryMb: Math.floor(totalmem() / 1024 / 1024),
  envelopeMemoryMb: 2048,
  serviceOverheadMb: 256,
  caseOverheadMb: 128,
  cpuSlots: 2,
  officialReservedSlots: 1,
  officialReservedMemoryMb: 768,
  maxCaseMemoryMb: 512,
  maxCasePids: 8,
  scratchMb: 16,
};
const options = {
  manifest: { schemaVersion: 1, descriptor, resources, eligibility: [] },
  rootfsPath,
  policyPath,
  nsjailPath,
  cgroupRoot: "/sys/fs/cgroup",
  workRoot: "/tmp/cove-work",
};
let unavailable = false;
try {
  await new NsJailBackend(options).prepare();
} catch (error) {
  unavailable = true;
  console.log(
    JSON.stringify({
      gate: "actual-launcher-preflight",
      status: "UNSUPPORTED",
      reason: String(error),
      descriptor,
    }),
  );
}
// Exercise the exact NsJail config parser and real namespace creation too. Failure
// is preserved, never used to bypass the preceding actual launcher preflight.
const cfg = jailConfig(
  {
    rootfs: rootfsPath,
    policy: policyPath,
    cgroup: "/sys/fs/cgroup",
    log: "/tmp/nsjail.log",
  },
  resources,
);
await writeFile("/tmp/nsjail.cfg", cfg);
const child = spawn(nsjailPath, ["--config", "/tmp/nsjail.cfg"], {
  stdio: ["ignore", "pipe", "pipe", "pipe"],
  env: { PATH: "/usr/bin:/bin" },
});
let stderr = "";
child.stderr.on(
  "data",
  (b) => (stderr += b.toString().slice(0, 8192 - stderr.length)),
);
const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
clearTimeout(timer);
const log = await readFile("/tmp/nsjail.log", "utf8").catch(() => stderr);
console.log(
  JSON.stringify({
    gate: "actual-nsjail-start",
    status: code === 0 ? "UNEXPECTED_PASS" : "UNSUPPORTED_OR_FAILED",
    code,
    log: log.slice(0, 8192),
  }),
);
process.exitCode = unavailable ? 78 : 1;
