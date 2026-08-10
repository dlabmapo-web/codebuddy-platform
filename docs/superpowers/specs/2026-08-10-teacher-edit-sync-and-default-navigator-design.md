# Teacher Edit Synchronization and Default Navigator Design

**Date:** 2026-08-10

**Status:** Confirmed design

**Scope:** Student problem-detail workspace and assigned-teacher live workspace

**Companion designs:**

- `2026-08-04-teacher-live-monitoring-design.md`
- `2026-08-07-v2-fullscreen-curriculum-navigator-design.md`
- `2026-08-06-safari-interactive-python-design.md`

## 1. Decision

Repair the teacher editor's initial document synchronization so an authorized
assigned teacher can edit the student's live code reliably in Safari and
Chromium. Keep the editor read-only until the server's authoritative snapshot
for the exact watched draft has been applied, but make that completion path
deterministic rather than dependent on timing between React effects and a
Socket.IO event listener.

Also change the shared fullscreen curriculum navigator to start open whenever
a student or teacher enters a fresh problem-detail workspace. During that
workspace visit, the user may close and reopen it normally. The choice is not
persisted. In-place movement between problems retains the current panel state
because the workspace remains mounted; leaving the workspace and entering a
problem-detail workspace again starts with the navigator open.

## 2. Current behavior and cause

Teacher editing is already authorized by the monitoring design and enforced by
the assigned-teacher watch. The teacher Monaco editor receives `readOnly: true`
until all of these facts are true:

1. the monitoring transport is live;
2. the server has authorized a watch and returned its draft ID;
3. the authoritative snapshot for that same draft ID has been applied; and
4. the watch has not ended.

That safety boundary is correct. The initial synchronization flow is not.
After `watch.start` succeeds, the client immediately emits `document.sync`.
The `document.synced` listener is registered by a later React effect. A sync
response that arrives before that later effect runs is lost. The watched draft
then never receives its synchronized marker, so `canEdit` remains false and
Monaco remains read-only for the rest of the visit. Browser scheduling and
transport timing make the bug appear browser- or role-placement-dependent,
which matches the reported Safari/Chrome reversal.

The navigator mismatch is direct: `useNavigatorPanel` initializes `open` to
`false`, following the previous fullscreen navigator design's “fresh entries
start closed” rule. The new product decision supersedes that rule for both
student and teacher problem-detail workspaces.

## 3. Goals

- Let the currently assigned and authorized teacher edit the student's live
  code after the exact draft has synchronized, regardless of browser timing.
- Preserve the server-authoritative watch and draft-access checks.
- Preserve the pre-sync read-only safety gate.
- Keep teacher edits conflict-safe through the existing Yjs document and
  Monaco binding.
- Keep teacher preview exercises read-only.
- Keep run and submit actions student-only.
- Start the curriculum navigator open on every fresh student or teacher
  problem-detail workspace entry.
- Preserve normal trigger, close-button, and Escape interactions.
- Preserve the user's open/closed choice during in-place problem navigation.

## 4. Non-goals

- Expanding teacher monitoring access to unassigned teachers, Team Leads, or
  Managers.
- Letting a teacher run or submit on behalf of a student.
- Making curriculum previews collaborative or editable.
- Persisting navigator state in local storage, cookies, the URL, or the
  database.
- Synchronizing the teacher's navigator state with the student's state.
- Automatically opening a navigator that the user closed during the same
  mounted workspace visit.
- Changing the document persistence, Yjs merge, feedback, terminal mirroring,
  cursor, or pointer protocols beyond what is required to make initial sync
  completion deterministic.

## 5. Document synchronization design

### 5.1 Authoritative initial sync

`document.sync` becomes a request whose acknowledgement contains the same
validated synchronization payload the requesting client needs:

```ts
type DocumentSyncResult = {
  draftId: string;
  update: Uint8Array | ArrayBuffer;
  stateVector: Uint8Array | ArrayBuffer;
};
```

The server continues to:

1. validate the command payload;
2. verify that the socket currently has access to the requested draft;
3. join the authorized draft room;
4. compute the update missing from the caller's state vector; and
5. return only the requested draft's synchronization result.

The teacher client handles the acknowledgement in the callback that initiated
the request. A successful result is accepted only when its `draftId` still
matches the current authorized watch. The client then applies the update to
the current Yjs document, records that exact draft as synchronized, and reports
the monitoring connection as synchronized.

Because request and completion share one callback, correctness no longer
depends on whether a separate event listener was mounted before the response.

### 5.2 Broadcast event compatibility

The existing `document.synced` server event remains supported for recovery and
other synchronization consumers. Initial teacher readiness must not depend on
receiving that event. Both the acknowledgement and event paths call one
idempotent client helper that:

- rejects results for a stale draft;
- converts either supported binary representation to `Uint8Array`;
- applies the update safely even when it is empty or already represented in
  the Yjs document;
- marks only the matching current draft as synchronized; and
- reports synchronization without creating a teacher-originated edit.

Yjs update application is idempotent, so receiving both forms must not
duplicate content. The client must not emit the applied server snapshot back
as a local teacher update.

### 5.3 Failure and lifecycle behavior

If `watch.start` is denied, the existing denied or revoked state remains
authoritative and no document sync is attempted.

If `document.sync` fails, times out, returns a malformed acknowledgement, or
names a stale draft, the editor remains read-only and the connection must not
be reported as live. Existing reconnect or follow behavior may request a fresh
sync. The design does not unlock editing based on elapsed time.

Every new or replaced watch clears the synchronized draft marker before
requesting a snapshot. A late acknowledgement from the previous watch is
ignored. A watch-ended or access-revoked event clears the session and keeps the
editor locked.

