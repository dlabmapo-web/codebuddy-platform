import { admitRuntime } from './runtime-admission.js';
import { PracticeRunner } from './practice.runner.js';
import { RegradeRunner } from './regrade.runner.js';
import { createPracticeAttempt } from '../learn/staff-practice.repository.js';
import { practiceSnapshotSchema } from './practice-snapshot.js';
import { SampleCheckRunner } from './sample-check.runner.js';
import { SampleCheckStore, type SampleCheckRecord } from './sample-check.store.js';
import { ExecutionCapacity } from './execution-capacity.js';
import { gradingSnapshotFor, exerciseProfileColumns } from './grading-profile.js';
import { defaultEliceGradingProfile, legacyCaseGrading } from '@cove/shared';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Broker, BrokerClient, Journal, serve, type GuestDriver, type ClientRequest } from '@cove/grading-runtime';
import { compatibilityFixture, nativeFixture, manifestFixture } from '../../../shared/src/testing/grading-runtime-fixtures.js';
import { PrismaService } from '../database/prisma.service.js';
import { PointAwardService } from '../points/point-award.service.js';
import { RuntimeCoordinator } from './runtime-coordinator.js';
import { GradingService, type CaseRow } from './grading.service.js';
import { JudgeQueue } from './judge.queue.js';
import { DispatchIntentService } from './dispatch-intent.js';
import { SampleExecution } from './sample-execution.js';
import { RuntimeReadinessPublisher, assertRuntimeReady, readinessKey } from './runtime-readiness.js';
import { startJudgeMonitor } from './judge-monitor.js';
import { ExecutionTelemetry } from './execution-telemetry.js';
import { Logger } from '@nestjs/common';
import { StaffPracticeService } from '../learn/staff-practice.service.js';
import type { ExecutionSession } from './execution-lease.js';

