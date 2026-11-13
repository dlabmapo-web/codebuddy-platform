import { randomUUID } from "node:crypto";
import { dlabEffectiveScope } from "@cove/shared";
import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "../../config/env.schema.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { Prisma, type DlabCampus } from "../../generated/prisma/client.js";
import {
  DlabDirectoryService,
  requireDirectoryMappings,
} from "./dlab-directory.service.js";
import {
  DlabCampusProvisioner,
  reconcileDlabCampus,
} from "./dlab-campus-provisioner.js";
import {
  projectDlabCampus,
  projectedCampusStatus,
} from "./dlab-campus-projection.js";
import { readDlabDirectory } from "./dlab-directory-read.js";
import { DlabReconcilerService } from "./dlab-reconciler.service.js";
import { DlabSourceService } from "./dlab-source.service.js";
import { DlabStateService, digest } from "./dlab-state.service.js";
import { dlabTransaction, sourceWrite } from "./dlab-transaction.js";
import { DlabError } from "./dlab-error.js";

type Entry = {
  kind: "campus" | "user";
  id: string;
  fingerprint: string;
  action: string;
  targetId: string | null;
  contextOnly?: boolean;
  before?: { name: string; status: string };
  after?: { name: string; status: string };
};
export type DirectoryPlan = {
  version: 1;
  actorId: string;
  target: string;
  entries: Entry[];
  digest: string;
};
const key = (entry: Pick<Entry, "kind" | "id">) => `${entry.kind}:${entry.id}`;
const stable = (value: unknown) => JSON.stringify(value);
export function directoryPlanDigest(plan: Omit<DirectoryPlan, "digest">) {
  return digest(stable(plan));
}

/** Read-only, bounded keyset preview. Plans contain private directory IDs: keep
 * the artifact private. Durable completion events make interrupted apply resumable.
 */
