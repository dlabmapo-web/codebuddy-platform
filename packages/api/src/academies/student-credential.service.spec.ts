import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";

import type { PrismaService } from "../database/prisma.service.js";
import type { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { StudentCredentialService } from "./student-credential.service.js";
import { AuditService } from "./audit.service.js";

const academyId = "11111111-2222-4333-8444-555555555555";
const membershipId = "22222222-2222-4333-8444-555555555555";
const userId = "33333333-2222-4333-8444-555555555555";
const actorId = "44444444-2222-4333-8444-555555555555";
const authUserId = "55555555-2222-4333-8444-555555555555";

function config(key: string | null) {
  return { get: () => key } as unknown as ConfigService<never, true>;
}

function build({
  roles = { role: "STUDENT", extraRoles: [] } as {
    role: string;
    extraRoles: { role: string }[];
  },
  stored = null as Record<string, unknown> | null,
  key = randomBytes(32).toString("base64") as string | null,
} = {}) {
  const rows = { value: stored };
  const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
    // `issuedAt` has a database default, which a mock has to stand in for.
    rows.value = {
      issuedAt: new Date(),
      revealCount: 0,
      lastRevealedAt: null,
      ...create,
    };
    return rows.value;
  });
  const update = vi.fn(async () => rows.value);
  const deleteMany = vi.fn(async () => {
    rows.value = null;
    return { count: 1 };
  });
  const prisma = {
    academyMembership: {
      findFirst: vi.fn(async () =>
        roles ? { ...roles, user: { id: userId, authUserId } } : null,
      ),
    },
    studentIssuedCredential: {
      upsert,
      update,
      deleteMany,
      findUnique: vi.fn(async () =>
        rows.value
          ? { ...rows.value, issuedBy: { displayName: "김관리" } }
          : null,
      ),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
      callback(prisma),
    ),
  } as unknown as PrismaService;

  const setPassword = vi.fn(async () => undefined);
  const supabase = { setPassword } as unknown as SupabaseAuthService;

  return {
    prisma,
    setPassword,
    upsert,
    deleteMany,
    service: new StudentCredentialService(
      prisma,
      supabase,
      new AuditService(),
      config(key),
    ),
  };
}

describe("StudentCredentialService.issue", () => {
  it("sets the password in Supabase and stores a readable copy", async () => {
    const { service, setPassword, upsert } = build();
    const result = await service.issue(actorId, academyId, membershipId);

    expect(setPassword).toHaveBeenCalledWith(authUserId, result.password);
    expect(upsert).toHaveBeenCalledOnce();
    expect(result.state.credential?.visiblePrefix).toBe(
      result.password.slice(0, 3),
    );
    expect(result.state.credential?.length).toBe(result.password.length);
  });

  it("round-trips the stored password through reveal", async () => {
    const { service } = build();
    const issued = await service.issue(actorId, academyId, membershipId);
    const read = await service.reveal(actorId, academyId, membershipId);
    expect(read.password).toBe(issued.password);
  });

  it("still works with no key, and stores nothing to read back", async () => {
    const { service, setPassword, upsert } = build({ key: null });
    const result = await service.issue(actorId, academyId, membershipId);

    expect(setPassword).toHaveBeenCalled();
    expect(result.password).toHaveLength(10);
    expect(upsert).not.toHaveBeenCalled();
    expect(result.state.credential).toBeNull();

    await expect(
      service.reveal(actorId, academyId, membershipId),
    ).rejects.toMatchObject({ code: "STUDENT_CREDENTIAL_STORAGE_UNAVAILABLE" });
  });
});

describe("StudentCredentialService target checks", () => {
  it("refuses a member who holds a staff role", async () => {
    const { service } = build({
      roles: { role: "TEACHER", extraRoles: [] },
    });
    await expect(
      service.issue(actorId, academyId, membershipId),
    ).rejects.toMatchObject({ code: "STUDENT_CREDENTIAL_TARGET_INVALID" });
  });

  it("refuses a membership that is not in this academy", async () => {
    const { service, prisma } = build();
    (prisma.academyMembership.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null);
    await expect(
      service.state(academyId, membershipId),
    ).rejects.toMatchObject({ code: "STUDENT_CREDENTIAL_TARGET_INVALID" });
  });
});

describe("StudentCredentialService.reveal", () => {
  it("reports that the student changed it themselves rather than failing", async () => {
    const { service } = build();
    await expect(
      service.reveal(actorId, academyId, membershipId),
    ).rejects.toMatchObject({ code: "STUDENT_CREDENTIAL_NOT_STORED" });
  });

  it("counts and records every read", async () => {
    const { service, prisma } = build();
    await service.issue(actorId, academyId, membershipId);
    await service.reveal(actorId, academyId, membershipId);

    expect(prisma.studentIssuedCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revealCount: { increment: 1 } }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "academy.member.password.revealed",
          actorUserId: actorId,
        }),
      }),
    );
  });
});

describe("StudentCredentialService.forget", () => {
  it("destroys the stored copy once it is no longer the student's password", async () => {
    const { service, deleteMany } = build();
    await service.forget(userId);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId } });
  });
});
