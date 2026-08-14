import { HttpStatus, Injectable } from "@nestjs/common";
import { ACADEMY_TIME_ZONE } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import {
  assignedClassWhere,
  classStudentWhere,
  classTaughtMaterialWhere,
  requireAssignedTeacherActor,
  type AssignedClassActor,
} from "../classes/assigned-class-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";

/**
 * The one gate in front of the academy overview.
 *
 * It resolves a scope rather than returning a boolean, for the same reason
 * Solution status does: a caller holding a scope is holding the classes, the
 * rosters, the assigned courses, and the visible exercises that authorized the
 * read. No aggregate below can be called without them and none can widen them.
 *
 * The predicate is the one in `classes/assigned-class-access.ts`, composed per
 * class. `class=all` is a union of classes that each satisfy it in full, which
 * is why a reassignment, archive, suspension, role change, course removal, or
 * enrollment removal changes the very next response — there is no cached list
 * of "my classes" anywhere for it to outlive.
 *
 * Every set it resolves is small: tens of classes, hundreds of students,
 * thousands of exercises. Resolving them up front is what lets each aggregate
 * downstream be one grouped query against explicit id lists instead of a walk
 * over student work.
 *
 * See §8.4 and §9 of the teacher academy overview design.
 */

export type OverviewStudent = {
  membershipId: string;
  userId: string;
  displayName: string;
  /** Every selected class this student sits in. Person totals de-duplicate. */
  classIds: string[];
};

/** One exercise a selected class is currently taught, in curriculum order. */
export type OverviewExercise = {
  materialId: string;
  title: string;
  position: number;
  lectureId: string;
  lectureTitle: string;
  lecturePosition: number;
  moduleId: string;
  moduleTitle: string;
  modulePosition: number;
  courseId: string;
  courseTitle: string;
};

/**
 * How far into the curriculum a read is narrowed.
 *
 * §5.4's chain — class → course → module → lecture → problem — expressed as
 * what the caller asked for. Nothing here is trusted: `requireScope` keeps only
 * the levels that survive the authorized exercise set, and clears every
 * descendant of one that does not.
 */
export type CurriculumSelection = {
  courseId?: string;
  moduleId?: string;
  lectureId?: string;
  problemId?: string;
};

/** One authorized curriculum node, with the parent that narrows it. */
export type CurriculumOptionRow = {
  value: string;
  label: string;
  parentId: string | null;
};

export type OverviewClassScope = {
  classId: string;
  className: string;
  students: OverviewStudent[];
  userIds: string[];
  membershipIds: string[];
  courseIds: string[];
  exercises: OverviewExercise[];
  materialIds: string[];
};

export type TeacherOverviewScope = {
  actor: AssignedClassActor;
  timeZone: string;
  /** The class filter as applied, or null when every assigned class is in. */
  selectedClassId: string | null;
  selectedCourseId: string | null;
  /** §5.4's deeper levels, each null unless it survived authorization. */
  selectedModuleId: string | null;
  selectedLectureId: string | null;
  selectedProblemId: string | null;
  /** The narrowest selected curriculum node's own name, for the caption. */
  curriculumLabel: string | null;
  classes: OverviewClassScope[];
  /** Every assigned class, filtered or not — the class picker's options. */
  classOptions: { value: string; label: string }[];
  courseOptions: { value: string; label: string; classIds: string[] }[];
  /**
   * The curriculum pickers, each already narrowed to what this teacher may
   * see. §5.4 — the server returns authorized options; the browser never
   * infers access, it only hides what the response already excluded.
   */
  moduleOptions: CurriculumOptionRow[];
  lectureOptions: CurriculumOptionRow[];
  problemOptions: CurriculumOptionRow[];
  /** Distinct students across the selected classes, counted once each. */
  students: OverviewStudent[];
  userIds: string[];
  membershipIds: string[];
  /** Distinct exercises across the selected classes, after every filter. */
  exercises: OverviewExercise[];
  materialIds: string[];
  courseIds: string[];
};

