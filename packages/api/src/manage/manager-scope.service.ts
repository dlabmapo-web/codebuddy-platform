import { HttpStatus, Injectable } from "@nestjs/common";
import {
  displayableEmail,
  ACADEMY_TIME_ZONE,
  MANAGER_MAX_CLASS_ROWS,
  type AcademyPermission,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { membershipHoldsRole } from "../authorization/membership-roles.js";
import {
  classStudentWhere,
  classTaughtMaterialWhere,
} from "../classes/assigned-class-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type {
  OverviewExercise,
  OverviewStudent,
  TeacherOverviewScope,
} from "../teach/teacher-overview-access.service.js";

/**
 * The one gate in front of every manager operations surface, and the adapter
 * that gives the manager an analytics scope.
 *
 * §7.4's rule, made structural. The measurement code — the repository, the
 * student facts, the attention thresholds — is written against a *scope*: a set
 * of classes, each with its roster and its taught curriculum. `TeacherOverview
 * AccessService` builds one from the classes a teacher is assigned to. This
 * builds one from the active classes of an academy.
 *
 * That is the whole of the difference, and it is why manager analytics are not
 * implemented as a branch inside the teacher module. Nothing downstream can
 * tell which adapter produced its scope, so neither role's reach can widen by
 * editing the other's predicate, and a teacher cannot reach an academy-wide
 * read by passing a flag that does not exist.
 *
 * A platform `ADMIN` without an active Manager membership is refused here like
 * anyone else: `requirePermission` reads the membership, not the platform role,
 * so §5's "no routine academy access for administrators" is not a rule someone
 * has to remember to apply at each new endpoint.
 *
 * Every failure — no membership, a suspended one, the wrong role, another
 * academy's id — answers with one code, so a caller cannot map the platform by
 * reading which refusal came back.
 *
 * See §5 and §7.4 of the manager control tower and scalable people operations
 * design.
 */

export type ManagerActor = {
  userId: string;
  academyId: string;
  /** The academy's own zone. Every local day on this page is drawn in it. */
  timeZone: string;
};

/**
 * A manager's analytics scope, plus the two facts only this adapter knows.
 *
 * `truncated` says the academy runs more active classes than §15 lets the
 * comparison carry. `teacherNames` travels here rather than being fetched again
 * downstream because the class list was already read to build the scope, and a
 * second query for a name a manager can already see is a second query.
 */
export type ManagerAnalyticsScope = {
  scope: TeacherOverviewScope;
  truncated: boolean;
  teacherNames: Map<string, string | null>;
  /** Active classes with no usable teacher assignment, for §9.3. */
  classesWithoutTeacher: Set<string>;
  /** Active classes with no assigned visible course, for §9.3. */
  classesWithoutCourse: Set<string>;
};

