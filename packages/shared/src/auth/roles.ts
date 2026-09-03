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
  /**
   * Destroying an academy and everything it owns.
   *
   * Apart from `lifecycle`, which only ever moves an academy between states it
   * can move back from. This one is the only irreversible act on the platform,
   * so it is the only permission whose absence is the whole safeguard for an
   * operator who should be able to suspend and archive but never purge.
   */
  "platform.academies.delete",

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
  /**
   * A person's participation, across the academies they belong to: their
   * classes, the courses in them, and their totals.
   *
   * Apart from `platform.users.read` because it is a genuine widening and
   * should be refusable on its own. It authorizes structure and totals only —
   * no `StudentAcademyProfile` field, no submitted code, no feedback text.
   * Those stay behind a support grant. §3.4 of the console people operations
   * design.
   */
  "platform.users.participation.read",
  /** Changing an academy membership's role from the console. §3.6 of the
   * console people operations design. */
  "platform.users.role",
  /** Setting `UserStatus.DELETED`. Apart from `suspend` because suspension is
   * routine and this is not. §3.7 of the console people operations design. */
  "platform.users.delete",

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
  /**
   * Every academy's pending applications, in one queue.
   *
   * A read, and only a read: approving one calls the academy's own review
   * procedure, which already answers yes to an operator through the platform
   * branch of `AcademyAccessService`. This permission exists for the reason
   * `platform.content.read` does — the console's question is "across all of
   * them", and no academy-scoped endpoint can answer it.
   *
   * It carries an applicant's name, email and the note they wrote, which is
   * identity rather than learning data. It authorizes no submission, no grade
   * and no profile field; those stay behind a support grant.
   */
  "platform.applications.read",

  /**
   * Every academy's invitations, in one queue, with the delivery evidence
   * beside them.
   *
   * A read, and only a read: sending, revoking and resending call the academy's
   * own procedures, which already answer yes to an operator through the
   * platform branch of `AcademyAccessService`. This permission exists for the
   * reason `platform.applications.read` does — the console's question is
   * "across all of them", and no academy-scoped endpoint can answer it.
   *
   * It carries an invited address and a role, which is identity rather than
   * learning data, and never a token: only the hash is stored, and the one
   * moment a token is readable is the response that minted it.
   */
  "platform.invitations.read",
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

  /**
   * Reading the library: its courses, and which academies adopted them.
   *
   * Apart from `manage` so a support or billing operator can see which course
   * a branch is asking about without being able to rewrite the master
   * curriculum every academy on the platform teaches from.
   */
  "platform.library.read",
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

/* ------------------------------------------------- the content library */

/**
 * What platform authority in a `LIBRARY` academy resolves to.
 *
 * A library academy has no members, so `AcademyAccessService` cannot answer
 * "what may this person do here" from a membership. It answers from the
 * platform axis instead, and these two lists are the translation.
 *
 * Both are deliberately narrower than `teamLeadPermissions`: a library holds
 * courses and nothing else, so every class, member, application and analytics
 * permission is absent. `content.import` is present because authoring a
 * hundred problems by hand is the thing the workbook exists to avoid, and head
 * office has more of them to write than anyone.
 */
const libraryAuthorPermissions = [
  "academy.read",
  "curriculum.read",
  "curriculum.review",
  "curriculum.draft",
  "curriculum.manage",
  "curriculum.publish",
  "exercises.manage",
  "content.import",
] as const satisfies readonly AcademyPermission[];

const libraryReaderPermissions = [
  "academy.read",
  "curriculum.read",
  "curriculum.review",
] as const satisfies readonly AcademyPermission[];

/**
 * The academy permissions a platform role holds inside a library academy.
 *
 * Returns an empty list for a role holding neither library permission, so an
 * omitted check still fails in the safe direction.
 */
export function libraryAcademyPermissions(
  role: PlatformRole,
): readonly AcademyPermission[] {
  if (platformRoleHasPermission(role, "platform.library.manage")) {
    return libraryAuthorPermissions;
  }
  if (platformRoleHasPermission(role, "platform.library.read")) {
    return libraryReaderPermissions;
  }
  return [];
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

/**
 * The roles a platform operator may view an academy as.
 *
 * All three staff roles, because they see genuinely different products: the
 * Manager gets the control tower and the roster, the Team Lead the curriculum
 * overview, the Teacher their own classes and student work. An operator
 * answering a question about any of them has to be able to stand where they
 * stand — a screenshot of the Manager's page does not explain what a Teacher
 * cannot find.
 *
 * `STUDENT` is absent, and stays absent. A student's product is doing the
 * coursework, and the one thing platform access must never do is put work in a
 * real student's record.
 */
export const platformViewRoles = ["MANAGER", "TEAM_LEAD", "TEACHER"] as const;
export const platformViewRoleSchema = z.enum(platformViewRoles);
export type PlatformViewRole = (typeof platformViewRoles)[number];

export function isPlatformViewRole(
  value: string | undefined | null,
): value is PlatformViewRole {
  return (platformViewRoles as readonly string[]).includes(value ?? "");
}

/**
 * What an operator may do while viewing an academy as one of its roles.
 *
 * The role's own set, minus the one thing platform access may never do
 * whatever it is standing as: submit work as a student.
 *
 * `classes.assigned.manage` stays in, because the Teacher view is unusable
 * without it and live monitoring is not gated on it alone —
 * `MonitoringAccessService` requires a real academy membership, which an
 * operator does not have. That is a stronger guarantee than filtering here,
 * and it is the one that already existed.
 *
 * Wider than `readOnlyAcademyPermissions`, deliberately. Several manager
 * surfaces gate a *read* behind a write-named permission —
 * `PeopleDirectoryService.list` asks for `academy.members.manage` — so a
 * genuinely read-only view cannot open the roster at all, and an operator who
 * chose "Manager" got a manager's sidebar with most of it missing.
 */
export function platformViewPermissions(
  role: PlatformViewRole,
): readonly AcademyPermission[] {
  return (
    academyRolePermissions[role] as readonly AcademyPermission[]
  ).filter((permission) => permission !== "submissions.own.create");
}
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

