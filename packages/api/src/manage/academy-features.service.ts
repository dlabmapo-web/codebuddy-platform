import { Injectable } from "@nestjs/common";
import {
  academyFeatureNames,
  academyFeatureRequires,
  type AcademyFeatureList,
  type AcademyFeatureName,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { ManagerScopeService } from "./manager-scope.service.js";

/**
 * Which features an academy has on, and the one role that may change them.
 *
 * Reading is open to any member: every surface has to know whether to render
 * itself, and a student discovering that points exist by being shown a points
 * page is worse than the query. Writing is a manager's alone.
 */
@Injectable()
export class AcademyFeaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly scopes: ManagerScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: { academyId: string },
  ): Promise<AcademyFeatureList> {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "academy.read",
    );
    return this.read(input.academyId);
  }

  async setEnabled(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      feature: AcademyFeatureName;
      isEnabled: boolean;
    },
  ): Promise<AcademyFeatureList> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.settings.manage",
    );

    await this.prisma.$transaction(async (transaction) => {
      const before = await transaction.academyFeatureFlag.findUnique({
        where: {
          academyId_feature: {
            academyId: input.academyId,
            feature: input.feature,
          },
        },
        select: { isEnabled: true },
      });

      await transaction.academyFeatureFlag.upsert({
        where: {
          academyId_feature: {
            academyId: input.academyId,
            feature: input.feature,
          },
        },
        create: {
          academyId: input.academyId,
          feature: input.feature,
          isEnabled: input.isEnabled,
        },
        update: { isEnabled: input.isEnabled },
      });

      /*
       * A dependent feature cannot outlive what it is computed from. Turning
       * points off takes the class board with it rather than leaving a board
       * that renders empty and reads as a fault.
       */
      if (!input.isEnabled) {
        const dependents = academyFeatureNames.filter(
          (name) => academyFeatureRequires[name] === input.feature,
        );
        for (const dependent of dependents) {
          await transaction.academyFeatureFlag.upsert({
            where: {
              academyId_feature: {
                academyId: input.academyId,
                feature: dependent,
              },
            },
            create: {
              academyId: input.academyId,
              feature: dependent,
              isEnabled: false,
            },
            update: { isEnabled: false },
          });
        }
      }

      // Turning on a dependent turns on what it needs, for the same reason.
      const requires = academyFeatureRequires[input.feature];
      if (input.isEnabled && requires) {
        await transaction.academyFeatureFlag.upsert({
          where: {
            academyId_feature: {
              academyId: input.academyId,
              feature: requires,
            },
          },
          create: {
            academyId: input.academyId,
            feature: requires,
            isEnabled: true,
          },
          update: { isEnabled: true },
        });
      }

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.feature.updated",
        targetType: "Academy",
        targetId: input.academyId,
        before: { feature: input.feature, isEnabled: before?.isEnabled ?? null },
        after: { feature: input.feature, isEnabled: input.isEnabled },
      });
    });

    return this.read(input.academyId);
  }

  private async read(academyId: string): Promise<AcademyFeatureList> {
    const rows = await this.prisma.academyFeatureFlag.findMany({
      where: { academyId },
      select: { feature: true, isEnabled: true },
    });
    const byName = new Map(rows.map((row) => [row.feature, row.isEnabled]));
    return {
      // Reported in a fixed order so the settings page never reshuffles, and
      // a feature with no row reads as off — the storage rule the readers use.
      features: academyFeatureNames.map((feature) => ({
        feature,
        isEnabled: byName.get(feature) ?? false,
      })),
    };
  }
}
