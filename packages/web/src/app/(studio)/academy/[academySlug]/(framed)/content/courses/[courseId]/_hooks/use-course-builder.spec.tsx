// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CourseOutline } from '@cove/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { useCourseBuilder, type CourseBuilderState } from './use-course-builder';
import { courseTreeQueryKey } from '../_lib/course-tree';

const { getOutline, getTree } = vi.hoisted(() => ({ getOutline: vi.fn(), getTree: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { academyCourses: { getOutline, getTree } } }));
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
