import { Injectable } from "@nestjs/common";
import {
  monitoringLimits,
  type MonitoringClassRoster,
  type MonitoringClassSummary,
  type MonitoringFeedback,
  type MonitoringStudentContext,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  MonitoringAccessService,
  type MonitoringClassClaim,
} from "./monitoring-access.service.js";

/**
 * The durable reads behind live monitoring.
 *
 * Everything here works with the realtime service down: a class list, a
 * roster, one student's exercise, and their feedback history are ordinary
 * authorized queries. Live state is deliberately absent — presence arrives on
 * the class room and is merged client-side, so a cached response can never
 * claim a student is online right now.
 */
@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MonitoringAccessService,
  ) {}

  /**
   * The teacher's own classes.
   *
   * The flag is reported rather than thrown so the page can say monitoring is
   * not enabled yet. Authorization still runs first: a Team Lead asking is
   * refused whether or not the academy is in the rollout, so the response
   * cannot be used to probe which academies have it turned on.
   */
  async listAssignedClasses(
    identity: SupabaseIdentity,
    input: { academyId: string },
  ): Promise<{ featureEnabled: boolean; classes: MonitoringClassSummary[] }> {
    const actor = await this.access.requireTeacher(identity, input.academyId);
    if (!(await this.access.isFeatureEnabled(input.academyId))) {
      return { featureEnabled: false, classes: [] };
    }

    const classes = await this.prisma.class.findMany({
      where: this.access.assignedClassScope(actor),
      select: {
        id: true,
        academyId: true,
        name: true,
        description: true,
        status: true,
        updatedAt: true,
        _count: { select: { courseAssignments: true, enrollments: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });

    return {
      featureEnabled: true,
      classes: classes.map((record) => ({
        classId: record.id,
        academyId: record.academyId,
        name: record.name,
        description: record.description,
        status: record.status,
        courseCount: record._count.courseAssignments,
        studentCount: record._count.enrollments,
        updatedAt: record.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * One class's enrollments, bounded.
   *
   * The bound is the supported class size, and exceeding it is reported rather
   * than silently trimmed: a teacher must not believe they are seeing everyone
   * when they are seeing the first two hundred.
   */
  async getClassRoster(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string },
  ): Promise<MonitoringClassRoster> {
    const claim = await this.requireClass(identity, input);
    const record = await this.prisma.class.findFirstOrThrow({
      where: { id: claim.classId, ...this.access.assignedClassScope(claim) },
      select: {
        id: true,
        academyId: true,
        name: true,
        description: true,
        status: true,
        updatedAt: true,
        _count: { select: { courseAssignments: true, enrollments: true } },
        courseAssignments: {
          select: {
            course: { select: { id: true, title: true, isVisible: true } },
          },
          orderBy: [{ course: { title: "asc" } }, { courseId: "asc" }],
        },
        enrollments: {
          select: {
            enrolledAt: true,
            lastLearningSeenAt: true,
            membership: {
              select: {
                id: true,
                role: true,
                status: true,
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    username: true,
                    email: true,
                    status: true,
                  },
                },
              },
            },
          },
          orderBy: [{ enrolledAt: "asc" }, { membershipId: "asc" }],
          take: monitoringLimits.rosterMaxEnrollments,
        },
      },
    });

    return {
      class: {
        classId: record.id,
        academyId: record.academyId,
        name: record.name,
        description: record.description,
        status: record.status,
        courseCount: record._count.courseAssignments,
        studentCount: record._count.enrollments,
        updatedAt: record.updatedAt.toISOString(),
      },
      courses: record.courseAssignments.map((assignment) => assignment.course),
      students: record.enrollments.map((enrollment) => ({
        membershipId: enrollment.membership.id,
        userId: enrollment.membership.user.id,
        displayName: enrollment.membership.user.displayName,
        username: enrollment.membership.user.username,
        email: enrollment.membership.user.email,
        // Reported as they stand now: an enrollment row for a suspended member
        // stays on the roster, and the teacher sees why it grants nothing.
        membershipStatus: enrollment.membership.status,
        userStatus: enrollment.membership.user.status,
        enrolledAt: enrollment.enrolledAt.toISOString(),
        lastLearningSeenAt: enrollment.lastLearningSeenAt?.toISOString() ?? null,
      })),
      truncated:
        record._count.enrollments > monitoringLimits.rosterMaxEnrollments,
    };
  }

  /**
   * Trusted identity for one student, and optionally the exercise to open
   * beside them.
   *
   * The material is an input because the roster knows the student before it
   * knows what they have open: the socket's watch acknowledgement names the
   * exercise, and the page then loads it here. It is re-authorized on the way
   * in — a remembered id from an exercise since hidden or unassigned does not
   * open.
   */
  async getStudentContext(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      classId: string;
      membershipId: string;
      materialId?: string;
    },
  ): Promise<MonitoringStudentContext> {
    const claim = await this.requireClass(identity, input);
    const student = await this.access.requireMonitorableStudent(
      claim,
      input.membershipId,
    );
    const [classRecord, profile] = await Promise.all([
      this.prisma.class.findFirstOrThrow({
        where: { id: claim.classId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findFirstOrThrow({
        where: { id: student.studentUserId },
        select: { id: true, displayName: true, email: true },
      }),
    ]);

    return {
      viewerMembershipId: claim.membershipId,
      student: {
        membershipId: student.studentMembershipId,
        userId: profile.id,
        displayName: profile.displayName,
        email: profile.email,
      },
      class: { classId: classRecord.id, name: classRecord.name },
      exercise: input.materialId
        ? await this.loadExercise(claim, student.studentUserId, input.materialId)
        : null,
    };
  }

  /**
   * The feedback history for one student in one class, newest first.
   *
   * Read through the same access claim as the live workspace, so a teacher who
   * loses the assignment loses the history with it. Rows are matched on the
   * immutable membership reference: a message stays readable after the
   * membership row behind it is gone.
   */
  async listFeedback(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      classId: string;
      membershipId: string;
      materialId?: string;
      limit: number;
      before?: string;
    },
  ): Promise<{ feedback: MonitoringFeedback[]; nextBefore: string | null }> {
    const claim = await this.requireClass(identity, input);
    const student = await this.access.requireMonitorableStudent(
      claim,
      input.membershipId,
    );

    const rows = await this.prisma.teacherFeedback.findMany({
      where: {
        academyId: claim.academyId,
        classId: claim.classId,
        studentMembershipRef: student.studentMembershipId,
        ...(input.materialId ? { materialId: input.materialId } : {}),
        ...(input.before ? { createdAt: { lt: new Date(input.before) } } : {}),
      },
      select: {
        id: true,
        classId: true,
        teacherMembershipRef: true,
        studentMembershipRef: true,
        materialId: true,
        body: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // One extra row answers "is there more" without a second count query.
      take: input.limit + 1,
    });

    const page = rows.slice(0, input.limit);
    return {
      feedback: page.map((row) => ({
        id: row.id,
        classId: row.classId,
        // No author name: the student is told a teacher is monitoring, never
        // which one, and a named message would hand back what the indicator
        // withholds. The teacher's own client matches this against the
        // membership it is signed in as.
        teacherMembershipRef: row.teacherMembershipRef,
        studentMembershipRef: row.studentMembershipRef,
        materialId: row.materialId,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      })),
      nextBefore:
        rows.length > input.limit && page.length > 0
          ? page[page.length - 1]!.createdAt.toISOString()
          : null,
    };
  }

  /** Feature, teacher, and assignment, in the order that leaks the least. */
  private async requireClass(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string },
  ): Promise<MonitoringClassClaim> {
    const actor = await this.access.requireTeacher(identity, input.academyId);
    await this.access.requireFeature(input.academyId);
    return this.access.requireAssignedClass(actor, input.classId);
  }

  private async loadExercise(
    claim: MonitoringClassClaim,
    studentUserId: string,
    materialId: string,
  ) {
    const material = await this.prisma.material.findFirst({
      where: {
        id: materialId,
        ...this.access.monitoredMaterialScope(claim),
      },
      select: {
        id: true,
        title: true,
        lecture: {
          select: {
            id: true,
            title: true,
            courseModule: {
              select: {
                id: true,
                title: true,
                course: { select: { id: true, title: true } },
              },
            },
          },
        },
        programmingExercise: {
          include: {
            testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] },
            hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
          },
        },
      },
    });
    const exercise = material?.programmingExercise;
    if (!material || !exercise) {
      // The same shape as "this student is not solving anything monitorable":
      // a teacher must not learn that a hidden exercise exists.
      return null;
    }

    const draft = await this.prisma.exerciseDraft.findUnique({
      where: {
        userId_materialId: { userId: studentUserId, materialId: material.id },
      },
      select: { id: true },
    });

    return {
      breadcrumb: {
        course: {
          id: material.lecture.courseModule.course.id,
          title: material.lecture.courseModule.course.title,
        },
        module: {
          id: material.lecture.courseModule.id,
          title: material.lecture.courseModule.title,
        },
        lecture: { id: material.lecture.id, title: material.lecture.title },
      },
      exercise: {
        materialId: material.id,
        title: material.title,
        difficulty: exercise.difficulty,
        language: exercise.language,
        description: exercise.description,
        inputFormat: exercise.inputFormat,
        outputFormat: exercise.outputFormat,
        constraints: exercise.constraints,
        starterCode: exercise.starterCode,
        timeLimitMs: exercise.timeLimitMs,
        memoryLimitMb: exercise.memoryLimitMb,
        // Sample cases only, and hidden ones as a count. The teacher surface
        // reuses the student shape precisely so it cannot become the one place
        // a hidden expectation leaks.
        sampleTestCases: exercise.testCases
          .filter((testCase) => testCase.visibility === "SAMPLE")
          .map((testCase) => ({
            position: testCase.position,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
          })),
        hints: exercise.hints.map((hint) => ({
          position: hint.position,
          content: hint.content,
        })),
        hiddenTestCaseCount: exercise.testCases.filter(
          (testCase) => testCase.visibility === "HIDDEN",
        ).length,
      },
      // Null until the student has actually started: the collaboration
      // document is created lazily, and naming a room for a draft that does
      // not exist is how a client ends up inventing one.
      draftId: draft?.id ?? null,
    };
  }
}
