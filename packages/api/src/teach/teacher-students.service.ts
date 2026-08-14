import { Injectable, Logger } from "@nestjs/common";
import {
  DEFAULT_STUDENT_PAGE_SIZE,
  clampPage,
  defaultSortDirection,
  matchesAttentionFilter,
  resolveOverviewPeriod,
  sortStudents,
  type ListAcademyStudentsInput,
  type StudentAttentionFilter,
  type TeacherStudentList,
  type TeacherStudentRow,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { buildStudentFacts, type StudentFact } from "./student-facts.js";
import { TeacherOverviewAccessService } from "./teacher-overview-access.service.js";
import { TeacherOverviewRepository } from "./teacher-overview.repository.js";
import { aggregateScopeFor } from "./teacher-overview.service.js";
import { TeacherProgressRepository } from "./teacher-progress.repository.js";

/**
 * The Student analytics table, one page at a time.
 *
 * Every row is measured by `student-facts`, the same unit the overview uses, so
 * the five students the Teaching queue names and the same five students in this
 * table cannot report different active time or different scores. That shared
 * derivation is the point of the module; this one adds only what a table needs
 * that a summary does not — filtering, a total order, and a page.
 *
 * The order is computed over the *whole* authorized result and the page is cut
 * afterwards. §7.3 requires `Order` to describe the complete filtered set, and
 * a page sorted after slicing would produce a column that renumbers itself
 * whenever a teacher turns the page.
 *
 * The scope is bounded by authorization long before it is bounded by paging —
 * an academy's assigned classes hold hundreds of students, not millions — so
 * ordering the resolved set in the service is cheap and, unlike an ORDER BY
 * spread across six aggregate queries, it is a rule that can be tested at its
 * ties without a database.
 *
 * See §7 of the teacher overview and student analytics redesign.
 */
@Injectable()
export class TeacherStudentsService {
  private readonly logger = new Logger(TeacherStudentsService.name);

  constructor(
    private readonly access: TeacherOverviewAccessService,
    private readonly repository: TeacherOverviewRepository,
    private readonly progress: TeacherProgressRepository,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: ListAcademyStudentsInput,
  ): Promise<TeacherStudentList> {
    const scope = await this.access.requireScope(identity, input);
    const now = new Date();
    const period = resolveOverviewPeriod({
      range: input.range ?? "7d",
      now,
      timeZone: scope.timeZone,
    });

    const sort = input.sort ?? "score";
    const direction = input.direction ?? defaultSortDirection[sort];
    const pageSize = input.pageSize ?? DEFAULT_STUDENT_PAGE_SIZE;
    const search = (input.search ?? "").trim();
    const attention: StudentAttentionFilter = input.attention ?? [];

    const filters = {
      classes: scope.classOptions,
      courses: scope.courseOptions,
      modules: scope.moduleOptions,
      lectures: scope.lectureOptions,
      problems: scope.problemOptions,
    };
    const baseScope = {
      academyId: scope.actor.academyId,
      classId: scope.selectedClassId,
      courseId: scope.selectedCourseId,
      moduleId: scope.selectedModuleId,
      lectureId: scope.selectedLectureId,
      problemId: scope.selectedProblemId,
      curriculumLabel: scope.curriculumLabel,
      scopedProblems: scope.exercises.length,
      period,
      activityTrackedSince: null as string | null,
      generatedAt: now.toISOString(),
    };

    if (scope.students.length === 0 || scope.materialIds.length === 0) {
      const trackedSince = await this.repository
        .activityTrackedSince(scope.actor.academyId)
        .catch(() => null);
      return {
        scope: { ...baseScope, activityTrackedSince: trackedSince },
        filters,
        rows: [],
        totalRows: 0,
        page: 1,
        pageSize,
        pageCount: 1,
        sort,
        direction,
        search,
        attention,
      };
    }

    const workScope = aggregateScopeFor(scope);
    const currentPeriod = {
      startAt: period.startAt ? new Date(period.startAt) : null,
      endAt: new Date(period.endAt),
    };
    const activityWindow = {
      scope: workScope,
      startDate: period.startDate,
      endDate: period.endDate,
    };

    // Unlike the overview, a failing aggregate here is not survivable: a table
    // whose "active learning" column silently read zero would be a page of
    // wrong numbers rather than a page with a gap in it, and the teacher has no
    // section header to be told about it in.
    const [activity, activityDays, work, candidates, trackedSince] =
      await Promise.all([
        this.repository.activityByStudentCourse(activityWindow),
        this.repository.activityDaysByStudent(activityWindow),
        this.repository.workByStudent(workScope, currentPeriod),
        this.progress.attentionCandidates({
          userIds: scope.userIds,
          materialIds: scope.materialIds,
          overviewScope: workScope,
          now,
        }),
        this.repository
          .activityTrackedSince(scope.actor.academyId)
          .catch(() => null),
      ]);

    const facts = buildStudentFacts({
      scope,
      activity,
      activityDays,
      work,
      candidates,
      period,
      now,
    });

    const matching = facts.filter(
      (fact) =>
        matchesSearch(fact, search) &&
        matchesAttentionFilter(fact.reasons, attention),
    );

    // Ordered whole, then cut. The two lines are the contract §7.3 states.
    const ordered = sortStudents(matching.map(orderingOf), sort, direction);
    const { page, pageCount, offset } = clampPage({
      page: input.page ?? 1,
      pageSize,
      totalRows: ordered.length,
    });

    const rows: TeacherStudentRow[] = ordered
      .slice(offset, offset + pageSize)
      .map((row, index) => ({
        order: offset + index + 1,
        membershipId: row.fact.student.membershipId,
        displayName: row.fact.student.displayName,
        classes: row.fact.classes,
        courseScope: scope.curriculumLabel,
        averageScore: row.fact.averageScore,
        attemptedProblems: row.fact.attemptedProblems,
        solvedProblems: row.fact.solvedProblems,
        submissions: row.fact.submissions,
        activeSeconds: row.fact.activeSeconds,
        activeDays: row.fact.activeDays,
        lastActivityAt: row.fact.lastActivityAt?.toISOString() ?? null,
        reasons: row.fact.reasons,
        primaryClassId: row.fact.primaryClassId,
      }));

    // §13 — shape and cost, with no student, name, score, or search text.
    this.logger.log(
      `teacherStudents.list classes=${scope.classes.length} ` +
        `students=${scope.students.length} range=${period.range} ` +
        `sort=${sort}:${direction} attention=${attention.length} ` +
        `rows=${rows.length}/${ordered.length}`,
    );

    return {
      scope: { ...baseScope, activityTrackedSince: trackedSince },
      filters,
      rows,
      totalRows: ordered.length,
      page,
      pageSize,
      pageCount,
      sort,
      direction,
      search,
      attention,
    };
  }
}

/** The comparator's view of a fact, with the fact itself along for the ride. */
function orderingOf(fact: StudentFact) {
  return {
    fact,
    membershipId: fact.student.membershipId,
    displayName: fact.student.displayName,
    averageScore: fact.averageScore,
    attemptedProblems: fact.attemptedProblems,
    solvedProblems: fact.solvedProblems,
    submissions: fact.submissions,
    activeSeconds: fact.activeSeconds,
    activeDays: fact.activeDays,
    lastActivityAt: fact.lastActivityAt?.toISOString() ?? null,
  };
}

/**
 * Name search, case- and accent-insensitively.
 *
 * A substring match rather than a prefix one: a teacher who knows a child by
 * their given name should find them in a roster that stores the family name
 * first, and Korean and Latin rosters order those two differently.
 */
function matchesSearch(fact: StudentFact, search: string): boolean {
  if (!search) return true;
  return fact.student.displayName
    .toLocaleLowerCase()
    .includes(search.toLocaleLowerCase());
}
