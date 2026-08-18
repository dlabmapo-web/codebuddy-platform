import { describe, expect, it, vi } from "vitest";

import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PlatformAccessService } from "./platform-access.service.js";

type UserRow = {
  id: string;
  status: "PENDING_PROFILE" | "ACTIVE" | "SUSPENDED" | "DELETED";
  platformRole: "USER" | "ADMIN";
};

function createService(user: UserRow | null) {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
  } as unknown as PrismaService;
  return new PlatformAccessService(prisma);
}

const admin: UserRow = {
  id: "40000000-0000-4000-8000-000000000001",
  status: "ACTIVE",
  platformRole: "ADMIN",
};

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_ERROR";
  } catch (error) {
    return error instanceof AppException ? error.code : "WRONG_ERROR_TYPE";
  }
}

describe("PlatformAccessService", () => {
  it("admits an active platform admin", async () => {
    const service = createService(admin);
    await expect(
      service.requirePermission("auth-1", "platform.academies.create"),
    ).resolves.toEqual({ userId: admin.id });
  });

  it("refuses an ordinary user, however senior in an academy", async () => {
    const service = createService({ ...admin, platformRole: "USER" });
    expect(
      await codeOf(
        service.requirePermission("auth-1", "platform.academies.read"),
      ),
    ).toBe("PLATFORM_ACCESS_DENIED");
  });

  it("refuses a suspended admin before it looks at the permission", async () => {
    // Suspension is global. An admin who is suspended must not keep platform
    // authority merely because the platform check is a different service.
    for (const status of ["SUSPENDED", "DELETED"] as const) {
      const service = createService({ ...admin, status });
      expect(
        await codeOf(
          service.requirePermission("auth-1", "platform.academies.lifecycle"),
        ),
      ).toBe("USER_SUSPENDED");
    }
  });

  it("refuses an incomplete profile", async () => {
    const service = createService({ ...admin, status: "PENDING_PROFILE" });
    expect(
      await codeOf(
        service.requirePermission("auth-1", "platform.academies.read"),
      ),
    ).toBe("PROFILE_INCOMPLETE");
  });

  it("refuses an unknown account", async () => {
    const service = createService(null);
    expect(
      await codeOf(
        service.requirePermission("auth-1", "platform.academies.read"),
      ),
    ).toBe("PROFILE_INCOMPLETE");
  });

  it("never reads a membership", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(admin) },
      academyMembership: { findUnique: vi.fn(), findFirst: vi.fn() },
    } as unknown as PrismaService;
    await new PlatformAccessService(prisma).requirePermission(
      "auth-1",
      "platform.academies.create",
    );
    expect(prisma.academyMembership.findUnique).not.toHaveBeenCalled();
    expect(prisma.academyMembership.findFirst).not.toHaveBeenCalled();
  });
});
