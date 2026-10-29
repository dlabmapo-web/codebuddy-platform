import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Redis } from 'ioredis';
import { Client } from 'pg';
import {
  ExecutionTelemetry,
  executionLogContext,
  withExecutionKind,
} from '../src/judge/execution-telemetry.ts';
import { fixtureEnvironment } from './native-grading-e2e-env.mjs';
import {
  fixtureTimings,
  acknowledgedTimings,
  instrumentWorkerTimings,
} from './native-grading-e2e-timings.mjs';
fixtureEnvironment();
test('separate API/worker processes and private timing paths merge acknowledged records through owned Redis', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-timing-')),
    redis = new Redis(process.env.REDIS_URL);
  const channel = fixtureTimings(
    redis,
    process.env.COVE_NATIVE_FIXTURE_ID,
    'api',
  );
  const jobId = randomUUID(),
    apiPath = join(directory, 'api-private.jsonl'),
    workerPath = join(directory, 'worker-private.jsonl');
  const emit = async (source, file, events) =>
    promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import {Redis} from 'ioredis';import{fixtureTimings}from './scripts/native-grading-e2e-timings.mjs';
    const r=new Redis(process.env.REDIS_URL),t=fixtureTimings(r,process.env.COVE_NATIVE_FIXTURE_ID,process.argv[1],process.argv[2]);
    const {randomUUID}=await import('node:crypto');let tx;
    for(const event of JSON.parse(process.argv[3])){
      const began=performance.now();await new Promise(r=>setTimeout(r,2));
      let row={event,jobId:process.argv[4],at:Date.now(),ackMonotonicMs:performance.now(),elapsedMs:performance.now()-began};
      if(event==='db-transaction-ack'){row={...row,transactionId:randomUUID(),commitSpanId:randomUUID(),clockId:randomUUID(),clockTimeOriginMs:performance.timeOrigin};tx=row;}
      if(event==='commit-ack'){row={...tx,event,observedAt:row.at,observedMonotonicMs:row.ackMonotonicMs,postCommitObservationMs:row.ackMonotonicMs-tx.ackMonotonicMs};}
      await t.record(row);
    }await r.quit();
  `,
        source,
        file,
        JSON.stringify(events),
        jobId,
      ],
      { cwd: new URL('..', import.meta.url), env: process.env, timeout: 15000 },
    );
  try {
    await emit('api', apiPath, ['admission-ack']);
    await emit('worker', workerPath, ['db-transaction-ack', 'commit-ack']);
    const apiOnly = (await readFile(apiPath, 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.throws(() => acknowledgedTimings(apiOnly, jobId), /Missing/); // original private-file reader fails
    assert.equal(
      (await readFile(workerPath, 'utf8')).trim().split('\n').length,
      2,
    );
    const merged = acknowledgedTimings(await channel.read(jobId), jobId);
    assert.equal(merged.rows.length, 3);
    assert.notEqual(merged.admission.producer, merged.commit.producer);
    assert.ok(merged.commit.at >= merged.admission.at);
    assert.ok(
      merged.rows.every((row) => row.ackMonotonicMs > 0 && row.elapsedMs >= 0),
    );
    for (const event of ['admission-ack', 'commit-ack', 'db-transaction-ack'])
      assert.throws(
        () =>
          acknowledgedTimings(
            merged.rows.filter((row) => row.event !== event),
            jobId,
          ),
        /Missing/,
      );
    const keys = await redis.smembers(
      `native-e2e:${process.env.COVE_NATIVE_FIXTURE_ID}:timings:index`,
    );
    assert.ok((await redis.ttl(keys[0])) > 0);
    await assert.rejects(
      () =>
        channel.record({
          jobId,
          at: Date.now(),
          ackMonotonicMs: performance.now(),
          elapsedMs: 1,
          extra: 'x'.repeat(4096),
        }),
      /oversized/,
    );
    await redis.set(
      `native-e2e:${process.env.COVE_NATIVE_FIXTURE_ID}:timings:bytes`,
      33554432,
    );
    await assert.rejects(
      () =>
        channel.record({
          jobId,
          event: 'stage-ack',
          at: Date.now(),
          ackMonotonicMs: performance.now(),
          elapsedMs: 1,
        }),
      /byte bound/,
    );
    assert.equal((await channel.read(jobId)).length, 3); // no trim/drop on overflow
    await channel.clear();
    assert.deepEqual(await channel.read(jobId), []);
    assert.ok((await redis.exists(...keys)) === 0);
    console.log(
      JSON.stringify({
        evidence: 'cross-process-private-files-owned-redis',
        records: 3,
        producers: 2,
        sharedTimingFile: false,
        oldFileReaderRejected: true,
        overflowRejected: true,
        cleanup: true,
      }),
    );
  } finally {
    await channel.clear();
    await redis.quit();
    await rm(directory, { recursive: true, force: true });
  }
});

// This invokes the worker's actual instrumentation and production telemetry,
// with real PG COMMIT acknowledgements. The delay is only in diagnostic transport.
test('nested final commit retains original PostgreSQL ack across delayed diagnostics and excludes checkpoint transactions', async () => {
  const redis = new Redis(process.env.REDIS_URL),
    client = new Client({ connectionString: process.env.DATABASE_URL });
  const channel = fixtureTimings(
    redis,
    process.env.COVE_NATIVE_FIXTURE_ID,
    'worker',
  );
  const api = fixtureTimings(redis, process.env.COVE_NATIVE_FIXTURE_ID, 'api');
  const underlying = [],
    delayMs = 150;
  const prisma = {
    async $transaction(action) {
      await client.query('BEGIN');
      try {
        const value = await action(client);
        await client.query('COMMIT');
        underlying.push({ at: Date.now(), monotonic: performance.now() });
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
  };
  const sink = {
    async record(row) {
      if (row.event === 'db-transaction-ack' && row.commitSpanId)
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      await channel.record(row);
    },
  };
  const instrumentation = instrumentWorkerTimings(
    ExecutionTelemetry.prototype,
    sink,
    executionLogContext,
  );
  instrumentation.wrapTransactions(prisma);
  const telemetry = new ExecutionTelemetry(),
    jobId = randomUUID();
  try {
    await client.connect();
    await api.record({
      event: 'admission-ack',
      jobId,
      at: Date.now(),
      ackMonotonicMs: performance.now(),
      elapsedMs: 0,
    });
    await withExecutionKind(
      'official',
      async () => {
        await telemetry.time('claim', () =>
          prisma.$transaction((tx) => tx.query('SELECT 1')),
        );
        await telemetry.time('commit', async () => {
          await telemetry.time('checkpoint', () =>
            prisma.$transaction((tx) => tx.query('SELECT 1')),
          );
          return prisma.$transaction((tx) => tx.query('SELECT 1'));
        });
      },
      jobId,
    );
    const completedMonotonic = performance.now();
    const boundaries = acknowledgedTimings(await channel.read(jobId), jobId),
      commit = boundaries.commit;
    const transactions = boundaries.rows.filter(
      (row) => row.event === 'db-transaction-ack',
    );
    assert.equal(transactions.length, 3);
    assert.equal(transactions[0].commitSpanId, null);
    assert.equal(transactions[1].commitSpanId, null);
    const final = transactions[2];
    for (const field of [
      'transactionId',
      'commitSpanId',
      'clockId',
      'clockTimeOriginMs',
      'at',
      'ackMonotonicMs',
      'elapsedMs',
    ])
      assert.equal(commit[field], final[field]);
    assert.ok(final.ackMonotonicMs >= underlying[2].monotonic);
    assert.ok(commit.postCommitObservationMs >= delayMs - 10);
    assert.ok(completedMonotonic - commit.ackMonotonicMs >= delayMs - 10);
    assert.equal(
      commit.postCommitObservationMs,
      commit.observedMonotonicMs - commit.ackMonotonicMs,
    );
    assert.ok(commit.at <= commit.observedAt - delayMs + 10);
    // A checkpoint/claim event cannot satisfy the correlated final marker.
    assert.throws(
      () =>
        acknowledgedTimings(
          boundaries.rows.map((row) =>
            row.event === 'commit-ack'
              ? {
                  ...row,
                  transactionId: transactions[0].transactionId,
                  commitSpanId: null,
                }
              : row,
          ),
          jobId,
        ),
      /Missing/,
    );
    assert.throws(
      () =>
        acknowledgedTimings(
          boundaries.rows.map((row) =>
            row.event === 'commit-ack'
              ? { ...row, clockId: randomUUID() }
              : row,
          ),
          jobId,
        ),
      /Missing/,
    );
    await assert.rejects(
      () =>
        withExecutionKind(
          'official',
          () =>
            telemetry.time('commit', () =>
              telemetry.time('checkpoint', () =>
                prisma.$transaction((tx) => tx.query('SELECT 1')),
              ),
            ),
          randomUUID(),
        ),
      /Missing\/ambiguous/,
    );
    await assert.rejects(
      () =>
        withExecutionKind(
          'official',
          () =>
            telemetry.time('commit', async () => {
              await prisma.$transaction((tx) => tx.query('SELECT 1'));
              await prisma.$transaction((tx) => tx.query('SELECT 1'));
            }),
          randomUUID(),
        ),
      /Missing\/ambiguous/,
    );
    console.log(
      JSON.stringify({
        evidence: 'actual-nested-worker-instrumentation-pg-commit',
        database: 'owned-loopback-postgres',
        diagnosticDelayMs: delayMs,
        finalTransactionMs: commit.elapsedMs,
        postCommitObservationMs: commit.postCommitObservationMs,
        ackWallUnchanged: commit.at === final.at,
        ackMonotonicUnchanged: commit.ackMonotonicMs === final.ackMonotonicMs,
        clockIncarnationUnchanged: commit.clockId === final.clockId,
        checkpointAndClaimExcluded: true,
        missingAndAmbiguousRejected: true,
      }),
    );
  } finally {
    instrumentation.restore();
    await channel.clear();
    await client.end();
    await redis.quit();
  }
});
