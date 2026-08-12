import type { AcademyRole } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import { TeacherProgressAccessService } from "./teacher-progress-access.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "teacher@example.com",
  emailVerified: true,
  username: null,
  displayName: "Teacher",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};
const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "30000000-0000-4000-8000-000000000001";
const teacherUserId = "40000000-0000-4000-8000-000000000001";
const membershipId = "50000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const studentUserId = "70000000-0000-4000-8000-000000000001";
const materialId = "80000000-0000-4000-8000-000000000001";

function materialRow(overrides: Record<string, unknown> = {}) {
  return {
    id: materialId,
    title: "Sum two numbers",
    position: 1,
    isRequired: true,
    programmingExercise: { difficulty: "EASY", gradingRevision: 1 },
    lecture: {
      id: "90000000-0000-4000-8000-000000000001",
      title: "Adding numbers",
      description: "Add two numbers you read.",
      position: 1,
      courseModule: {
        id: "a0000000-0000-4000-8000-000000000001",
        title: "Arithmetic",
        position: 2,
        course: { id: "b0000000-0000-4000-8000-000000000001", title: "Basics" },
      },
    },
    ...overrides,
  };
}

function createService(options?: {
  role?: AcademyRole;
  classRecord?: { id: string; name: string } | null;
  memberships?: unknown[];
  materials?: unknown[];
}) {
  const findFirst = vi.fn(async () =>
    options?.classRecord === undefined
      ? { id: classId, name: "Level 1" }
      : options.classRecord,
  );
  const prisma = {
    academyMembership: {
      findUnique: vi.fn(async () => ({ id: membershipId })),
      findMany: vi.fn(
        async () =>
          options?.memberships ?? [
            {
              id: studentMembershipId,
              userId: studentUserId,
              user: {
                displayName: "Student One",
                username: "student1",
                email: "student1@example.com",
              },
            },
          ],
      ),
    },
    class: { findFirst },
    course: {
      findMany: vi.fn(async () => [
        {
          id: "b0000000-0000-4000-8000-000000000001",
          title: "Basics",
          description: "",
        },
      ]),
    },
    material: {
      findMany: vi.fn(async () => options?.materials ?? [materialRow()]),
    },
  } as unknown as PrismaService;

  const access = {
    requirePermission: vi.fn(async () => ({
      userId: teacherUserId,
      role: options?.role ?? ("TEACHER" as AcademyRole),
    })),
  } as unknown as AcademyAccessService;

  return {
    service: new TeacherProgressAccessService(prisma, access),
    prisma,
    access,
    findFirst,
  };
}

describe("TeacherProgressAccessService", () => {
  it("resolves the roster, courses, and curriculum of an assigned class", async () => {
    const { service } = createService();
    const scope = await service.requireClassScope(identity, {
      academyId,
      classId,
    });

    expect(scope.className).toBe("Level 1");
    expect(scope.students).toEqual([
      {
        membershipId: studentMembershipId,
        userId: studentUserId,
        displayName: "Student One",
      },
    ]);
    expect(scope.studentUserIds).toEqual([studentUserId]);
    expect(scope.exercises[0]).toMatchObject({
      materialId,
      isRequired: true,
      lecturePosition: 1,
      modulePosition: 2,
    });
  });

  it("refuses a Team Lead who holds the same permission", async () => {
    // `classes.assigned.manage` is not the whole rule: reading one class's
    // student history requires actually being its teacher.
    const { service } = createService({ role: "TEAM_LEAD" });
    await expect(
      service.requireClassScope(identity, { academyId, classId }),
    ).rejects.toMatchObject({ code: "TEACHER_PROGRESS_ACCESS_DENIED" });
  });

  it("refuses a Manager", async () => {
    const { service } = createService({ role: "MANAGER" });
    await expect(
      service.requireClassScope(identity, { academyId, classId }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it("gives one answer for every class-access failure", async () => {
    // Reassigned, archived, another academy's, or nonexistent: the predicate
    // selects nothing and the teacher cannot tell which it was.
    const { service } = createService({ classRecord: null });
    await expect(
      service.requireClassScope(identity, { academyId, classId }),
    ).rejects.toMatchObject({ code: "TEACHER_PROGRESS_ACCESS_DENIED" });
  });

  it("checks assignment in the query rather than after it", async () => {
    const { service, findFirst } = createService();
    await service.requireClassScope(identity, { academyId, classId });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: classId,
          academyId,
          status: "ACTIVE",
          teacherMembershipId: membershipId,
        }),
      }),
    );
  });

  it("fails closed on a membership id outside the class", async () => {
    const { service } = createService();
    const scope = await service.requireClassScope(identity, {
      academyId,
      classId,
    });
    expect(() =>
      service.requireStudent(scope, "c0000000-0000-4000-8000-000000000009"),
    ).toThrowError(
      expect.objectContaining({ code: "TEACHER_PROGRESS_NOT_FOUND" }),
    );
  });

  it("fails closed on a material outside the class curriculum", async () => {
    const { service } = createService();
    const scope = await service.requireClassScope(identity, {
      academyId,
      classId,
    });
    expect(() =>
      service.requireExercise(scope, "d0000000-0000-4000-8000-000000000009"),
    ).toThrowError(
      expect.objectContaining({ code: "TEACHER_PROGRESS_NOT_FOUND" }),
    );
  });

  it("returns an empty scope for a class with nobody in it", async () => {
    // Empty, not denied: the teacher is assigned, there is simply no work.
    const { service } = createService({ memberships: [], materials: [] });
    const scope = await service.requireClassScope(identity, {
      academyId,
      classId,
    });
    expect(scope.students).toEqual([]);
    expect(scope.exercises).toEqual([]);
  });

  it("prefers a name over a sign-in handle and never reaches for email first", async () => {
    const { service } = createService({
      memberships: [
        {
          id: studentMembershipId,
          userId: studentUserId,
          user: {
            displayName: null,
            username: "student1",
            email: "student1@example.com",
          },
        },
      ],
    });
    const scope = await service.requireClassScope(identity, {
      academyId,
      classId,
    });
    expect(scope.students[0]?.displayName).toBe("student1");
  });
});
