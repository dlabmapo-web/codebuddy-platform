import { z } from "zod";

export const platformRoles = ["USER", "ADMIN"] as const;
export const platformRoleSchema = z.enum(platformRoles);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

/**
 * What a platform operator may do, as named permissions.
 *
 * A separate axis from `academyPermissions`, never merged into it. The two
 * answer different questions — one is "what may this person do to an academy",
 * the other "what may they do inside one" — and a later read-only support role
 * has to be able to hold one without implying the other, which is only
 * expressible while they are separate sets.
 *
 * The list grows with each platform surface. It holds only what is enforced.
 */
export const platformPermissions = [
  "platform.academies.read",
  "platform.academies.create",
  /**
   * Correcting an academy's name and slug. Apart from `lifecycle` for the
   * reason `lifecycle` is apart from `create`: renaming an academy and
   * switching one off are different authorities, and a role added later
   * should be able to hold either without the other.
   */
  "platform.academies.update",
  /**
   * Suspend, restore, archive. Apart from `create` so a future support or
   * billing operator can onboard an academy without being able to switch one
   * off, and so the audit trail separates the two acts by permission and not
   * only by action name.
   */
  "platform.academies.lifecycle",
] as const;
export const platformPermissionSchema = z.enum(platformPermissions);
export type PlatformPermission = z.infer<typeof platformPermissionSchema>;

export const platformRolePermissions = {
  USER: [],
  ADMIN: [
    "platform.academies.read",
    "platform.academies.create",
    "platform.academies.update",
    "platform.academies.lifecycle",
  ],
} as const satisfies Record<PlatformRole, readonly PlatformPermission[]>;

/**
 * Never `role === "ADMIN"` at a call site, for the reason §5.3 of the
 * authorization design gives for academy roles: authority is a named
 * capability, so adding a platform role later is a change to this map rather
 * than a hunt through every guard.
 */
export function platformRoleHasPermission(
  role: PlatformRole,
  permission: PlatformPermission,
): boolean {
  return (
    platformRolePermissions[role] as readonly PlatformPermission[]
  ).includes(permission);
}

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
  /**
   * Read and review pending academy applications. This does not authorize
   * changing an existing member's role, suspending one, or sending an
   * invitation; those remain separate membership-management capabilities.
   */
  "academy.applications.review",
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
  /** Assign, replace, and remove the one teacher responsible for a class. */
  "class-teachers.manage",
  /**
   * When a class meets — the recurring windows attendance points are paid
   * inside. `MANAGER` only, deliberately: §5.1 of the student points design
   * puts the point economy's settings with the role that owns the academy's
   * settings, and a schedule edit silently changes who gets paid for turning
   * up. A team lead who runs the curriculum has no reason to move it.
   */
  "class-schedule.manage",
  /** Reserved for the later teacher monitoring design: what an assigned
   * teacher may do with their own classes. It authorizes neither class CRUD
   * nor assignment changes, so holding it never lets a teacher assign one. */
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
    /*
     * A teacher reads the curriculum they deliver, exercises included.
     * `curriculum.read` alone opens no detail page: the course tree and the
     * exercise both sit behind `curriculum.review`. Without it a teacher can
     * see a course listed and open none of it.
     *
     * This grants the authoring view of an exercise, so a teacher sees its
     * hidden test inputs and expected outputs. That is deliberate and matches
     * what they already hold: `submissions.assigned.review` shows them the
     * graded result of those same cases for every student they teach.
     * Authoring stays separate — writing needs `curriculum.manage`.
     */
    "curriculum.review",
    "curriculum.draft",
    "classes.assigned.manage",
    "submissions.assigned.review",
  ],
  TEAM_LEAD: [
    "academy.read",
    "academy.members.read",
    "academy.applications.review",
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
    "class-teachers.manage",
    "classes.assigned.manage",
    "submissions.assigned.review",
  ],
  MANAGER: [
    "academy.read",
    "academy.settings.manage",
    "academy.members.read",
    "academy.members.manage",
    "academy.applications.review",
    "academy.analytics.read",
    "curriculum.read",
    "curriculum.review",
    "classes.manage",
    "class-enrollments.manage",
    "class-teachers.manage",
    "class-schedule.manage",
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

/**
 * The roles this actor may grant when approving an application.
 *
 * A Manager seats anybody. A Team Lead seats the two roles below them and
 * neither their own nor their supervisor's. Every role without application
 * review permission gets an empty list, so an omitted permission check still
 * fails in the safe direction.
 *
 * Ordered as `academyRoles` is, so shared options stay in the same positions.
 */
export function approvableRoles(
  actor: AcademyRole,
): readonly AcademyRole[] {
  if (!roleHasPermission(actor, "academy.applications.review")) return [];
  return actor === "MANAGER"
    ? academyRoles
    : (["STUDENT", "TEACHER"] as const);
}

export function canApproveAs(
  actor: AcademyRole,
  target: AcademyRole,
): boolean {
  return approvableRoles(actor).includes(target);
}
