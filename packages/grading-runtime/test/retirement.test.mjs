import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Broker, Journal } from "../dist/index.js";
import { fixture, native, manifest } from "./fixtures.mjs";
test("retirement and durable epoch sealing reject delayed admissions after restart", async (t) => {
  const f = await fixture(t);
  const health = await f.send("health");
  assert.equal(health.admissionEpoch, 1);
  const first = await f.send("reserve", {
    memoryLimitMb: 128,
    admissionEpoch: 1,
  });
  await f.send("release", { reservationId: first.reservationId });
  const terminalCommitId = randomUUID();
  const retired = await f.send("retire", {
    reservationId: first.reservationId,
    terminalCommitId,
  });
  assert.equal(retired.type, "retired");
  assert.equal(
    (
      await f.send("reserve", {
        memoryLimitMb: 128,
        admissionEpoch: 1,
        context: { ...f.context, generation: 2, leaseToken: randomUUID() },
      })
    ).code,
    "STALE_GENERATION",
  );
  const reconciliationId = randomUUID();
  const seal = {
    protocol: 1,
    requestId: randomUUID(),
    type: "seal",
    brokerGeneration: f.broker.generation,
    workerGeneration: f.worker,
    admissionEpoch: 1,
    reconciliationId,
  };
  for (let i = 0; i < 100 && f.broker.census().preparing; i++)
    await new Promise((r) => setTimeout(r, 5));
  const sealed = await f.broker.handle(seal);
  assert.equal(sealed.type, "sealed");
  assert.equal(sealed.nextAdmissionEpoch, 2);
  assert.equal(f.broker.census().records, 0);
  assert.equal(
    (await f.send("reserve", { memoryLimitMb: 128, admissionEpoch: 1 })).code,
    "STALE_GENERATION",
  );
  await f.broker.stop();
  const restarted = new Broker(
    manifest,
    f.driver,
    new Journal(f.directory),
    f.worker,
    [{ runtime: native, memoryLimitMb: 128, targetReady: 1 }],
  );
  await restarted.start();
  try {
    const base = {
      protocol: 1,
      requestId: randomUUID(),
      type: "reserve",
      brokerGeneration: restarted.generation,
      context: f.context,
      runtime: native,
      memoryLimitMb: 128,
      admissionEpoch: 1,
    };
    assert.equal((await restarted.handle(base)).code, "STALE_GENERATION");
    const repeated = await restarted.handle({
      ...seal,
      brokerGeneration: restarted.generation,
    });
    assert.equal(repeated.type, "sealed");
    assert.equal(repeated.reconciliationId, reconciliationId);
  } finally {
    await restarted.stop();
  }
});

function sealRequest(f, admissionEpoch = 1, reconciliationId = randomUUID()) {
  return {
    protocol: 1,
    requestId: randomUUID(),
    type: "seal",
    brokerGeneration: f.broker.generation,
    workerGeneration: f.worker,
    admissionEpoch,
    reconciliationId,
  };
}
const settle = async (f) => {
  for (let i = 0; i < 100 && f.broker.census().preparing; i++)
    await new Promise((r) => setTimeout(r, 5));
};
test("terminal authority requires acknowledged cleanup; lost ack and retire replies are idempotent", async (t) => {
  const { input, receipt } = await import("./fixtures.mjs");
  const f = await fixture(t);
  const { reservationId } = await f.send("reserve", { memoryLimitMb: 128 });
  const terminalCommitId = randomUUID();
  assert.equal(
    (await f.send("retire", { reservationId, terminalCommitId })).code,
    "BUSY",
  );
  await f.send("run", { reservationId, input });
  const raw = await receipt(f.send, reservationId);
  assert.equal((await f.send("release", { reservationId })).code, "BUSY");
  assert.equal((await f.broker.handle(sealRequest(f))).code, "BUSY");
  const ack = {
    reservationId,
    receiptId: raw.receipt.receiptId,
    checkpointId: randomUUID(),
  };
  await f.send("ack", ack); // Deliberately discard the reply after the durable DB checkpoint.
  assert.equal(
    (await f.send("receipt", { reservationId })).state,
    "acknowledged",
  );
  assert.equal((await f.send("ack", ack)).type, "acknowledged");
  assert.equal(
    (await f.send("ack", { ...ack, checkpointId: randomUUID() })).code,
    "IDENTITY_MISMATCH",
  );
  await f.send("release", { reservationId });
  assert.equal((await f.broker.handle(sealRequest(f))).code, "BUSY");
  await f.send("retire", { reservationId, terminalCommitId }); // Lost terminal reply.
  assert.equal(
    (await f.send("retire", { reservationId, terminalCommitId })).type,
    "retired",
  );
  assert.equal(
    (await f.send("retire", { reservationId, terminalCommitId: randomUUID() }))
      .code,
    "IDENTITY_MISMATCH",
  );
  assert.equal((await f.send("ack", ack)).type, "retired");
  assert.equal(
    (await f.send("run", { reservationId, input })).code,
    "STALE_GENERATION",
  );
  await settle(f);
  const seal = sealRequest(f);
  assert.equal(
    (await f.broker.handle({ ...seal, workerGeneration: randomUUID() })).code,
    "STALE_GENERATION",
  );
  assert.equal((await f.broker.handle(seal)).type, "sealed");
  assert.equal(
    (await f.broker.handle({ ...seal, reconciliationId: randomUUID() })).code,
    "STALE_GENERATION",
  );
  const second = sealRequest(f, 2);
  assert.equal((await f.broker.handle(second)).nextAdmissionEpoch, 3);
  assert.equal((await f.broker.handle(seal)).code, "STALE_GENERATION"); // Only one bounded acknowledgement retained.
  assert.equal(
    (
      await f.send("reserve", {
        admissionEpoch: 2,
        memoryLimitMb: 128,
        context: { ...f.context, attemptId: randomUUID() },
      })
    ).code,
    "STALE_GENERATION",
  );
});

