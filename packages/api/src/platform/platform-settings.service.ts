import { Injectable } from "@nestjs/common";
import {
  academyFeatureNames,
  DEFAULT_POINT_POLICY,
  pointPolicyFrom,
  PLATFORM_SETTINGS_MAX,
  type ListPlatformSettingsInput,
  type PlatformFeatureBoard,
  type PlatformPointPolicyBoard,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";

/**
 * How every academy is configured, in two boards.
 *
 * Reads only. The console changes a feature through the academy's own
 * endpoint — see `platformSettingsContract` for why there is deliberately no
 * write here.
 *
 * ## Set-based, not per-academy
 *
 * Both boards answer in three queries however many academies exist: the
 * academies, then one `findMany` for every flag row and one for every policy
 * row, joined in memory. The obvious shape — walk the academies and ask each
 * one — is what the manager's own endpoint does, correctly, for one academy;
 * done here it is a query per row, and this page's whole purpose is to have
 * many rows.
 *
 * ## Absent rows are answers
 *
 * Neither table is fully populated. An academy that has never touched a
 * feature has no `AcademyFeatureFlag` row, and one that has never edited its
 * economy has no `AcademyPointPolicy` row. Both mean "the default", and both
 * are filled in here rather than left as gaps — a board with holes in it reads
 * as missing data, and the operator cannot tell that from "off".
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async features(
    identity: SupabaseIdentity,
    input: ListPlatformSettingsInput,
  ): Promise<PlatformFeatureBoard> {
    const { academies, total, truncated } = await this.academies(
      identity,
      input,
    );
    if (academies.length === 0) return { rows: [], total, truncated };

    const flags = await this.prisma.academyFeatureFlag.findMany({
      where: { academyId: { in: academies.map((academy) => academy.id) } },
      select: { academyId: true, feature: true, isEnabled: true },
    });
    const byAcademy = new Map<string, Map<string, boolean>>();
    for (const flag of flags) {
      const entry = byAcademy.get(flag.academyId) ?? new Map<string, boolean>();
      entry.set(flag.feature, flag.isEnabled);
      byAcademy.set(flag.academyId, entry);
    }

    return {
      rows: academies.map((academy) => ({
        academyId: academy.id,
        academySlug: academy.slug,
        academyName: academy.name,
        status: academy.status,
        // Every feature named, in the shared list's own order, so the columns
        // line up across rows without the board having to sort them.
        features: academyFeatureNames.map((feature) => ({
          feature,
          isEnabled: byAcademy.get(academy.id)?.get(feature) ?? false,
        })),
      })),
      total,
      truncated,
    };
  }

  async pointPolicies(
    identity: SupabaseIdentity,
    input: ListPlatformSettingsInput,
  ): Promise<PlatformPointPolicyBoard> {
    const { academies, total, truncated } = await this.academies(
      identity,
      input,
    );
    if (academies.length === 0) return { rows: [], total, truncated };

    const academyIds = academies.map((academy) => academy.id);
    const [policies, pointFlags] = await Promise.all([
      this.prisma.academyPointPolicy.findMany({
        where: { academyId: { in: academyIds } },
      }),
      this.prisma.academyFeatureFlag.findMany({
        where: { academyId: { in: academyIds }, feature: "STUDENT_POINTS" },
        select: { academyId: true, isEnabled: true },
      }),
    ]);
    const byAcademy = new Map(
      policies.map((policy) => [policy.academyId, policy]),
    );
    const enabled = new Map(
      pointFlags.map((flag) => [flag.academyId, flag.isEnabled]),
    );

    return {
      rows: academies.map((academy) => {
        const stored = byAcademy.get(academy.id);
        return {
          academyId: academy.id,
          academySlug: academy.slug,
          academyName: academy.name,
          status: academy.status,
          pointsEnabled: enabled.get(academy.id) ?? false,
          isDefault: stored === undefined,
          // `pointPolicyFrom` is the one place a stored row becomes a policy,
          // shared with the academy's own endpoint — so a board comparing two
          // academies cannot disagree with either academy's own page.
          policy: stored ? pointPolicyFrom(stored) : DEFAULT_POINT_POLICY,
        };
      }),
      total,
      truncated,
    };
  }

  /**
   * The academies both boards are about.
   *
   * Archived ones are included deliberately. They keep their configuration and
   * an operator asking "what was this academy paying" is usually asking about
   * one that has stopped — the board marks the state rather than dropping the
   * row.
   *
   * Library academies are excluded, and that is not a filter for tidiness.
   * `kind: LIBRARY` is head office's own curriculum container: it has no
   * members, no classes and no students, so it has nothing to switch a feature
   * on *for* and nobody to pay a point *to*. `AcademyAccessService` routes it
   * down `requireLibraryAccess`, which does not grant `academy.settings.manage`
   * to anyone — so leaving it on the board offered a switch that could only
   * ever answer "you are not an active manager of this academy".
   */
  private async academies(
    identity: SupabaseIdentity,
    input: ListPlatformSettingsInput,
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.academies.read",
    );

    const search = input.search?.trim();
    const where = {
      kind: "ACADEMY" as const,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { slug: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, academies] = await Promise.all([
      this.prisma.academy.count({ where }),
      this.prisma.academy.findMany({
        where,
        select: { id: true, name: true, slug: true, status: true },
        orderBy: [{ name: "asc" }],
        take: PLATFORM_SETTINGS_MAX,
      }),
    ]);

    return { academies, total, truncated: total > academies.length };
  }
}
