import { expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { ClassTransportPool } from './class-transport-pool';

it('retains a bounded transport per channel across repeated student/workspace consumers', async () => {
  const created: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  const create = vi.fn(async () => { const socket = { close: vi.fn() }; created.push(socket); return socket as unknown as Socket; });
  const pool = new ClassTransportPool(create);
  const first = await pool.get('class');
  expect(await pool.get('class')).toBe(first);
  const observation = await pool.get('observation');
  for (let i = 0; i < 20; i++) expect(await pool.get('observation')).toBe(observation);
  expect(await pool.get('workspace')).not.toBe(observation);
  expect(create).toHaveBeenCalledTimes(3);
  expect(created.every(socket => socket.close.mock.calls.length === 0)).toBe(true);
  pool.close(); await Promise.resolve();
  expect(created.every(socket => socket.close.mock.calls.length === 1)).toBe(true);
  await expect(pool.get('class')).rejects.toThrow('Class workspace closed');
});

it('closes a late authentication result after leaving the class, without leaking a connection', async () => {
  let finish!: (socket: Socket) => void;
  const pool = new ClassTransportPool(() => new Promise(resolve => { finish = resolve; }));
  const opening = pool.get('workspace');
  pool.close();
  const socket = { close: vi.fn() };
  finish(socket as unknown as Socket);
  await opening; await Promise.resolve();
  expect(socket.close).toHaveBeenCalledTimes(1);
});
