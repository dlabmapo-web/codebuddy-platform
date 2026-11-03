# Continuous monitoring across every learning material

Date: 2026-11-03 (Asia/Seoul)
Status: Proposed specification for review; implementation and release are separate work.
Branch: `fix/all-material-live-monitoring-spec`
Base: local `feat/cove-studio-v2` at `7f50870d` (already one commit ahead of its tracked remote when investigation began).

## 1. Requested outcome

Teachers, Team Leads and Managers must be able to monitor a student throughout
the course, including programming, PDFs, quizzes, short answers, written responses,
Turtle and videos. Switching either person's material must preserve the student
monitoring context. Staff sidebar selections open inside the current monitoring
tab. The sidebar continues to identify the material the student actually has open,
even while staff read a different material.

This request explicitly changes the new-tab resource decision in the
[learning-material navigation design](2026-10-22-learning-material-navigation-design.md)
and the coding-only watch behavior documented in the
[October presence investigation](../../research/2026-10-22-student-presence-and-safari-pdf-verification.md).
The existing distinction between staff selection and student location remains.

The user confirmed that monitors should see quiz and short/written answers change
live before submission. These responses are read-only for monitors. Staff editing
of these answers and submitting on the student's behalf are outside this change.

## 2. Evidence and investigation limits

### Authenticated production UI inspection

The user's existing signed-in sessions were available, so no new credentials or
account changes were needed: Safari held the student session and Chrome held a
staff session. The class page identified the Chrome academy role as **Manager**.

- Safari initially rendered the student's `[문제7]` multiple-choice quiz with its
  answer options and class selector. There was no monitoring indicator in that
  material's header. Chrome's existing watch of the same student said **Live**
  for its connection but **Student is not currently solving an exercise** for
  activity; the sidebar had no LIVE marker on that quiz.
- Selecting `[문제1]` in the student's sidebar opened the programming workspace.
  Safari showed **Teacher is monitoring**. Chrome then showed **Live on [문제1]**,
  a LIVE sidebar marker, and enabled coding controls.
- The Manager's class roster showed the student online/solving with **Open live**
  while that coding material was open. Its exercise number was 18 while the
  mixed-material workspace number was 29: the roster currently numbers coding
  exercises separately from the mixed curriculum.
- The monitor's quiz, written-response and PDF rows explicitly said **Opens in a
  new tab**. An already-open Chrome quiz tab rendered **Staff practice**, without
  the selected student's monitoring identity. Sidebar resource URLs point to
  ordinary learning routes, rather than a monitored-student resource viewer.
- The student's standalone PDF subsequently rendered its page controls and
  selectable document text, without a monitoring indicator in its header. Its
  first read was still loading; the rendered state was observed later while
  returning to the original quiz.

These observations establish the coding/quiz gap and the resource-link behavior.
They do not establish a physical WebSocket disconnect: the staff connection badge
remained Live. Transport availability, current student material and collaborative
editor attachment are separate facts.

Safari automation timed out once during navigation, although a subsequent read
confirmed that the coding page had loaded. A later direct navigation to the quiz
initially produced a blank/loading page; reloading recovered the quiz. After it
rendered, Chrome again reported **Student is not currently solving an exercise**
and removed the LIVE badge while its connection indicator remained Live. This
confirms the return-to-quiz gap, but does not prove uninterrupted student transport
across that full reload.

No student answers or code were edited or submitted. A complete PDF watch flow,
production video/Turtle watching and independent Teacher/Team Lead logins were
not verified in this pass. Their requirements below are supported by source
inspection and must be tested
with disposable accounts and materials during implementation.

### Source findings

Paths are relative to the repository root.

