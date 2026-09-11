import type { AcademyRole, MembershipStatus } from "@cove/shared";

import type { Prisma } from "../generated/prisma/client.js";

/**
 * Which slice of the academy a people read is about.
 *
 * `students` needs only the primary role: `STUDENT` never combines with a
 * staff role, in either direction, so a membership whose primary role is not
 * `STUDENT` holds no student role at all. `staff` is the complement for the
 * same reason.
 */
export type PeopleAudience = "everyone" | "students" | "staff";

export type PeopleWhereInput = {
  search: string;
  /** Empty means any role. */
  roles: readonly AcademyRole[];
  /** Empty means every status except `LEFT`. */
  statuses: readonly MembershipStatus[];
  audience?: PeopleAudience;
  /** Students only: enrolled in any of these classes. Empty means any. */
  classIds?: readonly string[];
  /** Fields the search matches beyond name, username, and email. */
  searchStudentNumber?: boolean;
  searchEmployeeNumber?: boolean;
};

/**
 * The one membership predicate every people read and every filter selection
 * is built from.
 *
 * One function rather than one per caller, because the callers have to agree:
 * the Members page, the "select all matching" that a bulk action resolves from
 * it, and the two rosters all describe a set of people, and a manager who
 * filters to 40 teachers and suspends "all matching" must suspend those 40.
 * Before this there were two copies, and they had drifted — the bulk copy
 * searched no usernames, and neither counted an extra role.
 *
 * A role matches if it is *held*, primary or extra. The director who is also a
 * teacher is a teacher: they appear under the Teacher filter, and a bulk action
 * on "teachers" reaches them. Asking only about the primary role — which is
 * always the highest — would hide every manager who teaches from every
 * teacher-shaped question.
 *
 * `LEFT` memberships are history rather than people and are excluded unless a
 * status filter names them; deleted accounts are excluded always.
 */
export function peopleWhere(
  academyId: string,
  input: PeopleWhereInput,
): Prisma.AcademyMembershipWhereInput {
  const search = input.search.trim();
  const and: Prisma.AcademyMembershipWhereInput[] = [];

  if (input.roles.length > 0) {
    const roles = [...input.roles];
    and.push({
      OR: [
        { role: { in: roles } },
        { extraRoles: { some: { role: { in: roles } } } },
      ],
    });
  }

  if (search) {
    const contains = { contains: search, mode: "insensitive" as const };
    and.push({
      OR: [
        { user: { displayName: contains } },
        { user: { username: contains } },
        { user: { email: contains } },
        { memberProfile: { academyDisplayName: contains } },
        ...(input.searchStudentNumber
          ? [{ studentProfile: { studentNumber: contains } }]
          : []),
        ...(input.searchEmployeeNumber
          ? [{ staffProfile: { employeeNumber: contains } }]
          : []),
      ],
    });
  }

  if (input.classIds && input.classIds.length > 0) {
    and.push({
      classEnrollments: {
        some: {
          classId: { in: [...input.classIds] },
          class: { academyId, status: "ACTIVE" },
        },
      },
    });
  }

  return {
    academyId,
    status:
      input.statuses.length > 0
        ? { in: [...input.statuses] }
        : { not: "LEFT" },
    ...audienceWhere(input.audience ?? "everyone"),
    user: { status: { not: "DELETED" } },
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function audienceWhere(
  audience: PeopleAudience,
): Prisma.AcademyMembershipWhereInput {
  switch (audience) {
    case "students":
      return { role: "STUDENT" };
    case "staff":
      return { role: { in: ["TEACHER", "TEAM_LEAD", "MANAGER"] } };
    case "everyone":
    default:
      return {};
  }
}
