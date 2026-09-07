# The Applicant Lobby — Waiting Inside the Academy, Not Outside It

**Date:** 2026-09-04
**Status:** Proposed; §17 adds four corrections and six additions after a second pass
**Scope:** `/academy/[academySlug]` in applicant mode, `AcademyJoinRequest`,
`lobby.*`, `notifications.*`, the `/notifications` socket namespace, the bell in
`HeaderControls`
**Branch:** off `feat/cove-studio-v2`
**Extends:** [Authentication and Authorization](../../design/2026-07-22-cove-v2-authentication-authorization-design.md),
whose join-request flow this keeps unchanged, and
[Teacher Live Monitoring](2026-08-04-teacher-live-monitoring-design.md), whose
socket lifecycle this copies rather than reinvents.

## 1. Summary

Someone who signs up today is put outside the building. `authDestination`
sends them to `/pending` — a card on the login background that says a manager
will review them, with a Check status button. It is honest and it is a dead
end: the person has just chosen Cove, and the first thing Cove shows them is a
waiting room with no product in it.

This document lets them wait **inside** the academy instead. They sign in, land
on the academy overview, and see the real frame — the sidebar, the academy
name, the header controls — with every page reachable and every page empty,
each one saying in one sentence why it is empty and what will fill it. When a
manager approves them, a bell in the top right lights up **on the screen they
are already looking at**, with no refresh and no polling, and one click takes
them into the academy for real.

```
  BEFORE                                AFTER

  signup                                signup
    │                                     │
    ▼                                     ▼
  /pending                              /academy/dlab-mapo   ← the lobby
  ┌────────────────────┐                ┌──────────────────────────────────┐
  │  ⏳ Under review    │                │ ▣ Overview   dlab-mapo      🔔 ◐ │
  │  [Check status]    │                │ ▤ My Courses ┌─────────────────┐ │
  │  [Sign out]        │                │ ▤ My Classes │ Under review    │ │
  └────────────────────┘                │ ▤ Records    │ Applied 11:04   │ │
                                        │              └─────────────────┘ │
   refresh, refresh, refresh            │              Your courses will   │
                                        │              appear here once a  │
                                        │              manager approves.   │
                                        └──────────────────────────────────┘
                                                            │
                                        manager approves ───┤ socket, no refresh
                                                            ▼
                                                     🔔 1  Approved —
                                                          Enter academy →
```

### 1.1 Why not simply improve the pending page

Because the problem is not the copy on that page, it is the position of the
person reading it. A waiting room teaches nothing about the product, gives the
academy nothing to show a parent standing over the shoulder, and makes the
first minute of Cove a page whose only interactive control reloads itself. Every
LXP this product is measured against — Elice's `dlab.elice.io/lxp/home` is the
one named — puts a new account inside the shell immediately and lets emptiness,
rather than a gate, describe the state.

### 1.2 What this is not

- **Not a preview of anybody's data.** An applicant sees no course, no class, no
  roster, no ranking, no submission, and no other person's name. Every page they
  can open is empty *by construction*, not by filtering.
- **Not a role.** The Student/Staff choice at signup remains what
  `AccountKindField` already says it is: it decides what the lobby looks like
  and whether an email is asked for. The academy role still comes only from a
  manager approving the request.
- **Not a general notification system.** §9 builds one bell with two items, on a
  contract that a real notification table can back later without the client
  changing.

## 2. What exists today

| Piece | Where | Behaviour |
|---|---|---|
| Student/Staff choice | `(auth)/signup/_components/account-kind-field.tsx` | Chooses whether an email is asked for. Not stored anywhere. |
| The application row | `AcademyOnboardingService.ensureSignupRequest` | `AcademyJoinRequest`, `status: PENDING`. No membership is created. |
| Where signup lands | `authDestination`, `lib/academy-access-state.ts:69` | `PENDING` → `routes.pending`. |
| Who may enter an academy | `requireAcademyRoute`, `lib/academy-route.ts` | Membership, then support grant, then platform view. An applicant matches none and gets `notFound()`. |
| The waiting screen | `(auth)/pending/*` | Seven states, a manual Check status button, sign out. |
| Approval | `AcademyJoinRequestService.review` | One transaction: membership `ACTIVE`, request `APPROVED`, audit row, people-revision bump. |
| Top right | `components/studio/header-controls.tsx` | Language, Theme, Profile. |
| Realtime | `monitoring.gateway.ts`, `/monitoring` namespace | Token verified in `server.use`, identity on the socket, Redis Streams adapter installed process-wide in `main.ts`. |
| Notifications | — | **Nothing.** No table, no endpoint, no component. |

