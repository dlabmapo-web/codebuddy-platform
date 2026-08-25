import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../../academies/audit.service.js";
import type { SupabaseIdentity } from "../../auth/auth.types.js";
import type { AcademyAccessService } from "../../authorization/academy-access.service.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { ContentImportService } from "./content-import.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "lead@example.com",
  emailVerified: true,
  username: null,
  displayName: "Team Lead",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};
const academyId = "20000000-0000-4000-8000-000000000001";
const actorUserId = "30000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const sessionId = "50000000-0000-4000-8000-000000000001";

function access() {
  return {
    requirePermission: vi.fn().mockResolvedValue({
      userId: actorUserId,
      academyId,
      role: "TEAM_LEAD",
    }),
  } as unknown as AcademyAccessService;
}

function audit() {
  return {
    write: vi.fn().mockResolvedValue({ id: "audit-id" }),
  } as unknown as AuditService;
}

describe("ContentImportService session safety", () => {
  it("scopes a stored preview to the Team Lead who created it", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      contentImportSession: { findFirst },
    } as unknown as PrismaService;
    const service = new ContentImportService(prisma, access(), audit());

    await expect(
      service.getPreview(identity, { academyId, courseId, sessionId }),
    ).rejects.toMatchObject({ code: "CONTENT_IMPORT_SESSION_NOT_FOUND" });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: sessionId, academyId, courseId, actorUserId },
    });
  });

  it("stores the completed receipt inside the curriculum transaction", async () => {
    const plan = {
      modules: [],
      issues: [],
      counts: {
        create: 0,
        update: 1,
        unchanged: 0,
        warnings: 0,
        conflicts: 0,
        errors: 0,
      },
    };
    const session = {
      id: sessionId,
      academyId,
      courseId,
      actorUserId,
      status: "PREVIEW_READY",
      result: null,
      plan,
      capturedContentRevision: 7,
      expiresAt: new Date(Date.now() + 60_000),
      checksumSha256: "a".repeat(64),
      templateVersion: 1,
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: courseId }]),
      course: {
        findFirst: vi.fn().mockResolvedValue({
          id: courseId,
          academyId,
          contentRevision: 7,
          modules: [],
        }),
        update: vi.fn().mockResolvedValue({ contentRevision: 8 }),
      },
      contentImportSession: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const rootSessionUpdate = vi.fn();
    const prisma = {
      contentImportSession: {
        findFirst: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: rootSessionUpdate,
      },
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new ContentImportService(prisma, access(), audit());
    Object.defineProperty(service, "applyPlan", {
      value: vi.fn().mockResolvedValue([]),
    });

    const receipt = await service.commit(identity, {
      academyId,
      courseId,
      sessionId,
      contentRevision: 7,
      acknowledgeWarnings: false,
    });

    expect(receipt).toMatchObject({ status: "COMPLETED", contentRevision: 8 });
    expect(transaction.contentImportSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sessionId },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(rootSessionUpdate).not.toHaveBeenCalled();
  });
});
