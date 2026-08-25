import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient, type SupabaseClient, type User as AuthUser } from "@supabase/supabase-js";

import { validateEnvironment } from "../../../src/config/env.schema.js";
import { PrismaClient } from "../../../src/generated/prisma/client.js";
import type { CaseOutcome, SubmissionStatus } from "../../../src/generated/prisma/enums.js";
import type {
  ExerciseSolveSessionCreateManyInput,
  StudentClassCourseLearningDayCreateManyInput,
  StudentCourseLearningDayCreateManyInput,
  StudentExerciseProgressCreateManyInput,
  SubmissionCaseCreateManyInput,
  SubmissionCreateManyInput,
  SubmissionGradingCaseCreateManyInput,
} from "../../../src/generated/prisma/models.js";
import { courseExercises, type DemoCourse, type DemoExercise } from "./curriculum.js";
import {
  demoAcademies,
  demoFoundedAt,
  demoPassword,
  type DemoAcademy,
  type DemoPerson,
} from "./dataset.js";
import { demoId, pick, seededRandom } from "./ids.js";
import { resetDemoDatabase } from "./reset.js";

/**
 * Builds the investor demo: two academies, their staff and students, a shared
 * curriculum, and a term's worth of student work behind it.
 *
 * Reset-then-create rather than upsert. The dataset is a single coherent
 * snapshot — a class roster, the submissions that roster produced, and the
 * progress those submissions imply — and upserting one layer onto a database
 * that still holds an older version of another produces a roster whose numbers
 * do not add up. Rerunning this script always yields the same database.
 */

const platformOrganizationSlug = "cove";
const engineVersion = "pyodide-0.27.5";
const now = new Date();
const dayMs = 86_400_000;

function weeksAfterFounding(weeks: number): Date {
  return new Date(demoFoundedAt.getTime() + weeks * 7 * dayMs);
}

function clampToPast(date: Date): Date {
  return date.getTime() > now.getTime() - dayMs ? new Date(now.getTime() - dayMs) : date;
}

/** A `date`-typed column wants midnight UTC, not a local instant. */
function localDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

type PersonRecord = {
  person: DemoPerson;
  userId: string;
  membershipId: string;
  joinedAt: Date;
};

type MaterialRecord = {
  exercise: DemoExercise;
  materialId: string;
  courseId: string;
  position: number;
  /**
   * The labels a submission freezes at write time, so a later curriculum
   * rename never rewrites what a student solved last term.
   */
  labels: {
    problemTitle: string;
    courseTitle: string;
    moduleTitle: string;
    lectureTitle: string;
    modulePosition: number;
    lecturePosition: number;
    problemPosition: number;
  };
};

async function synchronizeAuth(
  supabase: SupabaseClient,
  people: readonly DemoPerson[],
): Promise<Map<string, string>> {
  const existing = new Map<string, AuthUser>();
  for (let page = 1; ; page += 1) {
    const response = await supabase.auth.admin.listUsers({ page, perPage: 1_000 });
    if (response.error) throw new Error("Unable to list Supabase Auth users.");
    for (const user of response.data.users) {
      if (user.email) existing.set(user.email.trim().toLowerCase(), user);
    }
    if (response.data.users.length < 1_000) break;
  }

  const identities = new Map<string, string>();
  for (const person of people) {
    const email = person.email.trim().toLowerCase();
    const attributes = {
      email,
      password: demoPassword,
      email_confirm: true,
      user_metadata: {
        full_name: person.displayName,
        username: person.username,
        cove_demo_seed: true,
      },
    };
    const found = existing.get(email);
    const response = found
      ? await supabase.auth.admin.updateUserById(found.id, attributes)
      : await supabase.auth.admin.createUser(attributes);
    if (response.error || !response.data.user) {
      throw new Error(
        `Unable to provision Supabase Auth user ${email}: ${response.error?.message ?? "unknown"}`,
      );
    }
    identities.set(person.key, response.data.user.id);
  }
  return identities;
}

