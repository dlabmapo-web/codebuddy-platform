/** Test-only OS/provider doubles. Cove API and its authorization run unchanged.
 * Explicit local isolated DB required; never import this from application code.
 */
import { createServer } from 'node:http';
import { randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
const apiBuild = new URL(process.env.COVE_DLAB_API_BUILD_DIR ? process.env.COVE_DLAB_API_BUILD_DIR.replace(/\/$/, '') + '/' : '../dist/', import.meta.url);
const { PrismaService } = await import(new URL('src/database/prisma.service.js', apiBuild));
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dbUrl = process.env.COVE_DLAB_TEST_DATABASE_URL;
const parsed = new URL(dbUrl ?? 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/cove_dlab_test') throw new Error('Isolated local cove_dlab_test DB required');
const providerPort = Number(process.env.COVE_DLAB_TEST_PROVIDER_PORT ?? 4320);
const apiPort = Number(process.env.COVE_DLAB_TEST_API_PORT ?? (process.env.COVE_OBSERVATION_PEER === '1' ? 4339 : 4319));
const origin = `http://127.0.0.1:${providerPort}`;
const studio = `http://127.0.0.1:${Number(process.env.COVE_DLAB_TEST_WEB_PORT ?? 3309)}`;
const api = `http://127.0.0.1:${apiPort}`;
const clientSecret = 'local-e2e-client-secret-only-never-production';
const bffSecret = 'local-e2e-bff-secret-only-never-production';
const jwtSecret = 'local-e2e-jwt-secret-only-never-production';
const observationPeer = process.env.COVE_OBSERVATION_PEER === '1';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: dbUrl, DIRECT_URL: dbUrl, PORT: String(apiPort), WEB_ORIGIN: studio,
  SUPABASE_URL: 'https://dlab-sso-provider.invalid', SUPABASE_SECRET_KEY: 'local-e2e-admin-key',
  BFF_SHARED_SECRET: bffSecret, REDIS_URL: process.env.COVE_DLAB_TEST_REDIS_URL,
  MONITORING_REDIS_URL: process.env.COVE_DLAB_TEST_REDIS_URL, DLAB_SSO_ENABLED: 'true',
  DLAB_DIRECTORY_SYNC_ENABLED: 'true', DLAB_OS_BASE_URL: 'https://os.dlabcampus.com/v1', DLAB_SSO_ROLLOUT_MODE: 'campus',
  DLAB_AUTO_PROVISION_CAMPUSES: 'true',
  DLAB_CLIENT_ID: 'cove', DLAB_CLIENT_SECRET: clientSecret,
  DLAB_INBOUND_SERVER_KEY: 'local-e2e-inbound-key-only-never-production', DLAB_REDIRECT_URI: studio + '/sso/callback',
  GUI_ENABLED: process.env.COVE_OBSERVATION_E2E === '1' ? 'true' : 'false', VIDEO_LESSONS_ENABLED: 'true', SHORT_ANSWER_ENABLED: 'true', MULTIPLE_CHOICE_ENABLED: 'true',
  ...(process.env.COVE_OBSERVATION_E2E === '1' ? { GUI_SERVICE_URL: 'http://127.0.0.1:4029', GUI_PUBLIC_WS_URL: 'ws://127.0.0.1:4029', GUI_SERVICE_SECRET: 'local-observation-runtime-secret-never-production' } : {}),
});
// The AI assistant runs unchanged; only OpenAI's address is answered here. A
// person may send the local demo to the real model with their own key.
const aiE2e = process.env.COVE_AI_ASSISTANT_E2E === '1';
// Read here and nowhere else, so the key is in no environment the web or grader sees.
const aiRealKey = aiE2e && process.env.COVE_AI_ASSISTANT_REAL_MODEL === '1'
  ? (await readFile(new URL('../.env.local', import.meta.url), 'utf8')).match(/^OPENAI_API_KEY=["']?([^"'\s]+)/m)?.[1]
  : undefined;
if (aiE2e && process.env.COVE_AI_ASSISTANT_REAL_MODEL === '1' && !aiRealKey) throw new Error('No OPENAI_API_KEY in packages/api/.env.local');
if (aiE2e) Object.assign(process.env, {
  OPENAI_API_KEY: aiRealKey || 'local-e2e-model-key-never-production', AI_ASSISTANT_ENABLED: 'true', AI_LIBRARY_ENABLED: 'true',
  AI_LIBRARY_HOURS: '0-24', AI_LIBRARY_QUIET_MINUTES: '0', AI_ASSISTANT_MONTHLY_BUDGET_USD: '1', AI_LIBRARY_MONTHLY_BUDGET_USD: '1',
  // Four answers per problem a day: the browser test's story reaches the limit on the fourth.
  AI_ASSISTANT_PROBLEM_LIMIT: '4',
});
// Nest reads `.env.local` too: an empty key here keeps a developer's out of other suites.
else process.env.OPENAI_API_KEY = '';
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
const aiProblem = {
  description: '<p>Read a whole number N and print the sum of all whole numbers from 1 to N.</p>', inputFormat: 'One whole number N.', outputFormat: 'The sum.',
  constraints: '1 to 100.', starterCode: '', solutionCode: 'n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)',
};
/** Invented beginner problems for the playground with the real model. */
const playgroundProblems = [
  { title: 'Bigger number', description: '<p>Read two whole numbers, one per line, and print the bigger one.</p>', inputFormat: 'Two whole numbers, one per line.', outputFormat: 'The bigger number.', constraints: '-100 to 100.',
    solutionCode: 'a = int(input())\nb = int(input())\nif a > b:\n    print(a)\nelse:\n    print(b)', tests: [['3\n8', '8', 'SAMPLE'], ['10\n2', '10', 'SAMPLE'], ['-5\n-9', '-5', 'HIDDEN'], ['7\n7', '7', 'HIDDEN']] },
  { title: 'Count the vowels', description: '<p>Read a sentence and print how many vowels (a, e, i, o, u) it has. Capital letters count too.</p>', inputFormat: 'One sentence.', outputFormat: 'The number of vowels.', constraints: '1 to 50 characters.',
    solutionCode: 's = input()\ncount = 0\nfor ch in s.lower():\n    if ch in "aeiou":\n        count += 1\nprint(count)',
    tests: [['banana', '3', 'SAMPLE'], ['sky', '0', 'SAMPLE'], ['Apple Pie', '4', 'HIDDEN'], ['EDUCATION', '5', 'HIDDEN'], ['hello world', '3', 'HIDDEN'], ['AEIOU', '5', 'HIDDEN']] },
  { title: 'Even or odd', description: '<p>Read a whole number. Print Even if it is even, and Odd if it is odd.</p>', inputFormat: 'One whole number.', outputFormat: 'Even or Odd.', constraints: '-1000 to 1000.',
    solutionCode: 'n = int(input())\nif n % 2 == 0:\n    print("Even")\nelse:\n    print("Odd")', tests: [['4', 'Even', 'SAMPLE'], ['7', 'Odd', 'SAMPLE'], ['0', 'Even', 'HIDDEN'], ['-3', 'Odd', 'HIDDEN']] },
  { title: 'Reverse a word', description: '<p>Read one word and print it backwards.</p>', inputFormat: 'One word.', outputFormat: 'The word backwards.', constraints: '1 to 20 letters.',
    solutionCode: 'word = input()\nprint(word[::-1])', tests: [['cat', 'tac', 'SAMPLE'], ['level', 'level', 'SAMPLE'], ['python', 'nohtyp', 'HIDDEN'], ['ab', 'ba', 'HIDDEN']] },
  { title: 'Star triangle', description: '<p>Read a whole number N and print N lines. Line 1 has one star, line 2 has two stars, and so on.</p>', inputFormat: 'One whole number N.', outputFormat: 'N lines of stars.', constraints: '1 to 10.',
    solutionCode: 'n = int(input())\nfor i in range(1, n + 1):\n    print("*" * i)', tests: [['3', '*\n**\n***', 'SAMPLE'], ['1', '*', 'SAMPLE'], ['5', '*\n**\n***\n****\n*****', 'HIDDEN'], ['2', '*\n**', 'HIDDEN']] },
];
/** Stands in for the model. Its programs are run by Cove's real grader. */
const aiModel = {
  mode: 'ok', requests: [],
  answer(request) {
    const kind = request.text.format.name;
    aiModel.requests.push({ kind, store: request.store, instructions: request.instructions, input: request.input });
    if (aiModel.mode === 'fail') return Response.json({ error: { message: 'local failure' } }, { status: 503 });
    const reply = kind === 'analysis' ? aiAnalysis(request) : kind === 'library' ? aiLibrary : kind === 'review'
      ? { reviews: request.input.split(/\n\n(?=ITEM )/).slice(1).map(part => ({ id: part.match(/^ITEM (\w+)/)[1], ok: !part.includes('en: Planted'), reason: 'Not true for this program.' })) }
      : { mistakes: [] };
    return Response.json({ status: 'completed', model: request.model, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reply) }] }], usage: { input_tokens: 900, output_tokens: 90 } });
  },
};
/** An analysis in the Analyze design's fields, the same words every time, so a test can find them. */
function aiAnalysis({ instructions, input }) {
  const korean = instructions.includes('선생님'), simpler = instructions.includes('did not understand') || instructions.includes('이해하지 못했습니다');
  const item = input.match(/MATCHED MISTAKE[^\n]*:\n- (F\d+)/)?.[1] ?? null;
  const line = 3;
  if (aiModel.mode === 'code') return { item: null, result: 'Your loop stops early.', line, why: 'It stops before n.', think: 'Change it to `for i in range(1, n + 1):` and it works.', tryIt: null, alsoCheck: null };
  // After Run or Test run only the examples ran (the campus courses design, §6).
  if (input.includes('only the examples were run') && !simpler && !korean) return { item, result: 'Example 1 wants 15, but your program prints 10.', line,
    why: '`for i in range(1, n):` stops before n, so 5 is never added.', think: 'Where should the loop stop so that n is added too?', tryIt: 'Try 3 by hand.', alsoCheck: null };
  if (simpler) return korean
    ? { item, result: '마지막 수를 빼먹었어요.', line, why: '반복이 한 번 일찍 끝나요.', think: '어떤 수가 빠졌을까요?', tryIt: null, alsoCheck: null }
    : { item, result: 'Your program forgot the last number.', line, why: 'The loop stops one step too early.', think: 'Which number is missing?', tryIt: null, alsoCheck: null };
  return korean
    ? { item, result: '예제는 통과했지만 숨겨진 테스트에서 너무 작은 수를 출력했어요.', line, why: '예제에 없는 수가 들어오면 프로그램이 합을 계산하지 않고 0을 출력해요.',
        think: 'n까지 더하려면 반복이 어디에서 멈춰야 할까요?', tryIt: '3을 넣고 손으로 계산해 보세요.', alsoCheck: null }
    : { item, result: 'You passed 0 of 4 tests: for input 5 your program printed 10, not 15.', line, why: '`for i in range(1, n):` stops before n, so the last number is never added.',
        think: 'Where should the loop stop so that n is added too?', tryIt: 'Try 3 by hand: what should be printed?', alsoCheck: null };
}
const aiLibrary = {
  hints: [
    { ko: '어떤 수들을 더해야 하는지 먼저 적어 보세요.', en: 'First write down which numbers should be added.' },
    { ko: '더한 값을 기억할 곳이 필요해요. 처음 값은 얼마일까요?', en: 'You need a place to keep the sum. What is its first value?' },
    { ko: '수를 하나씩 차례로 더해 보세요.', en: 'Add the numbers one after another.' },
    { ko: '마지막 수도 더했는지 확인해 보세요.', en: 'Check that the last number is added too.' },
    { ko: '여기에 코드가 있어요: total += i', en: 'Here is code: total += i' },
  ],
  mistakes: [
    { label: 'stops before N', wrongProgram: 'n = int(input())\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)', ko: '마지막 수가 빠졌어요. 반복이 어디에서 끝나나요?', en: 'The last number is left out. Where does the loop end?' },
    { label: 'prints N', wrongProgram: 'n = int(input())\nprint(n)', ko: '입력한 수만 출력했어요. 다른 수들은 언제 더하나요?', en: 'Only the input number is printed. When are the other numbers added?' },
    { label: 'multiplies', wrongProgram: 'n = int(input())\ntotal = 1\nfor i in range(1, n + 1):\n    total *= i\nprint(total)', ko: '더하지 않고 곱했어요. 문제는 무엇을 하라고 하나요?', en: 'The numbers are multiplied. What does the problem ask you to do?' },
    { label: 'really correct', wrongProgram: 'n = int(input())\nprint(sum(range(1, n + 1)))', ko: '합이 맞지 않아요. 어디를 볼까요?', en: 'The sum is not right. Where should you look?' },
    { label: 'starts at two', wrongProgram: 'n = int(input())\ntotal = 0\nfor i in range(2, n + 1):\n    total += i\nprint(total)', ko: '첫 번째 수가 빠졌어요. 어디에서 시작하나요?', en: 'The first number is left out. Where does the loop start?' },
    { label: 'planted', wrongProgram: 'n = int(input())\nprint(n + 1)', ko: '반복이 너무 빨리 끝났어요. 어디에서 끝나나요?', en: 'Planted: the loop ends too early. Where does it end?' },
  ],
  correctPrograms: [
    { approach: 'formula', code: 'n = int(input())\nprint(n * (n + 1) // 2)' },
    { approach: 'while loop', code: 'n = int(input())\ntotal = 0\nwhile n > 0:\n    total += n\n    n -= 1\nprint(total)' },
    { approach: 'built-in sum', code: 'n = int(input())\nprint(sum(range(n + 1)))' },
  ],
};
const explanationAssets = new Map();
let materialReadFault = null;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin), path = url.pathname;
    // Local tests only. Cross-origin browser provider calls receive normal CORS.
    res.setHeader('Access-Control-Allow-Origin', studio);
    res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') return res.end();
    // Faults live only in this isolated provider, never in the deployed API.
    if (process.env.COVE_MATERIAL_LOADING_E2E === '1' && path === '/testing/failure' && req.method === 'POST') {
      materialReadFault = await body(req);
      return json(res, {ok: true});
    }
    if (process.env.COVE_MATERIAL_LOADING_E2E === '1' && path.startsWith('/testing-api/')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      if (materialReadFault?.enabled && path.endsWith(materialReadFault.operation) && (bytes.toString().includes(materialReadFault.materialId) || url.search.includes(materialReadFault.materialId)))
        return json(res, {error:'Injected local upstream failure'}, 500);
      const forwarded = await fetch(api + '/api/' + path.slice('/testing-api/'.length) + url.search, {
        method:req.method, headers: {'content-type':req.headers['content-type'] ?? 'application/json', authorization:req.headers.authorization ?? '', 'x-cove-bff-secret':req.headers['x-cove-bff-secret'] ?? '', 'x-cove-view-role':req.headers['x-cove-view-role'] ?? ''},
        ...(bytes.length ? {body:bytes} : {}),
      });
      res.writeHead(forwarded.status, {'content-type':forwarded.headers.get('content-type') ?? 'application/json'});
      return res.end(Buffer.from(await forwarded.arrayBuffer()));
    }

    if ((process.env.COVE_OBSERVATION_E2E === '1' || process.env.COVE_WEB_COURSES_E2E === '1') && path.startsWith('/storage/v1/object/authenticated/course-videos/')) {
      const name = path.split('/').at(-1);
      if (!/^(master\.m3u8|playback\.mp4|poster\.jpg|segment-\d{3}\.ts)$/.test(name)) return json(res, {}, 404);
      const bytes = await readFile(join(process.env.COVE_OBSERVATION_MEDIA_DIR, name === 'playback.mp4' ? 'video.mp4' : name));
      const mime = name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.jpg') ? 'image/jpeg' : 'video/mp2t';
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
      if (range) { const from = Number(range[1]), to = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        res.writeHead(206, { 'content-type': mime, 'content-range': `bytes ${from}-${to}/${bytes.length}`, 'content-length': to - from + 1, 'accept-ranges': 'bytes' }); return res.end(bytes.subarray(from, to + 1)); }
      res.writeHead(200, { 'content-type': mime, 'content-length': bytes.length, 'accept-ranges': 'bytes' }); return res.end(bytes);
    }
    if (path.startsWith('/storage/v1/object/turtle-assets/') || path.startsWith('/storage/v1/object/authenticated/turtle-assets/')) {
      if (req.headers.authorization !== 'Bearer local-e2e-admin-key') return json(res, { error: 'forbidden' }, 403);
      const key = path.replace('/storage/v1/object/authenticated/', '').replace('/storage/v1/object/', '');
      if (req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        explanationAssets.set(key, { bytes: Buffer.concat(chunks), mime: req.headers['content-type'] });
        return json(res, { Key: key });
      }
      const asset = explanationAssets.get(key);
      if (!asset) return json(res, { error: 'missing_asset' }, 404);
      res.writeHead(200, { 'content-type': asset.mime }); return res.end(asset.bytes);
    }
    if (path.startsWith('/storage/v1/object/sign/') && req.method === 'POST') return json(res, { signedURL: '/object/sign/fixture.pdf?token=local-test-only' });
    if (path === '/health') return json(res, { ok: true });
    if (path === '/fixtures' && req.method === 'POST') {
      const input = await body(req), id = randomUUID();
      const parent = input.parentFixtureId ? fixtures.get(input.parentFixtureId) : null;
      if (input.parentFixtureId && !parent) return json(res, { error: 'unknown_parent' }, 400);
      const campus = parent?.campus ?? randomUUID();
      let academy = parent?.academy;
      if (!parent && input.autoCampus) {
        // Exercise the application's actual authenticated inbound controller;
        // this path deliberately does not insert an academy or mapping fixture.
        const synced = await fetch(api + '/api/integrations/dlab/v1/campuses/' + campus, {
          method: 'PUT', headers: { Authorization: 'Bearer ' + process.env.DLAB_INBOUND_SERVER_KEY, 'Content-Type': 'application/json', 'X-Request-Id': randomUUID() },
          body: JSON.stringify({ name: input.campusName ?? 'New HQ Browser Campus', status: 'active' }),
        });
        if (!synced.ok) throw new Error('Authenticated campus sync failed: ' + synced.status);
        const received = await synced.json();
        academy = await db.academy.findUniqueOrThrow({ where: { id: received.id } });
      } else if (!parent) {
        const org = await db.organization.create({ data: { name: 'SSO browser fixture', slug: 'browser-' + id } });
        academy = await db.academy.create({ data: { organizationId: org.id, name: 'SSO Browser Academy', slug: 'sso-' + id } });
        await db.dlabCampus.create({ data: { externalCampusId: campus, name: academy.name, status: 'active', payloadHash: 'fixture', academyId: academy.id, ssoEnabled: input.enabled !== false } });
      }
      const os = { external_user_id: id, external_campus_id: campus, external_campus_ids: [campus], name: input.name ?? 'Browser ' + (input.role ?? 'student'), user_role: input.role ?? 'student', account_status: 'active' };
      fixtures.set(id, { os, academy, campus });
      if (input.legacy) {
        const email = 'legacy-' + id + '@example.test', user = authUser({ id, email, user_metadata: { full_name: os.name } });
        authUsers.set(id, user);
        await db.user.create({ data: { id, authUserId: id, email, username: 'legacy_' + id.replaceAll('-', '').slice(0, 20), displayName: os.name, status: 'ACTIVE', platformRole: input.role === 'ADMIN' ? 'ADMIN' : 'USER' } });
        if (input.role !== 'ADMIN') await db.academyMembership.create({ data: { academyId: academy.id, userId: id, role: input.role, status: 'ACTIVE', joinedAt: new Date() } });
        return json(res, { id, academy, email, username: 'legacy_' + id.replaceAll('-', '').slice(0, 20) });
      }
      if (input.prelogin) {
        const response = await originalFetch(api + '/api/integrations/dlab/v1/users/' + id, {
          method:'PUT',headers:{Authorization:'Bearer '+process.env.DLAB_INBOUND_SERVER_KEY,'Content-Type':'application/json','X-Request-Id':randomUUID()},
          body:JSON.stringify(os),
        });
        if (!response.ok) throw new Error('Pre-login sync failed: '+response.status);
      }
      return json(res, { id, academy, campus });
    }
    if (/^\/fixtures\/[^/]+\/companion-course$/.test(path) && req.method === 'POST' && process.env.COVE_WEB_COURSES_E2E === '1') {
      const fixture = fixtures.get(path.split('/')[2]), input = await body(req);
      if (!fixture) return json(res, { error: 'unknown_fixture' }, 404);
      const classroom = await db.class.findFirst({ where: { id: input.classId, academyId: fixture.academy.id }, select: { id: true } });
      if (!classroom) return json(res, { error: 'unknown_class' }, 404);
      const owner = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: fixture.os.external_user_id } });
      const course = await db.course.create({ data: {
        academyId: fixture.academy.id, title: 'Python companion', language: 'PYTHON', isVisible: true, createdByUserId: owner.userId,
        modules: { create: { title: 'Python basics', externalKey: randomUUID(), position: 1, isVisible: true, lectures: { create: {
          title: 'Print a message', externalKey: randomUUID(), position: 1, isVisible: true, materials: { create: {
            title: 'Hello Python', type: 'PROGRAMMING_EXERCISE', position: 1, isVisible: true,
            programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY', description: '<p>Print a message.</p>', solutionCode: 'print("Hello")' } },
          } },
        } } } },
        classAssignments: { create: { classId: classroom.id, assignedByUserId: owner.userId } },
      } });
      return json(res, { courseId: course.id });
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
        programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY', description: '<p>Read two numbers and print their sum.</p>', inputFormat: 'Two integers separated by a space.', outputFormat: 'One integer: their sum.', constraints: 'Each integer is between 0 and 100.', starterCode: 'a, b = map(int, input().split())\nprint(a + b)', solutionCode: 'print(sum(map(int, input().split())))', solutions: { create: { position: 0, title: 'Reference answer', code: 'print(sum(map(int, input().split())))' } }, testCases: { create: { position: 1, input: '2 3', expectedOutput: '5', visibility: 'SAMPLE' } } } },
      } });
      let secondProgrammingMaterialId;
      if (input.includeSecondProgramming) {
        const otherLecture = await db.lecture.create({ data: { courseModuleId: module.id, title: 'Another chapter', externalKey: randomUUID(), position: 2, isVisible: true } });
        const other = await db.material.create({ data: { lectureId: otherLecture.id, title: material.title, type: 'PROGRAMMING_EXERCISE', position: 1, isVisible: true,
          programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY', description: '<p>Different chapter: print a greeting.</p>', starterCode: '# DIFFERENT CHAPTER\nprint("Hello")', solutionCode: 'print("Hello")' } },
        } });
        secondProgrammingMaterialId = other.id;
      }
      const imageMaterialIds = [];
      if (input.includeImageNavigation) {
        const imageLecture = await db.lecture.create({ data: { courseModuleId: module.id, title: 'Image navigation', externalKey: randomUUID(), position: 3, isVisible: true } });
        // Distinct private assets expose a stale material scope: the real API
        // must refuse an image that does not belong to the requested problem.
        const bytes = await readFile(join(process.env.COVE_OBSERVATION_MEDIA_DIR, 'poster.jpg'));
        for (let position = 1; position <= 3; position++) {
          const assetId = randomUUID(), objectKey = `${fixture.academy.id}/${assetId}`;
          explanationAssets.set(`turtle-assets/${objectKey}`, { bytes, mime: 'image/jpeg' });
          await db.manualAsset.create({ data: { id: assetId, academyId: fixture.academy.id, courseId: course.id, objectKey,
            name: `problem-${position}.jpg`, byteSize: bytes.length, mimeType: 'image/jpeg', sha256: createHash('sha256').update(bytes).digest('hex') } });
          const problem = await db.material.create({ data: { lectureId: imageLecture.id, title: `Image problem ${position}`, type: 'PROGRAMMING_EXERCISE', position, isVisible: true,
            programmingExercise: { create: { externalKey: randomUUID(), difficulty: 'EASY',
              description: `<p>Read this problem's picture.</p><img src="cove-asset:${assetId}" alt="Picture for problem ${position}">`,
              starterCode: `# image problem ${position}\nprint(${position})`, solutionCode: `print(${position})` } } } });
          imageMaterialIds.push(problem.id);
        }
      }
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
          isVisible: true, pdfDocument: { create: { assetId: asset.id, placement: input.materialLoading ? 'BOTH' : 'MAIN' } },
        } });
        // Deliberately third, matching the reported sidebar click.
        pdfMaterialId = document.id;
        if (input.materialLoading) await db.programmingExercise.update({where:{materialId:material.id},data:{referencePdfMaterialId:document.id}});
        const video = await db.videoAsset.create({ data: {
          requestKey: randomUUID(), objectKey: 'fixture-video-' + randomUUID(), uploaderUserId: owner.userId,
          academyId: fixture.academy.id, courseId: course.id, lectureId: lecture.id,
          filename: 'lesson.mp4', byteSize: 100n, durationMs: 10000, state: 'READY', outputs: (process.env.COVE_OBSERVATION_E2E === '1' || process.env.COVE_WEB_COURSES_E2E === '1')
            ? ['fixture/master.m3u8', 'fixture/playback.mp4', 'fixture/poster.jpg', 'fixture/segment-000.ts'] : [],
        } });
        const videoMaterial = await db.material.create({ data: {
          lectureId: lecture.id, title: 'Lesson video', type: 'VIDEO_LESSON', position: 6, isVisible: true,
          videoLesson: { create: { assetId: video.id, requestKey: randomUUID(), description: 'A video lesson about addition.' } },
        } });
        videoMaterialId = videoMaterial.id;
      }
      let turtleMaterialId;
      if (input.includeTurtle && (process.env.COVE_OBSERVATION_E2E === '1' || process.env.COVE_MATERIAL_LOADING_E2E === '1')) {
        const health = process.env.COVE_MATERIAL_LOADING_E2E === '1' ? {runtimeVersion:'local-read-only-runtime'} : await (await fetch('http://127.0.0.1:4029/health', { headers: { Authorization: 'Bearer local-observation-runtime-secret-never-production' } })).json();
        const drawing = await db.material.create({ data: { lectureId: lecture.id, title: 'Draw a red square', type: 'TURTLE_EXERCISE', position: 7, isVisible: true,
          manualMaterial: { create: { description: 'Draw a red square and print a message.', runtimeVersion: health.runtimeVersion,
            width: 640, height: 480, files: { 'main.py': "import turtle\nt = turtle.Turtle()\nt.color('red')\nt.begin_fill()\nfor _ in range(4):\n    t.forward(90)\n    t.left(90)\nt.end_fill()\nprint('MONITORED TURTLE', flush=True)\nturtle.mainloop()" } } } } });
        turtleMaterialId = drawing.id;
      }
      let explanationMaterialId;
      if (input.includeExplanation) {
        const explanation = await db.material.create({ data: { lectureId: lecture.id, title: 'How addition works', type: 'EXPLANATION', position: 8, isVisible: true,
          explanationMaterial: { create: { body: '<h2>Addition lesson</h2><p>Add the two inputs and display their sum.</p>' } },
        } });
        explanationMaterialId = explanation.id;
      }
      const classes = [];
      for (const name of ['Assigned Python class', 'Other Python class']) {
        const classroom = await db.class.create({ data: { academyId: fixture.academy.id, name, description: 'Development demo: Browser tutor teaches Browser student.', createdByUserId: owner.userId } });
        await db.classCourse.create({ data: { classId: classroom.id, courseId: course.id, assignedByUserId: owner.userId } });
        await db.classEnrollment.create({ data: { classId: classroom.id, membershipId: student.id, enrolledByUserId: owner.userId } });
        classes.push(classroom);
      }
      if (input.teacherFixtureId) {
        const teacherIdentity = await db.dlabIdentity.findUniqueOrThrow({where:{externalUserId:input.teacherFixtureId}});
        const teacherMember = await db.academyMembership.findUniqueOrThrow({where:{academyId_userId:{academyId:fixture.academy.id,userId:teacherIdentity.userId}}});
        await db.class.update({where:{id:classes[0].id},data:{teacherMembershipId:teacherMember.id}});
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
      if (input.webCourse && process.env.COVE_WEB_COURSES_E2E === '1') {
        await db.material.deleteMany({ where: { lectureId: lecture.id, type: { in: ['PROGRAMMING_EXERCISE', 'WRITTEN_RESPONSE', 'TURTLE_EXERCISE'] } } });
        await db.course.update({ where: { id: course.id }, data: { language: 'WEB', title: 'DM-WB-1 · Web foundations' } });
        await db.courseModule.update({ where: { id: module.id }, data: { title: 'HTML and CSS' } });
        await db.lecture.update({ where: { id: lecture.id }, data: { title: '1주차 · HTML basics' } });
      }
      return json(res, { imageMaterialIds, explanationMaterialId, secondProgrammingMaterialId, reviewStudentMembershipId, turtleMaterialId, pdfMaterialId, videoMaterialId, courseId: course.id, lectureId: lecture.id, materialId: material.id, writtenMaterialId: written.id, shortMaterialId: short.id, quizMaterialId: quiz.id, studentMembershipId: student.id, classes });
    }
    // A ready academy for a person to click through, with password accounts.
    if (aiE2e && path === '/testing/ai-playground' && req.method === 'POST') {
      const org = await db.organization.create({ data: { name: 'AI playground', slug: 'ai-playground-' + randomUUID().slice(0, 8) } });
      const academy = await db.academy.create({ data: { organizationId: org.id, name: 'AI Playground Academy', slug: 'ai-playground' } });
      const people = {};
      for (const [key, name, role, locale] of [
        ['ai_manager', 'Manager Person', 'MANAGER', 'en'], ['ai_teacher', 'Teacher Person', 'TEACHER', 'en'],
        ['ai_student', 'Student One', 'STUDENT', 'en'], ['ai_student2', '학생 둘', 'STUDENT', 'ko'], ['ai_admin', 'Operator Person', null, 'en'],
      ]) {
        const id = randomUUID(), email = key + '@playground.test';
        authUsers.set(id, authUser({ id, email, user_metadata: { full_name: name } }));
        await db.user.create({ data: { id, authUserId: id, email, username: key, displayName: name, status: 'ACTIVE', preferredLocale: locale, platformRole: role ? 'USER' : 'ADMIN' } });
        const membership = role ? await db.academyMembership.create({ data: { academyId: academy.id, userId: id, role, status: 'ACTIVE', joinedAt: new Date() } }) : null;
        people[key] = { id, membershipId: membership?.id };
      }
      const owner = people.ai_manager.id;
      const course = await db.course.create({ data: { academyId: academy.id, title: 'Python with AI help', isVisible: true, aiTeacherEnabled: true, createdByUserId: owner } });
      const module = await db.courseModule.create({ data: { courseId: course.id, title: 'Loops', externalKey: randomUUID(), position: 1, isVisible: true } });
      const lecture = await db.lecture.create({ data: { courseModuleId: module.id, title: 'Adding numbers', externalKey: randomUUID(), position: 1, isVisible: true } });
      // The stand-in model knows only the first problem, so the others need the real one.
      const sum = { title: 'Sum from 1 to N', ...aiProblem, tests: [['5', '15', 'SAMPLE'], ['3', '6', 'SAMPLE'], ['40', '820', 'HIDDEN'], ['1', '1', 'HIDDEN']] };
      const problems = [];
      for (const [index, { title, tests, ...problem }] of (aiRealKey ? [sum, ...playgroundProblems] : [sum]).entries()) {
        const created = await db.material.create({ data: { lectureId: lecture.id, title, type: 'PROGRAMMING_EXERCISE', position: index + 1, isVisible: true,
          programmingExercise: { create: { starterCode: '', ...problem, externalKey: randomUUID(), difficulty: 'EASY', aiFeedbackEnabled: true,
            solutions: { create: { position: 0, title: 'Reference answer', code: problem.solutionCode } },
            testCases: { create: tests.map(([input, expectedOutput, visibility], position) => ({ position: position + 1, input, expectedOutput, visibility })) } } } } });
        problems.push({ title, materialId: created.id });
      }
      const material = { id: problems[0].materialId };
      const classroom = await db.class.create({ data: { academyId: academy.id, name: 'AI playground class', description: 'Local AI assistant playground.', createdByUserId: owner, teacherMembershipId: people.ai_teacher.membershipId } });
      await db.classCourse.create({ data: { classId: classroom.id, courseId: course.id, assignedByUserId: owner } });
      await db.classEnrollment.createMany({ data: ['ai_student', 'ai_student2'].map((key) => ({ classId: classroom.id, membershipId: people[key].membershipId, enrolledByUserId: owner })) });
      await db.academyFeatureFlag.createMany({ data: ['TEACHER_LIVE_MONITORING', 'AI_ASSISTANT'].map((feature) => ({ academyId: academy.id, feature, isEnabled: true })) });
      return json(res, {
        password: 'LocalLegacyTest123!', accounts: Object.keys(people), academySlug: academy.slug, courseId: course.id, lectureId: lecture.id,
        classId: classroom.id, studentMembershipId: people.ai_student.membershipId, realModel: Boolean(aiRealKey),
        problems: problems.map((item) => ({ ...item,
          editor: `${studio}/academy/${academy.slug}/content/courses/${course.id}/lectures/${lecture.id}/exercises/${item.materialId}`,
          problem: `${studio}/academy/${academy.slug}/learn/exercises/${item.materialId}?classId=${classroom.id}` })),
        editor: `${studio}/academy/${academy.slug}/content/courses/${course.id}/lectures/${lecture.id}/exercises/${material.id}`,
        problem: `${studio}/academy/${academy.slug}/learn/exercises/${material.id}?classId=${classroom.id}`,
        classPage: `${studio}/academy/${academy.slug}/teach/classes/${classroom.id}`,
        operator: `${studio}/admin/ai`,
      });
    }
    if (aiE2e && path === '/testing/ai-libraries') {
      return json(res, await db.aiLibrary.findMany({ select: { materialId: true, state: true, lastErrorCode: true } }));
    }
    if (aiE2e && path === '/testing/ai-last-answer') {
      const reply = await db.aiHelpReply.findFirst({ where: { user: { username: url.searchParams.get('username') } }, orderBy: { createdAt: 'desc' },
        select: { level: true, status: true, failureCode: true, libraryItem: { select: { label: true } } } });
      return json(res, { level: reply?.level ?? null, status: reply?.status ?? null, failureCode: reply?.failureCode ?? null, mistake: reply?.libraryItem?.label ?? null,
        output: aiModel.requests.filter((item) => item.kind === 'analysis').at(-1)?.output ?? null });
    }
    if (aiE2e && path === '/testing/ai-latest-submission') {
      const found = await db.submission.findFirst({ where: { materialId: url.searchParams.get('materialId'), user: { username: url.searchParams.get('username') } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      return json(res, { submissionId: found?.id ?? null });
    }
    if (aiE2e && path === '/testing/ai-model') {
      if (req.method === 'POST') aiModel.mode = (await body(req)).mode ?? 'ok';
      return json(res, { mode: aiModel.mode, requests: aiModel.requests });
    }
    if (aiE2e && /^\/fixtures\/[^/]+\/ai$/.test(path) && req.method === 'POST') {
      const fixture = fixtures.get(path.split('/')[2]), input = await body(req);
      if (!fixture) return json(res, { error: 'unknown_fixture' }, 404);
      const feature = { academyId: fixture.academy.id, feature: 'AI_ASSISTANT' };
      await db.academyFeatureFlag.upsert({ where: { academyId_feature: feature }, create: { ...feature, isEnabled: input.enabled }, update: { isEnabled: input.enabled } });
      if (input.enrollFixtureId) {
        const identity = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: input.enrollFixtureId } });
        const member = await db.academyMembership.findUniqueOrThrow({ where: { academyId_userId: { academyId: fixture.academy.id, userId: identity.userId } } });
        await db.classEnrollment.create({ data: { classId: input.classId, membershipId: member.id, enrolledByUserId: identity.userId } });
      }
      if (input.materialId) {
        await db.exerciseTestCase.deleteMany({ where: { exerciseMaterialId: input.materialId } });
        await db.programmingExerciseSolution.deleteMany({ where: { materialId: input.materialId } });
        await db.programmingExercise.update({ where: { materialId: input.materialId }, data: {
          ...aiProblem, aiFeedbackEnabled: true, gradingRevision: { increment: 1 },
          solutions: { create: { position: 0, title: 'Reference answer', code: aiProblem.solutionCode } },
          testCases: { create: [['5', '15', 'SAMPLE'], ['3', '6', 'SAMPLE'], ['40', '820', 'HIDDEN'], ['1', '1', 'HIDDEN']]
            .map(([input, expectedOutput, visibility], index) => ({ position: index + 1, input, expectedOutput, visibility })) },
        } });
        const material = await db.material.update({ where: { id: input.materialId }, data: { title: 'Sum from 1 to N' }, select: { lecture: { select: { courseModule: { select: { courseId: true } } } } } });
        // A course that includes the AI teacher (the campus courses design, §4).
        await db.course.update({ where: { id: material.lecture.courseModule.courseId }, data: { aiTeacherEnabled: true } });
      }
      return json(res, { ok: true });
    }
    if (path.startsWith('/fixtures/') && req.method === 'PUT') {
      const id = path.split('/')[2], fixture = fixtures.get(id), input = await body(req);
      if (!fixture) return json(res, { error: 'unknown_fixture' }, 404);
      if (input.role) fixture.os.user_role = input.role;
      if (input.status) fixture.os.account_status = input.status;
      fixture.version = Math.max(Date.now(), (fixture.version ?? 0) + 1);
      const response = await originalFetch(api + '/api/integrations/dlab/v1/users/' + id, {
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
      return json(res, identity ? { studentLeaseCount: leases.filter(Boolean).length, lastSignInAt:identity.user?.lastSignInAt, userId: identity.userId, role: identity.userRole, generation: identity.generation, platformRole: identity.user?.platformRole, memberships: identity.bindings.map(b => ({ id: b.membershipId, role: b.membership.role, roles: [b.membership.role, ...b.membership.extraRoles.map(r => r.role)], status: b.membership.status })) } : null);
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
// Peer APIs share the primary provider and isolated storage.
if (!observationPeer) await new Promise(resolve => server.listen(providerPort, '127.0.0.1', resolve));
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
  if (url.origin === 'https://os.dlabcampus.com' && url.pathname === '/v1/sso/token') return originalFetch(origin + '/os/token', init);
  if (aiE2e && !aiRealKey && url.origin === 'https://api.openai.com') return aiModel.answer(JSON.parse(init.body));
  // The real model, locally: keep what it answered, so a refused answer can be read here. Never in the application.
  if (aiE2e && aiRealKey && url.origin === 'https://api.openai.com') return originalFetch(input, init).then(async (response) => {
    try {
      const body = await response.clone().json();
      const output = (body.output ?? []).flatMap((item) => item.content ?? []).map((part) => part.text ?? '').join('');
      aiModel.requests.push({ kind: JSON.parse(init.body).text.format.name, store: JSON.parse(init.body).store, output: output.slice(0, 4_000) });
      aiModel.requests.splice(0, Math.max(0, aiModel.requests.length - 50));
    } catch { /* a failed call has nothing to keep */ }
    return response;
  });
  if (url.origin === 'https://dlab-sso-provider.invalid') return originalFetch(origin + url.pathname + url.search, init);
  return originalFetch(input, init);
};
// Compiled application's actual Nest bootstrap, controllers, RPC and socket gateways.
await import(new URL('src/main.js', apiBuild));
process.on('SIGTERM', () => { if (server.listening) server.close(); void redis.quit(); void db.$disconnect(); });
