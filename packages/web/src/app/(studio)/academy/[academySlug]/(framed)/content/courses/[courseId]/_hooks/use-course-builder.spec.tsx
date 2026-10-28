// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CourseOutline } from '@cove/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { useCourseBuilder, type CourseBuilderState } from './use-course-builder';
import { courseTreeQueryKey } from '../_lib/course-tree';

const { getOutline, getTree, moveExercise } = vi.hoisted(() => ({ getOutline: vi.fn(), getTree: vi.fn(), moveExercise: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { academyCourses: { getOutline, getTree, moveExercise } } }));
vi.mock('@/lib/manual-api', () => ({ manualApi: {} }));
vi.mock('@/lib/video-api', () => ({ videoApi: {} }));
vi.mock('@/lib/pdf-api', () => ({ pdfApi: {} }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const roots: Array<ReturnType<typeof createRoot>> = [];
const clients: QueryClient[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  for (const client of clients.splice(0)) client.clear();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

it('uses the server outline without a duplicate mount read and refreshes through the shared invalidation prefix', async () => {
  const initialTree = { course: { id: 'course', title: 'Before', isVisible: false }, modules: [] } as unknown as CourseOutline;
  getOutline.mockResolvedValue({ ...initialTree, course: { ...initialTree.course, title: 'After' } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  let state: CourseBuilderState;
  function Probe() {
    state = useCourseBuilder({ target: { academyId: 'academy', courseId: 'course' }, initialTree, canEditCurriculum: true, canEditExercises: true });
    return <span>{state.tree.course.title}</span>;
  }
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
  expect(host.textContent).toBe('Before');
  expect(getOutline).not.toHaveBeenCalled();
  expect(getTree).not.toHaveBeenCalled();
  expect(client.getQueryData(courseTreeQueryKey('academy', 'course'))).toBeUndefined();
  await act(async () => {
    await client.invalidateQueries({ queryKey: courseTreeQueryKey('academy', 'course') });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(getOutline).toHaveBeenCalledExactlyOnceWith({ academyId: 'academy', courseId: 'course' });
  expect(host.textContent).toBe('After');
  expect(getTree).not.toHaveBeenCalled();
});

const movingMaterials = [
  ['Python', 'PROGRAMMING_EXERCISE', false], ['PDF', 'PDF_DOCUMENT', false],
  ['PDF + code', 'PROGRAMMING_EXERCISE', true], ['Turtle', 'TURTLE_EXERCISE', false],
  ['Written response', 'WRITTEN_RESPONSE', false], ['Multiple choice', 'MULTIPLE_CHOICE', false],
  ['Video', 'VIDEO_LESSON', false],
] as const;
for (const method of ['move', 'moveFromDrag'] as const) {
  it.each(movingMaterials)(`${method}: moves %s through the shared endpoint and supports Undo`, async (_name, type, linked) => {
    const material = { id: 'material', title: 'Keep me', type, position: 1, isVisible: true,
      programmingExercise: type === 'PROGRAMMING_EXERCISE' ? { referencePdfMaterialId: linked ? 'pdf' : null } : null };
    const source = { id: 'source', title: 'Source', position: 1, isVisible: true, materials: [material] };
    const destination = { id: 'destination', title: 'Destination', position: 1, isVisible: true, materials: [] };
    const initialTree = { course: { id: 'course', title: 'Course', isVisible: true }, modules: [
      { id: 'one', title: 'One', position: 1, isVisible: true, lectures: [source] },
      { id: 'two', title: 'Two', position: 2, isVisible: true, lectures: [destination] },
    ] } as unknown as CourseOutline;
    const moved = { ...initialTree, modules: [
      { ...initialTree.modules[0]!, lectures: [{ ...source, materials: [] }] },
      { ...initialTree.modules[1]!, lectures: [{ ...destination, materials: [material] }] },
    ] } as unknown as CourseOutline;
    moveExercise.mockResolvedValueOnce(moved).mockResolvedValueOnce(initialTree);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
    let state: CourseBuilderState;
    function Probe() { state = useCourseBuilder({ target: { academyId: 'academy', courseId: 'course' }, initialTree, canEditCurriculum: true, canEditExercises: true }); return null; }
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);
    await act(() => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
    await act(async () => { await state![method]('exercise', 'material', { parentId: 'destination', index: 0 }); });
    expect(moveExercise).toHaveBeenNthCalledWith(1, { academyId: 'academy', courseId: 'course', materialId: 'material', fromLectureId: 'source', toLectureId: 'destination', toIndex: 0 });
    expect(state!.tree.modules[1]!.lectures[0]!.materials[0]).toMatchObject(material);
    expect(state!.notice?.kind).toBe('moved');
    const notice = state!.notice;
    if (notice?.kind !== 'moved') throw new Error('Missing move notice');
    await act(async () => { await state!.undoMove(notice.move); });
    expect(moveExercise).toHaveBeenNthCalledWith(2, { academyId: 'academy', courseId: 'course', materialId: 'material', fromLectureId: 'destination', toLectureId: 'source', toIndex: 0 });
    expect(state!.tree).toEqual(initialTree);
    expect(state!.notice?.kind).toBe('undone');
  });
}
