# Console People Operations

**Date:** 2026-09-01
**Status:** Implemented
**Scope:** `/admin/users`, `/admin/users/[userId]`, and the platform-user API behind them
**Branch:** `feat/platform-admin-console` (continues)

**Supersedes in part:**
`docs/superpowers/specs/2026-08-31-platform-admin-console-design.md` §3.6, §8.1,
§8.2 and §8.3. Each reversal is argued in §3 below rather than assumed.

---

## 1. Summary

The console's user directory works and tells an operator almost nothing.

It lists accounts. Every row ends in the same blue **Open** button. Every column
is grey text. The one thing that actually distinguishes two people on this
platform — a student from a manager — is set in 12px sub-colour under the
academy name, at the bottom of the column an operator reads last. The role facet
sits in the toolbar duplicating the tabs directly above it. Platform operators —
the accounts with every permission on Cove — have no page of their own. And an
account page that an operator opens to answer "what is going on with this
student" shows their email, their academies, and nothing else, by design.

This spec does five things:

1. **Gives the directory a colour system that carries meaning.** Role is a hue,
   account state is a chip, and neither borrows the other's swatch (§3.1).
2. **Collapses the six lens routes into one page.** The Role narrowing is a `+`
   chip beside the other three, and the counts the rail carried become a
   summary strip that states the whole composition — every role, operators, and
   how many academies these people span — at once (§3.2, §7.1).
3. **Moves the directory's privacy line** from *identity vs. learning* to
   *structure and totals vs. person and artefact*, so an operator can see which
   classes a student sits in and how much they have solved, while guardian
   details and submitted source code stay behind a support grant (§3.4).
4. **Makes the role an inline chip and the rest a row menu**, matching the
   members table a manager already uses, with Open as its own button beside the
   glyph (§3.6, §3.7, §7.3).
5. **Rebuilds the account page role-shaped**: a student's card shows classes,
   courses, solve totals and active learning time; a teacher's shows the classes
   they run and the courses in them; a manager's shows the academy they run
   (§8).

### 1.1 What this is not

It is **not a schema change.** Every field this spec renders already exists and
is already written to. §4 walks the tables. There is no migration.

It is **not a second people directory.** The manager's members table
(`people-directory.tsx`) stays the authority on membership-shaped work inside
one academy. This is the account-shaped view across all of them, and §3.8 keeps
the one mutation they share in one place.

It is **not account erasure.** "Delete" here means `UserStatus.DELETED` — the
account is locked out everywhere and its work survives. True erasure is a
different job with a real obstacle, and §3.7 writes the obstacle down instead of
pretending it is not there.

---

## 2. The problem, precisely

**The table has no visual system, so it has no scan order.** Nine tenths of the
directory is grey. The eye has nowhere to land, and the two facts an operator
takes a support call with — *what is this person* and *is this account healthy*
— are the two facts with the least visual weight on the row.

**The role control exists twice and disagrees with itself.** The lens tabs are
role filters. The Role facet is a role filter. They only coexist on `everyone`
because `user-table.tsx:219` splices the facet in conditionally — the code
already knows this is a duplicate. Meanwhile the tabs cost a page load to use
and, between them, cannot answer the one question a directory of 49 accounts
across 12 academies is opened with: what is this population made of.

**Platform operators are invisible.** `platformRoles` is a parseable query
parameter (`prole=ADMIN`, `users.ts`) and the list service accepts it, but no UI
sets it. The accounts that can suspend anybody on Cove are reachable only by
hand-editing the address bar.

**Every row action is one link.** Suspending somebody costs two page loads:
open, scroll, find the control at the bottom of the identity panel. Changing
what somebody *is* costs an impersonation trip into their academy's own members
table — where it is a two-click chip, while here it is not offered at all.
Neither is deleting.

**The account page answers a question nobody asks.** An operator opening a
student almost never wants to know their username. They want to know which
academy, which classes, whether they are actually working, and where it stopped
working. §3.6 of the console design forbade all of it — and that decision was
right about *children's personal data* and wrong about *structure*, which is the
distinction §3.4 draws.

---

## 3. Decisions

### 3.1 Role carries hue; status carries state

The console already owns two colour rules and they were written for different
pages, so they have never had to agree.

`manager-view.ts` gives every academy role a hue: students are the product's
blue, teachers violet, team leads teal, managers the action orange. Green is
deliberately absent so no role reads as *the good one*.

`user-view.ts` gave account status a *loudness*: `ACTIVE` was a quiet grey dot
and only trouble got a filled chip, on the reasoning that a table putting a
green pill on three hundred rows teaches the eye to skip the column.

That reasoning holds for a column nobody is looking at, and this is not one. An
operator opens this table *because* somebody cannot sign in, so account state
is the first thing they read — and a grey dot is the slowest possible way to
say "this one is fine". Worse, it made one fact look like two products: a
manager reading a green `Active` on their own people table and an operator
reading a grey dot were being shown the same status in two vocabularies.

So status is a filled chip in all four states, matching the manager's:

| Channel | Carries | Vocabulary |
|---|---|---|
| **Hue** | *What this person is* | blue / violet / teal / orange, from `roleTones` |
| **State** | *What state the account is in* | green settled, amber unfinished, red stopped, grey gone |

The rule that survives unchanged is the one that matters: **status never
borrows a role hue, and a role is never rendered in danger red.** A suspended
teacher is a violet role chip beside a red status chip — two facts, legible
separately. And nothing colours a *person*: the four role hues name what
somebody is, never how well they are doing.

