import { readAssessmentRevisions, readManualOutlineResults, readVideoOutlineResults } from "./manual-assessment-read.js";
import { programmingAssessment } from "./programming-assessment.js";
import {videoMetadata} from "../videos/video-metadata.js";
import { pdfMetadata } from "../documents/pdf-metadata.js";
import { Injectable } from "@nestjs/common";
import {
  pdfIsMain,
  progressStatusFromDraft,
  type CourseLanguage,
  type ExerciseProgressStatus,
  type LearnCourseOutline,
  type LearnCourseSummary,
} from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { withCurriculum } from "./curriculum-read.js";

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
            // Only what outlines, summaries and progress read. Exercise text,
            // starter code, solutions and manual content are loaded by the
            // workspace that shows them, not once per material of a course.
            include: {
              programmingExercise: { select: { difficulty: true, submissionPolicy: true, referencePdfMaterialId: true, manualMaximumHundredths: true, manualIncludeInScore: true } },
              manualMaterial: { select: { includeInScore: true, maximumHundredths: true } },
              videoLesson: {
                select: { assetId: true, revision: true, placement: true, includeInScore: true, maximumHundredths: true,
                  asset: { select: { state: true, durationMs: true, filename: true, byteSize: true } } },
              },
              pdfDocument: {
                select: { placement: true, revision: true,
                  asset: { select: { state: true, originalFilename: true, byteSize: true, pageCount: true } } },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.CourseInclude;

/** Same hierarchy shape, only after a separate curriculum.review authorization. */
export const previewCurriculumInclude = {
  modules: { ...visibleCurriculumInclude.modules, where: {}, include: {
    lectures: { ...visibleCurriculumInclude.modules.include.lectures, where: {}, include: {
      materials: { ...visibleCurriculumInclude.modules.include.lectures.include.materials, where: {} },
    } },
  } },
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
    });
    return course ? this.outlineFor(await withCurriculum(this.prisma, course), userId) : null;
  }

  /** The same fold, for a caller that already read the course graph. */
  async outlineFor(
    course: Pick<VisibleCourse, "id" | "title" | "description" | "modules"> & { language?: CourseLanguage },
    userId: string,
    classId?: string,
    staffPractice = false,
  ): Promise<LearnCourseOutline> {
    const modules = nonemptyModules(course);
    const materialIds = navigableMaterialIds({ ...course, modules });
    // One `userId + materialIds` query for the whole course. A per-row lookup
    // is what made v1's outline scale with the size of the curriculum.
    const statuses = staffPractice ? new Map() : await this.statusByMaterial(userId, materialIds, classId, readingMaterialIds({ ...course, modules }));

    return {
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        language: course.language,
      },
      ...(staffPractice ? {} : { manualAssessment: manualGradeSummaryFor(course, statuses) }),
      progress: countProgress(gradedMaterialIds({ ...course, modules }), statuses),
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
            const attempt = statuses.get(material.id),
              review = attempt?.manualResult;
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
          videos:lecture.materials.flatMap(material=>material.videoLesson?.asset.state==="READY"&&material.videoLesson.placement!=="SUPPLEMENTARY"?[{materialId:material.id,title:material.title,position:material.position,video:videoMetadata(material.videoLesson),status:statuses.get(material.id)?.status??"NOT_STARTED"}]:[]),
          explanations: lecture.materials.filter(m => m.type === "EXPLANATION").map(m => ({ materialId: m.id, title: m.title, position: m.position, status: statuses.get(m.id)?.status === "SOLVED" ? "SOLVED" as const : "NOT_STARTED" as const })),
          documents: lecture.materials.flatMap((material) =>
            material.pdfDocument?.asset.state === "READY"
              ? [
                  {
                    materialId: material.id,
                    title: material.title,
                    position: material.position,
                    pdf: pdfMetadata(material.pdfDocument),
                    status: statuses.get(material.id)?.status === "SOLVED" ? "SOLVED" as const : "NOT_STARTED" as const,
                  },
                ]
              : [],
          ),
          exercises: lecture.materials.flatMap((material) =>
            material.type === 'PROGRAMMING_EXERCISE' && material.programmingExercise
              ? [
                  {
                    materialId: material.id,
                    title: material.title,
                    position: material.position,
                    difficulty: material.programmingExercise.difficulty,
                    submissionPolicy: material.programmingExercise.submissionPolicy ?? "AUTOMATIC",
                    manualAssessment: {maximumHundredths: material.programmingExercise.manualMaximumHundredths, includeInScore: material.programmingExercise.manualIncludeInScore},
                    hasReferencePdf: Boolean(material.programmingExercise.referencePdfMaterialId),
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
    readingIds: string[] = [],
  ): Promise<ProgressByMaterial> {
    const statuses: ProgressByMaterial = new Map();
    if (materialIds.length === 0) return statuses;
    const readingSet = new Set(readingIds);
    const workIds = materialIds.filter(id => !readingSet.has(id));
    const [drafts, progress, revisions, views, attempts, videos] = await Promise.all([
      workIds.length ? this.prisma.exerciseDraft.findMany({
        where: { userId, materialId: { in: workIds }, material: { type: 'PROGRAMMING_EXERCISE' } },
        select: { materialId: true },
      }) : Promise.resolve([]),
      workIds.length ? this.prisma.studentExerciseProgress.findMany({
        where: { userId, materialId: { in: workIds }, material: { type: 'PROGRAMMING_EXERCISE' } },
        select: {
          materialId: true,
          status: true,
          bestScore: true,
          gradingRevision: true,
        },
      }) : Promise.resolve([]),
      // What each problem grades against *now*. Without it this projection
      // cannot tell a current record from one an author's correction has
      // already invalidated — see the note on the skip below.
      workIds.length ? readAssessmentRevisions(this.prisma, workIds, userId, classId) : Promise.resolve([]),
      readingIds.length ? this.prisma.studentMaterialView.findMany({ where: { userId, materialId: { in: readingIds } }, select: { materialId: true } }) : Promise.resolve([]),
      readManualOutlineResults(this.prisma, workIds, userId, classId),
      readVideoOutlineResults(this.prisma, workIds, userId, classId),
    ]);
    for (const view of views) statuses.set(view.materialId, { status: "SOLVED", bestScore: 0 });
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
      if (record.gradingRevision !== currentRevision.get(record.materialId) || revisions.find(r => r.materialId === record.materialId)?.submissionPolicy === "MANUAL_REVIEW") {
        continue;
      }
      statuses.set(record.materialId, {
        status: record.status,
        bestScore: record.bestScore,
      });
    }
    for (const row of revisions) {
      if (row.submissionPolicy !== 'MANUAL_REVIEW' || !row.manualAssessmentSnapshot) continue;
      const assessment = programmingAssessment(row);
      statuses.set(row.materialId, {status: assessment.completed ? 'SOLVED' : 'IN_PROGRESS', bestScore: 0,
        scoreHundredths: assessment.includeInScore ? assessment.scoreHundredths ?? undefined : undefined,
        maximumHundredths: assessment.maximumHundredths});
    }
    for (const attempt of attempts) {
      const result = attempt.completed !== null && attempt.scoreHundredths !== null
        ? { completed: attempt.completed, scoreHundredths: attempt.scoreHundredths } : null;
      statuses.set(attempt.materialId, {
        status: result?.completed ? "SOLVED" : "IN_PROGRESS", bestScore: 0,
        manualResult: result,
        scoreHundredths: attempt.includeInScore ? result?.scoreHundredths : undefined,
        maximumHundredths: attempt.maximumHundredths,
      });
    }
    for (const video of videos) statuses.set(video.materialId, {
      status: video.completed ? "SOLVED" : "IN_PROGRESS", bestScore: 0,
      scoreHundredths: video.includeInScore ? video.completed ? video.maximumHundredths : 0 : undefined,
      maximumHundredths: video.maximumHundredths,
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
    manualResult?: { completed: boolean; scoreHundredths: number } | null;
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
        language: course.language,
    counts: {
      modules: modules.length,
      lectures: modules.reduce(
        (total, courseModule) => total + courseModule.lectures.length,
        0,
      ),
      exercises: exercises.length,
      explanations: modules.reduce((sum, module) => sum + module.lectures.reduce((n, lecture) => n + lecture.materials.filter(m => m.type === "EXPLANATION").length, 0), 0),
      documents: modules.reduce(
        (sum, module) =>
          sum +
          module.lectures.reduce(
            (n, lecture) =>
              n +
              // Theory a student opens as a lesson. A supplementary-only PDF is
              // reached from the course page, not by Next/Previous (QA S-02).
              lecture.materials.filter(
                (m) => m.pdfDocument?.asset.state === "READY" && pdfIsMain(m.pdfDocument.placement),
              ).length,
            0,
          ),
        0,
      ),
    },
    manualAssessment: manualGradeSummaryFor(course, statuses),
    progress: countProgress(gradedMaterialIds({ ...course, modules }), statuses),
  };
}

/** A lecture with no exercise is a heading; a module of those is not a module. */
export function nonemptyModules(
  course: Pick<VisibleCourse, "modules">,
): VisibleCourse["modules"] {
  return course.modules.flatMap((courseModule) => {
    const lectures = courseModule.lectures.filter((lecture) =>
      lecture.materials.some(
        (material) =>
          material.type === "EXPLANATION" ||
          material.programmingExercise != null ||
          material.manualMaterial != null ||
          material.pdfDocument?.asset.state === "READY" || material.videoLesson?.asset.state === "READY",
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
        (material.type === 'PROGRAMMING_EXERCISE' && material.programmingExercise) || material.manualMaterial?.includeInScore || (material.videoLesson?.includeInScore && material.videoLesson.asset.state==="READY" && material.videoLesson.placement!=="SUPPLEMENTARY")
          ? [material.id]
          : [],
      ),
    ),
  );
}

/** Practice remains navigable but never increases the graded-progress denominator. */
export function readingMaterialIds(course: Pick<VisibleCourse, "modules">): string[] {
  return course.modules.flatMap(m => m.lectures.flatMap(l => l.materials.filter(row => row.type === "EXPLANATION" || (row.pdfDocument?.asset.state === "READY" && row.pdfDocument.placement !== "SUPPLEMENTARY")).map(row => row.id)));
}
export function navigableMaterialIds(course: Pick<VisibleCourse, "modules">): string[] {
  return course.modules.flatMap(m => m.lectures.flatMap(l => l.materials.filter(row => row.type === "EXPLANATION" || row.programmingExercise || row.manualMaterial || (row.pdfDocument?.asset.state === "READY" && row.pdfDocument.placement !== "SUPPLEMENTARY") || (row.videoLesson?.asset.state === "READY" && row.videoLesson.placement !== "SUPPLEMENTARY")).map(row => row.id)));
}
function gradedMaterialIds(course: Pick<VisibleCourse, "modules"> & { language?: CourseLanguage }): string[] {
  if (course.language === "WEB") return navigableMaterialIds(course);
  const practice = new Set(course.modules.flatMap(m => m.lectures.flatMap(l => l.materials.filter(row => row.type === 'PROGRAMMING_EXERCISE' && (row.programmingExercise?.submissionPolicy === "PRACTICE_ONLY" || (row.programmingExercise?.submissionPolicy === "MANUAL_REVIEW" && !row.programmingExercise.manualIncludeInScore))).map(row => row.id))));
  return exerciseMaterialIds(course).filter(id => !practice.has(id));
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
        const pe = material.programmingExercise;
        const scored = pe?.submissionPolicy === "MANUAL_REVIEW" ? {includeInScore: pe.manualIncludeInScore, maximumHundredths: pe.manualMaximumHundredths} : material.manualMaterial ?? material.videoLesson;
        if (!scored?.includeInScore || (material.videoLesson && (material.videoLesson.placement==="SUPPLEMENTARY" || material.videoLesson.asset.state!=="READY"))) continue;
        const status = statuses.get(material.id);
        maximumHundredths +=
          status?.maximumHundredths ??
          scored.maximumHundredths;
        if (status?.scoreHundredths !== undefined) {
          scoreHundredths += status.scoreHundredths;
          reviewed++;
        } else if (status?.maximumHundredths !== undefined) pending++;
      }
  return { maximumHundredths, scoreHundredths, reviewed, pending };
}
