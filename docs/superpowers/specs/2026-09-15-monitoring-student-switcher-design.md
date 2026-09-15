# Student switcher inside the live monitoring workspace

Date: 2026-09-15
Status: Implemented and browser-verified; pointer regression diagnosis corrected (see §10).

## 1. Goal and scope

Let a teacher move from one student's live workspace to another without returning
to the class roster. Preserve the existing multi-tab workflow: the roster's
separate Open live and new-tab buttons remain, and the switcher offers both
same-tab navigation and an independent new-tab action.

The first version is a searchable class participant popover attached to the
current student's identity in the header. It does not add a permanent sidebar,
class-wide code previews, a help-request queue, or code-history functionality.
Opening the participant list must not begin watching its students.

Related designs:

- [Multi-tab monitoring](2026-09-14-multi-tab-student-monitoring-design.md)
- [Quiet-student monitoring](2026-09-14-quiet-student-monitoring-design.md)
- [Pointers and reading position](2026-09-14-monitoring-pointer-and-reading-position-design.md)
- [Save and recovery](2026-09-15-monitoring-save-and-recovery-design.md)

This extends those designs. Their authorization, document
isolation, independent scrolling, and per-visit cleanup guarantees still apply.

## 2. Findings from the current code

- `live/_components/live-header.tsx` displays an avatar, student name, and class
  name as static content. This is the natural switcher trigger. The curriculum
  control already owns problem navigation; do not turn it into student navigation.
- The live route is scoped by academy, class, and membership. `live/page.tsx`
  calls `monitoring.getStudentContext` before rendering `LiveWorkspace`. Keep
  that authorization path and use `routes.academyTeachStudentLive`.
- `monitoring.getClassRoster`, `mergeRoster`, `studentSearchText`, and the
  presence stream already supply membership, name, problem, and availability.
  Reuse their semantics, including quiet students remaining monitorable.
- `useClassPresence` creates its own socket and reports its own connection
  readiness. It must not mark a live document synchronized or overwrite the
  workspace's edit permission state.
- `useLiveWorkspace` owns a tab-local watch identity and generation checks.
  The live page currently does not give `LiveWorkspace` an explicit identity
  key. Student navigation must not depend on incidental route remount behavior.
- `useTeacherDisplay` currently stores feedback drafts by material within its
  own workspace state. This alone cannot preserve student A's note across a
  remount or distinguish A and B working on the same material.

Paths above are relative to
`packages/web/src/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/`
for live components, and `packages/web/src/lib/monitoring/` for monitoring hooks.

## 3. UX choice

### Recommended: student identity popover

Make the existing avatar/name/class block a button with a downward chevron.
It opens a compact searchable participant panel. This keeps the code editor and
statement at their current widths, and places the action beside the identity it
changes. The other header controls retain their positions and meanings.

A permanent second sidebar would compete with curriculum navigation and narrow
the editor. A separate full-screen student-selection page would repeat the
navigation overhead this feature is intended to remove. Neither is included.

```text
[Course/problem]  [Avatar John ▾]     Problem title       [Read-only] [Saved]
                  Saturday Python

                  ┌──────────────────────────────────────────────┐
                  │ Students · Saturday Python                   │
                  │ [ Search by name or username              ] │
                  │                                              │
                  │ [J] John                    Current          │
                  │     In a problem · String operations         │
                  │ [M] Mina                              [ ↗ ]  │
                  │     In a problem · Sum two numbers            │
                  │ [A] Alex                              [ ↗ ]  │
                  │     In a problem · Loops                      │
                  │ [S] Sara                                     │
                  │     Online · No problem open                  │
                  │ [D] David                                    │
                  │     Offline                                  │
                  └──────────────────────────────────────────────┘
```

### Visual requirements

- Use the existing brand, canvas, card, border, muted-text, and status tokens.
  Match the header's typography and avatar treatment; introduce no new palette.
