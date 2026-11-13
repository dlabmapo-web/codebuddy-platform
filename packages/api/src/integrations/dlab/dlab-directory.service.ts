import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  buildPlaceholderEmail,
  dlabEffectiveScope,
  type DlabUser,
} from "@cove/shared";
import type { ApiEnvironment } from "../../config/env.schema.js";
import { PrismaService } from "../../database/prisma.service.js";
import { SupabaseAuthService } from "../../auth/supabase-auth.service.js";
import { Prisma, type DlabIdentity } from "../../generated/prisma/client.js";
import { DlabSourceService } from "./dlab-source.service.js";
import { DlabReconcilerService } from "./dlab-reconciler.service.js";
import { DlabStateService } from "./dlab-state.service.js";
import { dlabTransaction, sourceWrite } from "./dlab-transaction.js";
import {
  readDlabDirectory,
  type DirectorySnapshot,
} from "./dlab-directory-read.js";
import { directoryCampusAllowed } from "./dlab-directory-reconciler.js";
import { DlabError } from "./dlab-error.js";

export type DirectoryResult = {
  ok: true;
  id: string;
  request_id?: string;
  provisioning_status: "READY";
  outcome: "applied" | "unchanged" | "applied_restricted";
  membership_ids: string[];
};

/** No sessions here. Both authenticated sync and SSO use the same fixed-ID,
 * recoverable provider/SQL boundary. Caller holds the per-person lease.
 */
@Injectable()
export class DlabDirectoryService {
  constructor(
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly prisma: PrismaService,
    private readonly state: DlabStateService,
    private readonly source: DlabSourceService,
    private readonly auth: SupabaseAuthService,
    private readonly reconciler: DlabReconcilerService,
  ) {}

  requireEnabled() {
    if (
      this.config.get("DLAB_SSO_ENABLED", { infer: true }) !== true ||
      this.config.get("DLAB_DIRECTORY_SYNC_ENABLED", { infer: true }) !== true
    )
      throw new DlabError("directory_sync_unavailable", 503);
    if (this.config.get("DLAB_SSO_ROLLOUT_MODE", { infer: true }) !== "campus")
      throw new DlabError("directory_campus_mode_required", 403);
  }
  async syncUser(id: string, input: DlabUser, requestId: string) {
    this.requireEnabled();
    if (
      !dlabEffectiveScope(
        input.user_role,
        input.external_campus_id,
        input.external_campus_ids,
      ).length
    )
      throw new DlabError("invalid_user_scope", 400);
    return this.state.lock(id, async (assertOwned) => {
      const saved = await this.source.user(id, input, undefined, requestId, {
        strict: true,
        deferReconcile: true,
      });
      return this.provision(saved, requestId, assertOwned);
    });
  }

