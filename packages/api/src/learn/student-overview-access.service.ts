import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { resolveComparisonSurface, teacherOutlineNumber } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { enrolledClassWhere } from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  nonemptyModules,
  visibleCurriculumInclude,
  type VisibleCourse,
} from "./curriculum-outline.service.js";

/**
 * The one gate in front of the student overview.
 *
 * It resolves a scope rather than returning a boolean, the same way the
 * teacher's overview does: a caller holding a scope is holding the membership,
 * the classes, the assigned courses, and the visible exercises that authorized
 * the read. No aggregate below can be called without them, and none can widen
 * them.
 *
 * The subject is always the caller. There is no parameter anywhere in this
 * file that could aim the read at another student — the membership comes from
 * the identity, and every predicate below is anchored to it. That is the same
 * rule `listMyFeedback` enforces, and it is enforced here structurally rather
 * than by a filter somebody has to remember.
 *
 * The class-standing flag is read here, before any aggregate runs, so an
 * academy that has not enabled the section costs nothing to answer.
 *
 * See §5 and §9.7 of the student academy overview design.
 */

/** One exercise the student may reach, with the coordinate it prints under. */
export type StudentExercise = {
  materialId: string;
  title: string;
  outlineNumber: string | null;
  lectureId: string;
  lectureTitle: string;
  moduleTitle: string;
  courseId: string;
  courseTitle: string;
};

export type StudentOverviewClassScope = {
  classId: string;
  name: string;
  teacherName: string | null;
  membershipIds: string[];
};

export type StudentOverviewScopeInternal = {
  userId: string;
  membershipId: string;
  academyId: string;
  academyName: string;
  displayName: string | null;
  timeZone: string;
  classes: StudentOverviewClassScope[];
  courses: VisibleCourse[];
  courseIds: string[];
  /** Every reachable exercise, in curriculum order, keyed for lookup. */
  exercises: StudentExercise[];
  exerciseById: Map<string, StudentExercise>;
  materialIds: string[];
  /** §9.7 — whether this academy shows students a class standing at all. */
  standingEnabled: boolean;
  /**
   * §18.2 — whether the points card replaces it. Never true at the same time
   * as `standingEnabled`: two comparison surfaces must never both render.
   */
  pointsEnabled: boolean;
  /** The class the standing describes, after the request has been validated. */
  standingClass: StudentOverviewClassScope | null;
};