- Trigger: rounded rectangle, minimum 40px height, subtle hover background,
  visible keyboard focus, truncated name, class subtitle, and explicit chevron.
  Hover and open states make it visibly interactive without overpowering Help.
- Panel: approximately 360–400px wide on desktop, bounded by viewport width
  minus 24px; rounded corners, border, restrained shadow, and consistent 12–16px
  spacing. Align with the trigger and use collision-aware positioning.
- Header and search remain visible while only the participant list scrolls.
  Bound height to the available viewport, normally no more than 480px. Do not
  resize the code/statement panes when opening or closing the panel.
- Rows: avatar, readable student name, second-line status/current problem.
  Target roughly 64px row height. Truncate long problem titles with an accessible
  full label; avoid horizontal scrolling.
- Current student: persistent tinted background and a textual Current marker.
  Status must never depend only on a colored dot.
- Each eligible non-current row has a separate outlined new-tab icon button,
  minimum 36px square, at least 8px from the main navigation area. It must not
  look like the second half of a split button. Show it without requiring hover.
  Use the existing new-tab icon, label, and tooltip conventions.
- Small screens: keep the popover inside the viewport with an independently
  scrollable list. The switcher does not change the editor's existing minimum
  supported viewport. Respect reduced motion and existing light/dark themes.

## 4. Participant list behavior

1. The list is restricted to the current class and authorized roster members.
   No academy-wide student search and no membership IDs inferred from presence.
2. Search matches the existing name/username/email search semantics. Display
   email as a fallback identity only, consistent with the current roster.
3. Place the current student first, then eligible students, then unavailable
   students. Within groups use locale-aware names and membership ID as a stable
   tie-breaker. Do not continuously re-sort by keystrokes or activity time.
4. Freeze existing row order for an open panel session. Update status and
   eligibility in place. Append new members; remove revoked/removed members
   immediately. Recalculate order when the panel next opens. Changing search
   filters the stable order without resetting focus to another student.
5. Current student: show as current; selecting their main area only closes the
   panel and must not restart the watch. No duplicate-watch button is needed in
   that row; existing roster/new-browser-tab workflows remain available.
6. Eligible student's main area navigates this tab to their canonical live URL.
   It does not navigate to the problem listed in the row: the watch resolves
   that student's current problem authoritatively.
7. The adjacent new-tab action is a real link with `target="_blank"`,
   `rel="noopener noreferrer"`, and `prefetch={false}`. It never runs the
   same-tab switch handler. The original workspace and panel remain intact;
   browser preferences determine whether the new tab receives focus.
8. Online without a problem, offline, inactive, and reconnecting students use
   the existing `canOpenLive` predicate. Show the reason when unavailable and
   expose no working navigation/new-tab link. Reading/thinking inside a
   monitorable problem remains eligible; do not require fresh mouse activity.
9. Show a loading skeleton on first fetch, a clear empty class state, and a
   separate No students match state for search. A roster error provides Retry
   inside the panel and does not replace or disable the current live editor.
10. If roster freshness cannot be established, show Updating/Unavailable and
    disable new destination actions until refreshed. Do not relabel all members
    Offline solely because the roster connection failed.
11. A student may leave after selection. The destination shows the existing
    unavailable state and retains access to the class switcher and Back to class;
    it must not fall back to displaying the previous student's code.

## 5. Accessibility and keyboard interaction

Use a popover/dialog containing a search field and a semantic list with sibling
links/buttons. Do not nest the new-tab link inside the primary link. Do not use
listbox options containing interactive links: these rows offer two actions.

- Trigger exposes `aria-expanded`, `aria-controls`, and a localized accessible
  name equivalent to Switch student, current student John.
- Opening focuses search. Tab/Shift+Tab traverses search, eligible primary
  links, and their new-tab links in a predictable order. Enter activates the
  focused action; standard modifier-click behavior is preserved for links.
- Escape closes the panel and returns focus to the trigger. Outside click closes
  it without moving either reading viewport. Focus styles remain visible.
