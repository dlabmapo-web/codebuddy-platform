import { describe, expect, it, vi } from 'vitest';

import { PlatformInvitationsService } from './platform-invitations.service.js';

const academyId = '20000000-0000-4000-8000-000000000001';
const identity = { authUserId: 'operator' } as never;

const input = {
  sort: 'sent',
  direction: 'desc',
  page: 1,
  pageSize: 25,
} as const;

function build(overrides: Partial<Record<string, unknown>> = {}) {
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const prisma = {
    academyInvitation: { updateMany, findMany, count },
    academy: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as never;
  const requirePermission = vi.fn().mockResolvedValue({});
  const service = new PlatformInvitationsService(prisma, {
    requirePermission,
  } as never);
  return { service, updateMany, findMany, count, requirePermission };
}

describe('PlatformInvitationsService.list', () => {
  it('asks for the platform invitations permission', async () => {
    const { service, requirePermission } = build();
    await service.list(identity, { ...input });
    expect(requirePermission).toHaveBeenCalledWith(
      'operator',
      'platform.invitations.read',
    );
  });

  it('retires lapsed invitations before counting anything', async () => {
    // Without the sweep the console shows a live-looking PENDING invitation
    // that the academy's own page calls EXPIRED, and offers a Resend the write
    // path would refuse.
    const { service, updateMany, count } = build();
    await service.list(identity, { ...input, academyIds: [academyId] });

    expect(updateMany).toHaveBeenCalledOnce();
    const where = updateMany.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING');
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
    // Scoped to what is in view, so a narrowed operator does not tidy the
    // whole platform.
    expect(where.academyId).toEqual({ in: [academyId] });
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      count.mock.invocationCallOrder[0]!,
    );
  });

  it('defaults to the invitations that are still open', async () => {
    const { service, findMany } = build();
    await service.list(identity, { ...input });
    expect(findMany.mock.calls[0][0].where.status).toEqual({ in: ['PENDING'] });
  });

  it('reads the latest delivery attempt, not the first', async () => {
    const { service, findMany } = build();
    await service.list(identity, { ...input });
    const attempts = findMany.mock.calls[0][0].select.deliveryAttempts;
    expect(attempts.orderBy).toEqual({ attemptNumber: 'desc' });
    expect(attempts.take).toBe(1);
  });

  it('keeps status and delivery apart on the row', async () => {
    // §2.3 — an invitation can be PENDING while its email bounced, and one
    // column could not say both.
    const { service } = build({
      academyInvitation: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'invitation-1',
            email: 'parent@example.com',
            role: 'STUDENT',
            status: 'PENDING',
            expiresAt: new Date('2026-09-09T00:00:00.000Z'),
            createdAt: new Date('2026-09-02T00:00:00.000Z'),
            invitedBy: { displayName: 'Cove Support', platformRole: 'ADMIN' },
            deliveryAttempts: [
              {
                state: 'BOUNCED',
                attemptNumber: 2,
                failureCode: 'hard_bounce',
                queuedAt: new Date('2026-09-02T00:00:00.000Z'),
                sentAt: null,
                deliveredAt: null,
                failedAt: new Date('2026-09-02T00:01:00.000Z'),
              },
            ],
            academy: {
              id: academyId,
              name: 'D.Lab Mapo',
              slug: 'mapo',
              _count: { memberships: 0 },
            },
          },
        ]),
      },
    });

    const result = await service.list(identity, { ...input });
    const row = result.rows[0]!;
    expect(row.status).toBe('PENDING');
    expect(row.delivery?.state).toBe('BOUNCED');
    // Nobody in this academy can resend it, which is the whole reason the
    // console shows the row at all.
    expect(row.academyHasManager).toBe(false);
    expect(row.invitedBy).toEqual({
      displayName: 'Cove Support',
      isOperator: true,
    });
  });

  it('qualifies the total with how many were accepted', async () => {
    // The tile's second line. Without it a total could only be qualified by the
    // academy count, which the strip's header already states.
    const { service, count } = build();
    await service.list(identity, { ...input });
    const accepted = count.mock.calls
      .map((call) => call[0].where)
      .filter((where) => where.status === 'ACCEPTED');
    expect(accepted).toHaveLength(1);
  });

  it('counts only the bounces somebody can still act on', async () => {
    const { service, count } = build();
    await service.list(identity, { ...input });
    // A bounced invitation that was then revoked is settled work, so every
    // bounce count is scoped to PENDING.
    const bounceCalls = count.mock.calls
      .map((call) => call[0].where)
      .filter((where) => where.deliveryAttempts);
    expect(bounceCalls).toHaveLength(2);
    for (const where of bounceCalls) {
      expect(where.status).toBe('PENDING');
      expect(where.deliveryAttempts.some.state.in).toEqual([
        'BOUNCED',
        'FAILED',
      ]);
    }
  });

  it('offers every live academy to the composer, not only those with invitations', async () => {
    // The facet could stop at academies with something in it; this response
    // also feeds the form that sends the first invitation, and an academy with
    // none is exactly the one an operator is asked to help.
    const academyFindMany = vi.fn().mockResolvedValue([]);
    const { service } = build({
      academy: { count: vi.fn().mockResolvedValue(0), findMany: academyFindMany },
    });
    await service.list(identity, { ...input });
    expect(academyFindMany.mock.calls[0][0].where).toEqual({
      status: { not: 'ARCHIVED' },
    });
  });

  it('breaks every ordering tie on the id', async () => {
    for (const sort of ['sent', 'academy', 'expires'] as const) {
      const { service, findMany } = build();
      await service.list(identity, { ...input, sort });
      const orderBy = findMany.mock.calls[0][0].orderBy;
      expect(orderBy.at(-1)).toEqual({ id: 'asc' });
    }
  });
});
