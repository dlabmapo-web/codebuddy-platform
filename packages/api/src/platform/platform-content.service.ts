import { Injectable } from "@nestjs/common";
import type {
  ListPlatformClassesResult,
  ListPlatformCoursesResult,
  ListPlatformProblemsResult,
  ResolvedListPlatformContentInput,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * What every academy teaches, read across all of them at once.
 *
 * The question no academy-scoped service can answer: "which academy has the
 * course the customer is describing", "who has a class with no teacher",
 * "where is that problem". Each of those is a support call that used to end in
 * a SQL client.
 *
 * Reads only, and the counts are the point. A course row says how much is in
 * it and whether anybody teaches it; a problem row says whether it has test
 * cases. Those two numbers answer most of what an operator is actually being
 * asked, without opening a single one — and opening one means a support
 * session, in the academy's own editor.
 */
@Injectable()
export class PlatformContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async courses(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformContentInput,
  ): Promise<ListPlatformCoursesResult> {
    await this.authorize(identity);

    const where: Prisma.CourseWhereInput = {
      ...academyFilter(input),
      ...(input.query
        ? { title: { contains: input.query, mode: "insensitive" } }
        : {}),
    };

    const [total, records, academyOptions] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          isVisible: true,
          updatedAt: true,
          academy: { select: { id: true, name: true, slug: true } },
          // Counted by the database rather than by loading the tree: a course
          // with forty lectures would otherwise cost forty rows to answer one
          // number, on a page showing twenty-five courses.
          _count: { select: { modules: true, classAssignments: true } },
          modules: {
            select: {
              _count: { select: { lectures: true } },
              lectures: {
                select: { _count: { select: { materials: true } } },
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.academyOptions(),
    ]);

    return {
      rows: records.map((record) => ({
        id: record.id,
        title: record.title,
        description: record.description,
        isVisible: record.isVisible,
        academyId: record.academy.id,
        academyName: record.academy.name,
        academySlug: record.academy.slug,
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
        classCount: record._count.classAssignments,
        updatedAt: record.updatedAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      academyOptions,
    };
  }

  async classes(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformContentInput,
  ): Promise<ListPlatformClassesResult> {
    await this.authorize(identity);

    const where: Prisma.ClassWhereInput = {
      ...academyFilter(input),
      ...(input.query
        ? { name: { contains: input.query, mode: "insensitive" } }
        : {}),
    };

    const [total, records, academyOptions] = await Promise.all([
      this.prisma.class.count({ where }),
      this.prisma.class.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          updatedAt: true,
          academy: { select: { id: true, name: true, slug: true } },
          assignedTeacher: {
            select: {
              role: true,
              status: true,
              user: {
                select: {
                  displayName: true,
                  username: true,
                  avatarUrl: true,
                },
              },
            },
          },
          // Named, not counted: the row is answering "what is this class".
          courseAssignments: {
            select: { course: { select: { id: true, title: true } } },
            orderBy: { course: { title: "asc" } },
            take: 4,
          },
          _count: { select: { enrollments: true, courseAssignments: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.academyOptions(),
    ]);

    return {
      rows: records.map((record) => {
        // A teacher suspended or demoted after being assigned leaves the
        // assignment in place. The manager's control tower counts that class
        // as having no teacher, and this surface has to agree with it — an
        // operator and a manager looking at the same class must not disagree
        // about whether anybody is running it.
        const teacher = record.assignedTeacher;
        const usable = teacher?.role === "TEACHER" && teacher.status === "ACTIVE";
        return {
          id: record.id,
          name: record.name,
          description: record.description,
          status: record.status,
          courses: record.courseAssignments.map((row) => ({
            id: row.course.id,
            title: row.course.title,
          })),
          academyId: record.academy.id,
          academyName: record.academy.name,
          academySlug: record.academy.slug,
          teacherName: usable
            ? teacher.user.displayName?.trim() ||
              teacher.user.username?.trim() ||
              null
            : null,
          teacherAvatarUrl: usable ? teacher.user.avatarUrl : null,
          studentCount: record._count.enrollments,
          courseCount: record._count.courseAssignments,
          updatedAt: record.updatedAt.toISOString(),
        };
      }),
      total,
      page: input.page,
      pageSize: input.pageSize,
      academyOptions,
    };
  }

  async problems(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformContentInput,
  ): Promise<ListPlatformProblemsResult> {
    await this.authorize(identity);

    // Addressed by the material, because that is what the academy's own URLs
    // address: an operator following an Edit link has to land on a page that
    // exists.
    const where: Prisma.MaterialWhereInput = {
      type: "PROGRAMMING_EXERCISE",
      lecture: {
        courseModule: {
          course: {
            ...academyFilter(input),
          },
        },
      },
      ...(input.query
        ? { title: { contains: input.query, mode: "insensitive" } }
        : {}),
    };

    const [total, records, academyOptions] = await Promise.all([
      this.prisma.material.count({ where }),
      this.prisma.material.findMany({
        where,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          programmingExercise: {
            select: {
              difficulty: true,
              // Counted, never listed. The number tells an operator whether a
              // problem is finished; the cases themselves are the academy's.
              _count: { select: { testCases: true } },
            },
          },
          lecture: {
            select: {
              id: true,
              title: true,
              courseModule: {
                select: {
                  course: {
                    select: {
                      id: true,
                      title: true,
                      academy: { select: { id: true, name: true, slug: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.academyOptions(),
    ]);

    return {
      rows: records.map((record) => {
        const course = record.lecture.courseModule.course;
        return {
          materialId: record.id,
          title: record.title,
          difficulty: record.programmingExercise?.difficulty ?? null,
          testCaseCount: record.programmingExercise?._count.testCases ?? 0,
          courseId: course.id,
          courseTitle: course.title,
          lectureId: record.lecture.id,
          lectureTitle: record.lecture.title,
          academyId: course.academy.id,
          academyName: course.academy.name,
          academySlug: course.academy.slug,
          updatedAt: record.updatedAt.toISOString(),
        };
      }),
      total,
      page: input.page,
      pageSize: input.pageSize,
      academyOptions,
    };
  }

  private async authorize(identity: SupabaseIdentity): Promise<void> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.content.read",
    );
  }

  private academyOptions() {
    return this.prisma.academy.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }
}

function academyFilter(input: ResolvedListPlatformContentInput) {
  return input.academyIds?.length
    ? { academyId: { in: input.academyIds } }
    : {};
}
