import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../database/prisma.service.js';
import type { ApiEnvironment } from '../../../config/env.schema.js';
import { DlabReconcilerService } from '../dlab-reconciler.service.js';
import { dlabTransaction, sourceWrite } from '../dlab-transaction.js';

if (!process.env.DATABASE_URL) throw new Error('Export DATABASE_URL explicitly (or invoke node --env-file) before running DLAB operator commands');
const databaseTarget = new URL(process.env.DATABASE_URL);
const [command, ...args] = process.argv.slice(2);
const apply = args.at(-1) === '--apply';
if (apply) args.pop();
if (!['map', 'access', 'invalidate'].includes(command ?? '') || (command === 'invalidate' ? args.length !== 1 : args.length !== 3)) throw new Error('Usage: operator <map|access> <external-campus-id> <academy-id|enabled|disabled> <operator-id> [--apply]; operator invalidate <operator-id> [--apply]');
const rolloutMode = process.env.DLAB_SSO_ROLLOUT_MODE ?? 'allowlist';
if (!['allowlist', 'campus'].includes(rolloutMode)) throw new Error('Invalid DLAB_SSO_ROLLOUT_MODE');
const config = new ConfigService({ ...process.env, DLAB_SSO_ROLLOUT_MODE: rolloutMode, DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: (process.env.DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean) }) as unknown as ConfigService<ApiEnvironment, true>;
const prisma = new PrismaService(config);
const reconciler = new DlabReconcilerService(config);
const redisUrl = process.env.MONITORING_REDIS_URL ?? process.env.REDIS_URL;
if (apply && !redisUrl) throw new Error('Applying DLAB access changes requires Redis');
const redis = apply ? new Redis(redisUrl!, { maxRetriesPerRequest: 2 }) : null;
try {
  if (redis) await redis.ping();
  const summary = await dlabTransaction(prisma, async tx => {
    await sourceWrite(tx);
    const actorId = command === 'invalidate' ? args[0]! : args[2]!;
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    if (actor.status !== 'ACTIVE' || actor.platformRole !== 'ADMIN') throw new Error('An active Cove platform operator is required');
    const campus = command === 'invalidate' ? null : await tx.dlabCampus.findUniqueOrThrow({ where: { externalCampusId: args[0]! }, include: { academy: true } });
    if (command === 'map') {
      const academy = await tx.academy.findUniqueOrThrow({ where: { id: args[1]! } });
      if (academy.status !== 'ACTIVE' || academy.kind !== 'ACADEMY' || campus!.status !== 'active') throw new Error('An active campus and academy are required');
      if (campus!.academyId && campus!.academyId !== academy.id) throw new Error('Existing campus mapping cannot be reassigned');
      if (await tx.dlabCampus.findFirst({ where: { academyId: academy.id, externalCampusId: { not: campus!.externalCampusId } } })) throw new Error('Academy is already mapped');
      if (apply) await tx.dlabCampus.update({ where: { externalCampusId: campus!.externalCampusId }, data: { academyId: academy.id, mappedByUserId: actorId, mappedAt: new Date(), accessRevision: { increment: 1 } } });
    } else if (command === 'access') {
      if (!['enabled', 'disabled'].includes(args[1]!)) throw new Error('Access must be enabled or disabled');
      const enabled = args[1] === 'enabled';
      if (enabled && (campus!.status !== 'active' || campus!.academy?.status !== 'ACTIVE' || campus!.academy.kind !== 'ACADEMY')) throw new Error('Enabling requires an active mapped academy');
      if (apply) await tx.dlabCampus.update({ where: { externalCampusId: campus!.externalCampusId }, data: { ssoEnabled: enabled, ssoEnabledByUserId: actorId, ssoEnabledAt: new Date(), accessRevision: { increment: 1 } } });
    }
    const identities = await tx.dlabIdentity.findMany({ where: campus ? { OR: [{ externalCampusId: campus.externalCampusId }, { externalCampusIds: { has: campus.externalCampusId } }, { bindings: { some: { externalCampusId: campus.externalCampusId } } }] } : {}, orderBy: { externalUserId: 'asc' } });
    if (apply) {
      for (const identity of identities) {
        const current = await tx.dlabIdentity.update({ where: { externalUserId: identity.externalUserId }, data: { generation: { increment: 1 }, revision: { increment: 1 } } });
        await reconciler.reconcile(tx, current);
      }
      await tx.auditLog.create({ data: { actorUserId: actorId, academyId: campus?.academyId, action: `dlab.${command}`, targetType: 'DlabIntegration', targetId: campus?.externalCampusId ?? 'all-managed-sessions', after: { command, target: args[1] ?? null, affectedIdentities: identities.length } } });
    }
    return { mode: apply ? 'apply' : 'dry-run', command, rolloutMode, databaseHost: databaseTarget.hostname, databaseName: databaseTarget.pathname, externalCampusId: campus?.externalCampusId ?? null, target: args[1] ?? null, affectedIdentities: identities.length };
  });
  // Subscribers disconnect token-bound sockets; the periodic check is the backstop.
  if (redis) await redis.publish('cove:dlab:changed', 'recheck');
  console.log(JSON.stringify(summary));
} finally { await redis?.quit(); await prisma.$disconnect(); }
