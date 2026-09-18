import { Injectable } from '@nestjs/common';
import type { HelpRequest } from '@cove/shared';
import { holdsRoleWhere } from '../authorization/membership-roles.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, StudentHelpRequest } from '../generated/prisma/client.js';
import { classStudentWhere, classTaughtMaterialWhere } from '../classes/assigned-class-access.js';

export type HelpScope = { academyId?: string; classId?: string; studentMembershipRef?: string; teacherMembershipRef?: string };
export const activeHelpStates = ['WAITING', 'IN_PROGRESS'] as const;
export type HelpTransaction = Prisma.TransactionClient;

@Injectable()
export class HelpRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  // A class lock serializes mutations, receipts, and reconciliation on all API
  // instances. The partial unique index also protects writes outside this path.
  transaction<T>(classId: string, action: (tx: HelpTransaction) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text', `help-class:${classId}`);
      return action(tx);
    }, { timeout: 20_000 });
  }

  async reconcile(tx: HelpTransaction, scope: HelpScope): Promise<StudentHelpRequest[]> {
    const rows = await tx.studentHelpRequest.findMany({ where: { ...scope, status: { in: [...activeHelpStates] } } });
    const changed: StudentHelpRequest[] = [];
    // Reconciliation is batched per class, not three network round trips per
    // student on every queue refresh. Revocation callers also use this boundary.
    for (const classId of new Set(rows.map(row => row.classId))) {
      const group = rows.filter(row => row.classId === classId);
      const academyId = group[0]!.academyId;
      const cls = await tx.class.findFirst({
        where: { id: classId, academyId, status: 'ACTIVE', academy: { status: 'ACTIVE' } },
        select: { teacherMembershipId: true, assistantTeachers: { select: { membershipId: true } } },
      });
      const studentIds = new Set(cls ? (await tx.academyMembership.findMany({
        where: { id: { in: group.map(row => row.studentMembershipRef) }, ...classStudentWhere(academyId, classId) }, select: { id: true },
      })).map(row => row.id) : []);
      const materialIds = new Set(cls ? (await tx.material.findMany({
        where: { id: { in: group.map(row => row.materialRef) }, ...classTaughtMaterialWhere(academyId, classId) }, select: { id: true },
      })).map(row => row.id) : []);
      const assignedIds = cls ? [cls.teacherMembershipId, ...cls.assistantTeachers.map(row => row.membershipId)].filter((id): id is string => !!id) : [];
      const teacherIds = new Set(assignedIds.length ? (await tx.academyMembership.findMany({
        where: { id: { in: assignedIds }, academyId, status: 'ACTIVE', ...holdsRoleWhere('TEACHER'), user: { status: 'ACTIVE' } }, select: { id: true },
      })).map(row => row.id) : []);
      for (const row of group) {
        let data: Prisma.StudentHelpRequestUpdateInput | null = null;
        if (!studentIds.has(row.studentMembershipRef) || !materialIds.has(row.materialRef)) {
          data = { status: 'CANCELLED', closedAt: new Date(), closeReason: 'SCOPE_UNAVAILABLE', teacherMembershipRef: null, teacherMembership: { disconnect: true }, claimedAt: null };
        } else if (row.teacherMembershipRef && !teacherIds.has(row.teacherMembershipRef)) {
          data = { status: 'WAITING', teacherMembershipRef: null, teacherMembership: { disconnect: true }, claimedAt: null };
        }
        if (data) {
          const next = await tx.studentHelpRequest.update({ where: { id: row.id }, data: { ...data, version: { increment: 1 } } });
          await this.audit(tx, null, row, next);
          changed.push(next);
        }
      }
    }
    return changed;
  }

  async audit(tx: HelpTransaction, actorUserId: string | null, before: StudentHelpRequest | null, after: StudentHelpRequest) {
    await tx.auditLog.create({ data: {
      actorUserId, academyId: after.academyId, action: 'student.help_request.changed',
      targetType: 'StudentHelpRequest', targetId: after.id,
      before: before ? { status: before.status, version: before.version, teacherMembershipRef: before.teacherMembershipRef } : undefined,
      after: { status: after.status, version: after.version, teacherMembershipRef: after.teacherMembershipRef }, reason: after.closeReason,
    } });
  }

  async project(tx: HelpTransaction, row: StudentHelpRequest): Promise<HelpRequest> {
    return (await this.projectMany(tx, [row]))[0]!;
  }

  async projectMany(tx: HelpTransaction, rows: StudentHelpRequest[]): Promise<HelpRequest[]> {
    if (!rows.length) return [];
    const visible = rows.filter(row => row.closeReason !== 'SCOPE_UNAVAILABLE');
    const membershipIds = visible.flatMap(row => [row.studentMembershipRef, ...(row.teacherMembershipRef ? [row.teacherMembershipRef] : [])]);
    const members = await tx.academyMembership.findMany({ where: { id: { in: membershipIds } }, select: { id: true, user: { select: { displayName: true } } } });
    const names = new Map(members.map(member => [member.id, member.user.displayName]));
    const titles = new Map<string, string>();
    for (const classId of new Set(visible.map(row => row.classId))) {
      const group = visible.filter(row => row.classId === classId);
      const materials = await tx.material.findMany({ where: { id: { in: group.map(row => row.materialRef) }, ...classTaughtMaterialWhere(group[0]!.academyId, classId) }, select: { id: true, title: true } });
      for (const material of materials) titles.set(`${classId}:${material.id}`, material.title);
    }
    return rows.map(row => ({
      id: row.id, academyId: row.academyId, classId: row.classId, studentMembershipRef: row.studentMembershipRef,
      studentName: row.closeReason === 'SCOPE_UNAVAILABLE' ? null : names.get(row.studentMembershipRef) ?? null,
      materialId: row.materialRef, problemTitle: row.closeReason === 'SCOPE_UNAVAILABLE' ? null : titles.get(`${row.classId}:${row.materialRef}`) ?? null,
      teacherMembershipRef: row.teacherMembershipRef, teacherName: row.teacherMembershipRef ? names.get(row.teacherMembershipRef) ?? null : null,
      status: row.status, version: row.version, requestedAt: row.requestedAt.toISOString(), claimedAt: row.claimedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null, closeReason: row.closeReason,
    }));
  }
}
