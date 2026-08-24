import {
  DEFAULT_POINT_POLICY,
  academyDayStart,
  academyLocalDate,
  addLocalDays,
} from "@cove/shared";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { PointAwardCreateManyInput } from "../../src/generated/prisma/models/PointAward.js";
import type { StudentCourseLearningDayCreateManyInput } from "../../src/generated/prisma/models/StudentCourseLearningDay.js";
import type { StudentClassCourseLearningDayCreateManyInput } from "../../src/generated/prisma/models/StudentClassCourseLearningDay.js";

/**
 * The points economy, switched on for one academy.
 *
 * Both flags are per-academy opt-ins that default off, so without this fixture
 * a development academy has no points page, no nav link, and an empty
 * `point_awards` table — which is correct behaviour and a confusing thing to
 * meet by hand. Nothing here awards a point: the seed opens the economy and
 * the server pays into it from the transactions that observe the facts.
 *
 * The schedule slot is what makes attendance reachable at all. A class with no
 * slots never pays `ATTENDANCE`, so a manual tester who wants to see that row
 * needs a window that covers the hours they are actually sitting at the
 * machine — hence a wide one, every weekday, rather than a realistic 학원
 * evening that would only pay after 16:00.
 */
export async function seedPointsFixture(
  prisma: PrismaClient,
  fixture: {
    academyId: string;
    /** The class whose board and attendance window are opened. */
    classId: string;
    /** Local minutes the attendance window spans. Defaults to 09:00–22:00. */
    startMinute?: number;
    endMinute?: number;
  },
): Promise<{ slots: number }> {
  for (const feature of ["STUDENT_POINTS", "STUDENT_CLASS_LEADERBOARD"] as const) {
    await prisma.academyFeatureFlag.upsert({
      where: {
        academyId_feature: { academyId: fixture.academyId, feature },
      },
      create: { academyId: fixture.academyId, feature, isEnabled: true },
      update: { isEnabled: true },
    });
  }

  const startMinute = fixture.startMinute ?? 9 * 60;
  const endMinute = fixture.endMinute ?? 22 * 60;

  // Replaced rather than appended: a second run of the seed must not leave the
  // class with two overlapping windows, which would be a configuration a
  // manager could never have typed.
  await prisma.classScheduleSlot.deleteMany({ where: { classId: fixture.classId } });
  const created = await prisma.classScheduleSlot.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      classId: fixture.classId,
      weekday,
      startMinute,
      endMinute,
    })),
  });

  return { slots: created.count };
}

/* ------------------------------------------------------- the class board */

/**
 * Classmates, and a month of their work, so the board has something to rank.
 *
 * A leaderboard is the one feature that cannot be inspected alone. The floor
 * in §10.4 hides it entirely below three active students, so a developer
 * signed in as the seeded student meets an empty state and never sees the
 * table, the metals, the `나` row, or the gap the season plate exists to
 * print. This fixture is what makes those reachable by hand.
 *
 * ## Three things it deliberately does not do
 *
 * **It never writes a point for a real account.** The signed-in student's
 * ledger stays exactly what they earned by solving, because a ledger that
 * claims work a child did not do is the one lie this feature cannot survive —
 * and a developer reading their own history has to be able to trust it.
 *
 * **It never creates a sign-in.** Classmates get a `User` row and a membership
 * and no `authUserId`, which is all a board row needs. Seeding credentials for
 * eighteen fictional children would be eighteen more accounts that can log in.
 *
 * **It is not random.** Every id, name, amount, and date is derived from an
 * index, so a rerun updates the same rows rather than stacking a second cohort
 * beside the first, and two developers comparing screens see the same board.
 *
 * Both classes a student belongs to are populated, each with its own cast and
 * class-scoped facts, so the selector switches both the comparison and every
 * number used to build it. Work from one class never appears in the other.
 */
