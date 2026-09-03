import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { validateEnvironment } from "../../src/config/env.schema.js";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { seedClassmateAwards } from "./points-fixtures.js";
import { assertDevelopmentSeedAllowed } from "./seed-helpers.js";

/**
 * A platform with something to rank, for the console's class ranking page.
 *
 * `/admin/ranking` is the one surface that cannot be inspected from a single
 * academy: it compares every academy's classes against each other, and a
 * database seeded one academy at a time shows a table of zeroes. `db:seed`
 * opens the points economy but never pays into it — the server does that from
 * the transactions that observe the facts — so a fresh development database
 * has classes, students, and an empty `point_awards` table, which is correct
 * and is exactly the empty page a developer meets.
 *
 * This fills it, across every active academy at once.
 *
 * ## What it deliberately makes uneven
 *
 * A platform where every class earned the same amount ranks correctly and
 * shows nothing — no order worth sorting, no quiet class to find, and an
 * `earning` ratio that reads the same on every row. So:
 *
 * - **Pace varies per class.** `paceOffset` slides each class along the
 *   fixture's own attendance curve, so some classes work most days and others
 *   turn up twice a week.
 * - **Some classes stay quiet.** Every third class is skipped entirely, which
 *   is what puts `0 / 18` in the earning column and `NO_ACTIVITY_YET` on the
 *   board — the condition an operator opens this page to find.
 * - **One academy keeps its board switched off**, and one switches points off
 *   altogether, so all three state chips render. Both are printed on the way
 *   out with the SQL to undo them, because they are the only two things here
 *   that change how an academy behaves rather than what it has done.
 *
 * ## What it never does
 *
 * It writes no award for a class with fewer than three active students: the
 * board is hidden below that floor (§10.4) so the rows would be invisible, and
 * the fixture would be teaching a developer that a seeded class can look empty.
 *
 * Every row it writes carries the `seed-board:` dedupe prefix and is deleted
 * before being rewritten, so a rerun replaces this history rather than doubling
 * it — and nothing it writes can collide with a key the awarding service
 * would produce.
 */

/** Below this the board is hidden entirely, so seeding one teaches nothing. */
const MIN_STUDENTS = 3;

/** Enough local days to fill 오늘, 이번 주 and 이번 달. */
const DAYS = 34;

async function main(): Promise<void> {
  const environment = validateEnvironment(process.env);
  assertDevelopmentSeedAllowed(environment.NODE_ENV);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });

  const academies = await prisma.academy.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, slug: true, timeZone: true },
    orderBy: { name: "asc" },
  });

  // Points are a per-academy opt-in. The console lists every active academy,
  // so every one of them needs the flag or the table is mostly em dashes.
  for (const academy of academies) {
    for (const feature of [
      "STUDENT_POINTS",
      "STUDENT_CLASS_LEADERBOARD",
    ] as const) {
      await prisma.academyFeatureFlag.upsert({
        where: { academyId_feature: { academyId: academy.id, feature } },
        create: { academyId: academy.id, feature, isEnabled: true },
        update: { isEnabled: true },
      });
    }
  }

  let paceOffset = 0;
  let seededClasses = 0;
  let seededAwards = 0;
  const quiet: string[] = [];
  const skipped: string[] = [];
  /** Academies that ended up with real history, and those that did not. */
  const withHistory: typeof academies = [];
  const withoutHistory: typeof academies = [];

  for (const academy of academies) {
    const classes = await prisma.class.findMany({
      where: { academyId: academy.id, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    let academyAwards = 0;

    for (const record of classes) {
      const enrollments = await prisma.classEnrollment.findMany({
        where: {
          classId: record.id,
          membership: { status: "ACTIVE", role: "STUDENT" },
        },
        orderBy: { membershipId: "asc" },
        select: { membershipId: true },
      });
      const membershipIds = enrollments.map((one) => one.membershipId);

      if (membershipIds.length < MIN_STUDENTS) {
        skipped.push(`${academy.slug}/${record.name} (${membershipIds.length})`);
        continue;
      }

      // Every third class is left alone. A platform with no quiet classes
      // cannot show what a quiet class looks like, and that is the row an
      // operator is actually hunting for.
      if (seededClasses % 3 === 2) {
        quiet.push(`${academy.slug}/${record.name}`);
        seededClasses += 1;
        paceOffset += 1;
        continue;
      }

      // The counted-minutes projection is keyed by course, so the fixture
      // needs one the class actually assigns. A class with no course gets
      // awards and no minutes rather than an invented course nobody can open.
      const assigned = await prisma.classCourse.findFirst({
        where: { classId: record.id },
        select: { courseId: true },
      });

      const awards = await seedClassmateAwards(prisma, {
        academyId: academy.id,
        classId: record.id,
        courseId: assigned?.courseId ?? null,
        days: DAYS,
        membershipIds,
        timeZone: academy.timeZone,
        paceOffset: paceOffset % 6,
      });

      console.log(
        `  ${academy.slug.padEnd(22)} ${record.name.padEnd(24)} ` +
          `students=${String(membershipIds.length).padStart(3)} awards=${awards}`,
      );
      seededClasses += 1;
      seededAwards += awards;
      academyAwards += awards;
      paceOffset += 1;
    }

    (academyAwards > 0 ? withHistory : withoutHistory).push(academy);
  }

  // The two states that are a *decision* rather than an absence. Applied last,
  // so the classes underneath still have real history to switch back on.
  //
  // Which academy gets which matters. `board_off` goes to one that *has*
  // history, because that is the whole of what the state means — students are
  // earning, and the academy hides the ranking from them — so its rows still
  // show real totals beside the chip. `points_off` goes to one with nothing
  // seeded, because that state blanks every figure to an em dash, and spending
  // it on a populated academy would hide the data this fixture just wrote.
  const boardOff = withHistory.at(-1);
  const pointsOff =
    withoutHistory.find((one) => one.id !== boardOff?.id) ??
    academies.find((one) => one.id !== boardOff?.id);
  if (boardOff) {
    await prisma.academyFeatureFlag.update({
      where: {
        academyId_feature: {
          academyId: boardOff.id,
          feature: "STUDENT_CLASS_LEADERBOARD",
        },
      },
      data: { isEnabled: false },
    });
  }
  if (pointsOff) {
    await prisma.academyFeatureFlag.update({
      where: {
        academyId_feature: {
          academyId: pointsOff.id,
          feature: "STUDENT_POINTS",
        },
      },
      data: { isEnabled: false },
    });
  }

  console.log(
    `\nSeeded ${seededAwards} awards across ${seededClasses - quiet.length} classes ` +
      `in ${academies.length} academies, over the last ${DAYS} local days.`,
  );
  if (quiet.length > 0) {
    console.log(`Left quiet on purpose (0 earning): ${quiet.join(", ")}`);
  }
  if (skipped.length > 0) {
    console.log(
      `Skipped, under the ${MIN_STUDENTS}-student board floor: ${skipped.join(", ")}`,
    );
  }
  if (boardOff) {
    console.log(`\nBoard switched OFF for: ${boardOff.name} (/${boardOff.slug})`);
  }
  if (pointsOff) {
    console.log(`Points switched OFF for: ${pointsOff.name} (/${pointsOff.slug})`);
  }
  console.log(
    "Those two are the only settings this changed. Rerun `pnpm db:seed:ranking`\n" +
      "to restore them, or switch them back from the academy's own settings page.",
  );

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
