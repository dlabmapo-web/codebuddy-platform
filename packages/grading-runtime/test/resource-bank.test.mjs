import { test } from "node:test";
import assert from "node:assert/strict";
import { ResourceBank, MiB } from "../dist/resource-bank.js";
test("control reserve and FIFO physical funding", async () => {
  const bank = new ResourceBank();
  const first = await bank.reserve({ bytes: 512 * MiB, pids: 32 });
  assert.equal(bank.tryReserve({ bytes: 900 * MiB, pids: 32 }), null);
  const order = [];
  const large = bank.reserve({ bytes: 900 * MiB, pids: 32 }).then((v) => {
    order.push("large");
    return v;
  });
  const small = bank.reserve({ bytes: 64 * MiB, pids: 32 }).then((v) => {
    order.push("small");
    return v;
  });
  first.release();
  const l = await large;
  const s = await small;
  assert.deepEqual(order, ["large", "small"]);
  l.release();
  s.release();
  assert.equal(bank.census().bytes, 256 * MiB);
});
test("cancelled oldest funding request unblocks smaller FIFO request", async () => {
  const bank = new ResourceBank();
  const occupied = await bank.reserve({ bytes: 800 * MiB, pids: 32 });
  const abort = new AbortController();
  const large = bank.reserve({ bytes: 900 * MiB, pids: 32 }, abort.signal);
  let smallAcquired = false;
  const small = bank.reserve({ bytes: 64 * MiB, pids: 32 }).then((x) => {
    smallAcquired = true;
    return x;
  });
  await Promise.resolve();
  assert.equal(smallAcquired, false);
  abort.abort();
  await assert.rejects(large);
  const funded = await small;
  funded.release();
  occupied.release();
});
