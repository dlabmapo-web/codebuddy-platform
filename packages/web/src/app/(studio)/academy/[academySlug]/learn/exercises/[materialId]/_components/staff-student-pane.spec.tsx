/* eslint-disable i18next/no-literal-string -- Fixture code shown by mocked editors. */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffStudentPane } from './staff-student-pane';
const mocks = vi.hoisted(() => ({ live: false, helping: false, materialId: 'problem', editor: vi.fn(), setMode: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/orpc', () => ({ orpc: {} }));
vi.mock('next/dynamic', () => ({ default: () => (props: { value: string; options: { readOnly: boolean } }) => <pre data-readonly={props.options.readOnly}>{props.value}</pre> }));
vi.mock('@/lib/monaco/theme', () => ({ EDITOR_FONT_FAMILY: 'monospace', registerPaircodeTheme: vi.fn() }));
vi.mock('@/components/workspace/terminal-panel', () => ({ TerminalPanel: () => null }));
vi.mock('@/lib/workspace/use-python-runner', () => ({ usePythonRunner: () => ({ ready: true, running: false, supported: true, lines: [], run: vi.fn(), stop: vi.fn() }) }));
vi.mock('@/lib/monitoring/use-live-workspace', () => ({ useLiveWorkspace: () => ({
  session: mocks.live ? { materialId: mocks.materialId } : null, canEdit: mocks.live, canEditCode: mocks.live && mocks.helping,
  helping: mocks.helping, pendingRecovery: null, feedback: [], text: { toString: () => 'live student code' }, terminal: { lines: [] }, remote: { cursor: null },
  setMode: mocks.setMode, publishCursor: vi.fn(), prepareStudentSwitch: vi.fn(async () => true), cancelStudentSwitch: vi.fn(),
}) }));
vi.mock('@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-editor', () => ({ LiveEditor: (props: { readOnly: boolean }) => { mocks.editor(props); return <pre data-readonly={props.readOnly}>live student code</pre>; } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ isError: false, data: queryKey[0] === 'staff-selected-student'
  ? { viewerMembershipId: 'teacher', exercise: { draftCode: 'saved student code' } }
  : queryKey[0] === 'tutoring-last-attempt' ? { attempts: [{ score: 80, createdAt: '2026-10-20T00:00:00Z' }] } : { feedback: [] }, refetch: vi.fn() }) }));
const props = { academyId: 'academy', materialId: 'problem', userId: 'teacher', starterCode: 'starter', student: { classId: 'class', membershipId: 'student', displayName: 'Student name', identifier: 'student@example.test' }, beforeChangeRef: { current: null }, close: vi.fn(async () => true) };
beforeEach(() => { vi.clearAllMocks(); mocks.live = false; mocks.helping = false; mocks.materialId = 'problem'; });
describe('in-place student pane', () => {
  it('opens an offline student saved snapshot read-only with their score', () => {
    const html = renderToStaticMarkup(<StaffStudentPane {...props} />);
    expect(html).toContain('saved student code'); expect(html).toContain('data-readonly="true"'); expect(html).toContain('80/100');
    expect(html).not.toContain('href='); expect(mocks.setMode).not.toHaveBeenCalled();
  });
  it('keeps the live editor read-only until the server grants helping mode', () => {
    mocks.live = true;
    renderToStaticMarkup(<StaffStudentPane {...props} />);
    expect(mocks.editor).toHaveBeenLastCalledWith(expect.objectContaining({ readOnly: true }));
    mocks.helping = true;
    renderToStaticMarkup(<StaffStudentPane {...props} />);
    expect(mocks.editor).toHaveBeenLastCalledWith(expect.objectContaining({ readOnly: false }));
  });
  it('does not show or edit a different problem when the student moves', () => {
    mocks.live = true; mocks.helping = true; mocks.materialId = 'another-problem';
    const html = renderToStaticMarkup(<StaffStudentPane {...props} />);
    expect(html).toContain('saved student code'); expect(html).not.toContain('live student code'); expect(mocks.editor).not.toHaveBeenCalled();
  });
});
