// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlatformCourse } from '@cove/shared';
import type { DataTableProps } from '@/components/studio/data-table';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ courses: vi.fn(), close: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/i18n', () => ({ useLocale: () => 'en' }));
vi.mock('@/i18n/client/use-error-text', () => ({ useErrorText: () => (error: Error) => error.message }));
vi.mock('@/lib/orpc', () => ({ orpc: { platformContent: { courses: mocks.courses } } }));
vi.mock('@/components/studio/primitives', () => ({
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/studio/data-table', () => ({
  DataTable: ({ manual, data }: DataTableProps<PlatformCourse, unknown>) => (
    <div>
      <span>{manual!.globalFilter}</span>
      <button onClick={() => manual!.onPageIndexChange(2)}>page three</button>
      <button onClick={() => manual!.onGlobalFilterChange('Python')}>search</button>
      <button onClick={() => manual!.onColumnFiltersChange([{ id: 'academy', value: ['academy-id'] }])}>filter</button>
      <button onClick={() => manual!.onSortingChange([{ id: 'title', desc: false }])}>sort</button>
      <span>{data.map((row) => row.title).join(',')}</span>
    </div>
  ),
}));
import { AcademyCoursePicker } from './academy-course-picker';
let host: HTMLDivElement, root: Root, client: QueryClient;
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}
async function click(label: string) {
  await act(async () => {
    [...host.querySelectorAll('button')].find((button) => button.textContent === label)!.click();
  });
  await settle();
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.courses.mockResolvedValue({ rows: [], total: 30, academyOptions: [] });
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={client}><AcademyCoursePicker onClose={mocks.close} /></QueryClientProvider>));
  await settle();
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
});
it.each(['search', 'filter', 'sort'])('resets pagination and requests the entire server dataset after %s', async (control) => {
  await click('page three');
  expect(mocks.courses).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, pageSize: 10 }));
  await click(control);
  const expected = control === 'search' ? { query: 'Python' } : control === 'filter' ? { academyIds: ['academy-id'] } : { sort: 'title', direction: 'asc' };
  expect(mocks.courses).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, ...expected }));
});
it('shows discovery failure and allows retry without dismissing', async () => {
  mocks.courses.mockRejectedValueOnce(new Error('API unavailable'));
  await click('search');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('API unavailable');
  await click('picker.retry');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(mocks.close).not.toHaveBeenCalled();
});
