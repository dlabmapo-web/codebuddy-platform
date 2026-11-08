import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nativeRuntimeDescriptorSchema,
  nativeReleaseManifestSchema,
  nativeRuntimeIdentity,
} from "@cove/shared";
import { ResourceBank } from "../src/resource-bank.js";
import { FrameDecoder, ByteCapture, encodeFrame } from "../src/framing.js";
import { cpuRlimitSeconds, jailConfig } from "../src/policy.js";
import { standbyBackstopMs } from "../src/launcher.js";
import { manifest } from "./fixtures.js";
test("descriptor rejects legacy, unknown fields and partial identities", () => {
  assert.throws(() =>
    nativeRuntimeDescriptorSchema.parse({ engine: "pyodide" }),
  );
  assert.throws(() =>
    nativeRuntimeDescriptorSchema.parse({
      ...manifest.descriptor,
      extra: true,
    }),
  );
  for (const key of Object.keys(manifest.descriptor)) {
    const partial = { ...manifest.descriptor } as Record<string, unknown>;
    delete partial[key];
    assert.throws(() => nativeRuntimeDescriptorSchema.parse(partial), key);
  }
  assert.notEqual(
    nativeRuntimeIdentity(manifest.descriptor),
    nativeRuntimeIdentity({
      ...manifest.descriptor,
      comparator: { ...manifest.descriptor.comparator, version: "different" },
    }),
  );
});
test("manifest refuses overcommitted host memory and has explicit no-eligibility default", () => {
  assert.equal(
    nativeReleaseManifestSchema.parse(manifest).eligibility.length,
    0,
  );
  assert.throws(() =>
    nativeReleaseManifestSchema.parse({
      ...manifest,
      resources: { ...manifest.resources, envelopeMemoryMb: 4096 },
    }),
  );
});
test("bank reserves official slots, counts draining memory, and quarantines uncertainty", () => {
  const bank = new ResourceBank(manifest.resources),
    a = bank.acquire(512, "background");
  assert.throws(() => bank.acquire(128, "background"));
  a.draining();
  assert.deepEqual(bank.snapshot(), {
    active: 0,
    draining: 1,
    quarantined: 0,
    standby: 0,
    memoryMb: 656,
  });
  // An exited case being cleaned up holds memory, not CPU: the next case runs.
  assert.equal(bank.idleSlots, 2);
  const official = bank.acquire(512, "official");
  // ...but its memory still bounds admission until cleanup is proven.
  assert.throws(() => bank.acquire(512, "official"));
  a.cleaned();
  a.cleaned();
  assert.equal(bank.snapshot().memoryMb, 656);
  const next = bank.acquire(128, "official");
  next.quarantine();
  official.cleaned();
  assert.equal(bank.ready, false);
  assert.equal(bank.snapshot().quarantined, 1);
  assert.throws(() => bank.acquire(128, "official"));
});
test("standby jails never block a maximum-size admission after smaller work completes", () => {
  // The qualified node: 1536 MiB after service, two 656 MiB maximum cases -> 224 MiB standby budget.
  const resources = { ...manifest.resources, physicalMemoryMb: 16000, envelopeMemoryMb: 2560, serviceOverheadMb: 1024, officialReservedMemoryMb: 656 };
  const bank = new ResourceBank(resources);
  const small = [bank.acquire(128, "official"), bank.acquire(128, "official")];
  assert.equal(bank.idleSlots, 0);
  const standbys = [];
  for (let release; (release = bank.reserveStandby(32, 8)); ) standbys.push(release);
  assert.equal(standbys.length, 7);
  small.forEach((a) => a.cleaned());
  assert.equal(bank.idleSlots, 2);
  // Reserved while both slots held small work; the larger work that follows still fits.
  const first = bank.acquire(512, "official"),
    second = bank.acquire(512, "official");
  assert.deepEqual(bank.snapshot(), { active: 2, draining: 0, quarantined: 0, standby: 7, memoryMb: 1536 });
  first.cleaned();
  second.cleaned();
  // Background work keeps its existing bound (the official reserve), unaffected by standbys.
  bank.acquire(512, "background").cleaned();
  standbys.forEach((release) => {
    release();
    release();
  });
  assert.equal(bank.snapshot().standby, 0);
  // No budget remains when slots alone fill the envelope; a quarantined bank grants none.
  assert.equal(new ResourceBank({ ...manifest.resources, envelopeMemoryMb: 1568 }).reserveStandby(32, 8), undefined);
  const quarantined = new ResourceBank(resources);
  quarantined.quarantine();
  assert.equal(quarantined.reserveStandby(32, 8), undefined);
});
test("memory is reserved by allowance plus scratch and overhead, not measured RSS", () => {
  const bank = new ResourceBank({
    ...manifest.resources,
    cpuSlots: 8,
    officialReservedSlots: 1,
    officialReservedMemoryMb: 1400,
  });
  assert.throws(() => bank.acquire(513, "official"));
  assert.throws(() => bank.acquire(512, "background"));
  bank.acquire(512, "official");
  bank.acquire(512, "official");
  assert.throws(() => bank.acquire(512, "official"));
});
test("framing handles every-byte fragmentation and refuses header oversize before body", () => {
  const frame = encodeFrame({ value: "한글" });
  const decoder = new FrameDecoder(100);
  let parsed: unknown;
  for (const byte of frame) {
    const value = decoder.push(Buffer.from([byte]));
    if (value !== undefined) parsed = value;
  }
  assert.deepEqual(parsed, { value: "한글" });
  const header = Buffer.alloc(4);
  header.writeUInt32BE(101);
  assert.throws(() => new FrameDecoder(100).push(header));
  assert.throws(() => new FrameDecoder().push(Buffer.concat([frame, frame])));
  assert.throws(() =>
    new FrameDecoder().push(Buffer.from([0, 0, 0, 2, 0xc0, 0xaf])),
  );
});
test("UTF-8 output capture never exceeds byte allowance, even split codepoints", () => {
  for (let limit = 1; limit < 30; limit++) {
    const capture = new ByteCapture(limit);
    for (const byte of Buffer.from("🙂한글abc".repeat(20)))
      capture.append(Buffer.from([byte]));
    assert.ok(Buffer.byteLength(capture.text()) <= limit);
    assert.equal(capture.truncated, true);
    assert.ok(!capture.text().endsWith("�"));
  }
});
test("jail policy is fixed by the node and its time class, never by a request", () => {
  const paths = { rootfs: "/immutable/root", policy: "/immutable/policy", cgroup: "/trusted/case", log: "/trusted/log" };
  const config = jailConfig(paths, manifest.resources, 10_000);
  assert.match(config, /disable_no_new_privs: false/);
  assert.match(config, /clone_newnet: true/);
  // Started for the largest memory class; a claim lowers memory and CPU before GO.
  assert.match(config, /cgroup_mem_max: 536870912/);
  assert.match(config, /rlimit_cpu: 11/);
  assert.match(config, /pass_fd: 3/);
  assert.match(config, /time_limit: 25/);
  assert.equal(config, jailConfig(paths, manifest.resources, 10_000));
  // A long case's own jail carries a backstop for that case and no standby wait.
  const long = jailConfig(paths, manifest.resources, 60_000);
  assert.match(long, /rlimit_cpu: 61/);
  assert.match(long, /time_limit: 75/);
});
test("a crashed launcher leaves standby learner code at most 40 seconds", () => {
  assert.equal(standbyBackstopMs(), 40_000);
});
test("CPU backstop is whole seconds above the authored limit", () => {
  assert.equal(cpuRlimitSeconds(1), 2);
  assert.equal(cpuRlimitSeconds(1000), 2);
  assert.equal(cpuRlimitSeconds(1001), 3);
  assert.equal(cpuRlimitSeconds(120_000), 121);
});

