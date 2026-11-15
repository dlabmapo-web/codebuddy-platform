// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { ContinueLearning } from './continue-learning';
const api = vi.hoisted(() => ({ list: vi.fn(), discard: vi.fn() }));
vi.mock('@/i18n', () => ({ useLocale: () => 'en' }));
vi.mock('@/lib/orpc', () => ({ orpc: { learn: { listDrafts: api.list, discardDraft: api.discard } } }));
vi.mock('../../courses/_components/continue-panel', () => ({ ContinuePanel: ({ drafts, discard }: { drafts: Array<{ materialId: string; exerciseTitle: string }>; discard: (id: string) => void }) => <div>{drafts.map(draft => <button key={draft.materialId} onClick={() => discard(draft.materialId)}>{draft.exerciseTitle}</button>)}</div> }));
it('uses the server seed without a hydration read and restores a failed optimistic discard', async () => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.list.mockReset().mockImplementation(() => new Promise(() => {}));
  api.discard.mockReset().mockRejectedValue(new Error('offline'));
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const drafts = [{ materialId: 'problem', exerciseTitle: 'Addition', courseId: 'course', courseTitle: 'Python', lineCount: 1, updatedAt: '2026-11-15T00:00:00Z' }];
  try {
    await act(async () => root.render(<React.StrictMode><QueryClientProvider client={cache}><ContinueLearning academyId="academy" initialDrafts={drafts} serverReadToken={crypto.randomUUID()} /></QueryClientProvider></React.StrictMode>));
    expect(api.list).not.toHaveBeenCalled();
    await act(async () => host.querySelector('button')!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(api.discard).toHaveBeenCalledWith({ academyId: 'academy', materialId: 'problem' });
    expect(host.textContent).toContain('Addition'); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); cache.clear(); host.remove(); vi.unstubAllGlobals(); }
});