@Injectable()
export class ManagerScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  /** The acting manager, or a refusal that names nothing. */
  async requireManager(
    identity: SupabaseIdentity,
    academyId: string,
    permission: AcademyPermission,
  ): Promise<ManagerActor> {
    let actor: { userId: string; role: string };
    try {
      actor = await this.access.requirePermission(
        identity.authUserId,
        academyId,
        permission,
      );
    } catch {
      throw new AppException(
        "MANAGER_OPERATIONS_ACCESS_DENIED",
        HttpStatus.FORBIDDEN,
      );
    }
    // The permission map already excludes every other role. The explicit
    // conjunction is what stops a later widening of `academy.analytics.read` —
    // Team Leads hold it — from quietly handing this surface to another role.
    if (actor.role !== "MANAGER") {
      throw new AppException(
        "MANAGER_OPERATIONS_ACCESS_DENIED",
        HttpStatus.FORBIDDEN,
      );
    }

    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { timeZone: true },
    });

    return {
      userId: actor.userId,
      academyId,
      // The column, with the retiring constant as the fallback for a row
      // written before the migration. Nothing else in a request may consult a
      // zone: one response describes one set of local days.
      timeZone: academy?.timeZone || ACADEMY_TIME_ZONE,
    };
  }

  /**
   * Every active class in the academy, with its roster and taught curriculum.
   *
   * Three set-based queries however many classes the academy runs. One round trip
   * per class would turn a hundred-class academy into three hundred queries for
   * a page §15 gives 1.5 seconds.
   *
   * The complete scope is required for academy-wide rates and action counts.
   * Only the comparison projection is capped by the caller; capping here would
   * silently erase students and incomplete classes from the control tower.
   */
  async resolveAnalyticsScope(actor: ManagerActor): Promise<ManagerAnalyticsScope> {
    const where = { academyId: actor.academyId, status: "ACTIVE" } as const;

    const [classes, totalClasses] = await Promise.all([
      this.prisma.class.findMany({
        where,
        select: {
          id: true,
          name: true,
          assignedTeacher: {
            select: {
              role: true,
              extraRoles: { select: { role: true } },
              status: true,
              user: { select: { displayName: true, username: true } },
            },
          },
          courseAssignments: {
            where: { course: { academyId: actor.academyId, isVisible: true } },
            select: { course: { select: { id: true, title: true } } },
          },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      this.prisma.class.count({ where }),
    ]);

    const classIds = classes.map((record) => record.id);
    const teacherNames = new Map<string, string | null>();
    const classesWithoutTeacher = new Set<string>();
    const classesWithoutCourse = new Set<string>();

    for (const record of classes) {
      // A teacher suspended or demoted after being assigned leaves the
      // assignment in place. §9.3 counts that class as having no teacher, which
      // is the truth a manager needs — hiding the stale row would hide the work.
      const teacher = record.assignedTeacher;
      // The role set, not the primary role: a director who also teaches stores
      // `role = MANAGER`, and reading the primary alone reported their class
      // as having no teacher at all.
      const usable =
        teacher !== null &&
        membershipHoldsRole(teacher, "TEACHER") &&
        teacher.status === "ACTIVE";
      teacherNames.set(
        record.id,
        usable
          ? teacher.user.displayName?.trim() ||
              teacher.user.username?.trim() ||
              null
          : null,
      );
      if (!usable) classesWithoutTeacher.add(record.id);
      if (record.courseAssignments.length === 0) {
        classesWithoutCourse.add(record.id);
      }
    }

    const empty = emptyScope(actor);
    if (classIds.length === 0) {
      return {
        scope: empty,
        truncated: false,
        teacherNames,
        classesWithoutTeacher,
        classesWithoutCourse,
      };
    }

    const [memberships, materials] = await Promise.all([
      this.prisma.academyMembership.findMany({
        where: classStudentWhere(actor.academyId, classIds),
        select: {
          id: true,
          userId: true,
          user: { select: { displayName: true, username: true, email: true } },
          memberProfile: { select: { academyDisplayName: true } },
          classEnrollments: {
            where: { classId: { in: classIds } },
            select: { classId: true },
          },
        },
      }),
      this.prisma.material.findMany({
        where: classTaughtMaterialWhere(actor.academyId, classIds),
        select: {
          id: true,
          title: true,
          position: true,
          lecture: {
            select: {
              id: true,
              title: true,
              position: true,
              courseModule: {
                select: {
                  id: true,
                  title: true,
                  position: true,
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const students: OverviewStudent[] = memberships
      .map((membership) => ({
        membershipId: membership.id,
        userId: membership.userId,
        displayName: memberDisplayName(membership),
        classIds: membership.classEnrollments.map((row) => row.classId),
      }))
      .sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName) ||
          left.membershipId.localeCompare(right.membershipId),
      );

    const exercises: OverviewExercise[] = materials
      .map((material) => ({
        materialId: material.id,
        title: material.title,
        position: material.position,
        lectureId: material.lecture.id,
        lectureTitle: material.lecture.title,
        lecturePosition: material.lecture.position,
        moduleId: material.lecture.courseModule.id,
        moduleTitle: material.lecture.courseModule.title,
        modulePosition: material.lecture.courseModule.position,
        courseId: material.lecture.courseModule.course.id,
        courseTitle: material.lecture.courseModule.course.title,
      }))
      .sort(
        (left, right) =>
          left.courseTitle.localeCompare(right.courseTitle) ||
          left.courseId.localeCompare(right.courseId) ||
          left.modulePosition - right.modulePosition ||
          left.lecturePosition - right.lecturePosition ||
          left.position - right.position ||
          left.materialId.localeCompare(right.materialId),
      );

    const courseIdsByClass = new Map(
      classes.map((record) => [
        record.id,
        record.courseAssignments.map((row) => row.course.id),
      ]),
    );

    const scopedClasses = classes.map((record) => {
      const roster = students.filter((student) =>
        student.classIds.includes(record.id),
      );
      const courseIds = courseIdsByClass.get(record.id) ?? [];
      // The pairing is the authorization: a class is measured against the
      // curriculum *it* is assigned, never against the union of the academy's.
      // Two independent id lists would let one class's work be counted inside
      // another that never taught it.
      const classExercises = exercises.filter((exercise) =>
        courseIds.includes(exercise.courseId),
      );
      return {
        classId: record.id,
        className: record.name,
        students: roster,
        userIds: roster.map((student) => student.userId),
        membershipIds: roster.map((student) => student.membershipId),
        courseIds,
        exercises: classExercises,
        materialIds: classExercises.map((exercise) => exercise.materialId),
      };
    });

    return {
      scope: {
        ...empty,
        classes: scopedClasses,
        classOptions: classes.map((record) => ({
          value: record.id,
          label: record.name,
        })),
        courseOptions: dedupeCourses(classes),
        students,
        // Distinct: a student in two classes is one person in every
        // academy-wide figure, and appears once per class row besides. §9.2.
        userIds: [...new Set(students.map((student) => student.userId))],
        membershipIds: students.map((student) => student.membershipId),
        exercises,
        materialIds: exercises.map((exercise) => exercise.materialId),
        courseIds: [
          ...new Set(exercises.map((exercise) => exercise.courseId)),
        ],
      },
      truncated: totalClasses > MANAGER_MAX_CLASS_ROWS,
      teacherNames,
      classesWithoutTeacher,
      classesWithoutCourse,
    };
  }
}

/**
 * The scope an academy with no active class produces.
 *
 * Every list empty rather than the object absent, so each aggregate downstream
 * short-circuits on its own emptiness check instead of the caller branching
 * around six of them.
 */
function emptyScope(actor: ManagerActor): TeacherOverviewScope {
  return {
    // The manager is not a class teacher, and this actor is never used to
    // authorize anything: authorization happened in `requireManager`, and the
    // membership id is deliberately blank so no downstream predicate can
    // mistake it for an assignment.
    actor: { userId: actor.userId, academyId: actor.academyId, membershipId: "" },
    timeZone: actor.timeZone,
    selectedClassId: null,
    selectedCourseId: null,
    selectedModuleId: null,
    selectedLectureId: null,
    selectedProblemId: null,
    curriculumLabel: null,
    classes: [],
    classOptions: [],
    courseOptions: [],
    moduleOptions: [],
    lectureOptions: [],
    problemOptions: [],
    students: [],
    userIds: [],
    membershipIds: [],
    exercises: [],
    materialIds: [],
    courseIds: [],
  };
}

/** One row per assigned course, carrying every class that teaches it. */
function dedupeCourses(
  classes: {
    id: string;
    courseAssignments: { course: { id: string; title: string } }[];
  }[],
): { value: string; label: string; classIds: string[] }[] {
  const byCourse = new Map<
    string,
    { value: string; label: string; classIds: string[] }
  >();
  for (const record of classes) {
    for (const assignment of record.courseAssignments) {
      const existing = byCourse.get(assignment.course.id);
      if (existing) {
        existing.classIds.push(record.id);
        continue;
      }
      byCourse.set(assignment.course.id, {
        value: assignment.course.id,
        label: assignment.course.title,
        classIds: [record.id],
      });
    }
  }
  return [...byCourse.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label) ||
      left.value.localeCompare(right.value),
  );
}

/**
 * What a row is allowed to print for a person.
 *
 * The academy's own override wins, then the account name, then the sign-in
 * handle. The email is the last resort rather than the first: it is the one
 * field here that is personal beyond the academy, and a roster has no reason to
 * publish it when a name exists.
 */
export function memberDisplayName(membership: {
  user: {
    displayName: string | null;
    username: string | null;
    email: string | null;
  };
  memberProfile?: { academyDisplayName: string | null } | null;
}): string {
  return (
    membership.memberProfile?.academyDisplayName?.trim() ||
    membership.user.displayName?.trim() ||
    membership.user.username?.trim() ||
    displayableEmail(membership.user.email) ||
    "—"
  );
}
