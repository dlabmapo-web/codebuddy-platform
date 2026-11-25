// @vitest-environment happy-dom
import type { SubmissionResult } from '@cove/shared';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { SubmissionState } from '../_hooks/use-submission';
import { ResultPanel } from './result-panel';

vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }), useLocale: () => 'en' }));
vi.mock('@/i18n/client/use-error-text', () => ({ useErrorText: () => (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', exists: () => true } }) }));
vi.mock('./result-hero', () => ({ ResultHero: () => null }));
vi.mock('./result-metrics', () => ({ ResultMetrics: () => null }));
vi.mock('./test-result-list', () => ({ TestResultList: () => <div data-testid="tests" /> }));
vi.mock('./error-coach-panel', () => ({
  ErrorCoachPanel: ({ code, error, onFocusLine }: { code: string; error: { type: string; line: number | null }; onFocusLine?: unknown }) => (
    <div data-can-focus={String(Boolean(onFocusLine))} data-code={code} data-testid="coach">{`${error.type}:${error.line}`}</div>
  ),
}));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });

const code = 'print(total)';
function submission(over: Partial<SubmissionState> = {}, result: Partial<SubmissionResult> = {}): SubmissionState {
  return {
    cells: [], submitting: false, error: null, submittedCode: code,
    result: {
      submissionId: '10000000-0000-4000-8000-000000000004', status: 'FAILED',
      cases: [{ position: 1, outcome: 'RUNTIME_ERROR', isSample: true, comparator: 'STDOUT', expectedOutput: '1', actualOutput: '',
        pythonError: { type: 'NameError', message: "name 'total' is not defined", line: 1 } }],
      ...result,
    },
    ...over,
  } as unknown as SubmissionState;
}
const show = (state: SubmissionState, props: Partial<Parameters<typeof ResultPanel>[0]> = {}) =>
  act(() => root.render(<ResultPanel currentCode={code} onFocusLine={() => {}} submission={state} {...props} />));
const coach = () => host.querySelector<HTMLElement>('[data-testid="coach"]');

it('shows the Python error coach after a submission', async () => {
  await show(submission());
  expect(coach()?.textContent).toBe('NameError:1');
  expect(coach()?.dataset).toMatchObject({ code, canFocus: 'true' });
});

it('does not point at a line once the student has edited the code', async () => {
  await show(submission(), { currentCode: 'print(1)' });
  expect(coach()?.dataset.canFocus).toBe('false');
});

it('says nothing about an error a hidden test met', async () => {
  const state = submission();
  const [only] = state.result!.cases;
  for (const hidden of [{ ...only!, pythonError: null }, { ...only!, isSample: false }]) {
    await show(submission({}, { cases: [hidden] }));
    expect(coach()).toBeNull();
  }
});

it('offers help only on a finished failure', async () => {
  const renderHelp = vi.fn(() => <div data-testid="help" />);
  await show(submission(), { renderHelp });
  expect(host.querySelector('[data-testid="help"]')).not.toBeNull();
  for (const state of [
    submission({ submitting: true }),
    submission({}, { status: 'PASSED' } as Partial<SubmissionResult>),
    submission({}, { status: 'ERRORED' } as Partial<SubmissionResult>),
  ]) {
    await show(state, { renderHelp });
    expect(host.querySelector('[data-testid="help"]')).toBeNull();
  }
});

it('gives help the graded code, and the editor line only while the editor still holds it', async () => {
  const renderHelp = vi.fn<(...args: unknown[]) => null>(() => null);
  await show(submission(), { renderHelp });
  expect(renderHelp.mock.calls.at(-1)![1]).toEqual({ code, onFocusLine: expect.any(Function) });
  await show(submission(), { renderHelp, currentCode: 'print(1)' });
  expect(renderHelp.mock.calls.at(-1)![1]).toEqual({ code, onFocusLine: undefined });
});
