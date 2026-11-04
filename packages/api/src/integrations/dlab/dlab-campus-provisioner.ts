import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { academyFeatureNames, academyRolloutFeatures } from '@cove/shared';
import type { ApiEnvironment } from '../../config/env.schema.js';
import type { DlabCampus, Prisma } from '../../generated/prisma/client.js';
import { resolvePlatformOrganization } from '../../platform/platform-organization.js';
import { DlabError } from './dlab-error.js';
import { DlabReconcilerService } from './dlab-reconciler.service.js';

/** Stable even when HQ renames a campus; never use names to infer ownership. */
export function dlabCampusSlug(externalCampusId: string) {
  return 'dlab-' + createHash('sha256').update(externalCampusId).digest('hex').slice(0, 48);
}

export function campusProvisioningPlan(campus: DlabCampus) {
  const action = campus.academyId ? 'mapped'
    : campus.status !== 'active' ? 'inactive'
    : !campus.ssoEnabled && campus.ssoEnabledAt ? 'locally-disabled'
    : 'create';
  return { externalCampusId: campus.externalCampusId, name: campus.name, academyId: campus.academyId, action, slug: action === 'create' ? dlabCampusSlug(campus.externalCampusId) : null };
}

/** Caller holds the DLAB source lock and source-write context. No external IO. */
@Injectable()
export class DlabCampusProvisioner {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  get enabled() {
    return this.config.get('DLAB_AUTO_PROVISION_CAMPUSES', { infer: true }) === true;
  }

  async provision(tx: Prisma.TransactionClient, campus: DlabCampus, requestId?: string) {
    if (!this.enabled || campusProvisioningPlan(campus).action !== 'create') return { campus, created: false };
    const slug = dlabCampusSlug(campus.externalCampusId);
    // Slugs also address retired URLs and are effectively global in Studio.
    if (await tx.academy.findFirst({ where: { slug }, select: { id: true } })
      || await tx.academySlugHistory.findUnique({ where: { slug }, select: { academyId: true } })) {
      throw new DlabError('campus_academy_slug_conflict', 409);
    }
    const organization = await resolvePlatformOrganization(tx, this.config.get('PLATFORM_ORGANIZATION_SLUG', { infer: true }) ?? 'cove');
    const academy = await tx.academy.create({ data: {
      organizationId: organization.id, name: campus.name, slug, kind: 'ACADEMY', status: 'ACTIVE', timeZone: 'Asia/Seoul',
    } });
    await tx.academyFeatureFlag.createMany({ data: academyFeatureNames
      .filter(feature => !academyRolloutFeatures.has(feature))
      .map(feature => ({ academyId: academy.id, feature, isEnabled: true })) });
    const mapped = await tx.dlabCampus.update({ where: { externalCampusId: campus.externalCampusId }, data: {
      academyId: academy.id, mappedAt: new Date(), ssoEnabled: true, ssoEnabledAt: new Date(), accessRevision: { increment: 1 },
    } });
    await tx.dlabIntegrationEvent.create({ data: {
      requestId, action: 'campus.provisioned', details: { externalCampusId: campus.externalCampusId, academyId: academy.id, slug },
    } });
    return { campus: mapped, created: true };
  }
}

/** A campus mapping/status change invalidates old grants before reconciliation. */
export async function reconcileDlabCampus(tx: Prisma.TransactionClient, reconciler: DlabReconcilerService, externalCampusId: string) {
  const identities = await tx.dlabIdentity.findMany({ where: { OR: [
    { externalCampusId }, { externalCampusIds: { has: externalCampusId } }, { bindings: { some: { externalCampusId } } },
  ] }, orderBy: { externalUserId: 'asc' } });
  const changed: string[] = [];
  for (const identity of identities) {
    const updated = await tx.dlabIdentity.update({ where: { externalUserId: identity.externalUserId }, data: {
      generation: { increment: 1 }, revision: { increment: 1 },
    } });
    changed.push(...await reconciler.reconcile(tx, updated));
  }
  return changed;
}
