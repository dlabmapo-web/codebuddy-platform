// @vitest-environment happy-dom
import type { AiHelpReply } from '@cove/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { myHelpRequestKey } from '@/lib/monitoring/use-help-requests';

import { useAiHelp, type AiHelpSubject } from '../_hooks/use-ai-help';
import { AiHelpButton, AiHelpPanel, RunExampleNote } from './ai-help';

const api = vi.hoisted(() => ({ request: vi.fn(), requestForCode: vi.fn(), report: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { learn: { requestAiHelp: api.request, requestAiHelpForCode: api.requestForCode, reportAiHelp: api.report } } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/session/end-session', () => ({ endSession: vi.fn() }));
vi.mock('@/i18n', () => ({ useLocale: () => 'en' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${Object.values(values).join('|')}` : key,
  }),
}));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const academyId = '10000000-0000-4000-8000-000000000001';
const classId = '10000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000003';
const submissionId = '10000000-0000-4000-8000-000000000004';
const materialId = '10000000-0000-4000-8000-000000000007';
const code = 'n = int(input())\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)';
const reply = (over: Partial<AiHelpReply> = {}): AiHelpReply => ({
  id: '10000000-0000-4000-8000-000000000005', level: 1, text: 'joined', createdAt: '2026-11-25T01:00:00.000Z', reported: false,
  analysis: { result: 'You passed 0 of 4 tests.', line: 3, why: 'The loop <b>stops</b> before n.', think: 'Where does it stop?', tryIt: 'Try 3 on paper.', alsoCheck: null },
  ...over,
});
const answer = (over: Record<string, unknown> = {}) => ({ state: 'AVAILABLE', remainingForProblem: 2, remainingToday: 9, reply: reply(), fallback: null, ...over });
const teacher = { request: null, latestClosed: null, teacherAssigned: true, serverTime: '2026-11-25T01:00:00.000Z', denied: false };
const submission: AiHelpSubject = { kind: 'submission', submissionId };
const fromCode = (source: 'RUN' | 'TEST_RUN' = 'RUN', text = code): AiHelpSubject => ({ kind: 'code', materialId, classId, code: text, source, workspaceRevision: 1 });

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

/** The workspace's part: a press asks about a subject, and the panel shows what comes back. */
function Harness({ subject, scope, onFocusLine }: { subject: AiHelpSubject; scope: string; onFocusLine?: (line: number, column: number) => void }) {
  const help = useAiHelp({ academyId, scope });
  const source = help.subject ? (help.subject.kind === 'submission' ? 'SUBMIT' : help.subject.source) : null;
  return (
    <>
      <AiHelpButton busy={help.asking !== null} enabled onPress={() => help.ask('analyze', subject)} reason={null} />
      <button data-testid="passes" onClick={help.clear} type="button" />
      <AiHelpPanel academyId={academyId} classId={classId} code={code} help={help} onFocusLine={onFocusLine} source={source} userId={userId} />
    </>
  );
}
const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await new Promise((done) => setTimeout(done, 0)); });
async function show(subject: AiHelpSubject = submission, props: { scope?: string; onFocusLine?: (line: number, column: number) => void } = {}) {
  await act(() => root.render(
    <QueryClientProvider client={client}>
      <Harness onFocusLine={props.onFocusLine} scope={props.scope ?? materialId} subject={subject} />
    </QueryClientProvider>,
  ));
}
const byId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const press = async (element: HTMLElement | null) => { await act(async () => { element!.click(); }); await settle(); };

it('asks nothing until the student presses AI help, and shows nothing before', async () => {
  await show();
  expect(byId('ai-help-panel')).toBeNull();
  expect(api.request).not.toHaveBeenCalled();
});

it('shows a submission\'s analysis in sections, as plain text, with the line the student wrote', async () => {
  api.request.mockResolvedValue(answer());
  const onFocusLine = vi.fn();
  await show(submission, { onFocusLine });
  await press(byId('ai-help'));
  expect(api.request).toHaveBeenCalledTimes(1);
  // Only ids, a language and the mode leave the browser; the server holds the code.
  expect(Object.keys(api.request.mock.calls[0]![0]).sort()).toEqual(['academyId', 'locale', 'mode', 'requestId', 'submissionId']);
  const card = byId('ai-analysis')!;
  expect(card.textContent).toContain('You passed 0 of 4 tests.');
  expect(card.textContent).toContain('The loop <b>stops</b> before n.');
  expect(card.querySelector('b')).toBeNull();
  expect(card.textContent).toContain('ai.from.SUBMIT');
  expect(byId('analysis-line')?.textContent).toContain('for i in range(1, n):');
  await press([...card.querySelectorAll('button')].find((item) => item.textContent === 'ai.show_line') ?? null);
  expect(onFocusLine).toHaveBeenCalledWith(3, 1);
  expect(host.textContent).toContain('ai.left:2');
});

it('after Run or Test run sends the code in the editor, which the server checks on the examples', async () => {
  api.requestForCode.mockResolvedValue(answer());
  await show(fromCode('TEST_RUN'));
  await press(byId('ai-help'));
  expect(api.request).not.toHaveBeenCalled();
  expect(api.requestForCode).toHaveBeenCalledWith(expect.objectContaining({
    academyId, classId, materialId, code, source: 'TEST_RUN', workspaceRevision: 1, mode: 'analyze', locale: 'en',
  }));
  expect(byId('ai-analysis')?.textContent).toContain('ai.from.TEST_RUN');
});

it('says all examples pass, with nothing to explain', async () => {
  api.requestForCode.mockResolvedValue(answer({ reply: null, examplesPassed: true, remainingForProblem: 3 }));
  await show(fromCode());
  await press(byId('ai-help'));
  expect(byId('ai-examples-passed')?.textContent).toBe('ai.examples_passed');
  expect(byId('ai-analysis')).toBeNull();
});

it('explains once more simply about the same code, then offers no more', async () => {
  api.requestForCode.mockResolvedValueOnce(answer()).mockResolvedValueOnce(answer({
    remainingForProblem: 1, reply: reply({ id: '10000000-0000-4000-8000-000000000006', level: 2, analysis: { result: 'Simple.', line: null, why: 'Short.', think: 'Why?', tryIt: null, alsoCheck: null } }),
  }));
  await show(fromCode());
  await press(byId('ai-help'));
  await press(byId('explain-simpler'));
  expect(api.requestForCode.mock.calls[1]![0]).toMatchObject({ mode: 'simpler', code });
  expect(byId('ai-simpler')?.textContent).toContain('Simple.');
  expect(byId('ai-analysis')).not.toBeNull();
  expect(byId('explain-simpler')).toBeNull();
});

it('repeats the same request after a failed connection', async () => {
  api.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(answer());
  await show();
  await press(byId('ai-help'));
  expect(byId('ai-retry')).not.toBeNull();
  await press(byId('ai-retry'));
  const ids = api.request.mock.calls.map((call) => call[0].requestId);
  expect(ids[0]).toBe(ids[1]);
  expect(byId('ai-analysis')).not.toBeNull();
});

it('makes one request for a double press', async () => {
  let resolve!: (value: unknown) => void;
  api.request.mockReturnValue(new Promise((done) => { resolve = done; }));
  await show();
  await act(async () => { byId('ai-help')!.click(); byId('ai-help')!.click(); });
  expect(api.request).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(answer()); });
  await settle();
  expect(byId('ai-analysis')).not.toBeNull();
});

it.each(['LIMIT_PROBLEM', 'LIMIT_DAY', 'EXAM_OPEN', 'STALE', 'OFF'])('says why at %s, and still offers the teacher', async (state) => {
  api.request.mockResolvedValue(answer({ state, remainingForProblem: 0, reply: null }));
  await show();
  await press(byId('ai-help'));
  expect(byId('ai-state')?.textContent).toBe(`ai.state.${state}`);
  expect(byId('ask-teacher')).not.toBeNull();
});

it('shows a fixed text when the AI could not answer', async () => {
  api.requestForCode.mockResolvedValue(answer({ reply: null, fallback: 'busy' }));
  await show(fromCode());
  await press(byId('ai-help'));
  expect(byId('ai-fallback')?.textContent).toBe('ai.fallback.busy');
});

it('reports an answer once and says so', async () => {
  api.request.mockResolvedValue(answer());
  api.report.mockResolvedValue({ reported: true });
  await show();
  await press(byId('ai-help'));
  await press([...byId('ai-analysis')!.querySelectorAll('button')].find((item) => item.textContent === 'ai.report') ?? null);
  expect(api.report).toHaveBeenCalledWith({ academyId, replyId: reply().id });
  expect(byId('ai-analysis')?.textContent).toContain('ai.reported');
});

it('puts the answer away once the code passes', async () => {
  api.requestForCode.mockResolvedValue(answer());
  await show(fromCode());
  await press(byId('ai-help'));
  expect(byId('ai-analysis')).not.toBeNull();
  await press(byId('passes'));
  expect(byId('ai-help-panel')).toBeNull();
});

it('starts over on another problem', async () => {
  api.request.mockResolvedValue(answer());
  await show(submission, { scope: 'first' });
  await press(byId('ai-help'));
  expect(byId('ai-analysis')).not.toBeNull();
  await show(submission, { scope: 'second' });
  expect(byId('ai-help-panel')).toBeNull();
});

it('is off with a reason until something is wrong', async () => {
  const onPress = vi.fn();
  await act(() => root.render(<AiHelpButton busy={false} enabled={false} onPress={onPress} reason="own-input" />));
  const button = byId('ai-help') as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.title).toBe('ai.button_own_input');
  await act(() => root.render(<AiHelpButton busy={false} enabled={false} onPress={onPress} reason="off" />));
  expect((byId('ai-help') as HTMLButtonElement).title).toBe('ai.button_off');
});

it('says what a Run with an example\'s input printed, for free', async () => {
  await act(() => root.render(<RunExampleNote reading={{ kind: 'mismatch', number: 2, expected: '30', actual: '-10' }} />));
  expect(byId('run-example')?.textContent).toBe('ai.run_example:2|30|-10');
  await act(() => root.render(<RunExampleNote reading={{ kind: 'own-input' }} />));
  expect(byId('run-example')).toBeNull();
});
