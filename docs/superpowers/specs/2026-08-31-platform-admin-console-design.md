# Platform Admin Console — Directories, Support Access, and the Content Library

Status: proposed
Date: 2026-08-31
Supersedes nothing. Extends the 2026-08-18 platform administration design.

Related:

- `docs/design/2026-08-18-cove-v2-platform-administration-design.md` — §1.2 defers
  every capability this document picks up.
- `docs/design/2026-07-22-cove-v2-authentication-authorization-design.md` — §5.4
  specifies the delegation shape §6 below implements, §6.1 marks the
  "Support-only" cells, §6.3 the emergency recovery rule.
- `docs/superpowers/specs/2026-08-18-manager-control-tower-and-scalable-people-operations-design.md`
  — the per-academy people directory this document's platform directory sits beside.

---

## 1. Purpose

Today a platform admin can create an academy, rename it, switch it off, and
resend its first manager's invitation. That is the whole of their authority.
Everything else an operator needs — finding a person who cannot sign in, seeing
why an invitation never arrived, fixing a customer's broken course, giving a new
academy a curriculum to teach — currently requires a SQL client, an SSH session,
or a bespoke migration command.

This document specifies the console that replaces those.

### 1.1 In scope

| # | Capability |
|---|---|
| 1 | Cross-academy directories of **users**, filtered by academy, role, and status |
| 2 | A platform-wide audit log viewer |
| 3 | Organizations, feature flags, delivery and queue health, cross-academy analytics |
| 4 | Time-limited, reasoned, revocable **support grants** that let an admin work inside one academy |
| 5 | A **platform content library** academies adopt curriculum from |
| 6 | The named `platform.*` permissions all of the above are enforced by |

### 1.2 Not in scope

- Plans, seat limits, and billing. The `Organization` surface below leaves room
  for them and implements none.
- Deleting an academy or a user. `ARCHIVED` and `DELETED` remain terminal states
  reached by transition, never by destruction. §9.2 of the deployment guide
  gives the reason and it still holds.
- Content moderation. Cove does not review what an academy publishes; see §3.8.
- Impersonating a *student* — signing in as one, or submitting work as one. §3.5.

### 1.3 What is deliberately unchanged

Everything the console does today keeps working, unmodified and in place:
`/admin` roll call, `/admin/academies`, `/admin/academies/new` with its
first-manager invitation, `/admin/academies/[slug]` with rename and lifecycle,
and `resendFirstManagerInvitation`. Every route below is additive. No existing
contract method changes shape, and no existing permission changes meaning.

---

## 2. Current state

Four facts from the code decide most of this design.

**2.1 Two authority axes that never touch.** `PlatformAccessService` reads
`User.platformRole` and no membership. `AcademyAccessService` reads
`AcademyMembership` and no platform role. A platform admin is therefore
structurally invisible inside every academy — not through a forgotten check, by
construction. `ManagerScopeService` and `LeadScopeService` both say so in their
doc comments.

**2.2 One chokepoint.** 38 call sites across 22 files funnel through
`AcademyAccessService.requirePermission`. Anything that widens academy access
has exactly one place to do it, and 38 places it would leak from if done wrong.

**2.3 The scope services re-assert an exact role.** `ManagerScopeService`
demands `actor.role === "MANAGER"` after the permission check, deliberately, so
a later widening of a permission cannot silently hand it the surface.
`LeadScopeService` does the same for `TEAM_LEAD`. A delegation that carries
permissions but no role would unlock roughly half the academy surface and 403 on
the rest.

**2.4 There is no way to give an academy a curriculum.** `Course.academyId` is
non-null with `onDelete: Restrict`. There is no clone, no template, no catalog
anywhere in `packages/api/src/content/` — the only "template" in the tree is the
Excel workbook version. The one time curriculum ever entered an academy it was
`migrate:mvp-curriculum`, a one-time CLI hardcoded to
`TARGET_ACADEMY_SLUG = "dlab-mapo"` requiring a plan fingerprint, a confirmed
backup, and a rollback path. Every academy `/admin/academies/new` creates today
starts empty.

---

## 3. Decisions

### 3.1 Platform authority stays a named-permission axis

Every new surface gets its own `platform.*` permission, added to
`platformPermissions` and granted to `ADMIN` in `platformRolePermissions`. No
call site anywhere may test `platformRole === "ADMIN"`. This is the rule
`roles.ts` already states; this document only adds entries to the list it
governs.

The permissions stay fine-grained past the point where `ADMIN` needs the
distinction, for the reason the existing four already do: a read-only support
operator or a billing operator added later must be expressible as a subset of
this list rather than as a new branch in a service.

### 3.2 Deep academy access is a grant, not a role check

Adding `|| platformRole === "ADMIN"` to `AcademyAccessService` is rejected. It
would open all 38 call sites permanently, with no stated reason, no expiry, no
revocation, and nothing a customer could be shown; and per §2.3 it would not
even work.

