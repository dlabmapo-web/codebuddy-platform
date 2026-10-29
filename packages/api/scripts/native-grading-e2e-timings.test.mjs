import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Redis } from 'ioredis';
import { fixtureEnvironment } from './native-grading-e2e-env.mjs';
import {
  fixtureTimings,
  acknowledgedTimings,
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
    for(const event of JSON.parse(process.argv[3])){const began=performance.now();await new Promise(r=>setTimeout(r,2));await t.record({event,jobId:process.argv[4],at:Date.now(),ackMonotonicMs:performance.now(),elapsedMs:performance.now()-began});}await r.quit();
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
