import { afterEach, expect, it, vi } from 'vitest';
import { PendingTeacherUpdates } from './pending-teacher-updates';

afterEach(() => vi.useRealTimers());

it('retains operations across reconnect and ignores the old connection acknowledgement', async () => {
  const queue = new PendingTeacherUpdates();
  const acknowledgements: ((ok: boolean) => void)[] = [];
  queue.add('edit', done => { acknowledgements.push(done); });
  const settled = vi.fn();
  const waiting = queue.settle().then(settled);
  queue.pause();
  acknowledgements[0]!(true);
  await Promise.resolve();
  expect(queue.pending).toBe(true);
  expect(settled).not.toHaveBeenCalled();
  queue.resume();
  expect(acknowledgements).toHaveLength(2);
  acknowledgements[1]!(true);
  await waiting;
  expect(settled).toHaveBeenCalledWith(true);
});

it('times out safely while paused and permits retry after authorization', async () => {
  vi.useFakeTimers();
  const queue = new PendingTeacherUpdates();
  queue.pause();
  const send = vi.fn((done: (ok: boolean) => void) => done(true));
  queue.add('edit', send);
  const waiting = queue.settle();
  await vi.advanceTimersByTimeAsync(8_000);
  expect(await waiting).toBe(false);
  expect(send).not.toHaveBeenCalled();
  queue.resume();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await queue.settle()).toBe(true);
});

it('discard cancels an awaiting switch instead of authorizing navigation', async () => {
  const queue = new PendingTeacherUpdates();
  queue.add('edit', () => {});
  const waiting = queue.settle();
  queue.reset();
  expect(await waiting).toBe(false);
});
