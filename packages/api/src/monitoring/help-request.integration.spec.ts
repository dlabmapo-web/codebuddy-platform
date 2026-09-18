import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { SupportGrantResolver } from '../authorization/support-grant.resolver.js';
import { LearningClassContextService } from '../learn/learning-class-context.service.js';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { MonitoringAccessService } from './monitoring-access.service.js';
import { HelpRequestRepository } from './help-request.repository.js';
import { HelpRequestService } from './help-request.service.js';
import { HelpRequestBroadcaster } from './help-request-broadcaster.js';
import type { MonitoringRevocationService } from './monitoring-revocation.service.js';
import type { HelpRequest } from '@cove/shared';

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!databaseUrl)('durable student help requests (PostgreSQL)', () => {
  let db: PrismaService;
  let service: HelpRequestService;
  let academyId: string, classId: string, materialId: string, otherMaterialId: string;
  let student: { identity: SupabaseIdentity; membershipId: string; userId: string };
  let teacher: typeof student, assistant: typeof student, stranger: typeof student;
  const changed = vi.fn().mockResolvedValue(undefined);
  const create = (overrides = {}) => service.requestHelp(student.identity, { academyId, classId, materialId, idempotencyKey: randomUUID(), ...overrides });
  const change = (row: HelpRequest, action: 'claim' | 'return' | 'resolve' | 'cancel', who = teacher) => service.change(who.identity, { academyId, requestId: row.id, expectedVersion: row.version, idempotencyKey: randomUUID() }, action);
  const list = () => service.listClassHelpRequests(teacher.identity, { academyId, classId, status: 'WAITING', limit: 50 });

  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }) as never);
    const organization = await db.organization.create({ data: { name: 'Help tests', slug: `help-${randomUUID()}` } });
    const academy = await db.academy.create({ data: { organizationId: organization.id, name: 'Help tests', slug: `help-${randomUUID()}`, status: 'ACTIVE' } });
    academyId = academy.id;
    async function member(role: 'TEACHER' | 'STUDENT') {
      const authUserId = randomUUID();
      const user = await db.user.create({ data: { authUserId, displayName: role, email: `${authUserId}@test.invalid`, status: 'ACTIVE' } });
      const membership = await db.academyMembership.create({ data: { academyId, userId: user.id, role, status: 'ACTIVE' } });
      return { identity: { authUserId, email: user.email } as SupabaseIdentity, membershipId: membership.id, userId: user.id };
    }
    student = await member('STUDENT'); teacher = await member('TEACHER'); assistant = await member('TEACHER'); stranger = await member('TEACHER');
    const cls = await db.class.create({ data: { academyId, name: 'Help class', createdByUserId: teacher.userId, teacherMembershipId: teacher.membershipId } });
    classId = cls.id;
    await db.classAssistantTeacher.create({ data: { classId, membershipId: assistant.membershipId } });
    await db.classEnrollment.create({ data: { classId, membershipId: student.membershipId, enrolledByUserId: teacher.userId } });
    await db.academyFeatureFlag.create({ data: { academyId, feature: 'TEACHER_LIVE_MONITORING', isEnabled: true } });
    const course = await db.course.create({ data: { academyId, title: 'Help course', isVisible: true, createdByUserId: teacher.userId } });
    await db.classCourse.create({ data: { classId, courseId: course.id, assignedByUserId: teacher.userId } });
    const chapter = await db.courseModule.create({ data: { courseId: course.id, externalKey: randomUUID(), title: 'Chapter', position: 1, isVisible: true } });
    const lecture = await db.lecture.create({ data: { courseModuleId: chapter.id, externalKey: randomUUID(), title: 'Lecture', position: 1, isVisible: true } });
    const material = await db.material.create({ data: { lectureId: lecture.id, title: 'Requested problem', type: 'PROGRAMMING_EXERCISE', programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY' } }, position: 1, isVisible: true } });
    materialId = material.id;
    otherMaterialId = (await db.material.create({ data: { lectureId: lecture.id, title: 'Other problem', type: 'PROGRAMMING_EXERCISE', programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY' } }, position: 2, isVisible: true } })).id;
    const access = new MonitoringAccessService(db, new AcademyAccessService(db, new SupportGrantResolver(db)));
    service = new HelpRequestService(db, new HelpRequestRepository(db), access, new LearningClassContextService(db), { changed } as unknown as HelpRequestBroadcaster, { onHelpScopeChanged: vi.fn() } as unknown as MonitoringRevocationService);
  }, 60_000);
  beforeEach(async () => {
    await db.helpRequestReceipt.deleteMany({ where: { actorRef: { in: [student, teacher, assistant, stranger].map(item => item.membershipId) } } });
    await db.studentHelpRequest.deleteMany({ where: { academyId } });
    await db.material.update({ where: { id: materialId }, data: { isVisible: true } });
    await db.academyMembership.update({ where: { id: teacher.membershipId }, data: { status: 'ACTIVE' } });
    await db.academyFeatureFlag.update({ where: { academyId_feature: { academyId, feature: 'TEACHER_LIVE_MONITORING' } }, data: { isEnabled: true } });
    changed.mockClear();
  });
  afterAll(async () => { await db?.$disconnect(); });

  it('handles 15 simultaneous students, retries, queue reads and teacher transitions', async () => {
    const members = Array.from({ length: 15 }, (_, index) => ({
      userId: randomUUID(), membershipId: randomUUID(), authUserId: randomUUID(),
      name: `Concurrent student ${index + 1}`,
    }));
    await db.user.createMany({ data: members.map(member => ({ id: member.userId, authUserId: member.authUserId, displayName: member.name, status: 'ACTIVE' as const })) });
    await db.academyMembership.createMany({ data: members.map(member => ({ id: member.membershipId, userId: member.userId, academyId, role: 'STUDENT' as const, status: 'ACTIVE' as const })) });
    await db.classEnrollment.createMany({ data: members.map(member => ({ classId, membershipId: member.membershipId, enrolledByUserId: teacher.userId })) });
    const identities = members.map(member => ({ authUserId: member.authUserId } as SupabaseIdentity));
    const inputs = members.map((_, index) => ({ academyId, classId, materialId: index % 2 ? otherMaterialId : materialId, idempotencyKey: randomUUID() }));
    const timings: Record<string, number[]> = {};
    async function timed<T>(phase: string, action: () => Promise<T>) {
      const start = performance.now();
      try { return await action(); }
      finally { (timings[phase] ??= []).push(performance.now() - start); }
    }
    const created = await Promise.all(identities.map((identity, index) => timed('create', () => service.requestHelp(identity, inputs[index]!))));
    expect(new Set(created.map(result => result.request!.id)).size).toBe(15);
    created.forEach((result, index) => {
      expect(result.conflict).toBe(false);
      expect(result.request).toMatchObject({ status: 'WAITING', studentMembershipRef: members[index]!.membershipId, materialId: inputs[index]!.materialId, studentName: members[index]!.name });
    });
    const queue = await list();
    expect(queue.waitingCount).toBe(15);
    expect(queue.requests).toHaveLength(15);
    expect(queue.requests.map(row => row.requestedAt)).toEqual(queue.requests.map(row => row.requestedAt).sort());
    // Retry all requests while both teachers refresh the two queue sections.
    const reads = [teacher, assistant].flatMap(who => (['WAITING', 'IN_PROGRESS'] as const).map(status => timed('queue read under load', () => service.listClassHelpRequests(who.identity, { academyId, classId, status, limit: 50 }))));
    const retried = await Promise.all(identities.map((identity, index) => timed('retry', () => service.requestHelp(identity, inputs[index]!))));
    await Promise.all(reads);
    expect(retried.map(result => result.request!.id)).toEqual(created.map(result => result.request!.id));
    expect(await db.studentHelpRequest.count({ where: { academyId } })).toBe(15);
    const selves = await Promise.all(identities.map(identity => timed('student read', () => service.getMyActiveHelpRequest(identity, { academyId, classId }))));
    expect(selves.map(result => result.request!.id)).toEqual(created.map(result => result.request!.id));
    const claimed = await Promise.all(created.map(result => timed('claim', () => change(result.request!, 'claim'))));
    expect(claimed.every(result => !result.conflict && result.request?.status === 'IN_PROGRESS')).toBe(true);
    expect((await list()).inProgressCount).toBe(15);
    const closed = await Promise.all(claimed.map((result, index) => timed('close', () => index % 2
      ? change(result.request!, 'resolve')
      : service.change(identities[index]!, { academyId, requestId: result.request!.id, expectedVersion: result.request!.version, idempotencyKey: randomUUID() }, 'cancel'))));
    expect(closed.every(result => !result.conflict)).toBe(true);
    expect(await db.studentHelpRequest.count({ where: { academyId, status: 'RESOLVED' } })).toBe(7);
    expect(await db.studentHelpRequest.count({ where: { academyId, status: 'CANCELLED' } })).toBe(8);
    expect(await list()).toMatchObject({ waitingCount: 0, inProgressCount: 0 });
    expect(await db.teacherMonitoringVisit.count({ where: { classId } })).toBe(0);
    process.stdout.write('15-student local PostgreSQL timings (ms): ' + JSON.stringify(Object.fromEntries(Object.entries(timings).map(([phase, values]) => {
      values.sort((a, b) => a - b);
      return [phase, { count: values.length, median: Math.round(values[Math.floor(values.length / 2)]!), max: Math.round(values.at(-1)!) }];
    }))) + '\n');
  }, 120_000);

  it('deduplicates concurrent tabs and preserves the requested problem', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => create({ materialId: index % 2 ? otherMaterialId : materialId })));
    expect(new Set(results.map(result => result.request!.id)).size).toBe(1);
    expect(new Set(results.map(result => result.request!.requestedAt)).size).toBe(1);
    expect(await db.studentHelpRequest.count({ where: { academyId } })).toBe(1);
  });
  it('enforces active uniqueness even outside the service', async () => {
    const row = (await create()).request!;
    await expect(db.studentHelpRequest.create({ data: { academyId, classId, studentMembershipRef: student.membershipId, materialRef: materialId } })).rejects.toMatchObject({ code: 'P2002' });
    await change(row, 'resolve');
    expect((await create()).request!.id).not.toBe(row.id);
  });
  it('has one winning teacher claim and preserves ownership across receipt retries', async () => {
    const row = (await create()).request!;
    const results = await Promise.all([change(row, 'claim'), change(row, 'claim', assistant)]);
    expect(results.filter(result => !result.conflict)).toHaveLength(1);
    const current = (await db.studentHelpRequest.findUniqueOrThrow({ where: { id: row.id } }));
    expect(current.status).toBe('IN_PROGRESS');
    expect(current.version).toBe(2);
    expect(await db.teacherMonitoringVisit.count({ where: { classId } })).toBe(0);
  });
  it('a delayed create retry cannot reopen a resolved request', async () => {
    const input = { academyId, classId, materialId, idempotencyKey: randomUUID() };
    const first = await service.requestHelp(student.identity, input);
    await change(first.request!, 'resolve');
    const retry = await service.requestHelp(student.identity, input);
    expect(retry.request!.id).toBe(first.request!.id);
    expect((await list()).waitingCount).toBe(0);
    expect(await db.studentHelpRequest.count({ where: { academyId } })).toBe(1);
  });
  it('returns and resolves a colleague request without creating a watch', async () => {
    const original = (await create()).request!;
    const claimed = (await change(original, 'claim')).request!;
    const returned = (await change(claimed, 'return', assistant)).request!;
    expect(returned.status).toBe('WAITING');
    expect(returned.requestedAt).toBe(original.requestedAt);
    expect(returned.teacherMembershipRef).toBeNull();
    expect((await change(returned, 'resolve', assistant)).request!.status).toBe('RESOLVED');
    expect(await db.auditLog.count({ where: { targetId: original.id, actorUserId: assistant.userId } })).toBe(2);
  });
  it('cancellation racing a claim produces one transition and a conflict', async () => {
    const row = (await create()).request!;
    const results = await Promise.all([change(row, 'claim'), change(row, 'cancel', student)]);
    expect(results.filter(result => result.conflict)).toHaveLength(1);
    expect(results.filter(result => !result.conflict)).toHaveLength(1);
  });
  it('rejects unassigned teachers, forged students, and wrong classes', async () => {
    const row = (await create()).request!;
    await expect(change(row, 'claim', stranger)).rejects.toMatchObject({ code: 'MONITORING_ACCESS_DENIED' });
    await expect(service.getMyActiveHelpRequest(stranger.identity, { academyId, classId })).rejects.toMatchObject({ code: 'MONITORING_ACCESS_DENIED' });
    await expect(create({ classId: randomUUID() })).rejects.toMatchObject({ code: 'MONITORING_ACCESS_DENIED' });
    await expect(service.listClassHelpRequests(stranger.identity, { academyId, classId, status: 'WAITING', limit: 10 })).rejects.toMatchObject({ code: 'MONITORING_ACCESS_DENIED' });
  });
  it('releases revoked owners and cancels inaccessible problems without leaking titles', async () => {
    const row = (await change((await create()).request!, 'claim')).request!;
    await db.academyMembership.update({ where: { id: teacher.membershipId }, data: { status: 'SUSPENDED' } });
    await service.reconcileScope({ teacherMembershipRef: teacher.membershipId });
    expect((await service.getMyActiveHelpRequest(student.identity, { academyId, classId })).request!.status).toBe('WAITING');
    await db.material.update({ where: { id: materialId }, data: { isVisible: false } });
    const self = await service.getMyActiveHelpRequest(student.identity, { academyId, classId });
    expect(self.request).toBeNull();
    expect(self.latestClosed).toMatchObject({ id: row.id, status: 'CANCELLED', closeReason: 'SCOPE_UNAVAILABLE', problemTitle: null, studentName: null });
  });
  it('disabling monitoring rejects operations without deleting waiting requests', async () => {
    await create();
    await db.academyFeatureFlag.update({ where: { academyId_feature: { academyId, feature: 'TEACHER_LIVE_MONITORING' } }, data: { isEnabled: false } });
    await expect(list()).rejects.toMatchObject({ code: 'MONITORING_DISABLED' });
    expect(await db.studentHelpRequest.count({ where: { academyId, status: 'WAITING' } })).toBe(1);
  });
  it('pages the full authorized queue with stable timestamp ties and complete counts', async () => {
    const members = Array.from({ length: 52 }, () => ({ userId: randomUUID(), membershipId: randomUUID() }));
    await db.user.createMany({ data: members.map(member => ({ id: member.userId, authUserId: randomUUID(), status: 'ACTIVE' as const })) });
    await db.academyMembership.createMany({ data: members.map(member => ({ id: member.membershipId, userId: member.userId, academyId, role: 'STUDENT' as const, status: 'ACTIVE' as const })) });
    await db.classEnrollment.createMany({ data: members.map(member => ({ classId, membershipId: member.membershipId, enrolledByUserId: teacher.userId })) });
    const requestedAt = new Date('2026-09-18T00:00:00Z');
    await db.studentHelpRequest.createMany({ data: members.map(member => ({ academyId, classId, studentMembershipId: member.membershipId, studentMembershipRef: member.membershipId, materialId, materialRef: materialId, requestedAt })) });
    const first = await list();
    expect(first.requests).toHaveLength(50);
    expect(first.waitingCount).toBe(52);
    const second = await service.listClassHelpRequests(teacher.identity, { academyId, classId, status: 'WAITING', limit: 50, cursor: first.nextCursor! });
    expect(second.requests).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.requests, ...second.requests].map(row => row.id)).size).toBe(52);
  });
  it('replays a claim receipt without taking a second turn and rejects key reuse', async () => {
    const row = (await create()).request!;
    const input = { academyId, requestId: row.id, expectedVersion: row.version, idempotencyKey: randomUUID() };
    const first = await service.change(teacher.identity, input, 'claim');
    const second = await service.change(teacher.identity, input, 'claim');
    expect(second.request).toEqual(first.request);
    expect(await db.auditLog.count({ where: { targetId: row.id } })).toBe(2);
    await expect(service.change(teacher.identity, input, 'resolve')).rejects.toMatchObject({ code: 'MONITORING_HELP_KEY_REUSED' });
  });
  it('removing enrollment cancels active requests through the revocation hook', async () => {
    const row = (await create()).request!;
    await db.classEnrollment.delete({ where: { classId_membershipId: { classId, membershipId: student.membershipId } } });
    try {
      await service.reconcileScope({ classId, studentMembershipRef: student.membershipId });
      expect(await db.studentHelpRequest.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'CANCELLED', closeReason: 'SCOPE_UNAVAILABLE' });
      expect((await list()).waitingCount).toBe(0);
    } finally {
      await db.classEnrollment.create({ data: { classId, membershipId: student.membershipId, enrolledByUserId: teacher.userId } });
    }
  });
  it('notifications fail independently of durable commits', async () => {
    changed.mockRejectedValueOnce(new Error('transport down'));
    const result = await create();
    expect(result.request!.status).toBe('WAITING');
    expect((await list()).requests[0]!.id).toBe(result.request!.id);
  });
});
