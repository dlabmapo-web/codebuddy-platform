import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { dlabAcademyRole, dlabEffectiveScope, dlabMembershipRolesMatch, dlabPlatformRole } from '@cove/shared';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DlabError } from './dlab-error.js';
import { DlabPolicyService } from './dlab-policy.service.js';
import { dlabAdmitted } from './dlab-reconciler.service.js';
import { sourceWrite } from './dlab-transaction.js';
import type { DlabStateService } from './dlab-state.service.js';

const databaseUrl = process.env.COVE_DLAB_TEST_DATABASE_URL;
type Config = ConfigService<never, true>;

/** The pre-2026-11-05 Prisma snapshot, kept only as the parity baseline. */
async function legacyEligible(tx: Prisma.TransactionClient, config: Config, authUserId: string) {
  if (!await tx.dlabIdentity.findFirst({ where: { user: { authUserId } } })) return null;
  const identity = await tx.dlabIdentity.findFirst({
    where: { user: { authUserId } },
    include: { user: true, bindings: { include: { membership: { include: { academy: true, extraRoles: true } } } } },
  });
  if (!identity) return null;
  const ids = dlabEffectiveScope(identity.userRole, identity.externalCampusId, identity.externalCampusIds);
  const campuses = identity.accountStatus !== 'active' || !dlabAdmitted(config as never, identity.externalUserId) ? [] : await tx.dlabCampus.findMany({
    where: { externalCampusId: { in: ids }, status: 'active', academy: { kind: 'ACADEMY', status: 'ACTIVE' }, ...(config.get('DLAB_SSO_ROLLOUT_MODE' as never) === 'campus' ? { ssoEnabled: true } : {}) },
    include: { academy: true }, orderBy: { externalCampusId: 'asc' },
  });
  const role = dlabAcademyRole(identity.userRole);
  if (identity.user?.status !== 'ACTIVE') throw new DlabError('dlab_access_unavailable', 403);
  if (dlabPlatformRole(identity.userRole) === 'ADMIN') {
    if (identity.user.platformRole !== 'ADMIN' || !campuses.length || identity.bindings.some(b => b.localSuspendedAt)) throw new DlabError('dlab_access_unavailable', 403);
    return { identity, bindings: [], academy: null, isPlatformAdmin: true, requiresStudentSession: false };
  }
  const bindings = identity.bindings.filter(b => {
    const campus = campuses.find(c => c.externalCampusId === b.externalCampusId);
    return campus && b.membership.academyId === campus.academyId && b.membership.userId === identity.userId
      && b.membership.status === 'ACTIVE' && b.membership.role === role
      && dlabMembershipRolesMatch(identity.userRole, b.membership.role, b.membership.extraRoles.map(entry => entry.role))
      && b.sourceAccessStatus === 'ALLOWED' && !b.localSuspendedAt;
  });
  if (identity.user.platformRole !== 'USER' || !bindings.length) throw new DlabError('dlab_access_unavailable', 403);
  const primary = bindings.find(b => b.externalCampusId === identity.externalCampusId) ?? bindings.sort((a, b) => a.externalCampusId.localeCompare(b.externalCampusId))[0]!;
  return { identity, bindings, academy: primary.membership.academy, isPlatformAdmin: false, requiresStudentSession: role === 'STUDENT' };
}

