// @vitest-environment happy-dom
import React, { Activity, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { monitoringClientEvents, monitoringServerEvents } from '@cove/shared';
import { useStudentMonitoring } from './use-student-monitoring';
const setup = vi.hoisted(() => {
  const academyId = '10000000-0000-4000-8000-000000000001', classId = '10000000-0000-4000-8000-000000000002';
  const materialId = '10000000-0000-4000-8000-000000000003', draftId = '10000000-0000-4000-8000-000000000004';
  const handlers = new Map<string, Set<(value: unknown) => void>>();
  const socket = { connected: true, on: vi.fn((name: string, fn: (value: unknown) => void) => { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(fn); }),
    off: vi.fn((name: string, fn: (value: unknown) => void) => handlers.get(name)?.delete(fn)), timeout: vi.fn(), emit: vi.fn() };
  socket.timeout.mockReturnValue(socket);
  return { academyId, classId, materialId, draftId, handlers, socket, binding: vi.fn((..._args: unknown[]) => ({ destroy: vi.fn() })), open: vi.fn(() => () => {}), mark: vi.fn() };
});
vi.mock('./student-presence', () => ({ useStudentPresence: () => ({ socket: setup.socket, academyId: setup.academyId, state: 'live', setOpenMaterial: setup.open, markActive: setup.mark }) }));
vi.mock('./awareness/use-awareness', () => ({ useAwareness: () => ({ peers: [], remote: { pointer: null, cursor: null } }) }));
vi.mock('./yjs-monaco', () => ({ bindYTextToMonaco: setup.binding }));
vi.mock('./use-terminal-mirror-publisher', () => ({ useTerminalMirrorPublisher: () => {} }));
afterEach(() => { setup.handlers.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it.each([false, true])('reacquires a restored coding page and preserves only an unsaved handoff (%s)', async hasLocalEdits => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const serverDoc = new Y.Doc(); serverDoc.getText('code').insert(0, 'print(42)');
  setup.socket.emit.mockImplementation((name: string, _data: unknown, reply?: (...args: unknown[]) => void) => {
    if (name === monitoringClientEvents.studentBindingFetch) reply?.(null, { ok: true, data: { classId: setup.classId, studentMembershipId: setup.academyId,
      materialId: setup.materialId, draftId: setup.draftId, indicator: 'HELPING', startedAt: new Date().toISOString() } });
    if (name === monitoringClientEvents.documentSync) for (const handler of setup.handlers.get(monitoringServerEvents.documentSynced) ?? []) handler({ draftId: setup.draftId,
      update: Y.encodeStateAsUpdate(serverDoc), stateVector: Y.encodeStateVector(serverDoc) });
  });
  const editor = { getModel: () => ({}), onDidChangeCursorSelection: () => ({ dispose() {} }), onDidChangeModelContent: () => ({ dispose() {} }) };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const terminal = {} as Parameters<typeof useStudentMonitoring>[0]['terminal'];
  function Harness() {
    const state = useStudentMonitoring({ classId: setup.classId, courseId: setup.academyId, materialId: setup.materialId, ready: true, hasLocalEdits, teacherLabel: 'Teacher', terminal });
    useEffect(() => state.registerEditor(editor as never), [state.registerEditor]);
    return <button onClick={state.retire}>{state.phase}</button>;
  }
  try {
    await act(() => root.render(<Activity mode="visible"><Harness /></Activity>));
    expect(host.textContent).toBe('bound'); expect(setup.binding).toHaveBeenCalledTimes(1);
    expect(setup.binding.mock.calls[0]?.[2]).toMatchObject({ seed: hasLocalEdits ? 'model' : 'text' });
    await act(() => host.querySelector('button')!.click());
    await act(() => root.render(<Activity mode="hidden"><Harness /></Activity>));
    await act(() => root.render(<Activity mode="visible"><Harness /></Activity>));
    expect(host.textContent).toBe('bound'); expect(setup.binding).toHaveBeenCalledTimes(2);
    expect(setup.binding.mock.calls[1]?.[2]).toMatchObject({ seed: 'text' });
  } finally { await act(() => root.unmount()); host.remove(); serverDoc.destroy(); }
});
