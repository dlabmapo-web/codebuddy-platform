import { HttpException, Inject, Injectable } from '@nestjs/common';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { AuditService } from '../academies/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { TrialPins } from '../turtle-trial/trial-pins.js';
import { TrialStore } from '../turtle-trial/trial-store.js';
import type { SupabaseIdentity } from '../auth/auth.types.js';

@Injectable()
export class AcademyTurtleService {
  constructor(@Inject(AcademyAccessService) private readonly access: AcademyAccessService,
    @Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TrialPins) private readonly pins: TrialPins, @Inject(TrialStore) private readonly store: TrialStore) {}
  private async actor(identity: SupabaseIdentity, academyId: string) {
    const actor = await this.access.requirePermission(identity.authUserId, academyId, 'academy.settings.manage');
    if (!actor.roles.includes('MANAGER')) throw new HttpException('PERMISSION_DENIED', 403);
    const academy = await this.prisma.academy.findUnique({ where: { id: academyId }, select: { status: true } });
    if (academy?.status !== 'ACTIVE') throw new HttpException('ACADEMY_UNAVAILABLE', 403);
    return actor;
  }
  async state(identity: SupabaseIdentity, input: { academyId: string }) {
    const actor = await this.actor(identity, input.academyId);
    if (!this.pins.available()) return { available: false, current: null };
    await this.store.limit([['pin-state:' + actor.userId, 60, 60000]]);
    return this.pins.state(input.academyId);
  }
  async reveal(identity: SupabaseIdentity, input: { academyId: string; expectedVersion: string }) {
    const actor = await this.actor(identity, input.academyId);
    await this.store.limit([['pin-reveal:' + actor.userId, 30, 60000]]);
    // Audit the intent before handing out a secret. A Redis failure can leave
    // an intent without a result; no successful secret read is unaudited.
    await this.audit.write(this.prisma, { actorUserId: actor.userId, academyId: input.academyId,
      action: 'academy.turtle.pin.reveal_requested', targetType: 'Academy', targetId: input.academyId });
    return this.pins.reveal(input.academyId, input.expectedVersion);
  }
  async generate(identity: SupabaseIdentity, input: { academyId: string; expectedVersion: string | null }) {
    const actor = await this.actor(identity, input.academyId);
    await this.store.limit([['pin-generate:' + actor.userId, 12, 3600000], ['pin-generate-academy:' + input.academyId, 12, 3600000]]);
    await this.audit.write(this.prisma, { actorUserId: actor.userId, academyId: input.academyId,
      action: 'academy.turtle.pin.generate_requested', targetType: 'Academy', targetId: input.academyId });
    return this.pins.generate(input.academyId, input.expectedVersion);
  }
}
