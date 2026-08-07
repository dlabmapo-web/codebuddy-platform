# V2 Fullscreen Curriculum Navigator Design

**Date:** 2026-08-07

**Status:** Approved for implementation

**Branch:** `feat/cove-studio-v2`

**Recreates:** `main` v1 fullscreen curriculum navigator behavior

**Companions:**

- `2026-07-31-student-learning-experience-design.md`
- `2026-08-04-teacher-live-monitoring-design.md`
- `2026-08-07-student-monitoring-single-socket-repair-design.md`
- `2026-08-07-v2-student-feedback-delivery-design.md`

## 1. Decision

Add one shared, collapsible curriculum navigator to the v2 student exercise
workspace and teacher live workspace. Reproduce the complete v1 interaction
model while using v2's Course → Module → Lecture → Exercise domain, access
rules, realtime gateway, local-first drafts, and component boundaries.

The selected architecture is:

1. a normalized shared navigator model and presentational component;
2. separate student and teacher controllers;
3. server-authorized student progress for both roles;
4. a dedicated realtime event for a watched student's exercise movement;
5. strict separation between the teacher's live target and displayed preview.

V1's periodic active-context polling is not migrated. V2 already has an
authenticated Socket.IO presence path that reports material changes, so
movement becomes a bounded server event instead of a delayed repeated query.

## 2. Goals

- Show the complete current-course outline inside both fullscreen workspaces.
- Keep the student's curriculum position and progress understandable without
  returning to the course page.
- Let a student move to any visible programming exercise in the course using
  the existing in-place workspace transition.
- Let the assigned teacher inspect another exercise without leaving, ending,
  or corrupting the live watch.
- Update the teacher's LIVE marker immediately when the student moves, without
  navigating the teacher automatically.
- Preserve Monaco, Pyodide, drafts, terminal state, feedback drafts, and browser
  history according to the mode-specific rules below.
- Keep hidden judge data and another student's progress behind server authority.
- Match v1 behavior while expressing the surface in the established v2 visual
  system, responsive layout, localization, and accessibility patterns.

## 3. Non-goals

- Replacing the course catalog or course-outline page.
- Showing every course assigned to an academy in one fullscreen panel.
- Allowing the teacher to run, submit, persist, or broadcast preview code.
- Changing the existing v2 rule that run and submit remain student-only.
- Automatically following a student when they move.
- Synchronizing the teacher's selected preview, scroll position, or expanded
  curriculum branches to the student.
- Adding drag-to-resize for the navigator.
- Adding database tables or storing teacher preview state.
- Migrating v1 subjects, stages, chapters, collaboration sessions, or polling.

## 4. Vocabulary and parity mapping

| V1 | V2 |
| --- | --- |
| Subject | Course |
| Stage | Module |
| Chapter | Lecture |
| Problem | Programming exercise / material |
| Passed | Solved |
| Attempted | In progress |
| Untouched | Not started |
| Active session check | Authorized realtime material-change event |

"Same behavior" means equivalent user-visible behavior after this semantic
mapping. It does not mean copying v1 components, API routes, Supabase channels,
polling, authorization fallbacks, or mixed controller/view code.

## 5. Shared user experience

### 5.1 Header context

Both fullscreen headers gain a compact curriculum trigger beside the exercise
identity. It shows the current displayed path:

`Course › Module › Lecture › Exercise`

The path describes the exercise rendered in the workspace, not necessarily the
exercise carrying the teacher's LIVE marker. Long segments truncate visually
and expose their complete text through an accessible tooltip.

The trigger:

- opens and closes the navigator;
- exposes `aria-expanded` and `aria-controls`;
- remains reachable while the panel is open;
- receives focus again when Escape or the panel close button closes it.

### 5.2 Navigator geometry

- Fresh fullscreen entries start closed.
- At the desktop breakpoint, the panel is a dedicated 320px column below the
  fullscreen header. It reduces the width available to the statement/editor
  workspace and never covers either surface.
- The panel and workspace reserve the same shared width/header geometry rather
  than duplicating page-specific offsets.
- The statement/editor split retains its relative proportion inside the
  remaining width. Monaco lays itself out after the width transition.