Instead: a `PlatformSupportGrant` row — one academy, one admin, a written
reason, an assumed role, a read-only flag, and an expiry. `AcademyAccessService`
gains a second source of authority and returns which one answered. This is the
delegation auth design §5.4 specified: named permissions, `startsAt`/`expiresAt`,
a granting actor, revocation state, audit history.

### 3.3 The grant carries an assumed role

Because of §2.3. The grant names one of `MANAGER`, `TEAM_LEAD`, `TEACHER`, or
the read-only pseudo-role, and the effective permission set is that role's set
from `academyRolePermissions`, intersected with the read-only set when
`readOnly` is true.

The admin's identity does not change. They remain themselves in every audit
record, every `createdByUserId`, and every display name. "Assumed role" describes
what the authorization layer answers, never who the actor is. Nothing in this
design signs the admin in as another person.

### 3.4 Read-only is the default and the cheap case

A grant is created read-only unless the operator explicitly asks for write. Most
support work — reproducing a report, checking why a class shows no students,
reading a submission that graded wrongly — needs no write at all, and the
narrower grant is the one that should require no argument.

### 3.5 A support grant never becomes a student

Two hard exclusions, enforced by the effective-permission computation rather
than by a reviewer noticing:

- `submissions.own.create` is never in a grant's effective set, at any assumed
  role. A support operator must not be able to submit work that lands in a real
  student's record.
- `AcademyAccessService.isStudentAnywhere` reads memberships directly and must
  keep doing so. A grant must not put an operator under the thirty-minute
  student inactivity lease, and must not lift it for anyone else.

Live monitoring (`/academy/[slug]/teach/classes/[classId]/students/[id]/live`)
is excluded from every grant by default and requires an explicitly monitoring-
scoped grant. It watches a named child's editor in real time; that is a
different consent question from reading a stored submission, and it should not
be reachable because an operator happened to pick `TEACHER` from a dropdown.

### 3.6 The platform user directory is identity-level, not learning-level

It answers who someone is, where they belong, and what state their account is
in. It never returns a submission, a grade, a progress figure, a point balance,
or a student's academy profile — guardian names, phone numbers, dates of birth,
school names all live in `StudentAcademyProfile` and stay behind a grant.

This is the §3.5 line of the platform administration design, held exactly. The
difference between a directory and a data leak is that the directory stops at
identity.

### 3.7 The content library is an academy

Rather than a parallel `LibraryCourse`/`LibraryLecture`/`LibraryExercise`
schema, the library is one platform-owned `Academy` row whose courses are the
catalog.

The reasons are all consequences of §2.4:

- No new content tables. The whole `Course → CourseModule → Lecture → Material
  → ProgrammingExercise → ExerciseTestCase` tree works unmodified.
- The authoring UI already exists and stays exercised. Library content is
  written on the same screens a Team Lead uses, so it cannot rot separately.
- Adoption is academy-to-academy, which is wanted anyway: an organization with
  three campuses will ask to share a course between them, and that is the same
  operation.
- Every authorization predicate survives untouched. `manager-scope.service.ts`
  and `assigned-class-access.ts` are full of `course: { academyId, isVisible }`
  and `classTaughtMaterialWhere(academyId, classIds)`. Making `Course.academyId`
  nullable to model a global course would silently widen all of them.

### 3.8 Adoption copies, and records where the copy came from

Three options were considered:

| | Shape | Verdict |
|---|---|---|
| A | Deep copy on adopt; the academy owns it outright | Ship this |
| B | The class references the library course directly | **Rejected** — needs nullable `academyId`, see §3.7 |
| C | Deep copy plus an upstream pointer and revision | Design for this |

A is a strict subset of C — identical copy machinery, C adds two columns — so
the columns land in the same migration and the "upstream has changed" surface is
built later against data that already exists.

`Course.contentRevision` already exists and is *"bumped by every mutation
anywhere in this course's content, in the same transaction as the mutation
itself"*. It was built for import conflict detection and is exactly the field a
divergence check needs, unchanged.

An academy's Team Lead adopts from the library themselves. The admin push exists
for onboarding day, not as the only door — a customer who can only get
curriculum by asking Cove is a support ticket generator.

### 3.9 The console browses content; the academy's screens change it

An operator needs to *find* things across academies — which academy has the
course a customer is describing, who has a running class with no teacher, where
that problem lives. No academy-scoped surface can answer any of those, so the
console gets read-only directories of courses, classes, and problems at
`/admin/content`.

Editing stays where it already is. Every row's **Edit** opens a support session
and lands the operator in that academy's own editor, carrying the destination
so they arrive at the row they clicked rather than at the academy root.

The alternative — editing curriculum from the console — would mean a second
implementation of every content mutation, running under different
authorization, whose bugs the academy's own screens would never show. It would
also make a Cove edit indistinguishable in mechanism from the customer's own,
which is the property §3.2 exists to preserve.

`platform.content.read` has no `.manage` sibling, deliberately. If one ever
appears it is the signal that this decision was reversed by accident.

### 3.10 Cove does not review academy content

No approval queue, no moderation surface, no platform veto on publish. It does
not scale, it puts Cove in the path of every customer's work, and it is not what
they are paying for. The library is content Cove *offers*; what an academy does
after adopting it is the academy's.