export async function seedLeaderboardClassmates(
  prisma: PrismaClient,
  fixture: {
    academyId: string;
    /** The academy's zone, so a day boundary is the one students live in. */
    timeZone: string;
    /** Whose classes get filled. Their own ledger is never touched. */
    studentEmail: string;
    /** Who the enrolments are recorded as being made by. */
    createdByUserId: string;
    /** Local days of history to write. Enough to fill 오늘, 이번 주, 이번 달. */
    days?: number;
  },
): Promise<{ classes: { name: string; classmates: number; awards: number }[] }> {
  const student = await prisma.academyMembership.findFirst({
    where: {
      academyId: fixture.academyId,
      status: "ACTIVE",
      user: { email: fixture.studentEmail },
    },
    select: { id: true },
  });
  if (!student) {
    throw new Error(
      `Leaderboard fixture: ${fixture.studentEmail} is not an active member of ${fixture.academyId}`,
    );
  }

  const enrollments = await prisma.classEnrollment.findMany({
    where: { membershipId: student.id, class: { status: "ACTIVE" } },
    orderBy: { classId: "asc" },
    select: { classId: true, class: { select: { name: true } } },
  });

  const report: { name: string; classmates: number; awards: number }[] = [];
  let castOffset = 0;

  for (const [classIndex, enrollment] of enrollments.entries()) {
    const cast = classmateCast.slice(castOffset, castOffset + classmatesPerClass);
    castOffset += classmatesPerClass;

    const membershipIds: string[] = [];
    for (const [index, person] of cast.entries()) {
      const ordinal = classIndex * classmatesPerClass + index;
      membershipIds.push(
        await upsertClassmate(prisma, {
          academyId: fixture.academyId,
          classId: enrollment.classId,
          createdByUserId: fixture.createdByUserId,
          name: person,
          ordinal,
        }),
      );
    }

    // The counted-minutes projection is keyed by course, so the fixture needs
    // one the class actually assigns. A class with no course writes awards and
    // no minutes rather than inventing a course nobody can open.
    const assigned = await prisma.classCourse.findFirst({
      where: { classId: enrollment.classId },
      select: { courseId: true },
    });

    const awards = await seedClassmateAwards(prisma, {
      academyId: fixture.academyId,
      classId: enrollment.classId,
      ...(assigned ? { courseId: assigned.courseId } : { courseId: null }),
      days: fixture.days ?? 34,
      membershipIds,
      timeZone: fixture.timeZone,
    });

    report.push({
      name: enrollment.class.name,
      classmates: membershipIds.length,
      awards,
    });
  }

  return { classes: report };
}

/**
 * The cast, named the way a Korean 학원 roster is.
 *
 * Long enough for two classes of nine. The board prints
 * `AcademyMemberProfile.academyDisplayName`, which is what a manager sets and
 * what a classmate would actually recognise, so that is what the fixture
 * writes — the account's own `displayName` is only the fallback.
 */
const classmateCast = [
  "김민준", "이서연", "박지호", "최유진", "정하은", "강도윤", "조서준", "윤채원", "임건우",
  "한지우", "오예린", "신태양", "권나윤", "황시우", "안소율", "송민서", "배준호", "문가은",
] as const;

const classmatesPerClass = 9;

/**
 * One classmate, as the two rows a board needs and nothing more.
 *
 * No `authUserId` and no `email`: these accounts exist to be ranked, not to be
 * signed into. `status: ACTIVE` is required — §10.6 keeps suspended and
 * departed students off the board, so an INVITED classmate would seed a cohort
 * that never appears.
 */
async function upsertClassmate(
  prisma: PrismaClient,
  input: {
    academyId: string;
    classId: string;
    createdByUserId: string;
    name: string;
    ordinal: number;
  },
): Promise<string> {
  const userId = seedUuid("52", input.ordinal);
  const membershipId = seedUuid("53", input.ordinal);

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      displayName: input.name,
      preferredLocale: "ko",
      platformRole: "USER",
      status: "ACTIVE",
    },
    update: { displayName: input.name, status: "ACTIVE" },
  });

  await prisma.academyMembership.upsert({
    where: { id: membershipId },
    create: {
      id: membershipId,
      academyId: input.academyId,
      userId,
      role: "STUDENT",
      status: "ACTIVE",
      joinedAt: new Date("2026-07-23T00:00:00.000Z"),
    },
    update: { status: "ACTIVE" },
  });

  await prisma.academyMemberProfile.upsert({
    where: { membershipId },
    create: { membershipId, academyDisplayName: input.name },
    update: { academyDisplayName: input.name },
  });

  await prisma.classEnrollment.createMany({
    data: [
      {
        classId: input.classId,
        membershipId,
        enrolledByUserId: input.createdByUserId,
      },
    ],
    skipDuplicates: true,
  });

  return membershipId;
}

/**
 * A month of plausible work for one class, written straight into the ledger.
 *
 * The server normally pays these from inside the transaction that observed the
 * fact, and there is no API that grants one — §5.2, and it is the reason the
 * board can be trusted. A seed is the one writer outside that rule, so the
 * rows it writes are namespaced by their dedupe key (`seed-board:`) and
 * deleted before they are rewritten. A rerun therefore replaces this cohort's
 * history rather than doubling it, and nothing it writes can ever collide with
 * a key the awarding service would produce.
 *
 * ## The spread is the point
 *
 * Nine students all earning the same amount would rank correctly and show
 * nothing: no metals worth looking at, no gap to chase, and a `나` row that
 * never moves. So each classmate gets a pace and a rhythm from their index —
 * one studies most days, one turns up twice a week, one is having a good month
 * — which is what puts a real distance between positions 1 and 2, and a
 * reachable one between the reader and the row above them.
 *
 * Every figure stays under the policy's daily cap, because a seeded ledger
 * that exceeds what the server would have paid teaches a developer the wrong
 * number.
 */
