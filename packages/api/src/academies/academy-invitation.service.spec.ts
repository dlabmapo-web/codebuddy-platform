import { describe, expect, it, vi } from "vitest";

import { AppException } from "../common/app-exception.js";
import {
  AcademyInvitationService,
  hashInvitationToken,
  normalizeEmail,
} from "./academy-invitation.service.js";

describe("academy invitation security helpers", () => {
  it("normalizes invited email addresses", () => {
    expect(normalizeEmail("  Student@Cove.Test ")).toBe("student@cove.test");
  });

  it("hashes tokens deterministically without retaining plaintext", () => {
    const token = "a".repeat(43);
    const hash = hashInvitationToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashInvitationToken(token));
    expect(hash).not.toContain(token);
  });
});

/**
 * The preview is the only unauthenticated read in this service, so what it
 * refuses matters as much as what it returns.
 */
describe("academy invitation preview", () => {
  const token = "b".repeat(43);

  function serviceFor(invitation: unknown) {
    const prisma = {
      academyInvitation: { findUnique: vi.fn().mockResolvedValue(invitation) },
    };
    return {
      service: new AcademyInvitationService(
        prisma as never,
        {} as never,
        {} as never,
      ),
      prisma,
    };
  }

  const pending = {
    academyId: "10000000-0000-4000-8000-000000000001",
    email: "manager@cove.test",
    role: "MANAGER" as const,
    status: "PENDING" as const,
    expiresAt: new Date(Date.now() + 60_000),
    academy: { name: "Mapo DLAB" },
  };

  it("names the academy, the role, and the invited address", async () => {
    const { service, prisma } = serviceFor(pending);

    await expect(service.preview(token)).resolves.toEqual({
      academyId: pending.academyId,
      academyName: "Mapo DLAB",
      email: "manager@cove.test",
      role: "MANAGER",
      expiresAt: pending.expiresAt.toISOString(),
    });
    // Looked up by hash — the plaintext token is never a stored column.
    expect(prisma.academyInvitation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashInvitationToken(token) },
      }),
    );
  });

  it("refuses a token nobody holds without saying which part was wrong", async () => {
    const { service } = serviceFor(null);
    await expect(service.preview(token)).rejects.toMatchObject({
      code: "INVITATION_INVALID",
    });
  });

  it("refuses an invitation that has already been accepted or revoked", async () => {
    const { service } = serviceFor({ ...pending, status: "ACCEPTED" });
    await expect(service.preview(token)).rejects.toBeInstanceOf(AppException);
  });

  it("separates an expired invitation from an invalid one", async () => {
    const { service } = serviceFor({
      ...pending,
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(service.preview(token)).rejects.toMatchObject({
      code: "INVITATION_EXPIRED",
    });
  });
});
