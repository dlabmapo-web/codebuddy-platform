import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { ChangeHelpRequestInput, HelpMutationResult } from '@cove/shared';
import { createHash } from 'node:crypto';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, StudentHelpRequest } from '../generated/prisma/client.js';
import { assignedClassWhere, classStudentWhere, classTaughtMaterialWhere, taughtByWhere } from '../classes/assigned-class-access.js';
import { holdsRoleWhere } from '../authorization/membership-roles.js';
import { LearningClassContextService } from '../learn/learning-class-context.service.js';
import { MonitoringAccessService, type MonitoringTeacherActor } from './monitoring-access.service.js';
import { MonitoringRevocationService } from './monitoring-revocation.service.js';
import { HelpRequestRepository, activeHelpStates, type HelpScope, type HelpTransaction } from './help-request.repository.js';
import { HelpRequestBroadcaster } from './help-request-broadcaster.js';

type ClassInput = { academyId: string; classId: string };
type Action = 'claim' | 'return' | 'resolve' | 'cancel';
const denied = () => new AppException('MONITORING_ACCESS_DENIED', HttpStatus.FORBIDDEN);

@Injectable()
export class HelpRequestService implements OnModuleInit {
  private readonly logger = new Logger(HelpRequestService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: HelpRequestRepository,
    private readonly access: MonitoringAccessService,
    private readonly classContext: LearningClassContextService,
    private readonly broadcaster: HelpRequestBroadcaster,
    private readonly revocation: MonitoringRevocationService,
  ) {}

  onModuleInit() { this.revocation.onHelpScopeChanged(scope => this.reconcileScope(scope)); }

  private async notify(rows: StudentHelpRequest[]) {
    const unique = new Map(rows.map(row => [`${row.classId}:${row.studentMembershipRef}`, row]));
    await Promise.all([...unique.values()].map(row => this.broadcaster.changed(row).catch(() => {
      this.logger.warn('Help request notification unavailable; durable refresh will recover.');
    })));
  }

  async reconcileScope(scope: HelpScope) {
    const classes = await this.prisma.studentHelpRequest.findMany({ where: { ...scope, status: { in: [...activeHelpStates] } }, distinct: ['classId'], select: { classId: true } });
    for (const { classId } of classes) {
      const changed = await this.repository.transaction(classId, tx => this.repository.reconcile(tx, { ...scope, classId }));
      await this.notify(changed);
    }
  }

  private async teacher(identity: SupabaseIdentity, academyId: string) {
    await this.access.requireFeature(academyId);
    const actor = await this.access.requireTeacher(identity, academyId);
    this.access.requireLiveWatch(actor);
    return actor;
  }

  private async requireTeacherClass(tx: HelpTransaction, actor: MonitoringTeacherActor, classId: string) {
    if (!await tx.class.findFirst({ where: { id: classId, ...assignedClassWhere(actor) }, select: { id: true } })) throw denied();
  }

  private async requireStudentClass(tx: HelpTransaction, input: ClassInput, membershipId: string) {
    if (!await tx.class.findFirst({ where: { id: input.classId, academyId: input.academyId, status: 'ACTIVE', academy: { status: 'ACTIVE' } }, select: { id: true } }) ||
      !await tx.academyMembership.findFirst({ where: { id: membershipId, ...classStudentWhere(input.academyId, input.classId) }, select: { id: true } })) throw denied();
  }

  async getMyActiveHelpRequest(identity: SupabaseIdentity, input: ClassInput) {
    await this.access.requireFeature(input.academyId);
    const self = await this.access.requireStudentSelf(identity, input.academyId);
    const result = await this.repository.transaction(input.classId, async tx => {
      await this.requireStudentClass(tx, input, self.membershipId);
      const changed = await this.repository.reconcile(tx, { ...input, studentMembershipRef: self.membershipId });
      const where = { ...input, studentMembershipRef: self.membershipId };
      const request = await tx.studentHelpRequest.findFirst({ where: { ...where, status: { in: [...activeHelpStates] } } });
      const latestClosed = await tx.studentHelpRequest.findFirst({ where: { ...where, status: { in: ['RESOLVED', 'CANCELLED'] } }, orderBy: [{ closedAt: 'desc' }, { id: 'desc' }] });
      const teacherAssigned = !!await tx.class.findFirst({ where: { id: input.classId, ...taughtByWhere({ status: 'ACTIVE', ...holdsRoleWhere('TEACHER'), user: { status: 'ACTIVE' } }) }, select: { id: true } });
      return { changed, value: { request: request ? await this.repository.project(tx, request) : null, latestClosed: latestClosed ? await this.repository.project(tx, latestClosed) : null, teacherAssigned, serverTime: new Date().toISOString() } };
    });
    await this.notify(result.changed);
    return result.value;
  }