Each status chip carries a dot as well as its word, so the four stay separable
for a reader who cannot separate the hues. Colour is never the only carrier.

The console imports `roleTones` and `roleIcons` from
`(studio)/academy/[academySlug]/(framed)/_lib/manager-view.ts` rather than
restating them. A manager and an operator looking at the same teacher must see
the same violet, or the two surfaces are two products.

### 3.2 One page, one Role facet, and a summary strip

There is one directory at `/admin/users`, and the role narrowing is a `+` chip
in its toolbar beside Academy, Account and Membership.

The lens rail this replaces was three things wearing one costume, and only one
of them was worth keeping.

**As a filter it was a duplicate.** The rail set a role; the Role facet
underneath it set a role. The code already knew — `user-table.tsx` spliced the
facet in only on `everyone`, because on any other tab the two controls could
disagree and one had to be hidden. A narrowing that has to hide its twin is one
narrowing implemented twice.

**As navigation it cost a page load.** Every other narrowing on this table is a
chip that filters in place. Reaching teachers meant leaving the page you were
on, and combining "teachers" with "at Mapo" meant a route change followed by a
chip.

**As a statistic it was the only part that earned its place** — and it was the
worst possible shape for one. Six numbers spread across six tabs, of which an
operator could read all six but compare none, and which said nothing at all
about how many academies those people were spread over.

So the counts stay and become a summary strip above the table (§7.1): one
total, one composition band, five counts and an academy spread, all visible at
once. The filtering goes back to the facet. Neither job is now doing the
other's badly.

The strip is **statistics, not controls**. Nothing in it is a link. A count
that filtered on click would be the rail again with the tabs repainted, and it
would reintroduce the ambiguity the facet was hidden to avoid.

`/admin/users/students`, `/teachers` and `/staff` permanently redirect here
with their role in the query — `staff` to both `TEAM_LEAD` and `MANAGER`, which
is what it always meant. Operators have them bookmarked, and the redirect
carries the rest of the address so the bookmark lands on the same rows.

### 3.3 Operators are a lens, not a fifth role hue

`platformRole = ADMIN` is not an academy role. It is a different axis, it can
coexist with any academy role, and giving it a fifth hue in the role scale would
imply it is a peer of the other four.

So platform authority reads as **weight, not hue**: a solid graphite plate
carrying `ShieldCheck`, inverted against a scale where every other chip is a
tinted wash. It is the only solid chip in the table, which is exactly right for
the rarest and most consequential thing a row can be — and it stays legible
beside a role chip, because an operator who is also a manager somewhere wears
both.

The existing bare `Shield` glyph beside the name (`user-table.tsx:86`) is
replaced by this chip. A 14px outline icon with an `aria-label` was the correct
minimum and is not enough weight for the fact it states.

### 3.4 The directory's line moves: structure and totals, not persons and artefacts

The console design drew its line at **identity vs. learning** (§3.6) and its
reasoning was: *the difference between a directory and a data leak is that the
directory stops at identity.*

That sentence is right. The line it drew is in the wrong place, and the
motivating case shows why. An operator takes a call — "our student cannot get
into her class" — and the account page can tell them the account is active and
belongs to Mapo. It cannot tell them the student sits in no class, which is the
answer. To find it they open a support grant into a customer's academy, assume a
`TEACHER` role, and browse a roster: a heavier, more invasive act, recorded
against the academy, to learn something less sensitive than what the grant
exposes on the way.

The line moves to **structure and totals** on one side, **persons and
artefacts** on the other:

| Console reads it | Behind a support grant |
|---|---|
| Which academies, which classes, which courses | Guardian name, guardian phone, date of birth, school — every field of `StudentAcademyProfile` |
| Class names, course titles, enrolment dates, roster sizes | Submitted source code, drafts, collaboration documents |
| Totals: exercises solved / attempted, active learning seconds, points earned, streak, last active | Individual teacher feedback text |
| Which classes a teacher runs, which courses those classes teach | Live monitoring of a named child's editor (already grant-scoped, §3.5 of the console design — unchanged) |
| Student number, employee number (already searchable) | |

The principle underneath: **the console may see the shape of a person's
participation; it may not see the person's own material.** A count of solved
exercises is a fact about the platform's operation. The code they wrote is
theirs. Guardian details belong to a child and to the academy that collected
them.

Two guarantees from §3.5 of the console design are untouched and remain the
hard floor: no grant ever carries `submissions.own.create`, and
`isStudentAnywhere` keeps reading memberships directly.

This widening gets its own named permission rather than riding on
`platform.users.read`, so that the day a narrower support role exists it can
hold the directory without holding this (§5.1).

### 3.5 Reading a person's participation is an audited act

The support-grant design rests on the idea that deep access should be something
an academy could be shown afterwards. §3.4 moves one class of read out from
under grants, so that read has to carry its own accountability or the move is a
net loss.

Opening a membership card writes one `AuditLog` row:
`platform.user.participation.read`, `targetType: "AcademyMembership"`,
`academyId` set — so it appears on **the academy's own audit page**, not only on
the platform's. The academy sees that Cove looked.

Deduplicated per (actor, membership) per hour. Without that, a page refresh is
an audit row, and a trail with a hundred identical entries is a trail nobody
reads.

Only `STUDENT` membership cards write it. A teacher's class list is
operational metadata about the academy's configuration; a student's
participation is about a named child.

### 3.6 A role change is per membership, never per account

"Change the user's type" has no meaning at the account level. An account is not
a student — an account holds a *membership* that is a student, possibly several,
possibly with different roles in different academies. `PlatformUserSummary`
models this correctly already: `memberships` is an array.

