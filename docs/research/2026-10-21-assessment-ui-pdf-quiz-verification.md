# Assessment UI and PDF quiz verification

The local student answer and staff review screens now use clear answer cards, large selectable quiz options, visible submission actions, and a separate grading panel. Real Manager, Teacher, and Student accounts were used in the development demo academy on 2026-10-21. No production deployment or production database changes were made.

## Changes

- Written responses and short answers have a bounded composer, question, hint, character count, focus styling, and nearby save/submit actions.
- Multiple-choice questions have lettered answer cards, selected styling, accessible radio/checkbox controls, and single/multiple selection instructions.
- Preview explicitly explains that answers are not saved. Staff practice clearly states that it does not affect student grades or points. Staff practice history now displays its own attempts correctly.
- Teacher and Manager review uses a searchable learner roster, read-only submitted answer, and score/completion/feedback panel. Publishing has progress and confirmation states. Switching learners, attempts, or leaving an edited review asks before discarding changes.
- Review attempt labels distinguish automatically correct/incorrect results from work awaiting review. English and Korean copy is included. Mobile stacks the review panels and keeps the activity title readable.

Implementation design: [Assessment workspace UI](../superpowers/specs/2026-10-21-assessment-workspace-ui-design.md).

## Development setup

Branch: `feat/dlab-os-staff-sso`. Studio runs at `http://localhost:3000`, API at `http://localhost:4000`. The confirmed development Supabase project is `lnrmxjxsjxymgphgatwn`; academy slug is `daechi-sso-demo`. Existing SSO identities and academy permissions were retained.

Short-answer authoring was disabled locally. Added `SHORT_ANSWER_ENABLED=true` to the private API `.env.local` and `NEXT_PUBLIC_SHORT_ANSWER_ENABLED=true` to the private Studio `.env.local`. The API needed a full restart to load its changed flag. These private files are ignored by Git; they contain no new committed secrets. Multiple choice was already enabled.

The local judge worker was not running when official grading was requested. Starting it processed the waiting submission successfully. Keep API, Studio, Redis, and the judge running for a manual coding demonstration. The judge used this command from `packages/api`:

```bash
node --env-file=.env --env-file=.env.local --import tsx src/judge/judge.main.ts
```

## Retained test materials

Use **SSO Workflow Python — 2026-10-21**, assigned to **SSO Workflow Class — 2026-10-21**. The class, teacher assignment, student enrollment, and original code/written activities were created in the [earlier classroom verification](2026-10-21-dlab-sso-academy-workflow-verification.md).

| Material | ID | Configuration |
| --- | --- | --- |
| Assessment UI PDF reference — 2026-10-21 | `6c1e8e1c-019d-414b-a67f-934e177d0d12` | Published; main lesson and resources; two pages |
| Add two integers | `dd435e01-3377-4fba-ac73-ac78e30a2776` | Existing scored exercise; uploaded PDF attached as reference |
| Explain your addition solution | `2f9b21ff-7f6b-4d7e-9663-1c5470fe541d` | Existing written response; 90/100 completed review |
| Assessment UI — addition quiz | `b23b1f19-24df-4e74-92d4-4e077f572832` | Published; single choice; `+`, `-`, `*`; correct `+`; maximum 100 |
| Assessment UI — Python language | `fc4dd49f-804b-4b01-bab3-0e1bb5f22ca3` | Published; exact answer `Python`; maximum 100 |

## Real browser results

| Actor | Check | Result |
| --- | --- | --- |
| Manager | Upload `e2e/fixtures/lecture-material.pdf` through the file chooser | Saved two-page, 880-byte PDF; published successfully |
| Manager | Attach the uploaded PDF to the existing coding exercise | Saved; course displays “PDF + coding practice” |
| Manager | Author and publish quiz and exact short answer | Both available in the student's assigned course |
| Manager | Short-answer preview | Clear preview notice, question, hint, answer card; no submission action |
| Manager | Review written response | Published version 2 at 90/100; cancelling a navigation confirmation retained unpublished feedback before publication |
| Student | Read PDF, go to page 2, select Fit page, download | Both pages rendered; downloaded file hash equals the source |
| Student | Coding public Test run | Input `2 3`, expected `5`, actual `5`, matching result |
| Student | Interactive Run with reference PDF open | Input `8 9` produced `17`; PDF page navigation remained usable |
| Student | Official code Submit | Accepted, 100/100, 2/2 cases; hidden case values withheld |
| Student | Submit quiz `-`, then `+` | Incorrect 0/100, then Correct 100/100; two retained attempts |
| Student | Submit short answer `python`, then `Python` | Case-sensitive incorrect 0/100, then Correct 100/100; two retained attempts; empty submission disabled |
| Student | Open written response | Published 90/100 and updated Manager feedback visible; model answer absent |
| Student | Course progress after submissions | 4/4 solved; manual score 290/300; zero awaiting review |
| Teacher | Search roster with unmatched text, then student's name | Empty-search message and matching learner displayed correctly |
| Teacher | Review both quiz attempts | Original selected option and 0/100 or 100/100 restored; submitted choices disabled |
| Teacher | Publish short-answer and quiz feedback | 100/100, completed; confirmation and version 1 history displayed |
| Teacher | Private quiz practice | Own Correct 100/100 attempt and “Practice recorded” displayed separately from class work |
| Teacher | Coding practice with attached PDF | Reference PDF rendered; own practice submission Accepted, 100/100, 2/2 cases |
| Student | Reopen quiz after teacher publication and private practice | Teacher feedback visible; student's history still contains only the two student attempts |
| Student | Reopen short answer after teacher publication | 100/100 completed result and the teacher's new feedback visible; two student attempts retained |

