import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { TeacherOverviewAccessService } from "./teacher-overview-access.service.js";

/**
 * The gate, tested as a gate: what it selects, what it refuses, and what it
 * quietly drops rather than refusing.
 */

const identity = { authUserId: "auth" } as SupabaseIdentity;
const academyId = "20000000-0000-4000-8000-000000000001";
const otherAcademy = "20000000-0000-4000-8000-000000000009";
const classA = "30000000-0000-4000-8000-000000000001";
const classB = "30000000-0000-4000-8000-000000000002";
const courseOne = "40000000-0000-4000-8000-000000000001";
const courseTwo = "40000000-0000-4000-8000-000000000002";

function createService(overrides?: {
  role?: string;
  /** Every role held, when it differs from `[role]`. */
  roles?: string[];
  classes?: { id: string; name: string }[];
  memberships?: unknown[];
  assignments?: unknown[];
  materials?: unknown[];
  membershipRow?: { id: string } | null;
}) {
  const classFindMany = vi
    .fn()
    .mockResolvedValue(
      overrides?.classes ?? [
        { id: classA, name: "Python A" },
        { id: classB, name: "Python B" },
      ],
    );
  const prisma = {
    academyMembership: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides?.membershipRow === undefined
            ? { id: "teacher-membership" }
            : overrides.membershipRow,
        ),
      findMany: vi.fn().mockResolvedValue(overrides?.memberships ?? []),
    },
    class: { findMany: classFindMany },
    classCourse: { findMany: vi.fn().mockResolvedValue(overrides?.assignments ?? []) },
    material: { findMany: vi.fn().mockResolvedValue(overrides?.materials ?? []) },
  } as unknown as PrismaService;

  const access = {
    requirePermission: vi.fn().mockResolvedValue({
      userId: "teacher-user",
      role: overrides?.role ?? "TEACHER",
      roles: overrides?.roles ?? [overrides?.role ?? "TEACHER"],
    }),
  } as unknown as AcademyAccessService;

  return {
    service: new TeacherOverviewAccessService(prisma, access),
    prisma,
    access,
    classFindMany,
  };
}

