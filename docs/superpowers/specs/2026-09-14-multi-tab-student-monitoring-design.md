# Multi-tab student monitoring

Date: 2026-09-14
Status: Proposed; implementation not started

## 1. Outcome and scope

A teacher can open five different students in five live workspace tabs and keep
all five watches active. Opening, closing, reloading, or reconnecting one tab must
not end another tab's watch. A quiet student reading a problem remains watchable.

Each workspace starts read-only. An explicit “Help / Edit code” control enables
editing for that watch after server acknowledgement. Students retain independent
scrolling and see an accurate monitoring/helping indicator.

This spec extends the quiet-student, document-isolation, and pointer/reading-position
specs; it does not replace their correctness requirements. It does not introduce a
multi-editor dashboard, screen sharing, a different realtime transport, or an
unlimited-capacity claim. Five simultaneous watches are the browser acceptance target.

The user approved this workflow in discussion. Duplicate tabs for the same student
are supported, rather than silently replacing each other.

## 2. Evidence from the current implementation

Paths below are relative to the repository root.

- `packages/api/src/monitoring/monitoring-visit.service.ts`: `start()` takes a
  teacher-wide advisory lock and closes all open visits for that teacher.
- `packages/api/src/monitoring/active-watch.registry.ts`: one Redis key per
  teacher membership stores one visit ID. `replace()` displaces the previous visit.
- `packages/api/src/monitoring/monitoring.gateway.ts`: `watchStart()` replaces the
  teacher's previous visit across sockets; `disconnectReplacedWatch()` disconnects
  the displaced socket. Draft access and terminal resync check that singleton key.
- Each gateway socket already has one `teacher.watch`, which is suitable for one
  workspace per connection. The restriction across connections is the problem.
- `packages/api/src/monitoring/monitoring-revocation.service.ts`: targeted revocation
  broadcasts to the teacher room and disconnects every socket in that room,
  including unrelated watches. This must change with multi-tab support.
- `collaboration-document.service.ts` already tracks a local set of visit IDs per
  draft, but `hasWatch()` is process-local and cannot establish global watcher count.
- `use-live-workspace.ts` starts a watch on connection and guards asynchronous
  acknowledgements. Its watch-end filtering by draft alone cannot distinguish
  successive visits to the same draft.
- `awareness/use-awareness.ts` stores one remote peer by role. Gateway cleanup
  clears all `TEACHER` awareness for a draft. Duplicate watches would overwrite or
  erase each other's pointers without session-specific identity.
- Teacher document writes currently turn `helping` on after the first edit;
  `documentUpdate()` has no explicit read-only/edit-mode authorization gate.

The focused registry/visit tests passed (12 tests) while enforcing the existing
single-watch behavior. Those replacement expectations must be revised.

Manual Elice inspection showed two different student tutoring URLs displaying
“Editor connected” concurrently, with read-only default and an Edit mode control.
No simultaneous student typing was observed; this is a UI reference, not evidence
of Elice's internal architecture or five-stream guarantees.

## 3. Approach

Choose independent watch sessions per workspace connection, with a server-issued
visit ID and a fenced connection generation. Keep Socket.IO and Yjs.

Alternatives considered:

1. One watch per teacher/student pair: simpler indexing, but duplicate tabs still
   replace each other and cleanup remains surprising. Rejected.
2. Independent sessions per workspace: matches separate tabs and isolates lifecycle.
   Selected; requires aggregate student state and peer-specific awareness.
3. A class-wide multi-editor dashboard: adds rendering and interaction scope without
   being necessary for the requested workflow. Deferred.

Do not merely remove `disconnectReplacedWatch()`: the database, Redis authorization,
revocation, student indicators, and awareness all currently assume fewer sessions.

## 4. Identity and lifecycle

### 4.1 Session ownership

A mounted workspace creates a random client session ID in memory. Do not store it
in localStorage or copyable sessionStorage: duplicating a browser tab must create
an independent identity. It persists through transport reconnects within that
mount; a full reload creates a new identity.

The server binds each session to the authenticated teacher membership, academy,
class, student, draft, visit ID, and connection generation. Client IDs are correlation
values, never authorization. One connection owns at most one current watch.

A fresh watch returns its visit ID and generation. Start, stop, mode changes,
watch-ended notifications, and delayed acknowledgements carry sufficient identity
to reject events from a superseded visit, including visits to the same draft.
Serialize competing starts for the same session and fence the previous generation.
An old disconnect or stop cannot close a replacement connection.

