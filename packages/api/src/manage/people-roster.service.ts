import { Injectable } from "@nestjs/common";
import {
  clampPage,
  displayableEmail,
  effectiveAcademyRoles,
  membershipStatuses,
  staffRoles,
  type ListStaffRosterInput,
  type ListStudentRosterInput,
  type StaffRosterPage,
  type StaffRosterRow,
  type StudentRosterPage,
  type StudentRosterRow,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";
import { ManagerScopeService } from "./manager-scope.service.js";
import { peopleWhere, type PeopleWhereInput } from "./people-where.js";

/**
 * The manager's two rosters: every student, and every member of staff.
 *
 * Siblings of `PeopleDirectoryService`, and built the way it is — one server
 * page at a time, a total order that ends in `id asc`, exact counts taken after
 * the filter, facets taken against the search alone — from the same
 * `peopleWhere` predicate. What differs is the row: each roster reads the
 * profile its audience has, so the table can show a guardian's phone or a
 * teacher's classes without a request per row.
 *
 * Read-only by design. Every change a manager makes to a person still happens
 * on the Members page or the member profile, which own the authorization and
 * the audit trail for it.
 */
@Injectable()
export class PeopleRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly media: ProfileMediaService,
  ) {}

  async listStudents(
    identity: SupabaseIdentity,
    input: ListStudentRosterInput,
  ): Promise<StudentRosterPage> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );
    const academyId = actor.academyId;

    const filter: PeopleWhereInput = {
      search: input.search,
      roles: [],
      statuses: input.statuses,
      classIds: input.classIds,
      audience: "students",
      searchStudentNumber: true,
    };
    const where = peopleWhere(academyId, filter);
    // The search alone, for the facets — see `peopleFacetsSchema`.
    const searchWhere = peopleWhere(academyId, {
      ...filter,
      statuses: [],
      classIds: [],
    });

    const [total, statusFacets, classes, classCounts] = await Promise.all([
      this.prisma.academyMembership.count({ where }),
      this.prisma.academyMembership.groupBy({
        by: ["status"],
        where: searchWhere,
        _count: { _all: true },
      }),
      this.prisma.class.findMany({
        where: { academyId, status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      this.prisma.classEnrollment.groupBy({
        by: ["classId"],
        where: {
          class: { academyId, status: "ACTIVE" },
          membership: searchWhere,
        },
        _count: { _all: true },
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
        status: true,
        joinedAt: true,
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
        studentProfile: {
          select: {
            studentNumber: true,
            schoolName: true,
            schoolGrade: true,
            guardianName: true,
            guardianPhone: true,
          },
        },
        classEnrollments: {
          where: { class: { academyId, status: "ACTIVE" } },
          select: { class: { select: { id: true, name: true } } },
          orderBy: { class: { name: "asc" } },
        },
      },
      orderBy: studentOrder(input),
      skip: offset,
      take: input.pageSize,
    });

    const avatars = await resolveMemberAvatars(
      this.media,
      memberships.map((membership) => ({ ...membership, key: membership.id })),
    );

    const rows: StudentRosterRow[] = memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.userId,
      displayName: displayNameOf(membership),
      username: membership.user.username,
      status: membership.status,
      joinedAt: membership.joinedAt?.toISOString() ?? null,
      updatedAt: membership.updatedAt.toISOString(),
      studentNumber: membership.studentProfile?.studentNumber ?? null,
      schoolName: membership.studentProfile?.schoolName ?? null,
      schoolGrade: membership.studentProfile?.schoolGrade ?? null,
      guardianName: membership.studentProfile?.guardianName ?? null,
      guardianPhone: membership.studentProfile?.guardianPhone ?? null,
      classes: membership.classEnrollments.map((entry) => entry.class),
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
        statuses: membershipStatuses.map((value) => ({
          value,
          count:
            statusFacets.find((row) => row.status === value)?._count._all ?? 0,
        })),
        classes: classes.map((entry) => ({
          id: entry.id,
          name: entry.name,
          count:
            classCounts.find((row) => row.classId === entry.id)?._count._all ??
            0,
        })),
      },
    };
  }

  async listStaff(
    identity: SupabaseIdentity,
    input: ListStaffRosterInput,
  ): Promise<StaffRosterPage> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );
    const academyId = actor.academyId;

    const filter: PeopleWhereInput = {
      search: input.search,
      roles: input.roles,
      statuses: input.statuses,
      audience: "staff",
      searchEmployeeNumber: true,
    };
    const where = peopleWhere(academyId, filter);
    const searchWhere = peopleWhere(academyId, {
      ...filter,
      roles: [],
      statuses: [],
    });

    const [total, roleCounts, statusFacets] = await Promise.all([
      this.prisma.academyMembership.count({ where }),
      // One "holds this role" count per role, so the Manager who also teaches
      // is counted under both — as the Teacher filter will return them.
      Promise.all(
        staffRoles.map((role) =>
          this.prisma.academyMembership.count({
            where: peopleWhere(academyId, {
              ...filter,
              roles: [role],
              statuses: [],
            }),
          }),
        ),
      ),
      this.prisma.academyMembership.groupBy({
        by: ["status"],
        where: searchWhere,
        _count: { _all: true },
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
        extraRoles: { select: { role: true } },
        status: true,
        joinedAt: true,
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
            contactPhone: true,
            ...memberAvatarSelect.memberProfile.select,
          },
        },
        staffProfile: {
          select: { academyTitle: true, employeeNumber: true },
        },
        assignedClasses: {
          where: { academyId, status: "ACTIVE" },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        },
        assistedClasses: {
          where: { class: { academyId, status: "ACTIVE" } },
          select: { class: { select: { id: true, name: true } } },
          orderBy: { class: { name: "asc" } },
        },
      },
      orderBy: staffOrder(input),
      skip: offset,
      take: input.pageSize,
    });

    const avatars = await resolveMemberAvatars(
      this.media,
      memberships.map((membership) => ({ ...membership, key: membership.id })),
    );

    const rows: StaffRosterRow[] = memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.userId,
      displayName: displayNameOf(membership),
      username: membership.user.username,
      email: displayableEmail(membership.user.email),
      role: membership.role,
      roles: [
        ...effectiveAcademyRoles(
          membership.role,
          membership.extraRoles.map((extra) => extra.role),
        ),
      ],
      status: membership.status,
      joinedAt: membership.joinedAt?.toISOString() ?? null,
      updatedAt: membership.updatedAt.toISOString(),
      academyTitle: membership.staffProfile?.academyTitle ?? null,
      employeeNumber: membership.staffProfile?.employeeNumber ?? null,
      contactPhone: membership.memberProfile?.contactPhone ?? null,
      homeroomClasses: membership.assignedClasses,
      assistantClasses: membership.assistedClasses.map((entry) => entry.class),
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
        roles: staffRoles.map((value, index) => ({
          value,
          count: roleCounts[index] ?? 0,
        })),
        statuses: membershipStatuses.map((value) => ({
          value,
          count:
            statusFacets.find((row) => row.status === value)?._count._all ?? 0,
        })),
      },
    };
  }
}

