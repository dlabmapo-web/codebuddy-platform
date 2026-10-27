import type { ClassStatus } from "@cove/shared";
import { Prisma } from "../generated/prisma/client.js";

/** List-only projection. No student identities, emails, schedules or content
 * bodies are read. Nested JSON keeps staff/assignment reads in one round trip.
 * SQL values are bound, including tenant and optional status. Detail reads use
 * their separate Prisma projection and are deliberately unaffected.
 */
export function classListQuery(academyId: string, status?: ClassStatus) {
  return Prisma.sql`
    WITH scoped_classes AS (
      SELECT * FROM classes WHERE academy_id = ${academyId}::uuid
        ${status ? Prisma.sql`AND status::text = ${status}` : Prisma.empty}
    ), teacher_ids AS (
      SELECT teacher_membership_id AS id FROM scoped_classes
      UNION
      SELECT a.membership_id FROM class_assistant_teachers a
      JOIN scoped_classes c ON c.id = a.class_id
    ), teachers AS (
      SELECT am.id, u.display_name,
        jsonb_build_object('id', am.id, 'role', am.role, 'status', am.status,
          'extraRoles', coalesce((SELECT jsonb_agg(jsonb_build_object('role', r.role))
            FROM academy_membership_roles r WHERE r.membership_id = am.id), '[]'::jsonb),
          'user', jsonb_build_object('id', u.id, 'displayName', u.display_name, 'status', u.status)) AS summary
      FROM academy_memberships am JOIN users u ON u.id = am.user_id
      WHERE am.id IN (SELECT id FROM teacher_ids)
    )
    SELECT c.id, c.academy_id AS "academyId", c.name, c.description, c.status,
      c.created_by_user_id AS "createdByUserId", c.teacher_membership_id AS "teacherMembershipId",
      c.created_at AS "createdAt", c.updated_at AS "updatedAt", c.archived_at AS "archivedAt",
      (SELECT t.summary FROM teachers t WHERE t.id = c.teacher_membership_id) AS "assignedTeacher",
      coalesce((SELECT jsonb_agg(jsonb_build_object('teacher', t.summary)
          ORDER BY t.display_name ASC, t.id ASC)
        FROM class_assistant_teachers a JOIN teachers t ON t.id = a.membership_id
        WHERE a.class_id = c.id), '[]'::jsonb) AS "assistantTeachers",
      coalesce((SELECT jsonb_agg(jsonb_build_object('course',
          jsonb_build_object('id', course.id, 'title', course.title, 'isVisible', course.is_visible))
          ORDER BY course.title ASC, course.id ASC)
        FROM class_courses a JOIN courses course ON course.id = a.course_id
        WHERE a.class_id = c.id), '[]'::jsonb) AS "courseAssignments",
      jsonb_build_object('enrollments', (SELECT count(*)::integer
        FROM class_enrollments e WHERE e.class_id = c.id)) AS "_count"
    FROM scoped_classes c ORDER BY c.updated_at DESC, c.id ASC
  `;
}