### 4.2 Registry and audit

Replace the teacher singleton with per-session leases and indexes by teacher,
authorized scope, and draft. Redis operations that register, renew, end, and count
sessions must atomically ignore expired or superseded generations. Preserve
server-side access checks on every privileged path, including terminal resync.

Use a 90-second lease renewed by the server every 30 seconds while its socket is
connected and authorized. Browser mouse activity is not a lease requirement.
A crashed API's leases expire; expiry cleanup updates indexes, audit endings, and
student aggregate state. Redis failure fails closed for teacher access and editing;
it must not discard student code or claim a durable save.

Remove teacher-wide visit replacement from `MonitoringVisitService.start()`.
Persist one audit visit per watch lifetime, closing only the addressed visit.
A reconnect may replace that session's old visit; another tab's visit is untouched.
Indexes must support scoped revocation and open-visit cleanup. Any schema changes
are additive; preserve historical visit records and end reasons.

Normal disconnect cleanup ends only that visit. Full reload may briefly overlap the
old and new leases; aggregation must tolerate this without losing the draft.

### 4.3 Navigation and reconnection

Following a student to a different exercise replaces only the current tab's watch.
Material description, Y.Doc, terminal, feedback and awareness change together under
the new generation. Other students' tabs do not change.

On disconnect, show Reconnecting and disable teacher editing. A recovered socket
must reauthorize, obtain a current watch, and synchronize the Y.Doc before showing
Live. Reconnect defaults to read-only. Late pre-disconnect commands cannot mutate
the replacement session. Background tabs remain authorized while connected;
suspended/discarded tabs must resynchronize on return before presenting fresh state.

## 5. Read-only and help mode

Add a typed, acknowledged watch-mode command with visit/generation identity.
Default is MONITORING. Enabling HELPING requires a current authorized watch; only
then may Monaco become editable. The server rejects document updates from teacher
watches in MONITORING mode even if a modified client bypasses the UI.

Returning to MONITORING disables edits immediately and reconciles the confirmed
mode. Connection loss disables editing. Mode transitions and in-flight writes must
be ordered per session: a delayed write after edit permission is withdrawn is
rejected and triggers canonical document resync, never a snapshot overwrite.

Student indicator semantics are explicit: HELPING means an authorized connected
watch currently has edit mode enabled, not that a keystroke was recently seen.
Teacher Run remains independent; students alone may Submit. Feedback retains its
existing permissions and is not implicitly blocked by read-only code mode.

Concurrent edit-enabled sessions share the same canonical Y.Doc through the
existing CRDT authority. Undo remains scoped to each binding's origin. No new
whole-buffer snapshot save path is introduced.

## 6. Aggregate student state and document lifetime

Publish a versioned, authoritative watch summary scoped to academy, class, student,
and draft. It contains active monitoring/helping counts, not private tab details.
HELPING wins when any valid watch is in help mode; otherwise active watches mean
MONITORING. Reconnecting is explicit when freshness cannot be established.

A second watcher must not reseed the student's Y.Doc or remount its statement.
Ending one of several watches must not emit a student-level final end or unbind the
document. Separate per-visit teacher end events from aggregate student lifecycle.
Late summaries are ignored by revision and identity. Reconnect fetches a summary
rather than relying only on incremental events.

Only the final global watch release may initiate handoff to local drafting. A new
watch racing final release must cancel/fence that handoff. The authoritative document
must flush successfully before the final snapshot/revision is offered to the student.
A failed flush retains the document and reports pending recovery; it must not enable
unsafe HTTP snapshot writes. Local visit sets remain cache bookkeeping, not the
source of truth for whether another API has an active watcher.

This does not by itself solve existing cross-instance draft-authority ownership.
Keep production at its verified single document-authority topology until shared
ownership/routing is proven. Multi-instance acceptance requires both correct watch
leases and correct CRDT authority; Redis watcher counts alone are insufficient.

## 7. Pointer and caret isolation

Extend awareness with a server-assigned peer/session identity and connection
generation. Never trust a teacher identity supplied in the client payload.
Maintain remote teacher awareness by peer ID on the student. Each peer's cursor,
code-relative arrow, statement pointer, sequence and expiry are independent.

Render separately labelled teacher peers; duplicate sessions may share a teacher
name but must remain distinct internally. Teachers continue to see the student's
pointer/caret; other teachers' cursors are outside this scope. Read-only teachers
may point; their caret does not grant editing permission.

