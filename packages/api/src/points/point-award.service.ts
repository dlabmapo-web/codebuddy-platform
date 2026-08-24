import { Injectable } from "@nestjs/common";
import {
  DEFAULT_POINT_POLICY,
  academyLocalDate,
  applyDailyCap,
  learningTiersReached,
  pointsForSolve,
  type PointPolicy,
} from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, PointReason } from "../generated/prisma/client.js";

/**
 * The only writer of `PointAward`.
 *
 * Two properties hold the whole design together, and both are enforced by the
 * database rather than by a service anybody has to remember to call.
 *
 * **Idempotency is the unique index on `dedupeKey`.** Every method here
 * inserts with `skipDuplicates`. There is no read-then-write, no advisory
 * lock, and no "have I already paid this" query — a retried judge callback or
 * a replayed activity flush collides and adds nothing. It cannot be a caught
 * unique violation: these run inside the caller's transaction, and a failed
 * statement aborts a Postgres transaction whether or not anybody catches it.
 *
 * The keys deliberately contain no grading revision, no difficulty, no point
 * value, and no timestamp finer than a day, because every one of those would
 * let the same fact pay twice after an ordinary curriculum edit. §9.3 of the
 * student points design.
 *
 * **Nothing here can subtract.** `amount` is positive by check constraint and
 * no method accepts a negative one. §7.6.
 *
 * Every method takes the caller's transaction. An award is never a second
 * round-trip that could fail after the fact it describes has already been
 * committed: if the solve is recorded, the points are recorded.
 */

/** The Prisma client inside a caller's transaction. */
export type PointsTx = Prisma.TransactionClient;

type AwardInput = {
  academyId: string;
  membershipId: string;
  reason: PointReason;
  amount: number;
  dedupeKey: string;
  subjectLabel: string;
  timeZone: string;
  now: Date;
  materialId?: string | null;
  lectureId?: string | null;
  moduleId?: string | null;
  courseId?: string | null;
  classId: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
};

