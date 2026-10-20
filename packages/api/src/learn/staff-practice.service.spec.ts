import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import type { AcademyAccessService } from '../authorization/academy-access.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { JudgeQueue } from '../judge/judge.queue.js';
import { StaffPracticeService } from './staff-practice.service.js';
const academyId = '20000000-0000-4000-8000-000000000001', materialId = '70000000-0000-4000-8000-000000000001';
const identity = { authUserId: 'auth' } as SupabaseIdentity;
function fixture(via = 'membership', roles = ['TEACHER']) {
  const access = { requirePermission: vi.fn().mockResolvedValue({ userId: 'owner', role: roles[0], roles, via }) };
  const db = {
    material: { findFirst: vi.fn().mockResolvedValue({ id: materialId, programmingExercise: {}, lecture: { courseModule: {} } }) },
    staffPracticeDraft: { findUnique: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 0 }), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    staffPracticeAttempt: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn) => fn(db));
  const queue = { consumeSubmissionToken: vi.fn().mockResolvedValue(true), enqueuePractice: vi.fn() };
  const service = new StaffPracticeService(db as unknown as PrismaService, access as unknown as AcademyAccessService, new ConfigService(), queue as unknown as JudgeQueue);
  return { service, db, access, queue };
}
describe('private staff practice boundaries', () => {
  it.each(['platform', 'support'])('refuses %s inspection writes before reading material', async (via) => {
    const { service, db } = fixture(via);
    await expect(service.saveDraft(identity, { academyId, materialId, code: 'print(1)' })).rejects.toThrow();
    expect(db.material.findFirst).not.toHaveBeenCalled();
  });
  it('refuses students even if a read gate returned their membership', async () => {
    const { service, db } = fixture('membership', ['STUDENT']);
    await expect(service.authorize(identity, { academyId, materialId })).rejects.toThrow();
    expect(db.material.findFirst).not.toHaveBeenCalled();
  });
  it('composes teacher assignment and all ancestor visibility on every read', async () => {
    const { service, db } = fixture();
    await service.history(identity, { academyId, materialId });
    const where = db.material.findFirst.mock.calls[0]![0].where;
    expect(where).toMatchObject({ id: materialId, AND: [{ isVisible: true, lecture: { isVisible: true, courseModule: { isVisible: true, course: { academyId, isVisible: true } } } }, {}] });
    expect(JSON.stringify(where)).toContain('classAssignments');
    expect(db.staffPracticeAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { academyId, materialId, userId: 'owner', context: 'live' } }));
  });
  it('checks result owner before disclosing or authorizing its material', async () => {
    const { service, db } = fixture(); db.staffPracticeAttempt.findFirst.mockResolvedValue(null);
    await expect(service.get(identity, { academyId, submissionId: materialId })).rejects.toThrow();
    expect(db.staffPracticeAttempt.findFirst).toHaveBeenCalledWith({ where: { id: materialId, academyId, userId: 'owner' } });
    expect(db.material.findFirst).not.toHaveBeenCalled();
  });
  it.each([undefined, '2020-01-01T00:00:00.000Z'])('preserves newer code for a stale base %s', async (baseUpdatedAt) => {
    const { service, db } = fixture();
    db.staffPracticeDraft.findUniqueOrThrow.mockResolvedValue({ id: materialId, code: 'newer', updatedAt: new Date('2026-10-20T00:00:00Z') });
    const result = await service.saveDraft(identity, { academyId, materialId, code: 'older', baseUpdatedAt });
    expect(result).toMatchObject({ outcome: 'CONFLICT', serverCode: 'newer' });
    expect(db.staffPracticeDraft.updateMany).not.toHaveBeenCalled();
  });
  it('refuses reusing a request key for different code before enqueue', async () => {
    const { service, db, queue } = fixture();
    db.staffPracticeAttempt.findUnique.mockResolvedValue({ materialId, code: 'prior' });
    await expect(service.submit(identity, { academyId, materialId, code: 'different', requestId: materialId })).rejects.toThrow();
    expect(queue.enqueuePractice).not.toHaveBeenCalled();
  });
});
