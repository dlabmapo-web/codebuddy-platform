# Two Ways Into an Academy: Open Sign-up and the Console Applications Queue

**Date:** 2026-09-02
**Status:** Implemented
**Scope:** Academy creation, the sign-up selector, and a new console applications queue
**Branch:** `feat/platform-admin-console` (continues)

## 1. Summary

Creating an academy and seating its first manager are currently **one act**.
`createPlatformAcademyInputSchema` requires `managerEmail`; the service always
mints a `MANAGER` invitation inside the same transaction and queues an email
after it. There is exactly one way into a new academy, and it runs through
somebody's inbox.

That is a good path and it stays. But it is the wrong path when the operator
does not yet know who the manager is, when the address is wrong, when email is
not configured, or when the academy is being stood up before its staff are
hired. Today all four force the operator to invent an address.

This spec adds a second way in and keeps the first:

| | Path A — invitation | Path B — open sign-up |
|---|---|---|
| Operator creates | academy **+** a manager invitation | academy, and nobody |
| The person arrives by | a link mailed to a named address | choosing the academy on the sign-up page |
| They land in | the academy, already a `MANAGER` | the pending queue, as an applicant |
| Who seats them | nobody — the token did | an operator, from a new console page |
| Good for | a named manager, an address you trust | staff not yet decided, email not configured |

Both end in the same place: an academy with an active `MANAGER`.

### 1.1 The load-bearing problem

Path B is impossible today, and not because sign-up does not work — it already
does. A person can already choose any active academy on the sign-up page and
land in `academy_join_requests`.

**The problem is that nobody can read that queue.** Applications are reviewed
behind `academy.applications.review`, held by `MANAGER` and `TEAM_LEAD` and by
nothing else. An academy created with no manager has neither role in it. So the
applicants pile up in a queue that no human being on the platform is permitted
to open, including the operator who created the academy.

That is the whole reason this spec contains a console page. Everything else
here is small.

### 1.2 What this is not

It is **not** new write authority. §4 shows an operator may *already* approve
an application in any academy. The missing piece is a cross-academy **list**,
which is a read.

It is **not** a change to who can sign up for what. §7.1 shows the sign-up
selector already offers every active academy to everybody. This spec adds no
academy to that list that would not have been there.

It is **not** a second review implementation. The console calls
`academyJoinRequests.review` — the same procedure a manager's own Applications
page calls, with the same role ceiling and the same audit shape.

---

## 2. What already works

Verified against the code on 2026-09-02. Each of these is a thing **not** to
build:

| Behaviour | Where | State |
|---|---|---|
| A new academy is `ACTIVE` | `schema.prisma`, `status @default(ACTIVE)` | ✅ |
| Sign-up lists every active academy | `AcademyDiscoveryService.listForSignup` | ✅ |
| Choosing one creates a pending request | `AcademyOnboardingService.create` | ✅ |
| An operator may review an application | §4 | ✅ |
| An operator may approve as `MANAGER` | `approvableRoles('MANAGER')` | ✅ |
| A manager can be invited *after* creation | §6.3 | ✅ (needs a rename) |
| Reviewing writes an audit record naming the operator | `academy.join_request.approved` | ✅ |

So Path B's mechanics are almost entirely present. What is missing is a way to
*see* the queue, and permission to create an academy without naming a manager.

---

## 3. Creating an academy without inviting anybody

### 3.1 The input

`managerEmail` becomes optional:

```ts
export const createPlatformAcademyInputSchema = z
  .object({
    name: …,
    slug: …,
    timeZone: …,
    /**
     * Where the first manager invitation is sent, when there is one.
     *
     * Optional, and its absence is a *decision* rather than a missing field:
     * the academy is created open, and whoever signs up choosing it waits in
     * the queue an operator reviews (§5). An operator who does not yet know
     * who will run an academy should not have to invent an address to make
     * one, and the address they invent is the one the invitation goes to.
     */
    managerEmail: z.email().max(200).optional(),
    contactEmail: …,
  })
  .strict();
```

