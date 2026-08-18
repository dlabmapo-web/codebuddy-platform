import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../academies/audit.service.js";
import type { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { InvitationDeliveryService } from "../manage/invitation-delivery.service.js";
import { PlatformAcademyService } from "./platform-academy.service.js";

const identity = { authUserId: "auth-1" } as never;
const actorUserId = "40000000-0000-4000-8000-000000000001";

const input = {
  name: "DLab Gangnam",
  slug: "dlab-gangnam",
  timeZone: "Asia/Seoul",
  managerEmail: "manager@example.com",
  contactEmail: null,
};

function createService(options: {
  academyCreate?: () => Promise<unknown>;
  permitted?: boolean;
} = {}) {
  const queueForInvitation = vi.fn().mockResolvedValue(undefined);
  const transaction = {
    organization: {
      findUnique: vi.fn().mockResolvedValue({ id: "org-1" }),
      create: vi.fn().mockResolvedValue({ id: "org-1" }),
    },
    academy: {
      // The shape `academyDetailSelect` really returns, relations included —
      // a bare row would let the mapper pass here and fail in production.
      create:
        options.academyCreate ??
        vi.fn().mockResolvedValue({
          id: "academy-1",
          name: input.name,
          slug: input.slug,
          status: "ACTIVE",
          timeZone: input.timeZone,
          createdAt: new Date("2026-08-18T00:00:00.000Z"),
          statusChangedAt: null,
          memberships: [],
          invitations: [],
          organization: { id: "org-1", name: "Cove", slug: "cove" },
          contactEmail: null,
          contactPhone: null,
          locality: null,
          countryCode: null,
          profileUpdatedAt: null,
          createdBy: null,
        }),
    },
    academyInvitation: {
      create: vi.fn().mockResolvedValue({
        id: "invitation-1",
        academyId: "academy-1",
        email: "manager@example.com",
        role: "MANAGER",
        status: "PENDING",
        expiresAt: new Date("2026-08-25T00:00:00.000Z"),
        createdAt: new Date("2026-08-18T00:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation((fn: (t: unknown) => unknown) => fn(transaction)),
    academy: { findUnique: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  const permitted = options.permitted ?? true;
  const access = {
    requirePermission: vi.fn().mockImplementation(async () => {
      if (!permitted) {
        throw new AppException("PLATFORM_ACCESS_DENIED", 403);
      }
      return { userId: actorUserId };
    }),
  } as unknown as PlatformAccessService;

  const service = new PlatformAcademyService(
    prisma,
    access,
    { write: vi.fn().mockResolvedValue({}) } as unknown as AuditService,
    { queueForInvitation } as unknown as InvitationDeliveryService,
    { get: vi.fn().mockReturnValue("cove") } as never,
  );

  return { service, queueForInvitation, transaction, access };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_ERROR";
  } catch (error) {
    return error instanceof AppException ? error.code : "WRONG_ERROR_TYPE";
  }
}

describe("PlatformAcademyService.create", () => {
  it("maps a duplicate slug onto a conflict a form can explain", () => {
    // Prisma's P2002 is the unique index on [organizationId, slug]. Left
    // unmapped it would surface as a 500, and an operator retyping a slug
    // somebody already took would be told the server broke.
    const { service } = createService({
      academyCreate: vi.fn().mockRejectedValue({ code: "P2002" }),
    });
    return expect(codeOf(service.create(identity, input))).resolves.toBe(
      "ACADEMY_SLUG_CONFLICT",
    );
  });

  it("lets an unexpected database failure surface as itself", async () => {
    const { service } = createService({
      academyCreate: vi.fn().mockRejectedValue(new Error("connection reset")),
    });
    await expect(service.create(identity, input)).rejects.toThrow(
      "connection reset",
    );
  });

  it("dispatches the invitation only after the transaction commits", async () => {
    const { service, queueForInvitation, transaction } = createService();
    await service.create(identity, input);

    // An email carrying a token that then rolled back would invite somebody to
    // an academy that does not exist.
    expect(transaction.academyInvitation.create).toHaveBeenCalled();
    expect(queueForInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ email: input.managerEmail }),
    );
  });

  it("never dispatches when the academy could not be written", async () => {
    const { service, queueForInvitation } = createService({
      academyCreate: vi.fn().mockRejectedValue({ code: "P2002" }),
    });
    await codeOf(service.create(identity, input));
    expect(queueForInvitation).not.toHaveBeenCalled();
  });

  it("normalizes the manager address before storing or sending it", async () => {
    const { service, queueForInvitation, transaction } = createService();
    await service.create(identity, {
      ...input,
      managerEmail: "  Manager@Example.COM  ",
    });
    expect(transaction.academyInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "manager@example.com" }),
      }),
    );
    expect(queueForInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ email: "manager@example.com" }),
    );
  });
});

describe("platform authority is checked by every method", () => {
  // §11.2: not one endpoint may be reachable without the platform role. A route
  // added later that forgets its guard should fail here rather than in
  // production.
  it("refuses a non-operator everywhere", async () => {
    const { service } = createService({ permitted: false });
    const calls: Promise<unknown>[] = [
      service.list(identity, {}),
      service.get(identity, "academy-1"),
      service.create(identity, input),
      service.resendFirstManagerInvitation(identity, {
        academyId: "academy-1",
      }),
    ];
    for (const call of calls) {
      expect(await codeOf(call)).toBe("PLATFORM_ACCESS_DENIED");
    }
  });
});
