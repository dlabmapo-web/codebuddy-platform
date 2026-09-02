import { Injectable } from "@nestjs/common";
import {
  INVITATION_EXPIRING_SOON_MS,
  type ListPlatformInvitationsResult,
  type PlatformInvitation,
  type ResolvedListPlatformInvitationsInput,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
// The same mapper the manager's own delivery list uses. Two shapes for one
// attempt row is how a bounce ends up rendered differently on two pages.
import { toDelivery } from "../manage/invitation-delivery.service.js";

/**
 * Every invitation on the platform, read across all of them at once.
 *
 * The question no academy-scoped service can answer, and — as with the
 * applications queue — one that is sometimes the *only* way the answer can be
 * reached. An invitation is sent, revoked and resent behind
 * `academy.members.manage`, which `MANAGER` holds and nobody else does. An
 * academy with no active manager cannot invite anybody, and cannot resend the
 * invitation that would have given it one.
 *
 * This service is that queue, and it reads only. Sending calls the academy's
 * own `create`, which already answers yes to an operator through the platform
 * branch of `AcademyAccessService` — so one implementation of inviting a member
 * exists rather than two, with one role ceiling, one audit shape, and one
 * delivery ladder.
 */
@Injectable()
export class PlatformInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformInvitationsInput,
  ): Promise<ListPlatformInvitationsResult> {
    await this.authorize(identity);
    await this.expireLapsed(input);

    const where = this.filter(input);
    const [total, records, summary, academyOptions] = await Promise.all([
      this.prisma.academyInvitation.count({ where }),
      this.prisma.academyInvitation.findMany({
        where,
        select: invitationSelect,
        orderBy: this.order(input),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.summarize(input),
      this.academyOptions(),
    ]);

    return {
      rows: records.map(
        (record): PlatformInvitation => ({
          id: record.id,
          academyId: record.academy.id,
          academyName: record.academy.name,
          academySlug: record.academy.slug,
          email: record.email,
          role: record.role,
          status: record.status,
          expiresAt: record.expiresAt.toISOString(),
          createdAt: record.createdAt.toISOString(),
          delivery: toDelivery(record.deliveryAttempts[0]),
          academyHasManager: record.academy._count.memberships > 0,
          invitedBy: record.invitedBy
            ? {
                displayName: record.invitedBy.displayName,
                // An operator is identified by their platform role, not by
                // whether they happen to be a member here. Cove staff seated
                // inside a customer's academy is exactly the case that would
                // read wrong the other way round.
                isOperator: record.invitedBy.platformRole !== "USER",
              }
            : null,
        }),
      ),
      total,
      page: input.page,
      pageSize: input.pageSize,
      summary,
      academyOptions,
    };
  }

  /**
   * Retire the invitations that have run out, before anything is counted.
   *
   * The same lazy sweep `AcademyInvitationService.list` runs, and running it
   * here is not optional: without it the console shows a live-looking PENDING
   * invitation that the academy's own page — which does sweep — calls EXPIRED,
   * and offers a Resend the write path would refuse.
   *
   * Scoped to the academies in view rather than the whole table, so a narrowed
   * operator does not pay to tidy the platform.
   */
  private expireLapsed(input: ResolvedListPlatformInvitationsInput) {
    return this.prisma.academyInvitation.updateMany({
      where: {
        ...academyFilter(input),
        status: "PENDING",
        expiresAt: { lte: new Date() },
      },
      data: { status: "EXPIRED" },
    });
  }

  private filter(
    input: ResolvedListPlatformInvitationsInput,
  ): Prisma.AcademyInvitationWhereInput {
    return {
      status: {
        in: input.statuses?.length ? [...input.statuses] : ["PENDING"],
      },
      ...academyFilter(input),
      ...(input.leaderlessOnly ? { academy: leaderlessAcademy } : {}),
      ...(input.query
        ? { email: { contains: input.query, mode: "insensitive" } }
        : {}),
      ...(input.deliveryStates?.length
        ? { deliveryAttempts: { some: { state: { in: [...input.deliveryStates] } } } }
        : {}),
    };
  }

  /**
   * Every ordering ends on `id`.
   *
   * Without a unique tiebreaker a page boundary is undefined for rows that tie
   * — a dozen invitations created by one import in the same second — and an
   * operator paging through them sees one address twice and another never.
   *
   * There is no leaderless-first band here, unlike the applications queue. That
   * queue is a work list whose whole point is the rows nobody else can clear;
   * this one is mostly a diagnostic an operator arrives at with a specific
   * academy or address in mind, and reordering it around a minority of rows
   * would answer a question they did not ask. The leaderless rows are marked
   * and countable instead.
   */
  private order(
    input: ResolvedListPlatformInvitationsInput,
  ): Prisma.AcademyInvitationOrderByWithRelationInput[] {
    const dir = input.direction;
    if (input.sort === "academy") {
      return [{ academy: { name: dir } }, { createdAt: "desc" }, { id: "asc" }];
    }
    if (input.sort === "expires") {
      return [{ expiresAt: dir }, { id: "asc" }];
    }
    return [{ createdAt: dir }, { id: "asc" }];
  }

  /**
   * The queue's shape, following the academy facet and nothing else.
   *
   * Not the search box: an operator typing an address is looking for one
   * person, and a total that moved with it would answer a question nobody
   * asked. Not the status or delivery facets either — "pending" means pending,
   * whatever the table below happens to be showing.
   */
  private async summarize(input: ResolvedListPlatformInvitationsInput) {
    const scope = academyFilter(input);
    const pending: Prisma.AcademyInvitationWhereInput = {
      ...scope,
      status: "PENDING",
    };
    // The failure the operator can still do something about. An invitation
    // that bounced and was then revoked is settled, and counting it would keep
    // a red number on screen for work that is finished.
    const bounced: Prisma.AcademyInvitationWhereInput = {
      ...pending,
      deliveryAttempts: { some: { state: { in: ["BOUNCED", "FAILED"] } } },
    };

    const [
      total,
      accepted,
      pendingCount,
      expiringSoon,
      bouncedCount,
      bouncedLeaderless,
      academies,
    ] = await Promise.all([
        this.prisma.academyInvitation.count({ where: scope }),
        this.prisma.academyInvitation.count({
          where: { ...scope, status: "ACCEPTED" },
        }),
        this.prisma.academyInvitation.count({ where: pending }),
        this.prisma.academyInvitation.count({
          where: {
            ...pending,
            expiresAt: { lte: new Date(Date.now() + INVITATION_EXPIRING_SOON_MS) },
          },
        }),
        this.prisma.academyInvitation.count({ where: bounced }),
        this.prisma.academyInvitation.count({
          where: { ...bounced, academy: leaderlessAcademy },
        }),
        this.prisma.academy.count({
          where: {
            ...(input.academyIds?.length ? { id: { in: input.academyIds } } : {}),
            invitations: { some: {} },
          },
        }),
      ]);

    return {
      total,
      accepted,
      pending: pendingCount,
      expiringSoon,
      bounced: bouncedCount,
      bouncedLeaderless,
      academies,
    };
  }

  /**
   * Every academy, not only the ones with an invitation already.
   *
   * The applications queue lists only academies with something in it, because
   * its facet cannot usefully offer a dead end. This response also feeds the
   * composer's academy field, and an academy with no invitations yet is exactly
   * the one an operator is being asked to send the first one into.
   */
  private academyOptions() {
    return this.prisma.academy.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  private async authorize(identity: SupabaseIdentity): Promise<void> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.invitations.read",
    );
  }
}

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { displayName: true, platformRole: true } },
  // The latest attempt only. The history matters for debugging, not for the
  // question this table asks — "did this one get through" — which is the same
  // reason the manager's own delivery list takes one.
  deliveryAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
  academy: {
    select: {
      id: true,
      name: true,
      slug: true,
      // Counted by the database rather than loaded: the row needs one boolean,
      // and reading a roster of four hundred to answer it would make this
      // queue cost more than the academy's own dashboards do.
      _count: {
        select: { memberships: { where: { role: "MANAGER", status: "ACTIVE" } } },
      },
    },
  },
} satisfies Prisma.AcademyInvitationSelect;

/**
 * An academy with nobody who could send or resend its own invitations.
 *
 * The same rule every other console surface applies: a membership left behind
 * by a manager who was suspended is not a manager. Written out rather than as a
 * `NOT` on a role alone, so two surfaces cannot drift into disagreeing about
 * whether an academy has somebody in charge of it.
 */
const leaderlessAcademy: Prisma.AcademyWhereInput = {
  memberships: { none: { role: "MANAGER", status: "ACTIVE" } },
};

function academyFilter(input: ResolvedListPlatformInvitationsInput) {
  return input.academyIds?.length
    ? { academyId: { in: input.academyIds } }
    : {};
}
