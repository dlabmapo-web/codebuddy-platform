import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PointsAccessService } from "./points-access.service.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";

/**
 * An access service that refuses everything.
 *
 * These cases are all about a reader who *has* a membership, so the platform
 * fallback must never be the thing that answers them — a stub that granted
 * access would let a broken membership path pass by the back door.
 */
const deniedAccess = {
  requirePermission: () => Promise.reject(new Error("no platform access")),
} as unknown as AcademyAccessService;

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
      deniedAccess,
    ).resolveOverviewBoard(identity, { academyId });

    expect(scope.isSelf).toBe(true);
    expect(scope.classes).toEqual([{ classId, name: "Python A" }]);
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  it("scopes a teacher query to assigned active classes", async () => {
    const prisma = createPrisma("TEACHER");
    const scope = await new PointsAccessService(
      prisma as unknown as PrismaService,
      deniedAccess,
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
      deniedAccess,
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
      deniedAccess,
    ).resolveOverviewBoard(identity, { academyId }),
    ).rejects.toMatchObject({ code: "POINTS_UNAVAILABLE" });
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });
});

/**
 * A platform operator: no membership anywhere, and a permission check that
 * says yes.
 *
 * The membership lookup returning `null` is the whole trigger for the platform
 * branch, so it is what these fixtures change. `studentMembership` is the child
 * an operator is reading — a second `findFirst` result, returned only when the
 * query names a subject.
 */
const grantedAccess = {
  requirePermission: vi.fn().mockResolvedValue({ via: "platform" }),
} as unknown as AcademyAccessService;

const studentMembershipId = "50000000-0000-4000-8000-000000000005";

function createOperatorPrisma(
  student: {
    id: string;
    user: { displayName: string | null };
    memberProfile: { academyDisplayName: string | null } | null;
  } | null = {
    id: studentMembershipId,
    user: { displayName: "Account Name" },
    memberProfile: { academyDisplayName: "지호" },
  },
) {
  const findFirst = vi.fn().mockImplementation(({ where }) =>
    // The reader lookup filters on the auth user; the subject lookup filters on
    // a membership id. Telling them apart here is what lets one mock serve
    // both calls the platform path makes.
    Promise.resolve("id" in where ? student : null),
  );
  return {
    academyMembership: { findFirst },
    academy: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ timeZone: "Asia/Seoul", status: "ACTIVE" }),
    },
    academyFeatureFlag: {
      findMany: vi.fn().mockResolvedValue([
        { feature: "STUDENT_POINTS" },
        { feature: "STUDENT_CLASS_LEADERBOARD" },
      ]),
    },
    classEnrollment: { findMany: vi.fn() },
    class: {
      findMany: vi.fn().mockResolvedValue([{ id: classId, name: "Python A" }]),
    },
  };
}

describe("PointsAccessService.resolve, for a platform operator", () => {
  it("resolves the named student as the subject", async () => {
    const prisma = createOperatorPrisma();
    const scope = await new PointsAccessService(
      prisma as unknown as PrismaService,
      grantedAccess,
    ).resolve(identity, { academyId, membershipId: studentMembershipId });

    expect(scope.membershipId).toBe(studentMembershipId);
    // The academy's own name for the child, not the account's — §17.
    expect(scope.subjectName).toBe("지호");
    // The operator is not the subject and is on no ranking. A regression here
    // would light `isYou` on a child's row on somebody else's screen.
    expect(scope.isSelf).toBe(false);
  });

  it("falls back to the account display name, never to a blank", async () => {
    const prisma = createOperatorPrisma({
      id: studentMembershipId,
      user: { displayName: "Account Name" },
      memberProfile: { academyDisplayName: null },
    });
    const scope = await new PointsAccessService(
      prisma as unknown as PrismaService,
      grantedAccess,
    ).resolve(identity, { academyId, membershipId: studentMembershipId });

    // Any non-empty name satisfies `labelSchema`; an empty one fails the
    // page's own output contract, which is the defect this path had.
    expect(scope.subjectName).toBe("Account Name");
    expect(scope.subjectName.length).toBeGreaterThan(0);
  });

  it("scopes the subject lookup to this academy, and to active students", async () => {
    const prisma = createOperatorPrisma();
    await new PointsAccessService(
      prisma as unknown as PrismaService,
      grantedAccess,
    ).resolve(identity, { academyId, membershipId: studentMembershipId });

    expect(prisma.academyMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: studentMembershipId,
          academyId,
          role: "STUDENT",
          status: "ACTIVE",
        },
      }),
    );
  });

  it("refuses a membership it cannot resolve, as not-found", async () => {
    // A student in another academy, a staff membership, or an id that does not
    // exist all arrive here as `null` — and all get the same answer, so the
    // refusal cannot be used to test ids.
    const prisma = createOperatorPrisma(null);

    await expect(
      new PointsAccessService(
        prisma as unknown as PrismaService,
        grantedAccess,
      ).resolve(identity, { academyId, membershipId: studentMembershipId }),
    ).rejects.toMatchObject({ code: "POINTS_ACCESS_DENIED" });
  });

  it("keeps the blank subject when no student is named", async () => {
    const prisma = createOperatorPrisma();
    const scope = await new PointsAccessService(
      prisma as unknown as PrismaService,
      grantedAccess,
    ).resolve(identity, { academyId });

    expect(scope.membershipId).toBe("");
    expect(scope.isSelf).toBe(false);
  });
});

describe("PointsAccessService board paths, for a platform operator", () => {
  it("leaves the class board's subject blank, so no row is marked as theirs", async () => {
    const prisma = createOperatorPrisma();
    const scope = await new PointsAccessService(
      prisma as unknown as PrismaService,
      grantedAccess,
    ).resolveClassBoard(identity, { academyId });

    expect(scope.membershipId).toBe("");
    expect(scope.isSelf).toBe(false);
    expect(scope.className).toBe("Python A");
    // The subject lookup must not run at all on a board path.
    expect(prisma.academyMembership.findFirst).toHaveBeenCalledTimes(1);
  });

  it("leaves the overview board's subject blank", async () => {
    const prisma = createOperatorPrisma();
    const scope = await new PointsAccessService(
      prisma as unknown as PrismaService,
      grantedAccess,
    ).resolveOverviewBoard(identity, { academyId });

    expect(scope.membershipId).toBe("");
    expect(scope.isSelf).toBe(false);
  });
});
