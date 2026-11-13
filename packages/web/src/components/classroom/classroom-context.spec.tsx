// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Classroom } from '@cove/shared';
import { ClassroomProvider, ClassroomLessonFooter, ClassroomWorkspaceActions, useClassroomNavigationGuard, type ClassroomLabels } from './classroom-context';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/programming-review/use-review-translation', () => ({ useReviewTranslation: () => (key: string) => key }));
vi.mock('@/components/student-history/monitor-history', () => ({
  MonitorHistoryHost: ({ children }: { children: React.ReactNode }) => children,
  MonitoringLiveContent: ({ children }: { children: React.ReactNode }) => children,
  MonitoringTutorOutlet: () => null,
}));
vi.mock('./class-live-provider', () => ({ useClassLive: () => null }));
vi.mock('@/components/monitoring/help-queue', () => ({ LiveHelpQueue: () => null }));
vi.mock('@/lib/orpc', () => ({ orpc: {} }));
vi.mock('@/lib/monitoring/socket', () => ({ createMonitoringSocket: vi.fn() }));
vi.mock('@/components/monitoring/student-switcher', () => ({ StudentSwitcher: () => null }));
vi.mock('@/components/workspace/curriculum-trigger', () => ({ CurriculumTrigger: () => null }));
vi.mock('./classroom-outline', () => ({ ClassroomOutline: () => null }));
vi.mock('@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-header', () => ({ LiveHeader: ({ answer, onLeave }: { answer: React.ReactNode; onLeave?: React.MouseEventHandler<HTMLAnchorElement> }) => <header><a href="#class" onClick={onLeave}>Exit class</a>{answer}</header> }));
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const classroom: Classroom = {
  class: { id: 'class', name: 'My class' },
  courses: [{ id: 'course', title: 'Python', modules: [{ id: 'module', title: 'Basics', lectures: [{ id: 'lecture', title: 'Introduction', materials: [
    { id: 'one', title: 'One', type: 'EXPLANATION' }, { id: 'two', title: 'Two', type: 'PROGRAMMING_EXERCISE' },
  ] }] }] }],
};
const labels: ClassroomLabels = { teaching: 'Teaching view', notice: 'Private demonstration', lessons: 'Lessons', exit: 'Back', fullscreen: 'Fullscreen', previous: 'Previous', next: 'Next', empty: 'Empty', saveFailed: 'Save failed', closeOutline: 'Close lessons' };
afterEach(() => push.mockClear());

it('waits for the workspace save guard before leaving the class-scoped lesson', async () => {
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  let allow: (value: boolean) => void;
  const guard = vi.fn(() => new Promise<boolean>(resolve => { allow = resolve; }));
  function Workspace() { useClassroomNavigationGuard(guard); return <><ClassroomLessonFooter /></>; }
  try {
    await act(async () => root.render(<ClassroomProvider academyId="academy-id" classroom={classroom} academySlug="academy" materialId="one" labels={labels}><Workspace /></ClassroomProvider>));
    const next = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Next')!;
    await act(async () => next.click());
    expect(push).not.toHaveBeenCalled();
    expect(next.disabled).toBe(true);
    await act(async () => allow!(false));
    expect(push).not.toHaveBeenCalled();
    await act(async () => next.click());
    await act(async () => allow!(true));
    expect(push).toHaveBeenCalledWith('/academy/academy/teach/classes/class/classroom/two');
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('keeps a failed save visible and stays in the teaching view', async () => {
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  function Workspace() { useClassroomNavigationGuard(async () => { throw new Error('offline'); }); return null; }
  try {
    await act(async () => root.render(<ClassroomProvider academyId="academy-id" classroom={classroom} academySlug="academy" materialId="one" labels={labels}><Workspace /></ClassroomProvider>));
    const back = host.querySelector('a')!;
    await act(async () => back.click());
    expect(push).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Save failed');
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('keeps workspace-owned actions mounted in the shared header', async () => {
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  const open = vi.fn();
  try {
    await act(async () => root.render(<ClassroomProvider academyId="academy-id" classroom={classroom} academySlug="academy" materialId="one" labels={labels}>
      <ClassroomWorkspaceActions><button onClick={open}>Show answer</button></ClassroomWorkspaceActions>
    </ClassroomProvider>));
    const action = host.querySelector('header button') as HTMLButtonElement;
    expect(action.textContent).toBe('Show answer');
    await act(async () => action.click());
    expect(open).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('guards the shared header back link as well as lesson changes', async () => {
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  const guard = vi.fn().mockResolvedValue(false);
  function Workspace() { useClassroomNavigationGuard(guard); return null; }
  try {
    await act(async () => root.render(<ClassroomProvider academyId="academy-id" classroom={classroom} academySlug="academy" materialId="one" labels={labels}><Workspace /></ClassroomProvider>));
    await act(async () => host.querySelector('a')!.click());
    expect(push).not.toHaveBeenCalled();
    guard.mockResolvedValue(true);
    await act(async () => host.querySelector('a')!.click());
    expect(push).toHaveBeenCalledWith('/academy/academy/teach/classes/class');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
