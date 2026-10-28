import { Prisma, type Academy, type AcademyMembership, type User } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";

export type AcademyPermissionRead = {
  id: string;
  status: User["status"];
  academy: Pick<Academy, "status" | "kind"> | null;
  membership: (Pick<AcademyMembership, "role" | "status"> & {
    academy: Pick<Academy, "status">;
    extraRoles: Array<Pick<AcademyMembership, "role">>;
  }) | null;
};

/** Fresh facts for the existing permission policy, in one database round trip.
 * No authority is cached. Scope both membership and extra roles before JSON
 * projection so another academy's role cannot contribute to this decision.
 */
export async function readAcademyPermission(
  prisma: Pick<PrismaService, "$queryRaw">,
  authUserId: string,
  academyId: string,
): Promise<AcademyPermissionRead | null> {
  const rows = await prisma.$queryRaw<AcademyPermissionRead[]>(Prisma.sql`
    SELECT u.id, u.status,
      CASE WHEN a.id IS NULL THEN NULL ELSE
        jsonb_build_object('status', a.status, 'kind', a.kind) END AS academy,
      CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object(
        'role', m.role, 'status', m.status,
        'academy', jsonb_build_object('status', a.status),
        'extraRoles', coalesce((SELECT jsonb_agg(jsonb_build_object('role', r.role))
          FROM academy_membership_roles r WHERE r.membership_id = m.id), '[]'::jsonb)
      ) END AS membership
    FROM users u
    LEFT JOIN academies a ON a.id = ${academyId}::uuid
    LEFT JOIN academy_memberships m ON m.academy_id = a.id AND m.user_id = u.id
    WHERE u.auth_user_id = ${authUserId}::uuid
  `);
  return rows[0] ?? null;
}
