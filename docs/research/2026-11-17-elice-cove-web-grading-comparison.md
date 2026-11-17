# Elice and Cove Web course submission and grading comparison

Date: 2026-11-17. Branch: `feat/web-courses`.

Follow-up: the user requested implementation of the audited differences. The code changes, content replacement, tests and screenshots are recorded in the [grading parity verification](assets/2026-11-17-web-grading-parity-localhost/README.md). The findings below describe the pre-fix baseline.

The tested submission and review paths work. This is **not full Elice parity**: the imported HTML short answer has a different grading mode, some status labels contradict the effective result, and the live Elice account only provides a Manager identity. This audit did not submit all 348 source materials.

## Baseline and scope

Before testing, the remaining branch changes were committed locally:

- `fcbfab19` — preserve submitted answers and match regex answers from the start. Four evaluator unit tests and API, web and e2e typechecks passed. No database read paths changed.
- `e0c046ee` — include the existing Elice research screenshots.

No push was performed. Existing implementation commits preceded these two commits.

Live source pages inspected:

- [DM-WB-1](https://dlab.elice.io/courses/793620): the first multiple-choice question, HTML short answer, its authoring settings and own tutoring record.
- [DM-WB-2](https://dlab.elice.io/courses/793621/lectures/6805471/lecturepages/55856343): the font-awesome project mission with instructions and reference code in two panes.
- [DM-WB-3](https://dlab.elice.io/courses/793623/lectures/6805482/lecturepages/55856462): a JavaScript loops mission with expected-output GIF.

The earlier inventory in [the source audit](2026-11-16-elice-web-courses-parity-audit.md) covers the three course outlines: 348 materials in 29 lectures. Those are inventory counts, not this run's submission coverage.

Cove target: course `02ccc50a-2a5b-4cfb-96a2-f72132033e0c`, title `Web`, content revision 8 when testing began. It contains 52 materials: 51 imported originals across the first weeks of the three courses and one companion instruction page. Current definitions were read again; the import was not rerun and user edits were preserved.

A separate development class, **Web grading audit 2026-11-17** (`58a853cb-5a6b-4065-b0ae-219485c26334`), was created for the fixed `cove-teacher` and `cove-student` development identities. The user's existing `Web class` was not changed. Reading views are stored per user/material across classes, so the audit class initially inherited some previously viewed materials; its initial progress is not a clean zero baseline.

## Live Elice results

The signed-in course permission was **Manager**. These were real submissions by that account, not an unauthenticated preview or another student's work.

| Action | Observed result |
| --- | --- |
| MC question 55856205: select wrong option 1 and submit | “Please try solving it again.” |
| Retry with option 4, `div: block / span: inline` | “Correct.” Selection and verdict survived reload. |
| HTML question 55856208: submit `HTML` | “Please try solving it again.” |
| Retry with `hypertext markup language` | “Correct.” |
| Open own HTML tutoring record under Team Lead/Manager filter | 2 submissions; final score 100/100; submitted and expected answers displayed. |
| Inspect HTML author settings | “Grade manually without specifying answers” unchecked; Advanced Mode selected; regex `hypertext markup language`. No author Save was used. |
| Test source regex preview with `hypertext markup language extra` | Correct after the asynchronous preview settled. |
| Test source regex preview with `extra hypertext markup language` | Incorrect. |
| Inspect representative WB-2/WB-3 missions | Instructions/reference/output examples; no Submit or code-grading controls on these pages. |

The tutoring Student filter showed zero users for the source HTML question. Actual Elice Teacher, Team Lead and Student sign-ins, manual grade overrides, and their permission boundaries were not tested. Manager own-attempt evidence must not be presented as four-role Elice coverage.

The regex preview observations establish from-start prefix matching for this pattern. They do not establish equivalence between JavaScript's regex engine in Cove and every expression accepted by Elice.

## Cove API verification

**54 checks passed** in two final localhost API runs: 30 submission/review checks and 24 matching/privacy/report checks. This is a new live development audit, separate from the earlier 127-check isolated Web-course run. Initial audit harness errors were corrected before the final counts: a course field name, null-safe short-answer lookup, and the expected custom access-denied error code.

| Role | Submitted work | Grading/report verification |
| --- | --- | --- |
| Manager | Correct MC; manual and regex short-answer private practice | Can review the audit student's answer and read class reports. |
| Team Lead | Correct MC; manual and regex short-answer private practice | Can review the audit student's answer and read class reports. |
| Assigned Teacher | Correct MC; manual and regex short-answer private practice | Can review the audit student's answer and read class reports. Cannot use the author-only matching preview. |
| Student | Wrong then correct MC; correct attempts on both remaining MC questions; HTML manual answer; CSS regex answer | Cannot use staff practice, author matching preview, class review lists or teacher progress reports; cannot review own work. |

Persisted checks confirmed:

- Wrong MC: zero score and incomplete; correct MC: complete. All three MC questions appear correct in the final teacher summary.
- HTML: automatic assessment status `MANUAL` before human review. Teacher, Team Lead and Manager successively published versioned 100/100 completed reviews. Student reads returned the published feedback and latest review version.
- CSS: `GRADED`, `CORRECT`, 100/100, complete for `cascading style sheets` under its current regex definition.
- Repeating the same submission request key returns the same submission ID.
- Stale review version returns HTTP 409; student review attempt returns HTTP 403.
- Private staff attempts have their own user's history and `includeInScore: false`; student class reports remain separate. Student-facing MC keys and short-answer patterns/expected answers are redacted.
- Cove regex preview accepts the exact phrase and trailing text, rejects leading text and a case change for the tested pattern.
- Teacher report contains all 52 materials, including both short answers. The final API snapshot shows 18/52 complete and 3/3 MC correct. Some reading completion predates this audit.
- The dedicated short-answer class review endpoint works for all three staff roles and is denied to the student.

The reading-only `readingMaterialStudents` endpoint intentionally rejects quizzes, short answers and video. Their rows link to dedicated manual/video reports. A failed direct call to the reading-only endpoint was an audit routing mistake, **not a product defect**.

## Cove browser walkthrough

All four development identities were observed through the normal localhost UI. Manager was already signed in; Team Lead, Teacher and Student were signed in normally afterward. No account permissions were changed to impersonate a role.

- Manager and Team Lead each submitted a correct MC self-test in the browser and received 100/100 under Staff practice.
- Teacher opened the audit class's Web progress report, switched to Curriculum, followed the HTML question's dedicated report, and published feedback. Review history advanced from version 3 to version 4. The final API read confirmed that this browser-published review is stored, complete and scored 100/100.
- Student opened the same class and saw all five questions marked Completed. A new MC browser submission returned Correct and 100/100. Reload retained the result, but all option radios were unselected.
- Student then opened HTML and saw the saved `hypertext markup language` answer, 100/100 · Completed, and the exact teacher feedback published in the browser.

## Differences and issues

1. **Imported HTML grading configuration differs from Elice.** Cove's HTML question remains `MANUAL` at revision 1, whereas Elice uses an automatic regex with manual grading unchecked. A correct phrase requires human review in this Cove question. Cove's CSS question is already `REGEX` at revision 2. Preserve current user edits; if source parity is desired, explicitly set HTML to regex `hypertext markup language` through the authoring flow. Do not infer grading mode solely from an exported `isAutoGrade` field: the live UI and actual submissions contradict the earlier import interpretation.
2. **Reviewed short-answer status label is stale.** The Teacher browser report displays “Awaiting review” even after the latest answer is marked Reviewed, scored 100/100, and has published feedback and review history. `manual-review-workspace.tsx` derives this label from the original assessment's `MANUAL` status rather than the effective human review. The grade and completion themselves are correct.
3. **Staff practice has contradictory score wording.** The page says practice does not affect student grades or points, but the activity metadata still says “Included in score” from the material configuration. Persisted practice attempts correctly have `includeInScore: false`.
4. **Quiz accuracy covers only MC.** The teacher summary reports 3/3, although this imported week has three MC and two short-answer questions. Both short answers contribute to total completion and have separate reports. The summary should make that MC-only scope clear if retained.
5. **MC answer selection is cleared.** Elice retains the chosen radio option after a submission and reload. Cove clears the selection after submission and shows unselected radios on reload, even while displaying Correct and 100/100. The submitted selection remains stored in the attempt; this is a workspace behavior difference, not loss of the saved answer.

Existing design differences remain: Cove's light theme, tabs on narrow screens, and a drilldown teacher report rather than Elice's wide grid. Source mission pages observed here are external-editor instructions, not automatically graded browser coding exercises.

## Evidence and boundaries

All **nine new screenshots** are kept together in `.migration-artifacts/web-grading-audit-20261117/screenshots/`, with an index in that folder's README. Private API results, source accessibility captures, fixture identifiers and auth state are under the same ignored audit directory; credentials and sessions are not committed. Screenshots include source account details, so they remain local.

This run used localhost dev servers and the existing development data source. No new application read path was introduced, so no new SQL statement budget is claimed. A fresh production build, mobile layout sweep, all 348 materials, all source regex syntax, Elice manual grading, and four separate Elice role accounts are outside the verified coverage of this run.

The dev-server CLI emitted an advisory for the installed Next.js 16.4.1 version. No dependency upgrade was attempted as part of this comparison. The temporary API and web servers were stopped after verification; ports 4000 and 3000 were checked free.
