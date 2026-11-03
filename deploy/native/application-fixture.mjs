#!/usr/bin/env node
// Explicit synthetic qualification application. Never imported by production boot.
import { nextAuthFixture } from './next-auth-fixture.mjs';
import { loopbackApplication } from './loopback-application.mjs';
import { classroomCorpus } from './corpus.mjs';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { totalmem, availableParallelism } from 'node:os';
import { createRequire } from 'node:module';
const [artifactArg, configPath, authorityPath] = process.argv.slice(2);
if (!artifactArg || !configPath || !authorityPath || process.env.DOTENV_CONFIG_PATH !== '/dev/null' || !/^native-[a-z0-9-]{8,80}$/.test(process.env.COVE_NATIVE_FIXTURE_ID ?? ''))
    throw Error('Explicit isolated sanitized fixture required');
const artifact = resolve(artifactArg), pkg = artifact + '/worker';
const load = path => import(pathToFileURL(pkg + path));
await load('/node_modules/reflect-metadata/Reflect.js');
const { ConfigService } = await load('/node_modules/@nestjs/config/dist/index.js');
const { PrismaService } = await load('/dist/src/database/prisma.service.js');
const { AcademyAccessService } = await load('/dist/src/authorization/academy-access.service.js');
const { SupportGrantResolver } = await load('/dist/src/authorization/support-grant.resolver.js');
const { LearningClassContextService } = await load('/dist/src/learn/learning-class-context.service.js');
const { SubmissionService } = await load('/dist/src/learn/submission.service.js');
const { JudgeQueue, runtimeQueueName } = await load('/dist/src/judge/judge.queue.js');
const { bootstrapNativeWorker } = await load('/dist/src/judge/native-worker.js');
const { nativeRuntimeVersion, NativeExecutionClient } = await load('/node_modules/@cove/grading-runtime/dist/index.js');
const { isTerminalStatus } = await load('/node_modules/@cove/shared/dist/index.js');
for (const [name, protocol, path] of [['DATABASE_URL', 'postgresql:', '/cove_native_test'], ['REDIS_URL', 'redis:', '/0']]) {
    const u = new URL(process.env[name]);
    if (u.protocol !== protocol || u.hostname !== '127.0.0.1' || !u.port || u.pathname !== path)
        throw Error('Loopback owned fixture connection required');
}
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (config.manifest.eligibility.length)
    throw Error('Start only from unqualified empty-eligibility artifact');
const fixtureId = process.env.COVE_NATIVE_FIXTURE_ID, token = randomBytes(24).toString('hex'), manifestPath = resolve(authorityPath, '../fixture-manifest.json');
const manifest = structuredClone(config.manifest);
await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
const settings = { DATABASE_URL: process.env.DATABASE_URL, DATABASE_POOL_MAX: 3, NATIVE_GRADING_ENABLED: true, NATIVE_GRADING_BRIDGE_ACK: 'filtered-compatibility-workers-v1', NATIVE_GRADING_MANIFEST: manifestPath, PYODIDE_VERSION: '0.27.5', SUBMISSION_RATE_LIMIT: 100, REDIS_URL: process.env.REDIS_URL };
const db = new PrismaService(new ConfigService(settings));
const queue = new JudgeQueue(process.env.REDIS_URL);
const access = new AcademyAccessService(db, new SupportGrantResolver(db));
let submissions = new SubmissionService(db, access, new ConfigService(settings), new LearningClassContextService(db), queue);
const probe = new NativeExecutionClient({ socketPath: config.socketPath, descriptor: manifest.descriptor, lane: 'official' });
const ids = Object.fromEntries(['org', 'academy', 'manager', 'course', 'module', 'lecture', 'class'].map(k => [k, randomUUID()]));
const students = new Map(), materials = new Map();
let materialId, cases = 0;
const nextOrigin = process.env.COVE_NATIVE_NEXT_ORIGIN;
const provider = nextOrigin ? nextAuthFixture(nextOrigin) : undefined;
let nativeApiReady = !nextOrigin;
let createNextApiClient;
if (nextOrigin) {
    const u = new URL(nextOrigin);
    if (u.hostname !== '127.0.0.1' || u.protocol !== 'http:' || !u.port)
        throw Error('Loopback Next fixture only');
}
let worker, server, closing = false;
async function close() { if (closing)
    return; closing = true; await new Promise(r => server?.close(r) ?? r()); await worker?.close(); await probe.dispose(); await queue.close(); await db.$disconnect(); }
