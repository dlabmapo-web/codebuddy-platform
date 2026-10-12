# Elice short-answer question inspection

Date: 2026-10-08

Purpose: specify Cove short-answer questions from the user's signed-in Elice course. This is research, not an implementation report.

## Sources and method

- [Requested course materials](https://dlab.elice.io/courses/765886/lectures/all).
- [Introductory chapter](https://dlab.elice.io/courses/765886/lectures/6637911#list).
- [Inspected subjective question](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487946), its [author editor](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487946/edit), and [Tutoring view](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487946/admin).
- [A different quiz in the chapter](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487963) uses answer ordering, not short-answer input.

Inspected rendered UI through Chrome using the user's existing login. Entered original temporary strings into the learner field and unsaved author preview controls. Never clicked learner Submit or author Save. Discarded changes through Elice's leave dialogs. No feedback, regrade, or grade assignment was performed. No learner identities, contact details, answers, or teaching assets are retained here.

## Verified learner behavior

The inspected question asks for everyday examples of integer and floating-point values; its instructions say there is no single correct answer. Its persisted assessment setting is manual grading. This demonstrates an open-response activity, not a numeric-only input.

The desktop workspace has rich instructions and an image on the left. The right panel has a `Q.` question caption, a multiline text area with an author-configured placeholder, and Submit. There is no code editor, Run/Stop, terminal, or GUI viewer. Previous/Next, the material drawer, lesson position (7 of 28), and fullscreen remain part of the lesson shell.

| Temporary input | Observed behavior |
|---|---|
| Empty string | Submit disabled |
| One space | Submit enabled; no submission made |
| Original example text | Submit enabled; no submission made |
| Cleared back to empty | Submit disabled; navigating to Edit still raised an unsent-change warning |

The leave warning states that unsubmitted changes will not be saved. Leaving discarded the temporary response. This is evidence for a guarded, explicit-submit interaction; it is not evidence for automatic draft persistence. Reload, cross-device persistence, server acceptance of whitespace-only answers, and successful submission feedback were not tested.

## Verified author controls

The editor separates left-panel Description/Solution and supplementary-material selection from Quiz Questions, Basic Info, Achievement, and AI Helpy Guide tabs.

Quiz Questions exposes:

- A required question caption with a 1000-character counter.
- Rich Problem Description.
- Answer type `Subjective`. The type selector is disabled on this existing public question. Its warning refers to public quizzes or existing student submissions; this does not establish that every grading field is locked.
- A checked manual-grading option that requires no correct answer and disables answer-definition fields.
- Normal Mode: one correct-answer field with helper text describing exact matching. No list of acceptable answers was observed.
- Advanced Mode: a regular-expression definition, a test-input field, escaping guidance, and an AI Answer Helper button. The helper was not invoked.
- An input-field hint with a 1000-character counter.
- Optional rich explanation. The helper says it is shown after solving. Enabling it with an empty editor disables Save and asks for required fields.

Basic Info has a title and a checked score-exclusion option. A separate Submit availability setting was not observed for this question. Do not transfer that control from Elice's programming-exercise editor as a verified subjective-quiz control.

### Unsaved grading preview experiments

Temporarily unchecked manual grading in the author editor. Normal Mode then required a nonempty correct answer and disabled Save while it was empty. Advanced Mode exposed editable pattern/test fields.

| Pattern | Test input | Observed preview |
|---|---|---|
| `orbit` | `orbital` | Correct |
| `^orbit$` | `orbital` | Incorrect |

Thus the preview permits partial regex matching unless the author anchors the expression. Switching back to Normal Mode retained the simple value `orbit`. An uppercase test also showed Incorrect, but was not bracketed by a second positive control; treat case sensitivity as provisional rather than a completed compatibility test.

All these were unsaved form changes. Explanation enablement and dummy grading values were discarded together using Return to Lecture Materials and Confirm. These observations establish author preview behavior, not Elice's backend regex dialect, normalization rules, or the result of an actual learner submission.

## Tutoring surface

The roster distinguishes Not submitted from Before Grading. Closing the roster exposed the signed-in user's own empty record, with submission count, final submission, final score, Feedback, and disabled submitted-answer/answer fields. Summary values were empty. No other learner's work was opened. This confirms a separate tutoring/review surface; it does not verify numeric grade editing, partial credit, final-attempt selection, or feedback publication.

## Cove context and implications

Cove already implements `WRITTEN_RESPONSE` alongside turtle work. [Shared schemas](../../packages/shared/src/content/manual.ts) define instructions, private model answer, input hint, manual assessment configuration, and a 10,000-character learner answer. [Manual service](../../packages/api/src/manual/manual.service.ts) persists drafts and immutable submissions, rejects whitespace-only written submissions, and exposes teacher review. [Database models](../../packages/api/prisma/schema.prisma) include ManualMaterial, ManualDraft, ManualSubmission, and append-only ManualReview.

It currently lacks a separate question caption, literal/regex grading definitions, author matching preview, and conditional explanation release. Creation is coupled to the turtle flag: the lecture builder uses `publicConfig.guiEnabled`, and `ManualService.save` calls `gui.assertEnabled()` even for written responses. The new feature must remove that dependency for short answers.

Recommend extending the written-response material with a versioned short-answer definition, preserving existing manual attempts and turtle behavior. New short-answer input should reproduce the observed explicit-submit/leave-guard flow; legacy written-response autosaved drafts must not silently change. See the [design spec](../superpowers/specs/2026-10-08-short-answer-questions-design.md).

## Unverified reference behavior

The following must remain explicit compatibility gaps until an authorized disposable Elice question/submission is available:

- Server treatment of whitespace, line endings, Unicode, case, and numeric-looking answers in Normal Mode.
- Backend regex engine, supported constructs/flags, and agreement between preview and learner grading.
- Successful/wrong submission UI, retries, resubmission limits, partial credit, final-score selection, and completion thresholds.
- Exact explanation-release timing, solution visibility, and behavior after resubmission or content revision.
- Learner input length limit, persistence after reload, and numeric-grade publication controls.

The accompanying spec defines concrete Cove policies for these gaps. Passing Cove tests alone must not be described as proof of complete Elice parity.
