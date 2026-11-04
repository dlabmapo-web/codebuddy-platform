import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { academyFeatureNames, academyRolloutFeatures, type DlabSsoUser } from '@cove/shared';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import type { SupabaseIdentity } from '../../auth/auth.types.js';
import type { SupabaseAuthService } from '../../auth/supabase-auth.service.js';
import { AcademyAccessService } from '../../authorization/academy-access.service.js';
import { SupportGrantResolver } from '../../authorization/support-grant.resolver.js';
import { DlabCampusProvisioner, dlabCampusSlug } from './dlab-campus-provisioner.js';
import { DlabInboundController } from './dlab.controller.js';
import { DlabSourceService } from './dlab-source.service.js';
import { DlabStateService } from './dlab-state.service.js';
import { DlabReconcilerService } from './dlab-reconciler.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';
import { DlabSsoService } from './dlab-sso.service.js';

const databaseUrl = process.env.COVE_DLAB_TEST_DATABASE_URL, redisUrl = process.env.COVE_DLAB_TEST_REDIS_URL;
describe.skipIf(!databaseUrl || !redisUrl)('HQ campus provisioning with isolated PostgreSQL/Redis', () => {
  let db: PrismaService, redis: Redis;
  beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/cove_dlab_test') throw new Error('Isolated cove_dlab_test database required');
    db = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }) as never);
    redis = new Redis(redisUrl!);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => { await redis?.quit(); await db?.$disconnect(); });
  function fixture(enabled = true) {
    const campusId = randomUUID();
    const config = new ConfigService({ DLAB_AUTO_PROVISION_CAMPUSES: enabled, PLATFORM_ORGANIZATION_SLUG: 'auto-' + campusId,
      DLAB_SSO_ENABLED: true, DLAB_SSO_ROLLOUT_MODE: 'campus', DLAB_INBOUND_SERVER_KEY: 'test-only-campus-inbound-key-32-bytes',
      DLAB_OS_BASE_URL: 'https://os.dlabcampus.com/v1', DLAB_CLIENT_SECRET: 'test-only-campus-client-secret-32-bytes',
      DLAB_REDIRECT_URI: 'http://localhost:3000/sso/callback', DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: [],
    });
    const state = new DlabStateService(redis), reconciler = new DlabReconcilerService(config as never);
    const source = new DlabSourceService(db, state, reconciler, undefined, new DlabCampusProvisioner(config as never));
    const policy = new DlabPolicyService(db, state, config as never);
    const record = () => db.dlabCampus.findUniqueOrThrow({ where: { externalCampusId: campusId }, include: { academy: true } });
    return { campusId, config, source, state, reconciler, policy, record };
  }
  async function login(f: ReturnType<typeof fixture>, role: string, externalUserId = randomUUID(), returnTo?: string) {
    const os: DlabSsoUser = { external_user_id: externalUserId, external_campus_id: f.campusId, name: 'New HQ account', user_role: role, account_status: 'active' };
    let claims: SupabaseIdentity;
    const auth = { createDlabUser: vi.fn(), dlabTokenHash: vi.fn().mockResolvedValue('test-only-hash'), verifyTokenClaims: vi.fn(async () => claims) };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(os))));
    const sso = new DlabSsoService(f.config as never, db, f.state, f.source, f.policy, auth as unknown as SupabaseAuthService, f.reconciler);
    const binding = 'a'.repeat(64), start = await sso.start(binding, returnTo);
    const completed = await sso.complete('test-only-code', start.state, binding);
    claims = { authUserId: completed.authUserId, sessionId: randomUUID(), email: null, emailIsPlaceholder: true, emailVerified: true,
      username: null, displayName: null, avatarUrl: null, provider: 'email', requestedAcademyId: null };
    const activated = await sso.activate(completed.ticket, binding, 'test-only-token');
    await f.policy.assertSession(claims);
    return { activated, claims, completed, externalUserId };
  }
  it('keeps the default-off source path and provisions a staged row on authenticated duplicate replay', async () => {
    const f = fixture(false), payload = { name: '마포 테스트', status: 'active' as const, updated_at: '2026-11-04T00:00:00Z' };
    expect(await f.source.campus(f.campusId, payload)).toMatchObject({ academyId: null, ssoEnabled: false });
    f.config.set('DLAB_AUTO_PROVISION_CAMPUSES', true);
    const controller = new DlabInboundController(f.config as never, f.source), requestId = randomUUID();
    const req = { body: payload, headers: { authorization: 'Bearer test-only-campus-inbound-key-32-bytes', 'x-request-id': requestId },
      rawHeaders: ['Authorization', 'Bearer test-only-campus-inbound-key-32-bytes', 'X-Request-Id', requestId] } as unknown as Request;
    expect(await controller.campus(req, f.campusId, payload)).toEqual({ ok: true, id: expect.any(String) });
    const saved = await f.record();
    expect(saved).toMatchObject({ ssoEnabled: true, academy: { name: payload.name, slug: dlabCampusSlug(f.campusId), timeZone: 'Asia/Seoul' } });
    expect((await db.academyFeatureFlag.findMany({ where: { academyId: saved.academyId! }, select: { feature: true, isEnabled: true } })).sort((a, b) => a.feature.localeCompare(b.feature)))
      .toEqual(academyFeatureNames.filter(x => !academyRolloutFeatures.has(x)).map(feature => ({ feature, isEnabled: true })).sort((a, b) => a.feature.localeCompare(b.feature)));
    expect(await db.dlabIntegrationEvent.findFirst({ where: { action: 'campus.provisioned', requestId } })).toMatchObject({ details: { externalCampusId: f.campusId, academyId: saved.academyId } });
    expect(await db.user.count({ where: { memberships: { some: { academyId: saved.academyId! } } } })).toBe(0);
  });
  it('dry-runs catch-up without writes, applies with audited authority, and repeats safely', async () => {
    const f = fixture(false);
    await f.source.campus(f.campusId, { name: 'Catch-up campus', status: 'active' });
    const actor = await db.user.create({ data: { username: 'auto_op_' + randomUUID().replaceAll('-', '').slice(0, 20), status: 'ACTIVE', platformRole: 'ADMIN' } });
    const run = (apply = false, overrides: NodeJS.ProcessEnv = {}) => promisify(execFile)('node', ['--import', 'tsx', 'src/integrations/dlab/scripts/provision-campuses.ts', actor.id, ...(apply ? ['--apply'] : [])], {
      env: { ...process.env, DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, MONITORING_REDIS_URL: redisUrl,
        DLAB_AUTO_PROVISION_CAMPUSES: 'true', DLAB_SSO_ROLLOUT_MODE: 'campus', PLATFORM_ORGANIZATION_SLUG: 'catchup-org', ...overrides },
    });
    const before = await db.academy.count(), beforeEvents = await db.dlabIntegrationEvent.count();
    expect(JSON.parse((await run()).stdout)).toMatchObject({ mode: 'dry-run', plan: expect.arrayContaining([expect.objectContaining({ externalCampusId: f.campusId, action: 'create' })]) });
    expect(await db.academy.count()).toBe(before);
    expect(await db.dlabIntegrationEvent.count()).toBe(beforeEvents);
    await expect(run(true, { DLAB_AUTO_PROVISION_CAMPUSES: 'false' })).rejects.toThrow();
    await expect(run(true, { REDIS_URL: '', MONITORING_REDIS_URL: '' })).rejects.toThrow();
    await run(true);
    const saved = await f.record(); expect(saved.ssoEnabled).toBe(true); expect(saved.academyId).not.toBeNull();
    expect(await db.auditLog.count({ where: { actorUserId: actor.id, targetId: f.campusId, action: 'dlab.provision-campus' } })).toBe(1);
    const count = await db.academy.count(); await run(true); expect(await db.academy.count()).toBe(count);
    expect((await f.record()).academyId).toBe(saved.academyId);
    await db.user.update({ where: { id: actor.id }, data: { platformRole: 'USER' } });
    await expect(run()).rejects.toThrow();
  }, 30_000);
  it('serializes concurrent first syncs and keeps mappings and events idempotent', async () => {
    const f = fixture(), input = { name: 'Concurrent campus', status: 'active' as const };
    const results = await Promise.all(Array.from({ length: 5 }, () => f.source.campus(f.campusId, input)));
    expect(new Set(results.map(x => x.academyId)).size).toBe(1);
    expect(await db.academy.count({ where: { slug: dlabCampusSlug(f.campusId) } })).toBe(1);
    expect(await db.dlabIntegrationEvent.count({ where: { action: 'campus.provisioned', details: { path: ['externalCampusId'], equals: f.campusId } } })).toBe(1);
    const revision = (await f.record()).accessRevision;
    await f.source.campus(f.campusId, { ...input, name: 'Renamed HQ campus' });
    expect(await f.record()).toMatchObject({ name: 'Renamed HQ campus', accessRevision: revision, academy: { name: input.name } });
  });
  it('leaves inactive campuses staged, ignores stale activation, and creates on a newer active version', async () => {
    const f = fixture();
    await f.source.campus(f.campusId, { name: 'Inactive', status: 'inactive', updated_at: '2026-11-04T02:00:00Z' });
    await f.source.campus(f.campusId, { name: 'Stale', status: 'active', updated_at: '2026-11-04T01:00:00Z' });
    expect(await f.record()).toMatchObject({ status: 'inactive', academyId: null, ssoEnabled: false });
    await expect(f.source.campus(f.campusId, { name: 'Conflict', status: 'active', updated_at: '2026-11-04T02:00:00Z' })).rejects.toThrow('conflicting_source_version');
    await f.source.campus(f.campusId, { name: 'Active now', status: 'active', updated_at: '2026-11-04T03:00:00Z' });
    expect(await f.record()).toMatchObject({ status: 'active', ssoEnabled: true, academyId: expect.any(String) });
  });
  it.each(['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const)('preserves an explicitly linked existing %s academy and its data', async status => {
    const f = fixture(false);
    await f.source.campus(f.campusId, { name: 'HQ Mapo', status: 'active' });
    const org = await db.organization.create({ data: { name: 'Existing organization', slug: 'existing-' + f.campusId } });
    const academy = await db.academy.create({ data: { organizationId: org.id, name: 'Dlab-Mapo existing', slug: 'existing-' + f.campusId, status } });
    const user = await db.user.create({ data: { username: 'existing_' + f.campusId.replaceAll('-', '').slice(0, 20) } });
    const membership = await db.academyMembership.create({ data: { academyId: academy.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' } });
    const course = await db.course.create({ data: { academyId: academy.id, title: 'Existing course', createdByUserId: user.id } });
    await db.academyFeatureFlag.create({ data: { academyId: academy.id, feature: 'TEACHER_LIVE_MONITORING', isEnabled: false } });
    await db.dlabCampus.update({ where: { externalCampusId: f.campusId }, data: { academyId: academy.id, ssoEnabled: true } });
    f.config.set('DLAB_AUTO_PROVISION_CAMPUSES', true);
    await f.source.campus(f.campusId, { name: 'HQ renamed Mapo', status: 'active' });
    expect(await f.record()).toMatchObject({ academyId: academy.id, academy: { name: academy.name, slug: academy.slug, status } });
    expect(await db.course.findUnique({ where: { id: course.id } })).not.toBeNull();
    expect(await db.academyMembership.findUnique({ where: { id: membership.id } })).not.toBeNull();
    expect(await db.academyFeatureFlag.findUnique({ where: { academyId_feature: { academyId: academy.id, feature: 'TEACHER_LIVE_MONITORING' } } })).toMatchObject({ isEnabled: false });
    if (status !== 'ACTIVE') await expect(login(f, 'lab_head')).rejects.toThrow('campus_mapping_required');
  });
  it('preserves explicit operator disables for both staged and mapped campuses', async () => {
    const f = fixture(false), payload = { name: 'Locally disabled', status: 'active' as const };
    await f.source.campus(f.campusId, payload);
    await db.dlabCampus.update({ where: { externalCampusId: f.campusId }, data: { ssoEnabled: false, ssoEnabledAt: new Date() } });
    f.config.set('DLAB_AUTO_PROVISION_CAMPUSES', true);
    expect(await f.source.campus(f.campusId, payload)).toMatchObject({ academyId: null, ssoEnabled: false });
    const mapped = fixture(); await mapped.source.campus(mapped.campusId, payload);
    await db.dlabCampus.update({ where: { externalCampusId: mapped.campusId }, data: { ssoEnabled: false, ssoEnabledAt: new Date() } });
    await mapped.source.campus(mapped.campusId, { ...payload, status: 'inactive' });
    await mapped.source.campus(mapped.campusId, payload);
    expect((await mapped.record()).ssoEnabled).toBe(false);
    await expect(login(mapped, 'lab_head')).rejects.toThrow('campus_mapping_required');
  });
  it.each(['current', 'retired'])('fails atomically on a %s slug collision without adopting an existing academy', async kind => {
    const f = fixture(), org = await db.organization.create({ data: { name: 'Conflict org', slug: 'conflict-' + f.campusId } });
    const slug = dlabCampusSlug(f.campusId);
    const academy = await db.academy.create({ data: { organizationId: org.id, name: 'Unrelated academy', slug: kind === 'current' ? slug : 'retired-' + f.campusId } });
    if (kind === 'retired') await db.academySlugHistory.create({ data: { slug, academyId: academy.id } });
    await expect(f.source.campus(f.campusId, { name: 'New HQ branch', status: 'active' })).rejects.toThrow('campus_academy_slug_conflict');
    expect(await db.dlabCampus.findUnique({ where: { externalCampusId: f.campusId } })).toBeNull();
    expect(await db.dlabIntegrationEvent.count({ where: { details: { path: ['externalCampusId'], equals: f.campusId } } })).toBe(0);
  });
  it.each([['lab_head', 'MANAGER'], ['edu_manager', 'TEAM_LEAD'], ['tutor', 'TEACHER'], ['student', 'STUDENT'], ['hq_admin', null]])('logs %s into the new campus, reuses identity and rejects another campus', async (role, expectedRole) => {
    const f = fixture(), other = fixture();
    await f.source.campus(f.campusId, { name: 'New Gangnam', status: 'active' });
    await other.source.campus(other.campusId, { name: 'Other campus', status: 'active' });
    const own = await f.record(), foreign = await other.record();
    const first = await login(f, role!, randomUUID(), '/academy/' + foreign.academy!.slug);
    expect(first.activated.destination).toBe(expectedRole ? '/academy/' + own.academy!.slug : '/admin/academies');
    const identity = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: first.externalUserId }, include: { bindings: { include: { membership: true } } } });
    expect(identity.bindings.map(x => x.membership.academyId)).toEqual(expectedRole ? [own.academyId] : []);
    if (expectedRole) {
      expect(identity.bindings[0]!.membership.role).toBe(expectedRole);
      const access = new AcademyAccessService(db, new SupportGrantResolver(db), f.policy);
      await expect(access.requirePermission(first.claims.authUserId, foreign.academyId!, 'academy.read')).rejects.toThrow();
    }
    const repeated = await login(f, role!, first.externalUserId);
    expect(repeated.completed.authUserId).toBe(first.completed.authUserId);
    expect(await db.academy.count({ where: { id: own.academyId! } })).toBe(1);
  });
  it('does not let a login payload invent a missing campus', async () => {
    const f = fixture();
    const userId = randomUUID();
    await expect(login(f, 'lab_head', userId)).rejects.toThrow('campus_mapping_required');
    expect(await db.dlabCampus.findUnique({ where: { externalCampusId: f.campusId } })).toBeNull();
    const pending = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: userId } });
    expect(pending.userId).toBeNull();
    await f.source.campus(f.campusId, { name: 'Later verified by HQ', status: 'active' });
    expect((await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: userId } })).userId).toBeNull();
    const fresh = await login(f, 'lab_head', userId);
    expect(fresh.completed.authUserId).toBe(pending.reservedUserId);
  });
  it('revokes on source deactivation, preserves data, and does not clear local restrictions on reactivation', async () => {
    const f = fixture(), payload = { name: 'Lifecycle campus', status: 'active' as const };
    await f.source.campus(f.campusId, payload);
    const first = await login(f, 'tutor'), before = await f.record();
    const identity = await db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: first.externalUserId }, include: { bindings: true } });
    await db.academyMembership.update({ where: { id: identity.bindings[0]!.membershipId }, data: { status: 'SUSPENDED' } });
    await f.source.campus(f.campusId, { ...payload, status: 'inactive' });
    await expect(f.policy.assertSession(first.claims)).rejects.toThrow();
    await f.source.campus(f.campusId, payload);
    expect((await f.record()).academyId).toBe(before.academyId);
    expect(await db.academyMembership.findUnique({ where: { id: identity.bindings[0]!.membershipId } })).toMatchObject({ status: 'SUSPENDED' });
    await expect(login(f, 'tutor', first.externalUserId)).rejects.toThrow();
  });
});