const databaseUrl = process.env.COVE_NATIVE_TEST_DATABASE_URL;
const redisUrl = process.env.COVE_NATIVE_TEST_REDIS_URL;
function guarded(value: string | undefined, protocol: string, database?: string) {
  const url = new URL(value ?? '');
  if (url.protocol !== protocol || url.hostname !== '127.0.0.1' || (database && url.pathname !== `/${database}`) || process.env.DOTENV_CONFIG_PATH !== '/dev/null') throw new Error('Explicit owned loopback fixture required');
  return url.toString();
}
/** Real migrated PostgreSQL, Redis/BullMQ and Unix protocol/journal; deterministic guest driver, not isolation proof. */
describe.skipIf(!databaseUrl || !redisUrl)('native grading durable application integration', () => {
  let db: PrismaService, redis: Redis, queue: JudgeQueue, broker: Broker, client: BrokerClient;
  let server: Awaited<ReturnType<typeof serve>>, directory: string;
  let workerGeneration = randomUUID();
  const org = randomUUID(), academy = randomUUID(), user = randomUUID(), course = randomUUID(), module = randomUUID(), lecture = randomUUID();
  let executed = 0, removalFault = false;
  const guests = new Set<string>();
  const driver: GuestDriver = {
    verify: async () => undefined, discover: async () => [...guests],
    create: async allocation => { guests.add(allocation.id); }, ready: async () => undefined,
    execute: async () => { executed++; return { stdout: 'ok\n', stderr: '', outcome: 'PASSED', runtimeMs: 1.25, outputTruncated: false }; },
    remove: async id => { if (removalFault) throw new Error('injected cleanup failure'); guests.delete(id); },
  };
  const comparator = { version: 'pyodide-0.27.5', compare: async () => ({ kind: 'match' as const }) };
  const unused = { version: 'unused', run: async () => { throw new Error('Unbound execution'); }, dispose: async () => undefined };
  const coordinator = (transport = client) => new RuntimeCoordinator(db, transport, workerGeneration, manifestFixture);
  const grader = (runtime: RuntimeCoordinator) => new GradingService(db, unused, new PointAwardService(db), comparator, undefined, runtime);
  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ DATABASE_URL: guarded(databaseUrl, 'postgresql:', 'cove_native_test') }));
    redis = new Redis(guarded(redisUrl, 'redis:')); queue = new JudgeQueue(redisUrl!);
    directory = await mkdtemp(join(tmpdir(), 'cove-app-broker-'));
    broker = new Broker(manifestFixture, driver, new Journal(directory), workerGeneration, [{ runtime: nativeFixture, memoryLimitMb: 128, targetReady: 1 }]);
    await broker.start(); server = await serve(join(directory, 'broker.sock'), request => broker.handle(request));
    client = new BrokerClient(join(directory, 'broker.sock'));
    await db.organization.create({ data: { id: org, name: 'Isolated native fixture', slug: `native-${org}` } });
    await db.academy.create({ data: { id: academy, organizationId: org, name: 'Fixture', slug: `native-${academy}`, status: 'ACTIVE' } });
    await db.user.create({ data: { id: user, username: `n${user.slice(0, 7)}`, status: 'ACTIVE' } });
    await db.course.create({ data: { id: course, academyId: academy, createdByUserId: user, title: 'Fixture' } });
    await db.courseModule.create({ data: { id: module, courseId: course, title: 'Fixture', externalKey: 'native', position: 1 } });
    await db.lecture.create({ data: { id: lecture, courseModuleId: module, title: 'Fixture', externalKey: 'native', position: 1 } });
  }, 30_000);
  afterAll(async () => {
    await queue?.close(); await redis?.quit(); await db?.$disconnect();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await broker?.stop(); if (directory) await rm(directory, { recursive: true, force: true });
  });
  async function attempt(count = 2, runtime: import('@cove/shared').RuntimeDescriptor = nativeFixture, reuseMaterialId?: string) {
    const material = reuseMaterialId ? { id: reuseMaterialId } : await db.material.create({ data: { lectureId: lecture, title: 'Fixture', type: 'PROGRAMMING_EXERCISE', position: (await db.material.count()) + 1,
      programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY', starterCode: '', memoryLimitMb: 128, timeLimitMs: 1000 } } } });
    return db.submission.create({ data: {
      userId: user, materialId: material.id, sourceMaterialId: material.id, courseId: course, gradingRevision: 1, language: 'PYTHON',
      timeLimitMs: 1000, memoryLimitMb: 128, code: 'print("ok")', totalCount: count,
      engineVersion: `${runtime.engine}-${runtime.engineVersion}`, executionRuntimeSnapshot: runtime,
      problemTitle: 'Fixture', courseTitle: 'Fixture', moduleTitle: 'Fixture', lectureTitle: 'Fixture', modulePosition: 1, lecturePosition: 1, problemPosition: 1,
      gradingCases: { create: Array.from({ length: count }, (_, i) => ({ position: i + 1, input: '', expectedOutput: 'ok', isSample: i === 0 })) },
      dispatchIntent: { create: {} },
    }, include: { gradingCases: { orderBy: { position: 'asc' } } } });
  }
  const row = (position: number): CaseRow => ({ position, isSample: position === 1, outcome: 'PASSED', runtimeMs: 2, actualOutput: position === 1 ? 'ok\n' : null, awardedWeight: null, executionState: 'EXECUTED' });
  async function runCase(session: ExecutionSession, position: number) {
    return session.executionEngine().run({ casePosition: position, code: 'print("ok")', stdin: '', timeLimitMs: 1000, memoryLimitMb: 128 });
  }
  it('retains terminal and expired public sample private authority in real inventory and every drain check until confirmed retirement', async () => {
    const manifestPath = join(directory, 'private-inventory-manifest.json'); await writeFile(manifestPath, JSON.stringify(manifestFixture));
    await redis.del(readinessKey(manifestFixture, workerGeneration));
    const command = () => promisify(execFile)(process.execPath, ['scripts/grading-inventory.mjs'], { cwd: process.cwd(), env: {
      PATH: process.env.PATH, HOME: process.env.HOME, DOTENV_CONFIG_PATH: '/dev/null', DATABASE_URL: databaseUrl, REDIS_URL: redisUrl,
      GRADING_RUNTIME_MANIFEST_PATH: manifestPath, GRADING_WORKER_GENERATION: workerGeneration,
    } });
    const drain = (inventory: unknown) => promisify(execFile)('python3', ['-c',
      "import sys,json,time;sys.path.insert(0,'../../deploy/scripts/grading');from control import drained;from retained import fresh_inventory;v=json.loads(sys.argv[1]);drained(v);fresh_inventory(v,int(time.time()))", JSON.stringify(inventory)], { cwd: process.cwd() });
    const control = coordinator(), samples = new SampleExecution(async () => redis, control);
    const id = randomUUID(), key = `cove:grading:sample-lease:${id}`;
    const beforeExecution = executed;
    const session = await samples.begin(id, nativeFixture, 128);
    await session.engine.reserve();
    await session.engine.run({ casePosition: 1, code: 'print("ok")', stdin: '', timeLimitMs: 1000, memoryLimitMb: 128 });
    session.abandon(); // simulate worker death after public completion, before private retirement
    const raw = (await redis.get(key))!;
    expect(JSON.parse(raw).sourceReleased).toBe(true);
    try {
      for (const publicState of ['terminal', 'expired']) {
        if (publicState === 'terminal') await redis.set(`cove:sample-check:${id}`, JSON.stringify({ status: 'COMPLETED' }));
        else {
          await redis.set(`cove:sample-check:${id}`, JSON.stringify({ status: 'COMPLETED' }), 'PX', 1);
          await new Promise(resolve => setTimeout(resolve, 10));
          expect(await redis.get(`cove:sample-check:${id}`)).toBeNull();
        }
        const inventory = JSON.parse((await command()).stdout);
        expect(inventory).toMatchObject({ complete: true, pending: 0, recoverable: 1, ephemeralPending: 0, admissionFence: { readinessAbsent: true } });
        expect(Object.values(inventory.queueBacklog).every(value => value === 0)).toBe(true);
        expect(await db.gradingExecutionLease.count({ where: { retiredAt: null } })).toBe(0);
        expect(inventory.references).toContainEqual(nativeFixture);
        expect(JSON.stringify(inventory)).not.toContain(id);
        expect(JSON.stringify(inventory)).not.toContain(JSON.parse(raw).lease.leaseToken);
        // Exercise each production drain consumer independently (the first must not mask the second).
        await expect(drain(inventory)).rejects.toThrow();
        const retainedOnly = { ...inventory, pending: 0 };
        await expect(promisify(execFile)('python3', ['-c', "import sys,json,time;sys.path.insert(0,'../../deploy/scripts/grading');from retained import fresh_inventory;fresh_inventory(json.loads(sys.argv[1]),int(time.time()))", JSON.stringify(retainedOnly)])).rejects.toThrow();
      }
      for (const broken of [null, '{}', '{', 'x'.repeat(16385), '{private-source-' + id + '-' + JSON.parse(raw).lease.leaseToken, JSON.stringify({ ...JSON.parse(raw), lease: { ...JSON.parse(raw).lease, attemptId: randomUUID() } }), JSON.stringify({ ...JSON.parse(raw), lease: { ...JSON.parse(raw).lease, runtime: { engine: 'cpython' } } })]) {
        if (broken === null) await redis.del(key); else await redis.set(key, broken);
        await expect(command()).rejects.toMatchObject({ stdout: '', stderr: 'Read-only grading inventory failed; no complete evidence produced.\n' });
      }
      await redis.set(key, raw);
      const excess = Array.from({ length: 512 }, () => randomUUID());
      await redis.sadd('cove:grading:sample-leases', ...excess);
      try { await expect(command()).rejects.toMatchObject({ stdout: '', stderr: 'Read-only grading inventory failed; no complete evidence produced.\n' }); }
      finally { await redis.srem('cove:grading:sample-leases', ...excess); }
      // The actual reconciliation confirms broker cancellation/removal before deleting private authority.
      await samples.reconcile();
      expect(await redis.scard('cove:grading:sample-leases')).toBe(0);
      expect(await redis.get(key)).toBeNull();
      expect(executed - beforeExecution).toBe(1);
      const retired = JSON.parse((await command()).stdout);
      expect(retired.recoverable).toBe(0);
      await drain(retired);
      console.log(JSON.stringify({ evidence: 'private-sample-inventory', publicStates: ['terminal', 'expired'], recoverableBeforeRetirement: 1, recoverableAfterRetirement: retired.recoverable, sourceExecutions: executed - beforeExecution, malformedAndMissingCases: 7, overBoundRejected: true }));
    } finally { await redis.del(key, `cove:sample-check:${id}`); await redis.srem('cove:grading:sample-leases', id); }
  });
  it('uses the actual fixture phase control for baseline, candidate and reverse future admissions without rewriting accepted rows', async () => {
    // Contract-only synthetic manifest/readiness on local owned PG/Redis, not native containment.
    const path = join(directory, 'phase-manifest.json');
    const seed = await attempt(1);
    const acceptedIds = [seed.id];
    const material = seed.materialId!;
    await db.submission.updateMany({ where: { materialId: material }, data: { status: 'PASSED' } });
    const context = { academyId: academy, materialId: material, gradingRevision: 1, context: 'live' as const, memoryLimitMb: 128, timeLimitMs: 1000 };
    const manifest = { ...manifestFixture, academyAllowances: [{ organizationId: org, academyId: academy }],
      certifications: [{ ...context, organizationId: org, runtime: nativeFixture, packageProfile: 'standard-library' }] };
    await writeFile(path, JSON.stringify(manifest));
    const config = new ConfigService({ GRADING_RUNTIME_MANIFEST_PATH: path, GRADING_NATIVE_ENABLED: false, GRADING_WORKER_GENERATION: workerGeneration });
    const heartbeat = new RuntimeReadinessPublisher(manifest as never, workerGeneration, async () => redis, async () => ({
      brokerGeneration: randomUUID(), workerGeneration, capabilities: manifest.capabilities,
    }));
    const modulePath = '../../scripts/native-grading-e2e-phase.mjs';
    const { transitionFixturePhase } = await import(modulePath);
    const clear = vi.fn(async () => undefined);
    const transition = (phase: string) => transitionFixturePhase(phase, { allowed: true, db, redis, timings: { clear }, configurations: [config] });
    const accept = async () => {
      await heartbeat.poll(true);
      const runtime = (await admitRuntime(config, db, context, async () => redis))!;
      const saved = await attempt(1, runtime, material);
      acceptedIds.push(saved.id);
      await db.submission.update({ where: { id: saved.id }, data: { status: 'PASSED' } });
      return saved;
    };
    try {
      expect((await transition('baseline')).status).toBe(200);
      const baseline = await accept();
      expect(baseline.executionRuntimeSnapshot).toEqual(compatibilityFixture);
      expect((await transition('candidate')).status).toBe(200);
      const candidate = await accept();
      expect(candidate.executionRuntimeSnapshot).toEqual(nativeFixture);
      expect((await transition('baseline')).status).toBe(200);
      const reversed = await accept();
      expect(reversed.executionRuntimeSnapshot).toEqual(compatibilityFixture);
      expect((await db.submission.findUniqueOrThrow({ where: { id: baseline.id } })).executionRuntimeSnapshot).toEqual(compatibilityFixture);
      expect((await db.submission.findUniqueOrThrow({ where: { id: candidate.id } })).executionRuntimeSnapshot).toEqual(nativeFixture);
      expect(clear).toHaveBeenCalledTimes(3);
      const pending = await attempt(1, compatibilityFixture, material);
      acceptedIds.push(pending.id);
      expect((await transition('candidate')).status).toBe(409);
      expect(config.get('GRADING_NATIVE_ENABLED')).toBe(false);
      await db.submission.update({ where: { id: pending.id }, data: { status: 'PASSED' } });
    } finally {
      await redis.del(readinessKey(manifest as never, workerGeneration));
      await db.submission.deleteMany({ where: { id: { in: acceptedIds } } });
    }
  });
  it('rolls back attempt and outbox together and retries a lost real Redis queue acknowledgement', async () => {
    const before = await db.gradingDispatchIntent.count();
    await expect(db.$transaction(async tx => { await tx.gradingDispatchIntent.create({ data: { submissionId: randomUUID() } }); })).rejects.toThrow();
    expect(await db.gradingDispatchIntent.count()).toBe(before);
    const item = await attempt(); let first = true;
    const dispatcher = new DispatchIntentService(db, { enqueue: async id => { await queue.enqueue(id); if (first) { first = false; throw new Error('lost reply'); } } } as JudgeQueue);
    await dispatcher.flush();
    expect((await db.gradingDispatchIntent.findUniqueOrThrow({ where: { submissionId: item.id } })).dispatchedAt).toBeNull();
    await db.gradingDispatchIntent.updateMany({ where: { submissionId: item.id }, data: { nextAttemptAt: new Date(0) } });
    await dispatcher.flush(); await dispatcher.flush();
    expect((await queue.queue.getJobs(['waiting'])).filter(job => job.id === item.id)).toHaveLength(1);
    expect((await db.gradingDispatchIntent.findUniqueOrThrow({ where: { submissionId: item.id } })).dispatchedAt).not.toBeNull();
  });
  it.each([nativeFixture, compatibilityFixture])('uses the frozen $engine descriptor and commits one result on duplicate delivery', async runtime => {
    const item = await attempt(2, runtime); const control = coordinator(); const before = executed;
    await grader(control).grade(item.id, async () => undefined); await control.reconcile();
    await grader(control).grade(item.id, async () => undefined);
    expect(await db.submission.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: 'PASSED', runtimeMs: 2 });
    expect(executed - before).toBe(2);
    expect(await db.gradingCaseCheckpoint.count({ where: { submissionId: item.id } })).toBe(2);
    expect(await db.studentExerciseProgress.findUnique({ where: { userId_materialId: { userId: user, materialId: item.materialId! } } })).toMatchObject({ attemptCount: 1 });
  });
  it.each(['receipt', 'checkpoint', 'all-checkpoints'] as const)('recovers after %s without re-executing known cases or resetting the deadline', async boundary => {
    const item = await attempt(); const original = coordinator(); const before = executed;
    const session = (await original.claim({ submissionId: item.id }, { runtime: nativeFixture, memoryLimitMb: 128, kind: 'submission' }))!;
    await runCase(session, 1);
    if (boundary !== 'receipt') await session.checkpoint(row(1), item.gradingCases[0]!);
    if (boundary === 'all-checkpoints') { await runCase(session, 2); await session.checkpoint(row(2), item.gradingCases[1]!); }
    const startedAt = (await db.submission.findUniqueOrThrow({ where: { id: item.id } })).startedAt;
    const restarted = coordinator(); await grader(restarted).grade(item.id, async () => undefined, true); await restarted.reconcile();
    const result = await db.submission.findUniqueOrThrow({ where: { id: item.id } });
    expect(result).toMatchObject({ status: 'PASSED', startedAt }); expect(executed - before).toBe(2);
    const history = await db.gradingExecutionLease.findMany({ where: { submissionId: item.id }, orderBy: { generation: 'asc' } });
    expect(history).toHaveLength(2); expect(history[0]!.workerGeneration).toBe(workerGeneration);
    expect(history.every(lease => lease.retiredAt && lease.terminalCommitId)).toBe(true);
    await expect(session.checkpoint(row(1), item.gradingCases[0]!)).rejects.toThrow(/STALE_OWNER/);
    await expect(db.gradingExecutionLease.update({ where: { id: history[0]!.id }, data: { workerGeneration: randomUUID() } })).rejects.toThrow(/immutable/);
  });
  it('recovers an original receipt across broker and worker incarnation changes before takeover', async () => {
    const item = await attempt(2); const first = coordinator(); const session = (await first.claim({ submissionId: item.id }, { runtime: nativeFixture, memoryLimitMb: 128, kind: 'submission' }))!;
    const before = executed; await runCase(session, 1);
    const originalBroker = session.lease.brokerGeneration, originalWorker = workerGeneration;
    await new Promise<void>(resolve => server.close(() => resolve())); await broker.stop();
    workerGeneration = randomUUID();
    broker = new Broker(manifestFixture, driver, new Journal(directory), workerGeneration, [{ runtime: nativeFixture, memoryLimitMb: 128, targetReady: 1 }]);
    await broker.start(); server = await serve(join(directory, 'broker.sock'), request => broker.handle(request));
    const restart = coordinator(); await restart.initialize(); await grader(restart).grade(item.id, async () => undefined, true); await restart.reconcile();
    expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('PASSED');
    const saved = await db.gradingExecutionLease.findUniqueOrThrow({ where: { id: session.lease.id } });
    expect(saved).toMatchObject({ brokerGeneration: originalBroker, workerGeneration: originalWorker });
    expect((await restart.health()).brokerGeneration).not.toBe(originalBroker);
    expect(executed - before).toBe(2);
  });
  it('runs the v4 weighted evaluator with its separate comparator and frozen descriptor', async () => {
    const item = await attempt(2); const control = coordinator();
    const snapshot = gradingSnapshotFor({ ...exerciseProfileColumns(defaultEliceGradingProfile), gradingSemanticVersion: 'elice-v1', timeLimitMs: 1000, memoryLimitMb: 128,
      testCases: item.gradingCases.map(test => ({ ...legacyCaseGrading, input: '', expectedOutput: 'ok', visibility: test.isSample ? 'SAMPLE' : 'HIDDEN', label: null })) }, { engineVersion: '0.27.5', descriptor: nativeFixture });
    await db.submission.update({ where: { id: item.id }, data: { ...snapshot.submission } });
    for (const test of snapshot.cases) await db.submissionGradingCase.updateMany({ where: { submissionId: item.id, position: test.position }, data: test });
    await grader(control).grade(item.id, async () => undefined); await control.reconcile();
    expect(await db.submission.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: 'PASSED', earnedWeight: 2, possibleWeight: 2 });
  });
  it('routes practice and maintenance through broker leases without duplicate accounting or practice student writes', async () => {
    const item = await attempt(2); const control = coordinator();
    const snapshot = practiceSnapshotSchema.parse({ ...item, version: 2, quizSnapshot: null });
    const practice = await createPracticeAttempt(db, { academyId: academy, userId: user, materialId: item.materialId!, requestId: randomUUID(), code: item.code, snapshot: JSON.parse(JSON.stringify(snapshot)) });
    const before = await db.studentExerciseProgress.count();
    const runner = new PracticeRunner(db, grader(control), control);
    await runner.run(practice.id); await control.reconcile(); await runner.run(practice.id);
    expect((await db.staffPracticeAttempt.findUniqueOrThrow({ where: { id: practice.id } })).status).toBe('PASSED');
    expect(await db.studentExerciseProgress.count()).toBe(before);
    expect(await db.gradingDispatchIntent.findUnique({ where: { staffPracticeAttemptId: practice.id } })).not.toBeNull();
    const run = await db.platformOperationRun.create({ data: { academyId: academy, actorUserId: user, targetType: 'material', targetId: item.materialId!, operation: 'REGRADE_STALE_SUBMISSIONS', status: 'RUNNING', plannedCount: 1, dispatchedCount: 1 } });
    await db.submission.update({ where: { id: item.id }, data: { regradeRunId: run.id } });
    const repair = new RegradeRunner(db, grader(control)); const job = { submissionId: item.id, runId: run.id, requestId: null };
    await repair.run(job); await control.reconcile(); await repair.run(job);
    expect(await db.platformOperationRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ completedCount: 1, failedCount: 0 });
    await queue.enqueueRegrade(job); await queue.enqueueRegrade(job);
    expect(await queue.regradeQueue.getJob(`regrade:${run.id}:${item.id}`)).not.toBeNull();
  });
  it('runs a versioned sample through the same evaluator and retains Redis-atomic dispatch recovery', async () => {
    const control = coordinator(), samples = new SampleExecution(async () => redis, control), store = new SampleCheckStore(async () => redis);
    const checkId = randomUUID();
    const record: SampleCheckRecord = { checkId, userId: user, academyId: academy, classId: randomUUID(), materialId: randomUUID(), position: 1,
      exerciseRevision: 1, codeHash: 'test', requestHash: 'test', clientRequestId: randomUUID(), status: 'QUEUED', acceptedAt: Date.now(), dispatchedAt: null, finishedAt: null,
      lostAfter: Date.now() + 60000, snapshot: { version: 2, executionRuntimeSnapshot: nativeFixture, gradingMode: 'LEGACY_STDIO', engineVersion: `cpython-${nativeFixture.engineVersion}`,
        code: 'print("ok")', memoryLimitMb: 128, totalTimeLimitMs: 60000, comparatorTimeLimitMs: 1, inputPromptPolicy: 'INCLUDE', gradingSemanticVersion: 'legacy-v1',
        testCase: { input: '', expectedOutput: 'ok', comparator: 'STDOUT', softTimeLimitMs: null, caseLimitMs: 1000 } },
      result: null, failure: null, timings: { queueMs: null, executionMs: null, comparisonMs: null } };
    expect(await store.admit(record, { academyOutstanding: 10, perMinute: 100 })).toEqual({ kind: 'accepted' });
    expect(await store.pendingDispatch()).toContain(checkId);
    await queue.enqueueSampleCheck(checkId); await queue.enqueueSampleCheck(checkId); await store.acknowledgeDispatch(checkId);
    await new SampleCheckRunner(store, unused, comparator, new ExecutionCapacity(2, true), samples).run(checkId);
    await samples.reconcile();
    expect(await store.get(checkId)).toMatchObject({ status: 'COMPLETED', result: { outcome: 'PASSED' } });
    expect(await samples.count()).toBe(0);
    // A live public record uses its original receipt and dispatched deadline after restart.
    const retryId = randomUUID(); const retry = { ...record, checkId: retryId, clientRequestId: randomUUID(), acceptedAt: Date.now() };
    await store.admit(retry, { academyOutstanding: 10, perMinute: 100 });
    await store.transition(retry, ['QUEUED'], { status: 'RUNNING', dispatchedAt: Date.now() });
    const interrupted = await samples.begin(retryId, nativeFixture, 128); await interrupted.engine.reserve();
    const before = executed; await interrupted.engine.run({ casePosition: 1, code: retry.snapshot.code, stdin: '', timeLimitMs: 1000, memoryLimitMb: 128 });
    interrupted.abandon();
    const restarted = new SampleExecution(async () => redis, coordinator());
    new SampleCheckRunner(store, unused, comparator, new ExecutionCapacity(2, true), restarted);
    await restarted.reconcile();
    expect(await store.get(retryId)).toMatchObject({ status: 'COMPLETED', result: { outcome: 'PASSED' } });
    expect(executed - before).toBe(1);
  });
  it('resolves historical null snapshots with raw Pyodide versions without inventing provenance', async () => {
    const item = await attempt(1, compatibilityFixture); const control = coordinator();
    await db.$executeRaw`UPDATE submissions SET execution_runtime_snapshot=NULL, engine_version='0.27.5' WHERE id=${item.id}::uuid`;
    await grader(control).grade(item.id, async () => undefined); await control.reconcile();
    expect(await db.submission.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: 'PASSED', executionRuntimeSnapshot: null });
    expect(control.registry.resolveHistoricalRuntime({ engineVersion: 'pyodide-0.27.5' })).toMatchObject({ provenance: 'unrecorded' });
    const unknown = await attempt(1); const before = executed;
    await db.$executeRaw`UPDATE submissions SET execution_runtime_snapshot=NULL, engine_version='99.0.0' WHERE id=${unknown.id}::uuid`;
    await grader(control).grade(unknown.id, async () => undefined);
    expect((await db.submission.findUniqueOrThrow({ where: { id: unknown.id } })).failureReason).toBe('RUNTIME_UNAVAILABLE');
    expect(executed).toBe(before);
  });
  it('does not route a recorded native legacy attempt through the no-manifest engine', async () => {
    const item = await attempt(1); const before = executed;
    await new GradingService(db, unused, new PointAwardService(db), comparator).grade(item.id, async () => undefined);
    expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).failureReason).toBe('RUNTIME_UNAVAILABLE');
    expect(executed).toBe(before);
  });
  it('recovers lost checkpoint acknowledgement using its original UUID before takeover', async () => {
    const item = await attempt(); let lost = 0;
    const transport = { request: async (request: ClientRequest) => { const response = await client.request(request); if (request.type === 'ack' && lost++ < 2) { throw new Error('lost ack'); } return response; } } as BrokerClient;
    const first = coordinator(transport); const session = (await first.claim({ submissionId: item.id }, { runtime: nativeFixture, memoryLimitMb: 128, kind: 'submission' }))!;
    const before = executed; await runCase(session, 1);
    await expect(session.checkpoint(row(1), item.gradingCases[0]!)).rejects.toThrow('lost ack');
    const checkpoint = await db.gradingCaseCheckpoint.findFirstOrThrow({ where: { submissionId: item.id } });
    const restart = coordinator(); await grader(restart).grade(item.id, async () => undefined, true); await restart.reconcile();
    expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('PASSED');
    expect(executed - before).toBe(2);
    expect((await db.gradingExecutionCase.findFirstOrThrow({ where: { leaseId: session.lease.id, position: 1 } })).checkpointId).toBe(checkpoint.id);
  });
  it('recovers lost reserve and retire replies using stable identities and terminal commit IDs', async () => {
    const item = await attempt(1); let reserveLost = false, retireLost = false;
    const transport = { request: async (request: ClientRequest) => {
      const response = await client.request(request);
      if (request.type === 'reserve' && !reserveLost) { reserveLost = true; throw new Error('lost reserve'); }
      if (request.type === 'retire' && !retireLost) { retireLost = true; throw new Error('lost retire'); }
      return response;
    } } as BrokerClient;
    const control = coordinator(transport); const before = executed;
    await grader(control).grade(item.id, async () => undefined);
    await control.reconcile().catch(() => undefined);
    const terminal = await db.gradingExecutionLease.findFirstOrThrow({ where: { submissionId: item.id } });
    expect(terminal.terminalCommitId).not.toBeNull();
    await control.reconcile();
    expect((await db.gradingExecutionLease.findUniqueOrThrow({ where: { id: terminal.id } })).terminalCommitId).toBe(terminal.terminalCommitId);
    expect(executed - before).toBe(1);
    expect(reserveLost && retireLost).toBe(true);
  });
  it('does not acknowledge an uncommitted grade and resumes all checkpoints after a failed final transaction', async () => {
    const item = await attempt(1); const control = coordinator(); const session = (await control.claim({ submissionId: item.id }, { runtime: nativeFixture, memoryLimitMb: 128, kind: 'submission' }))!;
    const before = executed; await runCase(session, 1); await session.checkpoint(row(1), item.gradingCases[0]!);
    await expect(db.$transaction(async tx => {
      await session.fence(tx); await session.terminal(tx);
      await tx.submission.update({ where: { id: item.id }, data: { status: 'PASSED' } });
      await tx.studentExerciseProgress.create({ data: { userId: user, materialId: item.materialId!, gradingRevision: 1, status: 'SOLVED', attemptCount: 1, bestPassed: 1, bestScore: 100 } });
      throw new Error('points/final transaction failure');
    })).rejects.toThrow('points/final transaction failure');
    expect((await db.gradingExecutionLease.findUniqueOrThrow({ where: { id: session.lease.id } })).terminalCommitId).toBeNull();
    expect(await db.studentExerciseProgress.count({ where: { materialId: item.materialId! } })).toBe(0);
    const restart = coordinator(); await grader(restart).grade(item.id, async () => undefined); await restart.reconcile();
    expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('PASSED');
    expect(executed - before).toBe(1);
  });
  it('terminates an expired recovery without resetting the original wall deadline or executing remaining cases', async () => {
    const item = await attempt(); const first = coordinator(); const session = (await first.claim({ submissionId: item.id }, { runtime: nativeFixture, memoryLimitMb: 128, kind: 'submission' }))!;
    await runCase(session, 1); await session.checkpoint(row(1), item.gradingCases[0]!);
    await db.submission.update({ where: { id: item.id }, data: { startedAt: new Date(0) } });
    const before = executed; const restart = coordinator();
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try { await grader(restart).grade(item.id, async () => undefined, true); expect(error).toHaveBeenCalledWith(expect.stringContaining('TOTAL_DEADLINE')); }
    finally { error.mockRestore(); }
    await restart.reconcile();
    expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('ERRORED');
    expect(executed).toBe(before);
    expect(await db.gradingCaseCheckpoint.count({ where: { submissionId: item.id } })).toBe(1);
  });
  it('returns the committed result without waiting for delayed terminal retirement', async () => {
    const item = await attempt(1); let release!: () => void; let reached!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const retiring = new Promise<void>(resolve => { reached = resolve; });
    const transport = { request: async (request: ClientRequest) => {
      if (request.type === 'retire') { reached(); await blocked; }
      return client.request(request);
    } } as BrokerClient;
    const control = coordinator(transport);
    await grader(control).grade(item.id, async () => undefined);
    await retiring;
    expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('PASSED');
    expect((await db.gradingExecutionLease.findFirstOrThrow({ where: { submissionId: item.id } })).retiredAt).toBeNull();
    release(); await control.reconcile();
    expect((await db.gradingExecutionLease.findFirstOrThrow({ where: { submissionId: item.id } })).retiredAt).not.toBeNull();
  });
  it('preserves public sample expiry authority and recovers after a Redis outage without replay', async () => {
    const control = coordinator(); const samples = new SampleExecution(async () => redis, control); const id = randomUUID();
    await redis.set(`cove:sample-check:${id}`, JSON.stringify({ status: 'RUNNING' }), 'PX', 1);
    const sample = await samples.begin(id, nativeFixture, 128); await sample.engine.reserve();
    const before = executed; await sample.engine.run({ casePosition: 1, code: '', stdin: '', timeLimitMs: 1000, memoryLimitMb: 128 });
    sample.abandon(); await redis.del(`cove:sample-check:${id}`);
    const unavailable = new Redis(redisUrl!, { lazyConnect: true, enableOfflineQueue: false });
    unavailable.disconnect();
    await expect(new SampleExecution(async () => unavailable, control).reconcile()).rejects.toThrow();
    await new SampleExecution(async () => redis, control).reconcile();
    expect(executed - before).toBe(1); expect(await redis.scard('cove:grading:sample-leases')).toBe(0);
    expect(await redis.get(`cove:sample-check:${id}`)).toBeNull();
  });
  it('retries a lost seal acknowledgement with the durable reconciliation UUID', async () => {
    const checkpoints = await db.gradingCaseCheckpoint.findMany();
    const owners = [...new Set(checkpoints.flatMap(row => row.submissionId ? [row.submissionId] : []))];
    const publicResults = await db.submission.findMany({ where: { id: { in: owners } }, select: { id: true, status: true, runtimeMs: true, passedCount: true, cases: true }, orderBy: { id: 'asc' } });
    expect(publicResults.some(row => row.status === 'ERRORED')).toBe(true);
    expect(checkpoints.some(row => row.generation > 1)).toBe(true);
    const seed = await attempt(1); const health = await coordinator().health();
    await db.gradingAdmissionEpoch.upsert({ where: { epoch: BigInt(health.admissionEpoch) }, create: { epoch: BigInt(health.admissionEpoch), workerGeneration }, update: {} });
    await db.gradingExecutionLease.createMany({ data: Array.from({ length: 256 }, (_, i) => ({ submissionId: seed.id, generation: i + 1, leaseToken: randomUUID(),
      workerGeneration, brokerGeneration: health.brokerGeneration, admissionEpoch: BigInt(health.admissionEpoch), runtime: nativeFixture, kind: 'submission', memoryLimitMb: 128, terminalCommitId: randomUUID(), retiredAt: new Date() })) });
    let lost = false;
    const transport = { request: async (request: ClientRequest) => { const response = await client.request(request); if (request.type === 'seal' && !lost) { lost = true; throw new Error('lost seal response'); } return response; } } as BrokerClient;
    const restarted = coordinator(transport);
    await expect(restarted.reconcile()).rejects.toThrow('lost seal response');
    expect(await db.gradingCaseCheckpoint.count()).toBe(checkpoints.length);
    const intent = await db.gradingAdmissionEpoch.findUniqueOrThrow({ where: { epoch: BigInt(health.admissionEpoch) } });
    expect(intent.reconciliationId).not.toBeNull(); expect(intent.sealedAt).toBeNull();
    await expect(restarted.claim({ submissionId: seed.id }, { runtime: nativeFixture, memoryLimitMb: 128, kind: "submission" })).rejects.toThrow("EPOCH_RECONCILING");
    await restarted.reconcile();
    expect((await db.gradingAdmissionEpoch.findUniqueOrThrow({ where: { epoch: intent.epoch } })).reconciliationId).toBe(intent.reconciliationId);
    expect((await restarted.health()).admissionEpoch).toBe(health.admissionEpoch + 1);
    expect(await db.gradingCaseCheckpoint.count({ where: { submissionId: { in: owners } } })).toBe(0);
    expect(await db.submission.findMany({ where: { id: { in: owners } }, select: { id: true, status: true, runtimeMs: true, passedCount: true, cases: true }, orderBy: { id: 'asc' } })).toEqual(publicResults);
  });
  it('reconstructs epoch control metadata after Redis admission survived a rolled-back DB authority write', async () => {
    const control = coordinator(); const samples = new SampleExecution(async () => redis, control); const health = await control.health();
    // Simulate the control-row write rolling back after the Redis admission survived.
    await db.gradingAdmissionEpoch.deleteMany({ where: { epoch: BigInt(health.admissionEpoch), sealedAt: null, reconciliationId: null } });
    expect(await db.gradingAdmissionEpoch.findUnique({ where: { epoch: BigInt(health.admissionEpoch) } })).toBeNull();
    await redis.hset('cove:grading:sample-epochs', String(health.admissionEpoch), '256');
    await control.reconcile();
    expect((await control.health()).admissionEpoch).toBe(health.admissionEpoch + 1);
    expect(await samples.epochCount(health.admissionEpoch)).toBe(0);
  });
  it('retains practice authority until seal then allows existing material deletion cascades', async () => {
    const item = await attempt(1), control = coordinator();
    const samples = new SampleExecution(async () => redis, control);
    const snapshot = practiceSnapshotSchema.parse({ ...item, version: 2, quizSnapshot: null });
    const practice = await createPracticeAttempt(db, { academyId: academy, userId: user, materialId: item.materialId!, requestId: randomUUID(), code: item.code, snapshot: JSON.parse(JSON.stringify(snapshot)) });
    await new PracticeRunner(db, grader(control), control).run(practice.id);
    await control.reconcile();
    const lease = await db.gradingExecutionLease.findFirstOrThrow({ where: { staffPracticeAttemptId: practice.id } });
    expect(lease.retiredAt).not.toBeNull();
    expect(await db.gradingExecutionCase.count({ where: { leaseId: lease.id } })).toBe(1);
    expect(await db.gradingCaseCheckpoint.count({ where: { staffPracticeAttemptId: practice.id } })).toBe(1);
    const publicResult = (await db.staffPracticeAttempt.findUniqueOrThrow({ where: { id: practice.id } })).result;
    await expect(db.material.delete({ where: { id: item.materialId! } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await db.gradingExecutionLease.count({ where: { admissionEpoch: lease.admissionEpoch } })).toBe(1);
    // Age the normal reconciliation clock without waiting or manufacturing admissions.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    try { await control.reconcile(); } finally { clock.mockRestore(); }
    expect((await db.gradingAdmissionEpoch.findUniqueOrThrow({ where: { epoch: lease.admissionEpoch } })).sealedAt).not.toBeNull();
    expect(await samples.epochCount(Number(lease.admissionEpoch))).toBe(0);
    expect(await db.gradingCaseCheckpoint.count({ where: { staffPracticeAttemptId: practice.id } })).toBe(0);
    expect((await db.staffPracticeAttempt.findUniqueOrThrow({ where: { id: practice.id } })).result).toEqual(publicResult);
    await db.material.delete({ where: { id: item.materialId! } });
    expect(await db.staffPracticeAttempt.findUnique({ where: { id: practice.id } })).toBeNull();
    expect(await db.gradingExecutionCase.count({ where: { leaseId: lease.id } })).toBe(0);
  });
  it('preserves an older sealed checkpoint while another generation still needs recovery authority', async () => {
    const item = await attempt(1), control = coordinator(), health = await control.health();
    const sealed = await db.gradingAdmissionEpoch.findFirstOrThrow({ where: { sealedAt: { not: null } } });
    const token = randomUUID(), currentToken = randomUUID();
    // Synthetic source-free history isolates the cross-generation GC guard.
    const prior = await db.gradingExecutionLease.create({ data: { submissionId: item.id, generation: 1, leaseToken: token,
      workerGeneration, brokerGeneration: health.brokerGeneration, admissionEpoch: sealed.epoch, kind: 'submission', runtime: nativeFixture,
      memoryLimitMb: 128, terminalCommitId: randomUUID(), retiredAt: new Date() } });
    const current = await db.gradingExecutionLease.create({ data: { submissionId: item.id, generation: 2, leaseToken: currentToken,
      workerGeneration, brokerGeneration: health.brokerGeneration, admissionEpoch: BigInt(health.admissionEpoch), kind: 'submission', runtime: nativeFixture, memoryLimitMb: 128 } });
    await db.submission.update({ where: { id: item.id }, data: { status: 'RUNNING', startedAt: new Date(), executionGeneration: 2, executionLeaseToken: currentToken } });
    const checkpoint = await db.gradingCaseCheckpoint.create({ data: { submissionId: item.id, generation: 1, leaseToken: token, casePosition: 1, receiptId: randomUUID(),
      executionRuntimeSnapshot: nativeFixture, comparator: 'STDOUT', outcome: 'PASSED', runtimeMs: 1, weight: 1, executionState: 'EXECUTED', isSample: true, actualOutput: 'ok' } });
    await control.reconcile();
    expect(await db.gradingCaseCheckpoint.findUnique({ where: { id: checkpoint.id } })).not.toBeNull();
    expect(await db.gradingExecutionLease.findUnique({ where: { id: prior.id } })).not.toBeNull();
    // No source was released; a durable terminal resolution retires the synthetic generation.
    await db.$transaction(async tx => {
      await tx.submission.update({ where: { id: item.id }, data: { status: 'ERRORED', gradedAt: new Date() } });
      await tx.gradingExecutionLease.update({ where: { id: current.id }, data: { terminalCommitId: randomUUID(), retiredAt: new Date() } });
    });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    try { await control.reconcile(); } finally { clock.mockRestore(); }
    expect(await db.gradingCaseCheckpoint.findUnique({ where: { id: checkpoint.id } })).toBeNull();
    expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('ERRORED');
  });
  it('executes the real read-only inventory CLI against nonzero queues, STOPPING samples and the admission fence', async () => {
    const manifestPath = join(directory, 'inventory-manifest.json'); await writeFile(manifestPath, JSON.stringify(manifestFixture));
    const item = await attempt(1), stopping = randomUUID();
    await queue.enqueue(item.id); await queue.enqueuePractice(randomUUID()); await queue.enqueueSampleCheck(randomUUID());
    await queue.enqueueRegrade({ submissionId: randomUUID(), runId: randomUUID(), requestId: null });
    await redis.set(`cove:sample-check:${stopping}`, JSON.stringify({ status: 'STOPPING', snapshot: { executionRuntimeSnapshot: nativeFixture } }));
    await redis.del(readinessKey(manifestFixture, workerGeneration));
    const command = () => promisify(execFile)(process.execPath, ['scripts/grading-inventory.mjs'], { cwd: process.cwd(), env: {
      PATH: process.env.PATH, HOME: process.env.HOME, DOTENV_CONFIG_PATH: '/dev/null', DATABASE_URL: databaseUrl, REDIS_URL: redisUrl,
      GRADING_RUNTIME_MANIFEST_PATH: manifestPath, GRADING_WORKER_GENERATION: workerGeneration,
    } });
    try {
      const fenced = JSON.parse((await command()).stdout);
      expect(fenced).toMatchObject({ complete: true, admissionFence: { readinessAbsent: true, workerGeneration } });
      expect(fenced.pending).toBeGreaterThan(0); expect(fenced.ephemeralPending).toBeGreaterThan(0);
      for (const name of ['cove-grading', 'cove-staff-practice', 'cove-sample-checks', 'cove-regrade']) expect(fenced.queueBacklog[name]).toBeGreaterThan(0);
      expect(fenced.references).toContainEqual(nativeFixture);
      const publisher = new RuntimeReadinessPublisher(manifestFixture, workerGeneration, async () => redis, signal => coordinator().health(signal));
      await publisher.poll(true);
      const open = JSON.parse((await command()).stdout);
      expect(open.admissionFence.readinessAbsent).toBe(false);
      expect(JSON.stringify(open)).not.toContain('print(');
      console.log(JSON.stringify({ evidence: 'real-app-inventory-cli', pending: fenced.pending, ephemeralPending: fenced.ephemeralPending,
        queueBacklog: fenced.queueBacklog, fenced: fenced.admissionFence.readinessAbsent, open: open.admissionFence.readinessAbsent }));
    } finally { await redis.del(`cove:sample-check:${stopping}`, readinessKey(manifestFixture, workerGeneration)); }
  });
  it('normally rolls admission through more than 512 completed jobs without a sweep stall', async () => {
    const control = coordinator(); const startEpoch = (await control.health()).admissionEpoch;
    const observations: Array<{ index: number; elapsedMs: number; status: string }> = [];
    const seed = await attempt(1);
    for (let index = 0; index < 530; index++) {
      const item = index === 0 ? seed : await attempt(1, nativeFixture, seed.materialId!); const began = performance.now();
      await grader(control).grade(item.id, async () => undefined);
      const result = await db.submission.findUniqueOrThrow({ where: { id: item.id } });
      observations.push({ index, elapsedMs: performance.now() - began, status: result.status });
      expect(result.status, `normal job ${index}`).toBe('PASSED');
    }
    await control.reconcile();
    expect((await control.health()).admissionEpoch).toBeGreaterThanOrEqual(startEpoch + 2);
    expect(Math.max(...observations.map(row => row.elapsedMs))).toBeLessThan(10_000);
    console.log(JSON.stringify({ evidence: 'deterministic-driver-normal-epoch-rollover', jobs: observations.length,
      startEpoch, endEpoch: (await control.health()).admissionEpoch, maximumMs: Math.max(...observations.map(row => row.elapsedMs)), failures: observations.filter(row => row.status !== 'PASSED').length }));
  }, 240_000);
  it('rejects a replaced empty broker journal behind durable sealed epochs before source admission', async () => {
    const replacementDirectory = await mkdtemp(join(tmpdir(), 'cove-rollback-broker-'));
    const replacement = new Broker(manifestFixture, { ...driver, discover: async () => [] }, new Journal(replacementDirectory), workerGeneration, [{ runtime: nativeFixture, memoryLimitMb: 128, targetReady: 1 }]);
    let replacementServer: Awaited<ReturnType<typeof serve>> | undefined;
    try {
      await replacement.start(); replacementServer = await serve(join(replacementDirectory, 'broker.sock'), request => replacement.handle(request));
      const control = coordinator(new BrokerClient(join(replacementDirectory, 'broker.sock')));
      const before = executed, item = await attempt(1);
      await expect(control.health()).rejects.toThrow('ADMISSION_EPOCH_ROLLBACK');
      await expect(control.claim({ submissionId: item.id }, { runtime: nativeFixture, kind: 'submission', memoryLimitMb: 128 })).rejects.toThrow('ADMISSION_EPOCH_ROLLBACK');
      expect(executed).toBe(before);
      expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('QUEUED');
    } finally {
      if (replacementServer) await new Promise<void>(resolve => replacementServer!.close(() => resolve()));
      await replacement.stop(); await rm(replacementDirectory, { recursive: true, force: true });
    }
  });
  it('publishes healthy saturated readiness, then blocks admission and pauses queues after a real broker cleanup fault', async () => {
    const control = coordinator();
    const publisher = new RuntimeReadinessPublisher(manifestFixture, workerGeneration, async () => redis, signal => control.health(signal));
    const workers = [{ client: Promise.resolve({ status: 'ready' }), pause: vi.fn(async () => undefined), resume: vi.fn() }];
    const monitor = startJudgeMonitor({ port: 0, bind: '127.0.0.1', guard: true, telemetry: new ExecutionTelemetry(), workers,
      diagnostics: async () => undefined, brokerHealth: ready => publisher.poll(ready) });
    try {
      await monitor.refresh(); expect(monitor.readiness.state()).toMatchObject({ ready: true, supported: true });
      await assertRuntimeReady(async () => redis, manifestFixture, workerGeneration);
      const item = await attempt(1), other = await attempt(1);
      await db.exerciseTestCase.create({ data: { exerciseMaterialId: item.materialId!, position: 1, input: '', expectedOutput: 'ok', visibility: 'SAMPLE' } });
      const manifestPath = join(directory, 'admission-manifest.json'); await writeFile(manifestPath, JSON.stringify(manifestFixture));
      const config = new ConfigService({ GRADING_RUNTIME_MANIFEST_PATH: manifestPath, GRADING_WORKER_GENERATION: workerGeneration,
        GRADING_NATIVE_ENABLED: true, REDIS_URL: redisUrl, PYODIDE_VERSION: '0.27.5', SUBMISSION_RATE_LIMIT: 1000 });
      const practiceApi = new StaffPracticeService(db, { requirePermission: async () => ({ userId: user, via: 'membership', role: 'MANAGER', roles: ['MANAGER'] }) } as never, config, queue);
      const request = { academyId: academy, materialId: item.materialId!, code: 'print("ok")', preview: true, requestId: randomUUID() };
      const accepted = await practiceApi.submit({ authUserId: user } as never, request);
      expect(practiceSnapshotSchema.parse((await db.staffPracticeAttempt.findUniqueOrThrow({ where: { id: accepted.submissionId } })).snapshot)).toMatchObject({ executionRuntimeSnapshot: compatibilityFixture });
      const first = (await control.claim({ submissionId: item.id }, { runtime: nativeFixture, kind: 'submission', memoryLimitMb: 128 }))!;
      const second = (await control.claim({ submissionId: other.id }, { runtime: nativeFixture, kind: 'submission', memoryLimitMb: 128 }))!;
      await first.engine.reserve(); await second.engine.reserve();
      await monitor.refresh(); expect(monitor.readiness.state().ready).toBe(true);
      await assertRuntimeReady(async () => redis, manifestFixture, workerGeneration);
      removalFault = true;
      await expect(runCase(first, 1)).rejects.toThrow();
      await monitor.refresh(); expect(monitor.readiness.state()).toMatchObject({ ready: false, supported: true, reason: 'broker' });
      expect(workers[0]!.pause).toHaveBeenCalledWith(true);
      await expect(assertRuntimeReady(async () => redis, manifestFixture, workerGeneration)).rejects.toThrow();
      const beforeAttempts = await db.staffPracticeAttempt.count(), beforeIntents = await db.gradingDispatchIntent.count();
      await expect(practiceApi.submit({ authUserId: user } as never, { ...request, requestId: randomUUID() })).rejects.toMatchObject({ code: 'GRADING_UNAVAILABLE' });
      expect(await db.staffPracticeAttempt.count()).toBe(beforeAttempts);
      expect(await db.gradingDispatchIntent.count()).toBe(beforeIntents);
      expect(await practiceApi.submit({ authUserId: user } as never, request)).toEqual(accepted);
      await expect(control.claim({ submissionId: (await attempt(1)).id }, { runtime: nativeFixture, kind: 'submission', memoryLimitMb: 128 })).rejects.toThrow();
      expect((await db.submission.findUniqueOrThrow({ where: { id: item.id } })).executionRuntimeSnapshot).toEqual(nativeFixture);
    } finally { removalFault = false; await monitor.close(); }
  });

});
