import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { ProfileService } from "./profile.service.js";

const identity = {
  authUserId: "auth-user",
  emailIsPlaceholder: false,
  emailVerified: true,
} as SupabaseIdentity;

function user(updatedAt = new Date("2026-08-14T09:00:00.000Z")) {
  return {
    id: "user-1",
    authUserId: identity.authUserId,
    status: "ACTIVE",
    updatedAt,
    memberships: [],
    avatarAsset: null,
  };
}

describe("ProfileService optimistic concurrency", () => {
  it("includes the loaded revision in the database update", async () => {
    const loaded = user();
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(loaded),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new ProfileService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateGlobalProfile(identity, {
        displayName: "Ada",
        contactPhone: null,
        expectedUpdatedAt: loaded.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "PROFILE_CHANGED", status: 409 });

    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: loaded.id, updatedAt: loaded.updatedAt },
      }),
    );
  });
});

describe("ProfileService upload recovery", () => {
  it("persists orphan metadata before storage so cleanup can recover failures", async () => {
    const loaded = user();
    const create = vi.fn().mockResolvedValue({});
    const upload = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(loaded) },
      mediaAsset: { create },
    };
    const media = {
      normalize: vi.fn().mockResolvedValue({
        bytes: Buffer.from("webp"),
        contentType: "image/webp",
        width: 512,
        height: 512,
        checksumSha256: "checksum",
      }),
      newAssetId: () => "asset-1",
      globalObjectKey: () => "global/user-1/asset-1.webp",
      upload,
    };
    const service = new ProfileService(
      prisma as never,
      media as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.uploadImage(identity, Buffer.from("image")),
    ).rejects.toThrow("storage unavailable");
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      upload.mock.invocationCallOrder[0]!,
    );
  });
});

describe("ProfileService email-change audit", () => {
  it("records a request before contacting auth, records dispatch, and does not replace the stored address", async () => {
    const loaded = user();
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(loaded), update: vi.fn() } };
    const requestEmailChange = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn().mockResolvedValue(undefined);
    const service = new ProfileService(prisma as never, {} as never, { requestEmailChange } as never, { write } as never);
    await expect(service.requestEmailChange(identity, "user-token", "new@example.com")).resolves.toEqual({ requested: true });
    expect(write.mock.calls.map(call => call[1].action)).toEqual(["profile.email.change_requested", "profile.email.change_sent"]);
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(requestEmailChange.mock.invocationCallOrder[0]!);
    expect(write.mock.calls[0]![1]).toMatchObject({ actorUserId: loaded.id, targetId: loaded.id, academyId: null });
    expect(JSON.stringify(write.mock.calls)).not.toContain("new@example.com");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it("does not report dispatch when the provider rejects the request", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user()) } };
    const requestEmailChange = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const write = vi.fn().mockResolvedValue(undefined);
    const service = new ProfileService(prisma as never, {} as never, { requestEmailChange } as never, { write } as never);
    await expect(service.requestEmailChange(identity, "token", "new@example.com")).rejects.toThrow("provider unavailable");
    expect(write).toHaveBeenCalledOnce();
  });
  it("refuses suspended accounts before audit or provider calls", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ ...user(), status: "SUSPENDED" }) } };
    const requestEmailChange = vi.fn(); const write = vi.fn();
    const service = new ProfileService(prisma as never, {} as never, { requestEmailChange } as never, { write } as never);
    await expect(service.requestEmailChange(identity, "token", "new@example.com")).rejects.toMatchObject({ code: "USER_SUSPENDED" });
    expect(write).not.toHaveBeenCalled(); expect(requestEmailChange).not.toHaveBeenCalled();
  });
});