Two properties of what exists are load-bearing for everything below.

**Authorization is centralized.** Every gated read and write in the API passes
`AcademyAccessService.requirePermission(authUserId, academyId, permission)`.
Whatever an applicant is, if that function refuses them, roughly forty
endpoints refuse them without being edited.

**The socket adapter is process-wide, not namespace-wide.** `main.ts:60` installs
`MonitoringSocketAdapter` with `app.useWebSocketAdapter`, and Socket.IO applies
an adapter set on the server to every namespace on it. A second namespace
inherits cross-instance delivery for free.

## 3. Decisions

### 3.1 Applicant is a fourth source of academy identity, and it holds nothing

`resolveAcademyRoute` already answers from three sources in a deliberate order:
membership, then support grant, then platform view. This adds a fourth, last:
**a `PENDING` `AcademyJoinRequest` for this academy**.

It is last for the same reason the grant fallback is where it is — anybody who
is genuinely a member arrives as that member, and an old application must never
change what a real membership does.

On the API side `AcademyAccessService` gains a matching `applicant` outcome
that holds the **empty permission set**. Not a narrow set: an empty one. Every
existing `requirePermission` call therefore refuses an applicant with no code
change and no chance of one being missed.

### 3.2 The lobby is its own surface, not the real pages with the data filtered out

The tempting shortcut is to let an applicant into the real pages and have each
read return `[]`. That is rejected. It would mean teaching every roster, course,
ranking, records and points endpoint to recognise a caller who is not a member
and answer emptily — dozens of independent branches, each one a place where a
missed `where` clause is a data leak, and each one a permanent tax on code that
currently gets to assume its caller belongs.

The lobby is instead a **separate, thin surface** that calls exactly two things:

- `auth.me`, which the whole app already calls, and
- `lobby.academy`, new, returning an academy's display name, image and points
  flag to a caller holding a `PENDING` application for it.

Its pages render their empty states locally, from nothing. There is no query to
get wrong. If a lobby page ever did call a member endpoint, that endpoint would
403 — the failure mode is a broken page, never a leak.

### 3.3 The lobby's navigation is a fixed list per requested kind

An applicant's eventual role is unknown — that is the entire point of the
request being pending — so the nav cannot be derived from one. Two fixed lists:

**Student**: Overview · My Courses · My Classes · Answer records · My points\*
**Staff**: Overview · My Courses · Courses · Classes · Class ranking\*

\* only when the academy has `STUDENT_POINTS` enabled (§8.3).

The staff list is the Manager/Team-Lead shape, which is the widest of the three
staff shapes. Someone approved as a Teacher will find the nav narrows to theirs.
That is correct and worth saying plainly: the lobby shows *what this academy
does*, not a promise about what this person will be allowed to do. It is also
why the lists live in their own module and not in `studioNavGroups` — that
function's contract is "what this role may see", and the lobby has no role to
pass it.

### 3.4 `requestedKind` is a presentation hint, and never an authorization input

The Student/Staff choice has to be persisted for §3.3 to work, so
`AcademyJoinRequest` gains `requestedKind`. It is written once at signup, read
only by the lobby to pick a nav list, and **never** consulted by
`AcademyAccessService`, by any permission check, or by the approval path. A
manager approving a request still chooses the role, and `canApproveAs` still
governs which roles they may choose. The schema comment must say this, because
a column named after a role is exactly the kind of thing a later change reaches
for by accident.

### 3.5 `/pending` stays, and becomes the terminal screen

Only `PENDING` goes to the lobby. `REJECTED`, `CANCELLED`, a `SUSPENDED`
membership, and "no academy at all" are not people waiting — they are people
whose answer has arrived, or who have nowhere to be. They keep the existing
seven-state pending screen, which already handles reapplying and already reads
correctly for each of them. Nothing in `(auth)/pending/*` is deleted.

This also means the lobby closes the instant an application stops being pending.
A rejected applicant's next request resolves no application, so
`resolveAcademyRoute` falls through and they are redirected out.

### 3.6 The notification is the application row, projected

A `Notification` table is the obvious design and it is premature. The bell has
exactly two items, and both of them are facts already recorded on
`AcademyJoinRequest`: approved, and rejected. Projecting that row into a
notification item costs one nullable column for the read marker and gives
three properties a table would have to work for:

- **It cannot disagree with reality.** The bell *is* the application's status,
  not a copy of it written beside the transaction that changed it.