- At narrow widths, the navigator becomes a non-modal left overlay with a small
  right margin. It does not dim, blur, inert, or trap focus in the workspace.
- The header and course footer are fixed within the panel. Only the outline tree
  scrolls, with `min-height: 0`, overscroll containment, and stable scrollbar
  space.
- The panel closes through its close button, Escape, or the header trigger.
- The same geometry and scrolling behavior applies to student and teacher
  pages.
- The panel remains open across a successful in-place student transition.

The navigator may use a document-level portal if required by the fullscreen
stacking contexts. Geometry values live in one shared module or CSS contract.

### 5.3 Outline tree

The panel represents one course:

1. course header;
2. visible modules in canonical position order;
3. visible lectures in canonical position order;
4. visible programming exercises in canonical material position order.

Modules and lectures are keyboard-operable accordions. The displayed exercise's
module and lecture expand on initial load. User-controlled expansion state is
preserved while the panel remains mounted and is not reset by realtime movement.

The footer links to the role-appropriate parent:

- student: My courses / current course outline;
- teacher: the monitored class or student roster.

It does not load all courses into the panel.

### 5.4 Exercise rows

Each row contains:

- stable course-relative exercise number;
- exercise title with truncation and complete accessible name;
- progress state: Solved, In progress, or Not started;
- displayed selection state;
- teacher-only LIVE marker where applicable;
- loading/disabled state for the current transition.

Selection and LIVE are independent states. When the teacher previews another
exercise, the preview row owns `aria-current` and the selected treatment; the
student's active exercise retains a smaller textual LIVE badge. Status is never
communicated by color alone.

Only programming exercises reachable through the effective visible course are
returned. Hidden modules, lectures, materials, and unpublished exercises never
reach either browser.

## 6. Student behavior

Every visible exercise row is actionable. Previous/Next and arbitrary row
selection call the same transition command.

### 6.1 Successful transition

When the student selects another exercise:

1. ignore selection of the currently displayed material;
2. mark navigation busy and reject overlapping selections;
3. flush the current local-first draft immediately;
4. stop the Python runner and clear the current terminal transcript;
5. reset submission-result, sample, and revealed-hint UI state;
6. fetch the destination workspace through the existing authorized learn
   contract, using prefetched TanStack Query data when present;
7. commit the new workspace only after the fetch succeeds;
8. update the URL with `history.pushState` without remounting Monaco or Pyodide;
9. allow the existing monitoring hook to publish the new material on the same
   shared student socket;
10. retain the open navigator and highlight the destination;
11. prefetch the new neighbors and refresh course progress after relevant
    submissions.

The old workspace stays rendered until step 7, so the UI never combines a new
breadcrumb with old code or vice versa.

### 6.2 Failure and cancellation

- Destination failure preserves the current workspace, code, URL, monitoring
  session, and navigator selection.
- Failure displays a recoverable inline/toast error and a retry action. It does
  not fall back automatically to a full `router.push`, because that can discard
  context and violate v1's preservation guarantee.
- A newer destination selection aborts or supersedes the older request.
- A late response may commit only when its transition token is still current.
- Abort during page exit or supersession is not surfaced as an application
  error.
- Navigation is disabled while a sample run, ordinary run, submission, or
  transition is active. Existing stop behavior remains available for an active
  local run.

### 6.3 Browser history

Back/forward fetches and restores the material named by the popped URL using the
same guarded transition machinery. It does not append a second history entry.
Failure keeps the last valid workspace and reconciles the URL to that workspace
instead of showing mismatched content.

## 7. Teacher behavior

The teacher controller owns two independent concepts:

```ts
type TeacherDisplayState =
  | { mode: 'live'; materialId: string }
  | { mode: 'preview'; materialId: string; snapshot: MonitoringExercisePreview };

type StudentLiveTarget = {
  materialId: string | null;
  courseId: string | null;
  path: NavigatorPath | null;
  available: boolean;
};
```

Realtime events may replace `StudentLiveTarget`. Only a deliberate teacher
action may replace `TeacherDisplayState`.

### 7.1 Live mode

