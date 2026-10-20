# Shared course pages and staff practice verification

Date: 2026-10-20 (Asia/Seoul)
Branch: `feat/shared-course-staff-practice`
Specification: [shared course workspace and role behavior](../superpowers/specs/2026-10-20-shared-course-workspace-role-behavior-design.md)
Plan: [implementation sequence](../superpowers/plans/2026-10-20-shared-course-staff-practice-implementation.md)

## Delivered behavior

- Courses is a common navigation destination. Staff open the same course outline
  and exercise URLs as students; the missing student class no longer redirects
  them into an authoring form.
- Staff have a personal editor, local Python Run/stdin, sample runs, server Submit,
  private practice history, last practice score, autosave and conflict recovery.
  The workspace mounts no student solve session, presence or collaboration hooks.
- Elice's compact toolbar, material/editor split, terminal controls, navigation
  footer and fullscreen behavior use Cove's existing blue tokens and typography.
  Mobile materials/code tabs preserve the mounted editor, PDF and result.
- Curriculum owners get Edit and explicit private-solution loading. Teachers get
  Review details and Observe students without new curriculum-editing or private
  reference-solution authority. The common outline has a Manage course entry.
- Authoring opens separately and has a guarded return to personal practice.
  Direct authoring entries can open an explicit author preview, including hidden
  content, subject to review permission. Preview drafts are separated by grading
  revision and never overwrite ordinary practice drafts.
- PDF references retain the reader, page controls and independent screen state.
  Turtle, short-answer and newer multiple-choice materials use separate practice
  drafts/results through their existing material UI and bounded evaluators.
- A member's actual role scopes are combined. Staff who also hold a valid student
  enrollment can deliberately enter student participation; the server resolves
  the real class. Role presentation cookies grant no additional authority.

## Data and worker isolation

Four additive migrations create private practice storage, record draft revisions,
name indexes consistently and restrict browser database access. They were applied
only to the existing development Supabase database after checking its identity.
No production migration or deployment was performed.

`StaffPracticeDraft` and `StaffPracticeAttempt` are separate from student drafts,
submissions, progress and solve sessions. Requests are scoped to the owner,
academy, assigned/reviewable material and publication context. Snapshot JSON is
internal and can contain hidden expectations; RLS and revocation of grants to
`anon`/`authenticated` prevent direct browser access.

The judge reuses the existing grading profiles, comparators, limits and execution
paths with a separate persistence sink. Practice uses its own BullMQ queue so an
older judge cannot consume a practice job as a student submission during a rolling
update. It shares the background execution capacity gate with maintenance work,
leaving the reserved student execution capacity available.

Concurrent requests with the same request ID initially exposed a Prisma upsert
race. Practice now uses atomic `INSERT ... ON CONFLICT` through `createMany` with
`skipDuplicates`, reads the winning record and verifies the original request.
Draft saves use revision comparison and conditional updates; a stale or missing
base cannot replace a newer buffer.

The local run also exposed that BullMQ's options object did not resolve the
configured Redis URL. Queue connections now explicitly preserve host, port,
credentials, database and TLS. Validation uses the existing authenticated local
Redis configuration without changing its settings.

## Browser evidence

Verified locally in Chrome with independent fixture accounts:

1. Team Lead: shared course navigation, staff outline, PDF/editor workspace,
   independent Run output `hello`, real judge Submit accepted at 100/100, explicit
   Edit, and return to the personal draft.
2. Teacher: same exercise URL without student enrollment, Run output `hello`,
   Submit accepted at 100/100, Review details and Observe students present, Edit
   and private-solution controls absent.
3. Student: same exercise URL retains real delivery class, student help/presence
   controls, solve timer, saved student draft, Run/Submit and student progress.
   Staff practice, Edit and private-solution controls are absent. No extra student
   submission was made during this browser check.
4. At 375px, materials/code switching retains the accepted result and editor;
   all primary controls fit. The temporary viewport override was reset.

Manager, Team Lead and Teacher also each submit and receive accepted practice
results in the development database integration tests. The tests deny students
and unassigned teachers and verify private history ownership.

Screenshots retained locally:

