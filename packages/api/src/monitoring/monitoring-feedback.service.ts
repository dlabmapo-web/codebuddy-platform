import { HttpStatus, Injectable } from "@nestjs/common";
import { feedbackBodySchema, type MonitoringFeedback } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { MonitoringMaterialClaim } from "./monitoring-access.service.js";

/**
 * The teacher's note on one student's exercise.
 *
 * One note per teacher, per student, per exercise — rewritten in place rather
 * than appended to. A teacher revising their advice is not making a second
 * remark, and a student opening an exercise should find the current guidance,
 * not a transcript of every time it changed.
 *
 * Persisted before it is broadcast, never after: a client must not render a
 * message the database refused. A retried send is recognized by its
 * idempotency key and returns the row that already exists, so the retry that
 * makes the socket command reliable cannot double-post.
 */
@Injectable()
export class MonitoringFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes this teacher's note, creating it the first time and replacing it
   * every time after.
   *
   * Rewriting clears `readAt`. The words changed, so the student has not read
   * what it now says — treating a revision as already-read would silently
   * withhold the correction it was written to deliver.
   */
  async upsert(
    claim: MonitoringMaterialClaim,
    input: { idempotencyKey: string; body: string; visitId: string | null },
  ): Promise<MonitoringFeedback> {
    const parsed = feedbackBodySchema.safeParse(input.body);
    if (!parsed.success) {
      throw new AppException(
        "MONITORING_FEEDBACK_INVALID",
        HttpStatus.BAD_REQUEST,
      );
    }

    const retried = await this.findByKey(claim.membershipId, input.idempotencyKey);
    if (retried) return toFeedback(retried);

    // The newest, not the only one: rows written before notes became singular
    // are still here, and the most recent is the note this teacher last left.
    const current = await this.prisma.teacherFeedback.findFirst({
      where: {
        teacherMembershipRef: claim.membershipId,
        studentMembershipRef: claim.studentMembershipId,
        materialId: claim.materialId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });

    try {
      if (current) {
        const updated = await this.prisma.teacherFeedback.update({
          where: { id: current.id },
          data: {
            body: parsed.data,
            // Adopted so a retry of *this* rewrite is recognized too.
            idempotencyKey: input.idempotencyKey,
            monitoringVisitId: input.visitId,
            readAt: null,
          },
          select: selection,
        });
        return toFeedback(updated);
      }

      const created = await this.prisma.teacherFeedback.create({
        data: {
          academyId: claim.academyId,
          classId: claim.classId,
          teacherMembershipId: claim.membershipId,
          studentMembershipId: claim.studentMembershipId,
          teacherMembershipRef: claim.membershipId,
          studentMembershipRef: claim.studentMembershipId,
          materialId: claim.materialId,
          monitoringVisitId: input.visitId,
          idempotencyKey: input.idempotencyKey,
          body: parsed.data,
        },
        select: selection,
      });
      return toFeedback(created);
    } catch (error) {
      // Two sends of the same key racing each other: the loser reads the
      // winner's row rather than reporting a failure for a message that was in
      // fact delivered.
      const raced = await this.findByKey(claim.membershipId, input.idempotencyKey);
      if (raced) return toFeedback(raced);
      throw error;
    }
  }

  private findByKey(teacherMembershipRef: string, idempotencyKey: string) {
    return this.prisma.teacherFeedback.findUnique({
      where: {
        teacherMembershipRef_idempotencyKey: {
          teacherMembershipRef,
          idempotencyKey,
        },
      },
      select: selection,
    });
  }
}

const selection = {
  id: true,
  classId: true,
  teacherMembershipRef: true,
  teacherMembership: { select: { user: { select: { displayName: true } } } },
  studentMembershipRef: true,
  materialId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  readAt: true,
} as const;

/** Derived from `selection`, so adding a field there cannot desynchronize it. */
type FeedbackRow = Prisma.TeacherFeedbackGetPayload<{
  select: typeof selection;
}>;

function toFeedback(row: FeedbackRow): MonitoringFeedback {
  return {
    id: row.id,
    classId: row.classId,
    teacherMembershipRef: row.teacherMembershipRef,
    // Named: a note is a deliberate, attributable act. The live indicator
    // stays generic, which is a different question from this one.
    teacherName: row.teacherMembership?.user.displayName ?? null,
    studentMembershipRef: row.studentMembershipRef,
    materialId: row.materialId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}
