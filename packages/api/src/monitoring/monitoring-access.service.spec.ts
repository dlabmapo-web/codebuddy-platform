import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import { MonitoringAccessService } from "./monitoring-access.service.js";

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
const teacherUserId = "30000000-0000-4000-8000-000000000001";
const teacherMembershipId = "40000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const studentUserId = "70000000-0000-4000-8000-000000000001";
const materialId = "80000000-0000-4000-8000-000000000001";
const courseId = "90000000-0000-4000-8000-000000000001";

const actor = { userId: teacherUserId, academyId, membershipId: teacherMembershipId };
const classClaim = { ...actor, classId, grantedAt: Date.now() };
const studentClaim = {
  ...classClaim,
  studentMembershipId,
  studentUserId,
};

function createService(options?: {
  role?: "TEACHER" | "TEAM_LEAD" | "MANAGER" | "STUDENT";
  permissionError?: AppException;
  featureEnabled?: boolean | null;
  teacherMembership?: { id: string } | null;
  classRecord?: { id: string } | null;
  studentMembership?: { id: string; userId: string } | null;
  material?: unknown;
}) {
  const prisma = {
    academyFeatureFlag: {
      findUnique: vi.fn().mockResolvedValue(
        options?.featureEnabled === null || options?.featureEnabled === undefined
          ? null
          : { isEnabled: options.featureEnabled },
      ),
    },
    academyMembership: {
      findUnique: vi.fn().mockResolvedValue(
        options?.teacherMembership === undefined
          ? { id: teacherMembershipId }
          : options.teacherMembership,
      ),
      findFirst: vi.fn().mockResolvedValue(
        options?.studentMembership === undefined
          ? { id: studentMembershipId, userId: studentUserId }
          : options.studentMembership,
      ),
    },
    class: {
      findFirst: vi.fn().mockResolvedValue(
        options?.classRecord === undefined ? { id: classId } : options.classRecord,
      ),
    },
    material: {
      findFirst: vi.fn().mockResolvedValue(
        options?.material === undefined
          ? { id: materialId, lecture: { courseModule: { courseId } } }
          : options.material,
      ),
    },
  } as unknown as PrismaService;

  const access = {
    requirePermission: vi.fn().mockImplementation(() => {
      if (options?.permissionError) return Promise.reject(options.permissionError);
      return Promise.resolve({
        userId: teacherUserId,
        academyId,
        role: options?.role ?? "TEACHER",
      });
    }),
  } as unknown as AcademyAccessService;

  return {
    service: new MonitoringAccessService(prisma, access),
    prisma: prisma as unknown as {
      academyFeatureFlag: { findUnique: ReturnType<typeof vi.fn> };
      academyMembership: {
        findUnique: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
      };
      class: { findFirst: ReturnType<typeof vi.fn> };
      material: { findFirst: ReturnType<typeof vi.fn> };
    },
    access: access as unknown as {
      requirePermission: ReturnType<typeof vi.fn>;
    },
  };
}

describe("isFeatureEnabled", () => {
  it("treats a missing flag row as off", async () => {
    const { service } = createService({ featureEnabled: null });
    await expect(service.isFeatureEnabled(academyId)).resolves.toBe(false);
  });

  it("reads the stored switch when the academy has one", async () => {
    const { service } = createService({ featureEnabled: true });
    await expect(service.isFeatureEnabled(academyId)).resolves.toBe(true);
  });

  it("refuses monitoring while the academy is outside the rollout", async () => {
    const { service } = createService({ featureEnabled: false });
    await expect(service.requireFeature(academyId)).rejects.toMatchObject({
      code: "MONITORING_DISABLED",
    });
  });
});