So the control is per membership, and the UI reflects the count honestly:

- **No memberships** — the item is absent. There is nothing to change.
- **One membership** — the menu item opens a radio submenu of the four roles,
  the same shape as the members table's `RoleCell`.
- **Two or more** — the item opens a modal listing each academy with its own
  role picker. Silently changing the *lead* membership because it sorts first
  would be a wrong write with no error, which is the worst kind.

Granting or revoking **platform operator** is a separate item under its own
separator, gated on `platform.operators.manage`, with its own confirmation. It
is not a fifth entry in the role radio: it is a different axis (§3.3), and a
radio group implies exclusivity that does not hold.

### 3.7 Delete means `DELETED`; erasure is a separate job, and here is why

The console design put deleting a user out of scope (§1.2). For academies that
line has already been crossed — `platform.academies.delete` and
`purgeAcademy()` both ship — so the precedent is that the console does destroy
things when the destruction is honestly costed.

For a user it is not, and the reason is in the schema. These relations are
`onDelete: Restrict` and every one of them can point at a staff account:

| Relation | Model |
|---|---|
| `Course.createdBy` | authored curriculum |
| `Class.createdBy` | classes |
| `ClassCourse.assignedBy` | course assignments |
| `ClassEnrollment.enrolledBy` | every seat they filled |
| `PlatformSupportGrant.admin` | every grant they opened |

`Restrict` is not an accident — the comment on `PlatformSupportGrant.admin` says
so explicitly: *"an operator's account must not be removable while these rows
record what they did with it."* A real erasure has to either reassign those
rows to a tombstone account or refuse. That is a design of its own, it is where
a right-to-erasure request actually lives, and it is deferred.

What ships now:

**Delete account** sets `UserStatus.DELETED`. Both access services already
refuse `DELETED` before reading any role, so it takes effect everywhere on the
account's next request — the identical mechanism as suspension. Requires a
reason and the account's email or username typed to confirm, mirroring
`deletePlatformAcademyInputSchema`'s `confirmSlug`. Audited as
`platform.user.deleted`.

The copy is explicit that work is kept, because the word "delete" promises
otherwise and a promise the system does not keep is worse than a longer label:

> **Delete this account?** They are signed out everywhere and can never sign in
> again. Their memberships, submissions and history are kept — this locks the
> account, it does not erase the person. An operator can restore it.

`DELETED` joins `settablePlatformUserStatuses`, and restoring from it is
allowed. The current schema comment forbidding `DELETED` is rewritten rather
than deleted, so the reasoning that changed is on the record.

### 3.8 One role-change implementation, two callers

`AcademyMembershipService.changeRole` holds four invariants: the membership must
be `ACTIVE`, a departing manager must not be the last one, the change bumps the
academy's people revision inside the same transaction, and it revokes the
member's sessions afterwards. All four matter, and none of them are about
*who asked*.

The console must not restate them. The service's guard is
`requireManager(identity, academyId)`, which asserts an exact academy role a
platform operator does not hold, so it also cannot be reused as-is.

The transaction body is extracted to
`packages/api/src/academies/academy-membership.operations.ts`:

```ts
export async function applyMembershipRoleChange(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  input: {
    academyId: string;
    membershipId: string;
    role: AcademyRole;
    actorUserId: string;
    /** Platform-side callers state one; a manager's own change needs none. */
    reason?: string;
  },
): Promise<{ membershipId: string; changed: boolean }>;
```

Two callers, two authorization checks, one set of invariants:

- `AcademyMembershipService.changeRole` — after `requireManager`.
- `PlatformUsersService.setMembershipRole` — after
  `requirePermission("platform.users.role")`.

Both then call `revocation.revokeMembership(id, "ROLE_CHANGED")` when `changed`.
If this spec results in two places that know the last-manager rule, it has
failed.

---

## 4. Data: nothing to migrate

Every value this spec renders is already stored and already written to on the
hot path. Set out so the "no migration" claim can be checked rather than
believed:

| Panel | Reads | Written by |
|---|---|---|
| Student · classes | `ClassEnrollment` → `Class` → `ClassCourse` → `Course` | enrolment and class-course assignment |
| Student · solved / attempted | `StudentExerciseProgress.status`, `attemptCount`, `bestScore`, `firstSolvedAt`, `lastAttemptAt` | the judge, on every submission |
| Student · active learning time | `StudentCourseLearningDay.activeSeconds`, `activeIntervals` | the learning-activity flush |
| Student · streak / last active | `StudentCourseLearningDay.localDate`, `ClassEnrollment.lastLearningSeenAt` | same |
| Student · points | `StudentPointBalance.earnedTotal`, `spentTotal` | `PointAward` |
| Teacher · classes | `Class.teacherMembershipId` (indexed `[teacherMembershipId, status]`) | class assignment |
| Teacher · courses taught | `ClassCourse` for those classes | course assignment |
| Teacher · roster reach | `count(ClassEnrollment)` over those classes | enrolment |
| Team lead · curriculum | `Course.createdByUserId`, `Course.contentRevision`, `updatedAt` | the course builder |
| Manager · academy scale | `readAcademyStats()` in `platform/academy-stats.ts` | existing |

The index on `Class.teacherMembershipId` was added with the note *"answers
'which active classes is this teacher responsible for'"* — which is precisely
this page's query. `StudentCourseLearningDay` carries
`@@index([membershipId, courseId, localDate])`, which is this page's other one.

The only schema-adjacent change is the comment on
`settablePlatformUserStatuses` (§3.7).

