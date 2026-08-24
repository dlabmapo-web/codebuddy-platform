import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PointsAccessService } from "./points-access.service.js";

const academyId = "10000000-0000-4000-8000-000000000001";
const classId = "20000000-0000-4000-8000-000000000002";
const membershipId = "30000000-0000-4000-8000-000000000003";
const identity: SupabaseIdentity = {
  authUserId: "auth-user",
  email: null,
  emailVerified: true,
  username: null,
  displayName: null,
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};

function createPrisma(role: "STUDENT" | "TEACHER" | "TEAM_LEAD" | "MANAGER") {
  return {
    academyMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: membershipId,
        role,
        user: { displayName: "Reader" },
        memberProfile: { academyDisplayName: null },
        academy: { timeZone: "Asia/Seoul", status: "ACTIVE" },
      }),
    },
    academyFeatureFlag: {
      findMany: vi.fn().mockResolvedValue([
        { feature: "STUDENT_POINTS" },
        { feature: "STUDENT_CLASS_LEADERBOARD" },
      ]),
    },
    classEnrollment: {
      findMany: vi.fn().mockResolvedValue([
        { classId, class: { name: "Python A" } },
      ]),
    },
    class: {
      findMany: vi.fn().mockResolvedValue([{ id: classId, name: "Python A" }]),
    },
  };
}

describe("PointsAccessService.resolveOverviewBoard", () => {
  it("scopes a student to enrolled classes", async () => {
    const prisma = createPrisma("STUDENT");
    const scope = await new PointsAccessService(
      prisma as unknown as PrismaService,
    ).resolveOverviewBoard(identity, { academyId });

    expect(scope.isSelf).toBe(true);
    expect(scope.classes).toEqual([{ classId, name: "Python A" }]);
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  it("scopes a teacher query to assigned active classes", async () => {
    const prisma = createPrisma("TEACHER");
    const scope = await new PointsAccessService(
      prisma as unknown as PrismaService,
    ).resolveOverviewBoard(identity, { academyId, classId });

    expect(scope.isSelf).toBe(false);
    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          academyId,
          status: "ACTIVE",
          teacherMembershipId: membershipId,
        },
      }),
    );
  });

  it("rejects a requested class outside the resolved list", async () => {
    const prisma = createPrisma("MANAGER");
    await expect(
      new PointsAccessService(
        prisma as unknown as PrismaService,
      ).resolveOverviewBoard(identity, {
        academyId,
        classId: "90000000-0000-4000-8000-000000000009",
      }),
    ).rejects.toMatchObject({ code: "POINTS_ACCESS_DENIED" });
  });

  it("requires both points flags before reading classes", async () => {
    const prisma = createPrisma("TEAM_LEAD");
    prisma.academyFeatureFlag.findMany.mockResolvedValue([
      { feature: "STUDENT_POINTS" },
    ]);

    await expect(
      new PointsAccessService(
        prisma as unknown as PrismaService,
      ).resolveOverviewBoard(identity, { academyId }),
    ).rejects.toMatchObject({ code: "POINTS_UNAVAILABLE" });
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });
});
