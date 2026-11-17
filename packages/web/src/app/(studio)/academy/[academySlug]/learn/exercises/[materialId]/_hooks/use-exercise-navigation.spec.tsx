// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LearnExerciseBootstrap } from '@cove/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonFooter } from '@/components/workspace/lesson-chrome';
import { useExerciseNavigation } from './use-exercise-navigation';

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), read: vi.fn(), outline: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock('@/components/studio/academy-route-provider', () => ({ useAcademySlug: () => 'test' }));
vi.mock('@/components/classroom/classroom-context', () => ({ useClassroom: () => null }));
vi.mock('@/lib/orpc', () => ({ orpc: { learn: { getExerciseWorkspace: mocks.read, getCourseOutline: mocks.outline } } }));
vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/workspace/use-practice-translation', () => ({ usePracticeTranslation: () => ({ t: (key: string) => key }) }));

function fixture() {
  return {
    workspace: {
      exercise: { materialId: 'code', title: 'Code', quiz: null },
      breadcrumb: { course: { id: 'course', title: 'Course' }, module: { id: 'module', title: 'Module' }, lecture: { id: 'lecture', title: 'Lecture' } },
      neighbors: { previous: { materialId: 'explanation-before' }, next: { materialId: 'explanation-after' } },
    },
    navigator: {
      course: { id: 'course', title: 'Course', modules: [{ id: 'module', lectures: [{ id: 'lecture',
        exercises: [{ materialId: 'code', title: 'Code', position: 2, status: 'NOT_STARTED', bestScore: null }],
        explanations: [
          { materialId: 'explanation-before', title: 'Before', position: 1 },
          { materialId: 'explanation-after', title: 'After', position: 3 },
        ],
      }] }] },
    },
  } as unknown as LearnExerciseBootstrap;
}

let root: ReturnType<typeof createRoot>, client: QueryClient, host: HTMLDivElement;
let navigation: ReturnType<typeof useExerciseNavigation>;
const lifecycle = { canStart: vi.fn(() => true), beforeCommit: vi.fn() };

async function mount(bootstrap = fixture()) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const beforeTransitionRef = { current: lifecycle };
  function Probe() {
    navigation = useExerciseNavigation({ academyId: 'academy', classId: 'class', bootstrap, beforeTransitionRef });
    const { previous, next } = navigation.workspace.neighbors;
    return <LessonFooter index={2} total={3}
      previous={previous ? { onClick: () => void navigation.navigate(previous.materialId) } : null}
      next={next ? { onClick: () => void navigation.navigate(next.materialId) } : null} />;
  }
  await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
}

beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks(); lifecycle.canStart.mockReturnValue(true);
  mocks.read.mockRejectedValue(new Error('EXERCISE_NOT_AVAILABLE'));
  window.history.replaceState(null, '', '/academy/test/learn/exercises/code?classId=class');
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  client?.clear(); host?.remove(); vi.unstubAllGlobals();
});

describe('student coding workspace material navigation', () => {
  it('does not prefetch explanation neighbors as coding exercises', async () => {
    await mount();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.outline).not.toHaveBeenCalled();
  });

  it.each([['previous', 'before'], ['next', 'after']] as const)(
    'opens an explanation from the %s footer button', async (direction, suffix) => {
      await mount();
      await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="workspace.${direction}"]`)!.click());
      expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/academy/test/learn/explanations/explanation-${suffix}?classId=class`);
      expect(mocks.read).not.toHaveBeenCalled();
      expect(lifecycle.beforeCommit).toHaveBeenCalledOnce();
      expect(navigation.failedDestination).toBeNull();
    },
  );

  it('keeps the draft and route intact when a run or submission blocks navigation', async () => {
    await mount(); lifecycle.canStart.mockReturnValue(false);
    await act(async () => { await navigation.navigate('explanation-after'); });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(lifecycle.beforeCommit).not.toHaveBeenCalled();
    expect(navigation.failedDestination).toBeNull();
  });

  it.each([
    ['PDF_DOCUMENT', 'documents'], ['VIDEO_LESSON', 'videos'],
    ['WRITTEN_RESPONSE', 'turtle'], ['MULTIPLE_CHOICE', 'quizzes'], ['TURTLE_EXERCISE', 'turtle'],
  ] as const)('still routes %s without fetching a coding workspace', async (type, segment) => {
    const bootstrap = fixture();
    const lecture = bootstrap.navigator.course.modules[0].lectures[0];
    const material = { materialId: 'destination', title: 'Destination', position: 4 };
    if (type === 'PDF_DOCUMENT') lecture.documents = [{ ...material, pdf: { placement: 'MAIN' } }] as typeof lecture.documents;
    else if (type === 'VIDEO_LESSON') lecture.videos = [material] as typeof lecture.videos;
    else lecture.manualMaterials = [{ ...material, type }] as typeof lecture.manualMaterials;
    bootstrap.workspace.neighbors.next = { materialId: material.materialId, title: material.title, lectureId: lecture.id };
    await mount(bootstrap);
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="workspace.next"]')!.click());
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/academy/test/learn/${segment}/destination?classId=class`);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('still swaps coding exercises in place', async () => {
    const bootstrap = fixture();
    bootstrap.navigator.course.modules[0].lectures[0].exercises.push({ materialId: 'other-code', title: 'Other code', position: 4, status: 'NOT_STARTED', bestScore: null });
    const destination = { ...bootstrap.workspace, exercise: { ...bootstrap.workspace.exercise, materialId: 'other-code' } };
    mocks.read.mockResolvedValue(destination);
    await mount(bootstrap);
    await act(async () => { await navigation.navigate('other-code'); });
    expect(navigation.workspace).toEqual(destination);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/academy/test/learn/exercises/other-code');
    expect(lifecycle.beforeCommit).toHaveBeenCalledOnce();
  });

  it('preserves the current workspace when a coding destination fails to load', async () => {
    const bootstrap = fixture();
    await mount(bootstrap);
    await act(async () => { await navigation.navigate('unavailable-code'); });
    expect(navigation.workspace).toEqual(bootstrap.workspace);
    expect(navigation.failedDestination).toBe('unavailable-code');
    expect(lifecycle.beforeCommit).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/academy/test/learn/exercises/code');
  });
});
