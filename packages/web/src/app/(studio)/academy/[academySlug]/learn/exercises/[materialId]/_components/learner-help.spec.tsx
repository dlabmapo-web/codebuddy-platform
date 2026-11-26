// @vitest-environment happy-dom
import type { SubmissionResult } from '@cove/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { askTeacherEvent, myHelpRequestKey } from '@/lib/monitoring/use-help-requests';

import { LearnerHelp } from './learner-help';

const api = vi.hoisted(() => ({ request: vi.fn(), report: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { learn: { requestAiHelp: api.request, reportAiHelp: api.report } } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/session/end-session', () => ({ endSession: vi.fn() }));
vi.mock('@/i18n', () => ({ useLocale: () => 'en' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: { count?: number; number?: number }) => values?.count !== undefined ? `${key}:${values.count}` : values?.number !== undefined ? `${key}:${values.number}` : key }) }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const academyId = '10000000-0000-4000-8000-000000000001';
const classId = '10000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000003';
const submissionId = '10000000-0000-4000-8000-000000000004';
const code = 'n = int(input())\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)';
const teacher = { request: null, latestClosed: null, teacherAssigned: true, serverTime: '2026-11-25T01:00:00.000Z', denied: false };

let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(myHelpRequestKey(academyId, classId, userId), teacher);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  host.remove();
  vi.resetAllMocks();
});

/** A failed attempt whose one public case printed `actual` instead of `expected`. */
function failed(actual: string, expected: string): SubmissionResult {
  return {
    submissionId, status: 'FAILED',
    cases: [{ position: 1, outcome: 'WRONG_OUTPUT', isSample: true, comparator: 'STDOUT', expectedOutput: expected, actualOutput: actual }],
  } as SubmissionResult;
}
const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await new Promise((done) => setTimeout(done, 0)); });
async function show(result: SubmissionResult, props: { aiAssistant?: boolean; onFocusLine?: (line: number, column: number) => void; withCode?: boolean } = {}) {
  await act(() => root.render(
    <QueryClientProvider client={client}>
      <LearnerHelp academyId={academyId} aiAssistant={props.aiAssistant ?? true} classId={classId} code={props.withCode === false ? null : code}
        onFocusLine={props.onFocusLine} result={result} userId={userId} />
    </QueryClientProvider>,
  ));
}
const byId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const press = async (element: HTMLElement | null) => { await act(async () => { element!.click(); }); await settle(); };

it('explains a rule at once, points at AI help, and asks nothing', async () => {
  await show(failed('hello', 'Hello'));
  await settle();
  expect(byId('rule-explanation')?.textContent).toBe('rule.letter_case.what');
  // The AI teacher is asked from the toolbar now (the campus courses design, §6).
  expect(byId('ai-invite')?.textContent).toContain('ai.invite_toolbar');
  expect(byId('analyze')).toBeNull();
  // The teacher comes with the AI teacher's answer, so it is offered once.
  expect(byId('ask-teacher')).toBeNull();
  expect(api.request).not.toHaveBeenCalled();
});

it('offers the teacher and no AI when the academy has no assistant', async () => {
  await show(failed('hello', 'Hello'), { aiAssistant: false });
  expect(byId('rule-explanation')).not.toBeNull();
  expect(byId('ask-teacher')).not.toBeNull();
  expect(byId('ai-invite')).toBeNull();
});

it('renders nothing when there is nothing to say', async () => {
  await show(failed('7', '12'), { aiAssistant: false });
  expect(host.innerHTML).toBe('');
});

it('asks the teacher through the one control in the header', async () => {
  const asked = vi.fn();
  window.addEventListener(askTeacherEvent, asked);
  await show(failed('hello', 'Hello'), { aiAssistant: false });
  await press(byId('ask-teacher'));
  expect(asked).toHaveBeenCalledTimes(1);
  window.removeEventListener(askTeacherEvent, asked);
});

it('offers no teacher to a learner who may not ask one', async () => {
  client.setQueryData(myHelpRequestKey(academyId, classId, userId), { ...teacher, denied: true });
  await show(failed('hello', 'Hello'), { aiAssistant: false });
  expect(byId('ask-teacher')).toBeNull();
});
