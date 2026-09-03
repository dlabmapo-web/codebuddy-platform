import { Injectable } from "@nestjs/common";
import {
  PLATFORM_RANKING_MAX_CLASSES,
  resolvePointsPeriod,
  type ClassPointsState,
  type ListPlatformRankingResult,
  type PlatformRankedClass,
  type PointsPeriod,
  type ResolvedListPlatformRankingInput,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { PrismaService } from "../database/prisma.service.js";

/**
 * Every academy's classes, ordered by what their students earned.
 *
 * The question no academy-scoped surface can answer: "is this academy using
 * the product", "which classes are actually earning this week", "their manager
 * says ranking is broken". Each of those currently ends with an operator
 * opening a support grant to read a page they are already permitted to read.
 *
 * ## What it returns, and what it never does
 *
 * Class aggregates. No child's name, no membership id, no submission, no
 * grade — §10.2 forbids a ranking of children at platform scale, so children
 * are ranked only by the board, inside one class. That exclusion is what lets
 * this sit behind `platform.analytics.read` while the board an operator opens
 * from a row stays behind the wider `platform.academies.inspect`.
 *
 * ## Why it does not page in the database
 *
 * Points are a period-scoped `groupBy` over `PointAward`, and there is no
 * stored standing anywhere by design. So `points` cannot be an `orderBy`, and
 * `platform/content.ts` states what follows: a page of twenty-five ordered by
 * a figure computed after loading is twenty-five rows sorted among themselves,
 * which changes on every page and is a lie about the whole set.
 *
 * This service therefore aggregates **every class in scope**, sorts the
 * complete set, and only then slices the page. The cost does not grow with the
 * class count: six queries, whose work is driven by the `PointAward` rows in
 * the period rather than by how many classes exist.
 * `PLATFORM_RANKING_MAX_CLASSES` bounds it and reports `truncated` rather than
 * silently describing part of the platform.
 */
@Injectable()
export class PlatformRankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async classes(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformRankingInput,
  ): Promise<ListPlatformRankingResult> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.analytics.read",
    );

    // Only ACTIVE academies. `PointsAccessService.platformScope` refuses a
    // suspended or archived one outright, so listing its classes would offer a
    // row whose board cannot open.
    const academies = await this.prisma.academy.findMany({
      where: {
        status: "ACTIVE",
        ...(input.academyIds?.length ? { id: { in: input.academyIds } } : {}),
      },
      select: { id: true, name: true, slug: true, timeZone: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    const academyOptions = await this.academyOptions();
    if (academies.length === 0) {
      return this.emptyResult(input, academyOptions);
    }

    const flags = await this.enabledFlags(academies.map((one) => one.id));

    // One extra, so "is there more than we may aggregate" is knowable without
    // a second count.
    const records = await this.prisma.class.findMany({
      where: {
        academyId: { in: academies.map((one) => one.id) },
        status: "ACTIVE",
        ...(input.query
          ? {
              OR: [
                { name: { contains: input.query, mode: "insensitive" } },
                {
                  academy: {
                    name: { contains: input.query, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      take: PLATFORM_RANKING_MAX_CLASSES + 1,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        academyId: true,
        // `assignedTeacher`, and nullable by design: SetNull on the
        // membership leaves the class intact and merely unassigned, which is
        // the condition an operator is most often asked about.
        assignedTeacher: {
          select: {
            user: { select: { displayName: true } },
            memberProfile: { select: { academyDisplayName: true } },
          },
        },
      },
    });

    const truncated = records.length > PLATFORM_RANKING_MAX_CLASSES;
    const classes = truncated
      ? records.slice(0, PLATFORM_RANKING_MAX_CLASSES)
      : records;
    if (classes.length === 0) {
      return this.emptyResult(input, academyOptions, academies.length);
    }

    const classIds = classes.map((one) => one.id);
    const academyById = new Map(academies.map((one) => [one.id, one]));

    // Classes whose academy has points switched off contribute no award rows,
    // so they are kept out of the aggregate queries entirely rather than
    // summing to a zero that would then have to be un-zeroed.
    const countedIds = classes
      .filter((one) => flags.get(one.academyId)?.has("STUDENT_POINTS"))
      .map((one) => one.id);

    const [rosters, awards, solves] = await Promise.all([
      this.rosters(classIds),
      this.awards(academies, countedIds, input.period),
      this.solves(academies, countedIds, input.period),
    ]);

    const rows: PlatformRankedClass[] = classes.map((record) => {
      const academy = academyById.get(record.academyId)!;
      const on = flags.get(record.academyId) ?? new Set<string>();
      const state: ClassPointsState = !on.has("STUDENT_POINTS")
        ? "points_off"
        : on.has("STUDENT_CLASS_LEADERBOARD")
          ? "ranked"
          : "board_off";
      const earned = awards.get(record.id);

      return {
        academyId: academy.id,
        academyName: academy.name,
        academySlug: academy.slug,
        timeZone: academy.timeZone,
        classId: record.id,
        name: record.name,
        teacherName: teacherNameOf(record.assignedTeacher),
        students: rosters.get(record.id) ?? 0,
        earningStudents: earned?.earningStudents ?? 0,
        // Null, never 0, when the academy switched points off — a zero would
        // sort a deliberate decision next to a failure.
        points: state === "points_off" ? null : (earned?.points ?? 0),
        solvedProblems:
          state === "points_off" ? null : (solves.get(record.id) ?? 0),
        state,
      };
    });

    const ordered = sortRows(rows, input.sort, input.direction);
    const start = (input.page - 1) * input.pageSize;

    return {
      rows: ordered.slice(start, start + input.pageSize),
      total: ordered.length,
      page: input.page,
      pageSize: input.pageSize,
      truncated,
      summary: summarize(ordered, academies.length),
      academyOptions,
    };
  }

  /** Active student memberships per class — the population the board ranks. */
  private async rosters(classIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.classEnrollment.groupBy({
      by: ["classId"],
      where: {
        classId: { in: classIds },
        membership: { status: "ACTIVE", role: "STUDENT" },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.classId, row._count._all]));
  }

  /**
   * Points earned per class, and how many students earned them.
   *
   * Grouped by membership as well as class because Prisma has no
   * count-distinct in `groupBy`: the distinct earners are the row count. It is
   * also what makes `earningStudents` honest — one child earning forty and
   * fourteen earning nothing must not read like fourteen earning three each.
   *
   * `_sum.amount` is **what was actually paid**, never a figure derived from
   * the rate table: the daily cap truncates an award, and a derived total would
   * disagree with the ledger on exactly the days a class worked hardest.
   * `voidedAt: null` because a manager's void excludes a row from every sum,
   * and a console figure that counted voided awards would be the one place on
   * the platform where a correction did not take.
   */
  private async awards(
    academies: AcademyClock[],
    classIds: string[],
    period: ResolvedListPlatformRankingInput["period"],
  ): Promise<Map<string, { points: number; earningStudents: number }>> {
    const totals = new Map<string, { points: number; earningStudents: number }>();
    if (classIds.length === 0) return totals;

    const rows = await this.prisma.pointAward.groupBy({
      by: ["classId", "membershipId"],
      where: {
        voidedAt: null,
        classId: { in: classIds },
        OR: periodClauses(academies, period),
      },
      _sum: { amount: true },
    });

    for (const row of rows) {
      if (!row.classId) continue;
      const entry = totals.get(row.classId) ?? {
        points: 0,
        earningStudents: 0,
      };
      const amount = row._sum.amount ?? 0;
      entry.points += amount;
      if (amount > 0) entry.earningStudents += 1;
      totals.set(row.classId, entry);
    }
    return totals;
  }

  /**
   * First solves per class.
   *
   * A separate grouped query rather than a third `by` column: adding `reason`
   * would multiply the result set by seven to read one column off it.
   */
  private async solves(
    academies: AcademyClock[],
    classIds: string[],
    period: ResolvedListPlatformRankingInput["period"],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (classIds.length === 0) return counts;

    const rows = await this.prisma.pointAward.groupBy({
      by: ["classId"],
      where: {
        voidedAt: null,
        classId: { in: classIds },
        reason: "EXERCISE_SOLVED",
        OR: periodClauses(academies, period),
      },
      _count: { _all: true },
    });

    for (const row of rows) {
      if (row.classId) counts.set(row.classId, row._count._all);
    }
    return counts;
  }

  /** Which points features each academy has switched on. */
  private async enabledFlags(
    academyIds: string[],
  ): Promise<Map<string, Set<string>>> {
    const rows = await this.prisma.academyFeatureFlag.findMany({
      where: {
        academyId: { in: academyIds },
        feature: { in: ["STUDENT_POINTS", "STUDENT_CLASS_LEADERBOARD"] },
        isEnabled: true,
      },
      select: { academyId: true, feature: true },
    });

    const flags = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = flags.get(row.academyId) ?? new Set<string>();
      set.add(row.feature);
      flags.set(row.academyId, set);
    }
    return flags;
  }

  /** Every academy, for the facet — the same list the other console lists
   *  offer, so the surfaces filter by the same names. */
  private academyOptions() {
    return this.prisma.academy.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  private emptyResult(
    input: ResolvedListPlatformRankingInput,
    academyOptions: { id: string; name: string; slug: string }[],
    academies = 0,
  ): ListPlatformRankingResult {
    return {
      rows: [],
      total: 0,
      page: input.page,
      pageSize: input.pageSize,
      truncated: false,
      summary: {
        academies,
        classes: 0,
        earningClasses: 0,
        students: 0,
        earningStudents: 0,
        points: 0,
        pointsOffClasses: 0,
      },
      academyOptions,
    };
  }
}

type AcademyClock = { id: string; timeZone: string };

function teacherNameOf(
  teacher: {
    user: { displayName: string | null };
    memberProfile: { academyDisplayName: string | null } | null;
  } | null,
): string | null {
  if (!teacher) return null;
  return (
    teacher.memberProfile?.academyDisplayName?.trim() ||
    teacher.user.displayName?.trim() ||
    null
  );
}

/**
 * One `where` clause per distinct clock.
 *
 * A period is academy-local: `resolvePointsPeriod` builds "today" from the
 * academy's own timezone so an evening class is never split across two dates.
 * The console reads every academy at once, and a single platform-wide window
 * would produce a table that disagrees with the board an operator opens from
 * it — the row says 412 and the board adds to 390, both looking authoritative.
 *
 * The cost is bounded by *distinct timezones*, not by academies. Cove's
 * academies are overwhelmingly `Asia/Seoul`, so this is one clause in practice
 * and correct in principle.
 */
function periodClauses(
  academies: AcademyClock[],
  kind: ResolvedListPlatformRankingInput["period"],
): { academyId: { in: string[] }; createdAt: { gte: Date; lt: Date } }[] {
  const now = new Date();
  const byZone = new Map<string, string[]>();
  for (const academy of academies) {
    byZone.set(academy.timeZone, [
      ...(byZone.get(academy.timeZone) ?? []),
      academy.id,
    ]);
  }

  return [...byZone].map(([timeZone, academyIds]) => {
    const period: PointsPeriod = resolvePointsPeriod(kind, now, timeZone);
    return {
      academyId: { in: academyIds },
      createdAt: { gte: period.startsAt, lt: period.endsAt },
    };
  });
}

/**
 * The complete set, ordered.
 *
 * Every comparator ends on `classId` ascending. Without a unique tiebreak a
 * page boundary is undefined for rows that tie — and on a daily period most
 * rows tie at zero — so an operator paging through them would see one row
 * twice and another never.
 *
 * A `points_off` row has no measurement, so it sorts *below* zero on the two
 * keys that measure earning, in both directions. Ascending, it would otherwise
 * float to the top and read as "worst", which is the opposite of what it means.
 */
export function sortRows(
  rows: PlatformRankedClass[],
  sort: ResolvedListPlatformRankingInput["sort"],
  direction: ResolvedListPlatformRankingInput["direction"],
): PlatformRankedClass[] {
  const sign = direction === "asc" ? 1 : -1;
  const measured = (row: PlatformRankedClass, value: number | null) =>
    row.state === "points_off" || value === null ? -1 : value;

  return [...rows].sort((a, b) => {
    let compared = 0;
    switch (sort) {
      case "points":
        compared = measured(a, a.points) - measured(b, b.points);
        break;
      case "earning":
        compared =
          measured(a, a.earningStudents) - measured(b, b.earningStudents);
        break;
      case "students":
        compared = a.students - b.students;
        break;
      case "class":
        compared = a.name.localeCompare(b.name);
        break;
      case "academy":
        compared =
          a.academyName.localeCompare(b.academyName) ||
          a.name.localeCompare(b.name);
        break;
    }
    return compared * sign || a.classId.localeCompare(b.classId);
  });
}

/** The strip above the table, folded from the rows it describes. */
export function summarize(
  rows: PlatformRankedClass[],
  academies: number,
): ListPlatformRankingResult["summary"] {
  return {
    academies,
    classes: rows.length,
    earningClasses: rows.filter((row) => row.earningStudents > 0).length,
    students: rows.reduce((sum, row) => sum + row.students, 0),
    earningStudents: rows.reduce((sum, row) => sum + row.earningStudents, 0),
    points: rows.reduce((sum, row) => sum + (row.points ?? 0), 0),
    pointsOffClasses: rows.filter((row) => row.state === "points_off").length,
  };
}