The result's `invitation` and `token` become **nullable** rather than absent, so
one shape covers both paths and the caller branches on a value rather than on
whether a key exists.

### 3.2 The service

One conditional, and everything else unchanged. When no email is given: no
`academyInvitation` row, no `platform.academy.first_manager_invited` audit
record, no `queueForInvitation` call.

The `platform.academy.created` record is written on both paths and gains a
field saying which one was taken:

```ts
after: { name, slug, timeZone, onboarding: managerEmail ? "invitation" : "open" }
```

Recorded because it is the question asked afterwards. An academy that sat empty
for a week is either an invitation nobody opened or an open academy nobody
applied to, and those have different fixes — resend, or go find the applicants.
Without this the audit trail cannot tell them apart.

### 3.3 The form

`/admin/academies/new` currently has a required *Manager email* field and copy
promising an invitation is on its way. It becomes a choice, made before the
field it governs:

```
  How will this academy get its first manager?

  ( ) Invite one by email
      ┌────────────────────────────────────────────┐
      │ manager@academy.example                    │   ← shown only for this choice
      └────────────────────────────────────────────┘
      They get a link that makes them a manager. You can copy the
      link here if the email does not arrive.

  (•) Let them sign up
      The academy appears on the sign-up page straight away. Whoever
      signs up choosing it waits for you in Applications, and you
      decide their role.
```

**Radio buttons, not an optional field.** An email input that may be left blank
does not tell an operator that leaving it blank *does something else*; they read
it as a field they have not filled in yet. The choice is the point, so the
choice is the control.

**"Let them sign up" is the default.** It is the reversible one: an academy
created open can be sent an invitation a minute later (§6.3), while an
invitation already in flight cannot be unsent. The default should be the choice
that is cheapest to change your mind about.

The success screen already shows the invitation link for Path A. For Path B it
shows where the academy now appears and links to Applications, because "nothing
was sent" is a state an operator will otherwise read as a failure.

---

## 4. The operator may already review

`AcademyAccessService.requirePermission` resolves academy access in a fixed
order, and an operator with no membership and no support grant falls to
`platformRead`:

```ts
// academy-access.service.ts:210
if (!platformRoleHasPermission(user.platformRole, "platform.academies.inspect"))
  return null;
const role: PlatformViewRole = isPlatformViewRole(requested) ? requested : "MANAGER";
return platformViewPermissions(role).includes(permission) ? { …, via: "platform" } : null;
```

`platformViewPermissions('MANAGER')` is `academyRolePermissions.MANAGER` minus
`submissions.own.create`, and `academy.applications.review` is in that list. So
`academyJoinRequests.review` already answers yes to an operator, in every
academy, today.

Two consequences worth stating plainly:

**No new write permission.** Adding one would create a second gate on an
operation that already has a working gate, and the two would drift.

**The role ceiling already holds.** `review` calls `canApproveAs(actor.role,
input.role)`, and `actor.role` for an operator on this branch is `MANAGER`, so
`approvableRoles` returns all four academy roles. An operator can seat the first
`MANAGER` — which is exactly what Path B needs — and the rule that a
`TEAM_LEAD` cannot is untouched, because a team lead never reaches this branch.

**The `cove_view_role` cookie is a hazard here.** `platformRead` reads
`currentViewRole()`, so an operator who left the diagnostic role picker on
`TEACHER` gets `platformViewPermissions('TEACHER')`, which holds no review
permission — and the console's Approve button would fail with a permission
error that makes no sense to the person clicking it. The console's browser and
server ORPC clients already omit `x-cove-view-role` (§8 of the native-content
design), so this path is safe today. §11 keeps a test on it, because nothing
else would catch it breaking.

---

## 5. The console applications queue

### 5.1 Reading, across every academy

One new permission, one new procedure:

```ts
/**
 * Every academy's pending applications, in one queue.
 *
 * A read, and only a read — approving one calls the academy's own review
 * procedure, which already permits an operator (§4). This permission exists
 * for the same reason `platform.content.read` does: the console's question is
 * "across all of them", and no academy-scoped endpoint can answer it.
 */
"platform.applications.read",
```