---

## 4. Data model

Five changes. Every one is additive — a new table, new nullable columns, and new
columns with defaults — which matters for §14: `deploy.sh` runs migrations
before `compose up -d`, so the schema is briefly live under the previous
containers.

### 4.1 `PlatformSupportGrant`

```prisma
/// One operator's time-limited authority inside one academy.
///
/// The bridge between the two authority axes, and the only one. It is a row
/// rather than a role because every property that makes deep access acceptable
/// — a stated reason, an end time, a revoke button, a trail — is a column here
/// and would be nothing at all in a permission map entry.
model PlatformSupportGrant {
  id          String      @id @default(uuid()) @db.Uuid
  academyId   String      @map("academy_id") @db.Uuid
  adminUserId String      @map("admin_user_id") @db.Uuid

  /// Which role's permission set answers while this grant is live. Required
  /// because ManagerScopeService and LeadScopeService assert an exact role
  /// after the permission check; a grant carrying permissions alone would
  /// unlock half the academy surface and refuse the rest.
  assumedRole AcademyRole @map("assumed_role")

  /// Default true. False narrows nothing by itself — it widens, and so it is
  /// the flag an operator has to reach for deliberately.
  readOnly    Boolean     @default(true) @map("read_only")

  /// Opt-in per grant. Live monitoring watches a named child's editor in real
  /// time and is not covered by picking TEACHER.
  allowMonitoring Boolean @default(false) @map("allow_monitoring")

  /// Free text, required, minimum length enforced in the schema. This is what
  /// the academy reads on its own audit page, so it is written for them.
  reason      String

  startsAt    DateTime  @default(now()) @map("starts_at") @db.Timestamptz(6)
  expiresAt   DateTime  @map("expires_at") @db.Timestamptz(6)

  revokedAt       DateTime? @map("revoked_at") @db.Timestamptz(6)
  revokedByUserId String?   @map("revoked_by_user_id") @db.Uuid

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  academy   Academy @relation(fields: [academyId], references: [id], onDelete: Cascade)
  admin     User    @relation("SupportGrantAdmin", fields: [adminUserId], references: [id], onDelete: Restrict)
  revokedBy User?   @relation("SupportGrantRevoker", fields: [revokedByUserId], references: [id], onDelete: SetNull)
  auditLogs AuditLog[]

  /// The authorization read: is there a live grant for this pair, right now.
  @@index([academyId, adminUserId, expiresAt])
  /// The console's history list, newest first.
  @@index([adminUserId, createdAt(sort: Desc)])
  @@map("platform_support_grants")
}
```

`onDelete: Restrict` on the admin, matching `Course.createdBy`: an operator's
account must not be removable while grants record what they did.

At most one live grant per `(academyId, adminUserId)`. Enforced in the service
rather than by a partial unique index, because "live" is a time comparison and a
revoked grant must remain in history alongside its successor.

### 4.2 `AuditLog.supportGrantId`

```prisma
supportGrantId String? @map("support_grant_id") @db.Uuid
supportGrant   PlatformSupportGrant? @relation(fields: [supportGrantId], references: [id], onDelete: SetNull)

@@index([supportGrantId, createdAt])
```

Null for every ordinary act. Set for every write made while `via === "support"`.
This single column is what makes `/admin/access/[grantId]` and the academy's own
audit page tell the same story, and it is the whole accountability payoff of §3.2.

### 4.3 `Course` provenance

```prisma
/// The library course this one was copied from, if it was.
///
/// SetNull rather than Restrict: retiring a library course must never freeze
/// an academy's own copy, which by then is theirs.
sourceCourseId        String? @map("source_course_id") @db.Uuid
/// The source's contentRevision at the moment of the copy. What a later
/// "upstream has changed" comparison is drawn against.
sourceContentRevision Int?    @map("source_content_revision")

sourceCourse  Course?  @relation("CourseLineage", fields: [sourceCourseId], references: [id], onDelete: SetNull)
derivedCourses Course[] @relation("CourseLineage")

@@index([sourceCourseId])
```

### 4.4 `Academy.isContentLibrary`

```prisma
/// This academy is the platform's content catalog, not a school.
///
/// A boolean rather than a status, because it is orthogonal to ACTIVE /
/// SUSPENDED / ARCHIVED — a library academy has a lifecycle like any other.
isContentLibrary Boolean @default(false) @map("is_content_library")
```

The risk this column carries is omission, not misuse. Every query that lists
academies to a non-operator must exclude it. Named explicitly so the
implementation and its tests have a checklist:

- `academy-discovery.service.ts` — a library academy is never joinable and never
  appears in academy search.
- `academy-onboarding.service.ts` — no invitation, no join request, no OAuth
  onboarding intent may target it.
- `authDestination` in `packages/web/src/lib/academy-access-state.ts` — never a
  post-login destination.
- The platform academy list — shown, but in its own section, never inside the
  roll call's counts.

### 4.5 `AcademyMembership` index for cross-academy reads