- Each new-tab link has a name including the student and the new-tab behavior;
  its icon is decorative. Current and unavailable rows remain understandable
  to assistive technology without unusable links in the tab order.
- Announce loading/errors and the selected student politely. Do not announce
  every incoming presence delta or steal focus when availability changes.
- After successful same-tab navigation, focus the destination workspace identity
  or heading; never focus Monaco automatically or send a scroll command to the
  student. Keep focus stable if navigation fails.
- All visible and accessible copy is translated into English and Korean.

## 6. Navigation, isolation, and unsaved work

### Same-tab switch

The sequence is request → settle this tab's outstanding teacher edits → navigate
→ authorize destination → fresh watch and document sync → read-only ready.

- Track outstanding teacher document-update acknowledgements explicitly. Do not
  assume a connected socket means a just-typed edit has reached the server.
  Freeze teacher editing while a same-tab switch is pending.
- Wait only for this teacher tab's outstanding updates, not for the student to
  stop typing or for the entire document to become globally clean. Use an
  eight-second acknowledgement deadline. On timeout/rejection, remain on the
  current workspace, preserve its local buffer, and show Retry switch/Stay.
  Do not discard the document to force navigation to succeed.
- Accepted updates remain owned by the server document service, which retains
  dirty documents and retries failed persistence. Switching must not claim
  they are Saved or bypass its release/flush behavior. Hard-process-loss
  durability remains governed by the existing save design.
- A newer switch request supersedes an older pending destination. Check the
  navigation generation before proceeding after asynchronous work. Stay
  cancels a pending navigation; clicking the new-tab action does not navigate
  or retire the current watch.
- Use ordinary canonical route navigation, retaining server authorization and
  browser Back/Forward behavior. Explicitly key the live workspace by academy,
  class, and student membership so document, run, feedback, preview, pointer,
  help-mode, and connection state cannot survive as another student's state.
- Keep a monotonically fenced navigation lifecycle. No delayed response from A
  may publish into B, even during A → B → A. Existing per-watch generation and
  visit checks remain required in addition to the component key.
- Retire only this tab's exact old visit. Other tabs watching A, B, or another
  student continue. Never introduce a teacher-wide stop/disconnect operation.
- The destination always opens in MONITORING/read-only mode. Help/Edit code
  permission is requested separately for the new visit after successful sync.
- Readiness and displayed identity must agree: never display B's name above A's
  editor. Show a clear loading state while B's authorized workspace is loading.

### Feedback and viewport state

Add a tab-local feedback-draft owner above the student-keyed workspace, scoped
by teacher identity, academy, class, student membership, and material. A stable
layout/provider above the membership route is suitable. Preserve these notes
through same-class student switches and Back/Forward. Do not share mutable
composer state across tabs or students, and do not automatically send notes.

An in-flight send retains its original student/material identity. Clear its
stored draft only after success and only if the text still matches what was
sent. A late acknowledgement must not clear a newer edit or another student's
note. Clear this tab's draft store on logout/account change or when leaving its
class workspace layout. Hard-refresh draft persistence is outside this version. Register the standard
browser unsaved-changes guard while unsent notes exist, and guard workspace
controls that exit the class layout. Ordinary same-class switching preserves
notes and must not show a confirmation dialog. Browser unload prompts remain
subject to browser policy and cannot guarantee recovery after a crash.

Opening the popover or another tab preserves the current teacher's viewport.
Switching students does not copy A's editor/statement scroll into B. It never
moves either student's viewport. No cross-student viewport restoration is
required in this version.

## 7. Data and component boundaries

Suggested boundaries, to be adapted to repository conventions:

- `StudentSwitcher`: trigger/panel, search, focus, list states, and actions.
- `StudentSwitcherRow`: current/eligible/unavailable presentation and two
  independent navigation targets; no socket or Y.Doc ownership.
- A panel-scoped roster controller reusing `getClassRoster`, roster merge/search
  helpers, and versioned presence handling. Query keys include academy/class.
