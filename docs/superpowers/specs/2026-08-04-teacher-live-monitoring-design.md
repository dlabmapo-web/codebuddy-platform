# Teacher Live Monitoring Design

**Date:** 2026-08-04  
**Status:** Approved design  
**Branch:** `feat/cove-studio-v2`

## Summary

Cove Studio will give each effectively assigned teacher a class-first live
monitoring experience. The teacher opens **My classes**, selects one assigned
active class, sees the live state of students enrolled in that class, and opens
one student’s current exercise workspace for focused monitoring and help.

The live workspace includes the current published exercise, conflict-safe code
collaboration, student and teacher cursors, Cove-workspace pointers, student run
activity, safe submission-result summaries, and durable written feedback. The
assigned teacher may edit the student’s code without a separate approval
request. Run and submit actions remain student-only.

Only the class’s current effective assigned teacher may monitor its students.
Team Leads and Managers manage classes and teacher assignments but cannot use
live monitoring. Students always see a generic **Teacher is monitoring** or
**Teacher is helping** indicator; the teacher’s name is not disclosed in that
indicator.

This design replaces v1’s academy-wide polling, permissive teacher fallback,
public realtime channels, client-supplied identity, and full-document broadcast
with a server-authoritative NestJS Socket.IO gateway, Redis Streams, Yjs, typed
contracts, bounded delivery, explicit recovery, durable feedback, and immediate
access revocation.

## Problem statement

The v1 teacher experience contains useful product ideas but unsafe and fragile
boundaries:

- the student list is academy-wide rather than class-scoped;
- a teacher with no explicit student mappings can fall back to all students;
- activity is refreshed through repeated polling;
- public Supabase channels trust identifiers carried by browser payloads;
- large client components combine authorization assumptions, realtime state,
  draft persistence, editor collaboration, presence, and UI;
- whole source documents are broadcast frequently;
- reconnect synchronization relies on peers and timeouts rather than a
  server-owned state protocol;
- assignment removal and membership changes do not form a reliable immediate
  revocation path;
- connection failures can be presented as ordinary offline state;
- the production workspace currently reports hydration errors.

The v2 class and teacher-assignment work now provides the correct boundary:
one teacher per class, one teacher across many classes, active enrollment rows,
course assignments, and a reusable effective-assignment predicate. Monitoring
must build on that boundary instead of migrating v1’s access model.

## Goals

- Give teachers a dedicated list of their effectively assigned active classes.
- Show a class-scoped roster with trustworthy online, solving, idle,
  reconnecting, offline, and last-active states.
- Let the assigned teacher open one student’s current exercise workspace.
- Synchronize Monaco code safely during concurrent teacher and student edits.
- Show cursors and normalized Cove-workspace pointers without recording them.
- Show student run activity and safe grading-result summaries in real time.
- Let teachers send durable, idempotent written feedback during monitoring.
- Make assignment changes, archival, enrollment changes, suspension, and role
  changes revoke live access promptly.
- Survive ordinary temporary browser, network, API-instance, and Redis
  interruptions without silently losing or corrupting code.
- Keep all realtime traffic scoped, authenticated, validated, rate-limited,
  observable, and horizontally scalable.
- Match the established Cove Studio v2 layout, interaction, localization, and
  accessibility patterns.

## Non-goals

- Historical progress analytics or general submission-history browsing.
- A grid that renders several students’ live code simultaneously.
- Monitoring by Team Leads, Managers, Students, or unassigned Teachers.
- Teacher-triggered execution or submission on behalf of a student.
- A student approval request before the assigned teacher begins helping.
- Recorded or replayable monitoring sessions.
- Voice, video, screen sharing, remote desktop, webcam monitoring, plagiarism
  detection, or browser-tab observation.
- Capturing clipboard contents, selected DOM text, browser navigation, or
  keystrokes outside the Cove Monaco editor.
- Synchronizing the teacher’s page scroll, open panels, course navigation, or
  browser viewport with the student.
- Replacing the existing submission queue or submission-result SSE pipeline.
- Migrating v1 collaboration-session records.

## Definitions

### Effective assigned teacher

A teacher has monitoring access only while every condition below is true:

- the class is `ACTIVE`;
- the class references the teacher’s academy membership;
- the membership belongs to the same academy as the class;
- the membership role is `TEACHER`;
- the membership status is `ACTIVE`;
- the membership’s user status is `ACTIVE`;
- the session academy matches the class academy;
- the session user owns that academy membership;
- the role still has `classes.assigned.manage` and
  `submissions.assigned.review`.

An assignment ID alone never proves access. Existing shared
`assignmentGrantsAccess` behavior remains the canonical pure predicate; database
queries must enforce the same facts in their joins.

