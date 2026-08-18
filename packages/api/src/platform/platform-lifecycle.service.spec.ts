import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../academies/audit.service.js";
import type { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { PlatformLifecycleService } from "./platform-lifecycle.service.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const actorUserId = "40000000-0000-4000-8000-000000000001";

function detail(status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
  return {
    id: academyId,
    name: "DLab Gangnam",
    slug: "dlab-gangnam",
    status,
    timeZone: "Asia/Seoul",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    statusChangedAt: null,
    memberships: [],
    invitations: [],
    organization: { id: "org", name: "Cove", slug: "cove" },
    contactEmail: null,
    contactPhone: null,
    locality: null,
    countryCode: null,
    profileUpdatedAt: null,
    createdBy: null,
  };
}

function createService(current: "ACTIVE" | "SUSPENDED" | "ARCHIVED" | null) {
  const update = vi.fn().mockResolvedValue({});
  const auditWrite = vi.fn().mockResolvedValue({});
  const revokeAcademy = vi.fn().mockResolvedValue(undefined);
  let nextStatus = current;

  const transaction = {
    $queryRaw: vi
      .fn()
      .mockImplementation(async () =>
        current ? [{ id: academyId, status: current }] : [],
      ),
    academy: {
      update: vi.fn().mockImplementation(async (args: { data: { status: typeof current } }) => {
        nextStatus = args.data.status;
        return update(args);
      }),
      findUniqueOrThrow: vi
        .fn()
        .mockImplementation(async () => detail(nextStatus ?? "ACTIVE")),
    },
  };

  const prisma = {
    $transaction: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(transaction)),
  } as unknown as PrismaService;

  const service = new PlatformLifecycleService(
    prisma,
    {
      requirePermission: vi.fn().mockResolvedValue({ userId: actorUserId }),
    } as unknown as PlatformAccessService,
    { write: auditWrite } as unknown as AuditService,
    { revokeAcademy } as unknown as MonitoringRevocationService,
  );

  return { service, update, auditWrite, revokeAcademy, transaction };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_ERROR";
  } catch (error) {
    return error instanceof AppException ? error.code : "WRONG_ERROR_TYPE";
  }
}

describe("PlatformLifecycleService.setStatus", () => {
  const reason = "Unpaid invoice, agreed with the director.";

  it("suspends an active academy and closes its live monitoring", async () => {
    const { service, auditWrite, revokeAcademy } = createService("ACTIVE");
    const result = await service.setStatus({ authUserId: "auth-1" } as never, {
      academyId,
      status: "SUSPENDED",
      reason,
    });

    expect(result.status).toBe("SUSPENDED");
    expect(auditWrite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "platform.academy.suspended",
        academyId,
        reason,
      }),
    );
    // The connection guard runs once at connect time, so an open watch would
    // otherwise outlive the suspension.
    expect(revokeAcademy).toHaveBeenCalledWith(academyId, "ACADEMY_SUSPENDED");
  });

  it("does not disturb monitoring when restoring an academy", async () => {
    const { service, revokeAcademy } = createService("SUSPENDED");
    const result = await service.setStatus({ authUserId: "auth-1" } as never, {
      academyId,
      status: "ACTIVE",
      reason: "Invoice settled.",
    });
    expect(result.status).toBe("ACTIVE");
    expect(revokeAcademy).not.toHaveBeenCalled();
  });

  it("refuses to move an archived academy anywhere", async () => {
    for (const status of ["ACTIVE", "SUSPENDED"] as const) {
      const { service, update } = createService("ARCHIVED");
      expect(
        await codeOf(
          service.setStatus({ authUserId: "auth-1" } as never, {
            academyId,
            status,
            reason,
          }),
        ),
      ).toBe("ACADEMY_STATE_CONFLICT");
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("treats a repeated request as a no-op and writes no audit record", async () => {
    // An operator clicking twice has not intervened twice.
    const { service, update, auditWrite, revokeAcademy } = createService("SUSPENDED");
    const result = await service.setStatus({ authUserId: "auth-1" } as never, {
      academyId,
      status: "SUSPENDED",
      reason,
    });
    expect(result.status).toBe("SUSPENDED");
    expect(update).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
    expect(revokeAcademy).not.toHaveBeenCalled();
  });

  it("reports a missing academy", async () => {
    const { service } = createService(null);
    expect(
      await codeOf(
        service.setStatus({ authUserId: "auth-1" } as never, {
          academyId,
          status: "SUSPENDED",
          reason,
        }),
      ),
    ).toBe("ACADEMY_NOT_FOUND");
  });

  it("locks the row before deciding the transition", async () => {
    const { service, transaction } = createService("ACTIVE");
    await service.setStatus({ authUserId: "auth-1" } as never, {
      academyId,
      status: "ARCHIVED",
      reason: "Contract ended.",
    });
    const [sql] = transaction.$queryRaw.mock.calls[0] as [{ raw?: string[] } & string[]];
    expect(sql.join("")).toContain("FOR UPDATE");
  });
});
