import { Injectable, Logger } from "@nestjs/common";
import {
  DEFAULT_POINTS_PERIOD,
  MIN_STUDENTS_FOR_COMPARISON,
  OVERVIEW_RANKING_MAX_ROWS,
  POINTS_LEDGER_PAGE_SIZE,
  learningTiers,
  parsePointsPeriodKind,
  rankEntries,
  rankGap,
  resolvePointsPeriod,
  type ClassPointsBoard,
  type ClassPointsBoardInput,
  type Leaderboard,
  type OverviewPointsBoard,
  type OverviewPointsBoardInput,
  type PointsLedgerInput,
  type PointsLedgerPage,
  type PointsPage,
  type PointsPageInput,
  type PointsPeriod,
  type PointRules,
  type StaffLeaderboard,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  LeaderboardRepository,
  emptyBreakdown,
} from "./leaderboard.repository.js";
import { PointAwardService } from "./point-award.service.js";
import { PointsAccessService, type PointsScope } from "./points-access.service.js";

/**
 * The points page, in one bounded read.
 *
 * The plate, the board, the rules, and the first ledger page come back
 * together, so a page load is one round trip and every number on screen
 * describes the same instant.
 *
 * Read-only. There is no method here that writes a `PointAward` — every point
 * is written by `PointAwardService` from inside the transaction that recorded
 * the fact it describes, and no request can produce one. §5.2.
 */
@Injectable()
export class PointsService {
  private readonly logger = new Logger(PointsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PointsAccessService,
    private readonly awards: PointAwardService,
    private readonly leaderboard: LeaderboardRepository,
  ) {}

  async getPage(
    identity: SupabaseIdentity,
    input: PointsPageInput,
  ): Promise<PointsPage> {
    const scope = await this.access.resolve(identity, input);
    const now = new Date();
    const period = resolvePointsPeriod(
      parsePointsPeriodKind(input.period ?? DEFAULT_POINTS_PERIOD),
      now,
      scope.timeZone,
    );

    // The plate is not allowed to degrade. §12.3 — the board and the ledger
    // fail independently below, but a student's own total silently reading
    // zero would be a lie about their work, so this one is left to throw and
    // take the page with it.
    const selectedClass =
      scope.classes.find((entry) => entry.classId === input.classId) ??
      scope.classes[0];
    const standing = selectedClass
      ? await this.leaderboard.standingFor(
          scope.academyId,
          selectedClass.classId,
          scope.membershipId,
          period,
        )
      : { points: 0, solvedProblems: 0, activeDays: 0 };

    const [board, ledger] = await Promise.all([
      scope.leaderboardEnabled
        ? this.buildLeaderboard(scope, period, selectedClass?.classId ?? null).catch(
            (error: unknown) => {
              this.logger.warn(
                `class board for ${scope.academyId} failed: ${reason(error)}`,
              );
              return unavailableBoard(
                scope.classes,
                selectedClass?.classId ?? null,
              );
            },
          )
        : Promise.resolve(null),
      this.listLedger(identity, {
        academyId: scope.academyId,
        ...(input.membershipId ? { membershipId: input.membershipId } : {}),
        ...(selectedClass ? { classId: selectedClass.classId } : {}),
      }).catch((error: unknown) => {
        this.logger.warn(
          `ledger for ${scope.membershipId} failed: ${reason(error)}`,
        );
        return null;
      }),
    ]);

    const mine =
      board?.eligible === true
        ? board.rows.find((row) => row.isYou)
        : undefined;

    return {
      academyId: scope.academyId,
      subjectName: scope.subjectName,
      period: viewPeriod(period),
      standing: {
        ...standing,
        position: mine?.position ?? null,
        participants: board?.eligible === true ? board.participants : null,
        gap: board?.eligible === true ? board.gap : { kind: "alone" },
      },
      leaderboard: board ? stripGap(board) : null,
      rules: await this.rulesFor(scope.academyId),
      ledger,
    };
  }

  /**
   * One class's board, for the staff who teach or run it. §5.1.
   *
   * The same `buildLeaderboard` a student's page calls, on a scope resolved
   * from the class instead of from an enrolment. One query, one ordering, one
   * set of numbers: a teacher and a student comparing screens must never see
   * two different third places, and the only way to guarantee that is to have
   * one implementation.
   */
  async getClassBoard(
    identity: SupabaseIdentity,
    input: ClassPointsBoardInput,
  ): Promise<ClassPointsBoard> {
    const scope = await this.access.resolveClassBoard(identity, input);
    const period = resolvePointsPeriod(
      parsePointsPeriodKind(input.period ?? DEFAULT_POINTS_PERIOD),
      new Date(),
      scope.timeZone,
    );

    const board = scope.leaderboardEnabled
      ? await this.buildLeaderboard(scope, period, input.classId ?? null).catch(
          (error: unknown) => {
            this.logger.warn(
              `class board for ${input.classId ?? "first"} failed: ${reason(error)}`,
            );
            return unavailableBoard(scope.classes, input.classId ?? null);
          },
        )
      : // The academy runs points without the named board. A staff reader gets
        // the same answer a student would rather than a list their students
        // are not allowed to see.
        unavailableBoard(scope.classes, input.classId ?? null);

    const { gap: _gap, ...leaderboard } = board;
    return {
      period: viewPeriod(period),
      className: scope.className,
      leaderboard,
    };
  }