async function seedClassmateAwards(
  prisma: PrismaClient,
  input: {
    academyId: string;
    classId: string;
    /** The course the counted minutes are attributed to; null skips them. */
    courseId: string | null;
    days: number;
    membershipIds: string[];
    timeZone: string;
  },
): Promise<number> {
  await prisma.pointAward.deleteMany({
    where: {
      membershipId: { in: input.membershipIds },
      dedupeKey: { startsWith: seedAwardPrefix },
    },
  });

  const today = academyLocalDate(new Date(), input.timeZone);
  const rows: PointAwardCreateManyInput[] = [];
  const learningDays: StudentCourseLearningDayCreateManyInput[] = [];
  const classLearningDays: StudentClassCourseLearningDayCreateManyInput[] = [];

  for (const [index, membershipId] of input.membershipIds.entries()) {
    // 0 = works nearly every day, 8 = turns up now and then. Spread across the
    // class rather than assigned, so the board is never nine of the same
    // student.
    const attendanceOdds = 9 - index;

    for (let back = 0; back < input.days; back += 1) {
      const localDate = addLocalDays(today, -back);
      // Today is exempt from the dice. The default period is one day and a
      // student under the §10.4 floor sees no board at all, so a fixture that
      // leaves today to chance has failed at the one thing it is for — and the
      // amounts still differ, because the rest of the day is generated.
      if (back > 0 && mix(index, back, 1) % 10 >= attendanceOdds) continue;

      const dayStart = academyDayStart(localDate, input.timeZone);
      const localDateValue = new Date(`${localDate}T00:00:00.000Z`);
      let sequence = 0;

      const push = (
        reason: PointReasonName,
        amount: number,
        subjectLabel: string,
        extra: { difficulty?: "EASY" | "MEDIUM" | "HARD" } = {},
      ) => {
        sequence += 1;
        rows.push({
          academyId: input.academyId,
          membershipId,
          reason,
          amount,
          // Namespaced, and unique by construction: one student, one day, one
          // position in that day's run.
          dedupeKey: `${seedAwardPrefix}${membershipId}:${localDate}:${sequence}`,
          classId: input.classId,
          localDate: localDateValue,
          subjectLabel,
          ...(extra.difficulty ? { difficulty: extra.difficulty } : {}),
          // Late afternoon onward, an hour apart — a 학원 evening, and inside
          // the local day the period query will group it into.
          createdAt: new Date(dayStart.getTime() + (16 + sequence) * 3_600_000),
        });
      };

      push("ATTENDANCE", DEFAULT_POINT_POLICY.attendance, "수업 출석");

      const solves = 1 + (mix(index, back, 2) % 4);
      for (let n = 0; n < solves; n += 1) {
        const difficulty = solveDifficulties[mix(index, back, 3 + n) % 3];
        push(
          "EXERCISE_SOLVED",
          solvePoints[difficulty],
          solveTitles[mix(index, back, 7 + n) % solveTitles.length],
          { difficulty },
        );
      }

      // The time ladder is a threshold, not a race: a student reaching the
      // 60-minute rung is paid for that rung alone.
      const minutes = studiedMinutes(index, back);
      const rung = [120, 60, 30].find((tier) => minutes >= tier);
      if (rung) {
        push("LEARNING_TIME", learningTierPoints[rung], String(rung));
      }

      // Curriculum completions are rare on purpose. One a week per student is
      // roughly what finishing a lecture actually costs, and a board where
      // everybody finished a course every day would teach a developer that
      // +150P is an ordinary number.
      if (mix(index, back, 17) % 7 === 0) {
        push("LECTURE_COMPLETED", DEFAULT_POINT_POLICY.lectureCompleted, "반복문 기초");
      }
      if (mix(index, back, 19) % 23 === 0) {
        push("MODULE_COMPLETED", DEFAULT_POINT_POLICY.moduleCompleted, "파이썬 첫걸음");
      }
      if (mix(index, back, 23) % 67 === 0) {
        push("COURSE_COMPLETED", DEFAULT_POINT_POLICY.courseCompleted, "파이썬 입문");
      }

      // The counted minutes the board's time column reads. They live in the
      // learning-day projection rather than in the ledger, because a point is
      // paid for crossing a threshold and not per minute — the two numbers
      // come from different places on purpose, and the fixture has to write
      // both or the column would contradict the award beside it.
      if (input.courseId === null) continue;
      learningDays.push({
        academyId: input.academyId,
        membershipId,
        courseId: input.courseId,
        localDate: localDateValue,
        activeSeconds: minutes * 60,
        activeIntervals: Math.max(1, Math.round(minutes / 12)),
        firstActiveAt: new Date(dayStart.getTime() + 16 * 3_600_000),
        lastActiveAt: new Date(
          dayStart.getTime() + 16 * 3_600_000 + minutes * 60_000,
        ),
      });
      classLearningDays.push({
        academyId: input.academyId,
        membershipId,
        classId: input.classId,
        courseId: input.courseId,
        localDate: localDateValue,
        activeSeconds: minutes * 60,
        activeIntervals: Math.max(1, Math.round(minutes / 12)),
        firstActiveAt: new Date(dayStart.getTime() + 16 * 3_600_000),
        lastActiveAt: new Date(
          dayStart.getTime() + 16 * 3_600_000 + minutes * 60_000,
        ),
      });
    }
  }

  const created = await prisma.pointAward.createMany({
    data: rows,
    skipDuplicates: true,
  });

  // Replaced rather than merged: the projection's key is the student, the
  // course, and the day, so a rerun that only skipped duplicates would leave
  // yesterday's minutes from a previous generator standing beside today's.
  if (input.courseId !== null) {
    await prisma.studentCourseLearningDay.deleteMany({
      where: {
        membershipId: { in: input.membershipIds },
        courseId: input.courseId,
      },
    });
    await prisma.studentCourseLearningDay.createMany({
      data: learningDays,
      skipDuplicates: true,
    });
    await prisma.studentClassCourseLearningDay.deleteMany({
      where: {
        membershipId: { in: input.membershipIds },
        classId: input.classId,
        courseId: input.courseId,
      },
    });
    await prisma.studentClassCourseLearningDay.createMany({
      data: classLearningDays,
      skipDuplicates: true,
    });
  }

  return created.count;
}