@Injectable()
export class TeacherOverviewAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  async requireTeacher(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<AssignedClassActor> {
    return requireAssignedTeacherActor({
      prisma: this.prisma,
      academyId,
      deniedCode: "TEACHER_OVERVIEW_ACCESS_DENIED",
      resolveActor: () =>
        this.access.requirePermission(
          identity.authUserId,
          academyId,
          "classes.assigned.manage",
        ),
    });
  }

  /**
   * Every assigned class in scope, with its roster and curriculum.
   *
   * Four bounded queries however many classes a teacher runs. The alternative —
   * one round trip per class — turns a ten-class teacher into forty queries
   * for a page that has to answer in half a second.
   *
   * An unknown or unauthorized class or course is not an error. §5.2 removes it
   * and renders the page for the scope that remains, because a shared link
   * whose class was archived last week should still open.
   */
  async requireScope(
    identity: SupabaseIdentity,
    input: { academyId: string; classId?: string } & CurriculumSelection,
  ): Promise<TeacherOverviewScope> {
    const actor = await this.requireTeacher(identity, input.academyId);

    const assigned = await this.prisma.class.findMany({
      where: assignedClassWhere(actor),
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    const classOptions = assigned.map((record) => ({
      value: record.id,
      label: record.name,
    }));

    // A class filter naming something this teacher does not run is dropped
    // rather than refused; the response says which scope it actually used.
    const selectedClassId =
      input.classId && assigned.some((record) => record.id === input.classId)
        ? input.classId
        : null;
    const inScope = selectedClassId
      ? assigned.filter((record) => record.id === selectedClassId)
      : assigned;
    const classIds = inScope.map((record) => record.id);

    if (classIds.length === 0) {
      return {
        actor,
        timeZone: ACADEMY_TIME_ZONE,
        selectedClassId,
        selectedCourseId: null,
        selectedModuleId: null,
        selectedLectureId: null,
        selectedProblemId: null,
        curriculumLabel: null,
        classes: [],
        classOptions,
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

    const [memberships, assignments, materials] = await Promise.all([
      this.prisma.academyMembership.findMany({
        where: classStudentWhere(actor.academyId, classIds),
        select: {
          id: true,
          userId: true,
          user: { select: { displayName: true, username: true, email: true } },
          classEnrollments: {
            where: { classId: { in: classIds } },
            select: { classId: true },
          },
        },
      }),
      this.prisma.classCourse.findMany({
        where: {
          classId: { in: classIds },
          course: { academyId: actor.academyId, isVisible: true },
        },
        select: {
          classId: true,
          course: { select: { id: true, title: true } },
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

    const courseOptions = dedupeCourses(assignments);
    const selectedCourseId =
      input.courseId &&
      courseOptions.some((option) => option.value === input.courseId)
        ? input.courseId
        : null;

    const taught: OverviewExercise[] = materials
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
      .sort(compareCurriculumOrder);

    // §5.4's chain, applied one level at a time against the exercises that
    // survived the level above. A descendant naming something the narrowed set
    // no longer contains is dropped along with everything under it, which is
    // what makes a stale deep link render a page instead of an error.
    const narrowed = narrowCurriculum(taught, {
      courseId: selectedCourseId ?? undefined,
      moduleId: input.moduleId,
      lectureId: input.lectureId,
      problemId: input.problemId,
    });
    const exercises = narrowed.exercises;

    const students: OverviewStudent[] = memberships
      .map((membership) => ({
        membershipId: membership.id,
        userId: membership.userId,
        displayName: displayNameOf(membership.user),
        classIds: membership.classEnrollments.map(
          (enrollment) => enrollment.classId,
        ),
      }))
      .sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName) ||
          left.membershipId.localeCompare(right.membershipId),
      );

    const classes: OverviewClassScope[] = inScope.map((record) => {
      const classStudents = students.filter((student) =>
        student.classIds.includes(record.id),
      );
      const classCourseIds = courseOptions
        .filter(
          (option) =>
            option.classIds.includes(record.id) &&
            (!selectedCourseId || option.value === selectedCourseId),
        )
        .map((option) => option.value);
      const classExercises = exercises.filter((exercise) =>
        classCourseIds.includes(exercise.courseId),
      );
      return {
        classId: record.id,
        className: record.name,
        students: classStudents,
        userIds: classStudents.map((student) => student.userId),
        membershipIds: classStudents.map((student) => student.membershipId),
        courseIds: classCourseIds,
        exercises: classExercises,
        materialIds: classExercises.map((exercise) => exercise.materialId),
      };
    });

    const courseIds = [
      ...new Set(classes.flatMap((entry) => entry.courseIds)),
    ];

    return {
      actor,
      timeZone: ACADEMY_TIME_ZONE,
      selectedClassId,
      selectedCourseId,
      selectedModuleId: narrowed.moduleId,
      selectedLectureId: narrowed.lectureId,
      selectedProblemId: narrowed.problemId,
      curriculumLabel: narrowed.label,
      classes,
      classOptions,
      courseOptions,
      // Options come from what a class *teaches*, not from what the current
      // filter left standing: a picker narrowed to its own selection would let
      // a teacher reach a lecture once and never leave it.
      moduleOptions: curriculumOptions(taught, "module", selectedCourseId),
      lectureOptions: curriculumOptions(taught, "lecture", narrowed.moduleId),
      problemOptions: curriculumOptions(taught, "problem", narrowed.lectureId),
      students,
      userIds: students.map((student) => student.userId),
      membershipIds: students.map((student) => student.membershipId),
      exercises,
      materialIds: exercises.map((exercise) => exercise.materialId),
      courseIds,
    };
  }

  /** A class in scope, or a refusal that names nothing. */
  requireClass(
    scope: TeacherOverviewScope,
    classId: string,
  ): OverviewClassScope {
    const found = scope.classes.find((entry) => entry.classId === classId);
    if (!found) {
      throw new AppException(
        "TEACHER_OVERVIEW_ACCESS_DENIED",
        HttpStatus.FORBIDDEN,
      );
    }
    return found;
  }
}

/**
 * §5.4's dependent filters, resolved against the authorized exercise set.
 *
 * Each level narrows the set the next one is checked against, so a module from
 * another course, a lecture from another module, or a problem from another
 * lecture is not merely unselected — it is impossible to name, because by the
 * time it is checked the set it would have to appear in is already gone.
 *
 * A level that fails clears itself and every level below it. Keeping a lecture
 * whose module was dropped would leave the response describing a scope no
 * picker on the page could reproduce.
 */
function narrowCurriculum(
  taught: OverviewExercise[],
  selection: CurriculumSelection,
): {
  exercises: OverviewExercise[];
  moduleId: string | null;
  lectureId: string | null;
  problemId: string | null;
  label: string | null;
} {
  let exercises = selection.courseId
    ? taught.filter((exercise) => exercise.courseId === selection.courseId)
    : taught;
  let label =
    (selection.courseId ? exercises[0]?.courseTitle : null) ?? null;

  const moduleMatch = selection.moduleId
    ? exercises.filter((exercise) => exercise.moduleId === selection.moduleId)
    : null;
  if (!moduleMatch || moduleMatch.length === 0) {
    return { exercises, moduleId: null, lectureId: null, problemId: null, label };
  }
  exercises = moduleMatch;
  label = moduleMatch[0].moduleTitle;

  const lectureMatch = selection.lectureId
    ? exercises.filter((exercise) => exercise.lectureId === selection.lectureId)
    : null;
  if (!lectureMatch || lectureMatch.length === 0) {
    return {
      exercises,
      moduleId: selection.moduleId!,
      lectureId: null,
      problemId: null,
      label,
    };
  }
  exercises = lectureMatch;
  label = lectureMatch[0].lectureTitle;

  const problemMatch = selection.problemId
    ? exercises.filter((exercise) => exercise.materialId === selection.problemId)
    : null;
  if (!problemMatch || problemMatch.length === 0) {
    return {
      exercises,
      moduleId: selection.moduleId!,
      lectureId: selection.lectureId!,
      problemId: null,
      label,
    };
  }

  return {
    exercises: problemMatch,
    moduleId: selection.moduleId!,
    lectureId: selection.lectureId!,
    problemId: selection.problemId!,
    label: problemMatch[0].title,
  };
}

/**
 * One picker's options, deduplicated and in curriculum order.
 *
 * `parent` filters rather than the current selection so the list stays the set
 * a teacher can move between. Passing null means "every authorized node at this
 * level", which is what an unselected ancestor should show.
 */
function curriculumOptions(
  taught: OverviewExercise[],
  level: "module" | "lecture" | "problem",
  parentId: string | null,
): CurriculumOptionRow[] {
  const seen = new Map<string, CurriculumOptionRow>();
  for (const exercise of taught) {
    const row: CurriculumOptionRow =
      level === "module"
        ? {
            value: exercise.moduleId,
            label: exercise.moduleTitle,
            parentId: exercise.courseId,
          }
        : level === "lecture"
          ? {
              value: exercise.lectureId,
              label: exercise.lectureTitle,
              parentId: exercise.moduleId,
            }
          : {
              value: exercise.materialId,
              label: exercise.title,
              parentId: exercise.lectureId,
            };
    if (parentId && row.parentId !== parentId) continue;
    if (!seen.has(row.value)) seen.set(row.value, row);
  }
  return [...seen.values()];
}

/** One row per course, carrying every selected class that teaches it. */
function dedupeCourses(
  assignments: { classId: string; course: { id: string; title: string } }[],
): { value: string; label: string; classIds: string[] }[] {
  const byCourse = new Map<
    string,
    { value: string; label: string; classIds: string[] }
  >();
  for (const assignment of assignments) {
    const existing = byCourse.get(assignment.course.id);
    if (existing) {
      existing.classIds.push(assignment.classId);
      continue;
    }
    byCourse.set(assignment.course.id, {
      value: assignment.course.id,
      label: assignment.course.title,
      classIds: [assignment.classId],
    });
  }
  return [...byCourse.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label) ||
      left.value.localeCompare(right.value),
  );
}

/**
 * What a roster row is allowed to print.
 *
 * The email is the last resort rather than the first: it is the one field here
 * that is personal beyond the classroom, and a class list has no reason to
 * publish it when a name or a sign-in handle exists.
 */
function displayNameOf(user: {
  displayName: string | null;
  username: string | null;
  email: string | null;
}): string {
  return user.displayName?.trim() || user.username?.trim() || user.email || "—";
}

/** Course, module, lecture, then material — the order the outline prints. */
function compareCurriculumOrder(
  left: OverviewExercise,
  right: OverviewExercise,
): number {
  return (
    left.courseTitle.localeCompare(right.courseTitle) ||
    left.courseId.localeCompare(right.courseId) ||
    left.modulePosition - right.modulePosition ||
    left.lecturePosition - right.lecturePosition ||
    left.position - right.position ||
    left.materialId.localeCompare(right.materialId)
  );
}
