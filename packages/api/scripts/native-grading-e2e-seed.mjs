import { randomUUID } from 'node:crypto';
import { defaultEliceGradingProfile } from '@cove/shared';
import { exerciseProfileColumns } from '../dist/src/judge/grading-profile.js';
export async function seedFixture(db, input) {
  // Transport correctness is independent of the one-second latency cohort.
  const timeLimitMs = input.timeLimitMs ?? 1000;
  if (![1000, 2000].includes(timeLimitMs))
    throw new Error('Unsupported isolated exercise deadline');
  const id = randomUUID();
  const ids = input.ids ?? {};
  for (const value of Object.values(ids))
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        value,
      )
    )
      throw new Error('Invalid pre-certified fixture UUID');
  const organization = await db.organization.upsert({
    where: { id: ids.organizationId ?? randomUUID() },
    update: {},
    create: {
      ...(ids.organizationId ? { id: ids.organizationId } : {}),
      name: 'Native browser fixture',
      slug: 'native-' + id,
    },
  });
  const academy = await db.academy.upsert({
    where: { id: ids.academyId ?? randomUUID() },
    update: {},
    create: {
      ...(ids.academyId ? { id: ids.academyId } : {}),
      organizationId: organization.id,
      name: 'Native Browser Academy',
      slug: 'native-' + id,
    },
  });
  if (academy.organizationId !== organization.id)
    throw new Error('Fixture academy organization mismatch');
  await db.academyFeatureFlag.upsert({
    where: {
      academyId_feature: { academyId: academy.id, feature: 'STUDENT_POINTS' },
    },
    update: { isEnabled: true },
    create: {
      academyId: academy.id,
      feature: 'STUDENT_POINTS',
      isEnabled: true,
    },
  });
  const users = {};
  for (const [kind, role] of [
    ['staff', 'MANAGER'],
    ['otherStaff', 'MANAGER'],
    ['student', 'STUDENT'],
  ]) {
    const uid = randomUUID(),
      username = 'n' + uid.replaceAll('-', '').slice(0, 16),
      email = username + '@example.test';
    await db.user.create({
      data: {
        id: uid,
        authUserId: uid,
        username,
        email,
        displayName: 'Native ' + kind,
        status: 'ACTIVE',
      },
    });
    const membership = await db.academyMembership.create({
      data: {
        academyId: academy.id,
        userId: uid,
        role,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    users[kind] = {
      id: uid,
      username,
      email,
      membershipId: membership.id,
      name: 'Native ' + kind,
    };
  }
  const existing = ids.materialId
    ? await db.material.findUnique({
        where: { id: ids.materialId },
        include: {
          programmingExercise: { include: { testCases: true } },
          lecture: { include: { courseModule: { include: { course: true } } } },
        },
      })
    : null;
  if (
    existing &&
    (existing.lecture.courseModule.course.academyId !== academy.id ||
      existing.programmingExercise?.gradingRevision !== 1 ||
      existing.programmingExercise.timeLimitMs !== timeLimitMs ||
      existing.programmingExercise.testCases.length !== input.cases)
  )
    throw new Error('Existing isolated material/profile mismatch');
  const course =
    existing?.lecture.courseModule.course ??
    (await db.course.create({
      data: {
        academyId: academy.id,
        title: 'Isolated Python',
        isVisible: true,
        createdByUserId: users.staff.id,
      },
    }));
  const module =
    existing?.lecture.courseModule ??
    (await db.courseModule.create({
      data: {
        courseId: course.id,
        title: 'Python',
        externalKey: id,
        position: 1,
        isVisible: true,
      },
    }));
  const lecture =
    existing?.lecture ??
    (await db.lecture.create({
      data: {
        courseModuleId: module.id,
        title: 'Python lesson',
        externalKey: id,
        position: 1,
        isVisible: true,
      },
    }));
  const count = [1, 5, 10].includes(input.cases) ? input.cases : 2;
  const material =
    existing ??
    (await db.material.create({
      data: {
        ...(ids.materialId ? { id: ids.materialId } : {}),
        lectureId: lecture.id,
        title: 'Unicode echo',
        type: 'PROGRAMMING_EXERCISE',
        position: 1,
        isVisible: true,
        programmingExercise: {
          create: {
            externalKey: id,
            difficulty: 'EASY',
            description: '<p>Read and echo the line.</p>',
            starterCode: 'print(input())',
            solutionCode: 'print(input())',
            timeLimitMs,
            memoryLimitMb: 128,
            ...(input.enhanced
              ? exerciseProfileColumns(defaultEliceGradingProfile)
              : {}),
            ...(input.ignorePrompts
              ? {
                  gradingSemanticVersion: input.enhanced
                    ? 'elice-v2'
                    : 'legacy-v2',
                }
              : {}),
            inputPromptPolicy: input.ignorePrompts ? 'IGNORE' : 'INCLUDE',
            testCases: {
              create: Array.from({ length: count }, (_, i) => ({
                position: i + 1,
                input: i ? '비공개 café ' + i : '안녕 🌏',
                expectedOutput: i ? '비공개 café ' + i : '안녕 🌏',
                visibility: i ? 'HIDDEN' : 'SAMPLE',
                weight: input.enhanced ? i + 1 : 1,
              })),
            },
          },
        },
      },
    }));
  const classroom = await db.class.create({
    data: {
      academyId: academy.id,
      name: 'Native class',
      createdByUserId: users.staff.id,
    },
  });
  await db.classCourse.create({
    data: {
      classId: classroom.id,
      courseId: course.id,
      assignedByUserId: users.staff.id,
    },
  });
  await db.classEnrollment.create({
    data: {
      classId: classroom.id,
      membershipId: users.student.membershipId,
      enrolledByUserId: users.staff.id,
    },
  });
  let secondMaterialId;
  if (input.secondMaterial) {
    const alternate = await db.material.create({
      data: {
        lectureId: lecture.id,
        title: 'Other exercise',
        type: 'PROGRAMMING_EXERCISE',
        position: 2,
        isVisible: true,
        programmingExercise: {
          create: {
            externalKey: randomUUID(),
            difficulty: 'EASY',
            description: '<p>A different exercise.</p>',
            starterCode: 'print(input())',
            timeLimitMs: 1000,
            memoryLimitMb: 128,
            testCases: {
              create: {
                position: 1,
                input: 'other',
                expectedOutput: 'other',
                visibility: 'SAMPLE',
              },
            },
          },
        },
      },
    });
    secondMaterialId = alternate.id;
  }
  return {
    id,
    academy,
    users,
    materialId: material.id,
    courseId: course.id,
    classId: classroom.id,
    count,
    secondMaterialId,
  };
}
export async function inspectFixture(db, fixture) {
  const submissions = await db.submission.findMany({
    where: { courseId: fixture.courseId },
    select: {
      id: true,
      userId: true,
      status: true,
      admissionRequestId: true,
      gradingRevision: true,
      executionRuntimeSnapshot: true,
      engineVersion: true,
      gradedAt: true,
      createdAt: true,
      passedCount: true,
      totalCount: true,
      score: true,
      earnedWeight: true,
      possibleWeight: true,
      runtimeMs: true,
    },
  });
  const practice = await db.staffPracticeAttempt.findMany({
    where: { academyId: fixture.academy.id },
    select: {
      id: true,
      userId: true,
      status: true,
      requestId: true,
      snapshot: true,
      result: true,
    },
  });
  const points = await db.pointAward.findMany({
    where: { academyId: fixture.academy.id },
    select: {
      reason: true,
      amount: true,
      materialId: true,
      membershipId: true,
    },
  });
  const progress = await db.studentExerciseProgress.findMany({
    where: { materialId: fixture.materialId },
    select: { userId: true, attemptCount: true },
  });
  return { submissions, practice, points, progress, observedAt: Date.now() };
}
