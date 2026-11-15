// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CollaborationPointer } from '@cove/shared';
import { RemotePointer } from './remote-pointer';

const geometry = vi.hoisted(() => ({ project: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/monitoring/awareness/code-pointer', () => ({
  codeGeometryEvent: 'cove-code-geometry', projectCodePointer: geometry.project,
}));

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let resizeSubscriptions: number;
let resizeDisconnects: number;
let host: HTMLDivElement;
let surface: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const pointer: CollaborationPointer = { surface: 'video', space: 'surface', material: 'a', x: 0.2, y: 0.3 };
const marker = () => document.querySelector<HTMLElement>('[data-testid="peer-pointer"]');
const render = (value: CollaborationPointer | null, extra: Partial<React.ComponentProps<typeof RemotePointer>> = {}) =>
  act(() => root.render(<RemotePointer name="Peer" materialId="a" sourceMaterialId="a" pointer={value} {...extra} />));
const flushFrames = () => act(() => {
  const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0));
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frames = new Map(); nextFrame = 0; resizeSubscriptions = 0; resizeDisconnects = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback); return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', class {
    observe() { resizeSubscriptions++; }
    disconnect() { resizeDisconnects++; }
  });
  geometry.project.mockReset();
  host = document.createElement('div'); surface = document.createElement('div');
  surface.setAttribute('data-collab-surface', 'video');
  surface.getBoundingClientRect = () => ({ left: 100, top: 100, width: 600, height: 300 } as DOMRect);
  document.body.append(host, surface); root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove(); surface.remove(); vi.unstubAllGlobals();
});

it('keeps the same arrow and label through successive valid surface movements before any queued frame', async () => {
  await render(pointer); await flushFrames();
  const original = marker(), label = original?.querySelector('span');
  expect(original).not.toBeNull();
  for (const x of [0.3, 0.5, 0.7]) {
    await render({ ...pointer, x });
    expect(marker()).toBe(original);
    expect(marker()?.querySelector('span')).toBe(label);
    expect(parseFloat(marker()!.style.left)).toBeCloseTo(100 + x * 600 - 3.75);
  }
});

it('updates anchored positions continuously when the target row changes', async () => {
  const anchor = document.createElement('div'); anchor.setAttribute('data-collab-anchor', 'row');
  anchor.getBoundingClientRect = () => ({ left: 120, top: 130, width: 200, height: 40 } as DOMRect);
  surface.append(anchor);
  await render({ ...pointer, anchor: { key: 'row', x: 0.2, y: 0.5 } }); await flushFrames();
  const original = marker(); expect(original).not.toBeNull();
  await render({ ...pointer, anchor: { key: 'row', x: 0.8, y: 0.5 } });
  expect(marker()).toBe(original);
  expect(parseFloat(marker()!.style.left)).toBeCloseTo(120 + 0.8 * 200 - 3.75);
});

it('preserves the collaborative editor arrow while projecting each new code sample', async () => {
  geometry.project.mockImplementation((value: CollaborationPointer) => ({ left: value.x * 500, top: 200 }));
  const codePointer = { ...pointer, surface: 'editor' as const };
  await render(codePointer); await flushFrames();
  const original = marker(); expect(original).not.toBeNull();
  await render({ ...codePointer, x: 0.6 });
  expect(marker()).toBe(original);
  expect(parseFloat(marker()!.style.left)).toBeCloseTo(300 - 3.75);
});

it.each(['position', 'project'] as const)('updates %s inputs before paint even when pointer coordinates stay the same', async mode => {
  const projection = (left: number) => mode === 'position' ? { position: { left, top: 200 } } : { project: () => ({ left, top: 200 }) };
  await render(pointer, projection(200)); await flushFrames();
  const original = marker(); expect(original).not.toBeNull();
  await render(pointer, projection(350));
  expect(marker()).toBe(original);
  expect(parseFloat(marker()!.style.left)).toBeCloseTo(350 - 3.75);
});

it('does not retain an arrow when a current projection fails, and can recover', async () => {
  await render(pointer, { project: () => ({ left: 200, top: 200 }) }); await flushFrames();
  expect(marker()).not.toBeNull();
  await render(pointer, { project: () => null });
  expect(marker()).toBeNull();
  expect(document.querySelector('[data-testid="peer-pointer-elsewhere"]')).not.toBeNull();
  await render(pointer, { project: () => ({ left: 220, top: 210 }) });
  expect(marker()).not.toBeNull();
});

it('does not animate an old snapshot file placement into another file', async () => {
  await render(pointer, { projectionContext: 'main.py', position: { left: 200, top: 200 } }); await flushFrames();
  const original = marker(); expect(original).not.toBeNull();
  await render(pointer, { projectionContext: 'other.py', position: { left: 350, top: 210 } });
  expect(marker()).not.toBeNull(); expect(marker()).not.toBe(original);
  expect(parseFloat(marker()!.style.left)).toBeCloseTo(350 - 3.75);
});

it('coalesces geometry events and uses the latest committed position, without rebuilding subscriptions for movement', async () => {
  await render(pointer); await flushFrames();
  const subscriptions = resizeSubscriptions, disconnects = resizeDisconnects;
  await act(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('resize')); });
  expect(frames.size).toBe(1);
  await render({ ...pointer, x: 0.8 });
  expect(resizeSubscriptions).toBe(subscriptions);
  expect(resizeDisconnects).toBe(disconnects);
  await flushFrames();
  expect(parseFloat(marker()!.style.left)).toBeCloseTo(100 + 0.8 * 600 - 3.75);
  // An unchanged measurement settles; the overlay's own mutations do not keep queuing frames.
  await act(() => new Promise(resolve => setTimeout(resolve, 10)));
  await flushFrames();
  await act(() => new Promise(resolve => setTimeout(resolve, 10)));
  expect(frames.size).toBe(0);
});

it.each(['clear', 'different-material', 'lost-source', 'unmount'] as const)('cannot restore a marker from queued geometry after %s', async reason => {
  await render(pointer); await flushFrames(); expect(marker()).not.toBeNull();
  await act(() => window.dispatchEvent(new Event('resize')));
  if (reason === 'unmount') await act(() => root.render(null));
  else if (reason === 'clear') await render(null);
  else await render(pointer, reason === 'different-material' ? { materialId: 'b' } : { sourceMaterialId: null });
  expect(marker()).toBeNull(); await flushFrames(); expect(marker()).toBeNull();
  expect(document.querySelector('[data-testid="peer-pointer-elsewhere"]')).toBeNull();
});