---

## 5. `@cove/shared`

### 5.1 Permissions — `auth/roles.ts`

Three added to `platformPermissions`. `ADMIN` spreads the whole list, so no role
map changes:

```ts
/**
 * A person's participation, across the academies they belong to: their classes,
 * the courses in them, and their totals.
 *
 * Apart from `platform.users.read` because it is a genuine widening and should
 * be refusable on its own. It authorizes structure and totals only — no
 * `StudentAcademyProfile` field, no submitted code, no feedback text. Those stay
 * behind a support grant. §3.4.
 */
"platform.users.participation.read",
/** Changing an academy membership's role from the console. §3.6. */
"platform.users.role",
/** Setting `UserStatus.DELETED`. Apart from `suspend` because suspension is
 * routine and this is not. §3.7. */
"platform.users.delete",
```

### 5.2 Lenses — `platform/users.ts`

```ts
export const userLenses = [
  "everyone", "students", "teachers", "leads", "managers", "operators",
] as const;

export const userLensRoles = {
  everyone: [], students: ["STUDENT"], teachers: ["TEACHER"],
  leads: ["TEAM_LEAD"], managers: ["MANAGER"], operators: [],
} as const satisfies Record<UserLens, readonly AcademyRole[]>;

/** The lens that narrows on the platform axis rather than the academy one. */
export const userLensPlatformRoles = {
  operators: ["ADMIN"],
} as const satisfies Partial<Record<UserLens, readonly PlatformRole[]>>;
```

`renderUsersPage` composes both into the query. Keeping them as two maps rather
than one union is what stops `operators` being modelled as a fifth academy role,
which it is not (§3.3).

`listPlatformUsersResultSchema` gains:

```ts
/** How many people each lens would hold under the *other* active filters. A
 *  tab that cannot state its own population is a tab an operator has to click
 *  to evaluate. */
lensCounts: z.record(userLensSchema, z.number().int().nonnegative()),
```

### 5.3 Participation — `platform/participation.ts` (new)

A new module rather than more of `users.ts`, and the file header carries the
§3.4 line so the next person to add a field reads the rule before adding it.

```ts
/** One class this person sits in, and the courses it teaches. */
export const participationClassSchema = z.object({
  classId: z.uuid(),
  name: z.string().min(1),
  status: classStatusSchema,
  enrolledAt: z.iso.datetime(),
  teacherName: z.string().nullable(),
  courses: z.array(z.object({ courseId: z.uuid(), title: z.string().min(1) })),
});

/** What a student has actually done, as totals. Never an artefact. §3.4. */
export const studentParticipationSchema = z.object({
  classes: z.array(participationClassSchema),
  solvedCount: z.number().int().nonnegative(),
  attemptedCount: z.number().int().nonnegative(),
  totalAttempts: z.number().int().nonnegative(),
  /** Summed from `StudentCourseLearningDay`, academy-local days. */
  activeSeconds: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  /** Consecutive academy-local days ending today or yesterday, else 0. */
  streakDays: z.number().int().nonnegative(),
  pointsEarned: z.number().int().nonnegative(),
  lastActiveAt: z.iso.datetime().nullable(),
  /** Per course, so a stalled course is visible rather than averaged away. */
  courses: z.array(z.object({
    courseId: z.uuid(),
    title: z.string().min(1),
    solved: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    activeSeconds: z.number().int().nonnegative(),
  })),
});

export const teacherParticipationSchema = z.object({
  classes: z.array(participationClassSchema.extend({
    studentCount: z.number().int().nonnegative(),
  })),
  studentReach: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
});

export const leadParticipationSchema = z.object({
  courses: z.array(z.object({
    courseId: z.uuid(),
    title: z.string().min(1),
    isVisible: z.boolean(),
    classCount: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
  })),
});

export const managerParticipationSchema = z.object({
  scale: academyScaleSchema,      // the existing control-tower shape
  classCount: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
});

/** Exactly one branch is populated — the one matching the membership's role. */
export const membershipParticipationSchema = z.object({
  membershipId: z.uuid(),
  academyId: z.uuid(),
  academySlug: z.string().min(1),
  academyName: z.string().min(1),
  role: academyRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
  student: studentParticipationSchema.nullable(),
  teacher: teacherParticipationSchema.nullable(),
  lead: leadParticipationSchema.nullable(),
  manager: managerParticipationSchema.nullable(),
});
```

A discriminated union would be tidier to write and worse to render: the card
shell — academy name, role chip, status, joined date — is identical for all four
and only the body differs, so four nullable branches keep one component with one
switch rather than four components repeating a header.

### 5.4 Mutations — `platform/users.ts`

```ts
export const settablePlatformUserStatuses = [
  "ACTIVE", "SUSPENDED", "DELETED",
] as const;

export const setPlatformUserStatusInputSchema = z.object({
  userId: z.uuid(),
  status: settablePlatformUserStatusSchema,
  reason: z.string().trim().min(8).max(500),
  /** Required for `DELETED` only: the account's email or username, typed. The
   *  same guard `deletePlatformAcademyInputSchema` puts on a slug. */
  confirmHandle: z.string().trim().min(1).optional(),
}).strict();

export const setPlatformMembershipRoleInputSchema = z.object({
  userId: z.uuid(),
  membershipId: z.uuid(),
  role: academyRoleSchema,
  reason: z.string().trim().min(8).max(500),
}).strict();

export const setPlatformUserRoleInputSchema = z.object({
  userId: z.uuid(),
  platformRole: platformRoleSchema,
  reason: z.string().trim().min(8).max(500),
}).strict();
```

