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
import { ClassesService } from './classes.service.js';

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)('class feedback against disposable PostgreSQL', () => {
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }), log: [{ emit: 'event', level: 'query' }] });
  const prisma = client as unknown as PrismaService;
  const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
  const media = { signMany: vi.fn().mockResolvedValue([]) } as never;
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
    expect(small).toEqual({ teachingList: 4, teachingRoster: 13, managementDetail: 26 });
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

  it('uses additional roles and rejects foreign, archived and suspended scopes', async () => {
    const teacher = people.get('TEACHER')!;
    await client.academyMembershipRole.create({ data: { membershipId: teacher.membershipId, role: 'TEAM_LEAD' } });
    const before = await classes.get(teacher.identity, { academyId, classId });
    await classes.setSchedule(teacher.identity, { academyId, classId, slots: [], expectedUpdatedAt: before.updatedAt });
    await expect(classes.setSchedule(teacher.identity, { academyId: otherAcademyId, classId, slots: [], expectedUpdatedAt: before.updatedAt })).rejects.toBeDefined();
    await client.class.update({ where: { id: classId }, data: { status: 'ARCHIVED' } });
    const archived = await classes.get(teacher.identity, { academyId, classId });
    await expect(classes.setSchedule(teacher.identity, { academyId, classId, slots: [], expectedUpdatedAt: archived.updatedAt })).rejects.toMatchObject({ code: 'CLASS_ARCHIVED' });
    await client.academyMembership.update({ where: { id: teacher.membershipId }, data: { status: 'SUSPENDED' } });
    await expect(classes.setSchedule(teacher.identity, { academyId, classId, slots: [], expectedUpdatedAt: archived.updatedAt })).rejects.toBeDefined();
  });
});
