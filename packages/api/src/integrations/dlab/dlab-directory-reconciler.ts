import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  dlabAcademyRole,
  dlabAcademyRoles,
  dlabEffectiveScope,
  dlabPlatformRole,
} from "@cove/shared";
import type { ApiEnvironment } from "../../config/env.schema.js";
import { Prisma, type DlabIdentity } from "../../generated/prisma/client.js";
import type {
  AcademyRole,
  MembershipStatus,
} from "../../generated/prisma/enums.js";
import { DlabError } from "./dlab-error.js";
import { sourceWrite } from "./dlab-transaction.js";
import {
  readDlabDirectory,
  type DirectorySnapshot,
  type DirectoryCampus,
} from "./dlab-directory-read.js";

export function dlabAdmitted(
  config: ConfigService<ApiEnvironment, true>,
  id: string,
) {
  return (
    config.get("DLAB_SSO_ROLLOUT_MODE", { infer: true }) === "campus" ||
    (
      config.get("DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS", { infer: true }) ?? []
    ).includes(id)
  );
}
export function dlabCampusScope(
  config: ConfigService<ApiEnvironment, true>,
  identity: Pick<
    DlabIdentity,
    | "userRole"
    | "externalCampusId"
    | "externalCampusIds"
    | "accountStatus"
    | "externalUserId"
  >,
) {
  return identity.accountStatus === "active" &&
    dlabAdmitted(config, identity.externalUserId)
    ? dlabEffectiveScope(
        identity.userRole,
        identity.externalCampusId,
        identity.externalCampusIds,
      )
    : [];
}
export async function desiredDlabCampuses(
  tx: Prisma.TransactionClient,
  config: ConfigService<ApiEnvironment, true>,
  identity: DlabIdentity,
) {
  const ids = dlabCampusScope(config, identity);
  if (!ids.length) return [];
  return tx.dlabCampus.findMany({
    where: {
      externalCampusId: { in: ids },
      status: "active",
      academy: { kind: "ACADEMY", status: "ACTIVE" },
      ...(config.get("DLAB_SSO_ROLLOUT_MODE", { infer: true }) === "campus"
        ? { ssoEnabled: true }
        : {}),
    },
    orderBy: { externalCampusId: "asc" },
  });
}
export function directoryCampusAllowed(
  config: ConfigService<ApiEnvironment, true>,
  identity: DirectorySnapshot,
  campus: DirectoryCampus,
) {
  return (
    identity.accountStatus === "active" &&
    dlabAdmitted(config, identity.externalUserId) &&
    campus.status === "active" &&
    campus.academyStatus === "ACTIVE" &&
    (config.get("DLAB_SSO_ROLLOUT_MODE", { infer: true }) !== "campus" ||
      campus.ssoEnabled)
  );
}
type MemberChange = {
  id: string;
  academyId: string;
  userId: string;
  role: AcademyRole;
  status: MembershipStatus;
};
type BindingChange = {
  externalUserId: string;
  externalCampusId: string;
  membershipId: string;
  appliedRevision: number;
  sourceAccessStatus: string;
};