/**
 * Counted minutes for one student on one day.
 *
 * Capped at three hours. `ACTIVITY_MAX_GAP_MS` closes an interval after thirty
 * seconds of stillness, so these are minutes a child was actually working —
 * two counted hours is already a long evening, and a fixture that wrote eight
 * would teach a developer to read the column wrong.
 */
function studiedMinutes(index: number, back: number): number {
  return 8 + (mix(index, back, 11) % 172);
}

const seedAwardPrefix = "seed-board:";

type PointReasonName =
  | "ATTENDANCE"
  | "ATTENDANCE_LATE"
  | "LEARNING_TIME"
  | "EXERCISE_SOLVED"
  | "LECTURE_COMPLETED"
  | "MODULE_COMPLETED"
  | "COURSE_COMPLETED";

const solveDifficulties = ["EASY", "MEDIUM", "HARD"] as const;

const solvePoints: Record<(typeof solveDifficulties)[number], number> = {
  EASY: DEFAULT_POINT_POLICY.solveEasy,
  MEDIUM: DEFAULT_POINT_POLICY.solveMedium,
  HARD: DEFAULT_POINT_POLICY.solveHard,
};

const learningTierPoints: Record<number, number> = {
  [DEFAULT_POINT_POLICY.learningTimeTier1Minutes]:
    DEFAULT_POINT_POLICY.learningTimeTier1Points,
  [DEFAULT_POINT_POLICY.learningTimeTier2Minutes]:
    DEFAULT_POINT_POLICY.learningTimeTier2Points,
  [DEFAULT_POINT_POLICY.learningTimeTier3Minutes]:
    DEFAULT_POINT_POLICY.learningTimeTier3Points,
};

/**
 * Problem titles, frozen onto the row the way the real awarding service
 * freezes them — so a seeded ledger reads like a ledger rather than like a
 * list of ids.
 */
const solveTitles = [
  "두 수의 합",
  "짝수 세기",
  "문자열 뒤집기",
  "최댓값 찾기",
  "구구단 출력",
  "소수 판별",
  "리스트 정렬",
  "피보나치 수열",
] as const;

/**
 * A deterministic spread, standing in for randomness.
 *
 * A seed that called `Math.random` would give two developers two different
 * boards and give the same developer a new one on every run, which makes
 * "is this rendering right?" unanswerable. This mixes three small integers
 * into a well-spread one and never varies.
 */
function mix(a: number, b: number, c: number): number {
  let value = (a + 1) * 73_856_093 + (b + 1) * 19_349_663 + (c + 1) * 83_492_791;
  value = (value ^ (value >>> 13)) >>> 0;
  value = (value * 1_274_126_177) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

/** A fixed uuid from a two-hex-digit family and an index, so reruns collide. */
function seedUuid(family: string, ordinal: number): string {
  return `${family}000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}`;
}
