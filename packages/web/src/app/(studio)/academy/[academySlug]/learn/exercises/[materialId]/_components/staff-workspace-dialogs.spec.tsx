import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffSolutionDialog } from './staff-workspace-dialogs';
import { StaffTutoringDrawer } from './staff-tutoring-drawer';
const mocks = vi.hoisted(() => ({ open: true, ready: true, error: false, query: vi.fn(), presence: vi.fn() }));
vi.mock('react', async (original) => ({ ...await original<typeof React>(), useState: (initial: unknown) => [typeof initial === 'boolean' ? mocks.open : initial, vi.fn()] }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/studio/primitives', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ModalTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  ModalContent: ({ title, children }: { title: string; children: React.ReactNode }) => mocks.open ? <section role="dialog" aria-label={title}>{children}</section> : null,
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SheetContent: ({ title, children }: { title: string; children: React.ReactNode }) => mocks.open ? <section role="dialog" aria-label={title}>{children}</section> : null,
}));
vi.mock('@/lib/orpc', () => ({ orpc: {} }));
vi.mock('@/components/workspace/solution-answer-block', () => ({ SolutionAnswerBlock: ({ solution }: { solution: { code: string } }) => <pre>{solution.code}</pre> }));
vi.mock('@/components/studio/profile-avatar', () => ({ ProfileAvatar: () => null }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (input: { queryKey: string[] }) => {
  mocks.query(input);
  const students = [{ membershipId: 'active', userId: 'user1', displayName: 'Active student', email: 'student1@example.test', username: 'student1', membershipStatus: 'ACTIVE', userStatus: 'ACTIVE' }, { membershipId: 'other', userId: 'user2', displayName: 'Other problem student', email: 'student2@example.test', username: 'student2', membershipStatus: 'ACTIVE', userStatus: 'ACTIVE' }];
  const data = input.queryKey[0] === 'staff-solution-dialog' ? { solutions: [{ title: 'Answer one', code: 'reference-answer' }, { title: 'Answer two', code: 'alternate-answer' }] }
    : input.queryKey[0] === 'staff-tutoring-classes' ? { classes: [{ classId: 'class', name: 'Assigned class', students }], truncated: false }
    : input.queryKey[0] === 'tutoring-class-roster' ? { students, exercises: [], truncated: false }
    : [{ membershipId: 'active', attempts: 1 }, { membershipId: 'other', attempts: 0 }];
  return { isError: mocks.error, refetch: vi.fn(), data };
} }));
vi.mock('@/lib/monitoring/use-class-presence', () => ({ useClassPresence: (input: unknown) => {
  mocks.presence(input);
  return { snapshotReady: mocks.ready, state: mocks.ready ? 'live' : 'degraded', refresh: vi.fn(), entries: [
    { studentMembershipId: 'active', state: 'SOLVING', courseId: 'course', materialId: 'problem' },
    { studentMembershipId: 'other', state: 'SOLVING', courseId: 'course', materialId: 'different' },
  ] };
} }));
const context = { academyId: 'academy', courseId: 'course', materialId: 'problem', userId: 'teacher' };
beforeEach(() => { mocks.open = true; mocks.ready = true; mocks.error = false; vi.clearAllMocks(); });
describe('staff workspace dialogs', () => {
  it('shows all reference answers in a dialog without navigation', () => {
    const html = renderToStaticMarkup(<StaffSolutionDialog {...context} lectureId="lecture" />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('reference-answer'); expect(html).toContain('alternate-answer');
    expect(html).not.toContain('href=');
  });
  it('shows assigned students with submission badges in the tutoring drawer', () => {
    const html = renderToStaticMarkup(<StaffTutoringDrawer {...context} assignedTeacher selected={null} onSelect={async () => true} />);
    expect(html).toContain('role="dialog"'); expect(html).toContain('Active student');
    expect(html).toContain('Other problem student'); expect(html).toContain('tutoring_submitted'); expect(html).toContain('tutoring_not_submitted'); expect(html).not.toContain('href=');
    expect(mocks.presence).toHaveBeenCalledWith({ academyId: 'academy', classId: 'class' });
  });
  it('keeps the full class roster but reports unavailable live presence', () => {
    mocks.ready = false;
    const html = renderToStaticMarkup(<StaffTutoringDrawer {...context} assignedTeacher selected={null} onSelect={async () => true} />);
    expect(html).toContain('observe_unavailable'); expect(html).toContain('Active student');
  });
  it('loads no private answers or presence while the dialogs are closed', () => {
    mocks.open = false;
    const html = renderToStaticMarkup(<><StaffSolutionDialog {...context} lectureId="lecture" /><StaffTutoringDrawer {...context} assignedTeacher selected={null} onSelect={async () => true} /></>);
    expect(html).not.toContain('role="dialog"'); expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.presence).not.toHaveBeenCalled();
  });
  it('reports failed reads instead of showing cached students or answers', () => {
    mocks.error = true;
    const html = renderToStaticMarkup(<><StaffSolutionDialog {...context} lectureId="lecture" /><StaffTutoringDrawer {...context} assignedTeacher selected={null} onSelect={async () => true} /></>);
    expect(html).toContain('solution_error'); expect(html).toContain('observe_error');
    expect(html).not.toContain('reference-answer'); expect(html).not.toContain('Active student');
  });
});
