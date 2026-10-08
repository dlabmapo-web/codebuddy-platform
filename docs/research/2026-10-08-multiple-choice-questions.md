# Elice multiple-choice question inspection

Date: 2026-10-08

Purpose: define Cove multiple-choice questions from the user's signed-in Elice course. Research only; no feature implementation is reported here.

## Sources and method

- [Requested course](https://dlab.elice.io/courses/765886/lectures/all) and [introductory chapter](https://dlab.elice.io/courses/765886/lectures/6637911#list).
- [Multiple-answer question](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487965) and its [editor](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487965/edit).
- [Second multiple-answer question](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487954).
- [Single-answer question](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487949) and its [editor](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487949/edit).

Inspected visible rendered UI in the user's logged-in Chrome. Temporarily selected and cleared learner choices without submitting. Temporarily enabled the explanation editor without saving; discarded it through Return to Lecture Materials and Confirm. Opened New Material → Quiz, which required saving a title before proceeding; cancelled without creating anything. No learner submission, author save/publication, feedback, regrade, or grade assignment occurred. Course questions, answer keys, assets, and other learners' work are not copied into these documents.

## Verified student behavior

The multiple-answer example has five vertically stacked option cards with independent checkboxes. The single-answer example has three vertically stacked cards with radio buttons. Although its title calls it an OX quiz, the editor explicitly identifies it as Multiple Choice (Single Answer); this is evidence for general single selection, not a dedicated two-option OX type.

| Interaction | Observed result |
|---|---|
| Initial state, no selected options | Submit disabled in both modes |
| Select one option | Submit enabled in both modes |
| Select a second option in multiple mode | Both remain checked |
| Uncheck both selected options | Both clear; an unsent-change guard still appears on leaving |
| Select a second option in single mode | Previous radio clears; new radio selected |
| Click selected radio again | It remains selected |
| Leave single-answer page after selection | Warning says unsubmitted changes will not be saved |
| Cancel that warning | Learner page and selected radio remain |
| Confirm Move | Navigates and discards temporary answer |

Both inspected choice workspaces have a centered question card with a `Q.` caption, options, and Submit. Their instruction and problem-detail fields are empty, so there is no populated left instruction panel. No code editor, terminal, Run, or GUI viewer appears. Material drawer, Previous/Next, lecture position, and fullscreen remain in the shared lesson shell.

No actual submission was made. Correct/incorrect feedback, retries, explanation release, completion, persistence after reload, and score computation cannot be inferred from enabling Submit.

## Verified author behavior

The editor separates optional left-panel instructions (Description/Solution and supplementary-material selector) from Quiz Questions, Basic Info, Achievement, and AI Helpy Guide tabs.

Quiz Questions exposes:

- Required question caption with a 1000-character counter.
- Separate rich Problem Description editor, with guidance mentioning descriptions, code, and images.
- Answer types displayed as Multiple Choice (Single Answer) or Multiple Choice (Multiple Answers).
- Shuffle answer order switch, off on both inspected questions.
- Editable option text areas; single mode displays one correct-answer marker, multiple mode displays checkbox correct-answer markers.
- Add Option button.
- Optional Write Explanation / Use toggle. Helper says the explanation is shown after the problem is solved.

These questions are public. The answer type selector, shuffle switch, correct-answer controls, and Add Option are disabled. A warning says editing is not possible if the quiz is public or students have submitted. Option text areas are exposed as editable while those structural controls are disabled; no option text was changed. This does not prove what changes the backend accepts on Save.

Basic Info on the multiple-answer question has a title and checked Don't include in score. No explicit partial-credit policy, manual-grading mode, per-option points, attempt limit, or Submit-availability setting was observed in the inspected choice editor.

Enabling explanation on the single-answer editor exposed a rich editor. With it empty, Save became disabled and the form requested required fields. The change was discarded. The learner-side release condition was not tested.

New Material → Quiz first asks for a title and Save. Continuing would persist a real material; the dialog was cancelled. Therefore editable creation controls, option minimum/maximum, remove/reorder behavior, and author preview are not verified.

## Cove baseline and design implications

Cove currently has PROGRAMMING_EXERCISE, PDF_DOCUMENT, TURTLE_EXERCISE, and WRITTEN_RESPONSE material types; no multiple-choice type. [Shared assessment schemas](../../packages/shared/src/content/manual.ts), [manual service](../../packages/api/src/manual/manual.service.ts), and [database models](../../packages/api/prisma/schema.prisma) already provide scoped immutable submissions, append-only teacher reviews, safe result projection, and private short-answer definitions. Short answers support manual/exact/regex grading and explanation release independently from GUI execution.

Recommend adding a distinct MULTIPLE_CHOICE material while reusing that assessment lifecycle. Selection must use stable option IDs, never text or shuffled display indexes. Keep correct IDs and unreleased explanations server-private. A bounded set comparison can grade synchronously in the submission transaction; it needs neither the regex worker nor Python judge. See the [design spec](../superpowers/specs/2026-10-08-multiple-choice-questions-design.md).

## Reference gaps

The following remain unverified and must not be described as established Elice behavior:

- Actual submission/result UI, resubmission limits, final-attempt rule, numeric scoring, partial credit, and completion thresholds.
- Correct-option highlighting or answer-key disclosure after wrong/correct submissions.
- Exact explanation timing and effects of teacher overrides or revised content.
- Shuffle algorithm and whether order persists across reloads, attempts, users, or devices.
- Option count/content limits, rich formatting/images inside options, removal/reordering, and creation defaults.
- Instructor choice-attempt review and grade override/publication behavior.
- Mobile, keyboard/screen-reader behavior, reload persistence, and backend enforcement of published editing locks.

The spec defines explicit Cove policies for these gaps. Complete Elice parity requires a later comparison against authorized disposable reference work; passing Cove tests alone is insufficient.