/** Resolve once, decide in memory, write cohorts. No SQL in campus/member loops. */
@Injectable()
export class DlabReconcilerService {
  private readonly logger = new Logger(DlabReconcilerService.name);
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}
  async reconcile(tx: Prisma.TransactionClient, identity: DlabIdentity) {
    return identity.userId
      ? this.reconcileBatch(tx, [identity.externalUserId])
      : ([] as string[]);
  }
  async reconcileBatch(
    tx: Prisma.TransactionClient,
    ids: readonly string[],
    snapshots?: DirectorySnapshot[],
    renamedUserIds: readonly string[] = [],
  ) {
    const rows = snapshots ?? (await readDlabDirectory(tx, ids));
    await sourceWrite(tx);
    const directory =
      this.config.get("DLAB_DIRECTORY_SYNC_ENABLED", { infer: true }) === true;
    const members: MemberChange[] = [],
      bindings: BindingChange[] = [];
    const roleResets: string[] = [],
      roles: Array<{ membershipId: string; role: AcademyRole }> = [];
    const profiles: Array<{
      membershipId: string;
      academyId: string;
      schoolGrade: string | null;
    }> = [];
    const admins: string[] = [],
      ordinary: string[] = [],
      academies = new Set<string>(),
      changed = new Set<string>(),
      managerLoss = new Set<string>();
    const events: Prisma.DlabIntegrationEventCreateManyInput[] = [],
      renamed = new Set(renamedUserIds);
    for (const identity of rows) {
      const user = identity.user;
      if (!user) continue;
      const scope = new Set(
        dlabEffectiveScope(
          identity.userRole,
          identity.externalCampusId,
          identity.externalCampusIds,
        ),
      );
      const campuses = identity.campuses.filter(
        (c) =>
          scope.has(c.externalCampusId) &&
          c.academyId &&
          c.academyKind === "ACADEMY",
      );
      const allowed = campuses.filter((c) =>
        directoryCampusAllowed(this.config, identity, c),
      );
      const platformRole =
        dlabPlatformRole(identity.userRole) === "ADMIN" &&
        user.status === "ACTIVE" &&
        allowed.length &&
        !identity.memberships.some((m) => m.binding?.localSuspendedAt)
          ? "ADMIN"
          : "USER";
      if (user.platformRole !== platformRole) {
        (platformRole === "ADMIN" ? admins : ordinary).push(user.id);
        events.push({
          externalUserId: identity.externalUserId,
          action: "platform_role.reconciled",
          revision: identity.revision,
          details: { before: user.platformRole, after: platformRole },
        });
      }
      const role = dlabAcademyRole(identity.userRole),
        target = role ? (directory ? campuses : allowed) : [];
      const existing = new Map(
          identity.memberships.map((m) => [m.academyId, m]),
        ),
        retained = new Set<string>();
      for (const campus of target) {
        const academyId = campus.academyId!,
          before = existing.get(academyId);
        if (
          before &&
          (!before.binding ||
            before.binding.externalUserId !== identity.externalUserId ||
            before.binding.externalCampusId !== campus.externalCampusId)
        )
          throw new DlabError("membership_conflict", 409);
        const id = before?.id ?? randomUUID();
        retained.add(id);
        const sourceAllowed = directoryCampusAllowed(
          this.config,
          identity,
          campus,
        );
        const status =
          sourceAllowed &&
          user.status === "ACTIVE" &&
          !before?.binding?.localSuspendedAt
            ? "ACTIVE"
            : "SUSPENDED";
        const extras = sourceAllowed
          ? dlabAcademyRoles(identity.userRole).filter((r) => r !== role)
          : [];
        const roleChanged =
          !before ||
          before.role !== role ||
          before.extraRoles.length !== extras.length ||
          !extras.every((r) => before.extraRoles.includes(r));
        if (!before?.binding || roleChanged || before.status !== status) {
          members.push({ id, academyId, userId: user.id, role: role!, status });
          changed.add(id);
          academies.add(academyId);
          if (
            before?.role === "MANAGER" &&
            (role !== "MANAGER" || status !== "ACTIVE")
          )
            managerLoss.add(academyId);
        }
        if (roleChanged) {
          roleResets.push(id);
          roles.push(...extras.map((r) => ({ membershipId: id, role: r })));
          events.push({
            externalUserId: identity.externalUserId,
            action: "academy_roles.reconciled",
            revision: identity.revision,
            details: {
              membershipId: id,
              sourceRole: identity.userRole,
              before: before ? [before.role, ...before.extraRoles] : [],
              after: [role!, ...extras],
            },
          });
        }
        const sourceAccessStatus = sourceAllowed ? "ALLOWED" : "BLOCKED";
        if (
          !before?.binding ||
          before.binding.appliedRevision !== identity.revision ||
          before.binding.sourceAccessStatus !== sourceAccessStatus
        )
          bindings.push({
            externalUserId: identity.externalUserId,
            externalCampusId: campus.externalCampusId,
            membershipId: id,
            appliedRevision: identity.revision,
            sourceAccessStatus,
          });
        if (role === "STUDENT") {
          const schoolGrade =
            identity.userRole === "student" ? identity.grade : null;
          if (
            !before?.hasStudentProfile ||
            before.schoolGrade !== schoolGrade
          ) {
            profiles.push({ membershipId: id, academyId, schoolGrade });
            academies.add(academyId);
          }
        }
        if (renamed.has(user.id)) academies.add(academyId);
      }
      for (const before of identity.memberships) {
        const binding = before.binding;
        if (
          !binding ||
          binding.externalUserId !== identity.externalUserId ||
          retained.has(before.id)
        )
          continue;
        if (
          binding.sourceAccessStatus !== "BLOCKED" ||
          binding.appliedRevision !== identity.revision
        )
          bindings.push({
            ...binding,
            membershipId: before.id,
            appliedRevision: identity.revision,
            sourceAccessStatus: "BLOCKED",
          });
        if (before.status === "ACTIVE" || before.extraRoles.length) {
          if (before.status === "ACTIVE")
            members.push({
              id: before.id,
              academyId: before.academyId,
              userId: user.id,
              role: before.role,
              status: "SUSPENDED",
            });
          roleResets.push(before.id);
          academies.add(before.academyId);
          changed.add(before.id);
          if (before.role === "MANAGER") managerLoss.add(before.academyId);
          if (before.extraRoles.length)
            events.push({
              externalUserId: identity.externalUserId,
              action: "academy_roles.reconciled",
              revision: identity.revision,
              details: {
                membershipId: before.id,
                sourceRole: identity.userRole,
                before: [before.role, ...before.extraRoles],
                after: [],
              },
            });
        }
        if (renamed.has(user.id)) academies.add(before.academyId);
      }
    }
    if (admins.length)
      await tx.user.updateMany({
        where: { id: { in: admins } },
        data: { platformRole: "ADMIN" },
      });
    if (ordinary.length)
      await tx.user.updateMany({
        where: { id: { in: ordinary } },
        data: { platformRole: "USER" },
      });
    if (members.length)
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO academy_memberships (id,academy_id,user_id,role,status,joined_at,suspended_at,created_at,updated_at)
      SELECT x.id::uuid,x."academyId"::uuid,x."userId"::uuid,x.role::"AcademyRole",x.status::"MembershipStatus",now(),
        CASE WHEN x.status='SUSPENDED' THEN now() ELSE NULL END,now(),now()
      FROM jsonb_to_recordset(${JSON.stringify(members)}::jsonb) AS x(id text,"academyId" text,"userId" text,role text,status text)
      ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,
        suspended_at=CASE WHEN EXCLUDED.status='ACTIVE' THEN NULL ELSE coalesce(academy_memberships.suspended_at,now()) END,updated_at=now()
    `);
    if (roleResets.length)
      await tx.academyMembershipRole.deleteMany({
        where: { membershipId: { in: roleResets } },
      });
    if (roles.length)
      await tx.academyMembershipRole.createMany({ data: roles });
    if (bindings.length)
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO dlab_membership_bindings (external_user_id,external_campus_id,membership_id,applied_revision,source_access_status,created_at)
      SELECT x."externalUserId",x."externalCampusId",x."membershipId"::uuid,x."appliedRevision",x."sourceAccessStatus",now()
      FROM jsonb_to_recordset(${JSON.stringify(bindings)}::jsonb) AS x("externalUserId" text,"externalCampusId" text,"membershipId" text,"appliedRevision" int,"sourceAccessStatus" text)
      ON CONFLICT (external_user_id,external_campus_id) DO UPDATE SET applied_revision=EXCLUDED.applied_revision,source_access_status=EXCLUDED.source_access_status
    `);
    if (profiles.length)
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO student_academy_profiles (membership_id,academy_id,school_grade,coding_interests,created_at,updated_at)
      SELECT x."membershipId"::uuid,x."academyId"::uuid,x."schoolGrade",ARRAY[]::text[],now(),now()
      FROM jsonb_to_recordset(${JSON.stringify(profiles)}::jsonb) AS x("membershipId" text,"academyId" text,"schoolGrade" text)
      ON CONFLICT (membership_id) DO UPDATE SET school_grade=EXCLUDED.school_grade,updated_at=now()
    `);
    if (academies.size)
      await tx.academy.updateMany({
        where: { id: { in: [...academies] } },
        data: { peopleRevision: { increment: 1 } },
      });
    if (managerLoss.size) {
      const lost = await tx.academy.findMany({
        where: {
          id: { in: [...managerLoss] },
          memberships: { none: { role: "MANAGER", status: "ACTIVE" } },
        },
        select: { id: true },
      });
      events.push(
        ...lost.flatMap((a) =>
          rows
            .filter((i) =>
              i.memberships.some(
                (m) => m.academyId === a.id && m.role === "MANAGER",
              ),
            )
            .map((i) => ({
              externalUserId: i.externalUserId,
              action: "academy.manager_required",
              details: { academyId: a.id },
            })),
        ),
      );
      if (lost.length)
        this.logger.warn({
          reason: "dlab_academy_without_manager",
          count: lost.length,
        });
    }
    if (events.length)
      await tx.dlabIntegrationEvent.createMany({ data: events });
    return [...changed];
  }
}
