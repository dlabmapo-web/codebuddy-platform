import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  nativeReleaseManifestSchema,
  sameNativeRuntime,
  type NativeGccDescriptor,
} from "@cove/shared";
import { nativeRuntimeVersion, terminationSchema, wireRequestSchema } from "../src/contract.js";
import { gateRequest } from "../src/launcher.js";
import { binaryJailConfig, compileJailConfig, GCC_COMPILE_ARGV, NSJAIL_REVISION } from "../src/policy.js";
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