  async provision(
    saved: DlabIdentity,
    requestId: string | undefined,
    assertOwned: () => Promise<void>,
    onFinalize?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<DirectoryResult> {
    try {
      const [before] = await readDlabDirectory(this.prisma, [
        saved.externalUserId,
      ]);
      if (!before || before.revision !== saved.revision)
        throw new DlabError("identity_changed", 409);
      if (before.reservedUserConflict)
        throw new DlabError("identity_conflict", 409);
      const strict =
        this.config.get("DLAB_DIRECTORY_SYNC_ENABLED", { infer: true }) ===
        true;
      if (strict) requireDirectoryMappings(before);
      if (
        before.user?.authUserId &&
        before.user.authUserId !== saved.reservedUserId
      )
        throw new DlabError("identity_conflict", 409);
      const authUserId = saved.reservedUserId;
      const email = buildPlaceholderEmail(saved.reservedUserId);
      // A locally deleted tombstone cannot regain provider credentials via sync.
      if (before.user?.status !== "DELETED") {
        await assertOwned();
        try {
          await providerDeadline(
            this.auth.createDlabUser(authUserId, email, saved.name),
          );
        } catch (error) {
          throw error instanceof DlabError
            ? error
            : new DlabError("auth_provisioning_failed", 503);
        }
      }
      await assertOwned();
      const result = await dlabTransaction(this.prisma, async (tx) => {
        await sourceWrite(tx);
        const [current] = await readDlabDirectory(tx, [saved.externalUserId]);
        if (
          !current ||
          current.revision !== saved.revision ||
          current.generation !== before.generation ||
          directoryFingerprint(current) !== directoryFingerprint(before)
        )
          throw new DlabError("identity_changed", 409);
        if (current.reservedUserConflict)
          throw new DlabError("identity_conflict", 409);
        if (strict) requireDirectoryMappings(current);
        const userId = current.userId ?? saved.reservedUserId;
        const renamed =
          !!current.user && current.user.displayName !== saved.name;
        const user = await tx.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            authUserId,
            email,
            emailIsPlaceholder: true,
            username: `dlab_${saved.reservedUserId.replaceAll("-", "").slice(0, 24)}`,
            displayName: saved.name,
            status: "ACTIVE",
            platformRole: "USER",
          },
          update: { displayName: saved.name },
        });
        if (user.authUserId !== authUserId && user.status !== "DELETED")
          throw new DlabError("identity_conflict", 409);
        await tx.dlabIdentity.update({
          where: { externalUserId: saved.externalUserId },
          data: {
            userId,
            provisioningStatus: "READY",
            projectedRevision: saved.revision,
            lastProvisionErrorCode: null,
            lastProvisionRequestId: requestId,
          },
        });
        const snapshot: DirectorySnapshot = {
          ...current,
          userId,
          user: {
            id: user.id,
            authUserId: user.authUserId,
            status: user.status,
            platformRole: user.platformRole,
            displayName: user.displayName,
          },
        };
        const changed = await this.reconciler.reconcileBatch(
          tx,
          [saved.externalUserId],
          [snapshot],
          renamed ? [userId] : [],
        );
        const memberships = await tx.$queryRaw<
          Array<{ id: string; status: string; source: string }>
        >(Prisma.sql`
          SELECT b.membership_id AS id,m.status,b.source_access_status AS source
          FROM dlab_membership_bindings b JOIN academy_memberships m ON m.id=b.membership_id
          WHERE b.external_user_id=${saved.externalUserId} ORDER BY b.membership_id
        `);
        const restricted =
          user.status !== "ACTIVE" ||
          saved.accountStatus !== "active" ||
          memberships.some(
            (m) => m.status !== "ACTIVE" || m.source !== "ALLOWED",
          ) ||
          !current.campuses.some((c) =>
            directoryCampusAllowed(this.config, current, c),
          );
        const unchanged =
          saved.provisioningStatus === "READY" &&
          saved.projectedRevision === saved.revision &&
          !changed.length &&
          !renamed;
        if (!unchanged)
          await tx.dlabIntegrationEvent.create({
            data: {
              externalUserId: saved.externalUserId,
              requestId,
              action: "user.provisioned",
              revision: saved.revision,
              details: {
                userId,
                restricted,
                membershipIds: memberships.map((m) => m.id),
              },
            },
          });
        if (onFinalize) await onFinalize(tx);
        const existingMembershipIds = new Set(
          current.memberships.map((m) => m.id),
        );
        return {
          // Fresh membership IDs could not authorize an existing watch. Avoid
          // per-membership revocation work when importing a new directory user.
          changed: changed.filter((id) => existingMembershipIds.has(id)),
          authUserId: user.authUserId,
          response: {
            ok: true as const,
            id: userId,
            request_id: requestId,
            provisioning_status: "READY" as const,
            outcome: restricted
              ? ("applied_restricted" as const)
              : unchanged
                ? ("unchanged" as const)
                : ("applied" as const),
            membership_ids: memberships.map((m) => m.id),
          },
        };
      });
      await this.source.changed(
        result.changed,
        result.changed.length && result.authUserId ? [result.authUserId] : [],
      );
      return result.response;
    } catch (error) {
      const failure =
        error instanceof DlabError
          ? error
          : new DlabError(
              (error as { code?: string })?.code === "P2002"
                ? "identity_conflict"
                : "directory_projection_unavailable",
              (error as { code?: string })?.code === "P2002" ? 409 : 503,
            );
      // Never mark a newer source version as failed because an older request lost.
      await dlabTransaction(this.prisma, async (tx) => {
        await sourceWrite(tx);
        await tx.dlabIdentity.updateMany({
          where: {
            externalUserId: saved.externalUserId,
            revision: saved.revision,
          },
          data: {
            provisioningStatus: "ERROR",
            lastProvisionErrorCode: failure.reason,
            lastProvisionRequestId: requestId,
          },
        });
        await tx.dlabIntegrationEvent.create({
          data: {
            externalUserId: saved.externalUserId,
            requestId,
            action: "user.provision_failed",
            revision: saved.revision,
            details: { reason: failure.reason },
          },
        });
      }).catch(() => undefined);
      throw failure;
    }
  }
}

export function requireDirectoryMappings(snapshot: DirectorySnapshot) {
  const scope = dlabEffectiveScope(
    snapshot.userRole,
    snapshot.externalCampusId,
    snapshot.externalCampusIds,
  );
  if (!scope.length) throw new DlabError("invalid_user_scope", 400);
  const mapped = new Set(
    snapshot.campuses
      .filter((c) => c.academyId && c.academyKind === "ACADEMY")
      .map((c) => c.externalCampusId),
  );
  if (scope.some((id) => !mapped.has(id)))
    throw new DlabError("campus_mapping_required", 409);
  for (const m of snapshot.memberships) {
    if (
      snapshot.campuses.some(
        (c) =>
          scope.includes(c.externalCampusId) && c.academyId === m.academyId,
      ) &&
      (!m.binding || m.binding.externalUserId !== snapshot.externalUserId)
    )
      throw new DlabError("membership_conflict", 409);
  }
}
function directoryFingerprint(snapshot: DirectorySnapshot) {
  return JSON.stringify({
    userStatus: snapshot.user?.status ?? null,
    userId: snapshot.userId,
    campuses: snapshot.campuses,
    restrictions: snapshot.memberships.map((m) => [
      m.id,
      m.status,
      m.binding?.localSuspendedAt ?? null,
    ]),
  });
}
async function providerDeadline(operation: Promise<void>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new DlabError("auth_provider_timeout", 503)),
          15_000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
