import { z } from "zod";

export const platformRoles = ["USER", "ADMIN"] as const;
export const platformRoleSchema = z.enum(platformRoles);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const academyRoles = [
  "STUDENT",
  "TEACHER",
  "TEAM_LEAD",
  "MANAGER",
] as const;
export const academyRoleSchema = z.enum(academyRoles);
export type AcademyRole = z.infer<typeof academyRoleSchema>;

export const academyPermissions = [
  "academy.read",
  "academy.settings.manage",
  "academy.members.read",
  "academy.members.manage",
  "academy.analytics.read",
  "curriculum.read",
  "curriculum.review",
  "curriculum.draft",
  "curriculum.manage",
  "curriculum.publish",
  "exercises.manage",
  "content.import",
  "ai-feedback-rules.manage",
  /** Create, edit, archive, restore a class and assign courses to it. */
  "classes.manage",
  /** Enroll and remove students. Kept apart because enrollment changes a
   * student's learning access and belongs with membership administration. */
  "class-enrollments.manage",
  /** Reserved for the later teacher-assignment and monitoring design. It does
   * not authorize class CRUD. */
  "classes.assigned.manage",
  "submissions.own.create",
  "submissions.assigned.review",
] as const;
export const academyPermissionSchema = z.enum(academyPermissions);
export type AcademyPermission = z.infer<typeof academyPermissionSchema>;

export const academyRolePermissions = {
  STUDENT: ["academy.read", "curriculum.read", "submissions.own.create"],
  TEACHER: [
    "academy.read",
    "academy.members.read",
    "curriculum.read",
    "curriculum.draft",
    "classes.assigned.manage",
    "submissions.assigned.review",
  ],
  TEAM_LEAD: [
    "academy.read",
    "academy.members.read",
    "academy.analytics.read",
    "curriculum.read",
    "curriculum.review",
    "curriculum.draft",
    "curriculum.manage",
    "curriculum.publish",
    "exercises.manage",
    "content.import",
    "ai-feedback-rules.manage",
    "classes.manage",
    "classes.assigned.manage",
    "submissions.assigned.review",
  ],
  MANAGER: [
    "academy.read",
    "academy.settings.manage",
    "academy.members.read",
    "academy.members.manage",
    "academy.analytics.read",
    "curriculum.read",
    "curriculum.review",
    "classes.manage",
    "class-enrollments.manage",
  ],
} as const satisfies Record<AcademyRole, readonly AcademyPermission[]>;

export function roleHasPermission(
  role: AcademyRole,
  permission: AcademyPermission,
): boolean {
  return (academyRolePermissions[role] as readonly AcademyPermission[]).includes(
    permission,
  );
}
