import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { TrialStore } from './trial-store.js';
import { TrialPins, academyPinKey } from './trial-pins.js';
import { TrialService } from './trial.service.js';
import { AcademyTurtleService } from '../manage/academy-turtle.service.js';
import { trialDigest } from './trial-security.js';

const url = process.env.TURTLE_TRIAL_TEST_REDIS_URL;
const local = url && new URL(url).hostname === '127.0.0.1' && new URL(url).port === '6397' && new URL(url).pathname === '/1';
// The original grant suite owns DB 1 and flushes it. This suite owns DB 2,
// so Vitest's parallel file workers cannot erase each other's fixtures.
const registryUrl = local ? new URL(url) : null;
if (registryUrl) registryUrl.pathname = '/2';
const forced = vi.hoisted(() => ({ values: [] as number[] }));
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, randomInt: (max: number) => forced.values.length ? forced.values.shift()! : actual.randomInt(max) };
});
describe.skipIf(!local)('academy Turtle codes with real Redis', () => {
  const config = new ConfigService({ REDIS_URL: registryUrl?.toString(), TURTLE_TRIAL_ENABLED: true, TURTLE_TRIAL_LEGACY_PIN_ENABLED: false,
    TURTLE_TRIAL_PIN_PEPPER: 'test-academy-pin-pepper-at-least-32-characters', BFF_SHARED_SECRET: 'test-bff-secret-at-least-32-characters' });
  const store = new TrialStore(config); const pins = new TrialPins(config, store);
  const other = new TrialPins(config, store);
  const a = randomUUID(); const b = randomUUID();
  const statuses = new Map<string, string>([[a, 'ACTIVE'], [b, 'ACTIVE']]);
  const prisma = { academy: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => statuses.has(where.id) ? { id: where.id, name: where.id === a ? 'Mapo Campus' : 'Other Academy', status: statuses.get(where.id) } : null) } };
  const runtime = { ready: vi.fn(async () => {}) };
  const service = new TrialService(config, store, runtime as never, pins, prisma as never);
  beforeAll(async () => { await store.client(); });
  beforeEach(async () => { await store.redis!.flushdb(); forced.values = []; statuses.set(a, 'ACTIVE'); statuses.set(b, 'ACTIVE'); });
  afterAll(async () => { await store.redis?.flushdb(); await store.onModuleDestroy(); });
  async function admit(pin: string) {
    const { nonce } = await service.challenge('local');
    return service.access(pin, nonce, 'local');
  }
  it('keeps legacy access off when the flag is omitted even if an operator PIN exists', async () => {
    const pepper = config.get<string>('TURTLE_TRIAL_PIN_PEPPER')!;
    const legacyConfig = new ConfigService({ TURTLE_TRIAL_ENABLED: true,
      BFF_SHARED_SECRET: config.get('BFF_SHARED_SECRET'), TURTLE_TRIAL_PIN_PEPPER: pepper,
      TURTLE_TRIAL_PIN_DIGEST: trialDigest('012345', pepper), TURTLE_TRIAL_PIN_VERSION: 'old-version' });
    const legacy = new TrialService(legacyConfig, store, runtime as never);
    const { nonce } = await legacy.challenge('local');
    await expect(legacy.access('012345', nonce, 'local')).rejects.toThrow('INVALID_PIN');
  });
  it('creates unique encrypted codes, reveals only the selected version and resolves its academy', async () => {
    forced.values = [123, 123, 456];
    const first = await pins.generate(a, null); const second = await other.generate(b, null);
    expect(first.pin).toBe('000123'); expect(second.pin).toBe('000456');
    expect(first.pin).toMatch(/^[0-9]{6}$/); expect(second.pin).not.toBe(first.pin);
    expect(await pins.resolve(first.pin)).toEqual({ academyId: a, version: first.current.version });
    expect(await other.reveal(a, first.current.version)).toEqual(first);
    expect(JSON.parse((await store.redis!.get(academyPinKey(a)))!).ciphertext).not.toBe(first.pin);
    expect(await pins.state(a)).toEqual({ available: true, current: first.current });
    await expect(pins.reveal(a, randomUUID())).rejects.toThrow('PIN_CHANGED');
  });
  it('rejects stale/concurrent generation and keeps retired digits reserved for two hours', async () => {
    const original = await pins.generate(a, null);
    const results = await Promise.allSettled([pins.generate(a, original.current.version), other.generate(a, original.current.version)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await pins.resolve(original.pin)).toBeNull();
    const indices = await store.redis!.keys('cove:turtle:v1:pin-index:*');
    const expiries = await Promise.all(indices.map(key => store.redis!.ttl(key)));
    expect(expiries.some(ttl => ttl > 7100 && ttl <= 7200)).toBe(true);
    await expect(pins.generate(a, null)).rejects.toThrow('PIN_CHANGED');
  });
  it('revokes only the rotated academy and refuses disabled or missing academies', async () => {
    const first = await pins.generate(a, null); const second = await pins.generate(b, null);
    const one = await admit(first.pin); const two = await admit(second.pin);
    expect((await service.bootstrap(one.token)).academy).toEqual({ id: a, name: 'Mapo Campus' });
    await pins.generate(a, first.current.version);
    await expect(service.grant(one.token)).rejects.toThrow('ACCESS_EXPIRED');
    expect((await service.grant(two.token)).academyId).toBe(b);
    statuses.set(b, 'SUSPENDED');
    await expect(admit(second.pin)).rejects.toThrow('ACCESS_EXPIRED');
    await expect(service.grant(two.token)).rejects.toThrow('ACCESS_EXPIRED');
    statuses.delete(b);
    await expect(service.grant(two.token)).rejects.toThrow('ACCESS_EXPIRED');
  });
  it('requires a live manager permission for every read, reveal and generation', async () => {
    const access = { requirePermission: vi.fn().mockRejectedValue(new Error('FORBIDDEN')) };
    const audit = { write: vi.fn() };
    const manager = new AcademyTurtleService(access as never, prisma as never, audit as never, pins, store);
    const identity = { authUserId: 'student-or-other-academy' } as never;
    await expect(manager.state(identity, { academyId: a })).rejects.toThrow('FORBIDDEN');
    await expect(manager.reveal(identity, { academyId: a, expectedVersion: randomUUID() })).rejects.toThrow('FORBIDDEN');
    await expect(manager.generate(identity, { academyId: a, expectedVersion: null })).rejects.toThrow('FORBIDDEN');
    expect(access.requirePermission).toHaveBeenCalledWith('student-or-other-academy', a, 'academy.settings.manage');
    expect(audit.write).not.toHaveBeenCalled(); expect((await pins.state(a)).current).toBeNull();
  });
  it('audits before changing or exposing a code and refuses the operation on audit failure', async () => {
    const audit = { write: vi.fn().mockRejectedValue(new Error('AUDIT_UNAVAILABLE')) };
    const access = { requirePermission: vi.fn().mockResolvedValue({ userId: 'manager', roles: ['MANAGER'] }) };
    const manager = new AcademyTurtleService(access as never, prisma as never, audit as never, pins, store);
    const identity = { authUserId: 'manager-auth' } as never;
    await expect(manager.generate(identity, { academyId: a, expectedVersion: null })).rejects.toThrow('AUDIT_UNAVAILABLE');
    expect((await pins.state(a)).current).toBeNull();
    audit.write.mockResolvedValue({} as never);
    const created = await manager.generate(identity, { academyId: a, expectedVersion: null });
    expect((await manager.reveal(identity, { academyId: a, expectedVersion: created.current.version })).pin).toBe(created.pin);
    expect(JSON.stringify(audit.write.mock.calls)).not.toContain(created.pin);
    audit.write.mockRejectedValue(new Error('AUDIT_UNAVAILABLE'));
    await expect(manager.reveal(identity, { academyId: a, expectedVersion: created.current.version })).rejects.toThrow('AUDIT_UNAVAILABLE');
    statuses.set(a, 'ARCHIVED');
    await expect(manager.state(identity, { academyId: a })).rejects.toThrow('ACADEMY_UNAVAILABLE');
  });
});