@Injectable()
export class PointAwardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether this academy has a point economy at all.
   *
   * Read before any award runs, so a disabled academy costs one indexed lookup
   * and writes nothing — its `point_awards` table stays empty rather than
   * accumulating rows nobody will ever see.
   */
  async enabled(tx: PointsTx, academyId: string): Promise<boolean> {
    const flag = await tx.academyFeatureFlag.findUnique({
      where: { academyId_feature: { academyId, feature: "STUDENT_POINTS" } },
      select: { isEnabled: true },
    });
    return flag?.isEnabled === true;
  }

  /** An academy's economy, or the shared defaults when it has never set one. */
  async policyFor(tx: PointsTx, academyId: string): Promise<PointPolicy> {
    const row = await tx.academyPointPolicy.findUnique({ where: { academyId } });
    if (!row) return DEFAULT_POINT_POLICY;
    return {
      solveEasy: row.solveEasy,
      solveMedium: row.solveMedium,
      solveHard: row.solveHard,
      lectureCompleted: row.lectureCompleted,
      moduleCompleted: row.moduleCompleted,
      courseCompleted: row.courseCompleted,
      attendance: row.attendance,
      attendanceLate: row.attendanceLate,
      attendanceMinMinutes: row.attendanceMinMinutes,
      attendanceGraceMinutes: row.attendanceGraceMinutes,
      learningTimeTier1Minutes: row.learningTimeTier1Minutes,
      learningTimeTier1Points: row.learningTimeTier1Points,
      learningTimeTier2Minutes: row.learningTimeTier2Minutes,
      learningTimeTier2Points: row.learningTimeTier2Points,
      learningTimeTier3Minutes: row.learningTimeTier3Minutes,
      learningTimeTier3Points: row.learningTimeTier3Points,
      studentDailyCap: row.studentDailyCap,
    };
  }

  /**
   * Writes one award, trimmed to what the day has left.
   *
   * A capped award is truncated rather than skipped so the ledger still prints
   * the line, marked, and a student can see why their number stopped moving.
   * An award trimmed to zero is not written at all — the check constraint
   * forbids it, and a 0P line teaches nothing.
   */
  private async write(
    tx: PointsTx,
    input: AwardInput,
    policy: PointPolicy,
  ): Promise<boolean> {
    const localDate = academyLocalDate(input.now, input.timeZone);

    const earnedToday = await tx.pointAward.aggregate({
      where: {
        membershipId: input.membershipId,
        classId: input.classId,
        localDate: new Date(`${localDate}T00:00:00.000Z`),
        voidedAt: null,
      },
      _sum: { amount: true },
    });

    const { amount, capped } = applyDailyCap(
      input.amount,
      earnedToday._sum.amount ?? 0,
      policy,
    );
    if (amount <= 0) return false;

    // `skipDuplicates` rather than a caught unique violation, and the
    // difference is load-bearing. Every caller here is inside an interactive
    // transaction, and Postgres aborts the whole transaction on a failed
    // statement — Prisma takes no savepoint per query, so catching P2002 would
    // leave the grading transaction unusable and roll the student's solve back
    // with it. `LearningActivityFlush` writes its receipt the same way, for the
    // same reason. §9.3.
    const written = await tx.pointAward.createMany({
      data: [
        {
          academyId: input.academyId,
          membershipId: input.membershipId,
          reason: input.reason,
          amount,
          dedupeKey: input.dedupeKey,
          subjectLabel: input.subjectLabel,
          localDate: new Date(`${localDate}T00:00:00.000Z`),
          materialId: input.materialId ?? null,
          lectureId: input.lectureId ?? null,
          moduleId: input.moduleId ?? null,
          courseId: input.courseId ?? null,
          classId: input.classId,
          difficulty: input.difficulty ?? null,
          cappedAt: capped ? input.now : null,
        },
      ],
      skipDuplicates: true,
    });
    // The key already exists: this fact has been paid for. Not an error, and
    // the balance must not move for a row that was not written.
    if (written.count === 0) return false;

    await tx.studentPointBalance.upsert({
      where: { membershipId: input.membershipId },
      create: {
        membershipId: input.membershipId,
        academyId: input.academyId,
        earnedTotal: amount,
      },
      update: { earnedTotal: { increment: amount } },
    });

    return true;
  }

  /**
   * A first solve, and whatever it completed.
   *
   * Called from the grading transaction's `solvedNow` branch — the only branch
   * that can complete anything, which is why the cascade below lives here and
   * runs nowhere else.
   */
  async awardSolve(
    tx: PointsTx,
    input: {
      userId: string;
      materialId: string;
      courseId: string;
      classId: string;
      now: Date;
    },
  ): Promise<void> {
    const material = await tx.material.findUnique({
      where: { id: input.materialId },
      select: {
        id: true,
        title: true,
        isVisible: true,
        programmingExercise: { select: { difficulty: true } },
        lecture: {
          select: {
            id: true,
            title: true,
            isVisible: true,
            courseModule: {
              select: {
                id: true,
                title: true,
                isVisible: true,
                course: {
                  select: {
                    id: true,
                    title: true,
                    academyId: true,
                    academy: { select: { timeZone: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // A hidden exercise pays nothing. Awarding for work an academy has taken
    // out of its curriculum would let a point survive the decision to hide it.
    if (
      !material?.programmingExercise ||
      !material.isVisible ||
      !material.lecture.isVisible ||
      !material.lecture.courseModule.isVisible
    ) {
      return;
    }

    const course = material.lecture.courseModule.course;
    const academyId = course.academyId;
    if (!(await this.enabled(tx, academyId))) return;

    const membership = await tx.academyMembership.findFirst({
      where: {
        academyId,
        userId: input.userId,
        role: "STUDENT",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!membership) return;

    const policy = await this.policyFor(tx, academyId);
    const timeZone = course.academy.timeZone;
    const common = {
      academyId,
      membershipId: membership.id,
      timeZone,
      now: input.now,
      courseId: course.id,
      classId: input.classId,
    };
    const difficulty = material.programmingExercise.difficulty;

    await this.write(
      tx,
      {
        ...common,
        reason: "EXERCISE_SOLVED",
        amount: pointsForSolve(difficulty, policy),
        dedupeKey: `${membership.id}:${material.id}:SOLVE`,
        subjectLabel: material.title,
        materialId: material.id,
        lectureId: material.lecture.id,
        moduleId: material.lecture.courseModule.id,
        difficulty,
      },
      policy,
    );

    await this.awardCompletions(tx, {
      ...common,
      userId: input.userId,
      lecture: material.lecture,
      policy,
    });
  }

  /**
   * Lecture, then module, then course — each checked only if the level below
   * it just completed.
   *
   * In the common case this is one bounded count. The full cascade runs at
   * most once per lecture per student, ever, because the dedupe key stops the
   * award and this method stops climbing when a level is incomplete.
   *
   * A completion is awarded **once, ever**. A team lead who adds a sixth
   * problem to a finished five-problem lecture does not un-complete it and
   * cannot make it pay again: the key carries no material count. §7.4.
   */
  private async awardCompletions(
    tx: PointsTx,
    input: {
      academyId: string;
      membershipId: string;
      userId: string;
      courseId: string;
      classId: string;
      timeZone: string;
      now: Date;
      policy: PointPolicy;
      lecture: {
        id: string;
        title: string;
        courseModule: {
          id: string;
          title: string;
          course: { id: string; title: string };
        };
      };
    },
  ): Promise<void> {
    const { lecture } = input;
    const module_ = lecture.courseModule;
    const common = {
      academyId: input.academyId,
      membershipId: input.membershipId,
      timeZone: input.timeZone,
      now: input.now,
      courseId: input.courseId,
      classId: input.classId,
    };

    if (!(await this.allSolved(tx, input.userId, { lectureId: lecture.id }))) {
      return;
    }
    await this.write(
      tx,
      {
        ...common,
        reason: "LECTURE_COMPLETED",
        amount: input.policy.lectureCompleted,
        dedupeKey: `${input.membershipId}:${lecture.id}:LECTURE`,
        subjectLabel: lecture.title,
        lectureId: lecture.id,
        moduleId: module_.id,
      },
      input.policy,
    );

    if (!(await this.allSolved(tx, input.userId, { moduleId: module_.id }))) {
      return;
    }
    await this.write(
      tx,
      {
        ...common,
        reason: "MODULE_COMPLETED",
        amount: input.policy.moduleCompleted,
        dedupeKey: `${input.membershipId}:${module_.id}:MODULE`,
        subjectLabel: module_.title,
        moduleId: module_.id,
      },
      input.policy,
    );

    if (
      !(await this.allSolved(tx, input.userId, { courseId: module_.course.id }))
    ) {
      return;
    }
    await this.write(
      tx,
      {
        ...common,
        reason: "COURSE_COMPLETED",
        amount: input.policy.courseCompleted,
        dedupeKey: `${input.membershipId}:${module_.course.id}:COURSE`,
        subjectLabel: module_.course.title,
      },
      input.policy,
    );
  }

  /**
   * Whether a student has solved every visible exercise in one scope.
   *
   * Visibility is checked at all three levels. A raw count of `Material` rows
   * would pay a student for solving problems their academy cannot see, and
   * would make a scope "complete" the moment a team lead hid the last unsolved
   * problem in it.
   *
   * An empty scope is never complete: a lecture with no visible exercises has
   * not been finished by anybody.
   */
  private async allSolved(
    tx: PointsTx,
    userId: string,
    scope: { lectureId?: string; moduleId?: string; courseId?: string },
  ): Promise<boolean> {
    const where = {
      type: "PROGRAMMING_EXERCISE" as const,
      isVisible: true,
      lecture: {
        isVisible: true,
        ...(scope.lectureId ? { id: scope.lectureId } : {}),
        courseModule: {
          isVisible: true,
          ...(scope.moduleId ? { id: scope.moduleId } : {}),
          ...(scope.courseId ? { courseId: scope.courseId } : {}),
        },
      },
    };

    const visible = await tx.material.findMany({ where, select: { id: true } });
    if (visible.length === 0) return false;

    const solved = await tx.studentExerciseProgress.count({
      where: {
        userId,
        status: "SOLVED",
        materialId: { in: visible.map((material) => material.id) },
      },
    });
    return solved >= visible.length;
  }

  /**
   * The daily learning-time ladder.
   *
   * Called from the activity flush with the student's whole counted day, summed
   * across courses. Every reached rung is written; the unique key means a
   * replayed flush pays none of them again and a flush that jumps two rungs at
   * once pays both.
   */
  async awardLearningTime(
    tx: PointsTx,
    input: {
      academyId: string;
      membershipId: string;
      classId: string;
      totalMinutes: number;
      timeZone: string;
      localDate: string;
      now: Date;
    },
  ): Promise<void> {
    if (!(await this.enabled(tx, input.academyId))) return;
    const policy = await this.policyFor(tx, input.academyId);

    for (const tier of learningTiersReached(input.totalMinutes, policy)) {
      await this.write(
        tx,
        {
          academyId: input.academyId,
          membershipId: input.membershipId,
          classId: input.classId,
          reason: "LEARNING_TIME",
          amount: tier.points,
          dedupeKey: `${input.membershipId}:${input.classId}:${input.localDate}:TIME:${tier.tier}`,
          subjectLabel: String(tier.minutes),
          timeZone: input.timeZone,
          now: input.now,
        },
        policy,
      );
    }
  }

  /**
   * Turning up, proved by working.
   *
   * Not a login and not an open socket. The accumulator's own rule is that it
   * never accepts a duration from a client, and a presence key only says a
   * socket is open — a student who opened a tab at four and left would collect
   * the points under either. Ten counted minutes inside the window cannot be
   * collected by anyone who was not there. §8.2.
   *
   * There is no absent row. A missing award already answers "did this child
   * come on Tuesday", and persisting absence would make a discipline record
   * about a minor out of a rewards feature. §8.4.
   */
  async awardAttendance(
    tx: PointsTx,
    input: {
      academyId: string;
      membershipId: string;
      classId: string;
      courseId: string;
      timeZone: string;
      localDate: string;
      /** Minutes from academy-local midnight of the first counted interval. */
      firstActiveMinute: number;
      /** Counted minutes inside the class window so far today. */
      minutesInWindow: number;
      now: Date;
    },
  ): Promise<void> {
    if (!(await this.enabled(tx, input.academyId))) return;
    const policy = await this.policyFor(tx, input.academyId);
    if (input.minutesInWindow < policy.attendanceMinMinutes) return;

    const weekday = isoWeekdayOf(input.localDate);
    const slots = await tx.classScheduleSlot.findMany({
      where: {
        weekday,
        class: {
          id: input.classId,
          academyId: input.academyId,
          status: "ACTIVE",
          enrollments: { some: { membershipId: input.membershipId } },
          courseAssignments: { some: { courseId: input.courseId } },
        },
        OR: [
          { effectiveFrom: null },
          { effectiveFrom: { lte: new Date(`${input.localDate}T00:00:00.000Z`) } },
        ],
        AND: [
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: new Date(`${input.localDate}T00:00:00.000Z`) } },
            ],
          },
        ],
      },
      select: {
        classId: true,
        startMinute: true,
        endMinute: true,
        class: { select: { name: true } },
      },
    });

    for (const slot of slots) {
      if (
        input.firstActiveMinute < slot.startMinute ||
        input.firstActiveMinute >= slot.endMinute
      ) {
        continue;
      }

      const late =
        input.firstActiveMinute > slot.startMinute + policy.attendanceGraceMinutes;

      await this.write(
        tx,
        {
          academyId: input.academyId,
          membershipId: input.membershipId,
          reason: late ? "ATTENDANCE_LATE" : "ATTENDANCE",
          amount: late ? policy.attendanceLate : policy.attendance,
          // One key for both outcomes: a student is present once, however they
          // arrived, and a late award must never be topped up by an on-time one.
          dedupeKey: `${input.membershipId}:${slot.classId}:${input.localDate}:ATTENDANCE`,
          subjectLabel: slot.class.name,
          classId: input.classId,
          courseId: input.courseId,
          timeZone: input.timeZone,
          now: input.now,
        },
        policy,
      );
    }
  }
}

/** ISO weekday, 1 = Monday … 7 = Sunday, from a `YYYY-MM-DD` label. */
function isoWeekdayOf(localDate: string): number {
  const [year, month, day] = localDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}