Every existing index on `AcademyMembership` is academy-scoped:
`[academyId, userId]`, `[userId, status]`, `[academyId, role, status]`, and the
two named directory indexes. The platform directory's central query — every
`TEACHER` across every academy, ordered and paged — has no supporting index.

```prisma
/// The platform people directory: one role across every academy, newest first.
@@index([role, status, createdAt(sort: Desc)], map: "academy_memberships_role_created_idx")
```

---

## 5. Shared contracts

### 5.1 Platform permissions — `packages/shared/src/auth/roles.ts`

Appended to `platformPermissions`, and all granted to `ADMIN`. The existing four
are unchanged.

| Permission | Authorizes |
|---|---|
| `platform.organizations.read` | Reading organizations and their academies |
| `platform.organizations.manage` | Renaming an organization, changing its status |
| `platform.users.read` | The cross-academy people directories |
| `platform.users.suspend` | Setting `UserStatus` platform-wide |
| `platform.audit.read` | The audit viewer, platform-wide and per academy |
| `platform.features.manage` | The `AcademyFeatureFlag` switchboard |
| `platform.analytics.read` | Cross-academy aggregate figures |
| `platform.health.read` | Judge queue, email delivery, error rates |
| `platform.support.read` | Reading grants and what was done under them |
| `platform.support.grant` | Opening a support grant |
| `platform.support.revoke` | Ending one early |
| `platform.library.manage` | Authoring in the library academy |
| `platform.library.distribute` | Pushing a library course into an academy |
| `platform.operators.manage` | Promoting and demoting platform admins |

`platform.support.grant` and `platform.support.revoke` are separate for the
reason `create` and `lifecycle` are separate today: a later read-only support
operator holds neither, and a support lead may need to revoke someone else's
grant without being able to open their own.

### 5.2 A read-only academy permission set — `roles.ts`

```ts
/**
 * The permissions a read-only support grant may hold, whatever role it assumes.
 *
 * A named set rather than a suffix test on the permission string: `curriculum.
 * review` and `academy.applications.review` both read as reads and are not both
 * safe, and a rule that depends on how a permission was spelled breaks the day
 * one is renamed.
 */
export const readOnlyAcademyPermissions = [...] as const satisfies readonly AcademyPermission[];

export function grantEffectivePermissions(grant: {
  assumedRole: AcademyRole;
  readOnly: boolean;
  allowMonitoring: boolean;
}): readonly AcademyPermission[];
```

`grantEffectivePermissions` is pure, lives beside `roleHasPermission`, and is
where §3.5's exclusions are enforced: `submissions.own.create` is filtered out
unconditionally, and `classes.assigned.manage` only survives when
`allowMonitoring` is true.

### 5.3 Error codes — `packages/shared/src/errors/codes.ts`

```
SUPPORT_GRANT_NOT_FOUND
SUPPORT_GRANT_EXPIRED
SUPPORT_GRANT_REVOKED
SUPPORT_GRANT_ALREADY_ACTIVE
SUPPORT_GRANT_READ_ONLY
LIBRARY_COURSE_NOT_FOUND
LIBRARY_ADOPTION_CONFLICT
```

`SUPPORT_GRANT_READ_ONLY` is distinct from `PERMISSION_DENIED` on purpose: an
operator who reaches a write behind a read-only grant has made a recoverable
mistake and should be told which one, not refused anonymously.

### 5.4 Contract modules — `packages/shared/src/api/orpc/`

New: `platform-people.contract.ts`, `platform-audit.contract.ts`,
`platform-support.contract.ts`, `platform-library.contract.ts`,
`platform-organizations.contract.ts`, `platform-health.contract.ts`.

`platform.contract.ts` keeps its existing doc comment and its existing rule —
everything in *it* is about an academy, never inside one. The support contract
is where the exception lives, named as an exception, in its own file.

---

## 6. API

### 6.1 `PlatformAccessService` — unchanged

Still reads no membership. Every new platform service calls
`requirePermission(authUserId, permission)` as its first act.

### 6.2 `AcademyAccessService` — the one branch

```ts
export type AcademyAccess = {
  userId: string;
  academyId: string;
  role: AcademyRole;
  /** Which axis answered. Never used to widen anything — only to audit. */
  via: "membership" | "support";
  /** Present only when `via === "support"`. */
  supportGrantId?: string;
};
```

`requirePermission` gains one fallback, in this order:

1. Account status checks, exactly as today, ahead of both axes. A suspended
   account is suspended everywhere, grant or no grant.
2. Membership, exactly as today. An admin who is *also* a member of the academy
   uses their membership — the grant is for people who have none, and an
   operator's real role must not be silently upgraded by a grant they forgot
   was open.
3. Only on `ACADEMY_MEMBERSHIP_REQUIRED`: look for a live grant for
   `(academyId, user.id)` — `startsAt <= now`, `expiresAt > now`,
   `revokedAt is null`. If one exists and
   `grantEffectivePermissions(grant).includes(permission)`, return it with
   `via: "support"`.
4. Otherwise the same refusals as today, unchanged.

Two rules on academy status, which differ from the membership path:

- A **suspended** academy accepts a grant. That is precisely when support is
  needed, and refusing would make the console useless in the one situation it
  exists for.
- An **archived** academy accepts only a read-only grant. Archived is terminal;
  reading its history is support, writing to it is not.

`isStudentAnywhere` is not touched. See §3.5.

### 6.3 `packages/api/src/platform/` — new services

| Service | Owns |
|---|---|
| `platform-people.service.ts` | The cross-academy directories, §8 |
| `platform-audit.service.ts` | Audit reads, platform-wide and per academy |
| `platform-support.service.ts` | Opening, listing, revoking grants |
| `platform-library.service.ts` | Adoption and the adopters view, §9 |
| `platform-organization.service.ts` | Organizations; the existing `platform-organization.ts` helper folds into it |
| `platform-feature.service.ts` | The flag switchboard |
| `platform-health.service.ts` | Judge queue, delivery attempts, error rates |

Each mirrors `platform-academy.service.ts`: `requirePermission` first, then work,
then `AuditService`. No authorization branch in any router.

### 6.4 `PlatformSupportService.open`

In one transaction:

1. `requirePermission(identity, "platform.support.grant")`.
2. Load the academy. Refuse an unknown one with `ACADEMY_NOT_FOUND`; refuse a
   write grant on an archived one.
3. Refuse `SUPPORT_GRANT_ALREADY_ACTIVE` if a live grant already exists for this
   admin and academy — the operator should revoke or wait, not stack authority.
4. Clamp `expiresAt` to at most `SUPPORT_GRANT_MAX_HOURS` (§16, open question 1)
   from now. A client-supplied expiry is a request, never a value trusted into
   the row.
5. Insert, and write an audit record with `academyId` set — so the grant appears
   on the *academy's* trail from the moment it opens, not only from the first
   write made under it.

Revocation is the same shape in reverse and is idempotent: revoking an already
revoked or expired grant succeeds and changes nothing.

---

## 7. Web surface — routes

`Live` marks what exists today. Everything else is new. Every route under
`/admin` sits inside the existing `(platform)` group and inherits its
`notFound()` layout guard.

### 7.1 Academies — the existing console, extended

| Route | Gate | |
|---|---|---|
| `/admin` | `platform.academies.read` | Live |
| `/admin/academies` | `platform.academies.read` | Live |
| `/admin/academies/new` | `platform.academies.create` | Live |
| `/admin/academies/[slug]` | `platform.academies.read` | Live |
| `/admin/academies/[slug]/settings` | `platform.academies.update` | Name, slug, time zone, address, contact |
| `/admin/academies/[slug]/audit` | `platform.audit.read` | This academy's trail, grants included |
| `/admin/academies/[slug]/library` | `platform.library.distribute` | Push a library course in |

### 7.2 People

| Route | Gate | |
|---|---|---|
| `/admin/people` | `platform.users.read` | Every account, all facets open |
| `/admin/people/students` | `platform.users.read` | Same page, role facet locked |
| `/admin/people/teachers` | `platform.users.read` | Same page, role facet locked |
| `/admin/people/staff` | `platform.users.read` | `TEAM_LEAD` + `MANAGER` |
| `/admin/people/[userId]` | `platform.users.read` | One account, §8.3 |
| `/admin/people/[userId]/status` | `platform.users.suspend` | Suspend, restore |

### 7.3 Support access

| Route | Gate | |
|---|---|---|
| `/admin/access` | `platform.support.read` | Live grants, then history |
| `/admin/access/new?academy=[slug]` | `platform.support.grant` | Reason, role, read-only, duration |
| `/admin/access/[grantId]` | `platform.support.read` | What was done under it; Revoke |

### 7.4 Library

| Route | Gate | |
|---|---|---|
| `/admin/library` | `platform.library.manage` | The catalog |
| `/admin/library/courses/[courseId]/adopters` | `platform.library.manage` | Who took it, at what revision |
| `/academy/[librarySlug]/content/...` | `platform.library.manage` | Authoring, on the existing screens |
| `/academy/[slug]/content/library` | `curriculum.manage` | **Team Lead** browses and adopts |

### 7.5 Organizations, rollout, health, operators

| Route | Gate |
|---|---|
| `/admin/organizations`, `/[orgSlug]` | `platform.organizations.read` / `.manage` |
| `/admin/audit`, `/[entryId]` | `platform.audit.read` |
| `/admin/features`, `/[feature]` | `platform.features.manage` |
| `/admin/health`, `/judge`, `/email` | `platform.health.read` |
| `/admin/analytics` | `platform.analytics.read` |
| `/admin/operators` | `platform.operators.manage` |

### 7.6 The support banner

While a grant is live, every `/academy/...` page renders a persistent banner
above the shell: the academy name, the stated reason, whether the grant is
read-only, the time remaining, and a Revoke control. It is not dismissible.

An operator who forgets they are inside a customer's academy is the failure this
whole design exists to prevent, and a banner that can be closed is a banner that
will be.

### 7.7 Sidebar

