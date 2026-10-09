import { effectiveManualResult } from "@cove/shared";
import { pdfMetadata } from "../documents/pdf-metadata.js";
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
            include: {
              programmingExercise: true,
              manualMaterial: true,
              pdfDocument: { include: { asset: true } },
            },
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
    classId?: string,
  ): Promise<LearnCourseOutline> {
    const modules = nonemptyModules(course);
    const materialIds = exerciseMaterialIds({ ...course, modules });
    // One `userId + materialIds` query for the whole course. A per-row lookup
    // is what made v1's outline scale with the size of the curriculum.
    const statuses = await this.statusByMaterial(userId, materialIds, classId);

    const manualIds = modules.flatMap((module) =>
      module.lectures.flatMap((lecture) =>
        lecture.materials.filter((m) => m.manualMaterial).map((m) => m.id),
      ),
    );
    const manualAttempts = manualIds.length
      ? await this.prisma.manualSubmission.findMany({
          where: { userId, classId, materialId: { in: manualIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["materialId"],
          select: {
            materialId: true,
            includeInScore: true,
            maximumHundredths: true,
            shortAnswerAssessment: {select:{status:true, completed:true, scoreHundredths:true}},
        multipleChoiceAssessment: {select:{status:true,completed:true,scoreHundredths:true}},
        reviews: {
              orderBy: { version: "desc" },
              take: 1,
              select: { completed: true, scoreHundredths: true },
            },
          },
        })
      : [];
    const manualStatuses = new Map(
      manualAttempts.map((a) => [a.materialId, a]),
    );
    const eligible = modules.flatMap((module) =>
      module.lectures.flatMap((lecture) =>
        lecture.materials
          .filter((m) => m.manualMaterial?.includeInScore)
          .map((m) => m.id),
      ),
    );

    return {
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
      },
      manualAssessment: manualGradeSummaryFor(course, statuses),
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
          manualMaterials: lecture.materials.flatMap((material) => {
            if (!material.manualMaterial) return [];
            const attempt = manualStatuses.get(material.id),
              review = effectiveManualResult(attempt);
            return [
              {
                materialId: material.id,
                title: material.title,
                position: material.position,
                type: material.type as "TURTLE_EXERCISE" | "WRITTEN_RESPONSE" | "MULTIPLE_CHOICE",
                includeInScore: material.manualMaterial.includeInScore,
                status: review?.completed
                  ? ("SOLVED" as const)
                  : attempt
                    ? ("IN_PROGRESS" as const)
                    : ("NOT_STARTED" as const),
                pending: Boolean(attempt && !review),
                scoreHundredths: review?.scoreHundredths ?? null,
                maximumHundredths:
                  attempt?.maximumHundredths ??
                  material.manualMaterial.maximumHundredths,
              },
            ];
          }),
          documents: lecture.materials.flatMap((material) =>
            material.pdfDocument?.asset.state === "READY"
              ? [
                  {
                    materialId: material.id,
                    title: material.title,
                    position: material.position,
                    pdf: pdfMetadata(material.pdfDocument),
                  },
                ]
              : [],
          ),
          exercises: lecture.materials.flatMap((material) =>
            material.programmingExercise
              ? [
                  {
                    materialId: material.id,
                    title: material.title,
                    position: material.position,
                    difficulty: material.programmingExercise.difficulty,
                    status: statuses.get(material.id)?.status ?? "NOT_STARTED",
                    bestScore: statuses.get(material.id)?.bestScore ?? 0,
                  },
                ]
              : [],
          ),
        })),
      })),
    };
  }

  async statusByMaterial(
    userId: string,
    materialIds: string[],
    classId?: string,
  ): Promise<ProgressByMaterial> {
    const statuses: ProgressByMaterial = new Map();
    if (materialIds.length === 0) return statuses;
    const [drafts, progress, revisions] = await Promise.all([
      this.prisma.exerciseDraft.findMany({
        where: { userId, materialId: { in: materialIds } },
        select: { materialId: true },
      }),
      this.prisma.studentExerciseProgress.findMany({
        where: { userId, materialId: { in: materialIds } },
        select: {
          materialId: true,
          status: true,
          bestScore: true,
          gradingRevision: true,
        },
      }),
      // What each problem grades against *now*. Without it this projection
      // cannot tell a current record from one an author's correction has
      // already invalidated — see the note on the skip below.
      this.prisma.programmingExercise.findMany({
        where: { materialId: { in: materialIds } },
        select: { materialId: true, gradingRevision: true },
      }),
    ]);
    const currentRevision = new Map(
      revisions.map((exercise) => [
        exercise.materialId,
        exercise.gradingRevision,
      ]),
    );
    for (const draft of drafts) {
      if (!draft.materialId) continue;
      statuses.set(draft.materialId, {
        status: progressStatusFromDraft(true),
        bestScore: 0,
      });
    }
    for (const record of progress) {
      if (record.status === "NOT_STARTED") continue;
      // A record graded against a superseded revision is not an answer to the
      // problem as it stands, and saying otherwise made two pages disagree
      // about one student: this outline read "Solved, 100/100" while the
      // problem it linked to read "not solved", because only the problem page
      // compared the revisions. Skipping leaves whatever the draft loop set —
      // `IN_PROGRESS` if they have work saved, `NOT_STARTED` if they do not —
      // which is exactly what `LearnService` falls back to.
      //
      // A re-grade restores the record at the current revision and both
      // surfaces agree again.
      if (record.gradingRevision !== currentRevision.get(record.materialId)) {
        continue;
      }
      statuses.set(record.materialId, {
        status: record.status,
        bestScore: record.bestScore,
      });
    }
    const attempts = await this.prisma.manualSubmission.findMany({
      where: { userId, classId, materialId: { in: materialIds } },
      distinct: ["materialId"],
      orderBy: { createdAt: "desc" },
      select: {
        materialId: true,
        includeInScore: true,
        maximumHundredths: true,
        shortAnswerAssessment: {select:{status:true, completed:true, scoreHundredths:true}},
        multipleChoiceAssessment: {select:{status:true,completed:true,scoreHundredths:true}},
        reviews: {
          orderBy: { version: "desc" },
          take: 1,
          select: { completed: true, scoreHundredths: true },
        },
      },
    });
    for (const attempt of attempts)
      statuses.set(attempt.materialId, {
        status:
          attempt.includeInScore && effectiveManualResult(attempt)?.completed
            ? "SOLVED"
            : "IN_PROGRESS",
        bestScore: 0,
        scoreHundredths: attempt.includeInScore
          ? effectiveManualResult(attempt)?.scoreHundredths
          : undefined,
        maximumHundredths: attempt.maximumHundredths,
      });
    return statuses;
  }
}