type Outcome = Awaited<ReturnType<typeof legacyEligible>>;
/** Every field a caller reads, in a stable order. */
function project(result: Outcome | Awaited<ReturnType<DlabPolicyService['eligible']>>) {
  if (!result) return null;
  const { identity } = result;
  const binding = (b: (typeof identity.bindings)[number]) => ({
    externalCampusId: b.externalCampusId, membershipId: b.membershipId, sourceAccessStatus: b.sourceAccessStatus,
    localSuspendedAt: b.localSuspendedAt?.toISOString() ?? null,
    membership: { academyId: b.membership.academyId, userId: b.membership.userId, status: b.membership.status, role: b.membership.role,
      extraRoles: b.membership.extraRoles.map(r => r.role).sort(), academy: { id: b.membership.academy.id, slug: b.membership.academy.slug } },
  });
  const byCampus = (a: { externalCampusId: string }, b: { externalCampusId: string }) => a.externalCampusId.localeCompare(b.externalCampusId);
  return {
    isPlatformAdmin: result.isPlatformAdmin, requiresStudentSession: result.requiresStudentSession,
    academy: result.academy && { id: result.academy.id, slug: result.academy.slug },
    bindings: [...result.bindings].sort(byCampus).map(binding),
    identity: { externalUserId: identity.externalUserId, userId: identity.userId, userRole: identity.userRole, accountStatus: identity.accountStatus,
      externalCampusId: identity.externalCampusId, externalCampusIds: identity.externalCampusIds, generation: identity.generation,
      user: identity.user && { status: identity.user.status, platformRole: identity.user.platformRole }, bindings: [...identity.bindings].sort(byCampus).map(binding) },
  };
}
async function settle(run: () => Promise<Outcome | Awaited<ReturnType<DlabPolicyService['eligible']>>>) {
  try { return { value: project(await run()) }; } catch (error) {
    if (error instanceof DlabError) return { error: [error.reason, error.getStatus()] };
    throw error;
  }
}

type BindingSpec = { campus: string; role?: string; extras?: string[]; status?: string; access?: string; suspended?: boolean; academy?: string; foreign?: boolean };
type IdentitySpec = { name: string; role: string; primary: string; ids: string[] | null; account?: string; userStatus?: string; platformRole?: string; bindings?: BindingSpec[]; unprovisioned?: boolean; admitted?: boolean };

