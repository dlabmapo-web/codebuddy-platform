# Platform Administration — Authority and the Academy Lifecycle

**Date:** 2026-08-18

**Branch:** `feat/cove-studio-v2`

**Status:** Proposed — not implemented

**Extends:** [Cove v2 authentication and authorization design](2026-07-22-cove-v2-authentication-authorization-design.md),
whose §6.1, §6.3, §12.3, and §16 this document turns into a buildable surface.

## 1. Purpose

`PlatformRole.ADMIN` exists in the schema, in the shared role enum, and on the
My Page identity card. Nothing anywhere enforces it. There is also no code path
that creates an academy: every academy in every environment exists because
`prisma/seed` inserted it.

This document specifies the smallest coherent slice that fixes both — platform
authority, and the one workflow that authority exists for. An admin can bring a
new academy onto the platform, hand it to its first manager, and control its
lifecycle afterwards. Everything the admin does here is *about* an academy;
nothing here lets an admin read inside one.

### 1.1 In scope

| # | Capability |
|---|---|
| 1 | A platform permission axis, separate from academy permissions, and the service that enforces it |
| 2 | A controlled one-time bootstrap for the first `ADMIN` |
| 3 | Creating an academy and inviting its first manager, in one transaction |
| 4 | The academy lifecycle: `ACTIVE` → `SUSPENDED` → `ACTIVE`, and `ARCHIVED` |
| 5 | An admin-only web surface at `/platform` for the above |

### 1.2 Explicitly deferred

Each of these has been scoped and belongs to a later document. They are named
here so the contracts and permission list below leave room for them rather than
having to be reshaped later.

- Feature-flag switchboard (`AcademyFeatureFlag` is read but written only by seed).
- Emergency manager recovery (auth design §6.3).
- Platform-wide audit log viewer (`AuditLog` is written everywhere, read nowhere).
- Global user directory and account suspension (`UserStatus.SUSPENDED`/`DELETED` are never set).
- Read-only support access (the "Support-only" column of auth design §6.1).
- Email delivery and judge-queue health.
- Plans, seat limits, and cross-academy analytics.

## 2. What exists today

| Fact | Evidence |
|---|---|
| `PlatformRole = USER \| ADMIN` is defined and persisted | `packages/api/prisma/schema.prisma:11`, `packages/shared/src/auth/roles.ts:3` |
| Nothing enforces it | no `requirePlatformAdmin` anywhere in `packages/api/src` |
| A platform admin is actively *refused* by manager surfaces | `packages/api/src/manage/manager-scope.service.ts:38` |
| No academy or organization is ever created at runtime | only `packages/api/prisma/seed/` writes them |
| `AcademyStatus` is checked on every request but never written | `packages/api/src/authorization/academy-access.service.ts:42` |
| `AuditLog.academyId` is nullable in the schema | `packages/api/prisma/schema.prisma:737` |
| …but `AuditService.write` requires it | `packages/api/src/academies/audit.service.ts` — `academyId: string` |
| A route group named `admin` already exists and is V1 legacy | `packages/web/src/app/(admin)/admin/*`, `packages/web/src/app/api/admin/*` |

The last row is why this surface is called **platform**, not **admin**. The
name also happens to be the honest one: the scope is the platform, whereas
every existing studio route is scoped to one `[academyId]`.

## 3. Decisions

### 3.1 Platform authority is a separate permission axis

`platformPermissions` is a new list beside `academyPermissions`, with its own
role map and its own lookup. It is not merged into the academy list.

Two reasons. Auth design §5.3 already forbids reasoning about authority by
enum ordering, and one flat list would invite exactly that. More importantly,
the deferred support-access work (§1.2) has to be grantable *without* implying
academy data access — which is only expressible if the two axes are separate
sets that a single subject can hold independently.

The check is a named permission, never `platformRole === "ADMIN"` at a call
site, for the same reason academy code never compares roles directly.

### 3.2 Organizations stay in the background

An `Organization` is required by `Academy.organizationId`, but it is not a
concept the admin manages in this slice: the admin creates academies and
operates the platform, and academy managers handle everything inside.

So the platform owns exactly one organization, resolved by slug from
configuration and created idempotently the first time an academy is made. The
create-academy form never mentions it.

The consequence is worth stating plainly: `Academy` is unique on
`[organizationId, slug]`, so with a single organization the academy slug is
effectively globally unique. That is the desired behaviour anyway — two
academies sharing a slug would be a support problem long before it was a
database problem.

