import { HttpStatus, Injectable } from "@nestjs/common";
import {
  supportGrantState,
  SUPPORT_GRANT_MAX_HOURS,
  type ActiveSupportGrant,
  type ListSupportGrantsResult,
  type ResolvedOpenSupportGrantInput,
  type SupportAssumedRole,
  type SupportGrant,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";

const HOUR_MS = 60 * 60 * 1000;

const grantSelect = {
  id: true,
  academyId: true,
  adminUserId: true,
  assumedRole: true,
  readOnly: true,
  allowMonitoring: true,
  reason: true,
  startsAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  academy: { select: { name: true, slug: true } },
  admin: { select: { displayName: true, username: true, email: true } },
  revokedBy: { select: { displayName: true, username: true, email: true } },
} as const satisfies Prisma.PlatformSupportGrantSelect;

type GrantRecord = Prisma.PlatformSupportGrantGetPayload<{
  select: typeof grantSelect;
}>;

/**
 * Opening, listing, and ending support access.
 *
 * The service that makes deep academy access acceptable rather than merely
 * possible. Every guarantee the console offers a customer is enforced here or
 * in `AcademyAccessService`: a reason exists, the clock decides when it stops,
 * an operator cannot stack authority on itself, and the trail names the grant.
 */
@Injectable()
export class PlatformSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: { academyId?: string; liveOnly?: boolean; limit: number },
  ): Promise<ListSupportGrantsResult> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.support.read",
    );

    const now = new Date();
    const live: Prisma.PlatformSupportGrantWhereInput = {
      revokedAt: null,
      startsAt: { lte: now },
      expiresAt: { gt: now },
    };

    const [records, liveCount] = await Promise.all([
      this.prisma.platformSupportGrant.findMany({
        where: {
          ...(input.academyId ? { academyId: input.academyId } : {}),
          ...(input.liveOnly ? live : {}),
        },
        select: grantSelect,
        orderBy: { createdAt: "desc" },
        take: input.limit,
      }),
      // Counted against every academy regardless of the filter: this is the
      // number the console badges, and an operator narrowing to one academy
      // must still see that three other sessions are open.
      this.prisma.platformSupportGrant.count({ where: live }),
    ]);

    return { grants: records.map((record) => toGrant(record, now)), liveCount };
  }

  async get(
    identity: SupabaseIdentity,
    grantId: string,
  ): Promise<SupportGrant> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.support.read",
    );
    return this.read(grantId);
  }

  /**
   * Open a support session.
   *
   * The expiry is computed here from a bounded number of hours, never taken
   * from the client as a timestamp: a duration a caller may exceed is not a
   * limit. Everything else in this method exists so the row can be read later
   * as an account of what happened.
   */
  async open(
    identity: SupabaseIdentity,
    input: ResolvedOpenSupportGrantInput,
  ): Promise<SupportGrant> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.support.grant",
    );

    const now = new Date();
    const hours = Math.min(input.hours, SUPPORT_GRANT_MAX_HOURS);

    const grantId = await this.prisma.$transaction(async (transaction) => {
      const academy = await transaction.academy.findUnique({
        where: { id: input.academyId },
        select: { id: true, status: true },
      });
      if (!academy) {
        throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
      }
      // Archived is terminal. Reading its history is support; writing to it is
      // editing something the platform has already declared over.
      if (academy.status === "ARCHIVED" && !input.readOnly) {
        throw new AppException("ACADEMY_STATE_CONFLICT", HttpStatus.CONFLICT);
      }

      const existing = await transaction.platformSupportGrant.count({
        where: {
          academyId: input.academyId,
          adminUserId: actor.userId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });
      // One live grant per operator per academy. Stacking a write grant on top
      // of a read-only one would make "what was this person allowed to do"
      // unanswerable from the row that recorded it.
      if (existing > 0) {
        throw new AppException(
          "SUPPORT_GRANT_ALREADY_ACTIVE",
          HttpStatus.CONFLICT,
        );
      }

      const created = await transaction.platformSupportGrant.create({
        data: {
          academyId: input.academyId,
          adminUserId: actor.userId,
          assumedRole: input.assumedRole,
          readOnly: input.readOnly,
          allowMonitoring: input.allowMonitoring,
          reason: input.reason,
          startsAt: now,
          expiresAt: new Date(now.getTime() + hours * HOUR_MS),
        },
        select: { id: true },
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        // The academy's own trail, from the moment the session opens rather
        // than from the first write made inside it. An academy should be able
        // to see that Cove was there even if Cove changed nothing.
        academyId: input.academyId,
        action: "platform.support.granted",
        targetType: "support_grant",
        targetId: created.id,
        after: {
          assumedRole: input.assumedRole,
          readOnly: input.readOnly,
          allowMonitoring: input.allowMonitoring,
          hours,
        },
        reason: input.reason,
      });

      return created.id;
    });

    return this.read(grantId);
  }

  /**
   * End a session early.
   *
   * Idempotent: revoking an already revoked or expired grant succeeds and
   * changes nothing. An operator hitting Revoke twice, or revoking one that
   * expired while the page was open, has got what they wanted either way, and
   * an error there would only teach them to distrust the button.
   */
  async revoke(
    identity: SupabaseIdentity,
    grantId: string,
  ): Promise<SupportGrant> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.support.revoke",
    );

    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.platformSupportGrant.findUnique({
        where: { id: grantId },
        select: { id: true, academyId: true, revokedAt: true },
      });
      if (!existing) {
        throw new AppException("SUPPORT_GRANT_NOT_FOUND", HttpStatus.NOT_FOUND);
      }
      if (existing.revokedAt) return;

      await transaction.platformSupportGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date(), revokedByUserId: actor.userId },
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: existing.academyId,
        action: "platform.support.revoked",
        targetType: "support_grant",
        targetId: grantId,
      });
    });

    return this.read(grantId);
  }

  /**
   * The caller's own live grant for one academy, for the studio banner.
   *
   * No permission check, on purpose. It answers only about the caller, returns
   * nothing an academy member could not already see, and every ordinary member
   * gets `null` — the same answer an operator without a grant gets. Guarding it
   * with `platform.support.read` would mean the banner could not render for the
   * one role that needs it without also handing that permission to the shell.
   */
  async active(
    identity: SupabaseIdentity,
    academySlug: string,
  ): Promise<ActiveSupportGrant> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: { id: true },
    });
    if (!user) return null;

    const now = new Date();
    const grant = await this.prisma.platformSupportGrant.findFirst({
      where: {
        academy: { slug: academySlug },
        adminUserId: user.id,
        revokedAt: null,
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        academyId: true,
        assumedRole: true,
        readOnly: true,
        allowMonitoring: true,
        reason: true,
        expiresAt: true,
        academy: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!grant) return null;

    return {
      id: grant.id,
      academyId: grant.academyId,
      academySlug: grant.academy.slug,
      academyName: grant.academy.name,
      assumedRole: grant.assumedRole as SupportAssumedRole,
      readOnly: grant.readOnly,
      allowMonitoring: grant.allowMonitoring,
      reason: grant.reason,
      expiresAt: grant.expiresAt.toISOString(),
    };
  }

  private async read(grantId: string): Promise<SupportGrant> {
    const record = await this.prisma.platformSupportGrant.findUnique({
      where: { id: grantId },
      select: grantSelect,
    });
    if (!record) {
      throw new AppException("SUPPORT_GRANT_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return toGrant(record, new Date());
  }
}

function displayNameOf(person: {
  displayName: string | null;
  username: string | null;
  email: string | null;
} | null): string | null {
  if (!person) return null;
  return (
    person.displayName?.trim() ||
    person.username?.trim() ||
    person.email ||
    null
  );
}

export function toGrant(record: GrantRecord, now: Date): SupportGrant {
  return {
    id: record.id,
    academyId: record.academyId,
    academyName: record.academy.name,
    academySlug: record.academy.slug,
    adminUserId: record.adminUserId,
    adminName: displayNameOf(record.admin) ?? "—",
    assumedRole: record.assumedRole as SupportAssumedRole,
    readOnly: record.readOnly,
    allowMonitoring: record.allowMonitoring,
    reason: record.reason,
    startsAt: record.startsAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    revokedByName: displayNameOf(record.revokedBy),
    createdAt: record.createdAt.toISOString(),
    // Derived, never stored. A `state` column would be a row somebody has to
    // remember to update, and the one thing this feature must not depend on is
    // somebody remembering.
    state: supportGrantState(record, now),
  };
}
