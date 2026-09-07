import { Injectable } from "@nestjs/common";
import {
  DEFAULT_POINT_POLICY,
  pointPolicyFrom,
  type PointPolicy,
  type PointPolicyState,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { ManagerScopeService } from "./manager-scope.service.js";

/**
 * What each kind of work pays in one academy, and the one role that may
 * change it.
 *
 * ## Why this lives beside the other manager settings
 *
 * It reads and writes a points table, so `points/` is where it belongs by
 * subject. It cannot go there: `TeachModule` imports `PointsModule` for the
 * award service, and `ManageModule` imports `TeachModule`, so a points service
 * needing `ManagerScopeService` would close that ring. Filed here it sits
 * beside `AcademyFeaturesService`, which is the same act on the same page —
 * the manager deciding how this academy behaves.
 *
 * ## What a change does, and does not, do
 *
 * `PointAward.amount` is frozen at earn time, so a save moves nothing that has
 * already been paid. It decides what the *next* award is worth and nothing
 * else, which is what makes editing the economy a setting rather than a grant:
 * it applies to every student equally and it cannot name a child.
 */
@Injectable()
export class PointPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly audit: AuditService,
  ) {}

  async get(
    identity: SupabaseIdentity,
    input: { academyId: string },
  ): Promise<PointPolicyState> {
    await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.settings.manage",
    );
    return this.read(input.academyId);
  }

  /**
   * One whole policy, upserted.
   *
   * Never a patch: the schema's rules are between fields — a hard problem
   * against an easy one, a cap against the rungs — so a partial write would
   * have to be merged against the stored row before it could be checked at
   * all, and two managers patching different fields would each pass a check
   * the result fails.
   */
  async update(
    identity: SupabaseIdentity,
    input: { academyId: string; policy: PointPolicy },
  ): Promise<PointPolicyState> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.settings.manage",
    );

    await this.prisma.$transaction(async (transaction) => {
      const before = await transaction.academyPointPolicy.findUnique({
        where: { academyId: input.academyId },
      });

      await transaction.academyPointPolicy.upsert({
        where: { academyId: input.academyId },
        create: { academyId: input.academyId, ...input.policy },
        update: input.policy,
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.point_policy.updated",
        targetType: "Academy",
        targetId: input.academyId,
        // An absent `before` means the academy had never chosen: it was
        // running the platform defaults, which is a different fact from having
        // chosen them, and the empty column is how the trail says so.
        ...(before ? { before: pointPolicyFrom(before) } : {}),
        after: input.policy,
      });
    });

    return this.read(input.academyId);
  }

  /**
   * Back to the platform defaults, by deleting the row.
   *
   * Not by writing the defaults into it. The absence of a row keeps meaning
   * *this academy never chose*, so an academy that resets follows any later
   * change to `DEFAULT_POINT_POLICY` rather than being frozen at today's
   * values by the reset button.
   *
   * `deleteMany` rather than `delete`, so resetting an academy that never
   * chose is a no-op instead of a 404.
   */
  async reset(
    identity: SupabaseIdentity,
    input: { academyId: string },
  ): Promise<PointPolicyState> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.settings.manage",
    );

    await this.prisma.$transaction(async (transaction) => {
      const before = await transaction.academyPointPolicy.findUnique({
        where: { academyId: input.academyId },
      });
      if (!before) return;

      await transaction.academyPointPolicy.deleteMany({
        where: { academyId: input.academyId },
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.point_policy.reset",
        targetType: "Academy",
        targetId: input.academyId,
        before: pointPolicyFrom(before),
        // No `after`: the row is gone, and the academy is back on whatever
        // `DEFAULT_POINT_POLICY` says at the time it is read.
      });
    });

    return this.read(input.academyId);
  }

  /** The row, or the defaults and the fact that nobody has chosen yet. */
  private async read(academyId: string): Promise<PointPolicyState> {
    const row = await this.prisma.academyPointPolicy.findUnique({
      where: { academyId },
    });
    return row
      ? { policy: pointPolicyFrom(row), isCustom: true }
      : { policy: DEFAULT_POINT_POLICY, isCustom: false };
  }
}
