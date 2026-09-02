import { Injectable } from "@nestjs/common";
import type {
  ListPlatformApplicationsResult,
  PlatformApplication,
  ResolvedListPlatformApplicationsInput,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";

/**
 * Everyone waiting to be let into an academy, read across all of them at once.
 *
 * The question no academy-scoped service can answer, and — unlike the content
 * browser's — one that is sometimes the *only* way the answer can be reached.
 * An application is reviewed behind `academy.applications.review`, which
 * `MANAGER` and `TEAM_LEAD` hold and nobody else does. An academy created with
 * nobody in it has neither, so its applicants sit in a queue that no human on
 * the platform is permitted to open.
 *
 * This service is that queue, and it reads only. Approving calls the academy's
 * own `review`, which already answers yes to an operator through the platform
 * branch of `AcademyAccessService` — so one implementation of seating a member
 * exists rather than two, with one role ceiling and one audit shape.
 */
@Injectable()
export class PlatformApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    /** The queue shows faces, like every other people surface. */
    private readonly profileMedia: ProfileMediaService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformApplicationsInput,
  ): Promise<ListPlatformApplicationsResult> {
    await this.authorize(identity);

    const where = this.filter(input);
    const [total, summary, academyOptions] = await Promise.all([
      this.prisma.academyJoinRequest.count({ where }),
      this.summarize(input),
      this.academyOptions(input),
    ]);

    const records = await this.page(input, where);
    const avatars = await resolveMemberAvatars(
      this.profileMedia,
      // An applicant has no academy photo — they are not a member yet — so
      // only their own account image is signed.
      records.map((record) => ({
        user: record.user,
        memberProfile: null,
        key: record.id,
      })),
    );

    return {
      rows: records.map(
        (record): PlatformApplication => ({
          id: record.id,
          academyId: record.academy.id,
          academyName: record.academy.name,
          academySlug: record.academy.slug,
          user: {
            id: record.user.id,
            email: record.user.email,
            displayName: record.user.displayName,
            ...(avatars.get(record.id) ?? noMemberAvatar),
          },
          message: record.message,
          status: record.status,
          approvedRole: record.approvedRole,
          reviewReason: record.reviewReason,
          createdAt: record.createdAt.toISOString(),
          reviewedAt: record.reviewedAt?.toISOString() ?? null,
          academyHasManager: record.academy._count.memberships > 0,
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
   * How many applications only an operator can clear.
   *
   * One indexed count, for a badge the sidebar asks for on every page entry —
   * the reason `academyJoinRequests.pendingCount` is its own procedure too.
   *
   * Leaderless only. A badge showing every pending application would sit
   * permanently at a manager's workload, and a badge that is always lit is a
   * badge nobody reads.
   */
  async pendingCount(identity: SupabaseIdentity): Promise<{ count: number }> {
    await this.authorize(identity);
    const count = await this.prisma.academyJoinRequest.count({
      where: { status: "PENDING", academy: leaderlessAcademy },
    });
    return { count };
  }

  /**
   * One page, with the applications nobody else can review at the front.
   *
   * Two queries rather than one, because "does this academy have a manager" is
   * a filtered relation count and Prisma cannot order by one. Splitting the
   * page at the leaderless total gives the same rows in the same order as a
   * single sorted query would, with no raw SQL and no window function:
   *
   *     rows 0 … L-1   leaderless, oldest first
   *     rows L …       the rest,   oldest first
   *
   * so a page starting inside the first band takes what it can from it and
   * fills the remainder from the second. Both bands end on `id`, which is what
   * makes the split deterministic — without a unique tiebreaker the boundary
   * between two pages is undefined for rows sharing a timestamp, and an
   * operator paging through would see one applicant twice and another never.
   *
   * Sorting by academy is a plain single query: the operator has asked for a
   * different question, and answering it while still forcing the leaderless
   * rows to the top would be ignoring what they asked for.
   */
  private async page(
    input: ResolvedListPlatformApplicationsInput,
    where: Prisma.AcademyJoinRequestWhereInput,
  ) {
    const offset = (input.page - 1) * input.pageSize;

    if (input.sort === "academy") {
      return this.prisma.academyJoinRequest.findMany({
        where,
        select: applicationSelect,
        orderBy: [
          { academy: { name: input.direction } },
          { createdAt: "asc" },
          { id: "asc" },
        ],
        skip: offset,
        take: input.pageSize,
      });
    }

    const age: Prisma.AcademyJoinRequestOrderByWithRelationInput[] = [
      { createdAt: input.direction },
      { id: "asc" },
    ];
    const leaderlessWhere = { ...where, academy: leaderlessAcademy };
    const leaderlessTotal = await this.prisma.academyJoinRequest.count({
      where: leaderlessWhere,
    });

    const head =
      offset < leaderlessTotal
        ? await this.prisma.academyJoinRequest.findMany({
            where: leaderlessWhere,
            select: applicationSelect,
            orderBy: age,
            skip: offset,
            take: input.pageSize,
          })
        : [];
    if (head.length === input.pageSize) return head;

    const tail = await this.prisma.academyJoinRequest.findMany({
      where: { ...where, academy: { NOT: leaderlessAcademy } },
      select: applicationSelect,
      orderBy: age,
      skip: Math.max(0, offset - leaderlessTotal),
      take: input.pageSize - head.length,
    });
    return [...head, ...tail];
  }

  private filter(
    input: ResolvedListPlatformApplicationsInput,
  ): Prisma.AcademyJoinRequestWhereInput {
    return {
      status: {
        in: input.statuses?.length ? [...input.statuses] : ["PENDING"],
      },
      ...academyFilter(input),
      ...(input.leaderlessOnly ? { academy: leaderlessAcademy } : {}),
      ...(input.query
        ? {
            user: {
              OR: [
                { displayName: { contains: input.query, mode: "insensitive" } },
                { email: { contains: input.query, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };
  }

  /**
   * The queue's shape, following the academy facet and nothing else.
   *
   * Not the search box: an operator typing a name is looking for one person,
   * and a total that moved with the search would answer a question nobody
   * asked. Not the status facet either — "waiting" means pending, whatever the
   * table below happens to be showing.
   */
  private async summarize(input: ResolvedListPlatformApplicationsInput) {
    const pending: Prisma.AcademyJoinRequestWhereInput = {
      status: "PENDING",
      ...academyFilter(input),
    };
    const [waiting, leaderless, academies] = await Promise.all([
      this.prisma.academyJoinRequest.count({ where: pending }),
      this.prisma.academyJoinRequest.count({
        where: { ...pending, academy: leaderlessAcademy },
      }),
      this.prisma.academy.count({
        where: {
          ...(input.academyIds?.length ? { id: { in: input.academyIds } } : {}),
          joinRequests: { some: { status: "PENDING" } },
        },
      }),
    ]);
    return { waiting, leaderless, academies };
  }

  /** Every academy with something in the queue — the facet lists no dead ends. */
  private academyOptions(input: ResolvedListPlatformApplicationsInput) {
    return this.prisma.academy.findMany({
      where: {
        joinRequests: {
          some: {
            status: {
              in: input.statuses?.length ? [...input.statuses] : ["PENDING"],
            },
          },
        },
      },
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  private async authorize(identity: SupabaseIdentity): Promise<void> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.applications.read",
    );
  }
}

const applicationSelect = {
  id: true,
  message: true,
  status: true,
  approvedRole: true,
  reviewReason: true,
  createdAt: true,
  reviewedAt: true,
  academy: {
    select: {
      id: true,
      name: true,
      slug: true,
      // Counted by the database rather than loaded: the row needs one boolean,
      // and reading a roster of four hundred to answer it would make the queue
      // cost more than the academy's own dashboards do.
      _count: {
        select: { memberships: { where: { role: "MANAGER", status: "ACTIVE" } } },
      },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      avatarAsset: { select: { id: true, bucket: true, objectKey: true } },
    },
  },
} satisfies Prisma.AcademyJoinRequestSelect;

/**
 * An academy with nobody who could review its own applications.
 *
 * The same rule every other console surface applies: a membership left behind
 * by a manager who was suspended is not a manager. Written out rather than as
 * a `NOT` on a role alone, so two surfaces cannot drift into disagreeing about
 * whether an academy has somebody in charge of it.
 */
const leaderlessAcademy: Prisma.AcademyWhereInput = {
  memberships: { none: { role: "MANAGER", status: "ACTIVE" } },
};

function academyFilter(input: ResolvedListPlatformApplicationsInput) {
  return input.academyIds?.length
    ? { academyId: { in: input.academyIds } }
    : {};
}
