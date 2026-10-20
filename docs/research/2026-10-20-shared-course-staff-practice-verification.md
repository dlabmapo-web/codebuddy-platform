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


## Consistent PDF toolbar

Standardized controls to 36px within 42px groups for pages, zoom, fit modes and
document actions. Added Cove blue states, active fit highlighting, equal-size
fit buttons with icons, contained percentage field, focus/hover styling and
disabled zoom-boundary controls. Groups wrap together in narrow panes.

Four reference-pane tests, 134 translation tests, web TypeScript and changed-file
ESLint pass. Browser verification confirmed equal group heights and active fit
mode styling in the running PDF workspace. Screenshot:
`/tmp/cove-pdf-toolbar-refined.png`. No migration is required.


## My page sidebar footer

Moved My page from scrolling navigation into SidebarFooter in academy and
platform rails. Students now receive the same bottom account link. The footer
does not shrink, includes safe-area padding, and remains separate from the
scrolling menu. Existing profile/active/collapsed/mobile behavior is reused.

Sidebar navigation and profile-row tests, web TypeScript and changed-file ESLint
pass. Browser verification confirmed the Teacher row at the bottom-left of the
viewport. Screenshot: `/tmp/cove-sidebar-mypage-footer.png`.


## Elice-inspired course builder material picker

Replaced the per-type inline add links with one New material action per lecture.
The reusable picker shows icon tiles, brief descriptions, selected state and
Next/Cancel controls. Choices preserve content/exercise permissions and optional
feature flags. Existing author dialogs and exercise routes perform creation.
Material rows now have consistent spacing, type icons, secondary labels and
readable file sizes. Picker copy is isolated in the material-picker namespace.

Validation: 58 focused web tests (including picker interaction, creation
permissions, course tree, drag/drop, move dialogs and library translations),
136 translation tests, web TypeScript, changed-file ESLint and diff checks pass.
Browser checks confirmed the PDF editor handoff, PDF + coding practice route,
written-response editor in an empty lecture, native arrow-key selection,
Escape/focus restoration and the two-column picker at 390px. No records were
created during browser verification. Desktop viewport restored afterwards.
Screenshots: /tmp/cove-course-builder-materials.png and
/tmp/cove-new-material-picker.png. No migration is required.


## Author dialogs, custom dropdowns and missing quiz material

Removed the duplicate activity heading and added consistent padding, a type
summary, compact initial editor heights, grouped settings and a persistent
footer. PDF authoring now has a styled browse/drop area, separate file details
and shared placement dropdown with descriptions. Activity type, turtle source
file, quiz selection mode and rich-editor font sizes reuse ChoiceSelector.
Font selection returns keyboard focus to the editor.

The missing quiz tile came from unset local flags. Enabling them exposed an
API bug: MULTIPLE_CHOICE_ENABLED was absent from environment validation and
the service expected only a string. Added the validated boolean and support
for boolean/string enabled values, with regressions for default/off/on cases.
Confirmed the existing multiple-choice migration is applied. Enabled ignored
local API/web flags and restarted the local API watch process; release defaults
remain unchanged. Browser quiz preview now returns Correct from the API.
No quiz or PDF records were saved during browser verification.

Validation: 28 focused web tests, 17 API configuration/quiz tests, 136 translation
tests, web/API TypeScript and changed-file scoped ESLint pass. The existing
editor directory is excluded by the repository ESLint configuration; its
translation tests and web typecheck pass. Browser checks covered the quiz tile,
quiz preview, answer-mode dropdown, PDF placement selection, font selection
with editor focus, and activity layout at 390px. Desktop viewport restored.
Screenshots: /tmp/cove-activity-author-dialog.png,
/tmp/cove-pdf-upload-dialog.png, /tmp/cove-pdf-placement-dropdown.png,
/tmp/cove-material-picker-with-quiz.png and /tmp/cove-quiz-preview-enabled.png.


## Simplified quiz creation after UX feedback

Quiz authoring now starts with question, compact options and correct-answer
selection. Removed the duplicate title/type/instructions/scoring sequence from
the main flow. The question provides a default material name; a custom name and
all advanced settings remain under collapsed More settings. Formatting/images
are optional per answer, with existing rich content preserved.

