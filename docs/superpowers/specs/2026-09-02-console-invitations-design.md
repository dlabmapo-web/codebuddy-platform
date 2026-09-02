# Console Invitations: Choose the Academy, Then Invite

**Date:** 2026-09-02
**Status:** Implemented 2026-09-02
**Scope:** `/admin/invitations` — sending and watching invitations across every academy
**Branch:** `feat/platform-admin-console` (continues)

## 1. Summary

A manager invites somebody into *their* academy: the academy is implicit, and
the form asks for an email and a role. An operator has no academy, so the
console's version asks for one more thing — **which academy** — and is
otherwise the same act, sent through the same procedure, arriving on the same
link.

That is the whole feature, and most of it is already built:

- **The send needs no new endpoint.** `academyInvitations.create` guards on
  `academy.members.manage`, which `platformViewPermissions('MANAGER')` holds,
  which is what `AcademyAccessService.platformRead` grants an operator in any
  academy. The same route `academyCourses.create` takes today.
- **The email needs no new plumbing.** It is queued in the router after the
  invitation commits (`academies.router.ts`), deliberately so a mail outage
  never fails the call. Call the existing procedure and the whole delivery
  ladder comes with it — attempt rows, provider webhooks, bounce evidence, and
  the five-resends-an-hour limit.
- **The acceptance flow needs nothing at all.** `/invite/<token>` already moves
  the token into an httpOnly cookie, previews the invitation without a session,
  offers both doors, hands sign-up the academy pre-chosen and locked, comes
  back after email verification, and refuses acceptance from any address but
  the invited one. A console-sent invitation is indistinguishable from a
  manager's from step two onward.

What is missing is the **read**. `academyInvitations.list` takes one
`academyId`; nothing can answer "every invitation on the platform, and whether
it arrived". That, and a page to put it on.

### 1.1 Why the console needs this at all

The same reason the applications queue exists, stated in
`platform-applications.contract.ts`: an invitation is sent behind
`academy.members.manage`, which `MANAGER` holds and nobody else does. **An
academy with no active manager cannot invite anybody** — including the person
who would become its manager. Today the console answers that one case with the
First manager panel on the academy detail page, which sends a `MANAGER`
invitation and nothing else.

Every other case — a customer whose only Team Lead left, a manager who cannot
work out why a parent never got the email, an academy that needs a teacher
seated today — currently ends with an operator opening a support grant and
standing inside the customer's studio to press a button they are already
permitted to press.

### 1.2 What this is not

It is **not** a second invitation model. Create, revoke and resend all call the
academy's own procedures. A second implementation would mean a second role
ceiling, a second audit shape, and a second delivery ladder for one act — the
rule `platformApplications` was written under, kept.

It is **not** the First manager panel's replacement. See §8.

---

## 2. The design

### 2.1 Where it goes

`PEOPLE` already holds Users and Applications. Invitations joins them, in the
manager's own rail order:

```
PEOPLE
  👥  Users            /admin/users
  📥  Applications     /admin/applications
  ✉️  Invitations      /admin/invitations
```

Applications and Invitations are the two ways into an academy — one pull, one
push — and they belong beside each other.

**No badge.** Applications earns one because it counts the applications *nobody
else can review*; there is no equivalent for invitations. A bounced invitation
in an academy with a manager is that manager's work, and a badge lit by
somebody else's inbox is a badge an operator learns to ignore.

### 2.2 The page

```
Invitations                                    [+ Invite someone]
Every invitation on Cove Studio, and whether it arrived.

┌──────────────┬──────────────┬──────────────┐
│▌✉️ 34        │ ⏳ 12        │ ⚠ 3          │
│  Invitations │  Pending     │  Bounced     │
│  across 9    │  4 expiring  │  2 in acade- │
│  academies   │  this week   │  mies with   │
│              │              │  no manager  │
└──────────────┴──────────────┴──────────────┘

[Search email] [Academy ▾] [Status ▾] [Delivery ▾]     [Columns ▾]

Email                Academy       Role     Status   Delivery       Expires
parent@example.com   D.Lab Mapo    Student  Pending  ✓ Delivered    in 5 days  ⋯
                     /mapo
lead@example.com     D.Lab Mapo    Manager  Pending  ⚠ Bounced      in 6 days  ⋯
                     /mapo                           no active manager
teacher@example.com  Seoul Coding  Teacher  Accepted ✓ Delivered    —          ⋯
                     /seoul-coding
```

Built from the parts the console already has: `DataTable` with the academy
facet, the summary strip pattern from `ContentSummary`, `StateBadge` from
`content-columns.tsx` for status, and the delivery chip from the manager's
`invitations-table.tsx`.

### 2.3 Status and delivery are two columns, and stay two

`invitation-delivery.ts` states the rule this page must not break:

> An invitation can be PENDING while its email bounced, and ACCEPTED while its
> last delivery attempt is still only SENT.

So `Status` (PENDING / ACCEPTED / REVOKED / EXPIRED) and `Delivery`
(QUEUED / SENT / DELIVERED / BOUNCED / FAILED) are separate columns with
separate facets. The interface never renders `SENT` as "delivered" and never
infers `DELIVERED` from time passing.

The two are also what the operator is choosing between when they act:
**Resend** is for a delivery problem, **Revoke** is for a status one.

### 2.4 The composer

One dialog, three fields, in the order the decision is actually made:

```
┌─ Invite someone ──────────────────────────┐
│  Academy    [ D.Lab Mapo           ▾ ]    │
│  Role       [ Student              ▾ ]    │
│  Email      [                        ]    │
│                                           │
│  ⓘ They will get a link that only works   │
│    for this address, for 7 days.          │
│                        [Cancel] [Send]    │
└───────────────────────────────────────────┘
```

- **Academy** is the picker built for `ContentRecordModal` in the curriculum
  pages — fed by the response's `academyOptions`, drawn as a solid form field
  rather than the toolbar's dashed facet chip, pre-filled and locked when the
  facet already holds exactly one academy, and with no default when it does
  not. §5.2 lifts it into a shared console component; it will have two callers.
- **Role** is `RoleSelector`, whose own doc comment already says it is "shared
  by members, applications, and invitations".
- **Email** last, because it is the only free-text field and the one the
  operator is copying out of a support ticket.

On success the dialog does what the manager's does: keeps itself open and shows
the one-time link, through the console's existing `InvitationLink`. Only the
token's hash is stored, so this is the only moment it can be displayed — and
the link is what makes the console usable when the customer's mail provider is
the thing that is broken.

### 2.5 Row actions

| | |
|---|---|
| **Resend** | `academyInvitationDelivery.resend` — rotates the token, moves the expiry, starts a new attempt. Only on PENDING. |
| **Revoke** | `academyInvitations.revoke` — only on PENDING. |
| **Copy link** | Absent, and deliberately. The token is not readable after creation; offering a control that cannot work is worse than not offering it. Resend is the honest answer to "they lost the email". |
| **Open academy** | To `/admin/academies/[slug]`, for the manager-state questions this table raises but cannot answer. |

Both writes already permit an operator: `resend` guards through
`ManagerScopeService.requireManager`, which demands `role === 'MANAGER'` — and
`platformRead` reports exactly that, because the console client drops the
view-role cookie (`orpc.ts`, `shouldForwardViewRole`). **That is load-bearing
and non-obvious, and wants a comment where the page calls it.**

### 2.6 The summary strip

Three tiles, following the academy facet as every console strip does, and
naming the academy when the facet holds exactly one — the treatment added to
`ContentSummary` on 2026-09-02.

| Tile | Total | Second line |
|---|---|---|
| Invitations | every invitation in scope | *n* accepted |
| Pending | still open | *n* expiring this week |
| Bounced | delivery in `BOUNCED` or `FAILED` | *n* in academies with no manager — `danger` when above zero |

The third tile's second line is the page's reason for existing, and when it
reads zero the page is saying something true and pleasant: every invitation
that failed has somebody who can resend it.

---

## 3. Routes

| Route | |
|---|---|
| `/admin/invitations` | new — the queue |
| `/invite/<token>` | unchanged |
| `/signup?invited=1&academy=…` | unchanged behaviour, one fix in §7 |
| `/admin/academies/[slug]` | unchanged — keeps the First manager panel (§8) |

---

## 4. API work

### 4.1 One permission

`platform.invitations.read`, beside `platform.applications.read` in
`platformPermissions`, documented the same way: the console's question is
"across all of them", and no academy-scoped endpoint can answer it. It carries
an email address and a role — identity rather than learning data — and
authorizes no submission, no grade and no profile field.

`ADMIN` holds every platform permission today, so the map needs no edit beyond
the list itself.

### 4.2 One contract, reading only

```ts
export const platformInvitationsContract = {
  list: oc
    .input(listPlatformInvitationsInputSchema)
    .output(listPlatformInvitationsResultSchema),
};
```

No `create`, no `revoke`, no `resend` — for the reason
`platformApplicationsContract` has no `review`.

### 4.3 The row

`platformInvitationSchema`, modelled on `platformApplicationSchema`:

```ts
{
  id, academyId, academyName, academySlug,
  email, role, status, expiresAt, createdAt,
  /** The latest attempt, exactly as the manager's page reads it. Null when
   *  nothing has been queued — an invitation created before delivery existed,
   *  or one whose queue call failed. */
  delivery: invitationDeliverySchema.nullable(),
  /** False when this academy has no active manager: the rows nobody but an
   *  operator can resend. Computed server-side from the same predicate every
   *  other console surface calls an academy leaderless with. */
  academyHasManager: boolean,
  /** Who sent it, and whether they were staff of that academy or one of us.
   *  On a cross-academy list this is the difference between "we did this" and
   *  "they did"; without it the audit trail is the only way to tell. */
  invitedBy: { displayName: string | null, isOperator: boolean } | null,
}
```

### 4.4 The input

`listPlatformInvitationsInputSchema` mirrors the applications one: `query`
(matches email), `academyIds`, `statuses`, `deliveryStates`, `leaderlessOnly`,
`sort`, `direction`, `page`, `pageSize`.

`statuses` defaults to `["PENDING"]` for the reason applications defaults to
pending: the queue's job is what is still open, and everything else stays one
facet chip away, because an operator asked "what happened to my invitation" has
to be able to find a revoked one.

The service must run the same lazy expiry `academyInvitationService.list` runs —
`PENDING` rows past `expiresAt` are marked `EXPIRED` before the read — or the
console would show a live-looking invitation the academy's own page calls dead.

### 4.5 Not touched

`academyInvitations.create` / `revoke`, `academyInvitationDelivery.list` /
`resend`, `academyInvitations.preview` / `accept`, and the delivery webhook.
The console calls the first four and inherits the rest.

---

## 5. Component work

### 5.1 New

- `admin/invitations/page.tsx` — server-rendered first page, as every console
  table is, with the `PlatformShell` and the denied/unavailable split the
  applications page already draws.
- `_components/invitations-table.tsx` — the table, the summary strip, the row
  actions, and the composer's host.
- `_components/invitation-composer.tsx` — the dialog of §2.4.
- `_lib/invitations-query.ts` + spec — parse and serialize, as
  `applications-query.ts` does, so the address owns the filter.
- `_hooks/use-platform-invitations.ts` — the query, keyed on the serialized
  address.

### 5.2 Lifted

The academy picker moves out of
`content/_components/content-record-modal.tsx` into
`admin/_components/academy-field.tsx`. Two callers now, and the rule it
encodes — a solid field rather than a dashed facet chip, because one narrows a
list and the other decides where a record lands — should have one home.

### 5.3 Reused unchanged

`InvitationLink`, `RoleSelector`, `StateBadge`, `DataTable`, `facetSelection`,
`PlatformShell`.

---

## 6. i18n

A new `platform-invitations` namespace, added to `platformNamespaces` beside
`platform-applications`, for the reason that list is split: this copy is read
by a handful of Cove staff on one route, and the delivery vocabulary is large.

Reused: `invitations` and `people-ops` for the delivery states and the resend
copy — the same two the manager's page mounts — and `common:role.*` for the
role names, so an operator and a manager read the same word for the same role.

New copy is the page title and description, the three summary tiles, the
composer's labels and its seven-day notice, and the four row actions.

---

## 7. One fix in the acceptance flow

`academies.listForSignup` returns `ACTIVE` academies only. The invited academy
is locked in the sign-up form by id, but its *name* is looked up in that list —
so an invitation into a `SUSPENDED` academy renders a locked field showing the
placeholder rather than the academy. The id in the hidden input is still right
and the sign-up still works; it just looks blank at the moment the recipient is
deciding whether to trust the page.

Nobody could reach that state before, because only a manager could send an
invitation and a suspended academy has no working manager surface. An operator
can.

The fix is not a wider `listForSignup` — that endpoint is unauthenticated and
its list is a directory. The sign-up page already has the answer: the
`cove_invitation` cookie is set on `/` and still present, so the page can call
`academyInvitations.preview` server-side and render the academy as a static
field from the invitation itself. That also removes the form's dependence on
the `?academy=` query parameter, which is a spoofable label today — harmless,
because the membership comes from the invitation row at accept time, but a
label that can lie is worth not having.

---

## 8. The First manager panel stays

`academy-detail.tsx` keeps its panel, and this page does not absorb it.

It is a different act with a different endpoint:
`platformAcademies.resendFirstManagerInvitation` revokes every outstanding
`MANAGER` invitation in the same transaction before creating its replacement,
because an academy must never have two live manager tokens. It also guards on
`platform.academies.create` and refuses once an active manager exists — it is
about one state, on the page that shows that state.

The Invitations page links *to* it: a row whose `academyHasManager` is false
carries a quiet **no active manager** note under the academy, linking to that
academy's detail page.

---

## 9. Decisions taken

**No role ceiling.** An operator may invite a `MANAGER` into an academy that
already has three. That is consistent with `platformViewPermissions('MANAGER')`,
which is the authority this page runs on, and inventing a narrower rule here
would mean the console refuses what the API permits — a difference that only
shows up as a confusing error. The act is attributable:
`academy.invitation.created` is written with the operator as actor and the
target academy's id, so it lands in that academy's audit log and in the
console's own audit trail.

