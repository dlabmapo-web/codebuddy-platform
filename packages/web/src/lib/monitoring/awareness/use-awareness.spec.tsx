// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { monitoringClientEvents, monitoringServerEvents, type CollaborationCursor } from '@cove/shared';
import { useAwareness } from './use-awareness';
import { staysUntilCleared } from './pointer-lifecycle';

afterEach(() => vi.unstubAllGlobals());
it('clears outgoing awareness while previewing but keeps receiving the watched student', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const handlers = new Map<string, (data: unknown) => void>();
  const emit = vi.fn();
  const socket = { emit, volatile: { emit }, on: (event: string, handler: (data: unknown) => void) => handlers.set(event, handler), off: (event: string) => handlers.delete(event) };
  let awareness!: ReturnType<typeof useAwareness>;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const surface = document.createElement('div'); surface.setAttribute('data-collab-surface', 'header');
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 100 } as DOMRect);
  document.body.append(surface);
  function Harness({ enabled }: { enabled: boolean }) {
    awareness = useAwareness({ draftId: 'draft', peerOrigin: 'STUDENT', remoteCursor: staysUntilCleared,
      remotePointer: staysUntilCleared, socket: socket as never, publishEnabled: enabled });
    return <span>{awareness.remote.pointer?.surface}</span>;
  }
  const move = () => act(() => surface.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: 25 })));
  try {
    await act(() => root.render(<Harness enabled />));
    await move(); expect(emit.mock.lastCall?.[1].pointer).toMatchObject({ surface: 'header' });
    await act(() => root.render(<Harness enabled={false} />));
    expect(emit.mock.lastCall?.[1]).toMatchObject({ pointer: null, cursor: null, editorPointer: null });
    const count = emit.mock.calls.length;
    await move(); expect(emit).toHaveBeenCalledTimes(count);
    await act(() => awareness.publishCursor({ line: 1, column: 1 } as CollaborationCursor));
    expect(emit.mock.lastCall?.[1].cursor).toBeNull();
    await act(() => handlers.get(monitoringServerEvents.awarenessChanged)?.({ draftId: 'draft', origin: 'STUDENT',
      sequence: 1, cursor: null, pointer: { surface: 'header', space: 'surface', material: null, x: 0.5, y: 0.5 } }));
    expect(host.textContent).toBe('header');
    await act(() => root.render(<Harness enabled />));
    await move();
    await act(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect(emit.mock.lastCall?.[1].pointer).toMatchObject({ surface: 'header' });
    expect(emit.mock.calls.every(call => call[0] === monitoringClientEvents.awarenessUpdate)).toBe(true);
  } finally { await act(() => root.unmount()); surface.remove(); host.remove(); }
});
