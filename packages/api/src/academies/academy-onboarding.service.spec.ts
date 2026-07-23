import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import { AcademyOnboardingService } from "./academy-onboarding.service.js";

function createService(overrides?: {
  academy?: { id: string } | null;
  membership?: { id: string } | null;
  previousRequest?: { id: string } | null;
}) {
  const prisma = {
    academy: {
      findFirst: vi.fn().mockResolvedValue(
        overrides && "academy" in overrides
          ? overrides.academy
          : { id: "20000000-0000-4000-8000-000000000001" },
      ),
    },
    academyMembership: {
      findUnique: vi.fn().mockResolvedValue(overrides?.membership ?? null),
    },
    academyJoinRequest: {
      findFirst: vi.fn().mockResolvedValue(overrides?.previousRequest ?? null),
      create: vi.fn().mockResolvedValue({ id: "request-id" }),
    },
  } as unknown as PrismaService;
  return {
    prisma,
    service: new AcademyOnboardingService(prisma),
  };
}

describe("AcademyOnboardingService.ensureSignupRequest", () => {
  it("creates one pending request for a verified user and active academy", async () => {
    const { prisma, service } = createService();
    await service.ensureSignupRequest(
      "30000000-0000-4000-8000-000000000009",
      "20000000-0000-4000-8000-000000000001",
      true,
    );
    expect(prisma.academyJoinRequest.create).toHaveBeenCalledOnce();
    expect(prisma.academyJoinRequest.create).toHaveBeenCalledWith({
      data: {
        academyId: "20000000-0000-4000-8000-000000000001",
        userId: "30000000-0000-4000-8000-000000000009",
      },
    });
  });

  it("does not recreate any prior academy request", async () => {
    const { prisma, service } = createService({
      previousRequest: { id: "existing-request" },
    });
    await service.ensureSignupRequest(
      "30000000-0000-4000-8000-000000000009",
      "20000000-0000-4000-8000-000000000001",
      true,
    );
    expect(prisma.academyJoinRequest.create).not.toHaveBeenCalled();
  });

  it("does nothing until the email is verified", async () => {
    const { prisma, service } = createService();
    await service.ensureSignupRequest(
      "30000000-0000-4000-8000-000000000009",
      "20000000-0000-4000-8000-000000000001",
      false,
    );
    expect(prisma.academy.findFirst).not.toHaveBeenCalled();
    expect(prisma.academyJoinRequest.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive or unknown academy", async () => {
    const { service } = createService({ academy: null });
    await expect(service.ensureSignupRequest(
      "30000000-0000-4000-8000-000000000009",
      "20000000-0000-4000-8000-000000000099",
      true,
    )).rejects.toMatchObject({ code: "ACADEMY_NOT_FOUND" });
  });
});