- **No idempotency problem.** There is nothing to write twice, so a retried
  approval cannot produce two bells.
- **No backfill.** Applications that already exist have a status, so they
  already have a correct bell.

The client is nevertheless built against a general contract —
`notifications.list` and `notifications.acknowledge` returning typed items with
a `kind` discriminant — so that when a second event source arrives (an
invitation received, feedback from a teacher, points awarded) a real table can
back the same endpoints and the client does not change. §15 records that as the
expected next step, not as a regret.

### 3.7 Realtime goes on a second namespace, not on `/monitoring`

`/monitoring` is for people inside a classroom: its rooms are classes and
drafts, its middleware resolves membership claims, its rate rules are written
for terminal deltas and awareness cursors, and `MonitoringRevocationService`
can disconnect a socket when a teaching assignment is withdrawn. An applicant
has no membership, no class and no claim; putting them on that namespace would
mean teaching every one of those pieces about a caller who belongs to nothing.

A new `/notifications` namespace instead. It is small enough to describe in a
paragraph: verify the token, resolve the user, join one room named after that
user, emit into it. It inherits the Redis Streams adapter from `main.ts`
without any change to it, because the adapter is a property of the server.

### 3.8 The socket is a courier; HTTP is the source of truth

The bell's state comes from `notifications.list`. The socket's only job is to
say "there is something new", carrying the new item so the UI can show it
instantly without a round trip. On every reconnect the client refetches the
list, so a missed packet during a tunnel costs nothing but a few seconds. This
is the same discipline `MonitoringFeedbackBroadcaster` states for read
receipts: best-effort, null-guarded, and never in the request path — an
approval must succeed whether or not a socket is up.

## 4. Data model

Two additive changes to one table. No new table.

### 4.1 `JoinRequestKind` and `AcademyJoinRequest.requestedKind`

```prisma
/// What a signup said it was asking for, before anybody decided.
///
/// A presentation hint and nothing more: it chooses which empty navigation
/// an applicant is shown while they wait. It is never read by
/// `AcademyAccessService`, never consulted when a request is approved, and
/// grants nothing. The academy role still comes only from the manager who
/// approves, bounded by `canApproveAs`.
enum JoinRequestKind {
  STUDENT
  STAFF
}

model AcademyJoinRequest {
  // …
  requestedKind  JoinRequestKind @default(STUDENT) @map("requested_kind")
  /// When the applicant dismissed the bell for this decision. Null while the
  /// decision is unread, which is what makes the dot appear.
  acknowledgedAt DateTime?       @map("acknowledged_at") @db.Timestamptz(6)
}
```

`@default(STUDENT)` rather than nullable: every existing row predates the
column and a lobby has to render something for them, and the student shape is
both the common case and the narrower one.

`AcademyOnboardingService.ensureSignupRequest` takes the kind — it already
receives the signup path's data — and `joinRequests.create` (the reapply path)
carries it too, defaulting to the kind of the request being replaced.

### 4.2 The index

The bell reads "my unacknowledged decisions", which the existing
`@@index([userId, status])` already serves at the sizes involved: a person has
one or two applications, ever. No new index.

### 4.3 The migration is rollback-safe

Both fields are additive with a default or nullable, so old code running
against the new schema is a valid state — which is what `rollback.sh` produces
when a deploy fails, since migrations are not reversed (deployment guide §6).

## 5. Shared contracts

### 5.1 `packages/shared/src/api/orpc/lobby.contract.ts`

```ts
lobby.academy: { academySlug: string } → {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  /** Whether the academy runs points, so the lobby offers the same rows the
   *  member sidebar will. */
  hasPoints: boolean;
  application: {
    id: string;
    requestedKind: JoinRequestKind;
    createdAt: string;
  };
}
```

Answered **only** for a caller holding a `PENDING` application for that academy;
anyone else gets `ACADEMY_NOT_FOUND`, not `FORBIDDEN`, so the endpoint cannot be
used to enumerate which academies exist.

### 5.2 `packages/shared/src/api/orpc/notifications.contract.ts`

```ts
notifications.list: {} → { items: NotificationItem[]; unreadCount: number }
notifications.acknowledge: { id: string } → { acknowledged: true }

type NotificationItem = {
  id: string;                      // the join request id, in this projection
  kind: 'APPLICATION_APPROVED' | 'APPLICATION_REJECTED';
  academy: { name: string; slug: string };
  role: AcademyRole | null;        // the role approved, when approved
  reason: string | null;           // the manager's note, when rejected
  createdAt: string;               // the review time
  acknowledgedAt: string | null;
};
```