```ts
export const platformApplicationsContract = {
  list: oc
    .input(listPlatformApplicationsInputSchema)
    .output(listPlatformApplicationsResultSchema),
};
```

Input mirrors the content browser's, because an operator narrows the same way
on every console list:

```ts
{
  query?: string,                  // the applicant's name or email
  academyIds?: string[],
  status?: JoinRequestStatus[],    // default: ["PENDING"]
  /** Only academies with no active manager. §5.3. */
  leaderlessOnly?: boolean,
  sort: "createdAt" | "academy",
  direction: "asc" | "desc",
  page, pageSize,
}
```

Each row carries the applicant, the academy, the message, the status, when it
arrived, and **whether that academy has an active manager**:

```ts
{
  id, academyId, academyName, academySlug,
  user: { id, email, displayName, avatarUrls },
  message: string | null,
  status: JoinRequestStatus,
  approvedRole: AcademyRole | null,
  createdAt, reviewedAt, reviewReason,
  /** False when no ACTIVE MANAGER membership exists in this academy. */
  academyHasManager: boolean,
}
```

`academyHasManager` is computed server-side from the same predicate the console
already uses to call an academy leaderless. It is on the row rather than derived
in the browser because it decides how the row is ranked and coloured, and a
client that recomputed it would be a second definition of "leaderless".

### 5.2 Default order: the ones nobody else can handle

Sorted by `academyHasManager` ascending, then `createdAt` ascending — oldest
first within each group.

Not by date alone. An operator is not this platform's application reviewer;
managers are. The queue's job is to surface the applications that **have no
reviewer but them**, and a straight date sort buries a three-day-old applicant
to an empty academy under forty routine student applications that a manager will
handle this afternoon.

Every list ends on `id: "asc"`, for the reason the content browser's does: a page
boundary among rows that tie is otherwise undefined, and an operator paging
through a queue sees one applicant twice and another never.

### 5.3 The page

`/admin/applications`, in the sidebar between **Users** and **Content** — it is
a queue of people arriving, so it belongs beside the people surfaces.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Applications          🏛  across 3 academies                            │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │▌  ⏳   12            │  │▌  ⚠    3             │                     │
│  │       Waiting        │  │       Only you       │                     │
│  │                      │  │                      │                     │
│  │  9 a manager can see │  │  in academies with   │  ← danger when > 0  │
│  └──────────────────────┘  │  no manager yet      │                     │
│                            └──────────────────────┘                     │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ ▌ Applications  12                                                       │
│ 🔍 Search by name or email    ⊕ Academy   ⊕ Status   ⊕ Only you   ⊞ Cols │
│ ──────────────────────────────────────────────────────────────────────── │
│ Applicant          │ Academy       │ Message        │ Waiting │ Status │⋯│
│ ────────────────── │ ───────────── │ ────────────── │ ─────── │ ────── │─│
│ (◕) 김민재          │ ▮No manager▮  │ 제가 원장입니다 │ 3 days  │Pending │→⋯│
│     m@example.com  │ Gangnam DLab  │                │         │        │  │
│ ────────────────── │ ───────────── │ ────────────── │ ─────── │ ────── │─│
│ (◕) Jin-ho Park    │ D.Lab Mapo    │ —              │ 2 hours │Pending │→⋯│
│     jin@ex.com     │ /mapo-dlab    │                │         │        │  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Two tiles, and the second is the point.** *Waiting* is the size of the queue;
*Only you* is the part of it that will still be there tomorrow if the operator
closes the tab. It wears `danger` above zero and **`success` at zero** — the
green state is not decoration, it is the page saying every waiting applicant has
a manager who can seat them. An operator who never sees that state cannot tell
"I am done" from "I have not looked".

*Waiting* is `brand`. It was `primary` in the first build, and in the browser
that was wrong: `primary` is the console's attention hue (`#E8461C`), so an
ordinary queue of one read as an alarm and left nothing louder for the number
that is one.

