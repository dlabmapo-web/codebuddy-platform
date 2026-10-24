# Unified workspace Submit and latest submission summary

Status: implemented locally after user approval on 2026-10-23. All 40
Chromium/WebKit browser scenarios pass locally after resolving the external Monaco worker-loading failure. Evidence is recorded in
[the verification report](../../research/2026-10-23-unified-submission-local-verification.md).

## Request and reference limits

Give students, teachers, team leaders, and managers a consistent Submit experience
for answerable course activities. Staff must be able to check their own answers.
Show Last submit score and Last submit datetime next to Submit, as in the user's
Elice screenshot, using Cove components and Korean/English labels.

The live Elice browser connection could not initialize: its installed browser
package references a missing browser-service module. The supplied screenshot
establishes the toolbar reference. This document does not claim a fresh live
audit of all Elice roles/materials.

## Current findings

- Programming staff workspaces already use `StaffPracticeService` and
  `usePracticeSubmission`, including revision-scoped unpublished preview attempts.
  Their Submit action is generally present. A history control in the header can
  show a score; there is no consistent latest-score/datetime strip next to Submit.
- `ManualWorkspace` supports private staff practice for published Turtle, written,
  short-answer, and multiple-choice activities. Its preview branch hides Submit
  for Turtle and renders a disabled Submit for other assessment types.
- `ManualService.workspace` explicitly excludes preview from staff practice.
  `ManualPracticeService` only has the `manual-live` context, and its submit
  endpoint does not accept unpublished preview participation.
- Student coding workspace results can represent a selected historical attempt.
  Navigator scores represent best scores. Neither is a reliable source for the
  current user's latest submission summary.
- Manual activity history contains submission dates, published reviews, or
  automatic evaluations, but these appear in a separate panel and differ from
  the coding toolbar presentation.
- PDF-backed coding activities can intentionally be Run-only. Reading-only PDF
  documents and video lessons have no submitted-answer grading contract.

Relevant implementation areas:
`staff-workspace.tsx`, `editor-pane.tsx`, `use-practice-submission.ts`,
`manual-workspace.tsx`, `StaffPracticeService`, `ManualService`,
`ManualPracticeService`, and the shared workspace/submission contracts.

## Approach

Recommended: keep existing student and staff storage/grading paths, expose a
consistent server-authorized submission capability and latest-attempt summary,
and render them with one shared summary component.

An alternative that only reveals hidden buttons would leave preview endpoints
rejecting requests and summaries inconsistent. A larger replacement of the
student/staff attempt models would risk grades and historical records without
being necessary for this behavior.

## Role policy

| Context | Submit behavior |
| --- | --- |
| Enrolled student | Normal coursework submission in the selected class |
| Actual academy teacher | Personal staff practice, subject to assigned-course scope |
| Actual academy team leader or manager | Personal staff practice in authorized courses |
| Authorized staff preview of unpublished material | Personal preview attempt tied to the authored content revision |
| Staff tutoring/reviewing a student's work | Student attempt remains read-only; return to own practice to self-submit |
| Platform inspection or assumed support role | Inspection alone does not grant participation |

Use server capabilities and existing membership/scope checks. A staff role does
not need student enrollment to self-test. Staff attempts remain separate from
student records, grades, rankings, points, analytics, and teacher review queues.
Role switching must never change the owner of an attempt or mix staff practice
with the same person's student participation.

## Material policy

| Material | Student | Eligible staff self-test |
| --- | --- | --- |
| Graded Python coding, including graded PDF-backed coding | Submit and existing grading | Submit and same grading rules, private result |
| Legacy coding quiz and current multiple-choice material | Submit and automatic evaluation | Submit and same evaluation, private result |
| Exact/regex short answer | Submit and automatic evaluation | Submit and same evaluation, private result |
| Manually graded short answer/written response | Submit, pending teacher review | Record private attempt; no invented score or student review task |
| Turtle | Submit drawing/code snapshot, existing manual review policy | Record private attempt and retain execution/reference tools; no automatic drawing score |
| Run-only coding/PDF practice | Run; no scored submission | Same Run-only policy |
| Reading-only PDF or video | Existing reading/watch behavior | Existing inspection/reading/watch behavior |