| Source | Current behavior and consequence |
| --- | --- |
| `packages/web/src/lib/monitoring/student-presence.tsx` and academy `layout.tsx` | Student socket already lives at academy scope and survives client navigation. Moving socket ownership into each material would regress this design. |
| `packages/web/src/components/manual/manual-workspace.tsx` and exercise `quiz-workspace.tsx` | Publish material presence, but do not provide the programming workspace's collaboration/monitoring lifecycle. Short answers are configurations of `WRITTEN_RESPONSE`, not a separate material enum. |
| `packages/web/src/components/pdf/pdf-lesson.tsx` and `components/video/video-lesson.tsx` | Do not register the currently open material with student presence. Video viewing-progress persistence is a separate concern. |
| `packages/api/src/learn/curriculum-visibility.ts` | `effectivelyVisibleActivityWhere` accepts programming/manual relations; PDF and video activity is excluded. The narrower code predicate is reused by monitoring access. |
| `packages/api/src/monitoring/monitoring.gateway.ts` | Presence explicitly makes only `PROGRAMMING_EXERCISE` a follow target. `openWatch` requires a monitorable coding material and creates/joins an ExerciseDraft. |
| `packages/api/src/monitoring/watch-session.registry.ts` | Watch leases require `draftId`; lifecycle and aggregate student indicators are tied to a code document. |
| `packages/api/src/monitoring/monitoring.service.ts` and web `lib/monitoring/roster.ts` | Roster materials and `canOpenLive` are coding-only. Being online/solving on a manual activity does not grant an Open live action. |
| Live route `_hooks/use-teacher-display.ts` and `_components/live-workspace.tsx` | Display/preview selection is separate from the student's location, but context reads and previews are exercise-shaped. Non-code destinations are handed to `resourceHref`. |
| `packages/web/src/components/workspace/curriculum-navigator.tsx` | `resourceHref` forces a new-tab Link; only coding rows render the LIVE badge. Removing `target` alone would navigate into staff practice and lose the monitoring controller. |
| `packages/shared/src/monitoring/events.ts` and `api/orpc/monitoring.contract.ts` | Watch acknowledgements, content reads and awareness mostly assume a programming draft. Material-neutral contracts are necessary. |
| `packages/api/src/classes/assigned-class-access.ts` | Teachers require their teaching assignment; active Managers/Team Leads have academy teaching scope. Preserve this current policy. |

The installed Next.js guides for layouts and navigation were read in
`node_modules/next/dist/docs/01-app/01-getting-started/`. A persistent shared
layout/controller may retain state across navigation; a newly mounted material
page must not own or replace the student's watch.

## 3. Approaches

1. **Persistent student watch with material-specific viewers — recommended.**
   Separate watching the student from attaching a coding document. Reuse the
   current Socket.IO transport, authorization, leases, curriculum and material
   presentation. This addresses direct entry, navigation and LIVE markers
   together. It requires explicit material-neutral protocol and lifecycle work.
2. **Publish all material IDs and keep separate review pages.** Smaller presence
   change, but loses the monitored student when opening resources and cannot
   deliver the requested continuous same-tab experience. Insufficient.
3. **Keep every workspace mounted, or embed ordinary learning pages in iframes.**
   Could retain an old editor but creates hidden publishers/runtimes, conflicting
   identity and staff-practice writes. Reject; reuse controlled presentation
   components instead of embedding complete autonomous learning pages.

## 4. User-visible behavior

### Entry, selection and student movement

- **My classes** names the student's current material and type for all six
  material enums: `PROGRAMMING_EXERCISE`, `PDF_DOCUMENT`, `TURTLE_EXERCISE`,
  `WRITTEN_RESPONSE`, `MULTIPLE_CHOICE` and `VIDEO_LESSON`. Both written-response
  configurations, including short answer, are covered.
- **Open live** can start directly while the student is reading a PDF, watching
  video, or answering a non-code question. Staff must not first open a coding
  exercise to establish a watch. Quiet reading/idle presence remains watchable
  while connected and authorized; recent keystrokes are not a prerequisite.
- Keep the existing student live route as the stable monitoring shell. A
  `materialId` query parameter represents the staff-selected material for reload,
  deep links and browser Back/Forward. It is a navigation request; the server
  reauthorizes it. Without it, initial entry selects the student's current material.
- All course rows select a viewer in the current tab through the monitoring
  controller. Selection retains academy, class and student identity, student
  switcher, connection status, help queue and curriculum state. It never enters
  ordinary Staff practice. Explicit browser open-in-new-tab gestures and existing
  separate-student new-tab actions may continue to work.
