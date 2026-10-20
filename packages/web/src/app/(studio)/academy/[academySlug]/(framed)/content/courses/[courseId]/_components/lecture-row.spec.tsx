// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { CourseBuilderState } from '../_hooks/use-course-builder';
import type { CourseLecture } from '../_lib/course-tree';
import { LectureRow } from './lecture-row';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/config', () => ({ publicConfig: { guiEnabled: false } }));
vi.mock('@/components/studio/content-base-path-provider', () => ({ useContentSurface: () => 'academy', useContentAcademySlug: () => 'test-academy' }));
vi.mock('@/components/manual/manual-author-dialog', () => ({ ManualAuthorDialog: () => null }));
vi.mock('@/components/video/video-author-dialog', () => ({ VideoAuthorDialog: () => null }));
vi.mock('@/components/pdf/pdf-author-dialog', () => ({ PdfAuthorDialog: ({ initialPreview, editable, onClose }: { initialPreview: boolean; editable: boolean; onClose: () => void }) => <section data-pdf-mode={initialPreview ? 'preview' : 'edit'} data-editable={String(editable)}><button onClick={onClose}>{'close PDF'}</button></section> }));
vi.mock('./builder-dnd', () => ({ DragHandle: () => null, DropIndicator: () => null, useOutlineRowDnd: () => ({ setNodeRef: () => undefined, handle: {}, isDragging: false }) }));
vi.mock('./builder-controls', () => ({ RowVisibility: () => null }));
vi.mock('./row-menu', () => ({ RowMenu: ({ renameLabel, onRename }: { renameLabel?: string; onRename: () => void }) => <button onClick={onRename}>{renameLabel ?? 'rename'}</button> }));
vi.mock('./delete-modal', () => ({ DeleteModal: () => null }));
vi.mock('./new-material-dialog', () => ({ NewMaterialDialog: () => null }));
vi.mock('../../../_components/visibility-confirm-modal', () => ({ VisibilityConfirmModal: () => null }));
vi.mock('./move-anywhere-modal', () => ({ MoveAnywhereModal: () => null }));
vi.mock('./rename-modal', () => ({ RenameModal: () => null }));
const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); document.body.innerHTML = ''; });
async function render(editable: boolean, coding = false) {
  const lecture = { id: 'lecture', title: 'Lesson', position: 1, isVisible: true, materials: [{ id: 'pdf', title: 'Reference document', type: 'PDF_DOCUMENT', position: 1, isVisible: true, programmingExercise: null, pdfDocument: { placement: 'BOTH', originalFilename: 'lesson.pdf', byteSize: 880 } }] } as unknown as CourseLecture;
  if (coding) lecture.materials = [{ id: 'problem', title: 'Coding exercise', type: 'PROGRAMMING_EXERCISE', position: 1, isVisible: true, programmingExercise: { difficulty: 'EASY' } }] as unknown as CourseLecture['materials'];
  const builder = { editable, exerciseEditable: editable, isCollapsed: () => false, visibilityPending: () => false, tree: { modules: [{ id: 'module', lectures: [lecture] }] }, clearReveal: vi.fn(), target: { academyId: 'academy', courseId: 'course' }, refresh: vi.fn(), movePending: false } as unknown as CourseBuilderState;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<ul><LectureRow builder={builder} exercisePath={() => '/exercise'} lecture={lecture} moduleId="module" moduleNumber={1} parentEffectivelyVisible /></ul>));
  return host;
}
it.each([['manager', true], ['team lead', true], ['teacher reviewer', false]] as const)('opens PDF titles and the explicit open action in reading mode for %s', async (_, editable) => {
  const host = await render(editable);
  const byText = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === text)!;
  await act(() => byText('Reference document').click());
  expect(host.querySelector('[data-pdf-mode]')?.getAttribute('data-pdf-mode')).toBe('preview');
  expect(host.querySelector('[data-pdf-mode]')?.getAttribute('data-editable')).toBe(String(editable));
  await act(() => byText('close PDF').click());
  await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="pdf.open: Reference document"]')!.click());
  expect(host.querySelector('[data-pdf-mode]')?.getAttribute('data-pdf-mode')).toBe('preview');
});
it('keeps the explicit edit menu action in edit mode after closing a preview', async () => {
  const host = await render(true);
  const byText = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === text)!;
  await act(() => byText('Reference document').click());
  await act(() => byText('close PDF').click());
  await act(() => byText('pdf.edit_action').click());
  expect(host.querySelector('[data-pdf-mode]')?.getAttribute('data-pdf-mode')).toBe('edit');
});

it('opens the solving workspace from the title and keeps authoring behind Edit', async () => {
  const host = await render(true, true);
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/academy/test-academy/learn/exercises/problem');
  const edit = [...host.querySelectorAll('button')].find(button => button.textContent === 'row.edit')!;
  await act(() => edit.click());
  expect(push).toHaveBeenCalledWith('/exercise');
});
