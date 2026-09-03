import { describe, expect, it, vi } from "vitest";

import type { AcademyOnboardingService } from "../academies/academy-onboarding.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import type { SupabaseAuthService } from "./supabase-auth.service.js";
import { AuthService } from "./auth.service.js";
import type { SupabaseIdentity } from "./auth.types.js";

/**
 * No account in these fixtures holds a Cove image, so signing is never
 * reached. The stub exists to satisfy the constructor, not to be exercised.
 */
const media = {} as ProfileMediaService;

/**
 * Only `signUpStudent` reaches Supabase, and nothing in this file exercises it.
 * A stub that would throw if it were touched is more useful than a permissive
 * one: it keeps a future test from silently creating a real identity.
 */
const supabaseAuth = () =>
  ({
    createStudentUser: vi.fn(() => {
      throw new Error("unexpected Supabase call");
    }),
    deleteUser: vi.fn(),
  }) as unknown as SupabaseAuthService;

const academyId = "20000000-0000-4000-8000-000000000001";
const authUserId = "90000000-0000-4000-8000-000000000001";
const userId = "91000000-0000-4000-8000-000000000001";

const identity: SupabaseIdentity = {
  authUserId,
  email: "social@example.com",
  emailIsPlaceholder: false,
  emailVerified: true,
  username: null,
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
    emailIsPlaceholder: false,
    username: null,
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
    service: new AuthService(prisma, onboarding, media, supabaseAuth()),
  };
}

describe("AuthService.bootstrap username claim", () => {
  const usernameConflict = Object.assign(new Error("unique"), {
    code: "P2002",
    meta: { target: ["users_username_key"] },
  });
  const signup: SupabaseIdentity = { ...identity, username: "minsu01" };

  function createService(createResults: unknown[]) {
    const create = vi.fn();
    for (const result of createResults) {
      create.mockImplementationOnce(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      );
    }
    const update = vi.fn();
    const prisma = {
      user: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValue(userRecord()),
        create,
        update,
      },
    } as unknown as PrismaService;
    const onboarding = {
      ensureSignupRequest: vi.fn().mockResolvedValue(undefined),
    } as unknown as AcademyOnboardingService;
    return { create, update, service: new AuthService(prisma, onboarding, media, supabaseAuth()) };
  }

  it("stores the signup username on the new profile", async () => {
    const { create, service } = createService([
      { ...userRecord(), username: "minsu01" },
    ]);

    await service.bootstrap(signup);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      username: "minsu01",
    });
  });

  /**
   * The person already holds a Supabase identity by this point, so losing the
   * race has to cost them the name and not the account.
   */
  it("creates the profile without a username when the name was taken", async () => {
    const { create, service } = createService([
      usernameConflict,
      userRecord(),
    ]);

    const result = await service.bootstrap(signup);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0].data).not.toHaveProperty("username");
    expect(result.user.username).toBeNull();
  });

  it("does not swallow a conflict on another column", async () => {
    const emailConflict = Object.assign(new Error("unique"), {
      code: "P2002",
      meta: { target: ["users_email_key"] },
    });
    const { create, service } = createService([emailConflict]);

    await expect(service.bootstrap(signup)).rejects.toBe(emailConflict);
    expect(create).toHaveBeenCalledTimes(1);
  });

  /**
   * The claim arrives in client-writable user metadata, so honoring it on a
   * later sign-in would turn editing that metadata into a rename.
   */
  it("never overwrites a username an account already holds", async () => {
    const update = vi.fn().mockResolvedValue({
      ...userRecord(),
      username: "original",
    });
    const prisma = {
      user: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ ...userRecord(), username: "original" })
          .mockResolvedValue({ ...userRecord(), username: "original" }),
        update,
      },
    } as unknown as PrismaService;
    const onboarding = {
      ensureSignupRequest: vi.fn().mockResolvedValue(undefined),
    } as unknown as AcademyOnboardingService;

    const result = await new AuthService(prisma, onboarding, media, supabaseAuth()).bootstrap({
      ...identity,
      username: "somebody-else",
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0].data).not.toHaveProperty("username");
    expect(result.user.username).toBe("original");
  });
});

