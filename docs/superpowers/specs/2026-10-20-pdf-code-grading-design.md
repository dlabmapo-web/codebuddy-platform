# PDF + code grading design

Date: 2026-10-20  
Status: Design specification; implementation is not included in this change.  
Related: [Shared course workspace and role behavior](2026-10-20-shared-course-workspace-role-behavior-design.md)

## 1. Outcome

A teacher or curriculum manager can upload a PDF, attach a Python editor, and
choose whether the material is ungraded practice or automatically graded.
Instructions stay in the PDF. Automatic scores come from configured test cases,
never from reading the PDF or comparing against a reference solution.

Use Elice's separation between instructions, runnable code and grading, with
Cove's existing blue palette, typography and shared selector components. Keep
creation short: PDF, automatically suggested title, optional initial code, and
an explicit grading choice. Do not require a duplicate problem statement.

This specification adds an explicit participation policy and simplifies the
existing grading controls; it does not replace the judge or invent new scoring
semantics.

## 2. Evidence and limits

Inspected through the authenticated Elice UI on 2026-10-20:

- [Course lectures](https://dlab.elice.io/courses/765886/lectures/all).
- [While exercise](https://dlab.elice.io/courses/765886/lectures/6637920/lecturepages/54488103).
- [Exercise editor](https://dlab.elice.io/courses/765886/lectures/6637920/lecturepages/54488103/edit).

The editor separates Skeleton Code, Grader Code and Grading settings. Grader
Code exposes a run script, a grading switch, and a Standard Input/Output grader.
The inspected exercise has an enabled grader and one test case: blank input,
expected output, “STDOUT output contains a string”, 100 points and a 60-second
limit. Grading settings has Absolute grade selected and explains its cap as
`min(material maximum, earned grader points)`.

The inspected exercise uses authored text/images, not a linked PDF. Its grader
shows why a learner-facing statement need not display the grading cases.
We did not switch off its grading, submit code, save changes, or establish the
behavior of every Elice course. Practice-only completion behavior below is a
Cove decision. Elice Relative grading is not sufficiently verified to clone or
label Cove's proportional scoring as equivalent.

## 3. Scope and alternatives

Chosen approach: one PDF + code material, with Practice only and Automatic
grading. Reuse the existing STDIO judge and its supported comparisons.

Alternatives considered:

- Continue inferring everything from test count: smallest change, but hides the
  author's intent and leaves Submit disabled without a clear explanation.
- Separate “PDF playground” and “PDF graded exercise” material types: creates
  duplicated creation paths and makes changing the grading choice harder.

Teacher-reviewed code submissions, custom grader scripts, AI-generated grades,
PDF extraction, new programming languages and Elice environment/IP controls are
outside this implementation. Teacher review must not appear as a selectable
mode until its submission and review workflow exists.

## 4. Authoring experience

### 4.1 Creation

Keep New material → PDF + coding practice. Upload or choose a same-lecture PDF
using existing placement and access rules. Suggest the PDF title only when a new
exercise title is empty; preserve custom and saved titles. Initial code and extra
written instructions remain optional. Keep the existing default difficulty.

Present a visible **Grading** section before optional solutions/hints. Do not
bury the choice inside a collapsed “Solutions, grading and hints” section.
Use two accessible selection cards:

| Choice | Copy | Default |
| --- | --- | --- |
| Practice only | Students read the PDF and run code. No submission or score. | New PDF + code materials |
| Automatic grading | Students submit code and receive a score from your test cases. | New ordinary coding materials |

Selecting Automatic grading opens the test editor in place. Start with one
unsaved test card and focus its expected-output field. Its empty placeholder
must not count as a configured test. Show what is missing next to Create/Save.

Selecting Practice only hides the test editor while retaining its draft data.
It must not silently delete saved tests, points, solutions, or grading settings.
Returning to Automatic grading restores them. Switching an existing graded
material to Practice only shows an inline explanation that future submissions
stop and previous results remain; it does not regrade or delete history.

### 4.2 Test-case editor

Use a compact vertically stacked card per case. Main fields:

- **Input (optional):** blank is valid for exercises without standard input.
- **Expected output:** required for the ordinary matching/contains rules.
- **Comparison:** use the shared custom selector, not a browser-native select.
- **Points:** positive numeric value in the enhanced grading profile.
- **Show as example:** maps to the existing SAMPLE/HIDDEN visibility.

New automatic PDF exercises use the existing enhanced STDIO profile with a
100-point material maximum, Absolute cap scoring, and a first case worth 100.
The first case defaults to Output matches and Hidden. Additional cases default
to 100 points; show total available points and maximum prominently. If case
points exceed the maximum, explain that the score is capped and one passing case
may already reach full marks. Never silently redistribute authored points.

Comparison labels must describe existing engine behavior:

| UI label | Existing comparator | Meaning |
| --- | --- | --- |
| Output matches | STDOUT | Existing normalized equality; preserve its stored-version behavior |
| Output contains text | STDOUT_MATCH | Existing contains-text rule |
| Output does not contain text | STDOUT_NOMATCH | Advanced rule |
| Matches pattern | STDOUT_REGEX | Advanced regular-expression rule |
| Does not match pattern | STDOUT_REGEX_NOMATCH | Advanced regular-expression rule |

Do not label normalized equality “Ignore whitespace”: the existing legacy
normalizer standardizes line endings and trims trailing output, but preserves
internal whitespace. Do not add broader whitespace normalization in this work.
Advanced comparison options may remain in the same selector under an Advanced
section; they retain inline validation and bounded execution.

A collapsed **Advanced grading settings** area holds time limits, input-prompt
handling, scoring policy and existing supported penalties/budgets. Use current
validated runtime limits; do not copy the observed 60 seconds into every Cove
exercise. Display units and defaults. Keep maximum points and total case points
visible outside this collapsed area.

Preserve the current Standard/Weighted profiles on existing materials. The
simplified enhanced defaults apply only to newly configured automatic PDF
materials. Moving a legacy material to enhanced settings is explicit and must
not reset its cases or historical semantic version silently.

### 4.3 Solutions and validation

Reference solutions and hints have their own optional collapsed sections.
A solution helps staff teach; it neither creates a test case nor grants a score.
Keep solutions private under the existing role/access rules.

Practice-only PDF materials can save with no statement, solution, cases or
starter code. Automatic grading requires at least one valid active test case.
Reject incomplete added cases rather than silently dropping them on save;
remove the untouched starter placeholder only when saving Practice only.
Preserve existing support for valid empty-output advanced rules. Validate with
the same shared schemas in UI and API. Surface field errors inline and a short
summary near Save. Server rejection must keep the draft intact.

## 5. Student and staff workspaces

| State | Run | Test run | Submit | Message |
| --- | --- | --- | --- | --- |
| Practice only | Available once runtime is ready | Hidden | Hidden | Ungraded practice · Read the PDF and run your code. |
| Automatic, valid configuration | Available | Available only with public sample cases | Available subject to normal access/runtime rules | Automatically graded · Up to N points |
| Automatic, invalid configuration | Available when safe | Unavailable | Disabled | Grading is not ready. You can still run your code. |

Staff with authoring permission get an Edit grading action for invalid automatic
configuration. Students get no authoring link and no hidden-case details.
Disabled runtime/loading controls keep their existing explanations.

No score placeholder such as “0/100” should imply that an ungraded practice
failed. Practice-only materials do not create submission records, mark a problem
SOLVED, earn correctness points, or increase a graded-progress denominator.
Opening/working may retain the existing IN_PROGRESS status; no new completion
button is introduced. Do not remove progress from previously graded attempts.

Automatic materials retain the existing submission queue, result details,
student records, retry behavior, score policy and completion rules. Staff runs
and submissions remain isolated staff practice and never affect students.
Teacher observation stays in the current workspace. The PDF-only statement
message and its Open reference PDF button remain available.

## 6. Data, authorization and compatibility

Persist a programming-exercise field `submissionPolicy` with values
`PRACTICE_ONLY` and `AUTOMATIC`. Keep it separate from `grading.mode`:
LEGACY_STDIO/ELICE_STDIO selects the comparison/scoring engine, not whether a
student may submit.

Carry the policy through create/update contracts, authoring context, course
summary/outline, exercise bootstrap, staff practice and published/versioned
content snapshots. Client and server derive button availability from the same
policy plus configuration readiness. Expose a safe availability reason such as
`PRACTICE_ONLY` or `INVALID_GRADING`; never expose hidden inputs or answers.

Enforce policy on both student submission and staff-practice submission APIs.
A forged Submit request for Practice only must return a stable, localized
`EXERCISE_PRACTICE_ONLY` error and create no attempt or queue job. UI hiding alone
is insufficient. Preserve current enrollment, academy scope, preview, publishing,
monitoring and role permissions. Manager/Team Lead authoring and Teacher review
rights remain unchanged; this feature grants no extra write authority.

Backfill PDF-linked exercises without cases to PRACTICE_ONLY; backfill all other
existing programming exercises to AUTOMATIC. An old ordinary exercise without
cases remains invalid automatic configuration, preserving its prior refusal to
submit. Backfill must not rewrite scores, case definitions or semantic versions.
For create API callers that omit the field, infer the same policy from PDF
linkage and submitted cases. Updates that omit it preserve the stored policy;
otherwise an older editor could accidentally re-enable retained grading cases.
New UI clients always send an explicit value. Update library,
console, adoption, import/export and version restore paths to round-trip the
field. Where an older format has no field, apply the same inference rule.

Policy changes are audited and increment the grading configuration revision.
Already accepted jobs finish against their immutable submission snapshots;
subsequent requests use the new policy. Historical results keep their policy,
cases, semantic version and score. Regrading remains a separate explicit action.
Switching policy must invalidate relevant course and bootstrap caches.

Existing Practice-only cases retained for later editing are excluded from
execution and grading readiness until Automatic is selected. They remain private
and are not converted into a score by merely opening or running the material.

## 7. Implementation boundaries

Extend existing components and services; avoid parallel graders or separate PDF
exercise endpoints:

- `packages/shared/src/content/course.ts` and `learn.ts`: policy, readiness,
  authoring validation and bootstrap contracts.
- `packages/api/prisma/schema.prisma`: persisted field and compatible migration.
- Course authoring service and serializers: saves, audit, versions, publishing,
  copy/adopt/import/export and revision handling.
- Exercise draft/workspace, `answers-editor.tsx`, `grading-settings.tsx`: visible
  policy choice, compact cases, separate advanced settings and optional answers.
- Student submission and staff practice services: enforce submission policy.
- Workspace editor controls, course progress aggregation and records: accurate
  labels, availability and graded denominators.
- English/Korean grading and PDF namespaces: all copy and error messages.

## 8. Acceptance and verification

1. Upload a PDF and save Practice only using its suggested title, with no extra
   statement, solution, initial code or tests. Open it and run Python.
2. Practice only shows Ungraded practice, no Submit/Test run, no invented score,
   no correctness reward and no new graded-progress denominator entry.
3. Choose Automatic: one clear case card appears. Empty input is accepted;
   missing expected output for a normal match blocks saving with a field error.
4. Configure output `hello`, 100 points. Submitting correct output earns 100;
   incorrect output earns zero under the selected stored semantics.
5. Configure Contains text: extra surrounding output passes, absent expected
   text fails, using existing comparator tests as the semantic authority.
6. Verify two-case scoring, the absolute cap and the visible points-total warning.
   Existing legacy and proportional examples retain their previous results.
7. A hidden test grades submissions without appearing in bootstrap payloads;
   a public example supports Test run. Hidden-only grading permits Submit.
8. Toggle practice/automatic: cases and custom settings survive, but practice
   submissions are rejected server-side. Previous attempts remain unchanged.
9. Verify unavailable/invalid grader messages, unsupported semantic versions,
   timeouts, runtime errors, duplicate requests and in-flight policy changes.
10. Exercise migration and round-trip through authoring, publishing, versions,
    library adoption and import/export. No existing score changes automatically.
11. Verify Manager, Team Lead, Teacher and Student controls and direct API denial
    according to existing permissions; staff attempts never affect students.
12. Check keyboard selection/focus, mobile layout, light/dark themes and both
    languages. Browser-verify PDF page and code retention across tab changes.

Use focused shared-contract, API authorization/judge/migration, UI interaction and
end-to-end tests for the behaviors above. Reuse the established comparator tests;
do not reinterpret Elice labels as permission to change historical judge behavior.
