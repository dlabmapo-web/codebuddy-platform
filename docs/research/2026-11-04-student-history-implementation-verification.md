# Student history and private tutoring verification

Date: 2026-11-04. Implementation follows the approved [design](../superpowers/specs/2026-11-04-monitoring-student-history-and-tutoring-design.md).

## Delivered behavior

- Teaching navigation → Student history → authorized class chooser. Existing class progress links open the new persistent student rail and lecture-grouped history; By problem remains available.
- Analytics and course tutoring link directly to the student's class history. Analytics asks for the class when several are authorized.
- Monitoring Tutoring opens a compact list for the displayed material, with Submitted/Not submitted and scores. Choosing a student loads their latest saved work directly in the exercise statement/editor area. The expanded history dialog has been removed.
- The top student selector can open offline/other-material students' saved work for the displayed problem. Each student row also has a separate History link to the full-page dashboard with that student selected; the toolbar History action uses the same dashboard. Online students on the displayed exercise retain live switching.
- With no active or selected material, monitoring loads an authorized course outline and offers material selection instead of waiting indefinitely for material data. Course and history filters reuse the Studio ChoiceSelector, with no native select controls.
- Programming and Turtle submissions open immutable saved source as editable, memory-only private testing copies. Run, Stop, Reset and terminal/drawing input use private execution. Quiz and written responses remain read-only. Reading materials open staff previews.
- History reads enforce current academy/class/member/material/submission scope. List responses contain result metadata, not source. Manual attempt pagination supports more than 30 attempts. Latest manual IDs are selected in PostgreSQL before loading result metadata.
- Pointer publication and rendering pause under private history; observation, live drafts and recovery remain mounted. Returning resumes the live workspace.

## Automated evidence

| Check | Result |
| --- | --- |
| API history, execution ownership, class access and existing progress/analytics tests | 55 passed in 6 files |
| Web monitoring and history regression tests | 237 passed in 30 files |
| Translation structure/format tests | 140 passed in 4 files |
| API and web TypeScript | Passed |
| Affected web ESLint, canonical-route lint, whitespace check | Passed |
| Current inline tutoring: Chromium instructor smoke | Passed; offline submission, private run, return to live, full-page student link |
| Current inline tutoring: Chromium/WebKit × Manager/Team Lead/Teacher | 6 passed (10.0 minutes); includes 125-second idle and all-material transitions in both engines |
| Final inline navigation safeguard, Chromium and WebKit | 2 passed (4.3 minutes); cancel Return to live retains private edits, then resumes live synchronization; Escape closes the drawer |
| Earlier expanded-dialog presentation | 6 main + 6 expanded + 2 navigation checks passed before the user-directed revision; these do not qualify the new inline presentation |
| Repository theme lint | Fails on 9 existing violations in unchanged GUI/manual/observed-material/video files; none in the new history components |

The browser fixture contains two programming submissions that differ from the live draft, 35 written attempts, a saved Turtle submission, and an offline second student with a distinct programming submission. The tests edit/run/reset the older programming attempt, inspect the oldest written response on the next page, execute modified Turtle code with drawing/output, and verify the programming submission count stays unchanged. Paired student/monitor pages verify returning from inline tutoring preserves live draft synchronization and pointer sharing. The current flow also starts monitoring with no active material, selects a problem from the loaded outline, opens the offline student from both Tutoring and the top selector, privately edits/runs that student's submission, then opens their full dashboard from the per-row History action. It asserts the monitoring URL/problem is retained during tutoring, no dialog is mounted, and the full dashboard uses custom selectors.

The expanded Manager flow in each engine also changes the student's material through PDF, written response, quiz, video, Turtle and coding while the Tutoring drawer is open, returns without refreshing, waits 125 seconds with the offline student's private code covering the workspace, then verifies code synchronization and the teacher pointer again. It checks material filtering without changing full-scope totals, retained selected identity when roster search has no match, and a 390px student-list/detail round trip. Browser negative checks reject student access, a submission/material mismatch and an unassigned Teacher class.

