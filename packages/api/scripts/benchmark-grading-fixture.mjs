// Trusted fixture entrypoint, mounted into a pinned judge image. Never app data.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer, createConnection } from 'node:net';

if (process.env.COVE_PERFORMANCE_FIXTURE !== '1') throw new Error('Dedicated fixture only');
const mode = process.argv[2];
process.on('uncaughtException', error => {
  const field = /(?:Argument|argument|field) `([a-zA-Z_]+)`/.exec(error.message)?.[1];
  console.error('COVE_PERFORMANCE_FAILURE ' + JSON.stringify({ role: mode, type: error.name,
    ...(typeof error.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? { code: error.code } : {}), ...(field ? { field } : {}) }));
  process.exit(1);
});
const socketPath = '/run/cove-sandbox/judge.sock';
const observePath = '/run/cove-sandbox/observe.sock';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (mode === 'sandbox') {
  const { PyodideExecutionEngine } = await import('./dist/api/src/judge/pyodide-engine.js');
  const { startSandbox } = await import('./dist/api/src/judge/sandbox-server.js');
  let pool;
  const warmUp = PyodideExecutionEngine.prototype.warmUp;
  // Observes the existing pool in both old/new images; execution is untouched.
  PyodideExecutionEngine.prototype.warmUp = async function () { pool = this; return warmUp.call(this); };
  const sandbox = await startSandbox({ socketPath, clientGid: 1001, concurrency: 2, spare: 1,
    pyodideVersion: '0.27.5', runnerUidBase: 20000, requireIsolation: true });
  const group = process.getegid(); process.setegid(1001);
  const observer = createServer(socket => {
    socket.on('error', () => {});
    const stats = pool.stats();
    socket.end(JSON.stringify({ executing: stats.executing, idle: stats.idle, warming: stats.warming, total: stats.total }) + '\n');
  });
  await new Promise(resolve => observer.listen(observePath, resolve));
  process.setegid(group); chmodSync(observePath, 0o660);
  const stop = async () => { observer.close(); await sandbox.close(); process.exit(0); };
  process.on('SIGTERM', () => void stop()); process.on('SIGINT', () => void stop());
} else {
  const dbUrl = new URL(process.env.DATABASE_URL ?? '');
  const redisUrl = new URL(process.env.REDIS_URL ?? '');
  if (dbUrl.hostname !== 'perf-db' || dbUrl.pathname !== '/cove_performance' || dbUrl.username !== 'cove_perf' ||
      redisUrl.hostname !== 'perf-redis' || redisUrl.pathname !== '/0') throw new Error('Refusing non-fixture data services');
  const { ConfigService } = await import('@nestjs/config');
  const { PrismaService } = await import('./dist/api/src/database/prisma.service.js');
  const { JudgeQueue } = await import('./dist/api/src/judge/judge.queue.js');
  const prisma = new PrismaService(new ConfigService({ DATABASE_URL: dbUrl.href }));
  const queue = new JudgeQueue(redisUrl.href);

  if (mode === 'worker') {
    const { GradingService } = await import('./dist/api/src/judge/grading.service.js');
    const { PointAwardService } = await import('./dist/api/src/points/point-award.service.js');
    const { SandboxExecutionEngine } = await import('./dist/api/src/judge/sandbox-engine.js');
    const { ComparatorPool } = await import('./dist/api/src/judge/comparator-pool.js');
    const { ExecutionCapacity } = await import('./dist/api/src/judge/execution-capacity.js');
    const context = new AsyncLocalStorage();
    const engine = new SandboxExecutionEngine(socketPath, '0.27.5', true);
    const comparator = new ComparatorPool(1);
    const timed = (name, action) => async (...args) => {
      const began = performance.now();
      try { return await action(...args); } finally {
        const stats = context.getStore();
        if (stats) { stats[name + 'Ms'] += performance.now() - began; stats[name + 'Calls']++; }
      }
    };
    const grading = new GradingService(prisma,
      { get version() { return engine.version; }, run: timed('engine', request => engine.run(request)), dispose: () => engine.dispose() },
      new PointAwardService(prisma),
      { get version() { return comparator.version; }, compare: timed('compare', request => comparator.compare(request)) });
    await Promise.all([engine.warmUp(), comparator.warmUp()]);
    const capacity = new ExecutionCapacity(2);
    const worker = queue.createWorker(async job => {
      const stats = { engineMs: 0, engineCalls: 0, compareMs: 0, compareCalls: 0 };
      const claimed = Date.now(), inspection = performance.now();
      const queued = await queue.queue.getJob(job.data.submissionId);
      const observationMs = performance.now() - inspection;
      const queueWaitMs = Math.max(0, claimed - queued.timestamp);
      const began = performance.now();
      const stageSums = () => (grading.telemetry?.snapshot() ?? []).reduce((sums, value) => {
        const item = sums[value.stage] ?? { ms: 0, count: 0 };
        item.ms += value.sum * 1000; item.count += value.count; sums[value.stage] = item; return sums;
      }, {});
      const before = stageSums();
      return context.run(stats, async () => {
        await capacity.runOfficial(() => grading.grade(job.data.submissionId, job.updateProgress));
        const stages = process.env.PERF_PARALLEL === '2' ? null : Object.fromEntries(Object.entries(stageSums()).map(([stage, value]) =>
          [stage, { ms: value.ms - (before[stage]?.ms ?? 0), count: value.count - (before[stage]?.count ?? 0) }]));
        return { ...stats, queueWaitMs, observationMs, serviceMs: performance.now() - began, stages };
      });
    }, 2);
    await worker.waitUntilReady();
    const server = httpServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/ready') { response.writeHead(404); response.end(); return; }
      response.end('{"ready":true}');
    }).listen(3999, '0.0.0.0');
    process.on('SIGTERM', () => { void (async () => { server.close(); await worker.close(); await queue.close();
      await engine.dispose(); await comparator.dispose(); await prisma.$disconnect(); process.exit(0); })(); });
  } else if (mode === 'client') {
    let ready = false;
    for (let attempt = 0; attempt < 180; attempt++) {
      try { if ((await fetch('http://perf-worker:3999/ready', { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
      await sleep(1000);
    }
    if (!ready) throw new Error('Fixture worker startup timeout');
    const { gradingSnapshotFor } = await import('./dist/api/src/judge/grading-profile.js');
    const count = Number(process.env.PERF_CASES), runs = Number(process.env.PERF_RUNS), parallel = Number(process.env.PERF_PARALLEL);
    if (![1, 5, 10].includes(count) || !Number.isInteger(runs) || runs < 1 || runs > 100 || ![1, 2].includes(parallel)) throw new Error('Invalid fixture bounds');
    const waitReadyPool = async () => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const state = await new Promise((resolve, reject) => {
          const socket = createConnection(observePath); let data = '';
          socket.setTimeout(2000, () => socket.destroy(new Error('Observer timeout')));
          socket.on('error', reject); socket.on('data', chunk => { data += chunk; if (data.length > 2048) socket.destroy(new Error('Oversized observation')); });
          socket.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid observation')); } });
        }).catch(() => null);
        if (!state) { await sleep(100); continue; }
        if (state.idle === 3 && state.executing === 0 && state.warming === 0) return;
        await sleep(100);
      }
      throw new Error('Pool did not replenish before next fixture');
    };
    const ids = Object.fromEntries(['organization', 'academy', 'creator', 'course', 'module', 'lecture', 'klass', 'material'].map(key => [key, randomUUID()]));
    const profile = { inputPromptPolicy: 'INCLUDE', gradingMode: 'ELICE_STDIO', gradingSemanticVersion: 'elice-v1',
      totalTimeLimitMs: count * 1000, comparatorTimeLimitMs: 1000, continuationPolicy: 'CONTINUE_WITHIN_BUDGET',
      exitStatusPolicy: 'FAIL_ON_RUNTIME_ERROR', materialMaximumHundredths: 10000, materialScorePolicy: 'PROPORTIONAL' };
    const testCases = Array.from({ length: count }, (_, position) => ({ input: position % 2 ? '한글🙂\n' : '1\n',
      expectedOutput: position % 2 ? '한글🙂\n' : '1\n', visibility: position === 0 ? 'SAMPLE' : 'HIDDEN',
      label: null, comparator: 'STDOUT', weight: 1, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null }));
    const snapshot = gradingSnapshotFor({ ...profile, timeLimitMs: 1000, memoryLimitMb: 256, testCases }, { engineVersion: '0.27.5' });
    const samples = [];
    try {
      await queue.events.waitUntilReady();
      await prisma.organization.create({ data: { id: ids.organization, name: 'Performance fixture', slug: 'perf-' + ids.organization } });
      await prisma.academy.create({ data: { id: ids.academy, organizationId: ids.organization, name: 'Performance fixture', slug: 'perf-' + ids.academy } });
      await prisma.academyFeatureFlag.create({ data: { academyId: ids.academy, feature: 'STUDENT_POINTS', isEnabled: true } });
      await prisma.user.create({ data: { id: ids.creator, status: 'ACTIVE' } });
      await prisma.course.create({ data: { id: ids.course, academyId: ids.academy, createdByUserId: ids.creator, title: 'Fixture', isVisible: true } });
      await prisma.courseModule.create({ data: { id: ids.module, courseId: ids.course, externalKey: randomUUID(), title: 'Fixture', position: 1, isVisible: true } });
      await prisma.lecture.create({ data: { id: ids.lecture, courseModuleId: ids.module, externalKey: randomUUID(), title: 'Fixture', position: 1, isVisible: true } });
      await prisma.class.create({ data: { id: ids.klass, academyId: ids.academy, name: 'Fixture', createdByUserId: ids.creator } });
      await prisma.classCourse.create({ data: { classId: ids.klass, courseId: ids.course, assignedByUserId: ids.creator } });
      await prisma.material.create({ data: { id: ids.material, lectureId: ids.lecture, type: 'PROGRAMMING_EXERCISE', title: 'Fixture', position: 1, isVisible: true,
        programmingExercise: { create: { ...profile, externalKey: randomUUID(), difficulty: 'EASY', timeLimitMs: 1000, memoryLimitMb: 256 } } } });
      // An unsolved required material keeps completion bonuses out of this cohort.
      await prisma.material.create({ data: { lectureId: ids.lecture, type: 'PROGRAMMING_EXERCISE', title: 'Unsolved fixture', position: 2, isVisible: true,
        programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY' } } } });
      const submit = async (actor, path) => {
        const beforeAwards = await prisma.pointAward.count({ where: { membershipId: actor.membershipId } });
        const began = performance.now();
        const row = await prisma.submission.create({ data: { ...snapshot.submission, userId: actor.userId, materialId: ids.material,
          sourceMaterialId: ids.material, courseId: ids.course, classId: ids.klass, gradingRevision: 1, language: 'PYTHON',
          timeLimitMs: 1000, memoryLimitMb: 256, code: 'print(input())', totalCount: count, engineVersion: '0.27.5',
          problemTitle: 'Fixture', courseTitle: 'Fixture', moduleTitle: 'Fixture', lectureTitle: 'Fixture',
          modulePosition: 1, lecturePosition: 1, problemPosition: 1, gradingCases: { create: snapshot.cases } } });
        const accepted = performance.now();
        let timing = null, queueFailure = false;
        try { await queue.enqueue(row.id); const job = await queue.queue.getJob(row.id); timing = await job.waitUntilFinished(queue.events, 90000); }
        catch { queueFailure = true; }
        const completed = performance.now();
        const result = await prisma.submission.findUniqueOrThrow({ where: { id: row.id }, include: { cases: true } });
        const progress = await prisma.studentExerciseProgress.findUnique({ where: { userId_materialId: { userId: actor.userId, materialId: ids.material } } });
        const afterAwards = await prisma.pointAward.count({ where: { membershipId: actor.membershipId } });
        const pointsCorrect = path === 'first-solve' ? afterAwards === beforeAwards + 1 : afterAwards === beforeAwards;
        const correct = !queueFailure && result.status === 'PASSED' && !result.gradingAborted && result.passedCount === count &&
          result.cases.length === count && result.cases.every(c => c.outcome === 'PASSED') && progress?.status === 'SOLVED' && pointsCorrect;
        return { path, admissionMs: accepted - began, acceptedToCompletedMs: completed - accepted, requestToCompletedMs: completed - began,
          queueFailure, correct, status: result.status, aborted: result.gradingAborted, abortReason: result.gradingAbortReason,
          passedCount: result.passedCount, caseOutcomes: result.cases.map(c => c.outcome), pointsCorrect, timing };
      };
      for (let run = 0; run < runs; run += parallel) {
        const actors = await Promise.all(Array.from({ length: Math.min(parallel, runs - run) }, async () => {
          const user = await prisma.user.create({ data: { status: 'ACTIVE' } });
          const member = await prisma.academyMembership.create({ data: { userId: user.id, academyId: ids.academy, role: 'STUDENT', status: 'ACTIVE' } });
          await prisma.classEnrollment.create({ data: { classId: ids.klass, membershipId: member.id, enrolledByUserId: ids.creator } });
          return { userId: user.id, membershipId: member.id };
        }));
        await waitReadyPool();
        const first = await Promise.all(actors.map(actor => submit(actor, 'first-solve'))); samples.push(...first);
        if (first.some(sample => !sample.correct)) break;
        await waitReadyPool();
        const repeat = await Promise.all(actors.map(actor => submit(actor, 'repeat-solve'))); samples.push(...repeat);
        if (repeat.some(sample => !sample.correct)) break;
      }
      console.log('COVE_PERFORMANCE_RESULT ' + JSON.stringify({ node: process.version, arch: process.arch, count, requestedRuns: runs, parallel,
        boundary: 'fixture admission insert through real BullMQ completion after grading/points commit; excludes HTTP/auth/browser and remote Supabase latency',
        samples, failures: samples.filter(sample => !sample.correct).length }));
      if (samples.some(sample => !sample.correct)) process.exitCode = 2;
    } finally { await queue.close(); await prisma.$disconnect(); }
  } else { await queue.close(); await prisma.$disconnect(); throw new Error('Unknown fixture role'); }
}
