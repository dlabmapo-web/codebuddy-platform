# Team Lead Application Review Design

**Date:** 2026-08-28
**Branch:** `feat/team-lead-application-review`
**Status:** Implemented on the branch; pending `pnpm -r build` and deploy

## 1. Purpose

A person who signs up for an academy waits in `academy_join_requests` until
somebody approves them, and today that somebody can only be a Manager. The
Applications page, its list endpoint, and its review endpoint all sit behind
`academy.members.manage`, which `MANAGER` alone holds.

That is a bottleneck rather than a safeguard. The person who actually runs an
academy day to day is the Team Lead: they own the curriculum, arrange the
classes, and put teachers in charge of them. A student who signed up this
morning cannot open a single exercise until a Manager — who may not be in the
building — reads a queue that nobody else is allowed to see.

What a Team Lead must not gain is the rest of what that one permission carries.
Approving a new arrival as a student is not the same authority as promoting an
existing member to Manager, and it is not the authority to suspend anybody.

## 2. Scope

A Team Lead may **read the academy's pending applications, approve one as
`STUDENT` or `TEACHER`, and reject one with a reason.**

Deliberately excluded, and all of them remain the Manager's alone:

- **Granting `TEAM_LEAD` or `MANAGER`.** A role that can appoint its own peers
  and its own supervisor is not a restricted role. This is the one rule the
  whole design exists to enforce, and it is enforced on the server.
- **A Members page for a Team Lead.** Considered and dropped: changing an
  existing member's role, suspending one, restoring one, bulk operations, and
  the Excel import stay with `academy.members.manage`. A Team Lead seats new
  arrivals; they do not administer the roster.
- **Invitations.** Inviting somebody by email is the other way into an academy
  and it is not part of this change.
- **Any change to what a Manager can do.** A Manager keeps all four roles, the
  same page, the same modal.

## 3. Authorization

### 3.1 A new permission, not a widened one

Add `academy.applications.review` to `academyPermissions`, held by `MANAGER`
and `TEAM_LEAD`.

Adding `TEAM_LEAD` to `academy.members.manage` instead would be one line and
would be wrong. That permission is the gate on:

| Surface | Guard |
|---|---|
| `academyMembers.list` / `changeRole` / `suspend` / `restore` | `academy.members.manage`, nothing further |
| `academyInvitations.create` / `list` / `revoke` | `academy.members.manage`, nothing further |
| the people directory, bulk operations, the import, academy media, academy profile, academy features, the control tower | `ManagerScopeService.requireManager`, which *also* asserts `role === "MANAGER"` |

The second group would survive the widening because of that extra assertion.
The first group would not: a Team Lead would silently acquire `changeRole` —
including the ability to make themselves a Manager — and the whole invitation
surface, through a permission granted for a different reason. §5.3 of the
authorization design says authority is a named capability precisely so that
this kind of accident is a decision somebody has to write down.

So the join-request service moves off `academy.members.manage` and onto the new
permission. `academy.members.manage` is untouched, and every surface listed
above keeps exactly the reach it has today.

### 3.2 The role ceiling

Which roles an actor may grant is a property of the actor's role, and it is a
pure function, so it lives in `@cove/shared` beside `roleHasPermission`:

```ts
/**
 * The roles this actor may grant when approving an application.
 *
 * A Manager seats anybody. A Team Lead seats the two roles below them and
 * neither their own nor their supervisor's — a role that can appoint its own
 * peers is not a restricted role. Every other role holds no review permission
 * at all and gets an empty list, so a caller that forgot the permission check
 * still cannot grant anything.
 *
 * Ordered as `academyRoles` is, so the selector a manager and a team lead see
 * lists the roles they share in the same places.
 */
export function approvableRoles(actor: AcademyRole): readonly AcademyRole[] {
  if (!roleHasPermission(actor, "academy.applications.review")) return [];
  return actor === "MANAGER"
    ? academyRoles
    : (["STUDENT", "TEACHER"] as const);
}

export function canApproveAs(actor: AcademyRole, target: AcademyRole): boolean {
  return approvableRoles(actor).includes(target);
}
```

Derived from the permission rather than listing `MANAGER` and `TEAM_LEAD`
separately: a role added later that holds the review permission and is not a
Manager gets the restricted set by default, which is the safe direction to
fail in.

### 3.3 Where it is enforced

In `AcademyJoinRequestService.review`, immediately after the permission gate
and **before** the transaction opens:

```ts
if (input.decision === "APPROVE" && !canApproveAs(actor.role, input.role)) {
  throw new AppException(
    "JOIN_REQUEST_ROLE_NOT_PERMITTED",
    HttpStatus.FORBIDDEN,
  );
}
```