The test script uses disposable PostgreSQL/Redis containers, its own API build directory, local SSO fixtures, and private GUI runtime. It does not use production data or restart the user's development servers. Failed development runs caught and corrected an overly narrow coding-only material filter, compressed scrolling sections and an invisible Run label. During the inline revision, browser testing caught a lazy-loading suspense/ref loop when first opening Tutoring; client-only loading boundaries now keep the live outlet mounted. The pointer test now requires a real coding document round trip before checking markers, rather than treating the independent material-watch Live badge as proof of coding readiness. Two new component tests cover stale student responses and isolated unsubmitted draft execution. Final focused browser checks cover a learner moving to PDF while the monitor has changed private code: cancelling Return to live retains the selected exercise URL and scratch code, then returning to coding/monitoring recovers without a refresh. Escape closes the tutoring drawer. Visual checks cover the loaded roster, inline statement/editor and full-page selected-student dashboard. The final follow-up ran more slowly under local memory pressure; compiler and browser verification were serialized.

## Native browser limitation

Actual Chrome/Safari verification was attempted through computer use. Chrome returned `Debugger unattached`; Safari returned `Sky Computer Use native pipe closed before response`. Therefore native Chrome/Safari paired-flow coverage is **not verified**. Playwright WebKit results are not reported as native Safari verification. A temporary Safari verification tab could not be cleaned up after the native pipe closed.

## Remaining qualification boundaries

The durable data does not contain historical Run counts or PDF reading completion, so those are not invented. Unsupported historical programming runtimes remain readable; unavailable Turtle runtimes/assets return an execution error while retaining saved files. Existing current statements are explicitly labelled current material instructions.

No merge, push or deployment was performed.

## Reproduce

```sh
COVE_HISTORY_E2E=1 bash packages/api/scripts/test-all-material-monitoring.sh
pnpm --filter @cove/web exec vitest run src/lib/monitoring src/components/monitoring src/components/student-history
pnpm --filter @cove/api exec vitest run src/teach/student-work-history.service.spec.ts src/manual/review-execution.service.spec.ts src/teach/teacher-progress-access.service.spec.ts
```

Current revision screenshots/traces are under `test-results/inline-tutoring/` and the final `test-results/inline-tutoring-navigation/` (ignored local artifacts), including `inline-tutoring-roster.png`, `inline-student-submission.png` and `selected-student-dashboard.png`. Earlier presentation artifacts remain under `test-results/student-history/` and `test-results/student-history-navigation/`.


## Monitoring problem editor shortcut

Added **Edit problem** beside the monitoring actions for a displayed coding problem. It opens the existing statement/test-case editor through the canonical course/lecture/material path. The route guard supplies the same effective `exercises.manage` decision used by that editor: Managers and Team Leads can edit; Teachers retain read-only review. The link targets the displayed problem even when the learner is elsewhere, honors pending-live/private-copy navigation guards, and participates in the existing unsaved-feedback exit guard. No authoring permission, backend contract, grading configuration or realtime protocol was changed.

- New shortcut browser matrix: **6 passed** in Chromium/WebKit (1.7 minutes), covering Manager/Team Lead editor navigation and editable title/test-case controls, plus Teacher shortcut absence and disabled editor controls.
- Scoped web regressions and content-path checks: **239 passed in 31 files**. Separate async navigation-guard component test: **1 passed**, verifying no navigation before edits settle and no exit on cancellation.
- Translation tests: **140 passed in 4 files**. Affected-file ESLint, whitespace checks and final web TypeScript passed.
- Browser artifacts: `test-results/monitoring-problem-edit/`. Initial development attempts exposed a 28-second cold compilation exceeding a 25-second URL assertion and a missing optimistic class-version field in the Teacher test fixture; the test wait/setup were corrected.

Reproduce the shortcut matrix with:

```sh
COVE_HISTORY_E2E=1 bash packages/api/scripts/test-all-material-monitoring.sh --grep 'problem editor directly' --output test-results/monitoring-problem-edit
```


## Mixed coding fixture grading

On 2026-11-04, the user requested actual grading cases for the development mixed-material exercises. Added one public sample to both **Mixed coding start** and **Mixed coding finish**: empty input, expected stdout `hello`. The seed now creates the same case. Existing development records were updated in a focused transaction, advancing each grading revision from 1 to 2. The full mixed-material seed was not rerun.

