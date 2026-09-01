import { describe, expect, it, vi } from "vitest";

import { AcademyAccessService } from "./academy-access.service.js";
import type { SupportGrantResolver } from "./support-grant.resolver.js";
import type { PrismaService } from "../database/prisma.service.js";

const authUserId = "10000000-0000-4000-8000-000000000001";

function serviceWith(count: number) {
  const academyMembership = { count: vi.fn().mockResolvedValue(count) };
  const prisma = { academyMembership } as unknown as PrismaService;
  // A resolver that never finds a grant. `isStudentAnywhere` reads memberships
  // directly and must keep doing so: a support grant must never put an
  // operator under the student inactivity lease, nor lift it for anybody else.
  const supportGrants = {
    findLive: vi.fn().mockResolvedValue(null),
  } as unknown as SupportGrantResolver;
  return {
    service: new AcademyAccessService(prisma, supportGrants),
    academyMembership,
    supportGrants,
  };
}

/**
 * Who the thirty-minute inactivity policy applies to.
 *
 * This is the question that was never asked: `beginStudentSession` runs for
 * everyone who signs in, so a manager was handed a student's lease with
 * nothing to renew it, and thirty minutes later every learning read failed
 * with an expiry they could not clear by signing in again.
 */
describe("AcademyAccessService.isStudentAnywhere", () => {
  it("answers true for an active student", async () => {
    const { service } = serviceWith(1);

    await expect(service.isStudentAnywhere(authUserId)).resolves.toBe(true);
  });

  it("answers false for staff, who are not held to the student clock", async () => {
    const { service } = serviceWith(0);

    await expect(service.isStudentAnywhere(authUserId)).resolves.toBe(false);
  });

  it("counts only active student seats in active academies", async () => {
    // A suspended membership, a closed academy, or a seat that has since been
    // promoted to teacher must not keep somebody under a student's policy.
    const { service, academyMembership } = serviceWith(0);

    await service.isStudentAnywhere(authUserId);

    expect(academyMembership.count).toHaveBeenCalledWith({
      where: {
        role: "STUDENT",
        status: "ACTIVE",
        user: { authUserId },
        academy: { status: "ACTIVE" },
      },
    });
  });

  it("asks for a count rather than loading memberships", async () => {
    // It runs on every request to the learning surfaces, and the answer is
    // one bit.
    const { service, academyMembership } = serviceWith(3);

    await service.isStudentAnywhere(authUserId);

    expect(academyMembership.count).toHaveBeenCalledTimes(1);
  });
});