- Preserve the existing independent-reading rule: student movement updates the
  actual location and LIVE marker without automatically navigating staff. Show
  **Student is on [material]** and **Return to live**. That action authorizes and
  selects the latest material regardless of type. A staff selection of the
  current live row has the same effect.
- Apply the LIVE badge to every supported material row. Selection styling always
  describes staff selection. If the live row is inside a collapsed branch, mark
  the containing branch as containing the live material without forcing it open.
  The header still names the location. A different course is identified in the
  header; Return to live loads that course after access checks.
- When the student leaves learning materials, clear the material marker and show
  **Online — no material open**. Keep the student watch available for their next
  authorized material. Offline/reconnecting and access denied have their own
  states. A resource renderer failure does not become an offline state.
- Use the shared mixed-material ordering/numbering, excluding supplementary-only
  resources from primary numbering. Name this roster column **Current material**.
  Existing solved totals and grading semantics remain as defined today.

### What each viewer shows

| Material | Live student state | Staff interaction |
| --- | --- | --- |
| Programming, including PDF + coding | Existing synchronized code, run/result summaries and pointer behavior; reference PDF position where available | Preserve explicit acknowledged Edit code mode and independent staff runs. Only the student submits. |
| Standalone PDF | Document, current page, bounded normalized reading position and current material identity | Independent reading and zoom; Return to live aligns to the latest reported page once. No continuous forced scrolling. |
| Multiple-choice quiz | Current choice IDs/selection, submission status and latest public result | Read-only student's response. Keep authored correct answers/explanations behind their existing separate permission checks. |
| Short/written answer | Current response text, submission status and latest public result | Read-only student's response; never bind staff inputs to the student's save/submit endpoints. |
| Turtle/manual graphics | Current source files/entry point, execution state and bounded public output; existing drawing surface when the runtime supports authorized read-only viewing | Read-only monitoring. Reuse runtime viewer authorization without granting keyboard/mouse input or starting a second student execution. |
| Video lesson | Material, playback timestamp, playing/paused/ended state and existing progress summary | Independent player, paused initially. Return to live seeks once; monitor playback creates no student viewing-history events or completion. |

Observation starts read-only for every new material attachment. Code edit mode
does not silently transfer across a student's material change or reconnection.
Existing reference solutions, grades and feedback keep their permission policy.
Staff watching a different material see that material's read-only saved snapshot,
clearly distinguished from live transient work on the student's current material.
No background runtime executes that snapshot.

Supplementary PDF/video overlays preserve the parent material's identity and may
report an optional active resource ID and reading/playback position. Closing them
restores the parent view without ending the watch or replacing its course row.
Only resources reachable from that authorized parent may be reported or read.

## 5. Architecture and data flow

### 5.1 Student activity registration

Keep the single academy-scoped `StudentPresenceProvider`. Introduce one shared
material registration interface used by code, manual/quiz, PDF and video viewers.
Register only after the server has resolved a valid student delivery class and
course. A multi-class student must use the selected class; never guess another
class to make the student appear live. Staff practice, authoring, previews and
public Turtle trials do not publish enrolled-student activity.

Registrations have an owner token and monotonically increasing activity revision.
Cleanup can clear only the registration it created, preventing an old page's
unmount from erasing the next material. Serialize or fence asynchronous server
validation so an older material lookup cannot overwrite a newer accepted revision
on the same socket. Preserve existing socket-generation/disconnect safeguards.
The current provider sends immediately on navigation and reconnect and retains
the existing heartbeat, visibility, inactivity and disconnect grace policies.

The backend verifies the actual material type, backing relation, publication and
complete ancestor visibility, academy, active enrollment and class course assignment.
Add a material-neutral visibility predicate for presence/observation. Keep the
programming predicate for code editing, execution, grading and document access;
do not broaden it globally to fix observation.

### 5.2 Student watch and material attachment

A student watch owns authorized academy/class/student identity, session ID,
server-issued visit ID, generation, lease, revocation and the context room.
A material attachment owns the current authorized material, capability set and
optional code document. Changing a viewer or detaching a code document cannot
end the student watch or leave the context room.

Extend watch registration to support observation without `draftId`; index student
watches by student/session and code attachments by draft separately. Do not create
dummy ExerciseDraft rows for PDFs, quizzes, videos or manual material. Audit visits
can use their existing nullable material ID to record the initial authorized
target; this proposal does not add a navigation replay table or put response
content in audit logs. No database migration is currently required by this model.