PDF SHA-256: `85039d3cd6634cb7ed86ba25b62bb88e17f5b1b6178dca8694466c98ece84454`.

Desktop screenshots and 390×844 responsive checks cover the student composer and staff grading panel. DOM width equalled viewport width, with no horizontal overflow. Korean review copy and dark-theme colors were also checked in the browser. Screenshot evidence is in `/tmp/cove-assessment-ui/`, including `student-quiz-correct.png`, `student-short-answer-mobile.png`, `teacher-short-answer-review.png`, `teacher-review-mobile.png`, `teacher-written-review-korean-dark.png`, `student-written-feedback.png`, and `student-pdf-code-accepted.png`.

## Repeat locally

1. Start a fresh flow at `http://localhost:3000/sso/start`. Sign out of Cove before switching accounts; normal Chrome tabs share authentication cookies.
2. As Manager, open Courses → **SSO Workflow Python — 2026-10-21**. Open the lecture to inspect the PDF and published activities. Use New material to author another activity without overwriting these fixtures.
3. As Student, open the same assigned course. Read the PDF, run or submit **Add two integers**, and answer the quiz/short-answer activities. Previous attempts and published feedback appear within each activity.
4. As Teacher, open My classes → **SSO Workflow Class — 2026-10-21** → Assessment activities. Open the quiz or short answer, select an attempt, set score/completion, write feedback, and Publish review.
5. Return as Student to see the published feedback. Teacher practice through Courses remains separate from the learner's class attempts.

## Automated checks and boundaries

Focused Studio checks passed: 4 test files, 12 tests, covering shared answer/review accessibility and state, both choice modes, and existing authoring/save behavior. Studio TypeScript passed. Locale tests passed: 4 files, 136 tests. Changed manual components passed ESLint with zero errors and five existing hook-dependency warnings. `git diff --check` passed.

This is a local development verification using the retained demo data. It covers single-choice automatic grading and exact short answers; regex matching and multiple-selection grading were not exercised through the browser in this pass. Both choice modes have component coverage. The full repository suite, production environment, and simultaneous multi-profile collaboration were not tested in this UI pass. Existing unrelated working-tree changes are preserved.

## Elice layout follow-up

Inspected the authenticated [Elice written-response page](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487946), [quiz page](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487949), material drawer, and tutoring layout. No reference answers were submitted and no Elice curriculum was changed.

Cove now follows those layout patterns with its own colors and icons: equal-width instruction/answer panels for written questions; a centered quiz panel when instructions are empty; flat selectable option rows; Submit at the panel's bottom-right; material navigation in a modal drawer; and bottom Previous/Next/count/Fullscreen navigation. Results and feedback stay within the answer area, so the quiz does not change columns after submission. Publishing and preview retain their existing behavior; preview displays disabled Submit with its explanatory notice.

Teacher and Manager review now includes a learner drawer and a summary of submission count, latest submission, and latest score. Historical attempt selection changes the read-only answer and grading form while the summary continues to describe the latest attempt. Green/amber result icons, blue question markers/actions, a red leave action, and existing dark-theme tokens provide color with text labels.

Additional real local checks:

- Student submitted another correct quiz and exact short answer: both returned 100/100; each now has three attempts. Earlier reviews and answers remain in history.
- The material drawer closes with Escape and restores focus to Materials. At a 390-pixel viewport its width is 360 pixels; selecting a material navigates and dismisses it.
- Student written/quiz pages and Teacher review were checked at 390×844, with document width equal to viewport width.
- Teacher learner search shows an empty state, then finds T민준. Selecting the learner dismisses the drawer. Latest quiz feedback published successfully and survived refresh.
- Selecting the old incorrect quiz attempt restores its original `-` selection and 0/100 form; the summary retains the latest 100/100 result.
- Dark-mode quiz preview renders correctly and keeps Submit disabled. Manual-question navigation retains preview mode.

Focused assessment/authoring checks now pass **15 tests across four files**; the three added cases cover status text/icon states. Locale checks pass **136 tests**, Studio TypeScript passes, and `git diff --check` passes. Scoped ESLint has zero errors and the same five existing hook warnings. Screenshots for this follow-up are in `/tmp/cove-elice-assessment/`, including the reference layouts, Cove written/quiz layouts, mobile pages, material/learner drawers, quiz result, and Teacher review. Light mode and the normal viewport were restored after testing.

Design decisions are recorded in [Elice assessment layout adaptation](../superpowers/specs/2026-10-21-elice-assessment-layout-design.md). This follow-up does not deploy production or repeat PDF/coding tests, whose preceding results remain recorded above.
