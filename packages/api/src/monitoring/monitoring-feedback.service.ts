import { HttpStatus, Injectable } from "@nestjs/common";
import { feedbackBodySchema, type MonitoringFeedback } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { MonitoringMaterialClaim } from "./monitoring-access.service.js";

/**
 * Durable written feedback.
 *
 * Persisted before it is broadcast, never after: a client must not render a
 * message the database refused. A retried send is recognized by its
 * idempotency key and returns the row that already exists, so the retry that
 * makes the socket command reliable cannot double-post.
 */
@Injectable()
export class MonitoringFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
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

    const existing = await this.prisma.teacherFeedback.findUnique({
      where: {
        teacherMembershipRef_idempotencyKey: {
          teacherMembershipRef: claim.membershipId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: selection,
    });
    if (existing) return toFeedback(existing);

    try {
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
      const raced = await this.prisma.teacherFeedback.findUnique({
        where: {
          teacherMembershipRef_idempotencyKey: {
            teacherMembershipRef: claim.membershipId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: selection,
      });
      if (raced) return toFeedback(raced);
      throw error;
    }
  }
}

const selection = {
  id: true,
  classId: true,
  teacherMembershipRef: true,
  studentMembershipRef: true,
  materialId: true,
  body: true,
  createdAt: true,
} as const;

function toFeedback(row: {
  id: string;
  classId: string;
  teacherMembershipRef: string;
  studentMembershipRef: string;
  materialId: string | null;
  body: string;
  createdAt: Date;
}): MonitoringFeedback {
  return {
    id: row.id,
    classId: row.classId,
    // No author name, deliberately: the student is told a teacher is present,
    // never which one, and a named message would give that back.
    teacherMembershipRef: row.teacherMembershipRef,
    studentMembershipRef: row.studentMembershipRef,
    materialId: row.materialId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}