Teacher preview mode continues to use `PreviewEditor`; it is read-only even if
the underlying live watch is synchronized. Returning to live shows the shared
editor and uses the current live watch's synchronization state.

### 5.4 Authorization and action boundaries

This repair changes readiness signaling, not permissions. The API and gateway
remain authoritative for:

- effective assigned-teacher access;
- active student enrollment and monitorable material access;
- the active-watch identity and exact draft ID;
- document update authorization; and
- rejection of teacher run and submission attempts.

The UI must continue to derive teacher editor readiness from the live
connection, current watch, exact synchronized draft, unended watch, and live
display mode. Client-side `readOnly` is a safety and usability layer, not the
authorization boundary.

## 6. Navigator state design

`useNavigatorPanel` remains the single shared owner of panel visibility for
student and teacher fullscreen workspaces. Its initial state changes from
closed to open.

The resulting lifecycle is explicit:

- fresh student problem-detail entry: open;
- fresh teacher live problem-detail entry: open;
- close button: closed for the current mounted workspace;
- Escape while open: closed and focus returns to the trigger;
- header trigger while open: closed;
- header trigger while closed: open;
- student in-place problem transition: retain current state;
- teacher preview selection and return to live: retain current state;
- browser back/forward handled inside the mounted student workspace: retain
  current state;
- leave the fullscreen workspace and later enter one again: open.

No persistence key is introduced. Student and teacher state remain independent
even when both users view the same exercise.

The existing responsive behavior remains unchanged: the open panel is a
dedicated desktop column at its configured breakpoint and a non-modal overlay
at narrower widths. Opening by default must not change the ability to operate
or resize the workspace beside it.

## 7. Component boundaries

### Teacher header placement

The teacher live-workspace header follows the same leading-control order as
the student problem workspace:

```text
Back → curriculum navigator trigger → student identity → live problem context
```

The navigator trigger sits immediately after Back, before the student's avatar
and name. This makes the shared problem-list action discoverable in the same
place for both roles. The change reuses the existing trigger and does not alter
its open state, focus restoration, accessible name, or responsive behavior.

### Shared monitoring contracts

Extend the document-sync acknowledgement contract to carry the authoritative
sync payload. Keep binary validation and draft ID validation in the shared
schema so both gateway and client use the same shape.

### Monitoring gateway

Return the synchronization payload from the authorized `document.sync`
command. Preserve the event emission for compatibility and recovery. The
gateway must never acknowledge a payload before draft access is confirmed.

### Teacher live-workspace controller

Own one idempotent “apply sync result for current draft” helper and call it
from the acknowledgement and event paths. Continue to expose a single
`canEdit` value to the teacher workspace.

### Shared navigator hook

Own the new initial-open default without adding role-specific duplication to
the student or teacher page. Continue to own toggle, close, Escape, and focus
restoration behavior.

## 8. Verification

### Unit and contract coverage

- The document-sync acknowledgement schema accepts the authorized binary sync
  payload and rejects malformed or incomplete data.
- A matching sync result applies the update and unlocks the exact current
  draft only after the connection becomes live.
- A stale draft result cannot unlock a replaced watch.
- Duplicate acknowledgement/event delivery does not duplicate document text
  or produce a local teacher update.
- Sync failure, timeout, watch end, and access revocation keep editing locked.
- The navigator hook starts open, closes, reopens, handles Escape, and restores
  trigger focus.

### Gateway coverage

- An authorized teacher receives the computed update and state vector in the
  acknowledgement.
- An unauthorized, stale, or mismatched draft receives no synchronization
  payload.
- A document update remains rejected after watch end or access revocation.

### End-to-end browser coverage

Use separate browser contexts so the test represents two authenticated users,
not two roles sharing one browser session.

1. Student in Chromium, assigned teacher in WebKit/Safari-compatible coverage:
   wait for sync, edit from the teacher editor, and verify the student receives
   the exact change.
2. Student in WebKit/Safari-compatible coverage, assigned teacher in Chromium:
   repeat the edit and verify the reverse role placement.
3. Verify the teacher editor is read-only before synchronization and becomes
   editable only after the matching sync completes.
4. Verify a teacher preview remains read-only and returning to live restores
   the synchronized editable document.
5. Verify follow/reconnect locks the editor until the newly current draft is
   synchronized and ignores a late old-draft result.
6. Verify student and teacher navigators are visible on fresh entry.
7. Verify each navigator can be closed and reopened with its trigger.
8. Verify in-place problem navigation retains the current open/closed state.
9. Verify leaving and re-entering a problem-detail workspace starts open again.
10. Verify run and submit remain unavailable to the teacher.

If local WebKit cannot exercise the production realtime configuration, the
test must report the environmental limitation explicitly. Chromium coverage
and unit-level ordering tests must still prove that initial readiness does not
depend on event-listener timing.

## 9. Acceptance criteria

- An effectively assigned teacher can edit the student's synchronized live
  code from Safari and Chromium, independent of which browser the student uses.
- Teacher edits appear in the student's editor through the existing Yjs
  collaboration path without replacing or duplicating the document.
- The teacher editor never unlocks before the exact current draft snapshot has
  been applied.
- Preview, ended, denied, revoked, stale, and unsynchronized states remain
  read-only.
- Both student and teacher problem-detail workspaces display the curriculum
  navigator on fresh entry.
- Users can close and reopen the navigator normally during the visit.
- In-place navigation does not override the user's current panel choice.
- A later fresh workspace entry starts open without relying on persisted
  browser state.
- Existing access control, student-only run/submit behavior, responsive layout,
  localization, and accessibility behavior continue to pass.