This is deliberately not a one-org-per-academy design. If a franchise arrives
later wanting several branches grouped under one customer, the fix is to add an
organization surface and re-point some `organizationId` values — a data change
against a schema that already models it. Auto-creating a throwaway organization
per academy would instead leave a pile of meaningless rows to merge.

### 3.3 The first manager is invited, not attached

Creating an academy creates a `PENDING` `AcademyInvitation` with role
`MANAGER`, addressed to an email the admin types, and sends it through the
existing `InvitationDeliveryService`. It does not create a membership.

A brand-new customer has no Cove account yet, so attaching an existing `User`
is not a flow that works when it matters. Reusing the invitation machinery also
means the token hashing, expiry, single-use semantics, and delivery-attempt
tracking are all inherited rather than rebuilt.

The cost is a real state the surface must show: **an academy can exist with
zero active managers.** §5.3 makes that state first-class rather than letting
it be an empty member list nobody notices.

### 3.4 Suspension is a hard block

`academy-access.service.ts:42` already throws `ACADEMY_MEMBERSHIP_SUSPENDED`
whenever the academy is not `ACTIVE`. Suspension therefore needs a write path
and an honest error screen, not a new permission mode.

The alternative — a read-only grace period — would put a degraded branch into
every check across learn, teach, and manage, which is a large change to buy a
softer billing conversation. §7 sets out what is *not* yet covered by that
existing check, because "already enforced" is true of the request path and not
of everything.

### 3.5 The admin gets lifecycle access, never data access

No endpoint in this document returns a submission, a draft, a grade, an
exercise, or a member's profile. The admin sees an academy's name, status,
timezone, contact details, and counts.

`manager-scope.service.ts` already refuses a platform admin without a manager
membership, and that stays true. Support access to academy data is a separate,
audited, time-limited capability (§1.2) that must be built deliberately — not
acquired as a side effect of being able to create academies.

## 4. Data model

Four changes. Everything else this surface needs already exists.

### 4.1 `Academy.statusChangedAt`

```prisma
/// When the platform last moved this academy between ACTIVE, SUSPENDED, and
/// ARCHIVED. Null means it has been ACTIVE since creation.
statusChangedAt DateTime? @map("status_changed_at") @db.Timestamptz(6)
```

`Class` records `archivedAt` instead, but `Class` has one terminal state.
`Academy` has two plus a reversible one, so a column per state would need a
rule about which timestamp wins after a suspend-then-archive. One column and
the current `status` answer it without a rule. The *reason* for the change
lives in `AuditLog.reason`, which is already the right home for it.

### 4.2 `Academy.createdByUserId`

```prisma
createdByUserId String? @map("created_by_user_id") @db.Uuid
createdBy       User?   @relation("AcademyCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)
```

Nullable because every academy that exists today was seeded and has no creator.
`SetNull` so removing a departed admin's account never blocks on an academy
they onboarded. The audit record also captures this, but the list wants to show
it without scanning audit JSON.

### 4.3 `AuditInput.academyId` becomes nullable

```ts
export type AuditInput = {
  actorUserId: string;
  /** Null for platform-scoped actions, which belong to no academy. */
  academyId: string | null;
  …
};
```

The column is already `String?`. Bootstrapping the first admin, and creating an
organization, genuinely have no academy — and an audit trail that cannot record
its most privileged actions is the wrong trade. Existing callers pass a string
and are unaffected.

### 4.4 A new monitoring end reason

```prisma
enum MonitoringVisitEndReason {
  …
  ACADEMY_SUSPENDED
}
```

Required by §7.2.

## 5. Shared contracts

### 5.1 Platform permissions — `packages/shared/src/auth/roles.ts`

```ts
export const platformPermissions = [
  "platform.academies.read",
  "platform.academies.create",
  /** Suspend, restore, archive. Separate from create so a future
   *  support/read-only platform role can hold neither. */
  "platform.academies.lifecycle",
] as const;

export const platformRolePermissions = {
  USER: [],
  ADMIN: [
    "platform.academies.read",
    "platform.academies.create",
    "platform.academies.lifecycle",
  ],
} as const satisfies Record<PlatformRole, readonly PlatformPermission[]>;

export function platformRoleHasPermission(
  role: PlatformRole,
  permission: PlatformPermission,
): boolean;
```

The list holds only what this slice uses. It grows with each deferred item in
§1.2 — `platform.audit.read`, `platform.users.manage`, `platform.support.read`
— which is the point of it being a list.

