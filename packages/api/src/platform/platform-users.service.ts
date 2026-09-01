import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  ListPlatformUsersResult,
  PlatformUserDetail,
  ResolvedListPlatformUsersInput,
  SetPlatformUserStatusInput,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  toUserDetail,
  toUserInvitation,
  toUserSummary,
  userDetailSelect,
  userSummarySelect,
} from "./platform-user.mapper.js";

/**
 * The platform's directory of people, across every academy.
 *
 * A sibling of `PeopleDirectoryService`, never a mode of it. That one lists
 * memberships inside one academy; this lists accounts across all of them, and
 * the difference is the row: somebody who teaches at two campuses is two rows
 * there and one row here. Neither query can produce the other's shape, and a
 * shared service with a flag would have to choose one and lie about the other.
 *
 * What this service will not return is as much of its definition as what it
 * will. No submission, no grade, no progress, no point balance, and no field
 * of `StudentAcademyProfile` — guardian names, guardian phone numbers, dates
 * of birth, school names. Those belong to children, they belong to the academy
 * that collected them, and an operator who genuinely needs one opens a support
 * grant that states a reason and expires. §3.6 of the platform admin console
 * design.
 */
@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformUsersInput,
  ): Promise<ListPlatformUsersResult> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.users.read",
    );

    const where = buildUsersWhere(input);

    const [total, records, academies] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSummarySelect,
        // Newest first, then by id. The id is not decoration: `createdAt` is
        // not unique — a bulk import writes a hundred accounts in the same
        // millisecond — and without a tiebreaker page 2 can repeat or skip a
        // row that page 1 already showed.
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      // Every academy, for the facet. Read whatever the filter currently is,
      // so clearing a narrow filter does not require the operator to reload
      // the page to get their options back.
      this.prisma.academy.findMany({
        select: { id: true, name: true, slug: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    ]);

    return {
      people: records.map(toUserSummary),
      total,
      page: input.page,
      pageSize: input.pageSize,
      academyOptions: academies,
    };
  }

  async get(
    identity: SupabaseIdentity,
    userId: string,
  ): Promise<PlatformUserDetail> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.users.read",
    );

    return this.readDetail(userId);
  }

  /**
   * One account in full, in two reads.
   *
   * The second exists because an invitation is keyed on an email address, not
   * on a user id — it is written before the account that accepts it, and may
   * name an address this person has since changed. Matching on the current
   * address is the honest answer to "what was sent to them", and an account
   * with no email simply has no invitations to show.
   */
  private async readDetail(userId: string): Promise<PlatformUserDetail> {
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userDetailSelect,
    });
    if (!record) {
      throw new AppException("PLATFORM_USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const invitations = record.email
      ? await this.prisma.academyInvitation.findMany({
          where: { email: record.email },
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
            createdAt: true,
            academy: { select: { id: true, name: true, slug: true } },
            deliveryAttempts: {
              select: {
                state: true,
                failureCode: true,
                updatedAt: true,
              },
              orderBy: { attemptNumber: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [];

    return toUserDetail(record, invitations.map(toUserInvitation));
  }

  /**
   * Suspend or restore an account, platform-wide.
   *
   * Global the moment it is written, with nothing to enforce per surface:
   * `AcademyAccessService` and `PlatformAccessService` both refuse `SUSPENDED`
   * before reading any role, so the next request from this account is refused
   * everywhere at once.
   *
   * Two refusals guard the two ways this locks somebody out of their own
   * platform. An operator may not suspend themselves — the console would be
   * gone on their next click, and if they were the last admin nobody could
   * undo it — and may not suspend the last active manager of a running
   * academy, which would leave that academy leaderless without anyone
   * deciding to.
   */
  async setStatus(
    identity: SupabaseIdentity,
    input: SetPlatformUserStatusInput,
  ): Promise<PlatformUserDetail> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.users.suspend",
    );

    if (actor.userId === input.userId) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }

    const detail = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { id: input.userId },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new AppException("PLATFORM_USER_NOT_FOUND", HttpStatus.NOT_FOUND);
      }

      if (input.status === "SUSPENDED") {
        await assertNotLastActiveManager(transaction, input.userId);
      }

      // A no-op still writes an audit record. An operator who suspends an
      // already-suspended account has stated a reason, and that reason is
      // sometimes the one worth reading later.
      const updated = await transaction.user.update({
        where: { id: input.userId },
        data: { status: input.status },
        select: { id: true },
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        // Platform-scoped: this account may belong to several academies or to
        // none, and attributing the act to one of them would be a guess.
        academyId: null,
        action:
          input.status === "SUSPENDED"
            ? "platform.user.suspended"
            : "platform.user.restored",
        targetType: "user",
        targetId: input.userId,
        before: { status: existing.status },
        after: { status: input.status },
        reason: input.reason,
      });

      return updated.id;
    });

    return this.readDetail(detail);
  }
}

