import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { TurtleUsageRecorder, usageBufferLimit } from './usage-recorder.js';

const academyId = '10000000-0000-4000-8000-000000000001';
const grant = { academyId, device: 'a'.repeat(32), hash: 'f'.repeat(64) };
const create = () => {
  const $executeRaw = vi.fn().mockResolvedValue(1);
  return { $executeRaw, recorder: new TurtleUsageRecorder({ $executeRaw } as unknown as PrismaService) };
};

describe('turtle usage recorder', () => {
  it('writes nothing until flushed and merges one device into one row', async () => {
    const { recorder, $executeRaw } = create();
    recorder.record(grant, 'entry'); recorder.record(grant, 'run'); recorder.record(grant, 'seen');
    expect($executeRaw).not.toHaveBeenCalled();
    await recorder.flush();
    expect($executeRaw).toHaveBeenCalledTimes(1);
    expect($executeRaw.mock.calls[0]![0].values).toEqual([academyId, expect.any(Date), grant.device, 1, 1, expect.any(Date)]);
    await recorder.flush();
    expect($executeRaw).toHaveBeenCalledTimes(1);
  });
  it('ignores the shared code and falls back to the grant for an older entry', async () => {
    const { recorder, $executeRaw } = create();
    recorder.record({ ...grant, academyId: undefined }, 'run');
    await recorder.flush();
    expect($executeRaw).not.toHaveBeenCalled();
    recorder.record({ ...grant, device: undefined }, 'run');
    await recorder.flush();
    expect($executeRaw.mock.calls[0]![0].values[2]).toBe('f'.repeat(32));
  });
  it('keeps a failed write, with what arrived meanwhile', async () => {
    const { recorder, $executeRaw } = create();
    $executeRaw.mockImplementationOnce(async () => { recorder.record(grant, 'run'); throw new Error('database away'); });
    recorder.record(grant, 'run');
    await recorder.flush();
    await recorder.flush();
    expect($executeRaw.mock.calls[1]![0].values[4]).toBe(2);
  });
  it('writes large bursts in batches and bounds its memory', async () => {
    const { recorder, $executeRaw } = create();
    for (let i = 0; i < usageBufferLimit + 50; i++) recorder.record({ ...grant, device: i.toString(16).padStart(32, '0') }, 'run');
    await recorder.flush();
    expect($executeRaw).toHaveBeenCalledTimes(usageBufferLimit / 500);
  });
  it('flushes on shutdown', async () => {
    const { recorder, $executeRaw } = create();
    recorder.record(grant, 'entry');
    await recorder.onModuleDestroy();
    expect($executeRaw).toHaveBeenCalledTimes(1);
  });
});
