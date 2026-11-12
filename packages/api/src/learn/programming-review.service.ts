import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { effectiveAcademyRoles, roleCanTeachAcademy, rolesHavePermission, programmingReviewInputSchema, type ProgrammingReviewInput } from '@cove/shared';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { AcademyAccessService, type AcademyAccess } from '../authorization/academy-access.service.js';
import { assignedClassWhere, classTaughtMaterialWhere, type AssignedClassActor } from '../classes/assigned-class-access.js';
import { AuditService } from '../academies/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MonitoringRevocationService } from '../monitoring/monitoring-revocation.service.js';
import { programmingAssessment } from './programming-assessment.js';

type Target = {academyId: string; classId: string; submissionId: string};
@Injectable()
export class ProgrammingReviewService {
  constructor(private readonly db: PrismaService, private readonly access: AcademyAccessService,
    private readonly audit: AuditService, private readonly events: MonitoringRevocationService) {}

  private async authorized(db: Prisma.TransactionClient, actor: AcademyAccess, input: Target) {
    if (actor.via !== 'membership') throw new ForbiddenException();
    const member = await db.academyMembership.findFirst({
      where: {academyId: input.academyId, userId: actor.userId, status: 'ACTIVE',
        user: {status: 'ACTIVE'}, academy: {status: 'ACTIVE'}},
      select: {id: true, role: true, extraRoles: {select: {role: true}}},
    });
    if (!member) throw new ForbiddenException();
    const roles = effectiveAcademyRoles(member.role, member.extraRoles.map(r => r.role));
    if (!rolesHavePermission(roles, 'submissions.assigned.review')) throw new ForbiddenException();
    const scope: AssignedClassActor = {userId: actor.userId, academyId: input.academyId, membershipId: member.id,
      ...(roles.some(roleCanTeachAcademy) ? {scope: 'academy-staff' as const} : {})};
    const submission = await db.submission.findFirst({where: {
      id: input.submissionId, classId: input.classId, submissionPolicy: 'MANUAL_REVIEW', status: 'RECORDED',
      course: {academyId: input.academyId},
      material: {is: classTaughtMaterialWhere(input.academyId, input.classId)},
    }, select: {id:true,classId:true,userId:true,sourceMaterialId:true,reviewVersion:true,
      manualAssessmentSnapshot:true,manualReviewResult:true}});
    if (!submission) throw new NotFoundException();
    const group = await db.class.findFirst({where: {
      id: submission.classId!, ...assignedClassWhere(scope),
      enrollments: {some: {membership: {userId: submission.userId, academyId: input.academyId,
        role: 'STUDENT', status: 'ACTIVE', user: {status: 'ACTIVE'}}}},
    }, select: {id: true}});
    if (!group) throw new NotFoundException();
    return submission;
  }

  private async view(db: Prisma.TransactionClient, submission: Awaited<ReturnType<ProgrammingReviewService['authorized']>>) {
    const reviews = await db.programmingSubmissionReview.findMany({where: {submissionId: submission.id},
      orderBy: {version: 'desc'}, take: 100, select: {version: true, scoreHundredths: true, completed: true,
        feedback: true, reason: true, reviewerName: true, createdAt: true,
        previousScoreHundredths: true, deltaHundredths: true}});
    return {canPublishReview: true, assessment: programmingAssessment(submission),
      reviews: reviews.map(r => ({...r, createdAt: r.createdAt.toISOString()}))};
  }

