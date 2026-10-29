import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { manifestFixture } from '../../../shared/src/testing/grading-runtime-fixtures.js';
import { RuntimeReadinessPublisher, assertRuntimeReady, readinessKey, manifestIdentity } from './runtime-readiness.js';
import { JudgeReadiness } from './judge-readiness.js';

it('binds fresh worker health to the immutable manifest and refuses stale or mismatched authority', async () => {
  const worker = randomUUID(), broker = randomUUID(); let saved: string | null = null, ttl = 6000;
  const redis = async () => ({ get: async () => saved, pttl: async () => ttl, set: async (_key: string, value: string) => { saved = value; return 'OK'; } });
  let healthy = true;
  const publisher = new RuntimeReadinessPublisher(manifestFixture, worker, redis, async () => {
    if (!healthy) throw new Error('cleanup fault');
    return { brokerGeneration: broker, workerGeneration: worker, capabilities: manifestFixture.capabilities };
  });
  await expect(assertRuntimeReady(redis, manifestFixture, worker)).rejects.toThrow();
  expect(await publisher.poll(true)).toEqual({ ready: true });
  await assertRuntimeReady(redis, manifestFixture, worker);
  expect(readinessKey(manifestFixture, worker)).toContain(manifestIdentity(manifestFixture));
  await expect(assertRuntimeReady(redis, manifestFixture, randomUUID())).rejects.toThrow();
  await expect(assertRuntimeReady(redis, { ...manifestFixture, certifications: [] }, worker)).rejects.toThrow();
  const fresh = saved!;
  ttl = -1; await expect(assertRuntimeReady(redis, manifestFixture, worker)).rejects.toThrow(); ttl = 6000;
  saved = JSON.stringify({ ...JSON.parse(fresh), observedAt: Date.now() - 6001 });
  await expect(assertRuntimeReady(redis, manifestFixture, worker)).rejects.toThrow();
  saved = JSON.stringify({ ...JSON.parse(fresh), observedAt: Date.now() + 6001 });
  await expect(assertRuntimeReady(redis, manifestFixture, worker)).rejects.toThrow();
  healthy = false;
  expect(await publisher.poll(true)).toEqual({ ready: false });
  await expect(assertRuntimeReady(redis, manifestFixture, worker)).rejects.toThrow();
});

it('treats healthy saturated brokers as ready, and activates the guard for faults from the first poll', () => {
  let now = 0; const readiness = new JudgeReadiness(() => now);
  readiness.updateBroker({ ready: false }, true);
  expect(readiness.state()).toMatchObject({ ready: false, supported: true, reason: 'broker' });
  expect(readiness.shouldPause()).toBe(true);
  for (let i = 0; i < 3; i++) readiness.updateBroker({ ready: true }, true);
  expect(readiness.state().ready).toBe(true); expect(readiness.shouldPause()).toBe(false);
  now = 6001;
  expect(readiness.state().reason).toBe('stale'); expect(readiness.shouldPause()).toBe(true);
});

it('bounds a stalled health read without overlapping polls or publishing late healthy evidence', async () => {
  vi.useFakeTimers();
  const set = vi.fn(async (_key: string, _value: string) => 'OK'); let resolve!: (value: any) => void;
  const health = vi.fn(() => new Promise<any>(done => { resolve = done; }));
  const worker = randomUUID();
  const publisher = new RuntimeReadinessPublisher(manifestFixture, worker, async () => ({ get: async () => null, pttl: async () => -2, set }), health);
  try {
    const first = publisher.poll(true); await vi.advanceTimersByTimeAsync(1001);
    expect(await first).toEqual({ ready: false });
    expect(await publisher.poll(true)).toEqual({ ready: false }); expect(health).toHaveBeenCalledTimes(1);
    resolve({ brokerGeneration: randomUUID(), workerGeneration: worker, capabilities: manifestFixture.capabilities });
    await vi.advanceTimersByTimeAsync(1);
    expect(set.mock.calls.every(call => !JSON.parse(call[1] as string).ready)).toBe(true);
  } finally { vi.useRealTimers(); }
});
