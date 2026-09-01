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

  /** Organizations, the tenant above the academy. */
  "platform.organizations.read",
  "platform.organizations.manage",

  /**
   * The cross-academy people directories.
   *
   * Identity only — who someone is, where they belong, what state their
   * account is in. It authorizes no learning data: a submission, a grade, a
   * point balance, and every field of `StudentAcademyProfile` stay behind a
   * support grant, because a directory that answers those has stopped being a
   * directory.
   */
  "platform.users.read",
  /** Setting `UserStatus` platform-wide. Apart from `read` for the reason
   * `lifecycle` is apart from `create`. */
  "platform.users.suspend",

  "platform.audit.read",
  /**
   * Reading any academy from the inside, without a support session.
   *
   * The console browses; a session is what allows a *change*. An operator
   * asked to look at a broken class should not have to write a justification
   * to look, and one who had to would learn to write "checking" — which costs
   * the reason field the meaning the whole grant design rests on.
   *
   * It is a wide permission and worth naming as such: an academy's rosters,
   * curriculum, and student work are all readable by anyone who holds it.
   * Every write still needs a grant, so what an operator *did* stays
   * attributable even though what they looked at is not.
   */
  "platform.academies.inspect",
  /**
   * Browsing every academy's courses, classes, and problems.
   *
   * A read, and only a read. Editing curriculum is academy work reached
   * through a support grant, so this permission never needs a `.manage`
   * sibling — if one ever appears, it is a sign the console has started
   * keeping a second implementation of content mutations.
   */
  "platform.content.read",
  "platform.features.manage",
  "platform.analytics.read",
  "platform.health.read",

  /**
   * Support access — the only authority on this axis that reaches inside an
   * academy, and the reason the three are separate.
   *
   * `read` is held by anyone who may see that support happened. `grant` opens
   * one. `revoke` ends somebody's — possibly somebody else's, which is why a
   * support lead may need it without being able to open their own.
   */
  "platform.support.read",
  "platform.support.grant",
  "platform.support.revoke",

  /** Authoring in the library academy. */
  "platform.library.manage",
  /** Pushing a library course into a customer's academy. Apart from `manage`
   * because writing curriculum and putting it in somebody else's hands are
   * different acts, and the second is the one an academy sees. */
  "platform.library.distribute",

  "platform.operators.manage",
] as const;
export const platformPermissionSchema = z.enum(platformPermissions);
export type PlatformPermission = z.infer<typeof platformPermissionSchema>;

export const platformRolePermissions = {
  USER: [],
  // Every permission, because `ADMIN` is the only platform role today. The
  // list stays fine-grained past the point this role needs the distinction so
  // a narrower operator — read-only support, billing — is a new entry here
  // rather than a new branch inside a service.
  ADMIN: [...platformPermissions],
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

/* ------------------------------------------------------- support grants */

/**
 * The roles a platform support grant may assume inside an academy.
 *
 * Fewer than `academyRoles`, and deliberately. `MANAGER` is a true superset of
 * `TEAM_LEAD` (see `academyRolePermissions`), so an operator who needs to fix
 * a customer's curriculum takes `MANAGER` and a separate Team Lead option
 * would only be a narrower way to reach the same pages. `STUDENT` is absent
 * because §3.5 of the platform admin console design forbids a grant that can
 * submit work, and a student role whose one distinguishing permission is
 * stripped is not a student — it is a confusing name for a read.
 */
export const supportAssumedRoles = ["MANAGER", "TEACHER"] as const;
export const supportAssumedRoleSchema = z.enum(supportAssumedRoles);
export type SupportAssumedRole = (typeof supportAssumedRoles)[number];

/**
 * The permissions a read-only support grant may hold, whatever role it assumes.
 *
 * A named set rather than a test on how the permission is spelled.
 * `curriculum.review` and `academy.applications.review` both end in the same
 * word and only one of them is a read — the first opens a course detail page,
 * the second seats a member — so a suffix rule would have handed an operator
 * the power to approve applications the day it was written.
 *
 * Ordered as `academyPermissions` is, so a reader can diff the two lists.
 */
export const readOnlyAcademyPermissions = [
  "academy.read",
  "academy.members.read",
  "academy.analytics.read",
  "curriculum.read",
  "curriculum.review",
  "submissions.assigned.review",
] as const satisfies readonly AcademyPermission[];

/**
 * What a support grant actually authorizes.
 *
 * The one place §3.5's exclusions are enforced, so they hold for every assumed
 * role and every caller rather than depending on a reviewer noticing:
 *
 * - `submissions.own.create` is removed unconditionally. A support operator
 *   must never be able to submit work that lands in a real student's record.
 * - `classes.assigned.manage` — which the monitoring surfaces read — survives
 *   only when the grant explicitly allows monitoring. Watching a named child's
 *   editor in real time is a different consent question from reading a stored
 *   submission, and it must not be reachable because somebody picked
 *   `TEACHER` from a dropdown.
 *
 * Pure, and beside `roleHasPermission` rather than in the access service, so
 * the whole matrix is unit-testable without a database.
 */
export function grantEffectivePermissions(grant: {
  assumedRole: SupportAssumedRole;
  readOnly: boolean;
  allowMonitoring: boolean;
}): readonly AcademyPermission[] {
  const base = academyRolePermissions[
    grant.assumedRole
  ] as readonly AcademyPermission[];

  const readable: readonly AcademyPermission[] = grant.readOnly
    ? base.filter((permission) =>
        (readOnlyAcademyPermissions as readonly AcademyPermission[]).includes(
          permission,
        ),
      )
    : base;

  return readable.filter((permission) => {
    if (permission === "submissions.own.create") return false;
    if (permission === "classes.assigned.manage") return grant.allowMonitoring;
    return true;
  });
}

/** Whether a live grant of this shape authorizes one permission. */
export function grantHasPermission(
  grant: {
    assumedRole: SupportAssumedRole;
    readOnly: boolean;
    allowMonitoring: boolean;
  },
  permission: AcademyPermission,
): boolean {
  return grantEffectivePermissions(grant).includes(permission);
}
