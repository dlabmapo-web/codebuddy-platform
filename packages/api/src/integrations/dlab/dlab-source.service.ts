import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { canonicalDlabScope, type DlabUser, type DlabSsoUser, type dlabCampusSchema } from '@cove/shared';
import type { z } from 'zod';
import { PrismaService } from '../../database/prisma.service.js';
import type { DlabIdentity } from '../../generated/prisma/client.js';
import { MonitoringRevocationService } from '../../monitoring/monitoring-revocation.service.js';
import { DlabStateService, digest, dlabRecheckMessage } from './dlab-state.service.js';
import { DlabReconcilerService } from './dlab-reconciler.service.js';
import { dlabTransaction, sourceWrite } from './dlab-transaction.js';
import { DlabError } from './dlab-error.js';
import { projectDlabCampus } from './dlab-campus-projection.js';
import { DlabCampusProvisioner, reconcileDlabCampus } from './dlab-campus-provisioner.js';
export { sourceLock, sourceWrite } from './dlab-transaction.js';

export function sourceOrder(previous: Date | null, incoming: Date | null, oldHash: string, newHash: string): 'apply' | 'noop' {
  if (previous && incoming) {
    if (incoming < previous) return 'noop';
    if (+incoming === +previous) {
      if (oldHash !== newHash) throw new DlabError('conflicting_source_version', 409);
      return 'noop';
    }
  }
  return oldHash === newHash && (!incoming || (previous && +incoming === +previous)) ? 'noop' : 'apply';
}
export function requireCurrentSource(previous: Date | null, incoming: Date | null) {
  if (previous && !incoming) throw new DlabError('source_timestamp_required', 400, 'updated_at');
  if (previous && incoming && incoming < previous) throw new DlabError('stale_source_version', 409);
}
function sourcePayload(record: Pick<DlabIdentity, 'name' | 'grade' | 'userRole' | 'accountStatus' | 'externalCampusId' | 'externalCampusIds'>) {
  return { name: record.name, grade: record.grade, userRole: record.userRole, accountStatus: record.accountStatus, externalCampusId: record.externalCampusId, externalCampusIds: canonicalDlabScope(record.externalCampusId, record.externalCampusIds) };
}
@Injectable()
export class DlabSourceService {
  private readonly logger = new Logger(DlabSourceService.name);
  constructor(private readonly prisma: PrismaService, private readonly state: DlabStateService, private readonly reconciler: DlabReconcilerService, @Optional() private readonly revocation?: MonitoringRevocationService, @Optional() private readonly campusProvisioner?: DlabCampusProvisioner) {}
  /** `recheck` names the accounts whose live sessions must re-verify; by
   * default (campus changes) every session does. An empty list asks nobody. */
  async changed(membershipIds: string[] = [], recheck: readonly string[] | 'everyone' = 'everyone') {
    const message = recheck === 'everyone' ? 'recheck' : recheck.length ? dlabRecheckMessage(recheck) : null;
    if (message) await this.state.optionalRedis()?.publish('cove:dlab:changed', message).catch(() => this.logger.warn({ reason: 'directory_notification_unavailable' }));
    for (const id of new Set(membershipIds)) await this.revocation?.revokeMembership(id, 'ROLE_CHANGED');
  }
  async campus(id: string, input: z.infer<typeof dlabCampusSchema>, requestId?: string, strict = false) {
    const timestamp = input.updated_at ? new Date(input.updated_at) : null;
    const hash = digest(JSON.stringify({ name: input.name, status: input.status, campusType: input.campus_type ?? null }));
    const outcome = await dlabTransaction(this.prisma, async tx => {
      await sourceWrite(tx);
      const existing = await tx.dlabCampus.findUnique({ where: { externalCampusId: id } });
      if (existing && strict) requireCurrentSource(existing.sourceUpdatedAt, timestamp);
      if (existing && sourceOrder(existing.sourceUpdatedAt, timestamp, existing.payloadHash, hash) === 'noop') {
        // Replaying current data can finish rollout of a previously staged row.
        // A stale event cannot trigger provisioning or alter authoritative state.
        if (existing.sourceUpdatedAt && timestamp && timestamp < existing.sourceUpdatedAt) return { record: existing, changed: [] as string[], directoryOutcome: 'unchanged' };
        const result = await this.campusProvisioner?.provision(tx, existing, requestId);
        const record = result?.campus ?? existing;
        const projection = strict ? await projectDlabCampus(tx, record, requestId) : null;
        const changed = result?.created || projection?.statusChanged ? await reconcileDlabCampus(tx, this.reconciler, id, projection?.statusChanged ? record.academyId! : undefined) : [];
        if (strict && record.status === 'active' && !record.academyId) throw new DlabError('campus_mapping_required', 409);
        return { record, changed, directoryOutcome: !record.academyId && record.status === 'inactive' ? 'source_only_inactive' : record.status !== 'active' || record.localAcademyRestriction ? 'applied_restricted' : projection?.changed || result?.created ? 'applied' : 'unchanged', closedAcademyId: projection?.closed ? record.academyId : null };
      }
      const accessChanged = existing && existing.status !== input.status;
      const record = await tx.dlabCampus.upsert({ where: { externalCampusId: id }, create: { externalCampusId: id, name: input.name, status: input.status, campusType: input.campus_type, payloadHash: hash, sourceUpdatedAt: timestamp }, update: { name: input.name, status: input.status, campusType: input.campus_type ?? null, payloadHash: hash, sourceUpdatedAt: timestamp ?? existing?.sourceUpdatedAt, receivedAt: new Date(), ...(accessChanged ? { accessRevision: { increment: 1 } } : {}) } });
      const result = await this.campusProvisioner?.provision(tx, record, requestId);
      const mapped = result?.campus ?? record;
      if (strict && mapped.status === 'active' && !mapped.academyId) throw new DlabError('campus_mapping_required', 409);
      const projection = strict ? await projectDlabCampus(tx, mapped, requestId) : null;
      const changed = accessChanged || result?.created || projection?.statusChanged ? await reconcileDlabCampus(tx, this.reconciler, id, projection?.statusChanged ? mapped.academyId! : undefined) : [];
      await tx.dlabIntegrationEvent.create({ data: { requestId, action: 'campus.updated', details: { externalCampusId: id, status: input.status } } });
      return { record: mapped, changed, directoryOutcome: !mapped.academyId && mapped.status === 'inactive' ? 'source_only_inactive' : mapped.status !== 'active' || mapped.localAcademyRestriction ? 'applied_restricted' : 'applied', closedAcademyId: projection?.closed ? mapped.academyId : null };
    });
    if ('closedAcademyId' in outcome && outcome.closedAcademyId) await this.revocation?.revokeAcademy(outcome.closedAcademyId, 'ACADEMY_SUSPENDED');
    const closed = 'closedAcademyId' in outcome && outcome.closedAcademyId;
    await this.changed(closed ? [] : outcome.changed, outcome.changed.length ? 'everyone' : []);
    return { ...outcome.record, directoryOutcome: outcome.directoryOutcome };
  }
  async user(id: string, input: DlabUser | DlabSsoUser, loginStartedAt?: number, requestId?: string, options: { strict?: boolean; deferReconcile?: boolean } = {}) {
    const timestamp = 'updated_at' in input && input.updated_at ? new Date(input.updated_at) : null;
    const payload = sourcePayload({ name: input.name, grade: input.grade ?? null, userRole: input.user_role, accountStatus: input.account_status, externalCampusId: input.external_campus_id, externalCampusIds: input.external_campus_ids ?? [input.external_campus_id] });
    const hash = digest(JSON.stringify(payload));
    const outcome = await dlabTransaction(this.prisma, async tx => {
      await sourceWrite(tx);
      const previous = await tx.dlabIdentity.findUnique({ where: { externalUserId: id } });
      if (previous && options.strict && loginStartedAt === undefined) requireCurrentSource(previous.sourceUpdatedAt, timestamp);
      if (loginStartedAt !== undefined && previous) {
        if (+previous.receivedAt > loginStartedAt) throw new DlabError('identity_changed_during_login', 409);
        if (previous.accountStatus !== 'active' && input.account_status === 'active') throw new DlabError('reactivation_update_required', 403);
      }
      // Recompute from canonical stored fields, including rows predating this migration.
      const previousHash = previous ? digest(JSON.stringify(sourcePayload(previous))) : '';
      if (previous && loginStartedAt === undefined && sourceOrder(previous.sourceUpdatedAt, timestamp, previousHash, hash) === 'noop') return { record: previous, changed: [] as string[], recheck: [] as string[] };
      const changesAccess = previous && (previous.accountStatus !== payload.accountStatus || previous.userRole !== payload.userRole || previous.externalCampusId !== payload.externalCampusId || JSON.stringify(canonicalDlabScope(previous.externalCampusId, previous.externalCampusIds)) !== JSON.stringify(payload.externalCampusIds));
      const record = await tx.dlabIdentity.upsert({ where: { externalUserId: id }, create: { ...payload, externalUserId: id, reservedUserId: randomUUID(), payloadHash: hash, sourceUpdatedAt: timestamp }, update: { ...payload, payloadHash: hash, ...(options.deferReconcile && loginStartedAt === undefined ? { provisioningStatus: 'PENDING' as const } : {}), ...(timestamp ? { sourceUpdatedAt: timestamp } : {}), revision: { increment: 1 }, ...(changesAccess ? { generation: { increment: 1 } } : {}), receivedAt: new Date() } });
      const user = record.userId && !options.deferReconcile ? await tx.user.update({ where: { id: record.userId }, data: { displayName: record.name }, select: { authUserId: true } }) : null;
      const changed = options.deferReconcile ? [] : await this.reconciler.reconcile(tx, record);
      await tx.dlabIntegrationEvent.create({ data: { externalUserId: id, requestId, action: loginStartedAt === undefined ? 'user.updated' : 'user.login', revision: record.revision, details: { beforeRole: previous?.userRole ?? null, role: record.userRole, scope: record.externalCampusIds, status: record.accountStatus } } });
      // Only this account's facts changed; a no-op replay changed nobody's.
      return { record, changed, recheck: user?.authUserId ? [user.authUserId] : options.deferReconcile && changesAccess && record.userId ? [record.reservedUserId] : [] };
    });
    await this.changed(outcome.changed, outcome.recheck);
    return outcome.record;
  }
}
