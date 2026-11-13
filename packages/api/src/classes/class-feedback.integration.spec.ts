import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AcademyRole } from '@cove/shared';

import { PrismaClient } from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { SupportGrantResolver } from '../authorization/support-grant.resolver.js';
import { AuditService } from '../academies/audit.service.js';
import { MonitoringAccessService } from '../monitoring/monitoring-access.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { ClassroomService } from './classroom.service.js';
import { ClassesService } from './classes.service.js';

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)('class feedback against disposable PostgreSQL', () => {
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }), log: [{ emit: 'event', level: 'query' }] });
  const prisma = client as unknown as PrismaService;
  const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
  const media = { signMany: vi.fn().mockResolvedValue([]) } as never;
  const classroom = new ClassroomService(prisma, access);
  const classes = new ClassesService(prisma, access, new AuditService(), {} as never, media);
  const monitoring = new MonitoringService(prisma, new MonitoringAccessService(prisma, access), {} as never, {} as never, new AuditService(), media);
  const academyId = randomUUID();
  const otherAcademyId = randomUUID();
  const classId = randomUUID();
  const people = new Map<AcademyRole, { userId: string; membershipId: string; identity: SupabaseIdentity }>();
  let statements = 0;
  const evidence: Record<string, unknown> = {};

  beforeAll(async () => {
    // The runner supplies a fresh Docker database, never an application's env URL.
    const url = new URL(databaseUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/cove_dlab_test') throw new Error('Disposable local cove_dlab_test required');
    client.$on('query', () => { statements++; });
    const org = await client.organization.create({ data: { name: 'Feedback fixture', slug: randomUUID() } });
    await client.academy.createMany({ data: [academyId, otherAcademyId].map(id => ({ id, organizationId: org.id, name: 'Feedback academy', slug: randomUUID() })) });
    for (const role of ['MANAGER', 'TEAM_LEAD', 'TEACHER', 'STUDENT'] as const) {
      const authUserId = randomUUID();
      const user = await client.user.create({ data: { authUserId, status: 'ACTIVE', displayName: role } });
      const membership = await client.academyMembership.create({ data: { academyId, userId: user.id, role, status: 'ACTIVE' } });
      people.set(role, { userId: user.id, membershipId: membership.id, identity: { authUserId } as SupabaseIdentity });
    }
    await client.academyFeatureFlag.create({ data: { academyId, feature: 'TEACHER_LIVE_MONITORING', isEnabled: true } });
    await client.class.create({ data: { id: classId, academyId, name: 'Feedback class', createdByUserId: people.get('MANAGER')!.userId, teacherMembershipId: people.get('TEACHER')!.membershipId } });
    await client.classEnrollment.create({ data: { classId, membershipId: people.get('STUDENT')!.membershipId, enrolledByUserId: people.get('MANAGER')!.userId } });
  });

  afterAll(async () => {
    if (process.env.COVE_FEEDBACK_SQL_EVIDENCE) await writeFile(process.env.COVE_FEEDBACK_SQL_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
    await client.$disconnect();
  });

  it('keeps list, roster and management detail statement counts constant as classes and students grow', async () => {
    const identity = people.get('MANAGER')!.identity;
    const reads = {
      teachingList: () => monitoring.listAssignedClasses(identity, { academyId }),
      teachingRoster: () => monitoring.getClassRoster(identity, { academyId, classId }),
      managementDetail: () => classes.get(identity, { academyId, classId }),
      classroomEntry: () => Promise.all([classroom.get(identity, { academyId, classId }), monitoring.getClassRoster(identity, { academyId, classId })]),
    };
    const measure = async () => {
      const counts: Record<string, number> = {};
      for (const [name, read] of Object.entries(reads)) {
        statements = 0;
        await read();
        counts[name] = statements;
      }
      return counts;
    };
    const small = await measure();
    await client.class.createMany({ data: Array.from({ length: 12 }, () => ({ academyId, name: 'Another class', createdByUserId: people.get('MANAGER')!.userId })) });
    const students = Array.from({ length: 20 }, () => ({ id: randomUUID(), authUserId: randomUUID(), status: 'ACTIVE' as const }));
    await client.user.createMany({ data: students });
    const memberships = students.map(user => ({ id: randomUUID(), userId: user.id, academyId, role: 'STUDENT' as const, status: 'ACTIVE' as const }));
    await client.academyMembership.createMany({ data: memberships });
    await client.classEnrollment.createMany({ data: memberships.map(m => ({ classId, membershipId: m.id, enrolledByUserId: people.get('MANAGER')!.userId })) });
    const large = await measure();
    evidence.counts = { small, large, classes: [1, 13], students: [1, 21] };
    expect(large).toEqual(small);
    // Pin measured service budgets after establishing the disposable baseline.
    expect(small).toEqual({ teachingList: 4, teachingRoster: 13, managementDetail: 26, classroomEntry: 17 });
  });

  it.each(['MANAGER', 'TEAM_LEAD'] as const)('%s edits the complete timetable and records its audit', async role => {
    const actor = people.get(role)!;
    const before = await classes.get(actor.identity, { academyId, classId });
    const slots = [{ weekday: 1, startMinute: 960, endMinute: 1080 }, { weekday: 3, startMinute: 1380, endMinute: 1500 }];
    const saved = await classes.setSchedule(actor.identity, { academyId, classId, slots, expectedUpdatedAt: before.updatedAt });
    expect(saved.schedule.map(({ id, ...slot }) => slot)).toEqual(slots);
    const audit = await client.auditLog.findFirst({ where: { targetId: classId, action: 'class.schedule.updated', actorUserId: actor.userId }, orderBy: { createdAt: 'desc' } });
    expect(audit).toMatchObject({ after: { slots } });
    await expect(classes.setSchedule(actor.identity, { academyId, classId, slots: [], expectedUpdatedAt: before.updatedAt })).rejects.toMatchObject({ code: 'CLASS_EDIT_CONFLICT' });
    const cleared = await classes.setSchedule(actor.identity, { academyId, classId, slots: [], expectedUpdatedAt: saved.updatedAt });
    expect(cleared.schedule).toEqual([]);
  });

  it.each(['TEACHER', 'STUDENT'] as const)('denies direct class and schedule edits by %s', async role => {
    const identity = people.get(role)!.identity;
    await expect(classes.update(identity, { academyId, classId, name: 'Denied', description: '', expectedUpdatedAt: new Date().toISOString() })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(classes.setSchedule(identity, { academyId, classId, slots: [], expectedUpdatedAt: new Date().toISOString() })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('reads the published class outline in four statements regardless of lesson count', async () => {
    const owner = people.get('MANAGER')!;
    const course = await client.course.create({ data: { academyId, title: 'Teaching course', createdByUserId: owner.userId, isVisible: true } });
    await client.classCourse.create({ data: { classId, courseId: course.id, assignedByUserId: owner.userId } });
    const module = await client.courseModule.create({ data: { courseId: course.id, externalKey: randomUUID(), title: 'Module', position: 1, isVisible: true } });
    const lecture = await client.lecture.create({ data: { courseModuleId: module.id, externalKey: randomUUID(), title: 'Lecture', position: 1, isVisible: true } });
    await client.material.create({ data: { lectureId: lecture.id, title: 'Visible', position: 1, type: 'EXPLANATION', isVisible: true, explanationMaterial: { create: { body: '<p>Visible lesson</p>' } } } });
    statements = 0;
    const small = await classroom.get(owner.identity, { academyId, classId });
    const smallCount = statements;
    statements = 0;
    await Promise.all([classroom.get(owner.identity, { academyId, classId }), monitoring.getClassRoster(owner.identity, { academyId, classId })]);
    const entrySmall = statements;
    expect(small.courses[0].modules[0].lectures[0].materials).toHaveLength(1);
    const expandedMaterials = Array.from({ length: 40 }, (_, i) => ({ id: randomUUID(), lectureId: lecture.id, title: 'Lesson ' + i, position: i + 2, type: 'PROGRAMMING_EXERCISE' as const, isVisible: true }));
    await client.material.createMany({ data: expandedMaterials });
    await client.programmingExercise.createMany({ data: expandedMaterials.map(material => ({ materialId: material.id, externalKey: randomUUID(), difficulty: 'EASY' as const })) });
    await client.material.create({ data: { lectureId: lecture.id, title: 'Hidden', position: 42, type: 'EXPLANATION', isVisible: false } });
    const hiddenModule = await client.courseModule.create({ data: { courseId: course.id, externalKey: randomUUID(), title: 'Hidden module', position: 2, isVisible: false } });
    await client.lecture.create({ data: { courseModuleId: hiddenModule.id, externalKey: randomUUID(), title: 'Hidden lecture', position: 1, isVisible: true } });
    const unassigned = await client.course.create({ data: { academyId, title: 'Unassigned', createdByUserId: owner.userId, isVisible: true } });
    const supplementaryAsset = randomUUID(), pendingAsset = randomUUID();
    await client.pdfAsset.createMany({ data: [supplementaryAsset, pendingAsset].map((id, i) => ({
      id, objectKey: randomUUID() + '.pdf', originalFilename: 'reference.pdf', byteSize: 100,
      checksumSha256: 'fixture', pageCount: 1, state: i === 0 ? 'READY' as const : 'PENDING' as const,
      uploaderUserId: owner.userId, academyId, courseId: course.id, lectureId: lecture.id,
    })) });
    const supplementaryMaterial = randomUUID(), pendingMaterial = randomUUID();
    await client.material.createMany({ data: [supplementaryMaterial, pendingMaterial].map((id, i) => ({
      id, lectureId: lecture.id, title: 'Not a main lesson', position: 43 + i, type: 'PDF_DOCUMENT' as const, isVisible: true,
    })) });
    await client.pdfDocument.createMany({ data: [
      { materialId: supplementaryMaterial, assetId: supplementaryAsset, placement: 'SUPPLEMENTARY' },
      { materialId: pendingMaterial, assetId: pendingAsset, placement: 'MAIN' },
    ] });
    const extraCourses = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), academyId, title: 'ZZ additional ' + i, createdByUserId: owner.userId, isVisible: true }));
    await client.course.createMany({ data: extraCourses });
    await client.classCourse.createMany({ data: extraCourses.map(course => ({ classId, courseId: course.id, assignedByUserId: owner.userId })) });
    const extraModules = extraCourses.map(course => ({ id: randomUUID(), courseId: course.id, externalKey: randomUUID(), title: 'Another module', position: 1, isVisible: true }));
    await client.courseModule.createMany({ data: extraModules });
    const extraLectures = extraModules.map(module => ({ id: randomUUID(), courseModuleId: module.id, externalKey: randomUUID(), title: 'Another lecture', position: 1, isVisible: true }));
    await client.lecture.createMany({ data: extraLectures });
    const extraMaterials = extraLectures.map(lecture => ({ id: randomUUID(), lectureId: lecture.id, title: 'Another lesson', type: 'EXPLANATION' as const, position: 1, isVisible: true }));
    await client.material.createMany({ data: extraMaterials });
    await client.explanationMaterial.createMany({ data: extraMaterials.map(material => ({ materialId: material.id, body: '<p>Another lesson</p>' })) });
    statements = 0;
    const large = await classroom.get(owner.identity, { academyId, classId });
    const largeCount = statements;
    statements = 0;
    await Promise.all([classroom.get(owner.identity, { academyId, classId }), monitoring.getClassRoster(owner.identity, { academyId, classId })]);
    const entryLarge = statements;
    expect(entryLarge).toBe(entrySmall);
    expect(entrySmall).toBe(22);
    expect(largeCount).toBe(smallCount);
    expect(smallCount).toBe(4);
    expect(large.courses.map(course => course.id)).not.toContain(unassigned.id);
    expect(large.courses).toHaveLength(6);
    expect(large.courses[0].modules).toHaveLength(1);
    expect(large.courses[0].modules[0].lectures[0].materials).toHaveLength(41);
    expect(Object.keys(large.courses[0].modules[0].lectures[0].materials[0]).sort()).toEqual(['id', 'title', 'type']);
    evidence.classroom = { small: smallCount, large: largeCount, entrySmall, entryLarge, courses: [1, 6], modules: [1, 6], lectures: [1, 6], lessons: [1, 46] };
  });

  it('inherits teaching scope for single-role Managers and Team Leads, scopes Teachers, and works without monitoring', async () => {
    const unassigned = await client.class.create({ data: { academyId, name: 'Unassigned', createdByUserId: people.get('MANAGER')!.userId } });
    await client.academyFeatureFlag.update({ where: { academyId_feature: { academyId, feature: 'TEACHER_LIVE_MONITORING' } }, data: { isEnabled: false } });
    for (const role of ['MANAGER', 'TEAM_LEAD'] as const) {
      expect((await classroom.get(people.get(role)!.identity, { academyId, classId: unassigned.id })).class.id).toBe(unassigned.id);
    }
    const teacher = people.get('TEACHER')!;
    expect((await classroom.get(teacher.identity, { academyId, classId })).class.id).toBe(classId);
    await expect(classroom.get(teacher.identity, { academyId, classId: unassigned.id })).rejects.toMatchObject({ code: 'MONITORING_ACCESS_DENIED' });
    await client.classAssistantTeacher.create({ data: { classId: unassigned.id, membershipId: teacher.membershipId } });
    expect((await classroom.get(teacher.identity, { academyId, classId: unassigned.id })).class.id).toBe(unassigned.id);
    await expect(classroom.get(people.get('STUDENT')!.identity, { academyId, classId })).rejects.toBeDefined();
    await expect(classroom.get(teacher.identity, { academyId: otherAcademyId, classId })).rejects.toBeDefined();
    await client.class.update({ where: { id: unassigned.id }, data: { status: 'ARCHIVED' } });
    await expect(classroom.get(people.get('MANAGER')!.identity, { academyId, classId: unassigned.id })).rejects.toMatchObject({ code: 'MONITORING_ACCESS_DENIED' });
  });

  it('uses additional roles and rejects foreign, archived and suspended scopes', async () => {
    const teacher = people.get('TEACHER')!;
    await client.academyMembershipRole.create({ data: { membershipId: teacher.membershipId, role: 'TEAM_LEAD' } });
    const activeClass = await client.class.create({ data: { academyId, name: 'Active during suspension', createdByUserId: people.get('MANAGER')!.userId } });
    const before = await classes.get(teacher.identity, { academyId, classId });
    await classes.setSchedule(teacher.identity, { academyId, classId, slots: [], expectedUpdatedAt: before.updatedAt });
    await expect(classes.setSchedule(teacher.identity, { academyId: otherAcademyId, classId, slots: [], expectedUpdatedAt: before.updatedAt })).rejects.toBeDefined();
    await client.class.update({ where: { id: classId }, data: { status: 'ARCHIVED' } });
    const archived = await classes.get(teacher.identity, { academyId, classId });
    await expect(classes.setSchedule(teacher.identity, { academyId, classId, slots: [], expectedUpdatedAt: archived.updatedAt })).rejects.toMatchObject({ code: 'CLASS_ARCHIVED' });
    await client.academyMembership.update({ where: { id: teacher.membershipId }, data: { status: 'SUSPENDED' } });
    await expect(classes.setSchedule(teacher.identity, { academyId, classId, slots: [], expectedUpdatedAt: archived.updatedAt })).rejects.toBeDefined();
    await expect(classroom.get(teacher.identity, { academyId, classId: activeClass.id })).rejects.toBeDefined();
  });
});