`kind` is a discriminated union from day one so a second source adds a member
rather than a shape.

### 5.3 `packages/shared/src/notifications/events.ts`

Modelled directly on `packages/shared/src/monitoring/events.ts`, including its
rule that **room names are produced here and never accepted from a client**:

```ts
export const notificationsNamespace = '/notifications';

export const notificationRooms = {
  /** One room per Cove user. The only room this namespace has. */
  user: (userId: string) => `user:${userId}`,
} as const;

export const notificationServerEvents = {
  created: 'notification.created',
} as const;

export const notificationCreatedPayloadSchema = z.object({
  item: notificationItemSchema,
});
```

One server event, no client events. A client on this namespace sends nothing;
it listens. That is worth stating because it is what keeps the namespace free
of the rate limiter, the payload-validity budget and the revocation machinery
that `/monitoring` needs.

### 5.4 Error codes

`LOBBY_ACCESS_DENIED` is deliberately **not** added. The lobby endpoint answers
`ACADEMY_NOT_FOUND` (§5.1), and `notifications.*` are ordinary
authenticated-user endpoints that need no new code.

## 6. Authorization

### 6.1 One branch, in the one gate

`AcademyAccessService` resolves an academy caller today as member, grant, or
platform. It gains `applicant`:

```
member    → the membership's effective roles
grant     → the grant's assumed role
platform  → the platform view role
applicant → []            ← new, and empty on purpose
```

Because `requirePermission` asks whether the resolved set contains the
permission, an empty set refuses everything. No endpoint is edited. No endpoint
*can* be forgotten.

### 6.2 The exact list of what an applicant may read

Written out so a reviewer can check it against the diff:

| Endpoint | Why |
|---|---|
| `auth.me` | Already open to every signed-in account. |
| `lobby.academy` | The academy's own name, image and points flag. §5.1. |
| `notifications.list` / `.acknowledge` | Their own application's status. |
| `joinRequests.cancel` | They can already withdraw. Unchanged. |
| `profile.*` (their own account) | My Page is theirs and always was. |

Nothing else. Anything else is a 403 and a bug in the lobby.

### 6.3 The socket grants nothing

Connecting to `/notifications` proves a valid Supabase token and yields
membership of one room named after the connecting user's own id, resolved from
the verified token by the server. A payload never names a room, a user, or an
academy — the same property §5.3 of the monitoring design calls the one thing
v1 lacked.

## 7. Routing

### 7.1 `authDestination`

```ts
// A pending application is no longer a reason to stand outside. Only the
// terminal states are: rejected, cancelled, suspended, and no academy at all.
if (state.kind === 'application' && state.application.status === 'PENDING') {
  return routes.academy(state.application.academy.slug);
}
```

Checked after the active-membership and platform-admin branches, which keep
their current precedence for the reasons already documented there.

### 7.2 `resolveAcademyRoute` reports how it answered

`AcademyRouteIdentity` gains a `via: 'membership' | 'grant' | 'platform' |
'application'` discriminant. The three existing sources set theirs;
`application` resolves last, from `auth.me`'s `applications`, matching this
academy's slug with `status === 'PENDING'`, and carries `roles: []`.

Every existing consumer branches on `roles`, which stays empty, so nothing that
reads an identity today can accidentally treat an applicant as a member.

### 7.3 The framed layout branches once

`(framed)/layout.tsx` is the only place that reads `via`:

```tsx
const identity = await requireAcademyRoute(academySlug);
if (identity.via === 'application') {
  return <LobbyChrome academySlug={academySlug} />;   // children are not rendered
}
return <StudioChrome …>{children}</StudioChrome>;
```

`StudioChrome` is untouched. `LobbyChrome` is a sibling with the same visual
frame — `SidebarProvider`, the sticky header, `HeaderControls` — and a
`LobbySidebar` built from the fixed lists in §3.3.

Not rendering `children` is what makes the surface safe by structure: no page
under `(framed)` executes for an applicant, so no page has to remember to
check.

### 7.4 `proxy.ts` collapses deep lobby paths

Because the layout does not render `children`, a bookmarked
`/academy/x/learn/courses` would render the lobby overview at a URL that
promises courses. A layout cannot see the pathname, so the collapse belongs in
[proxy.ts](../../../packages/web/src/proxy.ts), which already matches
`/academy/:path*`: when the session's academy state for that slug is an
applicant and the path is deeper than the academy root, redirect to the root.

### 7.5 `routes.ts`

