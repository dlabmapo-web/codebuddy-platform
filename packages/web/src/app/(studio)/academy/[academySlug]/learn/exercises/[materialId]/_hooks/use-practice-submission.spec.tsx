// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePracticeSubmission } from './use-practice-submission';
import { PRACTICE_OBSERVATION_MS, PRACTICE_RECONNECT_LIMIT } from '../_lib/practice-submission-stream';

const id = '10000000-0000-4000-8000-000000000001';
const academyId = '20000000-0000-4000-8000-000000000001';
const materialId = '30000000-0000-4000-8000-000000000001';
const mocks = vi.hoisted(() => ({ submit: vi.fn(), read: vi.fn(), history: vi.fn(), latest: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { learn: { submitPractice: mocks.submit, getPracticeResult: mocks.read, listPracticeAttempts: mocks.history } } }));
vi.mock('@/components/workspace/use-latest-submission', () => ({ useLatestSubmission: () => ({ refetch: mocks.latest, data: null, isFetching: false, isPending: false, isError: false }) }));
class FixtureEventSource extends EventTarget {
  static all: FixtureEventSource[] = [];
  closed = false;
  constructor(readonly url: string) { super(); FixtureEventSource.all.push(this); }
  close() { this.closed = true; }
  disconnect() { this.dispatchEvent(new Event('error')); }
  result(status: 'QUEUED' | 'PASSED') { this.dispatchEvent(new MessageEvent('result', { data: JSON.stringify(record(status)) })); }
}
function record(status: 'QUEUED' | 'PASSED' = 'QUEUED') {
  return { submissionId: id, materialId, status, passedCount: status === 'PASSED' ? 1 : 0, totalCount: 1, score: status === 'PASSED' ? 100 : 0,
    runtimeMs: null, failureReason: null, elapsedSec: 0, attemptCount: 0, createdAt: new Date().toISOString(), gradedAt: null, cases: [] };
}
let root: ReturnType<typeof createRoot>, client: QueryClient, host: HTMLDivElement;
let state: ReturnType<typeof usePracticeSubmission>;
async function mount() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  function Probe() { state = usePracticeSubmission(academyId, materialId, false, 1, true, 'owner'); return null; }
  await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
  await act(async () => { await state.submit('fixture:correct'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  return FixtureEventSource.all[0]!;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('EventSource', FixtureEventSource);
  focusManager.setFocused(false); FixtureEventSource.all = [];
  mocks.submit.mockReset().mockResolvedValue({ submissionId: id, totalCount: 1 });
  mocks.read.mockReset().mockImplementation(async () => record()); mocks.history.mockReset().mockResolvedValue({ attempts: [] });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  client?.clear(); host?.remove(); focusManager.setFocused(undefined); vi.useRealTimers(); vi.unstubAllGlobals();
});
describe('bounded personal practice observation', () => {
  it('keeps one overall deadline across server disconnects, then performs one read-only recovery', async () => {
    const source = await mount(); const initialReads = mocks.read.mock.calls.length;
    await act(async () => { source.disconnect(); await vi.advanceTimersByTimeAsync(30_000); source.disconnect(); await vi.advanceTimersByTimeAsync(PRACTICE_OBSERVATION_MS - 30_001); });
    expect(source.closed).toBe(true); expect(mocks.read).toHaveBeenCalledTimes(initialReads + 1);
    await act(async () => { source.disconnect(); await vi.advanceTimersByTimeAsync(PRACTICE_OBSERVATION_MS * 3); });
    expect(FixtureEventSource.all).toHaveLength(1); expect(mocks.read).toHaveBeenCalledTimes(initialReads + 1); expect(mocks.submit).toHaveBeenCalledTimes(1);
    // Existing history selection remains a manual result read after observation has stopped.
    await act(async () => { await state.select(id); });
    expect(mocks.read).toHaveBeenCalledTimes(initialReads + 2); expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
  it('caps repeated server closes before the lifetime expires', async () => {
    const source = await mount(); const initialReads = mocks.read.mock.calls.length;
    await act(async () => { for (let n = 0; n < PRACTICE_RECONNECT_LIMIT; n++) source.disconnect(); });
    expect(source.closed).toBe(true); expect(mocks.read).toHaveBeenCalledTimes(initialReads + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(PRACTICE_OBSERVATION_MS * 2); });
    expect(mocks.read).toHaveBeenCalledTimes(initialReads + 1); expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
  it('accepts a terminal result after reconnect without resubmitting or a later deadline read', async () => {
    const source = await mount(); const initialReads = mocks.read.mock.calls.length;
    await act(async () => { source.disconnect(); source.result('PASSED'); await vi.advanceTimersByTimeAsync(1); });
    expect(source.closed).toBe(true); expect(state.result?.status).toBe('PASSED');
    await act(async () => { source.result('QUEUED'); await vi.advanceTimersByTimeAsync(PRACTICE_OBSERVATION_MS * 2); });
    expect(state.result?.status).toBe('PASSED'); expect(mocks.read).toHaveBeenCalledTimes(initialReads); expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
});