async function seedAcademy(
  prisma: PrismaClient,
  organizationId: string,
  academy: DemoAcademy,
  identities: ReadonlyMap<string, string>,
): Promise<void> {
  const academyId = demoId(`academy:${academy.key}`);
  const people = [...academy.staff, ...academy.students];

  await prisma.academy.create({
    data: {
      id: academyId,
      organizationId,
      name: academy.name,
      slug: academy.slug,
      status: "ACTIVE",
      addressLine1: academy.addressLine1,
      locality: academy.locality,
      region: academy.region,
      postalCode: academy.postalCode,
      countryCode: "KR",
      contactPhone: academy.contactPhone,
      contactEmail: academy.contactEmail,
      timeZone: "Asia/Seoul",
      profileUpdatedAt: weeksAfterFounding(1),
      createdAt: demoFoundedAt,
    },
  });

  // Both surfaces an investor is shown are behind flags, and a missing row
  // means off — so an academy that is never switched on looks like a product
  // that does not have the feature.
  // `STUDENT_CLASS_STANDING` is deliberately absent beside the leaderboard:
  // §18.2 of the student points design makes the board supersede the standing
  // wherever both are on, so a demo that set both would be demonstrating a
  // configuration the product resolves away.
  await prisma.academyFeatureFlag.createMany({
    data: [
      { academyId, feature: "TEACHER_LIVE_MONITORING", isEnabled: true },
      { academyId, feature: "STUDENT_POINTS", isEnabled: true },
      { academyId, feature: "STUDENT_CLASS_LEADERBOARD", isEnabled: true },
    ],
  });

  const records = new Map<string, PersonRecord>();
  for (const person of people) {
    const userId = demoId(`user:${person.key}`);
    const membershipId = demoId(`membership:${academy.key}:${person.key}`);
    const joinedAt = clampToPast(weeksAfterFounding(person.joinedWeek));
    records.set(person.key, { person, userId, membershipId, joinedAt });

    await prisma.user.create({
      data: {
        id: userId,
        authUserId: identities.get(person.key)!,
        email: person.email,
        username: person.username,
        displayName: person.displayName,
        preferredLocale: "ko",
        timezone: "Asia/Seoul",
        platformRole: "USER",
        status: "ACTIVE",
        lastSignInAt: clampToPast(new Date(now.getTime() - dayMs * (1 + (person.key.length % 5)))),
        createdAt: joinedAt,
      },
    });
  }

  const managerKey = academy.staff.find((s) => s.role === "MANAGER")!.key;
  const managerUserId = records.get(managerKey)!.userId;
  const teamLeadUserId = records.get(
    academy.staff.find((s) => s.role === "TEAM_LEAD")!.key,
  )!.userId;

  await prisma.academyMembership.createMany({
    data: people.map((person) => {
      const record = records.get(person.key)!;
      return {
        id: record.membershipId,
        academyId,
        userId: record.userId,
        role: person.role,
        status: "ACTIVE" as const,
        invitedByUserId: person.key === managerKey ? null : managerUserId,
        approvedByUserId: person.key === managerKey ? null : managerUserId,
        joinedAt: record.joinedAt,
        createdAt: record.joinedAt,
      };
    }),
  });

  await prisma.staffAcademyProfile.createMany({
    data: academy.staff.map((person) => ({
      membershipId: records.get(person.key)!.membershipId,
      academyId,
      bio: person.bio ?? null,
      specialties: [...(person.specialties ?? [])],
      teachingLanguages: ["Python"],
      academyTitle: person.academyTitle ?? null,
      employeeNumber: `${academy.key === "mapo" ? "MP" : "GN"}-${person.key.slice(0, 3).toUpperCase()}`,
    })),
  });

  await prisma.studentAcademyProfile.createMany({
    data: academy.students.map((person) => ({
      membershipId: records.get(person.key)!.membershipId,
      academyId,
      schoolName: person.schoolName ?? null,
      schoolGrade: person.schoolGrade ?? null,
      guardianName: person.guardianName ?? null,
      guardianRelationship: person.guardianRelationship ?? null,
      guardianPhone: person.guardianPhone ?? null,
      codingInterests: [...(person.codingInterests ?? [])],
      learningGoal: person.learningGoal ?? null,
      studentNumber: person.studentNumber ?? null,
    })),
  });

  // The real person who owns this campus, promoted in place. Their Supabase
  // identity is untouched: they sign in with the password they already have.
  const owner = await prisma.user.findUnique({
    where: { email: academy.ownerEmail },
    select: { id: true },
  });
  if (owner) {
    await prisma.academyMembership.create({
      data: {
        id: demoId(`membership:${academy.key}:owner`),
        academyId,
        userId: owner.id,
        role: "MANAGER",
        status: "ACTIVE",
        joinedAt: demoFoundedAt,
        createdAt: demoFoundedAt,
      },
    });
    console.log(`   ${academy.name}: ${academy.ownerEmail} added as MANAGER`);
  } else {
    console.warn(`   ! ${academy.ownerEmail} not found; skipped owner membership`);
  }

  const materialsByCourse = new Map<string, MaterialRecord[]>();
  const courseIds = new Map<string, string>();

  for (const course of academy.courses) {
    const courseId = demoId(`course:${academy.key}:${course.key}`);
    courseIds.set(course.key, courseId);
    await prisma.course.create({
      data: {
        id: courseId,
        academyId,
        title: course.title,
        description: course.description,
        isVisible: true,
        createdByUserId: teamLeadUserId,
        createdAt: weeksAfterFounding(1),
      },
    });
    materialsByCourse.set(course.key, await seedCourseContent(prisma, academy, course, courseId));
  }

  await seedClasses(prisma, academy, academyId, records, courseIds, materialsByCourse, managerUserId);
}