describe.skipIf(!databaseUrl)('one-statement DLAB eligibility matches the previous Prisma snapshot', () => {
  let prisma: PrismaService;
  beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/cove_dlab_test') throw new Error('An isolated local cove_dlab_test database is required');
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }));
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const cases: IdentitySpec[] = [
    { name: 'student, one campus', role: 'student', primary: 'A', ids: ['A'], bindings: [{ campus: 'A', role: 'STUDENT' }] },
    { name: 'student, primary outside supplied scope', role: 'student', primary: 'A', ids: ['B'], bindings: [{ campus: 'A', role: 'STUDENT' }, { campus: 'B', role: 'STUDENT' }] },
    { name: 'student, null scope falls back to primary', role: 'student', primary: 'A', ids: null, bindings: [{ campus: 'A', role: 'STUDENT' }] },
    { name: 'student, empty scope', role: 'student', primary: 'A', ids: [], bindings: [{ campus: 'A', role: 'STUDENT' }] },
    { name: 'unknown role is a student limited to primary', role: 'parent', primary: 'A', ids: ['A', 'B'], bindings: [{ campus: 'A', role: 'STUDENT' }, { campus: 'B', role: 'STUDENT' }] },
    { name: 'tutor, two campuses', role: 'tutor', primary: 'A', ids: ['B', 'A', 'B'], bindings: [{ campus: 'A', role: 'TEACHER' }, { campus: 'B', role: 'TEACHER' }] },
    { name: 'instructor with derived grants', role: 'instructor', primary: 'B', ids: ['A', 'B'], bindings: [{ campus: 'A', role: 'TEAM_LEAD', extras: ['TEACHER'] }, { campus: 'B', role: 'TEAM_LEAD', extras: ['TEACHER'] }] },
    { name: 'instructor with tampered grants', role: 'instructor', primary: 'A', ids: ['A', 'B'], bindings: [{ campus: 'A', role: 'TEAM_LEAD', extras: ['TEACHER', 'MANAGER'] }, { campus: 'B', role: 'TEAM_LEAD', extras: ['TEACHER'] }] },
    { name: 'lab head, primary excluded, sorted fallback', role: 'lab_head', primary: 'X', ids: ['B', 'A'], bindings: [{ campus: 'B', role: 'MANAGER', extras: ['TEACHER', 'TEAM_LEAD'] }, { campus: 'A', role: 'MANAGER', extras: ['TEAM_LEAD', 'TEACHER'] }] },
    { name: 'suspended local user', role: 'tutor', primary: 'A', ids: ['A'], userStatus: 'SUSPENDED', bindings: [{ campus: 'A', role: 'TEACHER' }] },
    { name: 'deactivated OS account', role: 'tutor', primary: 'A', ids: ['A'], account: 'inactive', bindings: [{ campus: 'A', role: 'TEACHER' }] },
    { name: 'outside the allowlist', role: 'tutor', primary: 'A', ids: ['A'], admitted: false, bindings: [{ campus: 'A', role: 'TEACHER' }] },
    { name: 'SSO-disabled campus', role: 'tutor', primary: 'OFF', ids: ['OFF', 'A'], bindings: [{ campus: 'OFF', role: 'TEACHER' }, { campus: 'A', role: 'TEACHER' }] },
    { name: 'closed, library, inactive and unmapped campuses', role: 'tutor', primary: 'ARCH', ids: ['ARCH', 'SUSP', 'LIB', 'INACTIVE', 'UNMAPPED', 'A'], bindings: [{ campus: 'ARCH', role: 'TEACHER' }, { campus: 'SUSP', role: 'TEACHER' }, { campus: 'LIB', role: 'TEACHER' }, { campus: 'INACTIVE', role: 'TEACHER' }, { campus: 'A', role: 'TEACHER' }] },
    { name: 'only closed campuses', role: 'tutor', primary: 'ARCH', ids: ['ARCH', 'INACTIVE'], bindings: [{ campus: 'ARCH', role: 'TEACHER' }] },
    { name: 'blocked, suspended and inactive bindings', role: 'tutor', primary: 'A', ids: ['A', 'B', 'OFF'], bindings: [{ campus: 'A', role: 'TEACHER', access: 'BLOCKED' }, { campus: 'B', role: 'TEACHER', suspended: true }, { campus: 'OFF', role: 'TEACHER', status: 'SUSPENDED' }] },
    { name: 'role mismatch and foreign membership', role: 'tutor', primary: 'A', ids: ['A', 'B'], bindings: [{ campus: 'A', role: 'STUDENT' }, { campus: 'B', role: 'TEACHER', foreign: true }] },
    { name: 'membership in a different academy than its campus', role: 'tutor', primary: 'A', ids: ['A', 'B'], bindings: [{ campus: 'A', role: 'TEACHER', academy: 'OFF' }, { campus: 'B', role: 'TEACHER' }] },
    { name: 'HQ admin', role: 'hq_admin', primary: 'A', ids: ['A', 'B'], platformRole: 'ADMIN' },
    { name: 'HQ admin with a locally suspended binding', role: 'hq_admin', primary: 'A', ids: ['A'], platformRole: 'ADMIN', bindings: [{ campus: 'A', role: 'TEACHER', suspended: true }] },
    { name: 'HQ admin without a usable campus', role: 'hq_admin', primary: 'ARCH', ids: ['ARCH'], platformRole: 'ADMIN' },
    { name: 'HQ admin not yet promoted locally', role: 'hq_admin', primary: 'A', ids: ['A'] },
    { name: 'staff identity holding local platform admin', role: 'tutor', primary: 'A', ids: ['A'], platformRole: 'ADMIN', bindings: [{ campus: 'A', role: 'TEACHER' }] },
    { name: 'unprovisioned identity', role: 'tutor', primary: 'A', ids: ['A'], unprovisioned: true },
  ];

  it.each(['allowlist', 'campus'] as const)('returns the same decision for every case in %s rollout mode', async mode => {
    const run = randomUUID().slice(0, 8);
    const compared: Array<{ name: string; legacy: unknown; current: unknown }> = [];
    await prisma.$transaction(async tx => {
      await sourceWrite(tx);
      const org = await tx.organization.create({ data: { name: 'Eligibility parity', slug: `parity-${run}` } });
      const academy = (key: string, data: Partial<Prisma.AcademyUncheckedCreateInput> = {}) =>
        tx.academy.create({ data: { organizationId: org.id, name: `Parity ${key}`, slug: `parity-${run}-${key.toLowerCase()}`, ...data } });
      const academies: Record<string, { id: string }> = {
        A: await academy('A'), B: await academy('B'), OFF: await academy('OFF'), ARCH: await academy('ARCH', { status: 'ARCHIVED' }),
        SUSP: await academy('SUSP', { status: 'SUSPENDED' }), LIB: await academy('LIB', { kind: 'LIBRARY' }), INACTIVE: await academy('INACTIVE'),
      };
      const campus = (key: string) => `${run}-${key}`;
      for (const key of ['A', 'B', 'OFF', 'ARCH', 'SUSP', 'LIB', 'INACTIVE', 'UNMAPPED'])
        await tx.dlabCampus.create({ data: { externalCampusId: campus(key), name: key, status: key === 'INACTIVE' ? 'inactive' : 'active', payloadHash: 'parity',
          academyId: academies[key]?.id ?? null, ssoEnabled: key !== 'OFF' } });
      const stranger = await tx.user.create({ data: { authUserId: randomUUID(), username: `parity_${run}_x`, displayName: 'Other', status: 'ACTIVE', platformRole: 'USER' } });
      const admitted: string[] = [];
      const subjects: Array<{ spec: IdentitySpec; authUserId: string }> = [];
      for (const [index, spec] of cases.entries()) {
        const authUserId = randomUUID(), externalUserId = `${run}-${index}`;
        const user = await tx.user.create({ data: { authUserId, username: `parity_${run}_${index}`, displayName: spec.name, status: (spec.userStatus ?? 'ACTIVE') as never, platformRole: (spec.platformRole ?? 'USER') as never } });
        await tx.dlabIdentity.create({ data: { externalUserId, userId: spec.unprovisioned ? null : user.id, name: spec.name, userRole: spec.role, accountStatus: spec.account ?? 'active',
          externalCampusId: campus(spec.primary), externalCampusIds: spec.ids?.map(campus) ?? [], payloadHash: 'parity' } });
        // The column is nullable although Prisma models it as a list.
        if (!spec.ids) await tx.$executeRaw`UPDATE dlab_identities SET external_campus_ids = NULL WHERE external_user_id = ${externalUserId}`;
        if (spec.admitted !== false) admitted.push(externalUserId);
        for (const b of spec.bindings ?? []) {
          const owner = b.foreign ? stranger.id : user.id;
          const membership = await tx.academyMembership.create({ data: { academyId: academies[b.academy ?? b.campus]!.id, userId: owner, role: (b.role ?? 'STUDENT') as never, status: (b.status ?? 'ACTIVE') as never, joinedAt: new Date() } });
          for (const extra of b.extras ?? []) await tx.academyMembershipRole.create({ data: { membershipId: membership.id, role: extra as never } });
          await tx.dlabMembershipBinding.create({ data: { externalUserId, externalCampusId: campus(b.campus), membershipId: membership.id, appliedRevision: 1,
            sourceAccessStatus: b.access ?? 'ALLOWED', localSuspendedAt: b.suspended ? new Date('2026-11-01T00:00:00Z') : null } });
        }
        subjects.push({ spec, authUserId });
      }
      const config = new ConfigService({ DLAB_SSO_ROLLOUT_MODE: mode, DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: admitted }) as Config;
      const policy = new DlabPolicyService(tx as unknown as PrismaService, {} as DlabStateService, config as never);
      subjects.push({ spec: { name: 'ordinary account', role: '', primary: '', ids: null }, authUserId: stranger.authUserId! });
      for (const { spec, authUserId } of subjects) {
        compared.push({ name: spec.name, legacy: await settle(() => legacyEligible(tx, config, authUserId)), current: await settle(() => policy.eligible(authUserId)) });
      }
      throw new RollbackParityFixtures();
    }).catch(error => { if (!(error instanceof RollbackParityFixtures)) throw error; });
    for (const { name, legacy, current } of compared) expect({ name, outcome: current }).toEqual({ name, outcome: legacy });
    // Both allowed and denied decisions were exercised, not just one kind.
    expect(compared.some(c => 'value' in (c.legacy as object) && (c.legacy as { value: unknown }).value)).toBe(true);
    expect(compared.some(c => 'error' in (c.legacy as object))).toBe(true);
  });
});

class RollbackParityFixtures extends Error {}
