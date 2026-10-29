/** Loopback-only synthetic identity provider. Actual Nest/BFF/authorization/DB remain real. */
import { fixtureEnvironment } from './native-grading-e2e-env.mjs';
fixtureEnvironment();
import { createServer } from 'node:http';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { fixtureTimings } from './native-grading-e2e-timings.mjs';
import { runtimeManifestSchema } from '@cove/shared';
import { assertRuntimeReady } from '../dist/src/judge/runtime-readiness.js';
import { SubmissionService } from '../dist/src/learn/submission.service.js';
import { StaffPracticeService } from '../dist/src/learn/staff-practice.service.js';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { QueueEvents } from 'bullmq';
import { PrismaService } from '../dist/src/database/prisma.service.js';
import { JudgeQueue } from '../dist/src/judge/judge.queue.js';
import { transitionFixturePhase } from './native-grading-e2e-phase.mjs';
import { seedFixture, inspectFixture } from './native-grading-e2e-seed.mjs';
const origin = 'http://127.0.0.1:4420',
  studio = 'http://127.0.0.1:3409';
const jwtSecret = 'local-native-jwt-secret-only-never-production';
// Only the synthetic Linux fixture can change its future-admission phase.
// ConfigService.set creates a new future-admission cache generation; accepted
// descriptors, manifest/readiness and broker execution are never substituted.
const configurationInstances = new Set();
const originalConfigGet = ConfigService.prototype.get;
ConfigService.prototype.get = function (...args) {
  configurationInstances.add(this);
  return originalConfigGet.apply(this, args);
};
const db = new PrismaService(
  new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
);
const redis = new Redis(process.env.REDIS_URL);
const timings = fixtureTimings(
  redis,
  process.env.COVE_NATIVE_FIXTURE_ID,
  'api',
  process.env.COVE_NATIVE_TIMINGS_FILE,
);
const fixtures = new Map(),
  authUsers = new Map(),
  hashes = new Map(),
  sessions = new Map(),
  refreshes = new Map();
const json = (res, value, status = 200) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(value));
};
async function body(req) {
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 65536) throw new Error('bounded fixture body');
  }
  return value ? JSON.parse(value) : {};
}
// Timing fault only: real installed QueueEvents.run/XREAD and controllers remain intact.
let eventGate = null,
  releaseEvents = null,
  waitingReaders = 0;
