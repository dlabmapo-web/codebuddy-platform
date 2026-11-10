// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/explanation-api', () => ({ explanationApi: api }));
vi.mock('@/lib/manual-api', () => ({ manualApi: { upload: vi.fn() } }));
vi.mock('./use-explanation-translation', () => ({ useExplanationTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/studio/primitives', () => ({ Modal: ({ children }: { children: React.ReactNode }) => <>{children}</>, ModalContent: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div> }));
vi.mock('@/components/editor/RichEditor', () => ({ RichEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Explanation body" value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('./explanation-content', () => ({ ExplanationContent: () => <article /> }));
import { ExplanationAuthorDialog } from './explanation-author-dialog';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: ReturnType<typeof createRoot>;
let cache: QueryClient;
afterEach(async () => { if (root) await act(() => root.unmount()); cache?.clear(); document.body.innerHTML = ''; vi.clearAllMocks(); });
async function render() {
  api.read.mockResolvedValue({ materialId: 'material', title: 'Loops', body: '<p>Repeat the pattern.</p>', revision: 4, isVisible: false, images: {} });
  const onClose = vi.fn(), onSaved = vi.fn().mockResolvedValue(undefined);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<QueryClientProvider client={cache}><ExplanationAuthorDialog target={{ academyId: 'academy', courseId: 'course', lectureId: 'lecture' }} material={{ id: 'material', title: 'Outline title' }} onClose={onClose} onSaved={onSaved} /></QueryClientProvider>); });
  await vi.waitFor(() => expect(host.querySelector('textarea')?.value).toBe('<p>Repeat the pattern.</p>'));
  return { host, onClose, onSaved };
}
it('loads the saved body/revision without coding or grading fields', async () => {
  const { host } = await render();
  expect(host.querySelector('input:not([type=checkbox])')?.getAttribute('value')).not.toBe('Outline title');
  expect(host.textContent).not.toMatch(/Test cases|Starter code|Solution|Input format|Language/);
  api.save.mockResolvedValue({ materialId: 'material' });
  await act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === 'save')!.click(); });
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ body: '<p>Repeat the pattern.</p>', expectedRevision: 4 }));
  expect(api.save.mock.calls[0][0]).not.toHaveProperty('testCases');
});
it('keeps the author draft when a stale save conflicts', async () => {
  const { host, onClose, onSaved } = await render();
  api.save.mockRejectedValue(new Error('CONTENT_EDIT_CONFLICT'));
  await act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === 'save')!.click(); });
  expect(host.querySelector('[role=alert]')?.textContent).toBe('conflict');
  expect(host.querySelector('textarea')?.value).toBe('<p>Repeat the pattern.</p>');
  expect(onClose).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
});