Before the transaction, and not inside it, for one reason worth stating: the
existing `review` treats a repeated approval with the same role as a success
and returns the request unchanged. If the ceiling were checked after that
branch, a Team Lead replaying an approval that a Manager had already granted as
`MANAGER` would receive a success for an act they may not perform. The refusal
has to be about what was asked, not about what happens to already be true.

Rejection carries no ceiling. It creates no membership and grants nothing;
a Team Lead who may seat an applicant may also decline one.

## 4. What the Team Lead sees

The same page. Not a variant, not a second route — `applications/page.tsx`, the
same table, the same review modal, the same empty state and the same copy.
Three things change around it.

### 4.1 The role selector offers two options

`RoleSelector` takes an optional `roles` list, defaulting to `academyRoles` so
every current caller — members, applications, invitations — is unchanged. The
review modal passes `approvableRoles(role)` for the signed-in actor.

The modal already defaults its state to `STUDENT`, which is inside both sets, so
no clamping is needed. It is still worth asserting in the modal that the held
value is in the list, because that assertion is what a future third role would
trip over rather than silently submitting something the server will refuse.

The client limit is a courtesy. §3.3 is the rule.

### 4.2 The nav's People group splits its gates

`studioNavGroups` currently puts Members, Applications, and Invitations inside
one `if (canManageAcademy)`. Each link takes its own gate instead:

- Members — `canManageAcademy`
- Applications — `canReviewApplications`
- Invitations — `canManageAcademy`

The group is pushed only when it has at least one item, so a Team Lead's People
group holds Applications alone and a Student still has no People group at all.
The Settings group keeps its own `canManageAcademy` check, unchanged.

`canReviewApplications(role)` joins the predicates in
`packages/web/src/lib/academy-access-state.ts`, written the way its neighbours
are — `roleHasPermission(role, 'academy.applications.review')` — so the nav and
the server read the same map rather than two lists that can drift.

### 4.3 The page gains the guard it never had

`applications/page.tsx` performs no role check today. It relied on the nav not
offering the link and on the API refusing the read, so a Teacher who typed the
URL got a rendered page with a red error on it. Now that the page is reachable
by two roles it needs to say which, in the form the Settings page already uses:

```ts
const { academyId, role } = await requireAcademyRoute(academySlug);
if (!canReviewApplications(role)) notFound();
```

`role` also flows down to `ApplicationsManager` and on to `ReviewModal`, which
is how §4.1 knows which set to offer.

## 5. Implementation

### 5.1 Shared — `packages/shared`

- `src/auth/roles.ts`: add `"academy.applications.review"` to
  `academyPermissions` with a comment saying what it does **not** carry (no
  role change on an existing member, no suspension, no invitation); add it to
  `MANAGER` and `TEAM_LEAD` in `academyRolePermissions`; add `approvableRoles`
  and `canApproveAs`.
- `src/errors/codes.ts`: `JOIN_REQUEST_ROLE_NOT_PERMITTED`, beside the other
  three `JOIN_REQUEST_*` codes, with a message that names the limit rather than
  the mechanism — "You can only approve applicants as a student or a teacher."
- `src/auth/roles.spec.ts`: the cases in §8.

### 5.2 API — `packages/api`

`src/academies/academy-join-request.service.ts` only:

- `list` and `review` gate on `academy.applications.review`.
- `review` applies the ceiling per §3.3.
- The audit write is unchanged. It already records `actorUserId`, so
  `academy.join_request.approved` now names whichever of the two roles acted,
  and no audit reader has to learn a new shape.
- `bumpPeopleRevision` on approval is unchanged: an approved application is a
  new member however it was approved, and a bulk selection built before it must
  still be invalidated.

No router change — `academies.router.ts` passes the identity through and the
service owns the gate. No schema change: `reviewAcademyJoinRequestSchema`
already accepts any `academyRoleSchema` value, and it should keep doing so.
The ceiling is an authorization question about the *actor*, and a request
schema cannot see one; encoding it there would move the rule somewhere it
cannot be enforced.

**No database migration.** Nothing in this change touches Prisma, which is
worth knowing at deploy time — the automatic rollback described in the
deployment guide is complete for a release that carries no migration.

### 5.3 Web — `packages/web`

- `src/lib/academy-access-state.ts`: `canReviewApplications`.
- `src/lib/academy-access-state.spec.ts`: true for `MANAGER` and `TEAM_LEAD`,
  false for `TEACHER`, `STUDENT`, and `null`.
- `_components/studio-chrome.tsx`: pass `canReviewApplications(role)` alongside
  the booleans it already computes.
