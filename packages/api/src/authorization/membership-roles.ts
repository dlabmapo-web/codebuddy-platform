import type { AcademyRole } from "@cove/shared";

import { Prisma } from "../generated/prisma/client.js";

/**
 * Whether a membership holds a role, counting the ones granted beside its
 * primary.
 *
 * `AcademyMembership.role` is only the *highest* role somebody holds. A
 * director who also teaches has `role = MANAGER` and `TEACHER` in
 * `extraRoles`, so every `membership.role === "TEACHER"` in the codebase reads
 * false for them — which is how a Manager who was granted TEACHER ended up
 * locked out of the teaching overview they had just been given.
 *
 * Record, ORM, and SQL forms of the same question live here so assignment
 * pickers and management aggregates agree about who can teach.
 */
export function membershipHoldsRole(
  membership: {
    role: AcademyRole;
    extraRoles?: readonly { role: AcademyRole }[];
  },
  role: AcademyRole,
): boolean {
  return (
    membership.role === role ||
    (membership.extraRoles ?? []).some((extra) => extra.role === role)
  );
}

/**
 * The `where` fragment for "memberships holding this role".
 *
 * Spread into a filter rather than returning a whole clause, so a caller that
 * already has `OR` of its own does not silently lose one of the two.
 */
export function holdsRoleWhere(
  role: AcademyRole,
): Prisma.AcademyMembershipWhereInput {
  return { OR: [{ role }, { extraRoles: { some: { role } } }] };
}

/** SQL counterpart for aggregate queries. Columns must be static SQL fragments. */
export function holdsRoleSql(id: Prisma.Sql, primary: Prisma.Sql, role: AcademyRole): Prisma.Sql {
  return Prisma.sql`(${primary} = ${role}::"AcademyRole" OR EXISTS (
    SELECT 1 FROM academy_membership_roles held_role
    WHERE held_role.membership_id = ${id} AND held_role.role = ${role}::"AcademyRole"
  ))`;
}