  async listClassHelpRequests(identity: SupabaseIdentity, input: ClassInput & { status: 'WAITING' | 'IN_PROGRESS'; cursor?: { time: string; id: string }; limit: number }) {
    const actor = await this.teacher(identity, input.academyId);
    const result = await this.repository.transaction(input.classId, async tx => {
      await this.requireTeacherClass(tx, actor, input.classId);
      const changed = await this.repository.reconcile(tx, { academyId: input.academyId, classId: input.classId });
      const scope = { academyId: input.academyId, classId: input.classId };
      const timeField = input.status === 'WAITING' ? 'requestedAt' : 'claimedAt';
      const cursor = input.cursor;
      const rows = await tx.studentHelpRequest.findMany({ where: { ...scope, status: input.status,
        ...(cursor ? { OR: [{ [timeField]: { gt: new Date(cursor.time) } }, { [timeField]: new Date(cursor.time), id: { gt: cursor.id } }] } : {}),
      }, orderBy: [{ [timeField]: 'asc' }, { id: 'asc' }], take: input.limit + 1 });
      const hasMore = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return { changed, value: {
        requests: await this.repository.projectMany(tx, page),
        waitingCount: await tx.studentHelpRequest.count({ where: { ...scope, status: 'WAITING' } }),
        inProgressCount: await tx.studentHelpRequest.count({ where: { ...scope, status: 'IN_PROGRESS' } }),
        nextCursor: hasMore && last ? { time: (last[timeField] ?? last.requestedAt).toISOString(), id: last.id } : null,
        serverTime: new Date().toISOString(),
      } };
    });
    await this.notify(result.changed);
    return result.value;
  }

  async requestHelp(identity: SupabaseIdentity, input: ClassInput & { materialId: string; idempotencyKey: string }): Promise<HelpMutationResult> {
    await this.access.requireFeature(input.academyId);
    const self = await this.access.requireStudentSelf(identity, input.academyId);
    const result = await this.repository.transaction(input.classId, async tx => {
      await this.requireStudentClass(tx, input, self.membershipId);
      const changed = await this.repository.reconcile(tx, { academyId: input.academyId, classId: input.classId, studentMembershipRef: self.membershipId });
      const value = await this.receipt(tx, self.membershipId, input.idempotencyKey, { action: 'request', ...input }, async () => {
        const material = await tx.material.findFirst({ where: { id: input.materialId, type: 'PROGRAMMING_EXERCISE', ...classTaughtMaterialWhere(input.academyId, input.classId) }, select: { lecture: { select: { courseModule: { select: { courseId: true } } } } } });
        if (!material) throw denied();
        await this.classContext.resolveWith(tx, { academyId: input.academyId, userId: self.userId, courseId: material.lecture.courseModule.courseId, requestedClassId: input.classId });
        let row = await tx.studentHelpRequest.findFirst({ where: { academyId: input.academyId, classId: input.classId, studentMembershipRef: self.membershipId, status: { in: [...activeHelpStates] } } });
        if (!row) {
          row = await tx.studentHelpRequest.create({ data: { academyId: input.academyId, classId: input.classId, studentMembershipId: self.membershipId, studentMembershipRef: self.membershipId, materialId: input.materialId, materialRef: input.materialId } });
          await this.repository.audit(tx, self.userId, null, row);
          changed.push(row);
        }
        return { conflict: false, row };
      });
      return { changed, value };
    });
    await this.notify(result.changed);
    return result.value;
  }

