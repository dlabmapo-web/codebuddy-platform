import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { buildPlaceholderEmail, dlabSsoUserSchema, safeDlabReturnTo } from '@cove/shared';
import type { ApiEnvironment } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SupabaseAuthService } from '../../auth/supabase-auth.service.js';
import { DlabStateService } from './dlab-state.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';
import { DlabSourceService, sourceLock, sourceWrite } from './dlab-source.service.js';
import { DlabError } from './dlab-error.js';

type Attempt = { startedAt: number; returnTo: string | null; redirectUri: string };
type Activation = { authUserId: string; generation: number; returnTo: string | null };
@Injectable()
export class DlabSsoService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>, private readonly prisma: PrismaService, private readonly state: DlabStateService, private readonly source: DlabSourceService, private readonly policy: DlabPolicyService, private readonly auth: SupabaseAuthService) {}
  enabled() { if (!this.config.get('DLAB_SSO_ENABLED', { infer: true })) throw new DlabError('sso_unavailable', 503); }
  async start(binding: string, returnTo?: string, previousState?: string) {
    this.enabled();
    if (previousState) await this.state.invalidate('attempt', previousState, binding);
    const redirectUri = this.config.get('DLAB_REDIRECT_URI', { infer: true })!;
    const state = await this.state.issue('attempt', binding, { startedAt: Date.now(), returnTo: safeDlabReturnTo(returnTo), redirectUri });
    const url = new URL(`${this.config.get('DLAB_OS_BASE_URL', { infer: true })}/sso/authorize`);
    for (const [key, value] of Object.entries({ client_id: 'cove', response_type: 'code', redirect_uri: redirectUri, state })) url.searchParams.set(key, value);
    return { authorizeUrl: url.toString(), state };
  }
  async complete(code: string | undefined, stateToken: string, binding: string, providerError?: string) {
    this.enabled();
    const attempt = await this.state.consume<Attempt>('attempt', stateToken, binding);
    if (providerError || !code) throw new DlabError('login_cancelled');
    const response = await fetch(`${this.config.get('DLAB_OS_BASE_URL', { infer: true })}/sso/token`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Basic ${Buffer.from(`cove:${this.config.get('DLAB_CLIENT_SECRET', { infer: true })}`).toString('base64')}`, 'Content-Type': 'application/json', 'X-Request-Id': randomUUID() },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: attempt.redirectUri }),
    }).catch(() => { throw new DlabError('os_unavailable', 503); });
    if (!response.ok) throw new DlabError('code_exchange_failed');
    const parsed = dlabSsoUserSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new DlabError('invalid_os_response');
    const input = parsed.data;
    if (!this.config.get('DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS', { infer: true }).includes(input.external_user_id)) throw new DlabError('test_identity_not_enabled', 403);
    return this.state.lock(input.external_user_id, async () => {
      const saved = await this.source.user(input.external_user_id, input, attempt.startedAt);
      if (saved.accountStatus !== 'active' || saved.userRole !== 'student') throw new DlabError('account_not_eligible', 403);
      if (saved.externalCampusIds.length !== 1 || saved.externalCampusIds[0] !== saved.externalCampusId) throw new DlabError('invalid_student_scope', 403);
      const campus = await this.prisma.dlabCampus.findUnique({ where: { externalCampusId: saved.externalCampusId }, include: { academy: true } });
      if (!campus?.academy || campus.status !== 'active' || campus.academy.status !== 'ACTIVE' || campus.academy.kind !== 'ACADEMY') throw new DlabError('campus_mapping_required', 403);
      const authUserId = saved.userId ? (await this.prisma.user.findUniqueOrThrow({ where: { id: saved.userId } })).authUserId! : saved.reservedUserId;
      const email = buildPlaceholderEmail(saved.reservedUserId);
      await this.auth.createDlabUser(authUserId, email, saved.name);
      await this.prisma.$transaction(async tx => {
        await sourceLock(tx, `user:${saved.externalUserId}`);
        await sourceWrite(tx);
        const current = await tx.dlabIdentity.findUniqueOrThrow({ where: { externalUserId: saved.externalUserId } });
        if (current.revision !== saved.revision || current.accountStatus !== 'active') throw new DlabError('identity_changed', 409);
        const user = await tx.user.upsert({ where: { id: saved.reservedUserId }, create: { id: saved.reservedUserId, authUserId, email, emailIsPlaceholder: true, username: `dlab_${saved.reservedUserId.replaceAll('-', '').slice(0, 24)}`, displayName: saved.name, status: 'ACTIVE', platformRole: 'USER' }, update: { displayName: saved.name, lastSignInAt: new Date() } });
        if (user.status !== 'ACTIVE' || user.platformRole !== 'USER' || user.authUserId !== authUserId) throw new DlabError('local_account_restricted', 403);
        const existing = await tx.academyMembership.findUnique({ where: { academyId_userId: { academyId: campus.academy!.id, userId: user.id } }, include: { dlabBinding: true } });
        if (existing && (!existing.dlabBinding || existing.role !== 'STUDENT' || existing.status !== 'ACTIVE')) throw new DlabError('membership_conflict', 409);
        const membership = existing ?? await tx.academyMembership.create({ data: { academyId: campus.academy!.id, userId: user.id, role: 'STUDENT', status: 'ACTIVE', joinedAt: new Date() } });
        await tx.studentAcademyProfile.upsert({ where: { membershipId: membership.id }, create: { membershipId: membership.id, academyId: campus.academy!.id, schoolGrade: saved.grade, codingInterests: [] }, update: { schoolGrade: saved.grade } });
        await tx.dlabIdentity.update({ where: { externalUserId: saved.externalUserId }, data: { userId: user.id, provisioningStatus: 'READY' } });
        await tx.dlabMembershipBinding.upsert({ where: { externalUserId_externalCampusId: { externalUserId: saved.externalUserId, externalCampusId: saved.externalCampusId } }, create: { externalUserId: saved.externalUserId, externalCampusId: saved.externalCampusId, membershipId: membership.id, appliedRevision: saved.revision }, update: { appliedRevision: saved.revision } });
      });
      const eligible = await this.policy.eligible(authUserId);
      if (!eligible) throw new DlabError('identity_not_bound', 403);
      const tokenHash = await this.auth.dlabTokenHash(authUserId, email);
      const ticket = await this.state.issue('activation', binding, { authUserId, generation: eligible.identity.generation, returnTo: attempt.returnTo }, 60);
      return { tokenHash, authUserId, ticket };
    });
  }
  async activate(ticket: string, binding: string, token: string) {
    this.enabled();
    const info = await this.state.consume<Activation>('activation', ticket, binding);
    const identity = await this.auth.verifyTokenClaims(token);
    if (identity.authUserId !== info.authUserId) throw new DlabError('session_identity_mismatch', 403);
    const allowed = await this.policy.activate(identity, info.generation);
    const root = `/academy/${allowed.academy.slug}`;
    const path = safeDlabReturnTo(info.returnTo);
    return { destination: path && (path === root || path.startsWith(root + '/')) ? path : root };
  }
}
