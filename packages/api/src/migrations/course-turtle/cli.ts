import 'dotenv/config';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import { conversionBlockers, conversionFingerprint, turtleConversionManifest, type TurtleConversionManifest } from './core.js';

type Database = Prisma.TransactionClient;
export async function inspectConversions(db: Database, manifest: TurtleConversionManifest) {
  const results = [];
  for (const entry of manifest.entries) {
    const row = await db.material.findUniqueOrThrow({ where: { id: entry.materialId }, include: {
      manualMaterial: true,
      programmingExercise: { include: { solutions: true, testCases: true } },
      lecture: { include: { courseModule: { include: { course: true } } } },
      drafts: { orderBy: { id: 'asc' } },
      submissions: { orderBy: { id: 'asc' }, select: {
        id: true, userId: true, classId: true, status: true, score: true,
        appliedScoreHundredths: true, gradingRevision: true, gradingMode: true,
        createdAt: true, gradedAt: true,
      } },
      _count: { select: { submissions: true, progress: true, solveSessions: true, teacherFeedback: true, staffPracticeAttempts: true, staffPracticeDrafts: true } },
    } });
    const pending = await db.submission.count({ where: { materialId: row.id, status: { in: ['QUEUED', 'RUNNING'] } } });
    const blockers = conversionBlockers(entry, row, manifest.academyId, pending);
    const assets = [...entry.config.assets, ...entry.config.solutionAssets];
    for (const asset of assets) {
      const stored = await db.manualAsset.findFirst({ where: { id: asset.assetId, academyId: manifest.academyId, courseId: entry.courseId } });
      if (!stored || stored.name !== asset.name) blockers.push(`Unverified asset mapping: ${asset.name}`);
    }
    results.push({ entry, row, blockers });
  }
  return results;
}

async function requireActor(db: Database, academyId: string, actorUserId: string) {
  const actor = await db.academyMembership.findFirst({ where: { academyId, userId: actorUserId, status: 'ACTIVE', role: { in: ['MANAGER', 'TEAM_LEAD'] } } });
  if (!actor) throw new Error('An active academy manager or team leader must own this operation');
}

export async function applyConversions(db: Database, manifest: TurtleConversionManifest, expectedFingerprint: string, actorUserId: string) {
  // Lock all material rows in a consistent order. A concurrent editor or
  // submission cannot silently change a reviewed plan mid-conversion.
  for (const id of manifest.entries.map(entry => entry.materialId).sort())
    await db.$queryRaw`SELECT id FROM materials WHERE id = ${id}::uuid FOR UPDATE`;
  const plan = await inspectConversions(db, manifest);
  if (conversionFingerprint({ manifest, plan }) !== expectedFingerprint) throw new Error('Dry-run changed; inspect and review again');
  if (plan.some(item => item.blockers.length)) throw new Error('Conversion has blockers');
  await requireActor(db, manifest.academyId, actorUserId);
  for (const { entry, row } of plan) {
    const { multipleChoice: _choice, shortAnswer: _short, solutionFiles, ...config } = entry.config;
    await db.manualMaterial.create({ data: { materialId: row.id, ...config,
      solutionFiles: solutionFiles ?? Prisma.DbNull, runtimeVersion: manifest.runtimeVersion } });
    for (const draft of row.drafts) await db.manualDraft.create({ data: {
      materialId: row.id, userId: draft.userId,
      files: { ...entry.config.files, [entry.config.entryPoint]: draft.code },
    } });
    await db.material.update({ where: { id: row.id }, data: { type: 'TURTLE_EXERCISE', isRequired: entry.assessment.includeInScore } });
    await db.auditLog.create({ data: { actorUserId, academyId: manifest.academyId,
      action: 'content.turtle.converted', targetType: 'Material', targetId: row.id,
      before: { type: row.type, isRequired: row.isRequired, history: row._count },
      after: { fingerprint: expectedFingerprint, sourceReference: entry.sourceReference, runtimeVersion: manifest.runtimeVersion, assessment: entry.assessment }, reason: entry.reason } });
  }
  for (const id of new Set(manifest.entries.map(entry => entry.courseId)))
    await db.course.update({ where: { id }, data: { contentRevision: { increment: 1 } } });
  return plan.length;
}