  /**
   * Today's first five rows, for every role overview.
   *
   * The complete board is built once, through the same path as the points
   * pages, before it is trimmed. That preserves ties, eligibility, `isYou`,
   * and the student's own row without introducing a second ranking algorithm.
   */
  async getOverviewBoard(
    identity: SupabaseIdentity,
    input: OverviewPointsBoardInput,
  ): Promise<OverviewPointsBoard> {
    const scope = await this.access.resolveOverviewBoard(identity, input);
    const period = resolvePointsPeriod(
      DEFAULT_POINTS_PERIOD,
      new Date(),
      scope.timeZone,
    );

    const board = await this.buildLeaderboard(
      scope,
      period,
      input.classId ?? null,
    ).catch((error: unknown) => {
      this.logger.warn(
        `overview board for ${input.classId ?? "first"} failed: ${reason(error)}`,
      );
      return unavailableBoard(scope.classes, input.classId ?? null);
    });
    const safe = stripGap(board);

    if (safe.eligible === false) {
      return { period: viewPeriod(period), leaderboard: safe };
    }

    const rows = safe.rows.slice(0, OVERVIEW_RANKING_MAX_ROWS);
    const viewer = scope.isSelf
      ? safe.rows
          .slice(OVERVIEW_RANKING_MAX_ROWS)
          .find((row) => row.isYou) ?? null
      : null;

    return {
      period: viewPeriod(period),
      leaderboard: { ...safe, rows, viewer },
    };
  }

  /**
   * One class board.
   *
   * The floor is checked before the rows are built, not after: below it there
   * is nothing to render and nothing worth computing. §10.4 — a position out
   * of two is not information, and the first thing a child learns from this
   * product must not be that they are last.
   */
  private async buildLeaderboard(
    scope: PointsScope,
    period: PointsPeriod,
    requestedClassId: string | null,
  ): Promise<StaffLeaderboard & { gap: ReturnType<typeof rankGap> }> {
    const classes = scope.classes;
    if (classes.length === 0) {
      return {
        eligible: false,
        reason: "NOT_ENROLLED",
        classes: [],
        classId: null,
        gap: { kind: "alone" },
      };
    }

    const selected =
      classes.find((entry) => entry.classId === requestedClassId) ?? classes[0];

    const members = await this.leaderboard.roster(selected.classId);
    const membershipIds = members.map((member) => member.membershipId);
    const totals = await this.leaderboard.withLearningMinutes(
      await this.leaderboard.totals(
        scope.academyId,
        selected.classId,
        membershipIds,
        period,
      ),
      selected.classId,
      membershipIds,
      period,
    );
    const days = await this.leaderboard.activeDays(
      selected.classId,
      membershipIds,
      period,
    );

    const active = members.filter((member) => {
      const total = totals.get(member.membershipId);
      return (total?.points ?? 0) > 0 || (days.get(member.membershipId) ?? 0) > 0;
    });

    if (members.length < MIN_STUDENTS_FOR_COMPARISON) {
      return {
        eligible: false,
        reason: "TOO_FEW_STUDENTS",
        classes,
        classId: selected.classId,
        gap: { kind: "alone" },
      };
    }
    if (active.length < MIN_STUDENTS_FOR_COMPARISON) {
      // The board is quiet, not broken. On the daily view this is reached and
      // crossed every morning, which is exactly what it is for.
      return {
        eligible: false,
        reason: "NO_ACTIVITY_YET",
        classes,
        classId: selected.classId,
        gap: { kind: "alone" },
      };
    }

    const ranked = rankEntries(
      members.map((member) => ({
        membershipId: member.membershipId,
        displayName: member.displayName,
        avatar: member.avatar,
        points: totals.get(member.membershipId)?.points ?? 0,
        solvedProblems: totals.get(member.membershipId)?.solvedProblems ?? 0,
        activeDays: days.get(member.membershipId) ?? 0,
        breakdown:
          totals.get(member.membershipId)?.breakdown ?? emptyBreakdown(),
      })),
    );

    // §21 — the rising marker compares against the previous period, which on
    // 오늘 means yesterday. For a student whose class met yesterday and not
    // today, that comparison is noise dressed as a result, so the daily board
    // does not draw one.
    const improved =
      period.kind === "day"
        ? new Set<string>()
        : await this.leaderboard.improvedSince(
            scope.academyId,
            selected.classId,
            members,
            period,
            new Map(ranked.map((row) => [row.membershipId, row.position])),
          );

    return {
      eligible: true,
      classId: selected.classId,
      className: selected.name,
      classes,
      participants: ranked.length,
      rows: ranked.map((row) => ({
        membershipId: row.membershipId,
        position: row.position,
        displayName: row.displayName,
        avatar: row.avatar,
        points: row.points,
        solvedProblems: row.solvedProblems,
        activeDays: row.activeDays,
        breakdown: row.breakdown,
        improved: improved.has(row.membershipId),
        isYou: row.membershipId === scope.membershipId,
      })),
      gap: rankGap(ranked, scope.membershipId),
    };
  }