### 5.5 Error codes — `errors/codes.ts`

| Code | Means |
|---|---|
| `CONFIRMATION_MISMATCH` | the typed handle does not match the account |
| `LAST_ADMIN_REQUIRED` | revoking the last platform operator |

`LAST_MANAGER_REQUIRED` and `MEMBERSHIP_STATE_CONFLICT` already exist and carry
their meanings unchanged through §3.8's shared function.

---

## 6. `@cove/api`

### 6.1 `PlatformUsersService`

| Method | Permission | Notes |
|---|---|---|
| `list` | `platform.users.read` | + `lensCounts` from one `groupBy` |
| `get` | `platform.users.read` | unchanged shape |
| `participation` | `platform.users.participation.read` | per membership; audits (§3.5) |
| `setStatus` | `platform.users.suspend`, and `platform.users.delete` when the target is `DELETED` | + `confirmHandle` check |
| `setMembershipRole` | `platform.users.role` | delegates to §3.8 |
| `setPlatformRole` | `platform.operators.manage` | refuses the last admin, refuses self |

`participation` takes `{ userId, membershipId }` and is fetched lazily when a
card expands. Keeping it off `get` is deliberate: `get` renders the page header
and must stay one cheap read, and the audit row in §3.5 has to mean *somebody
looked at this*, which it cannot if it fires on every page load.

The existing self-suspension refusal extends to deletion and to platform-role
revocation, for the same reason: an operator must not be able to lock themselves
out of the console in one click.

### 6.2 `lensCounts`

One `groupBy` over `AcademyMembership.role` under the query's `where` with the
lens clause dropped, plus one `count` of `User` where `platformRole = ADMIN`
under the same `where`. Two extra reads on a page that already runs three, and
`Promise.all` alongside them.

Counts are of **accounts**, not memberships — the row is an account (the
sibling-service invariant), so a person who teaches at two campuses must count
once under Teachers. `distinct` on `userId`, not a membership count.

### 6.3 `PlatformParticipationRepository` (new)

Its own repository file beside `platform-users.service.ts`, in the shape of
`teacher-overview.repository.ts` — queries in a repository, shaping in a
service, which is how the analytics surfaces are already built.

One round of `Promise.all` per membership card, ~5 queries, all on existing
indexes (§4). Bounded: at most one card is expanded per academy and a card is
fetched once per open.

---

## 7. The directory

### 7.1 The summary strip

The page opens on who these accounts are, before a row is read.

```
┌──────────────────────────────────────────────────────────────────┐
│  49 accounts                              🏢 across 12 academies │
│  ████████████████████▓▓▓▓▓▓▒▒▒▒░░░░                               │
│  🎓 34 Students  👤 7 Teachers  🛡 3 Team leads  ⚙ 3 Managers      │
│                                    │  🛡 1 Operators  👥 2 No academy │
└──────────────────────────────────────────────────────────────────┘
```

Six cards under one bar. Cards rather than a run of inline numbers: six counts
on a single line read as a sentence to be parsed left to right, where a card is
a figure with a label under a coloured mark and the set is comparable at a
glance.

The bar is four segments in the four role hues — the same device the manager's
control tower uses for one academy, read at the scale of the platform. Fixed
role order rather than sorted by size: a band that reordered itself as the
platform grew could not be compared across two visits, and the shape of the
population is what it exists to show.

Three things are deliberately outside the band. **Operators** are a different
axis (§3.3) and an operator may also manage an academy, so a fifth segment
would make the bar sum to more than the total above it; they sit behind a
divider in the graphite plate. **Accounts in no academy** are in the total and
in no segment, so they are named rather than left as an unexplained gap — and
the band is drawn against the sum of its segments, not the total, or it could
never fill. **The academy spread** answers a question no per-role count does.

Every count is measured under the operator's other filters but **not** under
the Role facet. Filtering to teachers must not collapse the strip to "7
teachers and nothing else": the strip describes the population the facet is
selecting *from*, which is the only reading under which it stays worth looking
at while a filter is on.

### 7.2 Columns

| Column | Width | Change |
|---|---|---|
| **User** | flex | Operator chip becomes the solid graphite plate (§3.3) |
| **Role** | 168 | **New, and a control.** The lead membership's role as a tinted chip that opens a radio menu — the same component shape as the manager's `RoleCell`; `+2` when there are more. See §7.3 |
| **Academy** | 200 | Name only now, with `+N more`. Role and membership status move to the Role and Account columns |
| **Account** | 132 | A filled chip with a dot in all four states (§3.1) |
| **Joined** | 108 | Unchanged |
| **Actions** | 96 | An **Open** arrow, then the `⋯` menu. Open is what nearly every row is clicked for, so it is a button of its own rather than the first item of a menu (§7.3) |

Splitting role out of the affiliation cell is what makes the hue system work: a
chip needs a column to line up in, and a column of chips is scannable in a way
that a hue buried in a two-line cell is not.

### 7.3 Role is a chip; the rest is a menu

Two controls per row, and the split is by how often each is used.

**Role is the chip in its own column**, exactly as it is on the manager's
people table: the same coloured badge, the same chevron faint until hover, the
same radio menu. Burying the most-changed field on the page inside the `⋯` menu
made it a label everywhere a manager reads it as a control.

Two differences follow from the row being an **account** rather than a
membership:

- A person holding roles in several academies gets a menu of *academies*, not
  of roles. "Change *the* role" has no meaning for such an account, and
  silently changing the first would be a wrong write with no error (§3.6).
