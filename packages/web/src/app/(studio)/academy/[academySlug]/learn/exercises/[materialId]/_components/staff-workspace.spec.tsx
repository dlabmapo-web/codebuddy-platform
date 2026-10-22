/* eslint-disable i18next/no-literal-string -- Labels below identify mocked test components, not product copy. */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LearnExerciseBootstrap } from '@cove/shared';
import { StaffWorkspace } from './staff-workspace';
const mocks = vi.hoisted(() => ({ draft: vi.fn(), editor: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/i18n', () => ({ useLocale: () => 'en', useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/studio/academy-route-provider', () => ({ useAcademySlug: () => 'demo' }));
vi.mock('@/lib/orpc', () => ({ orpc: {} }));
vi.mock('../_hooks/use-draft-autosave', () => ({ useDraftAutosave: (input: unknown) => { mocks.draft(input); return { code: 'private code', saveState: 'saved', setCode: vi.fn(), flushNow: vi.fn(), flushWithoutPromoting: vi.fn(), resetTo: vi.fn() }; } }));
vi.mock('../_hooks/use-practice-submission', () => ({ usePracticeSubmission: () => ({ submitting: false, history: [], submit: vi.fn(), reset: vi.fn(), cells: [] }) }));
vi.mock('../_lib/python-error-lines', () => ({ usePythonErrorLines: () => vi.fn() }));
vi.mock('@/lib/workspace/use-python-runner', () => ({ usePythonRunner: () => ({ running: false, run: vi.fn(), clear: vi.fn(), stop: vi.fn() }) }));
vi.mock('@/lib/workspace/use-sample-runner', () => ({ useSampleRunner: () => ({ runSample: vi.fn() }) }));
vi.mock('@/lib/workspace/use-split-pane', () => ({ useSplitPane: () => ({ size: 40, dividerProps: {}, containerRef: { current: null } }) }));
vi.mock('@/lib/workspace/use-navigator-panel', () => ({ useNavigatorPanel: () => ({ open: false, panelId: 'practice', triggerRef: { current: null }, toggle: vi.fn(), close: vi.fn() }) }));
vi.mock('@/components/workspace/curriculum-navigator', () => ({ WorkspaceCurriculumNavigator: () => null }));
vi.mock('@/components/workspace/curriculum-trigger', () => ({ CurriculumTrigger: () => <button>Materials</button> }));
vi.mock('@/components/pdf/exercise-reference-pane', () => ({ ExerciseReferencePane: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/workspace/problem-statement', () => ({ ProblemStatement: () => <p>Public problem statement</p> }));
vi.mock('@/components/studio/rich-text-frame', () => ({ RichTextFrame: () => <p>Question</p> }));
vi.mock('./editor-pane', () => ({ EditorPane: (props: unknown) => { mocks.editor(props); return <div>Personal editor</div>; } }));
vi.mock('./workspace-header', () => ({ NavButton: ({ label }: { label: string }) => <button>{label}</button> }));
vi.mock('./result-panel', () => ({ ResultPanel: () => null }));
vi.mock('./staff-workspace-dialogs', () => ({
  StaffSolutionDialog: () => <button type="button">solutions</button>,
}));
vi.mock('./staff-tutoring-drawer', () => ({ StaffTutoringDrawer: () => <button type="button">tutoring</button> }));
vi.mock('./staff-student-pane', () => ({ StaffStudentPane: () => null }));
function bootstrap(overrides = {}): LearnExerciseBootstrap {
  return {
    access: { mode: 'staff-practice', canSubmit: true, canAuthor: true, canReview: true, canObserve: true, canViewSolutions: true, ...overrides },
    classContext: { classes: [], classId: null },
    workspace: { breadcrumb: { course: { id: 'course', title: 'Course' }, module: { id: 'module', title: 'Module' }, lecture: { id: 'lecture', title: 'Lecture' } },
      exercise: { materialId: 'material', title: 'Problem', starterCode: 'print(1)', sampleTestCases: [], hints: [], gradingRevision: 2 },
      draft: { code: 'private code', updatedAt: '2026-10-20T00:00:00Z', gradingRevision: 1 }, neighbors: { previous: null, next: null } },
    navigator: { path: {}, course: { modules: [{ lectures: [{ exercises: [{ materialId: 'material', position: 1 }] }] }] } },
  } as unknown as LearnExerciseBootstrap;
}
describe('staff workspace participation', () => {
  it('shows shared work plus explicit curriculum actions for managers', () => {
    const html = renderToStaticMarkup(<StaffWorkspace academyId="academy" bootstrap={bootstrap()} userId="owner" />);
    expect(html).toContain('Personal editor'); expect(html).toContain('notice');
    expect(html).toContain('/content/courses/course/lectures/lecture/exercises/material');
    expect(html).toContain('solutions'); expect(html).toContain('revision_changed');
    expect(mocks.draft).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'owner:staff-practice', practice: true }));
  });
  it('teachers can read solutions and open observation without leaving the workspace', () => {
    const html = renderToStaticMarkup(<StaffWorkspace academyId="academy" bootstrap={bootstrap({ canAuthor: false, canViewSolutions: true, canObserveAssignedStudents: true })} userId="teacher" />);
    expect(html).toContain('Personal editor'); expect(html).toContain('review');
    expect(html).not.toContain('>edit<'); expect(html).toContain('>solutions<');
    expect(html).toContain('>tutoring</button>');
    expect(html).not.toContain('/teach/students?course=');
    expect(html).not.toContain('href="/academy/demo/teach/classes"');
  });
  it('platform inspection cannot submit, and preview buffers have a separate local identity', () => {
    const html = renderToStaticMarkup(<StaffWorkspace academyId="academy" bootstrap={bootstrap({ canSubmit: false, preview: true })} userId="operator" />);
    expect(mocks.editor).toHaveBeenLastCalledWith(expect.objectContaining({ canSubmit: false }));
    expect(mocks.draft).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'operator:staff-practice:preview:2' }));
    expect(html).toContain('preview');
  });
});