Honor explicit author submission settings and unavailable evaluator/grading
conditions. Where an answerable activity is unavailable for submission, explain
the reason instead of hiding an unexplained role-dependent button. This change
does not invent grading for Run-only lessons or media.

## Latest submission strip

Place Submit followed by two compact fields near the execution/answer controls:
Last submit score and Last submit datetime. On narrow screens wrap or stack the
same information without horizontal page overflow. Keep Cove's visual styling.

- Before any submission, display `—` for both fields.
- After the server accepts an attempt, use its server-created timestamp. Run,
  Save, opening a solution, and rejected requests do not change the summary.
- While evaluation is pending, display a pending state rather than zero.
- Show real numeric zero when a graded attempt earns zero.
- Display the score with the frozen maximum of that attempt, preserving decimal
  precision for weighted/manual scores.
- Student manually graded work shows Awaiting review until a published review
  exists. Staff ungraded self-tests show Recorded / Not automatically graded.
- The newest accepted attempt determines both fields. Never combine a previous
  attempt's score with a newer attempt's timestamp, substitute the best score,
  or change the strip when the user opens an older historical result.
- Order ties deterministically using creation time and attempt ID.
- Reloading, navigating away/back, or changing UI language restores the same
  owner/material/class-or-practice-context summary from the server.
- Use Cove's existing locale-aware date formatting and configured display time
  zone. Store and transport timestamps as UTC ISO values.

## Data and interaction changes

Add a small shared latest-attempt projection containing identity, creation time,
evaluation state, nullable score, and frozen maximum. Keep the projection scoped
on the server to the authenticated owner, academy, material, and participation
context. Student class contexts and staff live/preview contexts stay distinct.

Reuse existing attempt tables and snapshots. Extend manual staff practice to
support authorized preview/revision contexts, and propagate preview/revision
through draft, submit, history, and result reads consistently. Compare content
revisions on admission and keep immutable source/evaluation snapshots.

Refresh the latest summary after acceptance and terminal grading/review changes.
Query keys must include owner, participation mode, and relevant class/revision.
Bound polling and cancel it on navigation. Keep request-key idempotency for
uncertain network responses and disable duplicate in-flight submissions.

Preserve backend grading rules, hidden-case redaction, private answer keys,
submission rate limits, and existing student solve-session requirements. Staff
ungraded attempts need neutral user-facing semantics, not a fabricated pass or
an implication that a teacher will review their private practice.

## Verification

Cover all four roles against Python, graded PDF coding, Turtle, written response,
automatic/manual short answer, multiple choice, and legacy quiz. Verify media and
Run-only exclusions explicitly. Test live and unpublished staff preview contexts.

Check: first submission; pending-to-graded refresh; a real zero; weighted maximum;
manual pending/review; second attempt scoring lower than the first; history
selection; reload; navigation; language changes; idempotent retry; content revision
conflict; owner/class/preview isolation; student access to unpublished content;
and platform/support inspection staying read-only. Verify staff attempts create
no student grades, progress, points, ranking entries, or review tasks.

Local browser checks should cover Chromium/WebKit, mobile layout, English/Korean,
Submit enabled/disabled explanations, timestamps, and summary persistence.
Backend tests must enforce authorization independently of the rendered controls.

No production deployment or production test submissions are part of this change.

## Implementation sequence

1. Define a shared latest-attempt projection and private, authorized read paths.
2. Enable revision-scoped staff preview submission for manual assessments.
3. Add shared score/time UI and hook it into coding and manual workspaces.
4. Add authorization, latest-attempt, isolation, and browser regression checks.
5. Verify locally across roles/materials and document the results.

## Editor loading reliability follow-up

The local WebKit acceptance run exposed an external Monaco module-worker load
failure. Keep the existing browser editor version (0.55.1), pin it explicitly,
and copy its complete `min/vs` distribution and license during predev/prebuild.
All dynamic editor entry points share one configured loader using the versioned
same-origin `/monaco/<version>/vs` path. Retain cross-origin isolation for Python
input; versioned assets receive same-origin CORP and immutable caching. The
existing Docker build already runs prebuild and copies public assets.

This uses the wrapper's documented [loader configuration](https://github.com/suren-atoyan/monaco-react#loader-config),
without changing student edits, language services, or submission semantics.
Acceptance includes real editor input and Submit in Chromium/WebKit while the
external CDN is blocked, a successfully loaded local editor worker, and no page
errors.
