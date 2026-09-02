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

describe('PlatformContentService.courses', () => {
  it('counts the problems under a course that cannot grade', async () => {
    // The console has no list of problems any more — one is reached by opening
    // its course. So the fault a problem carries has to arrive on the course
    // row, or the summary strip's `cannot grade` number has nowhere to go.
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'course-1',
        title: 'Python Foundations',
        description: '',
        isVisible: true,
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        academy: { id: academyId, name: 'D.Lab Mapo', slug: 'mapo' },
        _count: { modules: 2, classAssignments: 1 },
        modules: [
          {
            _count: { lectures: 2 },
            lectures: [
              { _count: { materials: 3 }, materials: [{ id: 'm1' }] },
              { _count: { materials: 4 }, materials: [] },
            ],
          },
          {
            _count: { lectures: 1 },
            lectures: [
              {
                _count: { materials: 2 },
                materials: [{ id: 'm2' }, { id: 'm3' }],
              },
            ],
          },
        ],
      },
    ]);
    const prisma = {
      academy: { findMany: vi.fn().mockResolvedValue([]) },
      course: { count: vi.fn().mockResolvedValue(1), findMany },
    } as never;
    const service = new PlatformContentService(prisma, {
      requirePermission: vi.fn().mockResolvedValue({}),
    } as never);

    const result = await service.courses(identity, {
      sort: 'updatedAt',
      direction: 'desc',
      page: 1,
      pageSize: 25,
    });

    expect(result.rows[0].exerciseCount).toBe(9);
    expect(result.rows[0].problemsWithoutTests).toBe(3);
    // Only the broken ones are selected, and inside the tree already loaded —
    // a second round trip per page is what this nesting exists to avoid.
    const materials =
      findMany.mock.calls[0][0].select.modules.select.lectures.select.materials;
    expect(materials.where.type).toBe('PROGRAMMING_EXERCISE');
    expect(materials.where.OR).toHaveLength(2);
  });
});