test("sealing waits for future preparation although result retirement does not", async (t) => {
  const { input, receipt } = await import("./fixtures.mjs");
  const f = await fixture(t);
  const { reservationId } = await f.send("reserve", { memoryLimitMb: 128 });
  let unblock;
  f.driver.createGate = new Promise((r) => {
    unblock = r;
  });
  try {
    await f.send("run", { reservationId, input });
    const raw = await receipt(f.send, reservationId);
    await f.send("ack", {
      reservationId,
      receiptId: raw.receipt.receiptId,
      checkpointId: randomUUID(),
    });
    assert.equal((await f.send("release", { reservationId })).type, "released");
    assert.equal(
      (
        await f.send("retire", {
          reservationId,
          terminalCommitId: randomUUID(),
        })
      ).type,
      "retired",
    );
    assert.equal((await f.broker.handle(sealRequest(f))).code, "BUSY");
  } finally {
    unblock();
  }
  await settle(f);
  assert.equal((await f.broker.handle(sealRequest(f))).type, "sealed");
});

test("cancel cleanup fence blocks takeover across its asynchronous wait", async (t) => {
  const { input } = await import("./fixtures.mjs");
  const f = await fixture(t);
  const { reservationId } = await f.send("reserve", { memoryLimitMb: 128 });
  let unblock;
  f.driver.runGate = new Promise((r) => {
    unblock = r;
  });
  try {
    await f.send("run", { reservationId, input });
    for (
      let i = 0;
      i < 100 && !f.driver.events.some((e) => e[0] === "execute");
      i++
    )
      await new Promise((r) => setTimeout(r, 5));
    const cancellation = f.send("cancel", { reservationId });
    const takeover = await f.send("reserve", {
      memoryLimitMb: 128,
      context: { ...f.context, generation: 2, leaseToken: randomUUID() },
    });
    assert.equal(takeover.code, "BUSY");
    unblock();
    assert.equal((await cancellation).type, "released");
    assert.equal(
      (
        await f.send("retire", {
          reservationId,
          terminalCommitId: randomUUID(),
        })
      ).type,
      "retired",
    );
  } finally {
    unblock();
  }
});

class MemoryJournal extends Journal {
  constructor(value) {
    super("/unused-test-journal");
    this.value = value;
  }
  async read() {
    return structuredClone(this.value);
  }
  async write(value) {
    assert.ok(this.encodedSize(value) <= 32 * 1024 * 1024);
    this.value = structuredClone(value);
  }
}
function terminalRecord(worker) {
  return {
    id: randomUUID(),
    runtime: native,
    context: {
      attemptId: randomUUID(),
      kind: "submission",
      caseId: "1",
      generation: 1,
      leaseToken: randomUUID(),
      workerGeneration: worker,
    },
    memoryLimitMb: 128,
    released: true,
    terminalCommitId: randomUUID(),
    cases: [],
  };
}
test("a full bounded epoch reclaims capacity without a second tombstone list", async (t) => {
  const { FakeDriver } = await import("./fixtures.mjs");
  const worker = randomUUID();
  const records = Array.from({ length: 1024 }, () => terminalRecord(worker));
  const journal = new MemoryJournal({ version: 1, admissionEpoch: 1, records });
  const broker = new Broker(manifest, new FakeDriver(), journal, worker, [
    { runtime: native, memoryLimitMb: 128, targetReady: 1 },
  ]);
  await broker.start();
  t.after(() => broker.stop());
  const request = {
    protocol: 1,
    requestId: randomUUID(),
    brokerGeneration: broker.generation,
    type: "reserve",
    admissionEpoch: 1,
    runtime: native,
    context: { ...records[0].context, attemptId: randomUUID() },
    memoryLimitMb: 128,
  };
  assert.equal((await broker.handle(request)).code, "BUSY");
  const seal = {
    protocol: 1,
    requestId: randomUUID(),
    type: "seal",
    brokerGeneration: broker.generation,
    workerGeneration: worker,
    admissionEpoch: 1,
    reconciliationId: randomUUID(),
  };
  assert.equal((await broker.handle(seal)).nextAdmissionEpoch, 2);
  assert.equal(journal.value.records.length, 0);
  assert.equal((await broker.handle(request)).code, "STALE_GENERATION");
  assert.equal(
    (await broker.handle({ ...request, admissionEpoch: 2 })).type,
    "reserved",
  );
  assert.equal(journal.value.records.length, 1);
});