`platform-sidebar.tsx` already carries one item and a comment saying the group
exists because the deferred surfaces each land in it. They land now, in five
groups: Academies, People, Access, Library, Platform (organizations, audit,
features, health, analytics, operators).

---

## 8. The people directories

### 8.1 One page, three entrances

`/admin/people/students`, `/teachers`, and `/staff` render the same table with a
locked role facet. Three separate implementations would give one column three
places to drift; the locked facet is a prop.

The table reuses the TanStack Table setup and the `memberDisplayName` rule from
the per-academy directory, so a person is named the same way in both places —
academy display name, then account name, then username, then email.

### 8.2 Facets

| Facet | Source |
|---|---|
| Academy | multi-select, plus "no academy" for accounts belonging nowhere |
| Academy role | `STUDENT`, `TEACHER`, `TEAM_LEAD`, `MANAGER` |
| Membership status | `ACTIVE`, `INVITED`, `SUSPENDED` |
| Account status | `ACTIVE`, `PENDING_PROFILE`, `SUSPENDED`, `DELETED` |
| Platform role | `USER`, `ADMIN` |
| Auth provider | from the linked identities |
| Search | email, username, display name, student number, employee number |

A person with memberships in two academies is one row with two academy chips,
not two rows. The row is the account; the memberships are an attribute of it.
This is the difference from the per-academy directory, where the row is the
membership — and it is why this is a sibling service rather than a flag on the
existing one.

### 8.3 `/admin/people/[userId]`

Four sections, and deliberately no fifth:

1. **Identity** — display name, username, email, account status, platform role,
   linked auth providers, created and last-seen.
2. **Memberships** — every academy, role, membership status, joined date. Each
   row links to `/admin/academies/[slug]`.
3. **Requests and invitations** — join requests and invitations across all
   academies, with their delivery attempts. This is what answers "the customer
   says they never got the email".
4. **Recent audit** — acts by and upon this account.

There is no learning section. No submissions, no progress, no points, no
`StudentAcademyProfile`. §3.6 — and where an operator genuinely needs those,
the page offers "Open a support grant" rather than quietly showing them.

### 8.4 Suspension

`/admin/people/[userId]/status` writes `UserStatus`. Both access services
already refuse `SUSPENDED` and `DELETED` before reading any role, so this is
genuinely global the moment it is set, with no per-surface enforcement to add.

Requires a reason, audited. Refuses to suspend the last active platform admin,
and refuses to suspend an account that is the last active `MANAGER` of any
active academy without an explicit override — `LAST_MANAGER_REQUIRED` exists and
means exactly this.

---

## 9. The content library

### 9.1 Bootstrap

One `Academy` row with `isContentLibrary = true`, in a platform-owned
`Organization`, created by an idempotent command in the shape of
`bootstrap-admin.ts`:

```bash
pnpm --filter @cove/api bootstrap:library
```

Re-running is a no-op. `bootstrap-admin.decision.ts` is the precedent for
separating the decision from the effect so the decision is unit-testable.

### 9.2 Authoring

At `/academy/[librarySlug]/content/...`, on the existing screens. An admin
reaches them through the same support-grant mechanism as any other academy —
the library is an academy, and it would be strange for the platform's own
content to have a second, softer door. `platform.library.manage` gates opening
that grant without a reason prompt, since there is no customer to explain it to.

### 9.3 Adoption

`PlatformLibraryService.adopt(actor, { sourceCourseId, targetAcademyId })`, in
one transaction:

1. Authorize. Either `platform.library.distribute` (admin push), or
   `curriculum.manage` in the target academy (Team Lead pull).
2. Read the source with its whole tree; refuse `LIBRARY_COURSE_NOT_FOUND` if it
   is not a visible course of a library academy.
3. Refuse `LIBRARY_ADOPTION_CONFLICT` on a title collision in the target —
   `COURSE_TITLE_CONFLICT` already governs this and the copy must respect it.
4. Deep-copy `Course → CourseModule → Lecture → Material → ProgrammingExercise
   → ExerciseTestCase → ExerciseHint`, all new IDs, `academyId` = target,
   `createdByUserId` = the acting user, `isVisible = false`.
5. Set `sourceCourseId` and `sourceContentRevision` from the source.
6. Audit with the target academy's id.

Copied `isVisible = false` deliberately: adoption puts a course in the academy's
hands, and publishing it to students stays the academy's decision.

### 9.4 Hidden test cases

Copying an exercise copies its `ExerciseTestCase` rows, hidden inputs and
expected outputs included. Per the note in `roles.ts`, `TEACHER` holds
`curriculum.review` and therefore sees them.

So adopting a library course means the adopting academy's teachers can read
Cove's grading cases for it. That is acceptable — it is the same exposure a
Team Lead's own authored content already has — but it is a decision, recorded
here, not a discovery to be made later. A library of assessment material Cove
does *not* want teachers to see would need a different mechanism than adoption.

### 9.5 Divergence — later, on data landed now

`/admin/library/courses/[courseId]/adopters` lists each derived course, its
academy, its `sourceContentRevision`, and the source's current
`contentRevision`. Where they differ, the library has moved on. Pulling those
changes into an academy's copy is deferred; the columns that make it possible
ship with §4.3.