### Monitorable student

A student is monitorable for a class only while:

- the student has a `ClassEnrollment` for that class;
- the student membership and owning user are active;
- the membership belongs to the class academy and still has role `STUDENT`;
- the student’s current course is assigned to the class;
- the current material is visible, is a programming exercise, and is reachable
  through the assigned course;
- the student socket was authenticated as the owning user.

### Live states

- **Online:** an authenticated learning connection exists.
- **Solving:** a visible exercise workspace is active in the foreground.
- **Idle:** the foreground exercise remains open without recent editor, run,
  pointer, or navigation activity.
- **Reconnecting:** a recent connection was interrupted inside the configured
  recovery grace period.
- **Offline:** no recoverable authenticated learning connection exists.

Online is not inferred from a database timestamp. Last activity is contextual
history, not proof of a current connection.

## Roles and permissions

| Capability | Student | Assigned Teacher | Other Teacher | Team Lead | Manager |
| --- | ---: | ---: | ---: | ---: | ---: |
| Publish own presence | Yes | No | No | No | No |
| View own monitoring indicator | Yes | No | No | No | No |
| List assigned monitoring classes | No | Yes | Empty result | No | No |
| View a class live roster | No | Yes | No | No | No |
| Open a student live workspace | No | Yes | No | No | No |
| Edit code in live help | Own code | Yes | No | No | No |
| Run samples | Yes | No | No | No | No |
| Submit | Yes | No | No | No | No |
| Send live feedback | No | Yes | No | No | No |
| Manage teacher assignments | No | No | No | Yes | Yes |

Team Leads currently hold `classes.assigned.manage` for future operational
reasons. That role permission alone must not grant monitoring: the effective
assignment query additionally requires an active `TEACHER` membership that is
the class’s `teacherMembershipId`. This explicit conjunction prevents privilege
creep through the role map.

## User experience

### Navigation

Teachers receive a **Teaching** navigation group with **My classes**. The
teacher routes are separate from management routes:

```text
/studio/academies/:academyId/teach/classes
/studio/academies/:academyId/teach/classes/:classId
/studio/academies/:academyId/teach/classes/:classId/students/:membershipId/live
```

The existing `/classes` routes remain the management experience for Team Leads
and Managers. Teacher pages contain no class, roster, course, or assignment
mutation controls.

### My classes

The page lists only active classes for which the current user is the effective
assigned teacher. Each class card or responsive table row shows:

- class name and description;
- assigned-course count;
- enrolled-student count;
- current online count;
- current solving count;
- realtime connection health;
- an **Open live class** action.

Initial class data comes from an oRPC query. Counts begin with a server snapshot
and update through the monitoring namespace. Empty, loading, query-error,
realtime-disconnected, and access-revoked states are distinct.

### Live class roster

The class page follows the useful hierarchy of v1 without copying its global
scope. It contains:

- class name and assigned-course context;
- total, online, and solving summary cards;
- filters for all, online, solving, idle, and offline;
- student name/email search;
- a responsive roster with presence, current exercise, last meaningful
  activity, and latest safe run/result state;
- **Open live** only for a currently monitorable exercise.

The roster uses one class query plus a single class-room presence snapshot. It
never polls once per student and never queries code for unopened rows.

### Focused live workspace

The teacher opens one student at a time. The workspace contains:

- trusted student identity and class breadcrumb;
- current course, lecture, and exercise context;
- published problem statement and samples;
- collaborative Monaco editor;
- student and teacher text cursors;
- normalized pointers over supported Cove workspace surfaces;
- student run status and safe sample output summary;
- safe submission verdict summary when available;
- durable feedback history and composer;
- explicit `Connecting`, `Live`, `Reconnecting`, `Unsaved`, `Student left`,
  and `Access revoked` states.

Opening a different student ends the current watch before joining the new one.
The server permits one active watched student per teacher membership. A second
teacher tab replaces the older watch rather than creating hidden simultaneous
monitoring.

### Student indicator

When the teacher joins the student exercise room, the student sees one of:

- **Teacher is monitoring** when the teacher has not changed the document in
  the current presence interval;
- **Teacher is helping** after teacher-originated editor activity.

The indicator never reveals the teacher’s name. It disappears after the server
confirms the teacher left or lost access; a temporary connection interruption
shows a neutral reconnecting state rather than falsely claiming the teacher
left.

### Editing and student-only actions

The assigned teacher may edit the shared code immediately. Teacher edits are
identified as teacher-originated Yjs transactions for UI awareness and audit
metrics, but individual edits are not written to the audit log.

