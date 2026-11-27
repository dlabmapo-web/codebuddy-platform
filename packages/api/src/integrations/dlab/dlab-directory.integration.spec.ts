import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { PlatformLifecycleService } from "../../platform/platform-lifecycle.service.js";
import { PeopleRosterService } from "../../manage/people-roster.service.js";
import { PeopleDirectoryService } from "../../manage/people-directory.service.js";
import {
  listPeopleInputSchema,
  listStudentRosterInputSchema,
  listStaffRosterInputSchema,
} from "@cove/shared";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { PrismaPg } from "@prisma/adapter-pg";
import { dlabAcademyRoles, type DlabUser } from "@cove/shared";
import { PrismaClient } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { DlabError } from "./dlab-error.js";
import { DlabStateService } from "./dlab-state.service.js";
import { DlabSourceService } from "./dlab-source.service.js";
import { DlabReconcilerService } from "./dlab-reconciler.service.js";
import { DlabDirectoryCatchup } from "./dlab-directory-catchup.js";
import { DlabDirectoryService } from "./dlab-directory.service.js";
import { DlabCampusProvisioner } from "./dlab-campus-provisioner.js";
import { dlabTransaction, sourceWrite } from "./dlab-transaction.js";
import { readDlabDirectory } from "./dlab-directory-read.js";
import { AuditService } from "../../academies/audit.service.js";
import { RateLimitService } from "../../academies/rate-limit.service.js";
import { AcademyAccessService } from "../../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../../authorization/support-grant.resolver.js";
import { ManagerScopeService } from "../../manage/manager-scope.service.js";
import { PeopleBulkService } from "../../manage/people-bulk.service.js";
import { LearningClassContextService } from "../../learn/learning-class-context.service.js";
import { DlabSsoService } from "./dlab-sso.service.js";
import { DlabPolicyService } from "./dlab-policy.service.js";
import { applyStudentRecovery, previewStudentRecovery, studentRecoveryPlan } from "./dlab-student-recovery.js";

const database =
  process.env.COVE_INTEGRATION_DATABASE_URL ??
  process.env.COVE_DLAB_TEST_DATABASE_URL;