The lobby's pages are the same paths members use, so the only additions are
whatever the bell links to. Anything hand-written fails `routes:lint` in CI.

## 8. The lobby surface

### 8.1 The status plate

Above the overview's empty state, and only on the overview: the academy name,
`Under review`, when the application was made, and one sentence of expectation.
It wears the `draft` amber that `NavCountBadge` and the applications table's
PENDING chip already use — one state, one colour, whichever side of the review
you are standing on.

It carries no Check status button. The socket is the check.

### 8.2 Every other page is one sentence

Each lobby page renders a single centred empty state. No skeletons — a skeleton
that never resolves is a page pretending to load. No disabled buttons — an
absent control is honest where a greyed one is a tease.

| Page | The sentence |
|---|---|
| My Courses | Your courses will appear here once a manager approves your request. |
| My Classes | You will see your class, your classmates and your schedule here once you are approved. |
| Answer records | Every problem you solve will be recorded here. Nothing yet — you have not started. |
| My points | Points you earn will be counted here once you join a class. |
| Courses *(staff)* | This academy's curriculum will open here once a manager approves you. |
| Classes *(staff)* | The classes you run will be listed here once a manager approves you. |
| Class ranking *(staff)* | Class standings will appear here once you have a class. |

Both locales, `lobby` namespace, §11.

### 8.3 The points rows are flag-gated

`My points` and `Class ranking` appear only when `lobby.academy` reports
`hasPoints`. An academy that does not run points must not show a child a page
about points they cannot earn — the rule `studioNavGroups` already states — and
a row that vanishes on approval is worse than one that was never there.

### 8.4 What the lobby never shows

No course titles, no class names, no member names or faces, no counts of
anything, no ranking, no academy statistics. The academy's own name and image
are the only academy-owned facts on screen, and the applicant already typed the
academy's name to apply.

## 9. The bell

### 9.1 Where it sits

In [header-controls.tsx](../../../packages/web/src/components/studio/header-controls.tsx),
between `ThemeControl` and `ProfileControl`. Language and Theme are about how
the interface presents itself; the bell and the avatar are about the reader, so
the bell belongs on the avatar's side of that seam.

It renders on both `StudioChrome` and `LobbyChrome`, so an approved member
keeps the same bell in the same place — the control does not appear to have
been part of the waiting experience.

### 9.2 The two items

- **Approved.** "You were approved as *Teacher* at *DLab Mapo*." Primary action:
  **Enter academy**.
- **Rejected.** "*DLab Mapo* could not accept your request," with the manager's
  reason when one was given. Action: **See details**, to `/pending`, which
  already offers reapplying.

Unread → the amber `bg-draft` dot, matching `NavCountDot`. Zero unread draws no
dot at all, for the reason `NavCountBadge` gives: a badge that is always there
stops being read.

### 9.3 Acknowledging, and entering

Opening the panel does not acknowledge. Acting on an item does — clicking
**Enter academy** calls `notifications.acknowledge` and then navigates to
`routes.academy(slug)` followed by `router.refresh()`.

The refresh is not cosmetic. The membership now exists, but the RSC tree the
browser is holding was rendered for an applicant, and without a refresh the
next paint is `LobbyChrome` again over a person who is now a member.

## 10. Realtime delivery

### 10.1 The gateway

`NotificationsGateway`, on `notificationsNamespace`, in a new
`packages/api/src/notifications/` module:

```
server.use  →  bearerFromHandshake  →  auth.verifyAccessToken
            →  prisma.user.findUnique({ where: { authUserId } })   (indexed, unique)
            →  socket.data = { userId }
handleConnection →  socket.join(notificationRooms.user(userId))
```

The token extraction and the "verify with the same service the HTTP surface
uses, so a socket cannot be a second, weaker way in" rule are lifted from
`monitoring.gateway.ts` — including re-reading the token from the handshake on
every reconnection attempt, so a token that rotated while a laptop was closed
does not become a permanently failing socket.

No client events. No rate limiter, because there is nothing to rate limit.

### 10.2 The broadcaster fires after commit

`NotificationBroadcaster`, modelled on `MonitoringFeedbackBroadcaster`:
`attach(server)` in `afterInit`, a null server means silence, and it is called
**after** `AcademyJoinRequestService.review`'s `$transaction` resolves — never
inside it. A socket emit inside a transaction announces a decision that a
subsequent rollback would unmake.

It must not be able to fail the review. Wrapped so a throw is logged and
swallowed: the manager's approval succeeded, and the applicant's next page load
would have told them anyway.

