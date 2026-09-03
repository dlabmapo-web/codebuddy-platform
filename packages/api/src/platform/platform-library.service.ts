import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  LIBRARY_PAGE_SIZE,
  isCourseCustomized,
  type LibraryCopy,
  type LibraryCourse,
  type ListLibraryCoursesInput,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  courseTreeCountSelect,
  courseTreeCounts,
} from "./course-tree-counts.js";
import { resolveContentLibrary } from "./library-academy.js";

/**
 * The content library, as head office manages it.
 *
 * Deliberately small. Everything about a library course's *contents* — its
 * modules, lectures, problems, test cases, and the Excel import that fills
 * them in bulk — goes through `academyCourses.*` and
 * `academyContentImports.*` unchanged, because a library course is an ordinary
 * `Course` in an academy whose `kind` is `LIBRARY`, and the console mounts the
 * very same editors over it. This service exists for the three things those
 * contracts cannot express: making a course without naming an academy,
 * withdrawing one from the library, and reading who has adopted it.
 */
@Injectable()
export class PlatformLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async academy(
    identity: SupabaseIdentity,
  ): Promise<{ academyId: string | null }> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.library.read",
    );
    return { academyId: await this.libraryId() };
  }

  async courses(
    identity: SupabaseIdentity,
    input: ListLibraryCoursesInput,
  ): Promise<{
    courses: LibraryCourse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.library.read",
    );

    const library = await this.libraryId();
    // No library yet means nothing has ever been published, which is an empty
    // list rather than an error. Creating one as a side effect of *reading*
    // would put a row in the database for every operator who glanced at the
    // page.
    if (!library) {
      return {
        courses: [],
        total: 0,
        page: input.page,
        pageSize: LIBRARY_PAGE_SIZE,
      };
    }

    const where: Prisma.CourseWhereInput = {
      academyId: library,
      ...(input.search
        ? { title: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...stateFilter(input.state),
    };

    const [total, records] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          isVisible: true,
          retiredAt: true,
          contentRevision: true,
          updatedAt: true,
          ...courseTreeCountSelect,
          // Every copy's stamp, so `behindCount` is computed here rather than
          // in a second query per row. A master with fifty adopters is fifty
          // integers, which is cheaper than fifty round trips and cheaper than
          // the group-by that would replace them.
          copies: { select: { sourceContentRevision: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * LIBRARY_PAGE_SIZE,
        take: LIBRARY_PAGE_SIZE,
      }),
    ]);

    return {
      courses: records.map((record) => ({
        id: record.id,
        title: record.title,
        description: record.description,
        isVisible: record.isVisible,
        retiredAt: record.retiredAt?.toISOString() ?? null,
        contentRevision: record.contentRevision,
        ...courseTreeCounts(record),
        copyCount: record.copies.length,
        behindCount: record.copies.filter(
          (copy) => (copy.sourceContentRevision ?? 0) < record.contentRevision,
        ).length,
        updatedAt: record.updatedAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: LIBRARY_PAGE_SIZE,
    };
  }

  /**
   * A new master course, and the library to hold it if this is the first.
   *
   * The only call in either library contract that cannot name an academy,
   * which is the whole reason it is not `academyCourses.create`.
   */
  async create(
    identity: SupabaseIdentity,
    input: { title: string; description: string },
  ): Promise<LibraryCourse> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );

    const created = await this.prisma.$transaction(async (transaction) => {
      const library = await resolveContentLibrary(
        transaction,
        this.config.get("PLATFORM_ORGANIZATION_SLUG", { infer: true }),
      );
      if (library.created) {
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: null,
          action: "platform.library.created",
          targetType: "Academy",
          targetId: library.id,
        });
      }

      const duplicate = await transaction.course.findFirst({
        where: {
          academyId: library.id,
          title: { equals: input.title, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new AppException("COURSE_TITLE_CONFLICT", HttpStatus.CONFLICT);
      }

      const course = await transaction.course.create({
        data: {
          academyId: library.id,
          title: input.title,
          description: input.description,
          createdByUserId: actor.userId,
        },
        select: librarySelect,
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: null,
        action: "platform.library.course.created",
        targetType: "Course",
        targetId: course.id,
      });

      return course;
    });

    return toLibraryCourse(created);
  }

  /**
   * Withdraw a master from the library, or put it back.
   *
   * Distinct from unpublishing, which is what `isVisible` says. A draft was
   * never offered; a retired course was offered, adopted, and withdrawn — and
   * the copies already taken have to keep saying so.
   */
  async retire(
    identity: SupabaseIdentity,
    input: { courseId: string; retired: boolean },
  ): Promise<LibraryCourse> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );

    const course = await this.requireLibraryCourse(input.courseId);

    const updated = await this.prisma.$transaction(async (transaction) => {
      const next = await transaction.course.update({
        where: { id: course.id },
        data: { retiredAt: input.retired ? new Date() : null },
        select: librarySelect,
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: null,
        action: input.retired
          ? "platform.library.course.retired"
          : "platform.library.course.restored",
        targetType: "Course",
        targetId: course.id,
      });
      return next;
    });

    return toLibraryCourse(updated);
  }

  /**
   * Which academies hold a copy of one master, and whether they have edited it.
   *
   * Counts, revisions and names — never a branch's content. Knowing *that* a
   * branch changed its copy is what finds a bad master; knowing *how* they
   * changed it is theirs, and is not readable from here.
   */
  async copies(
    identity: SupabaseIdentity,
    input: { courseId: string },
  ): Promise<{ copies: LibraryCopy[]; total: number }> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.library.read",
    );

    const course = await this.requireLibraryCourse(input.courseId);

    const records = await this.prisma.course.findMany({
      where: { sourceCourseId: course.id },
      select: {
        id: true,
        title: true,
        contentRevision: true,
        baselineRevision: true,
        sourceContentRevision: true,
        createdAt: true,
        academy: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ academy: { name: "asc" } }, { id: "asc" }],
    });

    return {
      copies: records.map((record) => ({
        academyId: record.academy.id,
        academyName: record.academy.name,
        academySlug: record.academy.slug,
        courseId: record.id,
        courseTitle: record.title,
        sourceContentRevision: record.sourceContentRevision ?? 1,
        isCustomized: isCourseCustomized(record),
        copiedAt: record.createdAt.toISOString(),
      })),
      total: records.length,
    };
  }

  /** The library's academy id, or null while the platform has never had one. */
  private async libraryId(): Promise<string | null> {
    const library = await this.prisma.academy.findFirst({
      where: { kind: "LIBRARY" },
      select: { id: true },
    });
    return library?.id ?? null;
  }

  /**
   * A course that is genuinely in the library.
   *
   * Checked by the academy's `kind` rather than by its id, so a `courseId`
   * belonging to a customer's academy cannot be retired or fanned out through
   * this service by anyone who guesses one.
   */
  private async requireLibraryCourse(courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, academy: { kind: "LIBRARY" } },
      select: { id: true, academyId: true },
    });
    if (!course) {
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return course;
  }
}

