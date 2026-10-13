// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import type { AcademyCourseImportPreview, PlatformCourse } from '@cove/shared';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  copy: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  close: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/i18n/client/use-error-text', () => ({
  useErrorText: () => (error: Error) => error.message,
}));
vi.mock('@/lib/orpc', () => ({
  orpc: {
    platformLibrary: {
      previewAcademyCourse: mocks.preview,
      importAcademyCourse: mocks.copy,
    },
  },
}));
vi.mock('@/components/studio/primitives', () => ({
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalContent: ({
    children,
    description,
  }: {
    children: ReactNode;
    description: string;
  }) => (
    <div>
      <p>{description}</p>
      {children}
    </div>
  ),
}));
import { AcademyCourseImportDialog } from './academy-course-import-dialog';

const source = {
  id: 'source-course',
  title: 'Python',
  academyId: 'source-academy',
  academyName: 'Academy',
} as PlatformCourse;
const fixture: AcademyCourseImportPreview = {
  sourceAcademyId: source.academyId,
  sourceAcademyName: source.academyName,
  sourceCourseId: source.id,
  sourceCourseTitle: source.title,
  sourceContentRevision: 7,
  materialCounts: {
    PROGRAMMING_EXERCISE: 1,
    PDF_DOCUMENT: 1,
    TURTLE_EXERCISE: 1,
    WRITTEN_RESPONSE: 1,
    MULTIPLE_CHOICE: 1,
    VIDEO_LESSON: 1,
  },
  blockers: [],
  modules: [
    {
      id: 'module',
      title: 'Hidden chapter',
      position: 1,
      isVisible: false,
      lectures: [
        {
          id: 'lecture',
          title: 'Mixed lecture',
          position: 1,
          isVisible: true,
          materials: [
            {
              id: 'material',
              title: 'Video lesson',
              position: 1,
              isVisible: false,
              isRequired: true,
              type: 'VIDEO_LESSON',
            },
          ],
        },
      ],
    },
  ],
};
let root: Root, host: HTMLDivElement, queryClient: QueryClient;
const button = (label: string) =>
  [...host.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  )!;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
async function submit() {
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue(structuredClone(fixture));
  mocks.copy.mockResolvedValue({
    academyId: 'library',
    course: { id: 'new-course' },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <AcademyCourseImportDialog source={source} onClose={mocks.close} />
      </QueryClientProvider>,
    ),
  );
  await settle();
});
afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe('academy course copy dialog', () => {
  it('shows hidden content and all material type counts, then navigates to the draft', async () => {
    expect(host.textContent).toContain('Hidden chapter');
    expect(host.textContent).toContain('import.hidden');
    for (const type of Object.keys(fixture.materialCounts))
      expect(host.textContent).toContain(`import.types.${type}`);
    expect((host.querySelector('input') as HTMLInputElement).value).toBe(
      'Python',
    );
    await submit();
    expect(mocks.copy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAcademyId: source.academyId,
        sourceCourseId: source.id,
        expectedSourceContentRevision: 7,
        title: 'Python',
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      '/admin/content/library/new-course?copied=1',
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('reuses the request key after a lost response and retains form data', async () => {
    mocks.copy.mockRejectedValueOnce(new Error('Network unavailable'));
    await submit();
    expect(host.textContent).toContain('Network unavailable');
    expect((host.querySelector('input') as HTMLInputElement).value).toBe(
      'Python',
    );
    await submit();
    expect(mocks.copy.mock.calls[0]![0].requestKey).toBe(
      mocks.copy.mock.calls[1]![0].requestKey,
    );
  });

  it('requires a refreshed preview after a stale source conflict', async () => {
    mocks.copy.mockRejectedValueOnce(
      new ApiError('Source changed', 409, [], 'LIBRARY_IMPORT_SOURCE_CHANGED'),
    );
    await submit();
    expect(button('import.confirm').disabled).toBe(true);
    await submit();
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    mocks.preview.mockResolvedValue({ ...fixture, sourceContentRevision: 8 });
    await act(async () => button('import.refresh').click());
    await settle();
    await submit();
    expect(mocks.copy.mock.calls[1]![0].expectedSourceContentRevision).toBe(8);
    expect(mocks.copy.mock.calls[1]![0].requestKey).not.toBe(
      mocks.copy.mock.calls[0]![0].requestKey,
    );
  });

  it('blocks submission for unavailable hidden assets', async () => {
    mocks.preview.mockResolvedValue({
      ...fixture,
      blockers: [
        {
          materialId: 'material',
          materialTitle: 'Video lesson',
          reason: 'ASSET_NOT_READY',
        },
      ],
    });
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['library-import-preview'],
      });
    });
    await settle();
    expect(host.textContent).toContain('import.blockers.ASSET_NOT_READY');
    expect(button('import.confirm').disabled).toBe(true);
    await submit();
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('prevents duplicate submits and closing while a copy is in flight', async () => {
    let finish!: (value: unknown) => void;
    mocks.copy.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await submit();
    await submit();
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    expect(button('import.cancel').disabled).toBe(true);
    expect((host.querySelector('input') as HTMLInputElement).disabled).toBe(
      true,
    );
    await act(async () => {
      finish({ academyId: 'library', course: { id: 'new-course' } });
    });
    await settle();
  });
});