describe("AuthService.me profile images", () => {
  it("returns global and academy image URLs in one signed batch", async () => {
    const globalAsset = {
      id: "global-asset",
      bucket: "profile-images",
      objectKey: "global/user/global-asset.webp",
    };
    const academyAsset = {
      id: "academy-asset",
      bucket: "profile-images",
      objectKey: "academy/a/member/academy-asset.webp",
    };
    const record = {
      ...userRecord(),
      avatarAsset: globalAsset,
      memberships: [{
        academy: {
          id: academyId,
          name: "Cove Academy",
          slug: "cove-academy",
          // The include only returns enabled flags, so an academy with none
          // arrives as an empty array rather than as absent.
          featureFlags: [],
        },
        role: "MANAGER",
        extraRoles: [],
        status: "ACTIVE",
        memberProfile: {
          avatarAssetId: academyAsset.id,
          avatarAsset: academyAsset,
        },
      }],
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(record) },
    } as unknown as PrismaService;
    const signMany = vi.fn().mockResolvedValue([
      { assetId: globalAsset.id, url: "https://images.test/global", expiresAt: "later" },
      { assetId: academyAsset.id, url: "https://images.test/academy", expiresAt: "later" },
    ]);
    const service = new AuthService(
      prisma,
      {} as AcademyOnboardingService,
      { signMany } as unknown as ProfileMediaService,
      supabaseAuth(),
    );

    const result = await service.me(identity);

    expect(signMany).toHaveBeenCalledOnce();
    expect(result.user.imageUrl).toBe("https://images.test/global");
    expect(result.user.memberships[0]?.imageUrl).toBe(
      "https://images.test/academy",
    );
  });
});

describe("AuthService.resolveSignInEmail", () => {
  function service(owner: { email: string | null } | null) {
    const findUnique = vi.fn().mockResolvedValue(owner);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    return {
      findUnique,
      service: new AuthService(prisma, {} as AcademyOnboardingService, media, supabaseAuth()),
    };
  }

  it("passes an email straight through, normalized", async () => {
    const { service: subject, findUnique } = service(null);
    await expect(subject.resolveSignInEmail("  Teacher@Cove.Test "))
      .resolves.toEqual({ email: "teacher@cove.test" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("maps a known username to its account email", async () => {
    const { service: subject } = service({ email: "minsu@cove.test" });
    await expect(subject.resolveSignInEmail("MinSu01"))
      .resolves.toEqual({ email: "minsu@cove.test" });
  });

  /**
   * The point of the whole route: a name nobody holds must be answered exactly
   * like a name somebody does, so the sign-in that follows is the only thing
   * that can fail and it fails the same way either time.
   */
  it("answers an unknown username with an unreachable address", async () => {
    const { service: subject } = service(null);
    await expect(subject.resolveSignInEmail("nobody99"))
      .resolves.toEqual({ email: "nobody99@unresolved.invalid" });
  });

  it("does not fall back to a username account that has no email", async () => {
    const { service: subject } = service({ email: null });
    await expect(subject.resolveSignInEmail("minsu01"))
      .resolves.toEqual({ email: "minsu01@unresolved.invalid" });
  });
});

describe("AuthService.setUsername", () => {
  const conflict = Object.assign(new Error("unique"), {
    code: "P2002",
    meta: { target: ["username"] },
  });

  function service(
    current: { id: string; status: string; username: string | null } | null,
    updateResult: Promise<unknown> = Promise.resolve({}),
  ) {
    const update = vi.fn().mockReturnValue(updateResult);
    const prisma = {
      user: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValue({ ...userRecord(), username: "minsu01" }),
        update,
      },
    } as unknown as PrismaService;
    return {
      update,
      service: new AuthService(prisma, {} as AcademyOnboardingService, media, supabaseAuth()),
    };
  }

  it("claims a free name for an account that has none", async () => {
    const { service: subject, update } = service({
      id: userId,
      status: "ACTIVE",
      username: null,
    });

    const result = await subject.setUsername(identity, "minsu01");

    expect(update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { username: "minsu01" },
    });
    expect(result.user.username).toBe("minsu01");
  });

  it("refuses to rename an account that already has a username", async () => {
    const { service: subject, update } = service({
      id: userId,
      status: "ACTIVE",
      username: "taken-already",
    });

    await expect(subject.setUsername(identity, "minsu01"))
      .rejects.toMatchObject({ code: "USERNAME_ALREADY_SET" });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a lost race as a taken username", async () => {
    const { service: subject } = service(
      { id: userId, status: "ACTIVE", username: null },
      Promise.reject(conflict),
    );

    await expect(subject.setUsername(identity, "minsu01"))
      .rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });
});

describe("AuthService.completeOAuthOnboarding", () => {
  it("requires an onboarding intent for a new social identity", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as AcademyOnboardingService, media, supabaseAuth());

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
