import { randomBytes } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  academyAttentionRank,
  type CreatePlatformAcademyInput,
  type ListPlatformAcademiesInput,
  type PlatformAcademyDetail,
  type PlatformAcademySummary,
  type ResendFirstManagerInvitationInput,
} from "@cove/shared";

import {
  hashInvitationToken,
  invitationLifetimeMs,
  normalizeEmail,
  toInvitationDetail,
} from "../academies/academy-invitation.service.js";
import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { InvitationDeliveryService } from "../manage/invitation-delivery.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  toAcademyDetail,
  toAcademySummary,
  type AcademyDetailRecord,
} from "./platform-academy.mapper.js";
import {
  academyDetailSelect,
  academySummarySelect,
} from "./platform-academy.select.js";
import { resolvePlatformOrganization } from "./platform-organization.js";

/**
 * Onboarding an academy, and reading the platform's roster of them.
 *
 * Creation and lifecycle are separate services deliberately: switching an
 * academy off has real collaborators — monitoring revocation now, the judge
 * queue later — that creation has no business being able to reach.
 */
@Injectable()
export class PlatformAcademyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly audit: AuditService,
    private readonly delivery: InvitationDeliveryService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: ListPlatformAcademiesInput,
  ): Promise<{
    academies: PlatformAcademySummary[];
    total: number;
    needsAttention: number;
  }> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.academies.read",
    );

    const query = input.query?.trim();
    const where: Prisma.AcademyWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { slug: { contains: query.toLowerCase() } },
            ],
          }
        : {}),
    };

    // Read every matching row before paging. The operator's ordering is by
    // attention (§ shared `academyAttentionRank`), which is derived from
    // membership rows rather than stored, so the database cannot produce it in
    // an ORDER BY. Bounded by the size of the platform's own academy list —
    // tens, not millions — and revisited when that stops being true.
    const records = await this.prisma.academy.findMany({
      where,
      select: academySummarySelect,
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const summaries = records
      .map((record) => toAcademySummary(record, now))
      .sort(
        (a, b) =>
          academyAttentionRank(a) - academyAttentionRank(b) ||
          b.createdAt.localeCompare(a.createdAt),
      );

    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const attention = summaries.filter(wantsAttention);
    const page = input.needsAttention ? attention : summaries;

    return {
      academies: page.slice(offset, offset + limit),
      total: page.length,
      needsAttention: attention.length,
    };
  }

  async get(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<PlatformAcademyDetail> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.academies.read",
    );
    return toAcademyDetail(await this.requireAcademy(academyId));
  }

  async create(
    identity: SupabaseIdentity,
    input: CreatePlatformAcademyInput,
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.academies.create",
    );

    const managerEmail = normalizeEmail(input.managerEmail);
    // The one moment the plaintext token exists. It is generated here, hashed
    // for storage, and handed to delivery after the commit — never read back,
    // because only the hash is kept.
    const token = randomBytes(32).toString("base64url");

    const created = await this.prisma.$transaction(async (transaction) => {
      const organization = await resolvePlatformOrganization(
        transaction,
        this.config.get("PLATFORM_ORGANIZATION_SLUG", { infer: true }),
      );
      if (organization.created) {
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: null,
          action: "platform.organization.created",
          targetType: "Organization",
          targetId: organization.id,
        });
      }

      const academy = await transaction.academy
        .create({
          data: {
            organizationId: organization.id,
            name: input.name,
            slug: input.slug,
            timeZone: input.timeZone,
            contactEmail: input.contactEmail,
            createdByUserId: actor.userId,
          },
          select: academyDetailSelect,
        })
        .catch((error: unknown) => {
          if (hasPrismaCode(error, "P2002")) {
            throw new AppException(
              "ACADEMY_SLUG_CONFLICT",
              HttpStatus.CONFLICT,
            );
          }
          throw error;
        });

      const invitation = await transaction.academyInvitation.create({
        data: {
          academyId: academy.id,
          email: managerEmail,
          role: "MANAGER",
          tokenHash: hashInvitationToken(token),
          status: "PENDING",
          expiresAt: new Date(Date.now() + invitationLifetimeMs),
          invitedByUserId: actor.userId,
        },
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: academy.id,
        action: "platform.academy.created",
        targetType: "Academy",
        targetId: academy.id,
        after: {
          name: academy.name,
          slug: academy.slug,
          timeZone: academy.timeZone,
        },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: academy.id,
        action: "platform.academy.first_manager_invited",
        targetType: "AcademyInvitation",
        targetId: invitation.id,
        after: { email: managerEmail, role: "MANAGER" },
      });

      // `peopleRevision` stays at 0. There is no roster yet, so no selection or
      // import preview can have been built against one.
      return { academy, invitation };
    });

    // After the commit, never inside it: an email carrying a token that then
    // rolled back would be an invitation to an academy that does not exist.
    await this.delivery.queueForInvitation({
      invitationId: created.invitation.id,
      academyId: created.academy.id,
      email: managerEmail,
      token,
    });

    return {
      academy: toAcademyDetail(created.academy),
      invitation: toInvitationDetail(created.invitation),
      // Returned once, to the operator who created it. Delivery may be a local
      // sink or a provider that bounces; either way the person who just made
      // this academy is the one who can still reach its manager by hand.
      token,
    };
  }

  /**
   * Sends the first-manager invitation again, optionally to a corrected
   * address.
   *
   * The ordinary resend requires `academy.members.manage`, which only a manager
   * holds — and an academy still waiting for its first manager has none. This
   * is that gap, and nothing more: it refuses outright once a manager exists,
   * so it can never become a back door into an academy that is running.
   */
  async resendFirstManagerInvitation(
    identity: SupabaseIdentity,
    input: ResendFirstManagerInvitationInput,
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.academies.create",
    );

    const academy = await this.requireAcademy(input.academyId);
    if (academy.memberships.some((m) => m.role === "MANAGER" && m.status === "ACTIVE")) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }
    if (academy.status === "ARCHIVED") {
      throw new AppException("ACADEMY_STATE_CONFLICT", HttpStatus.CONFLICT);
    }

    const previous = academy.invitations.find(
      (invitation) =>
        invitation.role === "MANAGER" && invitation.status === "PENDING",
    );
    const email = normalizeEmail(input.email ?? previous?.email ?? "");
    if (!email) {
      throw new AppException("INVITATION_INVALID", HttpStatus.BAD_REQUEST);
    }

    const token = randomBytes(32).toString("base64url");
    const invitation = await this.prisma.$transaction(async (transaction) => {
      // Revoke every outstanding manager invitation in the same transaction,
      // so a single-use token is never left live alongside its replacement.
      await transaction.academyInvitation.updateMany({
        where: {
          academyId: input.academyId,
          role: "MANAGER",
          status: "PENDING",
        },
        data: { status: "REVOKED", revokedAt: new Date() },
      });

      const created = await transaction.academyInvitation.create({
        data: {
          academyId: input.academyId,
          email,
          role: "MANAGER",
          tokenHash: hashInvitationToken(token),
          status: "PENDING",
          expiresAt: new Date(Date.now() + invitationLifetimeMs),
          invitedByUserId: actor.userId,
        },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "platform.academy.first_manager_invitation_resent",
        targetType: "AcademyInvitation",
        targetId: created.id,
        before: previous ? { email: previous.email } : undefined,
        after: { email },
      });
      return created;
    });

    await this.delivery.queueForInvitation({
      invitationId: invitation.id,
      academyId: input.academyId,
      email,
      token,
    });

    return { invitation: toInvitationDetail(invitation), token };
  }

  private async requireAcademy(academyId: string): Promise<AcademyDetailRecord> {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: academyDetailSelect,
    });
    if (!academy) {
      throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return academy;
  }
}

export function wantsAttention(summary: PlatformAcademySummary): boolean {
  return (
    summary.status !== "ARCHIVED" &&
    (summary.managerState !== "active" || summary.status === "SUSPENDED")
  );
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