  async get(identity: SupabaseIdentity, input: Target) {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, 'submissions.assigned.review');
    return this.view(this.db, await this.authorized(this.db, actor, input));
  }

  async publish(identity: SupabaseIdentity, requested: ProgrammingReviewInput) {
    // Correction notes are optional; versions and audit history still record every update.
    const input = programmingReviewInputSchema.parse(requested);
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, 'submissions.assigned.review');
    if (actor.via !== 'membership') throw new ForbiddenException();
    const saved = await this.db.$transaction(async tx => {
      // Hold the actual grant rows through commit, and serialize assessment writes.
      // Administrative mutations of these rows wait rather than racing a stale open panel.
      await tx.$queryRaw`SELECT am.id FROM academy_memberships am JOIN users u ON u.id=am.user_id
        JOIN academies a ON a.id=am.academy_id
        WHERE am.user_id=${actor.userId}::uuid AND am.academy_id=${input.academyId}::uuid
        FOR SHARE OF am,u,a`;
      await tx.$queryRaw`SELECT membership_id FROM academy_membership_roles
        WHERE membership_id IN (SELECT id FROM academy_memberships WHERE user_id=${actor.userId}::uuid AND academy_id=${input.academyId}::uuid) FOR SHARE`;
      await tx.$queryRaw`SELECT s.id FROM submissions s JOIN classes cl ON cl.id=s.class_id
        JOIN class_courses cc ON cc.class_id=cl.id AND cc.course_id=s.course_id
        JOIN academy_memberships sm ON sm.user_id=s.user_id AND sm.academy_id=${input.academyId}::uuid
        JOIN users su ON su.id=sm.user_id
        JOIN class_enrollments ce ON ce.membership_id=sm.id AND ce.class_id=cl.id
        JOIN materials m ON m.id=s.material_id JOIN lectures l ON l.id=m.lecture_id
        JOIN course_modules cm ON cm.id=l.course_module_id JOIN courses c ON c.id=cm.course_id
        WHERE s.id=${input.submissionId}::uuid FOR UPDATE OF s FOR SHARE OF cl,cc,sm,su,ce,m,l,cm,c`;
      await tx.$queryRaw`SELECT membership_id FROM class_assistant_teachers WHERE class_id=${input.classId}::uuid
        AND membership_id IN (SELECT id FROM academy_memberships WHERE user_id=${actor.userId}::uuid AND academy_id=${input.academyId}::uuid) FOR SHARE`;
      const row = await this.authorized(tx, actor, input);
      const existing = await tx.programmingSubmissionReview.findUnique({where: {reviewerId_requestId: {reviewerId: actor.userId, requestId: input.requestId}}});
      if (existing) {
        if (existing.submissionId !== row.id || existing.version !== input.expectedVersion+1 ||
          existing.scoreHundredths !== input.scoreHundredths || existing.completed !== input.completed ||
          existing.feedback !== input.feedback || existing.reason !== input.reason) throw new ConflictException('Request identity changed');
        return {...row, reviewVersion: existing.version, manualReviewResult: {...programmingAssessment(row),
          state: 'GRADED' as const, scoreHundredths: existing.scoreHundredths, completed: existing.completed,
          feedback: existing.feedback, reviewerName: existing.reviewerName, reviewedAt: existing.createdAt.toISOString(), reviewVersion: existing.version}};
      }
      const previous = programmingAssessment(row);
      if (input.scoreHundredths > previous.maximumHundredths) throw new BadRequestException('Score exceeds the submitted maximum');
      if (row.reviewVersion !== input.expectedVersion) throw new ConflictException('Review changed; reload');
      const reviewer = await tx.user.findUniqueOrThrow({where: {id: actor.userId}, select: {displayName: true}});
      const now = new Date(), version = input.expectedVersion+1;
      const assessment = {...previous, state: 'GRADED' as const, scoreHundredths: input.scoreHundredths,
        completed: input.completed, feedback: input.feedback, reviewerName: (reviewer.displayName ?? "Staff"),
        reviewedAt: now.toISOString(), reviewVersion: version};
      const changed = await tx.submission.updateMany({where: {id: row.id, reviewVersion: input.expectedVersion},
        data: {reviewVersion: version, manualReviewResult: assessment}});
      if (changed.count !== 1) throw new ConflictException('Review changed; reload');
      await tx.programmingSubmissionReview.create({data: {
        submissionId: row.id, reviewerId: actor.userId, reviewerName: (reviewer.displayName ?? "Staff"),
        version, requestId: input.requestId, scoreHundredths: input.scoreHundredths,
        completed: input.completed, feedback: input.feedback, reason: input.reason,
        previousScoreHundredths: previous.scoreHundredths,
        deltaHundredths: previous.scoreHundredths === null ? null : input.scoreHundredths-previous.scoreHundredths,
        createdAt: now,
      }});
      await this.audit.write(tx, {actorUserId: actor.userId, academyId: input.academyId,
        action: 'programming.review.published', targetType: 'Submission', targetId: row.id, reason: input.reason,
        before: {version: row.reviewVersion, scoreHundredths: previous.scoreHundredths, completed: previous.completed},
        after: {version, scoreHundredths: input.scoreHundredths, completed: input.completed}});
      return {...row, manualReviewResult: assessment, reviewVersion: version};
    });
    // Durable result wins even if a disconnected transport cannot deliver the hint.
    try {
      const owner = await this.db.academyMembership.findUnique({where: {academyId_userId: {academyId: input.academyId, userId: saved.userId}}, select: {id: true}});
      this.events.publishProgrammingAssessment({...input, materialId: saved.sourceMaterialId, studentMembershipId: owner?.id, version: saved.reviewVersion});
    } catch { /* A later authorized read recovers a missed refresh hint. */ }
    return this.view(this.db, saved);
  }
}