Leaving a watch removes only that peer. Stale clear/update events cannot erase a
new generation or another tab's markers. Preserve existing code-relative anchors,
material filtering, off-screen suppression, resize observation and independent
scrolling. Joining, mode switching and leaving never force student scrolling.

## 8. Revocation and authorization

Revocation enumerates exact matching visits and removes their authorized rooms and
leases across API instances. It must not disconnect unrelated sessions merely
because they share a teacher membership. Teacher-wide or academy-wide revocation
still removes every matching watch. Student/class revocation affects only that scope.

Class-roster subscriptions have their own scope cleanup. Preserve unrelated class
subscriptions when one class is revoked. Every message is checked against current
watch identity and authorization; a forged student/draft/session is rejected.
Student indicators are recomputed after revocation, preserving any remaining
independently authorized watcher. Audit cleanup is idempotent.

## 9. Regression and browser acceptance

Unit/integration requirements:

- Two and five independent starts preserve all visits and registry leases.
- Duplicate starts, late stop/disconnect, same-draft replacements and concurrent
  reconnects do not clear a newer generation or another session.
- Duplicate student tabs retain binding and indicator until the last valid watch
  ends; first/last-watch races and failed final flushes preserve canonical text.
- Read-only teacher updates fail server-side; acknowledged help mode allows edits;
  disabling mode or revoking access rejects late updates.
- Help counts, reconnect summaries and stale aggregate versions behave correctly.
- Peer-specific awareness cleanup cannot erase another teacher/tab's marker.
- Scoped revocation preserves unrelated watches and roster subscriptions.
- Lease expiry/crashed owner cleanup and Redis failure paths fail safely.
- Cross-instance registry/revocation tests use actual Redis; document-authority
  tests must additionally validate ownership before multi-instance rollout.

Browser fixture: seed five distinct student accounts with unique starter markers
and at least one long statement. Use authenticated storage states or the approved
local test-login setup; authentication failure is a blocked test, not a pass.

Browser matrix:

1. One teacher context, five pages, five student contexts. Type a distinct marker
   in each student editor; all corresponding teacher pages update without crossover.
2. Student A keeps typing while teacher B's tab opens, closes, reloads and reconnects.
3. Two teacher tabs watch the same student. Close either one; the other stays live.
4. Enable editing in one tab only; verify read-only enforcement in the other and
   aggregate helping state through enabling, disabling and closing sessions.
5. Test pointer/caret isolation and cleanup at unequal window sizes and pane layouts.
6. Navigate a student A → B → A through exercises while all other watches continue.
7. Leave tabs in the background for five minutes; refocus and verify current text,
   connection state and read-only mode after any reconnect. Exercise transport loss.
8. Revoke one scoped relationship and verify only affected watches lose access.
9. Join/leave duplicate watches while a student reads a long scrolled statement;
   retain iframe identity and the prior spec's reading-position tolerance.
10. Last-watch release, immediate rejoin and reload retain exact full editor text
    and saved revision, including CRLF fixtures and surrogate-pair insertions.

Run Chromium and the existing WebKit monitoring project. Record actual executed,
failed and skipped counts. Five loaded pages with “Live” labels are insufficient:
verify full text changes after the fifth watch opens. Capture delivery timings and
resource use, but do not infer capacity beyond the tested load.

## 10. Delivery and rollout

Implementation order: session registry/audit and fencing; scoped authorization and
revocation; aggregate lifecycle; read-only mode; peer awareness; browser fixtures
and regression verification. Keep these changes focused on monitoring.

Use a protocol capability/version gate for the new session lifecycle. Old clients
must receive an explicit refresh-required state before joining the new protocol;
do not mix singleton watch-ended events with aggregate semantics. Drain existing
watches and flush documents, deploy compatible API/web changes, then refresh clients.
Use `docs/operations/deployment-guide.local.md` when preparing the actual deployment.
No deployment, migration, or data cleanup is authorized by this spec-writing task.

Before merge, complete the required browser matrix and preserve existing document,
quiet-student, pointer, route, typecheck and lint checks. Rollback drains the new
sessions before reverting protocol behavior; it never deletes drafts or visit history.

Current evidence: existing pointer/reading implementation committed as `4ec1552`.
Earlier local manual checks verified bidirectional temporary edits and one pointer
direction; reading retention and reverse pointers were not fully cleared. This
spec makes no claim that those outstanding browser gates or multi-tab gates passed.