const owners = new Set();
for (const name of ['events', 'practiceEvents']) {
  const descriptor = Object.getOwnPropertyDescriptor(
    JudgeQueue.prototype,
    name,
  );
  Object.defineProperty(JudgeQueue.prototype, name, {
    ...descriptor,
    get() {
      owners.add(this);
      return descriptor.get.call(this);
    },
  });
}
for (const [prototype, kind] of [
  [SubmissionService.prototype, 'official'],
  [StaffPracticeService.prototype, 'practice'],
]) {
  const original = prototype.submit;
  prototype.submit = async function (...args) {
    const began = performance.now();
    const result = await original.apply(this, args);
    await timings.record({
      event: 'admission-ack',
      kind,
      jobId: result.submissionId,
      at: Date.now(),
      ackMonotonicMs: performance.now(),
      elapsedMs: performance.now() - began,
    });
    return result;
  };
}
const eventReads = [];
const originalXread = Redis.prototype.xread;
Redis.prototype.xread = function (...args) {
  const stream = args.find(
    (value) =>
      value === 'bull:cove-grading:events' ||
      value === 'bull:cove-staff-practice:events',
  );
  if (stream)
    eventReads.push({ stream, cursor: String(args.at(-1)), at: Date.now() });
  return originalXread.apply(this, args);
};
const originalRun = QueueEvents.prototype.run;
QueueEvents.prototype.run = async function (...args) {
  if (eventGate) {
    waitingReaders++;
    await eventGate;
    waitingReaders--;
  }
  return originalRun.apply(this, args);
};
function sign(claims) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return (
    h +
    '.' +
    p +
    '.' +
    createHmac('sha256', jwtSecret)
      .update(h + '.' + p)
      .digest('base64url')
  );
}
function claims(token) {
  const [h, p, s] = (token ?? '').split('.');
  if (!h || !p || !s) return null;
  const expected = createHmac('sha256', jwtSecret)
    .update(h + '.' + p)
    .digest('base64url');
  if (
    s.length !== expected.length ||
    !timingSafeEqual(Buffer.from(s), Buffer.from(expected))
  )
    return null;
  const parsed = JSON.parse(Buffer.from(p, 'base64url').toString());
  return sessions.has(parsed.session_id) && parsed.exp > Date.now() / 1000
    ? parsed
    : null;
}
function session(user, previous) {
  const id = previous ?? randomUUID(),
    now = Math.floor(Date.now() / 1000);
  sessions.set(id, user.id);
  const refresh = randomUUID();
  refreshes.set(refresh, { id, user });
  return {
    access_token: sign({
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_verified: true,
      user_metadata: user.user_metadata,
      app_metadata: user.app_metadata,
      session_id: id,
      iat: now,
      exp: now + 86400,
      iss: origin + '/auth/v1',
    }),
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: now + 86400,
    refresh_token: refresh,
    user,
  };
}
function authUser(input) {
  return {
    id: input.id ?? randomUUID(),
    aud: 'authenticated',
    role: 'authenticated',
    email: input.email,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: {
      provider: 'email',
      providers: ['email'],
      ...input.app_metadata,
    },
    user_metadata: input.user_metadata ?? {},
    identities: [],
  };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin),
      path = url.pathname;
    res.setHeader('Access-Control-Allow-Origin', studio);
    res.setHeader(
      'Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') return res.end();
    if (path === '/health')
      return json(res, {
        ok: true,
        waitingReaders,
        eventReads,
        streamListenerCount: [...owners].reduce(
          (total, owner) =>
            total +
            ['eventsInstance', 'practiceEventsInstance'].reduce(
              (sum, field) =>
                sum +
                ['completed', 'failed', 'progress'].reduce(
                  (count, event) =>
                    count + (owner[field]?.listenerCount(event) ?? 0),
                  0,
                ),
              0,
            ),
          0,
        ),
        fixtureId: process.env.COVE_NATIVE_FIXTURE_ID,
        now: Date.now(),
      });
    if (path === '/timings')
      return json(
        res,
        await timings.read(url.searchParams.get('jobId') ?? undefined),
      );
    if (path === '/authority') {
      const manifest = runtimeManifestSchema.parse(
        JSON.parse(
          readFileSync(process.env.GRADING_RUNTIME_MANIFEST_PATH, 'utf8'),
        ),
      );
      await assertRuntimeReady(
        async () => redis,
        manifest,
        process.env.GRADING_WORKER_GENERATION,
      );
      return json(res, {
        manifest,
        workerGeneration: process.env.GRADING_WORKER_GENERATION,
      });
    }
    if (path === '/diagnostics') {
      const rtt = [];
      for (let i = 0; i < 20; i++) {
        const began = performance.now();
        await db.$queryRaw`SELECT 1`;
        rtt.push(performance.now() - began);
      }
      return json(res, {
        dbPlacement: 'owned-loopback-postgres',
        queryRttMs: rtt,
        now: Date.now(),
      });
    }
    if (path === '/fixtures' && req.method === 'POST') {
      const input = await body(req),
        fixture = await seedFixture(db, input);
      fixtures.set(fixture.id, fixture);
      for (const identity of Object.values(fixture.users))
        authUsers.set(
          identity.id,
          authUser({
            id: identity.id,
            email: identity.email,
            user_metadata: { full_name: identity.name },
          }),
        );
      return json(res, fixture);
    }
    const match = /^\/fixtures\/([a-f0-9-]+)(?:\/(.*))?$/.exec(path);
    if (match) {
      const fixture = fixtures.get(match[1]);
      if (!fixture) return json(res, { error: 'unknown_owned_fixture' }, 404);
      if (req.method === 'GET')
        return json(res, await inspectFixture(db, fixture));
      const input = await body(req);
      if (match[2] === 'membership') {
        const identity = fixture.users[input.user];
        if (!identity) throw new Error('unknown fixture user');
        await db.academyMembership.update({
          where: {
            academyId_userId: {
              academyId: fixture.academy.id,
              userId: identity.id,
            },
          },
          data: { status: input.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED' },
        });
        return json(res, { ok: true });
      }
      if (match[2] === 'regrade-source') {
        const row = await db.submission.create({
          data: {
            userId: fixture.users.student.id,
            materialId: fixture.materialId,
            sourceMaterialId: fixture.materialId,
            courseId: fixture.courseId,
            language: 'PYTHON',
            code: 'print(input())',
            gradingRevision: 0,
            timeLimitMs: 1000,
            memoryLimitMb: 128,
            totalCount: fixture.count,
            engineVersion: '0.27.5',
            status: 'PASSED',
            score: 100,
            passedCount: fixture.count,
            gradedAt: new Date(),
            problemTitle: 'Historical isolated fixture',
            courseTitle: 'Isolated Python',
            moduleTitle: 'Python',
            lectureTitle: 'Python lesson',
            modulePosition: 1,
            lecturePosition: 1,
            problemPosition: 1,
            classId: fixture.classId,
          },
        });
        return json(res, { id: row.id });
      }
      if (match[2] === 'revision') {
        await db.programmingExercise.update({
          where: { materialId: fixture.materialId },
          data: {
            gradingRevision: { increment: 1 },
            testCases: {
              updateMany: {
                where: { visibility: 'HIDDEN' },
                data: { expectedOutput: 'private-revision-2' },
              },
            },
          },
        });
        return json(res, { ok: true });
      }
    }
    if (path === '/controls/phase' && req.method === 'POST') {
      const input = await body(req);
      const result = await transitionFixturePhase(input.phase, {
        allowed: Boolean(process.env.COVE_NATIVE_ACCEPTANCE_ENV) && process.platform === 'linux' && process.arch === 'x64',
        db, redis, timings, configurations: configurationInstances,
      });
      return json(res, result.body, result.status);
    }
    if (path === '/controls/queue' && req.method === 'POST') {
      const input = await body(req);
      for (const name of ['cove-grading', 'cove-staff-practice']) {
        const queue = new JudgeQueue(process.env.REDIS_URL);
        const q = name === 'cove-grading' ? queue.queue : queue.practiceQueue;
        await (input.pause ? q.pause() : q.resume());
        await queue.close();
      }
      return json(res, { ok: true });
    }
    if (path === '/controls/events' && req.method === 'POST') {
      const input = await body(req);
      if (input.pause) {
        if (eventGate) throw new Error('already paused');
        for (const owner of owners)
          for (const field of ['eventsInstance', 'practiceEventsInstance']) {
            await owner[field]?.close();
            owner[field] = null;
          }
        eventReads.length = 0;
        eventGate = new Promise((resolve) => {
          releaseEvents = resolve;
        });
      } else {
        releaseEvents?.();
        eventGate = null;
        releaseEvents = null;
      }
      return json(res, { ok: true, waitingReaders });
    }
    if (path === '/controls/failure' && req.method === 'POST') {
      const input = await body(req);
      if (
        !['official', 'practice'].includes(input.kind) ||
        !/^[a-f0-9-]{36}$/.test(input.id)
      )
        throw new Error('invalid owned queue identity');
      const queue = new JudgeQueue(process.env.REDIS_URL);
      const q = input.kind === 'official' ? queue.queue : queue.practiceQueue;
      const job = await q.getJob(input.id);
      if (
        !job ||
        ((await job.getState()) !== 'waiting' &&
          (await job.getState()) !== 'paused')
      )
        throw new Error('Fault setup requires a paused unexecuted job');
      await redis.hset(
        `bull:${q.name}:${input.id}`,
        'opts',
        JSON.stringify({ ...job.opts, attempts: 1 }),
      );
      await queue.close();
      await redis.set('native-e2e:fail:' + input.id, '1');
      await redis.set('native-e2e:hold:' + input.kind, '1');
      return json(res, { ok: true });
    }
    if (path === '/controls/retry' && req.method === 'POST') {
      const input = await body(req);
      const queue = new JudgeQueue(process.env.REDIS_URL);
      await (input.kind === 'official'
        ? queue.enqueue(input.id)
        : queue.enqueuePractice(input.id));
      await queue.close();
      return json(res, { ok: true });
    }
    if (path === '/controls/job') {
      const queue = new JudgeQueue(process.env.REDIS_URL);
      const q =
        url.searchParams.get('kind') === 'official'
          ? queue.queue
          : queue.practiceQueue;
      const job = await q.getJob(url.searchParams.get('id'));
      const state = await job?.getState();
      await queue.close();
      return json(res, { state });
    }

    if (path === '/controls/release' && req.method === 'POST') {
      const input = await body(req);
      await redis.del('native-e2e:hold:' + input.kind);
      return json(res, { ok: true });
    }
    if (path === '/controls/queue-history') {
      const entries = {};
      for (const name of ['cove-grading', 'cove-staff-practice'])
        entries[name] = await redis.xrange(
          'bull:' + name + ':events',
          '-',
          '+',
        );
      return json(res, entries);
    }
    if (
      path.startsWith('/auth/v1/admin/') &&
      (req.headers.apikey !== 'local-native-admin-key' ||
        req.headers.authorization !== 'Bearer local-e2e-admin-key')
    )
      return json(res, { msg: 'Admin key required' }, 401);
    if (path.startsWith('/auth/v1/admin/users/') && req.method === 'GET') {
      const user = authUsers.get(path.split('/').at(-1));
      return json(
        res,
        user ?? { code: 'user_not_found', msg: 'User not found' },
        user ? 200 : 404,
      );
    }
    if (path === '/auth/v1/admin/users' && req.method === 'POST') {
      const user = authUser(await body(req));
      authUsers.set(user.id, user);
      return json(res, user);
    }
    if (path === '/auth/v1/admin/generate_link') {
      const input = await body(req),
        user = [...authUsers.values()].find((u) => u.email === input.email);
      if (!user) return json(res, { msg: 'User not found' }, 404);
      const hash = randomUUID();
      hashes.set(hash, user);
      return json(res, {
        ...user,
        hashed_token: hash,
        action_link: origin + '/auth/v1/verify',
        verification_type: 'magiclink',
        email_otp: '000000',
        redirect_to: studio,
      });
    }
    if (path === '/auth/v1/verify') {
      const input = await body(req),
        user = hashes.get(input.token_hash);
      hashes.delete(input.token_hash);
      return user
        ? json(res, session(user))
        : json(res, { msg: 'Invalid token' }, 400);
    }
    if (path === '/auth/v1/user' && req.method === 'GET') {
      const token = claims(req.headers.authorization?.replace(/^Bearer /, ''));
      return token
        ? json(res, authUsers.get(token.sub))
        : json(res, { msg: 'Invalid token' }, 401);
    }
    if (path === '/auth/v1/token') {
      const input = await body(req);
      if (url.searchParams.get('grant_type') === 'password') {
        const user = [...authUsers.values()].find(
          (u) => u.email === input.email && !u.app_metadata.dlab_managed,
        );
        return user && input.password === 'LocalLegacyTest123!'
          ? json(res, session(user))
          : json(
              res,
              { code: 'invalid_credentials', msg: 'Invalid credentials' },
              400,
            );
      }
      const saved = refreshes.get(input.refresh_token);
      return saved && sessions.has(saved.id)
        ? json(res, session(saved.user, saved.id))
        : json(res, { msg: 'Invalid refresh' }, 400);
    }
    if (path === '/auth/v1/logout') {
      const token = claims(req.headers.authorization?.replace(/^Bearer /, ''));
      if (token) sessions.delete(token.session_id);
      res.writeHead(204);
      return res.end();
    }
    return json(res, { error: 'unknown_fixture_route' }, 404);
  } catch (error) {
    console.error('native fixture:', error.message);
    return json(res, { error: 'fixture_failure' }, 500);
  }
});
server.keepAliveTimeout = 60000;
server.headersTimeout = 65000;
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(4420, '127.0.0.1', resolve);
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : (input.url ?? input.toString()),
  );
  return originalFetch(
    url.origin === 'https://native-grading-provider.invalid'
      ? origin + url.pathname + url.search
      : input,
    init,
  );
};
await import('../dist/src/main.js');
process.on('SIGTERM', () => {
  releaseEvents?.();
  server.close();
  redis.disconnect();
  void db.$disconnect();
});
