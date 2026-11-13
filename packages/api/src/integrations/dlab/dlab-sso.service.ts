import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { buildPlaceholderEmail, dlabSsoUserSchema, safeDlabReturnTo, DLAB_ADMIN_DESTINATION } from '@cove/shared';
import type { ApiEnvironment } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SupabaseAuthService } from '../../auth/supabase-auth.service.js';
import { DlabStateService } from './dlab-state.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';
import { DlabSourceService } from './dlab-source.service.js';
import { DlabReconcilerService, desiredDlabCampuses, dlabAdmitted } from './dlab-reconciler.service.js';
import { dlabTransaction } from './dlab-transaction.js';
import { DlabError } from './dlab-error.js';
import { DlabDirectoryService } from './dlab-directory.service.js';

type Attempt = { startedAt: number; returnTo: string | null; redirectUri: string };
type Activation = { authUserId: string; generation: number; returnTo: string | null };
@Injectable()
export class DlabSsoService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>, private readonly prisma: PrismaService, private readonly state: DlabStateService, private readonly source: DlabSourceService, private readonly policy: DlabPolicyService, private readonly auth: SupabaseAuthService, private readonly reconciler: DlabReconcilerService, @Optional() private readonly directory?: DlabDirectoryService) {}
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
    const requestId = randomUUID();
    const response = await fetch(`${this.config.get('DLAB_OS_BASE_URL', { infer: true })}/sso/token`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Basic ${Buffer.from(`cove:${this.config.get('DLAB_CLIENT_SECRET', { infer: true })}`).toString('base64')}`, 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: attempt.redirectUri }),
    }).catch(() => { throw new DlabError('os_unavailable', 503); });
    if (!response.ok) throw new DlabError('code_exchange_failed');
    const parsed = dlabSsoUserSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new DlabError('invalid_os_response');
    const input = parsed.data;
    if (!dlabAdmitted(this.config, input.external_user_id)) throw new DlabError('test_identity_not_enabled', 403);
    return this.state.lock(input.external_user_id, async assertOwned => {
      const saved = await this.source.user(input.external_user_id, input, attempt.startedAt, requestId, { deferReconcile: true });
      if (saved.accountStatus !== 'active') throw new DlabError('account_not_eligible', 403);
      const campuses = await dlabTransaction(this.prisma, tx => desiredDlabCampuses(tx, this.config, saved));
      if (!campuses.length) throw new DlabError('campus_mapping_required', 403);
      const directory = this.directory ?? new DlabDirectoryService(this.config, this.prisma, this.state, this.source, this.auth, this.reconciler);
      await directory.provision(saved, requestId, assertOwned);
      const authUserId = saved.reservedUserId;
      const email = buildPlaceholderEmail(saved.reservedUserId);
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
    await this.prisma.user.update({ where: { authUserId: identity.authUserId }, data: { lastSignInAt: new Date() } });
    if (allowed.isPlatformAdmin) return { destination: DLAB_ADMIN_DESTINATION, requiresStudentSession: false };
    const path = safeDlabReturnTo(info.returnTo);
    const requested = path && allowed.bindings.find(b => {
      const root = `/academy/${b.membership.academy.slug}`;
      return path === root || path.startsWith(root + '/');
    });
    return { destination: requested ? path! : `/academy/${allowed.academy!.slug}`, requiresStudentSession: allowed.requiresStudentSession };
  }
}
