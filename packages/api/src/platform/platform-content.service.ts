import { Injectable } from "@nestjs/common";
import type {
  ListPlatformClassesResult,
  ListPlatformCoursesResult,
  PlatformContentSummary,
  PlatformContentSummaryInput,
  ResolvedListPlatformContentInput,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { contentStatPredicates } from "./content-stat-predicates.js";

/**
 * A problem that cannot grade, unscoped by academy.
 *
 * The same predicate the summary counts with, reused inside the course tree
 * where the academy is already established by the outer `where`. One
 * definition, so the number on a course row and the number in the summary
 * strip can never disagree about what "cannot grade" means.
 */
const untestedProblem = contentStatPredicates().problemWithoutTests;

/**
 * What every academy teaches, read across all of them at once.
 *
 * The question no academy-scoped service can answer: "which academy has the
 * course the customer is describing", "who has a class with no teacher",
 * "which curriculum cannot grade". Each of those is a support call that used to
 * end in a SQL client.
 *
 * The service reads only, and the counts are the point. A course row says how
 * much is in it, whether anybody teaches it, and how many of its problems have
 * no test cases; a class row says who runs it and who is in it. Those numbers
 * answer most of what an operator is actually being asked, without opening a
 * single row. Opening mounts that academy's existing editor under a console
 * route.
 */
@Injectable()
export class PlatformContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async summary(
    identity: SupabaseIdentity,
    input: PlatformContentSummaryInput,
  ): Promise<PlatformContentSummary> {
    await this.authorize(identity);

    const academyIds = input.academyIds?.length ? input.academyIds : undefined;
    const stats = contentStatPredicates(academyIds);
    const academyWhere: Prisma.AcademyWhereInput = academyIds
      ? { id: { in: academyIds } }
      : {};

    const [
      academies,
      courses,
      publishedCourses,
      classes,
      runningClasses,
      classesWithoutTeacher,
      problems,
      problemsWithoutTests,
    ] = await Promise.all([
      this.prisma.academy.count({ where: academyWhere }),
      this.prisma.course.count({ where: stats.course }),
      this.prisma.course.count({ where: stats.publishedCourse }),
      this.prisma.class.count({ where: stats.class }),
      this.prisma.class.count({ where: stats.activeClass }),
      this.prisma.class.count({ where: stats.classWithoutTeacher }),
      this.prisma.material.count({ where: stats.problem }),
      this.prisma.material.count({ where: stats.problemWithoutTests }),
    ]);

    return {
      academies,
      courses: { total: courses, published: publishedCourses },
      classes: {
        total: classes,
        running: runningClasses,
        withoutTeacher: classesWithoutTeacher,
      },
      problems: { total: problems, withoutTests: problemsWithoutTests },
    };
  }

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
                select: {
                  _count: { select: { materials: true } },
                  // Only the broken ones, and only their ids. Nested in the
                  // tree already being loaded rather than asked for in a
                  // second round trip, and on a healthy academy it selects
                  // nothing at all.
                  materials: {
                    where: untestedProblem,
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
        orderBy: courseOrder(input),
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
        problemsWithoutTests: record.modules.reduce(
          (sum, module) =>
            sum +
            module.lectures.reduce(
              (inner, lecture) => inner + lecture.materials.length,
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
        orderBy: classOrder(input),
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

/**
 * How each lens turns a sort key into an `orderBy`.
 *
 * Every list ends on `id: "asc"`. Without a unique tiebreaker a page boundary
 * is undefined for rows that tie — twenty courses updated in the same import
 * minute — and an operator paging through them sees one row twice and another
 * never. It is the paging equivalent of a coin flip per request.
 *
 * A key a lens does not have falls back to that lens's default rather than
 * throwing. The sort travels between the two pages in the URL, and an address
 * that 500s because it names `students` while showing courses would be a
 * shareable link that breaks on arrival.
 */
type ContentOrderInput = Pick<
  ResolvedListPlatformContentInput,
  "sort" | "direction"
>;

function courseOrder(
  input: ContentOrderInput,
): Prisma.CourseOrderByWithRelationInput[] {
  const dir = input.direction;
  switch (input.sort) {
    case "title":
      return [{ title: dir }, { id: "asc" }];
    case "classes":
      return [{ classAssignments: { _count: dir } }, { id: "asc" }];
    case "modules":
      return [{ modules: { _count: dir } }, { id: "asc" }];
    default:
      return [{ updatedAt: dir }, { id: "asc" }];
  }
}

function classOrder(
  input: ContentOrderInput,
): Prisma.ClassOrderByWithRelationInput[] {
  const dir = input.direction;
  switch (input.sort) {
    case "title":
      return [{ name: dir }, { id: "asc" }];
    case "students":
      return [{ enrollments: { _count: dir } }, { id: "asc" }];
    default:
      return [{ updatedAt: dir }, { id: "asc" }];
  }
}

function academyFilter(input: ResolvedListPlatformContentInput) {
  return input.academyIds?.length
    ? { academyId: { in: input.academyIds } }
    : {};
}