export async function rollbackConversions(db: Database, manifest: TurtleConversionManifest,
  original: Awaited<ReturnType<typeof inspectConversions>>, fingerprint: string, actorUserId: string) {
  if (conversionFingerprint({ manifest, plan: original }) !== fingerprint) throw new Error('Rollback artifact fingerprint mismatch');
  await requireActor(db, manifest.academyId, actorUserId);
  for (const { row, entry } of [...original].sort((a, b) => a.row.id.localeCompare(b.row.id))) {
    await db.$queryRaw`SELECT id FROM materials WHERE id = ${row.id}::uuid FOR UPDATE`;
    const current = await db.material.findUniqueOrThrow({ where: { id: row.id }, include: {
      manualMaterial: true, manualDrafts: true, programmingExercise: true,
      _count: { select: { manualSubmissions: true, staffPracticeAttempts: true } },
    } });
    const audit = await db.auditLog.findFirst({ where: { targetId: row.id, academyId: manifest.academyId, action: 'content.turtle.converted' }, orderBy: { createdAt: 'desc' } });
    if ((audit?.after as { fingerprint?: string } | null)?.fingerprint !== fingerprint || current.type !== 'TURTLE_EXERCISE' ||
      current.manualMaterial?.revision !== 1 || current._count.manualSubmissions || current._count.staffPracticeAttempts !== row._count.staffPracticeAttempts ||
      current.manualDrafts.length !== row.drafts.length || current.programmingExercise?.externalKey !== entry.externalKey)
      throw new Error('Rollback refused: converted content or assessment history changed');
    for (const draft of current.manualDrafts) {
      const legacy = row.drafts.find(item => item.userId === draft.userId);
      if (!legacy || draft.revision !== 1 || conversionFingerprint(draft.files) !== conversionFingerprint({ ...entry.config.files, [entry.config.entryPoint]: legacy.code }))
        throw new Error('Rollback refused: new learner work must be retained');
    }
    await db.manualDraft.deleteMany({ where: { materialId: row.id } });
    await db.manualMaterial.delete({ where: { materialId: row.id } });
    await db.material.update({ where: { id: row.id }, data: { type: 'PROGRAMMING_EXERCISE', isRequired: row.isRequired } });
    await db.auditLog.create({ data: { actorUserId, academyId: manifest.academyId, action: 'content.turtle.conversion_rolled_back', targetType: 'Material', targetId: row.id, after: { fingerprint }, reason: 'Reviewed conversion rollback before new work or grading.' } });
  }
  for (const id of new Set(manifest.entries.map(entry => entry.courseId))) await db.course.update({ where: { id }, data: { contentRevision: { increment: 1 } } });
  return original.length;
}

async function main() {
  const args = new Map(process.argv.slice(2).filter(value => value !== '--').map(value => {
    const index = value.indexOf('='); if (index < 3 || !value.startsWith('--')) throw new Error('Use --name=value arguments');
    return [value.slice(2, index), value.slice(index + 1)];
  }));
  const allowed = ['mode', 'manifest', 'plan', 'report', 'fingerprint', 'actor', 'backup-reference', 'confirm-academy'];
  if ([...args.keys()].some(key => !allowed.includes(key))) throw new Error('Unknown argument');
  if (!['dry-run', 'apply', 'rollback'].includes(args.get('mode') ?? '') || !args.get('manifest') || !args.get('report')) throw new Error('Specify --mode=dry-run|apply|rollback --manifest=... --report=...');
  const manifest = turtleConversionManifest.parse(JSON.parse(await readFile(resolve(args.get('manifest')!), 'utf8')));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    if (args.get('mode') === 'rollback') {
      if (!args.get('plan') || !args.get('fingerprint') || !args.get('actor') || !args.get('backup-reference') || args.get('confirm-academy') !== manifest.academyId) throw new Error('Rollback requires original plan, fingerprint, actor, backup reference and academy confirmation');
      const original = JSON.parse(await readFile(resolve(args.get('plan')!), 'utf8'));
      if (conversionFingerprint(original.manifest) !== conversionFingerprint(manifest)) throw new Error('Original manifest mismatch');
      const count = await db.$transaction(tx => rollbackConversions(tx, manifest, original.plan, args.get('fingerprint')!, args.get('actor')!), { isolationLevel: 'Serializable', timeout: 60000 });
      await writeFile(resolve(args.get('report')!), JSON.stringify({ rolledBack: count, fingerprint: args.get('fingerprint') }) + '\n', { mode: 0o600, flag: 'wx' });
      console.log(JSON.stringify({ rolledBack: count })); return;
    }
    const plan = await db.$transaction(tx => inspectConversions(tx, manifest), { isolationLevel: 'RepeatableRead' });
    const fingerprint = conversionFingerprint({ manifest, plan });
    // The private artifact contains source/drafts for review and rollback.
    // Never print learner code, IDs, credentials or asset data into CI logs.
    const report = resolve(args.get('report')!);
    await writeFile(report, JSON.stringify({ fingerprint, manifest, plan }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await chmod(report, 0o600);
    if (args.get('mode') === 'apply') {
      if (args.get('fingerprint') !== fingerprint || !args.get('actor') || !args.get('backup-reference') || args.get('confirm-academy') !== manifest.academyId) throw new Error('Apply requires reviewed fingerprint, actor, backup reference and exact academy confirmation');
      const result = await db.$transaction(tx => applyConversions(tx, manifest, fingerprint, args.get('actor')!), { isolationLevel: 'Serializable', timeout: 60000 });
      console.log(JSON.stringify({ converted: result, fingerprint }));
    } else console.log(JSON.stringify({ materials: plan.length, blocked: plan.filter(item => item.blockers.length).length, fingerprint }));
  } finally { await db.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch(error => { console.error(error.message); process.exitCode = 1; });