- A switch-navigation controller coordinates pending teacher acknowledgements,
  cancellation, note retention, and destination navigation.
- A stable tab-local composer provider holds only feedback text keyed by full
  scope. It must not retain live Y.Doc instances or watch permissions.

For this first version, mount the roster-presence controller only while the panel
is open. Reusing `useClassPresence` gives it one separate lightweight roster
socket, independent of the current watch. Closing the panel unsubscribes/closes
only that socket. This is deliberate: sharing the live socket without refactoring
class-leave ownership and readiness reporting could accidentally affect the watch.

Fetch the authorized roster on open and reconcile cached data with a fresh result
and presence snapshot before enabling destination actions. Version gaps and
reconnection request a fresh snapshot. No per-student code fetches, hidden live
watches, or high-frequency roster polling. Reopening the panel must not accumulate
sockets or event handlers. A roster-only outage must not revoke an otherwise
healthy live watch; actual access revocation still applies everywhere.

Reuse existing server contracts unless implementing the acknowledgement guard
reveals a necessary protocol change. Any such change must be documented and
versioned before implementation is considered complete; do not weaken the guard.

## 8. Acceptance and regression matrix

| Scenario | Required result |
| --- | --- |
| Open/close switcher while reading a long statement | No editor remount or viewport movement; focus returns correctly |
| Current student selected | Panel closes; same visit and document remain |
| A → B and A → B → A, including delayed responses | Correct identities, documents, pointers, terminals, previews, notes; no stale Help grant |
| Rapid competing selections | Only the latest uncancelled destination opens |
| Same-tab switch immediately after teacher typing | Pending update acknowledged before departure; final code survives return/reload |
| Lost/rejected update acknowledgement | Switch stays put, buffer preserved, Retry/Stay offered; no silent data loss |
| Student continues typing throughout switch | Their work continues; teacher is not blocked waiting for a quiet document |
| Switch during failed background save | Server retains dirty work/retries; no false Saved or cross-student replacement |
| A note and B note on the same material | Independent text restored after switching; late sends clear only their own unchanged draft |
| Browser Back/Forward | Correct fresh watch, read-only state, and scoped notes |
| New-tab click from switcher | Correct destination in new tab; original URL, watch, help permission, note, and viewport unchanged |
| Two tabs watching A; one switches to B | Other A watch remains active; aggregate student indicators are correct |
| Student leaves or enrollment is revoked during selection | Safe unavailable/denied state; no stale editor exposed; switcher/back remain available when authorized |
| Roster error or presence gap | Explicit stale/error state and recovery; live editor state not overwritten |
| Quiet student inside a problem | Remains eligible to open |
| Five and fifteen roster members; Unicode/long names | Stable order, useful search, bounded scrolling, no overlapping actions |
| Keyboard, touch, narrow viewport, light/dark | Independent targets, visible focus, readable status, tooltip/label, no clipping |
| Repeated open/close and student switches | No accumulating sockets, watches, handlers, or retired documents |

Unit tests should cover stable ordering/search, eligibility, navigation generations,
acknowledgement gating, and fully scoped draft retention. Browser tests must cover
actual link/new-tab behavior and the session transitions above in Chromium and
WebKit using dedicated seeded accounts. Include a fifteen-member roster and
multiple already-open teacher tabs; this is not a new fifteen-stream load claim.

Run typecheck, lint, i18n, routes, theme, and relevant existing monitoring suites.
Record actual executed browser cases and any failures. Do not mark this spec
complete on typecheck or unit results alone. No migration or deployment is
required merely to write or review this design.


## 9. Implementation

- `packages/web/src/components/monitoring/student-switcher.tsx` implements the
  identity trigger and class participant popover. Its list owns a separate
  presence socket only while open. Retry refreshes that socket and the authorized
  roster without resetting the open panel's existing row order. Destination
  links stay disabled until an actual presence snapshot and roster fetch succeed.
