import { Prisma, type Academy, type AcademyMembership, type DlabCampus, type DlabIdentity, type DlabMembershipBinding, type User } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma.service.js';

export type DlabEligibilityRead = {
  identity: Pick<DlabIdentity, 'externalUserId' | 'userId' | 'userRole' | 'accountStatus' | 'externalCampusId' | 'externalCampusIds' | 'generation'> & {
    user: Pick<User, 'status' | 'platformRole'>;
    bindings: Array<Pick<DlabMembershipBinding, 'externalCampusId' | 'membershipId' | 'sourceAccessStatus' | 'localSuspendedAt'> & {
      membership: Pick<AcademyMembership, 'academyId' | 'userId' | 'status' | 'role'> & {
        extraRoles: Array<Pick<AcademyMembership, 'role'>>;
        academy: Pick<Academy, 'id' | 'slug'>;
      };
    }>;
  };
  /** Superset of the effective scope; the policy narrows it with dlabCampusScope. */
  candidateCampuses: Array<Pick<DlabCampus, 'externalCampusId' | 'academyId'>>;
};

/** Every fact the DLAB policy decides on, in one statement and so one snapshot.
 * No authority is cached. The campus predicates mirror desiredDlabCampuses;
 * keep the two in step (the parity integration test compares them).
 */
export async function readDlabEligibility(db: Pick<PrismaService, '$queryRaw'>, authUserId: string, campusMode: boolean): Promise<DlabEligibilityRead | null> {
  type Row = Omit<DlabEligibilityRead['identity'], 'bindings'> & {
    bindings: Array<Omit<DlabEligibilityRead['identity']['bindings'][number], 'localSuspendedAt'> & { localSuspendedAt: string | null }>;
    candidateCampuses: DlabEligibilityRead['candidateCampuses'];
  };
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT i.external_user_id AS "externalUserId", i.user_id AS "userId",
      i.user_role AS "userRole", i.account_status AS "accountStatus",
      -- Prisma reads a NULL list as empty, and an empty scope grants nothing;
      -- passing NULL through would widen it to the primary campus.
      i.external_campus_id AS "externalCampusId", coalesce(i.external_campus_ids, '{}'::text[]) AS "externalCampusIds", i.generation,
      jsonb_build_object('status', u.status, 'platformRole', u.platform_role) AS "user",
      coalesce((SELECT jsonb_agg(jsonb_build_object(
          'externalCampusId', b.external_campus_id, 'membershipId', b.membership_id,
          'sourceAccessStatus', b.source_access_status, 'localSuspendedAt', b.local_suspended_at,
          'membership', jsonb_build_object('academyId', m.academy_id, 'userId', m.user_id, 'status', m.status, 'role', m.role,
            'extraRoles', coalesce((SELECT jsonb_agg(jsonb_build_object('role', r.role))
              FROM academy_membership_roles r WHERE r.membership_id = m.id), '[]'::jsonb),
            'academy', jsonb_build_object('id', a.id, 'slug', a.slug))) ORDER BY b.external_campus_id)
        FROM dlab_membership_bindings b
        JOIN academy_memberships m ON m.id = b.membership_id
        JOIN academies a ON a.id = m.academy_id
        WHERE b.external_user_id = i.external_user_id), '[]'::jsonb) AS bindings,
      coalesce((SELECT jsonb_agg(jsonb_build_object('externalCampusId', c.external_campus_id, 'academyId', c.academy_id) ORDER BY c.external_campus_id)
        FROM dlab_campuses c JOIN academies ca ON ca.id = c.academy_id
        WHERE (c.external_campus_id = i.external_campus_id OR c.external_campus_id = ANY(i.external_campus_ids))
          AND c.status = 'active' AND ca.kind = 'ACADEMY' AND ca.status = 'ACTIVE'
          AND (NOT ${campusMode}::boolean OR c.sso_enabled)), '[]'::jsonb) AS "candidateCampuses"
    FROM dlab_identities i JOIN users u ON u.id = i.user_id
    WHERE u.auth_user_id = ${authUserId}::uuid
  `);
  const row = rows[0];
  if (!row) return null;
  const { candidateCampuses, ...identity } = row;
  return {
    identity: { ...identity, bindings: identity.bindings.map(b => ({ ...b, localSuspendedAt: b.localSuspendedAt ? new Date(b.localSuspendedAt) : null })) },
    candidateCampuses,
  };
}
