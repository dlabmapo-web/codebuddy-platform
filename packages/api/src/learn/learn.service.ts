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

/**
 * Everything a student may see, from published course versions only.
 *
 * Visibility filtering lives in the two `where` fragments below and nowhere
 * else. Re-deriving "is this published?" at each call site is how an
 * unpublished lecture eventually leaks into one response and not another.
 */
const publishedModulesInclude = {
  modules: {
    where: { isPublished: true },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      lectures: {
        where: { isPublished: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          materials: {
            where: { isPublished: true },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: { programmingExercise: true },
          },
        },
      },
    },
  },
} as const satisfies Prisma.CourseVersionInclude;

/** A course is visible to students only through its one PUBLISHED version. */
const publishedVersionWhere = { status: "PUBLISHED" } as const;

type PublishedVersion = Prisma.CourseVersionGetPayload<{
  include: typeof publishedModulesInclude;
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
      where: {
        academyId,
        status: "ACTIVE",
        versions: { some: publishedVersionWhere },
      },
      include: {
        versions: {
          where: publishedVersionWhere,
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: publishedModulesInclude,
        },
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
    });

    const materialIds = courses.flatMap((course) =>
      course.versions[0] ? exerciseMaterialIds(course.versions[0]) : [],
    );
    const statuses = await this.statusByMaterial(userId, materialIds);

    return {
      courses: courses.flatMap((course) => {
        const version = course.versions[0];
        if (!version) return [];
        const exercises = exerciseMaterialIds(version);
        return [
          {
            courseId: course.id,
            courseVersionId: version.id,
            versionNumber: version.versionNumber,
            title: course.title,
            description: course.description,
            publishedAt: version.publishedAt?.toISOString() ?? null,
            counts: {
              modules: version.modules.length,
              lectures: version.modules.reduce(
                (total, module) => total + module.lectures.length,
                0,
              ),
              exercises: exercises.length,
            },
            progress: countProgress(exercises, statuses),
          },
        ];
      }),
    };
  }

  async getCourseOutline(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string },
  ): Promise<LearnCourseOutline> {
    const { userId } = await this.requireLearner(identity, input.academyId);
    const { course, version } = await this.requirePublishedCourse(input);

    const materialIds = exerciseMaterialIds(version);
    const statuses = await this.statusByMaterial(userId, materialIds);

    return {
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
      },
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        publishedAt: version.publishedAt?.toISOString() ?? null,
      },
      progress: countProgress(materialIds, statuses),
      modules: version.modules.map((module) => ({
        id: module.id,
        title: module.title,
        description: module.description,
        position: module.position,
        lectures: module.lectures.map((lecture) => ({
          id: lecture.id,
          title: lecture.title,
          description: lecture.description,
          position: lecture.position,
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

  async getExerciseWorkspace(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string },
  ): Promise<LearnExerciseWorkspace> {
    const { userId } = await this.requireLearner(identity, input.academyId);

    // One query resolves the material, its ancestors, and the whole published
    // version — the version tree is needed anyway to compute neighbours, so
    // fetching it here avoids a second round trip.
    const material = await this.prisma.material.findFirst({
      where: {
        id: input.materialId,
        isPublished: true,
        lecture: {
          isPublished: true,
          courseModule: {
            isPublished: true,
            courseVersion: {
              ...publishedVersionWhere,
              course: { academyId: input.academyId, status: "ACTIVE" },
            },
          },
        },
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
              include: {
                courseVersion: {
                  include: {
                    course: true,
                    ...publishedModulesInclude,
                  },
                },
              },
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
    const { courseVersion } = courseModule;

    const [draft, progress] = await Promise.all([
      this.prisma.exerciseDraft.findUnique({
        where: { userId_materialId: { userId, materialId: material.id } },
        select: { code: true, updatedAt: true },
      }),
      this.prisma.studentExerciseProgress.findUnique({
        where: { userId_materialId: { userId, materialId: material.id } },
        select: { status: true },
      }),
    ]);

    const ordered = flattenOutlineExercises(
      courseVersion.modules.map((module) => ({
        position: module.position,
        lectures: module.lectures.map((lecture) => ({
          id: lecture.id,
          position: lecture.position,
          exercises: lecture.materials.flatMap((item) =>
            item.programmingExercise
              ? [
                  {
                    materialId: item.id,
                    title: item.title,
                    position: item.position,
                  },
                ]
              : [],
          ),
        })),
      })),
    );

    // Built field by field rather than spread from the Prisma record: `exercise`
    // carries every test case, and a spread would put HIDDEN expectations one
    // schema change away from the wire.
    return {
      breadcrumb: {
        course: {
          id: courseVersion.course.id,
          title: courseVersion.course.title,
        },
        module: { id: courseModule.id, title: courseModule.title },
        lecture: { id: material.lecture.id, title: material.lecture.title },
      },
      exercise: {
        materialId: material.id,
        courseVersionId: courseVersion.id,
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
        progress && progress.status !== "NOT_STARTED"
          ? progress.status
          : progressStatusFromDraft(draft !== null),
    };
  }

  async listDrafts(identity: SupabaseIdentity, academyId: string) {
    const { userId } = await this.requireLearner(identity, academyId);

    const drafts = await this.prisma.exerciseDraft.findMany({
      where: {
        userId,
        material: {
          isPublished: true,
          lecture: {
            isPublished: true,
            courseModule: {
              isPublished: true,
              courseVersion: {
                ...publishedVersionWhere,
                course: { academyId, status: "ACTIVE" },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        material: {
          include: {
            lecture: {
              include: {
                courseModule: {
                  include: {
                    courseVersion: { include: { course: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      drafts: drafts.map((draft) => {
        const { course } = draft.material.lecture.courseModule.courseVersion;
        return {
          materialId: draft.materialId,
          exerciseTitle: draft.material.title,
          courseId: course.id,
          courseTitle: course.title,
          lineCount: countLines(draft.code),
          updatedAt: draft.updatedAt.toISOString(),
        };
      }),
    };
  }

  async saveDraft(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string; code: string },
  ) {
    const { userId } = await this.requireLearner(identity, input.academyId);
    await this.requireVisibleMaterial(input.academyId, input.materialId);

    const draft = await this.prisma.exerciseDraft.upsert({
      where: {
        userId_materialId: { userId, materialId: input.materialId },
      },
      create: {
        userId,
        materialId: input.materialId,
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

    // Scoped by userId, so one student cannot delete another's work even with a
    // guessed material id.
    const { count } = await this.prisma.exerciseDraft.deleteMany({
      where: { userId, materialId: input.materialId },
    });

    return { discarded: count > 0 };
  }

  /**
   * Every role holds `curriculum.read`, so this admits Team Leads and Managers
   * walking their own curriculum as a student sees it. When enrollment lands,
   * the narrowing goes here.
   */
  private requireLearner(identity: SupabaseIdentity, academyId: string) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
  }

  private async requirePublishedCourse(input: {
    academyId: string;
    courseId: string;
  }): Promise<{ course: { id: string; title: string; description: string }; version: PublishedVersion }> {
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, academyId: input.academyId, status: "ACTIVE" },
      include: {
        versions: {
          where: publishedVersionWhere,
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: publishedModulesInclude,
        },
      },
    });

    if (!course) {
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    const version = course.versions[0];
    if (!version) {
      throw new AppException("COURSE_NOT_PUBLISHED", HttpStatus.NOT_FOUND);
    }

    return {
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
      },
      version,
    };
  }

  private async requireVisibleMaterial(academyId: string, materialId: string) {
    const material = await this.prisma.material.findFirst({
      where: {
        id: materialId,
        isPublished: true,
        programmingExercise: { isNot: null },
        lecture: {
          isPublished: true,
          courseModule: {
            isPublished: true,
            courseVersion: {
              ...publishedVersionWhere,
              course: { academyId, status: "ACTIVE" },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!material) {
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
    }
    return material;
  }

  /** One query for every course on the page, rather than one per exercise. */
  /**
   * Per-exercise status for a whole page in two queries, not one per exercise.
   *
   * Recorded progress wins over draft presence: a solved problem stays solved
   * whether or not the student still has code sitting in the editor. Falling
   * back to the draft keeps `IN_PROGRESS` meaningful for a problem that has
   * been opened but never submitted.
   */
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
  // A solved problem was necessarily started, so it counts toward both.
  return { total: materialIds.length, started: started + solved, solved };
}

function exerciseMaterialIds(version: PublishedVersion): string[] {
  return version.modules.flatMap((module) =>
    module.lectures.flatMap((lecture) =>
      lecture.materials
        .filter((material) => material.programmingExercise !== null)
        .map((material) => material.id),
    ),
  );
}

function countLines(code: string): number {
  const trimmed = code.trim();
  return trimmed.length === 0 ? 0 : trimmed.split("\n").length;
}