### 5.2 New error codes — `packages/shared/src/errors/codes.ts`

| Code | Meaning |
|---|---|
| `PLATFORM_ACCESS_DENIED` | Authenticated, but not a platform admin |
| `ACADEMY_SLUG_CONFLICT` | Slug already taken in the organization |
| `ACADEMY_STATE_CONFLICT` | Illegal lifecycle transition (§6.3) |

`PLATFORM_ACCESS_DENIED` is deliberately distinct from `PERMISSION_DENIED`: the
web layer answers it with a 404, and conflating the two would make an academy
member's ordinary denial indistinguishable from a probe at the platform surface
in the logs.

### 5.3 `packages/shared/src/api/orpc/platform.contract.ts`

```ts
export const platformAcademiesContract = {
  list:        oc.input(listInput).output({ academies: [...], total }),
  get:         oc.input({ academyId }).output(platformAcademyDetailSchema),
  create:      oc.input(createPlatformAcademySchema).output({ academy, invitation }),
  setStatus:   oc.input(setAcademyStatusSchema).output(platformAcademyDetailSchema),
  resendFirstManagerInvitation:
               oc.input({ academyId }).output({ invitation }),
};
```

Registered in `orpc-contract.ts` as `platformAcademies`.

**`managerState`** is on every row and is the reason the list is worth opening:

```ts
managerState: z.enum(["active", "awaiting_first_manager", "no_active_manager"]);
```

- `awaiting_first_manager` — no manager membership ever existed; the invitation is still pending or has expired.
- `no_active_manager` — a manager existed and no longer does. This is the recovery case of auth design §6.3, and surfacing it here is what makes that later work obvious rather than discovered during an incident.

`resendFirstManagerInvitation` exists because the ordinary resend path is
manager-scoped, and an academy stuck in `awaiting_first_manager` has, by
definition, no manager to call it. It also accepts a corrected email — the most
likely reason a first invitation went nowhere is a typo. Sending revokes the
prior pending invitation in the same transaction, so a single-use token is
never left live alongside its replacement.

## 6. API

### 6.1 `PlatformAccessService`

New, in `packages/api/src/authorization/`, beside `AcademyAccessService` and
following its shape exactly:

```ts
async requirePlatformPermission(
  authUserId: string,
  permission: PlatformPermission,
): Promise<{ userId: string }>;
```

It loads the user, rejects `PENDING_PROFILE` with `PROFILE_INCOMPLETE` and
`SUSPENDED`/`DELETED` with `USER_SUSPENDED` — matching the academy service so
the two cannot drift — then checks `platformRoleHasPermission` and throws
`PLATFORM_ACCESS_DENIED`.

It reads no membership. A platform admin's authority does not come from one,
which is the whole distinction being drawn.

### 6.2 `packages/api/src/platform/`

```text
platform/
├── platform.module.ts
├── platform.router.ts
├── platform-academy.service.ts     create, list, get, resend
├── platform-lifecycle.service.ts   setStatus and its blast radius
└── platform-organization.ts        resolve-or-create the default org
```

Lifecycle is a separate service from creation because §7 gives it real
collaborators — monitoring revocation, and later the judge queue — that
creation has no business importing.

### 6.3 Creating an academy

One transaction:

1. Resolve the default organization by configured slug, creating it if absent.
2. Normalize and validate the slug; `P2002` on `[organizationId, slug]` maps to `ACADEMY_SLUG_CONFLICT`.
3. Create the `Academy` with `createdByUserId`, `timeZone`, and any contact fields supplied.
4. Create the `MANAGER` `AcademyInvitation`, reusing `AcademyInvitationService`'s token generation and hashing.
5. Write audit `platform.academy.created`, then `platform.academy.first_manager_invited`.

Delivery is dispatched **after** the transaction commits. The existing
invitation flow already separates these, and inverting it would risk an email
carrying a token that rolled back.

`peopleRevision` starts at 0 and is not bumped: there is no roster yet, and no
selection can have been built against it.

### 6.4 Lifecycle transitions

| From | To | Allowed | Note |
|---|---|:---:|---|
| `ACTIVE` | `SUSPENDED` | yes | Reason required |
| `SUSPENDED` | `ACTIVE` | yes | Reason required |
| `ACTIVE` | `ARCHIVED` | yes | Must pass through nothing; reason required |
| `SUSPENDED` | `ARCHIVED` | yes | |
| `ARCHIVED` | anything | **no** | `ACADEMY_STATE_CONFLICT` |
| any | itself | no-op | Returns current state, writes no audit |

