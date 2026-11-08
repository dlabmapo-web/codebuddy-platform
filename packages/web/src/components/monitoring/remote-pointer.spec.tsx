// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RemotePointer } from './remote-pointer';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.unstubAllGlobals());
it('places a pointer when its media surface mounts after the awareness frame', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const surface = document.createElement('div'); surface.setAttribute('data-collab-surface', 'video');
  surface.getBoundingClientRect = () => ({ left: 100, top: 100, width: 600, height: 300 } as DOMRect);
  try {
    await act(() => root.render(<RemotePointer name="Student" pointer={{ surface: 'video', space: 'surface', material: null, x: 0.5, y: 0.5 }} />));
    await act(() => new Promise(resolve => setTimeout(resolve, 40)));
    expect(document.querySelector('[data-testid="peer-pointer"]')).toBeNull();
    await act(async () => { document.body.append(surface); await new Promise(resolve => setTimeout(resolve, 60)); });
    expect(document.querySelector('[data-testid="peer-pointer"]')).not.toBeNull();
  } finally { await act(() => root.unmount()); surface.remove(); host.remove(); }
});

it('places a media anchor carried on the surface element itself', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const surface = document.createElement('video'); surface.setAttribute('data-collab-surface', 'video'); surface.setAttribute('data-collab-anchor', 'video:player');
  surface.getBoundingClientRect = () => ({ left: 100, top: 100, width: 600, height: 300 } as DOMRect);
  document.body.append(surface);
  try {
    await act(() => root.render(<RemotePointer name="Student" pointer={{ surface: 'video', space: 'surface', material: null, x: 0.5, y: 0.5, anchor: { key: 'video:player', x: 0.5, y: 0.5 } }} />));
    await act(() => new Promise(resolve => setTimeout(resolve, 40)));
    expect(document.querySelector('[data-testid="peer-pointer"]')).not.toBeNull();
  } finally { await act(() => root.unmount()); surface.remove(); host.remove(); }
});