export type ProgressByMaterial = Map<
  string,
  {
    status: ExerciseProgressStatus;
    bestScore: number;
    scoreHundredths?: number;
    maximumHundredths?: number;
  }
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
      documents: modules.reduce(
        (sum, module) =>
          sum +
          module.lectures.reduce(
            (n, lecture) =>
              n +
              lecture.materials.filter(
                (m) => m.pdfDocument?.asset.state === "READY",
              ).length,
            0,
          ),
        0,
      ),
    },
    manualAssessment: manualGradeSummaryFor(course, statuses),
    progress: countProgress(exercises, statuses),
  };
}

/** A lecture with no exercise is a heading; a module of those is not a module. */
export function nonemptyModules(
  course: VisibleCourse,
): VisibleCourse["modules"] {
  return course.modules.flatMap((courseModule) => {
    const lectures = courseModule.lectures.filter((lecture) =>
      lecture.materials.some(
        (material) =>
          material.programmingExercise != null ||
          material.manualMaterial != null ||
          material.pdfDocument?.asset.state === "READY",
      ),
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
        material.programmingExercise || material.manualMaterial?.includeInScore
          ? [material.id]
          : [],
      ),
    ),
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

export function manualGradeSummaryFor(
  course: Pick<VisibleCourse, "modules">,
  statuses: ProgressByMaterial,
) {
  let maximumHundredths = 0,
    scoreHundredths = 0,
    reviewed = 0,
    pending = 0;
  for (const module of course.modules)
    for (const lecture of module.lectures)
      for (const material of lecture.materials) {
        if (!material.manualMaterial?.includeInScore) continue;
        const status = statuses.get(material.id);
        maximumHundredths +=
          status?.maximumHundredths ??
          material.manualMaterial.maximumHundredths;
        if (status?.scoreHundredths !== undefined) {
          scoreHundredths += status.scoreHundredths;
          reviewed++;
        } else if (status?.maximumHundredths !== undefined) pending++;
      }
  return { maximumHundredths, scoreHundredths, reviewed, pending };
}