const redisUrl = process.env.COVE_DLAB_TEST_REDIS_URL;
describe.skipIf(!database || !redisUrl)(
  "pre-login directory projection (disposable PostgreSQL/Redis)",
  { timeout: 20_000 },
  () => {
    const createClient = (connectionString: string) =>
      new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
        log: [{ emit: "event", level: "query" }],
      });
    let db: ReturnType<typeof createClient>, redis: Redis, queries: string[];
    beforeAll(() => {
      const url = new URL(database!);
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.pathname !== "/cove_dlab_test"
      )
        throw new Error("Disposable database required");
      db = createClient(database!);
      queries = [];
      db.$on("query", (e) => queries.push(e.query));
      redis = new Redis(redisUrl!);
    });
    afterAll(async () => {
      await redis?.quit();
      await db?.$disconnect();
    });
    async function fixture(count = 1) {
      const config = new ConfigService({
        DLAB_OS_BASE_URL: "http://127.0.0.1:4199/v1",
        DLAB_REDIRECT_URI: "http://127.0.0.1:3309/sso/callback",
        DLAB_CLIENT_SECRET: "disposable-directory-fixture",
        DLAB_DIRECTORY_SYNC_ENABLED: true,
        DLAB_SSO_ENABLED: true,
        DLAB_AUTO_PROVISION_CAMPUSES: true,
        DLAB_SSO_ROLLOUT_MODE: "campus",
        PLATFORM_ORGANIZATION_SLUG: "directory-fixtures",
      });
      const state = new DlabStateService(redis),
        reconciler = new DlabReconcilerService(config as never);
      const revocations = { revokeMembership: vi.fn(), revokeAcademy: vi.fn() };
      const source = new DlabSourceService(
        db as PrismaService,
        state,
        reconciler,
        revocations as never,
        new DlabCampusProvisioner(config as never),
      );
      const provider = new Set<string>();
      const auth = {
        createDlabUser: vi.fn(async (id: string) => {
          provider.add(id);
        }),
        dlabTokenHash: vi.fn(),
      };
      const directory = new DlabDirectoryService(
        config as never,
        db as PrismaService,
        state,
        source,
        auth as never,
        reconciler,
      );
      const org = await db.organization.create({
        data: { name: "Directory fixtures", slug: randomUUID() },
      });
      const campusIds = Array.from({ length: count }, () => randomUUID());
      const academyIds = campusIds.map(() => randomUUID());
      await db.academy.createMany({
        data: academyIds.map((id) => ({
          id,
          organizationId: org.id,
          name: "Old demo name",
          slug: "directory-" + id,
        })),
      });
      await db.dlabCampus.createMany({
        data: campusIds.map((id, i) => ({
          externalCampusId: id,
          academyId: academyIds[i]!,
          name: "HQ name",
          status: "active",
          ssoEnabled: true,
          payloadHash: "fixture",
        })),
      });
      const payload = (role = "student"): DlabUser => ({
        name: "Never logged in",
        external_campus_id: campusIds[0]!,
        external_campus_ids: role === "student" ? [campusIds[0]!] : campusIds,
        user_role: role,
        account_status: "active",
        updated_at: "2026-11-13T01:00:00Z",
      });
      return {
        config,
        state,
        reconciler,
        source,
        auth,
        directory,
        provider,
        revocations,
        campusIds,
        academyIds,
        payload,
      };
    }
    it.each([
      "student",
      "tutor",
      "instructor",
      "so_staff",
      "edu_manager",
      "lab_head",
      "hq_admin",
      "future_role",
    ])("creates %s before login, idempotently", async (role) => {
      const f = await fixture(2),
        id = randomUUID(),
        payload = f.payload(role);
      const response = await f.directory.syncUser(id, payload, randomUUID());
      expect(response).toMatchObject({
        ok: true,
        provisioning_status: "READY",
        outcome: "applied",
      });
      const identity = await db.dlabIdentity.findUniqueOrThrow({
        where: { externalUserId: id },
      });
      const user = await db.user.findUniqueOrThrow({
        where: { id: response.id },
      });
      expect(user.id).toBe(identity.reservedUserId);
      expect(user.lastSignInAt).toBeNull();
      expect(f.auth.dlabTokenHash).not.toHaveBeenCalled();
      expect(f.provider.size).toBe(1);
      const members = await db.academyMembership.findMany({
        where: { userId: user.id },
        include: { extraRoles: true },
      });
      expect(members.length).toBe(
        role === "hq_admin"
          ? 0
          : ["student", "future_role"].includes(role)
            ? 1
            : 2,
      );
      for (const m of members)
        expect([m.role, ...m.extraRoles.map((r) => r.role)].sort()).toEqual(
          [...dlabAcademyRoles(role)].sort(),
        );
      expect(user.platformRole).toBe(role === "hq_admin" ? "ADMIN" : "USER");
      if (members.length) {
        const academyId = f.academyIds[0]!;
        const roster = new PeopleRosterService(
          db as PrismaService,
          {
            requireMemberReader: async () => ({
              academyId,
              canManageMembers: true,
            }),
          } as never,
          {} as never,
        );
        const page =
          role === "student" || role === "future_role"
            ? await roster.listStudents(
                {} as never,
                listStudentRosterInputSchema.parse({ academyId }),
              )
            : await roster.listStaff(
                {} as never,
                listStaffRosterInputSchema.parse({ academyId }),
              );
        expect(page.rows.some((row) => row.userId === user.id)).toBe(true);
      }
      const revisions = await db.academy.findMany({
        where: { id: { in: f.academyIds } },
        select: { id: true, peopleRevision: true },
        orderBy: { id: "asc" },
      });
      expect(
        await f.directory.syncUser(id, payload, randomUUID()),
      ).toMatchObject({
        id: user.id,
        outcome: "unchanged",
        membership_ids: response.membership_ids,
      });
      expect(
        await db.academy.findMany({
          where: { id: { in: f.academyIds } },
          select: { id: true, peopleRevision: true },
          orderBy: { id: "asc" },
        }),
      ).toEqual(revisions);
    });
    it("keeps source/error evidence, rejects unresolved scopes before provider work, and repairs the same delivery", async () => {
      const f = await fixture(),
        id = randomUUID(),
        absent = randomUUID();
      const payload = {
        ...f.payload("tutor"),
        external_campus_ids: [...f.campusIds, absent],
      };
      await expect(
        f.directory.syncUser(id, payload, randomUUID()),
      ).rejects.toMatchObject({ reason: "campus_mapping_required" });
      expect(f.auth.createDlabUser).not.toHaveBeenCalled();
      expect(
        await db.dlabIdentity.findUnique({ where: { externalUserId: id } }),
      ).toMatchObject({ userId: null, provisioningStatus: "ERROR" });
      await f.source.campus(
        absent,
        { name: "New HQ campus", status: "active" },
        randomUUID(),
        true,
      );
      expect(
        await f.directory.syncUser(id, payload, randomUUID()),
      ).toMatchObject({
        provisioning_status: "READY",
        membership_ids: expect.arrayContaining([expect.any(String)]),
      });
      expect(
        await db.academyMembership.count({
          where: {
            userId: (
              await db.dlabIdentity.findUniqueOrThrow({
                where: { externalUserId: id },
              })
            ).userId!,
          },
        }),
      ).toBe(2);
    });
    it("does not claim an ordinary Cove account that collides with a reserved UUID", async () => {
      const f = await fixture(),
        id = randomUUID(),
        payload = f.payload();
      const saved = await f.source.user(id, payload, undefined, undefined, {
        deferReconcile: true,
      });
      await db.user.create({
        data: {
          id: saved.reservedUserId,
          username:
            "ordinary_" + saved.reservedUserId.replaceAll("-", "").slice(0, 20),
          displayName: "Ordinary account",
          status: "ACTIVE",
        },
      });
      await expect(
        f.directory.syncUser(id, payload, randomUUID()),
      ).rejects.toMatchObject({ reason: "identity_conflict" });
      expect(f.auth.createDlabUser).not.toHaveBeenCalled();
      expect(
        await db.user.findUnique({ where: { id: saved.reservedUserId } }),
      ).toMatchObject({ displayName: "Ordinary account", authUserId: null });
      expect(
        await db.dlabIdentity.findUnique({ where: { externalUserId: id } }),
      ).toMatchObject({ userId: null });
    });
    it("recovers provider failure without issuing credentials or replacing the reserved identity", async () => {
      const f = await fixture(),
        id = randomUUID(),
        payload = f.payload();
      f.auth.createDlabUser.mockRejectedValueOnce(
        new Error("private provider body"),
      );
      await expect(
        f.directory.syncUser(id, payload, randomUUID()),
      ).rejects.toMatchObject({ reason: "auth_provisioning_failed" });
      const failed = await db.dlabIdentity.findUniqueOrThrow({
        where: { externalUserId: id },
      });
      expect(failed).toMatchObject({
        provisioningStatus: "ERROR",
        lastProvisionErrorCode: "auth_provisioning_failed",
        userId: null,
      });
      expect((await f.directory.syncUser(id, payload, randomUUID())).id).toBe(
        failed.reservedUserId,
      );
      expect(
        await db.dlabIntegrationEvent.findFirst({
          where: { externalUserId: id, action: "user.provision_failed" },
        }),
      ).not.toBeNull();
    });
    it("retains a verified provider account after SQL rollback and repairs the identical source version", async () => {
      const f = await fixture(),
        id = randomUUID(),
        payload = f.payload();
      const saved = await f.source.user(id, payload, undefined, undefined, {
        strict: true,
        deferReconcile: true,
      });
      await expect(
        f.state.lock(id, (owned) =>
          f.directory.provision(saved, randomUUID(), owned, async () => {
            throw new DlabError("directory_projection_unavailable", 503);
          }),
        ),
      ).rejects.toMatchObject({ reason: "directory_projection_unavailable" });
      expect(f.provider.has(saved.reservedUserId)).toBe(true);
      expect(
        await db.user.findUnique({ where: { id: saved.reservedUserId } }),
      ).toBeNull();
      expect(
        await f.directory.syncUser(id, payload, randomUUID()),
      ).toMatchObject({
        id: saved.reservedUserId,
        provisioning_status: "READY",
      });
      expect(f.provider.size).toBe(1);
    });
    it("rejects stale/conflicting/missing versions, preserves student local profile fields and membership restrictions", async () => {
      const f = await fixture(),
        id = randomUUID(),
        payload = f.payload();
      const first = await f.directory.syncUser(id, payload, randomUUID()),
        membershipId = first.membership_ids[0]!;
      await db.studentAcademyProfile.update({
        where: { membershipId },
        data: { codingInterests: ["robotics"] },
      });
      await db.academyMembership.update({
        where: { id: membershipId },
        data: { status: "SUSPENDED" },
      });
      const updated = {
        ...payload,
        name: "New HQ name",
        grade: "5",
        updated_at: "2026-11-14T01:00:00Z",
      };
      expect(
        await f.directory.syncUser(id, updated, randomUUID()),
      ).toMatchObject({ outcome: "applied_restricted" });
      expect(
        await db.studentAcademyProfile.findUnique({ where: { membershipId } }),
      ).toMatchObject({ schoolGrade: "5", codingInterests: ["robotics"] });
      expect(
        await db.academyMembership.findUnique({ where: { id: membershipId } }),
      ).toMatchObject({ status: "SUSPENDED" });
      for (const [body, reason] of [
        [payload, "stale_source_version"],
        [{ ...updated, name: "conflict" }, "conflicting_source_version"],
        [{ ...updated, updated_at: undefined }, "source_timestamp_required"],
      ] as const)
        await expect(
          f.directory.syncUser(id, body, randomUUID()),
        ).rejects.toMatchObject({ reason });
      expect(
        await db.user.findUnique({ where: { id: first.id } }),
      ).toMatchObject({ displayName: updated.name, lastSignInAt: null });
    });
    it("creates restricted inactive directory records and never recreates deleted credentials", async () => {
      const f = await fixture(),
        id = randomUUID(),
        payload = { ...f.payload(), account_status: "inactive" as const };
      const response = await f.directory.syncUser(id, payload, randomUUID());
      expect(response.outcome).toBe("applied_restricted");
      expect(
        await db.dlabMembershipBinding.findFirst({
          where: { externalUserId: id },
        }),
      ).toMatchObject({
        sourceAccessStatus: "BLOCKED",
        localSuspendedAt: null,
      });
      await dlabTransaction(db as PrismaService, async (tx) => {
        await sourceWrite(tx);
        await tx.user.update({
          where: { id: response.id },
          data: { status: "DELETED", authUserId: null },
        });
      });
      f.auth.createDlabUser.mockClear();
      expect(
        await f.directory.syncUser(
          id,
          {
            ...payload,
            account_status: "active",
            updated_at: "2026-11-14T01:00:00Z",
          },
          randomUUID(),
        ),
      ).toMatchObject({ id: response.id, outcome: "applied_restricted" });
      expect(f.auth.createDlabUser).not.toHaveBeenCalled();
    });
    it("rejects lock contention and loss and cannot finalize a stale active grant after concurrent deactivation", async () => {
      const f = await fixture(),
        id = randomUUID(),
        payload = f.payload();
      let release!: () => void;
      const wait = new Promise<void>((r) => {
        release = r;
      });
      let entered!: () => void;
      const enteredPromise = new Promise<void>((r) => {
        entered = r;
      });
      f.auth.createDlabUser.mockImplementationOnce(async () => {
        entered();
        await wait;
      });
      const pending = f.directory.syncUser(id, payload, randomUUID());
      const observed = pending.catch((e) => e);
      await enteredPromise;
      await expect(
        f.directory.syncUser(id, payload, randomUUID()),
      ).rejects.toMatchObject({ reason: "provisioning_busy" });
      await f.source.user(
        id,
        {
          ...payload,
          account_status: "inactive",
          updated_at: "2026-11-14T01:00:00Z",
        },
        undefined,
        undefined,
        { strict: true, deferReconcile: true },
      );
      release();
      expect(await observed).toMatchObject({ reason: "identity_changed" });
      const saved = await db.dlabIdentity.findUniqueOrThrow({
        where: { externalUserId: id },
      });
      expect(saved.userId).toBeNull();
      expect(saved.accountStatus).toBe("inactive");
      await expect(
        f.directory.provision(saved, undefined, async () => {
          throw new DlabError("provisioning_lock_lost", 503);
        }),
      ).rejects.toMatchObject({ reason: "provisioning_lock_lost" });
    });
    it("projects names/closure/reopening onto stable academies and preserves local holds, archives and SSO disable", async () => {
      const f = await fixture(),
        id = f.campusIds[0]!,
        academyId = f.academyIds[0]!;
      const original = await db.academy.findUniqueOrThrow({
        where: { id: academyId },
      });
      await f.source.campus(
        id,
        {
          name: "대치캠퍼스",
          status: "inactive",
          updated_at: "2026-11-14T00:00:00Z",
        },
        randomUUID(),
        true,
      );
      expect(
        await db.academy.findUnique({ where: { id: academyId } }),
      ).toMatchObject({
        name: "대치캠퍼스",
        status: "SUSPENDED",
        slug: original.slug,
      });
      expect(
        await db.dlabCampus.findUnique({ where: { externalCampusId: id } }),
      ).toMatchObject({ localAcademyRestriction: null });
      await db.academy.update({
        where: { id: academyId },
        data: { status: "SUSPENDED" },
      });
      await f.source.campus(
        id,
        {
          name: "Renamed while closed",
          status: "active",
          updated_at: "2026-11-15T00:00:00Z",
        },
        randomUUID(),
        true,
      );
      expect(
        await db.academy.findUnique({ where: { id: academyId } }),
      ).toMatchObject({ name: "Renamed while closed", status: "SUSPENDED" });
      await db.academy.update({
        where: { id: academyId },
        data: { status: "ACTIVE" },
      });
      await db.dlabCampus.update({
        where: { externalCampusId: id },
        data: { ssoEnabled: false },
      });
      await f.source.campus(
        id,
        {
          name: "Final HQ name",
          status: "active",
          updated_at: "2026-11-16T00:00:00Z",
        },
        randomUUID(),
        true,
      );
      expect(
        await db.dlabCampus.findUnique({ where: { externalCampusId: id } }),
      ).toMatchObject({ ssoEnabled: false });
      await expect(
        db.academy.update({
          where: { id: academyId },
          data: { name: "local rename" },
        }),
      ).rejects.toThrow();
      await db.academy.update({
        where: { id: academyId },
        data: { status: "ARCHIVED" },
      });
      await f.source.campus(
        id,
        {
          name: "Archived HQ name",
          status: "active",
          updated_at: "2026-11-17T00:00:00Z",
        },
        randomUUID(),
        true,
      );
      expect(
        await db.academy.findUnique({ where: { id: academyId } }),
      ).toMatchObject({ status: "ARCHIVED", name: "Archived HQ name" });
      const tombstone = randomUUID();
      expect(
        await f.source.campus(
          tombstone,
          {
            name: "Old sample",
            status: "inactive",
            updated_at: "2026-11-14T00:00:00Z",
          },
          randomUUID(),
          true,
        ),
      ).toMatchObject({
        academyId: null,
        directoryOutcome: "source_only_inactive",
      });
      await expect(
        f.source.campus(
          tombstone,
          {
            name: "Old sample",
            status: "active",
            updated_at: "2026-11-13T00:00:00Z",
          },
          randomUUID(),
          true,
        ),
      ).rejects.toMatchObject({ reason: "stale_source_version" });
    });
    it("local academy restore reconciles directory access without waiting for a user resend", async () => {
      const f = await fixture(),
        id = randomUUID(),
        campusId = f.campusIds[0]!,
        academyId = f.academyIds[0]!;
      const result = await f.directory.syncUser(id, f.payload(), randomUUID());
      await f.source.campus(
        campusId,
        {
          name: "HQ campus",
          status: "inactive",
          updated_at: "2026-11-14T00:00:00Z",
        },
        randomUUID(),
        true,
      );
      const lifecycle = new PlatformLifecycleService(
        db as PrismaService,
        { requirePermission: async () => ({ userId: result.id }) } as never,
        { write: async () => undefined } as never,
        { revokeAcademy: async () => undefined } as never,
        f.reconciler,
      );
      await lifecycle.setStatus({} as never, {
        academyId,
        status: "SUSPENDED",
        reason: "Keep closed locally",
      });
      await f.source.campus(
        campusId,
        {
          name: "HQ campus",
          status: "active",
          updated_at: "2026-11-15T00:00:00Z",
        },
        randomUUID(),
        true,
      );
      expect(
        await db.academyMembership.findUnique({
          where: { id: result.membership_ids[0] },
        }),
      ).toMatchObject({ status: "SUSPENDED" });
      await lifecycle.setStatus({} as never, {
        academyId,
        status: "ACTIVE",
        reason: "Clear independent restriction",
      });
      expect(
        await db.academyMembership.findUnique({
          where: { id: result.membership_ids[0] },
        }),
      ).toMatchObject({ status: "ACTIVE" });
      expect(
        await db.dlabMembershipBinding.findUnique({
          where: { membershipId: result.membership_ids[0] },
        }),
      ).toMatchObject({
        sourceAccessStatus: "ALLOWED",
        localSuspendedAt: null,
      });
    });
    it("previews without writes, applies campus-first and resumes without duplicating accounts; refuses plan drift", async () => {
      const f = await fixture(),
        id = randomUUID();
      const staged = await f.source.user(
        id,
        f.payload("tutor"),
        undefined,
        undefined,
        { deferReconcile: true },
      );
      const actor = await db.user.create({
        data: {
          username: "operator_" + randomUUID().replaceAll("-", "").slice(0, 20),
          status: "ACTIVE",
          platformRole: "ADMIN",
        },
      });
      const operator = new DlabDirectoryCatchup(
        db as PrismaService,
        f.config as never,
        f.directory,
        f.state,
        f.source,
        f.reconciler,
      );
      const beforeUsers = await db.user.count(),
        beforeEvents = await db.dlabIntegrationEvent.count();
      const plan = await operator.preview(actor.id, "test-target", {
        campus: f.campusIds[0],
        batchSize: 1,
      });
      expect(plan.entries).toHaveLength(2);
      expect(plan.entries[1]).toMatchObject({ kind: "user", action: "create" });
      expect(await db.user.count()).toBe(beforeUsers);
      expect(await db.dlabIntegrationEvent.count()).toBe(beforeEvents);
      expect(f.auth.createDlabUser).not.toHaveBeenCalled();
      expect(await operator.apply(plan, "test-target")).toMatchObject({
        failed: 0,
        completed: 2,
      });
      expect(
        await db.user.findUnique({ where: { id: staged.reservedUserId } }),
      ).not.toBeNull();
      const auditCount = await db.auditLog.count({
        where: { action: "dlab.directory.catchup", actorUserId: actor.id },
      });
      expect(await operator.apply(plan, "test-target")).toMatchObject({
        failed: 0,
        report: [
          { kind: "campus", id: f.campusIds[0], outcome: "resumed" },
          { kind: "user", id, outcome: "resumed" },
        ],
      });
      expect(
        await db.auditLog.count({
          where: { action: "dlab.directory.catchup", actorUserId: actor.id },
        }),
      ).toBe(auditCount);
      const next = await operator.preview(actor.id, "test-target", {
        campus: f.campusIds[0],
      });
      await f.source.user(
        id,
        {
          ...f.payload("tutor"),
          name: "Unreviewed source change",
          updated_at: "2026-11-14T00:00:00Z",
        },
        undefined,
        undefined,
        { deferReconcile: true },
      );
      expect(await operator.apply(next, "test-target")).toMatchObject({
        failed: 1,
        report: expect.arrayContaining([
          expect.objectContaining({ id, outcome: "plan_changed" }),
        ]),
      });
      await expect(
        operator.apply({ ...next, digest: "tampered" }, "test-target"),
      ).rejects.toMatchObject({ reason: "plan_changed" });
    });
    it("reconciles a mixed 1,818-person stored directory in cohorts; roster reads stay bounded at 1 and 100 rows", async () => {
      const f = await fixture(),
        campus = f.campusIds[0]!,
        academyId = f.academyIds[0]!;
      const records = Array.from({ length: 1818 }, (_, i) => ({
        staged: i >= 1798,
        sourceStatus:
          i % 40 === 0 ? ("inactive" as const) : ("active" as const),
        externalId: randomUUID(),
        userId: randomUUID(),
        role:
          i < 1744
            ? "student"
            : [
                "tutor",
                "instructor",
                "so_staff",
                "edu_manager",
                "lab_head",
                "hq_admin",
              ][i % 6]!,
      }));
      await dlabTransaction(db as PrismaService, async (tx) => {
        await sourceWrite(tx);
        await tx.user.createMany({
          data: records
            .filter((r) => !r.staged)
            .map((r) => ({
              id: r.userId,
              authUserId: r.userId,
              username: "dlab_" + r.userId.replaceAll("-", "").slice(0, 24),
              displayName: "Stored directory fixture",
              status: "ACTIVE" as const,
            })),
        });
        await tx.dlabIdentity.createMany({
          data: records.map((r, i) => ({
            externalUserId: r.externalId,
            reservedUserId: r.userId,
            userId: r.staged ? null : r.userId,
            externalCampusId: campus,
            externalCampusIds: [campus],
            name: "Stored directory fixture",
            userRole: r.role,
            accountStatus: r.sourceStatus,
            payloadHash: "fixture",
            provisioningStatus: r.staged
              ? "PENDING"
              : i % 31 === 0
                ? "ERROR"
                : "READY",
          })),
        });
      });
      queries.length = 0;
      await dlabTransaction(db as PrismaService, (tx) =>
        f.reconciler.reconcileBatch(
          tx,
          records.map((r) => r.externalId),
        ),
      );
      const firstCount = queries.length;
      for (const r of records.filter((r) => r.staged)) {
        await f.directory.syncUser(
          r.externalId,
          {
            ...f.payload(r.role),
            name: "Stored directory fixture",
            account_status: r.sourceStatus,
          },
          randomUUID(),
        );
      }
      expect(f.provider.size).toBe(20);
      expect(
        await db.user.count({
          where: { id: { in: records.map((r) => r.userId) } },
        }),
      ).toBe(1818);
      const memberships = await db.academyMembership.findMany({
        where: { academyId },
        select: { id: true, userId: true, status: true },
      });
      expect(new Set(memberships.map((m) => m.userId)).size).toBe(
        memberships.length,
      );
      expect(memberships.length).toBe(
        records.filter((r) => r.role !== "hq_admin").length,
      );
      expect(memberships.some((m) => m.status === "SUSPENDED")).toBe(true);
      await dlabTransaction(db as PrismaService, (tx) =>
        f.reconciler.reconcileBatch(
          tx,
          records.map((r) => r.externalId),
        ),
      );
      expect(await db.academyMembership.count({ where: { academyId } })).toBe(
        memberships.length,
      );
      const scope = { requireManager: async () => ({ academyId }) };
      const roster = new PeopleDirectoryService(
        db as PrismaService,
        scope as never,
        {} as never,
      );
      const metrics = [];
      for (const size of [1, 100]) {
        const sourceIds = records.slice(0, size).map((r) => r.externalId);
        queries.length = 0;
        await readDlabDirectory(db, sourceIds);
        expect(queries).toHaveLength(1);
        const input = listPeopleInputSchema.parse({ academyId, pageSize: 100 });
        // Search by an exact username for the single-row comparison; same
        // server reader and SQL shape for a full 100-row page.
        if (size === 1)
          input.search =
            "dlab_" + records[0]!.userId.replaceAll("-", "").slice(0, 24);
        queries.length = 0;
        const result = await roster.list({} as never, input);
        expect(result.rows.length).toBe(size);
        metrics.push({
          size,
          total: queries.length,
          selects: queries.filter((q) => /^SELECT/i.test(q)).length,
        });
      }
      expect(metrics[0]!.total).toBe(metrics[1]!.total);
      writeFileSync(
        "/tmp/cove-directory-roster-counts.json",
        JSON.stringify({
          firstProjectionStatements: firstCount,
          rosters: metrics,
        }),
      );
    }, 120_000);
    it("uses one snapshot SELECT and invariant mutation statement counts for 1 versus 100 staff campuses", async () => {
      const counts = [],
        provisioning = [];
      for (const size of [1, 100]) {
        const f = await fixture(size),
          id = randomUUID();
        const saved = await f.source.user(
          id,
          f.payload("lab_head"),
          undefined,
          undefined,
          { deferReconcile: true },
        );
        queries.length = 0;
        await readDlabDirectory(db, [id]);
        expect(queries).toHaveLength(1);
        await dlabTransaction(db as PrismaService, async (tx) => {
          await sourceWrite(tx);
          await tx.user.create({
            data: {
              id: saved.reservedUserId,
              authUserId: saved.reservedUserId,
              username:
                "dlab_" + saved.reservedUserId.replaceAll("-", "").slice(0, 24),
              status: "ACTIVE",
            },
          });
          await tx.dlabIdentity.update({
            where: { externalUserId: id },
            data: { userId: saved.reservedUserId },
          });
        });
        queries.length = 0;
        await dlabTransaction(db as PrismaService, (tx) =>
          f.reconciler.reconcileBatch(tx, [id]),
        );
        counts.push({
          size,
          total: queries.length,
          selects: queries.filter((q) => /^SELECT/i.test(q)).length,
        });
        queries.length = 0;
        await f.directory.syncUser(
          randomUUID(),
          f.payload("lab_head"),
          randomUUID(),
        );
        expect(f.revocations.revokeMembership).not.toHaveBeenCalled();
        provisioning.push({
          size,
          total: queries.length,
          selects: queries.filter((q) => /^SELECT/i.test(q)).length,
        });
      }
      expect(provisioning[0]!.total).toBe(provisioning[1]!.total);
      expect(provisioning[0]!.selects).toBe(provisioning[1]!.selects);
      expect(counts[0]!.total).toBe(counts[1]!.total);
      expect(counts[0]!.selects).toBe(counts[1]!.selects);
      writeFileSync(
        "/tmp/cove-directory-query-counts.json",
        JSON.stringify({ reconciliation: counts, provisioning }),
      );
    });
    it("keeps a D-LAB member a manager deleted out of the academy through later syncs", async () => {
      const f = await fixture(2);
      const academyId = f.academyIds[0]!;
      const student = randomUUID(), teacher = randomUUID();
      const studentPayload = f.payload("student"), teacherPayload = f.payload("instructor");
      const studentUser = (await f.directory.syncUser(student, studentPayload, randomUUID())).id;
      const teacherUser = (await f.directory.syncUser(teacher, teacherPayload, randomUUID())).id;
      const manager = { user: randomUUID(), auth: randomUUID() };
      await db.user.create({ data: { id: manager.user, authUserId: manager.auth, status: "ACTIVE", displayName: "Manager",
        email: `${manager.user}@example.test`, username: `m-${manager.user.slice(0, 8)}` } });
      await db.academyMembership.create({ data: { academyId, userId: manager.user, role: "MANAGER", status: "ACTIVE" } });
      const membership = (userId: string, id = academyId) =>
        db.academyMembership.findFirstOrThrow({ where: { academyId: id, userId } });
      const prisma = db as unknown as PrismaService;
      const signIns = { deleteUser: vi.fn().mockResolvedValue(undefined) };
      const bulk = new PeopleBulkService(prisma,
        new ManagerScopeService(prisma, new AcademyAccessService(prisma, new SupportGrantResolver(prisma))),
        new AuditService(), new RateLimitService(),
        { revokeTeacher: vi.fn().mockResolvedValue(undefined), revokeStudent: vi.fn().mockResolvedValue(undefined) } as never,
        signIns as never);
      const selection = { mode: "ids" as const, membershipIds: [
        (await membership(studentUser)).id, (await membership(teacherUser)).id] };
      const actor = { authUserId: manager.auth } as never;
      const preview = await bulk.preview(actor, { academyId, selection, options: { kind: "DELETE" } });
      expect(preview.affected).toBe(2);
      const result = await bulk.run(actor, { academyId, selection, options: { kind: "DELETE" },
        idempotencyKey: randomUUID(), peopleRevision: preview.peopleRevision });
      expect(result.succeeded).toBe(2);

      // The student belonged nowhere else: account deleted, D-LAB identifiers kept.
      const deleted = await db.user.findUniqueOrThrow({ where: { id: studentUser } });
      expect(deleted.status).toBe("DELETED");
      expect(deleted.username).toMatch(/^dlab_/);
      expect(deleted.authUserId).not.toBeNull();
      expect(signIns.deleteUser).not.toHaveBeenCalled();
      // The teacher keeps the other campus and the account.
      expect(await db.user.findUniqueOrThrow({ where: { id: teacherUser } })).toMatchObject({ status: "ACTIVE" });

      // D-LAB sends both people again; neither comes back to this academy.
      const created = f.auth.createDlabUser.mock.calls.length;
      await f.directory.syncUser(student, { ...studentPayload, name: "Renamed student", updated_at: "2026-11-14T01:00:00Z" }, randomUUID());
      await f.directory.syncUser(teacher, { ...teacherPayload, name: "Renamed teacher", updated_at: "2026-11-14T01:00:00Z" }, randomUUID());
      expect((await membership(studentUser)).status).toBe("LEFT");
      expect((await membership(teacherUser)).status).toBe("LEFT");
      expect((await membership(teacherUser, f.academyIds[1]!)).status).toBe("ACTIVE");
      expect((await db.user.findUniqueOrThrow({ where: { id: studentUser } })).status).toBe("DELETED");
      // No new sign-in for the deleted student; the teacher's is re-ensured as usual.
      const forStudent = (calls: unknown[][]) => calls.filter(([id]) => id === deleted.authUserId).length;
      expect(forStudent(f.auth.createDlabUser.mock.calls.slice(created))).toBe(0);

      // Signing in from D-LAB OS brings both back, as fresh members of the academy.
      for (const external of [student, teacher]) {
        const saved = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: external } });
        await f.directory.provision(saved, randomUUID(), async () => {}, undefined, { revive: true });
      }
      expect(await db.user.findUniqueOrThrow({ where: { id: studentUser } })).toMatchObject({ status: "ACTIVE" });
      expect(forStudent(f.auth.createDlabUser.mock.calls.slice(created))).toBe(1);
      for (const userId of [studentUser, teacherUser]) {
        const back = await membership(userId);
        expect(back.status).toBe("ACTIVE");
        expect(await db.dlabMembershipBinding.findUniqueOrThrow({ where: { membershipId: back.id } }))
          .toMatchObject({ localSuspendedAt: null });
      }
    });
    it.each(["student", "tutor", "instructor", "so_staff", "edu_manager", "lab_head"])(
      "deletes a single-campus D-LAB %s, keeps them out through sync, and restores them on sign-in",
      async (role) => {
        const f = await fixture(1);
        const academyId = f.academyIds[0]!;
        const external = randomUUID(), payload = f.payload(role);
        const userId = (await f.directory.syncUser(external, payload, randomUUID())).id;
        const manager = { user: randomUUID(), auth: randomUUID() };
        await db.user.create({ data: { id: manager.user, authUserId: manager.auth, status: "ACTIVE", displayName: "Manager",
          email: `${manager.user}@example.test`, username: `m-${manager.user.slice(0, 8)}` } });
        await db.academyMembership.create({ data: { academyId, userId: manager.user, role: "MANAGER", status: "ACTIVE" } });
        const prisma = db as unknown as PrismaService;
        const bulk = new PeopleBulkService(prisma,
          new ManagerScopeService(prisma, new AcademyAccessService(prisma, new SupportGrantResolver(prisma))),
          new AuditService(), new RateLimitService(),
          { revokeTeacher: vi.fn().mockResolvedValue(undefined), revokeStudent: vi.fn().mockResolvedValue(undefined) } as never,
          { deleteUser: vi.fn().mockResolvedValue(undefined) } as never);
        const member = () => db.academyMembership.findFirstOrThrow({ where: { academyId, userId }, include: { extraRoles: true } });
        const selection = { mode: "ids" as const, membershipIds: [(await member()).id] };
        const actor = { authUserId: manager.auth } as never;
        const preview = await bulk.preview(actor, { academyId, selection, options: { kind: "DELETE" } });
        expect(preview.affected).toBe(1);
        await bulk.run(actor, { academyId, selection, options: { kind: "DELETE" },
          idempotencyKey: randomUUID(), peopleRevision: preview.peopleRevision });
        expect((await member()).status).toBe("LEFT");
        expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe("DELETED");

        await f.directory.syncUser(external, { ...payload, name: "Renamed", updated_at: "2026-11-14T01:00:00Z" }, randomUUID());
        expect((await member()).status).toBe("LEFT");

        const saved = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: external } });
        await f.directory.provision(saved, randomUUID(), async () => {}, undefined, { revive: true });
        const back = await member();
        expect(back.status).toBe("ACTIVE");
        expect([back.role, ...back.extraRoles.map((r) => r.role)].sort()).toEqual([...dlabAcademyRoles(role)].sort());
        expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe("ACTIVE");
      },
    );

    async function restorationFixture(classCount: number) {
      const f = await fixture();
      const academyId = f.academyIds[0]!;
      const externalUserId = randomUUID();
      const payload = f.payload();
      const userId = (await f.directory.syncUser(externalUserId, payload, randomUUID())).id;
      const membership = await db.academyMembership.findUniqueOrThrow({
        where: { academyId_userId: { academyId, userId } },
      });
      const managerId = randomUUID();
      const manager = { authUserId: randomUUID() };
      await db.user.create({
        data: { id: managerId, authUserId: manager.authUserId, status: "ACTIVE", displayName: "Restoration manager" },
      });
      await db.academyMembership.create({
        data: { academyId, userId: managerId, role: "MANAGER", status: "ACTIVE" },
      });
      const classIds = Array.from({ length: classCount }, () => randomUUID()).sort();
      await db.class.createMany({
        data: classIds.map((id) => ({ id, academyId, name: "Returning class " + id, createdByUserId: managerId })),
      });
      const enrollments = classIds.map((classId) => ({
        classId, membershipId: membership.id, enrolledByUserId: managerId,
        enrolledAt: new Date("2026-11-13T01:00:00Z"), lastLearningSeenAt: new Date("2026-11-14T01:00:00Z"),
      }));
      if (enrollments.length) await db.classEnrollment.createMany({ data: enrollments });
      const prisma = db as PrismaService;
      const bulk = new PeopleBulkService(prisma,
        new ManagerScopeService(prisma, new AcademyAccessService(prisma, new SupportGrantResolver(prisma))),
        new AuditService(), new RateLimitService(),
        { revokeTeacher: vi.fn(), revokeStudent: vi.fn() } as never,
        { deleteUser: vi.fn() } as never);
      const selection = { mode: "ids" as const, membershipIds: [membership.id] };
      const options = { kind: "DELETE" as const };
      const remove = async (membershipIds = selection.membershipIds) => {
        const selection = { mode: "ids" as const, membershipIds };
        const preview = await bulk.preview(manager as never, { academyId, selection, options });
        expect(preview.consequences).toContainEqual(expect.objectContaining({ kind: "dlab_student_restoration" }));
        const result = await bulk.run(manager as never, {
          academyId, selection, options, idempotencyKey: randomUUID(), peopleRevision: preview.peopleRevision,
        });
        expect(result.succeeded).toBe(membershipIds.length);
      };
      const policy = new DlabPolicyService(prisma, f.state, f.config as never);
      const oldSession = { authUserId: userId, sessionId: randomUUID() } as never;
      const oldEligibility = await policy.eligible(userId);
      await policy.activate(oldSession, oldEligibility!.identity.generation);
      const auth = {
        ...f.auth,
        dlabTokenHash: vi.fn().mockResolvedValue("fixture-token"),
        verifyTokenClaims: vi.fn(async (sessionId: string) => ({ authUserId: userId, sessionId })),
      };
      const service = new DlabSsoService(f.config as never, prisma, f.state, f.source, policy, auth as never,
        f.reconciler, f.directory);
      const signIn = async () => {
        const binding = randomUUID();
        const { state } = await service.start(binding);
        const tokenPayload = { ...payload, external_user_id: externalUserId };
        delete tokenPayload.updated_at;
        vi.stubGlobal("fetch", vi.fn(async () => Response.json(tokenPayload)));
        try {
          const completed = await service.complete("fixture-code", state, binding);
          expect(completed.authUserId).toBe(userId);
          return await service.activate(completed.ticket, binding, randomUUID());
        } finally {
          vi.unstubAllGlobals();
        }
      };
      const liveEnrollments = () => db.classEnrollment.findMany({
        where: { membershipId: membership.id }, orderBy: { classId: "asc" },
      });
      return { ...f, prisma, academyId, externalUserId, userId, membership, payload, policy, oldSession,
        managerId, classIds, enrollments, liveEnrollments, remove, signIn };
    }

    it("restores the same roster and learning data only through fresh SSO", async () => {
      const f = await restorationFixture(2);
      const classId = f.classIds[0]!;
      const course = await db.course.create({
        data: { academyId: f.academyId, title: "Prior course", createdByUserId: f.managerId, isVisible: true },
      });
      await db.classCourse.create({
        data: { classId, courseId: course.id, assignedByUserId: f.managerId },
      });
      const module = await db.courseModule.create({
        data: { courseId: course.id, title: "Earlier module", position: 1, externalKey: randomUUID(), isVisible: true },
      });
      const lecture = await db.lecture.create({
        data: { courseModuleId: module.id, title: "Earlier lesson", position: 1, externalKey: randomUUID(), isVisible: true },
      });
      const material = await db.material.create({
        data: { lectureId: lecture.id, title: "Earlier exercise", type: "PROGRAMMING_EXERCISE", position: 1, isVisible: true },
      });
      const draft = await db.exerciseDraft.create({
        data: { userId: f.userId, courseId: course.id, materialId: material.id, sourceMaterialId: material.id, code: "print(7)" },
      });
      const progress = await db.studentExerciseProgress.create({
        data: { userId: f.userId, materialId: material.id, status: "SOLVED", attemptCount: 1, bestScore: 100 },
      });
      const submission = await db.submission.create({
        data: {
          userId: f.userId, materialId: material.id, sourceMaterialId: material.id, courseId: course.id,
          classId, code: draft.code, language: "PYTHON", gradingRevision: 1, engineVersion: "fixture",
          timeLimitMs: 1000, memoryLimitMb: 128, status: "PASSED", score: 100, passedCount: 1, totalCount: 1,
          problemTitle: material.title, courseTitle: course.title, moduleTitle: module.title, lectureTitle: lecture.title,
          modulePosition: 1, lecturePosition: 1, problemPosition: 1,
        },
      });
      const context = new LearningClassContextService(f.prisma);
      const scope = { academyId: f.academyId, userId: f.userId, courseId: course.id, requestedClassId: classId };
      await expect(context.resolve(scope)).resolves.toMatchObject({ classId });

      await f.remove();
      expect(await f.liveEnrollments()).toEqual([]);
      await expect(context.resolve(scope)).rejects.toThrow();
      await expect(f.policy.assertSession(f.oldSession)).rejects.toThrow();
      await f.directory.syncUser(f.externalUserId, f.payload, randomUUID());
      await f.directory.syncUser(f.externalUserId, { ...f.payload, updated_at: "2026-11-14T01:00:00Z" }, randomUUID());
      expect(await f.liveEnrollments()).toEqual([]);
      expect(await db.dlabStudentRemoval.count({ where: { userId: f.userId, status: "PENDING" } })).toBe(1);

      await expect(f.signIn()).resolves.toMatchObject({ requiresStudentSession: true });
      expect(await f.liveEnrollments()).toEqual(f.enrollments);
      await expect(context.resolve(scope)).resolves.toMatchObject({ classId, membershipId: f.membership.id });
      expect(await db.exerciseDraft.findUnique({ where: { id: draft.id } })).toEqual(draft);
      expect(await db.studentExerciseProgress.findUnique({ where: { id: progress.id } })).toEqual(progress);
      expect(await db.submission.findUnique({ where: { id: submission.id } })).toEqual(submission);
      await expect(f.policy.assertSession(f.oldSession)).rejects.toThrow();

      // An intentional unenrollment stays removed on the next login and deletion cycle.
      await db.classEnrollment.delete({ where: { classId_membershipId: { classId, membershipId: f.membership.id } } });
      await f.signIn();
      expect(await f.liveEnrollments()).toEqual(f.enrollments.slice(1));
      await f.remove();
      await db.class.update({ where: { id: f.classIds[1]! }, data: { status: "ARCHIVED" } });
      await expect(f.signIn()).resolves.toMatchObject({ studentRestoration: "classes_unavailable" });
      expect(await f.liveEnrollments()).toEqual([]);
      expect(await db.auditLog.count({ where: { targetId: f.membership.id, action: "academy.student.restored_from_os" } })).toBe(2);
      const skipped = await db.dlabStudentSavedEnrollment.findMany({
        where: { removal: { membershipId: f.membership.id }, outcome: "SKIPPED" },
        select: { classId: true, skipReason: true },
      });
      expect(skipped).toEqual([{ classId: f.classIds[1]!, skipReason: "class_archived" }]);
    });

    it("rejects invalid class scope and rolls back the returning membership", async () => {
      const f = await restorationFixture(1);
      const other = await restorationFixture(1);
      await f.remove();
      const removal = await db.dlabStudentRemoval.findFirstOrThrow({ where: { userId: f.userId } });
      await db.dlabStudentSavedEnrollment.create({ data: { removalId: removal.id, classId: other.classIds[0]! } });
      await expect(f.signIn()).rejects.toThrow();
      expect(await f.liveEnrollments()).toEqual([]);
      expect(await db.academyMembership.findUnique({ where: { id: f.membership.id } })).toMatchObject({ status: "LEFT" });
      expect(await db.dlabStudentRemoval.findUnique({ where: { id: removal.id } })).toMatchObject({ status: "PENDING" });
      await db.dlabStudentSavedEnrollment.delete({
        where: { removalId_classId: { removalId: removal.id, classId: other.classIds[0]! } },
      });
      await f.signIn();
      expect(await f.liveEnrollments()).toEqual(f.enrollments);
    });

    it("creates a reviewed legacy recovery for an existing account with missing class history", async () => {
      const f = await restorationFixture(1);
      const adminId = randomUUID();
      await db.user.create({ data: { id: adminId, status: "ACTIVE", platformRole: "ADMIN", displayName: "Recovery operator" } });
      await f.remove();
      // Simulate a deletion performed by the old code, which kept the receipt
      // and original user IDs but had no saved enrollment snapshot.
      await db.dlabStudentRemoval.deleteMany({ where: { userId: f.userId } });
      await expect(f.signIn()).resolves.toMatchObject({ studentRestoration: "history_missing" });
      const input = { externalUserId: f.externalUserId, userId: f.userId, academyId: f.academyId,
        membershipId: f.membership.id, classIds: f.classIds };
      await expect(previewStudentRecovery(f.prisma, adminId, "test", { ...input, classIds: [] }))
        .rejects.toThrow();
      const stale = await previewStudentRecovery(f.prisma, adminId, "test", input);
      await db.class.update({ where: { id: f.classIds[0]! }, data: { name: "Updated class" } });
      await expect(applyStudentRecovery(f.prisma, "test", stale, stale.digest)).rejects.toThrow();
      const plan = studentRecoveryPlan.parse(JSON.parse(JSON.stringify(await previewStudentRecovery(f.prisma, adminId, "test", input))));
      const recovery = await applyStudentRecovery(f.prisma, "test", plan, plan.digest);
      expect(recovery.replayed).toBe(false);
      expect(await f.liveEnrollments()).toEqual([]);
      expect(await applyStudentRecovery(f.prisma, "test", plan, plan.digest)).toEqual({ ...recovery, replayed: true });
      await f.signIn();
      expect(await f.liveEnrollments()).toEqual([expect.objectContaining({ classId: f.classIds[0], enrolledByUserId: adminId })]);
    });


    it("preserves a separate local suspension and keeps recovery pending", async () => {
      const f = await restorationFixture(1);
      await db.academyMembership.update({
        where: { id: f.membership.id }, data: { status: "SUSPENDED", suspendedAt: new Date() },
      });
      await f.remove();
      await expect(f.signIn()).rejects.toThrow();
      expect(await f.liveEnrollments()).toEqual([]);
      expect(await db.academyMembership.findUnique({ where: { id: f.membership.id } })).toMatchObject({ status: "SUSPENDED" });
      expect(await db.dlabStudentRemoval.count({ where: { userId: f.userId, status: "PENDING" } })).toBe(1);
    });

    it("preserves existing enrollments for a platform status deletion", async () => {
      const f = await restorationFixture(1);
      await db.user.update({ where: { id: f.userId }, data: { status: "DELETED" } });
      await expect(f.policy.assertSession(f.oldSession)).rejects.toThrow();
      await f.signIn();
      expect(await f.liveEnrollments()).toEqual(f.enrollments);
      expect(await db.dlabStudentRemoval.count({ where: { userId: f.userId } })).toBe(0);
      await expect(f.policy.assertSession(f.oldSession)).rejects.toThrow();
    });

    it("serializes deletion with a returning login", async () => {
      const f = await restorationFixture(2);
      const [removed] = await Promise.allSettled([f.remove(), f.signIn()]);
      expect(removed.status).toBe("fulfilled");
      const member = await db.academyMembership.findUniqueOrThrow({ where: { id: f.membership.id } });
      expect(await f.liveEnrollments()).toEqual(member.status === "ACTIVE" ? f.enrollments : []);
      await f.signIn();
      expect(await f.liveEnrollments()).toEqual(f.enrollments);
      expect(await db.dlabStudentRemoval.count({ where: { userId: f.userId, status: "RESTORED" } })).toBe(1);
    });

    it("keeps managed student bulk deletion at fixed query count and protects recovery rows", async () => {
      const f = await restorationFixture(1);
      const targets = Array.from({ length: 100 }, () => ({ userId: randomUUID(), memberId: randomUUID(), externalUserId: randomUUID() }));
      await dlabTransaction(f.prisma, async (tx) => {
        await sourceWrite(tx);
        await tx.user.createMany({ data: targets.map(({ userId }) => ({
          id: userId, authUserId: userId, displayName: "Batch student", status: "ACTIVE",
        })) });
        await tx.dlabIdentity.createMany({ data: targets.map(({ userId, externalUserId }) => ({
          userId, externalUserId, reservedUserId: userId, name: "Batch student", userRole: "student",
          accountStatus: "active", externalCampusId: f.campusIds[0]!, externalCampusIds: f.campusIds,
          payloadHash: "restoration-quantity-fixture",
        })) });
        await tx.academyMembership.createMany({ data: targets.map(({ userId, memberId }) => ({
          id: memberId, userId, academyId: f.academyId, status: "ACTIVE", role: "STUDENT",
        })) });
        await tx.dlabMembershipBinding.createMany({ data: targets.map(({ memberId, externalUserId }) => ({
          membershipId: memberId, externalUserId, externalCampusId: f.campusIds[0]!, appliedRevision: 1, sourceAccessStatus: "ALLOWED",
        })) });
        await tx.classEnrollment.createMany({ data: targets.map(({ memberId }) => ({
          membershipId: memberId, classId: f.classIds[0]!, enrolledByUserId: f.managerId,
        })) });
      });
      const measured = [];
      for (const membershipIds of [[f.membership.id], targets.map((target) => target.memberId)]) {
        const start = queries.length;
        await f.remove(membershipIds);
        const sql = queries.slice(start);
        measured.push({ statements: sql.length, reads: sql.filter((query) => /^\s*SELECT\b/i.test(query)).length });
      }
      expect(measured[0]).toEqual(measured[1]);
      console.info("D.LAB managed deletions (1 and 100 students)", measured);
      expect(await db.dlabStudentRemoval.count({ where: { academyId: f.academyId, status: "PENDING" } })).toBe(101);
      const permissions = await db.$queryRaw<Array<{ readable: boolean; rls: boolean }>>`
        SELECT has_table_privilege(roles.role, tables.oid, 'SELECT') AS readable, tables.relrowsecurity AS rls
        FROM pg_class tables CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role)
        WHERE tables.relname IN ('dlab_student_removals', 'dlab_student_saved_enrollments')
      `;
      expect(permissions).toHaveLength(4);
      expect(permissions.every((row) => !row.readable && row.rls)).toBe(true);
    });

    it("uses the same statement count for one and 100 saved enrollments", async () => {
      const measured = [];
      for (const count of [1, 100]) {
        const f = await restorationFixture(count);
        const beforeRemove = queries.length;
        await f.remove();
        const removed = queries.slice(beforeRemove);
        const beforeLogin = queries.length;
        await f.signIn();
        const signedIn = queries.slice(beforeLogin);
        expect(await f.liveEnrollments()).toHaveLength(count);
        const counts = (sql: string[]) => ({ statements: sql.length, reads: sql.filter((q) => /^\s*SELECT\b/i.test(q)).length });
        measured.push({ remove: counts(removed), signIn: counts(signedIn) });
      }
      console.info("D.LAB restoration query counts (1 and 100 saved enrollments)", measured);
      expect(measured[0]).toEqual(measured[1]);
    });
  },
);