- The displayed material is the material authorized by the current watch.
- Monaco, terminal, result summaries, awareness, and feedback retain their
  existing v2 live behavior.
- The teacher retains only existing v2 capabilities: collaborative editing and
  feedback while authorized. Run and submit remain student-only.
- The displayed row and LIVE marker may initially refer to the same exercise.

### 7.2 Preview mode

Selecting a non-live exercise loads an authorized, public snapshot and enters
preview mode. The preview renders:

- course/module/lecture breadcrumb;
- language, difficulty, time limit, and memory limit;
- description, input, output, and constraints;
- public sample inputs and outputs;
- hints permitted to students;
- starter code in a read-only editor.

The response and UI exclude hidden inputs, hidden expected outputs, private
judge configuration, submission details, the student's draft, Yjs identifiers,
terminal content, and another exercise's feedback thread.

Preview mode:

- does not stop the underlying live watch;
- does not apply live Yjs updates to the preview editor;
- cannot edit, run, submit, save, persist, broadcast, create awareness, or send
  feedback;
- shows a persistent banner such as
  `Previewing {preview} · Student is LIVE on {live}`;
- provides `Return to live` and allows selecting the LIVE row;
- keeps preview request loading/error state confined to preview surfaces.

A failed preview request preserves the previous valid display state. Stale
responses cannot replace a newer teacher selection.

### 7.3 Student movement

When the student opens another exercise, the gateway emits a dedicated,
authorized context-change event to the active teacher watch. The event updates:

- the LIVE marker when the material belongs to the displayed course;
- the compact live-status label/path;
- whether Return to live is available;
- the latest target used by the next explicit follow command.

It does not:

- switch the teacher's displayed exercise;
- replace code, terminal, result, or feedback state;
- reset expanded outline branches or scroll position;
- discard an unsent feedback draft;
- silently join a new Yjs document.

If the student moves to another course, the current outline stays displayed and
the header reports the new live path without inventing a row in the old course.
Explicit Return to live loads the new authorized outline as part of following.

If no monitorable exercise is active, the teacher sees `Student is not currently
solving an exercise`; the last valid display remains available for review, with
all live mutations disabled.

### 7.4 Following the latest live target

Selecting the LIVE row or Return to live issues a follow command; it never trusts
the possibly stale client material ID as authorization.

1. The server re-reads current authenticated presence.
2. It revalidates teacher assignment, student enrollment, assigned course, and
   material visibility.
3. It ends/replaces the prior watch visit according to existing monitoring
   semantics.
4. It returns the authorized material and draft identifiers.
5. The client creates a fresh collaboration session/document keyed by the new
   watch response and synchronizes it before enabling live editing.
6. It loads the new public exercise context and course navigator when needed.
7. Only then does it commit Live mode.

The existing `useLiveWorkspace` must not reuse one Y.Doc across two drafts.
Watch orchestration and one-watch collaboration state become separate
boundaries so the old document can be destroyed deterministically after a
successful replacement.

Unsent feedback composer text is stored per material in page-local state. A
follow or preview toggle therefore cannot move text into the wrong thread or
discard it accidentally.

## 8. Shared data model

Reuse the existing `LearnCourseOutline` ordering and progress semantics. Add a
small view model only for cross-role navigator rendering:

```ts
type WorkspaceNavigatorContext = {
  path: NavigatorPath;
  course: {
    id: string;
    title: string;
    progress: LearnCourseProgress;
    modules: Array<{
      id: string;
      title: string;
      position: number;
      lectures: Array<{
        id: string;
        title: string;
        position: number;
        exercises: Array<{
          materialId: string;
          title: string;
          position: number;
          status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SOLVED';
          bestScore: number | null;
        }>;
      }>;
    }>;
  };
};
```

This may be a schema alias/refinement over `LearnCourseOutline`; it must not
become a second independently maintained curriculum type.

The canonical flattening/numbering helpers remain in `@cove/shared` and are used
by the outline page, navigator, previous/next resolver, and tests.

## 9. Server and contract design

### 9.1 Learn bootstrap

Refactor the internal learn service so one authorized visible-course read can
derive both:

- `LearnExerciseWorkspace` for the requested material; and
- `WorkspaceNavigatorContext` for its course and authenticated student.

The initial fullscreen route receives both in one bootstrap result. Smooth
transitions continue fetching the lean per-exercise workspace and reuse the
course navigator already in memory. Course outline data is refetched only when
the course changes or progress is invalidated.

Student identity always comes from the authenticated membership. No student ID
is accepted from the browser.

### 9.2 Teacher curriculum context

Extend the monitoring domain with an assigned-teacher-only query shaped around:

```ts
{
  academyId: string;
  classId: string;
  membershipId: string;
  materialId: string;
}
```

The service derives the student's user ID after checking the effective class
assignment and enrollment. It verifies that the material's course is assigned
to that class, then returns the student's navigator context for that course.

The browser cannot select an arbitrary student's progress merely by knowing a
user or material ID.

### 9.3 Teacher preview

Add an authorized monitoring preview query using the same teacher/class/student
claim. Its result is a dedicated `MonitoringExercisePreview`, built from the
public exercise projection already used by `MonitoringService.loadExercise`.

Do not reuse a response that includes `draftId`. Public projection and live
collaboration identifiers must be different contract fields or different
contracts so preview code cannot accidentally join a room.

### 9.4 Realtime movement event

Add a server event similar to:

```ts
type StudentContextChangedEvent = {
  studentMembershipId: string;
  materialId: string | null;
  courseId: string | null;
  path: NavigatorPath | null;
  available: boolean;
  changedAt: string;
};
```

Delivery rules:

- The gateway compares the newly verified presence material with the previous
  published material.
- It emits only on a material/course/availability change, not on every heartbeat.
- The teacher socket joins a server-controlled watch-context room only after
  `watchStart` authorization and leaves it when the watch ends or is replaced.
- Student sockets and ordinary class-roster viewers do not join this room.
- The event contains no source code, draft ID, test data, feedback, teacher
  identity, or private student identity.
- The teacher treats it as metadata, not permission. Following always performs
  a new authoritative `watchStart`-style validation.
- Reconnect starts from a fresh watch acknowledgement and context query, so a
  missed event cannot leave a permanently stale live target.

Class presence snapshots remain responsible for roster rows. The new event is
for an already-authorized focused watch and does not expand broadcast scope.

## 10. Component boundaries

### `WorkspaceCurriculumNavigator`

A shared presentational component owns:

- panel visibility, close behavior, focus restoration, and portal;
- responsive geometry;
- module/lecture accordion state;
- hierarchy, numbering, progress, displayed, and LIVE presentation;
- keyboard row activation and accessibility attributes.

It receives data and callbacks. It does not call oRPC, own a socket, change a
Y.Doc, persist drafts, or interpret monitoring authorization.

### Student navigation controller

`useExerciseNavigation` owns guarded fetch/commit/history behavior. The student
workspace owns pre-transition effects—draft flush, runner stop/clear, and local
result reset—and passes one command to both header navigation and the navigator.

### Teacher display controller

A dedicated hook/reducer owns:

- displayed live versus preview state;
- latest live target metadata;
- preview request lifecycle and supersession;
- course navigator context;
- per-material unsent feedback drafts;
- explicit Return to live orchestration.

It consumes the live-workspace transport boundary but does not implement Yjs or
Socket.IO protocols itself.

### Live collaboration session

One keyed child/hook owns exactly one authorized watch response and one Y.Doc.
It owns synchronization, awareness, terminal mirror, result state, live editing,
and cleanup for that watch only. Preview UI never receives the live document as
its editor value.

### Shared statement rendering

Continue using the shared v2 `ProblemStatement` presentation for student, live
teacher, and teacher preview. Mode-specific wrappers control revealed hints and
capabilities; public statement fields should not be reimplemented separately.

## 11. State and concurrency invariants

- `displayedMaterialId` determines breadcrumb, selected row, statement, and
  editor contents.
- `liveMaterialId` determines only LIVE metadata until Return to live succeeds.
- Preview state never contains or derives a `draftId`.
- One collaboration session owns one Y.Doc and one material.
- No async response commits after its request token has been superseded.
- Navigation commits workspace, URL, and monitoring material in one ordered
  transition; partial destination state is not rendered.
