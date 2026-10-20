// @vitest-environment happy-dom
import React, { act, Component, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { PdfCanvas } from './pdf-canvas';
import { pdfApi } from '@/lib/pdf-api';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/pdf-api', () => ({ pdfApi: { read: vi.fn() } }));
vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  // React-PDF's Suspense mode propagates failed loads to the page boundary.
  // The reader's callback mode must instead renew the URL inside the workspace.
  Document: function Document({ file, suspense = true, onLoadError, children }: {
    file: { url: string }; suspense?: boolean; onLoadError: () => void; children: React.ReactNode;
  }) {
    const notified = useRef(false);
    useEffect(() => {
      if (file.url === 'expired' && !notified.current) {
        notified.current = true;
        onLoadError();
      }
    }, [file.url, onLoadError]);
    if (file.url === 'expired') {
      if (suspense) throw new Error('PDF response expired');
      return <p>PDF loading failed</p>;
    }
    return <div>PDF ready{children}</div>;
  },
  Page: () => <div>PDF page</div>,
}));

class WorkspaceBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>Workspace failed</p> : this.props.children; }
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('renews a failed PDF without losing the surrounding code workspace', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const pdf = { pageCount: 2, originalFilename: 'lesson.pdf' };
  vi.mocked(pdfApi.read)
    .mockResolvedValueOnce({ url: 'expired', pdf } as never)
    .mockResolvedValue({ url: 'renewed', pdf } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() => root.render(<QueryClientProvider client={queryClient}>
      <WorkspaceBoundary><input aria-label="Code draft" defaultValue={'print("kept")'} />
        <PdfCanvas academyId="academy" materialId="pdf" />
      </WorkspaceBoundary>
    </QueryClientProvider>));
    await vi.waitFor(async () => {
      await act(async () => { await Promise.resolve(); });
      expect(host.textContent).toContain('PDF ready');
    });
    expect(pdfApi.read).toHaveBeenCalledTimes(2);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Code draft"]')?.value).toBe('print("kept")');
    expect(host.textContent).not.toContain('Workspace failed');
  } finally {
    await act(() => root.unmount()); queryClient.clear(); host.remove();
  }
});
