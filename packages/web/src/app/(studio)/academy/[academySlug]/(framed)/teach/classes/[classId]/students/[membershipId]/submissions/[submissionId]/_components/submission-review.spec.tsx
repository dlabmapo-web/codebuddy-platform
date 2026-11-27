// @vitest-environment happy-dom
import type { TeacherSubmissionReview } from '@cove/shared';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SubmissionReview } from './submission-review';

const editor = vi.hoisted(() => ({
  deltaDecorations: vi.fn((_old: string[], next: unknown[]) => next.map((_, index) => `d${index}`)),
  revealLineInCenter: vi.fn(),
  getModel: () => ({ getLineCount: () => 15 }),
}));
vi.mock('next/dynamic', () => ({
  default: () => function Editor({ onMount }: { onMount?: (value: unknown) => void }) {
    // The editor mounts once, as Monaco does.
    const mounted = { current: false };
    if (!mounted.current && onMount) { mounted.current = true; queueMicrotask(() => onMount(editor)); }
    return <div data-testid="code-editor" />;
  },
}));
vi.mock('@/components/editor/multi-file-editor', () => ({ MultiFileEditor: () => null }));
vi.mock('@/components/programming-review/grading-panel', () => ({ ProgrammingGradingPanel: () => null }));
vi.mock('@/components/workspace/quiz-feedback', () => ({ QuizFeedback: () => null }));
vi.mock('@/i18n', () => ({ useLocale: () => 'en' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${Object.values(values).join('|')}` : key,
  }),
}));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const analysis = (result: string, line: number | null = 11) => ({ result, line, why: 'The **stack** is empty.', think: 'What then?', tryIt: null, alsoCheck: null });
const reply = (over: Record<string, unknown>) => ({ level: 1, text: 'joined', analysis: analysis('R'), locale: 'en' as const, reported: false, createdAt: '2026-11-27T01:00:00.000Z', ...over });
const code = Array.from({ length: 15 }, (_, index) => index === 10 ? '            top = stack.pop()' : `line ${index + 1}`).join('\n');
const review = (over: Partial<TeacherSubmissionReview> = {}): TeacherSubmissionReview => ({
  submissionId: '10000000-0000-4000-8000-000000000001', materialId: '10000000-0000-4000-8000-000000000002', membershipId: '10000000-0000-4000-8000-000000000003',
  studentName: 'Cove Student', problemTitle: 'Brackets', courseTitle: 'C', moduleTitle: 'M', lectureTitle: 'L', outlineNumber: '1-1-1',
  accepted: false, score: 60, passedCount: 6, totalCount: 10, runtimeMs: 55, solveElapsedSec: 2, createdAt: '2026-11-27T01:00:00.000Z',
  code, language: 'PYTHON', statement: '<p>Check brackets.</p>', hiddenPassed: 5, hiddenTotal: 8,
  cases: [
    { position: 1, isSample: true, outcome: 'PASSED', runtimeMs: 1, input: '3', expectedOutput: 'YES', actualOutput: 'YES' },
    { position: 2, isSample: true, outcome: 'RUNTIME_ERROR', runtimeMs: 1, input: '4', expectedOutput: 'NO\nNO', actualOutput: 'NO', pythonError: { type: 'IndexError', message: 'pop from empty list', line: 11 } },
  ],
  aiReplies: [
    reply({ analysis: analysis('You passed 6 of 10 tests.') }),
    reply({ level: 2, analysis: analysis('Simply put.', null), createdAt: '2026-11-27T01:02:00.000Z', reported: true }),
  ],
  aiCodeReplies: [
    reply({ source: 'RUN', code: 'print(1)\nprint(2)', analysis: analysis('Newest run.', 2), createdAt: '2026-11-27T01:30:00.000Z' }),
    reply({ source: 'TEST_RUN', code: 'print(3)', analysis: analysis('Older test run.', 1), createdAt: '2026-11-27T01:20:00.000Z' }),
  ],
  ...over,
} as TeacherSubmissionReview);

let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});
const byId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const show = async (value: TeacherSubmissionReview) => {
  await act(async () => { root.render(<SubmissionReview academyId="a" classId="c" review={value} />); });
  await act(async () => { await Promise.resolve(); });
};
const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); }); };

it('opens on what the AI teacher told the student about this attempt, one answer with its simpler version', async () => {
  await show(review());
  expect(byId('review-tab-ai')?.getAttribute('aria-selected')).toBe('true');
  const list = byId('review-ai-replies')!;
  expect(list.querySelectorAll(':scope > li')).toHaveLength(1);
  expect(list.textContent).toContain('You passed 6 of 10 tests.');
  expect(list.textContent).toContain('teacher.simpler');
  expect(list.textContent).toContain('Simply put.');
  // Reported on the simpler version: the answer says so.
  expect(list.textContent).toContain('teacher.reported');
  // The words to notice stay highlighted, as the student saw them.
  expect([...list.querySelectorAll('mark')].map((mark) => mark.textContent)).toContain('stack');
  // The line it names, quoted from the submission, and shown in the code.
  expect(list.textContent).toContain('top = stack.pop()');
  await click([...list.querySelectorAll('button')].find((button) => button.textContent === 'teacher.show_line'));
  expect(editor.revealLineInCenter).toHaveBeenCalledWith(11);
  expect(editor.deltaDecorations).toHaveBeenLastCalledWith([], [expect.objectContaining({ options: expect.objectContaining({ className: 'cove-warning-line' }) })]);
});

it('lists the answers after Run and Test run newest first, one open at a time, with the code checked', async () => {
  await show(review());
  await click(byId('review-ai-list-code'));
  const list = byId('review-ai-code-replies')!;
  const items = [...list.querySelectorAll(':scope > li')];
  expect(items.map((item) => item.querySelector('button')?.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
  expect(items[0]!.textContent).toContain('Newest run.');
  expect(items[0]!.textContent).toContain('teacher.checked_code');
  // A folded answer shows its first sentence only.
  expect(items[1]!.textContent).toContain('Older test run.');
  expect(items[1]!.textContent).not.toContain('teacher.checked_code');
  await click(items[1]!.querySelector('button'));
  expect(items.map((item) => item.querySelector('button')?.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
  // The checked code's line, not the submission's: no button into the editor.
  expect([...items[1]!.querySelectorAll('button')].some((button) => button.textContent === 'teacher.show_line')).toBe(false);
});

it('keeps the tests a tab away, failures open and passes folded, expected beside received', async () => {
  await show(review());
  expect(byId('review-tab-tests')?.textContent).toContain('6/10');
  await click(byId('review-tab-tests'));
  const panel = host.querySelector('[role="tabpanel"]')!;
  expect(panel.textContent).toContain('progress.review.hidden_summary:5|8');
  const cases = [...panel.querySelectorAll('details')];
  expect(cases.map((item) => item.open)).toEqual([false, true]);
  expect(cases[1]!.textContent).toContain('IndexError: pop from empty list');
  await click(byId('review-tab-problem'));
  expect(host.querySelector('[role="tabpanel"]')?.textContent).toContain('Check brackets.');
});

it('opens on the tests where the AI teacher said nothing, and has no AI tab', async () => {
  await show(review({ aiReplies: [], aiCodeReplies: [] }));
  expect(byId('review-tab-ai')).toBeNull();
  expect(byId('review-tab-tests')?.getAttribute('aria-selected')).toBe('true');
});

it('opens the AI tab on Run and Test run when nothing was asked about this attempt', async () => {
  await show(review({ aiReplies: [] }));
  await click(byId('review-tab-ai'));
  expect(byId('review-ai-list-code')?.getAttribute('aria-pressed')).toBe('true');
  expect(byId('review-ai-code-replies')).not.toBeNull();
});
