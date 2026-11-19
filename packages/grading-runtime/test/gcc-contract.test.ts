import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  nativeReleaseManifestSchema,
  sameNativeRuntime,
  type NativeGccDescriptor,
} from "@cove/shared";
import { compileRequestSchema, nativeRuntimeVersion, resultSchema, terminationSchema, wireRequestSchema } from "../src/contract.js";
import { blockedReadFd, gateRequest } from "../src/launcher.js";
import { binaryJailConfig, compileJailConfig, GCC_COMPILE_ARGV, gccCompileArgvFor, NSJAIL_REVISION } from "../src/policy.js";
import { manifest, request } from "./fixtures.js";

const digest = `sha256:${"1".repeat(64)}`;
const gcc: NativeGccDescriptor = {
  schemaVersion: 1,
  engine: "native-gcc",
  gccVersion: "12.2.0",
  architecture: manifest.descriptor.architecture,
  toolchainRootfsDigest: digest,
  runRootfsDigest: digest,
  packageManifestDigest: digest,
  compile: { C: { argv: [...GCC_COMPILE_ARGV.C] }, CPP: { argv: [...GCC_COMPILE_ARGV.CPP], pchDigest: digest } },
  nsjailRevision: NSJAIL_REVISION,
  nsjailBinaryDigest: manifest.descriptor.nsjailBinaryDigest,
  sandboxPolicyVersion: "nsjail-gcc-v1",
  compilePolicyDigest: digest,
  runPolicyDigest: digest,
  execGateDigest: digest,
  comparator: manifest.descriptor.comparator,
};
const wire = (body: Record<string, unknown>) =>
  wireRequestSchema.safeParse({ protocol: 2, id: randomUUID(), lane: "official", ...body }).success;
const binary = { artifact: digest, lease: randomUUID(), stdin: "", timeLimitMs: 1000, memoryLimitMb: 64 };
const compile = { language: "C", code: "int main(void){return 0;}", leaseMs: 60_000 };

test("each request body belongs to one operation and one runtime family", () => {
  assert.equal(wire({ descriptor: manifest.descriptor, operation: "run", request }), true);
  assert.equal(wire({ descriptor: manifest.descriptor, operation: "run", binary }), false);
  assert.equal(wire({ descriptor: gcc, operation: "run", binary }), true);
  assert.equal(wire({ descriptor: gcc, operation: "run", request }), false);
  assert.equal(wire({ descriptor: gcc, operation: "compile", compile }), true);
  assert.equal(wire({ descriptor: manifest.descriptor, operation: "compile", compile }), false);
  assert.equal(wire({ descriptor: gcc, operation: "release", release: { lease: randomUUID() } }), true);
  assert.equal(wire({ descriptor: gcc, operation: "health" }), true);
  assert.equal(wire({ descriptor: gcc, operation: "health", compile }), false);
  assert.equal(wire({ descriptor: gcc, operation: "compile", compile, binary }), false);
  // A version 1 client is refused rather than half understood.
  assert.equal(wireRequestSchema.safeParse({ protocol: 1, id: randomUUID(), lane: "official", descriptor: gcc, operation: "health" }).success, false);
  assert.equal(wire({ descriptor: gcc, operation: "compile", compile: { ...compile, language: "PYTHON" } }), false);
});

test("the two families have distinct identities, and CPython's version format is unchanged", () => {
  assert.match(nativeRuntimeVersion(manifest.descriptor), /^native-cpython-[0-9a-f]{64}$/);
  assert.match(nativeRuntimeVersion(gcc), /^native-gcc-[0-9a-f]{64}$/);
  assert.equal(sameNativeRuntime(manifest.descriptor, gcc), false);
  // Every field of the GCC identity counts, including each language's argv.
  assert.notEqual(
    nativeRuntimeVersion(gcc),
    nativeRuntimeVersion({ ...gcc, compile: { ...gcc.compile, C: { argv: [...GCC_COMPILE_ARGV.C, "-O2"] } } }),
  );
});

