import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
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

  constructor(private readonly prisma: PrismaService, private readonly state: DlabStateService) {}
  async managed(authUserId: string) {
    return this.prisma.dlabIdentity.findFirst({ where: { user: { authUserId } } });
  }
  async forbidMutation(authUserId: string) {
    if (await this.managed(authUserId)) throw new DlabError('dlab_managed_identity', 403);
  }
  async eligible(authUserId: string) {
    const identity = await this.prisma.dlabIdentity.findFirst({
      where: { user: { authUserId } },
      include: { user: true, bindings: { include: { membership: { include: { academy: true } } } } },
    });
    if (!identity) return null;
    const campus = await this.prisma.dlabCampus.findUnique({ where: { externalCampusId: identity.externalCampusId } });
    const validBinding = identity.bindings.find(b => b.externalCampusId === identity.externalCampusId && b.membership.academyId === campus?.academyId && b.membership.status === 'ACTIVE' && b.membership.role === 'STUDENT' && b.membership.academy.status === 'ACTIVE');
    if (identity.accountStatus !== 'active' || identity.userRole !== 'student' || identity.user?.status !== 'ACTIVE' || campus?.status !== 'active' || !validBinding || identity.externalCampusIds.length !== 1 || identity.externalCampusIds[0] !== identity.externalCampusId) {
      throw new DlabError('dlab_access_unavailable', 403);
    }
    return { identity, academy: validBinding.membership.academy };
  }
  async assertSession(identity: SupabaseIdentity) {
    const allowed = await this.eligible(identity.authUserId);
    if (!allowed) return;
    if (!identity.sessionId) throw new DlabError('session_not_activated', 401);
    const recorded = await this.state.requireRedis().get(`cove:dlab:session:${identity.sessionId}`);
    if (recorded !== `${allowed.identity.externalUserId}:${allowed.identity.generation}`) throw new DlabError('session_not_activated', 401);
  }
  async activate(identity: SupabaseIdentity, generation: number) {
    const allowed = await this.eligible(identity.authUserId);
    if (!allowed || !identity.sessionId || allowed.identity.generation !== generation) throw new DlabError('identity_changed', 403);
    // Access checks always re-read source status; this registry survives ordinary refresh.
    await this.state.requireRedis().set(`cove:dlab:session:${identity.sessionId}`, `${allowed.identity.externalUserId}:${generation}`, 'EX', 60 * 60 * 24 * 30);
    return allowed;
  }
}
