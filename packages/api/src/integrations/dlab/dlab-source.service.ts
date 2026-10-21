import { randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { canonicalDlabScope, type DlabUser, type DlabSsoUser, type dlabCampusSchema } from '@cove/shared';
import type { z } from 'zod';
import { PrismaService } from '../../database/prisma.service.js';
import type { DlabIdentity } from '../../generated/prisma/client.js';
import { MonitoringRevocationService } from '../../monitoring/monitoring-revocation.service.js';
import { DlabStateService, digest } from './dlab-state.service.js';
import { DlabReconcilerService } from './dlab-reconciler.service.js';
import { dlabTransaction, sourceWrite } from './dlab-transaction.js';
import { DlabError } from './dlab-error.js';
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
function sourcePayload(record: Pick<DlabIdentity, 'name' | 'grade' | 'userRole' | 'accountStatus' | 'externalCampusId' | 'externalCampusIds'>) {
  return { name: record.name, grade: record.grade, userRole: record.userRole, accountStatus: record.accountStatus, externalCampusId: record.externalCampusId, externalCampusIds: canonicalDlabScope(record.externalCampusId, record.externalCampusIds) };
}
@Injectable()
export class DlabSourceService {
  constructor(private readonly prisma: PrismaService, private readonly state: DlabStateService, private readonly reconciler: DlabReconcilerService, @Optional() private readonly revocation?: MonitoringRevocationService) {}
  async changed(membershipIds: string[] = []) {
    await this.state.optionalRedis()?.publish('cove:dlab:changed', 'recheck').catch(() => undefined);
    for (const id of new Set(membershipIds)) await this.revocation?.revokeMembership(id, 'ROLE_CHANGED');
  }
  async campus(id: string, input: z.infer<typeof dlabCampusSchema>, requestId?: string) {
    const timestamp = input.updated_at ? new Date(input.updated_at) : null;
    const hash = digest(JSON.stringify({ name: input.name, status: input.status, campusType: input.campus_type ?? null }));
    const outcome = await dlabTransaction(this.prisma, async tx => {
      await sourceWrite(tx);
      const existing = await tx.dlabCampus.findUnique({ where: { externalCampusId: id } });
      if (existing && sourceOrder(existing.sourceUpdatedAt, timestamp, existing.payloadHash, hash) === 'noop') return { record: existing, changed: [] as string[] };
      const accessChanged = existing && existing.status !== input.status;
      const record = await tx.dlabCampus.upsert({ where: { externalCampusId: id }, create: { externalCampusId: id, name: input.name, status: input.status, campusType: input.campus_type, payloadHash: hash, sourceUpdatedAt: timestamp }, update: { name: input.name, status: input.status, campusType: input.campus_type ?? null, payloadHash: hash, sourceUpdatedAt: timestamp ?? existing?.sourceUpdatedAt, receivedAt: new Date(), ...(accessChanged ? { accessRevision: { increment: 1 } } : {}) } });
      const changed: string[] = [];
      if (accessChanged) {
        const identities = await tx.dlabIdentity.findMany({ where: { OR: [{ externalCampusId: id }, { externalCampusIds: { has: id } }, { bindings: { some: { externalCampusId: id } } }] }, orderBy: { externalUserId: 'asc' } });
        for (const identity of identities) {
          const updated = await tx.dlabIdentity.update({ where: { externalUserId: identity.externalUserId }, data: { generation: { increment: 1 }, revision: { increment: 1 } } });
          changed.push(...await this.reconciler.reconcile(tx, updated));
        }
      }
      await tx.dlabIntegrationEvent.create({ data: { requestId, action: 'campus.updated', details: { externalCampusId: id, status: input.status } } });
      return { record, changed };
    });
    await this.changed(outcome.changed);
    return outcome.record;
  }
  async user(id: string, input: DlabUser | DlabSsoUser, loginStartedAt?: number, requestId?: string) {
    const timestamp = 'updated_at' in input && input.updated_at ? new Date(input.updated_at) : null;
    const payload = sourcePayload({ name: input.name, grade: input.grade ?? null, userRole: input.user_role, accountStatus: input.account_status, externalCampusId: input.external_campus_id, externalCampusIds: input.external_campus_ids ?? [input.external_campus_id] });
    const hash = digest(JSON.stringify(payload));
    const outcome = await dlabTransaction(this.prisma, async tx => {
      await sourceWrite(tx);
      const previous = await tx.dlabIdentity.findUnique({ where: { externalUserId: id } });
      if (loginStartedAt !== undefined && previous) {
        if (+previous.receivedAt > loginStartedAt) throw new DlabError('identity_changed_during_login', 409);
        if (previous.accountStatus !== 'active' && input.account_status === 'active') throw new DlabError('reactivation_update_required', 403);
      }
      // Recompute from canonical stored fields, including rows predating this migration.
      const previousHash = previous ? digest(JSON.stringify(sourcePayload(previous))) : '';
      if (previous && loginStartedAt === undefined && sourceOrder(previous.sourceUpdatedAt, timestamp, previousHash, hash) === 'noop') return { record: previous, changed: [] as string[] };
      const changesAccess = previous && (previous.accountStatus !== payload.accountStatus || previous.userRole !== payload.userRole || previous.externalCampusId !== payload.externalCampusId || JSON.stringify(canonicalDlabScope(previous.externalCampusId, previous.externalCampusIds)) !== JSON.stringify(payload.externalCampusIds));
      const record = await tx.dlabIdentity.upsert({ where: { externalUserId: id }, create: { ...payload, externalUserId: id, reservedUserId: randomUUID(), payloadHash: hash, sourceUpdatedAt: timestamp }, update: { ...payload, payloadHash: hash, ...(timestamp ? { sourceUpdatedAt: timestamp } : {}), revision: { increment: 1 }, ...(changesAccess ? { generation: { increment: 1 } } : {}), receivedAt: new Date() } });
      if (record.userId) await tx.user.update({ where: { id: record.userId }, data: { displayName: record.name } });
      const changed = await this.reconciler.reconcile(tx, record);
      await tx.dlabIntegrationEvent.create({ data: { externalUserId: id, requestId, action: loginStartedAt === undefined ? 'user.updated' : 'user.login', revision: record.revision, details: { beforeRole: previous?.userRole ?? null, role: record.userRole, scope: record.externalCampusIds, status: record.accountStatus } } });
      return { record, changed };
    });
    await this.changed(outcome.changed);
    return outcome.record;
  }
}
