import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AvailableLibraryCourse } from "@cove/shared";

import { AuditService } from "../../academies/audit.service.js";
import type { SupabaseIdentity } from "../../auth/auth.types.js";
import { AcademyAccessService } from "../../authorization/academy-access.service.js";
import { AppException } from "../../common/app-exception.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { toCourseSummary } from "../course.service.js";

/**
 * The content library, as an academy uses it.
 *
 * An academy adopts a master course by taking a **complete copy** of its tree.
 * Nothing is shared afterwards: from the moment the transaction commits, the
 * copy is an ordinary course of that academy and every existing endpoint
 * treats it as one. Head office's later edits never reach it, which is the
 * point — a live shared course would rewrite what a branch is teaching that
 * afternoon, and `Class → ClassCourse → Course → academyId` would stop naming
 * one academy.
 *
 * What the branch gets instead is a *status*, computed from revisions that
 * already exist, telling them whether head office has moved on.
 *
 * Which library an academy sees is never a parameter. It follows from the
 * academy's own `organizationId`, so a customer outside the franchise sees an
 * empty list rather than somebody else's curriculum.
 */
@Injectable()
export class AcademyLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
  ) {}

  async available(
    identity: SupabaseIdentity,
    input: { academyId: string },
  ): Promise<{ courses: AvailableLibraryCourse[] }> {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.review",
    );

    const library = await this.libraryFor(input.academyId);
    if (!library) return { courses: [] };

    const records = await this.prisma.course.findMany({
      where: {
        academyId: library,
        // Published and not withdrawn. A draft is head office's unfinished
        // work and must not be adoptable while it is being written.
        isVisible: true,
        retiredAt: null,
      },
      select: {
        id: true,
        title: true,
        description: true,
        contentRevision: true,
        updatedAt: true,
        _count: { select: { modules: true } },
        modules: {
          select: {
            _count: { select: { lectures: true } },
            lectures: { select: { _count: { select: { materials: true } } } },
          },
        },
        // What this academy has already taken from this master. One query for
        // every row, filtered to the caller's academy, so a branch sees its
        // own adoptions and never another's.
        copies: {
          where: { academyId: input.academyId },
          select: { id: true, title: true },
        },
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
    });

    return {
      courses: records.map((record) => ({
        id: record.id,
        title: record.title,
        description: record.description,
        contentRevision: record.contentRevision,
        moduleCount: record._count.modules,
        lectureCount: record.modules.reduce(
          (sum, module) => sum + module._count.lectures,
          0,
        ),
        exerciseCount: record.modules.reduce(
          (sum, module) =>
            sum +
            module.lectures.reduce(
              (inner, lecture) => inner + lecture._count.materials,
              0,
            ),
          0,
        ),
        existingCopies: record.copies.map((copy) => ({
          courseId: copy.id,
          title: copy.title,
        })),
        updatedAt: record.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * The master's outline, read-only.
   *
   * The same shape the builder renders, so the preview shows exactly what will
   * arrive rather than a summary of it. Authorized against the *branch*, and
   * then narrowed to a master the branch is allowed to see — a team lead never
   * gains access to the library academy itself.
   */
  async preview(
    identity: SupabaseIdentity,
    input: { academyId: string; libraryCourseId: string },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.review",
    );

    const course = await this.requireAdoptableMaster(
      input.academyId,
      input.libraryCourseId,
    );

    const tree = await this.prisma.course.findUniqueOrThrow({
      where: { id: course.id },
      include: previewInclude,
    });

    return {
      course: toCourseSummary(tree),
      modules: tree.modules.map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        description: courseModule.description,
        position: courseModule.position,
        isVisible: courseModule.isVisible,
        lectures: courseModule.lectures.map((lecture) => ({
          id: lecture.id,
          title: lecture.title,
          description: lecture.description,
          position: lecture.position,
          isVisible: lecture.isVisible,
          materials: lecture.materials.map((material) => ({
            id: material.id,
            type: material.type,
            title: material.title,
            position: material.position,
            isRequired: material.isRequired,
            isVisible: material.isVisible,
            // Null throughout: a preview says what is in the course, never
            // what the answers are. The branch owns a full copy the moment it
            // adopts, and not one moment sooner.
            programmingExercise: null,
          })),
        })),
      })),
    };
  }

  /**
   * A complete copy of one master into one academy, in one transaction.
   *
   * Six bulk inserts rather than a nested create: a large course is several
   * thousand rows, and per-row round trips inside one transaction is how a
   * copy times out. Ids are generated here so each level knows its parents
   * before any of them is written.
   */
  async adopt(
    identity: SupabaseIdentity,
    input: { academyId: string; libraryCourseId: string; title: string },
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );

    const master = await this.requireAdoptableMaster(
      input.academyId,
      input.libraryCourseId,
    );

    const title = input.title.trim();
    const clash = await this.prisma.course.findFirst({
      where: {
        academyId: input.academyId,
        title: { equals: title, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (clash) {
      throw new AppException("LIBRARY_ADOPTION_CONFLICT", HttpStatus.CONFLICT);
    }

    const source = await this.prisma.course.findUniqueOrThrow({
      where: { id: master.id },
      include: adoptInclude,
    });

    const courseId = randomUUID();
    const modules: Prisma.CourseModuleCreateManyInput[] = [];
    const lectures: Prisma.LectureCreateManyInput[] = [];
    const materials: Prisma.MaterialCreateManyInput[] = [];
    const exercises: Prisma.ProgrammingExerciseCreateManyInput[] = [];
    const testCases: Prisma.ExerciseTestCaseCreateManyInput[] = [];
    const hints: Prisma.ExerciseHintCreateManyInput[] = [];

    for (const courseModule of source.modules) {
      const moduleId = randomUUID();
      modules.push({
        id: moduleId,
        courseId,
        // Copied verbatim, not regenerated. Keys are unique per course and
        // this is a new course, so they cannot collide — and preserving them
        // means the branch can round-trip its copy through the Excel importer
        // exactly as it could a course it authored by hand.
        externalKey: courseModule.externalKey,
        title: courseModule.title,
        description: courseModule.description,
        position: courseModule.position,
        isVisible: courseModule.isVisible,
      });

      for (const lecture of courseModule.lectures) {
        const lectureId = randomUUID();
        lectures.push({
          id: lectureId,
          courseModuleId: moduleId,
          externalKey: lecture.externalKey,
          title: lecture.title,
          description: lecture.description,
          position: lecture.position,
          isVisible: lecture.isVisible,
        });

        for (const material of lecture.materials) {
          const materialId = randomUUID();
          materials.push({
            id: materialId,
            lectureId,
            type: material.type,
            title: material.title,
            position: material.position,
            isRequired: material.isRequired,
            isVisible: material.isVisible,
          });

          const exercise = material.programmingExercise;
          if (!exercise) continue;
          exercises.push({
            materialId,
            externalKey: exercise.externalKey,
            // `legacyProblemNo` is deliberately absent: it identifies an
            // MVP-era problem, which a branch's copy is not.
            difficulty: exercise.difficulty,
            description: exercise.description,
            inputFormat: exercise.inputFormat,
            outputFormat: exercise.outputFormat,
            constraints: exercise.constraints,
            starterCode: exercise.starterCode,
            solutionCode: exercise.solutionCode,
            language: exercise.language,
            timeLimitMs: exercise.timeLimitMs,
            memoryLimitMb: exercise.memoryLimitMb,
            aiFeedbackEnabled: exercise.aiFeedbackEnabled,
            // Restarts at 1. The copy has graded nothing, and inheriting the
            // master's grading revision would claim otherwise.
          });
          for (const testCase of exercise.testCases) {
            testCases.push({
              exerciseMaterialId: materialId,
              position: testCase.position,
              input: testCase.input,
              expectedOutput: testCase.expectedOutput,
              visibility: testCase.visibility,
            });
          }
          for (const hint of exercise.hints) {
            hints.push({
              exerciseMaterialId: materialId,
              position: hint.position,
              content: hint.content,
              triggerExpression: hint.triggerExpression,
            });
          }
        }
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          id: courseId,
          academyId: input.academyId,
          title,
          description: source.description,
          // A copy nobody has reviewed must not be teachable. The branch
          // publishes it deliberately, from the editor it is already in.
          isVisible: false,
          contentRevision: 1,
          baselineRevision: 1,
          sourceCourseId: source.id,
          sourceContentRevision: source.contentRevision,
          createdByUserId: actor.userId,
        },
      });

      if (modules.length) await tx.courseModule.createMany({ data: modules });
      if (lectures.length) await tx.lecture.createMany({ data: lectures });
      if (materials.length) await tx.material.createMany({ data: materials });
      if (exercises.length) {
        await tx.programmingExercise.createMany({ data: exercises });
      }
      if (testCases.length) {
        await tx.exerciseTestCase.createMany({ data: testCases });
      }
      if (hints.length) await tx.exerciseHint.createMany({ data: hints });

      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course.adopted_from_library",
        targetType: "Course",
        targetId: course.id,
        after: {
          sourceCourseId: source.id,
          sourceContentRevision: source.contentRevision,
          title,
        },
      });

      return course;
    });

    const summary = await this.prisma.course.findUniqueOrThrow({
      where: { id: created.id },
      include: summaryInclude,
    });
    return toCourseSummary(summary);
  }

  /**
   * The academy's library, or null when its organization has none.
   *
   * Resolved from the academy's own `organizationId` rather than taken as an
   * argument, so no caller can name a library belonging to somebody else.
   */
  private async libraryFor(academyId: string): Promise<string | null> {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { organizationId: true, kind: true },
    });
    // A library adopting from a library is not a thing.
    if (!academy || academy.kind !== "ACADEMY") return null;

    const library = await this.prisma.academy.findFirst({
      where: { organizationId: academy.organizationId, kind: "LIBRARY" },
      select: { id: true },
    });
    return library?.id ?? null;
  }

  /**
   * A master this academy is actually allowed to take.
   *
   * One refusal for every reason it might not be — wrong organization,
   * unpublished, retired, or not a library course at all. They are not
   * distinguished on purpose: a branch guessing course ids learns nothing from
   * the answer.
   */
  private async requireAdoptableMaster(academyId: string, courseId: string) {
    const library = await this.libraryFor(academyId);
    if (!library) {
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        academyId: library,
        isVisible: true,
        retiredAt: null,
      },
      select: { id: true },
    });
    if (!course) {
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return course;
  }
}

const summaryInclude = {
  modules: {
    select: {
      id: true,
      lectures: { select: { id: true, _count: { select: { materials: true } } } },
    },
  },
  sourceCourse: {
    select: { id: true, title: true, contentRevision: true, retiredAt: true },
  },
} as const satisfies Prisma.CourseInclude;

/** The outline only — no exercise bodies, no test cases. */
const previewInclude = {
  modules: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      lectures: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          materials: { orderBy: [{ position: "asc" }, { id: "asc" }] },
        },
      },
    },
  },
  sourceCourse: {
    select: { id: true, title: true, contentRevision: true, retiredAt: true },
  },
} as const satisfies Prisma.CourseInclude;

/** Everything the copy has to carry across. */
const adoptInclude = {
  modules: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      lectures: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          materials: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              programmingExercise: {
                include: {
                  testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] },
                  hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
                },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.CourseInclude;