try {
    const ownership = await db.$queryRawUnsafe('SELECT fixture_id FROM native_qualification_fixture');
    if (ownership.length !== 1 || ownership[0].fixture_id !== fixtureId || await (await queue.redis()).get('cove-native-qualification-owner') !== fixtureId)
        throw Error('Database/Redis fixture ownership mismatch');
    await db.organization.create({ data: { id: ids.org, name: 'Native disposable qualification', slug: 'nf-' + ids.org } });
    await db.academy.create({ data: { id: ids.academy, organizationId: ids.org, name: 'Fixture', slug: 'nf-' + ids.academy, status: 'ACTIVE' } });
    await db.user.create({ data: { id: ids.manager, authUserId: randomUUID(), username: 'f' + ids.manager.replaceAll('-', '').slice(0, 12), status: 'ACTIVE' } });
    await db.academyMembership.create({ data: { academyId: ids.academy, userId: ids.manager, role: 'MANAGER', status: 'ACTIVE' } });
    await db.course.create({ data: { id: ids.course, academyId: ids.academy, createdByUserId: ids.manager, title: 'Fixture', isVisible: true } });
    await db.courseModule.create({ data: { id: ids.module, courseId: ids.course, title: 'Fixture', externalKey: 'fixture', position: 1, isVisible: true } });
    await db.lecture.create({ data: { id: ids.lecture, courseModuleId: ids.module, title: 'Fixture', externalKey: 'fixture', position: 1, isVisible: true } });
    await db.class.create({ data: { id: ids.class, academyId: ids.academy, name: 'Fixture', createdByUserId: ids.manager } });
    await db.classCourse.create({ data: { classId: ids.class, courseId: ids.course, assignedByUserId: ids.manager } });
    await db.academyFeatureFlag.create({ data: { academyId: ids.academy, feature: 'STUDENT_POINTS', isEnabled: true } });
    for (const count of [1, 5, 10]) {
        materialId = randomUUID();
        cases = count;
        await db.material.create({ data: { id: materialId, lectureId: ids.lecture, type: 'PROGRAMMING_EXERCISE', title: 'Native fixture', position: [1, 5, 10].indexOf(count) + 1, isVisible: true, programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY', starterCode: '', memoryLimitMb: 512, timeLimitMs: 1000, gradingMode: 'ELICE_STDIO', gradingSemanticVersion: 'elice-v1', continuationPolicy: 'CONTINUE_WITHIN_BUDGET', exitStatusPolicy: 'FAIL_ON_RUNTIME_ERROR', totalTimeLimitMs: 60000, comparatorTimeLimitMs: 100, materialMaximumHundredths: 10000, materialScorePolicy: 'PROPORTIONAL', testCases: { create: Array.from({ length: cases }, (_, i) => ({ position: i + 1, input: '학생' + i, expectedOutput: '학생' + i, visibility: i ? 'HIDDEN' : 'SAMPLE', weight: 1, timeLimitMsOverride: i ? 2000 : null })) } } } } });
        manifest.eligibility.push({ organizationId: ids.org, academyId: ids.academy, materialId, gradingRevision: 1, context: 'live', kinds: ['official'], memoryLimitMb: 512, timeLimitMs: 1000, maxCaseTimeLimitMs: 2000 });
        await writeFile(manifestPath, JSON.stringify(manifest));
        materials.set(count, materialId);
    }
    const warmStarted = performance.now();
    worker = await bootstrapNativeWorker({ JUDGE_RUNTIME_FAMILY: 'native', NATIVE_GRADING_MANIFEST: manifestPath, NATIVE_GRADING_SOCKET: config.socketPath, DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL, DATABASE_POOL_MAX: 2, DATABASE_CONNECTION_BUDGET: 12, DATABASE_API_POOL_BUDGET: 6, DATABASE_OPERATIONAL_RESERVE: 2, JUDGE_FLEET_WORKER_COUNT: 1 });
    const workerWarmMs = performance.now() - warmStarted;
    const identity = student => ({ authUserId: student.authId, email: 'synthetic@fixture.invalid' });
    const committed = async (id, expectedStudent) => { const row = await db.submission.findUniqueOrThrow({ where: { id }, include: { cases: true } }); if (row.materialId !== materialId || !students.has(row.userId) || (expectedStudent && row.userId !== expectedStudent))
        throw Error('Fixture ownership mismatch'); return { terminal: isTerminalStatus(row.status), status: row.status, score: row.score, totalCount: row.totalCount, caseOutcomes: row.cases.map(c => c.outcome), committed: row.gradedAt !== null && row.cases.length === cases, runtimeFingerprint: row.engineVersion, executionQueue: row.executionQueue, stages: { queue: 'unmeasured', execution: 'worker histogram', comparison: 'worker histogram', commit: 'worker histogram', display: 'unmeasured' } }; };
    server = createServer((request, response) => {
        void (async () => {
            const authUrl = new URL(request.url, 'http://127.0.0.1');
            if (provider && await provider.handle(request, response, authUrl))
                return;
            if (request.headers.authorization !== 'Bearer ' + token) {
                response.writeHead(401).end();
                return;
            }
            const url = new URL(request.url, 'http://127.0.0.1');
            let value;
            if (request.method === 'GET' && url.pathname === '/ready') {
                const health = await probe.health();
                const checks = { launcher: health.ready, worker: await worker.health(), api: nativeApiReady, next: !nextOrigin || await fetch(nextOrigin + '/login', { redirect: 'manual', signal: AbortSignal.timeout(5000) }).then(r => r.status < 500) };
                value = { ready: Object.values(checks).every(value => value === true), checks, fixtureId, backend: 'nsjail', runtimeFingerprint: nativeRuntimeVersion(manifest.descriptor), workerWarmMs, resources: { configured: manifest.resources, physicalMemoryBytes: totalmem(), effectiveCpus: availableParallelism(), controls: Object.fromEntries(await Promise.all(['cpu.max', 'memory.max', 'memory.current', 'memory.peak', 'memory.events', 'memory.swap.max', 'pids.max', 'pids.current', 'cpu.stat'].map(async (name) => [name, (await readFile(config.cgroupRoot + '/' + name, 'utf8')).trim()]))), health }, timings: worker.metrics() };
            }
            else if (request.method === 'POST') {
                let body = '';
                for await (const bytes of request) {
                    body += bytes;
                    if (body.length > 32768)
                        throw Error('Fixture request too large');
                }
                const input = JSON.parse(body);
                if (url.pathname === '/cohort') {
                    if (![1, 2, 4, 5, 10, 20, 50, 100, 200].includes(input.clients) || ![1, 5, 10].includes(input.cases))
                        throw Error('Bounded cohort required');
                    materialId = materials.get(input.cases);
                    cases = input.cases;
                    const people = [];
                    for (let i = 0; i < input.clients; i++) {
                        const id = randomUUID(), authId = randomUUID();
                        await db.user.create({ data: { id, authUserId: authId, username: 'f' + id.replaceAll('-', '').slice(0, 12), status: 'ACTIVE' } });
                        const member = await db.academyMembership.create({ data: { academyId: ids.academy, userId: id, role: 'STUDENT', status: 'ACTIVE' } });
                        await db.classEnrollment.create({ data: { classId: ids.class, membershipId: member.id, enrolledByUserId: ids.manager } });
                        const workload = classroomCorpus[i % classroomCorpus.length];
                        students.set(id, { id, authId, workload });
                        people.push({ id, workload });
                    }
                    let nextStudents;
                    if (provider) {
                        nextStudents = [];
                        for (const person of people) {
                            const storageState = provider.storageState(students.get(person.id), origin);
                            const cookie = storageState.cookies.find(value => value.name === 'sb-127-auth-token');
                            const session = JSON.parse(Buffer.from(cookie.value.slice(7), 'base64url'));
                            const client = createNextApiClient(session.access_token);
                            // Match real sign-in completion: authenticated cookies alone do
                            // not create the mandatory server-side student inactivity lease.
                            await client.studentSession.begin({});
                            await client.learn.getMaterialType({ academyId: ids.academy, materialId });
                            nextStudents.push({ id: person.id, url: nextOrigin + '/academy/nf-' + ids.academy + '/learn/exercises/' + materialId + '?classId=' + ids.class, storageState });
                        }
                    }
                    value = { students: people, bounds: { memoryLimitMb: 512, executionOutputLimitBytes: 8388608, generatedMaxOutputBytes: 128, sourceChars: Math.max(...classroomCorpus.map(c => c.code.length)), aggregateStdinBytes: Array.from({ length: cases }, (_, i) => Buffer.byteLength('학생' + i)).reduce((a, b) => a + b, 0) }, nextStudents, materialId, academyId: ids.academy, classId: ids.class };
                }
                else if (url.pathname === '/submit') {
                    const student = students.get(input.studentId);
                    if (!student || input.code !== student.workload.code)
                        throw Error('Owned valid Python fixture required');
                    value = await submissions.submit(identity(student), { academyId: ids.academy, materialId, classId: ids.class, code: input.code });
                    const row = await db.submission.findUniqueOrThrow({ where: { id: value.submissionId } });
                    if (row.executionQueue !== runtimeQueueName('official', manifest.descriptor))
                        throw Error('Native admission did not freeze intended descriptor');
                }
                else
                    throw Error('Unknown fixture action');
            }
            else if (request.method === 'GET' && url.pathname.startsWith('/result/'))
                value = await committed(url.pathname.slice(8));
            else if (request.method === 'GET' && url.pathname.startsWith('/commit/'))
                value = await committed(url.pathname.slice(8), url.searchParams.get('student'));
            else
                throw Error('Unknown fixture route');
            response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));
        })().catch(error => { response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(error) })); });
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    server.maxConnections = 210;
    await new Promise(r => server.listen(Number(process.env.COVE_NATIVE_AUTH_PORT ?? 0), '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port;
    if (nextOrigin) {
        // Real Nest/oRPC/auth and the real Next application; only the provider is synthetic.
        Object.assign(process.env, { NODE_ENV: 'test', PORT: process.env.COVE_NATIVE_API_PORT, WEB_ORIGIN: nextOrigin, DIRECT_URL: process.env.DATABASE_URL, DATABASE_POOL_MAX: '3', SUPABASE_URL: 'https://native-fixture-provider.invalid', SUPABASE_SECRET_KEY: 'fixture-private-key', BFF_SHARED_SECRET: 'local-native-bff-secret-only-never-production', NATIVE_GRADING_ENABLED: 'true', NATIVE_GRADING_MANIFEST: manifestPath, NATIVE_GRADING_BRIDGE_ACK: 'filtered-compatibility-workers-v1', DLAB_SSO_ENABLED: 'false', GUI_ENABLED: 'false', VIDEO_LESSONS_ENABLED: 'false' });
        const realFetch = globalThis.fetch;
        globalThis.fetch = (input, init) => { const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString()); return realFetch(url.origin === 'https://native-fixture-provider.invalid' ? origin + url.pathname + url.search : input, init); };
        const { NestFactory } = await load('/node_modules/@nestjs/core/index.js');
        const create = NestFactory.create.bind(NestFactory);
        NestFactory.create = async (...args) => loopbackApplication(await create(...args), () => { nativeApiReady = true; });
        process.chdir(dirname(authorityPath));
        await load('/dist/src/main.js');
        const webRequire = createRequire(resolve(dirname(authorityPath), 'next-source/packages/web/package.json'));
        const { createORPCClient } = await import(pathToFileURL(webRequire.resolve('@orpc/client')));
        const { RPCLink } = await import(pathToFileURL(webRequire.resolve('@orpc/client/fetch')));
        createNextApiClient = accessToken => createORPCClient(new RPCLink({ url: 'http://127.0.0.1:' + process.env.COVE_NATIVE_API_PORT + '/api/rpc', headers: { Authorization: 'Bearer ' + accessToken, 'X-Cove-Bff-Secret': process.env.BFF_SHARED_SECRET } }));
    }
    await writeFile(authorityPath, JSON.stringify({ version: 1, isolated: true, fixtureId, pid: process.pid, token, expiresAt: Date.now() + 900000, origin, next: nextOrigin ? { origin: nextOrigin, apiOrigin: 'http://127.0.0.1:' + process.env.COVE_NATIVE_API_PORT, buildIdentity: process.env.COVE_NATIVE_NEXT_BUILD_ID } : undefined }), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ fixtureId, origin, authorityPath, workerWarmMs }));
    process.once('SIGTERM', () => void close());
    process.once('SIGINT', () => void close());
}
catch (error) {
    await close();
    throw error;
}
