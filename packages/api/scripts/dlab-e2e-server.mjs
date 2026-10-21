/** Test-only OS/provider doubles. Cove API and its authorization run unchanged.
 * Explicit local isolated DB required; never import this from application code.
 */
import { createServer } from 'node:http';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../dist/src/database/prisma.service.js';

const dbUrl = process.env.COVE_DLAB_TEST_DATABASE_URL;
const parsed = new URL(dbUrl ?? 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/cove_dlab_test') throw new Error('Isolated local cove_dlab_test DB required');
const origin = 'http://127.0.0.1:4320', studio = 'http://127.0.0.1:3309';
const clientSecret = 'local-e2e-client-secret-only-never-production';
const bffSecret = 'local-e2e-bff-secret-only-never-production';
const jwtSecret = 'local-e2e-jwt-secret-only-never-production';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: dbUrl, DIRECT_URL: dbUrl, PORT: '4319', WEB_ORIGIN: studio,
  SUPABASE_URL: 'https://dlab-sso-provider.invalid', SUPABASE_SECRET_KEY: 'local-e2e-admin-key',
  BFF_SHARED_SECRET: bffSecret, REDIS_URL: process.env.COVE_DLAB_TEST_REDIS_URL,
  MONITORING_REDIS_URL: process.env.COVE_DLAB_TEST_REDIS_URL, DLAB_SSO_ENABLED: 'true',
  DLAB_OS_BASE_URL: 'https://os.dlabcampus.com/v1', DLAB_SSO_ROLLOUT_MODE: 'campus',
  DLAB_CLIENT_ID: 'cove', DLAB_CLIENT_SECRET: clientSecret,
  DLAB_INBOUND_SERVER_KEY: 'local-e2e-inbound-key-only-never-production', DLAB_REDIRECT_URI: studio + '/sso/callback',
  GUI_ENABLED: 'false', VIDEO_LESSONS_ENABLED: 'false', SHORT_ANSWER_ENABLED: 'false', MULTIPLE_CHOICE_ENABLED: 'false',
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
    if (path === '/health') return json(res, { ok: true });
    if (path === '/fixtures' && req.method === 'POST') {
      const input = await body(req), id = randomUUID();
      const parent = input.parentFixtureId ? fixtures.get(input.parentFixtureId) : null;
      if (input.parentFixtureId && !parent) return json(res, { error: 'unknown_parent' }, 400);
      const campus = parent?.campus ?? randomUUID();
      const org = parent ? null : await db.organization.create({ data: { name: 'SSO browser fixture', slug: 'browser-' + id } });
      const academy = parent?.academy ?? await db.academy.create({ data: { organizationId: org.id, name: 'SSO Browser Academy', slug: 'sso-' + id } });
      if (!parent) await db.dlabCampus.create({ data: { externalCampusId: campus, name: academy.name, status: 'active', payloadHash: 'fixture', academyId: academy.id, ssoEnabled: input.enabled !== false } });
      const os = { external_user_id: id, external_campus_id: campus, external_campus_ids: [campus], name: 'Browser ' + (input.role ?? 'student'), user_role: input.role ?? 'student', account_status: 'active' };
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
        programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY', description: 'Read two numbers and print their sum.', starterCode: 'a, b = map(int, input().split())\nprint(a + b)', solutionCode: 'print(sum(map(int, input().split())))', testCases: { create: { position: 1, input: '2 3', expectedOutput: '5', visibility: 'SAMPLE' } } } },
      } });
      const written = await db.material.create({ data: { lectureId: lecture.id, title: 'Explain your addition', type: 'WRITTEN_RESPONSE', position: 2, isVisible: true,
        manualMaterial: { create: { description: 'Explain how your program adds two numbers.', includeInScore: true } },
      } });
      const classes = [];
      for (const name of ['Assigned Python class', 'Other Python class']) {
        const classroom = await db.class.create({ data: { academyId: fixture.academy.id, name, createdByUserId: owner.userId } });
        await db.classCourse.create({ data: { classId: classroom.id, courseId: course.id, assignedByUserId: owner.userId } });
        await db.classEnrollment.create({ data: { classId: classroom.id, membershipId: student.id, enrolledByUserId: owner.userId } });
        classes.push(classroom);
      }
      await db.exerciseDraft.create({ data: { userId: student.userId, materialId: material.id, sourceMaterialId: material.id, courseId: course.id, code: 'print(2 + 3)' } });
      await db.academyFeatureFlag.upsert({ where: { academyId_feature: { academyId: fixture.academy.id, feature: 'TEACHER_LIVE_MONITORING' } }, create: { academyId: fixture.academy.id, feature: 'TEACHER_LIVE_MONITORING', isEnabled: true }, update: { isEnabled: true } });
      return json(res, { courseId: course.id, lectureId: lecture.id, materialId: material.id, writtenMaterialId: written.id, studentMembershipId: student.id, classes });
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
await new Promise(resolve => server.listen(4320, '127.0.0.1', resolve));
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
  if (url.origin === 'https://os.dlabcampus.com' && url.pathname === '/v1/sso/token') return originalFetch(origin + '/os/token', init);
  if (url.origin === 'https://dlab-sso-provider.invalid') return originalFetch(origin + url.pathname + url.search, init);
  return originalFetch(input, init);
};
// Compiled application's actual Nest bootstrap, controllers, RPC and socket gateways.
await import('../dist/src/main.js');
process.on('SIGTERM', () => { server.close(); void redis.quit(); void db.$disconnect(); });