---

## 10. Audit vocabulary

Following the existing `action` / `targetType` convention:

| Action | Target |
|---|---|
| `platform.support.granted` | `support_grant` |
| `platform.support.revoked` | `support_grant` |
| `platform.support.expired` | `support_grant` |
| `platform.user.suspended` | `user` |
| `platform.user.restored` | `user` |
| `platform.operator.promoted` | `user` |
| `platform.operator.demoted` | `user` |
| `platform.feature.changed` | `academy_feature_flag` |
| `platform.organization.updated` | `organization` |
| `platform.library.adopted` | `course` |

Every record written while `via === "support"` carries `supportGrantId`,
whatever its action — including actions defined by other designs. This is a
property of the audit writer, not a list to maintain.

---

## 11. Security

1. No call site tests `platformRole === "ADMIN"`. §3.1.
2. `grantEffectivePermissions` never yields `submissions.own.create`. §3.5.
3. A grant is refused for an account that is `SUSPENDED`, `DELETED`, or
   `PENDING_PROFILE` — the status checks run ahead of both axes. §6.2.
4. Grant expiry is clamped server-side. A client's requested duration is input.
5. `reason` is required and length-checked. An empty reason makes the whole
   accountability story fiction.
6. The platform directory returns no `StudentAcademyProfile` field. Guardian
   names, phones, and dates of birth belong to minors and stay behind a grant.
7. Rate-limit grant creation per admin, reusing `RateLimitService`.
8. `/admin` keeps answering `notFound()`, and the API keeps answering
   `PLATFORM_ACCESS_DENIED` rather than `PERMISSION_DENIED`, so a non-admin
   never learns the surface exists.

---

## 12. Verification

### 12.1 Unit

- `grantEffectivePermissions` — every role × `readOnly` × `allowMonitoring`
  combination; `submissions.own.create` absent from all of them.
- `platformRoleHasPermission` for each new permission.
- `academyCondition` unchanged by the library academy.
- The adoption planner: tree shape, ID remapping, title collision.

### 12.2 Authorization — the ones that matter

- Membership wins over a live grant when both exist.
- An expired grant, a revoked grant, and a grant for another academy each refuse.
- A grant assuming `MANAGER` passes `ManagerScopeService`; one assuming
  `TEAM_LEAD` does not.
- A read-only grant passes a read and refuses a write with
  `SUPPORT_GRANT_READ_ONLY`.
- A grant never satisfies `submissions.own.create`, at any assumed role.
- `isStudentAnywhere` is false for an operator holding a `STUDENT`-adjacent
  grant, and unchanged for everyone else.
- A suspended account with a live grant is refused.
- An archived academy refuses a write grant and accepts a read-only one.

### 12.3 Integration

- Opening a grant writes an audit record on the academy's trail immediately.
- A write made under a grant carries `supportGrantId`, and appears on both
  `/admin/access/[grantId]` and `/admin/academies/[slug]/audit`.
- Adoption produces an independent tree: editing the copy does not touch the
  source, and `contentRevision` moves on the copy alone.
- The library academy is absent from discovery, from invitations, from join
  requests, and from `authDestination`. One test per §4.4 bullet.

### 12.4 End-to-end

- An admin opens a grant with a reason, lands on the academy, sees the banner,
  fixes a class, revokes, and is refused on the next request.
- A Team Lead adopts a library course and publishes it to a class.
- A non-admin gets a 404 on every `/admin` route added here.

---

## 13. Implementation order

Each stage leaves the tree green, is independently reviewable, and is
independently deployable.

| Stage | Contents | Done when | Status |
|---|---|---|---|
| 1 | §5.1 permissions, §5.2 `grantEffectivePermissions`, §5.3 error codes | Unit tests pass; nothing wired to a route | **Built** |
| 2 | §4.5 index, §6.3 `platform-people.service`, §7.2 + §8 routes | An operator finds any account without a SQL client | **Built** |
| 3 | §4.2, `platform-audit.service`, §7.5 audit routes | Every act on the platform is readable in the browser | **Built** |
| 4 | §4.1, §6.2 access branch, §6.4, §7.3 + §7.6 | A grant opens, works, banners, expires, and is revocable | **Built** |
| 4b | §3.9 content directories, `platform.content.read`, `/admin/content/*` | An operator finds any course, class, or problem across the platform and can reach its editor | **Built** |
| 5 | §4.4, §9.1–9.3, §7.4 | A new academy is onboarded with a curriculum already in it | Not started |
| 6 | Organizations, features, health, analytics, operators | The remaining §1.2 items of the 2026-08-18 design are closed | Not started |

Two implementation notes worth carrying into stage 5 and 6.

**Audit attribution is ambient, not threaded.** §10 asks that every record
written under a grant carry `supportGrantId`, "a property of the audit writer,
not a list to maintain". There are 59 `audit.write` call sites across 18
services, so the grant travels with the request through an `AsyncLocalStorage`
in `packages/api/src/common/request-context.ts`: `AcademyAccessService` records
it when it answers `via: "support"`, and `AuditService` reads it. Nothing else
may read it to *authorize* anything — it is an attribution channel, and the
moment it decides access it becomes ambient authority no call site declares.