- `/tmp/cove-staff-practice-desktop.jpg`
- `/tmp/cove-staff-practice-mobile.jpg`
- `/tmp/cove-staff-practice-teacher.jpg`

The Team Lead browser attempt created one practice attempt, zero student
submissions, zero student progress records and zero student solve sessions for
that actor/material. `scripts/verify-staff-practice-local.mts` reproduces this
read-only count check. The queue verifier is opt-in, requires the development
fixture/local Redis and deletes only the attempt it creates.

## Validation

- Full web unit suite: 1,260 passed, including the new staff workspace checks.
- Shared unit suite: 872 passed. Translation suite: 134 passed.
- Focused API learning/manual/grading/profile checks: 200 passed; five opt-in
  integration checks skipped in that run.
- Final role, scope, request/draft conflict and queue-policy checks: 36 passed.
- Real development database integration: six passed, including all staff roles,
  concurrent request deduplication, hidden-result redaction, no student side
  effects, owner-scoped conflicts, manual practice and server-only database access.
- Repository typechecks, including E2E TypeScript, passed. Production web, API and judge-worker
  builds pass. The dedicated practice queue was then verified with the compiled
  judge: 100/100, unchanged student submission count, generated attempt cleaned up.
- Repository lint reports no errors after fixing test-only literal labels;
  existing warnings remain. Canonical-route and translation checks pass.

The initial broad API suite passed 1,482 tests and exposed three timing failures
in existing Python/sandbox tests during concurrent compilation plus one expected
query assertion that still assumed a single student role. Role-set assertions
were updated. Sequential runtime/sandbox rechecks passed 119 tests; a final
isolated recheck passed the three `sys.exit` cases, including the one that had hit
its five-second test timeout. No execution-engine test deadlines were relaxed.

## Boundaries

Cove's existing role responsibilities remain the policy described in the spec;
this is behavioral/UI parity, not a claim that Elice's role names are equivalent.
The existing `/versions/...` routes are legacy aliases to current content, with
no historical CourseVersion model in this checkout. This change does not invent
historical course snapshots: author preview is tied to the current material and
its grading revision, and each submitted attempt freezes its own grading input.

Production rollout requires the additive migrations and updated API/judge builds.
Practice queue separation allows either process to be updated first; student jobs
remain on their existing queue. Disabling the new practice entry does not modify
student records or require deleting practice history.

Temporary local API, judge and web test servers were stopped after verification.
Unrelated pre-existing untracked documentation was left untouched.


## Teacher solution and observation correction

Following the requested correction, teachers may explicitly read reference
solutions for visible exercises delivered through their active assigned classes.
The solution endpoint checks review permission and teaching assignment separately
from editing permission, and pins the requested course to its academy.
Managers and Team Leads retain their existing solution authority.

Observe students now opens `/teach/students?course=<courseId>` for Teacher
members, including members with additional roles. Both server rendering and
client refresh send the course filter. The roster restricts rows and class options
to assigned classes delivering that course; unknown or unassigned courses return
an empty roster. Course-context row actions open existing live student monitoring.
The ordinary unfiltered roster retains its student profile links.

Validation for this correction: 62 focused API tests, three staff workspace
tests, and three shared roster schema tests passed. Changed web files pass
ESLint, and API and web TypeScript checks pass. No database migration is required. These are automated checks; a new
browser walkthrough of this correction has not been performed.


## In-place solution and active-student modals

The later UX correction replaces the inline answer section and observation
navigation with Cove modal dialogs in the current problem workspace. All
reference answers are expanded in the answer dialog. The observation dialog
uses the authorized course roster plus existing class-presence subscriptions,
showing only SOLVING students on the exact course/material. Offline, idle,
reconnecting, other-problem and unenrolled presence entries are excluded.
Subscriptions mount only while open; missing live synchronization hides stale
rows and shows a reconnection state. No student rows navigate elsewhere.

Validation: 10 focused workspace/dialog/filter tests and 134 translation tests
passed; web TypeScript and changed-file ESLint pass. Browser verification using
the existing local teacher session confirmed the real reference answer modal,
the assigned class live empty state, unchanged exercise URL and editor/PDF,
Close, Escape, and focus restoration. No active student was connected during
the browser check; positive live-list filtering is covered by automated tests.
English and Korean resources were rebuilt for the running local web app.

