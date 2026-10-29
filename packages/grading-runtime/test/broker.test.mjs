import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Broker, Journal } from "../dist/index.js";
import {
  fixture,
  receipt,
  input,
  native,
  compatibility,
  manifest,
  FakeDriver,
} from "./fixtures.mjs";
test("prepared guests, full identity, frozen budget and single-use checkpoint transitions", async (t) => {
  const { send, driver, broker } = await fixture(t);
  assert.equal(broker.census().prepared, 1);
  const bad = await send("reserve", {
    memoryLimitMb: 128,
    runtime: { ...native, shimVersion: "forged" },
  });
  assert.equal(bad.code, "IDENTITY_MISMATCH");
  const r = await send("reserve", { memoryLimitMb: 128 });
  assert.equal(r.type, "reserved");
  assert.equal(
    (
      await send("run", {
        reservationId: r.reservationId,
        input: { ...input, memoryLimitMb: 64 },
      })
    ).code,
    "IDENTITY_MISMATCH",
  );
  await Promise.all([
    send("run", { reservationId: r.reservationId, input }),
    send("run", { reservationId: r.reservationId, input }),
  ]);
  const done = await receipt(send, r.reservationId);
  assert.equal(done.type, "receipt");
  assert.equal(done.receipt.cleanup, "removed");
  assert.equal(driver.events.filter((e) => e[0] === "execute").length, 1);
  assert.ok(driver.events.some((e) => e[0] === "remove"));
  assert.equal(
    (await send("release", { reservationId: r.reservationId })).code,
    "BUSY",
  );
  const checkpointId = randomUUID();
  await send("ack", {
    reservationId: r.reservationId,
    receiptId: done.receipt.receiptId,
    checkpointId,
  });
  assert.equal(
    (
      await send("ack", {
        reservationId: r.reservationId,
        receiptId: done.receipt.receiptId,
        checkpointId: randomUUID(),
      })
    ).code,
    "IDENTITY_MISMATCH",
  );
  assert.equal(
    (await send("run", { reservationId: r.reservationId, input })).state,
    "acknowledged",
  );
  assert.equal(
    (await send("release", { reservationId: r.reservationId })).type,
    "released",
  );
  assert.equal(
    (await send("reserve", { memoryLimitMb: 128 })).code,
    "STALE_GENERATION",
  );
});
test("two shared slots, only one background, unfundable compatibility never reduced", async (t) => {
  const { send, context } = await fixture(t);
  assert.equal(
    (await send("reserve", { memoryLimitMb: 4096, runtime: compatibility }))
      .code,
    "UNSUPPORTED",
  );
  const first = await send("reserve", {
    memoryLimitMb: 128,
    context: { ...context, kind: "practice" },
  });
  assert.equal(first.type, "reserved");
  const background = await send("reserve", {
    memoryLimitMb: 128,
    context: { ...context, attemptId: randomUUID(), kind: "sample" },
  });
  assert.equal(background.code, "BUSY");
  const official = await send("reserve", {
    memoryLimitMb: 128,
    context: { ...context, attemptId: randomUUID() },
  });
  assert.equal(official.type, "reserved");
  assert.equal(
    (
      await send("reserve", {
        memoryLimitMb: 128,
        context: { ...context, attemptId: randomUUID() },
      })
    ).code,
    "BUSY",
  );
});
test("unconfirmed removal quarantines and retains physical funding", async (t) => {
  const { send, driver, broker } = await fixture(t);
  const r = await send("reserve", { memoryLimitMb: 128 });
  driver.removeFails = true;
  await send("run", { reservationId: r.reservationId, input });
  const response = await receipt(send, r.reservationId);
  assert.equal(response.code, "UNCERTAIN");
  assert.equal(broker.census().quarantined, 1);
  assert.ok(broker.census().resources.bytes > 256 * 1024 * 1024);
  assert.equal((await send("health")).code, "INFRASTRUCTURE");
});
test("cancel while executing waits for confirmed destruction and never yields a grade", async (t) => {
  const { send, driver, broker } = await fixture(t);
  let finish;
  driver.runGate = new Promise((r) => (finish = r));
  const r = await send("reserve", { memoryLimitMb: 128 });
  await send("run", { reservationId: r.reservationId, input });
  const cancelled = send("cancel", { reservationId: r.reservationId });
  finish();
  assert.equal((await cancelled).type, "released");
  assert.equal(broker.census().running, 0);
  assert.equal(driver.guests.size, 0);
});
test("restart retains receipt and rejects old broker generation without rerunning", async (t) => {
  const f = await fixture(t);
  const r = await f.send("reserve", { memoryLimitMb: 128 });
  await f.send("run", { reservationId: r.reservationId, input });
  const done = await receipt(f.send, r.reservationId);
  assert.equal(done.type, "receipt");
  await f.broker.stop();
  const second = new Broker(
    manifest,
    f.driver,
    new Journal(f.directory),
    randomUUID(),
    [{ runtime: native, memoryLimitMb: 128, targetReady: 1 }],
  );
  await second.start();
  const base = {
    protocol: 1,
    requestId: randomUUID(),
    context: f.context,
    runtime: native,
    reservationId: r.reservationId,
    type: "receipt",
  };
  assert.equal(
    (await second.handle({ ...base, brokerGeneration: f.broker.generation }))
      .code,
    "STALE_GENERATION",
  );
  const recovered = await second.handle({
    ...base,
    brokerGeneration: second.generation,
  });
  assert.equal(recovered.type, "receipt");
  assert.equal(recovered.receipt.receiptId, done.receipt.receiptId);
  assert.equal(f.driver.events.filter((e) => e[0] === "execute").length, 1);
  await second.stop();
});
test("invalid warm profiles refuse readiness without oversubscribing", async (t) => {
  await assert.rejects(
    fixture(t, {
      profiles: [
        { runtime: compatibility, memoryLimitMb: 4096, targetReady: 1 },
      ],
    }),
  );
});
test("ambiguous create retains ownership and cannot produce a receipt", async (t) => {
  const f = await fixture(t);
  const r = await f.send("reserve", { memoryLimitMb: 128 });
  await f.send("release", { reservationId: r.reservationId });
  const original = f.driver.create.bind(f.driver);
  f.driver.create = async (a, s) => {
    await original(a, s);
    f.driver.removeFails = true;
    throw new Error("ambiguous create transport");
  };
  const second = await f.send("reserve", {
    memoryLimitMb: 64,
    context: { ...f.context, attemptId: randomUUID() },
  });
  assert.equal(second.code, "INFRASTRUCTURE");
  assert.ok(f.broker.census().resources.bytes > 256 * 1024 * 1024);
  assert.equal(f.driver.events.filter((e) => e[0] === "execute").length, 0);
});
test("stale worker and lease cannot execute or acknowledge another attempt", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.send("reserve", {
        memoryLimitMb: 128,
        context: { ...f.context, workerGeneration: randomUUID() },
      })
    ).code,
    "STALE_GENERATION",
  );
  const r = await f.send("reserve", { memoryLimitMb: 128 });
  const forged = await f.send("run", {
    reservationId: r.reservationId,
    input,
    context: { ...f.context, leaseToken: randomUUID() },
  });
  assert.equal(forged.code, "IDENTITY_MISMATCH");
  assert.equal(f.driver.events.filter((e) => e[0] === "execute").length, 0);
});
test("next case uses a fresh prepared guest only after receipt acknowledgement", async (t) => {
  const f = await fixture(t);
  const r = await f.send("reserve", { memoryLimitMb: 128 });
  await f.send("run", { reservationId: r.reservationId, input });
  const done = await receipt(f.send, r.reservationId);
  const context = { ...f.context, caseId: "2" };
  assert.equal(
    (await f.send("run", { reservationId: r.reservationId, input, context }))
      .code,
    "BUSY",
  );
  await f.send("ack", {
    reservationId: r.reservationId,
    receiptId: done.receipt.receiptId,
    checkpointId: randomUUID(),
  });
  for (
    let i = 0;
    i < 50 && (f.broker.census().running || f.broker.census().preparing);
    i++
  )
    await new Promise((r) => setTimeout(r, 5));
  await f.send("run", { reservationId: r.reservationId, input, context });
  const second = await receipt(
    (type, extra) => f.send(type, { ...extra, context }),
    r.reservationId,
  );
  assert.equal(second.type, "receipt");
  const executed = f.driver.events.filter((e) => e[0] === "execute");
  assert.equal(executed.length, 2);
  assert.notEqual(executed[0][1], executed[1][1]);
});
test("a waiting large profile does not hold the ledger mutex or starve behind replacement", async (t) => {
  const f = await fixture(t, {
    profiles: [{ runtime: compatibility, memoryLimitMb: 256, targetReady: 1 }],
  });
  const first = await f.send("reserve", {
    runtime: compatibility,
    memoryLimitMb: 256,
  });
  const context = { ...f.context, attemptId: randomUUID() };
  let funded = false;
  const secondPromise = f
    .send("reserve", { runtime: compatibility, memoryLimitMb: 600, context })
    .then((r) => {
      funded = true;
      return r;
    });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(funded, false);
  await f.send("run", {
    runtime: compatibility,
    reservationId: first.reservationId,
    input: { ...input, memoryLimitMb: 256 },
  });
  const firstReceipt = await receipt(
    (type, extra) => f.send(type, { ...extra, runtime: compatibility }),
    first.reservationId,
  );
  const second = await secondPromise;
  assert.equal(second.type, "reserved");
  await f.send("ack", {
    runtime: compatibility,
    reservationId: first.reservationId,
    receiptId: firstReceipt.receipt.receiptId,
    checkpointId: randomUUID(),
  });
  assert.equal(
    (
      await f.send("release", {
        runtime: compatibility,
        reservationId: first.reservationId,
      })
    ).type,
    "released",
  );
  assert.equal(f.broker.census().ready, true);
  assert.equal(
    (
      await f.send("release", {
        runtime: compatibility,
        reservationId: second.reservationId,
        context,
      })
    ).type,
    "released",
  );
});
test("duplicate reservation during running cannot allocate another guest", async (t) => {
  const f = await fixture(t);
  const r = await f.send("reserve", { memoryLimitMb: 128 });
  let finish;
  f.driver.runGate = new Promise((r) => (finish = r));
  await f.send("run", { reservationId: r.reservationId, input });
  const before = f.driver.events.filter((e) => e[0] === "create").length;
  assert.equal(
    (await f.send("reserve", { memoryLimitMb: 128 })).reservationId,
    r.reservationId,
  );
  assert.equal(f.driver.events.filter((e) => e[0] === "create").length, before);
  finish();
  await receipt(f.send, r.reservationId);
});
test("cancellation during create waits for ownership cleanup without poisoning other work", async (t) => {
  const f = await fixture(t);
  const first = await f.send("reserve", { memoryLimitMb: 128 });
  let finish;
  f.driver.createGate = new Promise((r) => (finish = r));
  const context = { ...f.context, attemptId: randomUUID() };
  const reserving = f.send("reserve", { context, memoryLimitMb: 64 });
  await new Promise((r) => setTimeout(r, 20));
  const cancelled = f.send("cancel", { context });
  finish();
  assert.equal((await cancelled).type, "released");
  assert.equal((await reserving).type, "error");
  assert.equal(f.broker.census().ready, true);
  assert.equal(f.driver.events.filter((e) => e[0] === "execute").length, 0);
  await f.send("release", { reservationId: first.reservationId });
});
test("higher-generation takeover preserves checkpoints and cannot rerun a known case", async (t) => {
  const f = await fixture(t);
  const first = await f.send("reserve", { memoryLimitMb: 128 });
  await f.send("run", { reservationId: first.reservationId, input });
  const done = await receipt(f.send, first.reservationId);
  const nextContext = { ...f.context, generation: 2, leaseToken: randomUUID() };
  assert.equal(
    (await f.send("reserve", { memoryLimitMb: 128, context: nextContext }))
      .code,
    "BUSY",
  );
  await f.send("ack", {
    reservationId: first.reservationId,
    receiptId: done.receipt.receiptId,
    checkpointId: randomUUID(),
  });
  await f.send("release", { reservationId: first.reservationId });
  const next = await f.send("reserve", {
    memoryLimitMb: 128,
    context: nextContext,
  });
  assert.equal(next.type, "reserved");
  assert.equal(next.reservationId, first.reservationId);
  assert.equal(
    (
      await f.send("run", {
        reservationId: next.reservationId,
        input,
        context: nextContext,
      })
    ).state,
    "acknowledged",
  );
  assert.equal(f.driver.events.filter((e) => e[0] === "execute").length, 1);
  assert.equal(
    (await f.send("release", { reservationId: next.reservationId })).code,
    "IDENTITY_MISMATCH",
  );
});
test("release acknowledges current cleanup without awaiting future warm preparation", async (t) => {
  const f = await fixture(t);
  const r = await f.send("reserve", { memoryLimitMb: 128 });
  let finish;
  f.driver.createGate = new Promise((resolve) => (finish = resolve));
  try {
    await f.send("run", { reservationId: r.reservationId, input });
    const done = await receipt(f.send, r.reservationId);
    assert.equal(done.type, "receipt");
    await f.send("ack", {
      reservationId: r.reservationId,
      receiptId: done.receipt.receiptId,
      checkpointId: randomUUID(),
    });
    for (
      let i = 0;
      i < 100 && f.driver.events.filter((e) => e[0] === "create").length < 2;
      i++
    )
      await new Promise((r) => setTimeout(r, 5));
    assert.equal(f.driver.events.filter((e) => e[0] === "create").length, 2);
    const released = await Promise.race([
      f.send("release", { reservationId: r.reservationId }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ type: "delayed" }), 200),
      ),
    ]);
    assert.equal(released.type, "released");
    assert.equal(f.broker.census().resources.allocations, 1);
    assert.equal(f.broker.census().preparing, 1);
    finish();
    for (let i = 0; i < 100 && f.broker.census().preparing; i++)
      await new Promise((r) => setTimeout(r, 5));
    assert.equal(f.broker.census().prepared, 1);
    const before = f.driver.events.filter((e) => e[0] === "create").length;
    assert.equal(
      (
        await f.send("reserve", {
          memoryLimitMb: 128,
          context: { ...f.context, attemptId: randomUUID() },
        })
      ).type,
      "reserved",
    );
    assert.equal(
      f.driver.events.filter((e) => e[0] === "create").length,
      before,
    );
  } finally {
    finish();
  }
});
test("concurrent takeover rejects an old run before source is released", async (t) => {
  const f = await fixture(t);
  const first = await f.send("reserve", { memoryLimitMb: 128 });
  const next = { ...f.context, generation: 2, leaseToken: randomUUID() };
  const [taken, stale] = await Promise.all([
    f.send("reserve", { memoryLimitMb: 128, context: next }),
    f.send("run", { reservationId: first.reservationId, input }),
  ]);
  assert.equal(taken.type, "reserved");
  assert.equal(stale.code, "IDENTITY_MISMATCH");
  assert.equal(f.driver.events.filter((e) => e[0] === "execute").length, 0);
});
for (const operation of ["ack", "release", "cancel"])
  test(`concurrent takeover rejects stale ${operation} inside the mutation fence`, async (t) => {
    const f = await fixture(t);
    const first = await f.send("reserve", { memoryLimitMb: 128 });
    await f.send("run", { reservationId: first.reservationId, input });
    const result = await receipt(f.send, first.reservationId);
    const checkpointId = randomUUID();
    await f.send("ack", {
      reservationId: first.reservationId,
      receiptId: result.receipt.receiptId,
      checkpointId,
    });
    await f.send("release", { reservationId: first.reservationId });
    const next = { ...f.context, generation: 2, leaseToken: randomUUID() };
    const extra =
      operation === "ack"
        ? { receiptId: result.receipt.receiptId, checkpointId }
        : {};
    const [taken, stale] = await Promise.all([
      f.send("reserve", { memoryLimitMb: 128, context: next }),
      f.send(operation, { reservationId: first.reservationId, ...extra }),
    ]);
    assert.equal(taken.type, "reserved");
    assert.equal(stale.code, "IDENTITY_MISMATCH");
    assert.equal(
      (
        await f.send("release", {
          reservationId: first.reservationId,
          context: next,
        })
      ).type,
      "released",
    );
  });