- A selection opens the reason dialog rather than writing immediately. Every
  console mutation states a reason for the trail, and this one reassigns
  classes and drops enrolments inside somebody else's academy.

A row whose memberships are all inactive renders the plain badge. There is
nothing to press, so nothing offers to be pressed.

**Everything else is behind the glyph**, in the same menu shape as
`people-directory.tsx`'s `RowActions` — `Ellipsis` trigger, `align="end"`,
destructive items under a separator — because an operator who also manages an
academy should not learn two menus.

```
        [→]  [⋯]
              ├────────────────────────────┐
              │ 🛡   Make operator          │  platform.operators.manage
              ├────────────────────────────┤
              │ ⛔  Suspend account         │  danger
              │ 🗑   Delete account         │  danger
              └────────────────────────────┘
```

**Open is not in the menu.** It is what nearly every row is clicked for, so it
is an arrow button beside the glyph. A menu is where the rare and the
destructive go; putting the common case behind two clicks to keep them company
is the wrong trade. The account page's header menu carries a `Change role` item
instead, since that page has no Role column — the table passes
`showRoleChange={false}` so the same write is never offered twice on one row.

Suspended accounts show **Restore** in success green in place of Suspend.
`PENDING_PROFILE` shows neither, unchanged: restoring claims a signup is
finished and suspending punishes somebody for not having filled in a form.

Every destructive item opens the console's existing reason-gated modal —
`ModalContent`, a required reason, submit disabled under 8 characters — rather
than a second confirmation idiom. Delete additionally requires the typed handle
(§3.7).

Server-side refusals — last active manager, last operator — are shown as
returned errors, never predicted by disabling the item. A button disabled by a
rule the browser guessed at is wrong the moment another tab changes the state
it guessed from.

### 7.4 Facets

Academy, **Role**, Account status, Membership status — four `+` chips, one
shape, one place.

Role returns to the toolbar with the rail gone (§3.2), and the
`lens === 'everyone'` splice that used to hide it is deleted along with the
condition that made it necessary.

The **No academy** option moves from the hand-editable `unaffiliated=1`
parameter into the Academy facet as a first entry, since that flag already
exists in `parsePlatformUsersQuery` and has never had a control.

---

## 8. The account page

### 8.1 Header

The page's one deliberately bold element, and the only place the layout departs
from the console's stacked-panel rhythm.

```
┌─────────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░  ← spectrum, 3px   │
│                                                             │
│   ⬤     Kim Ji-woo                        ● Active     ⋯   │
│  (56)   ji-woo@mapo.example                                 │
│         🎓 Student · Mapo    🛡 Team lead · Gangnam          │
└─────────────────────────────────────────────────────────────┘
```

The **spectrum** is the signature: a 3px band across the top of the header, cut
into segments coloured by this person's memberships in `orderMemberships` order.
One blue bar for an ordinary student; a split bar for somebody who is a student
at one academy and a team lead at another.

It earns its place because it answers a question this product asks constantly
and no other element on the page answers at a glance — *what is this account
across Cove* — and because it is the same device as the control tower's
composition band, read at the scale of one person instead of one academy. It is
not decoration standing in for a number: each segment is a membership, and the
segments are what the cards below expand.

An account in no academy gets no band. An empty grey rail would look like a
loading state.

The `⋯` is the same menu as §7.3, so an operator who opened the page to suspend
somebody does not have to hunt for a differently-shaped control.

### 8.2 Structure

```
Header + spectrum
├─ Account            existing IdentityPanel, minus the suspend block
├─ Academies          one expandable card per membership   ← §8.3
├─ Invitations        existing, unchanged
├─ Applications       existing, unchanged
└─ Activity           audit: acts by and upon this account  ← new
```

The suspend control leaves the identity panel for the header menu. A destructive
action wedged into the bottom of an information panel is findable exactly once,
by the person who built it.

**Activity** is item 4 of the console design's §8.3, never built. It reuses
`platform-audit`'s existing list components with a `targetId` filter, so it is
wiring rather than a page.

### 8.3 Membership cards

Each card's head is identical regardless of role — role icon in the role hue,
academy name linking to `/admin/academies/[slug]`, role chip, membership status,
joined date, chevron. The body is role-shaped. The lead membership is expanded
on load; the rest are collapsed and fetch on first open (§6.1).

**Student** — four stat tiles, then classes, then per-course progress.

```
┌ 🎓 Mapo Dlab · Student · Active · joined 2026-03-04 ────────── ▾ ┐
│                                                                  │
│  ┌ Solved ──┐ ┌ Time ────┐ ┌ Streak ──┐ ┌ Points ─┐              │
│  │   84     │ │  12h 40m │ │  6 days  │ │  1,240  │              │
│  │ of 120   │ │ 31 days  │ │          │ │ earned  │              │
│  └─ blue ───┘ └─ teal ───┘ └─ violet ─┘ └─ amber ─┘              │
│                                                                  │
│  Classes                                                         │
│  ├ Level 1 Python · Teacher Park · 2 courses · since 4 Mar        │
│  └ Weekend Algo  · unassigned    · 1 course  · since 11 Aug       │
│                                                                  │
│  Courses                                                         │
│  ├ Intro to Python   ████████████░░░░  48/60   ·  7h 10m          │
│  └ Data Structures   ███░░░░░░░░░░░░░  12/60   ·  2h 05m          │
│                                                                  │
│  Last active 2 days ago                                          │
└──────────────────────────────────────────────────────────────────┘
```