export class DlabDirectoryCatchup {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly directory: DlabDirectoryService,
    private readonly state: DlabStateService,
    private readonly source: DlabSourceService,
    private readonly reconciler: DlabReconcilerService,
  ) {}
  async actor(actorId: string) {
    const actor = await this.db.user.findUnique({
      where: { id: actorId },
      select: { status: true, platformRole: true },
    });
    if (actor?.status !== "ACTIVE" || actor.platformRole !== "ADMIN")
      throw new DlabError("platform_operator_required", 403);
  }
  async preview(
    actorId: string,
    target: string,
    filters: { campus?: string; user?: string; batchSize?: number } = {},
  ): Promise<DirectoryPlan> {
    await this.actor(actorId);
    const size = Math.max(1, Math.min(filters.batchSize ?? 100, 100));
    const entries: Entry[] = [];
    let cursor: string | undefined;
    // A keyset page is one bounded operation; no per-campus/member resolution.
    do {
      const rows = await this.db.dlabCampus.findMany({
        where: {
          ...(filters.campus ? { externalCampusId: filters.campus } : {}),
          ...(cursor
            ? {
                externalCampusId: {
                  gt: cursor,
                  ...(filters.campus ? { equals: filters.campus } : {}),
                },
              }
            : {}),
        },
        take: size,
        orderBy: { externalCampusId: "asc" },
      });
      if (!rows.length) break;
      const targets = await this.db.academy.findMany({
        where: {
          id: { in: rows.flatMap((c) => (c.academyId ? [c.academyId] : [])) },
        },
        select: { id: true, name: true, status: true },
      });
      const byId = new Map(targets.map((a) => [a.id, a]));
      for (const c of rows) {
        const a = c.academyId ? byId.get(c.academyId) : undefined;
        const after = {
          name: c.name,
          status: projectedCampusStatus(c.status, c.localAcademyRestriction),
        };
        entries.push({
          kind: "campus",
          id: c.externalCampusId,
          fingerprint: campusFingerprint(c, a),
          targetId: c.academyId,
          action: !a
            ? c.status === "inactive"
              ? "restricted"
              : "create"
            : a.name === after.name && a.status === after.status
              ? "unchanged"
              : "update",
          ...(a ? { before: { name: a.name, status: a.status } } : {}),
          after,
        });
      }
      cursor = rows.at(-1)!.externalCampusId;
      if (rows.length < size) break;
    } while (true);
    cursor = undefined;
    do {
      const rows: Array<{
        externalUserId: string;
        userId: string | null;
        provisioningStatus: string;
        projectedRevision: number | null;
        revision: number;
      }> = await this.db.dlabIdentity.findMany({
        where: {
          ...(filters.user ? { externalUserId: filters.user } : {}),
          ...(cursor
            ? {
                externalUserId: {
                  gt: cursor,
                  ...(filters.user ? { equals: filters.user } : {}),
                },
              }
            : {}),
          ...(filters.campus
            ? {
                OR: [
                  { externalCampusId: filters.campus },
                  { externalCampusIds: { has: filters.campus } },
                ],
              }
            : {}),
        },
        select: {
          externalUserId: true,
          userId: true,
          provisioningStatus: true,
          projectedRevision: true,
          revision: true,
        },
        take: size,
        orderBy: { externalUserId: "asc" },
      });
      if (!rows.length) break;
      const snapshots = await readDlabDirectory(
        this.db,
        rows.map((r) => r.externalUserId),
      );
      const fingerprints = await this.userFingerprints(
        rows.map((r) => r.externalUserId),
      );
      const known = new Set(
        entries.filter((e) => e.kind === "campus").map((e) => e.id),
      );
      const dependencies = [
        ...new Set(
          snapshots
            .flatMap((s) => s.campuses.map((c) => c.externalCampusId))
            .filter((id) => !known.has(id)),
        ),
      ];
      if (dependencies.length) {
        const campuses = await this.db.dlabCampus.findMany({
          where: { externalCampusId: { in: dependencies } },
        });
        const academies = await this.db.academy.findMany({
          where: {
            id: {
              in: campuses.flatMap((c) => (c.academyId ? [c.academyId] : [])),
            },
          },
          select: { id: true, name: true, status: true },
        });
        const byAcademy = new Map(academies.map((a) => [a.id, a]));
        entries.push(
          ...campuses.map((c) => ({
            kind: "campus" as const,
            id: c.externalCampusId,
            targetId: c.academyId,
            contextOnly: true,
            action: "context",
            fingerprint: campusFingerprint(
              c,
              c.academyId ? byAcademy.get(c.academyId) : undefined,
            ),
          })),
        );
      }
      const byId = new Map(snapshots.map((s) => [s.externalUserId, s]));
      for (const row of rows) {
        const snapshot = byId.get(row.externalUserId)!;
        let conflict: string | null = null;
        try {
          requireDirectoryMappings(snapshot);
        } catch (error) {
          conflict =
            error instanceof DlabError ? error.reason : "mapping_conflict";
        }
        // A campus created by this reviewed plan may resolve a staged user.
        const missingCovered = dlabEffectiveScope(
          snapshot.userRole,
          snapshot.externalCampusId,
          snapshot.externalCampusIds,
        ).every(
          (id) =>
            snapshot.campuses.some(
              (c) => c.externalCampusId === id && c.academyId,
            ) ||
            entries.some(
              (e) =>
                e.kind === "campus" && e.id === id && e.action === "create",
            ),
        );
        entries.push({
          kind: "user",
          id: row.externalUserId,
          targetId: row.userId,
          fingerprint: fingerprints.get(row.externalUserId)!,
          action:
            conflict &&
            !(conflict === "campus_mapping_required" && missingCovered)
              ? "conflict"
              : snapshot.accountStatus !== "active" ||
                  (snapshot.user?.status && snapshot.user.status !== "ACTIVE")
                ? "restricted"
                : !row.userId
                  ? "create"
                  : row.provisioningStatus === "READY" &&
                      row.projectedRevision === row.revision
                    ? "unchanged"
                    : "update",
        });
      }
      cursor = rows.at(-1)!.externalUserId;
      if (rows.length < size) break;
    } while (true);
    if (
      (filters.user &&
        !entries.some((e) => e.kind === "user" && e.id === filters.user)) ||
      (filters.campus &&
        !entries.some((e) => e.kind === "campus" && e.id === filters.campus))
    )
      throw new DlabError("directory_item_not_found", 409);
    entries.sort((a, b) =>
      a.kind === b.kind
        ? a.id.localeCompare(b.id)
        : a.kind === "campus"
          ? -1
          : 1,
    );
    const plan = { version: 1 as const, actorId, target, entries };
    return { ...plan, digest: directoryPlanDigest(plan) };
  }
  async apply(plan: DirectoryPlan, target: string) {
    this.directory.requireEnabled();
    const { digest: expected, ...body } = plan;
    if (
      plan.version !== 1 ||
      plan.target !== target ||
      directoryPlanDigest(body) !== expected
    )
      throw new DlabError("plan_changed", 409);
    await this.actor(plan.actorId);
    await this.state.requireRedis().ping();
    const progressRows = await this.db.dlabIntegrationEvent.findMany({
      where: {
        action: "directory.catchup.completed",
        details: { path: ["planDigest"], equals: plan.digest },
      },
      select: { details: true },
    });
    const completed = new Map(
      progressRows.map((r) => {
        const d = r.details as { key: string; fingerprint: string };
        return [d.key, d.fingerprint];
      }),
    );
    const report: Array<{ kind: string; id: string; outcome: string }> = [];
    for (const entry of plan.entries) {
      const resumed = completed.has(key(entry));
      try {
        if (entry.action === "conflict")
          throw new DlabError("plan_conflict", 409);
        await this.actor(plan.actorId);
        if (entry.kind === "campus") {
          await dlabTransaction(this.db, async (tx) => {
            await sourceWrite(tx);
            const c = await tx.dlabCampus.findUniqueOrThrow({
              where: { externalCampusId: entry.id },
            });
            const a = c.academyId
              ? await tx.academy.findUniqueOrThrow({
                  where: { id: c.academyId },
                  select: { id: true, name: true, status: true },
                })
              : undefined;
            if (
              campusFingerprint(c, a) !==
              (completed.get(key(entry)) ?? entry.fingerprint)
            )
              throw new DlabError("plan_changed", 409);
            if (completed.has(key(entry)) || entry.contextOnly) return;
            const provisioned = await new DlabCampusProvisioner(
              this.config,
            ).provision(tx, c);
            if (c.status === "active" && !provisioned.campus.academyId)
              throw new DlabError("campus_mapping_required", 409);
            const projection = await projectDlabCampus(tx, provisioned.campus);
            if (provisioned.created || projection.statusChanged)
              await reconcileDlabCampus(
                tx,
                this.reconciler,
                c.externalCampusId,
                projection.statusChanged
                  ? provisioned.campus.academyId!
                  : undefined,
              );
            const after = provisioned.campus.academyId
              ? await tx.academy.findUniqueOrThrow({
                  where: { id: provisioned.campus.academyId },
                  select: { id: true, name: true, status: true },
                })
              : undefined;
            const fingerprint = campusFingerprint(provisioned.campus, after);
            await this.record(tx, plan, entry, fingerprint);
            completed.set(key(entry), fingerprint);
          });
          await this.source.changed();
        } else {
          await this.state.lock(entry.id, async (owned) => {
            const saved = await dlabTransaction(this.db, async (tx) => {
              const fingerprints = await this.userFingerprints([entry.id], tx);
              if (
                fingerprints.get(entry.id) !==
                (completed.get(key(entry)) ?? entry.fingerprint)
              )
                throw new DlabError("plan_changed", 409);
              return tx.dlabIdentity.findUniqueOrThrow({
                where: { externalUserId: entry.id },
              });
            });
            if (completed.has(key(entry))) return;
            const [snapshot] = await readDlabDirectory(this.db, [entry.id]);
            const campusIds = snapshot!.campuses.map((c) => c.externalCampusId);
            const campuses = await this.db.dlabCampus.findMany({
              where: { externalCampusId: { in: campusIds } },
            });
            const academies = await this.db.academy.findMany({
              where: {
                id: {
                  in: campuses.flatMap((c) =>
                    c.academyId ? [c.academyId] : [],
                  ),
                },
              },
              select: { id: true, name: true, status: true },
            });
            const byId = new Map(academies.map((a) => [a.id, a]));
            for (const c of campuses) {
              const reviewed = plan.entries.find(
                (e) => e.kind === "campus" && e.id === c.externalCampusId,
              );
              if (
                !reviewed ||
                campusFingerprint(
                  c,
                  c.academyId ? byId.get(c.academyId) : undefined,
                ) !== (completed.get(key(reviewed)) ?? reviewed.fingerprint)
              )
                throw new DlabError("plan_changed", 409);
            }
            await this.directory.provision(
              saved,
              randomUUID(),
              owned,
              async (tx) => {
                const actor = await tx.user.findUnique({
                  where: { id: plan.actorId },
                  select: { status: true, platformRole: true },
                });
                if (
                  actor?.status !== "ACTIVE" ||
                  actor.platformRole !== "ADMIN"
                )
                  throw new DlabError("platform_operator_required", 403);
                const fingerprint = (
                  await this.userFingerprints([entry.id], tx)
                ).get(entry.id)!;
                await this.record(tx, plan, entry, fingerprint);
                completed.set(key(entry), fingerprint);
              },
            );
          });
        }
        report.push({
          kind: entry.kind,
          id: entry.id,
          outcome: resumed ? "resumed" : "applied",
        });
      } catch (error) {
        report.push({
          kind: entry.kind,
          id: entry.id,
          outcome:
            error instanceof DlabError
              ? error.reason
              : "integration_unavailable",
        });
      }
      if (entry.kind === "user")
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      planDigest: plan.digest,
      completed: report.filter((r) =>
        ["applied", "resumed"].includes(r.outcome),
      ).length,
      failed: report.filter((r) => !["applied", "resumed"].includes(r.outcome))
        .length,
      report,
    };
  }
  private async record(
    tx: Prisma.TransactionClient,
    plan: DirectoryPlan,
    entry: Entry,
    fingerprint: string,
  ) {
    await tx.dlabIntegrationEvent.create({
      data: {
        action: "directory.catchup.completed",
        ...(entry.kind === "user" ? { externalUserId: entry.id } : {}),
        details: {
          planDigest: plan.digest,
          key: key(entry),
          fingerprint,
          actorId: plan.actorId,
          targetId: entry.targetId,
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: plan.actorId,
        action: "dlab.directory.catchup",
        targetType: "DlabIntegration",
        targetId: entry.id,
        after: { planDigest: plan.digest, kind: entry.kind },
      },
    });
  }
  private async userFingerprints(
    ids: string[],
    reader: Pick<Prisma.TransactionClient, "$queryRaw"> = this.db,
  ) {
    // Source and independent local intent, excluding projection/generation
    // changes caused by this plan's preceding campus phase.
    const rows = await reader.$queryRaw<
      Array<{ id: string; facts: Prisma.JsonValue }>
    >(Prisma.sql`
      SELECT i.external_user_id AS id,jsonb_build_object('hash',i.payload_hash,'version',i.source_updated_at,'userId',i.user_id,
        'status',u.status,'authId',u.auth_user_id,'restrictions',coalesce((SELECT jsonb_agg(jsonb_build_array(b.membership_id,b.local_suspended_at) ORDER BY b.membership_id)
        FROM dlab_membership_bindings b WHERE b.external_user_id=i.external_user_id AND b.local_suspended_at IS NOT NULL),'[]'::jsonb)) AS facts
      FROM dlab_identities i LEFT JOIN users u ON u.id=i.user_id WHERE i.external_user_id IN (${Prisma.join(ids)}) ORDER BY i.external_user_id
    `);
    return new Map(rows.map((r) => [r.id, digest(stable(r.facts))]));
  }
}
function campusFingerprint(
  c: DlabCampus,
  a?: { id: string; name: string; status: string },
) {
  return digest(
    stable({
      id: c.externalCampusId,
      hash: c.payloadHash,
      version: c.sourceUpdatedAt,
      academyId: c.academyId,
      local: c.localAcademyRestriction,
      sso: c.ssoEnabled,
      enabledAt: c.ssoEnabledAt,
      academy: a ? { id: a.id, name: a.name, status: a.status } : null,
    }),
  );
}