- Realtime movement is advisory metadata; authorization is rechecked on follow.
- Feedback composer text is keyed by its material and cannot cross threads.
- A curriculum error cannot prevent solving or live monitoring.
- An outline refresh merges progress without resetting the user's accordion
  expansion or teacher display selection.

## 12. Loading, errors, and recovery

- Initial navigator failure shows a compact retry state inside the panel while
  the workspace remains usable.
- Student transition failure leaves the current exercise and URL intact.
- Teacher preview loading affects only preview surfaces; the live watch remains
  connected.
- Teacher preview failure preserves the previous valid display.
- Movement-event disconnect exposes existing monitoring reconnecting state. On
  recovery, the watch acknowledgement and server context replace stale target
  metadata.
- Access revocation ends live mutation immediately and prevents preview/follow
  queries; already rendered public text may remain until route exit, matching
  existing monitoring behavior.
- A hidden/deleted material returns the same public not-available shape as any
  material outside the teacher's claim.
- If a course assignment changes, the next preview, context refresh, or follow
  revalidates it; gateway revocation remains authoritative for the active watch.
- Errors are localized and actionable without exposing authorization details.

## 13. Performance

- Initial student bootstrap reads one visible course graph and its progress.
- Student transitions return only the destination workspace while remaining in
  the same course.
- Neighbor workspaces use the existing 60-second query cache/prefetch behavior.
- Teacher initial context loads one monitored student's course outline in a
  bounded query; preview fetches one public exercise.
- Progress uses a single `userId + materialIds` query, not one query per row.
- Material changes generate events only on verified context changes, never on
  15-second heartbeats.
- The navigator renders the current course only. Large lists use stable keys and
  memoized normalized rows; virtualization is added only if measured course
  sizes exceed the existing content limits.
- No new polling interval is introduced.

## 14. Security and privacy

- Student learn queries derive the student from authenticated identity.
- Teacher queries require feature access, effective assigned teacher, active
  class, active enrolled student, class-course assignment, and visible material.
- Preview and navigator queries use a public projection and never return hidden
  test contents or expected outputs.
- Knowing a membership ID or material ID is not sufficient authorization.
- Realtime rooms are joined server-side after claims are established; room names
  are not accepted from clients.
- The movement event exposes the minimum context already visible to the assigned
  teacher.
- Return to live resolves current server presence and does not trust the event's
  material ID as authority.
- Existing rate limits, bounded payload schemas, revocation, and monitoring
  metrics apply to new commands/events.

## 15. Accessibility and localization

- All new copy lives in the existing learn/monitoring i18n namespaces for every
  supported locale.
- Trigger, close, accordions, rows, retry, Preview, and Return to live are fully
  keyboard operable.
- The selected exercise uses `aria-current`; LIVE and progress use visible text
  or accessible labels in addition to color.
- Escape closes the panel without changing display state.
- Focus is not trapped because the navigator is non-modal.
- Closing from the trigger, close button, or Escape restores focus consistently.
- Movement updates use a polite live region and never steal focus.
- Loading announcements are scoped to the affected navigator/preview region.
- Reduced-motion preferences remove or shorten panel width transitions.

## 16. Observability

Add bounded metrics for:

- navigator bootstrap success/failure and latency by role;
- student transition success/failure/abort and cache hit where available;
- teacher preview success/failure/abort;
- context-change events emitted and received;
- explicit follow success/failure;
- stale response suppression;
- watch replacement and document synchronization latency, reusing existing
  monitoring metrics where possible.

Do not log source code, test data, feedback bodies, student email, or curriculum
descriptions. Logs may include request/visit IDs and authorized resource IDs
under the platform's existing structured logging policy.

## 17. Testing strategy

### 17.1 Shared/unit tests

- Canonical course/module/lecture/exercise ordering and flattening.
- Visible-programming-exercise filtering.
- Stable course-relative numbering.
- Solved/In progress/Not started mapping.
- Displayed selection versus LIVE marker independence.
- Accordion initialization and preservation.
- Teacher reducer transitions among live, preview, movement, unavailable, and
  explicit follow states.