- `student-switcher-order.ts` keeps current/eligible/unavailable ordering stable;
  `student-switch-navigation.ts` fences competing handoffs and cancellation.
  Same-tab navigation closes the popover after this tab's edits are acknowledged;
  the independent new-tab link leaves it open.
- `pending-teacher-updates.ts` retains outstanding operations and retries the exact
  Yjs updates only after failure/timeout; the first switch waits for operations
  already in flight without duplicating them. `use-live-workspace.ts` freezes editing during the eight-second
  handoff deadline. A failed handoff retains its buffer even after Stay;
  a rejected operation also removes local edit readiness. Neither a newer
  persistence notification nor the student's ongoing edits satisfies this guard.
  An exact expected `WATCH_REPLACED` retirement no longer cancels the pending
  successor watch; actual revocation remains terminal. The five-student forged
  edit regression exposed and verified this recovery race.
- The `students/layout.tsx` provider owns tab-local feedback drafts by teacher,
  academy, class, student, and material. It clears on account change or layout
  departure, guards unsent notes on browser unload and class-exit controls, and
  retains newer text through delayed acknowledgements. Confirming matching
  server text also resolves a lost feedback acknowledgement. Feedback commands
  reject a composer whose rendered visit no longer matches the current session.
- The route explicitly keys the workspace by academy/class/student and provides
  a loading boundary. The authorized unavailable-student page also offers the
  switcher. Student-specific revocation updates the roster without treating the
  entire class as revoked; unscoped student presence still receives its own
  terminal revocation. No protocol, database schema, migration, or deployment
  change is required.

Implementation paths above are relative to `packages/web/src/lib/monitoring/`
unless a full path or route-relative path is given.


## 10. Verification record (2026-09-15)

Executed against the local web/API stack with dedicated seeded accounts:

- Nine switcher browser scenarios passed in **both Chromium and WebKit** across
  the recorded runs: same-tab A–B–A and Back/Forward with scoped notes; independent
  new-tab opening while Help remains active; search/current selection/keyboard
  and narrow layout; lost update acknowledgement with Retry; cancelled departure
  with late acknowledgements; rejected edit retention and recovery; delayed
  feedback acknowledgement; roster/presence failure recovery; and an unavailable
  destination with a usable class switcher. Opening/closing the panel preserves
  the existing Monaco instance and its scroll position.
- The fixture contains twenty enrolled roster members. Switcher scenarios use two
  active students plus additional teacher tabs. This verifies roster overflow and
  independent navigation, **not twenty simultaneous live streams**.
- Existing recovery scenarios passed in both engines: lost initial sync recovers,
  and persistence of an earlier revision cannot mark newer code Saved.
- Existing five-student browser scenarios verified independent duplicate-watch
  closure and repeated rejection of unauthorized edits followed by legitimate
  Help editing in both engines. The latter uncovered the expected-retirement
  race fixed in this implementation.
- The complete web unit suite passed: **1,025 tests across 114 files**. API
  monitoring tests passed: 258 ordinary tests plus eight tests against a real,
  disposable Redis instance. Redis was stopped after the run.

The browser runs exercise the documented navigation and recovery behavior;
there is no new production deployment, migration, or fifteen-stream load claim.
Automated pointer-resize regression results and final static checks are recorded
below separately. Visual inspection covered the narrow participant popover;
this is not a claim of exhaustive manual touch, screen-reader, or theme testing.


Final static verification passed: web and e2e TypeScript, web lint (zero errors;
78 existing warnings), i18n catalog checks and 113 i18n tests, canonical route
checks, theme checks, and `git diff --check`.

### Resolved test failure: pointer idle expiry during resize verification

Follow-up instrumentation corrected the initial diagnosis. WebKit delivered both
Monaco geometry events and ResizeObserver notifications as the pane moved. The
teacher arrow was removed before the first resize notification; it was not stuck
at its previous coordinate. `use-student-monitoring.ts` deliberately uses
`expiresWhenIdle`, which removes teacher awareness after three idle seconds.
The slower WebKit browser/driver sequence exceeded that lifetime. A snapshot of
the earlier arrow position was insufficient evidence of a geometry defect.

