# Student help requests and teacher queue

Date: 2026-09-18
Status: Design for review; implementation deferred.
Branch: `feat/student-help-request-queue`

## 1. Purpose and scope

Let a student explicitly ask their class's teachers for help on a problem. Show
teachers who asked, which problem they asked about, and how long they waited.
Teachers can claim a request, return it to the queue, and mark it resolved.

Three independent facts must stay independent:

- **Learning presence:** a connected student with an open problem is Solving,
  including while quietly reading or thinking.
- **Help request:** the student explicitly asked for assistance.
- **Editing permission:** a teacher explicitly enabled editing for their own
  authorized live watch.

No inactivity threshold, failed submission, pointer movement, watch opening, or
edit-mode transition creates or resolves a request. Claiming a request does not
grant editing permission. Resolving one does not alter an existing watch grant.

Version one includes a student header control, a durable class queue, a queue
panel inside the teacher's live workspace, and realtime refresh notifications.
It excludes chat, required request messages, attachments, priority levels,
estimated response times, automatic teacher assignment, external notifications,
cross-class dashboards, queue analytics, and a request-history screen.

## 2. Reference and existing implementation

The reference was inspected through the user's signed-in browser on 2026-09-18:
[Elice course](https://dlab.elice.io/courses/765886/lectures/all) and its exercise
Tutoring view. The observed view provides a searchable student panel and a
separate Edit mode control beside a read-only editor. An explicit student help
queue was not observed. This design adapts the accessible-in-workspace tutoring
pattern; it does not claim to reproduce an Elice request workflow.

Relevant repository foundations:

- `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/workspace.tsx`
  owns student workspace state; `workspace-header.tsx` accepts teacher indicator
  and feedback controls.
- `packages/api/src/learn/learning-class-context.service.ts` resolves the
  student's delivery class. Shared courses do not justify guessing a class.
- `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/teach/classes/[classId]/_components/live-roster.tsx`
  combines durable enrollment with separately managed live presence.
- `packages/web/src/components/monitoring/student-switcher.tsx` and
  `packages/web/src/lib/monitoring/student-switch-navigation.ts` support student
  navigation without silently dropping pending teacher edits.
- `packages/api/src/monitoring/monitoring-access.service.ts` and
  `packages/api/src/classes/assigned-class-access.ts` enforce class, student,
  material, and effective teacher assignment access, including assistants.
- `packages/shared/src/api/orpc/monitoring.contract.ts` defines durable
  monitoring operations; the monitoring gateway owns connection-sensitive data.
- `HelpModeToggle` requests server-confirmed editing permission. Its existing
  internal `HELPING` mode is not a help-request status.
- The Prisma schema has monitoring visits and teacher feedback, but no student
  help-request entity. Requests must not be stored as feedback or watch visits.

Preserve the guarantees in the related designs:

- [Quiet-student monitoring](2026-09-14-quiet-student-monitoring-design.md)
- [Multi-tab monitoring](2026-09-14-multi-tab-student-monitoring-design.md)
- [Student switcher](2026-09-15-monitoring-student-switcher-design.md)
- [Save and recovery](2026-09-15-monitoring-save-and-recovery-design.md)

## 3. Product approach

Use a queue above the class roster and a compact queue panel in the live
workspace. This makes waiting requests visible both when choosing a student and
while helping one, without permanently narrowing the editor.

A roster badge alone would not explain ordering or ownership. A separate support
dashboard would add navigation and duplicate class context. Neither is included.

### Student experience

Place **Request help** beside the teacher indicator and feedback controls in the
exercise header. Keep the existing Run and Submit hierarchy. The action belongs
to the current academy, validated class, and exercise; staff previews do not show
it. Use the existing monitoring feature flag for version-one availability.

The button submits immediately, without a required form. Disable repeat presses
while sending. Only a successful server response changes the UI to Waiting.

| Request state | Student display and actions |
| --- | --- |
| None | Request help |
| Sending | Sending request; disabled |
| Waiting | Waiting · elapsed time; Cancel request |
| In progress | Teacher name is helping you; Cancel request |
| Resolved | Help marked resolved; Request help again |
| Cancelled | Request help |
| Failed operation | Clear inline error and Retry; preserve confirmed state |

The helping message describes ownership of the request, not proof that a teacher
is currently connected or editing. The existing monitoring indicator continues
to describe actual watching/editing separately.

Allow one Waiting or In-progress request per student per class, across all tabs
and exercises. Another request attempt returns the existing active request and
does not change its problem or timestamp. If it concerns another exercise, show
**Help requested for [problem]**, with a normal navigation link and cancellation
action. The student must cancel or finish that request before requesting help on
another problem in the same class. Other enrolled classes have independent queues.

After explicit resolution the student may request help again, creating a new
request with a new timestamp. Refresh restores the current class's active
request. A resolved notice may disappear on refresh; it is not a history feature.

### Teacher experience

Above the live roster, render **Help requests**, with Waiting and In progress
groups. Show each request's student identity, requested problem, elapsed wait,
availability, and assigned teacher when claimed. Waiting rows use oldest request
first, with request ID as a deterministic tie-breaker. In-progress rows use claim
time, then ID. Do not sort by recent activity or code changes.

In the live workspace header, add **Help requests · N**, where N counts Waiting
requests in the current class. The panel shows both groups and their counts.
It is separate from the student switcher and editing toggle. Opening the panel
does not start watches or fetch every student's code. Keep its trigger count
updated even while closed. An empty queue says **No help requests**.

- **Start helping:** atomically claim a Waiting request for the acting teacher.
  When the student is monitorable, continue to their existing live route. New
  watches start read-only. Already-open watches keep their own permission state.
- **Open live:** navigate independently of claiming. Viewing never claims a
  request, including one owned by another teacher.
- **Return to queue:** clear ownership and return an In-progress request to
  Waiting, preserving its original request time.
- **Resolve:** explicitly close a Waiting or In-progress request, including
  assistance completed verbally without opening live code.

Assigned teachers and assistants can resolve or return a request owned by a
colleague; this avoids stranded requests when a teacher leaves. Clearly identify
the owner, label these actions explicitly, and record the actor. There is no
silent takeover: return the request before claiming it for a different teacher.

Offline students remain listed. Claims and resolution work without a live
connection, allowing in-person help; Open live follows existing eligibility.
If navigation fails after a claim, preserve the claim and offer Retry open and
Return to queue. A claim must never imply that navigation succeeded.

Display the existing editing control as **Edit code**, with an explicit on/off
state and localized explanation. Preserve its server-enforced behavior and
per-watch scope; do not rename protocol modes merely to add this feature.

### Wait time and presentation

Use database timestamps and a server time reference, not activity or browser
creation times. Waiting duration is `serverNow - requestedAt`; freeze the shown
wait at `claimedAt - requestedAt` while In progress and label it **Waited**.
Returning to the queue resumes age from the original request time, including
the claimed interval. This measures request age until the current claim, not
accumulated unattended time. Do not promise an estimated response or queue number.

Refresh the visible clock locally every 15 seconds, using one timer per surface;
do not issue a network request per tick. Clamp display at zero for clock skew.
Include hours/days for long-lived requests rather than silently expiring them.

Use existing theme tokens and Korean/English catalogs. The panel must fit the
viewport, scroll internally, support keyboard traversal and Escape, and restore
focus to its trigger. Give each action an accessible name. Announce request-state
changes politely, but not every clock tick. Do not rely on color alone or move
keyboard focus when a queue row updates. No sound or browser notifications.

## 4. Lifecycle and concurrency

Persist statuses `WAITING`, `IN_PROGRESS`, `RESOLVED`, and `CANCELLED`.

| From | Action | To | Actor |
| --- | --- | --- | --- |
| No active request | Request help | WAITING | Student for self |
| WAITING | Start helping | IN_PROGRESS | Assigned teacher |
| IN_PROGRESS | Return to queue | WAITING | Assigned teacher |
| WAITING / IN_PROGRESS | Resolve | RESOLVED | Assigned teacher |
| WAITING / IN_PROGRESS | Cancel | CANCELLED | Requesting student |
| WAITING / IN_PROGRESS | Request scope becomes invalid | CANCELLED | System |

Terminal rows cannot reopen. A new explicit request creates a new row. Neither
successful submission nor leaving an exercise automatically closes a request.
Disconnecting, closing a browser tab, or teacher sign-out also does not close or
release it. No inactivity or midnight expiration applies in version one.

Use database-enforced active uniqueness and atomic conditional transitions.
Simultaneous claims have one winner. Mutations include a request version and
idempotency key; retries of the same operation return the recorded result, while
stale competing actions return a conflict and current authorized state. A delayed
create retry after resolution must not create another request. Store durable
mutation receipts, scoped to actor and key, in the same transaction as the write.

Reconcile authorization changes independently of browser presence:

- If only the owning teacher loses assignment or eligibility, return the request
  to Waiting and clear ownership; other authorized teachers can take it.
- If the student loses enrollment/eligibility, the class is archived, or its
  requested material is no longer accessible through that class, cancel with
  reason `SCOPE_UNAVAILABLE`. Never leak inaccessible material details.
- Integrate with the existing access-change/revocation paths. Reads and mutations
  also reconcile affected active rows as a fallback, so missing a notification
  cannot expose stale authorized data or leave an invalid owner indefinitely.
- Disabling the monitoring feature hides/disables the surfaces and rejects queue
  operations. It does not delete requests; reconcile eligibility when re-enabled.

## 5. Persistence and authorization

Introduce `StudentHelpRequest` with:

- ID, academy ID, class ID, student membership reference, and material reference.
- Status, assigned teacher reference (nullable), requested time, current claim
  time (nullable), closed time (nullable), updated time, and increasing version.
- Closing actor and reason for student cancellation, teacher resolution, or
  scope invalidation. Record transitions through the existing audit mechanism.

Preserve immutable identity references if nullable live foreign keys are removed,
following the monitoring visit/feedback convention. Do not copy code, terminal
output, student email, or problem statements into requests or audit events.
Titles and names are authorized read projections, with neutral fallbacks for
unavailable records. Terminal requests need no new history UI.

Add a partial unique database index on academy/class/student reference for
`WAITING` and `IN_PROGRESS`, plus indexes for class/status/requested time and
student active-request lookup. Express the partial index in a SQL migration if
the installed Prisma version cannot represent it. This requires no backfill from
existing watches, feedback, or activity.

The server derives student identity from authentication. Validate active student
membership, class enrollment, visible exercise access, and the resolved class
context on creation; never accept an arbitrary student ID from a student caller.

Queue reads and teacher writes require a real effective teacher assignment to
the class, including valid assistant assignments. Explicitly reject the existing
academy-wide platform/support read exception for this queue. Recheck eligibility
for every mutation and subscription; do not treat a previously granted socket
room as lasting authorization. Students can read/cancel only their own requests
and cannot read queue members, counts, or other students' details.

Student cancellation still works for an owned active request whose material
became unavailable, without reopening access to that material; normal scope
reconciliation may already have cancelled it. No teaching assignment is required
to place a request: an unassigned class can retain Waiting requests, with the
student shown **No teacher is currently assigned** instead of a response promise.

Rate-limit creation and mutations using the existing server facility, scoped to
the authenticated actor. Return actionable retry information without changing
request state. Active uniqueness and mutation receipts remain the correctness
mechanisms; client debouncing and rate limiting are not substitutes.

## 6. API and realtime architecture

Keep durable reads/writes in oRPC. Add a focused help-request service, repository
boundary, and broadcaster under monitoring; do not expand the collaboration
document service or make requests depend on a watch session.

Proposed operations under the monitoring contract:

| Operation | Inputs beyond authentication | Result |
| --- | --- | --- |
| getMyActiveHelpRequest | academyId, classId | Active request or null; availability; server time |
| requestHelp | academyId, classId, materialId, idempotencyKey | Created or existing active request |
| cancelMyHelpRequest | academyId, requestId, expectedVersion, idempotencyKey | Confirmed request |
| listClassHelpRequests | academyId, classId, status, cursor, limit | Authorized rows, group counts, next cursor, server time |
| claimHelpRequest | academyId, requestId, expectedVersion, idempotencyKey | Confirmed request |
| returnHelpRequest | academyId, requestId, expectedVersion, idempotencyKey | Confirmed request |
| resolveHelpRequest | academyId, requestId, expectedVersion, idempotencyKey | Confirmed request |

List only active states in version one. Use bounded cursor pages, default 50 and
maximum 100, ordered by the relevant group time and ID. Counts cover the complete
authorized queue, not just a page. Return server capabilities needed to explain
unavailable actions; every write independently authorizes again.

Publish a minimal help-request-changed invalidation after committing a mutation,
to authorized teachers for that class and the requesting student's private scope.
Use the existing Socket.IO/Redis transport and established access revocation.
Inspect room membership before reusing a room: no class-wide payload may reach
other students. Do not include code or queue contents in notification payloads.

The database is authoritative. Notifications invalidate scoped TanStack Query
keys, rather than appending speculative rows. Refetch on successful subscription,
reconnect, window focus, and panel open; guard against changes racing the initial
snapshot. A coalesced 30-second refresh while the surface is visible recovers
missed broadcasts even when the transport still appears healthy. Pause background
refresh in hidden tabs and refresh immediately on return. Deduplicate observers
through shared query keys. Mutations work over HTTP during a socket outage.

Use keys containing academy/class and student identity where relevant. Drop
superseded responses after navigation. On access denial clear protected cached
rows and counts, disable operations, and show unavailable. On a transient read
failure retain clearly marked stale data with Retry; never present a failed read
as an empty queue. Do not optimistically claim ownership or display successful
creation before the server confirms it.

Reuse an existing authorized socket where its ownership permits independent
listeners; otherwise use one scoped queue subscription per mounted workspace.
Closing the queue panel must not tear down the live watch or its editing state.
Keep list fetching, queue freshness, and editor synchronization separate.

## 7. Navigation and problem identity

Keep the request's original material immutable. When the student moves, display
**Requested: A · Currently viewing: B** where current presence is known. Keep
the requested problem visible when presence is unavailable; do not infer the
current problem from the request.

Use the canonical student live route. The watch resolves the current problem
authoritatively. A requested-problem link may use the existing authorized
read-only exercise preview, explicitly distinguished from the current live code.
It must not join another draft or enable edits to the original requested problem.

Same-tab queue navigation reuses the existing pending-edit acknowledgement and
student-switch guard. Complete that guard before initiating a claim-and-navigate
action; cancelling the guard must not claim the destination. After a successful
claim, any later navigation failure leaves a visible recoverable claim. New-tab
Open live links preserve the original watch and do not implicitly claim.

## 8. Implementation boundaries for later work

1. Add the request model, transition receipts, migration, indexes, shared schemas,
   and API error contracts.
2. Add authorization-aware persistence and transitions, oRPC registration,
   revocation reconciliation, and post-commit notifications.
3. Add the student request hook/control to the existing workspace header and
   reconcile it across exercise navigation and tabs.
4. Add the class queue and live-header queue panel using shared query/state
   logic; integrate guarded navigation and explicit Edit code labeling.
5. Add translations, accessibility states, focused tests, and browser coverage.

Read the relevant installed Next.js guides under `node_modules/next/dist/docs/`
before writing web implementation code, as required by `AGENTS.md`. Reconfirm the
paths and contracts against the branch at implementation time. This document
does not authorize deployment or claim that any implementation exists.

## 9. Acceptance and regression matrix

| Scenario | Required behavior |
| --- | --- |
| Student requests help | Correct class queue receives identity, requested problem, server timestamp |
| Quiet reading for an extended period | Remains Solving and monitorable; no inferred request |
| Student double-clicks or uses two tabs | One active row and original request time |
| Request from a second problem in the same class | Existing request shown; no retargeting or duplicate |
| Same course delivered by two classes | Validated selected class alone receives request |
| Refresh/reconnect | Persisted request and teacher ownership restored |
| Dropped change notification | Visible surface refresh recovers within its refresh interval |
| Two teachers claim together | Exactly one succeeds; loser sees authoritative ownership |
| Duplicate or delayed mutation retry | Recorded result; no extra transition or newly created request |
| Claim competes with cancel/resolve | One valid transition wins; stale action reconciles |
| Claim/open/resolve with Edit code off | No editing permission is granted |
| Editing toggle or watch opens/closes | Queue status unchanged |
| Teacher returns a colleague's request | Ownership cleared; actor recorded; original age preserved |
| Student goes offline or leaves problem | Request remains; availability is separate |
| Student changes problems | Requested and current problems distinguished; correct live draft |
| Successful submission | Request remains until explicit cancellation/resolution |
| Teacher leaves assignment | Request returns to Waiting for remaining assigned teachers |
| Enrollment, class, or material access revoked | Scope-invalid request cancelled; protected data removed |
| Forged IDs / other class / platform read exception | No unauthorized rows, counts, notifications, or writes |
| Socket outage with HTTP available | Durable actions work; degraded freshness communicated |
| HTTP failure | No false success or false empty queue; Retry available |
| Pending teacher edits during queue navigation | Existing save guard honored; no lost code or early claim |
| Multiple teacher watch tabs | Queue ownership shared; editing permission remains per watch |
| More than one queue page | Correct counts, ordering, and access without silent truncation |
| Keyboard, narrow viewport, light/dark, Korean/English | Readable rows, named controls, focus preserved |

Use database integration tests for partial uniqueness, receipts, and competing
transitions; mock-only tests do not prove concurrency guarantees. Add service
authorization and revocation tests, schema tests, wait-display/hook tests, and
browser scenarios with student plus two teacher identities. Run relevant existing
monitoring/save/switching suites, typechecks, lint, i18n, routes, and theme checks.
Record actual results during implementation; none are claimed by this spec.

## 10. Rollout and review status

Deploy the additive database migration before API/web changes. Enable the UI
only when the corresponding contract is available, under the existing monitoring
flag. Old clients can ignore additive notifications; respect existing protocol
compatibility checks for any changes that affect the socket contract. Rollback
can hide the UI while retaining request records; never infer requests during
rollout or rewrite presence states.

The user requested this specification based on the reviewed plan and explicitly
deferred implementation. Review the written behavior before producing an
implementation plan or changing application code.
