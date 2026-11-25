# Cove AI learning assistant: implementation plan

**Status:** stages 1 to 8 and 10 built on November 25, 2026 (branch `feat/cove-ai-learning-assistant`, not committed or released). Stage 9 needs people: a Korean-speaking teacher, consent and the release. See "Build status" below.

**Analyze design, built November 25, 2026:** the [Analyze design](../specs/2026-11-25-cove-ai-analysis-design.md) replaced stages 5 and 7 for students: one **Analyze my code** button, words only, explaining every test result, with the hint bank and library read only by the AI. See "Analyze design build" below.

[Design](../specs/2026-11-25-cove-ai-learning-assistant-design.md) · [Data, API and model](../specs/2026-11-25-cove-ai-learning-assistant-data.md) · [Checks and pilot](../../qa/2026-11-25-cove-ai-learning-assistant.md)

Section numbers (§) refer to the data document. Each stage can be released by itself and ends green.

| Stage | Result | Uses AI? |
| --- | --- | --- |
| 1 | The error coach after Submit | No |
| 2 | Explain my result, with rules | No |
| 3 | Switches, tables and the model adapter. Nothing visible | No calls |
| 4 | AI writes and tests libraries. Staff only | Yes, no student data |
| 5 | Students can read the AI hint bank | No call when they read |
| 6 | Personalized feedback API, tested with a fake model | Fake |
| 7 | Personalized feedback in the result panel, off by default | Yes |
| 8 | Reports, common mistakes and cost | – |
| 9 | Evaluation, pilot and release | Yes |
| 10 | The library grows, after the pilot | Yes, no student code |

## Build status

| Stage | State on November 25, 2026 | Proof |
| --- | --- | --- |
| 1 | Built | Grading and parser specs; the localhost browser test sees the coach after Submit |
| 2 | Built | Rule specs; `learner-help.spec.tsx`; the browser test |
| 3 | Built | Feature, migrations, settings, adapter and checker specs |
| 4 | Built, including the editor panel | `library-job.integration.spec.ts` (24 cases); the browser test with Cove's real Python grader |
| 5 | Built | `ai-staff.integration.spec.ts`; `hints-dialog.spec.tsx`; the browser test |
| 6 | Built | `ai-help.integration.spec.ts` (40 cases). `getAiHelp` 3 statements, `requestAiHelp` 8, the same at 1 and 100 earlier submissions. Opening a problem: +0 |
| 7 | Built | `learner-help.spec.tsx`, `result-panel.spec.tsx`; the browser test; one run with the real model on invented content (QA §7) |
| 8 | Built: teacher replies on the submission review (+1 statement there), common mistakes in the editor panel, `/admin/ai` for operators, cleanup every 6 hours | Specs above; the browser test |
| 9 | **Not done: needs people** | QA §5 and §6 |
| 10 | Built, runs only with `AI_LIBRARY_ENABLED` | `library-job.integration.spec.ts` |

Run it on localhost with `bash packages/api/scripts/test-ai-assistant.sh` (Docker; no shared database; a local stand-in for the model). Add `--real-model` to send the same invented problem to OpenAI with the key in `packages/api/.env.local`.

What differs from the first plan, all recorded in the data document: no new error codes (the Korean `errors.json` is near its size limit), staff library calls live in their own `aiAssistant` contract, an AI hint carries `ai: { itemId, ko, en }`, at most 5 libraries wait in the grader at once, and two more settings (`AI_LIBRARY_QUIET_MINUTES`, `AI_HELP_RETENTION_DAYS`).

## Analyze design build

| Part | Where | Proof |
| --- | --- | --- |
| Hidden error type and line kept for the analysis only; staff practice shows hidden errors no more | `python-error-fields.ts`, `practice.runner.ts` | `python-error-fields.spec.ts` |
| Fingerprint of every library check, carried to items and copies | `fingerprint.ts`, `library-check.runner.ts`, `library-job.service.ts` | `fingerprint.spec.ts`, `library-job.integration.spec.ts` (`FPFP` …) |
| Every test as a summary, matched mistakes, teacher's path, prompt `v4` | `help-prompt.ts`, `ai-help-read.ts`, `ai-help.service.ts` | `help-prompt.spec.ts` (20), `ai-help.integration.spec.ts` (44) |
| `analyze` and `simpler`, one saved answer each per submission | `ai-help.service.ts`, `ai-help-read.ts` | the same |
| New answer checks: new code, hidden data, a line that does not exist | `text-check.ts` | `text-check.spec.ts` |
| Analyze card with sections and the line, rules shown at once, no AI hints for students | `learner-help.tsx`, `use-ai-help.ts`, `result-panel.tsx`, `learn.service.ts`, `monitoring.service.ts` | `learner-help.spec.tsx`, `result-panel.spec.tsx`, `ai-staff.integration.spec.ts` |
| Teacher review shows the sections; library panel renamed "What the AI teacher knows" | `submission-review.tsx`, `ai-library-panel.tsx` | the browser test |