async function seedCourseContent(
  prisma: PrismaClient,
  academy: DemoAcademy,
  course: DemoCourse,
  courseId: string,
): Promise<MaterialRecord[]> {
  const materials: MaterialRecord[] = [];
  let flatPosition = 0;

  for (const [moduleIndex, module] of course.modules.entries()) {
    const moduleId = demoId(`module:${academy.key}:${course.key}:${moduleIndex}`);
    await prisma.courseModule.create({
      data: {
        id: moduleId,
        courseId,
        // Seeded content is addressable from a workbook like any other: the
        // deterministic id doubles as the stable import key.
        externalKey: moduleId.toUpperCase(),
        title: module.title,
        description: module.description,
        position: moduleIndex + 1,
        isVisible: true,
      },
    });

    for (const [lectureIndex, lecture] of module.lectures.entries()) {
      const lectureId = demoId(
        `lecture:${academy.key}:${course.key}:${moduleIndex}:${lectureIndex}`,
      );
      await prisma.lecture.create({
        data: {
          id: lectureId,
          courseModuleId: moduleId,
          externalKey: lectureId.toUpperCase(),
          title: lecture.title,
          description: lecture.description,
          position: lectureIndex + 1,
          isVisible: true,
        },
      });

      for (const [exerciseIndex, exercise] of lecture.exercises.entries()) {
        const materialId = demoId(`material:${academy.key}:${course.key}:${exercise.key}`);
        await prisma.material.create({
          data: {
            id: materialId,
            lectureId,
            type: "PROGRAMMING_EXERCISE",
            title: exercise.title,
            position: exerciseIndex + 1,
            isRequired: true,
            isVisible: true,
          },
        });
        await prisma.programmingExercise.create({
          data: {
            materialId,
            externalKey: `${academy.slug}:${exercise.key}`,
            difficulty: exercise.difficulty,
            description: exercise.description,
            inputFormat: exercise.inputFormat,
            outputFormat: exercise.outputFormat,
            constraints: exercise.constraints,
            starterCode: exercise.starterCode,
            language: "PYTHON",
            timeLimitMs: 3_000,
            memoryLimitMb: 256,
            aiFeedbackEnabled: true,
            gradingRevision: 1,
          },
        });
        await prisma.exerciseTestCase.createMany({
          data: exercise.testCases.map((testCase, index) => ({
            id: demoId(`testcase:${academy.key}:${exercise.key}:${index}`),
            exerciseMaterialId: materialId,
            position: index + 1,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            visibility: testCase.visibility,
          })),
        });
        if (exercise.hints.length > 0) {
          await prisma.exerciseHint.createMany({
            data: exercise.hints.map((content, index) => ({
              id: demoId(`hint:${academy.key}:${exercise.key}:${index}`),
              exerciseMaterialId: materialId,
              position: index + 1,
              content,
            })),
          });
        }
        materials.push({
          exercise,
          materialId,
          courseId,
          position: flatPosition,
          labels: {
            problemTitle: exercise.title,
            courseTitle: course.title,
            moduleTitle: module.title,
            lectureTitle: lecture.title,
            modulePosition: moduleIndex + 1,
            lecturePosition: lectureIndex + 1,
            problemPosition: exerciseIndex + 1,
          },
        });
        flatPosition += 1;
      }
    }
  }

  return materials;
}