**No new rate limit.** The create path already enforces one pending invitation
per address per academy and refuses an address that is already a member;
resend is limited to five an hour per invitation. Operators are few, named, and
audited.

**Email is not editable after sending.** There is no update endpoint and should
not be: an invitation is bound to its address at the moment the token is minted,
and "change the address" is revoke plus invite, which is two audit records
saying what actually happened.

---

## 10. Sequence

1. `platform.invitations.read`, the schema, the contract, the service, its
   tests. Reads only, so it is shippable and inert.
2. The page, the table, the facets, the summary strip — read-only. Already
   useful: it answers "did it arrive" for every academy at once.
3. Resend and Revoke. Existing endpoints; the work is the confirmation copy and
   the two refusal paths.
4. The composer, and the academy field lifted out of the curriculum modal.
5. §7's sign-up fix.

Steps 1–2 are the read, 3–4 the write, 5 is independent and can land any time.

---

## 10.1 What the build changed

Three small deviations, all recorded here rather than left for the next reader
to find:

- **The delivery vocabulary is asked for through the shell, not by a nested
  provider.** §6 said to reuse `people-ops`; adding it to `platformNamespaces`
  would have put the five delivery states, their explanations and the resend
  copy into every console page's RSC payload. The first attempt wrapped the
  table in its own `PageTranslationsProvider`, as the manager's page does — and
  that shipped a page of raw keys. `useTranslation` resolves to the *nearest*
  i18next instance, and a nested one holds only what it was given, so every
  console namespace beneath it fell through to that instance's `defaultNS` and
  rendered the manager's control-tower copy under this page's keys.
  `PlatformShell` now takes a `namespaces` prop and merges it into the one
  instance, with `platform` still first so the default namespace does not move.
  `invitations-summary.spec.tsx` renders against the shipped JSON to keep it
  that way — a mocked `t` that echoes its key cannot see this class of bug.
- **`academy_field.*` moved to the `platform` namespace.** The field was lifted
  out of the curriculum modal (§5.2) and now has two callers in two namespaces;
  its copy went to the one they both already mount.
- **The total tile is qualified by `accepted`, not by the academy count.** §2.6
  gave it "across *n* academies", which the strip's header already says — the
  same fact twice, beside a label the header also carries. A tile's second line
  qualifies its own number, and the only thing that qualifies a total of
  invitations is how many of them worked. It costs one indexed count and turns
  the three tiles into a funnel: sent → still open → bounced.
- **`academyOptions` excludes archived academies.** §4 asked for every academy,
  because the list feeds the composer as well as the facet. Archived is the one
  state where that is wrong: an archived academy cannot take a new member, so
  offering it in a form that sends an invitation would be a control that fails
  on submit.

---

## 11. Testing

- Service: the lazy expiry runs before the read; `leaderlessOnly` uses the same
  predicate as the applications queue; the delivery joined is the *latest*
  attempt, not the first.
- `platform.invitations.read` is required — a user without it is refused, and
  an `ADMIN` is not.
- **The load-bearing one:** an operator with no membership can
  `academyInvitations.create` and `academyInvitationDelivery.resend` against an
  academy, and a Teacher cannot. §2.5 rests on it, and it depends on the
  console client not forwarding a view-role cookie.
- Composer: refuses to send with no academy, no role, or an unparseable email;
  pre-fills and locks the academy when the facet holds one; shows the link
  once; keeps the typed address when the server refuses.
- Table: status and delivery never collapse — a PENDING row with a BOUNCED
  delivery renders both, and the Resend action is offered.
- E2E: send from the console into an academy the operator does not belong to,
  open the link in a clean browser, sign up, and land in that academy with the
  invited role.

---

## 12. Risks

- **Inviting into the wrong academy.** The same hazard the curriculum composer
  has, mitigated the same way: no default when the facet is wide, and the
  academy named in the confirmation beside the one-time link.
- **An operator sending what a manager should send.** The page makes it easy to
  do a customer's work for them. The `no active manager` note and the Bounced
  tile's second line are what keep the operator's own queue visible inside the
  larger list.
- **Delivery evidence read as status.** The one way to get this page wrong.
  §2.3 is the guard, and the test in §11 is the check.

---

## 13. Out of scope

- Bulk invitation from the console. The academy's own people-import wizard
  already does this behind a manager, and a cross-academy CSV is a different
  feature with a different failure surface.
- Editing an invitation's role after sending. Revoke and re-invite.
- A rail badge (§2.1).
- Showing an invitation's full delivery history. The latest attempt answers
  "did it get through"; the history is a debugging question and the audit trail
  is where it belongs.
