// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SolutionCheck, SolutionCheckCase } from '@cove/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PageTranslationsProvider } from '@/i18n/page-translations-provider';
import { SolutionCheckCard } from './solution-check-card';

const api = vi.hoisted(() => ({ getSolutionCheck: vi.fn(), runSolutionCheck: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { academyCourses: api } }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const messages = (locale: string) => JSON.parse(readFileSync(resolve(process.cwd(), '../i18n/src/locales', locale, 'solution-check.json'), 'utf8'));
const target = { academyId: 'a0000000-0000-4000-8000-000000000001', courseId: 'c0000000-0000-4000-8000-000000000001', materialId: 'b0000000-0000-4000-8000-000000000001' };
const passedCase = (position: number, runtimeMs = 20): SolutionCheckCase => ({ position, isSample: position < 3, outcome: 'PASSED', runtimeMs, limitMs: 3000, error: null, cutSuspected: false });
const check = (overrides: Partial<SolutionCheck>): SolutionCheck => ({
  materialId: target.materialId, status: 'PASSED', current: true, queuedAt: '2026-11-09T04:00:00.000Z', finishedAt: '2026-11-09T04:00:03.000Z', result: null, ...overrides,
});
const roots: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => { api.getSolutionCheck.mockReset(); api.runSolutionCheck.mockReset(); });
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; vi.useRealTimers(); });

async function render(initialCheck: SolutionCheck | null | undefined, locale = 'en', testCases = [{ input: '5\n6 9 5 7 4\n', expectedOutput: '0 0 2 2 4' }]) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(() => root.render(
    <QueryClientProvider client={client}>
      <PageTranslationsProvider locale={locale} namespaces={['solution-check']} resources={{ [locale]: { 'solution-check': messages(locale) } }}>
        <SolutionCheckCard {...target} initialCheck={initialCheck} testCases={testCases} />
      </PageTranslationsProvider>
    </QueryClientProvider>,
  ));
  return host;
}

it('shows each failing case with its error line and the spreadsheet hint for cut data', async () => {
  const testCases = Array.from({ length: 9 }, (_, index) => index === 7 ? { input: '1'.repeat(50_000), expectedOutput: '0' } : { input: '1\n', expectedOutput: '0' });
  const host = await render(check({ status: 'FAILED', result: { version: 1, failureReason: null, solutions: [{ index: 0, title: null, passed: false, stoppedBy: null, cases: [
    ...Array.from({ length: 7 }, (_, index) => passedCase(index + 1)),
    { position: 8, isSample: true, outcome: 'RUNTIME_ERROR', runtimeMs: 25, limitMs: 3000, error: { type: 'IndexError', message: 'list index out of range', line: 11 }, cutSuspected: true },
    { position: 9, isSample: true, outcome: 'RUNTIME_ERROR', runtimeMs: 18, limitMs: 3000, error: { type: 'ValueError', message: "invalid literal for int() with base 10: ''", line: 3 }, cutSuspected: false },
  ] }] } }), 'en', testCases);
  const text = host.textContent!;
  expect(text).toContain('The official solution fails some test cases.');
  expect(text).toContain('Case 8');
  expect(text).toContain('IndexError: list index out of range');
  expect(text).toContain('(line 11)');
  expect(text).toContain('exactly 50,000 characters long. A spreadsheet probably cut it');
  expect(text).toContain('Case 9');
  expect(text).toContain('The input may be cut short or in a different format');
  expect(text).not.toContain('Case 7');
});

it('summarises a pass with the slowest case against its limit, in Korean too', async () => {
  const result = { version: 1 as const, failureReason: null, solutions: [{ index: 0, title: null, passed: true, stoppedBy: null, cases: [passedCase(1, 40), passedCase(2, 900)] }] };
  const english = await render(check({ result }));
  expect(english.textContent).toContain('All 2 cases passed with the official solution.');
  expect(english.textContent).toContain('Slowest case: 900 ms of 3000 ms');
  const korean = await render(check({ result }), 'ko');
  // Korean has a single plural form.
  expect(korean.textContent).toContain('모범 답안 1개가 2개 케이스를 모두 통과했습니다.');
});

it('runs a first check on request and follows it until it settles', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const queued = check({ status: 'QUEUED', finishedAt: null });
  api.runSolutionCheck.mockResolvedValue(queued);
  api.getSolutionCheck.mockResolvedValueOnce(check({ status: 'RUNNING', finishedAt: null }))
    .mockResolvedValue(check({ result: { version: 1, failureReason: null, solutions: [{ index: 0, title: null, passed: true, stoppedBy: null, cases: [passedCase(1)] }] } }));
  const host = await render(null);
  expect(host.textContent).toContain('Not checked yet.');
  const button = host.querySelector('button')!;
  await act(async () => { button.click(); await vi.advanceTimersByTimeAsync(10); });
  expect(api.runSolutionCheck).toHaveBeenCalledWith(target);
  expect(host.textContent).toContain('Checking with the official solution');
  expect(host.querySelector('button')!.disabled).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(5_000));
  await act(() => vi.advanceTimersByTimeAsync(5_000));
  expect(host.textContent).toContain('All 1 cases passed');
  const reads = api.getSolutionCheck.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(api.getSolutionCheck.mock.calls.length).toBe(reads);
});

it('marks a check made before the latest change of the test cases', async () => {
  const host = await render(check({ status: 'ERRORED', current: false, result: { version: 1, failureReason: 'WORKER_LOST', solutions: [] } }));
  expect(host.textContent).toContain("The check couldn't run.");
  expect(host.textContent).toContain('The test cases changed after this check.');
});