const encouragement = [
  "조건문 순서를 바꾼 부분 잘 찾았어요. 다음 문제도 같은 방법으로 접근해 보세요.",
  "코드는 맞았지만 변수 이름을 조금 더 설명적으로 지으면 나중에 읽기 좋아요.",
  "히든 케이스에서 막힌 부분, 수업 시간에 같이 봅시다. 음수 입력을 생각해 보세요.",
  "혼자서 끝까지 푼 게 대단해요. 이번 주 심화 문제도 도전해 볼까요?",
  "출력 형식을 한 번만 더 확인해 주세요. 공백 하나 차이로 틀리는 경우가 많아요.",
  "반복문 범위를 정확히 잡았네요. 다음 시간에는 시간 복잡도를 이야기해 봅시다.",
];

async function seedClasses(
  prisma: PrismaClient,
  academy: DemoAcademy,
  academyId: string,
  records: ReadonlyMap<string, PersonRecord>,
  courseIds: ReadonlyMap<string, string>,
  materialsByCourse: ReadonlyMap<string, MaterialRecord[]>,
  managerUserId: string,
): Promise<void> {
  for (const demoClass of academy.classes) {
    const classId = demoId(`class:${academy.key}:${demoClass.key}`);
    const teacher = records.get(demoClass.teacherKey)!;

    await prisma.class.create({
      data: {
        id: classId,
        academyId,
        name: demoClass.name,
        description: demoClass.description,
        status: "ACTIVE",
        createdByUserId: managerUserId,
        teacherMembershipId: teacher.membershipId,
        createdAt: weeksAfterFounding(2),
      },
    });

    await prisma.classCourse.createMany({
      data: demoClass.courseKeys.map((courseKey) => ({
        classId,
        courseId: courseIds.get(courseKey)!,
        assignedByUserId: managerUserId,
        assignedAt: weeksAfterFounding(2),
      })),
    });

    // A weekday evening, the hour a 학원 class actually runs. Without a window
    // no class pays attendance points, and a demo of a point economy with an
    // empty attendance column would be showing a bug that is not there. §8.1.
    await prisma.classScheduleSlot.createMany({
      data: [1, 3, 5].map((weekday) => ({
        classId,
        weekday,
        startMinute: 16 * 60,
        endMinute: 18 * 60,
      })),
    });

    const enrolled = demoClass.studentKeys
      .map((key) => records.get(key))
      .filter((record): record is PersonRecord => record !== undefined);

    await prisma.classEnrollment.createMany({
      data: enrolled.map((record) => ({
        classId,
        membershipId: record.membershipId,
        enrolledByUserId: managerUserId,
        enrolledAt: record.joinedAt,
        lastLearningSeenAt: clampToPast(
          new Date(now.getTime() - dayMs * (1 + (record.person.key.length % 6))),
        ),
      })),
    });

    for (const courseKey of demoClass.courseKeys) {
      const materials = materialsByCourse.get(courseKey)!;
      const courseId = courseIds.get(courseKey)!;
      for (const record of enrolled) {
        await seedStudentWork(prisma, {
          academyId,
          classId,
          courseId,
          materials,
          student: record,
          teacher,
          classKey: demoClass.key,
        });
      }
    }

    console.log(
      `   ${academy.name} · ${demoClass.name}: ${enrolled.length} students, teacher ${teacher.person.displayName}`,
    );
  }
}

