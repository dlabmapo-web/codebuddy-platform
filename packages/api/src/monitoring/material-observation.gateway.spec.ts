import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { monitoringWatchLease, observationEvents } from '@cove/shared';
import { MaterialObservationGateway } from './material-observation.gateway.js';
function setup() {
  const academyId = randomUUID(), classId = randomUUID(), membershipId = randomUUID(), materialId = randomUUID();
  const claim = { academyId, classId, studentMembershipId: membershipId, membershipId: randomUUID(), studentUserId: randomUUID() };
  const access = { requireStudentSelf: vi.fn().mockResolvedValue({ membershipId }), requireFeature: vi.fn(),
    requireTeacher: vi.fn().mockResolvedValue(claim), requireLiveWatch: vi.fn(), requireAssignedClass: vi.fn().mockResolvedValue(claim),
    requireMonitorableStudent: vi.fn().mockResolvedValue(claim) };
  const presence = { currentSource: vi.fn().mockResolvedValue({ socketGeneration: 'current', materialId, interruptedAt: null, visibility: 'VISIBLE', lastActivityAt: Date.now() }) };
  const prisma = { classEnrollment: { findFirst: vi.fn().mockResolvedValue({ classId }) }, material: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) } };
  const redis = { eval: vi.fn().mockResolvedValue(1), incr: vi.fn().mockResolvedValue(1), pexpire: vi.fn(), get: vi.fn() };
  const watches = { isAvailable: true, nextGeneration: vi.fn().mockResolvedValue(1), register: vi.fn().mockResolvedValue({ ok: true }),
    summarize: vi.fn().mockResolvedValue({ watcherCount: 1, revision: 1 }), end: vi.fn(), renew: vi.fn() };
  const visits = { start: vi.fn().mockResolvedValue({ id: randomUUID() }), end: vi.fn() };
  const gateway = new MaterialObservationGateway(prisma as never, access as never, presence as never, watches as never, visits as never, redis as never);
  const emit = vi.fn(); gateway.server = { to: vi.fn().mockReturnValue({ emit, volatile: { emit } }) } as never;
  const socket = { id: randomUUID(), connected: true, disconnected: false, data: { identity: {}, generation: 'current', limiter: { take: () => true } },
    emit: vi.fn(), join: vi.fn(), leave: vi.fn() };
  const input = { academyId, classId, materialId, revision: 1, work: {} };
  return { gateway, socket, input, prisma, presence, redis, watches, access, emit, scope: { academyId, classId, membershipId } };
}
describe('material observation authority', () => {
  it('forwards only the authenticated current source and drops stale pointer frames', async () => {
    const s = setup();
    Object.assign(s.socket.data, { student: { academyId: s.scope.academyId, membershipId: s.scope.membershipId,
      classId: s.scope.classId, materialId: s.input.materialId, classes: [{ classId: s.scope.classId }] } });
    const event = { academyId: s.scope.academyId, classId: s.scope.classId, materialId: s.input.materialId,
      sequence: 2, focus: 'answer', pointer: { surface: 'answer', x: 0.5, y: 0.5 }, editor: null };
    await s.gateway.awareness(s.socket as never, event);
    expect(s.emit).toHaveBeenCalledWith(observationEvents.awareness, expect.objectContaining({
      membershipId: s.scope.membershipId, source: 'current', sequence: 2 }));
    s.emit.mockClear();
    await s.gateway.awareness(s.socket as never, { ...event, sequence: 1 });
    await s.gateway.awareness(s.socket as never, { ...event, sequence: 3, classId: randomUUID() });
    s.presence.currentSource.mockResolvedValueOnce({ socketGeneration: 'another', materialId: s.input.materialId } as never);
    await s.gateway.awareness(s.socket as never, { ...event, sequence: 4 });
    expect(s.emit).not.toHaveBeenCalled();
  });
  it('denies awareness without authenticated student presence and rejects actor injection', async () => {
    const s = setup();
    const event = { academyId: s.scope.academyId, classId: s.scope.classId, materialId: s.input.materialId,
      sequence: 1, focus: null, pointer: null, editor: null };
    await s.gateway.awareness(s.socket as never, event);
    await s.gateway.awareness(s.socket as never, { ...event, membershipId: s.scope.membershipId });
    expect(s.emit).not.toHaveBeenCalled();
  });
  it('refreshes the student indicator after a crashed watch expires', async () => {
    const s = setup(); s.watches.summarize.mockResolvedValue({ watcherCount: 0, revision: 2 });
    await s.gateway.activityChanged(s.scope);
    expect(s.emit).toHaveBeenCalledWith(observationEvents.indicator, { watching: false, revision: 2 });
  });
  it('requests a fresh authorized watch after a lost lease instead of revoking access', async () => {
    vi.useFakeTimers(); const s = setup();
    try {
      await s.gateway.start(s.socket as never, { ...s.scope, sessionId: randomUUID(), version: 1 });
      s.watches.renew.mockResolvedValue(false);
      await vi.advanceTimersByTimeAsync(monitoringWatchLease.renewIntervalMs);
      expect(s.socket.emit).toHaveBeenCalledWith(observationEvents.resync, expect.objectContaining(s.scope));
      expect(s.socket.emit).not.toHaveBeenCalledWith('access.revoked', expect.anything());
    } finally { s.gateway.onModuleDestroy(); vi.useRealTimers(); }
  });
  it('ends observation when permission revalidation fails', async () => {
    vi.useFakeTimers(); const s = setup();
    try {
      await s.gateway.start(s.socket as never, { ...s.scope, sessionId: randomUUID(), version: 1 });
      s.access.requireAssignedClass.mockRejectedValue({ code: 'MONITORING_ACCESS_DENIED' });
      await vi.advanceTimersByTimeAsync(monitoringWatchLease.renewIntervalMs);
      expect(s.socket.emit).toHaveBeenCalledWith('access.revoked', expect.anything());
      expect(s.socket.emit).not.toHaveBeenCalledWith(observationEvents.resync, expect.anything());
    } finally { s.gateway.onModuleDestroy(); vi.useRealTimers(); }
  });
  it('cleans up locally even when Redis is unavailable during disconnect', async () => {
    const s = setup();
    await s.gateway.start(s.socket as never, { ...s.scope, sessionId: randomUUID(), version: 1 });
    s.watches.end.mockRejectedValue(new Error('offline')); s.watches.summarize.mockRejectedValue(new Error('offline'));
    await expect(s.gateway.stop(s.socket as never)).resolves.toBeUndefined();
    expect(s.socket.leave).toHaveBeenCalled(); s.gateway.onModuleDestroy();
  });
  it('does not publish from an old tab or a previous material', async () => {
    const s = setup(); s.presence.currentSource.mockResolvedValue({ socketGeneration: 'newer', materialId: s.input.materialId });
    await s.gateway.publish(s.socket as never, { ...s.input, work: { answer: 'stale' } });
    expect(s.redis.eval).not.toHaveBeenCalled();
    expect(s.prisma.material.findUnique).not.toHaveBeenCalled();
  });
  it('does not publish work for a removed enrollment', async () => {
    const s = setup(); s.prisma.classEnrollment.findFirst.mockResolvedValue(null);
    await s.gateway.publish(s.socket as never, { ...s.input, work: { answer: 'removed' } });
    expect(s.redis.eval).not.toHaveBeenCalled();
  });
  it('filters fields using server material type', async () => {
    const s = setup(); s.prisma.material.findUnique.mockResolvedValue({ type: 'VIDEO_LESSON' });
    await s.gateway.publish(s.socket as never, { ...s.input, work: { videoPosition: 12, videoState: 'paused', answer: 'irrelevant' } });
    const args = s.redis.eval.mock.calls[0]!;
    const stored = JSON.parse(args[args.length - 2]);
    expect(stored.work).toEqual({ videoPosition: 12, videoState: 'paused' });
    expect(args).toContain('current');
  });
  it('opens a student watch without making a programming draft', async () => {
    const s = setup(); s.presence.currentSource.mockResolvedValue(null);
    const result = await s.gateway.start(s.socket as never, { ...s.scope, sessionId: randomUUID(), version: 1 });
    expect(result.ok).toBe(true);
    expect(s.watches.register).toHaveBeenCalledWith(expect.objectContaining({ draftId: null }));
    expect(s.access.requireLiveWatch).toHaveBeenCalled();
    await s.gateway.stop(s.socket as never);
    s.gateway.onModuleDestroy();
  });
  it('refuses a student watch when access has been revoked', async () => {
    const s = setup(); s.access.requireAssignedClass.mockRejectedValue(new Error('denied'));
    const result = await s.gateway.start(s.socket as never, { ...s.scope, sessionId: randomUUID(), version: 1 });
    expect(result.ok).toBe(false); expect(s.watches.register).not.toHaveBeenCalled();
  });
});
