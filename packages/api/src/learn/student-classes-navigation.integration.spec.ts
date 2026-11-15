import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { SupportGrantResolver } from '../authorization/support-grant.resolver.js';
import { LearnClassService } from './learn-class.service.js';
import { LearnService } from './learn.service.js';
import { CurriculumOutlineService } from './curriculum-outline.service.js';
import { LearningClassContextService } from './learning-class-context.service.js';

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!databaseUrl)('student class navigation on disposable PostgreSQL', () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }), log: [{ emit: 'event', level: 'query' }] });
  const prisma = db as unknown as PrismaService;
  const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
  const curriculum = new CurriculumOutlineService(prisma);
  const classes = new LearnClassService(prisma, access, curriculum, { signMany: async () => [] } as never);
  const learn = new LearnService(prisma, {} as never, access, curriculum, {} as never, new LearningClassContextService(prisma));
  const academyId = randomUUID(), classId = randomUUID(), courseId = randomUUID(), userId = randomUUID(), membershipId = randomUUID(), ownerId = randomUUID();
  const identity = { authUserId: randomUUID() } as SupabaseIdentity;
  let statements = 0;
  const evidence: Record<string, unknown> = {};
  async function seedCourses(ids: string[], offset = 0) {
    await db.course.createMany({ data: ids.map(id => ({ id, academyId, title: `Student course ${id}`, isVisible: true, createdByUserId: ownerId })) });
    const modules = ids.map(id => ({ id: randomUUID(), courseId: id, title: 'Module', externalKey: randomUUID(), position: 1, isVisible: true }));
    await db.courseModule.createMany({ data: modules });
    const lectures = modules.map(m => ({ id: randomUUID(), courseModuleId: m.id, title: 'Lecture', externalKey: randomUUID(), position: 1, isVisible: true }));
    await db.lecture.createMany({ data: lectures });
    const materials = lectures.map(l => ({ id: randomUUID(), lectureId: l.id, title: 'Addition', type: 'PROGRAMMING_EXERCISE' as const, position: 1, isVisible: true }));
    await db.material.createMany({ data: materials });
    await db.programmingExercise.createMany({ data: materials.map(m => ({ materialId: m.id, externalKey: randomUUID(), difficulty: 'EASY' as const, description: '<p>Add numbers</p>', inputFormat: '', outputFormat: '', constraints: '', starterCode: 'print(1)' })) });
    await db.classCourse.createMany({ data: ids.map(id => ({ classId, courseId: id, assignedByUserId: ownerId })) });
    await db.exerciseDraft.createMany({ data: materials.map((m, i) => ({ userId, materialId: m.id, sourceMaterialId: m.id, courseId: ids[i], code: `print(${offset + i})` })) });
  }
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/cove_dlab_test') throw new Error('Disposable local database required');
    db.$on('query', () => { statements++; });
    const org = await db.organization.create({ data: { name: 'Student navigation fixtures', slug: randomUUID() } });
    await db.academy.create({ data: { id: academyId, organizationId: org.id, name: 'Navigation academy', slug: randomUUID() } });
    await db.user.createMany({ data: [{ id: userId, authUserId: identity.authUserId, status: 'ACTIVE' }, { id: ownerId, authUserId: randomUUID(), status: 'ACTIVE' }] });
    await db.academyMembership.create({ data: { id: membershipId, academyId, userId, role: 'STUDENT', status: 'ACTIVE' } });
    await db.class.create({ data: { id: classId, academyId, name: 'Class A', createdByUserId: ownerId } });
    await db.classEnrollment.create({ data: { classId, membershipId, enrolledByUserId: ownerId } });
    await seedCourses([courseId]);
  });
  afterAll(async () => {
    if (process.env.COVE_STUDENT_NAV_SQL_EVIDENCE) await writeFile(process.env.COVE_STUDENT_NAV_SQL_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
    await db.$disconnect();
  });
  it('keeps page-read budgets fixed as classes, courses and saved drafts grow', async () => {
    const measure = async () => {
      const counts: Record<string, number> = {};
      const reads = {
        classList: () => classes.listClasses(identity, academyId),
        classDetail: () => classes.getClass(identity, { academyId, classId }),
        drafts: () => learn.listDrafts(identity, academyId),
        courseOutline: () => learn.getCourseOutline(identity, { academyId, classId, courseId }),
      };
      for (const [name, read] of Object.entries(reads)) { statements = 0; await read(); counts[name] = statements; }
      return { ...counts, home: counts.classList + counts.drafts };
    };
    const small = await measure();
    await seedCourses(Array.from({ length: 19 }, () => randomUUID()), 1);
    const added = Array.from({ length: 12 }, () => ({ id: randomUUID(), academyId, name: 'Another enrolled class', createdByUserId: ownerId }));
    await db.class.createMany({ data: added });
    await db.classEnrollment.createMany({ data: added.map(c => ({ classId: c.id, membershipId, enrolledByUserId: ownerId })) });
    await db.classCourse.createMany({ data: added.map(c => ({ classId: c.id, courseId, assignedByUserId: ownerId })) });
    const large = await measure();
    evidence.budgets = { small, large, classes: [1, 13], courses: [1, 20], drafts: [1, 20] };
    expect(large).toEqual(small);
    expect(small).toEqual({ classList: 11, classDetail: 21, drafts: 6, courseOutline: 14, home: 17 });
    expect((await classes.getClass(identity, { academyId, classId })).courses).toHaveLength(20);
    expect((await learn.listDrafts(identity, academyId)).drafts).toHaveLength(20);
  });
  it('requires a choice for shared courses and honors the requested enrolled class', async () => {
    const outline = await learn.getCourseOutline(identity, { academyId, courseId });
    expect(outline.classContext.classId).toBeNull();
    expect(outline.classContext.classes.length).toBe(13);
    expect((await learn.getCourseOutline(identity, { academyId, courseId, classId })).classContext.classId).toBe(classId);
    await expect(learn.getCourseOutline(identity, { academyId, courseId, classId: randomUUID() })).rejects.toBeDefined();
    await expect(classes.getClass(identity, { academyId, classId: randomUUID() })).rejects.toBeDefined();
  });
});
