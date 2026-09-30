import { describe, expect, it, vi } from 'vitest';
import { MemberDetailService } from './member-detail.service.js';

function fixture({ allowed = true, found = true } = {}) {
  const tx = {
    academyMembership: { findFirst: vi.fn().mockResolvedValue(found ? { id: 'student', memberProfile: { academyDisplayName: 'Old' } } : null) },
    academyMemberProfile: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    academy: { update: vi.fn() },
  };
  const prisma = { $transaction: vi.fn(async (action: (db: typeof tx) => unknown) => action(tx)) };
  const scopes = { requireMemberReader: allowed ? vi.fn().mockResolvedValue({ userId: 'lead' }) : vi.fn().mockRejectedValue(new Error('denied')) };
  const service = new MemberDetailService(prisma as never, scopes as never, {} as never, {} as never, {} as never, {} as never);
  return { service, tx, prisma };
}
const identity = { authUserId: 'actor' } as never;
const input = { academyId: 'academy', membershipId: 'student', name: 'Corrected name' };

describe('academy student renaming', () => {
  it('updates only the academy name and audits it in the same transaction', async () => {
    const { service, tx } = fixture();
    await expect(service.renameStudent(identity, input)).resolves.toEqual({ saved: true });
    expect(tx.academyMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'student', academyId: 'academy', status: 'ACTIVE', role: 'STUDENT', user: { status: 'ACTIVE' } } }));
    expect(tx.academyMemberProfile.upsert).toHaveBeenCalledWith({ where: { membershipId: 'student' }, create: { membershipId: 'student', academyDisplayName: 'Corrected name' }, update: { academyDisplayName: 'Corrected name' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: 'lead', action: 'academy.student.renamed', before: { academyDisplayName: 'Old' } }) }));
    expect(tx.academy.update).toHaveBeenCalled();
  });
  it('rejects teachers and students before querying the target', async () => {
    const { service, prisma } = fixture({ allowed: false });
    await expect(service.renameStudent(identity, input)).rejects.toThrow('denied');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('does not write when the target is outside the academy or not an active student', async () => {
    const { service, tx } = fixture({ found: false });
    await expect(service.renameStudent(identity, input)).rejects.toThrow();
    expect(tx.academyMemberProfile.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
