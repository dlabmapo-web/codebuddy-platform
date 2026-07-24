import { HttpStatus, Injectable } from "@nestjs/common";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AuditService } from "../academies/audit.service.js";

type ContentRequestContext = { requestId?: string };

const courseVersionSelect = {
  id: true,
  versionNumber: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
} as const;

const courseSummaryInclude = {
  versions: {
    where: { status: { in: ["DRAFT", "PUBLISHED"] } },
    orderBy: { versionNumber: "desc" },
    select: courseVersionSelect,
  },
} as const satisfies Prisma.CourseInclude;

const draftTreeInclude = {
  course: { include: courseSummaryInclude },
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
} as const satisfies Prisma.CourseVersionInclude;

@Injectable()
export class CourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(identity: SupabaseIdentity, academyId: string) {
    await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
    const courses = await this.prisma.course.findMany({
      where: { academyId },
      include: courseSummaryInclude,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    });
    return { courses: courses.map(toCourseSummary) };
  }

  async create(
    identity: SupabaseIdentity,
    input: { academyId: string; title: string; description: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    const title = input.title.trim();
    await this.assertTitleAvailable(input.academyId, title);

    try {
      const course = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.course.create({
          data: {
            academyId: input.academyId,
            title,
            description: input.description.trim(),
            createdByUserId: actor.userId,
            versions: {
              create: {
                versionNumber: 1,
                createdByUserId: actor.userId,
              },
            },
          },
          include: courseSummaryInclude,
        });
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "content.course.created",
          targetType: "Course",
          targetId: created.id,
          requestId: context.requestId,
          after: {
            title: created.title,
            description: created.description,
            status: created.status,
            draftVersionNumber: 1,
          },
        });
        return created;
      });
      return toCourseSummary(course);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppException("COURSE_TITLE_CONFLICT", HttpStatus.CONFLICT);
      }
      throw error;
    }
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
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    const current = await this.requireCourse(input.academyId, input.courseId);
    const title = input.title?.trim();
    if (title && title.toLocaleLowerCase() !== current.title.toLocaleLowerCase()) {
      await this.assertTitleAvailable(input.academyId, title, current.id);
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.course.update({
          where: { id: current.id },
          data: {
            ...(title === undefined ? {} : { title }),
            ...(input.description === undefined
              ? {}
              : { description: input.description.trim() }),
          },
          include: courseSummaryInclude,
        });
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "content.course.updated",
          targetType: "Course",
          targetId: current.id,
          requestId: context.requestId,
          before: {
            title: current.title,
            description: current.description,
            status: current.status,
          },
          after: {
            title: updated.title,
            description: updated.description,
            status: updated.status,
          },
        });
        return toCourseSummary(updated);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppException("COURSE_TITLE_CONFLICT", HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async archive(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    const current = await this.requireCourse(input.academyId, input.courseId);
    if (current.status === "ARCHIVED") {
      const archived = await this.prisma.course.findUniqueOrThrow({
        where: { id: current.id },
        include: courseSummaryInclude,
      });
      return toCourseSummary(archived);
    }
    return this.prisma.$transaction(async (transaction) => {
      const archived = await transaction.course.update({
        where: { id: current.id },
        data: { status: "ARCHIVED" },
        include: courseSummaryInclude,
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course.archived",
        targetType: "Course",
        targetId: current.id,
        requestId: context.requestId,
        before: { status: current.status },
        after: { status: archived.status },
      });
      return toCourseSummary(archived);
    });
  }

  /**
   * A published version is immutable, so "editing" it means branching a new
   * draft that starts as a deep copy of the published tree.
   */
  async createDraft(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    await this.requireCourse(input.academyId, input.courseId);
    const versions = await this.prisma.courseVersion.findMany({
      where: { courseId: input.courseId },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, status: true },
    });
    if (versions.some((version) => version.status === "DRAFT")) {
      throw new AppException(
        "COURSE_DRAFT_ALREADY_EXISTS",
        HttpStatus.CONFLICT,
      );
    }
    const source = versions.find((version) => version.status === "PUBLISHED")
      ?? versions[0];
    const versionNumber = (versions[0]?.versionNumber ?? 0) + 1;

    const course = await this.prisma.$transaction(async (transaction) => {
      const draft = await transaction.courseVersion.create({
        data: {
          courseId: input.courseId,
          versionNumber,
          createdByUserId: actor.userId,
        },
      });
      if (source) {
        await copyVersionContent(transaction, source.id, draft.id);
      }
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_version.draft_created",
        targetType: "CourseVersion",
        targetId: draft.id,
        requestId: context.requestId,
        before: source ? { copiedFromVersionId: source.id } : undefined,
        after: { versionNumber, status: draft.status },
      });
      return transaction.course.findUniqueOrThrow({
        where: { id: input.courseId },
        include: courseSummaryInclude,
      });
    });
    return toCourseSummary(course);
  }

  async getDraftTree(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; versionId: string },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );
    const version = await this.findVersion(input);
    return toDraftTree(version);
  }

  async createModule(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      versionId: string;
      title: string;
      description: string;
      position?: number;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    await this.requireEditableVersion(input);
    await this.prisma.$transaction(async (transaction) => {
      const position = input.position ?? await nextModulePosition(
        transaction,
        input.versionId,
      );
      const module = await transaction.courseModule.create({
        data: {
          courseVersionId: input.versionId,
          title: input.title.trim(),
          description: input.description.trim(),
          position,
        },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_module.created",
        targetType: "CourseModule",
        targetId: module.id,
        requestId: context.requestId,
        after: { courseVersionId: input.versionId, title: module.title, position },
      });
    });
    return this.getDraftTree(identity, input);
  }

  async createLecture(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      versionId: string;
      moduleId: string;
      title: string;
      description: string;
      position?: number;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    await this.requireEditableVersion(input);
    const courseModule = await this.prisma.courseModule.findFirst({
      where: { id: input.moduleId, courseVersionId: input.versionId },
      select: { id: true },
    });
    if (!courseModule) {
      throw new AppException("CONTENT_PARENT_MISMATCH", HttpStatus.NOT_FOUND);
    }
    await this.prisma.$transaction(async (transaction) => {
      const position = input.position ?? await nextLecturePosition(
        transaction,
        input.moduleId,
      );
      const lecture = await transaction.lecture.create({
        data: {
          courseModuleId: input.moduleId,
          title: input.title.trim(),
          description: input.description.trim(),
          position,
        },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.lecture.created",
        targetType: "Lecture",
        targetId: lecture.id,
        requestId: context.requestId,
        after: { courseModuleId: input.moduleId, title: lecture.title, position },
      });
    });
    return this.getDraftTree(identity, input);
  }

  async updateModule(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      versionId: string;
      moduleId: string;
      title?: string;
      description?: string;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireDraftEditor(identity, input);
    const current = await this.requireModule(input.versionId, input.moduleId);
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.courseModule.update({
        where: { id: current.id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description.trim() }),
        },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_module.updated",
        targetType: "CourseModule",
        targetId: current.id,
        requestId: context.requestId,
        before: { title: current.title, description: current.description },
        after: { title: updated.title, description: updated.description },
      });
    });
    return this.getDraftTree(identity, input);
  }

  async deleteModule(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      versionId: string;
      moduleId: string;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireDraftEditor(identity, input);
    const current = await this.requireModule(input.versionId, input.moduleId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.courseModule.delete({ where: { id: current.id } });
      const remaining = await transaction.courseModule.findMany({
        where: { courseVersionId: input.versionId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      await repackPositions(
        remaining.map((item) => item.id),
        (id, position) =>
          transaction.courseModule.update({ where: { id }, data: { position } }),
      );
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_module.deleted",
        targetType: "CourseModule",
        targetId: current.id,
        requestId: context.requestId,
        before: { title: current.title, position: current.position },
      });
    });
    return this.getDraftTree(identity, input);
  }

  async reorderModules(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      versionId: string;
      orderedModuleIds: string[];
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireDraftEditor(identity, input);
    const existing = await this.prisma.courseModule.findMany({
      where: { courseVersionId: input.versionId },
      select: { id: true },
    });
    assertSameMembers(existing.map((item) => item.id), input.orderedModuleIds);
    await this.prisma.$transaction(async (transaction) => {
      await repackPositions(
        input.orderedModuleIds,
        (id, position) =>
          transaction.courseModule.update({ where: { id }, data: { position } }),
      );
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_module.reordered",
        targetType: "CourseVersion",
        targetId: input.versionId,
        requestId: context.requestId,
        after: { orderedModuleIds: input.orderedModuleIds },
      });
    });
    return this.getDraftTree(identity, input);
  }

  async updateLecture(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      versionId: string;
      lectureId: string;
      title?: string;
      description?: string;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireDraftEditor(identity, input);
    const current = await this.requireLecture(input.versionId, input.lectureId);
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.lecture.update({
        where: { id: current.id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description.trim() }),
        },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.lecture.updated",
        targetType: "Lecture",
        targetId: current.id,
        requestId: context.requestId,
        before: { title: current.title, description: current.description },
        after: { title: updated.title, description: updated.description },
      });
    });
    return this.getDraftTree(identity, input);
  }

  async deleteLecture(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      versionId: string;
      lectureId: string;
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireDraftEditor(identity, input);
    const current = await this.requireLecture(input.versionId, input.lectureId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.lecture.delete({ where: { id: current.id } });
      const remaining = await transaction.lecture.findMany({
        where: { courseModuleId: current.courseModuleId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      await repackPositions(
        remaining.map((item) => item.id),
        (id, position) =>
          transaction.lecture.update({ where: { id }, data: { position } }),
      );
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.lecture.deleted",
        targetType: "Lecture",
        targetId: current.id,
        requestId: context.requestId,
        before: { title: current.title, position: current.position },
      });
    });
    return this.getDraftTree(identity, input);
  }

  async reorderLectures(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      versionId: string;
      moduleId: string;
      orderedLectureIds: string[];
    },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.requireDraftEditor(identity, input);
    await this.requireModule(input.versionId, input.moduleId);
    const existing = await this.prisma.lecture.findMany({
      where: { courseModuleId: input.moduleId },
      select: { id: true },
    });
    assertSameMembers(existing.map((item) => item.id), input.orderedLectureIds);
    await this.prisma.$transaction(async (transaction) => {
      await repackPositions(
        input.orderedLectureIds,
        (id, position) =>
          transaction.lecture.update({ where: { id }, data: { position } }),
      );
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.lecture.reordered",
        targetType: "CourseModule",
        targetId: input.moduleId,
        requestId: context.requestId,
        after: { orderedLectureIds: input.orderedLectureIds },
      });
    });
    return this.getDraftTree(identity, input);
  }

  async validateVersion(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; versionId: string },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );
    const version = await this.findVersion(input);
    const issues = collectPublishIssues(toDraftTree(version));
    return {
      versionId: version.id,
      publishable: issues.length === 0,
      issues,
    };
  }

  /**
   * Publishing freezes the draft and retires the version it replaces. Existing
   * classes keep pointing at the version they were created with.
   */
  async publishVersion(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; versionId: string },
    context: ContentRequestContext = {},
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.publish",
    );
    const version = await this.findVersion(input);
    if (version.status !== "DRAFT") {
      throw new AppException("COURSE_VERSION_IMMUTABLE", HttpStatus.CONFLICT);
    }
    const issues = collectPublishIssues(toDraftTree(version));
    if (issues.length > 0) {
      throw new AppException(
        "CONTENT_VALIDATION_FAILED",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const course = await this.prisma.$transaction(async (transaction) => {
      const retired = await transaction.courseVersion.updateMany({
        where: {
          courseId: input.courseId,
          status: "PUBLISHED",
          id: { not: version.id },
        },
        data: { status: "ARCHIVED" },
      });
      const published = await transaction.courseVersion.update({
        where: { id: version.id },
        data: {
          status: "PUBLISHED",
          publishedByUserId: actor.userId,
          publishedAt: new Date(),
        },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course_version.published",
        targetType: "CourseVersion",
        targetId: version.id,
        requestId: context.requestId,
        before: { status: "DRAFT" },
        after: {
          status: published.status,
          versionNumber: published.versionNumber,
          moduleCount: version.modules.length,
          retiredVersionCount: retired.count,
        },
      });
      return transaction.course.findUniqueOrThrow({
        where: { id: input.courseId },
        include: courseSummaryInclude,
      });
    });

    const summary = toCourseSummary(course);
    if (!summary.publishedVersion) {
      throw new AppException(
        "COURSE_VERSION_NOT_FOUND",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { course: summary, publishedVersion: summary.publishedVersion };
  }

  private async requireDraftEditor(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; versionId: string },
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    await this.requireEditableVersion(input);
    return actor;
  }

  private async requireModule(versionId: string, moduleId: string) {
    const courseModule = await this.prisma.courseModule.findFirst({
      where: { id: moduleId, courseVersionId: versionId },
    });
    if (!courseModule) {
      throw new AppException("CONTENT_PARENT_MISMATCH", HttpStatus.NOT_FOUND);
    }
    return courseModule;
  }

  private async requireLecture(versionId: string, lectureId: string) {
    const lecture = await this.prisma.lecture.findFirst({
      where: { id: lectureId, courseModule: { courseVersionId: versionId } },
    });
    if (!lecture) {
      throw new AppException("CONTENT_PARENT_MISMATCH", HttpStatus.NOT_FOUND);
    }
    return lecture;
  }

  private async assertTitleAvailable(
    academyId: string,
    title: string,
    excludedCourseId?: string,
  ) {
    const duplicate = await this.prisma.course.findFirst({
      where: {
        academyId,
        status: "ACTIVE",
        title: { equals: title, mode: "insensitive" },
        ...(excludedCourseId ? { id: { not: excludedCourseId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppException("COURSE_TITLE_CONFLICT", HttpStatus.CONFLICT);
    }
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

  private async findVersion(input: {
    academyId: string;
    courseId: string;
    versionId: string;
  }) {
    const version = await this.prisma.courseVersion.findFirst({
      where: {
        id: input.versionId,
        courseId: input.courseId,
        course: { academyId: input.academyId },
      },
      include: draftTreeInclude,
    });
    if (!version) {
      throw new AppException("COURSE_VERSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return version;
  }

  private async requireEditableVersion(input: {
    academyId: string;
    courseId: string;
    versionId: string;
  }) {
    const version = await this.findVersion(input);
    if (version.status !== "DRAFT") {
      throw new AppException(
        "COURSE_VERSION_IMMUTABLE",
        HttpStatus.CONFLICT,
      );
    }
    return version;
  }
}

async function nextModulePosition(
  transaction: Prisma.TransactionClient,
  courseVersionId: string,
) {
  const aggregate = await transaction.courseModule.aggregate({
    where: { courseVersionId },
    _max: { position: true },
  });
  return (aggregate._max.position ?? 0) + 1;
}

async function nextLecturePosition(
  transaction: Prisma.TransactionClient,
  courseModuleId: string,
) {
  const aggregate = await transaction.lecture.aggregate({
    where: { courseModuleId },
    _max: { position: true },
  });
  return (aggregate._max.position ?? 0) + 1;
}

/**
 * Positions are unique per parent, so every reorder parks the rows on negative
 * placeholders before writing the final 1..n sequence.
 */
async function repackPositions(
  orderedIds: string[],
  write: (id: string, position: number) => Promise<unknown>,
) {
  for (const [index, id] of orderedIds.entries()) {
    await write(id, -(index + 1));
  }
  for (const [index, id] of orderedIds.entries()) {
    await write(id, index + 1);
  }
}

function assertSameMembers(existingIds: string[], submittedIds: string[]) {
  const existing = new Set(existingIds);
  const submitted = new Set(submittedIds);
  const sameSize = existing.size === submitted.size
    && submittedIds.length === submitted.size;
  if (!sameSize || submittedIds.some((id) => !existing.has(id))) {
    throw new AppException(
      "CONTENT_POSITION_CONFLICT",
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

async function copyVersionContent(
  transaction: Prisma.TransactionClient,
  sourceVersionId: string,
  targetVersionId: string,
) {
  const modules = await transaction.courseModule.findMany({
    where: { courseVersionId: sourceVersionId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      lectures: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          materials: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              programmingExercise: {
                include: { testCases: true, hints: true },
              },
            },
          },
        },
      },
    },
  });

  for (const courseModule of modules) {
    const copiedModule = await transaction.courseModule.create({
      data: {
        courseVersionId: targetVersionId,
        title: courseModule.title,
        description: courseModule.description,
        position: courseModule.position,
      },
    });
    for (const lecture of courseModule.lectures) {
      const copiedLecture = await transaction.lecture.create({
        data: {
          courseModuleId: copiedModule.id,
          title: lecture.title,
          description: lecture.description,
          position: lecture.position,
        },
      });
      for (const material of lecture.materials) {
        const copiedMaterial = await transaction.material.create({
          data: {
            lectureId: copiedLecture.id,
            type: material.type,
            title: material.title,
            position: material.position,
            isRequired: material.isRequired,
          },
        });
        const exercise = material.programmingExercise;
        if (!exercise) continue;
        await transaction.programmingExercise.create({
          data: {
            materialId: copiedMaterial.id,
            courseVersionId: targetVersionId,
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
            testCases: {
              create: exercise.testCases.map((testCase) => ({
                position: testCase.position,
                input: testCase.input,
                expectedOutput: testCase.expectedOutput,
                visibility: testCase.visibility,
              })),
            },
            hints: {
              create: exercise.hints.map((hint) => ({
                position: hint.position,
                content: hint.content,
                triggerExpression: hint.triggerExpression,
              })),
            },
          },
        });
      }
    }
  }
}

type PublishIssue = {
  path: string;
  code: string;
  message: string;
  moduleId: string | null;
  lectureId: string | null;
  materialId: string | null;
};

/**
 * Drafts may stay incomplete; these rules only gate publishing.
 */
export function collectPublishIssues(
  tree: ReturnType<typeof toDraftTree>,
): PublishIssue[] {
  const issues: PublishIssue[] = [];

  if (tree.course.title.trim().length === 0) {
    issues.push({
      path: "course.title",
      code: "COURSE_TITLE_REQUIRED",
      message: "The course needs a title.",
      moduleId: null,
      lectureId: null,
      materialId: null,
    });
  }
  if (tree.modules.length === 0) {
    issues.push({
      path: "modules",
      code: "MODULE_REQUIRED",
      message: "Add at least one module before publishing.",
      moduleId: null,
      lectureId: null,
      materialId: null,
    });
  }

  tree.modules.forEach((courseModule, moduleIndex) => {
    if (courseModule.lectures.length === 0) {
      issues.push({
        path: `modules[${moduleIndex}].lectures`,
        code: "LECTURE_REQUIRED",
        message: `“${courseModule.title}” has no lectures.`,
        moduleId: courseModule.id,
        lectureId: null,
        materialId: null,
      });
    }
    courseModule.lectures.forEach((lecture, lectureIndex) => {
      lecture.materials.forEach((material, materialIndex) => {
        const path =
          `modules[${moduleIndex}].lectures[${lectureIndex}].materials[${materialIndex}]`;
        const exercise = material.programmingExercise;
        if (!exercise) {
          issues.push({
            path,
            code: "MATERIAL_INCOMPLETE",
            message: `“${material.title}” has no exercise content.`,
            moduleId: courseModule.id,
            lectureId: lecture.id,
            materialId: material.id,
          });
          return;
        }
        if (exercise.description.trim().length === 0) {
          issues.push({
            path: `${path}.description`,
            code: "EXERCISE_DESCRIPTION_REQUIRED",
            message: `“${material.title}” needs a problem description.`,
            moduleId: courseModule.id,
            lectureId: lecture.id,
            materialId: material.id,
          });
        }
        if (exercise.testCases.length === 0) {
          issues.push({
            path: `${path}.testCases`,
            code: "TEST_CASE_REQUIRED",
            message: `“${material.title}” needs at least one test case.`,
            moduleId: courseModule.id,
            lectureId: lecture.id,
            materialId: material.id,
          });
        }
        exercise.testCases.forEach((testCase, testCaseIndex) => {
          if (testCase.expectedOutput.trim().length === 0) {
            issues.push({
              path: `${path}.testCases[${testCaseIndex}].expectedOutput`,
              code: "TEST_CASE_OUTPUT_REQUIRED",
              message:
                `Test case ${testCaseIndex + 1} of “${material.title}” has no expected output.`,
              moduleId: courseModule.id,
              lectureId: lecture.id,
              materialId: material.id,
            });
          }
        });
      });
    });
  });

  return issues;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "P2002";
}

export function toCourseSummary(course: {
  id: string;
  academyId: string;
  title: string;
  description: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    publishedAt: Date | null;
    updatedAt: Date;
  }>;
}) {
  const toVersion = (version: (typeof course.versions)[number]) => ({
    ...version,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    updatedAt: version.updatedAt.toISOString(),
  });
  const draft = course.versions.find((version) => version.status === "DRAFT");
  const published = course.versions.find(
    (version) => version.status === "PUBLISHED",
  );
  return {
    id: course.id,
    academyId: course.academyId,
    title: course.title,
    description: course.description,
    status: course.status,
    draftVersion: draft ? toVersion(draft) : null,
    publishedVersion: published ? toVersion(published) : null,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

function toDraftTree(
  version: Prisma.CourseVersionGetPayload<{ include: typeof draftTreeInclude }>,
) {
  return {
    course: toCourseSummary(version.course),
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      updatedAt: version.updatedAt.toISOString(),
    },
    modules: version.modules.map((courseModule) => ({
      id: courseModule.id,
      title: courseModule.title,
      description: courseModule.description,
      position: courseModule.position,
      lectures: courseModule.lectures.map((lecture) => ({
        id: lecture.id,
        title: lecture.title,
        description: lecture.description,
        position: lecture.position,
        materials: lecture.materials.map((material) => ({
          id: material.id,
          type: material.type,
          title: material.title,
          position: material.position,
          isRequired: material.isRequired,
          programmingExercise: material.programmingExercise
            ? {
                materialId: material.programmingExercise.materialId,
                externalKey: material.programmingExercise.externalKey,
                legacyProblemNo: material.programmingExercise.legacyProblemNo,
                difficulty: material.programmingExercise.difficulty,
                description: material.programmingExercise.description,
                inputFormat: material.programmingExercise.inputFormat,
                outputFormat: material.programmingExercise.outputFormat,
                constraints: material.programmingExercise.constraints,
                starterCode: material.programmingExercise.starterCode,
                language: material.programmingExercise.language,
                timeLimitMs: material.programmingExercise.timeLimitMs,
                memoryLimitMb: material.programmingExercise.memoryLimitMb,
                aiFeedbackEnabled:
                  material.programmingExercise.aiFeedbackEnabled,
                testCases: material.programmingExercise.testCases.map(
                  (testCase) => ({
                    id: testCase.id,
                    position: testCase.position,
                    input: testCase.input,
                    expectedOutput: testCase.expectedOutput,
                    visibility: testCase.visibility,
                  }),
                ),
                hints: material.programmingExercise.hints.map((hint) => ({
                  id: hint.id,
                  position: hint.position,
                  content: hint.content,
                  triggerExpression: hint.triggerExpression,
                })),
              }
            : null,
        })),
      })),
    })),
  };
}