`ARCHIVED` is terminal. `Academy` is referenced with `onDelete: Restrict` from
`Organization` and referenced by courses, classes, submissions, and audit rows;
archiving is how an academy ends, and reversing it would mean deciding what to
do about everything that assumed it was over. If a real un-archive need appears,
it should be a separate audited operation with its own name, not a state edge
that makes `ARCHIVED` quietly non-terminal.

Every transition takes a free-text `reason`, stored on the audit record. §6.3
of the auth design requires a documented reason for privileged intervention,
and this is the same class of act.

## 7. What suspension actually reaches

Suspension is only as real as the checks that observe it. This section is the
implementation checklist.

### 7.1 Already enforced — no work

| Surface | Location |
|---|---|
| Every permission-gated academy operation | `authorization/academy-access.service.ts:42` |
| `auth.me` membership hydration | `auth/auth.service.ts:129` |
| Academy profile reads | `profile/academy-profile.service.ts:456` |
| OAuth onboarding intents | `auth/oauth-onboarding-intent.service.ts:20` |
| The signup academy picker | `academies/academy-discovery.service.ts:11` — already filters `ACTIVE`, so a suspended academy disappears from signup |

### 7.2 Not enforced — must be added

**Live monitoring sockets.** `MonitoringRevocationService` has `revokeClass`,
`revokeTeacher`, `revokeStudent`, `revokeScope`, and `revokeMembership` — and
no academy-wide method. A teacher watching a student when the academy is
suspended keeps the socket, because the guard runs at connection time. Add
`revokeAcademy(academyId, "ACADEMY_SUSPENDED")` and call it from
`platform-lifecycle.service.ts` after the transaction commits. The existing
`revoke` implementation is already idempotent, so a retry is free.

**Pending invitation delivery.** Invitations to a suspended academy must not be
sent. Acceptance is already blocked downstream, so an email that can only lead
to a wall is worse than no email.

**In-flight submissions: let them finish.** Grading is queued and idempotent,
and killing a job mid-flight risks a student's work for no gain — the access
service already refuses the *next* submission. Recorded here as a decision, not
an oversight.

**Student session heartbeat.** `StudentSessionService.requireActive` does not
look at the academy. It does not need to: the next academy-scoped request
throws, and the session is a countdown rather than an authority. Also a
decision, not an oversight.

## 8. Bootstrapping the first admin

Per auth design §16 — a one-time controlled command, never an API.

```bash
pnpm --filter @cove/api platform:bootstrap-admin
```

| Requirement (§16) | How |
|---|---|
| Requires an existing verified identity | Looks the user up by email; refuses if absent or unverified |
| Explicit allowlisted email from secure config | `PLATFORM_BOOTSTRAP_ADMIN_EMAIL`; absent means the command refuses to run |
| Refuses to run against an unexpected environment | `PLATFORM_BOOTSTRAP_ENV` must equal the running `NODE_ENV` |
| Idempotent | Already-`ADMIN` prints and exits 0 |
| Writes an audit record | `platform.admin.granted`, `academyId: null`, actor = the promoted user, reason = "bootstrap" |
| Disabled after bootstrap | Removing the env vars disables it; the command says so on success |

Promoting a *second* admin is explicitly not built here. §16 requires a
separately designed high-assurance process, and running the bootstrap command
again against a new email is the wrong shape for it.

## 9. Web surface

### 9.1 Routes

```text
packages/web/src/app/(v2-platform)/
└── platform/
    ├── layout.tsx                 admin guard + nav shell
    ├── page.tsx                   academy list (the landing)
    └── academies/
        ├── new/page.tsx           create + first manager
        └── [academyId]/page.tsx   detail, lifecycle, invitation state
```

A sibling of `(v2-studio)`, not a child. Every studio route below
`/studio/academies/[academyId]` is academy-scoped and its layouts assume a
membership; this surface has neither.

There is no separate dashboard page. The academy list *is* the dashboard —
sorted so that `awaiting_first_manager` and `no_active_manager` float to the
top, because those are the only rows that ever need an admin to act.

### 9.2 The guard

`layout.tsx` resolves the session, calls `auth.me`, and renders
`notFound()` unless `profile.platformRole === 'ADMIN'`.

`notFound()`, not `redirect()` and not a 403 page: a non-admin should not learn
that `/platform` exists. This mirrors `PLATFORM_ACCESS_DENIED` being distinct
from `PERMISSION_DENIED` in §5.2 — the same reticence, at the other end.