### 10.3 One connection per session, not one per component

`useMonitoringSocket` is deliberately not a singleton — the roster and the
workspace have different lifetimes. The notification socket is the opposite:
one connection per signed-in session, opened by a provider in the studio and
lobby chrome, living as long as the tab. Every signed-in user now holds a
socket, where today only students and watching teachers do, so
`socket.connected` on the Grafana dashboard changes meaning and its alert
threshold has to move with it.

### 10.4 Degradation

| Condition | Result |
|---|---|
| Redis absent | The adapter is not installed, exactly as `MonitoringSocketAdapter` already logs. Single-instance delivery still works — and production is single-instance today. |
| Socket cannot connect | The bell still works. `notifications.list` is fetched on mount and on window focus, so an approved applicant sees it the moment they return to the tab. |
| Packet missed mid-tunnel | The client refetches the list on every reconnect, so the gap closes in seconds. |
| API restarted by a deploy | Same as above — Socket.IO reconnects, the client refetches. |

Nothing here is a guarantee, and nothing needs to be: the bell is a
convenience over a fact that is durably in Postgres.

### 10.5 The adapter is misnamed after this change

`MonitoringSocketAdapter` will serve two namespaces. Rename it to
`RealtimeSocketAdapter` in the same change — one class, one import in
`main.ts`, mechanical — and keep `monitoringKeyPrefix` for the stream name, so
no running Redis stream is orphaned by a rename.

## 11. i18n

Two new namespaces, both locales, both complete before CI runs:

- `lobby.json` — the status plate, the seven empty-state sentences, the nav
  labels the lobby does not share with `nav.json`.
- `notifications.json` — the bell's label, the two item shapes, the empty panel.

`pnpm --filter @cove/web i18n:check` is in CI and fails on a missing or stale
key in either locale.

## 12. Sequence

1. Schema: `JoinRequestKind`, `requestedKind`, `acknowledgedAt`; migration.
2. Signup carries the kind through `ensureSignupRequest` and `joinRequests.create`.
3. `AcademyAccessService` gains the `applicant` outcome. **Merge-able alone** —
   it changes nothing observable, and every spec that asserts a refusal keeps
   passing.
4. Shared contracts and event constants (§5).
5. `lobby.academy` and `notifications.*` endpoints.
6. `via` on `AcademyRouteIdentity`; `authDestination`; the `(framed)` branch;
   `proxy.ts`.
7. `LobbyChrome`, `LobbySidebar`, the status plate, the empty states, i18n.
8. The bell, over HTTP only.
9. `/notifications` gateway, broadcaster, client provider, adapter rename.
10. E2E.

Steps 1–8 are a shippable release on their own: the bell works, it simply
updates on focus rather than instantly. Step 9 is what removes the refresh.

## 13. Testing

**Unit (web)**
- `authDestination`: `PENDING` → the academy; `REJECTED`, `CANCELLED`,
  `SUSPENDED`, none → `/pending`; active membership and platform admin unchanged.
- `resolveAcademyRoute`: an applicant who is *also* a member of the same academy
  resolves as a member; an applicant for academy A gets no lobby at academy B.
- The lobby nav lists: student and staff shapes, points-flag on and off.

**Unit (api)**
- `requirePermission` refuses an applicant for one representative permission
  from each family — `curriculum.read`, `classes.manage`,
  `academy.applications.review`, `academy.members.credentials.manage`.
- `lobby.academy` answers `ACADEMY_NOT_FOUND` for a member of a different
  academy, for a rejected applicant, and for a signed-in stranger.
- `notifications.list` returns another user's application to nobody.
- The broadcaster is not called when `review` throws.
- `requestedKind` appears in no permission decision (a grep-backed assertion in
  the service spec, as `roles.spec.ts` already does for permission tables).

**E2E** (`e2e/specs/`, following the adopt-journey pattern)
- Sign up as a student → lands on the academy, not `/pending` → My Classes is
  empty and explains why → no other member's name appears anywhere.
- A manager approves in a second browser context → the bell appears **without a
  reload** → Enter academy → the real sidebar, with the student's own rows.
- Sign up as staff → the staff nav shows exactly Overview, My Courses, Courses,
  Classes, Class ranking.
- A rejected applicant lands on `/pending` and cannot open `/academy/<slug>`.

## 14. Risks

