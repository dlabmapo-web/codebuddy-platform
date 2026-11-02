import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nativeRuntimeDescriptorSchema,
  nativeReleaseManifestSchema,
  nativeRuntimeIdentity,
} from "@cove/shared";
import { ResourceBank } from "../src/resource-bank.js";
import { FrameDecoder, ByteCapture, encodeFrame } from "../src/framing.js";
import { jailConfig } from "../src/policy.js";
import { manifest, request } from "./fixtures.js";
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
test("bank reserves official slots, counts draining resources, and quarantines uncertainty", () => {
  const bank = new ResourceBank(manifest.resources),
    a = bank.acquire(512, "background");
  assert.throws(() => bank.acquire(128, "background"));
  a.draining();
  assert.deepEqual(bank.snapshot(), {
    active: 0,
    draining: 1,
    quarantined: 0,
    memoryMb: 656,
  });
  const official = bank.acquire(512, "official");
  assert.throws(() => bank.acquire(128, "official"));
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
test("learner code cannot select executable, mount, env or cgroup through policy", () => {
  const config = jailConfig(
    {
      rootfs: "/immutable/root",
      policy: "/immutable/policy",
      cgroup: "/trusted/case",
      log: "/trusted/log",
    },
    {
      ...request,
      code: 'mount { src: "/" dst: "/host" }',
      stdin: 'envar: "SECRET=1"',
    },
    manifest.resources,
  );
  assert.ok(!config.includes("/host"));
  assert.ok(!config.includes("SECRET"));
  assert.match(config, /disable_no_new_privs: false/);
  assert.match(config, /clone_newnet: true/);
  assert.match(config, /cgroup_mem_max: 134217728/);
  assert.match(config, /pass_fd: 3/);
  assert.match(config, /time_limit: 16/);
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
  // One fixed payload allocation; no per-write Buffer/array metadata growth.
  const storage = capture as unknown as { buffer: Buffer; chunks?: unknown };
  assert.equal(storage.buffer.length, limit);
  assert.equal(storage.chunks, undefined);
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