- `_components/studio-sidebar.tsx`: the prop, and the per-link gates of §4.2.
- `_components/role-selector.tsx`: optional `roles` prop, default
  `academyRoles`.
- `applications/page.tsx`: the `notFound` guard, and `role` down to the manager
  component.
- `applications/_components/applications-manager.tsx`: accept `role`, pass on.
- `applications/_components/review-modal.tsx`: accept `roles`, hand it to
  `RoleSelector`.

`applications/loading.tsx`, the table, and the hook are untouched.

### 5.4 i18n

No new keys. The `applications` namespace is already role-neutral, and a Team
Lead seeing two options in a picker needs no sentence explaining the two they
cannot see.

The one string this change does add is the error message in §5.1, which lives
in `packages/shared/src/errors/codes.ts` with its siblings. If a hint under the
role picker is wanted later it must be added to **both** `en` and `ko` —
`pnpm --filter @cove/web i18n:check` fails on a key present in one and not the
other.

## 6. The waiting count in the nav

Approving is only fast if the reader knows there is something to approve.
Neither role has any reason to open the Applications page speculatively, so an
applicant can sit in the queue for a day because nobody thought to look.

The nav row carries the number.

### 6.1 Its own endpoint

`academyJoinRequests.pendingCount`, gated exactly as `list` is: how many people
are waiting to be let into an academy is a fact about that academy, and
somebody who may not read the queue may not read its size either.

Not `list().requests.length`. That call signs a profile-image URL per applicant
to draw a table this caller never renders, and the nav asks on every studio
page entry for every manager and team lead. One count against the existing
`(academyId, status, createdAt)` index is the whole answer.

### 6.2 Read once, for the whole sidebar

`usePendingApplicationsCount(academyId, canReviewApplications)` runs in
`StudioSidebar` rather than inside the badge. The collapsed rail puts the same
number in a tooltip the *button* owns, and two components reading it
independently is how a dot and its tooltip end up disagreeing about how many
people are waiting.

The query key is `['academy', academyId, 'applications', 'pending-count']` — a
*suffix* of the applications page's own key, and deliberately so. React Query
invalidates by prefix, so the review mutation already in
`use-applications-manager` clears this count with no new code: approving the
last applicant empties the badge without either file knowing the other exists.

`enabled` is the permission, so a Student and a Teacher never earn a 403 on
every page entry. It refetches on window focus — the moment the number is most
likely to have moved — and on no interval at all: an application is not urgent
to the second, and a timer on a layout that never unmounts is a request every
academy pays for all day.

### 6.3 What it looks like

**Amber, not red.** The badge wears `draft`, the same amber the PENDING chip
wears in the applications table and on the applicant's own pending screen. One
state, one colour, wherever it is drawn. Red is for something failing, and
somebody who signed up eleven minutes ago is not a failure.

**Filled, not soft.** The soft variant — amber text on `draft-soft` — is the
right weight for a chip inside a table, where the reader is already looking at
the row. The nav badge has the opposite job: it must be *found* without being
looked for, by someone whose eyes are on the page content and who has no
reason to suspect anybody is waiting. So it takes the solid fill, and a new
`--on-draft` token pair carries the label — dark mode lightens the amber rather
than darkening it, so white (5.1:1 on `#A45A08`) and near-black (8.7:1 on
`#E0A34A`) each belong to one theme, exactly as `--on-brand` and its siblings
already work.

**Zero draws nothing.** A badge showing `0` is always there, and a badge that
is always there stops being read — which costs it the only thing it is for.
The empty state is its absence, and that is what makes its appearance
information.

**Capped at `99+`.** Not to protect the layout from four digits so much as to
keep a number nobody reads precisely from pushing the label into a truncation.

**Collapsed to a dot.** At icon width a number is unreadable and a two-character
pill crowding a 20px glyph reads as part of the icon. The rail shows a dot and
the button's existing tooltip carries the count, so nothing is lost.

**Announced as a sentence.** The digits are `aria-hidden` and a visually hidden
label says "3 waiting for approval". Without it the row is announced as
"Applications 3" — a number attached to nothing.

## 7. Deliberately unchanged

- **The manager control tower's attention queue** counts pending applications.
  The Team Lead overview has no such queue and is not gaining one here; a Team
  Lead reaches the queue from the nav. Worth revisiting once this has been in
  use, as its own change.
- **`NavPendingHint`** stays what it is: a link-loading dot, not a badge. It
  and the waiting count of §6 sit on the same row and answer different
  questions — "this navigation is in flight" and "these people need you" — so
  they are separate elements rather than one overloaded dot.
- **The pending screen an applicant sees.** Its copy already says the academy
  is reviewing the application, never who is reviewing it.

