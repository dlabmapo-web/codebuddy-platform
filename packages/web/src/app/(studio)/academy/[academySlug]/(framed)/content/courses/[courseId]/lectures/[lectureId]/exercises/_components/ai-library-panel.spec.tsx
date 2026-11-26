// @vitest-environment happy-dom
import type { AiLibraryItemView, AiLibraryView } from '@cove/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AiLibraryPanel } from './ai-library-panel';

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), regenerate: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { aiAssistant: { getLibrary: api.get, updateLibraryItem: api.update, regenerateLibrary: api.regenerate } } }));
vi.mock('@/lib/api-errors', () => ({ toApiError: (error: { code?: string }) => ({ code: error.code }) }));
vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const target = { academyId: '10000000-0000-4000-8000-000000000001', courseId: '10000000-0000-4000-8000-000000000002', materialId: '10000000-0000-4000-8000-000000000003' };
const item = (over: Partial<AiLibraryItemView>): AiLibraryItemView => ({
  id: '10000000-0000-4000-8000-000000000004', kind: 'HINT', position: 1, label: '', textKo: '힌트', textEn: 'A hint', wrongProgram: null,
  origin: 'AI', state: 'ACTIVE', rejectReason: null, reports: 0, version: 1, ...over,
});
const view = (over: Partial<AiLibraryView> = {}): AiLibraryView => ({
  enabled: true, blocked: null, state: 'READY', errorCode: null, current: true,
  items: [
    item({}),
    item({ id: '10000000-0000-4000-8000-000000000005', kind: 'FEEDBACK', label: 'off by one', textKo: '끝 값', textEn: 'The end value', wrongProgram: 'print(1)' }),
    item({ id: '10000000-0000-4000-8000-000000000006', kind: 'FEEDBACK', label: 'dropped', state: 'REJECTED', rejectReason: 'PASSES_ALL', textKo: '빠짐' }),
  ],
  correctPrograms: [{ approach: 'loop', code: 'print(2)' }],
  mistakes: { failures: 0, students: 0, pythonErrors: [], library: [], unmatched: 0 },
  ...over,
});

let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  api.get.mockResolvedValue(view());
});
afterEach(async () => { await act(() => root.unmount()); client.clear(); host.remove(); vi.resetAllMocks(); });

const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await new Promise((done) => setTimeout(done, 0)); });
const button = (name: string, scope: ParentNode = host) => [...scope.querySelectorAll('button')].find((one) => one.textContent === name) ?? null;
const press = async (element: HTMLElement | null) => { await act(async () => { element!.click(); }); await settle(); };
async function show(editable = true) {
  await act(() => root.render(<QueryClientProvider client={client}><AiLibraryPanel {...target} editable={editable} /></QueryClientProvider>));
}

it('reads nothing while closed, then shows the library and what the checks dropped', async () => {
  await show();
  await settle();
  expect(api.get).not.toHaveBeenCalled();
  await press(button('open'));
  expect(api.get).toHaveBeenCalledWith(target);
  expect(host.querySelectorAll('[data-testid="ai-library-item"]')).toHaveLength(2);
  expect(host.textContent).toContain('state.READY');
  expect(host.textContent).toContain('reason.other');
  expect(host.textContent).toContain('print(1)');
  expect(host.textContent).toContain('print(2)');
});

it('saves an edit with the version it was read at', async () => {
  api.update.mockResolvedValue(view({ items: [item({ textEn: 'Better', origin: 'STAFF', version: 2 })] }));
  await show();
  await press(button('open'));
  await press(button('edit'));
  const english = host.querySelector<HTMLTextAreaElement>('textarea[lang="en"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(english, ' Better ');
    english.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await press(button('save'));
  expect(api.update).toHaveBeenCalledWith({ ...target, itemId: item({}).id, expectedVersion: 1, textKo: '힌트', textEn: 'Better' });
  expect(host.textContent).toContain('origin.STAFF');
});

it('hides an item, and refreshes instead of overwriting when someone else changed it', async () => {
  api.update.mockRejectedValue({ code: 'CONTENT_EDIT_CONFLICT' });
  await show();
  await press(button('open'));
  await press(button('hide'));
  expect(api.update.mock.calls[0]![0]).toMatchObject({ state: 'HIDDEN', expectedVersion: 1 });
  expect(host.textContent).toContain('conflict');
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('asks for a new library and shows that it is waiting', async () => {
  api.regenerate.mockResolvedValue(view({ state: 'WAITING', items: [] }));
  await show();
  await press(button('open'));
  await press(button('regenerate'));
  expect(api.regenerate).toHaveBeenCalledWith(target);
  expect(host.textContent).toContain('state.WAITING');
  expect(button('regenerate')).toBeNull();
});

it('tells the teacher when their own solution fails, and that old items are out of date', async () => {
  api.get.mockResolvedValue(view({ state: 'FAILED', errorCode: 'SOLUTION_FAILS', current: false }));
  await show();
  await press(button('open'));
  expect(host.textContent).toContain('error.SOLUTION_FAILS');
  expect(host.textContent).toContain('stale');
});

it('is read-only for staff who may not edit the problem', async () => {
  await show(false);
  await press(button('open'));
  for (const name of ['edit', 'hide', 'regenerate']) expect(button(name)).toBeNull();
});
