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
  /** Superset of the effective scope; the policy narrows it with dlabCampusScope
   * and applies the rollout mode's `ssoEnabled` requirement itself. */
  candidateCampuses: Array<Pick<DlabCampus, 'externalCampusId' | 'academyId' | 'ssoEnabled'>>;
};

/** The facts for the DLAB identity of the user row aliased `u`, as one JSON
 * value (NULL when DLAB does not govern the account). Embedded by every read
 * that decides access, so policy facts share that read's snapshot. The campus
 * predicates mirror desiredDlabCampuses; keep the two in step (the parity
 * integration test compares them).
 */
export const dlabEligibilityJson = Prisma.sql`(
  SELECT jsonb_build_object(
    'identity', jsonb_build_object(
      'externalUserId', i.external_user_id, 'userId', i.user_id,
      'userRole', i.user_role, 'accountStatus', i.account_status,
      -- Prisma reads a NULL list as empty, and an empty scope grants nothing;
      -- passing NULL through would widen it to the primary campus.
      'externalCampusId', i.external_campus_id, 'externalCampusIds', coalesce(to_jsonb(i.external_campus_ids), '[]'::jsonb),
      'generation', i.generation,
      'user', jsonb_build_object('status', u.status, 'platformRole', u.platform_role),
      'bindings', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'externalCampusId', b.external_campus_id, 'membershipId', b.membership_id,
          'sourceAccessStatus', b.source_access_status, 'localSuspendedAt', b.local_suspended_at,
          'membership', jsonb_build_object('academyId', m.academy_id, 'userId', m.user_id, 'status', m.status, 'role', m.role,
            'extraRoles', coalesce((SELECT jsonb_agg(jsonb_build_object('role', r.role))
              FROM academy_membership_roles r WHERE r.membership_id = m.id), '[]'::jsonb),
            'academy', jsonb_build_object('id', a.id, 'slug', a.slug))) ORDER BY b.external_campus_id)
        FROM dlab_membership_bindings b
        JOIN academy_memberships m ON m.id = b.membership_id
        JOIN academies a ON a.id = m.academy_id
        WHERE b.external_user_id = i.external_user_id), '[]'::jsonb)),
    'candidateCampuses', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'externalCampusId', c.external_campus_id, 'academyId', c.academy_id, 'ssoEnabled', c.sso_enabled) ORDER BY c.external_campus_id)
      FROM dlab_campuses c JOIN academies ca ON ca.id = c.academy_id
      WHERE (c.external_campus_id = i.external_campus_id OR c.external_campus_id = ANY(i.external_campus_ids))
        AND c.status = 'active' AND ca.kind = 'ACADEMY' AND ca.status = 'ACTIVE'), '[]'::jsonb))
  FROM dlab_identities i WHERE i.user_id = u.id
)`;

type EligibilityJson = Omit<DlabEligibilityRead, 'identity'> & {
  identity: Omit<DlabEligibilityRead['identity'], 'bindings'> & {
    bindings: Array<Omit<DlabEligibilityRead['identity']['bindings'][number], 'localSuspendedAt'> & { localSuspendedAt: string | null }>;
  };
};

/** Restores the types JSON cannot carry (timestamps). */
export function parseDlabEligibility(json: unknown): DlabEligibilityRead | null {
  if (!json) return null;
  const { identity, candidateCampuses } = json as EligibilityJson;
  return {
    identity: { ...identity, bindings: identity.bindings.map(b => ({ ...b, localSuspendedAt: b.localSuspendedAt ? new Date(b.localSuspendedAt) : null })) },
    candidateCampuses,
  };
}

/** Every fact the DLAB policy decides on, in one statement and so one snapshot.
 * No authority is cached. */
export async function readDlabEligibility(db: Pick<PrismaService, '$queryRaw'>, authUserId: string): Promise<DlabEligibilityRead | null> {
  const rows = await db.$queryRaw<Array<{ dlab: unknown }>>(Prisma.sql`
    SELECT ${dlabEligibilityJson} AS dlab FROM users u WHERE u.auth_user_id = ${authUserId}::uuid
  `);
  return parseDlabEligibility(rows[0]?.dlab);
}
