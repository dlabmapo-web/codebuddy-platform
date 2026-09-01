import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { PlatformAcademyService } from "./platform-academy.service.js";

/**
 * The counts `readAcademyStats` reads, stubbed at zero.
 *
 * This spec is about slug history, not about how many classes an academy
 * runs — but the detail mapper now carries those figures, so the client has to
 * answer for them.
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

const academyId = "20000000-0000-4000-8000-000000000001";
const identity = { authUserId: "auth-1" } as never;
// The shape `academyDetailSelect` really returns, relations included — a bare
// row would let the mapper pass here and fail in production.
const detail = {
  id: academyId,
  name: "New Name",
  slug: "new-slug",
  status: "ACTIVE",
  timeZone: "Asia/Seoul",
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
};

function createService(options: {
  current?: { name: string; slug: string; status: string };
  liveConflict?: boolean;
  retiredBy?: string | null;
} = {}) {
  const current = options.current ?? {
    id: academyId,
    name: "Old Name",
    slug: "old-slug",
    status: "ACTIVE",
  };
  const history = {
    findUnique: vi.fn().mockResolvedValue(
      options.retiredBy ? { academyId: options.retiredBy } : null,
    ),
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([current]),
    academy: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.liveConflict ? { id: "other" } : null),
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue(detail),
    },
    academySlugHistory: history,
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const service = new PlatformAcademyService(
    {
      ...statCounts(),
      $transaction: vi.fn().mockImplementation((fn) => fn(transaction)),
      academy: { findUnique: vi.fn().mockResolvedValue(detail) },
      academySlugHistory: history,
    } as never,
    { requirePermission: vi.fn().mockResolvedValue({ userId: "u1" }) } as never,
    { write: vi.fn().mockResolvedValue({}) } as never,
    {} as never,
    {} as never,
  );
  return { service, transaction, history };
}

const input = { academyId, name: "New Name", slug: "new-slug" };

describe("PlatformAcademyService.update", () => {
  it("retires the old slug so its links still resolve", async () => {
    const { service, history } = createService();

    await service.update(identity, input);

    expect(history.create).toHaveBeenCalledWith({
      data: { slug: "old-slug", academyId },
    });
  });

  it("writes no history when only the name changes", async () => {
    const { service, history } = createService({
      current: { id: academyId, name: "Old Name", slug: "new-slug", status: "ACTIVE" } as never,
    });

    await service.update(identity, input);

    expect(history.create).not.toHaveBeenCalled();
  });

  it("refuses a slug a live academy holds", async () => {
    const { service } = createService({ liveConflict: true });

    await expect(service.update(identity, input)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });

  /*
   * Handing a retired slug to another academy would make its redirect a lie,
   * carrying somebody to an academy they were never looking at.
   */
  it("refuses a slug another academy retired", async () => {
    const { service } = createService({ retiredBy: "another-academy" });

    await expect(service.update(identity, input)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });

  it("lets an academy reclaim a slug it retired itself", async () => {
    const { service, history } = createService({ retiredBy: academyId });

    await service.update(identity, input);

    // The reclaimed row now describes the live slug — a redirect to itself.
    expect(history.deleteMany).toHaveBeenCalledWith({
      where: { slug: "new-slug" },
    });
  });

  it("refuses an archived academy", async () => {
    const { service } = createService({
      current: { id: academyId, name: "Old", slug: "old-slug", status: "ARCHIVED" } as never,
    });

    await expect(service.update(identity, input)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });
});

describe("PlatformAcademyService.resolveSlug", () => {
  it("answers null for a slug no academy ever had", async () => {
    const service = new PlatformAcademyService(
      {
        academy: { findFirst: vi.fn().mockResolvedValue(null) },
        academySlugHistory: { findUnique: vi.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.resolveSlug("never-existed")).resolves.toEqual({
      slug: null,
    });
  });

  it("answers the current slug for a retired one", async () => {
    const service = new PlatformAcademyService(
      {
        academy: { findFirst: vi.fn().mockResolvedValue(null) },
        academySlugHistory: {
          findUnique: vi.fn().mockResolvedValue({ academy: { slug: "new-slug" } }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.resolveSlug("old-slug")).resolves.toEqual({
      slug: "new-slug",
    });
  });
});