/**
 * The account may not be the last person able to run an academy.
 *
 * `LAST_MANAGER_REQUIRED` already means exactly this inside one academy's
 * membership service; suspending an account is the same rule reached from the
 * other side, and reusing the code keeps one answer for one situation.
 *
 * Only `ACTIVE` academies count. A suspended or archived academy has nobody
 * signing in to be stranded, and refusing there would make an operator unable
 * to suspend an account precisely when it is least risky.
 */
async function assertNotLastActiveManager(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const managed = await transaction.academyMembership.findMany({
    where: {
      userId,
      role: "MANAGER",
      status: "ACTIVE",
      academy: { status: "ACTIVE" },
    },
    select: { academyId: true },
  });
  if (managed.length === 0) return;

  for (const membership of managed) {
    const others = await transaction.academyMembership.count({
      where: {
        academyId: membership.academyId,
        role: "MANAGER",
        status: "ACTIVE",
        userId: { not: userId },
      },
    });
    if (others === 0) {
      throw new AppException("LAST_MANAGER_REQUIRED", HttpStatus.CONFLICT);
    }
  }
}

/**
 * The filter, as one `where`.
 *
 * The membership facets — academy, role, membership status — are folded into a
 * single `some`, not three. Three would ask whether the account has *a*
 * teacher membership, and *a* membership in this academy, and *a* suspended
 * membership, which a person with three different memberships satisfies while
 * holding none that is all three. One `some` asks the question an operator
 * actually typed.
 *
 * Exported for its unit test: the difference above is invisible in a passing
 * page and expensive to discover in production.
 */
export function buildUsersWhere(
  input: ResolvedListPlatformUsersInput,
): Prisma.UserWhereInput {
  const clauses: Prisma.UserWhereInput[] = [];

  if (input.accountStatuses?.length) {
    clauses.push({ status: { in: input.accountStatuses } });
  }
  if (input.platformRoles?.length) {
    clauses.push({ platformRole: { in: input.platformRoles } });
  }

  if (input.unaffiliatedOnly) {
    // Wins over every membership facet rather than combining with them: "in
    // no academy" and "in academy X" have no intersection, and answering an
    // impossible pair with an empty list reads as a broken filter.
    clauses.push({ memberships: { none: {} } });
  } else {
    const membership: Prisma.AcademyMembershipWhereInput = {
      ...(input.academyIds?.length
        ? { academyId: { in: input.academyIds } }
        : {}),
      ...(input.roles?.length ? { role: { in: input.roles } } : {}),
      ...(input.membershipStatuses?.length
        ? { status: { in: input.membershipStatuses } }
        : {}),
    };
    if (Object.keys(membership).length > 0) {
      clauses.push({ memberships: { some: membership } });
    }
  }

  const query = input.query?.trim();
  if (query) {
    clauses.push({
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { username: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
        // The academy-local numbers. A manager searches for "20241"; the
        // operator taking their support call searches for the same string.
        {
          memberships: {
            some: {
              studentProfile: {
                studentNumber: { contains: query, mode: "insensitive" },
              },
            },
          },
        },
        {
          memberships: {
            some: {
              staffProfile: {
                employeeNumber: { contains: query, mode: "insensitive" },
              },
            },
          },
        },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}