## 8. Verification

The role ceiling is the whole risk surface, so it is tested at both levels.

**`approvableRoles` (shared):**

- `MANAGER` returns all four roles
- `TEAM_LEAD` returns exactly `STUDENT` and `TEACHER`
- `TEACHER` and `STUDENT` return empty
- every role in the result of `approvableRoles(actor)` satisfies
  `canApproveAs(actor, role)`, and no role outside it does

**`AcademyJoinRequestService` (api):**

- a Team Lead may list an academy's pending applications
- a Team Lead approving as `STUDENT` creates an `ACTIVE` membership with that
  role, and as `TEACHER` likewise
- a Team Lead approving as `TEAM_LEAD` is refused with
  `JOIN_REQUEST_ROLE_NOT_PERMITTED`, and as `MANAGER` likewise — **and no
  membership row is created**, which is the assertion that proves the check ran
  before the transaction
- a Team Lead approving as `MANAGER` a request a Manager already approved as
  `MANAGER` is refused, not returned as an idempotent success (§3.3)
- a Team Lead may reject, with the reason recorded
- a Teacher and a Student are refused both `list` and `review` with
  `PERMISSION_DENIED`
- a Manager is unaffected: all four roles still approve
- the audit row names the acting Team Lead

**The waiting count (§6):**

- `pendingCount` answers a Manager and a Team Lead, and refuses a Teacher and a
  Student with the same code `list` refuses them with
- the badge renders nothing at zero, and nothing at a negative count that a
  stale cache could produce
- 99 prints as `99`, 140 prints as `99+`, and the spoken label keeps the real
  number in both cases
- the collapsed dot carries the count in its label and cannot take the click
  meant for the link under it

**Web:**

- `canReviewApplications` per §5.3
- the nav gives a Team Lead a People group containing Applications and neither
  Members nor Invitations; a Manager's group still has all three; a Teacher and
  a Student have none
- `/academy/<slug>/applications` answers 404 for a Teacher and a Student

**Manually**, following deployment guide §6 Step 2 against the development
database, signed in as `cove-teamlead` / `CoveDev123!`:

- the Applications link appears, the queue loads, the picker offers two roles
- an approval seats the applicant and they can sign in and reach their courses
- a rejection shows the applicant the rejected state on the pending screen

## 9. Completion criteria

- [x] `academy.applications.review` exists, held by `MANAGER` and `TEAM_LEAD`
- [x] `academy.members.manage` is unchanged, and no surface that used it has
      changed reach
- [x] `approvableRoles` / `canApproveAs` in `@cove/shared`, with tests
- [x] the join-request service gates on the new permission and enforces the
      ceiling before its transaction
- [x] `JOIN_REQUEST_ROLE_NOT_PERMITTED` exists with copy in both message maps
- [x] the Applications page is reachable by a Team Lead and 404s for everyone
      without the permission
- [x] the role picker offers a Team Lead exactly Student and Teacher
- [x] the nav's People group is gated per link
- [x] `pendingCount` is gated on `academy.applications.review`, not on `list`
- [x] the nav badge shows the waiting count, hides at zero, caps at `99+`,
      collapses to a dot, and is announced as a sentence
- [x] approving the last applicant empties the badge without a reload
- [x] no Members, Invitations, or Settings surface became reachable by a Team
      Lead
- [x] typecheck, `pnpm -r test`, `pnpm -r lint`, `routes:lint`, and
      `i18n:check` all pass
- [ ] `pnpm -r build` — the last CI gate, and the one that must be run
      with the dev server stopped (deployment guide §6 Step 3)

## 10. Branch and deployment

Per the deployment guide, `docs/operations/deployment-guide.local.md`.

Work happens on `feat/team-lead-application-review`, branched from
`feat/cove-studio-v2`. Before merging, run everything CI runs, in CI's order
(§6 Step 3) — `pnpm -r build` last, and never while `pnpm dev` is running.

Then §6 Step 4: merge into `feat/cove-studio-v2`, push, wait for CI. This
change is small enough to be worth batching with whatever else is on that
branch — one release for several changes, as §14 of the guide asks.

Release when the batch is ready: the latest tag is `v2.0.9`, so the next is
`v2.0.10` unless another release lands first — check `git tag` before tagging.
Push the tag, then approve `Release Cove v2` in the Actions tab; approval is a
person clicking, and the `gh` CLI on this machine cannot do it.

There is no database migration in this change (§5.2), so if the deploy fails
the automatic rollback restores the previous version completely.

After the deploy, confirm on production that a Team Lead sees the Applications
link and that a Manager's Members and Invitations pages are still there.
