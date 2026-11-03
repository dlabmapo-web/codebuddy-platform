// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { observationEvents } from '@cove/shared';
import { StudentMaterialPointers } from './student-material-pointers';
const setup = vi.hoisted(() => {
  const scope = { academyId: '10000000-0000-4000-8000-000000000001', classId: '10000000-0000-4000-8000-000000000002',
    membershipId: '10000000-0000-4000-8000-000000000003', materialId: '10000000-0000-4000-8000-000000000004' };
  const handlers = new Map<string, (value: unknown) => void>();
  return { scope, handlers, socket: { on: (event: string, fn: (value: unknown) => void) => handlers.set(event, fn), off: (event: string) => handlers.delete(event) } };
});
vi.mock('@/lib/monitoring/student-presence', () => ({ useStudentPresence: () => ({ socket: setup.socket, academyId: setup.scope.academyId }) }));
vi.mock('./use-observation-translation', () => ({ useObservationTranslation: () => ({ t: () => 'Teacher' }) }));
vi.mock('./material-mouse-pointer', () => ({ MaterialMousePointer: ({ awareness }: { awareness: { pointer: unknown } }) => awareness.pointer ? <span>Teacher pointer</span> : null }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setup.handlers.clear(); });
it('expires each teacher independently after three seconds and ignores stale or foreign frames', async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const event = { ...setup.scope, peerId: 'teacher:a', generation: 1, source: 'source', sequence: 1, pointer: { surface: 'answer', x: 0.5, y: 0.5 }, editor: null, focus: 'answer', sentAt: Date.now() };
  const receive = (data: unknown) => act(() => setup.handlers.get(observationEvents.teacherAwareness)?.(data));
  try {
    await act(() => root.render(<StudentMaterialPointers materialId={setup.scope.materialId} classId={setup.scope.classId} />));
    await receive(event); expect(host.querySelectorAll('span')).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    await receive({ ...event, peerId: 'teacher:b', sentAt: Date.now() }); expect(host.querySelectorAll('span')).toHaveLength(2);
    await act(() => vi.advanceTimersByTimeAsync(1001)); expect(host.querySelectorAll('span')).toHaveLength(1);
    await receive({ ...event, sentAt: Date.now() }); expect(host.querySelectorAll('span')).toHaveLength(1);
    await receive({ ...event, materialId: setup.scope.membershipId, sequence: 2, sentAt: Date.now() });
    await act(() => vi.advanceTimersByTimeAsync(2000)); expect(host.querySelectorAll('span')).toHaveLength(0);
  } finally { await act(() => root.unmount()); host.remove(); }
});
