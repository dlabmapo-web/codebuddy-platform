import { describe, expect, it, vi } from 'vitest';
import { JudgeQueue, redisConnection } from './judge.queue.js';
describe('Redis queue connection', () => {
  it('keeps the configured port, database and escaped credentials', () => {
    expect(redisConnection('redis://worker:p%40ss@127.0.0.1:6380/2')).toEqual({
      host: '127.0.0.1', port: 6380, username: 'worker', password: 'p@ss', db: 2, maxRetriesPerRequest: null,
    });
  });
  it('retains TLS and uses Redis defaults when omitted', () => {
    expect(redisConnection('rediss://redis.example')).toMatchObject({ host: 'redis.example', port: 6379, db: 0, tls: {} });
    expect(() => redisConnection('https://example.com')).toThrow();
  });
});

it('redelivers a failed durable job with its original queue identity after infrastructure recovery', async () => {
  const queue = new JudgeQueue('redis://127.0.0.1:1');
  const prior = { isFailed: vi.fn(async () => true), retry: vi.fn(async () => undefined) };
  const handle = { getJob: vi.fn(async (_id: string) => prior), add: vi.fn() };
  Object.defineProperty(queue, 'queue', { get: () => handle });
  Object.defineProperty(queue, 'practiceQueue', { get: () => handle });
  Object.defineProperty(queue, 'regradeQueue', { get: () => handle });
  await queue.enqueue('official'); await queue.enqueuePractice('practice');
  await queue.enqueueRegrade({ runId: 'run', submissionId: 'repair', requestId: null });
  expect(handle.getJob.mock.calls.map(call => call[0])).toEqual(['official', 'practice', 'regrade:run:repair']);
  expect(prior.retry).toHaveBeenCalledTimes(3); expect(handle.add).not.toHaveBeenCalled();
});
