import { describe, expect, it, vi } from "vitest";

import { ProfileImageCleanupService } from "./profile-image-cleanup.service.js";

describe("ProfileImageCleanupService", () => {
  it("deletes storage objects before marking unattached assets deleted", async () => {
    const old = {
      id: "asset-1",
      objectKey: "global/user-1/asset-1.webp",
    };
    const prisma = {
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([old]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const media = { remove: vi.fn().mockResolvedValue(true) };
    const cleanup = new ProfileImageCleanupService(
      prisma as never,
      media as never,
    );
    const now = new Date("2026-08-16T00:00:00.000Z");

    await expect(cleanup.sweep(now)).resolves.toBe(1);
    expect(media.remove).toHaveBeenCalledWith([old.objectKey]);
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [old.id] } },
      data: { deletedAt: now },
    });
  });

  it("keeps metadata retryable when storage deletion fails", async () => {
    const prisma = {
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([
          { id: "asset-1", objectKey: "academy/a/m/asset-1.webp" },
        ]),
        updateMany: vi.fn(),
      },
    };
    const cleanup = new ProfileImageCleanupService(
      prisma as never,
      { remove: vi.fn().mockResolvedValue(false) } as never,
    );

    await expect(cleanup.sweep()).resolves.toBe(0);
    expect(prisma.mediaAsset.updateMany).not.toHaveBeenCalled();
  });
});
