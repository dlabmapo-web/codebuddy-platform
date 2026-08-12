import { Injectable } from "@nestjs/common";
import {
  ANSWER_RECORDS_PAGE_SIZE,
  acceptedRate,
  answerRecordResultFor,
  resolveRecordsPage,
  submissionStatusesFor,
  type AnswerRecordFacetOption,
  type AnswerRecordResult,
  type AnswerRecordRow,
  type AnswerRecordsResult,
  type ListAnswerRecordsInput,
  type SortDirection,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import {
  enrolledClassWhere,
  learningScopeFor,
  type LearningScope,
} from "../classes/assigned-course-access.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";

/**
 * One student's academy-wide answer history.
 *
 * Two rules hold everywhere in this file. The read is always pinned to the
 * authenticated actor — there is no caller-provided user id anywhere in the
 * input — and current access is never inferred from history: an old attempt
 * proves what a student did, not what they may still open.
 *
 * The row's printed labels come from the submission's own snapshot, while
 * every filter joins the live curriculum. An old title therefore stays honest
 * without letting a since-hidden course reappear as a selectable facet.
 *
 * See §6 and §10 of the student answer records design.
 */
@Injectable()
export class AnswerRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  async listAnswerRecords(
    identity: SupabaseIdentity,
    input: ListAnswerRecordsInput,
  ): Promise<AnswerRecordsResult> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );
    const { userId } = actor;
    const scope = learningScopeFor(input.academyId, actor);

    // The whole academy-visible history, before any table filter. The summary
    // is measured against this and only this: narrowing the table must not
    // make a student's overall progress appear to change.
    const owned: Prisma.SubmissionWhereInput = {
      userId,
      course: { academyId: input.academyId },
    };
    const filtered: Prisma.SubmissionWhereInput = {
      ...owned,
      ...this.filtersFor(input, userId),
    };

    const [summary, facets, totalCount] = await Promise.all([
      this.summaryFor(owned),
      this.facetsFor({ academyId: input.academyId, userId, scope, input, owned }),
      this.prisma.submission.count({ where: filtered }),
    ]);

    const { page, pageCount, skip } = resolveRecordsPage({
      requestedPage: input.page ?? 1,
      totalCount,
    });
    const submissions = await this.prisma.submission.findMany({
      where: filtered,
      orderBy: orderByFor(input.sort, input.direction),
      skip,
      take: ANSWER_RECORDS_PAGE_SIZE,
      select: {
        id: true,
        sourceMaterialId: true,
        problemTitle: true,
        courseTitle: true,
        moduleTitle: true,
        lectureTitle: true,
        modulePosition: true,
        lecturePosition: true,
        problemPosition: true,
        status: true,
        score: true,
        passedCount: true,
        totalCount: true,
        solveElapsedSec: true,
        createdAt: true,
      },
    });

    // One query for the whole page rather than a reachability check per row:
    // a record stays readable when its problem disappears, but Review is only
    // offered for a problem current authorization would open anyway.
    const openable = await this.openableMaterialIds({
      academyId: input.academyId,
      scope,
      materialIds: submissions.map((item) => item.sourceMaterialId),
    });

    const rows: AnswerRecordRow[] = submissions.map((item) => ({
      submissionId: item.id,
      materialId: item.sourceMaterialId,
      problemTitle: item.problemTitle,
      courseTitle: item.courseTitle,
      moduleTitle: item.moduleTitle,
      lectureTitle: item.lectureTitle,
      modulePosition: item.modulePosition,
      lecturePosition: item.lecturePosition,
      problemPosition: item.problemPosition,
      result: answerRecordResultFor(item.status),
      score: item.score,
      passedCount: item.passedCount,
      totalCount: item.totalCount,
      solveElapsedSec: item.solveElapsedSec,
      createdAt: item.createdAt.toISOString(),
      canOpenExercise: openable.has(item.sourceMaterialId),
    }));

    return {
      summary,
      rows,
      facets,
      pagination: {
        page,
        pageSize: ANSWER_RECORDS_PAGE_SIZE,
        totalCount,
        pageCount,
      },
    };
  }

  /**
   * Search and the five facets, as one predicate.
   *
   * Search reads the frozen labels because those are the words on screen; a
   * student searching for what they can see must not be answered from a title
   * that has since been edited. The curriculum facets read the live graph,
   * because those are the ids the options were built from.
   */
  private filtersFor(
    input: ListAnswerRecordsInput,
    userId: string,
  ): Prisma.SubmissionWhereInput {
    const conditions: Prisma.SubmissionWhereInput[] = [];

    const needle = input.q?.trim();
    if (needle) {
      conditions.push({
        OR: [
          { problemTitle: { contains: needle, mode: "insensitive" } },
          { courseTitle: { contains: needle, mode: "insensitive" } },
          { moduleTitle: { contains: needle, mode: "insensitive" } },
          { lectureTitle: { contains: needle, mode: "insensitive" } },
        ],
      });
    }

    if (input.results?.length) {
      conditions.push({
        status: { in: input.results.flatMap(submissionStatusesFor) },
      });
    }

    if (input.courseIds?.length) {
      conditions.push({ courseId: { in: input.courseIds } });
    }

    // An access path, not historical provenance: a submission never recorded
    // which class link led to the course, and the same course may be assigned
    // to two classes. `some` is what keeps that from duplicating a row, and
    // the enrolment predicate is what keeps a class id the student has left
    // from selecting anything.
    if (input.classIds?.length) {
      conditions.push({
        course: {
          classAssignments: {
            some: {
              classId: { in: input.classIds },
              class: enrolledClassWhere(input.academyId, userId),
            },
          },
        },
      });
    }

    if (input.moduleIds?.length) {
      conditions.push({
        material: { is: { lecture: { courseModuleId: { in: input.moduleIds } } } },
      });
    }

    if (input.lectureIds?.length) {
      conditions.push({ material: { is: { lectureId: { in: input.lectureIds } } } });
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  /** `PASSED` + `FAILED` attempts, distinct solved problems, accepted rate. */
  private async summaryFor(owned: Prisma.SubmissionWhereInput) {
    const [byStatus, solved] = await Promise.all([
      this.prisma.submission.groupBy({
        by: ["status"],
        where: owned,
        _count: { _all: true },
      }),
      this.prisma.submission.groupBy({
        by: ["sourceMaterialId"],
        where: { ...owned, status: "PASSED" },
      }),
    ]);

    const countOf = (status: "PASSED" | "FAILED") =>
      byStatus.find((group) => group.status === status)?._count._all ?? 0;
    const accepted = countOf("PASSED");
    const notAccepted = countOf("FAILED");

    return {
      // A judge fault is a platform failure and cancelled work was never
      // graded; neither is an attempt this student made.
      totalSubmissions: accepted + notAccepted,
      solvedProblems: solved.length,
      acceptedRate: acceptedRate({ accepted, notAccepted }),
    };
  }

  /**
   * The options that exist, narrowed by whichever parents are selected.
   *
   * Built from the curriculum this student actually has records in rather than
   * from the whole academy: an option that can only ever return nothing is
   * noise. Counts are deliberately absent — see `answerRecordFacetsSchema`.
   */
  private async facetsFor({
    academyId,
    userId,
    scope,
    input,
    owned,
  }: {
    academyId: string;
    userId: string;
    scope: LearningScope;
    input: ListAnswerRecordsInput;
    owned: Prisma.SubmissionWhereInput;
  }) {
    const [attempted, statuses] = await Promise.all([
      this.prisma.material.findMany({
        where: {
          ...reachableMaterialWhere(academyId, scope),
          submissions: { some: { userId } },
        },
        select: {
          lecture: {
            select: {
              id: true,
              title: true,
              courseModule: {
                select: {
                  id: true,
                  title: true,
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.submission.groupBy({ by: ["status"], where: owned }),
    ]);

    const courses = new Map<string, AnswerRecordFacetOption>();
    const modules = new Map<string, AnswerRecordFacetOption>();
    const lectures = new Map<string, AnswerRecordFacetOption>();
    const selectedCourses = new Set(input.courseIds ?? []);
    const selectedModules = new Set(input.moduleIds ?? []);

    for (const material of attempted) {
      const { lecture } = material;
      const courseModule = lecture.courseModule;
      const course = courseModule.course;
      courses.set(course.id, { value: course.id, label: course.title });
      // A child option only makes sense under a chosen parent. Removing the
      // parent widens the list again, which is what makes a stale child
      // selection in the URL harmless rather than unreachable.
      if (selectedCourses.size > 0 && !selectedCourses.has(course.id)) continue;
      modules.set(courseModule.id, {
        value: courseModule.id,
        label: courseModule.title,
      });
      if (selectedModules.size > 0 && !selectedModules.has(courseModule.id)) {
        continue;
      }
      lectures.set(lecture.id, { value: lecture.id, label: lecture.title });
    }

    const classes = await this.classFacetFor({
      academyId,
      userId,
      courseIds: [...courses.keys()],
    });

    const results = new Set<AnswerRecordResult>();
    for (const group of statuses) results.add(answerRecordResultFor(group.status));

    return {
      results: [...results],
      classes,
      courses: sortOptions(courses),
      modules: sortOptions(modules),
      lectures: sortOptions(lectures),
    };
  }

  /**
   * The classes that currently provide a course this student has records in.
   *
   * Current access, stated as such. A class a student has left stops being an
   * option even though the work done through it remains in the table.
   */
  private async classFacetFor({
    academyId,
    userId,
    courseIds,
  }: {
    academyId: string;
    userId: string;
    courseIds: string[];
  }): Promise<AnswerRecordFacetOption[]> {
    if (courseIds.length === 0) return [];
    const classes = await this.prisma.class.findMany({
      where: {
        ...enrolledClassWhere(academyId, userId),
        courseAssignments: { some: { courseId: { in: courseIds } } },
      },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return classes.map((item) => ({ value: item.id, label: item.name }));
  }

  private async openableMaterialIds({
    academyId,
    scope,
    materialIds,
  }: {
    academyId: string;
    scope: LearningScope;
    materialIds: string[];
  }): Promise<Set<string>> {
    if (materialIds.length === 0) return new Set();
    const reachable = await this.prisma.material.findMany({
      where: {
        id: { in: materialIds },
        ...reachableMaterialWhere(academyId, scope),
      },
      select: { id: true },
    });
    return new Set(reachable.map((item) => item.id));
  }
}

function sortOptions(
  options: Map<string, AnswerRecordFacetOption>,
): AnswerRecordFacetOption[] {
  return [...options.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label) ||
      left.value.localeCompare(right.value),
  );
}

/**
 * One server sort at a time, always with the id tiebreak.
 *
 * Without it two submissions sharing a timestamp can swap places between two
 * requests, which makes a row appear on two pages or on neither. Solve time
 * sorts nulls last in both directions: "not recorded" is an absence, not the
 * smallest duration.
 */
export function orderByFor(
  sort: ListAnswerRecordsInput["sort"],
  direction: SortDirection | undefined,
): Prisma.SubmissionOrderByWithRelationInput[] {
  const order: SortDirection = direction ?? (sort ? "asc" : "desc");
  const tiebreak = { id: order } as const;

  switch (sort) {
    case "problem":
      return [{ problemTitle: order }, tiebreak];
    case "result":
      return [{ status: order }, tiebreak];
    case "score":
      return [{ score: order }, tiebreak];
    case "solveTime":
      return [{ solveElapsedSec: { sort: order, nulls: "last" } }, tiebreak];
    case "submitted":
      return [{ createdAt: order }, tiebreak];
    default:
      // Newest first, with the id tiebreak that keeps paging stable.
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}
