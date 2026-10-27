// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { LatestSubmission } from '@cove/shared';
import { submissionPollInterval, useSubmissionStatus } from './use-submission-status';
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const pending: LatestSubmission = { submissionId: 'attempt', createdAt: new Date().toISOString(), maximumHundredths: 10000, scoreHundredths: null, status: 'PENDING' };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('bounded result polling', () => {
  it('pauses hidden-tab polling and refetches on focus', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    const read = vi.fn(async () => pending);
    function Probe() { useSubmissionStatus({ queryKey: ['visible-status'], enabled: true, read, seed: pending }); return null; }
    try {
      focusManager.setFocused(false);
      await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
      await act(async () => { await pause(30); });
      const initial = read.mock.calls.length;
      await act(async () => { await pause(1100); });
      expect(read).toHaveBeenCalledTimes(initial);
      await act(async () => { focusManager.setFocused(true); await pause(30); });
      expect(read.mock.calls.length).toBeGreaterThan(initial);
    } finally { await act(async () => root.unmount()); client.clear(); host.remove(); focusManager.setFocused(undefined); }
  });
  it('keeps a newly accepted attempt when an earlier read returns an older result', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    let seed = pending;
    const accepted = { ...pending, submissionId: 'new-attempt', createdAt: new Date(Date.parse(pending.createdAt) + 1000).toISOString() };
    let resolveOld: (value: LatestSubmission | null) => void = () => {};
    const read = vi.fn().mockImplementationOnce(() => new Promise<LatestSubmission | null>(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ ...accepted, status: 'GRADED', scoreHundredths: 0 });
    let result: ReturnType<typeof useSubmissionStatus>; const complete = vi.fn();
    function Probe() { result = useSubmissionStatus({ queryKey: ['accepted-status'], enabled: true, read, seed, onTerminal: complete }); return null; }
    try {
      await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
      seed = accepted;
      await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
      await act(async () => { await pause(30); });
      await act(async () => { resolveOld({ ...pending, status: 'GRADED', scoreHundredths: 999 }); await pause(20); });
      expect(result!.data).toMatchObject({ submissionId: 'new-attempt', scoreHundredths: 0 });
      expect(complete).toHaveBeenCalledTimes(1);
    } finally { await act(async () => root.unmount()); client.clear(); host.remove(); }
  });
  it('separates automatic execution, human review, terminal states and access failures', () => {
    const now = Date.parse(pending.createdAt);
    expect(submissionPollInterval(pending, now)).toBe(1000);
    expect(submissionPollInterval(pending, now + 120000)).toBe(false);
    expect(submissionPollInterval({ ...pending, status: 'AWAITING_REVIEW' }, now + 3600000)).toBe(15000);
    for (const status of ['GRADED', 'ERROR', 'RECORDED', 'CANCELLED'] as const) expect(submissionPollInterval({ ...pending, status }, now)).toBe(false);
    for (const status of [401, 403, 404]) expect(submissionPollInterval(pending, now, 1, { status })).toBe(false);
    expect([1, 2, 3, 4].map(failures => submissionPollInterval(pending, now, failures, new Error()))).toEqual([2000, 4000, 8000, false]);
  });
  it('keeps a committed workspace result when an earlier status read finishes late', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    let seed = pending;
    let resolveOld: (value: LatestSubmission) => void = () => {};
    const read = vi.fn(() => new Promise<LatestSubmission>(resolve => { resolveOld = resolve; }));
    let result: ReturnType<typeof useSubmissionStatus>;
    function Probe() { result = useSubmissionStatus({ queryKey: ['committed-status'], enabled: true, read, seed }); return null; }
    try {
      await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
      seed = { ...pending, status: 'GRADED', scoreHundredths: 0 };
      await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); await pause(20); });
      await act(async () => { resolveOld(pending); await pause(20); });
      expect(result!.data).toMatchObject({ status: 'GRADED', scoreHundredths: 0 });
      expect(read).toHaveBeenCalledTimes(1);
    } finally { await act(async () => root.unmount()); client.clear(); host.remove(); }
  });
  it('invalidates once on terminal transition and ignores late results from another owner/context', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    const complete = vi.fn(); let scope = 'first';
    let resolveFirst: (value: LatestSubmission | null) => void = () => {};
    const read = vi.fn(() => scope === 'first' ? new Promise<LatestSubmission | null>(resolve => { resolveFirst = resolve; }) : Promise.resolve({ ...pending, submissionId: 'second-attempt', status: 'GRADED' as const, scoreHundredths: 0 }));
    let result: ReturnType<typeof useSubmissionStatus>;
    function Probe() { result = useSubmissionStatus({ queryKey: ['status', scope], enabled: true, read, seed: scope === 'first' ? pending : { ...pending, submissionId: 'second-attempt' }, onTerminal: complete }); return null; }
    try {
      await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
      await act(async () => { await pause(20); });
      scope = 'second';
      await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
      await act(async () => { await pause(30); });
      expect(result!.data?.submissionId).toBe('second-attempt'); expect(result!.data?.scoreHundredths).toBe(0);
      await act(async () => { resolveFirst({ ...pending, status: 'GRADED', scoreHundredths: 999 }); await pause(20); });
      expect(result!.data?.submissionId).toBe('second-attempt'); expect(result!.data?.scoreHundredths).toBe(0);
      expect(complete).toHaveBeenCalledTimes(1);
      const calls = complete.mock.calls.length;
      await act(async () => { await result!.refetch(); await pause(20); });
      expect(complete).toHaveBeenCalledTimes(calls);
    } finally { await act(async () => root.unmount()); client.clear(); host.remove(); }
  });
});