@Injectable()
export class StudentOverviewAccessService {
  private readonly logger = new Logger(StudentOverviewAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  async requireScope(
    identity: SupabaseIdentity,
    input: { academyId: string; standingClassId?: string },
  ): Promise<StudentOverviewScopeInternal> {
    const { academyId } = input;
    const actor = await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
    if (actor.role !== "STUDENT") {
      // Staff previewing curriculum keep their own overview. This page is not
      // a narrower version of theirs; it is a different page about one person,
      // and the only person it can be about is the caller.
      throw new AppException("STUDENT_OVERVIEW_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }

    const membership = await this.prisma.academyMembership.findUnique({
      where: { academyId_userId: { academyId, userId: actor.userId } },
      select: {
        id: true,
        user: { select: { displayName: true } },
        memberProfile: { select: { academyDisplayName: true } },
        academy: { select: { name: true, timeZone: true } },
      },
    });
    if (!membership) {
      throw new AppException("ACADEMY_MEMBERSHIP_REQUIRED", HttpStatus.FORBIDDEN);
    }

    const [classes, courses, comparison] = await Promise.all([
      this.resolveClasses(academyId, actor.userId),
      this.prisma.course.findMany({
        where: {
          academyId,
          isVisible: true,
          classAssignments: {
            some: { class: enrolledClassWhere(academyId, actor.userId) },
          },
        },
        include: visibleCurriculumInclude,
        orderBy: [{ title: "asc" }, { id: "asc" }],
      }),
      this.comparisonFor(academyId),
    ]);

    const exercises = courses.flatMap(exercisesOf);

    return {
      userId: actor.userId,
      membershipId: membership.id,
      academyId,
      academyName: membership.academy.name,
      // The academy-scoped name wins where one exists, so the page greets a
      // student by the name their school calls them.
      displayName:
        membership.memberProfile?.academyDisplayName?.trim() ||
        membership.user.displayName?.trim() ||
        null,
      timeZone: membership.academy.timeZone,
      classes,
      courses,
      courseIds: courses.map((course) => course.id),
      exercises,
      exerciseById: new Map(
        exercises.map((exercise) => [exercise.materialId, exercise]),
      ),
      materialIds: exercises.map((exercise) => exercise.materialId),
      standingEnabled: comparison.standingEnabled,
      pointsEnabled: comparison.pointsEnabled,
      standingClass: comparison.standingEnabled
        ? selectStandingClass(classes, input.standingClassId)
        : null,
    };
  }

  /**
   * Which comparison surface this academy shows a student, if any.
   *
   * §18.2 of the student points design: the class leaderboard supersedes the
   * standing section wherever both are on. They must never render together —
   * two comparison surfaces computed differently will eventually disagree, and
   * neither a student nor their teacher would be able to say which is right.
   *
   * Resolution order, in one read:
   *
   * 1. `STUDENT_CLASS_LEADERBOARD` on → the points card, no standing section.
   * 2. `STUDENT_CLASS_STANDING` on, leaderboard off → standing, unchanged.
   * 3. Neither → no comparison at all.
   *
   * Read on its own rather than beside the scope's other queries, and never
   * allowed to throw. §10.3 makes the header the page's only core claim, and a
   * comparison is the most optional thing on the page — an optional section
   * whose precondition could take down a student's whole overview would be
   * exactly the wrong dependency direction.
   *
   * The concrete failure this catches is a deployment where the code carries a
   * feature the database enum does not yet. That is a migration that has not
   * run, not a reason a child cannot see what they were working on, so it is
   * logged loudly and both sections stay dark.
   */
  private async comparisonFor(
    academyId: string,
  ): Promise<{ standingEnabled: boolean; pointsEnabled: boolean }> {
    try {
      const flags = await this.prisma.academyFeatureFlag.findMany({
        where: {
          academyId,
          feature: {
            in: [
              "STUDENT_CLASS_STANDING",
              "STUDENT_POINTS",
              "STUDENT_CLASS_LEADERBOARD",
            ],
          },
          isEnabled: true,
        },
        select: { feature: true },
      });
      // Resolved by the pure function rather than by three conditions here:
      // "both must never render" survives exactly as long as it is testable at
      // its boundary, and it is, in `@cove/shared`.
      const resolved = resolveComparisonSurface(
        flags.map((flag) => flag.feature),
      );
      return {
        pointsEnabled: resolved.points,
        standingEnabled: resolved.standing,
      };
    } catch (error) {
      this.logger.warn(
        `academy feature flags unreadable, treating every comparison as off — ` +
          `are 20260819120000_student_class_standing_feature and ` +
          `20260821120000_student_points_and_class_ranking applied? ` +
          `${error instanceof Error ? error.message : "unknown"}`,
      );
      return { standingEnabled: false, pointsEnabled: false };
    }
  }

  /**
   * The classes this student learns through, and who else is in them.
   *
   * The peer membership ids never leave this service. They exist so the
   * standing aggregate has a population to group over; §9.1's row schema has
   * nowhere to put one, so nothing downstream could emit one even by mistake.
   *
   * The teacher select carries a display name and no identifier, matching what
   * the class pages already show a student.
   */
  private async resolveClasses(
    academyId: string,
    userId: string,
  ): Promise<StudentOverviewClassScope[]> {
    const rows = await this.prisma.class.findMany({
      where: enrolledClassWhere(academyId, userId),
      select: {
        id: true,
        name: true,
        assignedTeacher: {
          select: {
            academyId: true,
            status: true,
            role: true,
            user: { select: { status: true, displayName: true } },
          },
        },
        enrollments: {
          where: {
            membership: { academyId, status: "ACTIVE", role: "STUDENT" },
          },
          select: { membershipId: true },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return rows.map((record) => ({
      classId: record.id,
      name: record.name,
      teacherName: effectiveTeacherName(record.assignedTeacher, academyId),
      membershipIds: record.enrollments.map((row) => row.membershipId),
    }));
  }
}

/**
 * The assigned teacher, only while the assignment is still real.
 *
 * A membership that was suspended, had its role changed, moved academy, or
 * belongs to a deleted account is a stale assignment, and a student reading
 * "taught by" should not be told a name that no longer teaches them.
 */
function effectiveTeacherName(
  teacher: {
    academyId: string;
    status: string;
    role: string;
    user: { status: string; displayName: string | null };
  } | null,
  academyId: string,
): string | null {
  if (!teacher) return null;
  if (teacher.academyId !== academyId) return null;
  if (teacher.status !== "ACTIVE" || teacher.role !== "TEACHER") return null;
  if (teacher.user.status !== "ACTIVE") return null;
  // A blank name fails with the rest rather than falling back to an email or
  // an id: those identify an account, and "Teacher not assigned" is a better
  // answer than an address the student was never meant to have.
  return teacher.user.displayName?.trim() || null;
}

/**
 * Which class a standing describes when a student sits in several.
 *
 * An unrecognised id falls back rather than failing: §6.2's rule for every
 * other URL value on this page, and a shared link from last term should show
 * a standing rather than an error.
 */
function selectStandingClass(
  classes: StudentOverviewClassScope[],
  requested: string | undefined,
): StudentOverviewClassScope | null {
  if (classes.length === 0) return null;
  const chosen = requested
    ? classes.find((entry) => entry.classId === requested)
    : undefined;
  return chosen ?? classes[0];
}

/** Every exercise of one course, flattened with the coordinate it prints. */
function exercisesOf(course: VisibleCourse): StudentExercise[] {
  return nonemptyModules(course).flatMap((courseModule) =>
    courseModule.lectures.flatMap((lecture) =>
      lecture.materials.flatMap((material) =>
        material.programmingExercise
          ? [
              {
                materialId: material.id,
                title: material.title,
                outlineNumber: teacherOutlineNumber({
                  modulePosition: courseModule.position,
                  lecturePosition: lecture.position,
                  problemPosition: material.position,
                }),
                lectureId: lecture.id,
                lectureTitle: lecture.title,
                moduleTitle: courseModule.title,
                courseId: course.id,
                courseTitle: course.title,
              },
            ]
          : [],
      ),
    ),
  );
}

export type { VisibleCourse, Prisma };