Each tile owns a hue from the panel scale and each hue names a measurement, not
a judgement — the rule the overview primitives already hold: *colour identifies a
section or a measurement, never a child.* There is no green student and no red
student on this page. A student who has solved nothing gets the same blue tile
reading `0 of 120`; the number is the finding, and colouring it red would make
the console editorialise about a child.

Per-course bars rather than one aggregate, because "48 of 120 overall" hides the
case the page exists to surface: a student who finished one course and has not
opened the other.

Active time is spelled `12h 40m` — the console's existing clock formatting —
never as raw seconds.

**Teacher** — the classes they run, the courses in them, roster reach.

```
┌ 👤 Mapo Dlab · Teacher · Active ───────────────────────────── ▾ ┐
│  ┌ Classes ─┐ ┌ Students ┐ ┌ Courses ─┐                          │
│  │    3     │ │    47    │ │    5     │                          │
│  └─ violet ─┘ └─ blue ───┘ └─ teal ───┘                          │
│                                                                  │
│  ├ Level 1 Python  · 18 students · Intro to Python, Data Str.     │
│  ├ Level 2 Python  · 16 students · Algorithms I                   │
│  └ Weekend Algo    · 13 students · no course assigned  ⚠          │
└──────────────────────────────────────────────────────────────────┘
```

Class names link into the console's own class routes — `routes.adminAcademyClass`
— never into the customer's academy shell. That is the §5 rule of the
console-native content management design and it applies here unchanged.

A class with no course carries an amber marker: it is the configuration fault an
operator is most often called about, and this is the one place both halves of it
are visible together.

**Team lead** — courses authored, visibility, how many classes teach each.
**Manager** — the academy's scale strip (`readAcademyStats`) and a link to the
academy's console page, which is where the detail already lives. The manager card
is deliberately the thinnest: the academy page answers everything a manager card
would restate.

### 8.4 States

| State | Shown |
|---|---|
| Card loading | skeleton at the card's own height, so opening does not jump the page |
| Card failed | inline retry inside the card; the rest of the page is unaffected |
| No participation permission | the card head renders; the body reads *"Participation is not available with your permissions"* — a permission answer, not an empty card |
| Student in no class | `EmptyState`: *"Not in a class yet. Enrol them from the academy's classes page."* — an empty screen is an invitation to act |
| Membership `SUSPENDED` | body still renders, head carries the status chip. History is what an operator is usually looking for |

---

## 9. The visual system, in one place

| Token | Where it appears |
|---|---|
| `brand` #1B64DA | Students — lens tab, role chip, solved tile, roster counts |
| `peer` #7C3AED | Teachers — lens tab, role chip, streak tile |
| `teal` #0F766E | Team leads — lens tab, role chip, learning-time tile, course counts |
| `primary` #E8461C | Managers — lens tab, role chip |
| `ink` solid | Platform operators — the only solid chip (§3.3) |
| `warning` | Configuration faults: a class with no course, an unassigned class |
| `danger` | Account trouble and destructive actions, and nothing else |
| `success` | Restore. Never a role, never a student |

Icons are `roleIcons` unchanged — `GraduationCap`, `UserRound`, `ShieldCheck`,
`UserCog` — plus `ShieldCheck` on the operator plate, at the role's own hue.

Motion is one thing: the membership card's expand, 160ms height and opacity,
`prefers-reduced-motion` collapsing it to an instant swap. Nothing animates on
load. A console is opened during an incident and a page that performs on arrival
is a page that wastes the first second of one.

Two accessibility obligations follow from leaning on hue: every role chip states
its role in text beside the icon — colour is never the only carrier — and the
spectrum band is `aria-hidden` with the memberships listed beneath it, since a
3px bar is decoration to a screen reader and the cards are the real content.

---

## 10. i18n

`platform-users.json` (en and ko) gains: `lens.leads`, `lens.managers`,
`lens.operators` and their descriptions; `table.role`; `action.*` for the six
menu items; `delete.*` for the confirmation; `role_change.*`; `participation.*`
for tiles, class and course lists, and the five states in §8.4.

`lens.staff` and its description are removed with the lens. `facet.role` is
removed with the facet.

Nothing is borrowed from the `manager` namespace. The console shares
`manager-view`'s *tones*, which are presentation, and never its *copy* — an
operator's page reads in the platform's voice.

---

## 11. Performance

`list` grows by two reads (§6.2), both indexed, in the existing `Promise.all`.

`get` is unchanged, so the page still renders on the server with rows rather
than a spinner.

`participation` is per membership, lazy, cached per card for the page's life. An
account in fifteen academies costs one query round the moment fifteen cards are
opened by hand, which is a thing nobody does.

The rule that keeps it honest: **no participation query fans out over
submissions.** Every total comes from a pre-aggregated table —
`StudentExerciseProgress`, `StudentCourseLearningDay`, `StudentPointBalance` —
which is what those tables exist for, and the `bestScore` comment says so.

---

## 12. Tests

### 12.1 Unit — `@cove/shared`
- `userLensRoles` and `userLensPlatformRoles` cover every lens; `operators`
  contributes no academy role.
- `parsePlatformUsersQuery` round-trips each new lens; the retired `staff`
  string parses to a default rather than throwing.
- `setPlatformUserStatusInputSchema` requires `confirmHandle` for `DELETED` and
  accepts its absence otherwise.

### 12.2 Authorization — the ones that matter
- `participation` refuses without `platform.users.participation.read`, with
  `platform.users.read` alone held.
