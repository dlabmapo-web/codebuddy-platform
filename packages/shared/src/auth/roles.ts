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
   * Issuing a student's password, and reading back one already issued.
   *
   * Separate from `academy.members.manage`, which covers role, suspension, and
   * profile. Changing how a child signs in is a different authority from
   * changing what they may do, and only one of the two reads a secret.
   */
  "academy.members.credentials.manage",
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

/**
 * Everything the academy's curriculum owner may do.
 *
 * Named once because two roles hold it. An academy with no Team Lead is the
 * ordinary case rather than an incomplete setup — in a small campus the
 * Manager runs the curriculum as well as the academy — and before this they
 * could open a course and change nothing in it.
 *
 * `MANAGER` spreads this array rather than restating it, so a permission added
 * here reaches both roles in one edit. A future exception must be written as an
 * exception, visibly, instead of appearing as a line somebody forgot to copy.
 */
const teamLeadPermissions = [
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
  /*
   * Inherited deliberately, and inert for both roles. The teaching surfaces
   * that read these also demand an exact active `TEACHER` — `roleCanMonitor`,
   * `requireAssignedTeacherActor` — so holding them grants a Manager no more
   * than it grants a Team Lead today. They stay in the shared set because the
   * property worth keeping is that Manager is a true superset: a permission
   * that is inert now must not become the one line that silently is not.
   */
  "classes.assigned.manage",
  "submissions.assigned.review",
] as const satisfies readonly AcademyPermission[];

/**
 * Administration of the academy itself, which a Team Lead does not get.
 *
 * The boundary is ownership rather than seniority: who may change what the
 * academy *is* — its settings, who belongs to it, who is enrolled, and when
 * classes meet — as opposed to what it teaches.
 */
const managerOnlyPermissions = [
  "academy.settings.manage",
  "academy.members.manage",
  /*
   * Manager-only, and deliberately not in `teamLeadPermissions`. A Team Lead
   * runs what the academy teaches; how a child signs in is not curriculum.
   */
  "academy.members.credentials.manage",
  "class-enrollments.manage",
  "class-schedule.manage",
] as const satisfies readonly AcademyPermission[];

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
  TEAM_LEAD: teamLeadPermissions,
  // A superset, not a hierarchy. The actor stays a `MANAGER`: they keep the
  // control tower, and the surfaces that ask for an exact role — the Team Lead
  // curriculum overview, every teaching page — still refuse them.
  MANAGER: [...teamLeadPermissions, ...managerOnlyPermissions],
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

/**
 * How much authority each academy role carries, for the one question that
 * needs an order: which of several held roles is the primary one.
 *
 * Written out rather than taken from the position of a member in
 * `academyRoles`, for the reason §5.3 of the authorization design gives — a
 * reordering of that array must never silently promote somebody. Permissions
 * are still never decided by comparing these numbers; that is what
 * `rolesHavePermission` is for.
 */
const academyRoleRank: Record<AcademyRole, number> = {
  STUDENT: 0,
  TEACHER: 1,
  TEAM_LEAD: 2,
  MANAGER: 3,
};

/**
 * Every role a member holds in one academy: the primary one stored on the
 * membership, plus any granted beside it.
 *
 * Deduplicated and ordered by `academyRoles`, so the switcher lists them the
 * same way on every screen and two equal sets are equal arrays.
 */
export function effectiveAcademyRoles(
  primary: AcademyRole,
  extras: readonly AcademyRole[] = [],
): readonly AcademyRole[] {
  const held = new Set<AcademyRole>([primary, ...extras]);
  return academyRoles.filter((role) => held.has(role));
}

/**
 * Whether a member holding this set may do something.
 *
 * The union, never the primary role alone. A Manager who also teaches holds
 * both sets at once; asking only about the highest would take away the
 * teaching surfaces that are the whole point of granting the second role.
 */
export function rolesHavePermission(
  roles: readonly AcademyRole[],
  permission: AcademyPermission,
): boolean {
  return roles.some((role) => roleHasPermission(role, permission));
}

/** The highest role in a set — what `AcademyMembership.role` must hold. */
export function primaryAcademyRole(
  roles: readonly AcademyRole[],
): AcademyRole | null {
  return roles.reduce<AcademyRole | null>(
    (highest, role) =>
      highest === null || academyRoleRank[role] > academyRoleRank[highest]
        ? role
        : highest,
    null,
  );
}

/**
 * Whether these roles may be held by one membership.
 *
 * `STUDENT` combines with nothing. Not squeamishness about hierarchy: a
 * student's rows are *about* them — their submissions, their points, their
 * class standing, the feedback their teacher wrote them — while every staff
 * role reads *across* students. A membership that was both would make "whose
 * work is this page showing" a question with two answers, and every
 * monitoring, points, and analytics query would need a new opinion about which
 * one it meant. A person who is genuinely both keeps two academy accounts,
 * which is rare and honest.
 */
export function canCombineAcademyRoles(
  roles: readonly AcademyRole[],
): boolean {
  if (roles.length === 0) return false;
  return !roles.includes("STUDENT") || roles.length === 1;
}

/**
 * Whether a member holding this set is a student.
 *
 * Exactly `{ STUDENT }`, by the rule above. Written as its own predicate
 * because the credential endpoints refuse any target that is not one, and
 * `roles.includes("STUDENT")` would be the wrong question to ask there.
 */
export function isStudentRoleSet(roles: readonly AcademyRole[]): boolean {
  return roles.length === 1 && roles[0] === "STUDENT";
}