test("large invalid UTF-8 and tiny appends retain fixed bounded storage", () => {
  const limit = 256 * 1024;
  const capture = new ByteCapture(limit);
  const byte = Buffer.from([255]);
  for (let i = 0; i < limit + 1024; i++) capture.append(byte);
  const text = capture.text();
  assert.ok(Buffer.byteLength(text) <= limit);
  assert.equal(text, "�".repeat(Math.floor(limit / 3)));
  assert.equal(capture.truncated, true);
  // One contiguous buffer capped at the limit; no per-write Buffer/array metadata growth.
  const storage = capture as unknown as { buffer: Buffer; chunks?: unknown };
  assert.equal(storage.buffer.length, limit);
  assert.equal(storage.chunks, undefined);
});
test("output capture grows from a small buffer and keeps every byte up to the limit", () => {
  const capture = new ByteCapture(8 * 1024 * 1024);
  const storage = () => (capture as unknown as { buffer: Buffer }).buffer.length;
  capture.append(Buffer.from("42\n"));
  assert.equal(storage(), 16 * 1024);
  const line = Buffer.from("한글 line\n");
  let expected = "42\n";
  for (let i = 0; i < 5000; i++) { capture.append(line); expected += line.toString(); }
  assert.equal(capture.text(), expected);
  assert.equal(capture.truncated, false);
  assert.ok(storage() >= Buffer.byteLength(expected) && storage() <= 2 * Buffer.byteLength(expected));
  const small = new ByteCapture(10);
  small.append(Buffer.from("0123456789abc"));
  assert.equal(small.text(), "0123456789");
  assert.equal(small.truncated, true);
});

test("native result validation rejects multibyte output beyond byte allowance", async () => {
  const { resultSchema } = await import("../src/contract.js");
  assert.throws(() =>
    resultSchema.parse({
      stdout: "",
      stderr: "한".repeat(100000),
      outcome: "PASSED",
      runtimeMs: 1,
    }),
  );
});