The server-side guard is the boundary the API already enforces; the layout
check exists so a non-admin never sees a shell flash before an empty page.

### 9.3 Entry point

A single link, rendered only for `platformRole === 'ADMIN'`, next to the
existing ADMIN branch on `my-page/_components/identity-card.tsx:136` — which
today announces the role and offers nothing to do with it.

### 9.4 Copy

A new `platform` namespace in `packages/i18n/src/locales/{en,ko}/`, and
`platformNamespaces = ["platform", "errors"]` in
`packages/web/src/i18n/namespaces.ts`.

Its own page namespace, never a layout one: this copy is read by a handful of
people and would otherwise ride in every student's RSC payload. The
per-namespace budget in `@cove/i18n`'s `locales.spec.ts` applies.

New audit action keys go in the existing `audit` namespace alongside the
`academy.*` and `class.*` vocabulary already there.

## 10. Audit vocabulary

| Action | `academyId` | Written by |
|---|---|---|
| `platform.admin.granted` | null | Bootstrap command |
| `platform.organization.created` | null | First academy creation |
| `platform.academy.created` | the new academy | §6.3 |
| `platform.academy.first_manager_invited` | the new academy | §6.3 |
| `platform.academy.first_manager_invitation_resent` | the academy | Resend |
| `platform.academy.suspended` | the academy | §6.4, `reason` required |
| `platform.academy.restored` | the academy | §6.4, `reason` required |
| `platform.academy.archived` | the academy | §6.4, `reason` required |

Prefixed `platform.` throughout so the deferred audit viewer can separate
platform intervention from academy self-administration with a filter rather
than a list of action names.

## 11. Testing

### 11.1 Unit

- `platformRoleHasPermission` over the full role × permission matrix, including `USER` holding nothing.
- `PlatformAccessService` for each user status, and for a `USER` who happens to be an academy manager — a manager is not an admin.
- Slug normalization and conflict mapping.
- Every cell of the §6.4 transition table, including the `ARCHIVED` refusals and the no-op.
- `managerState` derivation across: pending invitation, expired invitation, active manager, manager suspended after having been active.
- Bootstrap: wrong environment, missing env, unknown email, unverified email, already-admin idempotency.

### 11.2 Integration

- Academy creation is atomic — a delivery failure leaves an academy with a pending invitation, never a half-created academy.
- The full onboarding path: admin creates → invitation email → recipient signs up → accepts → `managerState` becomes `active` → the manager can invite members through the *existing* manager surface, with no admin involvement.
- Suspension blocks a member mid-session and closes an open monitoring socket with `ACADEMY_SUSPENDED` (§7.2).
- Restore returns exactly the access that suspension removed.
- A non-admin gets 404 at `/platform`, and `PLATFORM_ACCESS_DENIED` from every contract method.

## 12. Build order

Each phase leaves the tree green and is independently reviewable.

| Phase | Contents | Done when |
|---|---|---|
| 1 | §5.1 permissions, §5.2 error codes, §6.1 `PlatformAccessService`, §4.3 audit widening | Unit tests pass; nothing is wired to a route yet |
| 2 | §8 bootstrap command | A real account can be promoted, and re-running is a no-op |
| 3 | §4.1–4.2 migration, §6.2–6.3 create + list + get, §5.3 contract | An academy can be created over RPC and its invitation arrives |
| 4 | §9 web surface for list, create, detail | The whole flow is doable without a SQL client |
| 5 | §4.4, §6.4, §7.2 lifecycle and its blast radius | Suspension is enforced everywhere §7 names |

Phase 3 is the one that changes the business: after it, onboarding a customer
stops being a seed-file edit.

## 13. Open questions

1. **Slug authorship.** Admin-typed, or derived from the name with an override? Derivation is friendlier; a typo in a hand-typed slug is permanent in URLs. Recommend: derive, show it, allow an edit before submit.
2. **Invitation lifetime for a first manager.** The standard invitation expiry is tuned for a member who is expected to be waiting. A new customer's first manager may be slower. Recommend: reuse the standard lifetime, and rely on §5.3 resend rather than a second expiry constant.
3. **Timezone default.** `Academy.timeZone` defaults to `Asia/Seoul`. Should the create form require an explicit choice? Recommend: yes — it is defaulted for the sake of existing rows, and every period boundary on every manager and teacher surface is drawn from it.
