// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSubmission } from '@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_hooks/use-submission';
const rpc = vi.hoisted(() => ({
  getLatestSubmission: vi.fn(),
  submit: vi.fn(),
  getSubmission: vi.fn(),
}));
vi.mock('@/lib/orpc', () => ({ orpc: { learn: rpc } }));
class Source extends EventTarget {
  static all: Source[] = [];
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    super();
    Source.all.push(this);
  }
  close() {
    this.closed = true;
  }
  send(type: string) {
    this.dispatchEvent(new MessageEvent(type, { data: '{}' }));
  }
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
beforeEach(() => {
  vi.clearAllMocks();
  Source.all = [];
  vi.stubGlobal('EventSource', Source);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  rpc.getLatestSubmission.mockResolvedValue(null);
  rpc.submit.mockResolvedValue({ submissionId: 'attempt', totalCount: 1 });
  rpc.getSubmission.mockResolvedValue({
    submissionId: 'attempt',
    status: 'PASSED',
    totalCount: 1,
    cases: [],
  });
});
async function mount(
  reopenSolveSession?: () => Promise<{ solveSessionId: string } | null>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  let state: ReturnType<typeof useSubmission>;
  function Probe() {
    state = useSubmission({
      academyId: 'academy',
      userId: 'user',
      classId: 'class',
      materialId: 'material',
      solveSessionId: 'expired',
      reopenSolveSession,
    });
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
    async close() {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
it('retains one official action key after lost admission acknowledgement, then uses a new key for new Submit', async () => {
  const f = await mount();
  try {
    rpc.submit.mockRejectedValueOnce(new TypeError('lost acknowledgement'));
    await act(async () => {
      await f.state.submit('print(1)');
    });
    await act(async () => {
      await f.state.submit('print(1)');
    });
    const calls = rpc.submit.mock.calls;
    expect(calls[0][0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[0][0].requestId).toBe(calls[1][0].requestId);
    await act(async () => {
      Source.all[0].send('result');
      await pause();
    });
    await act(async () => {
      await f.state.submit('print(1)');
    });
    expect(calls[2][0].requestId).not.toBe(calls[1][0].requestId);
  } finally {
    await f.close();
  }
});
it('reuses the official key on an automatic solve-session retry', async () => {
  const reopen = vi.fn().mockResolvedValue({ solveSessionId: 'fresh' });
  const f = await mount(reopen);
  try {
    rpc.submit.mockRejectedValueOnce({ code: 'SOLVE_SESSION_INVALID' });
    await act(async () => {
      await f.state.submit('print(1)');
    });
    const calls = rpc.submit.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].requestId).toBeDefined();
    expect(calls[0][0].requestId).toBe(calls[1][0].requestId);
    expect(calls[1][0].solveSessionId).toBe('fresh');
  } finally {
    await f.close();
  }
});
it('ignores a late official result after reset and closes the previous stream', async () => {
  let resolve!: (v: unknown) => void;
  rpc.getSubmission.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const f = await mount();
  try {
    await act(async () => {
      await f.state.submit('print(1)');
    });
    await act(async () => {
      Source.all[0].send('result');
    });
    await act(async () => {
      f.state.reset();
      await pause();
      resolve({
        submissionId: 'attempt',
        status: 'PASSED',
        cases: [],
        totalCount: 1,
      });
      await pause();
    });
    expect(f.state.result).toBe(null);
    expect(Source.all[0].closed).toBe(true);
  } finally {
    await f.close();
  }
});

it.each(['PASSED', 'ERRORED'] as const)(
  'keeps official retry RUNNING until the current durable %s result',
  async (status) => {
    const f = await mount();
    try {
      rpc.getSubmission.mockResolvedValueOnce({
        submissionId: 'attempt',
        status: 'RUNNING',
        totalCount: 1,
        cases: [],
      });
      await act(async () => {
        await f.state.submit('print(1)');
      });
      const source = Source.all[0];
      await act(async () => {
        source.send('result');
        await pause();
      });
      expect(f.state.submitting).toBe(true);
      expect(f.state.result).toBe(null);
      expect(f.state.error).toBe(null);
      expect(source.closed).toBe(false);
      rpc.getSubmission.mockResolvedValue({
        submissionId: 'attempt',
        status,
        totalCount: 1,
        cases: [],
      });
      await act(async () => {
        source.send('result');
        await pause();
      });
      expect(f.state.result?.status).toBe(status);
      expect(f.state.submitting).toBe(false);
      expect(source.closed).toBe(true);
    } finally {
      await f.close();
    }
  },
);
