import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type DlabUser, type DlabSsoUser, type dlabCampusSchema } from '@cove/shared';
import type { z } from 'zod';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DlabStateService, digest } from './dlab-state.service.js';
import { DlabError } from './dlab-error.js';

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
export async function sourceLock(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}
export async function sourceWrite(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT set_config('cove.dlab_sync', 'on', true)`;
}
@Injectable()
export class DlabSourceService {
  constructor(private readonly prisma: PrismaService, private readonly state: DlabStateService) {}
  private async changed() { await this.state.optionalRedis()?.publish('cove:dlab:changed', 'recheck').catch(() => undefined); }
  async campus(id: string, input: z.infer<typeof dlabCampusSchema>) {
    const timestamp = input.updated_at ? new Date(input.updated_at) : null;
    const hash = digest(JSON.stringify({ name: input.name, status: input.status, campusType: input.campus_type ?? null }));
    const result = await this.prisma.$transaction(async tx => {
      await sourceLock(tx, `campus:${id}`);
      const existing = await tx.dlabCampus.findUnique({ where: { externalCampusId: id } });
      if (existing && sourceOrder(existing.sourceUpdatedAt, timestamp, existing.payloadHash, hash) === 'noop') return existing;
      const result = await tx.dlabCampus.upsert({ where: { externalCampusId: id }, create: { externalCampusId: id, name: input.name, status: input.status, campusType: input.campus_type, payloadHash: hash, sourceUpdatedAt: timestamp }, update: { name: input.name, status: input.status, campusType: input.campus_type ?? null, payloadHash: hash, sourceUpdatedAt: timestamp ?? existing?.sourceUpdatedAt, receivedAt: new Date() } });
      if (existing && existing.status !== result.status) await tx.dlabIdentity.updateMany({ where: { externalCampusId: id }, data: { generation: { increment: 1 }, revision: { increment: 1 } } });
      return result;
    });
    await this.changed();
    return result;
  }
  async user(id: string, input: DlabUser | DlabSsoUser, loginStartedAt?: number) {
    const campusIds = input.external_campus_ids ?? [input.external_campus_id];
    const timestamp = 'updated_at' in input && input.updated_at ? new Date(input.updated_at) : null;
    const payload = { name: input.name, grade: input.grade ?? null, userRole: input.user_role, accountStatus: input.account_status, externalCampusId: input.external_campus_id, externalCampusIds: campusIds };
    const hash = digest(JSON.stringify(payload));
    const result = await this.prisma.$transaction(async tx => {
      await sourceLock(tx, `user:${id}`);
      await sourceWrite(tx);
      const previous = await tx.dlabIdentity.findUnique({ where: { externalUserId: id } });
      if (loginStartedAt !== undefined && previous) {
        if (+previous.receivedAt > loginStartedAt) throw new DlabError('identity_changed_during_login', 409);
        if (previous.accountStatus !== 'active' && input.account_status === 'active') throw new DlabError('reactivation_update_required', 403);
      }
      if (previous && loginStartedAt === undefined && sourceOrder(previous.sourceUpdatedAt, timestamp, previous.payloadHash, hash) === 'noop') return previous;
      const changesAccess = previous && (previous.accountStatus !== payload.accountStatus || previous.userRole !== payload.userRole || previous.externalCampusId !== payload.externalCampusId || JSON.stringify(previous.externalCampusIds) !== JSON.stringify(campusIds));
      const record = await tx.dlabIdentity.upsert({ where: { externalUserId: id }, create: { ...payload, externalUserId: id, reservedUserId: randomUUID(), payloadHash: hash, sourceUpdatedAt: timestamp }, update: { ...payload, payloadHash: hash, ...(timestamp ? { sourceUpdatedAt: timestamp } : {}), revision: { increment: 1 }, ...(changesAccess ? { generation: { increment: 1 } } : {}), receivedAt: new Date() } });
      if (record.userId) {
        await tx.user.update({ where: { id: record.userId }, data: { displayName: record.name } });
        const bindings = await tx.dlabMembershipBinding.findMany({ where: { externalUserId: id }, include: { membership: true } });
        for (const binding of bindings) {
          if (binding.externalCampusId !== record.externalCampusId && binding.membership.status === 'ACTIVE') await tx.academyMembership.update({ where: { id: binding.membershipId }, data: { status: 'SUSPENDED', suspendedAt: new Date() } });
          if (binding.externalCampusId === record.externalCampusId) await tx.studentAcademyProfile.upsert({ where: { membershipId: binding.membershipId }, create: { membershipId: binding.membershipId, academyId: binding.membership.academyId, schoolGrade: record.grade, codingInterests: [] }, update: { schoolGrade: record.grade } });
        }
      }
      return record;
    });
    await this.changed();
    return result;
  }
}
