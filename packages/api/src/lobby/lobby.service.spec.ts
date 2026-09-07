import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import { LobbyService } from "./lobby.service.js";

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
const academyId = "30000000-0000-4000-8000-000000000001";
const requestId = "40000000-0000-4000-8000-000000000001";

function createService(options: {
  user?: unknown;
  academy?: unknown;
  application?: unknown;
} = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(
        options.user === undefined
          ? { id: userId, status: "ACTIVE" }
          : options.user,
      ),
    },
    academy: {
      findFirst: vi.fn().mockResolvedValue(
        options.academy === undefined
          ? {
              id: academyId,
              name: "DLab Mapo",
              slug: "dlab-mapo",
              featureFlags: [],
              media: [],
            }
          : options.academy,
      ),
    },
    academyJoinRequest: {
      findFirst: vi.fn().mockResolvedValue(
        options.application === undefined
          ? {
              id: requestId,
              requestedKind: "STAFF",
              createdAt: new Date("2026-09-04T01:00:00.000Z"),
            }
          : options.application,
      ),
    },
  } as unknown as PrismaService;
  const media = {
    sign: vi.fn().mockResolvedValue({ url: "https://signed.example/cover" }),
  } as unknown as ProfileMediaService;

  return { media, prisma, service: new LobbyService(prisma, media) };
}

describe("LobbyService", () => {
  it("describes the academy to somebody holding a pending application", async () => {
    const { service } = createService();

    await expect(service.academy(identity, "dlab-mapo")).resolves.toMatchObject({
      id: academyId,
      name: "DLab Mapo",
      hasPoints: false,
      application: { id: requestId, requestedKind: "STAFF" },
    });
  });

  it("reports the points flag so the lobby offers the rows a member gets", async () => {
    const { service } = createService({
      academy: {
        id: academyId,
        name: "DLab Mapo",
        slug: "dlab-mapo",
        featureFlags: [{ feature: "STUDENT_POINTS" }],
        media: [],
      },
    });

    await expect(service.academy(identity, "dlab-mapo")).resolves.toMatchObject({
      hasPoints: true,
    });
  });

  it("only asks for an ACTIVE academy of the ordinary kind", async () => {
    // An academy archived after somebody applied must not keep serving them a
    // branded lobby for a school that has closed, and a library holds
    // curriculum rather than people.
    const { prisma, service } = createService();
    await service.academy(identity, "dlab-mapo");

    expect(prisma.academy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "dlab-mapo", status: "ACTIVE", kind: "ACADEMY" },
      }),
    );
  });

  it.each([
    ["an academy nobody can find", { academy: null }],
    ["a caller with no pending application", { application: null }],
    ["a suspended account", { user: { id: userId, status: "SUSPENDED" } }],
    ["an account with no profile", { user: null }],
  ])("answers not-found for %s", async (_case, options) => {
    // Never PERMISSION_DENIED. A signed-in stranger probing slugs must not be
    // able to tell an academy that exists from one that does not.
    const { service } = createService(options);

    await expect(service.academy(identity, "dlab-mapo")).rejects.toMatchObject({
      code: "ACADEMY_NOT_FOUND",
      status: HttpStatus.NOT_FOUND,
    });
  });

  it("asks only for this caller's own pending application", async () => {
    const { prisma, service } = createService();
    await service.academy(identity, "dlab-mapo");

    expect(prisma.academyJoinRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { academyId, userId, status: "PENDING" },
      }),
    );
  });

  it("renders without a cover rather than failing when there is none", async () => {
    const { media, service } = createService();

    await expect(service.academy(identity, "dlab-mapo")).resolves.toMatchObject({
      imageUrl: null,
    });
    expect(media.sign).not.toHaveBeenCalled();
  });
});