const librarySelect = {
  id: true,
  title: true,
  description: true,
  isVisible: true,
  retiredAt: true,
  contentRevision: true,
  updatedAt: true,
  ...courseTreeCountSelect,
  copies: { select: { sourceContentRevision: true } },
} as const;

function toLibraryCourse(record: {
  id: string;
  title: string;
  description: string;
  isVisible: boolean;
  retiredAt: Date | null;
  contentRevision: number;
  updatedAt: Date;
  modules: {
    _count: { lectures: number };
    lectures: { _count: { materials: number }; materials: { id: string }[] }[];
  }[];
  copies: { sourceContentRevision: number | null }[];
}): LibraryCourse {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    isVisible: record.isVisible,
    retiredAt: record.retiredAt?.toISOString() ?? null,
    contentRevision: record.contentRevision,
    ...courseTreeCounts(record),
    copyCount: record.copies.length,
    behindCount: record.copies.filter(
      (copy) => (copy.sourceContentRevision ?? 0) < record.contentRevision,
    ).length,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * The three states as a query, mirroring `libraryCourseState` exactly.
 *
 * Retirement wins there and has to win here too, or filtering to Published
 * would list courses the list itself draws as Retired.
 */
function stateFilter(
  state: "DRAFT" | "PUBLISHED" | "RETIRED" | undefined,
): Prisma.CourseWhereInput {
  if (state === "RETIRED") return { retiredAt: { not: null } };
  if (state === "PUBLISHED") return { retiredAt: null, isVisible: true };
  if (state === "DRAFT") return { retiredAt: null, isVisible: false };
  return {};
}
