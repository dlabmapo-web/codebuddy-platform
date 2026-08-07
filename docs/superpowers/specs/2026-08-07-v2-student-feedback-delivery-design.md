# V2 Student Feedback Delivery

**Date:** 2026-08-07
**Status:** Draft

## Problem

A teacher watching a student can write durable feedback. The message is
validated, stored, and broadcast — and the student never sees it.

The v2 write path is already complete. `MonitoringFeedbackService.create`
persists a `TeacherFeedback` row idempotently, and the gateway broadcasts
`feedback.created` into `monitoringRooms.draft(academyId, draftId)` — a room the
student is already joined to while watched. The event reaches the student's
socket today and is dropped on the floor, because `useStudentMonitoring`
registers no handler for it and the student workspace renders no thread.

Three things are missing, and only the first is a wiring gap:

1. **No live handler.** The student's hook subscribes to `watch.started`,
   `watch.ended`, `student.indicator`, `document.synced`, and
   `document.updated`. `feedback.created` is absent.
2. **No readable history.** `listFeedback` authorizes through `requireClass`,
   which resolves an *assigned teacher* claim. A student calling it is denied.
   There is no student-scoped read anywhere.
3. **No student UI.** `workspace.tsx` has no surface for a thread.

The second gap is the one that decides the architecture. The draft room exists
only while a teacher is actively watching: `watch.started` sets the student's
`draftId`, `watch.ended` clears it, and the teacher cannot send at all unless
`watch.draftId` matches the payload. So a socket-only student implementation
would be correct exactly while the teacher is looking, and would show a student
nothing the moment they close the tab, navigate to another exercise, or open the
exercise the next day. **Live delivery is the notification; the history read is
the feature.** Building only the handler would ship a message that vanishes.

## v1 is the specification for behavior, not for construction

The student-facing behavior on `main` is the target. What follows is a
deliberate split: what a student experiences is v1's, and how it is built is
v2's. Where the two conflict, behavior wins — with one documented exception.

**Preserved from v1, deliberately:**