Validation: 12 focused web tests cover compact fields, answer-key cleanup on
removal, locks, plain/rich content preservation, escaping, and saving with an
automatic or custom title. Translation tests (136), web TypeScript and changed
file ESLint pass. Browser verification confirmed Save becomes enabled after
only question, two answers and a correct answer; API preview returned Correct.
Checked desktop and 390px layout, restored desktop and discarded the draft.
No records were created. Screenshot: /tmp/cove-simple-quiz-authoring.png.


## Compact New material button

Reduced the lecture action to 28px high with 12px medium-weight text, a smaller
blue plus icon and a neutral border/background. Cove blue appears on hover,
focus and open states. Existing picker tests (2), changed-file ESLint and diff
checks pass. Browser verification confirmed the compact alignment and opening
the material picker. Screenshot: /tmp/cove-compact-new-material-button.png.


## PDF titles open the reader for staff

Changed PDF title clicks from the metadata form to reading mode and added an
explicit Open PDF icon for every reviewer. Consolidated preview/edit state to
prevent stale mode after closing. Editors retain row-menu edit/replace actions
and an Edit PDF button in the reader; read-only reviewers see only the document.
The reader header shows the document title/filename and startup loading text.

Validation: 10 web PDF/row interaction tests, 6 PDF API authorization/lifecycle
tests, 33 role permission tests, web TypeScript, changed-file ESLint and diff
checks pass. Browser verified Manager title-click reading, both document pages,
and separate Edit PDF action without saving. Reviewer behavior is covered by
interaction and permission tests. Screenshot: /tmp/cove-pdf-open-for-staff.png.


## PDF-only instructions with a runnable editor

Inspected the requested Elice project lecture and one exercise in viewing and
editing modes without saving or running anything there. The inspected exercise
uses rich lesson instructions beside the Python editor; its authoring also has
a supplementary-material selector. This observation supports the side-by-side
flow, not a claim that Elice stores that particular example as a PDF.

Cove PDF practice now permits a title and linked PDF with no duplicate written
statement, reference solution or test cases. Optional notes/grading are collapsed.
The shared API contract was also corrected: its unconditional solution requirement
had rejected saves after client validation passed. Existing plain coding answer
requirements, invalid partial-answer checks and PDF reference authorization remain.
PDF practices without cases keep Run but disable Submit in staff/student editor
controls. API submission validation still rejects unconfigured grading.

Validation: 23 web draft/workspace/mode tests, 30 shared course-contract tests,
27 API course-service tests, 136 translation tests, web/API TypeScript, changed
web ESLint and diff checks pass. Live browser creation succeeded with title/PDF
only. Left the hidden local example PDF instructions practice, material ID
 e52cd452-fd09-4304-b19d-a8d787bbea57, in the existing E2E course. Its preview
showed the PDF next to the editor and running print code produced
PDF practice is running. No written statement, reference answer or tests were
stored. Screenshot: /tmp/cove-pdf-only-practice-running.png.


## Unified Courses workspace — 2026-10-20

- Read-only Elice inspection: course lecture list, CH06 lecture material list, and
  while practice workspace. Confirmed management alongside materials and explicit
  Edit after opening the solving workspace. No Elice content was changed.
- Local manager: Courses list includes New course and library adoption; course
  includes New material, hierarchy controls and visibility. No duplicate Content
  management navigation entry.
- Opened PDF practice exercise from its title: PDF + code editor, Run/Submit,
  View solution, Tutoring and explicit Edit. Edit opened the existing authoring
  route; Back to course returned to /learn/courses/[courseId]. No content saved.
- Opened standalone PDF title from that same course: reader loaded page 1, with
  a separate Edit PDF action.
- Legacy /content/courses/[courseId] redirects to the canonical course workspace.
- Validation: 27 web navigation/material route tests; 136 translation tests; web
  TypeScript and scoped ESLint. Console/library route contracts remain covered.
- Visual evidence: /tmp/cove-unified-course.png.
