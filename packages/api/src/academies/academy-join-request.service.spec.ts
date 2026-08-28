import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import type { AuditService } from "./audit.service.js";
import { AcademyJoinRequestService } from "./academy-join-request.service.js";

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
const requestId = "40000000-0000-4000-8000-000000000001";
const applicantUserId = "50000000-0000-4000-8000-000000000001";

function joinRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    academyId,
    userId: applicantUserId,
    message: "I would like to join.",
    status: "PENDING" as const,
    approvedRole: null,
    reviewReason: null,
    createdAt: new Date("2026-08-28T01:00:00.000Z"),
    reviewedAt: null,
    user: {
      id: applicantUserId,
      email: "applicant@example.com",
      displayName: "Applicant",
      avatarUrl: null,
      avatarAsset: null,
    },
    ...overrides,
  };
}

function createService(options: {
  actorRole?: "STUDENT" | "TEACHER" | "TEAM_LEAD" | "MANAGER";
  record?: ReturnType<typeof joinRequest>;
  permissionError?: AppException;
} = {}) {
  let record = options.record ?? joinRequest();
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    academy: {
      update: vi.fn().mockResolvedValue({ peopleRevision: 1 }),
    },
    academyJoinRequest: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(record)),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        record = joinRequest({
          ...record,
          ...data,
          reviewedAt: data.reviewedAt ?? record.reviewedAt,
        });
        return Promise.resolve(record);
      }),
    },
    academyMembership: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "membership-1", ...data })),
    },
  };
  const prisma = {
    academyJoinRequest: {
      findMany: vi.fn().mockResolvedValue([record]),
    },
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockImplementation(() => {
      if (options.permissionError) return Promise.reject(options.permissionError);
      return Promise.resolve({
        userId: actorUserId,
        academyId,
        role: options.actorRole ?? "TEAM_LEAD",
      });
    }),
  } as unknown as AcademyAccessService;
  const audit = {
    write: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const media = {
    signMany: vi.fn().mockResolvedValue([]),
  } as unknown as ProfileMediaService;

  return {
    access,
    audit,
    prisma,
    service: new AcademyJoinRequestService(prisma, access, audit, media),
    transaction,
  };
}

describe("AcademyJoinRequestService", () => {
  it("lets a team lead list pending applications through the review permission", async () => {
    const { access, service } = createService();

    const result = await service.list(identity, academyId);

    expect(result.requests).toHaveLength(1);
    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "academy.applications.review",
    );
  });

  it.each(["STUDENT", "TEACHER"] as const)(
    "lets a team lead approve an applicant as %s",
    async (role) => {
      const { access, audit, service, transaction } = createService();

      const result = await service.review(identity, {
        academyId,
        requestId,
        decision: "APPROVE",
        role,
      });

      expect(result).toMatchObject({ status: "APPROVED", approvedRole: role });
      expect(access.requirePermission).toHaveBeenCalledWith(
        identity.authUserId,
        academyId,
        "academy.applications.review",
      );
      expect(transaction.academyMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role, status: "ACTIVE" }),
      });
      expect(audit.write).toHaveBeenCalledWith(
        transaction,
        expect.objectContaining({
          actorUserId,
          action: "academy.join_request.approved",
        }),
      );
    },
  );

  it.each(["TEAM_LEAD", "MANAGER"] as const)(
    "refuses a team lead approving an applicant as %s before opening a transaction",
    async (role) => {
      const { prisma, service, transaction } = createService();

      await expect(service.review(identity, {
        academyId,
        requestId,
        decision: "APPROVE",
        role,
      })).rejects.toMatchObject({
        code: "JOIN_REQUEST_ROLE_NOT_PERMITTED",
        status: HttpStatus.FORBIDDEN,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(transaction.academyMembership.create).not.toHaveBeenCalled();
    },
  );

  it("refuses a forbidden replay before checking its already-approved state", async () => {
    const { prisma, service } = createService({
      record: joinRequest({ status: "APPROVED", approvedRole: "MANAGER" }),
    });

    await expect(service.review(identity, {
      academyId,
      requestId,
      decision: "APPROVE",
      role: "MANAGER",
    })).rejects.toMatchObject({ code: "JOIN_REQUEST_ROLE_NOT_PERMITTED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("lets a team lead reject an application and records the reason", async () => {
    const { audit, service, transaction } = createService();

    const result = await service.review(identity, {
      academyId,
      requestId,
      decision: "REJECT",
      reason: "The application is incomplete.",
    });

    expect(result).toMatchObject({
      status: "REJECTED",
      reviewReason: "The application is incomplete.",
    });
    expect(transaction.academyMembership.create).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        actorUserId,
        action: "academy.join_request.rejected",
        reason: "The application is incomplete.",
      }),
    );
  });

  it.each(["TEACHER", "STUDENT"] as const)(
    "passes through permission denial for a %s listing or reviewing applications",
    async () => {
      const denied = new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
      const { service } = createService({ permissionError: denied });

      await expect(service.list(identity, academyId)).rejects.toBe(denied);
      await expect(service.review(identity, {
        academyId,
        requestId,
        decision: "REJECT",
        reason: "No",
      })).rejects.toBe(denied);
    },
  );

  it.each(["STUDENT", "TEACHER", "TEAM_LEAD", "MANAGER"] as const)(
    "keeps manager approval of %s unchanged",
    async (role) => {
      const { service } = createService({ actorRole: "MANAGER" });

      await expect(service.review(identity, {
        academyId,
        requestId,
        decision: "APPROVE",
        role,
      })).resolves.toMatchObject({ status: "APPROVED", approvedRole: role });
    },
  );
});