Only the student client renders enabled run and submit controls. The API remains
the authority: teacher attempts against run or submission endpoints are denied
even if a browser manually constructs the request.

### Written feedback

The teacher may send a bounded plain-text message while authorized for the live
workspace. Feedback is persisted before it is broadcast. Both clients render
the stored record returned by the server, not an optimistic client-authored
identity or timestamp.

Feedback is private to the student, the effective assigned teacher while they
have access, and future authorized progress-review surfaces. Team Leads and
Managers do not gain feedback access through this feature.

## Architecture

### Components

```text
Student workspace ─┐
                   ├── authenticated Socket.IO /monitoring namespace
Teacher workspace ─┘                   │
                                      ▼
                         NestJS MonitoringGateway
                         ├── MonitoringAccessService
                         ├── PresenceRegistry (Redis TTL)
                         ├── CollaborationDocumentService (Yjs)
                         ├── MonitoringFeedbackService (PostgreSQL)
                         ├── MonitoringVisitService (PostgreSQL)
                         ├── MonitoringRevocationService
                         └── Redis Streams Socket.IO adapter
                                      │
                     ┌────────────────┼────────────────┐
                     ▼                ▼                ▼
                  Redis           PostgreSQL     Submission SSE
               presence and       drafts, Yjs     existing judge
               bounded streams    state, visits,  result delivery
                                  feedback
```

### NestJS gateway

The `/monitoring` gateway is a singleton provider in a focused monitoring
module. It uses gateway middleware/guards for authentication and typed handlers
for event authorization. It does not contain Prisma queries or Yjs persistence
logic directly.

Every initial connection verifies the Supabase access token with the existing
API authentication service. The server stores trusted `userId`, `userStatus`,
and academy membership claims in socket-owned data. Event payloads never choose
the acting identity.

`skipMiddlewares` remains disabled during connection recovery so a suspended or
deleted identity is not restored without validation.

### Redis Streams adapter

Socket.IO uses the Redis Streams adapter rather than Redis Pub/Sub. It provides
cross-instance room delivery, resumes after temporary Redis interruption, and
supports Socket.IO connection-state recovery. Stream length and session
retention are bounded.

Production load balancing must either provide sticky sessions for Socket.IO
fallback polling or explicitly use WebSocket-only transport after verifying
all supported client networks. The initial recommendation is sticky sessions
with WebSocket preferred and polling fallback retained.

Redis is private infrastructure with TLS where supported, authentication, ACLs,
network restrictions, and monitoring-specific key prefixes. No browser connects
to Redis.

### Yjs collaboration

One Yjs document represents one student’s draft for one material. The document
identity is server-derived from the `ExerciseDraft`; it is not a raw room name
provided by a client.

Yjs updates are binary, commutative, associative, and idempotent. The client
batches local Monaco updates, sends a bounded binary update with an event ID,
and waits for acknowledgement. The server validates room membership and size,
applies the update, broadcasts it to other authorized participants, and queues
persistence.

On join or unrecoverable reconnect:

1. client sends its Yjs state vector;
2. server returns only the missing update when possible;
3. client applies the update with a remote transaction origin;
4. server requests a client diff only if the authenticated client contains
   state not present on the server;
5. both sides confirm the resulting document state vector.

No `sync:request` is broadcast to arbitrary peers. A teacher joining an empty
room receives server-owned state.

### Normal APIs

Typed oRPC remains responsible for initial and durable reads:

- `monitoring.listAssignedClasses`
- `monitoring.getClassRoster`
- `monitoring.getStudentContext`
- `monitoring.listFeedback`

The realtime gateway is responsible only for connection-sensitive state and
commands. Normal queries do not depend on a live socket and remain independently
testable.

## Realtime rooms

Room names are internal values produced by the server:

```text
academy:{academyId}:teacher:{teacherMembershipId}
academy:{academyId}:class:{classId}:presence
academy:{academyId}:draft:{exerciseDraftId}
academy:{academyId}:student:{studentMembershipId}
```

The teacher-private room receives assignment revocation and watch replacement.
The class presence room receives roster deltas but no source code. The draft
room carries Yjs, awareness, run state, safe result state, and feedback-created
events. The student-private room receives the generic monitoring indicator and
access-specific state.

Room identifiers never contain email addresses, names, source text, or raw
access tokens.

## Event contracts

Shared Zod schemas define every payload and acknowledgement. The event names
below are the exact public monitoring-namespace names.

### Client to server