Both exercises satisfy the learner's `READY` grading predicate. Running `print("hello")` through Python and the existing output-grading decision passes; `print("wrong")` produces `WRONG_OUTPUT`. Draft counts remained 14 before/after and submission counts remained 0 before/after. Reload an already-open exercise to fetch the new grading configuration.

## Direct, full-screen submitted-work review

The 2026-11-04 UI revision replaces the dashboard's attempt-list-first flow. Clicking a problem title or **Open work** opens the latest submission directly at the unframed `/teach/classes/[classId]/students/[membershipId]/work/[materialId]` route. The same private submission component supplies Tutoring review. The student identity, saved time/score and current problem remain explicit; older attempts use the existing Studio selector with pagination beside it. The ordinary course navigator, grading notice, full problem statement/examples, reference PDF pane and editor font controls are reused. Older dashboard attempt bookmarks redirect to the new route with the selected attempt preserved.

The server authorizes the exact class/student/material and requested historical attempt before rendering identity. The return URL is restricted to the same class's progress route. Current draft code fetched with reference metadata is ignored by the private editor. Historical source, saved results, student drafts and scores retain their existing separation. Tutoring keeps its underlying watch mounted and avoids duplicating the problem title row already shown in monitoring.

Focused component/state tests: **5 passed in 3 files**, including a regression that supplies different current-draft and historical code and verifies only the historical source populates private editing/execution. Translation tests: **140 passed in 4 files**. Web TypeScript, affected-file ESLint and whitespace checks passed.

The first browser run passed the full Manager Chromium scenario, including private Python/Turtle execution, material changes, a 125-second idle period, return to live code synchronization and bidirectional pointers. Its next role stopped at pagination because the development Query Devtools launcher intercepted a bottom-right control. Pagination was moved beside the attempt selector; screenshot review also corrected a translation-provider mismatch in the difficulty label. Those initial artifacts are under `test-results/student-history-normal-workspace/` and do not represent the final UI qualification.

Final UI qualification: **6 unique role/browser scenarios passed** — Manager, Team Lead and Teacher in Chromium and WebKit. Four passed in `test-results/student-history-normal-workspace-qualified/`; the two remaining WebKit cases passed in `test-results/student-history-normal-workspace-webkit-qualified/` (4.5 minutes). The rerun added a dashboard-ready wait before testing an old bookmark and a 90-second allowance for a cold development-route compilation; review assertions were retained. The UI-focused mode skips the extended Manager all-material/125-second idle loop, which passed separately in the initial run above.

Verified direct latest-submission navigation, a full-viewport workspace with statement left/editor right, full examples and format sections, explicit student identity, older attempt selection, 35 written-answer submissions across pages, old-bookmark recovery, private Python/Turtle Run/Stop/Reset, cancelled app/browser Back preserving private code, and return to the dashboard. Tutoring loads the selected offline student's submitted code through the same statement/editor component; private code and output never replace the learner's draft. Returning to monitoring restores live code synchronization and bidirectional pointers. Authorization checks and unchanged submission counts remain covered.

The browser-Back regression initially exposed a real guard timing issue: popping directly to another Next route could unmount the review before its guard ran. The full-screen review now creates a same-URL history checkpoint so the guard runs while the private copy remains mounted. Cancellation restores that checkpoint; accepted Back continues to the previous route. Both engines passed cancellation checks. Screenshots of the final full-screen and inline layouts were visually inspected. WebKit coverage is not a claim of native Safari automation.

Reproduce the UI-focused role matrix with:

```sh
COVE_HISTORY_LAYOUT_ONLY=1 COVE_HISTORY_E2E=1 bash packages/api/scripts/test-all-material-monitoring.sh --grep 'reviews saved history' --output test-results/student-history-normal-workspace
```

The runs used isolated databases, Redis, GUI runtime and browser-test ports. Development data and the user's development servers were not restarted or reseeded. A development-only aborted RSC stream and a cancelled PDF-load warning were observed during rapid navigation; neither prevented the final browser assertions from passing.

Final web TypeScript, canonical-route lint and whitespace checks passed after browser qualification. Isolated test ports were released; the existing development listeners on ports 3000 and 4000 retained their original process IDs.

## Consistent submitted/draft workspaces and history styling (2026-11-04)