This is the same device the content browser's summary uses — a count, and
beneath it the one fault its kind can have — and the same rule about loudness:
colour marks what needs somebody, not what merely exists.

**The academy cell is where the fault is shown.** A row in a leaderless academy
puts a red `No manager` chip where the academy slug would be, above the academy
name. It is the reason the row is at the top, so it is stated on the row rather
than left to be inferred from the ordering.

**Waiting is an age, not a date.** *3 days* answers the question an operator has
about a queue; *Aug 30* has to be subtracted from today first. The exact
timestamp is on the row's title attribute and on the applicant's account page.

**The default filter is `PENDING`**, and Status is a facet, so a reviewed
application is one chip away rather than gone. An operator asked "what happened
to my application" needs to find a rejection.

### 5.4 Reviewing

The row's **Review** button opens the manager's own `ReviewModal`, imported
where it stands rather than moved. That is a change from the plan: the console
already reaches into the academy's folders for `ArchiveClassDialog` and
`VisibilityConfirmModal` the same way, so a move would have been churn against
an established direction. What the console needed instead was for the dialog to
stop naming one page's row type — its `request` prop is now the three fields it
actually reads, which is what lets one dialog serve both surfaces.

The role list comes from `approvableRoles` in both. An operator reaches the
academy through the platform branch, which reports `MANAGER`, so all four roles
are offered — including the one that seats an academy's first manager.

Approve and Reject both call `academyJoinRequests.review` with the row's
`academyId`. Nothing new server-side.

Two console-specific rules on top:

**A reason is required when seating a manager in a leaderless academy.** Every
other approval keeps the reason optional, as it is today. The dialog gained two
optional props for it — `notice` and `approveBlockedReason` — both unused by the
manager's page, and the blocked reason is *shown* beside the disabled button
rather than only disabling it: a dead control with no explanation is worse than
no control. This one is the moment
somebody is handed an entire academy on the strength of a claim the platform
cannot check — §9.2 — and the reason field is the only record of why the
operator believed them. The requirement is enforced in the console dialog, not
in the shared `review` procedure, because it is a property of *this* surface: a
manager approving a member of their own academy is not making that decision.

**Refusals are shown, never predicted.** The server refuses a state conflict —
an application already reviewed in another tab — and the dialog surfaces the
returned error without dismissing itself. No item is disabled from a rule the
browser guessed at.

### 5.5 The sidebar badge

`platformApplications.pendingCount`, mirroring `academyJoinRequests.pendingCount`
and for the identical reason its doc comment gives: the nav asks this on every
console page, and `list` signs a profile-image URL per applicant to draw a table
the sidebar never renders.

It counts **only the leaderless ones**. A badge showing every pending
application would sit permanently at some non-zero number that is somebody
else's work, and a badge that is always lit is a badge nobody reads.

---

## 6. Keeping the invitation path

### 6.1 Unchanged

Path A's create flow, the token, the delivery queue, the copy-the-link fallback,
and `InvitationLink` all stay exactly as they are.

### 6.2 The two paths can coexist in one academy

An academy created open can be sent an invitation later; an academy created with
an invitation still appears in the sign-up selector and can receive
applications. Neither excludes the other, and nothing needs to enforce a choice
after creation — `MEMBERSHIP_ALREADY_EXISTS` and the invitation's own
single-use token already make the second arrival a no-op rather than a conflict.

### 6.3 Inviting a manager after the fact

`resendFirstManagerInvitation` already does this. It refuses once an active
manager exists, it revokes outstanding manager invitations in the same
transaction as it writes the replacement, and its `previous?.email ?? ""`
fallback means it works when there is no previous invitation at all — provided
the caller supplies an address.

So Path B → Path A needs **no new endpoint**. It needs two things:

- **A name that is true.** The audit action
  `platform.academy.first_manager_invitation_resent` is wrong for a first send.
  Branch it: `platform.academy.first_manager_invited` when there was no previous
  invitation, `…_resent` when there was. The console's button reads *Invite a
  manager* on an academy that has never had one and *Resend invitation* on one
  that has.