| Event | Actor | Reliability | Purpose |
| --- | --- | --- | --- |
| `class.join` | Teacher | Ack | Join one authorized class presence room |
| `class.leave` | Teacher | Best effort | Leave class presence |
| `student.watch.start` | Teacher | Ack | Revalidate and open one live workspace |
| `student.watch.stop` | Teacher | Ack | End the current watch |
| `presence.publish` | Student | Latest only | Publish validated active workspace state |
| `document.sync` | Both | Ack | Exchange Yjs state vectors/diffs |
| `document.update` | Both | Ack + retry | Send a bounded Yjs update |
| `awareness.update` | Both | Volatile | Cursor and supported pointer state |
| `run.activity` | Student | Latest only | Publish safe local run lifecycle |
| `feedback.send` | Teacher | Ack + idempotency | Persist and deliver feedback |

### Server to client

| Event | Recipient | Purpose |
| --- | --- | --- |
| `class.snapshot` | Teacher | Initial authorized presence snapshot |
| `presence.changed` | Teacher | One student’s latest class state |
| `watch.started` | Teacher + student | Confirm monitoring and indicator state |
| `watch.ended` | Teacher + student | End state with a typed reason |
| `document.synced` | Both | Missing Yjs state and confirmation |
| `document.updated` | Other peer | Apply an authorized Yjs update |
| `awareness.changed` | Other peer | Cursor or pointer update |
| `run.changed` | Teacher | Safe student-run status |
| `result.changed` | Teacher | Safe submission summary |
| `feedback.created` | Both | Server-owned durable feedback record |
| `access.revoked` | Teacher | Immediate typed revocation |
| `server.degraded` | Both | Explicit persistence or realtime health |

All commands return a discriminated acknowledgement containing an event ID and
either a typed success payload or public error code. Raw Prisma, Redis, Yjs, or
Socket.IO errors never cross the boundary.

## Presence and activity

### Redis representation

Presence uses Redis hashes or JSON values with TTLs, indexed by class and
student membership. The trusted server writes:

- membership and class IDs;
- socket generation ID;
- state (`ONLINE`, `SOLVING`, `IDLE`, `RECONNECTING`);
- current course and material IDs when authorized;
- visibility state;
- last meaningful activity timestamp;
- safe latest run/result summary identifiers.

The server calculates display state; clients provide signals, not final labels.
Repeated heartbeats do not update PostgreSQL on every interval.

### Timing

- Pointer events: at most one every 80 ms per participant.
- Cursor awareness: coalesced to at most one every 50 ms.
- Presence heartbeat: every 15 seconds while connected.
- Idle transition: after 60 seconds without meaningful activity.
- Recovery grace: up to 30 seconds before displaying offline.
- Persisted `lastLearningSeenAt`: at most once per 60 seconds and on clean
  workspace exit when newer.

These are initial product defaults and belong in named configuration rather
than scattered component constants.

### Initial snapshot and deltas

The roster oRPC query returns durable enrollment and last-seen data. Joining the
class room returns one authoritative current presence snapshot with a monotonic
snapshot version. Subsequent deltas include the version they follow. A version
gap triggers one snapshot refresh; it never starts a polling loop.

## Supported pointer surfaces

Pointers are limited to semantic Cove workspace surfaces:

```text
header
curriculum
statement
editor
terminal
feedback
```

Payloads carry a supported surface and finite normalized `x`/`y` values in the
inclusive `0..1` range. They do not carry DOM selectors, text, element values,
or raw viewport coordinates. A missing teacher-side surface produces a compact
activity indicator rather than opening panels or changing scroll position.

The student sees the teacher’s pointer where the equivalent surface is visible.
The teacher sees the student’s pointer across the supported Cove workspace.
Pointers disappear after three seconds without movement, on explicit leave,
on visibility loss, on peer disconnect, or on access revocation.

## Persistence model

### ClassEnrollment addition

```text
lastLearningSeenAt  DateTime?
```

This supports useful offline labels inside the enrollment boundary. It is not a
presence truth source.

### ExerciseCollaborationDocument

```text
draftId          UUID primary key
yjsState         Bytes
snapshotVersion  BigInt
codeHash         String
createdAt        DateTime
updatedAt        DateTime
```

The row has a one-to-one relationship with `ExerciseDraft` and cascades with
the draft. `yjsState` exists for recovery; `ExerciseDraft.code` remains the
readable latest source snapshot used by ordinary learning and submission flows.

The collaboration service derives plain code from the same Yjs transaction and
updates `ExerciseDraft.code`, Yjs state, hash, and version in one database
transaction. Concurrent persistence uses compare-and-swap on snapshot version
and merges Yjs state before retrying.

### TeacherMonitoringVisit

