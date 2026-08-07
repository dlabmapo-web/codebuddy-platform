import { Injectable } from "@nestjs/common";
import {
  monitoringLimits,
  type MonitoringClassRoster,
  type MonitoringClassSummary,
  type MonitoringFeedback,
  type MonitoringStudentContext,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  MonitoringAccessService,
  type MonitoringClassClaim,
} from "./monitoring-access.service.js";
import { MonitoringFeedbackBroadcaster } from "./monitoring-feedback-broadcaster.js";

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
    private readonly broadcaster: MonitoringFeedbackBroadcaster,
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
   * The current notes on one student, newest first — one per teacher.
   *
   * Read through the same access claim as the live workspace, so a teacher who
   * loses the assignment loses the notes with it. Rows are matched on the
   * immutable membership reference: a note stays readable after the membership
   * row behind it is gone.
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
      },
      select: feedbackSelection,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: monitoringLimits.feedbackPageSize,
    });

    return currentNotes(rows, input.limit);
  }

  /**
   * The notes a student currently has, newest first — one per teacher.
   *
   * The recipient's read, not the author's. Rows are selected on the caller's
   * own membership reference — resolved from their identity, never accepted as
   * input — so there is no argument to this method capable of naming another
   * student's notes.
   *
   * Not scoped to a class: a student enrolled in two classes experiences one
   * exercise, not two, and splitting their notes by which class the teacher
   * happened to write from would be an implementation detail surfacing as a
   * feature.
   */
  async listMyFeedback(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      materialId?: string;
      limit: number;
      before?: string;
    },
  ): Promise<{ feedback: MonitoringFeedback[]; nextBefore: string | null }> {
    await this.access.requireFeature(input.academyId);
    const self = await this.access.requireStudentSelf(identity, input.academyId);

    const rows = await this.prisma.teacherFeedback.findMany({
      where: {
        academyId: input.academyId,
        studentMembershipRef: self.membershipId,
        ...(input.materialId ? { materialId: input.materialId } : {}),
      },
      select: feedbackSelection,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: monitoringLimits.feedbackPageSize,
    });

    return currentNotes(rows, input.limit);
  }

  /**
   * Marks one exercise's thread read.
   *
   * Idempotent by construction: already-read rows fail the `readAt: null`
   * predicate, so a second call updates nothing and reports zero rather than
   * restamping a timestamp the teacher may already have seen.
   */
  async markMyFeedbackRead(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string },
  ): Promise<{ readCount: number }> {
    await this.access.requireFeature(input.academyId);
    const self = await this.access.requireStudentSelf(identity, input.academyId);

    const result = await this.prisma.teacherFeedback.updateMany({
      where: {
        academyId: input.academyId,
        studentMembershipRef: self.membershipId,
        materialId: input.materialId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    // Best-effort, and deliberately after the write has already committed: the
    // student's panel must open whether or not a teacher is listening, so a
    // broadcast failure cannot become their error.
    await this.broadcaster
      .feedbackRead({
        academyId: input.academyId,
        studentUserId: self.userId,
        materialId: input.materialId,
        readCount: result.count,
      })
      .catch(() => undefined);

    return { readCount: result.count };
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

const feedbackSelection = {
  id: true,
  classId: true,
  teacherMembershipRef: true,
  // The author's name, through the membership rather than stored on the note:
  // a teacher who changes their display name changes it on past notes too.
  teacherMembership: { select: { user: { select: { displayName: true } } } },
  studentMembershipRef: true,
  materialId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  readAt: true,
} as const;

/**
 * Derived from the selection rather than restated.
 *
 * A hand-written copy drifts the moment a field is added to `feedbackSelection`
 * — and it drifts into a type error somewhere unrelated, which is exactly what
 * happened the first time the author's name was selected here.
 */
type FeedbackRow = Prisma.TeacherFeedbackGetPayload<{
  select: typeof feedbackSelection;
}>;

/**
 * Collapses stored rows to the note each teacher currently has standing.
 *
 * A teacher now writes one note per student per exercise and rewrites it in
 * place, but rows written before that are still in the table. Rather than
 * delete them, the newest row per author wins and the superseded ones simply
 * stop being returned — the history stays on disk, and nobody is shown a
 * transcript of every time a sentence was reworded.
 *
 * Rows arrive newest-first, so the first sighting of an author is their
 * current note.
 */
function currentNotes(
  rows: readonly FeedbackRow[],
  limit: number,
): { feedback: MonitoringFeedback[]; nextBefore: string | null } {
  const seenAuthors = new Set<string>();
  const current: MonitoringFeedback[] = [];

  for (const row of rows) {
    // Keyed on author *and* exercise: one teacher legitimately has a separate
    // note on every exercise the student is working through.
    const author = `${row.teacherMembershipRef}:${row.materialId ?? ""}`;
    if (seenAuthors.has(author)) continue;
    seenAuthors.add(author);
    current.push({
      id: row.id,
      classId: row.classId,
      teacherMembershipRef: row.teacherMembershipRef,
      // Named: a written note is attributable, unlike the live indicator.
      teacherName: row.teacherMembership?.user.displayName ?? null,
      studentMembershipRef: row.studentMembershipRef,
      materialId: row.materialId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    });
    if (current.length === limit) break;
  }

  // Always null: the result is bounded by how many teachers have written, not
  // by how much they have written, so there is no second page to fetch.
  return { feedback: current, nextBefore: null };
}
