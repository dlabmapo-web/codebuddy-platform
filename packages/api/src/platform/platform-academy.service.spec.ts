import { academyFeatureNames } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../academies/audit.service.js";
import type { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { InvitationDeliveryService } from "../manage/invitation-delivery.service.js";
import { PlatformAcademyService } from "./platform-academy.service.js";

/**
 * The counts `readAcademyStats` reads, stubbed at zero.
 *
 * These specs are about lifecycle and slug history, not about how many
 * classes an academy runs — but the detail mapper now carries those figures,
 * so the client has to answer for them. Zero everywhere keeps the assertions
 * below about the thing they were written for.
 */
function statCounts() {
  const count = () => vi.fn().mockResolvedValue(0);
  return {
    class: { count: count() },
    course: { count: count() },
    lecture: { count: count() },
    material: { count: count() },
    classEnrollment: { count: count() },
    platformSupportGrant: { count: count() },
  };
}


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
    // A new academy is created with every feature on; the rows are written in
    // the same transaction as the academy itself.
    academyFeatureFlag: {
      createMany: vi.fn().mockResolvedValue({ count: 4 }),
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
    ...statCounts(),
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

  const auditWrite = vi.fn().mockResolvedValue({});
  const service = new PlatformAcademyService(
    prisma,
    access,
    { write: auditWrite } as unknown as AuditService,
    { queueForInvitation } as unknown as InvitationDeliveryService,
    { get: vi.fn().mockReturnValue("cove") } as never,
  );

  return { service, auditWrite, queueForInvitation, transaction, access };
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

  /*
   * These began as rollout gates with no way to write them, so an academy
   * created without them found monitoring and ranking dead and unrevivable.
   * A new academy gets the whole product; a manager may switch any of it off.
   */
  it("switches every feature on for the new academy", async () => {
    const { service, transaction } = createService();

    await service.create(identity, input);

    expect(transaction.academyFeatureFlag.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: academyFeatureNames.map((feature) => ({
          academyId: "academy-1",
          feature,
          isEnabled: true,
        })),
        skipDuplicates: true,
      }),
    );
  });

  it("never dispatches when the academy could not be written", async () => {
    const { service, queueForInvitation } = createService({
      academyCreate: vi.fn().mockRejectedValue({ code: "P2002" }),
    });
    await codeOf(service.create(identity, input));
    expect(queueForInvitation).not.toHaveBeenCalled();
  });

  /*
   * The second way into an academy. An operator who does not yet know who will
   * run one should not have to invent an address to make it — and the address
   * they invent is the address the invitation goes to.
   */
  it("invites nobody when no manager address is given", async () => {
    const { service, queueForInvitation, transaction } = createService();
    const { managerEmail: _omitted, ...open } = input;

    const result = await service.create(identity, open);

    expect(transaction.academyInvitation.create).not.toHaveBeenCalled();
    expect(queueForInvitation).not.toHaveBeenCalled();
    // Null rather than absent, so one result shape covers both ways in and a
    // caller branches on a value instead of on whether a key exists.
    expect(result.invitation).toBeNull();
    expect(result.token).toBeNull();
  });

  it("records which way in was chosen", async () => {
    // An academy that sat empty for a week is either an invitation nobody
    // opened or an open academy nobody applied to, and those have different
    // fixes. Without this the trail cannot tell them apart.
    const { service, auditWrite } = createService();
    const { managerEmail: _omitted, ...open } = input;

    await service.create(identity, open);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "platform.academy.created",
        after: expect.objectContaining({ onboarding: "open" }),
      }),
    );

    const invited = createService();
    await invited.service.create(identity, input);
    expect(invited.auditWrite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "platform.academy.created",
        after: expect.objectContaining({ onboarding: "invitation" }),
      }),
    );
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
      service.getBySlug(identity, "academy-1"),
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

describe("PlatformAcademyService.getBySlug", () => {
  it("uses an exact lookup instead of the paginated directory", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "10000000-0000-4000-8000-000000000001",
      name: "Mapo DLab",
      slug: "mapo-dlab",
      status: "ACTIVE",
      timeZone: "Asia/Seoul",
      createdAt: new Date("2026-08-18T00:00:00.000Z"),
      statusChangedAt: null,
      memberships: [],
      invitations: [],
    });
    const access = {
      requirePermission: vi.fn().mockResolvedValue({ userId: actorUserId }),
    };
    const service = new PlatformAcademyService(
      { academy: { findFirst } } as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getBySlug(identity, "mapo-dlab")).resolves.toMatchObject({
      id: "10000000-0000-4000-8000-000000000001",
      slug: "mapo-dlab",
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { slug: "mapo-dlab" },
      select: expect.any(Object),
    });
    expect(access.requirePermission).toHaveBeenCalledWith(
      "auth-1",
      "platform.academies.read",
    );
  });
});