- **The panel opens itself when feedback arrives.** A student is looking at
  their code, not at a notification dot; a message they do not notice is a
  message that was not delivered. v1 force-opens on arrival and so does this.
  The one guard v1 already had is kept: only a genuinely *new* message opens the
  panel, never the initial load (`prevCount >= 0` in v1's effect), or every page
  load would open a panel of things already read.
- **A header button with a total count, not a docked section.** The trigger
  lives in the workspace header and opens a dropdown, as in v1.
- **The button does not exist when there is no feedback.** v1 renders it only
  when `feedbacks.length > 0`. A student with nothing to read sees no affordance
  at all.
- **Newest first.** v1's API orders `created_at desc` and the panel renders in
  that order.
- **Read-only.** v1 gives the student no reply channel, and neither does this.

**Replaced, because it is construction rather than behavior:**

- **3-second polling → the existing socket.** v2 already broadcasts the row.
  Polling beside a working gateway is two sources of truth for one list, and the
  student cannot tell the difference except that the socket is faster.
- **The `document.hidden` guard → nothing.** v1 skips fetching while the tab is
  backgrounded, so feedback written while the student is in another tab arrives
  only after they return *and* the next tick fires. This is a defect in v1's
  behavior, not a feature of it.
- **Length-diffing → a stored `readAt`.** Comparing array lengths cannot survive
  a pagination boundary or a refetch on reconnect. The observable behavior — a
  panel that opens on genuinely new messages — is unchanged; only its basis
  becomes something that survives a reload.
- **Hardcoded Korean → the `monitoring` namespace.**

**The one behavioral divergence, decided deliberately:** v1 renders the author
as `{name} 선생님` with an avatar initial. v2 does not, and this spec keeps v2's
anonymity. `listFeedback` already strips the name with an explicit comment, and
the live indicator tells a student that somebody is helping without saying who.
A named thread would hand back exactly what the rest of the system withholds, so
the student sees `feedback.author_teacher` — "Teacher" — and no initial. This is
the only place the student's experience departs from v1.

## Design

### Read state becomes durable, per message

Add a nullable `readAt` to `TeacherFeedback` rather than a separate marker
table. One column answers both open questions: the student's unread count is
`readAt IS NULL`, and the teacher learns whether the sentence they wrote
actually landed — something v1 could not tell them at all.

```prisma
readAt DateTime? @map("read_at") @db.Timestamptz(6)
```

The existing `@@index([studentMembershipRef, materialId, createdAt(sort: Desc)])`
already serves both the thread read and the unread count; no new index.

### A student-scoped read, authorized from identity alone

Add `listMyFeedback` to `monitoringContract`, beside `listFeedback`.

The input takes `academyId` and an optional `materialId`, plus the existing
`limit`/`before` paging. **It must not accept a membership id.** The student's
membership is resolved from `SupabaseIdentity`, and rows are filtered on
`studentMembershipRef = <own membership>`. A membership parameter here would be
an authorization hole shaped exactly like the teacher's endpoint, and the two
must not share an input schema for that reason.

Rows come back through the same `MonitoringFeedback` projection the teacher
gets, which already omits the author's name. `classId` stays on the row; a
student in two classes sees one merged thread per exercise, which matches how
they experience the exercise.

Add `markMyFeedbackRead(academyId, materialId)`, which stamps `readAt = now()`
on that student's unread rows for that material. Scoped by the same
identity-derived membership. It is idempotent by construction — already-read
rows are excluded by the `readAt IS NULL` predicate.

### Live delivery rides the room that already exists

`useStudentMonitoring` subscribes to `monitoringServerEvents.feedbackCreated`
and prepends `event.feedback` to its thread state. No new room, no new event
name, no gateway change on the write path.

Two properties fall out of the existing design and should be preserved rather
than re-derived:

- **Nothing is rendered optimistically.** The student renders the row the server
  returned, exactly as the teacher's dock does.
- **The socket is an accelerator, not the source.** The thread is seeded from
  `listMyFeedback` on mount and reconciled by id when an event arrives, so a
  message that landed while the student was disconnected is not lost and a
  message delivered twice is not duplicated.

When the student marks the thread read while a teacher is watching, emit a
`feedback.read` server event into the draft room so the teacher's dock can show
delivery without a refetch. When no teacher is watching, the write is enough —
the teacher picks it up on their next `listFeedback`.

### The student surface

v1's shape, rebuilt on v2's primitives: a header button in `workspace.tsx` that
opens a dropdown panel. Read-only — no composer, no reply. Feedback here is a
teacher speaking to a student, and a reply channel is a separate feature with
its own moderation questions.

- The button renders only when the thread is non-empty, carrying the message
  icon, the label, and a circular badge with the **total** count. An unread dot
  sits alongside the count rather than replacing it, so the badge keeps reading
  as "how many notes do I have" exactly as it did in v1.
- The panel is a dropdown anchored to the button, capped in height and
  scrollable, newest message first.
- **A new message opens the panel.** Arrival via `feedback.created` sets the
  panel open, matching v1. Only genuinely new rows do this — the initial history
  load never opens it, or every navigation would reopen old messages.
- Opening the panel — however it opened — calls `markMyFeedbackRead`.
- The panel is also announced through `aria-live="polite"`. Auto-opening serves
  a sighted student; the live region is what serves everyone else, and costs one
  attribute.
- Author renders as `feedback.author_teacher`. No name, no avatar initial.
- Timestamps use the locale formatter already in the workspace, not v1's
  hardcoded `ko-KR`.
- Bodies render with preserved newlines, as v1's `whiteSpace: pre-line` did.

New `monitoring` namespace keys under `feedback` (`student_title`, `unread`,
`read_receipt`), in both `en` and `ko`.

### Rate limiting and abuse

The write path keeps its existing 30/60s ceiling. `markMyFeedbackRead` is a
student-triggered write and needs its own bucket — a generous one, since it
fires on a panel toggle. `listMyFeedback` is an ordinary authorized read.

## Verification

- Service tests prove `listMyFeedback` returns only the caller's own rows, that
  a forged membership cannot be injected through the input, and that the author
  name is absent from the projection.
- Service tests prove `markMyFeedbackRead` is idempotent and cannot stamp
  another student's rows.
- Gateway tests prove `feedback.read` reaches a watching teacher and is a no-op
  when nobody is watching.
- Hook tests prove the thread reconciles by id: an event for a row already
  present from the history read does not duplicate it, and an event arriving
  before the history resolves is not overwritten by it.
- Component tests prove the v1 open-behavior precisely, since it is the part
  most easily broken by the reconcile logic: a live arrival opens the panel, the
  initial history load does not, and a refetch that returns the same rows does
  not reopen a panel the student closed.
- Component tests prove the button is absent on an empty thread and that the
  badge shows the total, not the unread count.
- A Playwright flow: teacher opens a watched student and sends feedback; the
  student's panel opens on its own without a reload, and the teacher's dock then
  shows the receipt.
- A second flow proves durability: the student reloads with no teacher watching,
  still sees the message, and the panel stays shut because it is already read.
