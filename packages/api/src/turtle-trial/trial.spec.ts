import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { turtleHelperVersion, type TurtleSession, type TurtleRunInput } from '@cove/shared';
import { TrialStore } from './trial-store.js';
import { TrialService } from './trial.service.js';
import { TrialRuntime } from './trial-runtime.js';
import { TrialController } from './trial.controller.js';
import { trialDigest, trialPrefix } from './trial-security.js';

const url = process.env.TURTLE_TRIAL_TEST_REDIS_URL;
// Dedicated, explicitly selected localhost Redis only. Never flush a shared DB.
const local = url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname) && new URL(url).port === '6397' && new URL(url).pathname === '/1';
describe.skipIf(!local)('guest authorization with shared Redis', () => {
  const config = new ConfigService({ TURTLE_TRIAL_ENABLED: true, REDIS_URL: url,
    TURTLE_TRIAL_LEGACY_PIN_ENABLED: true,
    BFF_SHARED_SECRET: 'test-bff-secret-with-at-least-32-characters',
    TURTLE_TRIAL_PIN_PEPPER: 'test-pepper-with-at-least-32-characters', TURTLE_TRIAL_PIN_VERSION: 'test-v1',
    TURTLE_TRIAL_PIN_DIGEST: trialDigest('012345', 'test-pepper-with-at-least-32-characters') });
  const store = new TrialStore(config); const other = new TrialStore(config);
  const runs = new Map<string, TurtleSession & { owner: string; requestKey: string }>();
  let starts = 0;
  const runtime = {
    ready: vi.fn(async () => {}),
    lookup: vi.fn(async (owner, key) => [...runs.values()].find(s => s.owner === owner && s.requestKey === key) ?? null),
    request: vi.fn(async (path: string, method = 'GET', body?: Record<string, unknown>) => {
      if (path === '/sessions') {
        starts++; const id = randomUUID();
        const s = { id, owner: body!.owner as string, requestKey: body!.requestKey as string, state: 'RUNNING', token: 'display', output: '', displayUrl: 'ws://localhost', expiresAt: Date.now() + 120000, startedAt: Date.now() };
        runs.set(id, s); return s;
      }
      const s = runs.get(path.split('/')[2]!);
      if (!s) throw new HttpException('NOT_FOUND', 404);
      if (method === 'DELETE') { s.state = 'STOPPED'; s.endedAt = Date.now(); return {}; }
      return { ...s };
    }),
  };
  const service = new TrialService(config, store, runtime as unknown as TrialRuntime);
  const service2 = new TrialService(config, other, runtime as unknown as TrialRuntime);
  async function enter(ip = 'class-nat') {
    const { nonce } = await service.challenge(ip);
    return service.access('012345', nonce, ip);
  }
  const input = (): TurtleRunInput => ({ source: 'TForward(100)', starterId: 'drawing', helperVersion: turtleHelperVersion, requestKey: randomUUID() });
  beforeAll(async () => { await store.client(); await other.client(); });
  beforeEach(async () => {
    const redis = await store.client(); const keys = await redis.keys(trialPrefix + '*');
    if (keys.length) await redis.del(...keys);
    runs.clear(); starts = 0; vi.clearAllMocks();
  });
  afterAll(async () => { await store.onModuleDestroy(); await other.onModuleDestroy(); });

  it('keeps leading zero PINs and does not create a runtime on entry', async () => {
    const issued = await enter(); expect(issued.token).toMatch(/^[a-f0-9]{64}$/);
    expect(starts).toBe(0); expect((await service.bootstrap(issued.token)).session).toBeNull();
    const { nonce } = await service.challenge('class-nat');
    await expect(service.access('12345', nonce, 'class-nat')).rejects.toMatchObject({ status: 401 });
    await expect(service.access('012345', nonce + 'x', 'class-nat')).rejects.toMatchObject({ status: 401 });
  });
  it('shares one cold Redis connection across simultaneous browser requests', async () => {
    const cold = new TrialStore(config);
    try {
      const clients = await Promise.all(Array.from({ length: 8 }, () => cold.client()));
      expect(clients.every(client => client === clients[0])).toBe(true);
      expect(clients[0]!.status).toBe('ready');
    } finally { await cold.onModuleDestroy(); }
  });
  it('isolates owners and assembles only trusted runtime files and limits', async () => {
    const a = await enter(); const b = await enter(); const run = await service.start(a.token, input());
    await expect(service2.session(b.token, run.id)).rejects.toMatchObject({ status: 404 });
    await expect(service2.session(b.token, run.id, 'DELETE')).rejects.toMatchObject({ status: 404 });
    const body = runtime.request.mock.calls.find(call => call[0] === '/sessions')![2]!;
    expect(Object.keys(body.files as object).sort()).toEqual(['_cove_trial_runner.py', 'custom.py', 'main.py', 'shape.py']);
    expect(body).toMatchObject({ outputLimitBytes: 262144, memoryLimitMb: 512, timeLimitSeconds: 120, assets: [] });
    expect(body).not.toHaveProperty('academyId');
  });
  it('recovers an idempotent request across instances and rejects changed source', async () => {
    const a = await enter(); const request = input(); const first = await service.start(a.token, request);
    expect((await service2.start(a.token, request)).id).toBe(first.id); expect(starts).toBe(1);
    await expect(service2.start(a.token, { ...request, source: 'print(2)' })).rejects.toMatchObject({ status: 409 });
    await expect(service2.start(a.token, input())).rejects.toMatchObject({ status: 409 });
  });
  it('admits at most one concurrent run across API replicas', async () => {
    const a = await enter();
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => (i % 2 ? service : service2).start(a.token, input())));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(starts).toBe(1);
  });
  it('recovers a lost create response without executing the source twice', async () => {
    const a = await enter(); const request = input();
    const implementation = runtime.request.getMockImplementation()!;
    runtime.request.mockImplementationOnce(async (...args) => {
      await implementation(...args);
      throw new HttpException('Transport response lost', 503);
    });
    const s = await service.start(a.token, request);
    expect(s.id).toBeTruthy(); expect(starts).toBe(1);
    expect((await service2.start(a.token, request)).id).toBe(s.id);
    expect(starts).toBe(1);
  });
  it('reserves the cumulative budget before creating a container', async () => {
    const a = await enter(); const g = (await store.grant(a.token, 'test-v1'))!;
    await (await store.client()).hset(store.grantKey(g.hash), 'used', 1790);
    await expect(service.start(a.token, input())).rejects.toMatchObject({ status: 429 });
    expect(starts).toBe(0);
  });
  it('atomically refunds unused time once and enforces start limits', async () => {
    const a = await enter(); const g = (await store.grant(a.token, 'test-v1'))!;
    for (let i = 0; i < 12; i++) { const s = await service.start(a.token, input()); await service.session(a.token, s.id, 'DELETE'); }
    expect(Number(await (await store.client()).hget(store.grantKey(g.hash), 'used'))).toBeLessThan(20);
    await expect(service2.start(a.token, input())).rejects.toMatchObject({ status: 429 });
  });
  it('shares rate limits but allows a class behind a single NAT to enter', async () => {
    for (let i = 0; i < 20; i++) await enter();
    const results = await Promise.allSettled(Array.from({ length: 24 }, (_, i) => (i % 2 ? store : other).limit([['shared-fixture', 10, 60000]])));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(10);
  });
  it('revokes grants on rotation, expiry and Exit without storing the raw token', async () => {
    const a = await enter(); const g = (await store.grant(a.token, 'test-v1'))!;
    const redis = await store.client();
    expect((await redis.keys(trialPrefix + '*')).join(' ')).not.toContain(a.token);
    await redis.set(trialPrefix + 'version', 'test-v2');
    await expect(service.bootstrap(a.token)).rejects.toMatchObject({ status: 401 });
    await redis.set(trialPrefix + 'version', 'test-v1');
    await redis.hset(store.grantKey(g.hash), 'expiresAt', Date.now() - 1);
    await expect(service.bootstrap(a.token)).rejects.toMatchObject({ status: 401 });
    const b = await enter(); await service.revoke(b.token);
    await expect(service.bootstrap(b.token)).rejects.toMatchObject({ status: 401 });
  });
  it('requires the private BFF secret and rejects client-controlled runtime fields', async () => {
    const controller = new TrialController(service, config);
    expect(() => controller.bootstrap('forged', 'token')).toThrow();
    const secret = config.get<string>('BFF_SHARED_SECRET');
    expect(() => controller.start({ ...input(), owner: 'someone-else' }, secret, 'token')).toThrow();
    expect(() => controller.start({ ...input(), source: 'x'.repeat(65537) }, secret, 'token')).toThrow();
  });
});