| Risk | Mitigation |
|---|---|
| An applicant reaches a member endpoint through a path this document did not anticipate | §6.1 makes the default answer "no". A new endpoint is refused unless someone deliberately opens it. |
| The socket count per API instance grows from "students in class" to "everyone signed in" | §10.3 — one connection per session, and move the Grafana threshold in the same change. |
| `requestedKind` drifts into an authorization decision later | The schema comment, plus the grep-backed spec in §13. |
| The staff lobby promises a wider nav than a Teacher receives | Stated as intended in §3.3; the empty states never claim the person will have these pages. |
| A pending user sits in the lobby for days and nobody reviews them | Out of scope here, but the manager's amber count already exists. A reminder is §15. |

## 15. Out of scope

- A `Notification` table, and any notification other than the two in §9.2. The
  contract in §5.2 is shaped so this is additive.
- Notifications in the platform console's own header.
- Email or push delivery of an approval.
- Any real academy content in the lobby — a course catalogue, an academy
  introduction page, a class timetable. Worth revisiting once the lobby exists;
  an academy's curriculum is a commercial asset and showing it to a stranger is
  an academy-level decision, not a platform default.
- Reminding a manager that somebody has been waiting too long.

## 16. Deployment

Ordinary release, per deployment guide §6. The migration is additive and runs
in the one-shot `migrate` container before the new app starts, so the schema
leads the code; a failed deploy rolls the images back and the extra column is
harmless to the older image.

No new server secret is required.

**Blocker first:** `v2.0.13` is tagged and built but not live — it failed
because `TURNSTILE_SECRET_KEY` is missing from `/opt/cove/secrets/api.env`. That
has to be added and `v2.0.13` landed before this ships as `v2.0.14`.

## 17. Additions after review

§17.1–17.4 are **corrections**: gaps found while writing §1–§16 that the design
above would have shipped with. §17.5–17.9 are **additions** that bring the lobby
in line with what comparable LXPs do with a waiting period. §17.10 is what to
measure afterwards.

Elice's own pending-approval home is not publicly documented — their help centre
covers classroom and member administration only — so §17.5 onward is drawn from
the general pattern rather than from a specific screen: *never leave a new
account with nothing to do, and never let the wait be invisible to the person
who can end it*.

### 17.1 Pick the pending application, not the first one

