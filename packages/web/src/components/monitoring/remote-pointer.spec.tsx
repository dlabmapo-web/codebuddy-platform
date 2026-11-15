// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RemotePointer } from './remote-pointer';
import { ObservationPresence } from './observation-presence';
import { HistoryPresentationContext } from '@/lib/monitoring/history-presentation';
import type { CollaborationPointer, ObservationAwarenessEvent } from '@cove/shared';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.unstubAllGlobals());
it('places a pointer when its media surface mounts after the awareness frame', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const surface = document.createElement('div'); surface.setAttribute('data-collab-surface', 'video');
  surface.getBoundingClientRect = () => ({ left: 100, top: 100, width: 600, height: 300 } as DOMRect);
  try {
    await act(() => root.render(<RemotePointer name="Student" materialId="a" sourceMaterialId="a" pointer={{ surface: 'video', space: 'surface', material: null, x: 0.5, y: 0.5 }} />));
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
    await act(() => root.render(<RemotePointer name="Student" materialId="a" sourceMaterialId="a" pointer={{ surface: 'video', space: 'surface', material: null, x: 0.5, y: 0.5, anchor: { key: 'video:player', x: 0.5, y: 0.5 } }} />));
    await act(() => new Promise(resolve => setTimeout(resolve, 40)));
    expect(document.querySelector('[data-testid="peer-pointer"]')).not.toBeNull();
  } finally { await act(() => root.unmount()); surface.remove(); host.remove(); }
});

const pointer: CollaborationPointer = { surface: 'editor', space: 'surface', material: 'a', x: 0.5, y: 0.5 };
const markers = '[data-testid="peer-pointer"], [data-testid="peer-pointer-elsewhere"], [data-testid="peer-pointer-direction"]';
async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  return {
    render: (node: React.ReactNode) => act(() => root.render(node)),
    dispose: async () => { await act(() => root.unmount()); host.remove(); },
  };
}
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 40)));

it.each(['editor', 'statement', 'terminal', 'header', 'curriculum'] as const)(
  'hides a different material on %s before projecting, including after geometry events', async surface => {
    const view = await mount(); const project = vi.fn(() => null);
    try {
      await view.render(<RemotePointer name="Student" materialId="b" sourceMaterialId="a" pointer={{ ...pointer, surface }} project={project} />);
      await settle();
      await act(async () => {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('scroll'));
        const added = document.createElement('div'); document.body.append(added); added.remove();
      });
      await view.render(<RemotePointer name="Student" materialId="b" sourceMaterialId="a" pointer={{ ...pointer, surface, x: 0.8 }} project={project} />);
      await settle();
      expect(document.querySelector(markers)).toBeNull();
      expect(project).not.toHaveBeenCalled();
    } finally { await view.dispose(); }
  },
);

it.each([
  { materialId: null, sourceMaterialId: null, embedded: null },
  { materialId: 'a', sourceMaterialId: null, embedded: 'a' },
  { materialId: null, sourceMaterialId: 'a', embedded: 'a' },
  { materialId: 'a', sourceMaterialId: 'a', embedded: 'b' },
])('hides unknown or conflicting material context: %j', async context => {
  const view = await mount();
  try {
    await view.render(<RemotePointer name="Student" {...context} pointer={{ ...pointer, material: context.embedded }} position={{ left: 200, top: 200 }} />);
    await settle(); expect(document.querySelector(markers)).toBeNull();
  } finally { await view.dispose(); }
});

it.each(['arrow', 'fallback'] as const)('removes a cached %s immediately on navigation and resumes on return', async mode => {
  const view = await mount();
  const position = mode === 'arrow' ? { left: 200, top: 200 } : null;
  const node = (id: string) => <RemotePointer name="Student" materialId={id} sourceMaterialId="a" pointer={pointer} position={position} />;
  try {
    await view.render(node('a')); await settle();
    expect(document.querySelector(markers)).not.toBeNull();
    await view.render(node('b')); // No new pointer packet or geometry frame.
    expect(document.querySelector(markers)).toBeNull();
    await view.render(node('a')); await settle();
    expect(document.querySelector(markers)).not.toBeNull();
    await view.render(<RemotePointer name="Student" materialId="a" sourceMaterialId={null} pointer={pointer} position={position} />);
    expect(document.querySelector(markers)).toBeNull(); // Source lost/reconnecting.
  } finally { await view.dispose(); }
});