```text
id                     UUID primary key
academyId              UUID
classId                UUID
teacherMembershipId    UUID nullable
studentMembershipId    UUID nullable
teacherMembershipRef   UUID
studentMembershipRef   UUID
materialId             UUID nullable
startedAt              DateTime
endedAt                DateTime nullable
endReason              enum nullable
createdAt              DateTime
```

End reasons include `TEACHER_LEFT`, `WATCH_REPLACED`, `STUDENT_LEFT`,
`ASSIGNMENT_CHANGED`, `CLASS_ARCHIVED`, `ENROLLMENT_REMOVED`,
`MEMBERSHIP_INACTIVE`, `ROLE_CHANGED`, `MATERIAL_UNAVAILABLE`, and
`CONNECTION_EXPIRED`.

Visits record access accountability, not a replay. They contain no source code,
pointer data, cursor data, feedback body, or hidden result data.
Membership and material relations use `onDelete: SetNull`, while immutable
membership reference UUIDs preserve who participated. Academy and class
relations use `onDelete: Restrict`.

### TeacherFeedback

```text
id                     UUID primary key
academyId              UUID
classId                UUID
teacherMembershipId    UUID nullable
studentMembershipId    UUID nullable
teacherMembershipRef   UUID
studentMembershipRef   UUID
materialId             UUID nullable
monitoringVisitId      UUID nullable
idempotencyKey         UUID
body                   String
createdAt              DateTime
```

The unique key is `(teacherMembershipRef, idempotencyKey)`. Feedback body is
plain text, trimmed, 1–2,000 Unicode characters, and rendered as text.
`teacherMembershipId`, `studentMembershipId`, `materialId`, and
`monitoringVisitId` are nullable live relations using `onDelete: SetNull`.
The immutable `teacherMembershipRef` and `studentMembershipRef` UUID values are
not foreign keys and preserve accountability after a referenced row is removed,
following the same principle as `AuditLog.targetId`. Academy and class relations
use `onDelete: Restrict`; their normal lifecycle is archive rather than delete.

## Draft durability

Yjs correctness and database durability are separate guarantees:

- local Monaco edits enter the Yjs document immediately;
- updates are batched for network efficiency, not delayed indefinitely;
- the server acknowledges only after applying and accepting the update;
- persistence uses a configurable one-second debounce per active document;
- clean room exit requests an immediate flush;
- client-side Yjs state remains available during a temporary interruption and
  is offered during state-vector resynchronization;
- a server process crash may interrupt a pending debounce, but a still-open
  authenticated client resupplies missing updates on reconnect;
- monitoring visits and feedback never serve as draft storage.

The UI shows **Unsaved changes** when the last acknowledged document version is
newer than the last confirmed persisted version. It clears only after a server
persistence confirmation.

## Submission and run integration

Local sample execution remains in the student workspace. The student publishes
only:

- lifecycle (`STARTED`, `COMPLETED`, `FAILED`, `CANCELLED`);
- sample count and passed count;
- bounded visible stdout/stderr already available to that student;
- client run ID and timestamps.

The gateway ignores teacher-originated run events. Hidden grading inputs and
expected outputs never enter realtime payloads.

Durable submission creation and grading continue through the current API,
BullMQ worker, Redis, and SSE result flow. After authorization, the API emits a
safe summary to the relevant draft room: submission ID, public status, score,
passed count, total count, runtime, and timestamps. It excludes hidden case
inputs, expected outputs, internal failure reasons, and worker diagnostics.

## Authorization and revocation

### Join-time checks

Each join transaction queries through a focused `MonitoringAccessService` and
returns a trusted access claim containing academy, class, membership, student,
course, material, and draft IDs. Claims are short-lived server objects, never
bearer tokens returned to JavaScript.

Teacher access checks effective assignment and monitorable-student state in one
academy-scoped query. Student access checks their own identity and learning
access. A missing or ineligible record returns a generic typed denial without
revealing whether another academy’s resource exists.

### Event-time checks

Room membership is required but not sufficient. Document updates, feedback,
and watch commands verify the socket’s trusted claim, actor type, expected room,
payload size, and claim age. Privileged claims are revalidated periodically and
whenever a durable command is received after the revalidation interval.

### Immediate revocation

The services that change teacher assignment, class status, enrollment,
membership status, user status, role, course assignment, or material visibility
publish a trusted access-change message after their database transaction
commits. `MonitoringRevocationService` resolves affected teacher/student rooms,
ends visits, flushes eligible document state, emits the typed end reason, and
removes sockets from rooms.

Periodic revalidation limits exposure if a publisher is temporarily
unavailable. Revocation delivery is idempotent.

## Reconnection and delivery guarantees

