// @vitest-environment happy-dom
import React, { act, useCallback, useLayoutEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { monitoringClientEvents } from '@cove/shared';
import { nextConnectionState, type MonitoringConnectionState } from './connection';
import { useLiveWorkspace } from './use-live-workspace';

const setup = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = { connected: true, on: vi.fn((name: string, fn: (...args: unknown[]) => void) => {
    if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(fn);
  }), off: vi.fn((name: string, fn: (...args: unknown[]) => void) => handlers.get(name)?.delete(fn)), emit: vi.fn() };
  return { socket, handlers };
});
vi.mock('./use-monitoring-socket', () => ({ useMonitoringSocket: () => {
  const [state, setState] = useState<MonitoringConnectionState>('live');
  const report = useCallback((event: Parameters<typeof nextConnectionState>[1]) => setState(current => nextConnectionState(current, event)), []);
  return { socket: setup.socket, state, report };
} }));
vi.mock('./awareness/use-awareness', () => ({ useAwareness: () => ({ remote: { pointer: null }, publishCursor: vi.fn() }) }));

const academyId = '10000000-0000-4000-8000-000000000001';
const classId = '10000000-0000-4000-8000-000000000002';
const membershipId = '10000000-0000-4000-8000-000000000003';
const materialId = '10000000-0000-4000-8000-000000000004';
const draftId = '10000000-0000-4000-8000-000000000005';
const available = { materialId, source: 'student-source-1' };
type Hint = Parameters<typeof useLiveWorkspace>[0]['availableCode'];
type Result = ReturnType<typeof useLiveWorkspace>;
let current: Result;
let root: Root;
let host: HTMLDivElement;
let grant = false;
let refusal = 'MONITORING_STUDENT_UNAVAILABLE';
let syncReply: (() => void) | null;
let server: Y.Doc;

function Harness({ hint }: { hint: Hint }) {
  const result = useLiveWorkspace({ academyId, classId, studentMembershipId: membershipId, autoEdit: true, availableCode: hint });
  useLayoutEffect(() => { current = result; });
  return <p>{result.state}:{result.canEditCode ? 'editable' : 'locked'}</p>;
}
const render = (hint: Hint = null) => act(() => root.render(<Harness hint={hint} />));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const starts = () => setup.socket.emit.mock.calls.filter(([event]) => event === monitoringClientEvents.watchStart).length;

beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setup.socket.connected = true; grant = false; refusal = 'MONITORING_STUDENT_UNAVAILABLE'; syncReply = null;
  server = new Y.Doc(); server.getText('code').insert(0, 'print(42)');
  setup.socket.emit.mockImplementation((event: string, payload: { sessionId: string; eventId: string }, reply?: (ack: unknown) => void) => {
    if (event === monitoringClientEvents.watchStart) reply?.(grant
      ? { ok: true, eventId: payload.eventId, data: { draftId, materialId, visitId: crypto.randomUUID(), sessionId: payload.sessionId, generation: starts(), mode: 'HELPING' } }
      : { ok: false, eventId: payload.eventId, code: refusal });
    if (event === monitoringClientEvents.documentSync) syncReply = () => reply?.({ ok: true, eventId: payload.eventId,
      data: { draftId, update: Y.encodeStateAsUpdate(server), stateVector: Y.encodeStateVector(server) } });
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove(); server.destroy();
  setup.handlers.clear(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it('reattaches after a late matching availability hint, then waits for the exact document sync', async () => {
  await render(); await advance(7001); expect(starts()).toBe(4);
  expect(current.denied).toBe('MONITORING_STUDENT_UNAVAILABLE');
  grant = true; await render(available);
  expect(starts()).toBe(5); expect(current.canEditCode).toBe(false);
  expect(current.state).toBe('resynchronizing');
  await act(() => syncReply!());
  expect(current.canEditCode).toBe(true); expect(current.text.toString()).toBe('print(42)');
  await render({ ...available }); await advance(60000);
  expect(starts()).toBe(5); expect(current.canEditCode).toBe(true);
});

it('bounds recovery for an already available target and rearms only on a new source or return', async () => {
  await render(available); await advance(7001); await advance(7001); expect(starts()).toBe(8);
  await render({ ...available }); await advance(60000); expect(starts()).toBe(8);
  await render({ ...available, source: 'student-source-2' }); await advance(7001); expect(starts()).toBe(12);
  await render(null); await render({ ...available, source: 'student-source-2' });
  await advance(7001); expect(starts()).toBe(16);
});

it.each(['MONITORING_ACCESS_DENIED', 'MONITORING_REFRESH_REQUIRED'])('does not recover a terminal %s refusal', async code => {
  refusal = code; await render(); await render(available); await advance(60000);
  expect(starts()).toBe(1); expect(current.canEditCode).toBe(false);
});

it('leaves unrelated reading, disconnected sockets and student switches alone', async () => {
  await render(); await advance(7001); expect(starts()).toBe(4);
  await render(null); await advance(30000); expect(starts()).toBe(4);
  setup.socket.connected = false; await render(available); expect(starts()).toBe(4);
  setup.socket.connected = true;
  await act(async () => { await current.prepareStudentSwitch(); });
  await render({ ...available, source: 'new-source' }); expect(starts()).toBe(4);
});

it('cancels unavailable retries on unmount', async () => {
  await render(); expect(starts()).toBe(1);
  await act(() => root.render(null)); await advance(60000); expect(starts()).toBe(1);
});

it('ignores a document-sync acknowledgement after the workspace unmounts', async () => {
  grant = true; await render(available);
  const late = syncReply!; const doc = current.doc;
  await act(() => root.render(null));
  await act(() => late());
  expect(doc.isDestroyed).toBe(true);
  expect(current.canEditCode).toBe(false);
});

it('preserves unacknowledged edits instead of starting availability recovery over a blocked buffer', async () => {
  grant = true; await render(); await act(() => syncReply!());
  await act(() => current.text.insert(current.text.length, '\n# unsent teacher edit'));
  setup.socket.connected = false;
  await act(() => { for (const handler of setup.handlers.get('disconnect') ?? []) handler(); });
  grant = false; setup.socket.connected = true;
  await act(() => { for (const handler of setup.handlers.get('connect') ?? []) handler(); });
  await advance(7001);
  expect(current.pendingRecovery).toBe('blocked');
  const attempts = starts();
  await render(available); await advance(60000);
  expect(starts()).toBe(attempts);
  expect(current.text.toString()).toContain('# unsent teacher edit');
  expect(current.canEditCode).toBe(false);
});
