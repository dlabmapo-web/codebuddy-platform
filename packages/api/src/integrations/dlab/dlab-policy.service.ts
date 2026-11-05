import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dlabAcademyRole, dlabMembershipRolesMatch, dlabPlatformRole } from '@cove/shared';
import type { ApiEnvironment } from '../../config/env.schema.js';
import { dlabCampusScope } from './dlab-reconciler.service.js';
import { readDlabEligibility } from './dlab-eligibility-read.js';
import { dlabTransaction } from './dlab-transaction.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { SupabaseIdentity } from '../../auth/auth.types.js';
import { DlabStateService } from './dlab-state.service.js';
import { DlabError } from './dlab-error.js';

@Injectable()
export class DlabPolicyService implements OnModuleInit, OnModuleDestroy {
  private subscriber: ReturnType<DlabStateService['requireRedis']> | null = null;
  private readonly listeners = new Set<() => void>();
  async onModuleInit() {
    const redis = this.state.optionalRedis();
    if (!redis) return;
    this.subscriber = redis.duplicate();
    this.subscriber.on('message', () => { for (const listener of this.listeners) listener(); });
    await this.subscriber.subscribe('cove:dlab:changed').catch(() => undefined);
  }
  async onModuleDestroy() { await this.subscriber?.quit().catch(() => undefined); }
  watch(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  constructor(private readonly prisma: PrismaService, private readonly state: DlabStateService, private readonly config: ConfigService<ApiEnvironment, true>) {}
  async managed(authUserId: string) {
    return this.prisma.dlabIdentity.findFirst({ where: { user: { authUserId } } });
  }
  async forbidMutation(authUserId: string) {
    if (await this.managed(authUserId)) throw new DlabError('dlab_managed_identity', 403);
  }
  async eligible(authUserId: string) {
    // One statement is one snapshot, so no transaction is needed; ordinary
    // logins read zero rows and never contend on the integration write lock.
    return this.snapshot(this.prisma, authUserId);
  }
  private async snapshot(db: Pick<PrismaService, '$queryRaw'>, authUserId: string) {
      const read = await readDlabEligibility(db, authUserId, this.config.get('DLAB_SSO_ROLLOUT_MODE', { infer: true }) === 'campus');
      if (!read) return null;
      const { identity } = read;
      const scope = dlabCampusScope(this.config, identity);
      const campuses = read.candidateCampuses.filter(c => scope.includes(c.externalCampusId));
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
  async assertAcademy(authUserId: string, academyId: string) {
    const allowed = await this.eligible(authUserId);
    if (allowed && !allowed.isPlatformAdmin && !allowed.bindings.some(b => b.membership.academyId === academyId)) throw new DlabError('dlab_campus_not_allowed', 403);
    return allowed;
  }
  async assertSession(identity: SupabaseIdentity) {
    const allowed = await this.eligible(identity.authUserId);
    if (!allowed) return;
    if (!identity.sessionId) throw new DlabError('session_not_activated', 401);
    const recorded = await this.state.requireRedis().get(`cove:dlab:session:${identity.sessionId}`);
    if (recorded !== `${allowed.identity.externalUserId}:${allowed.identity.generation}`) throw new DlabError('session_not_activated', 401);
  }
  async activate(identity: SupabaseIdentity, generation: number) {
    const allowed = await dlabTransaction(this.prisma, tx => this.snapshot(tx, identity.authUserId));
    if (!allowed || !identity.sessionId || allowed.identity.generation !== generation) throw new DlabError('identity_changed', 403);
    // Access checks always re-read source status; this registry survives ordinary refresh.
    await this.state.requireRedis().set(`cove:dlab:session:${identity.sessionId}`, `${allowed.identity.externalUserId}:${generation}`, 'EX', 60 * 60 * 24 * 30);
    return allowed;
  }
}