Socket.IO preserves ordering for delivered events but default arrival is at
most once. This design assigns reliability by event type:

- awareness and pointer events are volatile latest-state signals;
- presence is reconstructable from TTL state and snapshots;
- Yjs document updates use client event IDs, acknowledgement, bounded retry,
  idempotent application, and state-vector recovery;
- feedback uses an idempotency key and PostgreSQL as the source of truth;
- monitoring visits are server-created and closed idempotently;
- result summaries are reconstructable from the submission query.

Socket.IO connection-state recovery retains rooms and missed bounded packets
for up to the configured recovery window. Recovery never bypasses identity or
access middleware. If recovery fails, the client performs explicit class
snapshot and Yjs state synchronization before declaring itself live.

The UI must not enable feedback or teacher edits until watch start and document
sync are confirmed.

## Backpressure and abuse controls

- Per-socket and per-user event rate limits.
- Maximum binary Yjs update size, with full resync for a legitimate larger
  reconciliation.
- Maximum feedback size and bounded feedback history page size.
- Monotonic event IDs or idempotency keys for durable commands.
- Coalescing for cursor, pointer, presence, and run-state updates.
- Maximum one watched student per teacher membership.
- Maximum expected roster snapshot size of 200 enrollments.
- Bounded Redis stream length, session recovery duration, and inactive document
  cache size.
- Server-side disconnect for repeated invalid payloads or unauthorized room
  attempts.
- Public errors do not disclose room names, Redis keys, SQL details, code, or
  other students’ existence.

## Failure states

| Condition | Teacher UI | Student UI | Server behavior |
| --- | --- | --- | --- |
| Initial query fails | Retry error | No change | No fake empty roster |
| Socket connecting | Connecting | No indicator | No live actions |
| Temporary disconnect | Reconnecting; retain snapshot | Reconnecting indicator if teacher was present | Attempt recovery |
| Recovery fails | Resynchronizing | Resynchronizing | Revalidate, snapshot, Yjs diff |
| Student not solving | Roster remains; no Open live | No indicator | Reject watch with typed state |
| Teacher access revoked | Access revoked; exit workspace | Indicator removed | End visit and room access |
| Redis unavailable | Realtime degraded | Realtime degraded | Reject new realtime joins, stop cross-instance delivery, and never claim live delivery; no silent single-node fallback |
| Database draft save fails | Unsaved warning | Unsaved warning | Retain active Yjs state and retry |
| Feedback save fails | Composer retains text and retry action | No phantom message | Do not broadcast |
| Oversized/rate-limited event | Non-blocking public error | Non-blocking public error | Drop/reject and meter |

An ordinary offline student is not an error. An unavailable realtime service is
not presented as “everyone is offline.”

## Privacy and audit

- The student always receives a generic monitoring/help indicator.
- The indicator does not reveal the teacher’s name.
- Teacher identity is stored on visits and feedback for accountability.
- Monitoring visits record entry and exit, not movement or code history.
- Cursor, pointer, presence heartbeats, and transient run activity expire.
- Source code is stored only in the existing draft/submission domain and the
  compact collaboration document, never in audit metadata or logs.
- Feedback body is stored in its dedicated table and excluded from general
  audit payloads and operational logs.
- No client analytics event includes source code, feedback text, email address,
  access token, or realtime binary payload.
- Data-retention policy for visits and feedback follows academy learning-record
  policy; the implementation must expose a single retention configuration, not
  hard-code independent deletion windows.

## Component boundaries

### API

- `MonitoringModule`: module composition only.
- `MonitoringGateway`: socket lifecycle and handler delegation.
- `MonitoringAccessService`: scoped authorization queries and claims.
- `PresenceRegistry`: Redis presence state, snapshots, versions, and TTLs.
- `CollaborationDocumentService`: Yjs load, merge, diff, cache, and flush.
- `MonitoringFeedbackService`: feedback validation, idempotency, persistence,
  and query.
- `MonitoringVisitService`: visit start/end lifecycle.
- `MonitoringRevocationService`: access-change consumption and room removal.
- `MonitoringEventMapper`: privacy-safe public payloads.
- `MonitoringMetricsService`: bounded operational measurements.

### Shared package

- Route-independent monitoring schemas and types.
- oRPC contracts.
- Socket event and acknowledgement schemas.
- Pure presence-state reducer.
- Pure access and public-payload helpers.
- Supported collaboration surfaces and coordinate validation.

### Web

- Assigned-class query components.
- Class presence connection provider scoped to one page.
- Live workspace connection provider scoped to one student.
- Yjs/Monaco adapter isolated from page layout.
- Presence, connection-health, run-state, and feedback hooks.
- Semantic collaboration-surface registry and pointer overlays.
- Small view components for roster, problem, editor, terminal summary,
  feedback, and failure states.

