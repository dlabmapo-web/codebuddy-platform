import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArtifactStore,
  ArtifactStoreBusyError,
  MAX_ARTIFACT_BYTES,
  MAX_DIAGNOSTIC_BYTES,
} from "../src/artifact-store.js";

const slot = MAX_ARTIFACT_BYTES + MAX_DIAGNOSTIC_BYTES;
function fixture(slots: number, maxEntries?: number) {
  const root = mkdtempSync(join(tmpdir(), "cove-artifacts-"));
  let clock = 0;
  const store = new ArtifactStore({ root, capacityBytes: slots * slot, maxEntries, now: () => clock });
  const compile = (key: string, body = key) => {
    const reservation = store.reserve();
    return store.insert(key, reservation, { binary: { path: "", bytes: Buffer.from(`\x7fELF${body}`) }, diagnostics: "" })!;
  };
  return { root, store, compile, tick: (ms: number) => { clock += ms; }, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("a leased artifact is never evicted while other attempts compile into a nearly full store", () => {
  const f = fixture(2, 2);
  try {
    const artifact = f.compile("running-job");
    const lease = f.store.lease("running-job", 60_000);
    const path = f.store.resolve(artifact, lease)!;
    // With room for two entries and one leased, every further compile must
    // evict an unleased entry, never the leased one.
    for (let i = 0; i < 20; i++) f.compile(`other-${i}`);
    assert.equal(f.store.resolve(artifact, lease), path);
    assert.ok(existsSync(path));
    assert.equal(readFileSync(path, "latin1"), "\x7fELFrunning-job");
    assert.equal(statSync(path).mode & 0o777, 0o555);
  } finally { f.done(); }
});

test("expiry frees the lease of a worker that never released it", () => {
  const f = fixture(1);
  try {
    const artifact = f.compile("crashed-worker");
    const lease = f.store.lease("crashed-worker", 5_000);
    assert.throws(() => f.store.reserve(), ArtifactStoreBusyError);
    f.tick(5_000);
    assert.equal(f.store.resolve(artifact, lease), undefined);
    const reservation = f.store.reserve();
    reservation.release();
    assert.equal(f.store.lookup("crashed-worker"), undefined);
  } finally { f.done(); }
});

test("a store held by leases and compiles in progress answers busy instead of evicting", () => {
  const f = fixture(2, 2);
  try {
    f.compile("a"); f.store.lease("a", 60_000);
    f.compile("b"); f.store.lease("b", 60_000);
    // Both entries are leased: a new compile cannot get an index entry.
    assert.throws(() => f.store.reserve(), ArtifactStoreBusyError);
    assert.ok(f.store.lookup("a") && f.store.lookup("b"));
  } finally { f.done(); }
  const g = fixture(2);
  try {
    const one = g.store.reserve(), two = g.store.reserve();
    // Two compiles in progress hold every byte.
    assert.throws(() => g.store.reserve(), ArtifactStoreBusyError);
    one.release();
    g.store.reserve().release();
    two.release();
  } finally { g.done(); }
});

test("released leases make their entries evictable and remove unshared files", () => {
  const f = fixture(1);
  try {
    const artifact = f.compile("first");
    const lease = f.store.lease("first", 60_000);
    f.store.release(lease);
    f.store.release(lease);
    f.compile("second");
    assert.equal(f.store.lookup("first"), undefined);
    assert.equal(f.store.resolve(artifact, lease), undefined);
    assert.deepEqual(readdirSync(f.root).filter(n => n.startsWith("bin-")).length, 1);
  } finally { f.done(); }
});

test("identical binaries share one file, removed with the last entry using it", () => {
  const f = fixture(3, 3);
  try {
    const one = f.compile("source-1", "same");
    const two = f.compile("source-2", "same");
    assert.equal(one, two);
    assert.equal(readdirSync(f.root).filter(n => n.startsWith("bin-")).length, 1);
    f.compile("x"); f.compile("y"); f.compile("z");
    assert.equal(f.store.lookup("source-1"), undefined);
    assert.equal(f.store.lookup("source-2"), undefined);
    assert.ok(!existsSync(join(f.root, `bin-${one.slice(7)}`)));
  } finally { f.done(); }
});

test("a concurrent identical compile keeps the first, possibly leased, entry", () => {
  const f = fixture(3);
  try {
    const first = f.store.reserve(), second = f.store.reserve();
    const artifact = f.store.insert("k", first, { binary: { path: "", bytes: Buffer.from("\x7fELFk") }, diagnostics: "" })!;
    const lease = f.store.lease("k", 60_000);
    assert.equal(f.store.insert("k", second, { binary: { path: "", bytes: Buffer.from("\x7fELFk") }, diagnostics: "" }), artifact);
    assert.ok(f.store.resolve(artifact, lease));
    assert.equal(f.store.committedBytes, Buffer.byteLength("\x7fELFk"));
  } finally { f.done(); }
});

test("compile errors are cached as bounded diagnostics files within the entry bound", () => {
  const f = fixture(4, 3);
  try {
    for (const key of ["e1", "e2", "e3", "e4"]) {
      const reservation = f.store.reserve();
      assert.equal(f.store.insert(key, reservation, { diagnostics: `main.c:1:1: error: ${key}` }), null);
    }
    assert.equal(f.store.size, 3);
    assert.equal(f.store.lookup("e1"), undefined);
    assert.deepEqual(f.store.lookup("e4"), { artifact: null, diagnostics: "main.c:1:1: error: e4" });
    assert.throws(() => f.store.lease("e4", 1000));
    const reservation = f.store.reserve();
    assert.throws(() => f.store.insert("big", reservation, { diagnostics: "x".repeat(MAX_DIAGNOSTIC_BYTES + 1) }));
    assert.equal(f.store.committedBytes, readdirSync(f.root).reduce((t, n) => t + statSync(join(f.root, n)).size, 0));
  } finally { f.done(); }
});
