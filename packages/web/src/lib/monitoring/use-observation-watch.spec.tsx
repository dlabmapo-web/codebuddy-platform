// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { observationEvents } from '@cove/shared';
import { useObservationWatch } from './use-observation-watch';
const setup = vi.hoisted(() => {
  const scope = { academyId: '10000000-0000-4000-8000-000000000001', classId: '10000000-0000-4000-8000-000000000002', membershipId: '10000000-0000-4000-8000-000000000003' };
  const materialId = '10000000-0000-4000-8000-000000000004';
  const handlers = new Map<string, Set<(value: unknown) => void>>();
  const socket = { connected: true, on: vi.fn((name: string, fn: (value: unknown) => void) => {
    if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(fn);
  }), off: vi.fn((name: string, fn: (value: unknown) => void) => handlers.get(name)?.delete(fn)),
  timeout: vi.fn(), emit: vi.fn() };
  socket.timeout.mockReturnValue(socket);
  socket.emit.mockImplementation((name: string, _data: unknown, reply?: (error: null, value: unknown) => void) => {
    if (name === 'observation.start') reply?.(null, { ok: true, snapshot: { ...scope, materialId, type: 'WRITTEN_RESPONSE', path: null,
      source: 'selected', revision: 1, sequence: 1, state: 'ONLINE', work: { answer: '' }, observedAt: new Date().toISOString() } });
  });
  return { scope, materialId, handlers, socket, report: vi.fn() };
});
vi.mock('./use-monitoring-socket', () => ({ useMonitoringSocket: () => ({ socket: setup.socket, state: 'live', report: setup.report }) }));
afterEach(() => { setup.handlers.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('fences awareness and holds the student marker until an explicit clear or source lifecycle change', async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  function Harness() { const result = useObservationWatch(setup.scope); return <p data-pointer={result.awareness?.pointer ? 'visible' : 'none'}>{result.awareness?.focus ?? 'none'}</p>; }
  const receive = async (value: unknown) => act(() => { for (const handler of setup.handlers.get(observationEvents.awareness) ?? []) handler(value); });
  const event = { ...setup.scope, materialId: setup.materialId, source: 'selected', sequence: 2, focus: 'answer', pointer: { surface: 'answer', x: 0.5, y: 0.2 }, editor: null, sentAt: Date.now() };
  try {
    await act(() => root.render(<Harness />));
    await receive(event); expect(host.textContent).toBe('answer');
    await receive({ ...event, sequence: 1, focus: 'pdf' }); expect(host.textContent).toBe('answer');
    await receive({ ...event, classId: setup.materialId, sequence: 3, focus: 'pdf' }); expect(host.textContent).toBe('answer');
    await act(() => vi.advanceTimersByTimeAsync(4000));
    await receive({ ...event, sequence: 3, sentAt: Date.now() });
    await act(() => vi.advanceTimersByTimeAsync(1001)); expect(host.textContent).toBe('answer');
    expect(host.querySelector('p')?.dataset.pointer).toBe('visible');
    await act(() => vi.advanceTimersByTimeAsync(60000)); expect(host.textContent).toBe('answer');
    await receive({ ...event, source: 'old-tab', sequence: 4, sentAt: Date.now() }); expect(host.textContent).toBe('none');
    await receive({ ...event, sequence: 5, sentAt: Date.now() }); expect(host.textContent).toBe('answer');
    await receive({ ...event, sequence: 6, focus: null, pointer: null, sentAt: Date.now() }); expect(host.textContent).toBe('none');
    await receive({ ...event, sequence: 7, sentAt: Date.now() }); expect(host.textContent).toBe('answer');
    await act(() => { for (const handler of setup.handlers.get(observationEvents.snapshot) ?? []) handler({ ...setup.scope,
      materialId: setup.materialId, type: 'WRITTEN_RESPONSE', path: null, source: 'selected', revision: 2, sequence: 2,
      state: 'RECONNECTING', work: null, observedAt: new Date().toISOString() }); });
    expect(host.textContent).toBe('none');
    await act(() => { for (const handler of setup.handlers.get(observationEvents.snapshot) ?? []) handler({ ...setup.scope,
      materialId: setup.materialId, type: 'WRITTEN_RESPONSE', path: null, source: 'selected', revision: 3, sequence: 3,
      state: 'ONLINE', work: null, observedAt: new Date().toISOString() }); });
    expect(host.textContent).toBe('none');
    await receive({ ...event, sequence: 8, sentAt: Date.now() }); expect(host.textContent).toBe('answer');
    await act(() => { for (const handler of setup.handlers.get('disconnect') ?? []) handler(null); });
    expect(host.textContent).toBe('none');
  } finally { await act(() => root.unmount()); host.remove(); }
});

it('retains only five scoped last-observed workspaces and clears them on revocation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  function Harness() { const result = useObservationWatch(setup.scope); return <p>{JSON.stringify(result.lastWork)}</p>; }
  const receive = async (name: string, value: unknown) => act(() => { for (const handler of setup.handlers.get(name) ?? []) handler(value); });
  try {
    await act(() => root.render(<Harness />));
    for (let index = 1; index <= 6; index++) await receive(observationEvents.snapshot, { ...setup.scope,
      materialId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, type: 'WRITTEN_RESPONSE', path: null,
      source: 'selected', revision: 1, sequence: index + 1, state: 'ONLINE', work: { answer: String(index) }, observedAt: new Date().toISOString() });
    const retained = JSON.parse(host.textContent!);
    expect(Object.values(retained)).toEqual([2, 3, 4, 5, 6].map(answer => ({ answer: String(answer) })));
    await receive(observationEvents.snapshot, { ...setup.scope, materialId: null, type: null, path: null,
      source: 'selected', revision: 0, sequence: 9, state: 'ONLINE', work: null, observedAt: new Date().toISOString() });
    expect(JSON.parse(host.textContent!)).toEqual(retained);
    await receive('access.revoked', { classId: setup.scope.classId, studentMembershipId: setup.scope.membershipId });
    expect(host.textContent).toBe('{}');
  } finally { await act(() => root.unmount()); host.remove(); }
});