async function seedStudentWork(
  prisma: PrismaClient,
  context: {
    academyId: string;
    classId: string;
    courseId: string;
    materials: readonly MaterialRecord[];
    student: PersonRecord;
    teacher: PersonRecord;
    classKey: string;
  },
): Promise<void> {
  const { academyId, classId, courseId, materials, student, teacher, classKey } = context;
  const random = seededRandom(`${classKey}:${student.person.key}`);
  const ability = 0.3 + random() * 0.7;
  const reach = Math.max(1, Math.min(materials.length, Math.round(materials.length * ability)));

  const submissions: SubmissionCreateManyInput[] = [];
  const gradingCases: SubmissionGradingCaseCreateManyInput[] = [];
  const cases: SubmissionCaseCreateManyInput[] = [];
  const sessions: ExerciseSolveSessionCreateManyInput[] = [];
  const progress: StudentExerciseProgressCreateManyInput[] = [];

  for (let index = 0; index < reach; index += 1) {
    const material = materials[index];
    const total = material.exercise.testCases.length;
    const solved = index < reach - 1 || random() > 0.45;
    // A first attempt that fails, then a fix, is what learning looks like; a
    // roster where everyone passes first time teaches an investor nothing.
    const failedAttempts = solved ? Math.floor(random() * 3) : 1 + Math.floor(random() * 2);
    const attempts = failedAttempts + (solved ? 1 : 0);
    if (attempts === 0) continue;

    const startedAt = clampToPast(
      new Date(student.joinedAt.getTime() + (index + 1) * 4.5 * dayMs),
    );
    const sessionId = demoId(`session:${classKey}:${student.person.key}:${material.exercise.key}`);
    sessions.push({
      id: sessionId,
      userId: student.userId,
      materialId: material.materialId,
      classId,
      startedAt,
      createdAt: startedAt,
    });

    let bestPassed = 0;
    let lastAttemptAt = startedAt;
    let firstSolvedAt: Date | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const isPass = solved && attempt === attempts - 1;
      const passedCount = isPass
        ? total
        : Math.max(0, Math.min(total - 1, Math.floor(random() * total)));
      const submissionId = demoId(
        `submission:${classKey}:${student.person.key}:${material.exercise.key}:${attempt}`,
      );
      const createdAt = clampToPast(
        new Date(startedAt.getTime() + attempt * 11 * 60_000 + Math.floor(random() * 240_000)),
      );
      const runtimeMs = 40 + Math.floor(random() * 260);
      const status: SubmissionStatus = isPass ? "PASSED" : "FAILED";

      submissions.push({
        id: submissionId,
        userId: student.userId,
        materialId: material.materialId,
        sourceMaterialId: material.materialId,
        courseId,
        classId,
        gradingRevision: 1,
        language: "PYTHON",
        timeLimitMs: 3_000,
        memoryLimitMb: 256,
        code: isPass ? material.exercise.solution : material.exercise.starterCode,
        status,
        passedCount,
        totalCount: total,
        score: Math.round((passedCount / total) * 100),
        runtimeMs,
        engineVersion,
        failureReason: null,
        startedAt: createdAt,
        gradedAt: new Date(createdAt.getTime() + 1_500 + Math.floor(random() * 2_000)),
        createdAt,
        solveSessionId: sessionId,
        solveElapsedSec: 180 + Math.floor(random() * 1_500),
        ...material.labels,
      });

      material.exercise.testCases.forEach((testCase, position) => {
        const isSample = testCase.visibility === "SAMPLE";
        gradingCases.push({
          id: demoId(`gradingcase:${submissionId}:${position}`),
          submissionId,
          position: position + 1,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          isSample,
        });
        const passedThis = position < passedCount;
        const outcome: CaseOutcome = passedThis
          ? "PASSED"
          : position === passedCount
            ? pick(random, ["WRONG_OUTPUT", "RUNTIME_ERROR", "TIME_LIMIT"] as const)
            : "SKIPPED";
        cases.push({
          id: demoId(`case:${submissionId}:${position}`),
          submissionId,
          position: position + 1,
          isSample,
          outcome,
          runtimeMs: outcome === "SKIPPED" ? null : 20 + Math.floor(random() * 180),
          // Hidden expectations never leave the server, so only a sample case
          // may carry what the student's program actually printed.
          actualOutput: isSample
            ? passedThis
              ? testCase.expectedOutput
              : ""
            : null,
        });
      });

      bestPassed = Math.max(bestPassed, passedCount);
      lastAttemptAt = createdAt;
      if (isPass && !firstSolvedAt) firstSolvedAt = createdAt;
    }

    progress.push({
      id: demoId(`progress:${classKey}:${student.person.key}:${material.exercise.key}`),
      userId: student.userId,
      materialId: material.materialId,
      status: solved ? "SOLVED" : "IN_PROGRESS",
      attemptCount: attempts,
      bestPassed,
      bestScore: Math.round((bestPassed / total) * 100),
      gradingRevision: 1,
      firstSolvedAt,
      lastAttemptAt,
    });
  }

  await prisma.exerciseSolveSession.createMany({ data: sessions, skipDuplicates: true });
  await prisma.submission.createMany({ data: submissions, skipDuplicates: true });
  await prisma.submissionGradingCase.createMany({ data: gradingCases, skipDuplicates: true });
  await prisma.submissionCase.createMany({ data: cases, skipDuplicates: true });
  await prisma.studentExerciseProgress.createMany({ data: progress, skipDuplicates: true });

  // The exercise they are on right now, left half-written in the editor.
  if (reach < materials.length) {
    const current = materials[reach];
    await prisma.exerciseDraft.createMany({
      data: [
        {
          id: demoId(`draft:${classKey}:${student.person.key}`),
          userId: student.userId,
          materialId: current.materialId,
          sourceMaterialId: current.materialId,
          courseId,
          code: `${current.exercise.starterCode}# 여기까지 했어요\n`,
          updatedAt: clampToPast(new Date(now.getTime() - dayMs * (1 + Math.floor(random() * 4)))),
        },
      ],
      skipDuplicates: true,
    });
  }

  // Roughly half the roster has heard from their teacher, and some of it is
  // still unread — an all-read inbox would hide the student's own badge.
  if (random() > 0.45 && reach > 0) {
    const target = materials[Math.max(0, reach - 1)];
    const createdAt = clampToPast(new Date(now.getTime() - dayMs * (1 + Math.floor(random() * 9))));
    await prisma.teacherFeedback.createMany({
      data: [
        {
          id: demoId(`feedback:${classKey}:${student.person.key}`),
          academyId,
          classId,
          teacherMembershipId: teacher.membershipId,
          studentMembershipId: student.membershipId,
          teacherMembershipRef: teacher.membershipId,
          studentMembershipRef: student.membershipId,
          materialId: target.materialId,
          idempotencyKey: demoId(`feedbackkey:${classKey}:${student.person.key}`),
          body: pick(random, encouragement),
          createdAt,
          updatedAt: createdAt,
          readAt: random() > 0.4 ? new Date(createdAt.getTime() + dayMs) : null,
        },
      ],
      skipDuplicates: true,
    });
  }

  // Daily active time, so the overview's momentum chart has a real series.
  const learningDays: StudentCourseLearningDayCreateManyInput[] = [];
  const classLearningDays: StudentClassCourseLearningDayCreateManyInput[] = [];
  for (let back = 1; back <= 45; back += 1) {
    const day = new Date(now.getTime() - back * dayMs);
    // Weekends off for weekday classes, and never every single day.
    if (random() > 0.42) continue;
    const seconds = 900 + Math.floor(random() * 4_500);
    const activeIntervals = 1 + Math.floor(random() * 4);
    const firstActiveAt = new Date(day.getTime() - seconds * 1_000);
    if (firstActiveAt < student.joinedAt) continue;
    learningDays.push({
      academyId,
      membershipId: student.membershipId,
      courseId,
      localDate: localDate(day),
      activeSeconds: seconds,
      activeIntervals,
      firstActiveAt,
      lastActiveAt: day,
    });
    classLearningDays.push({
      academyId,
      membershipId: student.membershipId,
      classId,
      courseId,
      localDate: localDate(day),
      activeSeconds: seconds,
      activeIntervals,
      firstActiveAt,
      lastActiveAt: day,
    });
  }
  await prisma.studentCourseLearningDay.createMany({
    data: learningDays,
    skipDuplicates: true,
  });
  await prisma.studentClassCourseLearningDay.createMany({
    data: classLearningDays,
    skipDuplicates: true,
  });
}