/** The name the academy uses, with the directory's own fallback order. */
function displayNameOf(membership: {
  user: { displayName: string | null; username: string | null; email: string | null };
  memberProfile: { academyDisplayName: string | null } | null;
}): string {
  return (
    membership.memberProfile?.academyDisplayName?.trim() ||
    membership.user.displayName?.trim() ||
    membership.user.username?.trim() ||
    displayableEmail(membership.user.email) ||
    "—"
  );
}

type MembershipOrder = Prisma.AcademyMembershipOrderByWithRelationInput;

/**
 * Ties on a non-unique column break by name, then by id — the name so a column
 * of equal grades reads alphabetically, the id so the order is total and a
 * page boundary never drops or repeats a row.
 */
const byNameThenId: MembershipOrder[] = [
  { user: { displayName: "asc" } },
  { id: "asc" },
];

function studentOrder(input: ListStudentRosterInput): MembershipOrder[] {
  const direction = input.direction;
  switch (input.sort) {
    case "username":
      return [
        { user: { username: { sort: direction, nulls: "last" } } },
        { id: "asc" },
      ];
    case "studentNumber":
      return [
        { studentProfile: { studentNumber: { sort: direction, nulls: "last" } } },
        ...byNameThenId,
      ];
    case "schoolGrade":
      return [
        { studentProfile: { schoolGrade: { sort: direction, nulls: "last" } } },
        ...byNameThenId,
      ];
    case "status":
      return [{ status: direction }, ...byNameThenId];
    case "joinedAt":
      return [{ joinedAt: { sort: direction, nulls: "last" } }, { id: "asc" }];
    case "updatedAt":
      return [{ updatedAt: direction }, { id: "asc" }];
    case "displayName":
    default:
      return [{ user: { displayName: direction } }, { id: "asc" }];
  }
}

/**
 * Role orders by the primary role, which is always the highest one held — so
 * the Manager who also teaches sorts once, with the managers.
 *
 * The column is a Postgres enum, which sorts by declaration order, and
 * `AcademyRole` is declared lowest to highest — the same order as
 * `academyRoleRank`. `people-roster.service.spec.ts` pins that, so a reordered
 * enum fails a test rather than silently reshuffling who sorts above whom.
 */
function staffOrder(input: ListStaffRosterInput): MembershipOrder[] {
  const direction = input.direction;
  switch (input.sort) {
    case "role":
      return [{ role: direction }, ...byNameThenId];
    case "username":
      return [
        { user: { username: { sort: direction, nulls: "last" } } },
        { id: "asc" },
      ];
    case "employeeNumber":
      return [
        { staffProfile: { employeeNumber: { sort: direction, nulls: "last" } } },
        ...byNameThenId,
      ];
    case "status":
      return [{ status: direction }, ...byNameThenId];
    case "joinedAt":
      return [{ joinedAt: { sort: direction, nulls: "last" } }, { id: "asc" }];
    case "updatedAt":
      return [{ updatedAt: direction }, { id: "asc" }];
    case "displayName":
    default:
      return [{ user: { displayName: direction } }, { id: "asc" }];
  }
}
