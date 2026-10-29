import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FrameDecoder, frame } from "../dist/protocol.js";
import { BoundedCapture } from "../dist/capture.js";
import { Journal, BrokerClient, serve } from "../dist/index.js";
import { fixture } from "./fixtures.mjs";
test("length before allocation, split frames/UTF-8, invalid UTF-8", () => {
  const messages = [];
  const decode = new FrameDecoder((v) => messages.push(JSON.parse(v)), 1024);
  const bytes = frame({ v: "한😀" });
  for (const byte of bytes) decode.push(Buffer.from([byte]));
  assert.deepEqual(messages, [{ v: "한😀" }]);
  assert.throws(() =>
    new FrameDecoder(() => {}, 2).push(Buffer.from([0, 0, 0, 3])),
  );
  assert.throws(() =>
    new FrameDecoder(() => {}).push(Buffer.from([0, 0, 0, 1, 255])),
  );
});
test("partial/invalid UTF-8 cannot exceed output byte allowance", () => {
  const c = new BoundedCapture(2);
  c.push(Buffer.from("한"));
  assert.equal(Buffer.byteLength(c.text()) <= 2, true);
  assert.equal(c.truncated, true);
  const d = new BoundedCapture(3);
  d.push(Buffer.from([255, 255, 255]));
  assert.equal(Buffer.byteLength(d.text()), 3);
});
test("two full control-byte receipts fit physical atomic journal quota", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cove-journal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const j = new Journal(directory);
  await j.read();
  const receipts = [
    { stdout: "\0".repeat(8 * 1024 * 1024), stderr: "\x01".repeat(256 * 1024) },
    { stdout: "\0".repeat(8 * 1024 * 1024), stderr: "" },
  ];
  await j.write(receipts);
  await j.write(receipts);
  assert.deepEqual(await j.read(), receipts);
  let size = 0;
  for (const name of await readdir(directory))
    size += (await stat(join(directory, name))).size;
  assert.ok(size * 2 <= 64 * 1024 * 1024);
  await assert.rejects(async () =>
    j.write({ data: Buffer.alloc(33 * 1024 * 1024) }),
  );
});
test("real Unix socket validates correlated replies", async (t) => {
  const f = await fixture(t);
  const path = join(f.directory, "broker.sock");
  const server = await serve(path, (r) => f.broker.handle(r));
  t.after(() => new Promise((r) => server.close(r)));
  const client = new BrokerClient(path);
  const health = await client.request({ type: "health" });
  assert.equal(health.type, "health");
  assert.equal(health.brokerGeneration, f.broker.generation);
});
test("maximum malformed output decoding remains linear and byte-bounded", () => {
  const c = new BoundedCapture(8388608);
  c.push(Buffer.alloc(8388608, 255));
  assert.ok(Buffer.byteLength(c.text()) <= 8388608);
});
test("two maximum mixed Unicode captures do not double UTF-8 disk accounting", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cove-journal-utf8-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const j = new Journal(directory);
  await j.read();
  const stdout = "한" + "x".repeat(8388608 - 3);
  const captures = [
    { stdout, stderr: "e".repeat(262144) },
    { stdout, stderr: "e".repeat(262144) },
  ];
  await j.write(captures);
  assert.deepEqual(await j.read(), captures);
  assert.ok((await stat(join(directory, "state.bin"))).size < 17 * 1024 * 1024);
});
test("Unix RPC transports full escaped stdin and stdout bounds with a deterministic driver", async (t) => {
  const f = await fixture(t);
  const path = join(f.directory, "full.sock");
  const server = await serve(path, (r) => f.broker.handle(r));
  t.after(() => new Promise((r) => server.close(r)));
  const client = new BrokerClient(path);
  const { native, input, result } = await import("./fixtures.mjs");
  f.driver.result = { ...result, stdout: "\0".repeat(8388608) };
  const bound = {
    brokerGeneration: f.broker.generation,
    context: f.context,
    runtime: native,
  };
  const reserved = await client.request({
    type: "reserve",
    ...bound,
    memoryLimitMb: 128,
  });
  assert.equal(reserved.type, "reserved");
  await client.request({
    type: "run",
    ...bound,
    reservationId: reserved.reservationId,
    input: { ...input, stdin: "\0".repeat(8388608) },
  });
  let reply;
  for (let i = 0; i < 100; i++) {
    reply = await client.request({
      type: "receipt",
      ...bound,
      reservationId: reserved.reservationId,
    });
    if (reply.type === "receipt") break;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(reply.type, "receipt");
  assert.equal(reply.receipt.result.stdout.length, 8388608);
  assert.equal(reply.receipt.result.outputTruncated, false);
  assert.equal(
    f.driver.events.find((e) => e[0] === "execute")[2].stdin.length,
    8388608,
  );
});
