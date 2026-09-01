import { describe, expect, it, vi } from "vitest";

import { AcademyAccessService } from "./academy-access.service.js";
import type { LiveSupportGrant, SupportGrantResolver } from "./support-grant.resolver.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AppException } from "../common/app-exception.js";

const authUserId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000002";
const academyId = "30000000-0000-4000-8000-000000000003";

function grant(overrides: Partial<LiveSupportGrant> = {}): LiveSupportGrant {
  return {
    id: "40000000-0000-4000-8000-000000000004",
    academyId,
    assumedRole: "MANAGER",
    readOnly: false,
    allowMonitoring: false,
    reason: "Investigating a grading report from the manager.",
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function serviceWith(options: {
  userStatus?: "ACTIVE" | "SUSPENDED" | "PENDING_PROFILE";
  membership?: { role: string; status: string; academyStatus: string } | null;
  academyStatus?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  liveGrant?: LiveSupportGrant | null;
}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: userId,
        status: options.userStatus ?? "ACTIVE",
      }),
    },
    academyMembership: {
      findUnique: vi.fn().mockResolvedValue(
        options.membership
          ? {
              role: options.membership.role,
              status: options.membership.status,
              academy: { status: options.membership.academyStatus },
            }
          : null,
      ),
    },
    academy: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ status: options.academyStatus ?? "ACTIVE" }),
    },
  } as unknown as PrismaService;

  const supportGrants = {
    findLive: vi.fn().mockResolvedValue(options.liveGrant ?? null),
  } as unknown as SupportGrantResolver;

  return { service: new AcademyAccessService(prisma, supportGrants), prisma };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_ERROR";
  } catch (error) {
    return error instanceof AppException ? error.code : "UNEXPECTED";
  }
}

/**
 * The one branch that lets platform authority reach academy data.
 *
 * Every test here describes something a customer would care about, which is
 * why they are worth more than the sum of their assertions: this is the file
 * that says what Cove staff can and cannot do inside somebody's academy.
 */
describe("AcademyAccessService support grants", () => {
  it("lets a live grant stand in for a membership", async () => {
    const { service } = serviceWith({ membership: null, liveGrant: grant() });

    await expect(
      service.requirePermission(authUserId, academyId, "academy.members.manage"),
    ).resolves.toMatchObject({
      role: "MANAGER",
      via: "support",
      supportGrantId: "40000000-0000-4000-8000-000000000004",
    });
  });

  it("prefers a real membership over a live grant", async () => {
    // A forgotten open grant must not silently upgrade somebody's real role.
    const { service } = serviceWith({
      membership: { role: "TEACHER", status: "ACTIVE", academyStatus: "ACTIVE" },
      liveGrant: grant({ assumedRole: "MANAGER" }),
    });

    await expect(
      service.requirePermission(authUserId, academyId, "academy.read"),
    ).resolves.toMatchObject({ role: "TEACHER", via: "membership" });
  });

  it("refuses a suspended account even with a live grant", async () => {
    const { service } = serviceWith({
      userStatus: "SUSPENDED",
      membership: null,
      liveGrant: grant(),
    });

    expect(
      await codeOf(
        service.requirePermission(authUserId, academyId, "academy.read"),
      ),
    ).toBe("USER_SUSPENDED");
  });

  it("keeps a suspended membership a refusal rather than falling through", async () => {
    // The academy made a decision about this person. Support access is not the
    // tool for overruling it.
    const { service } = serviceWith({
      membership: {
        role: "MANAGER",
        status: "SUSPENDED",
        academyStatus: "ACTIVE",
      },
      liveGrant: grant(),
    });

    expect(
      await codeOf(
        service.requirePermission(authUserId, academyId, "academy.read"),
      ),
    ).toBe("ACADEMY_MEMBERSHIP_SUSPENDED");
  });

  it("answers the ordinary membership refusal when there is no grant", async () => {
    // An operator probing an academy must not learn from the error code
    // whether a grant would have worked.
    const { service } = serviceWith({ membership: null, liveGrant: null });

    expect(
      await codeOf(
        service.requirePermission(authUserId, academyId, "academy.read"),
      ),
    ).toBe("ACADEMY_MEMBERSHIP_REQUIRED");
  });

  it("names the read-only mistake instead of refusing anonymously", async () => {
    const { service } = serviceWith({
      membership: null,
      liveGrant: grant({ readOnly: true }),
    });

    expect(
      await codeOf(
        service.requirePermission(
          authUserId,
          academyId,
          "academy.members.manage",
        ),
      ),
    ).toBe("SUPPORT_GRANT_READ_ONLY");
  });

  it("still serves reads on a read-only grant", async () => {
    const { service } = serviceWith({
      membership: null,
      liveGrant: grant({ readOnly: true }),
    });

    await expect(
      service.requirePermission(authUserId, academyId, "academy.read"),
    ).resolves.toMatchObject({ via: "support" });
  });

  it("never lets a grant submit work as a student", async () => {
    // The exclusion that matters most, checked through the real access path
    // rather than only against the pure function.
    const { service } = serviceWith({
      membership: null,
      liveGrant: grant({ assumedRole: "MANAGER", readOnly: false }),
    });

    expect(
      await codeOf(
        service.requirePermission(
          authUserId,
          academyId,
          "submissions.own.create",
        ),
      ),
    ).toBe("ACADEMY_MEMBERSHIP_REQUIRED");
  });

  it("withholds monitoring unless the grant allows it", async () => {
    const { service } = serviceWith({
      membership: null,
      liveGrant: grant({ assumedRole: "TEACHER", allowMonitoring: false }),
    });

    expect(
      await codeOf(
        service.requirePermission(
          authUserId,
          academyId,
          "classes.assigned.manage",
        ),
      ),
    ).toBe("ACADEMY_MEMBERSHIP_REQUIRED");
  });

  it("serves a suspended academy, which is when support is most needed", async () => {
    const { service } = serviceWith({
      membership: null,
      academyStatus: "SUSPENDED",
      liveGrant: grant(),
    });

    await expect(
      service.requirePermission(authUserId, academyId, "academy.read"),
    ).resolves.toMatchObject({ via: "support" });
  });

  it("allows only reads on an archived academy", async () => {
    const { service } = serviceWith({
      membership: null,
      academyStatus: "ARCHIVED",
      liveGrant: grant({ readOnly: false }),
    });

    expect(
      await codeOf(
        service.requirePermission(authUserId, academyId, "academy.read"),
      ),
    ).toBe("ACADEMY_MEMBERSHIP_REQUIRED");

    const readable = serviceWith({
      membership: null,
      academyStatus: "ARCHIVED",
      liveGrant: grant({ readOnly: true }),
    });
    await expect(
      readable.service.requirePermission(
        authUserId,
        academyId,
        "academy.read",
      ),
    ).resolves.toMatchObject({ via: "support" });
  });

  it("marks membership access as such, so audit can tell them apart", async () => {
    const { service } = serviceWith({
      membership: { role: "MANAGER", status: "ACTIVE", academyStatus: "ACTIVE" },
    });

    const access = await service.requirePermission(
      authUserId,
      academyId,
      "academy.read",
    );
    expect(access.via).toBe("membership");
    expect(access.supportGrantId).toBeUndefined();
  });
});
