// Local browser acceptance: real API/database/worker; only identity is synthetic.
// Invoked by test-c-cpp-local.sh, never by application boot.
import 'reflect-metadata';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { nextAuthFixture } from '../../../deploy/native/next-auth-fixture.mjs';
import { loopbackApplication } from '../../../deploy/native/loopback-application.mjs';
import { PrismaService } from '../dist/src/database/prisma.service.js';
import { sampleCheckViewSchema } from '@cove/shared';
import { SampleCheckService } from '../dist/src/learn/sample-check.service.js';

const directory = process.env.COVE_CPP_FIXTURE_DIR;
const database = new URL(process.env.DATABASE_URL ?? 'http://invalid');
const redis = new URL(process.env.REDIS_URL ?? 'http://invalid');
if (!directory || process.env.DOTENV_CONFIG_PATH !== '/dev/null' ||
    database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1' || database.pathname !== '/cove_native_test' ||
    redis.protocol !== 'redis:' || redis.hostname !== '127.0.0.1' || !redis.port)
  throw Error('Explicit disposable local database and Redis required');
const studio = 'http://127.0.0.1:3317', providerOrigin = 'http://127.0.0.1:4327';
const playground = process.env.COVE_CPP_PLAYGROUND === '1';
let apiReady = false;
const manifestPath = resolve(directory, 'shared/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest.gcc) throw Error('Real GCC manifest required');
const db = new PrismaService(new ConfigService({ DATABASE_URL: database.href }));
const ownership = await db.$queryRawUnsafe('SELECT fixture_id FROM native_qualification_fixture');
if (ownership.length !== 1 || ownership[0].fixture_id !== process.env.COVE_NATIVE_FIXTURE_ID)
  throw Error('Disposable database ownership mismatch');
const ids = Object.fromEntries(['organization', 'academy', 'manager', 'teacher', 'student', 'course', 'module', 'lecture', 'courseCpp', 'moduleCpp', 'lectureCpp', 'class', 'C', 'CPP', 'CPP10'].map(k => [k, randomUUID()]));
const identities = Object.fromEntries(['manager', 'teacher', 'student'].map(role => [role, { id: ids[role], authId: randomUUID() }]));
const slug = 'cpp-local-' + ids.academy.slice(0, 8);
await db.organization.create({ data: { id: ids.organization, name: 'Disposable C/C++ acceptance', slug } });
await db.academy.create({ data: { id: ids.academy, organizationId: ids.organization, name: playground ? 'Local C/C++ Practice' : 'C/C++ acceptance', slug, status: 'ACTIVE' } });
await db.user.createMany({ data: Object.entries(identities).map(([role, user]) => ({ id: user.id, authUserId: user.authId, username: role + ids.academy.slice(0, 8), displayName: 'Local ' + role, email: role + '@fixture.invalid', status: 'ACTIVE' })) });
for (const [role, user] of Object.entries(identities)) {
  const membership = await db.academyMembership.create({ data: { academyId: ids.academy, userId: user.id, role: role.toUpperCase(), status: 'ACTIVE', joinedAt: new Date() } });
  ids[role + 'Membership'] = membership.id;
}
await db.academyFeatureFlag.createMany({ data: [{ academyId: ids.academy, feature: 'TEACHER_LIVE_MONITORING', isEnabled: true }] });
// Two C/C++ courses: one holding the C problem, one the C++ ones. A C/C++
// course may mix both; each problem below chooses C or C++.
for (const [course, module, lecture, title] of [
  [ids.course, ids.module, ids.lecture, playground ? 'C Practice' : 'C browser acceptance'],
  [ids.courseCpp, ids.moduleCpp, ids.lectureCpp, playground ? 'C++ Practice' : 'C++ browser acceptance'],
]) {
  await db.course.create({ data: { id: course, academyId: ids.academy, createdByUserId: ids.manager, title, language: 'C_CPP', isVisible: true } });
  await db.courseModule.create({ data: { id: module, courseId: course, externalKey: randomUUID(), title: 'Native languages', position: 1, isVisible: true } });
  await db.lecture.create({ data: { id: lecture, courseModuleId: module, externalKey: randomUUID(), title: 'Addition', position: 1, isVisible: true } });
}
await db.class.create({ data: { id: ids.class, academyId: ids.academy, createdByUserId: ids.manager, teacherMembershipId: ids.teacherMembership, name: 'Local C/C++ class' } });
await db.classCourse.createMany({ data: [ids.course, ids.courseCpp].map(courseId => ({ classId: ids.class, courseId, assignedByUserId: ids.manager })) });
await db.classEnrollment.create({ data: { classId: ids.class, membershipId: ids.studentMembership, enrolledByUserId: ids.manager } });
const sources = {
  C: '#include <stdio.h>\nint main(void) { int a, b; if (scanf("%d %d", &a, &b) != 2) return 1; printf("%d\\n", a+b); return 0; }\n',
  CPP: '#include <bits/stdc++.h>\nusing namespace std;\nint main() { int a,b; if (!(cin >> a >> b)) return 1; cout << a+b << "\\n"; return 0; }\n',
};
for (const [index, [key, language, count]] of [['C', 'C', 2], ['CPP', 'CPP', 2], ['CPP10', 'CPP', 10]].entries()) {
  await db.material.create({ data: { id: ids[key], lectureId: language === 'C' ? ids.lecture : ids.lectureCpp, title: key + ' addition', type: 'PROGRAMMING_EXERCISE', position: index + 1, isVisible: true,
    programmingExercise: { create: { externalKey: randomUUID(), language, difficulty: 'EASY', description: '<p>Read two integers and print their sum.</p>', starterCode: sources[language], solutionCode: sources[language],
      timeLimitMs: 1000, memoryLimitMb: 512, gradingMode: 'ELICE_STDIO', gradingSemanticVersion: 'elice-v1', continuationPolicy: 'CONTINUE_WITHIN_BUDGET', exitStatusPolicy: 'FAIL_ON_RUNTIME_ERROR', totalTimeLimitMs: 60000, comparatorTimeLimitMs: 100,
      materialMaximumHundredths: 10000, materialScorePolicy: 'PROPORTIONAL', solutions: { create: { position: 1, code: sources[language] } },
      testCases: { create: Array.from({ length: count }, (_, i) => ({
        position: i + 1, input: i === 0 ? '2 3\n' : `${i} ${i + 1}\n`, expectedOutput: i === 0 ? '5' : String(2 * i + 1), visibility: i === 0 ? 'SAMPLE' : 'HIDDEN', weight: 1,
      })) } } },
  } });
}
await db.$disconnect();
const provider = nextAuthFixture(studio);
const auth = Object.fromEntries(Object.entries(identities).map(([role, user]) => [role, provider.storageState(user, providerOrigin)]));
async function beginStudent(state) {
  const cookie = state.cookies.find(c => c.name === 'sb-127-auth-token');
  const session = JSON.parse(Buffer.from(cookie.value.slice(7), 'base64url').toString());
  const begin = await fetch('http://127.0.0.1:4317/api/rpc/studentSession/begin', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, 'X-Cove-Bff-Secret': process.env.BFF_SHARED_SECRET },
    body: JSON.stringify({ json: {} }), signal: AbortSignal.timeout(10_000),
  });
  if (!begin.ok) throw Error('Synthetic student sign-in could not create its inactivity lease: ' + await begin.text());
}
async function handlePlayground(request, response, url) {
  if (!playground || request.method !== 'GET' || !['/', '/playground/login'].includes(url.pathname)) return false;
  if (request.headers.host !== '127.0.0.1:4327' || (url.pathname === '/playground/login' && request.headers['sec-fetch-site'] === 'cross-site')) {
    response.writeHead(403).end('Local playground only'); return true;
  }
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (!apiReady) { response.writeHead(503, { 'Retry-After': '1' }).end('The practice app is starting. Refresh shortly.'); return true; }
  if (url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local C and C++ Practice</title>
<body style="font:17px/1.6 system-ui;max-width:760px;margin:60px auto;padding:0 24px;color:#172033;background:#f5f7fb">
<h1>C and C++ Practice</h1><p>Your local Cove course is ready. Choose a problem to sign in as the student. No password is needed.</p>
<ul><li><a href="/playground/login?role=student&problem=C">C — Add two numbers</a></li><li><a href="/playground/login?role=student&problem=CPP">C++ — Add two numbers</a></li><li><a href="/playground/login?role=student&problem=CPP10">C++ — Ten test cases</a></li></ul>
<p>The starter code already works. Enter <code>40 2</code> in <strong>Program input</strong>, click <strong>Run</strong>, and expect <code>42</code>. Then try <strong>Test run</strong> and <strong>Submit</strong>.</p>
<p>To try a compiler error, remove a semicolon. To try a runtime error, replace the code with <code>int main(void) { return 3; }</code>. Reset restores the working starter code.</p>
<p><a href="/playground/login?role=teacher">Open the teacher's class</a> · <a href="/playground/login?role=manager">Open course authoring as manager</a></p>
<p>Switching roles changes the account in this browser. Use a separate browser or private window to keep two roles open.</p>
<p style="font-size:14px;color:#5c6474">This is a disposable local database. Stopping the playground removes its course and submissions. Restart with <code>pnpm dev:c-cpp</code>; stop with <code>pnpm dev:c-cpp:stop</code>.</p></body></html>`);
    return true;
  }
  const role = url.searchParams.get('role');
  if (!['student', 'teacher', 'manager'].includes(role)) { response.writeHead(400).end('Choose a local role'); return true; }
  const state = provider.storageState(identities[role], providerOrigin);
  if (role === 'student') await beginStudent(state);
  response.setHeader('Set-Cookie', state.cookies.map(cookie => `${cookie.name}=${cookie.value}; Path=/; SameSite=Lax; Max-Age=3600`));
  const problem = ['C', 'CPP', 'CPP10'].includes(url.searchParams.get('problem')) ? url.searchParams.get('problem') : 'C';
  const target = role === 'student' ? `/academy/${slug}/learn/exercises/${ids[problem]}?classId=${ids.class}`
    : role === 'teacher' ? `/academy/${slug}/teach/classes/${ids.class}/progress`
    : `/academy/${slug}/content/courses/${ids.course}`;
  response.writeHead(302, { Location: studio + target }).end();
  return true;
}
const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url, providerOrigin);
    if (await handlePlayground(request, response, url)) return;
    if (!(await provider.handle(request, response, url))) response.writeHead(404).end();
  })().catch(() => response.writeHead(500).end('Local sign-in failed; check the playground API log.'));
});
await new Promise(r => server.listen(4327, '127.0.0.1', r));
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: '4317', WEB_ORIGIN: studio, DIRECT_URL: database.href,
  SUPABASE_URL: 'https://cpp-fixture-provider.invalid', SUPABASE_SECRET_KEY: 'local-cpp-fixture-private-key',
  BFF_SHARED_SECRET: 'local-cpp-bff-secret-only-never-production', MONITORING_REDIS_URL: redis.href,
  NATIVE_GRADING_ENABLED: 'true', NATIVE_GRADING_BRIDGE_ACK: 'filtered-compatibility-workers-v1', NATIVE_GRADING_MANIFEST: manifestPath,
  SUBMISSION_RATE_LIMIT: '100', SAMPLE_CHECK_PER_MINUTE: '60',
  DLAB_SSO_ENABLED: 'false', GUI_ENABLED: 'false', VIDEO_LESSONS_ENABLED: 'false',
});
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
  return realFetch(url.origin === 'https://cpp-fixture-provider.invalid' ? providerOrigin + url.pathname + url.search : input, init);
};
const create = NestFactory.create.bind(NestFactory);
// Keep contract failures diagnosable without logging source or case input.
const getCheck = SampleCheckService.prototype.get;
SampleCheckService.prototype.get = async function (...args) {
  const view = await getCheck.apply(this, args);
  const validated = sampleCheckViewSchema.safeParse(view);
  if (!validated.success) console.error('Invalid local sample-check response', JSON.stringify({ issues: validated.error.issues, timings: view.timings }));
  return view;
};
NestFactory.create = async (...args) => loopbackApplication(await create(...args), async () => {
  await beginStudent(auth.student);
  await writeFile(resolve(directory, 'browser.json'), JSON.stringify({ ids, slug, sources, auth }), { mode: 0o600 });
  apiReady = true;
  console.log('Local C/C++ acceptance API ready');
});
// ConfigModule cannot load the checkout's .env after entering the owned fixture.
process.chdir(directory);
await import(new URL('../dist/src/main.js', import.meta.url));
