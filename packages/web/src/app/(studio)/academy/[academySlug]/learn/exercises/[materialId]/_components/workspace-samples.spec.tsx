// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { LearnExerciseBootstrap } from '@cove/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SampleRun } from '@/lib/workspace/use-sample-runner';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const mocks = vi.hoisted(() => ({ runSample: vi.fn(), publishRun: vi.fn(), submit: vi.fn() }));
vi.mock('@/components/studio/academy-route-provider', () => ({ useAcademySlug: () => 'test' }));
vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/workspace/use-sample-runner', () => ({ useSampleRunner: () => ({ runSample: mocks.runSample, serverCheck: {} }) }));
vi.mock('@/lib/workspace/use-python-runner', () => ({ usePythonRunner: () => ({ ready: true, lines: [] }) }));
vi.mock('@/lib/workspace/use-editor-preferences', () => ({ useEditorPreferences: () => ({ fontSize: 13 }) }));
vi.mock('@/lib/workspace/use-split-pane', () => ({ useSplitPane: () => ({ size: 260 }) }));
vi.mock('@/lib/workspace/use-navigator-panel', () => ({ useNavigatorPanel: () => ({}) }));
vi.mock('@/lib/monitoring/use-student-monitoring', () => ({ useStudentMonitoring: () => ({ peers: [], publishRun: mocks.publishRun }) }));
vi.mock('@/lib/monitoring/use-student-feedback', () => ({ useStudentFeedback: () => ({ messages: [] }) }));
vi.mock('../_hooks/use-exercise-navigation', () => ({ useExerciseNavigation: ({ bootstrap }: { bootstrap: LearnExerciseBootstrap }) => ({ workspace: bootstrap.workspace }) }));
vi.mock('../_hooks/use-draft-autosave', () => ({ useDraftAutosave: () => ({ code: 'student code', hydrated: true }) }));
vi.mock('../_hooks/use-solve-session', () => ({ useSolveSession: () => ({}) }));
vi.mock('../_hooks/use-submission', () => ({ useSubmission: () => ({ submit: mocks.submit }) }));
vi.mock('../_lib/python-error-lines', () => ({ usePythonErrorLines: () => vi.fn(), usePythonErrorHeadline: () => vi.fn() }));
// Keep the real Workspace, batch sequence, EditorPane and RunControls. Stub
// unrelated sockets, persistence, Monaco and layout so the click exercises
// the result handoff that production dropped, not a synthetic projection.
vi.mock('./quiz-workspace', () => ({ QuizWorkspace: () => null }));
vi.mock('./code-editor', () => ({ CodeEditor: () => null }));
vi.mock('./error-coach-panel', () => ({ ErrorCoachPanel: () => null }));
vi.mock('./result-panel', () => ({ ResultPanel: () => null }));
vi.mock('./feedback-panel', () => ({ FeedbackPanel: () => null }));
vi.mock('./monitoring-indicator', () => ({ MonitoringIndicator: () => null }));
vi.mock('./workspace-header', () => ({ WorkspaceHeader: () => null, NavButton: () => null }));
vi.mock('@/components/workspace/font-size-controls', () => ({ FontSizeControls: () => null }));
vi.mock('@/components/workspace/terminal-panel', () => ({ TerminalPanel: () => null }));
vi.mock('@/components/workspace/browser-baseline-notice', () => ({ BrowserBaselineNotice: () => null }));
vi.mock('@/components/workspace/curriculum-navigator', () => ({ WorkspaceCurriculumNavigator: () => null }));
vi.mock('@/components/workspace/curriculum-trigger', () => ({ CurriculumTrigger: () => null }));
vi.mock('@/components/workspace/problem-statement', () => ({ ProblemStatement: () => null }));
vi.mock('@/components/monitoring/request-help', () => ({ RequestHelp: () => null }));
vi.mock('@/components/monitoring/remote-pointer', () => ({ RemotePointer: () => null }));
import { Workspace } from './workspace';

const bootstrap = {
  workspace: {
    exercise: { materialId: 'exercise', quiz: null, starterCode: '', gradingRevision: 6,
      gradingMode: 'LEGACY_STDIO', serverSampleChecks: true, hints: [],
      sampleTestCases: [{ position: 1, input: 'public input', expectedOutput: 'public expected', comparator: 'STDOUT' }],
    }, breadcrumb: { course: { id: 'course' } }, neighbors: {},
  },
} as unknown as LearnExerciseBootstrap;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.clearAllMocks(); });

async function run(result: SampleRun, mode: "LEGACY_STDIO" | "ELICE_STDIO" = "LEGACY_STDIO") {
  const input = structuredClone(bootstrap); input.workspace.exercise.gradingMode = mode;
  mocks.runSample.mockResolvedValue(result);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Workspace academyId="academy" bootstrap={input} classId="class" userId="student" returnTo={null} />));
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === 'workspace.run_tests');
  expect(button).toBeDefined();
  await act(async () => button!.click());
  return host.textContent!;
}

describe('workspace server sample results', () => {
  it.each([
    ['LEGACY_STDIO', 'runtime_error'], ['LEGACY_STDIO', 'time_limit'],
    ['ELICE_STDIO', 'runtime_error'], ['ELICE_STDIO', 'time_limit'],
  ] as const)('renders %s %s narration through the real batch panel', async (mode, kind) => {
    const text = await run({
      outcome: { stdout: '', stopped: false, failed: kind === 'runtime_error', error: null },
      verdict: { kind: 'skipped', reason: 'error' },
      report: { lifecycle: 'FAILED', passedCount: 0 },
      serverDetails: [
        { kind: 'err', message: `workspace.sample_check_${kind}`, mark: '✕' },
        { kind: 'err', text: 'diagnostic from the public sample' },
        { kind: 'info', message: 'workspace.sample_check_truncated' },
        { kind: 'info', message: 'workspace.sample_check_earlier_code' },
      ],
    }, mode);
    expect(text).toContain(`workspace.sample_check_${kind}`);
    expect(text).toContain('diagnostic from the public sample');
    expect(text).toContain('workspace.sample_check_truncated');
    expect(text).toContain('workspace.sample_check_earlier_code');
    expect(text).not.toContain('workspace.sample_skipped');
    expect(mocks.publishRun).toHaveBeenLastCalledWith(expect.objectContaining({ lifecycle: 'FAILED', passedCount: 0 }));
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('keeps local practice verdict rendering without server details', async () => {
    const text = await run({ outcome: { stdout: 'ok', stopped: false, failed: false, error: null }, verdict: { kind: 'match' } });
    expect(text).toContain('workspace.sample_match');
    expect(mocks.publishRun).toHaveBeenLastCalledWith(expect.objectContaining({ lifecycle: 'COMPLETED', passedCount: 1 }));
  });
});