Material changes reauthorize and retire old document/terminal/pointer attachments,
settle pending teacher code writes using the existing recovery gate, and fence
late messages. If an acknowledged edit is not yet persisted, retain its recovery
buffer under the original document identity and block editing with a visible
recovery state; never replay it into another material. Keep location updates
running while recovery is blocked. Returning to a coding material acquires a
fresh attachment in read-only mode, then uses the existing document sync path.

The student monitoring indicator is derived from authorized active student-watch
leases rather than the existence of an editor. It appears on every material.
Only an active coding edit attachment can report helping. Independently opened
staff tabs retain separate watch sessions; closing one cannot clear others.

### 5.3 Protocol and recovery

Add typed, versioned material-neutral contracts in the existing shared monitoring
package and oRPC router. Their exact event names may follow repository naming,
but they must represent these boundaries:

- Authorized student-watch acknowledgement and current context snapshot:
  academy/class/student/session/visit/generation plus current material ID, server
  type, course/breadcrumb, availability and capabilities. A code attachment is an
  explicit optional discriminant, never an assumed required draft ID.
- Context updates scoped by academy/class/student and publisher generation with
  a monotonically increasing revision. They carry location metadata only.
  Advisory presence never grants permission to read answers or attach an editor.
- Authorized read of the selected material and student's saved public response,
  keyed by academy/class/student/material. Reuse material readers' projection and
  media authorization, but resolve the monitored student as subject. Do not call
  the self-only staff practice reader and relabel its output as student work.
- Transient student observation updates and an initial/current-state snapshot,
  bound to student/material/source generation/revision. Use a discriminated
  payload for PDF position, video state, choice IDs, response text and Turtle
  source/output. Student identity comes from authentication, never the payload.

Transient state uses short-lived server/Redis storage with the existing 90-second
watch-lease duration as its TTL, refreshed by valid material snapshots/heartbeats.
On material exit or source expiry clear its current transient state. Do not add a
second durable answer store. Existing draft/submission services remain authoritative
for saved work. New/reconnected monitors receive the newest authorized snapshot;
if the student has not republished, label a saved fallback as saved, not live.
If a material does not persist an unsubmitted response, show its latest authorized
submission or an explicit unavailable state until the live snapshot arrives;
never infer an empty answer or invent a saved draft.

Throttle position/playback/cursor updates to at most four per second; throttle
response/source snapshots to at most two per second, with immediate final flush
on blur, navigation and submission. Apply shared schema size limits to text/files,
validate choice IDs against the published question, and bound terminal output
with existing terminal limits. Do not broadcast entire PDFs, video frames or
unbounded runtime logs. A large source snapshot follows existing manual-file
limits and is sent only when its revision changes, not on every heartbeat.

A failed material read has an inline retry inside the monitoring shell. A failed
observation channel leaves the student's normal editing/autosave working and
labels staff data unavailable/stale. Reconnection refreshes authorization, context
and current snapshot before reporting synchronized live state. Existing pending
code-edit recovery and feature-disabled behavior remain effective.

### 5.4 Shell and material adapters

Keep a persistent monitor controller above replaceable viewers. It owns the
socket, student watch, curriculum, selected/live material identities and transition
gate. Type-specific adapters fetch authorized projections and render existing
PDF/quiz/manual/video/code presentation in observation mode. They must disable
self-owned autosave, submission, progress reporting, autoplay navigation and
staff-practice writes while monitoring.

Update the display reducer and async request tokens to reject responses from an
old student, class, material, attachment or generation. Update curriculum and
roster contracts to describe all materials rather than treating non-code rows as
external resources. Preserve code-only operations behind capability checks.
Browser history must restore the selected material in the same shell; changing
the student resets viewer data and cannot briefly show the previous student's
response. Keep feedback drafts keyed by their existing student/material context.

## 6. Access and release boundaries

- Teachers: active teaching assignment to this class. Managers and Team Leads:
  existing active academy teaching scope. No additional Teacher grant/enrollment
  is required for those two roles. Platform/support inspection does not acquire
  a live watch.
