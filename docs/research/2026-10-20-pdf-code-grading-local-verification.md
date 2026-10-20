# PDF + code grading: local verification

Date: 2026-10-20
Branch: `feat/shared-course-staff-practice`
Spec: [PDF + code grading](../superpowers/specs/2026-10-20-pdf-code-grading-design.md)

## Implemented behavior

- A visible Grading choice separates Practice only from Automatic grading.
  New PDF practice defaults to Practice only; ordinary programming defaults to
  Automatic. Selecting a PDF still supplies an empty new title automatically.
- Practice only supports Run without Submit/Test run or an invented score.
  Its retained test cases are withheld from learning payloads and execution;
  direct student/staff submission and server sample-check requests are refused.
- Automatic PDF setup starts with a hidden 100-point case, a 100-point maximum
  and the existing enhanced STDIO engine using absolute-cap scoring. Comparison
  and points are visible; advanced grading/case settings are collapsed. A points
  total above the maximum shows an explicit cap warning.
- Blank input is valid. Incomplete automatic matching cases block Create/Save.
  Hidden-only grading supports Submit without Test run. Reference solutions and
  hints stay optional for PDF practice and do not generate grades themselves.
- Policy changes preserve cases, past submissions and current solved aggregates.
  Only aggregates matching the previous revision advance to the new revision;
  stale results are not revived. Changed grading definitions retain the existing
  explicit revision/reset behavior.
- Practice stays in the course navigator but does not increase graded progress
  totals. Staff attempts remain separate from student attempts.
- Teachers can inspect the workspace/grading with read-only controls. New hidden
  drafts open in authorized staff preview rather than going to a missing page.
- Policy persists through course trees, versions/copies and library adoption.
  Workbook exports include optional submission_policy/reference_pdf_material_id
  columns; old updates preserve policy. Existing PDF-only materials round-trip
  without inventing statements/solutions/tests. PDF uploads and changed PDF links
  remain in the course editor; the workbook cannot create or relink PDF assets.

## Database and server

Applied `20261020090000_submission_policy` to the verified development Supabase
project. It adds policy to programming exercises and immutable submission records;
existing PDF-linked exercises without tests become Practice only. Other exercises
and historical submissions default to Automatic. The migration does not modify
existing scores or comparator definitions. No production migration was run.

The local API, web server and judge were used with the existing authorization,
CAPTCHA, runtime and storage settings. Browser test authentication used ordinary
password sign-in for seeded development identities and the normal student-session
begin endpoint. Session files were stored outside the repository with mode 0600;
no authentication protection was disabled.

## End-to-end results

`e2e/specs/pdf-grading-policy.spec.ts`: six passing tests, three journeys in both
Chromium and WebKit:

1. Run ungraded Python; reject forged student/staff Submit requests; verify zero
   graded-progress denominator. Enable grading, verify hidden answers are absent
   from bootstrap, reject incorrect output with 0/100, and accept contains-text
   output with 100/100. Disable/re-enable grading and retain tests and solved
   progress. Capture desktop and mobile views.
2. Create PDF practice without a duplicate statement/answer/tests. Validate that
   incomplete automatic cases block creation, start at 100 points, explain the
   cap with two cases, and retain cases/points through mode switches and saving.
   Open the newly hidden material in staff preview and inspect its editor.
3. Teacher opens the same course exercise and Review details. Practice/automatic
   selections are read-only and Save is absent.

The fixture has its own course/material IDs (`ee090000-…`), PDF asset/storage
object and class assignment. It uploads the small repository PDF fixture when
needed and never resets or deletes another course or its uploaded PDFs.

## Other checks

- 182 focused API tests: authoring, imports/library, learning, student/staff
  submissions and grading semantics. Additional policy-revision regression
  verifies that policy-only changes preserve scores and stored semantic versions.
- 96 focused shared-contract, learning and workbook tests, including PDF-only
  workbook round-trip and explicit automatic-policy validation.
- 38 focused web tests: draft defaults/validation, policy toggles, reference pane,
  staff workspace, visible and hidden material links.
- 136 translation tests, including matching English/Korean keys and payload limits.
- API build; web/API/E2E TypeScript; scoped web ESLint; diff whitespace check.

## Repeat locally

Prerequisites: development database migrations, seeded development users/class,
API on port 4000, web on port 3000 and the judge worker running. The E2E fixture
script refuses any Supabase project other than the configured development project.

If the already-running local web server uses a real CAPTCHA key, prepare isolated
sessions for the seeded test accounts without changing the server's settings:

```bash
node packages/web/scripts/prepare-pdf-grading-e2e-auth.mjs
E2E_BASE_URL=http://localhost:3000 \
E2E_AUTH_STATE_DIR=/tmp/cove-pdf-grading-auth \
E2E_SKIP_SEED=1 E2E_PDF_GRADING=1 \
pnpm e2e e2e/specs/pdf-grading-policy.spec.ts \
  --project=chromium --project=webkit-pdf-grading
```

With servers started by Playwright using its test CAPTCHA configuration, omit
E2E_BASE_URL/E2E_AUTH_STATE_DIR and use the normal seed/global-setup flow instead.

Screenshots are written under `test-results/pdf-grading-policy-*/`:
`practice-only.png`, `automatic-result.png`, `grading-mobile.png`, and
`new-automatic-grading.png`.

## Manual check

Open Courses → E2E PDF Grading Policy → PDF grading exercise → Edit. Inspect
Grading, switch modes, and confirm saved tests remain. Open the exercise to see
its PDF/code editor and grading status. Use New material → PDF + coding practice
for the minimal creation flow. Teacher accounts should see Review details in
place of Edit and cannot save grading changes.

## Follow-up in the user's Chrome session

Checked on 2026-10-20 with normal browser sign-ins for the seeded Manager,
Team Lead, Teacher and Student accounts. Cloudflare checks completed normally;
authentication settings were not changed.

| Scenario | Observed result |
| --- | --- |
| Manager Practice only | PDF loads; Run prints output; Submit and Test run are absent. |
| PDF/statement navigation | Page 2 survives tab switching; an empty statement explains where to find instructions and links back to the PDF. |
| Team Lead creation | PDF title defaults; no duplicate statement/solution is required; a hidden practice material saves and opens in staff preview. |
| Automatic setup | A missing expected output blocks creation; adding a second 100-point case shows the cap warning; switching modes and saving preserves both cases. |
| Staff grading | Team Lead and Manager correct practice submissions receive 100/100. Student grades remain separate. |
| Student Practice only | Run prints the edited code's output; authoring, solution and Submit controls are absent. |
| Student Automatic | Incorrect output receives 0/100; `print("hello")` receives 100/100. Hidden case inputs/answers are absent from the result UI. Course progress becomes 1 of 1 solved. |
| Teacher review | Review details exposes disabled grading controls, with no Save button. |
| Teacher tutoring | Assigned E2E Cohort roster, search and custom filters work. Offline students disappear from the online filter. Selecting the student shows the saved draft read-only in the current exercise; returning restores personal practice. |

The browser pass found and corrected three integration issues:

- Lecture progress and the student dashboard counted ungraded materials in their
  solve totals. Lecture calculation now excludes Practice only, and the dashboard
  uses the catalog's canonical progress projection. Chrome verifies a mixed
  lesson with three programming materials reports 1 of 1 solved while retaining
  both ungraded materials in the list.
- The curriculum audit incorrectly flagged PDF instructions as missing written
  statements and ungraded materials as missing graders. Those checks now respect
  PDF linkage and submission policy.
- A failed PDF response reached the entire page's error boundary. The PDF reader
  now uses React-PDF's callback-based loading mode, so its existing renewal and
  inline error UI retain the surrounding code workspace. A regression test checks
  failed-URL renewal and draft preservation. Subsequent browser navigations loaded
  PDFs successfully.

Follow-up validation: 30 API tests and 15 web tests pass, API/web TypeScript pass,
and scoped web ESLint passes. The existing six cross-browser E2E results above
are from the initial implementation run. The follow-up used the user's Chrome
session rather than claiming a new full cross-browser run.

One Teacher sign-in initially showed Account unavailable and recovered on refresh;
subsequent role sign-ins completed. Concurrent live editing between two active
accounts was not exercised in this sequential browser pass; offline observation
and online filtering were checked.

The browser was returned to the Manager account on the original exercise, with
Automatic grading restored. The newly created test material,
`Browser verification · PDF practice` (`0d6ad14a-e3cb-4e39-b8ce-2d1ccbdaba5a`),
remains hidden in the dedicated test course. No production changes were made.

Local screenshots:

- `/tmp/cove-student-practice-check.png`
- `/tmp/cove-student-automatic-check.png`
- `/tmp/cove-student-progress-check.png`
- `/tmp/cove-teacher-tutoring-check.png`
- `/tmp/cove-manager-grading-verified.png`