test("measured retained-history headroom refuses source before two maximum captures could exceed snapshot quota", async (t) => {
  const { FakeDriver, input } = await import("./fixtures.mjs");
  const worker = randomUUID();
  const live = terminalRecord(worker);
  delete live.terminalCommitId;
  live.released = false;
  const retained = terminalRecord(worker);
  delete retained.terminalCommitId;
  const history = {
    context: { ...retained.context, caseId: "x".repeat(128) },
    state: "REMOVED",
    checkpointId: randomUUID(),
    receiptId: randomUUID(),
  };
  const records = [live, retained];
  // Seed realistic retained case metadata near the physical threshold, without
  // spending tens of thousands of fsyncs. The same production serializer measures it.
  for (let n = 0; n < 100; n++)
    records.push({
      ...terminalRecord(worker),
      terminalCommitId: undefined,
      cases: Array.from({ length: 400 }, () => ({ ...history })),
    });
  const journal = new MemoryJournal({ version: 1, admissionEpoch: 1, records });
  const metadataBytes = journal.encodedSize(journal.value);
  assert.ok(metadataBytes < 32 * 1024 * 1024);
  assert.ok(
    metadataBytes + 2 * (8388608 + 262144) + 128 * 1024 > 32 * 1024 * 1024,
  );
  t.diagnostic(
    `retained metadata ${metadataBytes} bytes; reserved capture bytes ${2 * (8388608 + 262144)}; transition budget 131072`,
  );
  const fitting = structuredClone({
    version: 1,
    admissionEpoch: 1,
    records: records.slice(0, 82),
  });
  assert.ok(
    journal.encodedSize(fitting) + 2 * (8388608 + 262144) + 128 * 1024 <
      32 * 1024 * 1024,
  );
  for (const r of fitting.records.slice(0, 2))
    r.cases.push({
      ...history,
      receipt: {
        version: 1,
        brokerGeneration: randomUUID(),
        receiptId: randomUUID(),
        reservationId: r.id,
        runtime: native,
        context: r.context,
        cleanup: "removed",
        result: {
          stdout: "\0".repeat(8388608),
          stderr: "\x01".repeat(262144),
          outcome: "PASSED",
          runtimeMs: 60000,
          outputTruncated: false,
        },
      },
    });
  const fullSize = journal.encodedSize(fitting);
  assert.ok(fullSize <= 32 * 1024 * 1024);
  t.diagnostic(
    `admissible retained history plus two maximum control-byte captures: ${fullSize} bytes`,
  );
  const driver = new FakeDriver();
  const broker = new Broker(manifest, driver, journal, worker, [
    { runtime: native, memoryLimitMb: 128, targetReady: 1 },
  ]);
  await broker.start();
  t.after(() => broker.stop());
  const base = {
    protocol: 1,
    requestId: randomUUID(),
    brokerGeneration: broker.generation,
    runtime: native,
    context: live.context,
    reservationId: live.id,
  };
  assert.equal(
    (await broker.handle({ ...base, type: "run", input })).code,
    "BUSY",
  );
  assert.equal(driver.events.filter((e) => e[0] === "execute").length, 0);
  assert.equal(broker.census().ready, true);
});

test("an uncertain seal write cannot be acknowledged from tentative memory", async (t) => {
  const { FakeDriver } = await import("./fixtures.mjs");
  const worker = randomUUID();
  const journal = new MemoryJournal({
    version: 1,
    admissionEpoch: 1,
    records: [],
  });
  const broker = new Broker(manifest, new FakeDriver(), journal, worker, [
    { runtime: native, memoryLimitMb: 128, targetReady: 1 },
  ]);
  await broker.start();
  const write = journal.write.bind(journal);
  journal.write = async () => {
    throw new Error("injected fsync failure");
  };
  const seal = {
    protocol: 1,
    requestId: randomUUID(),
    type: "seal",
    brokerGeneration: broker.generation,
    workerGeneration: worker,
    admissionEpoch: 1,
    reconciliationId: randomUUID(),
  };
  assert.equal((await broker.handle(seal)).code, "INFRASTRUCTURE");
  assert.equal((await broker.handle(seal)).code, "INFRASTRUCTURE");
  assert.equal(journal.value.admissionEpoch, 1);
  journal.write = write;
  t.after(() => broker.stop());
});
