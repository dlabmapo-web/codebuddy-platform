import { describe, expect, it, vi } from 'vitest';
import { DispatchIntentService } from './dispatch-intent.js';

describe('durable dispatch', () => {
  it('acknowledges only a successful idempotent queue insertion and retries uncertainty', async () => {
    const row = { id: 'intent', submissionId: 'attempt', staffPracticeAttemptId: null, submission: { regradeRunId: null } };
    let acknowledged = false;
    const db = { gradingDispatchIntent: {
      findMany: vi.fn(async () => acknowledged ? [] : [row]),
      updateMany: vi.fn(async ({ data }: any) => { if (data.dispatchedAt) acknowledged = true; return { count: 1 }; }),
    } };
    const ids = new Set<string>(); let fail = true;
    const queue = { enqueue: vi.fn(async (id: string) => { ids.add(id); if (fail) { fail = false; throw new Error('lost acknowledgement'); } }) };
    const service = new DispatchIntentService(db as never, queue as never);
    await service.flush(); expect(acknowledged).toBe(false);
    await service.flush(); await service.flush();
    expect([...ids]).toEqual(['attempt']); expect(acknowledged).toBe(true);
  });
});

it('recovers abandoned leases in their original queues while excluding live ownership', async () => {
  const db = { submission: { findMany: async () => [{ id: 'live', regradeRunId: null }, { id: 'official', regradeRunId: null }, { id: 'repair', regradeRunId: 'run' }] },
    staffPracticeAttempt: { findMany: async () => [{ id: 'practice' }] } };
  const queue = { enqueue: vi.fn(), enqueuePractice: vi.fn(), enqueueRegrade: vi.fn() };
  await new DispatchIntentService(db as never, queue as never).recoverLeased(new Set(['live']));
  expect(queue.enqueue).toHaveBeenCalledExactlyOnceWith('official');
  expect(queue.enqueuePractice).toHaveBeenCalledExactlyOnceWith('practice');
  expect(queue.enqueueRegrade).toHaveBeenCalledExactlyOnceWith({ submissionId: 'repair', runId: 'run', requestId: null });
});
