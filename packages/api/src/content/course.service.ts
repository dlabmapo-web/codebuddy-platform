import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  isCourseCustomized,
  librarySyncState,
  stableKeyFromUuid,
  type CourseProvenance,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { atRevision } from "../common/optimistic-lock.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AuditService } from "../academies/audit.service.js";
import {
  bumpContentRevision,
  compactLecturePositions,
  compactMaterialPositions,
  compactModulePositions,
  nextLecturePosition,
  nextMaterialPosition,
  nextModulePosition,
  rewritePositions,
} from "./content-positions.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";

type ContentRequestContext = { requestId?: string };

/**
 * The master this course was copied from, when it was.
 *
 * Four scalars and nothing else — never the master's tree. A branch reading
 * its own course list is reading one row out of the library academy, and this
 * narrow select is the whole of that boundary.
 */
const sourceCourseInclude = {
  sourceCourse: {
    select: { id: true, title: true, contentRevision: true, retiredAt: true },
  },
} as const;

const courseSummaryInclude = {
  modules: {
    select: {
      id: true,
      lectures: {
        select: { id: true, _count: { select: { materials: true } } },
      },
    },
  },
  ...sourceCourseInclude,
} as const satisfies Prisma.CourseInclude;

const treeInclude = {
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
                  testCases: {
                    orderBy: [{ position: "asc" }, { id: "asc" }],
                  },
                  hints: {
                    orderBy: [{ position: "asc" }, { id: "asc" }],
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  ...sourceCourseInclude,
} as const satisfies Prisma.CourseInclude;

const exerciseAuthoringInclude = {
  lecture: {
    include: {
      courseModule: { include: { course: true } },
    },
  },
  programmingExercise: {
    include: {
      testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] },
      hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
    },
  },
} as const satisfies Prisma.MaterialInclude;

type CourseRecord = Prisma.CourseGetPayload<{ include: typeof treeInclude }>;
type ExerciseRecord = Prisma.MaterialGetPayload<{
  include: typeof exerciseAuthoringInclude;
}>;

type ExerciseWriteInput = {
  academyId: string;
  courseId: string;
  lectureId: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  solutionCode: string;
  aiFeedbackEnabled: boolean;
  isVisible: boolean;
  testCases: Array<{
    input: string;
    expectedOutput: string;
    visibility: "SAMPLE" | "HIDDEN";
  }>;
  hints: Array<{ content: string; triggerExpression: string | null }>;
};