The follow-up screenshots exposed two paths not covered by the earlier submitted-work qualification: an unsubmitted programming draft had a separate minimal editor, and an unsubmitted Turtle draft used the observation-only viewer. Both now use `ReviewCopy` through `DraftWorkspace`, with no fabricated submission ID, timestamp or score. The common presentation includes the normal course outline, full problem statement/examples, two-row header with selected student identity, dark editor/output controls, font adjustment and private Reset. Public sample buttons run only the private code with the sample input. The historical source remains separate from current reference metadata.

Turtle review uses the existing manual workspace grid and resize/layout controls. Its file bar stays dark, its instructions, drawing and terminal fill the viewport, and a disconnected/offline student does not disable private execution. Draft sessions use a server-authorized current profile; submitted sessions still use the saved profile. Session owners include reviewer, class, source target and private review instance. Status/input/stop reauthorize class access, and no review route writes student code, submissions or scores. The saved inclusion-in-score flag is returned with manual history so the grading notice is accurate.

The class chooser now uses responsive class cards, colored class icons, search and a visible result count. The dashboard uses separate colored metric cards, a completion progress bar, compact activity dates, differentiated roster avatars, semantic material icons and status pills. Existing Studio selectors and the metric definitions are retained.

### Reference research and visual inspection

Before implementation, used the existing signed-in Chrome tab to inspect:

- [Elice course and lecture list](https://dlab.elice.io/courses/765886/lectures/all).
- [Student Dashboard](https://dlab.elice.io/courses/765886/dashboard/section/3872517/course-all/user/18445245), including member navigation, completion metrics and grouped material rows.
- [Programming tutoring review](https://dlab.elice.io/courses/765886/lectures/6637912/lecturepages/54487968/admin/users/18445245), including roster submission states and the student identity above the unchanged statement/editor layout.
- [Submitted Turtle tutoring review](https://dlab.elice.io/courses/765886/lectures/6637927/lecturepages/54488204/admin/users/18196061), including file tabs and execution/drawing/terminal layout. Also inspected the no-room state for another student.

No Elice source edit, execution, submission or regrade action was performed. Visually inspected local Chrome pages on port 3000: class chooser, selected-student dashboard, zero-submission programming starter code, and zero-submission Turtle starter code. The screenshots show the full course navigator and named student in both workspaces, instead of the stripped-down views reported by the user.

### Focused checks

Seven web component/state tests pass, covering immutable submitted source, private programming and Turtle drafts, full workspace composition, late student response isolation and URL state. Seventeen API service tests pass, including bounded real-UUID runtime owners, current-profile authorization for draft execution, access revocation, session ownership, saved runtime pinning and separate private draft owners. The localization suite has 140 passing tests; canonical routes and affected-component ESLint passed.

Browser qualification results and artifact paths follow below.

### Final browser qualification

The submitted-work Manager scenario passed in Chromium and WebKit during this revision, including older-attempt selection, private Python/Turtle execution, inline Tutoring, and return to live code/pointer sharing. Artifacts are under `test-results/student-history-consistent-workspaces/`. That development run also exposed an incorrect draft-test fixture title; the draft assertion was corrected to the actual fixture title before qualification.

The new unsubmitted-draft scenario passed in both engines after the final layout polish: **2 passed (3.7 minutes)** in `test-results/student-history-drafts-polished/`. It verifies the normal course navigator, full coding statement/examples, selected student identity, public-sample execution, private coding edit/Run/Reset, and private Turtle edit/Run/drawing/terminal/Stop/Reset. API checks confirm the saved draft code and zero submission count remain unchanged. Both a saved coding draft and a saved Turtle draft are covered; starter-only paths were also visually inspected in local Chrome.

The first draft execution run caught a real runtime owner-key length limit with UUID identifiers. Draft ownership now hashes the complete authorized academy/class/student/material/review scope, retaining isolation within the runtime's 200-character limit. A service regression test covers real UUID lengths and separate material scopes.

Final screenshots were visually inspected: `coding-draft.png`, `student-dashboard.png`, and `turtle-draft.png` in each browser's output folder. Turtle has a single drawing toolbar with fit/layout/expand controls, a full drawing canvas and terminal, and instructions/editor proportions matching the ordinary Turtle workspace. Its history view no longer waits for a student's live connection to enable private Run.

Final web TypeScript, affected-component ESLint, canonical-route lint and whitespace checks passed. The final web component rerun passed **7 tests**; the API production compilation also passed as part of the isolated browser harness. Together with **17 API service tests** and **140 localization tests**, these checks cover the changed presentation and private-execution behavior. This follow-up's browser cases exercised Manager access; the earlier three-role qualification above is separate evidence, not a newly rerun role matrix.

```sh
COVE_HISTORY_LAYOUT_ONLY=1 COVE_HISTORY_E2E=1 bash packages/api/scripts/test-all-material-monitoring.sh --grep 'unsubmitted draft workspaces' --max-failures=0 --output test-results/student-history-drafts-polished
```

The harness used disposable databases, Redis and GUI runtime; it did not reseed development data or manually restart the user's development servers. Actual Chrome was used for reference/local visual inspection. Automated WebKit coverage is not native Safari coverage. No merge, push or deployment was performed.

## Empty work, enrollment profile and course dashboard (2026-11-04)

The user clarified that actual saved drafts remain visible. When no draft or submission exists, programming and Turtle history now retain the statement/course navigation and show a named empty-work panel, without starter code, editor or execution actions. Inline Tutoring uses a compact student toolbar and does not repeat the problem title/header beneath the monitoring header.

The selected-student dashboard now separates the profile and enrollment period, Course Completion, Course Progress and the material table. Enrollment uses the actual class-enrollment record; the current model has no expiry, and missing records are shown as unrecorded. Completion uses required assessed exercises and does not mark an empty curriculum complete. The assessed score sums the existing scored current results and their actual maxima. Course Progress shows 14 academy-local dates of recorded learning minutes, course completion bars, average evaluated score, recorded time and submission totals. These queries retain exact academy/class/student/assigned-course authorization; there are no new learner-data writes. Elice's proprietary EPS and class-average values are not fabricated.

Local Chrome inspection confirmed the updated Cove Student profile, actual enrollment date, completion totals, daily learning-time values and course rows. Automated component/API checks passed **29 tests** (11 web and 18 API), including empty programming/Turtle work, preserved drafts, missing enrollment, zero eligible work, enrollment distinct from activity, and grouped course-scoped daily learning. Localization has **140 passing tests**. Web TypeScript, affected-component ESLint, canonical routes and whitespace checks passed. API production compilation passed through the browser harness.

Final browser qualification passed **6 unique Manager/browser scenarios** across Chromium and WebKit: submitted history/private execution/return to monitoring; saved programming/Turtle draft workspaces; and empty programming/Turtle work plus compact inline Tutoring. Five passed in `test-results/history-profile-qualified/`; the final WebKit empty-work case passed in `test-results/history-profile-empty-webkit-qualified/` (1.4 minutes). The corrected test waits for the selected Turtle URL and heading before leaving that route, rather than accidentally asserting against the prior exercise's identical empty panel. Earlier development failures also caught a cold-navigation timeout and an iframe-unaware statement assertion; these waits/selectors were corrected without removing review assertions.

Visually inspected the named empty panel, compact inline header, profile/enrollment/completion layout and daily-time/course-progress chart. A final chart-label polish preserves fractional-minute ticks instead of rounding adjacent ticks to the same integer. The final 11 web tests and affected-component lint passed after that change. Final screenshots include `student-dashboard.png`, `course-progress.png`, `empty-coding-work.png`, `empty-turtle-work.png` and `inline-empty-work.png` under the qualification folders.

```sh
COVE_HISTORY_LAYOUT_ONLY=1 COVE_HISTORY_E2E=1 bash packages/api/scripts/test-all-material-monitoring.sh --grep 'unsubmitted draft workspaces|no-work tutoring|lab_head reviews' --max-failures=0 --output test-results/history-profile-qualified
COVE_HISTORY_LAYOUT_ONLY=1 COVE_HISTORY_E2E=1 bash packages/api/scripts/test-all-material-monitoring.sh --grep 'no-work tutoring' --project webkit --output test-results/history-profile-empty-webkit-qualified
```

The runs used disposable data and isolated test ports. No development data was reseeded, and no user development server was manually restarted. Actual local Chrome was used for visual inspection; automated WebKit qualification is not native Safari automation. Nothing was merged or deployed.
