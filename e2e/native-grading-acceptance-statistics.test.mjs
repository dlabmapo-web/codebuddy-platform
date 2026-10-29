import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarize,
  assertContinuity,
  assertObservationContinuity,
} from './native-grading-acceptance-statistics.mjs';
test('failures and queued tail remain in every cohort denominator', () => {
  const rows = Array.from({ length: 99 }, (_, i) => ({ latency: i + 1 }));
  rows.push({ error: 'timeout' });
  assert.deepEqual(summarize(rows, 'latency'), {
    n: 100,
    failures: 1,
    p50: 50,
    p95: 95,
    maximum: 'unbounded',
  });
  assert.equal(
    summarize([{ latency: 12 }, { latency: 12000 }], 'latency').p95,
    12000,
  );
});
test('fresh timestamps/counters may advance while immutable identity remains fixed', () => {
  const before = {
    hostIdentity: 'host',
    configurationIdentity: 'config',
    daemonId: 'daemon',
    observedAt: Date.now() - 1,
  };
  assert.doesNotThrow(() =>
    assertContinuity(before, { ...before, observedAt: Date.now() }),
  );
  assert.throws(() =>
    assertContinuity(before, { ...before, configurationIdentity: 'different' }),
  );
  const observation = {
    owner: 'owner',
    workerGeneration: 'worker',
    brokerGeneration: 'broker',
    observedAt: Date.now() - 1,
    family: { cpuUsageUsec: 4 },
  };
  assert.doesNotThrow(() =>
    assertObservationContinuity(observation, {
      ...observation,
      observedAt: Date.now(),
      family: { cpuUsageUsec: 5 },
    }),
  );
  assert.throws(() =>
    assertObservationContinuity(observation, {
      ...observation,
      brokerGeneration: 'replacement',
    }),
  );
  assert.throws(() =>
    assertObservationContinuity(observation, {
      ...observation,
      family: { cpuUsageUsec: 1 },
    }),
  );
});