test("a manifest carries GCC only as version 2, sharing NsJail and comparator, with a store that fits", () => {
  const v2 = { ...manifest, schemaVersion: 2 as const, gcc, resources: { ...manifest.resources, serviceOverheadMb: 512 } };
  assert.equal(nativeReleaseManifestSchema.safeParse(v2).success, true);
  assert.equal(nativeReleaseManifestSchema.safeParse({ ...v2, schemaVersion: 1 }).success, false);
  assert.equal(nativeReleaseManifestSchema.safeParse({ ...v2, gcc: { ...gcc, nsjailBinaryDigest: `sha256:${"2".repeat(64)}` } }).success, false);
  assert.equal(nativeReleaseManifestSchema.safeParse({ ...v2, gcc: { ...gcc, architecture: "amd64" } }).success, gcc.architecture === "amd64");
  // Every slot's largest artifact must fit, and the whole store inside the service overhead.
  assert.equal(nativeReleaseManifestSchema.safeParse({ ...v2, resources: { ...v2.resources, artifactStoreMb: 129 } }).success, false);
  assert.equal(nativeReleaseManifestSchema.safeParse({ ...v2, resources: { ...v2.resources, artifactStoreMb: 512 } }).success, false);
  // A CPython-only manifest is untouched by the store bounds.
  assert.equal(nativeReleaseManifestSchema.safeParse({ ...manifest, resources: { ...manifest.resources, artifactStoreMb: 64 } }).success, true);
});

test("the gate's request is a header counting exactly the stdin bytes", () => {
  const bytes = gateRequest(Buffer.from("한 2\n"), 1500);
  assert.equal(bytes.toString(), "cove-gate-1 6 1500\n한 2\n");
  assert.equal(gateRequest(Buffer.alloc(0), 10_000).toString(), "cove-gate-1 0 10000\n");
});

test("an interactive Run holds its input open, and its result may say it was waiting", () => {
  assert.equal(gateRequest(Buffer.from("40 2\n"), 1000, true).toString(), "cove-gate-1 5 1000 hold\n40 2\n");
  assert.equal(wire({ descriptor: gcc, operation: "run", binary: { ...binary, holdStdin: true } }), true);
  assert.equal(resultSchema.safeParse({ stdout: "Enter n: ", stderr: "", outcome: "PASSED", runtimeMs: 3, awaitingInput: true }).success, true);
  assert.equal(resultSchema.safeParse({ stdout: "", stderr: "", outcome: "PASSED", runtimeMs: 3, awaitingInput: false }).success, false);
});

test("a held Run's program is waiting only when the kernel shows it parked in a read", () => {
  // read(0, …) on x86-64 and arm64, and readv on a copy of stdin.
  assert.equal(blockedReadFd("0 0x0 0x55d1c0a2b2a0 0x1000 0x0 0x0 0x0 0x7ffd5e8 0x7f1a2\n", "x64"), 0);
  assert.equal(blockedReadFd("63 0x0 0xaaaad5e0 0x1000 0x0 0x0 0x0 0xffffe2a0 0xffff9a10\n", "arm64"), 0);
  assert.equal(blockedReadFd("19 0x3 0x7ffd5e8 0x1 0x0 0x0 0x0 0x7ffd5e8 0x7f1a2\n", "x64"), 3);
  // Sleeping (clock_nanosleep), running, or outside any call is not waiting.
  assert.equal(blockedReadFd("230 0x0 0x0 0x7ffd5e8 0x0 0x0 0x0 0x7ffd5e8 0x7f1a2\n", "x64"), null);
  assert.equal(blockedReadFd("115 0x0 0x0 0xffffe2a0 0x0 0x0 0x0 0xffffe2a0 0xffff9a10\n", "arm64"), null);
  assert.equal(blockedReadFd("running\n", "x64"), null);
  assert.equal(blockedReadFd("-1 0x7ffd5e8 0x7f1a2\n", "x64"), null);
  // Numbers are per architecture: x86-64's read is arm64's io_setup.
  assert.equal(blockedReadFd("0 0x0 0x1 0x2 0x0 0x0 0x0 0xffffe2a0 0xffff9a10\n", "arm64"), null);
  assert.equal(blockedReadFd("0 0x0 0x1 0x2 0x0 0x0 0x0 0x1 0x1\n", "ia32"), null);
});