it('does not let an incompatible teacher hide another teacher or a cleared pointer reappear', async () => {
  const view = await mount();
  const node = (active: boolean) => <>
    <RemotePointer name="Valid teacher" materialId="a" sourceMaterialId="a" pointer={active ? pointer : null} position={{ left: 200, top: 200 }} />
    <RemotePointer name="Other teacher" materialId="a" sourceMaterialId="b" pointer={{ ...pointer, material: 'b' }} position={null} />
  </>;
  try {
    await view.render(node(true)); await settle();
    expect(document.querySelectorAll(markers)).toHaveLength(1);
    expect(document.querySelector(markers)?.textContent).toContain('Valid teacher');
    await view.render(node(false)); await settle();
    expect(document.querySelector(markers)).toBeNull();
  } finally { await view.dispose(); }
});

it('keeps live pointers hidden when saved work covers the workspace', async () => {
  const view = await mount();
  const node = (covered: boolean) => <HistoryPresentationContext.Provider value={{ covered, revoke: vi.fn(), setConnection: vi.fn(), open: vi.fn(), setMaterial: vi.fn() }}>
    <RemotePointer name="Student" materialId="a" sourceMaterialId="a" pointer={pointer} position={null} />
  </HistoryPresentationContext.Provider>;
  try {
    await view.render(node(false)); await settle(); expect(document.querySelector(markers)).not.toBeNull();
    await view.render(node(true)); expect(document.querySelector(markers)).toBeNull();
    await settle(); expect(document.querySelector(markers)).toBeNull();
  } finally { await view.dispose(); }
});

it('uses the observation envelope for surface pointers but rejects conflicting embedded identity', async () => {
  const view = await mount();
  const awareness: ObservationAwarenessEvent = {
    academyId: '10000000-0000-4000-8000-000000000001', classId: '10000000-0000-4000-8000-000000000002',
    membershipId: '10000000-0000-4000-8000-000000000003', materialId: 'a',
    source: 'source', sequence: 1, sentAt: Date.now(), editor: null, focus: 'answer',
    pointer: { surface: 'answer', space: 'surface', material: null, x: 0.5, y: 0.5 },
  };
  try {
    await view.render(<ObservationPresence name="Student" materialId="a" awareness={awareness} />);
    await settle(); expect(document.querySelector('[data-testid="peer-pointer-elsewhere"]')).not.toBeNull();
    await view.render(<ObservationPresence name="Student" materialId="b" awareness={awareness} />);
    expect(document.querySelector(markers)).toBeNull();
    await view.render(<ObservationPresence name="Student" materialId="a" awareness={{ ...awareness, pointer: { ...awareness.pointer!, material: 'b' } }} />);
    await settle(); expect(document.querySelector(markers)).toBeNull();
  } finally { await view.dispose(); }
});

it('preserves same-material off-screen direction controls and removes them on a material switch', async () => {
  const view = await mount();
  const surface = document.createElement('div'), canvas = document.createElement('div');
  surface.setAttribute('data-collab-surface', 'statement');
  canvas.setAttribute('data-collab-canvas', 'statement'); canvas.setAttribute('data-collab-material', 'a');
  surface.getBoundingClientRect = () => ({ left: 100, top: 100, width: 600, height: 300 } as DOMRect);
  canvas.getBoundingClientRect = () => ({ left: 100, top: 100, width: 600, height: 900 } as DOMRect);
  surface.append(canvas); document.body.append(surface);
  const canvasPointer: CollaborationPointer = { surface: 'statement', space: 'canvas', material: 'a', x: 0.5, y: 0.8 };
  try {
    await view.render(<RemotePointer name="Student" materialId="a" sourceMaterialId="a" pointer={canvasPointer} />);
    await settle(); expect(document.querySelector('[data-testid="peer-pointer-direction"]')).not.toBeNull();
    await view.render(<RemotePointer name="Student" materialId="b" sourceMaterialId="a" pointer={canvasPointer} />);
    expect(document.querySelector(markers)).toBeNull();
  } finally { await view.dispose(); surface.remove(); }
});
