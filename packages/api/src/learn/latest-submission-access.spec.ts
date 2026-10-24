import { describe, expect, it, vi } from 'vitest';
import { LearnService } from './learn.service.js';

function fixture(role = 'STUDENT', via = 'membership') {
  const db = { material: { findFirst: vi.fn().mockResolvedValue({ id: 'material', type: 'PROGRAMMING_EXERCISE', programmingExercise: {}, lecture: { courseModule: { course: { id: 'course' } } } }) },
    submission: { findFirst: vi.fn().mockResolvedValue({ id: 'newest', createdAt: new Date('2026-10-23'), status: 'FAILED', score: 0 }) } };
  const access = { requirePermission: vi.fn().mockResolvedValue({ userId: 'owner', role, roles: [role], via }) };
  const classes = { resolve: vi.fn().mockResolvedValue({ classId: 'class-one' }) };
  const service = new LearnService(db as never, {} as never, access as never, {} as never, {} as never, classes as never);
  return { db, access, classes, service };
}
const identity = { authUserId: 'auth' } as never;
describe('student latest submission isolation', () => {
  it('reads the newest owned attempt in the resolved class, excluding regrades', async () => {
    const { service, db } = fixture();
    expect(await service.getLatestSubmission(identity, { academyId: 'academy', materialId: 'material', classId: 'class-one', mode: 'student' })).toMatchObject({ submissionId: 'newest', scoreHundredths: 0 });
    expect(db.submission.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'owner', materialId: 'material', classId: 'class-one', course: { academyId: 'academy' }, regradeRunId: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });
  it.each([['MANAGER', 'membership'], ['STUDENT', 'platform'], ['STUDENT', 'support']])('rejects %s via %s before reading grades', async (role, via) => {
    const { service, db } = fixture(role, via);
    await expect(service.getLatestSubmission(identity, { academyId: 'a', materialId: 'm', mode: 'student' })).rejects.toThrow();
    expect(db.submission.findFirst).not.toHaveBeenCalled();
  });
  it('rejects student preview, wrong classes and hidden/unreachable materials', async () => {
    const { service, db, classes } = fixture();
    await expect(service.getLatestSubmission(identity, { academyId: 'a', materialId: 'm', mode: 'student', preview: true })).rejects.toThrow();
    classes.resolve.mockRejectedValueOnce(new Error('not enrolled'));
    await expect(service.getLatestSubmission(identity, { academyId: 'a', materialId: 'm', mode: 'student', classId: 'another' })).rejects.toThrow();
    db.material.findFirst.mockResolvedValueOnce(null);
    await expect(service.getLatestSubmission(identity, { academyId: 'a', materialId: 'm', mode: 'student' })).rejects.toThrow();
    expect(db.submission.findFirst).not.toHaveBeenCalled();
  });
});