@Injectable()
export class CourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
    private readonly revocation: MonitoringRevocationService,
  ) {}

  async list(identity: SupabaseIdentity, academyId: string) {
    await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.review",
    );
    const courses = await this.prisma.course.findMany({
      where: { academyId },
      include: courseSummaryInclude,
      orderBy: [{ isVisible: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
    });
    return { courses: courses.map(toCourseSummary) };
  }

  async create(
    identity: SupabaseIdentity,
    input: { academyId: string; title: string; description: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    const title = input.title.trim();
    await this.assertTitleAvailable(input.academyId, title);
    const course = await this.prisma.$transaction(async (tx) => {
      const created = await tx.course.create({
        data: {
          academyId: input.academyId,
          title,
          description: input.description.trim(),
          isVisible: false,
          createdByUserId: actor.userId,
        },
        include: courseSummaryInclude,
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course.created",
        targetType: "Course",
        targetId: created.id,
        requestId: context.requestId,
        after: { title: created.title, isVisible: false },
      });
      return created;
    });
    return toCourseSummary(course);
  }

  async update(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      title?: string;
      description?: string;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    const current = await this.requireCourse(input.academyId, input.courseId);
    const title = input.title?.trim();
    if (title && title.toLocaleLowerCase() !== current.title.toLocaleLowerCase()) {
      await this.assertTitleAvailable(input.academyId, title, current.id);
    }
    const course = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({
        where: { id: current.id },
        data: {
          ...(title === undefined ? {} : { title }),
          ...(input.description === undefined
            ? {}
            : { description: input.description.trim() }),
        },
        include: courseSummaryInclude,
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course.updated",
        targetType: "Course",
        targetId: current.id,
        requestId: context.requestId,
        before: { title: current.title, description: current.description },
        after: { title: updated.title, description: updated.description },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
      return updated;
    });
    return toCourseSummary(course);
  }

  async setVisibility(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; isVisible: boolean },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    const current = await this.requireCourse(input.academyId, input.courseId);
    if (input.isVisible) {
      await this.assertTitleAvailable(
        input.academyId,
        current.title,
        current.id,
        true,
      );
    }
    const course = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({
        where: { id: current.id },
        data: { isVisible: input.isVisible },
        include: courseSummaryInclude,
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course.visibility_changed",
        targetType: "Course",
        targetId: current.id,
        requestId: context.requestId,
        before: { isVisible: current.isVisible },
        after: { isVisible: updated.isVisible },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
      return updated;
    });
    if (!input.isVisible) await this.revokeCourseMonitoring(input.courseId);
    return toCourseSummary(course);
  }

  async getTree(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.review",
    );
    return toCourseTree(await this.findCourseTree(input));
  }

  async createModule(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      title: string;
      description: string;
      position?: number;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    await this.requireCourse(input.academyId, input.courseId);
    await this.prisma.$transaction(async (tx) => {
      const position = input.position ?? await nextModulePosition(tx, input.courseId);
      const created = await tx.courseModule.create({
        data: {
          courseId: input.courseId,
          // §5.2 — server-generated, never author-supplied. The generated
          // workbook exposes this key, which is what lets a team lead update a
          // module they created by hand through Excel later.
          externalKey: stableKeyFromUuid(randomUUID()),
          title: input.title.trim(),
          description: input.description.trim(),
          position,
          isVisible: false,
        },
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_module.created",
        targetType: "CourseModule",
        targetId: created.id,
        requestId: context.requestId,
        after: { title: created.title, position, isVisible: false },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    return this.currentTree(input);
  }

  async updateModule(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      moduleId: string;
      title?: string;
      description?: string;
      isVisible?: boolean;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    const current = await this.requireModule(input.courseId, input.moduleId);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.courseModule.update({
        where: { id: current.id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description.trim() }),
          ...(input.isVisible === undefined ? {} : { isVisible: input.isVisible }),
        },
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: input.isVisible === undefined
          ? "content.course_module.updated"
          : "content.course_module.visibility_changed",
        targetType: "CourseModule",
        targetId: current.id,
        requestId: context.requestId,
        before: moduleAudit(current),
        after: moduleAudit(updated),
      });
      await bumpContentRevision(tx, input.courseId);
    });
    if (input.isVisible === false) await this.revokeCourseMonitoring(input.courseId);
    return this.currentTree(input);
  }

  /**
   * Destroy a course and everything under it.
   *
   * Refused while any student has submitted through it — the same rule the
   * module and lecture deletes apply, for the same reason: student work is not
   * the academy's to destroy as a side effect of tidying its curriculum. A
   * course that should merely stop being taught is hidden, which is reversible.
   *
   * The title is typed back. This is the largest thing a Team Lead can delete,
   * and the only lock worth having is one nobody performs by accident.
   */
  async deleteCourse(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; confirmTitle: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, academyId: input.academyId },
      select: { id: true, title: true, isVisible: true },
    });
    if (!course) {
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    if (input.confirmTitle.trim() !== course.title.trim()) {
      throw new AppException(
        "CONTENT_VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
      );
    }

    const submissions = await this.prisma.submission.count({
      where: { courseId: course.id },
    });
    if (submissions > 0) {
      throw new AppException("CONTENT_HAS_SUBMISSIONS", HttpStatus.CONFLICT);
    }

    // A master some academy has already adopted is not the platform's to
    // destroy. `courses_source_course_id_fkey` is RESTRICT, so the database
    // refuses this anyway — but it refuses with a foreign-key violation, and
    // this turns that into the answer that names the remedy: retire it.
    const copies = await this.prisma.course.count({
      where: { sourceCourseId: course.id },
    });
    if (copies > 0) {
      throw new AppException("LIBRARY_COURSE_HAS_COPIES", HttpStatus.CONFLICT);
    }

    await this.prisma.$transaction(async (tx) => {
      // Ordered, because `Submission.course` and the draft relations are the
      // ones the schema refuses to cascade. The submission count above proves
      // the first is empty; the drafts are the author's own working copies.
      await tx.exerciseCollaborationDocument.deleteMany({
        where: { draft: { courseId: course.id } },
      });
      await tx.exerciseDraft.deleteMany({ where: { courseId: course.id } });
      await tx.classCourse.deleteMany({ where: { courseId: course.id } });
      await tx.contentImportSession.deleteMany({
        where: { courseId: course.id },
      });
      await tx.studentCourseLearningDay.deleteMany({
        where: { courseId: course.id },
      });
      await tx.studentClassCourseLearningDay.deleteMany({
        where: { courseId: course.id },
      });
      // Modules cascade to lectures, materials, exercises, cases and hints.
      await tx.courseModule.deleteMany({ where: { courseId: course.id } });
      await tx.course.delete({ where: { id: course.id } });

      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course.deleted",
        targetType: "Course",
        targetId: course.id,
        requestId: context.requestId,
        before: { title: course.title, isVisible: course.isVisible },
      });
    });

    return { courseId: course.id };
  }

  async deleteModule(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; moduleId: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    const current = await this.requireModule(input.courseId, input.moduleId);
    await this.assertNoSubmissions({ moduleId: current.id });
    await this.prisma.$transaction(async (tx) => {
      await tx.courseModule.delete({ where: { id: current.id } });
      await compactModulePositions(tx, input.courseId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_module.deleted",
        targetType: "CourseModule",
        targetId: current.id,
        requestId: context.requestId,
        before: moduleAudit(current),
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    await this.revokeCourseMonitoring(input.courseId);
    return this.currentTree(input);
  }

  async reorderModules(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; orderedModuleIds: string[] },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    await this.assertExactIds(
      input.orderedModuleIds,
      await this.prisma.courseModule.findMany({
        where: { courseId: input.courseId },
        select: { id: true },
      }),
    );
    await this.prisma.$transaction(async (tx) => {
      await rewritePositions(tx, "module", input.orderedModuleIds);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_module.reordered",
        targetType: "Course",
        targetId: input.courseId,
        requestId: context.requestId,
        after: { orderedModuleIds: input.orderedModuleIds },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    return this.currentTree(input);
  }

  async createLecture(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      moduleId: string;
      title: string;
      description: string;
      position?: number;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    await this.requireModule(input.courseId, input.moduleId);
    await this.prisma.$transaction(async (tx) => {
      const position = input.position ?? await nextLecturePosition(tx, input.moduleId);
      const created = await tx.lecture.create({
        data: {
          courseModuleId: input.moduleId,
          externalKey: stableKeyFromUuid(randomUUID()),
          title: input.title.trim(),
          description: input.description.trim(),
          position,
          isVisible: false,
        },
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.lecture.created",
        targetType: "Lecture",
        targetId: created.id,
        requestId: context.requestId,
        after: { title: created.title, position, isVisible: false },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    return this.currentTree(input);
  }

  async updateLecture(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      lectureId: string;
      title?: string;
      description?: string;
      isVisible?: boolean;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    const current = await this.requireLecture(input.courseId, input.lectureId);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lecture.update({
        where: { id: current.id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description.trim() }),
          ...(input.isVisible === undefined ? {} : { isVisible: input.isVisible }),
        },
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: input.isVisible === undefined
          ? "content.lecture.updated"
          : "content.lecture.visibility_changed",
        targetType: "Lecture",
        targetId: current.id,
        requestId: context.requestId,
        before: lectureAudit(current),
        after: lectureAudit(updated),
      });
      await bumpContentRevision(tx, input.courseId);
    });
    if (input.isVisible === false) await this.revokeCourseMonitoring(input.courseId);
    return this.currentTree(input);
  }

  async deleteLecture(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; lectureId: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    const current = await this.requireLecture(input.courseId, input.lectureId);
    await this.assertNoSubmissions({ lectureId: current.id });
    await this.prisma.$transaction(async (tx) => {
      await tx.lecture.delete({ where: { id: current.id } });
      await compactLecturePositions(tx, current.courseModuleId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.lecture.deleted",
        targetType: "Lecture",
        targetId: current.id,
        requestId: context.requestId,
        before: lectureAudit(current),
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    await this.revokeCourseMonitoring(input.courseId);
    return this.currentTree(input);
  }

  async reorderLectures(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      moduleId: string;
      orderedLectureIds: string[];
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireCurriculumManager(identity, input.academyId);
    await this.requireModule(input.courseId, input.moduleId);
    await this.assertExactIds(
      input.orderedLectureIds,
      await this.prisma.lecture.findMany({
        where: { courseModuleId: input.moduleId },
        select: { id: true },
      }),
    );
    await this.prisma.$transaction(async (tx) => {
      await rewritePositions(tx, "lecture", input.orderedLectureIds);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.lecture.reordered",
        targetType: "CourseModule",
        targetId: input.moduleId,
        requestId: context.requestId,
        after: { orderedLectureIds: input.orderedLectureIds },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    return this.currentTree(input);
  }

  async getExercise(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      lectureId: string;
      materialId: string;
    },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.review",
    );
    return toExerciseAuthoringContext(await this.requireExercise(input));
  }

  async getExerciseSolution(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      lectureId: string;
      materialId: string;
    },
  ) {
    await this.requireExerciseManager(identity, input.academyId);
    const material = await this.requireExercise(input);
    // A material that is not a programming exercise answers the same way a
    // missing one does. The non-null assertion this replaces would have been a
    // 500 the first time that assumption stopped holding.
    if (!material.programmingExercise) {
      throw new AppException("EXERCISE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return {
      materialId: material.id,
      solutionCode: material.programmingExercise.solutionCode,
    };
  }

  async createExercise(
    identity: SupabaseIdentity,
    input: ExerciseWriteInput,
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireExerciseManager(identity, input.academyId);
    await this.requireLecture(input.courseId, input.lectureId);
    const record = await this.prisma.$transaction(async (tx) => {
      const position = await nextMaterialPosition(tx, input.lectureId);
      const material = await tx.material.create({
        data: {
          lectureId: input.lectureId,
          type: "PROGRAMMING_EXERCISE",
          title: input.title.trim(),
          position,
          isRequired: true,
          isVisible: false,
          programmingExercise: {
            create: {
              // §9.1 — the same canonical form imported keys use, so a
              // generated workbook round-trips a hand-made problem unchanged.
              externalKey: stableKeyFromUuid(randomUUID()),
              difficulty: input.difficulty,
              description: input.description,
              inputFormat: input.inputFormat,
              outputFormat: input.outputFormat,
              constraints: input.constraints,
              starterCode: input.starterCode,
              solutionCode: input.solutionCode,
              language: "PYTHON",
              timeLimitMs: 3000,
              memoryLimitMb: 256,
              aiFeedbackEnabled: input.aiFeedbackEnabled,
              gradingRevision: 1,
              testCases: { create: testCaseCreates(input.testCases) },
              hints: { create: hintCreates(input.hints) },
            },
          },
        },
        include: exerciseAuthoringInclude,
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.programming_exercise.created",
        targetType: "Material",
        targetId: material.id,
        requestId: context.requestId,
        after: exerciseAuditFromInput(input, position, false, 1),
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
      return material;
    });
    return toExerciseAuthoringContext(record);
  }

  async updateExercise(
    identity: SupabaseIdentity,
    input: ExerciseWriteInput & { materialId: string; expectedUpdatedAt: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireExerciseManager(identity, input.academyId);
    const current = await this.requireExercise(input);
    const exercise = current.programmingExercise!;
    if (exercise.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
    }
    const gradingChanged = !sameGradingDefinition(exercise.testCases, input.testCases);
    const nextRevision = exercise.gradingRevision + (gradingChanged ? 1 : 0);
    const record = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.programmingExercise.updateMany({
        where: { materialId: current.id, updatedAt: atRevision(exercise.updatedAt) },
        data: {
          difficulty: input.difficulty,
          description: input.description,
          inputFormat: input.inputFormat,
          outputFormat: input.outputFormat,
          constraints: input.constraints,
          starterCode: input.starterCode,
          solutionCode: input.solutionCode,
          aiFeedbackEnabled: input.aiFeedbackEnabled,
          ...(gradingChanged ? { gradingRevision: nextRevision } : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
      }
      await tx.material.update({
        where: { id: current.id },
        data: { title: input.title.trim(), isVisible: input.isVisible },
      });
      await tx.exerciseTestCase.deleteMany({
        where: { exerciseMaterialId: current.id },
      });
      await tx.exerciseTestCase.createMany({
        data: testCaseCreates(input.testCases).map((testCase) => ({
          ...testCase,
          exerciseMaterialId: current.id,
        })),
      });
      await tx.exerciseHint.deleteMany({
        where: { exerciseMaterialId: current.id },
      });
      if (input.hints.length > 0) {
        await tx.exerciseHint.createMany({
          data: hintCreates(input.hints).map((hint) => ({
            ...hint,
            exerciseMaterialId: current.id,
          })),
        });
      }
      let progressResetCount = 0;
      if (gradingChanged) {
        const reset = await tx.studentExerciseProgress.updateMany({
          where: { materialId: current.id },
          data: {
            status: "NOT_STARTED",
            attemptCount: 0,
            bestPassed: 0,
            bestScore: 0,
            gradingRevision: nextRevision,
            firstSolvedAt: null,
            lastAttemptAt: null,
          },
        });
        progressResetCount = reset.count;
      }
      const updated = await tx.material.findUniqueOrThrow({
        where: { id: current.id },
        include: exerciseAuthoringInclude,
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.programming_exercise.updated",
        targetType: "Material",
        targetId: current.id,
        requestId: context.requestId,
        before: exerciseRecordAudit(current),
        after: {
          ...exerciseRecordAudit(updated),
          gradingChanged,
          progressResetCount,
        },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
      return updated;
    });
    return toExerciseAuthoringContext(record);
  }

  async setExerciseVisibility(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      lectureId: string;
      materialId: string;
      isVisible: boolean;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireExerciseManager(identity, input.academyId);
    const current = await this.requireExercise(input);
    await this.prisma.$transaction(async (tx) => {
      await tx.material.update({
        where: { id: current.id },
        data: { isVisible: input.isVisible },
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.programming_exercise.visibility_changed",
        targetType: "Material",
        targetId: current.id,
        requestId: context.requestId,
        before: { isVisible: current.isVisible },
        after: { isVisible: input.isVisible },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    if (!input.isVisible) await this.revokeCourseMonitoring(input.courseId);
    return this.currentTree(input);
  }

  async deleteExercise(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      lectureId: string;
      materialId: string;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireExerciseManager(identity, input.academyId);
    const current = await this.requireExercise(input);
    await this.assertNoSubmissions({ materialId: current.id });
    await this.prisma.$transaction(async (tx) => {
      await tx.material.delete({ where: { id: current.id } });
      await compactMaterialPositions(tx, input.lectureId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.programming_exercise.deleted",
        targetType: "Material",
        targetId: current.id,
        requestId: context.requestId,
        before: exerciseRecordAudit(current),
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    await this.revokeCourseMonitoring(input.courseId);
    return this.currentTree(input);
  }

  async reorderExercises(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      lectureId: string;
      orderedMaterialIds: string[];
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireExerciseManager(identity, input.academyId);
    await this.requireLecture(input.courseId, input.lectureId);
    await this.assertExactIds(
      input.orderedMaterialIds,
      await this.prisma.material.findMany({
        where: { lectureId: input.lectureId, type: "PROGRAMMING_EXERCISE" },
        select: { id: true },
      }),
    );
    await this.prisma.$transaction(async (tx) => {
      await rewritePositions(tx, "material", input.orderedMaterialIds);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.programming_exercise.reordered",
        targetType: "Lecture",
        targetId: input.lectureId,
        requestId: context.requestId,
        after: { orderedMaterialIds: input.orderedMaterialIds },
      });
      // §9.2 — the course's content moved, so any import preview taken
      // against the old revision is now stale and will be refused.
      await bumpContentRevision(tx, input.courseId);
    });
    return this.currentTree(input);
  }

  private async revokeCourseMonitoring(courseId: string): Promise<void> {
    const assignments = await this.prisma.classCourse.findMany({
      where: { courseId },
      select: { classId: true },
    });
    await Promise.all(
      assignments.map(({ classId }) =>
        this.revocation.revokeClass(classId, "MATERIAL_UNAVAILABLE"),
      ),
    );
  }

  private async requireCurriculumManager(
    identity: SupabaseIdentity,
    academyId: string,
  ) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.manage",
    );
  }

  private async requireExerciseManager(
    identity: SupabaseIdentity,
    academyId: string,
  ) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "exercises.manage",
    );
  }

  private async currentTree(input: { academyId: string; courseId: string }) {
    return toCourseTree(await this.findCourseTree(input));
  }

  private async findCourseTree(input: { academyId: string; courseId: string }) {
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, academyId: input.academyId },
      include: treeInclude,
    });
    if (!course) {
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return course;
  }

  private async requireCourse(academyId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, academyId },
    });
    if (!course) {
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return course;
  }

  private async requireModule(courseId: string, moduleId: string) {
    const courseModule = await this.prisma.courseModule.findFirst({
      where: { id: moduleId, courseId },
    });
    if (!courseModule) {
      throw new AppException("CONTENT_PARENT_MISMATCH", HttpStatus.NOT_FOUND);
    }
    return courseModule;
  }

  private async requireLecture(courseId: string, lectureId: string) {
    const lecture = await this.prisma.lecture.findFirst({
      where: { id: lectureId, courseModule: { courseId } },
    });
    if (!lecture) {
      throw new AppException("CONTENT_PARENT_MISMATCH", HttpStatus.NOT_FOUND);
    }
    return lecture;
  }

  private async requireExercise(input: {
    courseId: string;
    lectureId: string;
    materialId: string;
  }) {
    const material = await this.prisma.material.findFirst({
      where: {
        id: input.materialId,
        lectureId: input.lectureId,
        lecture: { courseModule: { courseId: input.courseId } },
      },
      include: exerciseAuthoringInclude,
    });
    if (!material?.programmingExercise) {
      throw new AppException("EXERCISE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return material;
  }

  private async assertTitleAvailable(
    academyId: string,
    title: string,
    excludedCourseId?: string,
    visibleOnly = false,
  ) {
    const duplicate = await this.prisma.course.findFirst({
      where: {
        academyId,
        title: { equals: title, mode: "insensitive" },
        ...(visibleOnly ? { isVisible: true } : {}),
        ...(excludedCourseId ? { id: { not: excludedCourseId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppException("COURSE_TITLE_CONFLICT", HttpStatus.CONFLICT);
    }
  }

  private async assertNoSubmissions(input: {
    moduleId?: string;
    lectureId?: string;
    materialId?: string;
  }) {
    const count = await this.prisma.submission.count({
      where: input.materialId
        ? { materialId: input.materialId }
        : input.lectureId
        ? { material: { lectureId: input.lectureId } }
        : { material: { lecture: { courseModuleId: input.moduleId! } } },
    });
    if (count > 0) {
      throw new AppException("CONTENT_HAS_SUBMISSIONS", HttpStatus.CONFLICT);
    }
  }

  private async assertExactIds(
    orderedIds: string[],
    records: Array<{ id: string }>,
  ) {
    const expected = new Set(records.map((record) => record.id));
    const actual = new Set(orderedIds);
    if (
      actual.size !== orderedIds.length ||
      actual.size !== expected.size ||
      [...actual].some((id) => !expected.has(id))
    ) {
      throw new AppException("CONTENT_PARENT_MISMATCH", HttpStatus.CONFLICT);
    }
  }
}

function testCaseCreates(testCases: ExerciseWriteInput["testCases"]) {
  return testCases.map((testCase, index) => ({
    position: index + 1,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    visibility: testCase.visibility,
  }));
}

function hintCreates(hints: ExerciseWriteInput["hints"]) {
  return hints.map((hint, index) => ({
    position: index + 1,
    content: hint.content.trim(),
    triggerExpression: emptyToNull(hint.triggerExpression),
  }));
}

function emptyToNull(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function sameGradingDefinition(
  current: Array<{
    input: string;
    expectedOutput: string;
    visibility: "SAMPLE" | "HIDDEN";
  }>,
  next: ExerciseWriteInput["testCases"],
) {
  return current.length === next.length && current.every((testCase, index) => {
    const candidate = next[index];
    return candidate !== undefined &&
      testCase.input === candidate.input &&
      testCase.expectedOutput === candidate.expectedOutput &&
      testCase.visibility === candidate.visibility;
  });
}

function moduleAudit(record: {
  title: string;
  description: string;
  position: number;
  isVisible: boolean;
}) {
  return {
    title: record.title,
    description: record.description,
    position: record.position,
    isVisible: record.isVisible,
  };
}

function lectureAudit(record: {
  title: string;
  description: string;
  position: number;
  isVisible: boolean;
}) {
  return moduleAudit(record);
}

function exerciseAuditFromInput(
  input: ExerciseWriteInput,
  position: number,
  isVisible: boolean,
  gradingRevision: number,
) {
  return {
    title: input.title.trim(),
    difficulty: input.difficulty,
    position,
    language: "PYTHON",
    timeLimitMs: 3000,
    memoryLimitMb: 256,
    aiFeedbackEnabled: input.aiFeedbackEnabled,
    isVisible,
    gradingRevision,
    testCaseCount: input.testCases.length,
    sampleTestCaseCount: input.testCases.filter(
      (testCase) => testCase.visibility === "SAMPLE",
    ).length,
    hintCount: input.hints.length,
    hasSolution: input.solutionCode.trim().length > 0,
  };
}

function exerciseRecordAudit(record: ExerciseRecord) {
  const exercise = record.programmingExercise!;
  return {
    title: record.title,
    difficulty: exercise.difficulty,
    position: record.position,
    language: exercise.language,
    timeLimitMs: exercise.timeLimitMs,
    memoryLimitMb: exercise.memoryLimitMb,
    aiFeedbackEnabled: exercise.aiFeedbackEnabled,
    isVisible: record.isVisible,
    gradingRevision: exercise.gradingRevision,
    testCaseCount: exercise.testCases.length,
    sampleTestCaseCount: exercise.testCases.filter(
      (testCase) => testCase.visibility === "SAMPLE",
    ).length,
    hintCount: exercise.hints.length,
    hasSolution: Boolean(exercise.solutionCode?.trim()),
  };
}

/**
 * Where a course came from, when it came from the content library.
 *
 * Null for a course the academy authored itself, which is most of them — and
 * null too when the caller's select did not ask for the master, so a summary
 * built from a narrower read says "no provenance" rather than inventing one.
 *
 * Both halves of the status are computed here from revisions that already
 * exist, by the same two functions the branch's chips and head office's
 * fan-out use. One definition, so the two surfaces cannot disagree about what
 * "up to date" means.
 */
function courseProvenance(course: {
  contentRevision?: number;
  baselineRevision?: number | null;
  sourceContentRevision?: number | null;
  createdAt: Date;
  sourceCourse?: {
    id: string;
    title: string;
    contentRevision: number;
    retiredAt: Date | null;
  } | null;
}): CourseProvenance | null {
  const source = course.sourceCourse;
  if (!source) return null;
  return {
    sourceCourseId: source.id,
    sourceTitle: source.title,
    syncState: librarySyncState({
      sourceContentRevision: source.contentRevision,
      copiedAtRevision: course.sourceContentRevision ?? 0,
      sourceRetiredAt: source.retiredAt,
    }),
    isCustomized: isCourseCustomized({
      contentRevision: course.contentRevision ?? 0,
      baselineRevision: course.baselineRevision ?? null,
    }),
    copiedAt: course.createdAt.toISOString(),
  };
}

export function toCourseSummary(course: {
  id: string;
  academyId: string;
  title: string;
  description: string;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
  contentRevision?: number;
  baselineRevision?: number | null;
  sourceContentRevision?: number | null;
  sourceCourse?: {
    id: string;
    title: string;
    contentRevision: number;
    retiredAt: Date | null;
  } | null;
  modules: Array<{
    lectures: Array<{
      _count?: { materials: number };
      materials?: unknown[];
    }>;
  }>;
}) {
  let lectures = 0;
  let exercises = 0;
  for (const courseModule of course.modules) {
    lectures += courseModule.lectures.length;
    for (const lecture of courseModule.lectures) {
      exercises += lecture._count?.materials ?? lecture.materials?.length ?? 0;
    }
  }
  return {
    id: course.id,
    academyId: course.academyId,
    title: course.title,
    description: course.description,
    isVisible: course.isVisible,
    content: { modules: course.modules.length, lectures, exercises },
    provenance: courseProvenance(course),
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

function toCourseTree(course: CourseRecord) {
  return {
    course: toCourseSummary(course),
    modules: course.modules.map((courseModule) => ({
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
          programmingExercise: material.programmingExercise
            ? serializeExercise(material.programmingExercise)
            : null,
        })),
      })),
    })),
  };
}

function serializeExercise(exercise: NonNullable<
  CourseRecord["modules"][number]["lectures"][number]["materials"][number]["programmingExercise"]
>) {
  return {
    materialId: exercise.materialId,
    externalKey: exercise.externalKey,
    legacyProblemNo: exercise.legacyProblemNo,
    difficulty: exercise.difficulty,
    description: exercise.description,
    inputFormat: exercise.inputFormat,
    outputFormat: exercise.outputFormat,
    constraints: exercise.constraints,
    starterCode: exercise.starterCode,
    language: exercise.language,
    timeLimitMs: exercise.timeLimitMs,
    memoryLimitMb: exercise.memoryLimitMb,
    aiFeedbackEnabled: exercise.aiFeedbackEnabled,
    gradingRevision: exercise.gradingRevision,
    updatedAt: exercise.updatedAt.toISOString(),
    testCases: exercise.testCases.map((testCase) => ({
      id: testCase.id,
      position: testCase.position,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      visibility: testCase.visibility,
    })),
    hints: exercise.hints.map((hint) => ({
      id: hint.id,
      position: hint.position,
      content: hint.content,
      triggerExpression: hint.triggerExpression,
    })),
  };
}

function toExerciseAuthoringContext(record: ExerciseRecord) {
  const courseModule = record.lecture.courseModule;
  return {
    course: { id: courseModule.course.id, title: courseModule.course.title },
    module: { id: courseModule.id, title: courseModule.title },
    lecture: { id: record.lecture.id, title: record.lecture.title },
    material: {
      id: record.id,
      type: record.type,
      title: record.title,
      position: record.position,
      isRequired: record.isRequired,
      isVisible: record.isVisible,
      programmingExercise: serializeExercise(record.programmingExercise!),
    },
  };
}