describe("requireTeacher", () => {
  it("resolves the acting teacher's own membership", async () => {
    const { service } = createService();
    await expect(service.requireTeacher(identity, academyId)).resolves.toEqual({
      userId: teacherUserId,
      academyId,
      membershipId: teacherMembershipId,
    });
  });

  it("asks for the assigned-teacher permission", async () => {
    const { service, access } = createService();
    await service.requireTeacher(identity, academyId);
    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "classes.assigned.manage",
    );
  });

  it("refuses a team lead, who holds the permission but is not a teacher", async () => {
    const { service } = createService({ role: "TEAM_LEAD" });
    await expect(service.requireTeacher(identity, academyId)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("refuses a manager and a student", async () => {
    for (const role of ["MANAGER", "STUDENT"] as const) {
      const { service } = createService({ role });
      await expect(service.requireTeacher(identity, academyId)).rejects
        .toMatchObject({ code: "PERMISSION_DENIED" });
    }
  });

  it("passes the underlying membership failure through", async () => {
    const { service } = createService({
      permissionError: new AppException("ACADEMY_MEMBERSHIP_SUSPENDED", 403),
    });
    await expect(service.requireTeacher(identity, academyId)).rejects
      .toMatchObject({ code: "ACADEMY_MEMBERSHIP_SUSPENDED" });
  });
});

describe("requireAssignedClass", () => {
  it("returns a claim for the effective assigned teacher", async () => {
    const { service } = createService();
    await expect(service.requireAssignedClass(actor, classId)).resolves
      .toMatchObject({ classId, membershipId: teacherMembershipId, academyId });
  });

  it("queries every fact of the effective-assignment predicate", async () => {
    const { service, prisma } = createService();
    await service.requireAssignedClass(actor, classId);
    expect(prisma.class.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: classId,
          academyId,
          status: "ACTIVE",
          teacherMembershipId,
          assignedTeacher: {
            academyId,
            userId: teacherUserId,
            role: "TEACHER",
            status: "ACTIVE",
            user: { status: "ACTIVE" },
          },
        },
      }),
    );
  });

  it("denies with one code whatever the reason was", async () => {
    const { service } = createService({ classRecord: null });
    await expect(service.requireAssignedClass(actor, classId)).rejects
      .toMatchObject({ code: "MONITORING_ACCESS_DENIED" });
  });
});

describe("requireMonitorableStudent", () => {
  it("returns the student's membership and user", async () => {
    const { service } = createService();
    await expect(service.requireMonitorableStudent(classClaim, studentMembershipId))
      .resolves.toMatchObject({ studentMembershipId, studentUserId });
  });

  it("requires an active student membership enrolled in this class", async () => {
    const { service, prisma } = createService();
    await service.requireMonitorableStudent(classClaim, studentMembershipId);
    expect(prisma.academyMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: studentMembershipId,
          academyId,
          role: "STUDENT",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          classEnrollments: { some: { classId } },
        },
      }),
    );
  });

  it("refuses a student who does not satisfy every condition", async () => {
    const { service } = createService({ studentMembership: null });
    await expect(service.requireMonitorableStudent(classClaim, studentMembershipId))
      .rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });
});

describe("requireMonitorableMaterial", () => {
  it("returns the material and its owning course", async () => {
    const { service } = createService();
    await expect(service.requireMonitorableMaterial(studentClaim, materialId))
      .resolves.toMatchObject({ materialId, courseId });
  });

  it("measures reachability through this class's own assignments", async () => {
    const { service, prisma } = createService();
    await service.requireMonitorableMaterial(studentClaim, materialId);
    const call = prisma.material.findFirst.mock.calls[0]![0] as {
      where: { AND: unknown[] };
    };
    expect(call.where.AND).toContainEqual({
      lecture: {
        courseModule: { course: { classAssignments: { some: { classId } } } },
      },
    });
  });

  it("applies the whole visibility chain, not only the problem's own flag", async () => {
    const { service, prisma } = createService();
    await service.requireMonitorableMaterial(studentClaim, materialId);
    const call = prisma.material.findFirst.mock.calls[0]![0] as {
      where: { AND: unknown[] };
    };
    expect(call.where.AND).toContainEqual({
      isVisible: true,
      programmingExercise: { isNot: null },
      lecture: {
        isVisible: true,
        courseModule: { isVisible: true, course: { academyId, isVisible: true } },
      },
    });
  });

  it("refuses an exercise the class is not taught", async () => {
    const { service } = createService({ material: null });
    await expect(service.requireMonitorableMaterial(studentClaim, materialId))
      .rejects.toMatchObject({ code: "MONITORING_STUDENT_UNAVAILABLE" });
  });
});