Statements: opening a problem +0, `getAiHelp` 3, `requestAiHelp` 8, the same at 1 and 100 earlier submissions. The migration `20261125120000_ai_assistant` was changed in place (not released anywhere): `reply` is 2,000 characters, and `analysis` and `fingerprint` columns were added.

Already failing before this work and unchanged by it: `programming-review.integration.spec.ts` expects 14 statements for the learner bootstrap and the last commit measures 13.

Stages 1 and 2 help every student, cost nothing and need no consent. Release them first. Stages 4 and 5 use no student data, so they can come before consent for stage 7.

## Stage 0: Rules for every stage

- Read [AGENTS.md](../../../AGENTS.md) and the installed Next.js guide before editing `packages/web`.
- After each stage, run:

  ```sh
  pnpm --filter @cove/shared build && pnpm --filter @cove/shared test
  pnpm --filter @cove/i18n test
  pnpm --filter @cove/api typecheck && pnpm --filter @cove/api test <touched specs>
  pnpm --filter @cove/web typecheck
  NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x pnpm --filter @cove/web test <touched specs>
  ```

- Integration specs use a disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`, never Supabase.
- State SQL statement counts in the commit message when a read path changes.
- Never call OpenAI from automated tests. Use `FakeModelClient`.
- Never print, log or commit the API key. Never send real student work before stage 9's conditions are met.
- Do not run `next build` while the web dev server runs. Stop servers on port 4000 at the end.

## Stage 1: Error coach after Submit

**Goal:** a student who submits `print(Hello)` sees the same explanation as after Run.

| Change | Where |
| --- | --- |
| `parsePythonError` (§1.3) and unit tests | `packages/shared/src/content/python-error.ts` and its spec |
| Three nullable columns (§1.2) | [schema.prisma](../../../packages/api/prisma/schema.prisma), model `SubmissionCase`, and a migration |
| Fill them for public Python runtime errors | [grading.service.ts](../../../packages/api/src/judge/grading.service.ts): `CaseRow`, both grading paths and `skipped` |
| Check the staff practice sink, which reuses `CaseRow` | `packages/api/src/judge/practice.runner.ts` and the staff practice mapper |
| Return `pythonError` and `comparator` for public cases (§1.4) | `packages/shared/src/content/submission.ts`, `submission.service.ts`, `teacher-progress.service.ts` |
| Show `ErrorCoachPanel` under the verdict | [result-panel.tsx](../../../packages/web/src/app/%28studio%29/academy/%5BacademySlug%5D/learn/exercises/%5BmaterialId%5D/_components/result-panel.tsx) |
| Pass the submitted code and `onFocusLine` | [editor-pane.tsx](../../../packages/web/src/app/%28studio%29/academy/%5BacademySlug%5D/learn/exercises/%5BmaterialId%5D/_components/editor-pane.tsx) |

**Details**

- Show one coach, for the first public case with a Python error.
- The coach quotes the student's line, so give it the **submitted** code. If the editor has changed since, or the code is unknown after a reload, pass an empty string and no `onFocusLine`: the coach then shows the explanation without quoting a line.
- Keep the coach on Run and Test exactly as it is.
- `ResultPanel` is shared with staff practice. The coach is fine there. Later stages' student-only help is not, so add an explicit `learner` prop now.
- Optional: make `formatPythonError` in `pyodide-runner.ts` report the line. Without it, Pyodide results simply have no line.

**Tests:** the parser on a native traceback, the one-line Pyodide form, a chained exception, an error inside a library, a multi-line message, `sys.exit(1)` and stderr noise. Grading saves the error for a public case and **null for a hidden case**. Old rows read as null. An exam attempt shows no error before results are released.

**Done when:** submitting `print(Hello)`, `print("Hello"` and an unindented `if` shows the right lesson in both languages, and submit, grading and result reads have the same statement counts as before.

## Stage 2: Explain my result, with rules

**Goal:** common output mistakes get an instant explanation without any request.

| Change | Where |
| --- | --- |
| `explainOutput` (§2) and tests | `packages/shared/src/content/output-rules.ts` |
| `learning-help` namespace, `ko` and `en` | `packages/i18n/src/locales/*/learning-help.json` |
| `LearnerHelp` component | new file beside `result-panel.tsx` |
| Render it only when `learner` and the final result failed | `result-panel.tsx` |

**Details**

- Show **Explain my result** only when a rule matches, or (from stage 7) AI is available. Hide it when there is nothing to say.
- Reveal text in place, inside a live region mounted before it opens. Move focus to the explanation.
- Do not add text to the problem statement. Its height must be the same for student and teacher, because the shared pointer is measured against it.
- Show **Ask your teacher**, reusing [request-help.tsx](../../../packages/web/src/components/monitoring/request-help.tsx). The workspace already mounts it in the header, so share its state rather than mounting a second independent one.

**Tests:** every rule, the order, the near-misses (`17`, `-7`, `3.7` against `7`; `35` against `3.5`), regex comparators, hidden-only failures, truncated output and passing results. Both locales have every key. Keyboard and screen-reader behavior.

**Done when:** test mistakes 1, 4, 12 and 20 are explained, the other 16 show no rule, and no network request is made.

## Stage 3: Switches, tables and adapter

**Goal:** everything AI needs exists and is off.

| Change | Where |
| --- | --- |
| `AI_ASSISTANT` feature, rollout and operator-only (§3.3) | `schema.prisma`, `academy-features.ts`, `academy-features.service.ts`, `platform-settings.service.ts`, both settings pages and labels |
| Backfill script skips rollout features | `packages/api/prisma/seed/backfill-academy-features.ts` |
| All new tables (§3.1, §3.2, §10.2) | `schema.prisma` and a migration with Row Level Security |
| Settings (§3.4) | `packages/api/src/config/env.schema.ts` and `.env.example` (names only) |
| `AiModelClient`, OpenAI and fake implementations (§5.1) | `packages/api/src/ai-assistant/` |
| `statementText` (§5.2) | `packages/shared` |
| Prompt builders and text checker as pure functions (§5, §6) | `packages/api/src/ai-assistant/` |

**Tests:** new academies and the backfill leave AI off. A manager cannot switch it on, and an operator can. The API starts with no key. The adapter handles success, timeout, 401, 429, 500, malformed JSON and an incomplete response. Planted markers in hidden cases, solutions and names never appear in a student-help prompt. Every reject rule has a passing and a failing example.

**Done when:** with every switch off, nothing visible changes and no request can reach OpenAI.

## Stage 4: AI writes and tests libraries

**Goal:** an eligible problem gets 5 hints and about 5 tested feedback items with no teacher work.

| Change | Where |
| --- | --- |
| Find, claim, copy, write and finish (§10.3, §10.4, §10.7) | `packages/api/src/ai-assistant/library/` |
| `LibraryCheckRunner` and its job in the background lane (§10.5) | `packages/api/src/judge/`, modelled on `practice.runner.ts`, and both judge workers |
| Text checks and second review (§10.6) | `packages/api/src/ai-assistant/library/` |
| Staff operations (§10.8) and a library panel in the exercise editor | academy course contract, `course.service.ts` permissions, exercise editor page |

**Details**

- First decide how a check reaches the judge: a new job name on the staff-practice queue, or a new queue kind. Native admission only knows `official`, `staff-practice`, `sample`, `regrade` and `run`, so a new kind also changes the eligibility settings. Prefer the existing staff-practice lane.
- Estimate before running: 500 problems × about 8 programs × about 5 tests is 20,000 short runs. Keep one exercise at a time and only in `AI_LIBRARY_HOURS`.
- The editor panel shows state (waiting, writing, ready, failed and why), hints, feedback, wrong programs and correct programs, with edit, hide, restore and write again.

**Tests** (fake model): a wrong program that passes, a correct program that fails, a failing teacher solution, duplicate mistakes, an answer inside a hint, a bad second review, too few items, an edit during writing, a lost lease, a crash at each step, the monthly limit, copying by digest, keeping `STAFF` items, and no submission, attempt, points or progress created. Grading latency with checks running.

**Done when:** 10 synthetic problems become `READY` with the fake model, then 10 invented problems with the real model pass the [library evaluation](../../qa/2026-11-25-cove-ai-learning-assistant.md#24-library-evaluation).

## Stage 5: Hint bank for students

**Goal:** a problem without authored hints offers the five AI hints.

| Change | Where |
| --- | --- |
| `source` and both languages on hints (§4.1) | `packages/shared/src/content/learn.ts` |
| Return AI hints in the workspace statement | `submission-admission-read.ts`, `learn.service.ts` |
| Return the same list to watching teachers | `monitoring.service.ts` |
| AI label and Report | [hints-dialog.tsx](../../../packages/web/src/components/workspace/hints-dialog.tsx) |

**Tests:** authored hints win, AI hints appear only when allowed and current, exams have none, student and teacher lists are identical, the shared pointer stays aligned, two reports hide an item, and both languages work. The workspace statement count is unchanged.

**Done when:** a student can read five AI hints one at a time without any AI call.

## Stage 6: Personalized feedback API

**Goal:** the server can serve, limit and record feedback, proven with the fake model.

| Change | Where |
| --- | --- |
| `getAiHelp`, `requestAiHelp`, `reportAiHelp` (§4) | `learn.contract.ts`, `learn.router.ts`, `packages/api/src/ai-assistant/` |
| `aiAssistant` in the workspace (§4.1) | `submission-admission-read.ts`, `learn.service.ts`, `packages/shared/src/content/learn.ts` |
| One-statement context read, with library items | `packages/api/src/ai-assistant/ai-help-read.ts` |
| Error codes (§4.5) | `codes.ts` and both `errors.json` |

**Tests** (integration, disposable PostgreSQL):

- **Access:** another student, another academy, a hidden course, a quiz, manual review, practice only, staff preview, an exam submission, an open exam, an edited problem and each switch off.
- **Library:** a matching item, no match, no library, an old library, hidden items, an invented item id, and an unusual but valid method.
- **Limits:** the 4th reply on a problem, the 11th in a day, midnight in Seoul, and two simultaneous requests with one left. Exactly one may succeed.
- **Idempotency:** the same `requestId` twice, at the same time, and with another submission.
- **Failure:** timeout, rejected reply, crash after reserving (the row stops counting after 60 seconds) and monthly limit reached.
- **No lock during the call:** no transaction is open while the model runs.
- **Statement counts** with 1 and 100 earlier submissions and replies.

**Done when:** all pass, opening a problem costs the same number of statements as before, and the §4.3 budgets hold.

## Stage 7: Personalized feedback in the result panel

**Goal:** the design's section 6 works for a student in an enabled academy.

- Extend `LearnerHelp`: load `getAiHelp` only after the student opens help, then show today's replies, remaining replies and the button.
- Disable the button while waiting. Show "thinking" text, then the reply or a fallback within 10 seconds. Navigating away is safe.
- Create a new `requestId` per click and reuse it when retrying the same click after a network failure.
- Every reply has the AI label and **Report**. After the third reply, show **Ask your teacher**.
- Keep it inside the existing scrolling result area, so the pane and shared pointers keep their size.
- Replace the old text "For now, this saves whether AI feedback is enabled" (`exercise.field.ai_feedback_hint`) in both languages.

**Tests:** rule first, AI only after that, limits, fallback, offline, double click, slow reply, problem change during a reply, Korean and English, keyboard, screen reader, narrow width and no help in staff practice or exams.

**Done when:** one student completes the whole path with the real model **on fake content**, and turning off any switch removes AI help without a deploy or an error.

## Stage 8: Reports, common mistakes and cost

- **Teacher:** show the AI replies on the student's submission review, through the existing class access rules. At most one added statement, only on that page.
- **Staff:** a common-mistakes view for one problem (§9), last 30 days.
- **Operator:** one page with libraries by state, requests, cost this month for help and library, fallback rate, rejected and reported items, and p95 time. Reports link to the source for authorized staff only.
- **Cleanup:** scheduled removal of replies older than 180 days, if that period is confirmed, and of old library checks.

**Done when:** a teacher sees only their own students' replies, and operators can see cost without reading student code.

## Stage 9: Evaluation, pilot and release

Follow the [checks](../../qa/2026-11-25-cove-ai-learning-assistant.md) in order:

1. Run the model evaluation again with a library, including the parts not tested yet.
2. A Korean-speaking teacher scores the replies, and checks the libraries of the first 20 problems.
3. Meet the conditions for real students.
4. Put the key and switches in the production `secrets/api.env`. Record the key's expiry date and set a reminder to replace it.
5. Release with AI off. Check that stages 1 and 2 work.
6. Switch on one academy. Write libraries for one course (100 problems) first, check cost and quality, then the other four.
7. Switch on personalized feedback, and review after one and two weeks.

**Turning it off:** switch the academy off, or set `AI_ASSISTANT_ENABLED=false` and restart the API. The coach, rules, authored hints and help request continue. No data migration is needed to turn it off.

## Stage 10: Growing the library

Start only after the pilot's decision. Build §10.9, then watch how many new items are drafted, kept, edited and reported.

**Done when:** a repeated unmatched mistake becomes a tested item without student code leaving Cove.

## Later, only if the pilot shows a need

| Idea | Note |
| --- | --- |
| C and C++ | Use the saved compiler messages. Needs its own evaluation |
| Coach for server-run Test | `parsePythonError` makes this small |
| Another model | Change the model setting and run the evaluations |
| Sharing `GROWN` and `STAFF` items between academies | Needs a rule for who approves |