describe("TeacherOverviewAccessService", () => {
  it("refuses a role that is not TEACHER, whatever permission it holds", async () => {
    const { service } = createService({ role: "TEAM_LEAD" });
    await expect(
      service.requireScope(identity, { academyId }),
    ).rejects.toMatchObject({ code: "TEACHER_OVERVIEW_ACCESS_DENIED" });
  });

  /*
   * The regression this guards: a Manager granted TEACHER holds
   * `role = MANAGER`, so an exact comparison refused them the teaching
   * overview the grant exists to give — the page rendered
   * "This section could not load".
   */
  it("admits a manager who also holds teacher", async () => {
    const { service } = createService({
      role: "MANAGER",
      roles: ["TEACHER", "MANAGER"],
    });
    await expect(
      service.requireScope(identity, { academyId }),
    ).resolves.toBeDefined();
  });

  it("refuses an actor with no membership row in this academy", async () => {
    const { service } = createService({ membershipRow: null });
    await expect(
      service.requireScope(identity, { academyId }),
    ).rejects.toMatchObject({ code: "TEACHER_OVERVIEW_ACCESS_DENIED" });
  });

  it("selects classes through the assigned-teacher predicate, not by id", async () => {
    const { service, classFindMany } = createService();
    await service.requireScope(identity, { academyId });

    expect(classFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academyId,
          status: "ACTIVE",
          // Homeroom or assistant, with the same membership predicate on
          // either seat.
          OR: [
            {
              assignedTeacher: expect.objectContaining({
                id: "teacher-membership",
                // Set membership, so a manager who also teaches still matches.
                OR: [
                  { role: "TEACHER" },
                  { extraRoles: { some: { role: "TEACHER" } } },
                ],
                status: "ACTIVE",
              }),
            },
            {
              assistantTeachers: {
                some: {
                  teacher: expect.objectContaining({
                    id: "teacher-membership",
                    status: "ACTIVE",
                  }),
                },
              },
            },
          ],
        }),
      }),
    );
  });

  it("drops a class filter this teacher does not run rather than leaking its existence", async () => {
    const { service } = createService();
    const scope = await service.requireScope(identity, {
      academyId,
      classId: "30000000-0000-4000-8000-00000000000f",
    });

    // Not an error: a stale link renders the whole scope, and the response says
    // which scope it actually used.
    expect(scope.selectedClassId).toBeNull();
    expect(scope.classes).toHaveLength(2);
  });

  it("narrows to one class when the filter names one it does run", async () => {
    const { service } = createService();
    const scope = await service.requireScope(identity, {
      academyId,
      classId: classB,
    });

    expect(scope.selectedClassId).toBe(classB);
    expect(scope.classes.map((entry) => entry.classId)).toEqual([classB]);
  });

  it("returns an empty scope, not an error, for a teacher with no class", async () => {
    const { service } = createService({ classes: [] });
    const scope = await service.requireScope(identity, { academyId });

    expect(scope.classes).toEqual([]);
    expect(scope.students).toEqual([]);
    expect(scope.classOptions).toEqual([]);
  });

  it("counts a student in two classes once, carrying both class ids", async () => {
    const { service } = createService({
      memberships: [
        {
          id: "80000000-0000-4000-8000-000000000001",
          userId: "90000000-0000-4000-8000-000000000001",
          user: { displayName: "Bo", username: null, email: null },
          classEnrollments: [{ classId: classA }, { classId: classB }],
        },
      ],
      assignments: [
        { classId: classA, course: { id: courseOne, title: "Python 1" } },
        { classId: classB, course: { id: courseOne, title: "Python 1" } },
      ],
    });
    const scope = await service.requireScope(identity, { academyId });

    expect(scope.students).toHaveLength(1);
    expect(scope.students[0].classIds).toEqual([classA, classB]);
    expect(scope.courseOptions).toEqual([
      { value: courseOne, label: "Python 1", classIds: [classA, classB] },
    ]);
    // Both class rows hold the same person; the academy total does not double.
    expect(scope.classes.map((entry) => entry.students.length)).toEqual([1, 1]);
  });

  it("limits exercises to the selected course", async () => {
    const { service } = createService({
      assignments: [
        { classId: classA, course: { id: courseOne, title: "Python 1" } },
        { classId: classA, course: { id: courseTwo, title: "Python 2" } },
      ],
      materials: [
        material(courseOne, "70000000-0000-4000-8000-000000000001"),
        material(courseTwo, "70000000-0000-4000-8000-000000000002"),
      ],
      classes: [{ id: classA, name: "Python A" }],
    });
    const scope = await service.requireScope(identity, {
      academyId,
      courseId: courseTwo,
    });

    expect(scope.selectedCourseId).toBe(courseTwo);
    expect(scope.materialIds).toEqual([
      "70000000-0000-4000-8000-000000000002",
    ]);
    expect(scope.courseIds).toEqual([courseTwo]);
    // The picker still offers every assigned course.
    expect(scope.courseOptions).toHaveLength(2);
  });

  it("drops a course filter naming a course no selected class teaches", async () => {
    const { service } = createService({
      assignments: [
        { classId: classA, course: { id: courseOne, title: "Python 1" } },
      ],
      classes: [{ id: classA, name: "Python A" }],
    });
    const scope = await service.requireScope(identity, {
      academyId,
      courseId: courseTwo,
    });
    expect(scope.selectedCourseId).toBeNull();
  });

  it("never widens past the requested academy", async () => {
    const { service, access } = createService();
    await service.requireScope(identity, { academyId });
    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "classes.assigned.manage",
    );
    expect(access.requirePermission).not.toHaveBeenCalledWith(
      identity.authUserId,
      otherAcademy,
      expect.anything(),
    );
  });
});

function material(courseId: string, materialId: string) {
  return {
    id: materialId,
    title: "Count to ten",
    position: 1,
    lecture: {
      id: "50000000-0000-4000-8000-000000000001",
      title: "While loops",
      position: 3,
      courseModule: {
        title: "Repetition",
        position: 6,
        course: { id: courseId, title: "Course" },
      },
    },
  };
}
