import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "./notifications.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "applicant@example.com",
  emailIsPlaceholder: false,
  emailVerified: true,
  username: "applicant",
  displayName: "Applicant",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};

const userId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    status: "APPROVED" as const,
    approvedRole: "TEACHER" as const,
    reviewReason: null,
    reviewedAt: new Date("2026-09-04T02:00:00.000Z"),
    acknowledgedAt: null,
    academy: { name: "DLab Mapo", slug: "dlab-mapo" },
    ...overrides,
  };
}

function createService(options: {
  rows?: unknown[];
  updated?: number;
  exists?: number;
} = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: userId, status: "ACTIVE" }),
    },
    academyJoinRequest: {
      findMany: vi.fn().mockResolvedValue(options.rows ?? [decision()]),
      findUnique: vi.fn().mockResolvedValue(decision()),
      updateMany: vi.fn().mockResolvedValue({ count: options.updated ?? 1 }),
      count: vi.fn().mockResolvedValue(options.exists ?? 1),
    },
  } as unknown as PrismaService;

  return { prisma, service: new NotificationsService(prisma) };
}

describe("NotificationsService.list", () => {
  it("projects a decided application into an item", async () => {
    const { service } = createService();

    await expect(service.list(identity)).resolves.toMatchObject({
      unreadCount: 1,
      items: [
        {
          id: requestId,
          kind: "APPLICATION_APPROVED",
          academy: { name: "DLab Mapo", slug: "dlab-mapo" },
          role: "TEACHER",
          // The age of the news, not the age of the application.
          createdAt: "2026-09-04T02:00:00.000Z",
        },
      ],
    });
  });

  it("grants no role on a rejection", async () => {
    const { service } = createService({
      rows: [
        decision({
          status: "REJECTED",
          approvedRole: "TEACHER",
          reviewReason: "Not this term.",
        }),
      ],
    });

    await expect(service.list(identity)).resolves.toMatchObject({
      items: [
        {
          kind: "APPLICATION_REJECTED",
          role: null,
          reason: "Not this term.",
        },
      ],
    });
  });

  it("reads only this caller's own decided applications", async () => {
    const { prisma, service } = createService();
    await service.list(identity);

    expect(prisma.academyJoinRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, status: { in: ["APPROVED", "REJECTED"] } },
      }),
    );
  });

  it("does not count an acknowledged decision as unread", async () => {
    const { service } = createService({
      rows: [decision({ acknowledgedAt: new Date("2026-09-04T03:00:00.000Z") })],
    });

    await expect(service.list(identity)).resolves.toMatchObject({
      unreadCount: 0,
    });
  });
});

describe("NotificationsService.acknowledge", () => {
  it("scopes the write by owner, so another person's row is unreachable", async () => {
    const { prisma, service } = createService();
    await service.acknowledge(identity, requestId);

    expect(prisma.academyJoinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: requestId, userId }),
      }),
    );
  });

  it("is idempotent — a second acknowledgement is not an error", async () => {
    // Nothing to update because it is already acknowledged. The first
    // timestamp stays, so a double click does not rewrite when somebody read
    // their own news.
    const { service } = createService({ updated: 0, exists: 1 });

    await expect(service.acknowledge(identity, requestId)).resolves.toEqual({
      success: true,
    });
  });

  it("refuses an id that is not the caller's", async () => {
    const { service } = createService({ updated: 0, exists: 0 });

    await expect(service.acknowledge(identity, requestId)).rejects.toMatchObject(
      { code: "JOIN_REQUEST_NOT_FOUND" },
    );
  });
});

describe("NotificationsService.itemFor", () => {
  it("says nothing about an application still waiting", async () => {
    // The broadcaster asks for this after a review; a pending row means the
    // review did not decide anything, and there is no news to send.
    const { prisma, service } = createService();
    vi.mocked(prisma.academyJoinRequest.findUnique).mockResolvedValue(
      decision({ status: "PENDING" }) as never,
    );

    await expect(service.itemFor(requestId)).resolves.toBeNull();
  });
});
