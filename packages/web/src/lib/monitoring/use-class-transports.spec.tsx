// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { ClassTransportPool } from './class-transport-pool';
import { ClassTransportContext } from './class-monitoring-context';
import { useMonitoringSocket } from './use-monitoring-socket';
vi.mock('./socket', () => ({ createMonitoringSocket: vi.fn() }));
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

it('reuses the live transport on student switches and removes only the leaving consumer listeners', async () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    connected: true, recovered: false, close: vi.fn(), removeAllListeners: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); }),
    off: vi.fn((event: string, listener: (...args: unknown[]) => void) => listeners.get(event)?.delete(listener)),
  };
  const create = vi.fn(async () => socket as unknown as Socket);
  const pool = new ClassTransportPool(create);
  const transport = { classId: 'class', pool };
  function Watch({ student }: { student: string }) { const live = useMonitoringSocket({ classId: 'class', studentMembershipId: student }); return <p>{live.state}</p>; }
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  try {
    for (const student of ['one', 'two', 'one', 'two']) {
      await act(async () => root.render(<ClassTransportContext value={transport}><Watch key={student} student={student} /></ClassTransportContext>));
      expect(create).toHaveBeenCalledTimes(1);
      expect(listeners.get('connect')?.size).toBe(1);
      expect(socket.close).not.toHaveBeenCalled();
    }
    await act(async () => { for (const listener of listeners.get('access.revoked') ?? []) listener({ classId: 'class', studentMembershipId: 'one' }); });
    expect(host.textContent).not.toBe('revoked');
    await act(async () => { for (const listener of listeners.get('access.revoked') ?? []) listener({ classId: 'class', studentMembershipId: 'two' }); });
    expect(host.textContent).toBe('revoked');
    await act(async () => root.unmount());
    expect(listeners.get('connect')?.size).toBe(0);
    expect(socket.removeAllListeners).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
    pool.close(); await Promise.resolve();
    expect(socket.close).toHaveBeenCalledTimes(1);
  } finally { pool.close(); host.remove(); }
});
