// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePracticeSubmission } from '@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_hooks/use-practice-submission';
const rpc = vi.hoisted(() => ({
  getLatestSubmission: vi.fn(),
  getPracticeResult: vi.fn(),
  listPracticeAttempts: vi.fn(),
  submitPractice: vi.fn(),
}));
vi.mock('@/lib/orpc', () => ({ orpc: { learn: rpc } }));
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const id = '50000000-0000-4000-8000-000000000001',
  materialId = '70000000-0000-4000-8000-000000000001';
const value = (status = 'RUNNING', submissionId = id) => ({
  submissionId,
  materialId,
  status,
  passedCount: 0,
  totalCount: 1,
  score: 0,
  runtimeMs: null,
  failureReason: null,
  elapsedSec: 0,
  attemptCount: 0,
  createdAt: new Date(0).toISOString(),
  gradedAt: null,
  cases: [],
});
class Source extends EventTarget {
  static all: Source[] = [];
  closed = false;
  onerror: ((event: Event) => void) | null = null;
  constructor(public url: string) {
    super();
    Source.all.push(this);
  }
  close() {
    this.closed = true;
  }
  send(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  fail() {
    this.onerror?.(new Event('error'));
  }
}
const pause = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  Source.all = [];
  vi.stubGlobal('EventSource', Source);
  rpc.getLatestSubmission.mockResolvedValue(null);
  rpc.listPracticeAttempts.mockResolvedValue({ attempts: [] });
  rpc.submitPractice.mockResolvedValue({ submissionId: id, totalCount: 1 });
  rpc.getPracticeResult.mockResolvedValue(value());
});
afterEach(() => vi.unstubAllGlobals());
async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let state: ReturnType<typeof usePracticeSubmission>;
  let academy = 'academy';
  function Probe() {
    state = usePracticeSubmission(academy, materialId, false, 1, true, 'owner');
    return null;
  }
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await pause();
  });
  return {
    get state() {
      return state!;
    },
    client,
    async changeAcademy(next: string) {
      academy = next;
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <Probe />
          </QueryClientProvider>,
        );
        await pause();
      });
    },
    async close() {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
it('shows the public streamed verdict immediately and closes without broad refresh', async () => {
  const f = await mount();
  try {
    await act(async () => {
      await f.state.submit('print(1)');
      await pause();
    });
    const source = Source.all[0];
    expect(source?.url).toContain('/practice-submissions/');
    const count = rpc.getPracticeResult.mock.calls.length;
    await act(async () => {
      await pause(1100);
    });
    expect(rpc.getPracticeResult).toHaveBeenCalledTimes(count);
    const invalidate = vi.spyOn(f.client, 'invalidateQueries');
    await act(async () => {
      source.send('result', { ...value('PASSED'), lease: 'SECRET' });
      await pause();
    });
    expect(f.state.result?.status).toBe('PASSED');
    expect(f.state.submitting).toBe(false);
    expect(source.closed).toBe(true);
    expect(JSON.stringify(f.state.result)).not.toContain('SECRET');
    expect(
      invalidate.mock.calls.some(([arg]) => arg?.queryKey?.[0] === 'learn'),
    ).toBe(false);
  } finally {
    await f.close();
  }
});
it('falls back after a failed stream and stops on a terminal read', async () => {
  const f = await mount();
  try {
    await act(async () => {
      await f.state.submit('print(1)');
      await pause();
    });
    rpc.getPracticeResult.mockResolvedValue(value('PASSED'));
    await act(async () => {
      Source.all[0].fail();
      await pause(1100);
    });
    expect(f.state.result?.status).toBe('PASSED');
    expect(Source.all[0].closed).toBe(true);
  } finally {
    await f.close();
  }
});
it('does not let a pending read replace a newer committed stream result', async () => {
  let resolve!: (v: unknown) => void;
  rpc.getPracticeResult.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const f = await mount();
  try {
    await act(async () => {
      await f.state.submit('print(1)');
      await pause();
    });
    await act(async () => {
      Source.all[0].send('result', value('PASSED'));
      await pause();
    });
    await act(async () => {
      resolve(value());
      await pause();
    });
    expect(f.state.result?.status).toBe('PASSED');
  } finally {
    await f.close();
  }
});
it('ignores late historical selections and old streams after reset/new action', async () => {
  let resolve!: (v: unknown) => void;
  const f = await mount();
  try {
    rpc.getPracticeResult.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    let selecting!: Promise<void>;
    await act(async () => {
      selecting = f.state.select('old');
    });
    await act(async () => {
      f.state.reset();
      await f.state.submit('print(2)');
      await pause();
    });
    await act(async () => {
      resolve(value('PASSED', 'old'));
      await selecting;
      await pause();
    });
    expect(f.state.result?.submissionId).not.toBe('old');
    const source = Source.all[0];
    await act(async () => {
      f.state.reset();
      await pause();
      source.send('result', value('PASSED'));
      await pause();
    });
    expect(f.state.result).toBe(null);
    expect(source.closed).toBe(true);
  } finally {
    await f.close();
  }
});
it('reuses an uncertain practice admission key and gives the next accepted action a new key', async () => {
  const f = await mount();
  try {
    rpc.submitPractice.mockRejectedValueOnce(
      new TypeError('lost acknowledgement'),
    );
    await act(async () => {
      await f.state.submit('print(1)');
    });
    await act(async () => {
      await f.state.submit('print(1)');
      await pause();
    });
    const requests = rpc.submitPractice.mock.calls;
    expect(requests[0][0].requestId).toBe(requests[1][0].requestId);
    await act(async () => {
      Source.all[0].send('result', value('PASSED'));
      await pause();
    });
    await act(async () => {
      await f.state.submit('print(1)');
      await pause();
    });
    expect(requests[2][0].requestId).not.toBe(requests[1][0].requestId);
  } finally {
    await f.close();
  }
});
it('uses a reconnected stream after disconnect and suppresses fallback polling while healthy', async () => {
  const f = await mount();
  try {
    await act(async () => {
      await f.state.submit('print(1)');
      await pause();
    });
    const source = Source.all[0];
    await act(async () => {
      source.fail();
      await pause();
    });
    expect(source.closed).toBe(false);
    await act(async () => {
      source.send('ping', '');
      await pause();
    });
    const count = rpc.getPracticeResult.mock.calls.length;
    await act(async () => {
      await pause(1100);
    });
    expect(rpc.getPracticeResult).toHaveBeenCalledTimes(count);
    await act(async () => {
      source.send('result', value('PASSED'));
      await pause();
    });
    expect(f.state.result?.status).toBe('PASSED');
    expect(source.closed).toBe(true);
  } finally {
    await f.close();
  }
});
it('ignores an admission acknowledgement after reset', async () => {
  let resolve!: (v: unknown) => void;
  rpc.submitPractice.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const f = await mount();
  try {
    let submitting!: Promise<void>;
    await act(async () => {
      submitting = f.state.submit('print(1)');
    });
    await act(async () => {
      f.state.reset();
      resolve({ submissionId: id, totalCount: 1 });
      await submitting;
      await pause();
    });
    expect(f.state.submissionId).toBe(null);
    expect(Source.all).toHaveLength(0);
  } finally {
    await f.close();
  }
});

it('removes the old owner/academy result immediately and ignores its late history read', async () => {
  let resolve!: (v: unknown) => void;
  const f = await mount();
  try {
    await act(async () => {
      await f.state.submit('print(1)');
      await pause();
    });
    const source = Source.all[0];
    rpc.getPracticeResult.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    let selecting!: Promise<void>;
    await act(async () => {
      selecting = f.state.select('historical');
    });
    await f.changeAcademy('other-academy');
    await act(async () => {
      resolve(value('PASSED'));
      await selecting;
      source.send('result', value('PASSED'));
      await pause();
    });
    expect(f.state.result).toBe(null);
    expect(f.state.submissionId).toBe(null);
    expect(source.closed).toBe(true);
  } finally {
    await f.close();
  }
});

it('does not refetch automatically on repeated disconnects after the recovery budget', async () => {
  const f = await mount();
  const now = vi.spyOn(Date, 'now');
  try {
    const acceptedAt = Date.now();
    now.mockReturnValue(acceptedAt);
    await act(async () => {
      await f.state.submit('print(1)');
      await pause();
    });
    const count = rpc.getPracticeResult.mock.calls.length;
    now.mockReturnValue(acceptedAt + 121_000);
    await act(async () => {
      Source.all[0].fail();
      Source.all[0].fail();
      await pause();
    });
    expect(rpc.getPracticeResult).toHaveBeenCalledTimes(count);
    expect(Source.all[0].closed).toBe(true);
  } finally {
    now.mockRestore();
    await f.close();
  }
});
