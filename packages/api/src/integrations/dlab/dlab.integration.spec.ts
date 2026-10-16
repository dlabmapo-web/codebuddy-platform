import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../database/prisma.service.js';
import type { SupabaseAuthService } from '../../auth/supabase-auth.service.js';
import type { SupabaseIdentity } from '../../auth/auth.types.js';
import { DlabStateService, digest } from './dlab-state.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';
import { DlabSourceService } from './dlab-source.service.js';
import { DlabSsoService } from './dlab-sso.service.js';

const databaseUrl = process.env.COVE_DLAB_TEST_DATABASE_URL;
const redisUrl = process.env.COVE_DLAB_TEST_REDIS_URL;
// No default DATABASE_URL fallback: this suite must never mutate a developer/production DB.
describe.skipIf(!databaseUrl || !redisUrl)('DLAB with isolated PostgreSQL and Redis', () => {
  let prisma: PrismaService, redis: Redis, state: DlabStateService, policy: DlabPolicyService, source: DlabSourceService, sso: DlabSsoService;
  const id = `test_${randomUUID()}`, campusId = `campus_${randomUUID()}`, binding = 'b'.repeat(64);
  let academyId: string, authId: string;
  const osUser = { external_user_id: id, external_campus_id: campusId, name: 'Controlled fixture', grade: '중2', user_role: 'student', account_status: 'active' };
  const bridgeAuth = { createDlabUser: vi.fn().mockImplementation(async (id: string) => { authId = id; }), dlabTokenHash: vi.fn().mockResolvedValue('server-only-token-hash'), verifyTokenClaims: vi.fn() };
  const identity = (sessionId: string): SupabaseIdentity => ({ authUserId: authId, sessionId, email: null, emailIsPlaceholder: true, emailVerified: true, username: null, displayName: null, avatarUrl: null, provider: 'email', requestedAcademyId: null });
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/cove_dlab_test') throw new Error('An isolated local cove_dlab_test database is required');
    const config = new ConfigService({ DATABASE_URL: databaseUrl, DLAB_SSO_ENABLED: true, DLAB_OS_BASE_URL: 'https://dlab-os.onrender.com/v1', DLAB_REDIRECT_URI: 'https://cs.coveedu.com/sso/callback', DLAB_CLIENT_SECRET: 'fake-client-secret-for-tests-only', DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: [id] });
    prisma = new PrismaService(config as never);
    redis = new Redis(redisUrl!);
    state = new DlabStateService(redis);
    policy = new DlabPolicyService(prisma, state);
    await policy.onModuleInit();
    source = new DlabSourceService(prisma, state);
    sso = new DlabSsoService(config as never, prisma, state, source, policy, bridgeAuth as unknown as SupabaseAuthService);
    const org = await prisma.organization.create({ data: { name: 'Isolated SSO test', slug: `sso-${randomUUID()}` } });
    const academy = await prisma.academy.create({ data: { organizationId: org.id, name: 'SSO test academy', slug: `test-${randomUUID()}` } });
    academyId = academy.id;
    await source.campus(campusId, { name: 'Test campus', status: 'active', updated_at: '2026-01-01T00:00:00Z' });
    await prisma.dlabCampus.update({ where: { externalCampusId: campusId }, data: { academyId } });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(osUser), { status: 200 })));
  });
  afterAll(async () => { vi.unstubAllGlobals(); await policy?.onModuleDestroy(); await redis?.quit(); await prisma?.$disconnect(); });
  async function login() {
    const attempt = await sso.start(binding, '/academy/not-my-academy');
    const completed = await sso.complete('single-use-os-code', attempt.state, binding);
    const current = identity(randomUUID());
    bridgeAuth.verifyTokenClaims.mockResolvedValue(current);
    const destination = await sso.activate(completed.ticket, binding, 'verified-test-token');
    return { current, attempt, completed, destination };
  }
  it('binds and atomically consumes state; wrong browser cannot burn it', async () => {
    const token = await state.issue('fixture', binding, { answer: 42 });
    await expect(state.consume('fixture', token, 'wrong')).rejects.toThrow();
    expect(await state.consume<{ answer: number }>('fixture', token, binding)).toMatchObject({ answer: 42 });
    await expect(state.consume('fixture', token, binding)).rejects.toThrow();
    const expired = await state.issue('fixture', binding, {});
    await redis.del(`cove:dlab:fixture:${digest(expired)}`);
    await expect(state.consume('fixture', expired, binding)).rejects.toThrow();
  });
  it('provisions one user, rejects replay, and restricts landing to the mapped academy', async () => {
    const result = await login();
    expect(result.destination.destination).not.toBe('/academy/not-my-academy');
    await policy.assertSession(result.current);
    await expect(sso.complete('again', result.attempt.state, binding)).rejects.toThrow();
    await expect(sso.activate(result.completed.ticket, binding, 'verified-test-token')).rejects.toThrow();
    const again = await login();
    await policy.assertSession(again.current);
    expect(await prisma.dlabIdentity.count({ where: { externalUserId: id } })).toBe(1);
    expect(await prisma.academyMembership.count({ where: { user: { authUserId: authId } } })).toBe(1);
    expect(await prisma.studentAcademyProfile.findFirst({ where: { membership: { user: { authUserId: authId } } } })).toMatchObject({ schoolGrade: '중2' });
  });
  it('blocks local OS-field/role edits at the database boundary', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { authUserId: authId } });
    await expect(prisma.user.update({ where: { id: user.id }, data: { displayName: 'Forged name' } })).rejects.toThrow();
    await expect(prisma.user.update({ where: { id: user.id }, data: { platformRole: 'ADMIN' } })).rejects.toThrow();
    const membership = await prisma.academyMembership.findFirstOrThrow({ where: { userId: user.id } });
    await expect(prisma.academyMembership.update({ where: { id: membership.id }, data: { role: 'MANAGER' } })).rejects.toThrow();
    await expect(prisma.academyMembershipRole.create({ data: { membershipId: membership.id, role: 'MANAGER', grantedByUserId: user.id } })).rejects.toThrow();
    await expect(prisma.studentAcademyProfile.update({ where: { membershipId: membership.id }, data: { schoolGrade: 'forged' } })).rejects.toThrow();
    await expect(prisma.academyMemberProfile.create({ data: { membershipId: membership.id, academyDisplayName: 'Forged override' } })).rejects.toThrow();
  });
  it('publishes access rechecks after committing a source update', async () => {
    let unwatch: () => void = () => {};
    const received = new Promise<void>((resolve) => { unwatch = policy.watch(resolve); });
    try {
      await source.user(id, { ...osUser, updated_at: '2026-01-01T12:00:00Z' } as never);
      await received;
    } finally { unwatch(); }
  });
  it('does not clear a local suspension when OS remains active', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { authUserId: authId } });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    await source.user(id, { ...osUser, updated_at: '2026-01-01T13:00:00Z' } as never);
    await expect(policy.eligible(authId)).rejects.toThrow();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('SUSPENDED');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
  });
  it('deactivation blocks live tokens; reactivation cannot revive old sessions', async () => {
    const { current } = await login();
    await source.user(id, { ...osUser, account_status: 'inactive', updated_at: '2026-01-02T00:00:00Z' } as never);
    await expect(policy.assertSession(current)).rejects.toThrow();
    await source.user(id, { ...osUser, updated_at: '2026-01-03T00:00:00Z' } as never);
    await expect(policy.assertSession(current)).rejects.toThrow('session_not_activated');
    const fresh = await login();
    await policy.assertSession(fresh.current);
    await source.campus(campusId, { name: 'Test campus', status: 'inactive', updated_at: '2026-01-04T00:00:00Z' });
    await expect(policy.assertSession(fresh.current)).rejects.toThrow();
  });
  it('never retries failed OS exchanges and never provisions an unmapped campus', async () => {
    await source.campus(campusId, { name: 'Test campus', status: 'active', updated_at: '2026-01-05T00:00:00Z' });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    const attempt = await sso.start(binding);
    const before = fetchMock.mock.calls.length;
    await expect(sso.complete('bad-code', attempt.state, binding)).rejects.toThrow('code_exchange_failed');
    expect(fetchMock.mock.calls.length - before).toBe(1);
    await prisma.dlabCampus.update({ where: { externalCampusId: campusId }, data: { academyId: null } });
    const unmapped = await sso.start(binding);
    await expect(sso.complete('valid-code', unmapped.state, binding)).rejects.toThrow('campus_mapping_required');
  });
});
