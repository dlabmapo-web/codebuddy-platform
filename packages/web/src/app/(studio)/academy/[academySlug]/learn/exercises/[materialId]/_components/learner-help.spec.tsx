// @vitest-environment happy-dom
import type { AiHelpReply, SubmissionResult } from '@cove/shared';
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
const reply = (over: Partial<AiHelpReply> = {}): AiHelpReply => ({
  id: '10000000-0000-4000-8000-000000000005', level: 1, text: 'joined', createdAt: '2026-11-25T01:00:00.000Z', reported: false,
  analysis: { result: 'You passed 0 of 4 tests.', line: 3, why: 'The loop <b>stops</b> before n.', think: 'Where does it stop?', tryIt: 'Try 3 on paper.', alsoCheck: null },
  ...over,
});
const answer = (over: Record<string, unknown> = {}) => ({ state: 'AVAILABLE', remainingForProblem: 2, remainingToday: 9, reply: reply(), fallback: null, ...over });
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

it('explains a rule at once, and asks nothing until the student presses Analyze', async () => {
  await show(failed('hello', 'Hello'));
  await settle();
  expect(byId('rule-explanation')?.textContent).toBe('rule.letter_case.what');
  expect(byId('ai-invite')?.textContent).toContain('ai.invite');
  expect(api.request).not.toHaveBeenCalled();
});

it('offers the teacher and no AI when the academy has no assistant', async () => {
  await show(failed('hello', 'Hello'), { aiAssistant: false });
  expect(byId('rule-explanation')).not.toBeNull();
  expect(byId('ask-teacher')).not.toBeNull();
  expect(byId('analyze')).toBeNull();
});

it('renders nothing when there is nothing to say', async () => {
  await show(failed('7', '12'), { aiAssistant: false });
  expect(host.innerHTML).toBe('');
});

it('shows the analysis in sections, as plain text, with the line the student wrote', async () => {
  api.request.mockResolvedValue(answer());
  const onFocusLine = vi.fn();
  await show(failed('7', '12'), { onFocusLine });
  await press(byId('analyze'));
  expect(api.request).toHaveBeenCalledTimes(1);
  // Only ids, a language and the mode leave the browser; the server holds the code.
  expect(Object.keys(api.request.mock.calls[0]![0]).sort()).toEqual(['academyId', 'locale', 'mode', 'requestId', 'submissionId']);
  expect(api.request.mock.calls[0]![0]).toMatchObject({ mode: 'analyze', locale: 'en' });
  const card = byId('ai-analysis')!;
  expect(card.textContent).toContain('ai.section.result');
  expect(card.textContent).toContain('You passed 0 of 4 tests.');
  expect(card.textContent).toContain('The loop <b>stops</b> before n.');
  expect(card.querySelector('b')).toBeNull();
  expect(byId('analysis-line')?.textContent).toContain('ai.line:3');
  expect(byId('analysis-line')?.textContent).toContain('for i in range(1, n):');
  expect(byId('ai-invite')).toBeNull();
  await press([...card.querySelectorAll('button')].find((item) => item.textContent === 'ai.show_line') ?? null);
  expect(onFocusLine).toHaveBeenCalledWith(3, 1);
  expect(host.textContent).toContain('ai.left:2');
});

it('names the line without quoting or jumping when the graded code is gone or edited', async () => {
  api.request.mockResolvedValue(answer());
  await show(failed('7', '12'), { withCode: false });
  await press(byId('analyze'));
  expect(byId('analysis-line')?.textContent).toBe('ai.line:3');
});

it('explains once more simply, then offers no more', async () => {
  api.request.mockResolvedValueOnce(answer()).mockResolvedValueOnce(answer({
    remainingForProblem: 1, reply: reply({ id: '10000000-0000-4000-8000-000000000006', level: 2, analysis: { result: 'Simple.', line: null, why: 'Short.', think: 'Why?', tryIt: null, alsoCheck: null } }),
  }));
  await show(failed('7', '12'));
  await press(byId('analyze'));
  await press(byId('explain-simpler'));
  expect(api.request.mock.calls[1]![0]).toMatchObject({ mode: 'simpler' });
  expect(byId('ai-simpler')?.textContent).toContain('Simple.');
  expect(byId('ai-analysis')).not.toBeNull();
  expect(byId('explain-simpler')).toBeNull();
});

it('repeats the same request after a failed connection, and a new one after an answer', async () => {
  api.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(answer());
  await show(failed('7', '12'));
  await press(byId('analyze'));
  expect(byId('analyze')?.textContent).toContain('ai.retry');
  await press(byId('analyze'));
  const ids = api.request.mock.calls.map((call) => call[0].requestId);
  expect(ids[0]).toBe(ids[1]);
  expect(byId('ai-analysis')).not.toBeNull();
});

it('makes one request for a double press', async () => {
  let resolve!: (value: unknown) => void;
  api.request.mockReturnValue(new Promise((done) => { resolve = done; }));
  await show(failed('7', '12'));
  await act(async () => { byId('analyze')!.click(); byId('analyze')!.click(); });
  expect(api.request).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(answer()); });
  await settle();
  expect(byId('ai-analysis')).not.toBeNull();
});

it.each(['LIMIT_PROBLEM', 'LIMIT_DAY', 'EXAM_OPEN', 'STALE', 'OFF'])('says why at %s, and still offers the teacher', async (state) => {
  api.request.mockResolvedValue(answer({ state, remainingForProblem: 0, reply: null }));
  await show(failed('7', '12'));
  await press(byId('analyze'));
  expect(byId('ai-state')?.textContent).toBe(`ai.state.${state}`);
  expect(byId('analyze')).toBeNull();
  expect(byId('ask-teacher')).not.toBeNull();
});

it('shows a fixed text when the AI could not answer', async () => {
  api.request.mockResolvedValue(answer({ reply: null, fallback: 'trace_public' }));
  await show(failed('7', '12'));
  await press(byId('analyze'));
  expect(byId('ai-fallback')?.textContent).toBe('ai.fallback.trace_public');
  expect(byId('ask-teacher')).not.toBeNull();
});

it('reports an answer once and says so', async () => {
  api.request.mockResolvedValue(answer());
  api.report.mockResolvedValue({ reported: true });
  await show(failed('7', '12'));
  await press(byId('analyze'));
  await press([...byId('ai-analysis')!.querySelectorAll('button')].find((item) => item.textContent === 'ai.report') ?? null);
  expect(api.report).toHaveBeenCalledWith({ academyId, replyId: reply().id });
  expect(byId('ai-analysis')?.textContent).toContain('ai.reported');
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
