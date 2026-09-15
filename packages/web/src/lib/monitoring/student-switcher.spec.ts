import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentSwitchNavigation } from './student-switch-navigation';
import { PendingTeacherUpdates } from './pending-teacher-updates';
import { FeedbackDraftStore, feedbackScope } from './feedback-draft-store';
import { switcherOrder } from './student-switcher-order';
import type { RosterRow } from './roster';

afterEach(() => vi.useRealTimers());
describe('teacher update handoff', () => {
  it('waits for every teacher operation, not persistence or remote activity', async () => {
    const pending = new PendingTeacherUpdates();
    let first!: (ok: boolean) => void;
    let second!: (ok: boolean) => void;
    pending.add('a', (done) => { first = done; });
    pending.add('b', (done) => { second = done; });
    const completed = vi.fn();
    const result = pending.settle().then(completed);
    first(true);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    second(true);
    await result;
    expect(completed).toHaveBeenCalledWith(true);
  });
  it('times out without dropping the operation, then retries the same update', async () => {
    vi.useFakeTimers();
    const pending = new PendingTeacherUpdates();
    let ack!: (ok: boolean) => void;
    const send = vi.fn((done: (ok: boolean) => void) => { ack = done; });
    pending.add('a', send);
    const first = pending.settle();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await first).toBe(false);
    expect(pending.pending).toBe(true);
    const retry = pending.settle();
    ack(true);
    expect(await retry).toBe(true);
    expect(pending.pending).toBe(false);
  });
  it('refuses departure after rejection without discarding the edit', async () => {
    const pending = new PendingTeacherUpdates();
    pending.add('a', (done) => done(false));
    expect(await pending.settle()).toBe(false);
    expect(pending.pending).toBe(true);
  });
  it('has no wait when this teacher has made no edits', async () => {
    expect(await new PendingTeacherUpdates().settle()).toBe(true);
  });
});

describe('scoped notes', () => {
  it('isolates student, material, teacher, academy and class identities', () => {
    const scope = ['teacher', 'academy', 'class', 'student', 'material'] as const;
    const keys = [feedbackScope(...scope), ...scope.map((_, index) => feedbackScope(...scope.map((part, i) => i === index ? 'different' : part) as [string, string, string, string, string]))];
    expect(new Set(keys).size).toBe(6);
    const store = new FeedbackDraftStore();
    keys.forEach((key, i) => store.edit(key, String(i)));
    keys.forEach((key, i) => expect(store.read(key)).toBe(String(i)));
  });
  it('retains newer edits through late saves and hydration', () => {
    const store = new FeedbackDraftStore();
    store.hydrate('a', 'old');
    store.edit('a', 'sent');
    store.edit('a', 'newer');
    store.edit('b', 'other student');
    store.acknowledge('a', 'sent');
    store.hydrate('a', 'sent');
    expect(store.read('a')).toBe('newer');
    expect(store.read('b')).toBe('other student');
    expect(store.dirty).toBe(true);
  });
  it('keeps an intentionally blank revision on return and clears on logout', () => {
    const store = new FeedbackDraftStore();
    store.hydrate('a', 'saved');
    store.edit('a', '');
    store.hydrate('a', 'saved');
    expect(store.read('a')).toBe('');
    expect(store.dirty).toBe(true);
    store.clear();
    expect(store.dirty).toBe(false);
  });
  it('is independent in another tab and marks acknowledged notes clean', () => {
    const first = new FeedbackDraftStore();
    const second = new FeedbackDraftStore();
    first.edit('a', 'note');
    expect(second.read('a')).toBe('');
    first.acknowledge('a', 'note');
    expect(first.dirty).toBe(false);
  });
});

it('pins current, orders eligible first, freezes activity changes and removes revoked rows', () => {
  const row = (membershipId: string, displayName: string, canOpenLive: boolean) => ({ membershipId, displayName, canOpenLive } as RosterRow);
  const rows = [row('a', 'Alex', false), row('b', 'Mina', true), row('c', 'John', true)];
  const initial = switcherOrder(rows, 'c', 'en');
  expect(initial).toEqual(['c', 'b', 'a']);
  expect(switcherOrder([row('a', 'Alex', true), row('b', 'Mina', false), rows[2]!, row('d', 'Aaron', true)], 'c', 'en', initial)).toEqual(['c', 'b', 'a', 'd']);
  expect(switcherOrder([rows[0]!, rows[2]!], 'c', 'en', initial)).toEqual(['c', 'a']);
});

it('recognizes a confirmed saved note after its socket acknowledgement was lost', () => {
  const store = new FeedbackDraftStore();
  store.edit('a', 'sent note');
  expect(store.dirty).toBe(true);
  store.hydrate('a', 'sent note');
  expect(store.dirty).toBe(false);
});


it('only opens the newest destination when handoffs finish out of order', async () => {
  const navigation = new StudentSwitchNavigation();
  let first!: (ready: boolean) => void;
  const oldDestination = vi.fn();
  const latestDestination = vi.fn();
  const old = navigation.request(() => new Promise(resolve => { first = resolve; }), oldDestination);
  expect(await navigation.request(() => Promise.resolve(true), latestDestination)).toBe('navigated');
  first(true);
  expect(await old).toBe('cancelled');
  expect(oldDestination).not.toHaveBeenCalled();
  expect(latestDestination).toHaveBeenCalledOnce();
});

it('cancels an outstanding handoff when the teacher stays or the workspace unmounts', async () => {
  const navigation = new StudentSwitchNavigation();
  let finish!: (ready: boolean) => void;
  const navigate = vi.fn();
  const pending = navigation.request(() => new Promise(resolve => { finish = resolve; }), navigate);
  navigation.cancel();
  finish(true);
  expect(await pending).toBe('cancelled');
  expect(navigate).not.toHaveBeenCalled();
});


it('does not duplicate in-flight updates merely because a switch was requested', async () => {
  const pending = new PendingTeacherUpdates();
  let acknowledge!: (ok: boolean) => void;
  const send = vi.fn((done: (ok: boolean) => void) => { acknowledge = done; });
  pending.add('a', send);
  const handoff = pending.settle();
  expect(send).toHaveBeenCalledOnce();
  acknowledge(true);
  expect(await handoff).toBe(true);
});
