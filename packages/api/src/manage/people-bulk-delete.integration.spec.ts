import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { ManagerScopeService } from "./manager-scope.service.js";
import { PeopleBulkService } from "./people-bulk.service.js";

/**
 * Deleting people, against a disposable PostgreSQL
 * (COVE_INTEGRATION_DATABASE_URL), never a shared database.
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("deleting people against PostgreSQL", () => {
  const createClient = (url: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [{ emit: "event", level: "query" }] });
  let client: ReturnType<typeof createClient>;
  let bulk: PeopleBulkService;
  let statements = 0;
  const supabaseAuth = { deleteUser: vi.fn().mockResolvedValue(undefined) };
  const revocation = { revokeTeacher: vi.fn().mockResolvedValue(undefined), revokeStudent: vi.fn().mockResolvedValue(undefined) };

  const organizationId = randomUUID();
  const academyId = randomUUID();
  const otherAcademyId = randomUUID();
  const classId = randomUUID();
  const person = (name: string) => ({ user: randomUUID(), auth: randomUUID(), membership: randomUUID(), name });
  const manager = person("Manager");
  const homeroom = person("Homeroom");
  const assistant = person("Assistant");
  const loneStudent = person("Lone student");
  const sharedStudent = person("Shared student");
  const identity = (auth: string) => ({ authUserId: auth }) as SupabaseIdentity;
  const ids = (...people: Array<{ membership: string }>) => ({ mode: "ids" as const, membershipIds: people.map((p) => p.membership) });
  let revision = 0;
  const run = async (selection: ReturnType<typeof ids>) => {
    const preview = await bulk.preview(identity(manager.auth), { academyId, selection, options: { kind: "DELETE" } });
    revision = preview.peopleRevision;
    const result = await bulk.run(identity(manager.auth), {
      academyId, selection, options: { kind: "DELETE" }, idempotencyKey: randomUUID(), peopleRevision: revision,
    });
    return { preview, result };
  };

  beforeAll(async () => {
    client = createClient(databaseUrl!);
    client.$on("query", () => { statements += 1; });
    const prisma = client as unknown as PrismaService;
    const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    bulk = new PeopleBulkService(prisma, new ManagerScopeService(prisma, access), new AuditService(), new RateLimitService(),
      revocation as never, supabaseAuth as never);

    await client.organization.create({ data: { id: organizationId, name: "Delete fixture", slug: `del-${organizationId}` } });
    for (const [id, slug] of [[academyId, "a"], [otherAcademyId, "b"]] as const) {
      await client.academy.create({ data: { id, organizationId, name: `Academy ${slug}`, slug: `del-${slug}-${id}`, status: "ACTIVE" } });
    }
    for (const p of [manager, homeroom, assistant, loneStudent, sharedStudent]) {
      await client.user.create({ data: { id: p.user, authUserId: p.auth, status: "ACTIVE", displayName: p.name,
        email: `${p.user}@example.test`, username: `u-${p.user.slice(0, 8)}` } });
    }
    const role = { [manager.membership]: "MANAGER", [homeroom.membership]: "TEACHER", [assistant.membership]: "TEACHER" } as Record<string, "MANAGER" | "TEACHER">;
    for (const p of [manager, homeroom, assistant, loneStudent, sharedStudent]) {
      await client.academyMembership.create({ data: { id: p.membership, academyId, userId: p.user, role: role[p.membership] ?? "STUDENT", status: "ACTIVE" } });
    }
    // The shared student also belongs to another academy, which keeps their account.
    await client.academyMembership.create({ data: { academyId: otherAcademyId, userId: sharedStudent.user, role: "STUDENT", status: "ACTIVE" } });
    await client.class.create({ data: { id: classId, academyId, name: "Class A", createdByUserId: manager.user, teacherMembershipId: homeroom.membership } });
    await client.classAssistantTeacher.create({ data: { classId, membershipId: assistant.membership } });
    await client.classEnrollment.createMany({ data: [loneStudent, sharedStudent].map((p) => ({ classId, membershipId: p.membership, enrolledByUserId: manager.user })) });
  });

  afterAll(async () => { await client?.$disconnect(); });

  it("previews who is removed and whose account goes, then deletes them", async () => {
    const { preview, result } = await run(ids(loneStudent, sharedStudent));
    expect(preview.affected).toBe(2);
    expect(preview.consequences).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "enrollments_dropped", count: 2 }),
      expect.objectContaining({ kind: "accounts_deleted", count: 1, sample: ["Lone student"] }),
    ]));
    expect(result.succeeded).toBe(2);
    expect(result.rows.find((row) => row.membershipId === loneStudent.membership)?.code).toBe("account_deleted");

    const memberships = await client.academyMembership.findMany({ where: { academyId, id: { in: [loneStudent.membership, sharedStudent.membership] } } });
    expect(memberships.every((m) => m.status === "LEFT")).toBe(true);
    expect(await client.classEnrollment.count({ where: { classId } })).toBe(0);

    // The lone student's account is deleted and its identifiers released; the shared one stays.
    const lone = await client.user.findUniqueOrThrow({ where: { id: loneStudent.user } });
    expect(lone).toMatchObject({ status: "DELETED", email: null, username: null, authUserId: null });
    expect(supabaseAuth.deleteUser).toHaveBeenCalledWith(loneStudent.auth);
    expect(supabaseAuth.deleteUser).not.toHaveBeenCalledWith(sharedStudent.auth);
    expect(await client.user.findUniqueOrThrow({ where: { id: sharedStudent.user } })).toMatchObject({ status: "ACTIVE" });
    expect(await client.academyMembership.count({ where: { academyId: otherAcademyId, userId: sharedStudent.user, status: "ACTIVE" } })).toBe(1);

    expect(await client.auditLog.count({ where: { academyId, action: "academy.people.bulk.delete" } })).toBe(1);
  });

  it("hands a deleted teacher's class to its next teacher", async () => {
    await run(ids(homeroom));
    const cls = await client.class.findUniqueOrThrow({ where: { id: classId } });
    expect(cls.teacherMembershipId).toBe(assistant.membership);
    expect(await client.classAssistantTeacher.count({ where: { classId } })).toBe(0);
    expect(revocation.revokeTeacher).toHaveBeenCalledWith(homeroom.membership, "MEMBERSHIP_INACTIVE");
  });

  it("refuses to delete the manager doing it, or the academy's last manager", async () => {
    const preview = await bulk.preview(identity(manager.auth), { academyId, selection: ids(manager), options: { kind: "DELETE" } });
    expect(preview).toMatchObject({ affected: 0, blocked: 1 });
    await expect(bulk.run(identity(manager.auth), {
      academyId, selection: ids(manager), options: { kind: "DELETE" }, idempotencyKey: randomUUID(), peopleRevision: preview.peopleRevision,
    })).rejects.toMatchObject({ code: "BULK_SELECTION_EMPTY" });
    expect(await client.user.findUniqueOrThrow({ where: { id: manager.user } })).toMatchObject({ status: "ACTIVE" });
  });

  it("refuses a teacher, who is not a manager", async () => {
    await expect(bulk.preview(identity(assistant.auth), { academyId, selection: ids(loneStudent), options: { kind: "DELETE" } }))
      .rejects.toMatchObject({ code: "MANAGER_OPERATIONS_ACCESS_DENIED" });
  });

  it("deletes in a fixed number of statements, however many are selected", async () => {
    const extra = Array.from({ length: 13 }, (_, index) => person(`Extra ${index}`));
    await client.user.createMany({ data: extra.map((p) => ({ id: p.user, authUserId: p.auth, status: "ACTIVE" as const, displayName: p.name })) });
    await client.academyMembership.createMany({ data: extra.map((p) => ({ id: p.membership, academyId, userId: p.user, role: "STUDENT" as const, status: "ACTIVE" as const })) });
    const counted = async (people: typeof extra) => {
      const selection = ids(...people);
      const preview = await bulk.preview(identity(manager.auth), { academyId, selection, options: { kind: "DELETE" } });
      statements = 0;
      await bulk.run(identity(manager.auth), { academyId, selection, options: { kind: "DELETE" }, idempotencyKey: randomUUID(), peopleRevision: preview.peopleRevision });
      return statements;
    };
    const one = await counted(extra.slice(0, 1));
    const twelve = await counted(extra.slice(1));
    // The same statements for twelve people as for one (27 when written).
    expect(twelve).toBe(one);
    expect(twelve).toBeLessThanOrEqual(30);
  });
});
