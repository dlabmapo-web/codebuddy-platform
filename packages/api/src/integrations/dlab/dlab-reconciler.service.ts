import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dlabAcademyRole, dlabAcademyRoles, dlabMembershipRolesMatch, dlabEffectiveScope, dlabPlatformRole } from '@cove/shared';
import type { ApiEnvironment } from '../../config/env.schema.js';
import type { DlabIdentity, Prisma } from '../../generated/prisma/client.js';
import { bumpPeopleRevision } from '../../manage/people-revision.js';
import { DlabError } from './dlab-error.js';
import { sourceWrite } from './dlab-transaction.js';

export function dlabAdmitted(config: ConfigService<ApiEnvironment, true>, id: string) {
  return config.get('DLAB_SSO_ROLLOUT_MODE', { infer: true }) === 'campus'
    || (config.get('DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS', { infer: true }) ?? []).includes(id);
}
export async function desiredDlabCampuses(tx: Prisma.TransactionClient, config: ConfigService<ApiEnvironment, true>, identity: DlabIdentity) {
  const ids = dlabEffectiveScope(identity.userRole, identity.externalCampusId, identity.externalCampusIds);
  if (identity.accountStatus !== 'active' || !dlabAdmitted(config, identity.externalUserId)) return [];
  return tx.dlabCampus.findMany({
    where: { externalCampusId: { in: ids }, status: 'active', academy: { kind: 'ACADEMY', status: 'ACTIVE' }, ...(config.get('DLAB_SSO_ROLLOUT_MODE', { infer: true }) === 'campus' ? { ssoEnabled: true } : {}) },
    include: { academy: true }, orderBy: { externalCampusId: 'asc' },
  });
}

