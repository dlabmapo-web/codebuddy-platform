import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { readAcademyPermission } from "./academy-access-read.js";
import { AcademyAccessService } from "./academy-access.service.js";
import type { SupportGrantResolver } from "./support-grant.resolver.js";
import type { DlabPolicyService } from "../integrations/dlab/dlab-policy.service.js";

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const academyId = id(1), otherAcademyId = id(2), userId = id(3), authUserId = id(4), membershipId = id(5);

describe.skipIf(!databaseUrl)("fresh academy permission projection against PostgreSQL", () => {
  let prisma: PrismaService;
  beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Use a disposable loopback database");
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }));
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  async function fixture(run: (tx: Prisma.TransactionClient, access: AcademyAccessService, findLive: ReturnType<typeof vi.fn>) => Promise<void>) {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("CREATE TEMP TABLE users (id uuid PRIMARY KEY, auth_user_id uuid UNIQUE, status text, platform_role text DEFAULT 'USER') ON COMMIT DROP");
      await tx.$executeRawUnsafe("CREATE TEMP TABLE academies (id uuid PRIMARY KEY, status text, kind text) ON COMMIT DROP");
      await tx.$executeRawUnsafe("CREATE TEMP TABLE academy_memberships (id uuid PRIMARY KEY, user_id uuid, academy_id uuid, role text, status text, UNIQUE (academy_id, user_id)) ON COMMIT DROP");
      await tx.$executeRawUnsafe("CREATE TEMP TABLE academy_membership_roles (membership_id uuid, role text) ON COMMIT DROP");
      await tx.$executeRaw`INSERT INTO users (id, auth_user_id, status) VALUES (${userId}::uuid, ${authUserId}::uuid, 'ACTIVE')`;
      await tx.$executeRaw`INSERT INTO academies VALUES (${academyId}::uuid, 'ACTIVE', 'ACADEMY'), (${otherAcademyId}::uuid, 'ACTIVE', 'ACADEMY')`;
      await tx.$executeRaw`INSERT INTO academy_memberships VALUES (${membershipId}::uuid, ${userId}::uuid, ${academyId}::uuid, 'TEACHER', 'ACTIVE'), (${id(6)}::uuid, ${userId}::uuid, ${otherAcademyId}::uuid, 'MANAGER', 'ACTIVE')`;
      await tx.$executeRaw`INSERT INTO academy_membership_roles VALUES (${membershipId}::uuid, 'TEAM_LEAD'), (${id(6)}::uuid, 'TEACHER')`;
      const findLive = vi.fn().mockResolvedValue(null);
      const access = new AcademyAccessService(tx as unknown as PrismaService, { findLive } as unknown as SupportGrantResolver);
      await run(tx, access, findLive);
    });
  }

  it("projects only the requested academy and its extra roles", async () => {
    await fixture(async tx => {
      expect(await readAcademyPermission(tx, authUserId, academyId)).toEqual({
        id: userId, status: "ACTIVE", academy: { status: "ACTIVE", kind: "ACADEMY" },
        membership: { role: "TEACHER", status: "ACTIVE", academy: { status: "ACTIVE" }, extraRoles: [{ role: "TEAM_LEAD" }] },
      });
      const foreign = await readAcademyPermission(tx, authUserId, otherAcademyId);
      expect(foreign?.membership?.role).toBe("MANAGER");
      expect(foreign?.membership?.extraRoles).toEqual([{ role: "TEACHER" }]);
      expect(await readAcademyPermission(tx, id(999), academyId)).toBeNull();
      expect(await readAcademyPermission(tx, authUserId, id(999))).toEqual({ id: userId, status: "ACTIVE", academy: null, membership: null });
    });
  });

  it("preserves role policy and cannot borrow another academy's manager permission", async () => {
    await fixture(async (_tx, access) => {
      await expect(access.requirePermission(authUserId, academyId, "academy.read")).resolves.toMatchObject({ role: "TEACHER", roles: ["TEACHER", "TEAM_LEAD"], via: "membership" });
      await expect(access.requirePermission(authUserId, academyId, "academy.members.manage")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      await expect(access.requirePermission(authUserId, otherAcademyId, "academy.members.manage")).resolves.toMatchObject({ role: "MANAGER" });
    });
  });

  it.each(["STUDENT", "TEACHER", "TEAM_LEAD", "MANAGER"])("resolves the current %s role without persisting authority", async role => {
    await fixture(async (tx, access) => {
      await tx.$executeRaw`DELETE FROM academy_membership_roles WHERE membership_id = ${membershipId}::uuid`;
      await tx.$executeRaw`UPDATE academy_memberships SET role = ${role} WHERE id = ${membershipId}::uuid`;
      await expect(access.requirePermission(authUserId, academyId, "curriculum.read")).resolves.toMatchObject({ role, roles: [role] });
      await tx.$executeRaw`UPDATE academy_memberships SET status = 'SUSPENDED' WHERE id = ${membershipId}::uuid`;
      await expect(access.requirePermission(authUserId, academyId, "curriculum.read")).rejects.toMatchObject({ code: "ACADEMY_MEMBERSHIP_SUSPENDED" });
    });
  });

  it.each(["SUSPENDED", "DELETED", "PENDING_PROFILE"])("refuses an account changed to %s before considering grants", async status => {
    await fixture(async (tx, access, findLive) => {
      await tx.$executeRaw`UPDATE users SET status = ${status} WHERE id = ${userId}::uuid`;
      await expect(access.requirePermission(authUserId, academyId, "academy.read")).rejects.toMatchObject({ code: status === "PENDING_PROFILE" ? "PROFILE_INCOMPLETE" : "USER_SUSPENDED" });
      expect(findLive).not.toHaveBeenCalled();
    });
  });

  it("does not admit an active member of a closed academy through a grant", async () => {
    await fixture(async (tx, access, findLive) => {
      await tx.$executeRaw`UPDATE academies SET status = 'ARCHIVED' WHERE id = ${academyId}::uuid`;
      await expect(access.requirePermission(authUserId, academyId, "academy.read")).rejects.toMatchObject({ code: "ACADEMY_MEMBERSHIP_SUSPENDED" });
      expect(findLive).not.toHaveBeenCalled();
    });
  });

  it("still applies DLAB campus policy and ignores historic memberships for HQ administrators", async () => {
    await fixture(async (tx, _access, findLive) => {
      await tx.$executeRaw`UPDATE users SET platform_role = 'ADMIN' WHERE id = ${userId}::uuid`;
      findLive.mockResolvedValue({ id: id(700), academyId, assumedRole: "MANAGER", readOnly: true,
        allowMonitoring: false, expiresAt: new Date(Date.now() + 60_000) });
      const assertAcademy = vi.fn().mockResolvedValue({ isPlatformAdmin: true });
      const access = new AcademyAccessService(tx as unknown as PrismaService,
        { findLive } as unknown as SupportGrantResolver, { assertAcademy } as unknown as DlabPolicyService);
      await expect(access.requirePermission(authUserId, academyId, "academy.read")).resolves.toMatchObject({ role: "MANAGER", via: "support" });
      expect(assertAcademy).toHaveBeenCalledWith(authUserId, academyId);
      assertAcademy.mockRejectedValueOnce(new Error("campus access revoked"));
      await expect(access.requirePermission(authUserId, academyId, "academy.read")).rejects.toThrow("campus access revoked");
    });
  });
});
