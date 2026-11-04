/** Test-only OS/provider doubles. Cove API and its authorization run unchanged.
 * Explicit local isolated DB required; never import this from application code.
 */
import { createServer } from 'node:http';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
const apiBuild = new URL(process.env.COVE_DLAB_API_BUILD_DIR ? process.env.COVE_DLAB_API_BUILD_DIR.replace(/\/$/, '') + '/' : '../dist/', import.meta.url);
const { PrismaService } = await import(new URL('src/database/prisma.service.js', apiBuild));
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dbUrl = process.env.COVE_DLAB_TEST_DATABASE_URL;
const parsed = new URL(dbUrl ?? 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/cove_dlab_test') throw new Error('Isolated local cove_dlab_test DB required');
const origin = 'http://127.0.0.1:4320', studio = 'http://127.0.0.1:3309';
const clientSecret = 'local-e2e-client-secret-only-never-production';
const bffSecret = 'local-e2e-bff-secret-only-never-production';
const jwtSecret = 'local-e2e-jwt-secret-only-never-production';
const observationPeer = process.env.COVE_OBSERVATION_PEER === '1';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: dbUrl, DIRECT_URL: dbUrl, PORT: observationPeer ? '4339' : '4319', WEB_ORIGIN: studio,
  SUPABASE_URL: 'https://dlab-sso-provider.invalid', SUPABASE_SECRET_KEY: 'local-e2e-admin-key',
  BFF_SHARED_SECRET: bffSecret, REDIS_URL: process.env.COVE_DLAB_TEST_REDIS_URL,
  MONITORING_REDIS_URL: process.env.COVE_DLAB_TEST_REDIS_URL, DLAB_SSO_ENABLED: 'true',
  DLAB_OS_BASE_URL: 'https://os.dlabcampus.com/v1', DLAB_SSO_ROLLOUT_MODE: 'campus',
  DLAB_CLIENT_ID: 'cove', DLAB_CLIENT_SECRET: clientSecret,
  DLAB_INBOUND_SERVER_KEY: 'local-e2e-inbound-key-only-never-production', DLAB_REDIRECT_URI: studio + '/sso/callback',
  GUI_ENABLED: process.env.COVE_OBSERVATION_E2E === '1' ? 'true' : 'false', VIDEO_LESSONS_ENABLED: 'true', SHORT_ANSWER_ENABLED: 'true', MULTIPLE_CHOICE_ENABLED: 'true',
  ...(process.env.COVE_OBSERVATION_E2E === '1' ? { GUI_SERVICE_URL: 'http://127.0.0.1:4029', GUI_PUBLIC_WS_URL: 'ws://127.0.0.1:4029', GUI_SERVICE_SECRET: 'local-observation-runtime-secret-never-production' } : {}),
});
const db = new PrismaService(new ConfigService({ DATABASE_URL: dbUrl }));
const redis = new Redis(process.env.COVE_DLAB_TEST_REDIS_URL);
const authUsers = new Map(), hashes = new Map(), codes = new Map(), fixtures = new Map(), sessions = new Map(), refreshes = new Map();
const json = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const redirect = (res, target) => { res.writeHead(302, { location: target, 'cache-control': 'no-store' }); res.end(); };
async function body(req) { let text = ''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; }
function sign(claims) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return h + '.' + p + '.' + createHmac('sha256', jwtSecret).update(h + '.' + p).digest('base64url');
}
function claims(token) {
  const [h, p, s] = (token ?? '').split('.'); if (!h || !p || !s) return null;
  const expected = createHmac('sha256', jwtSecret).update(h + '.' + p).digest('base64url');
  if (s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
  const parsed = JSON.parse(Buffer.from(p, 'base64url').toString());
  return sessions.has(parsed.session_id) && parsed.exp > Date.now() / 1000 ? parsed : null;
}
function session(user, previous) {
  const id = previous ?? randomUUID(), now = Math.floor(Date.now() / 1000);
  sessions.set(id, user.id);
  const refresh = randomUUID(); refreshes.set(refresh, { id, user });
  return { access_token: sign({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, email_verified: true, user_metadata: user.user_metadata, app_metadata: user.app_metadata, session_id: id, iat: now, exp: now + 86400, iss: origin + '/auth/v1' }), token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: refresh, user };
}
function authUser(input) {
  return { id: input.id ?? randomUUID(), aud: 'authenticated', role: 'authenticated', email: input.email, email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'], ...input.app_metadata }, user_metadata: input.user_metadata ?? {}, identities: [] };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin), path = url.pathname;
    // Local tests only. Cross-origin browser provider calls receive normal CORS.
    res.setHeader('Access-Control-Allow-Origin', studio);
    res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') return res.end();
    if (process.env.COVE_OBSERVATION_E2E === '1' && path.startsWith('/storage/v1/object/authenticated/course-videos/')) {
      const name = path.split('/').at(-1);
      if (!/^(master\.m3u8|playback\.mp4|poster\.jpg|segment-\d{3}\.ts)$/.test(name)) return json(res, {}, 404);
      const bytes = await readFile(join(process.env.COVE_OBSERVATION_MEDIA_DIR, name === 'playback.mp4' ? 'video.mp4' : name));
      const mime = name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.jpg') ? 'image/jpeg' : 'video/mp2t';
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
      if (range) { const from = Number(range[1]), to = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        res.writeHead(206, { 'content-type': mime, 'content-range': `bytes ${from}-${to}/${bytes.length}`, 'content-length': to - from + 1, 'accept-ranges': 'bytes' }); return res.end(bytes.subarray(from, to + 1)); }
      res.writeHead(200, { 'content-type': mime, 'content-length': bytes.length, 'accept-ranges': 'bytes' }); return res.end(bytes);
    }
    if (path.startsWith('/storage/v1/object/sign/') && req.method === 'POST') return json(res, { signedURL: '/object/sign/fixture.pdf?token=local-test-only' });
    if (path === '/health') return json(res, { ok: true });
    if (path === '/fixtures' && req.method === 'POST') {
      const input = await body(req), id = randomUUID();
      const parent = input.parentFixtureId ? fixtures.get(input.parentFixtureId) : null;
      if (input.parentFixtureId && !parent) return json(res, { error: 'unknown_parent' }, 400);
      const campus = parent?.campus ?? randomUUID();
      const org = parent ? null : await db.organization.create({ data: { name: 'SSO browser fixture', slug: 'browser-' + id } });
      const academy = parent?.academy ?? await db.academy.create({ data: { organizationId: org.id, name: 'SSO Browser Academy', slug: 'sso-' + id } });
      if (!parent) await db.dlabCampus.create({ data: { externalCampusId: campus, name: academy.name, status: 'active', payloadHash: 'fixture', academyId: academy.id, ssoEnabled: input.enabled !== false } });
      const os = { external_user_id: id, external_campus_id: campus, external_campus_ids: [campus], name: input.name ?? 'Browser ' + (input.role ?? 'student'), user_role: input.role ?? 'student', account_status: 'active' };
      fixtures.set(id, { os, academy, campus });
      if (input.legacy) {
        const email = 'legacy-' + id + '@example.test', user = authUser({ id, email, user_metadata: { full_name: os.name } });
        authUsers.set(id, user);
        await db.user.create({ data: { id, authUserId: id, email, username: 'legacy_' + id.replaceAll('-', '').slice(0, 20), displayName: os.name, status: 'ACTIVE', platformRole: input.role === 'ADMIN' ? 'ADMIN' : 'USER' } });
        if (input.role !== 'ADMIN') await db.academyMembership.create({ data: { academyId: academy.id, userId: id, role: input.role, status: 'ACTIVE', joinedAt: new Date() } });
        return json(res, { id, academy, email, username: 'legacy_' + id.replaceAll('-', '').slice(0, 20) });
      }
      return json(res, { id, academy, campus });
    }
    if (/^\/fixtures\/[^/]+\/classroom$/.test(path) && req.method === 'POST') {
      const id = path.split('/')[2], fixture = fixtures.get(id), input = await body(req);
      if (!fixture) return json(res, { error: 'unknown_fixture' }, 404);
      const owner = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: id } });
      const studentIdentity = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: input.studentFixtureId } });
      const student = await db.academyMembership.findUniqueOrThrow({ where: { academyId_userId: { academyId: fixture.academy.id, userId: studentIdentity.userId } } });
      const course = await db.course.create({ data: { academyId: fixture.academy.id, title: 'SSO Python classroom', isVisible: true, createdByUserId: owner.userId } });
      const module = await db.courseModule.create({ data: { courseId: course.id, title: 'Python basics', externalKey: randomUUID(), position: 1, isVisible: true } });
      const lecture = await db.lecture.create({ data: { courseModuleId: module.id, title: 'Addition lesson', externalKey: randomUUID(), position: 1, isVisible: true } });
      const material = await db.material.create({ data: { lectureId: lecture.id, title: 'Add two numbers', type: 'PROGRAMMING_EXERCISE', position: 1, isVisible: true,
        programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY', description: '<p>Read two numbers and print their sum.</p>', inputFormat: 'Two integers separated by a space.', outputFormat: 'One integer: their sum.', constraints: 'Each integer is between 0 and 100.', starterCode: 'a, b = map(int, input().split())\nprint(a + b)', solutionCode: 'print(sum(map(int, input().split())))', testCases: { create: { position: 1, input: '2 3', expectedOutput: '5', visibility: 'SAMPLE' } } } },
      } });
      const written = await db.material.create({ data: { lectureId: lecture.id, title: 'Explain your addition', type: 'WRITTEN_RESPONSE', position: 2, isVisible: true,
        manualMaterial: { create: { description: 'Explain how your program adds two numbers.', includeInScore: true } },
      } });
      const short = await db.material.create({ data: { lectureId: lecture.id, title: 'Name the language', type: 'WRITTEN_RESPONSE', position: 3, isVisible: true,
        manualMaterial: { create: { description: 'Name the language used in this lesson.', includeInScore: true, files: {}, shortAnswer: { version: 1, question: 'Which language adds these numbers?', gradingMode: 'EXACT', expectedAnswer: 'Python', pattern: '', explanationEnabled: false, explanation: '' } } },
      } });
      const correctId = randomUUID(), incorrectId = randomUUID();
      const quiz = await db.material.create({ data: { lectureId: lecture.id, title: 'Choose the operator', type: 'MULTIPLE_CHOICE', position: 4, isVisible: true,
        manualMaterial: { create: { description: 'Choose the addition operator.', includeInScore: true, files: {}, multipleChoice: { version: 1, question: 'Which operator adds numbers?', problemDescription: '', selectionMode: 'SINGLE', options: [{ id: correctId, content: '+' }, { id: incorrectId, content: '-' }], correctOptionIds: [correctId], shuffleOptions: false, explanationEnabled: true, explanation: 'The plus operator adds two values.' } } },
      } });
      let pdfMaterialId, videoMaterialId;
      if (input.includePdf) {
        // Move from the end first to preserve the unique lecture/position index.
        await db.material.update({ where: { id: quiz.id }, data: { position: 5 } });
        await db.material.update({ where: { id: short.id }, data: { position: 4 } });
        const asset = await db.pdfAsset.create({ data: {
          objectKey: 'fixture-' + randomUUID() + '.pdf', originalFilename: 'lecture-material.pdf',
          byteSize: 880, checksumSha256: 'fixture-checksum', pageCount: 1, state: 'READY',
          uploaderUserId: owner.userId, academyId: fixture.academy.id, courseId: course.id, lectureId: lecture.id,
        } });
        const document = await db.material.create({ data: { lectureId: lecture.id, title: 'Lesson reference PDF', type: 'PDF_DOCUMENT', position: 3,
          isVisible: true, pdfDocument: { create: { assetId: asset.id, placement: 'MAIN' } },
        } });
        // Deliberately third, matching the reported sidebar click.
        pdfMaterialId = document.id;
        const video = await db.videoAsset.create({ data: {
          requestKey: randomUUID(), objectKey: 'fixture-video-' + randomUUID(), uploaderUserId: owner.userId,
          academyId: fixture.academy.id, courseId: course.id, lectureId: lecture.id,
          filename: 'lesson.mp4', byteSize: 100n, durationMs: 10000, state: 'READY', outputs: process.env.COVE_OBSERVATION_E2E === '1'
            ? ['fixture/master.m3u8', 'fixture/playback.mp4', 'fixture/poster.jpg', 'fixture/segment-000.ts'] : [],
        } });
        const videoMaterial = await db.material.create({ data: {
          lectureId: lecture.id, title: 'Lesson video', type: 'VIDEO_LESSON', position: 6, isVisible: true,
          videoLesson: { create: { assetId: video.id, requestKey: randomUUID(), description: 'A video lesson about addition.' } },
        } });
        videoMaterialId = videoMaterial.id;
      }
      let turtleMaterialId;
      if (input.includeTurtle && process.env.COVE_OBSERVATION_E2E === '1') {
        const health = await (await fetch('http://127.0.0.1:4029/health', { headers: { Authorization: 'Bearer local-observation-runtime-secret-never-production' } })).json();
        const drawing = await db.material.create({ data: { lectureId: lecture.id, title: 'Draw a red square', type: 'TURTLE_EXERCISE', position: 7, isVisible: true,
          manualMaterial: { create: { description: 'Draw a red square and print a message.', runtimeVersion: health.runtimeVersion,
            width: 640, height: 480, files: { 'main.py': "import turtle\nt = turtle.Turtle()\nt.color('red')\nt.begin_fill()\nfor _ in range(4):\n    t.forward(90)\n    t.left(90)\nt.end_fill()\nprint('MONITORED TURTLE', flush=True)\nturtle.mainloop()" } } } } });
        turtleMaterialId = drawing.id;
      }
      const classes = [];
      for (const name of ['Assigned Python class', 'Other Python class']) {
        const classroom = await db.class.create({ data: { academyId: fixture.academy.id, name, description: 'Development demo: Browser tutor teaches Browser student.', createdByUserId: owner.userId } });
        await db.classCourse.create({ data: { classId: classroom.id, courseId: course.id, assignedByUserId: owner.userId } });
        await db.classEnrollment.create({ data: { classId: classroom.id, membershipId: student.id, enrolledByUserId: owner.userId } });
        classes.push(classroom);
      }
      let reviewStudentMembershipId;
      if (input.reviewStudentFixtureId) {
        const reviewIdentity = await db.dlabIdentity.findUniqueOrThrow({where:{externalUserId:input.reviewStudentFixtureId}});
        const reviewMember = await db.academyMembership.findUniqueOrThrow({where:{academyId_userId:{academyId:fixture.academy.id,userId:reviewIdentity.userId}}});
        reviewStudentMembershipId = reviewMember.id;
        await db.classEnrollment.create({data:{classId:classes[0].id,membershipId:reviewMember.id,enrolledByUserId:owner.userId}});
        await db.submission.create({data:{userId:reviewMember.userId,materialId:material.id,sourceMaterialId:material.id,courseId:course.id,classId:classes[0].id,
          gradingRevision:1,engineVersion:'pyodide-0.27.5',language:'PYTHON',timeLimitMs:2000,memoryLimitMb:128,code:'print("OFFLINE STUDENT SUBMISSION")',status:'PASSED',totalCount:1,passedCount:1,score:100,
          problemTitle:material.title,courseTitle:course.title,moduleTitle:module.title,lectureTitle:lecture.title,modulePosition:1,lecturePosition:1,problemPosition:1}});
        await db.studentExerciseProgress.create({data:{userId:reviewMember.userId,materialId:material.id,status:'SOLVED',attemptCount:1,bestScore:100,bestPassed:1,gradingRevision:1}});
      }
      if (input.seedHistory) {
        for (const [index, code] of ['print("HISTORICAL FIRST")', 'print("HISTORICAL LATEST")'].entries()) {
          await db.submission.create({ data: { userId: student.userId, materialId: material.id, sourceMaterialId: material.id, courseId: course.id, classId: classes[0].id,
            gradingRevision: 1, engineVersion: 'pyodide-0.27.5', language: 'PYTHON', timeLimitMs: 2000, memoryLimitMb: 128, code, status: 'PASSED', totalCount: 1, passedCount: 1, score: 100,
            problemTitle: material.title, courseTitle: course.title, moduleTitle: module.title, lectureTitle: lecture.title, modulePosition: 1, lecturePosition: 1, problemPosition: 1,
            createdAt: new Date(Date.now() - (2-index)*60000) } });
        }
        await db.studentExerciseProgress.create({ data: { userId: student.userId, materialId: material.id, status: 'SOLVED', attemptCount: 2, bestScore: 100, bestPassed: 1, gradingRevision: 1 } });
        const config = await db.manualMaterial.findUniqueOrThrow({ where: { materialId: short.id } });
        for (let index=0;index<35;index++) {
          await db.manualSubmission.create({ data: { materialId: short.id, userId: student.userId, classId: classes[0].id, files: {}, answer: 'SAVED ANSWER '+index, profile: config, revision: 1, maximumHundredths: 10000, includeInScore: true, requestKey: randomUUID(), createdAt: new Date(Date.now()-(40-index)*60000) } });
        }
        if (turtleMaterialId) {
          const turtle = await db.manualMaterial.findUniqueOrThrow({where:{materialId:turtleMaterialId}});
          await db.manualSubmission.create({data:{materialId:turtleMaterialId,userId:student.userId,classId:classes[0].id,files:{'main.py':"import turtle\nprint('SAVED TURTLE', flush=True)\nturtle.circle(20)\nturtle.done()"},answer:'',profile:turtle,revision:1,maximumHundredths:10000,includeInScore:false,requestKey:randomUUID()}});
        }
      }
      if (input.seedDrafts && turtleMaterialId) {
        await db.manualDraft.create({data:{materialId:turtleMaterialId,userId:student.userId,files:{'main.py':"import turtle\nprint('SAVED TURTLE DRAFT', flush=True)\nturtle.circle(20)\nturtle.done()"},revision:1}});
      }
      if (!input.emptyWork) await db.exerciseDraft.create({ data: { userId: student.userId, materialId: material.id, sourceMaterialId: material.id, courseId: course.id, code: 'print(2 + 3)' } });
      await db.academyFeatureFlag.upsert({ where: { academyId_feature: { academyId: fixture.academy.id, feature: 'TEACHER_LIVE_MONITORING' } }, create: { academyId: fixture.academy.id, feature: 'TEACHER_LIVE_MONITORING', isEnabled: true }, update: { isEnabled: true } });
      return json(res, { reviewStudentMembershipId, turtleMaterialId, pdfMaterialId, videoMaterialId, courseId: course.id, lectureId: lecture.id, materialId: material.id, writtenMaterialId: written.id, shortMaterialId: short.id, quizMaterialId: quiz.id, studentMembershipId: student.id, classes });
    }
    if (path.startsWith('/fixtures/') && req.method === 'PUT') {
      const id = path.split('/')[2], fixture = fixtures.get(id), input = await body(req);
      if (!fixture) return json(res, { error: 'unknown_fixture' }, 404);
      if (input.role) fixture.os.user_role = input.role;
      if (input.status) fixture.os.account_status = input.status;
      fixture.version = Math.max(Date.now(), (fixture.version ?? 0) + 1);
      const response = await originalFetch('http://127.0.0.1:4319/api/integrations/dlab/v1/users/' + id, {
        method: 'PUT', headers: { Authorization: 'Bearer ' + process.env.DLAB_INBOUND_SERVER_KEY, 'Content-Type': 'application/json', 'X-Request-Id': randomUUID() },
        body: JSON.stringify({ ...fixture.os, updated_at: new Date(fixture.version).toISOString() }),
      });
      return json(res, { ok: response.ok }, response.status);
    }
    if (path.startsWith('/fixtures/') && req.method === 'GET') {
      const id = path.split('/')[2];
      const identity = await db.dlabIdentity.findUnique({ where: { externalUserId: id }, include: { user: true, bindings: { include: { membership: { include: { extraRoles: true } } } } } });
      const sessionIds = [...sessions].filter(([, userId]) => userId === identity?.user?.authUserId).map(([id]) => id);
      const leases = await Promise.all(sessionIds.map(id => redis.get('cove:student-session:' + id)));
      return json(res, identity ? { studentLeaseCount: leases.filter(Boolean).length, userId: identity.userId, role: identity.userRole, generation: identity.generation, platformRole: identity.user?.platformRole, memberships: identity.bindings.map(b => ({ id: b.membershipId, role: b.membership.role, roles: [b.membership.role, ...b.membership.extraRoles.map(r => r.role)], status: b.membership.status })) } : null);
    }
    if (path === '/os/authorize') {
      const callback = new URL(url.searchParams.get('redirect_uri'));
      if (callback.origin !== studio || callback.pathname !== '/sso/callback' || url.searchParams.get('client_id') !== 'cove') return json(res, { error: 'bad_registration' }, 400);
      const selected = url.searchParams.get('fixture');
      if (!fixtures.has(selected)) return json(res, { error: 'missing_fixture' }, 400);
      const code = randomUUID(); codes.set(code, { fixture: selected, callback: callback.toString() });
      callback.searchParams.set('code', code); callback.searchParams.set('state', url.searchParams.get('state'));
      return redirect(res, callback.toString());
    }
    if (path === '/os/token') {
      const input = await body(req), saved = codes.get(input.code); codes.delete(input.code);
      if (req.headers.authorization !== 'Basic ' + Buffer.from('cove:' + clientSecret).toString('base64') || !saved || input.redirect_uri !== saved.callback) return json(res, { code: 'invalid_field' }, 400);
      return json(res, fixtures.get(saved.fixture).os);
    }
    if (path.startsWith('/auth/v1/admin/') && (req.headers.apikey !== 'local-e2e-admin-key' || req.headers.authorization !== 'Bearer local-e2e-admin-key')) return json(res, { msg: 'Admin key required' }, 401);
    if (path.startsWith('/auth/v1/admin/users/') && req.method === 'GET') {
      const user = authUsers.get(path.split('/').at(-1));
      return json(res, user ?? { code: 'user_not_found', msg: 'User not found' }, user ? 200 : 404);
    }
    if (path === '/auth/v1/admin/users' && req.method === 'POST') {
      const user = authUser(await body(req)); authUsers.set(user.id, user); return json(res, user);
    }
    if (path === '/auth/v1/admin/generate_link') {
      const input = await body(req), user = [...authUsers.values()].find(u => u.email === input.email);
      if (!user) return json(res, { msg: 'User not found' }, 404);
      const hash = randomUUID(); hashes.set(hash, user);
      return json(res, { ...user, hashed_token: hash, action_link: origin + '/auth/v1/verify', verification_type: 'magiclink', email_otp: '000000', redirect_to: studio });
    }
    if (path === '/auth/v1/verify') {
      const input = await body(req), user = hashes.get(input.token_hash); hashes.delete(input.token_hash);
      return user ? json(res, session(user)) : json(res, { msg: 'Invalid token' }, 400);
    }
    if (path === '/auth/v1/user' && req.method === 'GET') {
      const token = claims(req.headers.authorization?.replace(/^Bearer /, ''));
      return token ? json(res, authUsers.get(token.sub)) : json(res, { msg: 'Invalid token' }, 401);
    }
    if (path === '/auth/v1/token') {
      const input = await body(req);
      if (url.searchParams.get('grant_type') === 'password') {
        const user = [...authUsers.values()].find(u => u.email === input.email && !u.app_metadata.dlab_managed);
        return user && input.password === 'LocalLegacyTest123!' ? json(res, session(user)) : json(res, { code: 'invalid_credentials', msg: 'Invalid credentials' }, 400);
      }
      const saved = refreshes.get(input.refresh_token);
      return saved && sessions.has(saved.id) ? json(res, session(saved.user, saved.id)) : json(res, { msg: 'Invalid refresh' }, 400);
    }
    if (path === '/auth/v1/logout') {
      const token = claims(req.headers.authorization?.replace(/^Bearer /, '')); if (token) sessions.delete(token.session_id);
      res.writeHead(204); return res.end();
    }
    return json(res, { error: 'unhandled_fixture_route', path }, 404);
  } catch (error) { console.error('fixture error', error.message); json(res, { error: 'fixture_failure' }, 500); }
});
// Dashboard compilation can outlast Node's default five-second idle timeout.
server.keepAliveTimeout = 60_000;
server.headersTimeout = 65_000;
// A second real Nest process shares the first process's provider and storage.
if (!observationPeer) await new Promise(resolve => server.listen(4320, '127.0.0.1', resolve));
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
  if (url.origin === 'https://os.dlabcampus.com' && url.pathname === '/v1/sso/token') return originalFetch(origin + '/os/token', init);
  if (url.origin === 'https://dlab-sso-provider.invalid') return originalFetch(origin + url.pathname + url.search, init);
  return originalFetch(input, init);
};
// Compiled application's actual Nest bootstrap, controllers, RPC and socket gateways.
await import(new URL('src/main.js', apiBuild));
process.on('SIGTERM', () => { if (server.listening) server.close(); void redis.quit(); void db.$disconnect(); });