async function main(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    console.log("🧹 Clearing existing data...");
    await resetDemoDatabase(prisma, supabase);

    console.log("🔐 Provisioning Supabase Auth identities...");
    const everyone = demoAcademies.flatMap((academy) => [
      ...academy.staff,
      ...academy.students,
    ]);
    const identities = await synchronizeAuth(supabase, everyone);
    console.log(`   ${identities.size} accounts ready (password: ${demoPassword})`);

    const organization = await prisma.organization.upsert({
      where: { slug: platformOrganizationSlug },
      update: { name: "Cove", status: "ACTIVE" },
      create: { name: "Cove", slug: platformOrganizationSlug, status: "ACTIVE" },
      select: { id: true },
    });

    for (const academy of demoAcademies) {
      console.log(`🏫 Building ${academy.name}...`);
      await seedAcademy(prisma, organization.id, academy, identities);
    }

    const [academies, users, classes, exercises, submissions] = await Promise.all([
      prisma.academy.count(),
      prisma.user.count(),
      prisma.class.count(),
      prisma.programmingExercise.count(),
      prisma.submission.count(),
    ]);
    console.log("\n✅ Demo data ready.");
    console.log(
      `   ${academies} academies · ${users} users · ${classes} classes · ${exercises} exercises · ${submissions} submissions`,
    );
    console.log(`\n   Every demo account signs in with: ${demoPassword}`);
    for (const academy of demoAcademies) {
      const manager = academy.staff.find((s) => s.role === "MANAGER")!;
      console.log(`   ${academy.name}`);
      console.log(`     manager: ${manager.email}`);
      console.log(`     owner:   ${academy.ownerEmail} (your own password)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : "Demo seed failed.");
  process.exitCode = 1;
});
