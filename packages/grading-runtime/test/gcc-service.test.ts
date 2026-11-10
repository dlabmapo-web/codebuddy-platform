import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { NativeGccDescriptor, NativeReleaseManifest } from "@cove/shared";
import { NativeExecutionService, CleanupUncertainError, type NativeBackend } from "../src/service.js";
import { NativeExecutionClient } from "../src/client.js";
import { ArtifactLeaseError, ArtifactStoreBusyError } from "../src/artifact-store.js";
import { NativeInfrastructureError, type NativeCompileResult } from "../src/contract.js";
import { GCC_COMPILE_ARGV } from "../src/policy.js";
import { manifest, request, result } from "./fixtures.js";

const digest = `sha256:${"1".repeat(64)}`;
const gcc: NativeGccDescriptor = {
  schemaVersion: 1, engine: "native-gcc", gccVersion: "12.2.0", architecture: manifest.descriptor.architecture,
  toolchainRootfsDigest: digest, runRootfsDigest: digest, packageManifestDigest: digest,
  compile: { C: { argv: [...GCC_COMPILE_ARGV.C] }, CPP: { argv: [...GCC_COMPILE_ARGV.CPP], pchDigest: digest } },
  nsjailRevision: manifest.descriptor.nsjailRevision, nsjailBinaryDigest: manifest.descriptor.nsjailBinaryDigest,
  sandboxPolicyVersion: "nsjail-gcc-v1", compilePolicyDigest: digest, runPolicyDigest: digest, execGateDigest: digest,
  comparator: manifest.descriptor.comparator,
};
const withGcc: NativeReleaseManifest = { ...manifest, schemaVersion: 2, gcc };
const artifact = `sha256:${"a".repeat(64)}`;
const compiled = (lease = randomUUID()): NativeCompileResult =>
  ({ status: "COMPILED", artifact, lease, diagnostics: "", compileMs: 5, cached: false });
const compileRequest = { language: "C" as const, code: "int main(void) { return 0; }", leaseMs: 60_000 };
const binary = (lease: string) => ({ code: "", artifact, lease, stdin: "", timeLimitMs: 1000, memoryLimitMb: 64 });

/** A GCC-capable backend whose every hook a test can replace. */
function gccBackend(overrides: Partial<NativeBackend> = {}) {
  const state = { available: true, withdrawn: [] as string[], released: [] as string[] };
  const backend: NativeBackend = {
    prepare: async () => {},
    execute: async () => result,
    get gccAvailable() { return state.available; },
    withdrawGcc: (reason: string) => { state.available = false; state.withdrawn.push(reason); },
    cachedCompile: () => undefined,
    compile: async () => compiled(),
    executeBinary: async () => ({ ...result, stdout: "42\n" }),
    releaseLease: (lease: string) => { state.released.push(lease); },
    ...overrides,
  };
  return { backend, state };
}