  async change(identity: SupabaseIdentity, input: ChangeHelpRequestInput, action: Action): Promise<HelpMutationResult> {
    await this.access.requireFeature(input.academyId);
    const self = action === 'cancel' ? await this.access.requireStudentSelf(identity, input.academyId) : null;
    const actor = self ? null : await this.teacher(identity, input.academyId);
    const original = await this.prisma.studentHelpRequest.findFirst({ where: { id: input.requestId, academyId: input.academyId, ...(self ? { studentMembershipRef: self.membershipId } : {}) } });
    if (!original) throw denied();
    const result = await this.repository.transaction(original.classId, async tx => {
      if (actor) await this.requireTeacherClass(tx, actor, original.classId);
      // Self-cancellation intentionally does not require access to the old material.
      const changed = await this.repository.reconcile(tx, { academyId: input.academyId, classId: original.classId });
      const value = await this.receipt(tx, (self ?? actor)!.membershipId, input.idempotencyKey, { action, ...input }, async () => {
        const row = await tx.studentHelpRequest.findUniqueOrThrow({ where: { id: original.id } });
        const permitted = action === 'claim' ? row.status === 'WAITING' : action === 'return' ? row.status === 'IN_PROGRESS' : activeHelpStates.some(status => status === row.status);
        if (row.version !== input.expectedVersion || !permitted) return { conflict: true, row };
        const now = new Date();
        const data: Prisma.StudentHelpRequestUncheckedUpdateInput = action === 'claim'
          ? { status: 'IN_PROGRESS', claimedAt: now, teacherMembershipId: actor!.membershipId, teacherMembershipRef: actor!.membershipId }
          : { status: action === 'return' ? 'WAITING' : action === 'resolve' ? 'RESOLVED' : 'CANCELLED', teacherMembershipId: null, teacherMembershipRef: null, claimedAt: null,
              ...(action !== 'return' ? { closedAt: now, closedByRef: (self ?? actor)!.membershipId, closeReason: action === 'resolve' ? 'TEACHER_RESOLVED' : 'STUDENT_CANCELLED' } : {}) };
        const next = await tx.studentHelpRequest.update({ where: { id: row.id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
        await this.repository.audit(tx, (self ?? actor)!.userId, row, next);
        changed.push(next);
        return { conflict: false, row: next };
      });
      return { changed, value };
    });
    await this.notify(result.changed);
    return result.value;
  }

  private async receipt(tx: HelpTransaction, actorRef: string, key: string, input: object, run: () => Promise<{ conflict: boolean; row: StudentHelpRequest }>): Promise<HelpMutationResult> {
    // Key locking also covers concurrent misuse across classes.
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text', `help-receipt:${actorRef}:${key}`);
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous = await tx.helpRequestReceipt.findUnique({ where: { actorRef_key: { actorRef, key } } });
    if (previous && previous.fingerprint !== fingerprint) throw new AppException('MONITORING_HELP_KEY_REUSED', HttpStatus.BAD_REQUEST);
    let result: { conflict: boolean; row: StudentHelpRequest };
    if (previous) {
      const saved = previous.result as unknown as { conflict: boolean; row: StudentHelpRequest };
      result = { conflict: saved.conflict, row: { ...saved.row, requestedAt: new Date(saved.row.requestedAt), updatedAt: new Date(saved.row.updatedAt), claimedAt: saved.row.claimedAt ? new Date(saved.row.claimedAt) : null, closedAt: saved.row.closedAt ? new Date(saved.row.closedAt) : null } };
      // A receipt is not permission to reveal a revoked material. Project current
      // scope invalidation even when returning the recorded operation outcome.
      const current = await tx.studentHelpRequest.findUnique({ where: { id: result.row.id } });
      if (current?.closeReason === 'SCOPE_UNAVAILABLE') result.row = current;
    } else {
      result = await run();
      await tx.helpRequestReceipt.create({ data: { actorRef, key, fingerprint, result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue } });
    }
    return { conflict: result.conflict, request: await this.repository.project(tx, result.row), serverTime: new Date().toISOString() };
  }
}
