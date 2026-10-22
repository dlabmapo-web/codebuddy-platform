import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { SupportGrantResolver } from '../authorization/support-grant.resolver.js';
import { MonitoringAccessService } from '../monitoring/monitoring-access.service.js';
import { TeacherOverviewAccessService } from '../teach/teacher-overview-access.service.js';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { assignedClassWhere, academyTeachingClassWhere } from './assigned-class-access.js';

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!databaseUrl).each(['MANAGER', 'TEAM_LEAD'] as const)('%s academy class access (PostgreSQL)', role => {
  let db: PrismaService, access: MonitoringAccessService, overview: TeacherOverviewAccessService;
  let academyId: string, membershipId: string, userId: string;
  let ownClass: string, otherClass: string, archivedClass: string;
  let identity: SupabaseIdentity;

  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }));
    const organization = await db.organization.create({ data: { name: 'Manager access', slug: randomUUID() } });
    const academy = await db.academy.create({ data: { organizationId: organization.id, name: 'Own academy', slug: randomUUID(), status: 'ACTIVE' } });
    const other = await db.academy.create({ data: { organizationId: organization.id, name: 'Other academy', slug: randomUUID(), status: 'ACTIVE' } });
    academyId = academy.id;
    const authUserId = randomUUID();
    const user = await db.user.create({ data: { authUserId, displayName: 'Manager', status: 'ACTIVE' } });
    userId = user.id;
    identity = { authUserId } as SupabaseIdentity;
    membershipId = (await db.academyMembership.create({ data: { academyId, userId, role, status: 'ACTIVE' } })).id;
    ownClass = (await db.class.create({ data: { academyId, name: 'No assigned teacher', createdByUserId: userId } })).id;
    archivedClass = (await db.class.create({ data: { academyId, name: 'Archived', status: 'ARCHIVED', createdByUserId: userId } })).id;
    otherClass = (await db.class.create({ data: { academyId: other.id, name: 'Foreign', createdByUserId: userId } })).id;
    const academyAccess = new AcademyAccessService(db, new SupportGrantResolver(db));
    access = new MonitoringAccessService(db, academyAccess);
    overview = new TeacherOverviewAccessService(db, academyAccess);
  });
  afterAll(async () => { await db?.$disconnect(); });

  it('lists only own active classes without changing assignments, for monitoring and analytics', async () => {
    const actor = await access.requireTeacher(identity, academyId);
    const analyticsActor = await overview.requireTeacher(identity, academyId);
    expect(actor.scope).toBe('academy-staff');
    expect(analyticsActor.scope).toBe('academy-staff');
    const permissions = new AcademyAccessService(db, new SupportGrantResolver(db));
    if (role === 'TEAM_LEAD') {
      for (const permission of ['academy.settings.manage', 'academy.members.credentials.manage'] as const) {
        await expect(permissions.requirePermission(identity.authUserId, academyId, permission)).rejects.toBeDefined();
      }
    }
    expect(() => access.requireLiveWatch(actor)).not.toThrow();
    const classes = await db.class.findMany({ where: assignedClassWhere(actor) });
    expect(classes.map(row => row.id)).toEqual([ownClass]);
    expect(classes[0]!.teacherMembershipId).toBeNull();
    await expect(access.requireAssignedClass(actor, ownClass)).resolves.toMatchObject({ classId: ownClass });
    for (const classId of [otherClass, archivedClass]) {
      await expect(access.requireAssignedClass(actor, classId)).rejects.toMatchObject({ code: 'MONITORING_ACCESS_DENIED' });
    }
  });

  it('rechecks stale academy-staff claims after demotion, suspension, user suspension and academy suspension', async () => {
    const actor = await access.requireTeacher(identity, academyId);
    const where = () => academyTeachingClassWhere({ academyId, membershipId, userId });
    for (const data of [{ role: 'TEACHER' as const }, { status: 'SUSPENDED' as const }]) {
      await db.academyMembership.update({ where: { id: membershipId }, data });
      expect(await db.class.findMany({ where: where() })).toEqual([]);
      await expect(access.requireAssignedClass(actor, ownClass)).rejects.toMatchObject({ code: 'MONITORING_ACCESS_DENIED' });
      await db.academyMembership.update({ where: { id: membershipId }, data: { role, status: 'ACTIVE' } });
    }
    await db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    expect(await db.class.findMany({ where: where() })).toEqual([]);
    await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    await db.academy.update({ where: { id: academyId }, data: { status: 'SUSPENDED' } });
    expect(await db.class.findMany({ where: where() })).toEqual([]);
    await db.academy.update({ where: { id: academyId }, data: { status: 'ACTIVE' } });
    expect(await db.class.count({ where: where() })).toBe(1);
  });
});