- Preview isolation from live document and terminal updates.
- Per-material feedback draft preservation.
- Stale navigation/preview response suppression.
- Popstate commit and failure reconciliation.

### 17.2 API/service tests

- Student receives only their own progress and visible assigned course content.
- Teacher receives the monitored student's progress only with an effective
  assignment and enrollment.
- Unassigned teacher, wrong class, wrong academy, inactive membership, suspended
  user, unassigned course, and hidden material all fail without existence leaks.
- Preview contains public samples/hints/starter code and excludes hidden cases,
  student draft, Yjs identifiers, terminal, and feedback.
- Navigator progress is obtained in a bounded query.
- Follow re-resolves current presence instead of trusting a supplied material.

### 17.3 Gateway tests

- Movement event emits once when verified material changes.
- Heartbeats on the same material do not emit movement events.
- Invalid/unassigned material becomes unavailable rather than being broadcast.
- Only the active authorized watch-context room receives the event.
- Watch replacement leaves the old room and joins the new one.
- Revocation/disconnect ends event delivery.
- Reconnect returns authoritative current material even if an event was missed.

### 17.4 Browser acceptance

1. Student opens the panel and sees the correct path, course tree, progress, and
   expanded current lecture.
2. Desktop opening creates a dedicated 320px column without covering or
   disabling the statement, Monaco, terminal, or feedback.
3. Narrow viewports use the non-modal overlay and keep the workspace operable.
4. Student selects an arbitrary exercise; the draft flushes, run stops, URL and
   breadcrumb update, Pyodide/Monaco remain mounted, and the panel stays open.
5. A failed destination leaves the previous code, exercise, URL, and monitoring
   context intact and offers retry.
6. Previous/Next, navigator selection, and browser back/forward share consistent
   transition behavior.
7. Progress badges update after attempted and solved submissions.
8. Teacher sees the same course hierarchy and that student's progress.
9. Teacher previews a non-live exercise with the complete public statement and
   read-only starter code.
10. Preview cannot edit, run, submit, persist, broadcast, join a document, or
    send feedback.
11. Incoming live code, terminal, and result events do not overwrite preview.
12. Student movement moves only the LIVE marker/status and preserves the
    teacher's preview, tree expansion, scroll, and unsent feedback.
13. Return to live follows the latest server-authorized exercise, creates a
    fresh synchronized document, and shows the latest code/terminal/feedback.
14. Cross-course movement preserves the old displayed course until explicit
    follow, then loads the new course outline.
15. Student-unavailable and reconnecting states retain the last valid display
    without enabling stale live mutations.
16. Close button, repeated trigger, and Escape close correctly and restore
    focus; all rows/accordions work by keyboard.
17. English and Korean copy, light/dark themes, long titles, and long outlines
    are visually verified in both roles.

## 18. Rollout sequence

1. Shared schemas, normalization helpers, and learn-service bootstrap refactor.
2. Shared presentational navigator and geometry contract.
3. Student integration and guarded arbitrary navigation.
4. Monitoring curriculum/preview queries and authorization tests.
5. Gateway watch-context event and reconnect tests.
6. Teacher display controller and one-document-per-watch refactor.
7. Teacher navigator/preview integration.
8. Cross-role browser tests, localization, accessibility, and visual QA.

Student and teacher navigator surfaces should release together after both pass
acceptance. Previous/Next controls remain as quick navigation; the panel
supplements them. No database migration is required.

## 19. Acceptance gate

The feature is complete only when:

- both roles have equivalent navigator geometry and hierarchy behavior;
- all V1 user-visible sidebar behaviors listed here exist in V2;
- teacher movement is realtime and never auto-navigates the display;
- preview is demonstrably unable to join or mutate live collaboration state;
- student failures preserve the current workspace;
- authorization tests prove cross-student and hidden-data isolation;
- unit, API, gateway, Chromium, and WebKit suites pass;
- no regressions appear in existing learning, monitoring, feedback, terminal,
  presence, pointer, or caret coverage.
