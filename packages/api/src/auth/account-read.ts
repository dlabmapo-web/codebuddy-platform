import type { User, AcademyMembership, AcademyJoinRequest, AcademyFeatureFlag } from "../generated/prisma/client.js";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";

/** Only the fields used to resolve navigation and display account identity.
 * No credentials, contact details, student profiles or course graphs.
 */
export type AccountRead = {
  id: string; authUserId: string | null; email: string | null;
  emailIsPlaceholder: boolean; username: string | null; displayName: string | null;
  avatarUrl: string | null; platformRole: User["platformRole"];
  status: User["status"];
  avatarAsset: { id: string; bucket: string; objectKey: string } | null;
  memberships: Array<{
    academyId: string;
    role: AcademyMembership["role"];
    status: AcademyMembership["status"];
    extraRoles: Array<{ role: AcademyMembership["role"] }>;
    academy: { id: string; name: string; slug: string; featureFlags: Array<{ feature: AcademyFeatureFlag["feature"] }> };
    memberProfile: { avatarAssetId: string | null; avatarAsset: AccountRead["avatarAsset"] } | null;
  }>;
  joinRequests: Array<{
    id: string; academy: { id: string; name: string; slug: string };
    status: AcademyJoinRequest["status"]; approvedRole: AcademyJoinRequest["approvedRole"]; reviewReason: string | null;
    createdAt: Date; reviewedAt: Date | null;
  }>;
};

/** A fresh account snapshot in one round trip. This does not cache authority.
 * PostgreSQL builds each relation independently, avoiding membership/request
 * cross products and preserving the previous relation ordering and filters.
 */
export async function readAccount(prisma: Pick<PrismaService, "$queryRaw">, authUserId: string): Promise<AccountRead | null> {
  type Row = Omit<AccountRead, "joinRequests"> & { joinRequests: Array<
    Omit<AccountRead["joinRequests"][number], "createdAt" | "reviewedAt"> & {
      createdAt: string; reviewedAt: string | null;
    }
  > };
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u.id, u.auth_user_id AS "authUserId", u.email,
      u.email_is_placeholder AS "emailIsPlaceholder", u.username,
      u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
      u.platform_role AS "platformRole", u.status,
      (SELECT jsonb_build_object('id', a.id, 'bucket', a.bucket, 'objectKey', a.object_key)
        FROM media_assets a WHERE a.id = u.avatar_asset_id) AS "avatarAsset",
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'academyId', m.academy_id, 'role', m.role, 'status', m.status,
        'extraRoles', coalesce((SELECT jsonb_agg(jsonb_build_object('role', r.role))
          FROM academy_membership_roles r WHERE r.membership_id = m.id), '[]'::jsonb),
        'academy', jsonb_build_object('id', academy.id, 'name', academy.name, 'slug', academy.slug,
          'featureFlags', coalesce((SELECT jsonb_agg(jsonb_build_object('feature', f.feature))
            FROM academy_feature_flags f WHERE f.academy_id = academy.id AND f.is_enabled), '[]'::jsonb)),
        'memberProfile', (SELECT jsonb_build_object('avatarAssetId', p.avatar_asset_id,
          'avatarAsset', (SELECT jsonb_build_object('id', a.id, 'bucket', a.bucket, 'objectKey', a.object_key)
            FROM media_assets a WHERE a.id = p.avatar_asset_id))
          FROM academy_member_profiles p WHERE p.membership_id = m.id)) ORDER BY m.created_at ASC)
        FROM academy_memberships m JOIN academies academy ON academy.id = m.academy_id
        WHERE m.user_id = u.id), '[]'::jsonb) AS memberships,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'academy', jsonb_build_object('id', academy.id, 'name', academy.name, 'slug', academy.slug),
        'status', r.status, 'approvedRole', r.approved_role, 'reviewReason', r.review_reason,
        'createdAt', r.created_at, 'reviewedAt', r.reviewed_at) ORDER BY r.created_at DESC)
        FROM academy_join_requests r JOIN academies academy ON academy.id = r.academy_id
        WHERE r.user_id = u.id), '[]'::jsonb) AS "joinRequests"
    FROM users u WHERE u.auth_user_id = ${authUserId}::uuid
  `);
  const row = rows[0];
  return row ? {
    ...row,
    joinRequests: row.joinRequests.map((r) => ({ ...r,
      createdAt: new Date(r.createdAt), reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : null,
    })),
  } : null;
}