test("compile and run jails expose only what each stage needs", () => {
  const paths = { root: "/opt/cove/gcc-root", policy: "/opt/cove/gcc-compile.policy", cgroup: "/sys/fs/cgroup/case-x", log: "/w/l" };
  const compileConfig = compileJailConfig({ ...paths, source: "/s/src", output: "/s/out" }, manifest.resources, "CPP");
  assert.match(compileConfig, /exec_bin \{ path: "\/opt\/cove\/exec-gate" arg: "exec" arg: "\/usr\/bin\/g\+\+-12" arg: "main.cpp"/);
  assert.match(compileConfig, /dst: "\/src" is_dir: true is_bind: true rw: false nosuid: true nodev: true noexec: true/);
  assert.match(compileConfig, /dst: "\/out" is_dir: true is_bind: true rw: true nosuid: true nodev: true noexec: true/);
  assert.match(compileConfig, /cgroup_pids_max: 16\n/);
  assert.match(compileConfig, /cwd: "\/src"/);
  assert.match(compileConfig, /rlimit_cpu: 11\n/);
  const runConfig = binaryJailConfig({ ...paths, policy: "/opt/cove/gcc-run.policy", artifact: "/a/bin-x" }, manifest.resources, 256, 2000);
  assert.match(runConfig, /src: "\/a\/bin-x" dst: "\/box\/main" is_dir: false is_bind: true rw: false nosuid: true nodev: true \}/);
  assert.doesNotMatch(runConfig.split("\n").find((line) => line.includes("/box/main"))!, /noexec/);
  assert.match(runConfig, /dst: "\/tmp".*noexec: true/);
  assert.match(runConfig, /rlimit_stack: 256\n/);
  assert.match(runConfig, /exec_bin \{ path: "\/opt\/cove\/exec-gate" arg: "run" arg: "\/box\/main" \}/);
  assert.match(runConfig, /cgroup_pids_max: 8\n/);
});

test("a program's ending is an exit code or a named signal, nothing else", () => {
  assert.equal(terminationSchema.safeParse({ exit: 139 }).success, true);
  assert.equal(terminationSchema.safeParse({ signal: "SIGSEGV" }).success, true);
  assert.equal(terminationSchema.safeParse({ signal: "SIGWINCH" }).success, false);
  assert.equal(terminationSchema.safeParse({ exit: 256 }).success, false);
  assert.equal(terminationSchema.safeParse({ exit: 1, signal: "SIGSEGV" }).success, false);
});

test("a multi-file compile names safe paths, and its sources replace main.c in the descriptor's argv", () => {
  const files = [
    { path: "main.cpp", content: '#include "sum.h"\nint main(){return sum(1,2);}' },
    { path: "sum.c", content: "int sum(int a,int b){return a+b;}" },
    { path: "sum.h", content: "int sum(int,int);" },
    { path: "lib/util.cc", content: "" },
  ];
  const project = { language: "CPP", files, sources: ["main.cpp", "sum.c"], leaseMs: 60_000 };
  assert.equal(compileRequestSchema.safeParse(project).success, true);
  assert.equal(wire({ descriptor: gcc, operation: "compile", compile: project }), true);
  const refused = [
    { ...project, code: "int main(){}" },
    { ...project, sources: undefined },
    { ...project, sources: ["sum.h"] },
    { ...project, sources: ["missing.cpp"] },
    { ...project, sources: ["main.cpp", "main.cpp"] },
    { ...project, files: [...files, { path: "-wrapper,/bin/sh.c", content: "" }] },
    { ...project, files: [...files, { path: "../escape.c", content: "" }] },
    { ...project, files: [...files, { path: "/etc/x.c", content: "" }] },
    { ...project, files: [...files, { path: "SUM.c", content: "" }] },
    { ...project, language: "C" },
    { language: "C", leaseMs: 60_000 },
  ];
  for (const body of refused) assert.equal(compileRequestSchema.safeParse(body).success, false, JSON.stringify(body).slice(0, 80));

  assert.deepEqual(gccCompileArgvFor("C"), GCC_COMPILE_ARGV.C);
  const argv = gccCompileArgvFor("CPP", ["main.cpp", "sum.c"]);
  assert.deepEqual(argv, [GCC_COMPILE_ARGV.CPP[0], "main.cpp", "sum.c", ...GCC_COMPILE_ARGV.CPP.slice(2)]);
  const config = compileJailConfig(
    { root: "/r", policy: "/p", cgroup: "/c", log: "/l", source: "/s", output: "/o" },
    manifest.resources, "CPP", 10_000, 5_000, ["main.cpp", "sum.c"],
  );
  assert.match(config, /arg: "main.cpp" arg: "sum.c" arg: "-o"/);
});