async function fixture(backend: NativeBackend, served: NativeReleaseManifest = withGcc) {
  // macOS Unix socket sun_path is short; use /tmp rather than long $TMPDIR.
  const directory = await mkdtemp("/tmp/cove-gcc-");
  const socketPath = join(directory, "s");
  const service = new NativeExecutionService({ socketPath, manifest: served, backend });
  await service.listen();
  const client = (descriptor: NativeReleaseManifest["descriptor"] | NativeGccDescriptor) =>
    new NativeExecutionClient({ socketPath, descriptor, lane: "official", acquisitionTimeoutMs: 1000 });
  const python = client(manifest.descriptor), native = client(gcc);
  return {
    service, python, native,
    close: async () => {
      await python.dispose(); await native.dispose();
      await service.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
const idle = async (service: NativeExecutionService) => {
  for (let i = 0; service.bank.snapshot().active + service.bank.snapshot().draining > 0; i++) {
    if (i > 100) throw new Error("capacity was never released");
    await delay(10);
  }
};

test("each family reports its own readiness: GCC withdrawn leaves Python ready", async () => {
  const { backend, state } = gccBackend();
  const f = await fixture(backend);
  try {
    assert.equal((await f.native.health()).ready, true);
    state.available = false;
    assert.equal((await f.native.health()).ready, false);
    assert.equal((await f.python.health()).ready, true);
    assert.deepEqual(await f.python.run(request), result);
    // Unready GCC is refused as busy, never run.
    await assert.rejects(f.native.compile(compileRequest), /UNAVAILABLE/);
  } finally { await f.close(); }
});

test("a GCC setup failure withdraws GCC only; a cleanup uncertainty quarantines the node", async () => {
  const failing = gccBackend({ executeBinary: async () => { throw new NativeInfrastructureError("jail failed before learner start"); } });
  const f = await fixture(failing.backend);
  try {
    await assert.rejects(f.native.run(binary(randomUUID())), /INFRASTRUCTURE/);
    assert.deepEqual(failing.state.withdrawn, ["jail failed before learner start"]);
    assert.equal((await f.native.health()).ready, false);
    assert.equal(f.service.bank.ready, true);
    assert.equal((await f.python.health()).ready, true);
  } finally { await f.close(); }

  const uncertain = gccBackend({ executeBinary: async () => { throw new CleanupUncertainError("cgroup still populated"); } });
  const g = await fixture(uncertain.backend);
  try {
    await assert.rejects(g.native.run(binary(randomUUID())));
    assert.equal(g.service.bank.ready, false);
    assert.equal((await g.python.health()).ready, false);
  } finally { await g.close(); }
});

test("a full artifact store is busy, retried within acquisition, and holds no capacity", async () => {
  let attempts = 0;
  const { backend, state } = gccBackend({
    compile: async () => {
      if (++attempts < 3) throw new ArtifactStoreBusyError("store full of leased artifacts");
      return compiled();
    },
  });
  const f = await fixture(backend);
  try {
    assert.equal((await f.native.compile(compileRequest)).status, "COMPILED");
    assert.equal(attempts, 3);
    assert.deepEqual(state.withdrawn, []);
    await idle(f.service);
    assert.equal(f.service.bank.ready, true);
  } finally { await f.close(); }
});

test("a cached compile is leased without a CPU slot", async () => {
  let compiles = 0;
  const { backend } = gccBackend({
    cachedCompile: () => ({ ...compiled(), cached: true, compileMs: 0 }),
    compile: async () => { compiles++; return compiled(); },
  });
  const f = await fixture(backend);
  try {
    const held = [f.service.bank.acquire(128, "official"), f.service.bank.acquire(128, "official")];
    const reused = await f.native.compile(compileRequest);
    assert.equal(reused.status === "COMPILED" && reused.cached, true);
    assert.equal(compiles, 0);
    held.forEach((allocation) => allocation.cleaned());
  } finally { await f.close(); }
});

test("a lapsed lease is refused at once, without withdrawing GCC", async () => {
  const { backend, state } = gccBackend({ executeBinary: async () => { throw new ArtifactLeaseError("Artifact lease is not live"); } });
  const f = await fixture(backend);
  try {
    const started = performance.now();
    await assert.rejects(f.native.run(binary(randomUUID())), /INVALID_REQUEST/);
    assert.ok(performance.now() - started < 500, "a refused lease must not wait out the acquisition budget");
    assert.deepEqual(state.withdrawn, []);
    assert.equal((await f.native.health()).ready, true);
  } finally { await f.close(); }
});

test("cancelling a compile aborts it and returns its slot once the backend has settled", async () => {
  let seen: AbortSignal | undefined;
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => { settle = resolve; });
  const { backend, state } = gccBackend({
    compile: (_request, signal) => new Promise((_, reject) => {
      seen = signal;
      signal.addEventListener("abort", () => {
        // Cleanup takes a moment after the abort; the slot stays held until then.
        setTimeout(() => { reject(new NativeInfrastructureError("Native execution cancelled")); settle(); }, 30);
      }, { once: true });
    }),
  });
  const f = await fixture(backend);
  try {
    const controller = new AbortController();
    const running = f.native.compile({ ...compileRequest, signal: controller.signal });
    while (!seen) await delay(5);
    assert.equal(f.service.bank.snapshot().active, 1);
    controller.abort();
    await assert.rejects(running);
    await settled;
    assert.equal(seen.aborted, true);
    await idle(f.service);
    // A cancellation is nobody's fault: GCC stays ready and the node unquarantined.
    assert.deepEqual(state.withdrawn, []);
    assert.equal(f.service.bank.ready, true);
  } finally { await f.close(); }
});

test("release ends a lease, and a node without GCC refuses GCC requests", async () => {
  const { backend, state } = gccBackend();
  const f = await fixture(backend);
  try {
    const lease = randomUUID();
    await f.native.release(lease);
    assert.deepEqual(state.released, [lease]);
  } finally { await f.close(); }

  const pythonOnly = await fixture(gccBackend().backend, manifest);
  try {
    await assert.rejects(pythonOnly.native.health(), /identity|INVALID_REQUEST/);
    assert.equal((await pythonOnly.python.health()).ready, true);
  } finally { await pythonOnly.close(); }
});
