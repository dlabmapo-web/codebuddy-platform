import { describe, expect, it, vi } from "vitest";

import type { AcademyOnboardingService } from "../academies/academy-onboarding.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "./auth.service.js";
import type { SupabaseIdentity } from "./auth.types.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const authUserId = "90000000-0000-4000-8000-000000000001";
const userId = "91000000-0000-4000-8000-000000000001";

const identity: SupabaseIdentity = {
  authUserId,
  email: "social@example.com",
  emailVerified: true,
  displayName: "Social User",
  avatarUrl: null,
  provider: "google",
  requestedAcademyId: null,
};

function userRecord() {
  return {
    id: userId,
    authUserId,
    email: identity.email,
    displayName: identity.displayName,
    avatarUrl: null,
    platformRole: "USER",
    status: "ACTIVE",
    legacyUserId: null,
    legacyUsername: null,
    legacyPasswordHash: null,
    migratedAt: null,
    lastSignInAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    memberships: [],
    joinRequests: [],
  } as const;
}

function createCompletionService(provider = "google") {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    oAuthOnboardingIntent: {
      findUnique: vi.fn().mockResolvedValue({
        id: "92000000-0000-4000-8000-000000000001",
        academyId,
        provider,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60_000),
        consumedByAuthUserId: null,
        academy: { status: "ACTIVE" },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      create: vi.fn().mockResolvedValue({ id: userId, status: "ACTIVE" }),
      update: vi.fn(),
    },
    academyMembership: { findUnique: vi.fn().mockResolvedValue(null) },
    academyJoinRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "request-id" }),
    },
  };
  const prisma = {
    oAuthOnboardingIntent: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: { findUnique: vi.fn().mockResolvedValue(userRecord()) },
    $transaction: vi.fn(async (
      callback: (client: typeof transaction) => Promise<string>,
    ) => callback(transaction)),
  } as unknown as PrismaService;
  const onboarding = {} as AcademyOnboardingService;
  return {
    prisma,
    transaction,
    service: new AuthService(prisma, onboarding),
  };
}

describe("AuthService.completeOAuthOnboarding", () => {
  it("requires an onboarding intent for a new social identity", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as AcademyOnboardingService);

    await expect(service.completeOAuthOnboarding(identity)).rejects.toMatchObject({
      code: "OAUTH_ONBOARDING_INTENT_REQUIRED",
    });
  });

  it("atomically creates a Cove user, pending request, and consumption record", async () => {
    const { service, transaction } = createCompletionService();
    const result = await service.completeOAuthOnboarding(
      identity,
      "intent-token-that-is-at-least-thirty-two-bytes",
    );

    expect(result.user.id).toBe(userId);
    expect(transaction.academyJoinRequest.create).toHaveBeenCalledWith({
      data: { academyId, userId },
    });
    expect(transaction.oAuthOnboardingIntent.update).toHaveBeenCalledWith({
      where: { id: "92000000-0000-4000-8000-000000000001" },
      data: expect.objectContaining({
        status: "CONSUMED",
        consumedByAuthUserId: authUserId,
      }),
    });
  });

  it("rejects a provider mismatch before creating the user", async () => {
    const { service, transaction } = createCompletionService("kakao");
    await expect(service.completeOAuthOnboarding(
      identity,
      "intent-token-that-is-at-least-thirty-two-bytes",
    )).rejects.toMatchObject({ code: "OAUTH_PROVIDER_MISMATCH" });
    expect(transaction.user.create).not.toHaveBeenCalled();
  });
});