@Injectable()
export class DlabReconcilerService {
  private readonly logger = new Logger(DlabReconcilerService.name);
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}
  async reconcile(tx: Prisma.TransactionClient, identity: DlabIdentity) {
    if (!identity.userId) return [] as string[];
    await sourceWrite(tx);
    const user = await tx.user.findUniqueOrThrow({ where: { id: identity.userId } });
    const desired = await desiredDlabCampuses(tx, this.config, identity);
    const role = dlabAcademyRole(identity.userRole);
    const bindings = await tx.dlabMembershipBinding.findMany({ where: { externalUserId: identity.externalUserId }, include: { membership: { include: { extraRoles: true } } } });
    const platformRole = dlabPlatformRole(identity.userRole) === 'ADMIN'
      && user.status === 'ACTIVE' && desired.length > 0 && !bindings.some(b => b.localSuspendedAt)
      ? 'ADMIN' : 'USER';
    if (user.platformRole !== platformRole) {
      await tx.user.update({ where: { id: user.id }, data: { platformRole } });
      await tx.dlabIntegrationEvent.create({ data: { externalUserId: identity.externalUserId, action: 'platform_role.reconciled', revision: identity.revision, details: { before: user.platformRole, after: platformRole } } });
    }
    const changed: string[] = [];
    if (role) for (const campus of desired) {
      const academyId = campus.academy!.id;
      let membership = await tx.academyMembership.findUnique({ where: { academyId_userId: { academyId, userId: user.id } }, include: { dlabBinding: true, extraRoles: true } });
      if (membership && (!membership.dlabBinding || membership.dlabBinding.externalUserId !== identity.externalUserId || membership.dlabBinding.externalCampusId !== campus.externalCampusId)) throw new DlabError('membership_conflict', 409);
      if (!membership) membership = await tx.academyMembership.create({ data: { academyId, userId: user.id, role, status: user.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED', joinedAt: new Date() }, include: { dlabBinding: true, extraRoles: true } });
      const active = user.status === 'ACTIVE' && !membership.dlabBinding?.localSuspendedAt;
      const status = active ? 'ACTIVE' : 'SUSPENDED';
      const extraRoles = dlabAcademyRoles(identity.userRole).filter(value => value !== role);
      const rolesChanged = !dlabMembershipRolesMatch(identity.userRole, membership.role, membership.extraRoles.map(entry => entry.role));
      const isChanged = !membership.dlabBinding || rolesChanged || membership.status !== status;
      if (isChanged) {
        if (rolesChanged) {
          await tx.academyMembershipRole.deleteMany({ where: { membershipId: membership.id } });
          if (extraRoles.length) await tx.academyMembershipRole.createMany({ data: extraRoles.map(value => ({ membershipId: membership.id, role: value })) });
          await tx.dlabIntegrationEvent.create({ data: { externalUserId: identity.externalUserId, action: 'academy_roles.reconciled', revision: identity.revision, details: { membershipId: membership.id, sourceRole: identity.userRole, before: [membership.role, ...membership.extraRoles.map(entry => entry.role)], after: dlabAcademyRoles(identity.userRole) } } });
        }
        await tx.academyMembership.update({ where: { id: membership.id }, data: { role, status, suspendedAt: active ? null : membership.suspendedAt ?? new Date() } });
        await bumpPeopleRevision(tx, academyId);
        changed.push(membership.id);
        if (membership.role === 'MANAGER' && (role !== 'MANAGER' || !active)) await this.recordManagerLoss(tx, academyId, identity);
      }
      await tx.dlabMembershipBinding.upsert({ where: { externalUserId_externalCampusId: { externalUserId: identity.externalUserId, externalCampusId: campus.externalCampusId } }, create: { externalUserId: identity.externalUserId, externalCampusId: campus.externalCampusId, membershipId: membership.id, appliedRevision: identity.revision, sourceAccessStatus: 'ALLOWED' }, update: { appliedRevision: identity.revision, sourceAccessStatus: 'ALLOWED' } });
      if (role === 'STUDENT') {
        const grade = identity.userRole === 'student' ? identity.grade : null;
        await tx.studentAcademyProfile.upsert({ where: { membershipId: membership.id }, create: { membershipId: membership.id, academyId, schoolGrade: grade, codingInterests: [] }, update: { schoolGrade: grade } });
      }
    }
    for (const binding of bindings) {
      if (role && desired.some(c => c.externalCampusId === binding.externalCampusId)) continue;
      // Retired bindings retain history, never inherited staff grants.
      if (binding.membership.extraRoles.length) {
        await tx.academyMembershipRole.deleteMany({ where: { membershipId: binding.membershipId } });
        await tx.dlabIntegrationEvent.create({ data: { externalUserId: identity.externalUserId, action: 'academy_roles.reconciled', revision: identity.revision, details: { membershipId: binding.membershipId, sourceRole: identity.userRole, before: [binding.membership.role, ...binding.membership.extraRoles.map(entry => entry.role)], after: [] } } });
        if (binding.membership.status !== 'ACTIVE') {
          await bumpPeopleRevision(tx, binding.membership.academyId);
          changed.push(binding.membershipId);
        }
      }
      await tx.dlabMembershipBinding.update({ where: { membershipId: binding.membershipId }, data: { sourceAccessStatus: 'BLOCKED', appliedRevision: identity.revision } });
      if (binding.membership.status === 'ACTIVE') {
        await tx.academyMembership.update({ where: { id: binding.membershipId }, data: { status: 'SUSPENDED', suspendedAt: new Date() } });
        await bumpPeopleRevision(tx, binding.membership.academyId);
        changed.push(binding.membershipId);
        if (binding.membership.role === 'MANAGER') await this.recordManagerLoss(tx, binding.membership.academyId, identity);
      }
    }
    if (changed.length) await tx.dlabIntegrationEvent.create({ data: { externalUserId: identity.externalUserId, action: 'memberships.reconciled', revision: identity.revision, details: { role, scope: desired.map(c => c.externalCampusId), membershipIds: changed } } });
    return changed;
  }
  private async recordManagerLoss(tx: Prisma.TransactionClient, academyId: string, identity: DlabIdentity) {
    if (await tx.academyMembership.count({ where: { academyId, role: 'MANAGER', status: 'ACTIVE' } })) return;
    this.logger.warn({ reason: 'dlab_academy_without_manager', academyId });
    await tx.dlabIntegrationEvent.create({ data: { externalUserId: identity.externalUserId, action: 'academy.manager_required', revision: identity.revision, details: { academyId } } });
  }
}
