import { describe, expect, it, vi } from 'vitest';

import {
  createDraftSyncQueue,
  type DraftSendResult,
} from './draft-sync-queue';

const ECHO = 'user:academy:echo';
const SUM = 'user:academy:sum';

/** A server that answers when the test says so, and records what it was asked. */
function server() {
  const calls: { key: string; code: string; base: string | null }[] = [];
  const waiting: ((result: DraftSendResult) => void)[] = [];
  const send = vi.fn(
    (input: { session: string; code: string; base: string | null }) => {
      calls.push({ key: input.session, code: input.code, base: input.base });
      return new Promise<DraftSendResult>((resolve) => waiting.push(resolve));
    },
  );
  return {
    calls,
    send,
    /** Answers the oldest outstanding request. */
    answer(result: DraftSendResult) {
      const resolve = waiting.shift();
      if (!resolve) throw new Error('nothing is in flight');
      resolve(result);
    },
    outstanding: () => waiting.length,
  };
}

const saved = (updatedAt: string): DraftSendResult => ({
  outcome: 'saved',
  updatedAt,
});

describe('one save at a time, per draft', () => {
  it('holds a second save for the same draft behind the first', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);

    void queue.enqueue(ECHO, ECHO, 'first');
    void queue.enqueue(ECHO, ECHO, 'second');

    expect(remote.outstanding()).toBe(1);
    expect(queue.pendingOf(ECHO)).toBe('second');

    remote.answer(saved('2026-09-14T10:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();
    expect(remote.calls.map((call) => call.code)).toEqual(['first', 'second']);
  });

  it('keeps only the latest value waiting', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);

    void queue.enqueue(ECHO, ECHO, 'first');
    void queue.enqueue(ECHO, ECHO, 'second');
    void queue.enqueue(ECHO, ECHO, 'third');

    expect(queue.pendingOf(ECHO)).toBe('third');
    remote.answer(saved('2026-09-14T10:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();
    expect(remote.calls.map((call) => call.code)).toEqual(['first', 'third']);
  });

  it('runs two drafts at the same time rather than serializing them', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);

    void queue.enqueue(ECHO, ECHO, 'echo code');
    void queue.enqueue(SUM, SUM, 'sum code');

    expect(remote.outstanding()).toBe(2);
  });

  it('does not let another draft take a queued save out of the queue', async () => {
    // The reported loss: A's final save, queued behind A's in-flight one, was
    // replaced by B's first save when the student moved between problems.
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);

    void queue.enqueue(ECHO, ECHO, 'echo first');
    void queue.enqueue(ECHO, ECHO, 'echo final');
    void queue.enqueue(SUM, SUM, 'sum first');

    expect(queue.pendingOf(ECHO)).toBe('echo final');
    expect(queue.pendingOf(SUM)).toBeNull();

    remote.answer(saved('2026-09-14T10:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();
    expect(remote.calls.map((call) => call.code)).toContain('echo final');
  });

  it('skips a buffer the server has already confirmed', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    void queue.enqueue(ECHO, ECHO, 'same');
    remote.answer(saved('2026-09-14T10:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();

    await queue.enqueue(ECHO, ECHO, 'same');
    expect(remote.calls).toHaveLength(1);
  });
});

describe('revisions belong to their own draft', () => {
  it('does not let one draft acknowledgement set another draft base', async () => {
    // The reported crossing: a late response for A moved B's base revision, so
    // B's next save was written against a revision belonging to A.
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    queue.seed(SUM, {
      base: '2026-09-14T09:00:00.000Z',
      lastSynced: 'sum original',
    });

    void queue.enqueue(ECHO, ECHO, 'echo code');
    remote.answer(saved('2026-09-14T11:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.revisionOf(ECHO).base).toBe('2026-09-14T11:00:00.000Z');
    expect(queue.revisionOf(SUM).base).toBe('2026-09-14T09:00:00.000Z');

    void queue.enqueue(SUM, SUM, 'sum code');
    expect(remote.calls.at(-1)?.base).toBe('2026-09-14T09:00:00.000Z');
  });

  it('sends each draft the revision it was actually edited from', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    queue.seed(ECHO, { base: '2026-09-14T08:00:00.000Z', lastSynced: 'a' });
    queue.seed(SUM, { base: '2026-09-14T09:00:00.000Z', lastSynced: 'b' });

    void queue.enqueue(ECHO, ECHO, 'a2');
    void queue.enqueue(SUM, SUM, 'b2');

    expect(remote.calls).toEqual([
      { key: ECHO, code: 'a2', base: '2026-09-14T08:00:00.000Z' },
      { key: SUM, code: 'b2', base: '2026-09-14T09:00:00.000Z' },
    ]);
  });

  it('keeps the original base on a conflict', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    queue.seed(ECHO, { base: '2026-09-14T08:00:00.000Z', lastSynced: 'a' });

    void queue.enqueue(ECHO, ECHO, 'mine');
    remote.answer({ outcome: 'conflict', updatedAt: '2026-09-14T09:00:00.000Z' });
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.revisionOf(ECHO).base).toBe('2026-09-14T08:00:00.000Z');
    // The text is still unsynced: a refusal stored nothing.
    expect(queue.revisionOf(ECHO).lastSynced).toBe('a');
    expect(queue.shouldSend(ECHO, 'mine')).toBe(true);
  });

  it('leaves everything alone when a request never lands', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    queue.seed(ECHO, { base: '2026-09-14T08:00:00.000Z', lastSynced: 'a' });

    void queue.enqueue(ECHO, ECHO, 'mine');
    remote.answer({ outcome: 'failed' });
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.revisionOf(ECHO)).toEqual({
      base: '2026-09-14T08:00:00.000Z',
      lastSynced: 'a',
    });
  });
});