- **Somewhere to press it.** It already exists — the academy roll call's *Invite
  a manager* action on a leaderless academy. Confirm it reaches an academy
  created open, which has no pending invitation for the action to read an
  address from, and that the form asks for one rather than failing on
  `INVITATION_INVALID`.

---

## 7. Sign-up

### 7.1 No change, and that is the finding

`listForSignup` returns every academy with `status: "ACTIVE"`, and a new academy
is `ACTIVE` by default. **A new academy already appears in the sign-up
selector.** The requested behaviour is present; nothing in `@cove/api` or the
sign-up page changes.

This is worth stating rather than quietly not doing, because it also means the
exposure this spec appears to introduce is not new: every active academy is
already offered to every person on the sign-up page, and any of them can already
be applied to. Path B changes who *reads* the resulting queue, not who can join
it.

### 7.2 Considered and rejected: letting the applicant name a role

The obvious next step is a *"I am applying as: Manager / Teacher / Student"*
selector on sign-up, stored as `requestedRole`.

Rejected. A self-declared role is a claim, not a fact, and the reviewer has to
decide anyway — so the field would add a number the operator must ignore while
looking like one they can act on. Worse, the claim that matters most is the one
this spec is most exposed to (§9.2): a stranger asserting they run an academy.
Rendering that assertion as a tidy role chip beside their name makes it look
checked.

The `message` field already exists on `AcademyJoinRequest` and is already shown
on the manager's own table. *"I'm the owner, we spoke to Minjae on Tuesday"* in
free text reads as what it is — something to verify — which is the correct
affordance for an unverified claim.

If it is wanted later it is an additive nullable column and a facet. It does not
need to be decided now.

---

## 8. i18n

Console copy goes in a new page-scoped `platform-applications` namespace, added
to `platformNamespaces` — the same shape as `platform-content` and
`platform-users`, and for the same reason: a student's payload must not carry
the vocabulary for administering an academy.

The **lifted review modal reads `applications`**, which is a layout namespace
and therefore already present under `PlatformShell` — the same mechanism that
lets the content browser's row actions read `courses` and `classes`. Confirm it
on the first modal rendered, not after the page is finished.

Do not move the modal's copy into `platform-applications` to avoid the
dependency. That forks the strings, and the whole point of lifting the modal is
that both pages ask the same question the same way.

Korean lands with English in the same commit. `locales.spec.ts` caps per-layout
payloads; this namespace is page-scoped so it cannot breach that, but adding to
`applications` would — split, never raise.

---

## 9. Risks

**An academy sits empty and nobody notices.** Path B's failure mode is silence:
no invitation was sent, so there is no bounce, no unopened link, nothing to
chase. The console already computes a leaderless condition and already surfaces
it in the academy roll call — this spec's §5.5 badge is the second signal, and
§3.2's `onboarding` field is what tells an investigator which kind of empty they
are looking at.

**The first-manager approval is the privileged moment on this whole surface.**
Approving a stranger as `MANAGER` of an empty academy hands them its curriculum,
its roster, and the ability to appoint everybody else. The platform cannot
verify the claim — there is no prior member to vouch for them and no domain to
check against. §5.4's required reason is the mitigation, and it is a record
rather than a control: it does not stop a wrong approval, it makes one
answerable afterwards. Say so in the dialog's copy rather than implying the
field is a formality.

**The console becomes the routine reviewer.** If operators start clearing
ordinary student applications for academies that have managers, the queue stops
being a backstop and becomes a job. §5.2's ordering and §5.5's leaderless-only
badge are both aimed at this, and the *Only you* tile going to zero is the
signal that the page is working as intended.

**`cove_view_role` narrowing an operator's review.** §4. Covered by a test
rather than by a comment, because the failure is a permission error on a button
that looks like it should work.

