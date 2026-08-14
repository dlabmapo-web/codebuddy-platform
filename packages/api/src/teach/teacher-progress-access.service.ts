import { HttpStatus, Injectable } from "@nestjs/common";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import {
  assignedClassWhere,
  classStudentWhere,
  classTaughtMaterialWhere,
  requireAssignedTeacherActor,
} from "../classes/assigned-class-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";

/**
 * The one gate in front of every Solution status read.
 *
 * It returns a scope rather than a boolean. A caller holding a
 * `TeacherClassScope` is holding the roster, the assigned courses, and the
 * exercises that roster can currently see — the facts that authorized the
 * read, not a remembered decision — so no repository method can be called
 * without them and none can widen them.
 *
 * Every operation resolves the scope again from current database state. A
 * reassignment, archive, suspension, role change, departure, or enrollment
 * removal therefore revokes the next read rather than the next session.
 *
 * It deliberately knows nothing about presence, sockets, or the
 * `TEACHER_LIVE_MONITORING` flag: a class whose academy is outside the live
 * rollout still has solution history worth reading.
 *
 * See §6 and §13.1 of the teacher solution status design.
 */

export type TeacherProgressActor = {
  userId: string;
  academyId: string;
  /** The teacher's own membership, which is what a class assignment stores. */
  membershipId: string;
};

export type ScopedStudent = {
  membershipId: string;
  userId: string;
  displayName: string;
};

/** One exercise this class is currently taught, in curriculum order. */
export type ScopedExercise = {
  materialId: string;
  title: string;
  position: number;
  isRequired: boolean;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  gradingRevision: number;
  lectureId: string;
  lectureTitle: string;
  lectureDescription: string;
  lecturePosition: number;
  moduleId: string;
  moduleTitle: string;
  modulePosition: number;
  courseId: string;
  courseTitle: string;
};

export type TeacherClassScope = {
  actor: TeacherProgressActor;
  classId: string;
  className: string;
  students: ScopedStudent[];
  studentUserIds: string[];
  courses: { id: string; title: string; description: string }[];
  /** Visible programming exercises of the assigned courses, in outline order. */
  exercises: ScopedExercise[];
};

@Injectable()
export class TeacherProgressAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  /**
   * Resolves the acting teacher, or refuses.
   *
   * The rule itself lives beside the assigned-class predicate, so this surface
   * and the academy overview cannot end up with two versions of "is this
   * person a teacher here" that drift apart.
   */
  async requireTeacher(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<TeacherProgressActor> {
    return requireAssignedTeacherActor({
      prisma: this.prisma,
      academyId,
      deniedCode: "TEACHER_PROGRESS_ACCESS_DENIED",
      resolveActor: () =>
        this.access.requirePermission(
          identity.authUserId,
          academyId,
          "classes.assigned.manage",
        ),
    });
  }

  /**
   * The whole read scope for one class, in three bounded queries.
   *
   * Bounded is the property that matters: a roster and a curriculum are
   * measured in tens and hundreds of rows, while submissions are measured in
   * tens of thousands. Resolving the small sets up front is what lets every
   * aggregate downstream be a single grouped query against explicit id lists
   * instead of a walk over student work.
   */
  async requireClassScope(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string },
  ): Promise<TeacherClassScope> {
    const actor = await this.requireTeacher(identity, input.academyId);

    const record = await this.prisma.class.findFirst({
      where: { id: input.classId, ...assignedClassWhere(actor) },
      select: { id: true, name: true },
    });
    if (!record) {
      // One code for every failure — not assigned, archived, wrong academy,
      // suspended membership, no such class — so a teacher cannot map another
      // academy's classes by reading the errors they get back.
      throw new AppException(
        "TEACHER_PROGRESS_ACCESS_DENIED",
        HttpStatus.FORBIDDEN,
      );
    }

    const [memberships, courses, materials] = await Promise.all([
      this.prisma.academyMembership.findMany({
        where: classStudentWhere(actor.academyId, record.id),
        select: {
          id: true,
          userId: true,
          user: { select: { displayName: true, username: true, email: true } },
        },
      }),
      this.prisma.course.findMany({
        where: {
          academyId: actor.academyId,
          isVisible: true,
          classAssignments: { some: { classId: record.id } },
        },
        select: { id: true, title: true, description: true },
        orderBy: [{ title: "asc" }, { id: "asc" }],
      }),
      this.prisma.material.findMany({
        where: classTaughtMaterialWhere(actor.academyId, record.id),
        select: {
          id: true,
          title: true,
          position: true,
          isRequired: true,
          programmingExercise: {
            select: { difficulty: true, gradingRevision: true },
          },
          lecture: {
            select: {
              id: true,
              title: true,
              description: true,
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

    const students: ScopedStudent[] = memberships
      .map((membership) => ({
        membershipId: membership.id,
        userId: membership.userId,
        displayName: displayNameOf(membership.user),
      }))
      .sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName) ||
          left.membershipId.localeCompare(right.membershipId),
      );

    const exercises: ScopedExercise[] = materials
      .flatMap((material) => {
        const exercise = material.programmingExercise;
        // Narrowing, not filtering twice: `classTaughtMaterialWhere` already
        // requires the relation, and this is what tells TypeScript so.
        if (!exercise) return [];
        const lecture = material.lecture;
        const courseModule = lecture.courseModule;
        return [
          {
            materialId: material.id,
            title: material.title,
            position: material.position,
            isRequired: material.isRequired,
            difficulty: exercise.difficulty,
            gradingRevision: exercise.gradingRevision,
            lectureId: lecture.id,
            lectureTitle: lecture.title,
            lectureDescription: lecture.description,
            lecturePosition: lecture.position,
            moduleId: courseModule.id,
            moduleTitle: courseModule.title,
            modulePosition: courseModule.position,
            courseId: courseModule.course.id,
            courseTitle: courseModule.course.title,
          },
        ];
      })
      .sort(compareCurriculumOrder);

    return {
      actor,
      classId: record.id,
      className: record.name,
      students,
      studentUserIds: students.map((student) => student.userId),
      courses,
      exercises,
    };
  }

  /**
   * One student of this class, or a not-found.
   *
   * Resolved from the scope rather than re-queried: the roster is already the
   * authorization boundary, so a membership id that is not on it fails closed
   * without a second round trip and without a second, drifting definition of
   * who belongs to the class.
   */
  requireStudent(scope: TeacherClassScope, membershipId: string): ScopedStudent {
    const student = scope.students.find(
      (candidate) => candidate.membershipId === membershipId,
    );
    if (!student) {
      throw new AppException(
        "TEACHER_PROGRESS_NOT_FOUND",
        HttpStatus.NOT_FOUND,
      );
    }
    return student;
  }

  /** One in-scope exercise, by the same rule and with the same answer. */
  requireExercise(scope: TeacherClassScope, materialId: string): ScopedExercise {
    const exercise = scope.exercises.find(
      (candidate) => candidate.materialId === materialId,
    );
    if (!exercise) {
      throw new AppException(
        "TEACHER_PROGRESS_NOT_FOUND",
        HttpStatus.NOT_FOUND,
      );
    }
    return exercise;
  }
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
  left: ScopedExercise,
  right: ScopedExercise,
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