describe('seeding from the workspace payload', () => {
  it('takes the server revision when nothing is known', () => {
    const queue = createDraftSyncQueue(server().send);
    queue.seed(ECHO, { base: '2026-09-14T08:00:00.000Z', lastSynced: 'a' });
    expect(queue.revisionOf(ECHO).base).toBe('2026-09-14T08:00:00.000Z');
  });

  it('never moves a draft backwards onto a cached payload', async () => {
    // A revisit within the workspace cache window carries the draft as it was
    // before this session's own saves.
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    void queue.enqueue(ECHO, ECHO, 'newer');
    remote.answer(saved('2026-09-14T12:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();

    queue.seed(ECHO, { base: '2026-09-14T08:00:00.000Z', lastSynced: 'older' });

    expect(queue.revisionOf(ECHO)).toEqual({
      base: '2026-09-14T12:00:00.000Z',
      lastSynced: 'newer',
    });
  });

  it('takes a server revision that really is newer', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    void queue.enqueue(ECHO, ECHO, 'mine');
    remote.answer(saved('2026-09-14T10:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();

    // Another device saved since.
    queue.seed(ECHO, { base: '2026-09-14T13:00:00.000Z', lastSynced: 'theirs' });
    expect(queue.revisionOf(ECHO).base).toBe('2026-09-14T13:00:00.000Z');
  });
});

describe('the sender the queue uses', () => {
  it('is replaceable without losing what the queue knows', async () => {
    const first = server();
    const queue = createDraftSyncQueue<string>(first.send);
    void queue.enqueue(ECHO, ECHO, 'one');
    first.answer(saved('2026-09-14T10:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();

    const second = server();
    queue.setSender(second.send);
    void queue.enqueue(ECHO, ECHO, 'two');

    // The revision survived the swap, so the new sender is told what this
    // draft was actually edited from.
    expect(second.calls).toEqual([
      { key: ECHO, code: 'two', base: '2026-09-14T10:00:00.000Z' },
    ]);
  });

  it('reports a failure rather than throwing before one is set', async () => {
    const queue = createDraftSyncQueue<string>();
    await queue.enqueue(ECHO, ECHO, 'anything');
    expect(queue.revisionOf(ECHO)).toEqual({ base: null, lastSynced: null });
  });
});


describe('latest intent and unresolved conflicts', () => {
  it('saves an undo to the original value after an in-flight edit', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    queue.seed(ECHO, { base: '2026-09-14T08:00:00.000Z', lastSynced: 'original' });
    const running = queue.enqueue(ECHO, ECHO, 'changed');
    void queue.enqueue(ECHO, ECHO, 'original');
    remote.answer(saved('2026-09-14T09:00:00.000Z'));
    await Promise.resolve();
    await Promise.resolve();
    expect(remote.calls.map(c => c.code)).toEqual(['changed', 'original']);
    remote.answer(saved('2026-09-14T10:00:00.000Z'));
    await running;
    expect(queue.revisionOf(ECHO).lastSynced).toBe('original');
  });

  it('does not retry pending code against a rejected revision', async () => {
    const remote = server();
    const queue = createDraftSyncQueue(remote.send);
    queue.seed(ECHO, { base: '2026-09-14T08:00:00.000Z', lastSynced: 'original' });
    const running = queue.enqueue(ECHO, ECHO, 'mine');
    void queue.enqueue(ECHO, ECHO, 'mine again');
    remote.answer({ outcome: 'conflict', updatedAt: '2026-09-14T09:00:00.000Z' });
    await running;
    expect(remote.calls).toHaveLength(1);
    expect(queue.revisionOf(ECHO).base).toBe('2026-09-14T08:00:00.000Z');
  });
});
