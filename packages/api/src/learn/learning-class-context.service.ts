import { HttpStatus, Injectable } from "@nestjs/common";
import type { LearningClassContext } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";

type ClassContextDatabase = Pick<Prisma.TransactionClient, "academyMembership">;

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
    const membership = await database.academyMembership.findFirst({
      where: {
        academyId: input.academyId,
        userId: input.userId,
        role: "STUDENT",
        status: "ACTIVE",
      },
      select: {
        id: true,
        classEnrollments: {
          where: {
            class: {
              status: "ACTIVE",
              courseAssignments: { some: { courseId: input.courseId } },
            },
          },
          select: { class: { select: { id: true, name: true } } },
          orderBy: [{ class: { name: "asc" } }, { classId: "asc" }],
        },
      },
    });

    const classes =
      membership?.classEnrollments.map(({ class: item }) => ({
        classId: item.id,
        name: item.name,
      })) ?? [];
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
