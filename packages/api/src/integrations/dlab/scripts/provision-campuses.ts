import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../database/prisma.service.js';
import type { ApiEnvironment } from '../../../config/env.schema.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { campusProvisioningPlan, DlabCampusProvisioner, reconcileDlabCampus } from '../dlab-campus-provisioner.js';
import { DlabReconcilerService } from '../dlab-reconciler.service.js';
import { dlabTransaction, sourceWrite } from '../dlab-transaction.js';

if (!process.env.DATABASE_URL) throw new Error('Export DATABASE_URL explicitly (or invoke node --env-file) before running DLAB operator commands');
const databaseTarget = new URL(process.env.DATABASE_URL);
const [actorId, ...options] = process.argv.slice(2);
if (!actorId || options.length > 1 || options.some(value => value !== '--apply')) throw new Error('Usage: provision-campuses <platform-operator-id> [--apply]');
const apply = options[0] === '--apply';
const rolloutMode = process.env.DLAB_SSO_ROLLOUT_MODE ?? 'allowlist';
if (!['allowlist', 'campus'].includes(rolloutMode)) throw new Error('Invalid DLAB_SSO_ROLLOUT_MODE');
const config = new ConfigService({ ...process.env,
  DLAB_AUTO_PROVISION_CAMPUSES: process.env.DLAB_AUTO_PROVISION_CAMPUSES === 'true',
  DLAB_SSO_ROLLOUT_MODE: rolloutMode,
  DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: (process.env.DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
}) as unknown as ConfigService<ApiEnvironment, true>;
const provisioner = new DlabCampusProvisioner(config);
if (!provisioner.enabled) throw new Error('DLAB_AUTO_PROVISION_CAMPUSES must be true');
const redisUrl = process.env.MONITORING_REDIS_URL ?? process.env.REDIS_URL;
if (apply && !redisUrl) throw new Error('Applying DLAB campus provisioning requires Redis');
const prisma = new PrismaService(config), reconciler = new DlabReconcilerService(config);
const redis = apply ? new Redis(redisUrl!, { maxRetriesPerRequest: 2 }) : null;
async function requireActor(tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
  if (actor.status !== 'ACTIVE' || actor.platformRole !== 'ADMIN') throw new Error('An active Cove platform operator is required');
}
try {
  if (redis) await redis.ping();
  const plan = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await requireActor(tx);
    const campuses = await tx.dlabCampus.findMany({ orderBy: { externalCampusId: 'asc' } });
    return Promise.all(campuses.map(async campus => {
      const entry = campusProvisioningPlan(campus);
      const slugConflict = entry.slug ? !!(await tx.academy.findFirst({ where: { slug: entry.slug }, select: { id: true } })
        || await tx.academySlugHistory.findUnique({ where: { slug: entry.slug }, select: { academyId: true } })) : false;
      return { ...entry, slugConflict };
    }));
  }, { timeout: 20_000 });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', databaseHost: databaseTarget.hostname, databaseName: databaseTarget.pathname, rolloutMode, plan }));
  if (apply) {
    if (plan.some(entry => entry.slugConflict)) throw new Error('Resolve campus slug conflicts before applying');
    for (const entry of plan.filter(value => value.action === 'create')) {
      const result = await dlabTransaction(prisma, async tx => {
        await requireActor(tx);
        await sourceWrite(tx);
        const campus = await tx.dlabCampus.findUniqueOrThrow({ where: { externalCampusId: entry.externalCampusId } });
        const result = await provisioner.provision(tx, campus);
        if (result.created) {
          const changed = await reconcileDlabCampus(tx, reconciler, campus.externalCampusId);
          await tx.auditLog.create({ data: {
            actorUserId: actorId, academyId: result.campus.academyId, action: 'dlab.provision-campus',
            targetType: 'DlabIntegration', targetId: campus.externalCampusId,
            after: { academyId: result.campus.academyId, affectedMemberships: changed.length },
          } });
        }
        return { externalCampusId: campus.externalCampusId, academyId: result.campus.academyId, created: result.created };
      });
      if (result.created) await redis!.publish('cove:dlab:changed', 'recheck');
      console.log(JSON.stringify(result));
    }
  }
} finally { await redis?.quit(); await prisma.$disconnect(); }
