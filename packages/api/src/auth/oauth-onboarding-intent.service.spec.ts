import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import {
  hashOAuthOnboardingToken,
  OAuthOnboardingIntentService,
} from "./oauth-onboarding-intent.service.js";

function createService(academy: { id: string } | null = {
  id: "20000000-0000-4000-8000-000000000001",
}) {
  const prisma = {
    academy: { findFirst: vi.fn().mockResolvedValue(academy) },
    oAuthOnboardingIntent: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "intent-id" }),
    },
  } as unknown as PrismaService;
  return {
    prisma,
    service: new OAuthOnboardingIntentService(prisma),
  };
}

describe("OAuthOnboardingIntentService", () => {
  it("creates a hashed, short-lived intent for an active academy", async () => {
    const { prisma, service } = createService();
    const result = await service.create({
      academyId: "20000000-0000-4000-8000-000000000001",
      provider: "google",
    });

    expect(result.token.length).toBeGreaterThanOrEqual(43);
    expect(prisma.oAuthOnboardingIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        academyId: "20000000-0000-4000-8000-000000000001",
        provider: "google",
        tokenHash: hashOAuthOnboardingToken(result.token),
      }),
    });
    expect(JSON.stringify(
      vi.mocked(prisma.oAuthOnboardingIntent.create).mock.calls,
    )).not.toContain(result.token);
  });

  it("rejects an inactive or unknown academy", async () => {
    const { service } = createService(null);
    await expect(service.create({
      academyId: "20000000-0000-4000-8000-000000000099",
      provider: "google",
    })).rejects.toMatchObject({ code: "ACADEMY_NOT_FOUND" });
  });
});
