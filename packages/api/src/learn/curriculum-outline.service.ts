import { Injectable } from "@nestjs/common";
import {
  progressStatusFromDraft,
  type ExerciseProgressStatus,
  type LearnCourseOutline,
  type LearnCourseSummary,
} from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * One course, shaped as an outline, for one person's progress.
 *
 * Deliberately unauthorized: it takes a course and a user id and answers
 * about exactly those. Every caller obtains both from a gate of its own — the
 * student's learning scope, or the teacher's assigned-class claim — and this
 * service is what stops those two gates from growing two different ideas of
 * what a course looks like or what "started" means.
 *
 * The student's own outline page, both fullscreen navigators, and the
 * teacher's copy of a student's curriculum are all this function.
 */

/** The one student-visible hierarchy. Every read applies all ancestor flags. */
export const visibleCurriculumInclude = {
  modules: {
    where: { isVisible: true },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      lectures: {
        where: { isVisible: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          materials: {
            where: { isVisible: true },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: { programmingExercise: true },
          },
        },
      },
    },
  },
} as const satisfies Prisma.CourseInclude;

export type VisibleCourse = Prisma.CourseGetPayload<{
  include: typeof visibleCurriculumInclude;
}>;

@Injectable()
export class CurriculumOutlineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads one effectively visible course and folds a user's progress in.
   *
   * Returns `null` for a course that is not effectively visible in this
   * academy. Callers turn that into whichever "not available" their own
   * surface already uses, so this never decides how a refusal reads.
   */
  async outlineForCourse(
    courseId: string,
    academyId: string,
    userId: string,
  ): Promise<LearnCourseOutline | null> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, academyId, isVisible: true },
      include: visibleCurriculumInclude,
    });
    return course ? this.outlineFor(course, userId) : null;
  }

  /** The same fold, for a caller that already read the course graph. */
  async outlineFor(
    course: VisibleCourse,
    userId: string,
  ): Promise<LearnCourseOutline> {
    const modules = nonemptyModules(course);
    const materialIds = exerciseMaterialIds({ ...course, modules });
    // One `userId + materialIds` query for the whole course. A per-row lookup
    // is what made v1's outline scale with the size of the curriculum.
    const statuses = await this.statusByMaterial(userId, materialIds);

    return {
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
      },
      progress: countProgress(materialIds, statuses),
      modules: modules.map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        description: courseModule.description,
        position: courseModule.position,
        lectures: courseModule.lectures.map((lecture) => ({
          id: lecture.id,
          title: lecture.title,
          description: lecture.description,
          position: lecture.position,
          exercises: lecture.materials.flatMap((material) =>
            material.programmingExercise
              ? [{
                  materialId: material.id,
                  title: material.title,
                  position: material.position,
                  difficulty: material.programmingExercise.difficulty,
                  status: statuses.get(material.id)?.status ?? "NOT_STARTED",
                  bestScore: statuses.get(material.id)?.bestScore ?? 0,
                }]
              : []
          ),
        })),
      })),
    };
  }

  async statusByMaterial(
    userId: string,
    materialIds: string[],
  ): Promise<ProgressByMaterial> {
    const statuses: ProgressByMaterial = new Map();
    if (materialIds.length === 0) return statuses;
    const [drafts, progress] = await Promise.all([
      this.prisma.exerciseDraft.findMany({
        where: { userId, materialId: { in: materialIds } },
        select: { materialId: true },
      }),
      this.prisma.studentExerciseProgress.findMany({
        where: { userId, materialId: { in: materialIds } },
        select: { materialId: true, status: true, bestScore: true },
      }),
    ]);
    for (const draft of drafts) {
      if (!draft.materialId) continue;
      statuses.set(draft.materialId, {
        status: progressStatusFromDraft(true),
        bestScore: 0,
      });
    }
    for (const record of progress) {
      if (record.status === "NOT_STARTED") continue;
      statuses.set(record.materialId, {
        status: record.status,
        bestScore: record.bestScore,
      });
    }
    return statuses;
  }
}

export type ProgressByMaterial = Map<
  string,
  { status: ExerciseProgressStatus; bestScore: number }
>;

/**
 * One course as a catalog card, or nothing.
 *
 * A course with nothing visible inside it still gets a summary, with zero
 * counts. It was dropped once, and the silence was worse than the empty course:
 * a student assigned a published course simply had no row for it anywhere, and
 * nothing on any surface said why. The outline behind it already renders "this
 * course has no problems yet" — that state existed and was unreachable. A
 * zero-count card is a course that is not ready; no card at all is a course
 * that appears not to exist.
 *
 * The single projection behind both **My Courses** and a class detail page.
 * Two copies would be two ideas of what "12 problems" or "3 started" means,
 * and the same course would then read differently depending on which page a
 * student arrived from.
 */
export function courseSummaryFor(
  course: VisibleCourse,
  statuses: ProgressByMaterial,
): LearnCourseSummary {
  const modules = nonemptyModules(course);
  const exercises = exerciseMaterialIds({ modules });

  return {
    courseId: course.id,
    title: course.title,
    description: course.description,
    counts: {
      modules: modules.length,
      lectures: modules.reduce(
        (total, courseModule) => total + courseModule.lectures.length,
        0,
      ),
      exercises: exercises.length,
    },
    progress: countProgress(exercises, statuses),
  };
}

/** A lecture with no exercise is a heading; a module of those is not a module. */
export function nonemptyModules(course: VisibleCourse): VisibleCourse["modules"] {
  return course.modules.flatMap((courseModule) => {
    const lectures = courseModule.lectures.filter((lecture) =>
      lecture.materials.some((material) => material.programmingExercise !== null)
    );
    return lectures.length > 0 ? [{ ...courseModule, lectures }] : [];
  });
}

export function exerciseMaterialIds(
  course: Pick<VisibleCourse, "modules">,
): string[] {
  return course.modules.flatMap((courseModule) =>
    courseModule.lectures.flatMap((lecture) =>
      lecture.materials.flatMap((material) =>
        material.programmingExercise ? [material.id] : []
      )
    )
  );
}

export function countProgress(
  materialIds: string[],
  statuses: ProgressByMaterial,
) {
  let started = 0;
  let solved = 0;
  for (const id of materialIds) {
    const status = statuses.get(id)?.status;
    if (status === "SOLVED") solved += 1;
    else if (status === "IN_PROGRESS") started += 1;
  }
  return { total: materialIds.length, started: started + solved, solved };
}