`resolveAcademyAccessState` takes `account.user.applications[0]`
([academy-access-state.ts:61](../../../packages/web/src/lib/academy-access-state.ts#L61)).
Today that is nearly always right, because `/pending` renders whatever it finds.
Once a `PENDING` application decides *where the person is sent*, first-wins is a
bug: somebody rejected by Mapo who then applies to Gangnam has two application
rows, and the older rejection would keep them out of the lobby they are
entitled to.

The resolution order becomes explicit, and matches the order §3.5 already
implies:

```
1. an ACTIVE membership          → the academy
2. a SUSPENDED membership        → /pending
3. a PENDING application         → that academy's lobby   ← must be preferred
4. any other application         → /pending
5. nothing                       → /welcome
```

Ties inside step 3 — two academies pending at once — resolve to the most
recently created, which is the one the person just applied to.

### 17.2 An academy that stops being ACTIVE closes its lobby

`ensureSignupRequest` checks `status: "ACTIVE"` when the request is *created*
([academy-onboarding.service.ts:41](../../../packages/api/src/academies/academy-onboarding.service.ts#L41))
and nothing re-checks it afterwards. An academy suspended or archived while
somebody's application is pending would still render them a lobby with its name
and image on it, for a school that has closed.

`lobby.academy` therefore requires the academy to be `ACTIVE` as well as the
application to be `PENDING`, and `resolveAcademyRoute`'s applicant branch does
the same. A non-ACTIVE academy falls through to `/pending`, which already reads
correctly for somebody whose application is going nowhere.

### 17.3 Withdrawing has to be possible from inside the lobby

§6.2 permits `joinRequests.cancel` but §8 gave it nowhere to be pressed, which
would have left withdrawal reachable only by signing out and coming back to a
page the person is no longer sent to. It goes on the status plate as a quiet
secondary action — plain text, not a button, beneath the applied-at line — and
lands on `/pending` in the `CANCELLED` state, which already offers reapplying.

### 17.4 "This isn't my academy"

Your own deployment guide warns that `dlab-mapo` and `mapo-dlab` differ only in
word order, and the signup selector lists every active academy. Applying to the
wrong one is not a hypothetical; it is the single most likely thing to go wrong
in this flow, and today the only recovery is to withdraw, sign out, and start
again.

The status plate carries a second quiet action — **Apply to a different
academy** — which cancels the current request and returns to the academy
selector with the session intact. It reuses `joinRequests.cancel` and
`joinRequests.create`; no new endpoint. This matters more than it looks: an
applicant sitting in the wrong academy's lobby is invisible to the manager who
should have received them, and both sides experience it as Cove being broken.

### 17.5 The overview says where they are in the process

Above the empty state, a three-step tracker — the smallest thing that turns
dead time into progress:

```
   ●───────────●───────────○
   Account     Under       Join a
   created     review      class
   ✓           ⏳
```

Static, derived entirely from the application row, no new data. Its value is
that it names a third step: an approved account is not the end, and a student
who is approved but not yet enrolled in a class needs to know that the empty
class page is still correct. That state exists today and explains itself to
nobody.

### 17.6 One real thing to do while waiting

The lobby's primary action is **Complete your profile** — photo, display name,
timezone, language — linking to My Page, which is already theirs and already
permitted (§6.2). It is the only genuinely productive action an applicant can
take, it makes the manager's applications table show a face instead of a
placeholder, and it means the lobby asks something of the person rather than
only telling them to wait.

Shown only while the profile is incomplete, and it disappears when it is done
rather than turning into a tick. A finished checklist that stays on screen is
furniture.

### 17.7 Email the decision — but only to somebody who has an address

Resend is already wired and already sends invitations
(deployment guide §3), so an approval email is close to free and is what every
comparable product does.

The sharp edge is Cove-specific: **a student has no address.** Their identity
carries a generated `no-email.cove.invalid` address and `emailIsPlaceholder`
is exactly the flag that says so
([schema.prisma](../../../packages/api/prisma/schema.prisma), `User.emailIsPlaceholder`).
So the rule is one line and must be written as one:

```
send the approval email when  user.emailIsPlaceholder === false
```

Never "when an email exists" — one exists for everybody, and mailing it would
send every child's approval into a domain that does not resolve, which is a
bounce rate that damages the sending domain your invitations depend on.

For students the bell is the only channel, which is an argument for §10, not
against it.

### 17.8 Tell the manager, with the same bell

The lobby makes waiting pleasant; it does not make it shorter. The thing that
makes it shorter is the manager knowing. They have an amber count on their
sidebar today, which only works if they are already looking at Cove.

So the second notification kind is **`APPLICATIONS_WAITING`**, delivered to
every member of an academy holding `academy.applications.review`, over the same
bell, the same namespace and the same room — the room is keyed by user, so this
needs no new room shape. It is emitted from the same place the application is
created.

This is deliberately the point at which §3.6's projection stops paying: an
academy-scoped, coalescing, addressed-to-many notification is not a row on
`AcademyJoinRequest`. **This is the change that should introduce the
`Notification` table**, and §5.2's contract exists so that when it does, the
bell component does not change. Phase 2, not this release.

### 17.9 The arrival has to be announced, not just drawn

An item that appears over a socket appears without the reader having done
anything, so a screen-reader user gets no event at all. The bell's live region
is `aria-live="polite"` and announces the item's own sentence — the same
sentence §9.2 renders — once, on arrival. Polite rather than assertive: an
approval is good news, not an interruption worth talking over whatever they
were reading.

The same reasoning that put `role="status"` on `NavCountBadge` rather than
leaving it a bare number.

### 17.10 Measure the wait, once it is comfortable

A lobby that is pleasant to sit in is a lobby people sit in longer, and the
failure this design could introduce is an academy that stops noticing
applicants because they have stopped complaining.

Two numbers, both derivable from rows that already exist —
`AcademyJoinRequest.createdAt` to `reviewedAt`:

- **median time to review**, per academy, and
- **applications pending longer than 72 hours**, which is the one worth putting
  in front of a platform admin.

No new instrumentation and no new table. Worth adding to the platform console's
academy detail page when §17.8 ships, since both are about the same neglect.

### 17.11 What these change above

- §3.5 gains the ordering in §17.1 and the ACTIVE check in §17.2.
- §5.1 `lobby.academy` requires an ACTIVE academy.
- §8.1 the status plate carries two secondary actions (§17.3, §17.4) and the
  tracker (§17.5); §8 gains the profile CTA (§17.6).
- §9 gains the live region (§17.9).
- §13 gains: the resolution-order table as a unit test with one case per row;
  an archived academy closing a lobby; the approval email firing for a staff
  applicant and **not** for a student one.
- §15 no longer lists the approval email as out of scope for staff. The
  manager-facing notification and the `Notification` table remain out of scope
  for this release, but §17.8 now names what will bring them in.
