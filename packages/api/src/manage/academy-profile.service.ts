import { Injectable } from "@nestjs/common";
import type { AcademyProfile, UpdateAcademyProfileInput } from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { ManagerScopeService } from "./manager-scope.service.js";
import { AcademyMediaService } from "./academy-media.service.js";

/**
 * §7.2 — the academy's own presentation and contact data.
 *
 * Small, and deliberately its own module rather than a method on the overview.
 * The overview is a read that must never write; this is the one write the
 * control tower offers, it needs a different permission, and it is audited.
 * Folding it in would put a mutation inside the module whose whole guarantee is
 * that it does not have one.
 *
 * The audit record carries the fields that changed and nothing else. An academy
 * address is not secret, but a diff that always wrote every column would make
 * "what did the manager actually change" unanswerable in the history — which is
 * the only question an audit trail exists to answer.
 *
 * `profileUpdatedAt` is stamped here rather than derived from `updatedAt`:
 * `updatedAt` moves for a rename, a status change, or a people revision bump,
 * and the completion prompt on the overview asks specifically whether anybody
 * has ever filled the profile in.
 */
@Injectable()
export class AcademyOperationsProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly audit: AuditService,
    private readonly media: AcademyMediaService,
  ) {}

  async update(
    identity: SupabaseIdentity,
    input: UpdateAcademyProfileInput,
  ): Promise<AcademyProfile> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.settings.manage",
    );

    const { academyId, ...fields } = input;

    const profile = await this.prisma.$transaction(async (transaction) => {
      const before = await transaction.academy.findUniqueOrThrow({
        where: { id: academyId },
        select: PROFILE_SELECT,
      });

      const after = await transaction.academy.update({
        where: { id: academyId },
        data: { ...fields, profileUpdatedAt: new Date() },
        select: PROFILE_SELECT,
      });

      const changed = changedFields(before, after);
      if (changed.length > 0) {
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId,
          action: "academy.profile.update",
          targetType: "Academy",
          targetId: academyId,
          before: Object.fromEntries(
            changed.map((field) => [field, before[field]]),
          ),
          after: Object.fromEntries(
            changed.map((field) => [field, after[field]]),
          ),
        });
      }

      return {
        ...after,
        profileUpdatedAt: after.profileUpdatedAt?.toISOString() ?? null,
      };
    });
    return { ...profile, ...(await this.media.presentForAcademy(academyId)) };
  }
}

const PROFILE_SELECT = {
  id: true,
  name: true,
  slug: true,
  addressLine1: true,
  addressLine2: true,
  locality: true,
  region: true,
  postalCode: true,
  countryCode: true,
  contactPhone: true,
  contactEmail: true,
  timeZone: true,
  profileUpdatedAt: true,
  peopleRevision: true,
} as const;

type ProfileRow = {
  [Key in keyof typeof PROFILE_SELECT]: Key extends "profileUpdatedAt"
    ? Date | null
    : Key extends "peopleRevision"
      ? number
      : string | null;
};

/** Which editable columns actually moved. Identity and counters are excluded. */
function changedFields(
  before: ProfileRow,
  after: ProfileRow,
): (keyof ProfileRow)[] {
  const editable = [
    "addressLine1",
    "addressLine2",
    "locality",
    "region",
    "postalCode",
    "countryCode",
    "contactPhone",
    "contactEmail",
    "timeZone",
  ] as const;
  return editable.filter((field) => before[field] !== after[field]);
}
