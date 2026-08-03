import { HttpStatus, Injectable } from "@nestjs/common";

import {
  flattenOutlineExercises,
  progressStatusFromDraft,
  type ExerciseProgressStatus,
  resolveExerciseNeighbors,
  type LearnCourseOutline,
  type LearnCourseSummary,
  type LearnExerciseWorkspace,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { effectivelyVisibleMaterialWhere } from "./curriculum-visibility.js";

/** The one student-visible hierarchy. Every read applies all ancestor flags. */
const visibleCurriculumInclude = {
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

type VisibleCourse = Prisma.CourseGetPayload<{
  include: typeof visibleCurriculumInclude;
}>;

@Injectable()
export class LearnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  async listCourses(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<{ courses: LearnCourseSummary[] }> {
    const { userId } = await this.requireLearner(identity, academyId);
    const courses = await this.prisma.course.findMany({
      where: { academyId, isVisible: true },
      include: visibleCurriculumInclude,
      orderBy: [{ title: "asc" }, { id: "asc" }],
    });
    const materialIds = courses.flatMap(exerciseMaterialIds);
    const statuses = await this.statusByMaterial(userId, materialIds);

    return {
      courses: courses.flatMap((course) => {
        const modules = nonemptyModules(course);
        const exercises = exerciseMaterialIds({ ...course, modules });
        if (exercises.length === 0) return [];
        return [{
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
        }];
      }),
    };
  }

  async getCourseOutline(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string },
  ): Promise<LearnCourseOutline> {
    const { userId } = await this.requireLearner(identity, input.academyId);
    const course = await this.requireVisibleCourse(input);
    const modules = nonemptyModules(course);
    const materialIds = exerciseMaterialIds({ ...course, modules });
    const statuses = await this.statusByMaterial(userId, materialIds);

    return {
      course: { id: course.id, title: course.title, description: course.description },
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

  async getExerciseWorkspace(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string },
  ): Promise<LearnExerciseWorkspace> {
    const { userId } = await this.requireLearner(identity, input.academyId);
    const material = await this.prisma.material.findFirst({
      where: {
        id: input.materialId,
        ...effectivelyVisibleMaterialWhere(input.academyId),
      },
      include: {
        programmingExercise: {
          include: {
            testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] },
            hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
          },
        },
        lecture: {
          include: {
            courseModule: {
              include: { course: { include: visibleCurriculumInclude } },
            },
          },
        },
      },
    });
    const exercise = material?.programmingExercise;
    if (!material || !exercise) {
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
    }

    const { courseModule } = material.lecture;
    const course = courseModule.course;
    const [draft, progress] = await Promise.all([
      this.prisma.exerciseDraft.findUnique({
        where: { userId_materialId: { userId, materialId: material.id } },
        select: { code: true, updatedAt: true },
      }),
      this.prisma.studentExerciseProgress.findUnique({
        where: { userId_materialId: { userId, materialId: material.id } },
        select: { status: true, gradingRevision: true },
      }),
    ]);
    const ordered = flattenOutlineExercises(
      nonemptyModules(course).map((module) => ({
        position: module.position,
        lectures: module.lectures.map((lecture) => ({
          id: lecture.id,
          position: lecture.position,
          exercises: lecture.materials.flatMap((item) =>
            item.programmingExercise
              ? [{ materialId: item.id, title: item.title, position: item.position }]
              : []
          ),
        })),
      })),
    );

    return {
      breadcrumb: {
        course: { id: course.id, title: course.title },
        module: { id: courseModule.id, title: courseModule.title },
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
      neighbors: resolveExerciseNeighbors(ordered, material.id),
      draft: draft
        ? { code: draft.code, updatedAt: draft.updatedAt.toISOString() }
        : null,
      status:
        progress &&
          progress.gradingRevision === exercise.gradingRevision &&
          progress.status !== "NOT_STARTED"
          ? progress.status
          : progressStatusFromDraft(draft !== null),
    };
  }

  async listDrafts(identity: SupabaseIdentity, academyId: string) {
    const { userId } = await this.requireLearner(identity, academyId);
    const drafts = await this.prisma.exerciseDraft.findMany({
      where: {
        userId,
        material: { is: effectivelyVisibleMaterialWhere(academyId) },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        material: {
          include: {
            lecture: { include: { courseModule: { include: { course: true } } } },
          },
        },
      },
    });
    return {
      drafts: drafts.flatMap((draft) => {
        if (!draft.material) return [];
        const course = draft.material.lecture.courseModule.course;
        return [{
          materialId: draft.material.id,
          exerciseTitle: draft.material.title,
          courseId: course.id,
          courseTitle: course.title,
          lineCount: countLines(draft.code),
          updatedAt: draft.updatedAt.toISOString(),
        }];
      }),
    };
  }

  async saveDraft(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string; code: string },
  ) {
    const { userId } = await this.requireLearner(identity, input.academyId);
    const material = await this.requireVisibleMaterial(
      input.academyId,
      input.materialId,
    );
    const draft = await this.prisma.exerciseDraft.upsert({
      where: { userId_materialId: { userId, materialId: input.materialId } },
      create: {
        userId,
        materialId: input.materialId,
        sourceMaterialId: input.materialId,
        courseId: material.lecture.courseModule.courseId,
        code: input.code,
      },
      update: { code: input.code },
      select: { updatedAt: true },
    });
    return { updatedAt: draft.updatedAt.toISOString() };
  }

  async discardDraft(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string },
  ) {
    const { userId } = await this.requireLearner(identity, input.academyId);
    await this.requireVisibleMaterial(input.academyId, input.materialId);
    const { count } = await this.prisma.exerciseDraft.deleteMany({
      where: { userId, materialId: input.materialId },
    });
    return { discarded: count > 0 };
  }

  private requireLearner(identity: SupabaseIdentity, academyId: string) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
  }

  private async requireVisibleCourse(input: {
    academyId: string;
    courseId: string;
  }) {
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, academyId: input.academyId, isVisible: true },
      include: visibleCurriculumInclude,
    });
    if (!course) {
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return course;
  }

  private async requireVisibleMaterial(academyId: string, materialId: string) {
    const material = await this.prisma.material.findFirst({
      where: { id: materialId, ...effectivelyVisibleMaterialWhere(academyId) },
      include: { lecture: { include: { courseModule: true } } },
    });
    if (!material) {
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
    }
    return material;
  }

  private async statusByMaterial(
    userId: string,
    materialIds: string[],
  ): Promise<Map<string, { status: ExerciseProgressStatus; bestScore: number }>> {
    const statuses = new Map<
      string,
      { status: ExerciseProgressStatus; bestScore: number }
    >();
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

function nonemptyModules(course: VisibleCourse): VisibleCourse["modules"] {
  return course.modules.flatMap((courseModule) => {
    const lectures = courseModule.lectures.filter((lecture) =>
      lecture.materials.some((material) => material.programmingExercise !== null)
    );
    return lectures.length > 0 ? [{ ...courseModule, lectures }] : [];
  });
}

function exerciseMaterialIds(course: Pick<VisibleCourse, "modules">): string[] {
  return course.modules.flatMap((courseModule) =>
    courseModule.lectures.flatMap((lecture) =>
      lecture.materials.flatMap((material) =>
        material.programmingExercise ? [material.id] : []
      )
    )
  );
}

function countProgress(
  materialIds: string[],
  statuses: Map<string, { status: ExerciseProgressStatus; bestScore: number }>,
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

function countLines(code: string): number {
  const trimmed = code.trim();
  return trimmed.length === 0 ? 0 : trimmed.split("\n").length;
}