- `participation` never returns a `StudentAcademyProfile` field. Asserted on the
  serialized payload, not on the mapper — a field added to a `select` later must
  fail this test.
- `setMembershipRole` refuses without `platform.users.role`.
- `setStatus(DELETED)` refuses without `platform.users.delete` while
  `platform.users.suspend` is held.
- `setPlatformRole` refuses self-revocation and last-operator revocation.

### 12.3 Integration
- `applyMembershipRoleChange` enforces the last-manager rule from *both* callers
  — the manager path and the console path — in one parameterized test. This is
  the test that makes §3.8 worth doing.
- Demoting the last manager of an active academy from the console returns
  `LAST_MANAGER_REQUIRED`.
- A role change from the console bumps the academy's people revision and revokes
  the member's sessions, exactly as the manager path does.
- `participation` writes one audit row per (actor, membership) hour, not one per
  call, and carries `academyId`.
- `lensCounts` counts an account once when it holds the same role in two
  academies.

### 12.4 End-to-end
- Suspend, restore, and delete from the directory row menu, each with its reason,
  each reflected in the row without a reload.
- A student account page: expand the membership card, see classes and totals.
- An operator's row shows the graphite plate and appears under the Operators
  lens.

---

## 13. Phases

| # | Work | Done when | Status |
|---|---|---|---|
| 1 | One page, Role facet, summary strip, retired-path redirects | An operator reads the composition without filtering six times | Done |
| 2 | Row menu + `setMembershipRole` + `applyMembershipRoleChange` extraction | Role, suspend and restore are one menu away from a row | Done |
| 3 | Delete (`DELETED`) with typed confirmation | §3.7 ships, including the copy | Done |
| 4 | Table colour system: role column, operator plate | The table scans by role | Done |
| 5 | Participation API + permission + audit | §3.4 and §3.5 land together, never separately | Done |
| 6 | Account page: header, spectrum, membership cards, Activity panel | A student card answers "which classes, how much work" | Done |

Phases 1–4 touch no learning data and could have shipped on their own. Phase 5
did not ship without its audit row: the widening in §3.4 is defensible only
because §3.5 accompanies it.

---

## 14. Where the build differs from the design

Six departures, each because the design was wrong about a detail rather than
because it was inconvenient.

**The lens rail was built, then removed.** It shipped first as six tabs with
live counts, which made the duplication §3.2 now describes impossible to miss:
the rail and the Role facet were the same narrowing, and the facet had to be
hidden on five of the six tabs to stop them contradicting each other. What the
rail was actually good for was its numbers, and six numbers spread across six
tabs is the worst shape for a statistic. The rail, `user-lens.tsx`, the
`UserLens` type and its three maps, the six routes and `render-users-page.tsx`
are all gone; `UserComposition` and one Role facet replace them. §3.2 and §7.1
are rewritten rather than annotated, because the design was wrong rather than
unimplementable.

**The audit filter is `targetIds`, not `targetId`.** §8.2 assumed an account's
history is written under one target. It is not: suspending is keyed on the
user, changing a role on the membership. A single-id filter would have silently
omitted the entries an operator most wants. `parseAuditQuery` accepts repeated
`?target=` for the same reason.

**Activity is two reads merged.** The audit service ANDs its filters, so one
call cannot ask both "by this account" and "upon it". The panel takes the
newest ten of each and the newest ten of the union, which is the same answer.

**`computeStreakDays` is in the service, exported.** It is the only piece of
participation shaping with a rule worth testing without a database — today and
yesterday read in the academy's zone, and a walk that stops at the first gap —
and it is unit-tested there.

**The i18n layout budget went from 56 to 58 KiB.** Two error codes pushed
Korean 171 bytes over. `errors` is a layout namespace that gains a line with
every platform surface, and Korean was already within 50 bytes of the ceiling —
the next code would have broken it regardless. The namespace split the budget's
own comment asks for is still the right move and is still not a side effect of
a feature: the candidates are read from 35–43 files each and fail by rendering
raw keys on a student's page. `locales.spec.ts` records this, and names
splitting `errors` itself as the better target.

**Account status became colourful.** §3.1 originally spent colour only on
trouble and left `ACTIVE` a grey dot. That is the right rule for a column
nobody reads and the wrong one for the column an operator opens this page to
read, and it made a manager's green `Active` and an operator's grey dot two
vocabularies for one fact. All four states are now filled chips carrying a dot.
The half of the rule that mattered is untouched: no status borrows a role hue,
and nothing colours a person.

**Role changed from a menu item to a chip.** §7.3 had every write behind the
`⋯`, which made the most-changed field on the page the least reachable one and
a label everywhere a manager reads it as a control. It is now the same badge
and radio menu as `people-directory.tsx`'s `RoleCell`, and `Open` came out of
the menu to sit beside the glyph as an arrow button. `useRoleChange` in
`user-action-dialogs.tsx` holds the flow, so the chip and the account page's
header menu are two entrances to one dialog rather than two copies of it.

### 14.1 Still open

**Erasure.** §3.7 stands: `DELETED` is a lock, not a deletion, and the five
`Restrict` relations are why. A right-to-erasure request still has nowhere to
land.

**Integration and end-to-end tests.** §12.3 and §12.4 are not written. The unit
layer is: lens maps and the status/role input schemas in `@cove/shared`, the
streak in `@cove/api`, the lens presentation maps in `@cove/web`. What is
missing is the pair that matters most — `applyMembershipRoleChange` enforcing
the last-manager rule from both callers, and the assertion that a serialized
`participation` payload carries no `StudentAcademyProfile` field. Both need the
test database harness.
