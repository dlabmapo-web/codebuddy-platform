// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { monitoringServerEvents, type MonitoringExercisePreview, type NavigatorPath } from '@cove/shared';
import { useTeacherDisplay } from './use-teacher-display';

const setup = vi.hoisted(() => ({ preview: vi.fn(), handlers: new Map<string, (event: unknown) => void>() }));
vi.mock('@/lib/orpc', () => ({ orpc: { monitoring: { getExercisePreview: setup.preview } } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined, isError: false, refetch: vi.fn() }) }));
afterEach(() => { setup.handlers.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const path: NavigatorPath = {
  course: { id: 'course', title: 'Course' }, module: { id: 'module', title: 'Module' },
  lecture: { id: 'lecture', title: 'Lecture' }, exercise: { materialId: 'a', title: 'Same title' },
};
const snapshot: MonitoringExercisePreview = {
  studentCode: 'print("preview")', breadcrumb: path,
  exercise: { materialId: 'b', title: 'Same title', difficulty: 'EASY', language: 'PYTHON',
    description: '', inputFormat: '', outputFormat: '', constraints: '', starterCode: '',
    timeLimitMs: 1000, memoryLimitMb: 256, gradingMode: 'LEGACY_STDIO', inputPromptPolicy: 'INCLUDE',
    gradingRevision: 1, serverSampleChecks: false, sampleTestCases: [], hints: [], hiddenTestCaseCount: 0 },
};

it.each(['select', 'returnToLive', 'resumeWatched'] as const)('resumes the authorized live document through %s without reopening its watch', async action => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setup.preview.mockResolvedValue(snapshot);
  const follow = vi.fn(); let display!: ReturnType<typeof useTeacherDisplay>;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  function Harness() {
    display = useTeacherDisplay({ academyId: 'academy', classId: 'class', membershipId: 'student',
      liveMaterialId: 'a', liveVisitId: 'visit', livePath: path, socket: null, follow, watchDenied: false, watchEnded: false });
    return <span>{display.displayedMaterialId}</span>;
  }
  try {
    await act(() => root.render(<Harness />));
    for (let i = 0; i < 2; i++) {
      await act(async () => display.select('b'));
      expect(display.display?.mode).toBe('preview'); expect(host.textContent).toBe('b');
      await act(() => action === 'select' ? display.select('a') : display[action]());
      expect(display.isLive).toBe(true); expect(host.textContent).toBe('a');
      expect(follow).not.toHaveBeenCalled();
    }
  } finally { await act(() => root.unmount()); host.remove(); }
});

it('still authorizes a fresh watch when the student has moved to another material', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const follow = vi.fn(); let display!: ReturnType<typeof useTeacherDisplay>;
  const socket = { on: (event: string, handler: (event: unknown) => void) => setup.handlers.set(event, handler), off: (event: string) => setup.handlers.delete(event) };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  function Harness() {
    display = useTeacherDisplay({ academyId: 'academy', classId: 'class', membershipId: 'student',
      liveMaterialId: 'a', liveVisitId: 'visit', livePath: path, socket: socket as never, follow, watchDenied: false, watchEnded: false });
    return <span>{display.displayedMaterialId}</span>;
  }
  try {
    await act(() => root.render(<Harness />));
    await act(() => setup.handlers.get(monitoringServerEvents.studentContextChanged)?.({ studentMembershipId: 'student',
      materialId: 'c', courseId: 'course', path: { ...path, exercise: { materialId: 'c', title: 'New lesson' } }, available: true, changedAt: new Date().toISOString() }));
    expect(host.textContent).toBe('a');
    await act(() => display.returnToLive()); expect(follow).toHaveBeenCalledTimes(1);
  } finally { await act(() => root.unmount()); host.remove(); }
});
