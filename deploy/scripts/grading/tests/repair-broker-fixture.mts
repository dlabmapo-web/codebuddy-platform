/** Local RPC fixture: real broker, journal and worker recovery; deterministic guests/DB. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { Broker, Journal } from '../../../../packages/grading-runtime/dist/index.js';
import { FakeDriver, manifest, native, compatibility, input, receipt } from '../../../../packages/grading-runtime/test/fixtures.mjs';
import { ExecutionSession } from '../../../../packages/api/src/judge/execution-lease.js';

const directory = process.argv[2];
const driver = new FakeDriver();
const worker = randomUUID();
let broker: Broker;
let oldStopped = false;
let owners: any[] = [];
let queued: any[] = [];
const databasePath = join(directory, 'owners.json');
const save = () => writeFile(databasePath, JSON.stringify({ owners, queued }));
const request = (type: string, lease: any, extra = {}) => broker.handle({
  protocol: 1, requestId: randomUUID(), type, brokerGeneration: broker.generation,
  context: { attemptId: lease.submissionId, kind: 'submission', caseId: 'case-1', generation: lease.generation, leaseToken: lease.leaseToken, workerGeneration: worker },
  runtime: lease.runtime, ...(type === 'reserve' ? {} : { reservationId: lease.reservationId }), ...extra,
} as any);
const client = { request: async (value: any) => broker.handle({ protocol: 1, requestId: randomUUID(), ...value }) };
const executionCount = () => driver.events.filter((event: any[]) => event[0] === 'execute').length;
// Journal accepts only its two private files; the application store is separate.
const journalDirectory = join(directory, 'journal');
const startJournal = async () => {
  broker = new Broker(manifest, driver, new Journal(journalDirectory), worker, [{ runtime: native, memoryLimitMb: 128, targetReady: 1 }]);
  await broker.start();
};
async function acceptedWork() {
  await startJournal();
  for (const [index, runtime] of [native, compatibility].entries()) {
    const lease: any = { id: randomUUID(), submissionId: randomUUID(), generation: 1, leaseToken: randomUUID(), workerGeneration: worker,
      brokerGeneration: broker.generation, admissionEpoch: 1n, runtime, memoryLimitMb: 128, kind: 'submission', cases: [] };
    const reserved: any = await request('reserve', lease, { admissionEpoch: 1, memoryLimitMb: 128 });
    assert.equal(reserved.type, 'reserved'); lease.reservationId = reserved.reservationId;
    await request('run', lease, { input });
    const done: any = await receipt((type: string, extra: any) => request(type, lease, extra), lease.reservationId);
    assert.equal(done.type, 'receipt');
    const row = { id: randomUUID(), leaseId: lease.id, position: 1, acknowledgedAt: null };
    lease.cases.push(row);
    const owner: any = { lease: { ...lease, admissionEpoch: '1' }, checkpoints: [], receiptId: done.receipt.receiptId };
    if (index === 1) {
      const checkpointId = randomUUID();
      Object.assign(row, { receiptId: done.receipt.receiptId, checkpointId });
      owner.checkpoints.push({ id: checkpointId, casePosition: 1, generation: 1, outcome: 'PASSED', runtimeMs: 1, measuredRuntimeMs: 1,
        actualOutput: null, awardedWeight: 1, executionState: 'EXECUTED', isSample: false });
      assert.equal((await request('ack', lease, { receiptId: done.receipt.receiptId, checkpointId }) as any).type, 'acknowledged');
      // App acknowledgement was lost after durable checkpoint + broker ack.
    }
    owners.push(owner);
  }
  queued = [native, compatibility].map(runtime => ({ id: randomUUID(), policyVersion: 4, runtime, status: 'QUEUED' }));
  await save();
  return { executed: executionCount(), references: owners.map(owner => owner.lease.runtime), queuedIds: queued.map(job => job.id), worker, journalDirectory };
}
async function recover() {
  assert(oldStopped, 'Old worker/broker must stop before replacement recovery');
  // Reload durable application fixtures, never regenerate authority/checkpoints.
  ({ owners, queued } = JSON.parse(await readFile(databasePath, 'utf8')));
  for (const owner of owners) {
    const prior = owner.lease;
    const lease = { ...prior, id: randomUUID(), generation: 2, leaseToken: randomUUID(), brokerGeneration: broker.generation, cases: [] };
    const db: any = {
      gradingExecutionLease: { findMany: async () => [prior] },
      gradingCaseCheckpoint: { findMany: async () => owner.checkpoints },
      gradingExecutionCase: { update: async ({ where, data }: any) => {
        assert.equal(where.id, prior.cases[0].id); Object.assign(prior.cases[0], data); await save();
      } },
    };
    const session = new ExecutionSession(db, lease, client as any);
    await session.restore();
    if (owner.checkpoints.length) {
      assert.equal(session.recovered.get(1)?.outcome, 'PASSED');
      assert(prior.cases[0].acknowledgedAt, 'Lost ack reconciled using original checkpoint');
      assert.equal((await request('run', prior, { input }) as any).state, 'acknowledged');
    } else {
      const result = await session.executionEngine().run({ ...input, casePosition: 1 });
      assert.equal(result.stdout, 'ok\n');
      assert.equal(session.engine.receipts.size, 0, 'Receipt belongs to original lease');
      const raw: any = await request('run', prior, { input });
      assert.equal(raw.type, 'receipt'); assert.equal(raw.receipt.receiptId, owner.receiptId);
    }
    // Missing durable receipt/source-delivery proof is an infrastructure failure:
    // a known source intent with no broker case never authorizes run on recovery.
    prior.cases.push({ id: randomUUID(), leaseId: prior.id, position: 2, acknowledgedAt: null });
    const missing = new ExecutionSession(db, lease, client as any);
    await missing.restore();
    await assert.rejects(missing.executionEngine().run({ ...input, casePosition: 2 }), /EXECUTION_UNCERTAIN/);
    prior.cases.pop();
  }
  assert.equal(executionCount(), 2, 'Receipt/checkpoint/missing-proof recovery cannot re-execute known code');
  // Resolve the fixture's original receipts and release reservations, then prove
  // previously queued jobs can progress on the same retained runtime authority.
  for (const owner of owners) {
    if (!owner.checkpoints.length) {
      owner.checkpoints.push({ id: randomUUID(), casePosition: 1, outcome: 'PASSED' });
      await save(); // Fixture comparison checkpoint is durable before raw ack.
    }
    const checkpointId = owner.checkpoints[0].id;
    assert.equal((await request('ack', owner.lease, { receiptId: owner.receiptId, checkpointId }) as any).type, 'acknowledged');
    assert.equal((await request('release', owner.lease) as any).type, 'released');
  }
  for (const job of queued) {
    assert.equal(job.status, 'QUEUED'); assert.equal(job.policyVersion, 4);
    const lease: any = { submissionId: job.id, generation: 1, leaseToken: randomUUID(), runtime: job.runtime };
    const reserved: any = await request('reserve', lease, { admissionEpoch: 1, memoryLimitMb: 128 });
    assert.equal(reserved.type, 'reserved'); lease.reservationId = reserved.reservationId;
    await request('run', lease, { input });
    const done: any = await receipt((type: string, extra: any) => request(type, lease, extra), lease.reservationId);
    assert.equal(done.type, 'receipt');
    job.checkpointId = randomUUID(); await save();
    await request('ack', lease, { receiptId: done.receipt.receiptId, checkpointId: job.checkpointId });
    await request('release', lease);
    job.status = 'RECOVERED_FIXTURE';
  }
  await save();
  assert.equal(executionCount(), 4, 'Only the two queued jobs add executions');
  return { knownExecutions: 2, executed: executionCount(), queuedIds: queued.map(job => job.id), queuedRecovered: queued.length,
    checkpoints: owners.reduce((n, owner) => n + owner.checkpoints.length, 0), references: owners.map(owner => owner.lease.runtime) };
}
for await (const line of createInterface({ input: process.stdin })) {
  try {
    const command = JSON.parse(line);
    let value: any = null;
    if (command === 'accepted') value = await acceptedWork();
    else if (command === 'stop') { await broker.stop(); oldStopped = true; value = { guests: driver.guests.size }; }
    else if (command === 'start') { assert(oldStopped); await startJournal(); value = { workerGeneration: worker, brokerGeneration: broker.generation, pool: broker.census(), version: 1, observedAt: Date.now() }; }
    else if (command === 'recover') value = await recover();
    else if (command === 'close') { await broker.stop(); console.log(JSON.stringify({ ok: true })); break; }
    else throw new Error('Unknown fixture command');
    console.log(JSON.stringify({ ok: true, value }));
  } catch (error) { console.log(JSON.stringify({ ok: false, error: String(error) })); }
}