**"People" became "Users" throughout.** The console says users, the routes say
`/admin/users`, and the namespace is `platform-users`. Renamed before anything
shipped, so no URL an operator has bookmarked changes. The per-academy
directory keeps its own name — inside an academy the row is a *membership*, and
`PeopleDirectoryService` is still the right name for what it lists.

**The console's copy is five namespaces, not one.** `platform.json` passed the
per-namespace budget in `@cove/i18n`'s `locales.spec.ts` when the people copy
landed. Per that budget's own instruction it was split rather than raised:
`platform`, `platform-users`, `platform-support`, `platform-audit`,
`platform-content`. The
support banner mounts `platform-support` alone, because it renders inside the
academy shell and a student must not pay for the vocabulary of Cove staff being
in their academy.

Stage 4 is the one that changes the risk profile — it is the first time platform
authority reaches academy data — and it should be reviewed as a unit rather than
alongside anything else.

Stage 5 is the one that changes the business, the way phase 3 of the platform
administration design did: after it, onboarding a customer stops handing them an
empty platform.

---

## 14. Deployment

Per `docs/operations/deployment-guide.local.md` §6.

**Branch.** `feat/platform-admin-console`, off `feat/cove-studio-v2`. Each stage
is its own commit; §6 of the guide's "collect fixes on a branch, release once"
applies to stages too.

**Migrations.** Stages 2–5 each carry one. `deploy.sh` runs
`compose --profile operations run --rm migrate` *before* `compose up -d`, so
every migration is briefly live under the previous containers. All five changes
in §4 are additive — a new table, nullable columns, and columns with defaults —
so the old containers are unaffected. Keep it that way: no stage in this
document may rename or drop a column.

**Bootstrap commands.** Stage 5 adds `bootstrap:library`, run once against
production after the deploy, in the shape of §9.1 of the deployment guide's
feature backfill. Idempotent, so a second run is safe.

**Feature flags.** None. `AcademyFeature` governs what an academy switches on
for its own members; the console is invisible to non-admins by construction and
needs no flag. The one academy-facing addition — `/academy/[slug]/content/library`
— is Team Lead-only and ships enabled.

**Release.** One tag per stage group, or one for the batch. Latest is `v2.0.8`;
this is a feature, so `v2.1.0`. Tags must be new — a change after tagging needs
the next number.

**Verification after deploy.** Beyond `smoke.sh`: sign in as the admin, confirm
`/admin/people` returns and `/admin` still lists academies as before; confirm a
non-admin account gets a 404 on `/admin/people`; after stage 5, confirm the
library academy does not appear in academy search for an ordinary account.

**Rollback.** Additive migrations do not need reverting to roll back an image.
Redeploy the previous tag; the unused columns sit idle.

---

## 15. Acceptance criteria

1. Everything the console does today works unchanged, including creating an
   academy and inviting its first manager.
2. An operator can find any account across all academies, filtered by academy,
   role, and status, and can suspend one — without a SQL client.
3. The platform directory returns no submission, grade, point, or
   `StudentAcademyProfile` field.
4. An operator cannot read or write anything inside an academy without a live
   grant carrying a stated reason.
5. Every act performed under a grant is attributable to that grant on both the
   platform's and the academy's audit pages.
6. A grant expires on its own and can be revoked early.
7. No production call site tests `platformRole === "ADMIN"`.
8. A new academy can be onboarded with a curriculum already in it.
9. A Team Lead can adopt a library course without asking Cove.

---

## 16. Open questions

1. **Maximum grant duration.** Long enough to finish a support session, short
   enough that forgetting is not a breach. Recommend 4 hours, extendable by
   opening a new grant, which produces a fresh reason and a fresh record.
2. **Does the academy get told?** Auth design §6.3 requires notification "when
   notification infrastructure exists" — Resend now exists. Recommend: notify
   the academy's active managers on grant open, from stage 4. It is the single
   thing that most changes how a customer feels about this feature.
3. **Who may hold `platform.support.grant`?** Today `ADMIN` holds every platform
   permission. The permission list is built so a narrower support role is a map
   entry rather than a refactor; whether to add one now or when the second
   operator is hired is a staffing question, not a technical one.
4. **Library adoption granularity.** Whole course only, or module-level? Whole
   course is simpler and matches how `ClassCourse` assigns. Recommend starting
   there and letting the adopting academy delete what it does not want.
5. ~~**Manager / Team Lead permission inheritance.**~~ **Settled.**
   `academyRolePermissions` on `feat/cove-studio-v2` already makes `MANAGER` a
   true superset of `TEAM_LEAD`, so an assumed `MANAGER` grant carries
   curriculum authoring. `supportAssumedRoles` is therefore `MANAGER` and
   `TEACHER` only — a Team Lead option would be a narrower path to the same
   pages and one more thing for an operator to choose wrongly.
