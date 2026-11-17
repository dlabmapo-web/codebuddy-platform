# Web grading parity follow-up

Date: 2026-11-17 (Asia/Seoul). Approved scope: the user's request to implement the differences recorded in the [live comparison](../../research/2026-11-17-elice-cove-web-grading-comparison.md).

Status: implemented and verified. [Results and screenshots](../../research/assets/2026-11-17-web-grading-parity-localhost/README.md) record 128 isolated checks, the complete browser walkthrough and 13 development-course role checks.

Extend the existing Web course design with the observed Elice submission behavior. Keep the existing Cove theme, mobile tabs and teacher report structure. Do not infer unobserved Elice permissions or regex features.

## Behavior

1. Keep a multiple-choice selection after Submit and restore the latest submitted selection on reopening the same question/class. Restore its displayed option order when the same options still exist. Never restore options deleted by an author or overwrite unsaved edits on a background refresh. Changing the submission class requires discarding unsaved changes and loads that class's own answer.
2. A published human review takes precedence over automatic assessment state in the teacher's result label and icon. A reviewed manual answer must not remain labelled Awaiting review, and an overridden automatic answer must not show its old verdict as the current result.
3. Staff practice metadata says Excluded from score, matching its stored private-attempt behavior. Student coursework continues to use the activity's configured score inclusion. A class ID in the navigation context must not be sent to the classless private-practice submission endpoint.
4. Web quiz accuracy includes multiple-choice and written-response questions. Use the latest class-scoped submission per question and its latest review, falling back to graded MC/short-answer assessments. Pending/manual/unsubmitted questions count in the denominator; only a completed full-score result counts as correct. No class, visibility or staff-practice boundary changes.
5. Replace only the incorrectly imported HTML question in the user's development course with REGEX `hypertext markup language`, as verified in the source UI. The author API correctly locks published/submitted definitions, as Elice does. Preserve that boundary: create a replacement through the normal author API with the existing content/settings, position it beside the original and hide the original. Preserve its submissions and reviews. Verify the replacement automatically grades new answers. Do not reimport the course or overwrite the edited CSS question.

## Implementation and validation plan

Use the existing workspace state, effective-result helper, author API and grouped teacher-report query. Client-only label fixes would leave reporting/content mismatched; a replacement grading system or visual redesign would exceed the observed gaps. The targeted extension is the chosen approach.

- Update workspace selection restoration and score metadata; correct teacher status precedence.
- Extend the existing quiz aggregate and material selection to written responses, including the short-answer assessment join. Keep one SQL statement for quiz statistics, independent of roster size.
- Add disposable-PostgreSQL regression coverage for exact/regex/manual/pending results, latest attempts, review overrides, class isolation and query count.
- Extend the isolated browser walkthrough with retained MC selections, manual-to-reviewed status, automatic short answers, score exclusion and combined quiz accuracy. Save this run's screenshots in one dated folder.
- Run focused tests, typechecks and the complete isolated localhost verification; check the actual development course's repaired question through the existing APIs. Stop temporary servers afterward and verify port 4000 is free.

Self-review: no placeholders; changes are limited to the five observed differences. Existing submissions retain their original assessment snapshots; the replacement affects new submissions. Full parity for all 348 source materials and separate Elice role accounts is not claimed.