  /** What each action pays, read from the academy's own policy. */
  private async rulesFor(academyId: string): Promise<PointRules> {
    const policy = await this.awards.policyFor(this.prisma, academyId);
    return {
      solve: {
        easy: policy.solveEasy,
        medium: policy.solveMedium,
        hard: policy.solveHard,
      },
      lectureCompleted: policy.lectureCompleted,
      moduleCompleted: policy.moduleCompleted,
      courseCompleted: policy.courseCompleted,
      attendance: policy.attendance,
      attendanceLate: policy.attendanceLate,
      learningTiers: learningTiers(policy).map((tier) => ({
        minutes: tier.minutes,
        points: tier.points,
      })),
      dailyCap: policy.studentDailyCap,
    };
  }

  /**
   * One student's ledger, newest first.
   *
   * Cursor paging on `createdAt` and `id` together, matching the index — an
   * offset would skip or repeat rows whenever an award landed mid-scroll,
   * which on this page happens while the student is reading.
   *
   * Voided rows are returned rather than hidden. A correction the student
   * cannot see is a correction they cannot question.
   */
  async listLedger(
    identity: SupabaseIdentity,
    input: PointsLedgerInput,
  ): Promise<PointsLedgerPage> {
    const scope = await this.access.resolve(identity, input);
    const pageSize = input.pageSize ?? POINTS_LEDGER_PAGE_SIZE;
    const page = Math.max(1, input.page ?? 1);
    const selectedClass =
      scope.classes.find((entry) => entry.classId === input.classId) ??
      scope.classes[0];
    if (!selectedClass) {
      return { page, pageSize, totalRows: 0, rows: [] };
    }
    const where = {
      membershipId: scope.membershipId,
      classId: selectedClass.classId,
    };

    // `id` breaks the tie on `createdAt`, which is what makes offset paging
    // safe here: two awards written in the same transaction share a timestamp
    // to the millisecond, and an unstable order would show the same row on two
    // pages and drop another entirely.
    const [rows, totalRows] = await Promise.all([
      this.prisma.pointAward.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pointAward.count({ where }),
    ]);

    return {
      page,
      pageSize,
      totalRows,
      rows: rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        amount: row.amount,
        subjectLabel: row.subjectLabel,
        difficulty: row.difficulty,
        localDate: row.localDate
          ? row.localDate.toISOString().slice(0, 10)
          : null,
        createdAt: row.createdAt.toISOString(),
        capped: row.cappedAt !== null,
        voided: row.voidedAt !== null,
        voidReason: row.voidReason,
        materialId: row.materialId,
        courseId: row.courseId,
      })),
    };
  }
}
/**
 * The board could not be read.
 *
 * A reason rather than a `null`, because `null` already means "this academy
 * does not run a leaderboard" and a section that says nothing is how a student
 * concludes their class has no ranking. §12.3.
 */
function unavailableBoard(
  classes: { classId: string; name: string }[],
  requestedClassId: string | null = null,
) {
  const selected =
    classes.find((entry) => entry.classId === requestedClassId) ?? classes[0];
  return {
    eligible: false as const,
    reason: "UNAVAILABLE" as const,
    classes,
    classId: selected?.classId ?? null,
    gap: { kind: "alone" as const },
  };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function viewPeriod(period: PointsPeriod) {
  return {
    kind: period.kind,
    timeZone: period.timeZone,
    startDate: period.startDate,
    endDate: period.endDate,
    startsAt: period.startsAt.toISOString(),
    endsAt: period.endsAt.toISOString(),
  };
}

/** The gap belongs on the plate, not on the board. */
function stripGap(
  board: StaffLeaderboard & { gap?: ReturnType<typeof rankGap> },
): Leaderboard {
  const { gap: _gap, ...rest } = board;
  if (rest.eligible === false) return rest;
  return {
    ...rest,
    // The one field that does not cross to a student. §10.1 — a child holding
    // every classmate's membership id is a fact about their classmates that
    // has nothing to do with a ranking, and the only way that stays true is
    // for the student's shape to be produced by removing it here rather than
    // by every caller remembering not to add it.
    rows: rest.rows.map(({ membershipId: _id, ...row }) => row),
  };
}
