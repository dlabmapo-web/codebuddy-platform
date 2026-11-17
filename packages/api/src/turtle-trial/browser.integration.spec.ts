import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { turtleBrowserProfileId, turtleBrowserStartSchema, turtleHelperVersion } from '@cove/shared';
import { TrialStore, trialRunLimits } from './trial-store.js';
import { TrialService, trialAcademyCacheMs, trialEntryLimits } from './trial.service.js';
import { TrialBrowserPolicy } from './browser-policy.js';
import { TrialBrowserRuns } from './browser-runs.js';
import { TrialBrowserService } from './browser.service.js';
import { TrialRuntime } from './trial-runtime.js';
import { trialDigest, trialPrefix } from './trial-security.js';

const url = process.env.TURTLE_BROWSER_TEST_REDIS_URL;
const local = url && new URL(url).hostname === '127.0.0.1' && new URL(url).port === '6398' && new URL(url).pathname === '/1';
describe.skipIf(!local)('browser admission with dedicated local Redis', () => {
  const config = new ConfigService({ NODE_ENV: 'test', TURTLE_TRIAL_ENABLED: true, REDIS_URL: url,
    TURTLE_TRIAL_LEGACY_PIN_ENABLED: true, BFF_SHARED_SECRET: 'test-bff-secret-with-at-least-32-characters',
    TURTLE_TRIAL_PIN_PEPPER: 'test-pepper-with-at-least-32-characters', TURTLE_TRIAL_PIN_VERSION: 'browser-test-v1',
    TURTLE_TRIAL_PIN_DIGEST: trialDigest('012345', 'test-pepper-with-at-least-32-characters'),
    TURTLE_TRIAL_BROWSER_ENABLED: true, TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED: true,
    TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: 'http://127.0.0.1:4128',
    TURTLE_TRIAL_BROWSER_RUNTIME_ID: 'brython-3.15.0-aaaaaaaaaaaaaaaaaaaa' });
  const store = new TrialStore(config), other = new TrialStore(config);
  const remote = { ready: vi.fn(async () => { throw new Error('Browser path called broker readiness'); }), request: vi.fn(async () => { throw new Error('Browser path called broker'); }), lookup: vi.fn(async () => { throw new Error('Browser path looked up a remote run'); }) };
  const policy = new TrialBrowserPolicy(config), runs = new TrialBrowserRuns(store, policy), runs2 = new TrialBrowserRuns(other, policy);
  const trial = new TrialService(config, store, remote as unknown as TrialRuntime, undefined, undefined, policy, runs);
  const service = new TrialBrowserService(trial, store, runs), service2 = new TrialBrowserService(trial, other, runs2);
  const input = () => ({ requestKey: randomUUID(), sourceHash: 'a'.repeat(64), profile: turtleBrowserProfileId, starterId: 'drawing' as const, helperVersion: turtleHelperVersion });
  const enter = async () => { const { nonce } = await trial.challenge('fixture'); return trial.access('012345', nonce, 'fixture'); };
  beforeAll(async () => { await store.client(); await other.client(); });
  beforeEach(async () => {
    const r = await store.client(); const keys = await r.keys(trialPrefix + '*'); if (keys.length) await r.del(...keys);
    config.set('TURTLE_TRIAL_BROWSER_RUNTIME_ID', 'brython-3.15.0-aaaaaaaaaaaaaaaaaaaa'); config.set('TURTLE_TRIAL_BROWSER_RETAINED_RUNTIME_IDS', []); config.set('TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS', []); config.set('TURTLE_TRIAL_BROWSER_ENABLED', true); config.set('TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED', true); vi.clearAllMocks();
  });
  afterAll(async () => { await store.onModuleDestroy(); await other.onModuleDestroy(); });

  it('enters and bootstraps without any broker call or source transfer', async () => {
    const g = await enter(), bootstrap = await trial.bootstrap(g.token);
    expect(bootstrap).toMatchObject({ session: null, browser: { engine: 'browser', profile: turtleBrowserProfileId } });
    const run = await service.start(g.token, input());
    expect(run.state).toBe('ACTIVE'); expect(run).not.toHaveProperty('token'); expect(run).not.toHaveProperty('displayUrl');
    expect(remote.ready).not.toHaveBeenCalled(); expect(remote.request).not.toHaveBeenCalled(); expect(remote.lookup).not.toHaveBeenCalled();
    expect(turtleBrowserStartSchema.safeParse({ ...input(), source: 'private code' }).success).toBe(false);
  });
  it('recovers a lost reply idempotently across instances and rejects changed source', async () => {
    const g = await enter(), request = input(); const first = await service.start(g.token, request);
    expect((await service2.start(g.token, request)).id).toBe(first.id);
    expect((await service.recover(g.token, request.requestKey)).id).toBe(first.id);
    await expect(service2.start(g.token, { ...request, sourceHash: 'b'.repeat(64) })).rejects.toMatchObject({ status: 409 });
  });
  it('admits one concurrent run across replicas', async () => {
    const g = await enter();
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => (i % 2 ? service : service2).start(g.token, input())));
    expect(attempts.filter(x => x.status === 'fulfilled')).toHaveLength(1);
  });
  it('denies cross-grant renewal, recovery and stop', async () => {
    const a = await enter(), b = await enter(), request = input(); const run = await service.start(a.token, request);
    await expect(service2.request(b.token, run.id, 'renew')).rejects.toMatchObject({ status: 404 });
    await expect(service2.request(b.token, run.id, 'stop')).rejects.toMatchObject({ status: 404 });
    await expect(service2.recover(b.token, request.requestKey)).rejects.toMatchObject({ status: 404 });
  });
  it('settles Stop once and cannot revive a stopped run or clear a later run', async () => {
    const g = await enter(), request = input(), run = await service.start(g.token, request);
    await Promise.all([service.request(g.token, run.id, 'stop'), service2.request(g.token, run.id, 'stop')]);
    await expect(service2.request(g.token, run.id, 'renew')).rejects.toMatchObject({ status: 409 });
    const next = await service.start(g.token, input()); await service.request(g.token, run.id, 'stop');
    expect((await trial.grant(g.token)).active).toBe(next.requestKey);
    const grant = await trial.grant(g.token), redis = await store.client();
    expect(Number(await redis.hget(store.grantKey(grant.hash), 'browserUsed'))).toBeGreaterThanOrEqual(120);
    expect(Number(await redis.hget(store.grantKey(grant.hash), 'browserUsed'))).toBeLessThan(125);
  });
  it('expires stale leases using server time and admits another run', async () => {
    const g = await enter(), request = input(); const run = await service.start(g.token, request), grant = await trial.grant(g.token);
    await (await store.client()).hset(store.runKey(grant.hash, request.requestKey), { leaseUntil: Date.now() - 1000, reservedAt: Date.now() - 6000 });
    expect((await service.recover(g.token, request.requestKey)).state).toBe('EXPIRED');
    await expect(service.request(g.token, run.id, 'renew')).rejects.toMatchObject({ status: 409 });
    expect((await service.start(g.token, input())).state).toBe('ACTIVE');
  });
  it('bounds runaway browser starts and drawing time apart from the full-Python allowance', async () => {
    const g = await enter(), redis = await store.client(), first = await trial.grant(g.token);
    for (let i = 0; i < trialRunLimits.browser.minute; i++) { const r = await service.start(g.token, input()); await service.request(g.token, r.id, 'stop'); }
    await expect(service2.start(g.token, input())).rejects.toMatchObject({ status: 429 });
    // A lesson's worth of browser drawings leaves the server counters and budget untouched.
    expect(await redis.get(trialPrefix + 'starts:minute:' + first.hash)).toBeNull();
    expect(Number(await redis.hget(store.grantKey(first.hash), 'used'))).toBe(0);
    expect(Number(await redis.hget(store.grantKey(first.hash), 'browserUsed'))).toBeLessThan(trialRunLimits.browser.minute * 2);
    const b = await enter(), grant = await trial.grant(b.token);
    // Full-Python time already spent does not block the browser engine.
    await redis.hset(store.grantKey(grant.hash), 'used', 1790);
    const run = await service.start(b.token, input()); await service.request(b.token, run.id, 'stop');
    await redis.hset(store.grantKey(grant.hash), 'browserUsed', trialRunLimits.browser.budget - 110);
    await expect(service.start(b.token, input())).rejects.toMatchObject({ status: 429 });
    expect(remote.request).not.toHaveBeenCalled();
  });
  it('lets a whole class enter from one address while wrong PINs stay bounded', async () => {
    const ip = 'academy-wifi';
    // Three classes of 50 on one Wi-Fi address, well past the old 120 per address.
    const entered = await Promise.all(Array.from({ length: 150 }, async () => { const { nonce } = await trial.challenge(ip); return trial.access('012345', nonce, ip); }));
    expect(entered).toHaveLength(150);
    for (let i = 0; i < trialEntryLimits.wrongPinsPerIp; i += 10) {
      const { nonce } = await trial.challenge(ip);
      await Promise.all(Array.from({ length: 10 }, () => expect(trial.access('999999', nonce, ip)).rejects.toMatchObject({ status: 401 })));
    }
    const { nonce } = await trial.challenge(ip);
    // The address is now over the wrong-PIN bound: one more guess is refused and charged...
    await expect(trial.access('999999', nonce, ip)).rejects.toMatchObject({ status: 429 });
    // ...after which even a correct PIN waits, while another address is unaffected.
    await expect(trial.access('012345', nonce, ip)).rejects.toMatchObject({ status: 429 });
    const elsewhere = await trial.challenge('other-wifi');
    expect((await trial.access('012345', elsewhere.nonce, 'other-wifi')).token).toMatch(/^[a-f0-9]{64}$/);
  });
  it('kill switch denies renewal and reconciles active browser records', async () => {
    const g = await enter(), request = input(), run = await service.start(g.token, request);
    config.set('TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED', false);
    await expect(service.request(g.token, run.id, 'renew')).rejects.toMatchObject({ status: 503 });
    expect((await service.recover(g.token, request.requestKey)).state).toBe('EXPIRED');
    expect(await trial.bootstrap(g.token)).toMatchObject({ session: null, preferredEngine: 'browser' }); expect(remote.request).not.toHaveBeenCalled();
  });
  it('PIN rotation denies renewed authority and Exit settles the browser run', async () => {
    const g = await enter(), request = input(); await service.start(g.token, request);
    await (await store.client()).set(trialPrefix + 'version', 'rotated');
    await expect(service.recover(g.token, request.requestKey)).rejects.toMatchObject({ status: 401 });
    await (await store.client()).set(trialPrefix + 'version', 'browser-test-v1');
    await trial.revoke(g.token); await expect(trial.bootstrap(g.token)).rejects.toMatchObject({ status: 401 });
    expect(remote.request).not.toHaveBeenCalled();
  });
  it('pins retained profiles and enforces academy status and PIN rotation on every lease', async () => {
    const academyId = randomUUID(), prisma = { academy: { findUnique: vi.fn(async () => ({ id: academyId, name: 'Synthetic pilot', status: 'ACTIVE' })) } };
    config.set('TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS', [academyId]);
    const redis = await store.client();
    await redis.set(trialPrefix + 'academy-pin:' + academyId, JSON.stringify({ version: 'managed-v1' }));
    const browser = policy.issue(academyId)!;
    const issued = await store.issue('managed-v1', academyId, browser);
    const managedTrial = new TrialService(config, store, remote as unknown as TrialRuntime, undefined, prisma as never, policy, runs);
    const managed = new TrialBrowserService(managedTrial, store, runs), request = input();
    const active = await managed.start(issued.token, request);
    config.set('TURTLE_TRIAL_BROWSER_RUNTIME_ID', 'brython-3.15.0-bbbbbbbbbbbbbbbbbbbb');
    config.set('TURTLE_TRIAL_BROWSER_RETAINED_RUNTIME_IDS', [browser.browserRuntimeId]);
    expect((await managed.request(issued.token, active.id, 'renew') as { profile: unknown }).profile).toMatchObject({ runtimeId: browser.browserRuntimeId });
    // The start and the renewal above shared one academy read.
    expect(prisma.academy.findUnique).toHaveBeenCalledTimes(1);
    prisma.academy.findUnique.mockResolvedValue({ id: academyId, name: 'Synthetic pilot', status: 'SUSPENDED' });
    // A suspension is enforced once the short academy window passes, before the next 15 s renewal.
    const real = Date.now.bind(Date), clock = vi.spyOn(Date, 'now').mockImplementation(() => real() + trialAcademyCacheMs + 1);
    await expect(managed.request(issued.token, active.id, 'renew')).rejects.toMatchObject({ status: 401 });
    // A refused academy is never cached: reactivation is seen on the next request.
    prisma.academy.findUnique.mockResolvedValue({ id: academyId, name: 'Synthetic pilot', status: 'ACTIVE' });
    expect((await managedTrial.grant(issued.token)).academyId).toBe(academyId);
    clock.mockRestore();
    await redis.set(trialPrefix + 'academy-pin:' + academyId, JSON.stringify({ version: 'managed-v2' }));
    await expect(managed.request(issued.token, active.id, 'renew')).rejects.toMatchObject({ status: 401 });
    expect(remote.request).not.toHaveBeenCalled();
  });
  it('drains only browser records before legacy recovery and blocks concurrent admission/renewal', async () => {
    const g = await enter(), request = input(), active = await service.start(g.token, request);
    const redis = await store.client(), grant = await trial.grant(g.token);
    const server = await store.issue('browser-test-v1', '', policy.issue()); const serverGrant = (await store.grant(server.token, 'browser-test-v1'))!;
    const serverKey = randomUUID(); await store.reserve(serverGrant, serverKey, 'server-fingerprint'); await store.bind(serverGrant, serverKey, randomUUID());
    const pinKey = trialPrefix + 'academy-pin:' + randomUUID(); await redis.set(pinKey, 'registry-sentinel');
    const { drainBrowserAdmissions } = await import(new URL('../../../../deploy/scripts/turtle-browser-drain.mjs', import.meta.url).href);
    expect(await drainBrowserAdmissions(redis)).toMatchObject({ retired: 1, grants: 2, revoked: 1 });
    await expect(trial.grant(g.token)).rejects.toMatchObject({ status: 401 });
    expect(await store.run(grant, request.requestKey)).toBeNull(); expect(await store.owned(grant, active.id)).toBeNull();
    await expect(trial.bootstrap(g.token)).rejects.toMatchObject({ status: 401 });
    expect((await store.grant(server.token, 'browser-test-v1'))?.active).toBe(serverKey);
    expect((await store.grant(server.token, 'browser-test-v1'))?.browserProfile).toBeUndefined();
    expect(await store.run(serverGrant, serverKey)).not.toBeNull(); expect(await redis.get(pinKey)).toBe('registry-sentinel');
    const next = await enter(); await expect(service.start(next.token, input())).rejects.toMatchObject({ status: 503 });
    expect(remote.request).not.toHaveBeenCalled();
    expect(await drainBrowserAdmissions(redis)).toMatchObject({ retired: 0 });
  });
  it('keeps browser IDs out of the legacy server-session path', async () => {
    const g = await enter(), run = await service.start(g.token, input());
    await expect(trial.session(g.token, run.id)).rejects.toMatchObject({ status: 404 });
    await expect(trial.start(g.token, { source: 'print(1)', starterId: 'free', helperVersion: turtleHelperVersion, requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    expect(remote.request).not.toHaveBeenCalled(); expect(remote.lookup).not.toHaveBeenCalled();
  });
  it('never sends a browser grant to the shared server slot, even when idle or disabled', async () => {
    const g = await enter(), server = { source: 'input()', starterId: 'free' as const, helperVersion: turtleHelperVersion, requestKey: randomUUID() };
    await expect(trial.start(g.token, server)).rejects.toMatchObject({ status: 403, message: 'BROWSER_ENGINE_ONLY' });
    // The kill switch does not reopen the server path for grants issued as browser grants.
    config.set('TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED', false);
    await expect(trial.start(g.token, { ...server, requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    expect((await trial.grant(g.token)).active).toBe('');
    expect(remote.ready).not.toHaveBeenCalled(); expect(remote.request).not.toHaveBeenCalled(); expect(remote.lookup).not.toHaveBeenCalled();
  });
});
