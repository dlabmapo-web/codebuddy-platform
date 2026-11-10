// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ExplanationReadResult } from '@cove/shared';
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  read: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/explanation-api', () => ({ explanationApi: mocks }));
vi.mock('next/navigation', () => ({ useRouter: () => mocks }));
vi.mock('@/lib/manual-api', () => ({ manualApi: { upload: vi.fn() } }));
vi.mock('./use-explanation-translation', () => ({
  useExplanationTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/editor/RichEditor', () => ({
  RichEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Explanation body"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock('./explanation-content', () => ({
  ExplanationContent: () => <article />,
}));
import { ExplanationAuthorWorkspace } from './explanation-author-workspace';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: ReturnType<typeof createRoot>;
let cache: QueryClient;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  cache?.clear();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});
async function render() {
  const initial = {
    materialId: 'material',
    title: 'Loops',
    body: '<p>Repeat the pattern.</p>',
    revision: 4,
    isVisible: false,
    images: {},
    course: { id: 'course', title: 'Python' },
    lecture: { id: 'lecture', title: 'Loops' },
  } as ExplanationReadResult;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={cache}>
        <ExplanationAuthorWorkspace
          target={{
            academyId: 'academy',
            courseId: 'course',
            lectureId: 'lecture',
          }}
          context={initial}
          initial={initial}
          backHref="/course"
          authorBaseHref="/author"
        />
      </QueryClientProvider>,
    );
  });
  return host;
}
it('uses server-seeded content and saves its revision in a routed workspace', async () => {
  const host = await render();
  expect(host.querySelector('[role=dialog]')).toBeNull();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(host.querySelector('textarea')?.value).toBe(
    '<p>Repeat the pattern.</p>',
  );
  expect(host.textContent).not.toMatch(
    /Test cases|Starter code|Solution|Input format/,
  );
  mocks.save.mockResolvedValue({ materialId: 'material', revision: 5 });
  await act(async () => {
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'save')!
      .click();
  });
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      body: '<p>Repeat the pattern.</p>',
      expectedRevision: 4,
    }),
  );
  expect(mocks.save.mock.calls[0][0]).not.toHaveProperty('testCases');
  expect(mocks.refresh).toHaveBeenCalled();
});
it('keeps the author draft when a stale save conflicts', async () => {
  const host = await render();
  mocks.save.mockRejectedValue(new Error('CONTENT_EDIT_CONFLICT'));
  await act(async () => {
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'save')!
      .click();
  });
  expect(host.querySelector('[role=alert]')?.textContent).toBe('conflict');
  expect(host.querySelector('textarea')?.value).toBe(
    '<p>Repeat the pattern.</p>',
  );
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