Screenshots: `/tmp/cove-view-solution-modal.png` and
`/tmp/cove-observe-students-modal.png`. No migration is required.


## Elice screenshot alignment

The provided screenshots replace the centered online-only observation list with
a left-side Tutoring drawer. It lists assigned-course students, including offline
and unsubmitted students, with avatars, name/email/ID search, class and submission
filters, and per-problem submission badges. Online solving remains an optional
filter. Selecting a student replaces only the right editor pane without changing
the URL or unmounting the teacher's personal editor.

The selected pane shows student identity, saved draft, last graded submission
time and score. It opens read-only; existing server-confirmed HELPING mode governs
live shared edits on this exact problem. Offline or other-problem students show
a labeled read-only saved snapshot. Run is local; student submission is not
offered. Live output and feedback reuse existing monitoring permissions. Student
switches and workspace exits wait for pending shared edits.

Saved draft text is an explicit optional selected-student context read through
the existing teacher/class/student/material gate. Ordinary context and public
preview reads carry no draft text. No migration is required. The solution dialog
now shares the existing highlighted Python answer component and Copy feedback.

Browser verification in the existing local Teacher session confirmed 20 assigned
student seats, submitted/not-submitted badges, in-place student selection, saved
code and 100/100 history display, local Run output `hello`, return to the original
personal editor, highlighted answers, and the Copy button changing to Copied.
The exercise URL and PDF stayed unchanged. No student submission or shared code
edit was made. A simultaneously online student's shared-edit path was not exercised
in this browser walkthrough; the existing collaboration hook and server gate are
reused, with focused tests for synchronized read-only/helping and other-problem
isolation.

Screenshots: `/tmp/cove-tutoring-drawer.png`,
`/tmp/cove-tutoring-student-workspace.png`, and
`/tmp/cove-elice-solution-modal.png`.

Validation for screenshot alignment: full web suite 1,274 passed; focused
monitoring API suite 49 passed; shared monitoring schemas 69 passed; translations
134 passed. API and web TypeScript checks and changed web-file ESLint pass.


## Material switch UX refinement

Replaced the loose text tabs with a compact equal-width icon switch. PDF-only
metadata is absent from statement view. PDF title and page count form one small
row; the local-page explanation is an info tooltip with its own provider for
fullscreen pages. Both panels stay mounted to preserve scroll/state, while only
the active statement exposes collaboration geometry. Keyboard arrows/Home/End
move selection and focus. An unavailable PDF offers a direct statement action.

Four component tests, 134 translation tests, web TypeScript and changed-file
ESLint pass. Browser checks confirmed both views, keyboard switching and PDF
page 2 retained after visiting the statement. Screenshots:
`/tmp/cove-material-switch-pdf.png` and
`/tmp/cove-material-switch-statement.png`. No migration is required.


## Tutoring dropdown UI refinement

Replaced the native filter and class dropdowns with a reusable ChoiceSelector
using existing Studio dropdown/radio-menu primitives. The menu matches its
trigger width, highlights selection in Cove colors, adds a check and rotates
the chevron while open. Fullscreen portal support is optional and leaves all
existing menu call sites compatible.

Nine focused tutoring/filter tests, web TypeScript and changed-file ESLint pass.
Browser verification confirmed the custom menu, Submitted filtering to one
fixture student, keyboard opening/selection, and focus restoration. Existing
filter semantics are retained. Screenshot: `/tmp/cove-tutoring-choice-selector.png`.


## Read-only review and toolbar cleanup

Read-only question type and PDF reference controls now render clear summaries.
PDF filename and size are separate from its title; the fixture's size is shown
as 880 B rather than 0.00 MB. Authoring uses ChoiceSelector with disabled
Main-only documents preserved. View solution and Review details have icons.

Eight focused workspace/dialog tests, 134 translation tests, web TypeScript
and changed-file ESLint pass. Browser verification confirmed the review
summary, return to the personal workspace, and the new toolbar icons.
Screenshots: `/tmp/cove-review-pdf-summary.png` and
`/tmp/cove-problem-toolbar-icons.png`. No migration is required.
