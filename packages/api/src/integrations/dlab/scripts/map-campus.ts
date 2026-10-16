import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

// Explicit verified IDs only; no names, passwords, or automatic academy creation.
const [externalCampusId, academyId, actorId, flag] = process.argv.slice(2);
if (!externalCampusId || !academyId || !actorId || (flag && flag !== '--apply')) throw new Error('Usage: dlab:map-campus <external-campus-id> <academy-uuid> <operator-user-uuid> [--apply]');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
try {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`campus:${externalCampusId}`}, 0))::text`;
    const campus = await tx.dlabCampus.findUniqueOrThrow({ where: { externalCampusId } });
    const academy = await tx.academy.findUniqueOrThrow({ where: { id: academyId } });
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    if (academy.kind !== 'ACADEMY' || academy.status !== 'ACTIVE' || campus.status !== 'active' || actor.platformRole !== 'ADMIN' || actor.status !== 'ACTIVE') throw new Error('An active campus, academy, and platform operator are required');
    if (campus.academyId && campus.academyId !== academyId) throw new Error('Existing campus mapping cannot be silently reassigned');
    const occupied = await tx.dlabCampus.findFirst({ where: { academyId, externalCampusId: { not: externalCampusId } } });
    if (occupied) throw new Error('Academy already mapped to another campus');
    console.log(JSON.stringify({ mode: flag === '--apply' ? 'apply' : 'dry-run', externalCampusId, academyId, academySlug: academy.slug, actorId }));
    if (flag === '--apply') await tx.dlabCampus.update({ where: { externalCampusId }, data: { academyId, mappedByUserId: actorId, mappedAt: new Date() } });
  });
} finally { await prisma.$disconnect(); }