No single page component owns authentication, socket setup, Yjs, autosave,
pointer mapping, feedback persistence, and rendering together.

## Accessibility and localization

- All new copy lives in the shared English and Korean monitoring namespace.
- Presence is conveyed by text and icon, never color alone.
- Connection-state changes use an appropriately restrained live region.
- Filters, search, feedback, and workspace actions are keyboard accessible.
- Remote cursors and pointers never block interaction and can be hidden through
  reduced-motion/accessibility settings without ending monitoring.
- Pointer animation honors `prefers-reduced-motion`.
- Focus returns predictably when leaving the fullscreen live workspace.
- Mobile supports class and roster review; collaborative help requires the
  project’s supported editor viewport and shows a clear limitation otherwise.

## Observability

Metrics:

- active sockets and reconnecting sockets;
- active class and draft rooms;
- room sizes and presence snapshot sizes;
- join allow/deny counts by public reason;
- revocation publication and handling latency;
- connection recovery success/failure;
- Yjs update size, rate, acknowledgement latency, resync count, and flush lag;
- Redis stream lag and errors;
- database persistence and feedback latency/errors;
- feedback idempotency hits;
- rate-limit and oversized-payload counts.

Structured logs may include request/event IDs, academy/class/resource UUIDs,
public reason codes, durations, and sizes. They exclude tokens, names, emails,
source code, feedback body, Yjs bytes, stdout/stderr, cursor coordinates, and
pointer coordinates.

Alerts cover sustained join failures, recovery failure spikes, document flush
lag, Redis stream lag, revocation latency, and feedback persistence failures.

## Performance targets

Under a supported class load of 200 enrolled students and 100 concurrent
learning connections:

- initial roster API p95 under 500 ms in-region with warm infrastructure;
- class presence snapshot visible within two seconds of page connection;
- presence delta visible within two seconds;
- live code propagation p95 under 250 ms in-region;
- cursor/pointer propagation p95 under 200 ms without backlog;
- feedback acknowledgement p95 under 750 ms after durable write;
- ordinary temporary disconnect recovery within five seconds when the network
  returns;
- no unbounded memory, Redis stream, room, listener, or retry growth.

These are service objectives for load and integration testing, not promises
that hide degraded infrastructure from the UI.

## Testing strategy

### Unit tests

- Effective-assignment and monitorable-student predicates.
- Team Lead, Manager, other Teacher, inactive membership, inactive user, stale
  assignment, archived class, removed enrollment, and removed course denial.
- Presence transitions, TTL interpretation, snapshot-version gaps, and last-seen
  throttling.
- All shared event schemas and public error mapping.
- Coordinate normalization and supported surfaces.
- Rate, size, and feedback-length limits.
- Privacy-safe event mapping and log redaction.
- Monitoring-visit end-reason mapping.

### Collaboration tests

- Student-only edits.
- Teacher-only edits.
- Simultaneous edits converge.
- Duplicate and reordered Yjs updates converge.
- Acknowledgement retry is idempotent.
- State-vector diff repairs a missed update.
- Server restart plus client resync restores the newest authenticated client
  state and persists it.
- Draft code and collaboration state remain transactionally consistent.
- Teacher edits never enable teacher run or submit.

### Gateway integration tests

- Token authentication and expired/invalid token denial.
- Server-owned identity despite forged payload actor IDs.
- Cross-academy, cross-class, cross-student, and raw room-name attacks.
- Class snapshot and delta version behavior.
- One active watch per teacher membership.
- Immediate revocation for every access-changing mutation.
- Periodic revalidation when a revocation event is missed.
- Multi-instance delivery through Redis Streams.
- Redis interruption and recovery.
- Socket.IO connection recovery and failed-recovery resync.
- Durable feedback before broadcast and duplicate idempotency keys.
- No feedback broadcast on transaction failure.
- Backpressure, oversize, malformed binary, and repeated invalid-event handling.

### Browser end-to-end tests

Use separate authenticated Playwright contexts for the student and teacher:

1. assigned teacher sees only assigned active classes;
2. Team Lead and Manager cannot open teacher monitoring routes or gateway rooms;
3. enrolled student appears online and solving in the correct class;
4. teacher opens the focused live workspace;
5. student sees the generic indicator without teacher name;
6. student edit appears for teacher;
7. teacher edit appears for student and changes indicator to helping;
8. student run summary appears for teacher while teacher run remains denied;
9. feedback persists and appears once on both clients;
10. temporary disconnect recovers without duplicate feedback or corrupt code;
11. failed recovery performs full state synchronization;
12. assignment replacement immediately removes the old teacher;
13. archival, suspension, enrollment removal, and course removal revoke access;
14. connection failure is not rendered as an all-offline roster;
15. keyboard, responsive roster, localization, and reduced-motion behavior.

