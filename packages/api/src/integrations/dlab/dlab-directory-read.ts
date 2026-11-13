import { Prisma } from "../../generated/prisma/client.js";
import type {
  AcademyRole,
  MembershipStatus,
  PlatformRole,
  UserStatus,
} from "../../generated/prisma/enums.js";

export type DirectoryCampus = {
  externalCampusId: string;
  academyId: string | null;
  status: string;
  ssoEnabled: boolean;
  academyStatus: string | null;
  academyKind: string | null;
  localRestriction: string | null;
  accessRevision: number;
};
export type DirectoryMember = {
  id: string;
  academyId: string;
  role: AcademyRole;
  status: MembershipStatus;
  extraRoles: AcademyRole[];
  schoolGrade: string | null;
  hasStudentProfile: boolean;
  binding: {
    externalUserId: string;
    externalCampusId: string;
    localSuspendedAt: string | null;
    sourceAccessStatus: string;
    appliedRevision: number;
  } | null;
};
export type DirectorySnapshot = {
  externalUserId: string;
  userId: string | null;
  reservedUserId: string;
  reservedUserConflict: boolean;
  externalCampusId: string;
  externalCampusIds: string[];
  userRole: string;
  accountStatus: string;
  name: string;
  grade: string | null;
  revision: number;
  generation: number;
  user: {
    id: string;
    authUserId: string | null;
    status: UserStatus;
    platformRole: PlatformRole;
    displayName: string | null;
  } | null;
  campuses: DirectoryCampus[];
  memberships: DirectoryMember[];
};

/** One statement for every scoped campus, membership, role and profile fact. */
export async function readDlabDirectory(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  ids: readonly string[],
): Promise<DirectorySnapshot[]> {
  if (!ids.length) return [];
  return tx.$queryRaw<DirectorySnapshot[]>(Prisma.sql`
    SELECT i.external_user_id AS "externalUserId",i.user_id AS "userId",i.reserved_user_id AS "reservedUserId",
      (i.user_id IS NULL AND EXISTS (SELECT 1 FROM users reserved WHERE reserved.id=i.reserved_user_id)) AS "reservedUserConflict",
      i.external_campus_id AS "externalCampusId",i.external_campus_ids AS "externalCampusIds",
      i.user_role AS "userRole",i.account_status AS "accountStatus",i.name,i.grade,i.revision,i.generation,
      CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('id',u.id,'authUserId',u.auth_user_id,
        'status',u.status,'platformRole',u.platform_role,'displayName',u.display_name) END AS "user",
      coalesce((SELECT jsonb_agg(jsonb_build_object('externalCampusId',c.external_campus_id,'academyId',c.academy_id,
        'status',c.status,'ssoEnabled',c.sso_enabled,'academyStatus',a.status,'academyKind',a.kind,'localRestriction',c.local_academy_restriction,'accessRevision',c.access_revision) ORDER BY c.external_campus_id)
        FROM dlab_campuses c LEFT JOIN academies a ON a.id=c.academy_id
        WHERE c.external_campus_id=ANY(i.external_campus_ids) OR c.external_campus_id=i.external_campus_id),'[]'::jsonb) AS campuses,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'academyId',m.academy_id,'role',m.role,'status',m.status,
        'schoolGrade',p.school_grade,'hasStudentProfile',p.membership_id IS NOT NULL,
        'extraRoles',coalesce((SELECT jsonb_agg(r.role ORDER BY r.role) FROM academy_membership_roles r WHERE r.membership_id=m.id),'[]'::jsonb),
        'binding',CASE WHEN b.membership_id IS NULL THEN NULL ELSE jsonb_build_object('externalUserId',b.external_user_id,
          'externalCampusId',b.external_campus_id,'localSuspendedAt',b.local_suspended_at,
          'sourceAccessStatus',b.source_access_status,'appliedRevision',b.applied_revision) END) ORDER BY m.id)
        FROM academy_memberships m LEFT JOIN dlab_membership_bindings b ON b.membership_id=m.id
        LEFT JOIN student_academy_profiles p ON p.membership_id=m.id WHERE m.user_id=i.user_id),'[]'::jsonb) AS memberships
    FROM dlab_identities i LEFT JOIN users u ON u.id=i.user_id
    WHERE i.external_user_id IN (${Prisma.join(ids)}) ORDER BY i.external_user_id
  `);
}
