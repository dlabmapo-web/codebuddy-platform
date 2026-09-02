import { describe, expect, it, vi } from 'vitest';

import { readAcademyStats } from './academy-stats.js';
import { PlatformContentService } from './platform-content.service.js';

const academyId = '20000000-0000-4000-8000-000000000001';
const identity = { authUserId: 'operator' } as never;

function count(where: Record<string, unknown>) {
  if (where.OR && where.status === 'ACTIVE') return 3;
  if (where.status === 'ACTIVE') return 5;
  if (where.status === 'ARCHIVED') return 2;
  if (where.isVisible) return 6;
  if (where.type === 'PROGRAMMING_EXERCISE' && where.OR) return 4;
  if (where.type === 'PROGRAMMING_EXERCISE') return 9;
  return 10;
}

describe('PlatformContentService.summary', () => {
  it('uses the same no-teacher predicate as academy stats', async () => {
    const prisma = {
      academy: { count: vi.fn().mockResolvedValue(1) },
      class: { count: vi.fn(({ where }) => Promise.resolve(count(where))) },
      course: { count: vi.fn(({ where }) => Promise.resolve(count(where))) },
      lecture: { count: vi.fn().mockResolvedValue(7) },
      material: { count: vi.fn(({ where }) => Promise.resolve(count(where))) },
      classEnrollment: { count: vi.fn().mockResolvedValue(12) },
      platformSupportGrant: { count: vi.fn().mockResolvedValue(0) },
    } as never;
    const service = new PlatformContentService(
      prisma,
      { requirePermission: vi.fn().mockResolvedValue({}) } as never,
    );

    const [academy, summary] = await Promise.all([
      readAcademyStats(prisma, academyId),
      service.summary(identity, { academyIds: [academyId] }),
    ]);

    expect(summary.classes.withoutTeacher).toBe(academy.classes.withoutTeacher);
    expect(summary.classes.withoutTeacher).toBe(3);
  });
});
