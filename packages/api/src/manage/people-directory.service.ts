import { Injectable } from "@nestjs/common";
import {
  academyRoles,
  clampPage,
  membershipStatuses,
  type ListPeopleInput,
  type PeoplePage,
  type PeopleRow,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { ManagerScopeService } from "./manager-scope.service.js";

/**
 * The academy's people, one page at a time.
 *
 * §7.3's deep module: page queries, stable ordering, search, filters, facets,
 * and exact filtered counts behind one interface. The manager table is its
 * first caller and the eligible-member selectors are the next, which is why the
 * contract is the test surface rather than the table.
 *
 * Three decisions carry the module.
 *
 * The order always ends in `id asc`. `updatedAt desc` alone is not an order:
 * memberships changed in one transaction share a timestamp, so any page
 * boundary landing inside such a group would drop or repeat rows as a manager
 * pages through — the failure that is hardest to notice and worst to have.
 *
 * The count is exact and taken after the filter. An estimate would be cheaper,
 * but the number is what a manager reads before confirming a bulk action, and
 * "about 1,800 people" is not a thing anybody should suspend.
 *
 * The facets are computed against the search but not against the other facet.
 * The count beside "Teacher" answers "what happens if I click this"; computing
 * it against a role filter that already excludes teachers would print zero next
 * to every unselected role and make the panel useless.
 *
 * See §10 of the manager control tower and scalable people operations design.
 */
@Injectable()
export class PeopleDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly media: ProfileMediaService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: ListPeopleInput,
  ): Promise<PeoplePage> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );

    const where = this.buildWhere(actor.academyId, input);
    // The search alone, for the facets: each one answers "what would this
    // filter give me", which is a different question from "what am I looking
    // at now".
    const searchWhere = this.buildWhere(actor.academyId, {
      ...input,
      roles: [],
      statuses: [],
    });

    const [total, roleFacets, statusFacets, academy] = await Promise.all([
      this.prisma.academyMembership.count({ where }),
      this.prisma.academyMembership.groupBy({
        by: ["role"],
        where: searchWhere,
        _count: { _all: true },
      }),
      this.prisma.academyMembership.groupBy({
        by: ["status"],
        where: searchWhere,
        _count: { _all: true },
      }),
      this.prisma.academy.findUniqueOrThrow({
        where: { id: actor.academyId },
        select: { peopleRevision: true },
      }),
    ]);

    const { page, pageCount, offset } = clampPage({
      page: input.page,
      pageSize: input.pageSize,
      totalRows: total,
    });

    const memberships = await this.prisma.academyMembership.findMany({
      where,
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        joinedAt: true,
        suspendedAt: true,
        updatedAt: true,
        user: {
          select: {
            displayName: true,
            username: true,
            email: true,
            ...memberAvatarSelect.user.select,
          },
        },
        memberProfile: {
          select: {
            academyDisplayName: true,
            ...memberAvatarSelect.memberProfile.select,
          },
        },
        _count: {
          select: {
            classEnrollments: { where: { class: { status: "ACTIVE" } } },
          },
        },
      },
      orderBy: orderFor(input),
      skip: offset,
      take: input.pageSize,
    });

    // Every avatar on the page in one call. See `member-avatars.ts` for why
    // the batch matters and why the fallback is not resolved here.
    const avatars = await resolveMemberAvatars(
      this.media,
      memberships.map((membership) => ({ ...membership, key: membership.id })),
    );

    const rows: PeopleRow[] = memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.userId,
      displayName:
        membership.memberProfile?.academyDisplayName?.trim() ||
        membership.user.displayName?.trim() ||
        membership.user.username?.trim() ||
        membership.user.email ||
        "—",
      email: membership.user.email,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt?.toISOString() ?? null,
      suspendedAt: membership.suspendedAt?.toISOString() ?? null,
      updatedAt: membership.updatedAt.toISOString(),
      classCount: membership._count.classEnrollments,
      ...(avatars.get(membership.id) ?? noMemberAvatar),
    }));

    return {
      rows,
      total,
      page,
      pageSize: input.pageSize,
      pageCount,
      sort: input.sort,
      direction: input.direction,
      facets: {
        // Every value in the vocabulary, including the ones nobody currently
        // holds. A filter that appears only once it would return something is a
        // filter a manager cannot use to confirm an academy has no team leads.
        roles: academyRoles.map((value) => ({
          value,
          count:
            roleFacets.find((row) => row.role === value)?._count._all ?? 0,
        })),
        statuses: membershipStatuses.map((value) => ({
          value,
          count:
            statusFacets.find((row) => row.status === value)?._count._all ?? 0,
        })),
      },
      peopleRevision: academy.peopleRevision,
    };
  }

  /**
   * The filter, as one predicate used by both the page and its count.
   *
   * Built once rather than twice so a page and its total cannot describe
   * different sets — which is what makes "1 of 4 pages" trustworthy enough to
   * act on.
   *
   * Search is case-insensitive `contains` over the name and the email, and
   * covers the academy override as well as the account name: a manager looking
   * for the student they renamed "Minji (Wed)" must find them by what this
   * academy calls them.
   */
  private buildWhere(
    academyId: string,
    input: ListPeopleInput,
  ): Prisma.AcademyMembershipWhereInput {
    const search = input.search.trim();
    return {
      academyId,
      // `LEFT` memberships are history rather than people. §10's directory is
      // who is in this academy; a member who left appears in the audit trail.
      status: input.statuses.length > 0 ? { in: input.statuses } : { not: "LEFT" },
      ...(input.roles.length > 0 ? { role: { in: input.roles } } : {}),
      user: { status: { not: "DELETED" } },
      ...(search
        ? {
            OR: [
              { user: { displayName: { contains: search, mode: "insensitive" } } },
              { user: { username: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } },
              {
                memberProfile: {
                  academyDisplayName: { contains: search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };
  }
}

/**
 * The requested order, made total.
 *
 * Every branch ends in `id: "asc"`. Without it, paging through memberships that
 * share a timestamp — everything touched by one bulk operation — silently drops
 * and repeats rows, and nothing in the interface would show it.
 *
 * Nulls sort last in both directions rather than following the direction: a
 * member who has not joined yet is not "the earliest joiner", and putting them
 * at the top of an ascending join-date sort would read as exactly that.
 */
function orderFor(
  input: ListPeopleInput,
): Prisma.AcademyMembershipOrderByWithRelationInput[] {
  const direction = input.direction;
  switch (input.sort) {
    case "displayName":
      return [{ user: { displayName: direction } }, { id: "asc" }];
    case "email":
      return [{ user: { email: direction } }, { id: "asc" }];
    case "role":
      return [{ role: direction }, { id: "asc" }];
    case "status":
      return [{ status: direction }, { id: "asc" }];
    case "joinedAt":
      return [{ joinedAt: { sort: direction, nulls: "last" } }, { id: "asc" }];
    case "updatedAt":
    default:
      return [{ updatedAt: direction }, { id: "asc" }];
  }
}