**Two review surfaces drifting.** A change to the manager's modal that does not
reach the console's, or a second console-only review procedure appearing later.
The lift in §5.4 is the guard; the component test in §11 keeps it pointed at
both call sites.

---

## 10. Sequence

Each step ships green and is independently reviewable.

0. **Rename the first-invitation audit action** (§6.3) — branch
   `first_manager_invited` from `…_resent`. Independent of everything else, own
   commit.
1. **Optional `managerEmail`** (§3.1, §3.2) — shared schema, service branch,
   nullable result. No UI yet; the existing form keeps sending an address.
2. **The creation form's choice** (§3.3) — radios, conditional field, the Path B
   success screen. Path A must look and behave exactly as it does today.
3. **`platform.applications.read` and the list** (§5.1, §5.2) — permission,
   contract, service, ordering, `academyHasManager`. No UI.
4. **Lift the review modal** (§5.4) — pure refactor, the manager's page
   unchanged, its existing tests are the check. Own commit.
5. **The console applications page** (§5.3) — summary, table, facets, the
   review flow wired to `academyJoinRequests.review`.
6. **The sidebar badge** (§5.5).

Nothing after step 3 should begin until an operator has actually approved an
application from a REST client and watched the membership appear — that is
where §4's assumption is either true or the whole design needs rethinking, and
finding out in step 5 means unpicking a page.

---

## 11. Testing

**Unit.**
- `createPlatformAcademy` with no `managerEmail` — no invitation row, no
  delivery call, `invitation` and `token` null, and the `onboarding: "open"`
  field on the audit record.
- The list's ordering — a leaderless academy's older application sorts above a
  managed academy's newer one, and the `id` tiebreaker holds across a page
  boundary.
- `academyHasManager` against a membership that is `MANAGER` but `SUSPENDED` —
  it must read false, agreeing with every other surface that calls an academy
  leaderless.

**Authorization.** The one that matters most:
- An operator holding `platform.academies.inspect` and no membership passes
  `academy.applications.review` in an academy with no members at all.
- With `cove_view_role=TEACHER` set, the same call still succeeds — §4.
- A `TEAM_LEAD` still cannot approve as `MANAGER`. This spec must not have
  moved that.

**Component.**
- The lifted `ReviewModal` under both shells, asserting the role list differs
  with the actor's role.
- The console dialog refuses to submit a `MANAGER` approval in a leaderless
  academy with an empty reason, and allows it with one.

**Manual, in a browser.** Both suites pass with an empty page, so this is not
optional:

1. Create an academy with *Let them sign up*. No email is sent; the success
   screen says where it now appears.
2. Sign out. The new academy is in the sign-up selector.
3. Sign up as a new person choosing it. Land on `/pending`.
4. As the operator, `/admin/applications` — the application is at the top, with
   a red `No manager` chip and the *Only you* tile reading 1.
5. Approve as `MANAGER` with a reason. The tile drops to 0; the badge clears.
6. Sign in as that person: they are a manager of that academy and can open its
   own Applications page.
7. Create a second academy with *Invite one by email*. Path A behaves exactly
   as it does today, including the copyable link.
8. On the academy from step 1, use *Invite a manager* — it asks for an address
   rather than failing, and the audit says `first_manager_invited`.

---

## 12. What the build found

Two things only running it surfaced, both now fixed and both worth recording:

**A DI failure that typechecks.** `PlatformApplicationsService` injects
`ProfileMediaService` to sign an applicant's photo, and `PlatformModule` did not
import `MediaModule`. `tsc` is happy — Nest fails at boot, and the whole API
stops serving. Any new service reaching for a collaborator outside its own
module has to add the import; the compiler will not say so.

**`primary` is not a neutral hue.** §5.3.

---

## 13. Out of scope

Self-serve academy creation by a customer. Domain verification of an applicant's
claim. Bulk approval. An applicant-supplied role (§7.2). Any change to
invitation delivery, to the token's lifetime, or to the manager's own
Applications page beyond the modal lift. Notifying an applicant that they were
approved — that is the existing `/pending` flow's job and this spec does not
touch it.
