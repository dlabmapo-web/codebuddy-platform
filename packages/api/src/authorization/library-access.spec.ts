import { describe, expect, it, vi } from 'vitest';

import { AcademyAccessService } from './academy-access.service.js';

const libraryId = '30000000-0000-4000-8000-000000000001';
const academyId = '20000000-0000-4000-8000-000000000001';

/**
 * A prisma double whose academy row decides which branch is taken.
 *
 * The membership lookup always answers null, which is the truth for a library:
 * one has no members at all, so there is nothing for the ordinary path to find.
 */
function build({
  kind,
  platformRole,
}: {
  kind: 'ACADEMY' | 'LIBRARY';
  platformRole: 'ADMIN' | 'USER' | null;
}) {
  const findLive = vi.fn().mockResolvedValue(null);
  const prisma = {
    user: {
      findUnique: vi.fn(({ where }) =>
        Promise.resolve(
          'authUserId' in where
            ? { id: 'user-1', status: 'ACTIVE' }
            : { platformRole },
        ),
      ),
    },
    academyMembership: { findUnique: vi.fn().mockResolvedValue(null) },
    academy: {
      findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', kind }),
    },
  } as never;
  return {
    service: new AcademyAccessService(prisma, { findLive } as never),
    findLive,
  };
}

describe('AcademyAccessService, inside a library academy', () => {
  it('lets a platform admin write, which no academy ever allows them', async () => {
    const { service } = build({ kind: 'LIBRARY', platformRole: 'ADMIN' });

    const access = await service.requirePermission(
      'operator',
      libraryId,
      'curriculum.manage',
    );

    expect(access.via).toBe('platform');
    expect(access.role).toBe('TEAM_LEAD');
  });

  /**
   * The reason the Excel importer needs no library-specific work: head office
   * has more problems to write than anyone, and the workbook is what that is
   * for.
   */
  it('grants the workbook import', async () => {
    const { service } = build({ kind: 'LIBRARY', platformRole: 'ADMIN' });
    await expect(
      service.requirePermission('operator', libraryId, 'content.import'),
    ).resolves.toMatchObject({ via: 'platform' });
  });

  it('never consults a support grant, because there is nothing to assume', async () => {
    const { service, findLive } = build({
      kind: 'LIBRARY',
      platformRole: 'ADMIN',
    });
    await service.requirePermission('operator', libraryId, 'curriculum.read');
    expect(findLive).not.toHaveBeenCalled();
  });

  /**
   * A library holds courses and nothing else. Its permission set is narrower
   * than any academy role's, so authority here can never become a way to reach
   * members, classes or enrollment.
   */
  it('refuses a permission a library has no business granting', async () => {
    const { service } = build({ kind: 'LIBRARY', platformRole: 'ADMIN' });
    await expect(
      service.requirePermission('operator', libraryId, 'classes.manage'),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('refuses an ordinary account outright', async () => {
    const { service } = build({ kind: 'LIBRARY', platformRole: 'USER' });
    await expect(
      service.requirePermission('member', libraryId, 'curriculum.read'),
    ).rejects.toMatchObject({ code: 'PLATFORM_ACCESS_DENIED' });
  });
});

describe('AcademyAccessService, inside a customer academy', () => {
  /**
   * The guarantee this design rests on: the customer path is exactly what it
   * was. A platform operator resolves through `platformRead`, taking the view
   * role's own permission set — not the library's, which is narrower and
   * course-only.
   *
   * Asserted here so the library branch above cannot quietly become the way
   * authority is decided for a customer's academy too.
   */
  it('resolves a platform operator through the view-role path, not the library one', async () => {
    const { service } = build({ kind: 'ACADEMY', platformRole: 'ADMIN' });

    const access = await service.requirePermission(
      'operator',
      academyId,
      'classes.manage',
    );

    // `classes.manage` is in the Manager view and deliberately absent from the
    // library set, so the two paths are distinguishable by their answers.
    expect(access.via).toBe('platform');
    expect(access.role).toBe('MANAGER');
  });

  it('still lets that operator read', async () => {
    const { service } = build({ kind: 'ACADEMY', platformRole: 'ADMIN' });
    await expect(
      service.requirePermission('operator', academyId, 'curriculum.read'),
    ).resolves.toMatchObject({ via: 'platform', role: 'MANAGER' });
  });

  it('refuses an operator who holds no platform role at all', async () => {
    const { service } = build({ kind: 'ACADEMY', platformRole: null });
    await expect(
      service.requirePermission('member', academyId, 'curriculum.read'),
    ).rejects.toMatchObject({ code: 'ACADEMY_MEMBERSHIP_REQUIRED' });
  });
});
