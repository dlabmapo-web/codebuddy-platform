import { HttpStatus, Injectable } from "@nestjs/common";
import type { LearningClassContext } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";

type ClassContextDatabase = Pick<Prisma.TransactionClient, "$queryRaw">;

/**
 * Resolves the delivery class for student work on one course.
 *
 * The browser may request a class, but this service is the authority: the
 * student must currently be active, enrolled in the class, and the class must
 * currently deliver the course. A shared course is never guessed between two
 * classes because that would make an identical action pay two arbitrary
 * leaderboards depending on query order.
 */
@Injectable()
export class LearningClassContextService {
  constructor(private readonly prisma: PrismaService) {}

  resolve(input: {
    academyId: string;
    userId: string;
    courseId: string;
    requestedClassId?: string;
  }): Promise<LearningClassContext & { membershipId: string }> {
    return this.resolveWith(this.prisma, input);
  }

  async resolveWith(
    database: ClassContextDatabase,
    input: {
      academyId: string;
      userId: string;
      courseId: string;
      requestedClassId?: string;
    },
  ): Promise<LearningClassContext & { membershipId: string }> {
    const [membership] = await database.$queryRaw<Array<{id: string; classes: Array<{classId: string; name: string}>}>>`
      SELECT m.id, COALESCE(jsonb_agg(jsonb_build_object('classId', cl.id, 'name', cl.name)
        ORDER BY cl.name, cl.id) FILTER (WHERE cl.id IS NOT NULL), '[]'::jsonb) AS classes
      FROM academy_memberships m
      LEFT JOIN class_enrollments ce ON ce.membership_id=m.id
      LEFT JOIN class_courses cc ON cc.class_id=ce.class_id AND cc.course_id=${input.courseId}::uuid
      LEFT JOIN classes cl ON cl.id=cc.class_id AND cl.status='ACTIVE' AND cl.academy_id=${input.academyId}::uuid
      WHERE m.academy_id=${input.academyId}::uuid AND m.user_id=${input.userId}::uuid AND m.status='ACTIVE'
        AND (m.role='STUDENT' OR EXISTS (SELECT 1 FROM academy_membership_roles r WHERE r.membership_id=m.id AND r.role='STUDENT'))
      GROUP BY m.id
    `;
    const classes = membership?.classes ?? [];
    if (!membership || classes.length === 0) {
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    if (
      input.requestedClassId &&
      !classes.some((item) => item.classId === input.requestedClassId)
    ) {
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    return {
      membershipId: membership.id,
      classes,
      classId: input.requestedClassId ?? (classes.length === 1 ? classes[0]!.classId : null),
    };
  }
}