The regression test now controls the student's browser clock and advances frames
explicitly so the geometry assertions occur before idle expiry. It drags both
receiver dividers with a stationary remote code anchor, checks the arrow within
two pixels of Monaco's code position, verifies both carets at unequal viewport
sizes, and separately advances 3.1 seconds to assert that the teacher arrow
expires. The clock resumes in cleanup. Socket.IO, Yjs, Monaco, and real resize
observers remain in use; pointer delivery and projection are not mocked.

The corrected pointer scenario passed in Chromium and WebKit with five active
student/watch pairs per browser. Production pointer behavior and its three-second
expiry remain unchanged. The fix is to the regression test and this evidence
record, not to the coordinate algorithm. All 56 awareness unit tests and the e2e
TypeScript check also passed. This resolves the previously reported resize failure;
it does not claim exhaustive pointer reliability under every browser/layout.

The additional continuous-edit/watch-open/reload/close scenario passed in
Chromium and in a standalone WebKit rerun. The combined WebKit run initially
stopped at `page.goto` with “Provisiolal navigation canceled”; no assertion from
that attempt is counted as passed. The unchanged standalone scenario subsequently
passed with five student/watch pairs. Thus both targeted scenarios have passing
results in both engines, with that initial navigation failure retained in this
record rather than describing the combined run as entirely green.

Useful reproduction commands (local stack and dedicated auth states required):

```sh
E2E_BASE_URL=http://localhost:3000 E2E_AUTH_STATE_DIR="$PWD/e2e/.auth" E2E_SKIP_SEED=1 pnpm e2e monitoring-student-switcher --project=chromium --project=webkit-monitoring
E2E_BASE_URL=http://localhost:3000 E2E_AUTH_STATE_DIR="$PWD/e2e/.auth" E2E_SKIP_SEED=1 pnpm e2e multi-tab-monitoring --project=webkit-monitoring --grep 'code pointers and carets'
pnpm --filter @cove/web test
```

### Reconnect recovery follow-up (2026-09-15)

A teacher's unacknowledged edits belong to the original draft, independently of
its watch visit. Reconnecting must retain that Y.Doc and pause the pending-update
queue. A fresh watch must confirm the same draft and compatible server CRDT
history, then obtain server-confirmed editing permission before replaying the
original operations with its fresh visit identity. Successful recovery restores
read-only mode. A pending switch can finish only after those operations are
accepted; acknowledgements from the disconnected transport cannot release it.

If the student moved to another problem, history was rebuilt, or authorization
cannot be recovered, retain the original code and keep editing locked. Provide
Download retained code, Retry connection, and explicitly confirmed Discard
retained edits. Discard cancels an awaiting handoff rather than treating it as a
successful save. Browser unload warns while authorized edits remain pending.
These buffers are tab-memory recovery, not durable storage across browser exit.

Regression coverage includes paused-queue deadlines, stale acknowledgements,
discard cancellation, history compatibility, ordinary interrupted delivery, and
interrupted delivery followed by switching students. Browser validation of this
follow-up is recorded separately from the original switcher matrix above.

Follow-up validation: all **1,031 web unit tests** passed, including six new
queue/history regressions. Web and e2e typechecks, targeted ESLint, i18n validation
(113 catalog tests), canonical routes, theme checks, and `git diff --check` passed.
The combined recovery/switcher browser run passed **28/28** in Chromium and WebKit,
including both new interrupted-delivery cases in each browser. The switcher
fixture now uses Monaco `executeEdits` so student setup and cleanup follow the
actual edit pipeline. These are local-stack results; no production rollout was
performed.

The five-student read-only/forged-edit permission regression also passed in both
Chromium and WebKit (2/2), bringing follow-up browser coverage to 30 passing cases.
Its first attempt stopped in setup on an expired saved student login; refreshing
the local test sessions resolved that setup failure before the successful rerun.