- Apply the monitoring feature flag and revalidate role, membership, student
  enrollment, class activity, course assignment and material visibility for
  watch start, snapshot reads, live updates and reconnects. Preserve current
  revocation handling and Redis failure behavior across API instances.
- Generic observation grants no code write, GUI control, student submission,
  grading configuration, hidden tests, private solution or raw media credential
  access. Observation clients cannot publish student state.
- Use an explicitly negotiated protocol capability for all-material observation.
  Deploy API/shared compatibility first, then the web client. Legacy code-watch
  clients remain code-only until reload; never send them a non-code session in
  an old required-draft payload. Exercise mixed-version negotiation and the
  existing refresh-required path before release.
- Implement on a feature/fix branch derived from v2, open a reviewed PR back to
  `feat/cove-studio-v2`, then deploy through the normal v2 workflow. This spec
  commit neither merges nor deploys. No production test answers, role grants,
  SSO mappings, grading policy or hosting settings are changed by investigation.

## 7. Acceptance and validation

Use isolated student and staff browser contexts with real sockets, disposable
fixtures and all relevant feature flags enabled. Reuse the mixed-material fixture
pattern; add short-answer and supplementary-resource cases. Required scenarios:

1. For each material in the viewer table, start with the student already there.
   My classes names the material/type and offers Open live. Entry shows the
   selected student and that material, a LIVE row and student monitoring indicator.
2. Student follows coding → PDF → quiz → short answer → written response → Turtle
   → video → coding, then reverses. Staff stay connected, receive each location
   within two seconds after the accepted publication, and can Return to live.
   Passive PDF reading and paused video remain monitorable without fake activity.
3. While the student edits coding, staff select a PDF in the monitor sidebar:
   same browser tab count, same student watch, working PDF, current code LIVE row,
   and one-click return. Repeat staff selection for every other material and
   browser Back/Forward. The staff-selected viewer never moves the student.
4. Student movement while staff read a different material updates the LIVE row
   and header, including collapsed folders and another authorized course, without
   replacing the staff-selected view. Roster and sidebar material numbering agree.
5. Quiz choice and short/written-answer changes arrive read-only before submission.
   Empty responses/cleared selections propagate.
   Submission/result events remain attributed to the right material and class.
6. PDF page, supplementary-resource close, video seek/play/pause and Turtle source/
   output report correctly. Staff reading/playback creates no student progress,
   grade, point, draft, submission or execution writes.
7. Direct non-code entry, reload, transient disconnection, code → non-code while
   teacher edits are pending, rapid A → B → C navigation and delayed old snapshots
   preserve correct identity. Test two API instances with Redis; source generations
   prevent stale cleanup and events from clearing/repopulating a newer attachment.
8. Existing duplicate staff tabs and five different student watches remain
   independent. Student multi-tab presence retains its existing selection policy;
   a state update from a non-selected source cannot be shown as the selected
   source's response. Closing the last connection clears live state after the
   configured reconnect grace. Leaving all materials clears only the material.
9. Run entry/navigation tests separately for an assigned Teacher, Team Lead and
   Manager. Deny an unassigned Teacher, other academy, removed enrollment, hidden
   material/ancestor, unassigned course, revoked role, disabled flag and forged
   student/material payload. Revocation removes live response access and indicators.
10. Preserve exact bidirectional code editing, acknowledged Edit code mode,
    pending-edit recovery, independent staff terminal runs, public submission
    results, feedback and reference-PDF behavior on coding materials.

Add focused shared-contract, access-predicate, gateway/registry, display-reducer,
registration-lifecycle and roster tests for these invariants. Extend existing
monitoring and mixed-material browser suites with assertions about watch identity
and absence of student writes, not only rendered headers. Run Chromium and WebKit
for student/staff transitions; verify a narrow viewport for header/sidebar usability.
Run shared/API/web type checks and affected lint checks. Record which runtime
backends were exercised for Turtle rather than claiming parity from one backend.

This document has been checked for scope, contradictory selection/follow behavior,
stale-message handling and separation of observation from student writes. No
implementation tests were run for this documentation-only change. Browser
observations above are investigative evidence, not acceptance of a completed fix.
