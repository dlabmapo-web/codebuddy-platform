import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { DlabSsoUser } from '@cove/shared';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../database/prisma.service.js';
import { AcademyAccessService } from '../../authorization/academy-access.service.js';
import { PlatformAccessService } from '../../authorization/platform-access.service.js';
import { SupportGrantResolver } from '../../authorization/support-grant.resolver.js';
import type { SupabaseAuthService } from '../../auth/supabase-auth.service.js';
import type { SupabaseIdentity } from '../../auth/auth.types.js';
import { DlabStateService } from './dlab-state.service.js';
import { DlabReconcilerService } from './dlab-reconciler.service.js';
import { DlabSourceService } from './dlab-source.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';
import { DlabSsoService } from './dlab-sso.service.js';
import { dlabTransaction, sourceWrite } from './dlab-transaction.js';
import { restoreDlabMembership } from './dlab-local-restriction.js';

const databaseUrl = process.env.COVE_DLAB_TEST_DATABASE_URL;
const redisUrl = process.env.COVE_DLAB_TEST_REDIS_URL;
describe.skipIf(!databaseUrl || !redisUrl)('automatic staff SSO, real isolated database/Redis', () => {
  let db: PrismaService, redis: Redis;
  beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/cove_dlab_test') throw new Error('Isolated cove_dlab_test database required');
    db = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }) as never);
    redis = new Redis(redisUrl!);
  });
  afterAll(async () => { vi.unstubAllGlobals(); await redis?.quit(); await db?.$disconnect(); });
  async function fixture(role = 'tutor', mode = 'campus') {
    const id = randomUUID(), primary = randomUUID(), secondary = randomUUID(), binding = 'f'.repeat(64);
    const config = new ConfigService({ DLAB_SSO_ENABLED: true, DLAB_SSO_ROLLOUT_MODE: mode, DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: mode === 'allowlist' ? [id] : [], DLAB_OS_BASE_URL: 'https://os.dlabcampus.com/v1', DLAB_CLIENT_SECRET: 'test-only-client-secret-not-a-real-key', DLAB_REDIRECT_URI: 'http://localhost:3000/sso/callback' });
    const state = new DlabStateService(redis), reconciler = new DlabReconcilerService(config as never);
    const source = new DlabSourceService(db, state, reconciler);
    const policy = new DlabPolicyService(db, state, config as never);
    const org = await db.organization.create({ data: { name: 'SSO fixtures', slug: 'sso-' + id } });
    const academies = await Promise.all([primary, secondary].map(c => db.academy.create({ data: { organizationId: org.id, name: 'Fixture campus', slug: 'campus-' + c } })));
    for (const [i, c] of [primary, secondary].entries()) await db.dlabCampus.create({ data: { externalCampusId: c, name: 'Fixture', status: 'active', payloadHash: 'fixture', academyId: academies[i]!.id, ssoEnabled: true } });
    const os: DlabSsoUser = { external_user_id: id, external_campus_id: primary, external_campus_ids: [primary, secondary], name: 'OS fixture', user_role: role, account_status: 'active' };
    if (role === 'student') os.external_campus_ids = [primary];
    let claims: SupabaseIdentity;
    const auth = { createDlabUser: vi.fn(), dlabTokenHash: vi.fn().mockResolvedValue('private-test-hash'), verifyTokenClaims: vi.fn().mockImplementation(async () => claims) };
    const sso = new DlabSsoService(config as never, db, state, source, policy, auth as unknown as SupabaseAuthService, reconciler);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      expect(_url).toBe('https://os.dlabcampus.com/v1/sso/token');
      expect(init.redirect).toBe('error');
      expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
      return new Response(JSON.stringify(os));
    }));
    async function login(returnTo?: string) {
      const attempt = await sso.start(binding, returnTo);
      const completed = await sso.complete('test-code', attempt.state, binding);
      claims = { authUserId: completed.authUserId, sessionId: randomUUID(), email: null, emailIsPlaceholder: true, emailVerified: true, username: null, displayName: null, avatarUrl: null, provider: 'email', requestedAcademyId: null };
      const activated = await sso.activate(completed.ticket, binding, 'test-token');
      await policy.assertSession(claims);
      return { ...activated, claims, completed, attempt };
    }
    const record = () => db.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: id }, include: { user: true, bindings: { include: { membership: true } } } });
    return { id, primary, secondary, os, config, source, policy, sso, binding, auth, academies, login, record };
  }
  it.each([['student', 'STUDENT', true, 1], ['instructor', 'TEAM_LEAD', false, 2], ['edu_manager', 'TEAM_LEAD', false, 2], ['lab_head', 'MANAGER', false, 2], ['tutor', 'TEACHER', false, 2], ['so_staff', 'TEAM_LEAD', false, 2], ['future_role', 'STUDENT', true, 1]])('automatically provisions %s as %s without a user allowlist or prior PUT', async (osRole, localRole, studentLease, campusCount) => {
    const f = await fixture(osRole as string);
    const first = await f.login();
    expect(first.requiresStudentSession).toBe(studentLease);
    const saved = await f.record();
    expect(saved.user?.platformRole).toBe('USER');
    expect(saved.bindings).toHaveLength(campusCount as number);
    expect(saved.bindings.every(b => b.membership.role === localRole && b.membership.status === 'ACTIVE')).toBe(true);
    expect(await db.studentAcademyProfile.count({ where: { membershipId: { in: saved.bindings.map(b => b.membershipId) } } })).toBe(studentLease ? 1 : 0);
    const access = new AcademyAccessService(db, new SupportGrantResolver(db), f.policy);
    for (const permission of ['curriculum.manage', 'class-teachers.manage', 'class-enrollments.manage'] as const) {
      const allowed = access.requirePermission(first.claims.authUserId, f.academies[0]!.id, permission);
      if (localRole === 'TEAM_LEAD' || localRole === 'MANAGER') await expect(allowed).resolves.toMatchObject({ role: localRole });
      else await expect(allowed).rejects.toThrow();
    }
    const again = await f.login();
    expect(again.completed.authUserId).toBe(first.completed.authUserId);
    expect((await f.record()).bindings.map(b => b.membershipId).sort()).toEqual(saved.bindings.map(b => b.membershipId).sort());
    expect(await db.academyJoinRequest.count({ where: { userId: saved.userId! } })).toBe(0);
  });
  it('provisions HQ platform admin without academy memberships and reuses the managed identity', async () => {
    const f = await fixture('hq_admin'); const first = await f.login('/academy/not-my-academy');
    expect(first).toMatchObject({ destination: '/admin/academies', requiresStudentSession: false });
    const saved = await f.record();
    expect(saved.user?.platformRole).toBe('ADMIN'); expect(saved.bindings).toHaveLength(0);
    const platform = new PlatformAccessService(db, f.policy);
    await expect(platform.requirePermission(first.claims.authUserId, 'platform.academies.create')).resolves.toMatchObject({ userId: saved.userId });
    const academy = new AcademyAccessService(db, new SupportGrantResolver(db), f.policy);
    await expect(academy.requirePermission(first.claims.authUserId, f.academies[1]!.id, 'academy.read')).resolves.toMatchObject({ via: 'platform' });
    await expect(academy.requirePermission(first.claims.authUserId, f.academies[1]!.id, 'submissions.own.create')).rejects.toThrow();
    const again = await f.login(); expect(again.completed.authUserId).toBe(first.completed.authUserId);
    expect((await f.record()).userId).toBe(saved.userId);
    await expect(db.user.update({ where: { id: saved.userId! }, data: { platformRole: 'USER' } })).rejects.toThrow();
  });
  it('revokes HQ privilege and tokens on demotion, then upgrades again without restoring old academy access', async () => {
    const f = await fixture('lab_head'); const manager = await f.login(); const before = await f.record();
    f.os.user_role = 'hq_admin'; await f.source.user(f.id, { ...f.os, updated_at: '2027-01-01T00:00:00Z' });
    await expect(f.policy.assertSession(manager.claims)).rejects.toThrow('session_not_activated');
    const admin = await f.login(); expect(admin.destination).toBe('/admin/academies');
    const hq = await f.record(); expect(hq.user?.platformRole).toBe('ADMIN');
    expect(hq.bindings.every(b => b.membership.status === 'SUSPENDED' && b.sourceAccessStatus === 'BLOCKED')).toBe(true);
    const academy = new AcademyAccessService(db, new SupportGrantResolver(db), f.policy);
    await expect(academy.requirePermission(admin.claims.authUserId, f.academies[0]!.id, 'academy.read')).resolves.toMatchObject({ via: 'platform' });
    f.os.user_role = 'edu_manager'; await f.source.user(f.id, { ...f.os, updated_at: '2027-01-02T00:00:00Z' });
    await expect(f.policy.assertSession(admin.claims)).rejects.toThrow('session_not_activated');
    await expect(new PlatformAccessService(db, f.policy).requirePermission(admin.claims.authUserId, 'platform.academies.read')).rejects.toThrow();
    const after = await f.record(); expect(after.user?.platformRole).toBe('USER');
    expect(after.bindings.every(b => b.membership.role === 'TEAM_LEAD')).toBe(true);
    expect(after.userId).toBe(before.userId);
    expect(after.bindings.map(b => b.membershipId).sort()).toEqual(before.bindings.map(b => b.membershipId).sort());
    expect((await f.login()).destination).toBe('/academy/' + f.academies[0]!.slug);
  });
  it('blocks HQ admins outside rollout and revokes admin authority when the last approved campus is disabled', async () => {
    const f = await fixture('hq_admin'); f.os.external_campus_ids = [f.primary];
    await db.dlabCampus.update({ where: { externalCampusId: f.primary }, data: { ssoEnabled: false } });
    await expect(f.login()).rejects.toThrow('campus_mapping_required'); expect(f.auth.createDlabUser).not.toHaveBeenCalled();
    await db.dlabCampus.update({ where: { externalCampusId: f.primary }, data: { ssoEnabled: true } });
    const first = await f.login();
    await f.source.campus(f.primary, { name: 'Fixture', status: 'inactive', updated_at: '2027-01-01T00:00:00Z' });
    expect((await f.record()).user?.platformRole).toBe('USER');
    await expect(f.policy.assertSession(first.claims)).rejects.toThrow();
    await expect(new PlatformAccessService(db, f.policy).requirePermission(first.claims.authUserId, 'platform.academies.read')).rejects.toThrow();
  });
  it('revokes HQ admin on OS deactivation and keeps a local membership suspension during promotion', async () => {
    const f = await fixture('hq_admin'); const first = await f.login();
    f.os.account_status = 'inactive'; await f.source.user(f.id, { ...f.os, updated_at: '2027-01-01T00:00:00Z' });
    expect((await f.record()).user?.platformRole).toBe('USER');
    await expect(f.policy.assertSession(first.claims)).rejects.toThrow();
    const restricted = await fixture('instructor'); await restricted.login(); const saved = await restricted.record();
    await db.academyMembership.update({ where: { id: saved.bindings[0]!.membershipId }, data: { status: 'SUSPENDED' } });
    restricted.os.user_role = 'hq_admin'; await restricted.source.user(restricted.id, { ...restricted.os, updated_at: '2027-01-01T00:00:00Z' });
    expect((await restricted.record()).user?.platformRole).toBe('USER');
    await expect(restricted.login()).rejects.toThrow('dlab_access_unavailable');
  });
  it.each([['tutor', 'STUDENT', 'TEACHER'], ['instructor', 'TEACHER', 'TEAM_LEAD'], ['so_staff', 'STUDENT', 'TEAM_LEAD']] as const)('reconciles an existing %s %s membership to %s without replacing its account or history', async (osRole, previousRole, nextRole) => {
    const f = await fixture(osRole); f.os.external_campus_ids = [f.primary];
    const initial = await f.login();
    const before = await f.record(), member = before.bindings[0]!;
    // Model a membership provisioned before the latest confirmed mapping.
    await dlabTransaction(db, async tx => {
      await sourceWrite(tx);
      await tx.academyMembership.update({ where: { id: member.membershipId }, data: { role: previousRole } });
      await tx.studentAcademyProfile.create({ data: { membershipId: member.membershipId, academyId: member.membership.academyId, schoolGrade: 'preserved', codingInterests: [] } });
    });
    const actor = await db.user.create({ data: { username: 'op_' + randomUUID().replaceAll('-', '').slice(0, 20), status: 'ACTIVE', platformRole: 'ADMIN' } });
    const result = await promisify(execFileCallback)('node', ['--import', 'tsx', 'src/integrations/dlab/scripts/operator.ts', 'invalidate', actor.id, '--apply'], {
      env: { ...process.env, DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, MONITORING_REDIS_URL: redisUrl, DLAB_SSO_ROLLOUT_MODE: 'campus' },
    });
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toMatchObject({ mode: 'apply', command: 'invalidate' });
    const after = await f.record();
    expect(after.userId).toBe(before.userId);
    expect(after.user?.authUserId).toBe(before.user?.authUserId);
    expect(after.userRole).toBe(osRole);
    expect(after.bindings[0]).toMatchObject({ membershipId: member.membershipId, membership: { role: nextRole, status: 'ACTIVE' } });
    expect((await db.studentAcademyProfile.findUniqueOrThrow({ where: { membershipId: member.membershipId } })).schoolGrade).toBe('preserved');
    await expect(f.policy.assertSession(initial.claims)).rejects.toThrow('session_not_activated');
    const fresh = await f.login();
    expect(fresh.requiresStudentSession).toBe(false);
    expect(fresh.completed.authUserId).toBe(initial.completed.authUserId);
  }, 20_000);
  it('selects only a safe eligible academy and never infers an explicitly excluded primary', async () => {
    const f = await fixture(); f.os.external_campus_ids = [f.secondary];
    const result = await f.login('/academy/not-my-academy');
    expect(result.destination).toBe('/academy/' + f.academies[1]!.slug);
    const saved = await f.record(); expect(saved.bindings.map(b => b.externalCampusId)).toEqual([f.secondary]);
    const allowed = await f.login(`/academy/${f.academies[1]!.slug}/teach`);
    expect(allowed.destination).toBe(`/academy/${f.academies[1]!.slug}/teach`);
  });
  it('rejects invalid student scope, inactive user, and an entirely unmapped campus without provisioning', async () => {
    const f = await fixture('student'); f.os.external_campus_ids!.push(f.secondary);
    await expect(f.login()).rejects.toThrow('campus_mapping_required'); expect(f.auth.createDlabUser).not.toHaveBeenCalled();
    f.os.external_campus_ids = [f.primary]; f.os.account_status = 'inactive';
    await expect(f.login()).rejects.toThrow('account_not_eligible');
    expect((await f.record()).userId).toBeNull();
  });
  it('only admits explicitly enabled mapped campuses; an empty allowlist is closed', async () => {
    const f = await fixture();
    await db.dlabCampus.updateMany({ where: { externalCampusId: { in: [f.primary, f.secondary] } }, data: { ssoEnabled: false } });
    await expect(f.login()).rejects.toThrow('campus_mapping_required');
    f.config.set('DLAB_SSO_ROLLOUT_MODE', 'allowlist');
    await expect(f.login()).rejects.toThrow('test_identity_not_enabled');
    f.config.set('DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS', [f.id]);
    await expect(f.login()).resolves.toMatchObject({ requiresStudentSession: false });
  });
  it('reconciles role changes immediately, including last-manager demotion, without accumulating roles', async () => {
    const f = await fixture('lab_head'); const initial = await f.login();
    f.os.user_role = 'student'; f.os.external_campus_ids = [f.primary];
    await f.source.user(f.id, { ...f.os, updated_at: '2027-01-01T00:00:00Z' });
    await expect(f.policy.assertSession(initial.claims)).rejects.toThrow('session_not_activated');
    const current = await f.record();
    expect(current.bindings.find(b => b.externalCampusId === f.primary)?.membership.role).toBe('STUDENT');
    expect(current.bindings.find(b => b.externalCampusId === f.secondary)?.membership.status).toBe('SUSPENDED');
    expect(await db.dlabIntegrationEvent.count({ where: { externalUserId: f.id, action: 'academy.manager_required' } })).toBeGreaterThan(0);
    expect(await db.academyMembershipRole.count({ where: { membershipId: { in: current.bindings.map(b => b.membershipId) } } })).toBe(0);
    expect((await f.login()).requiresStudentSession).toBe(true);
  });
  it('revokes secondary campus and denies stale active membership even when another campus remains eligible', async () => {
    const f = await fixture(); const first = await f.login();
    f.os.external_campus_ids = [f.primary];
    await f.source.user(f.id, { ...f.os, updated_at: '2027-01-01T00:00:00Z' });
    await expect(f.policy.assertSession(first.claims)).rejects.toThrow('session_not_activated');
    const saved = await f.record(); const removed = saved.bindings.find(b => b.externalCampusId === f.secondary)!;
    expect(removed.membership.status).toBe('SUSPENDED');
    await dlabTransaction(db, async tx => { await sourceWrite(tx); await tx.academyMembership.update({ where: { id: removed.membershipId }, data: { status: 'ACTIVE' } }); });
    const access = new AcademyAccessService(db, new SupportGrantResolver(db), f.policy);
    await expect(access.requirePermission(first.claims.authUserId, f.academies[1]!.id, 'academy.read')).rejects.toThrow('dlab_campus_not_allowed');
    await expect(access.requirePermission(first.claims.authUserId, f.academies[0]!.id, 'academy.read')).resolves.toMatchObject({ role: 'TEACHER' });
  });
  it('never clears an independent local suspension on source reactivation or scope return', async () => {
    const f = await fixture(); await f.login(); const saved = await f.record();
    const member = saved.bindings.find(b => b.externalCampusId === f.secondary)!;
    await db.academyMembership.update({ where: { id: member.membershipId }, data: { status: 'SUSPENDED' } });
    f.os.account_status = 'inactive'; await f.source.user(f.id, { ...f.os, updated_at: '2027-01-01T00:00:00Z' });
    f.os.account_status = 'active'; await f.source.user(f.id, { ...f.os, updated_at: '2027-01-02T00:00:00Z' });
    const current = await f.record();
    expect(current.bindings.find(b => b.membershipId === member.membershipId)).toMatchObject({ localSuspendedAt: expect.any(Date), membership: { status: 'SUSPENDED' } });
    await db.$transaction(tx => restoreDlabMembership(tx, member.membershipId));
    expect((await f.record()).bindings.find(b => b.membershipId === member.membershipId)?.membership.status).toBe('ACTIVE');
  });
  it('records local suspension even when already source-blocked; local restore never bypasses OS', async () => {
    const f = await fixture(); await f.login();
    f.os.account_status = 'inactive'; await f.source.user(f.id, { ...f.os, updated_at: '2027-01-01T00:00:00Z' });
    const member = (await f.record()).bindings[0]!;
    await db.academyMembership.update({ where: { id: member.membershipId }, data: { status: 'SUSPENDED' } });
    expect((await f.record()).bindings.find(b => b.membershipId === member.membershipId)?.localSuspendedAt).toBeInstanceOf(Date);
    await db.$transaction(tx => restoreDlabMembership(tx, member.membershipId));
    expect((await f.record()).bindings.find(b => b.membershipId === member.membershipId)).toMatchObject({ localSuspendedAt: null, sourceAccessStatus: 'BLOCKED', membership: { status: 'SUSPENDED' } });
    f.os.account_status = 'active';
    await expect(f.login()).rejects.toThrow('reactivation_update_required');
  });
  it('invalidates sessions when a secondary campus is deactivated; unaffected campus remains usable after fresh login', async () => {
    const f = await fixture(); const first = await f.login();
    await f.source.campus(f.secondary, { name: 'Fixture', status: 'inactive', updated_at: '2027-01-01T00:00:00Z' });
    await expect(f.policy.assertSession(first.claims)).rejects.toThrow('session_not_activated');
    const next = await f.login(); expect(next.destination).toBe('/academy/' + f.academies[0]!.slug);
    expect((await f.policy.eligible(first.claims.authUserId))?.bindings).toHaveLength(1);
  });
  it('makes scope order/duplicates idempotent, rejects stale updates and conflicting equal versions', async () => {
    const f = await fixture(); await f.login();
    await f.source.user(f.id, { ...f.os, updated_at: '2027-01-02T00:00:00Z' });
    const before = await f.record();
    await f.source.user(f.id, { ...f.os, external_campus_ids: [f.secondary, f.primary, f.primary], updated_at: '2027-01-02T00:00:00Z' });
    expect((await f.record()).generation).toBe(before.generation);
    await f.source.user(f.id, { ...f.os, account_status: 'inactive', updated_at: '2027-01-01T00:00:00Z' });
    expect((await f.record()).accountStatus).toBe('active');
    await expect(f.source.user(f.id, { ...f.os, user_role: 'lab_head', updated_at: '2027-01-02T00:00:00Z' })).rejects.toThrow('conflicting_source_version');
  });
  it('protects managed bindings/identity, local roles, credentials and account ownership at DB boundary', async () => {
    const f = await fixture(); await f.login(); const saved = await f.record(), member = saved.bindings[0]!;
    await expect(db.dlabIdentity.delete({ where: { externalUserId: f.id } })).rejects.toThrow();
    await expect(db.dlabIdentity.update({ where: { externalUserId: f.id }, data: { userRole: 'lab_head' } })).rejects.toThrow();
    await expect(db.dlabMembershipBinding.update({ where: { membershipId: member.membershipId }, data: { localSuspendedAt: null } })).rejects.toThrow();
    await expect(db.dlabMembershipBinding.delete({ where: { membershipId: member.membershipId } })).rejects.toThrow();
    await expect(db.academyMembership.delete({ where: { id: member.membershipId } })).rejects.toThrow();
    await expect(db.academyMembership.update({ where: { id: member.membershipId }, data: { role: 'MANAGER' } })).rejects.toThrow();
    const outsider = await db.user.create({ data: { authUserId: randomUUID(), username: 'local_' + randomUUID().replaceAll('-', '').slice(0, 20), status: 'ACTIVE' } });
    await expect(db.academyMembership.update({ where: { id: member.membershipId }, data: { userId: outsider.id } })).rejects.toThrow();
    await expect(db.user.update({ where: { id: saved.userId! }, data: { platformRole: 'ADMIN' } })).rejects.toThrow();
  });
  it('cannot activate a pending ticket after newer source revocation and never retries a consumed code', async () => {
    const f = await fixture();
    const attempt = await f.sso.start(f.binding);
    const complete = await f.sso.complete('code', attempt.state, f.binding);
    await f.source.user(f.id, { ...f.os, account_status: 'inactive', updated_at: '2027-01-01T00:00:00Z' });
    await expect(f.sso.complete('code', attempt.state, f.binding)).rejects.toThrow('invalid_or_expired_attempt');
    // Activation is denied even if the provider claims were valid: inactive is authoritative.
    f.auth.verifyTokenClaims.mockResolvedValueOnce({ authUserId: complete.authUserId, sessionId: randomUUID() } as never);
    await expect(f.sso.activate(complete.ticket, f.binding, 'token')).rejects.toThrow('dlab_access_unavailable');
  });
  it('operator dry-run changes nothing; explicit campus disable/enable reconciles scope and revokes sessions', async () => {
    const f = await fixture(); const first = await f.login();
    const actor = await db.user.create({ data: { username: 'op_' + randomUUID().replaceAll('-', '').slice(0, 20), status: 'ACTIVE', platformRole: 'ADMIN' } });
    const run = async (enabled: string, apply = false) => {
      const result = await promisify(execFileCallback)('node', ['--import', 'tsx', 'src/integrations/dlab/scripts/operator.ts', 'access', f.secondary, enabled, actor.id, ...(apply ? ['--apply'] : [])], {
        env: { ...process.env, DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, MONITORING_REDIS_URL: redisUrl, DLAB_SSO_ROLLOUT_MODE: 'campus' },
      });
      return JSON.parse(result.stdout.trim().split('\n').at(-1)!);
    };
    expect(await run('disabled')).toMatchObject({ mode: 'dry-run', affectedIdentities: 1 });
    expect((await f.record()).generation).toBe((await f.policy.eligible(first.claims.authUserId))!.identity.generation);
    expect((await db.dlabCampus.findUniqueOrThrow({ where: { externalCampusId: f.secondary } })).ssoEnabled).toBe(true);
    expect(await run('disabled', true)).toMatchObject({ mode: 'apply', affectedIdentities: 1 });
    expect((await f.record()).bindings.find(b => b.externalCampusId === f.secondary)?.membership.status).toBe('SUSPENDED');
    await expect(f.policy.assertSession(first.claims)).rejects.toThrow('session_not_activated');
    await run('enabled', true);
    expect((await f.record()).bindings.find(b => b.externalCampusId === f.secondary)?.membership.status).toBe('ACTIVE');
    expect(await db.auditLog.count({ where: { actorUserId: actor.id, action: 'dlab.access' } })).toBe(2);
  }, 20_000);

  it('serializes concurrent first logins without duplicate accounts, then recovers on a fresh attempt', async () => {
    const f = await fixture();
    const attempts = await Promise.all([f.sso.start(f.binding), f.sso.start(f.binding)]);
    const results = await Promise.allSettled(attempts.map(a => f.sso.complete('concurrent-code', a.state, f.binding)));
    expect(results.filter(r => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    const saved = await f.record();
    expect(saved.bindings).toHaveLength(2);
    const repeated = await f.login();
    expect(repeated.completed.authUserId).toBe(saved.user?.authUserId);
    expect((await f.record()).bindings.map(b => b.membershipId).sort()).toEqual(saved.bindings.map(b => b.membershipId).sort());
  });
  it('recovers provider provisioning failure using the same reserved identity', async () => {
    const f = await fixture();
    f.auth.createDlabUser.mockRejectedValueOnce(new Error('provider fixture unavailable'));
    await expect(f.login()).rejects.toThrow('provider fixture unavailable');
    const staged = await f.record(); expect(staged.userId).toBeNull();
    const fresh = await f.login(); expect(fresh.completed.authUserId).toBe(staged.reservedUserId);
    expect(f.auth.createDlabUser.mock.calls.every(call => call[0] === staged.reservedUserId)).toBe(true);
  });
  it('a membership restore cannot bypass an independently suspended local account', async () => {
    const f = await fixture(); const initial = await f.login(); const saved = await f.record();
    const member = saved.bindings[0]!;
    await db.user.update({ where: { id: saved.userId! }, data: { status: 'SUSPENDED' } });
    await db.academyMembership.update({ where: { id: member.membershipId }, data: { status: 'SUSPENDED' } });
    await db.$transaction(tx => restoreDlabMembership(tx, member.membershipId));
    expect((await f.record()).bindings.find(b => b.membershipId === member.membershipId)?.membership.status).toBe('SUSPENDED');
    await expect(f.policy.assertSession(initial.claims)).rejects.toThrow('dlab_access_unavailable');
    await db.user.update({ where: { id: saved.userId! }, data: { status: 'ACTIVE' } });
    await expect(f.policy.assertSession(initial.claims)).rejects.toThrow('session_not_activated');
    await expect(f.login()).resolves.toMatchObject({ requiresStudentSession: false });
  });

});