### Load and soak tests

- 100 connected students in one class with realistic heartbeats and activity.
- Many classes across multiple API replicas.
- One focused document with concurrent student and teacher edits.
- Reconnect storm after an API restart.
- Redis interruption and resumption.
- Eight-hour classroom soak for leaked rooms, listeners, timers, Yjs documents,
  and persistence queues.

## Feature flag and rollout

Use a per-academy `teacherLiveMonitoring` feature flag.

1. Schema and services disabled by default.
2. Development and E2E fixtures with one assigned teacher and active student.
3. Automated unit, integration, browser, load, and reconnect coverage.
4. Internal development academy rollout.
5. One controlled academy rollout with metrics and support observation.
6. Wider enablement only after access-denial, recovery, revocation, persistence,
   and latency targets are healthy.

Disabling the flag prevents new monitoring joins and ends active watches with a
typed feature-disabled reason. It does not delete drafts, visits, or feedback.

## Migration and seed behavior

- Add the collaboration, visit, and feedback tables plus enrollment last-seen
  column with no destructive transformation of existing data.
- Existing exercise drafts receive collaboration rows lazily on first live
  collaboration; a bulk backfill is unnecessary.
- Existing classes remain monitorable only when their current teacher
  assignment is effective.
- Development and E2E seeds provide one active assigned teacher, one assigned
  class/course, one enrolled student, a draft, and representative feedback.
- Seed failure is explicit when the teacher, enrollment, course, material, or
  membership is ineligible.
- No v1 `collaboration_sessions`, public channel, pointer, or monitoring data is
  imported.

## Implementation sequence

1. Shared schemas, permissions, error codes, feature flag, and persistence
   migration.
2. Monitoring access queries, assigned-class/roster oRPC endpoints, and unit
   tests.
3. Redis presence registry, Socket.IO gateway, authentication, typed events,
   and multi-instance adapter.
4. Teacher My classes and class roster pages with explicit connection states.
5. Yjs collaboration document service and isolated Monaco binding.
6. Focused live workspace, awareness, semantic pointers, and student indicator.
7. Durable feedback, monitoring visits, and audit-safe observability.
8. Revocation publication from all access-changing services.
9. Integration, Playwright, load, reconnect, accessibility, and localization
   verification.
10. Flagged development and controlled-academy rollout.

## Acceptance criteria

- Only the current effective assigned Teacher can list and monitor a class.
- Team Leads and Managers receive denial from both UI routes and direct gateway
  or API attempts.
- The teacher sees only active, eligible enrollments in the assigned class.
- The roster reports live states without academy-wide polling.
- The teacher opens one currently solving student at a time.
- The student always sees a generic monitoring/help indicator while the teacher
  is present, with no teacher name.
- Student and teacher code edits converge through Yjs across ordinary reconnects
  and simultaneous edits.
- Teacher run and submit attempts are denied server-side.
- Cursor and pointer events are scoped, normalized, transient, throttled, and
  never persisted.
- Feedback is authorized, durable before broadcast, idempotent, and restored
  after reconnect.
- Hidden tests and internal grading failures never enter monitoring payloads.
- Assignment, class, membership, enrollment, course, and material access changes
  promptly end affected monitoring.
- Failed realtime infrastructure is shown as degraded service, not fake offline
  students.
- Code, feedback, tokens, and movement payloads do not appear in operational
  logs or generic audit metadata.
- Supported-load, recovery, accessibility, localization, and end-to-end tests
  pass before academy rollout.

## Technical references

- [NestJS WebSocket gateways](https://docs.nestjs.com/websockets/gateways)
- [NestJS WebSocket adapters](https://docs.nestjs.com/websockets/adapter)
- [NestJS WebSocket guards](https://docs.nestjs.com/websockets/guards)
- [Socket.IO Redis Streams adapter](https://socket.io/docs/v4/redis-streams-adapter/)
- [Socket.IO connection-state recovery](https://socket.io/docs/v4/connection-state-recovery/)
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)
- [Yjs document updates](https://docs.yjs.dev/api/document-updates)

## Follow-up design

A separate specification will cover historical teacher progress review:
submission history, progress summaries, curriculum-level filters, safe code
review, and long-term feedback review. It will reuse this feature’s assigned
class scope and feedback records without widening live-monitoring permissions.
