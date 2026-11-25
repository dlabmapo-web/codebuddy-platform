# Cove AI learning assistant: data, API and model

**Status:** built November 25, 2026 on branch `feat/cove-ai-learning-assistant`, not released. This document now describes the code as built; where the build differs from the first proposal, the section says so. Read the [design](2026-11-25-cove-ai-learning-assistant-design.md) first.

## 1. Python errors on submitted cases

### 1.1 Why

`ExecutionResult.stderr` exists, but [grading](../../../packages/api/src/judge/grading.service.ts) saves only `stdout` of a public case. The exception is lost after Submit.

### 1.2 New columns on `submission_cases`

| Column | Type | Meaning |
| --- | --- | --- |
| `python_error_type` | text, null | `NameError`, at most 100 characters |
| `python_error_message` | text, null | Python's one-line message, at most 500 characters |
| `python_error_line` | integer, null | Line in the student's `main.py`, when known |

They are set only when the case is a **public sample**, the exercise is Python and the outcome is `RUNTIME_ERROR`. A hidden case always stores nulls, because a student could write hidden input into an exception message.

### 1.3 `parsePythonError(stderr)`

A pure function in `packages/shared/src/content/python-error.ts`, returning `{ type, message, line }` or `null`.

| Runner | What stderr contains | Line |
| --- | --- | --- |
| Native CPython | A full traceback with `File "main.py", line N` frames | Known |
| Pyodide (`judge-worker`) | One line, `NameError: name 'Hello' is not defined` | Not known, so `null` |

1. Take the text after the last `Traceback (most recent call last):`, or all of it if there is none.
2. `line` is the last `File "main.py", line N` in that text. Frames from other files are ignored, so an error inside `json` still points at the student's line.
3. After the last `  File ` frame, the first line that does not start with a space is the error. Split it at the first `: ` into type and message.
4. Keep only the last part of a dotted type: `json.decoder.JSONDecodeError` becomes `JSONDecodeError`.
5. Return `null` if the type is not a Python identifier. `sys.exit(1)` prints nothing, so it returns `null`.

A student can print anything to stderr, so the result is untrusted text: cap it, render it as plain text, and never treat it as an instruction. `offset` is not stored, so the coach shows no caret after Submit.

### 1.4 Reading it

Add to `submissionCaseSchema` ([submission.ts](../../../packages/shared/src/content/submission.ts)):

- `pythonError: { type, message, line } | null`, for public cases only;
- `comparator`, for public cases only, so rules can check it.

Both [student results](../../../packages/api/src/learn/submission.service.ts) (`toResult`) and [teacher review](../../../packages/api/src/teach/teacher-progress.service.ts) already load the rows they need, so this adds no statement. Old rows return `null`.

## 2. Rules without AI

`explainOutput(result)` is a pure function in `packages/shared/src/content/output-rules.ts`. The browser calls it to show help. It returns a rule key and the case position, or `null`.

**Preconditions.** The submission is `FAILED`. Use the first public case, by position, with outcome `WRONG_OUTPUT` and comparator `STDOUT`. If there is none, return `null`. If the actual output is 10,000 characters, it may be cut, so return `null`.

Normalize both outputs exactly as the grader's `normalizeOutput` does: `\r\n` and `\r` become `\n`, and trailing whitespace is removed. `E` is expected and `A` is actual. Rules apply in this order, and the first match wins:

| Key | Condition |
| --- | --- |
| `no_output` | `A` is empty and `E` is not |
| `letter_case` | `E` and `A` are equal in lower case |
| `spacing` | Same number of lines, and every line is equal after removing spaces and tabs |
| `line_breaks` | Equal after splitting on all whitespace |
| `number_format` | Both are one plain decimal number and have the same value, such as `4` and `4.0` |
| `punctuation` | Neither contains a digit, and they are equal after removing `. , ! ? ; :` |
| `missing_lines` | `A` has fewer lines and they are the first lines of `E` |
| `extra_lines` | `A` has more lines and starts with all lines of `E` |
| `extra_text` | `E` appears in `A`. Before it is the start, whitespace or `:`. After it is the end or whitespace |

The `extra_text` edges matter: `17`, `-7` and `3.7` must **not** match an expected `7`.

Copy lives in a new `learning-help` i18n namespace, in `ko` and `en`, as two strings per rule: what happened, and a question. Example for `letter_case`:

- en: "Your output has the right letters, but a capital or small letter is different." / "Which letter is different from the example?"
- ko: "글자는 맞지만 대문자와 소문자가 달라요." / "예시와 어떤 글자가 다른가요?"

## 3. AI replies, switches and settings

### 3.1 Table `ai_help_replies`

| Column | Notes |
| --- | --- |
| `id` | uuid, primary key |
| `request_id` | uuid from the browser. Unique with `user_id` |
| `user_id` | Cascade on delete |
| `academy_id` | Cascade on delete |
| `class_id` | Nullable, set null on delete |
| `submission_id` | Cascade on delete |
| `material_id` | The `source_material_id` of the submission. No foreign key |
| `grading_revision` | Integer |
| `level` | 1, 2 or 3 |
| `locale` | `ko` or `en` |
| `status` | `PENDING`, `DONE` or `FAILED` |
| `reply` | Text, set when `DONE`, at most 600 characters |
| `failure_code` | Set when `FAILED`: `TIMEOUT`, `PROVIDER`, `REJECTED`, `BUSY` |
| `library_item_id` | The library item the model used, or null. Set null on delete |
| `model`, `prompt_version` | Text |
| `input_tokens`, `output_tokens`, `cost_micros`, `latency_ms` | Integers, nullable. `cost_micros` is millionths of a dollar |
| `reported_at` | Set when the student reports the reply |
| `created_at`, `completed_at` | Timestamps |

Indexes: unique `(user_id, request_id)`; `(user_id, created_at)`; `(user_id, material_id, created_at)`; `(submission_id)`; and `(reported_at)` where not null.

Prompts and student code are **not** stored here. They can be rebuilt from the submission.

### 3.2 Table `ai_usage_months`

Primary key `(month, kind)`: `month` is the first day in Seoul time, and `kind` is `HELP` or `LIBRARY`. Then `requests`, `input_tokens`, `output_tokens`, `cost_micros`. It is increased in the same statement that finishes a paid call. Each monthly limit is therefore one row to read.

### 3.3 Gate

- Add `AI_ASSISTANT` to the `AcademyFeature` enum and to [academy-features.ts](../../../packages/shared/src/memberships/academy-features.ts), **inside `academyRolloutFeatures`**, so new academies start with it off.
- Add `academyOperatorFeatures`, containing `AI_ASSISTANT`. The manager's `setEnabled` refuses these features and the manager's settings page hides them. The platform admin page can switch them.
- Change [backfill-academy-features.ts](../../../packages/api/prisma/seed/backfill-academy-features.ts) to skip `academyRolloutFeatures`. Today it would switch AI on everywhere.
- The exercise checkbox alone must never enable AI: in the migrated curriculum it was already on for 342 of 497 exercises.
- **Rollback.** An API older than this feature cannot read the `AI_ASSISTANT` value, and one such row breaks that academy's feature reads. [rollback.sh](../../../deploy/scripts/rollback.sh) runs [clear-ai-gates.sh](../../../deploy/scripts/clear-ai-gates.sh) before stopping anything: when the target image does not know the value, it deletes only those switch rows and says so. Replies, libraries and usage stay. Tested by `deploy/scripts/ai-gates.test.py` in CI.

### 3.4 Settings

All are optional. With `AI_ASSISTANT_ENABLED` false or no key, the API starts normally and AI help is off.

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Server only. Already in `packages/api/.env.local` for development |
| `AI_ASSISTANT_ENABLED` | `false` | Master switch |
| `AI_ASSISTANT_MODEL` | `gpt-6-luna` | Model name |
| `AI_ASSISTANT_EFFORT` | `none` | Reasoning effort |
| `AI_ASSISTANT_TIMEOUT_MS` | `8000` | Then show the fallback |
| `AI_ASSISTANT_MAX_OUTPUT_TOKENS` | `400` | Reply size limit |
| `AI_ASSISTANT_CONCURRENCY` | `8` | Calls at once per API process |
| `AI_ASSISTANT_PROBLEM_LIMIT` | `3` | Per student, problem and day |
| `AI_ASSISTANT_DAILY_LIMIT` | `10` | Per student and day |
| `AI_ASSISTANT_MONTHLY_BUDGET_USD` | `5` | Student help, across all academies |
| `AI_ASSISTANT_INPUT_USD_PER_MTOK` | `0.10` | For cost records |
| `AI_ASSISTANT_OUTPUT_USD_PER_MTOK` | `0.50` | For cost records |
| `AI_LIBRARY_ENABLED` | `false` | Writing libraries. Saved hints still show when it is off |
| `AI_LIBRARY_MODEL` | `gpt-6-luna` | Model that writes and reviews |
| `AI_LIBRARY_EFFORT` | `low` | Reasoning effort |
| `AI_LIBRARY_MONTHLY_BUDGET_USD` | `10` | Writing libraries, across all academies |
| `AI_LIBRARY_INPUT_USD_PER_MTOK`, `AI_LIBRARY_OUTPUT_USD_PER_MTOK` | `0.10`, `0.50` | For cost records |
| `AI_LIBRARY_HOURS` | `22-7` | Seoul hours when libraries are written and tested |
| `AI_LIBRARY_QUIET_MINUTES` | `10` | How long a problem must be left alone before its library is written |
| `AI_LIBRARY_SEND_SOLUTIONS` | `true` | Include the teacher's solution when writing a library. Decided November 25, 2026 |
| `AI_HELP_RETENTION_DAYS` | `180` | How long students' AI replies are kept |

In production the key and switches go in `secrets/api.env`, which the API container already reads. Never put the key in `packages/web`, in a `NEXT_PUBLIC_` variable, in Git or in a log.

## 4. API

Add three student procedures to the [learn contract](../../../packages/shared/src/api/orpc/learn.contract.ts), all behind `access.studentAuthenticated`.

### 4.1 Workspace payload

`learnExerciseSchema` gains `aiAssistant: boolean` (default false). It is true when the server setting, academy feature and exercise checkbox are on, the policy is `AUTOMATIC`, the language is Python and there is no quiz. It is false in staff preview and exams.

Compute it inside the existing workspace statement of [submission-admission-read.ts](../../../packages/api/src/learn/submission-admission-read.ts) with an `EXISTS` on `academy_feature_flags`. The exercise row already carries `ai_feedback_enabled`. **Added statements: 0.**

**Hint bank (Analyze design).** AI hints are no longer shown to students or to a teacher watching live: `learnHintSchema` has no AI field, and the statement lists only hints a teacher wrote. The library's hints are read only by the analysis, as the teacher's path (section 5). The workspace statement keeps only the academy's switch, so opening a problem still costs no extra statement.

### 4.2 `getAiHelp({ academyId, submissionId })`

Called only when the student opens help and `aiAssistant` is true. Returns:

```ts
{
  state: "AVAILABLE" | "LIMIT_PROBLEM" | "LIMIT_DAY" | "EXAM_OPEN" | "STALE" | "OFF";
  remainingForProblem: number;
  remainingToday: number;
  replies: { id: string; level: 1 | 2 | 3; text: string; createdAt: string; reported: boolean }[];
}
```

`replies` are this submission's answers: its analysis (`level` 1) and its simpler explanation (`level` 2), each with `analysis` sections. The browser does not call this on its own; it is for tests and other surfaces. `OFF` covers every reason not listed here, including the monthly limit, and does not say which.

- `STALE`: the submission's `gradingRevision` differs from the exercise's. A text-only edit does not change that number, so the model then sees the newer text. That is acceptable for help.
- `EXAM_OPEN`: the student has a `TestAttempt` with no `endedAt` whose deadline is empty or in the future, in any class.

### 4.3 `requestAiHelp({ academyId, submissionId, locale, requestId, mode })`

**As built for the Analyze design:** `mode` is `analyze` (default) or `simpler`. A submission has at most one answer of each; asking again returns the saved one, free, even at a limit. `simpler` without an analysis is an analysis. The reply carries `analysis: { result, line, why, think, tryIt, alsoCheck }` and `text`, the sections joined, which is what the teacher and the library's growth read. The reservation also refuses a second answer of the same level for the same submission while one is being written; that click is shown the first one's answer.

Returns `{ reply: {...} | null, fallback: FallbackKey | null, state, remainingForProblem, remainingToday }`.

1. **Authorize** with `submissions.own.create`, as submit does.
2. **Load everything in one statement:** the owned and reachable submission, its public cases and grading cases, the exercise text, teacher solutions and the library's correct programs (for the leak check only), up to 10 active `FEEDBACK` items, feature flag, month usage, whether the student has an open exam attempt, and today's replies for this problem.
   Use the same ownership and reachability rules as `ownedSubmissionWhere`. Another student's submission and a missing one give the same `SUBMISSION_NOT_FOUND`.
3. **Check eligibility again**, including the section 4.2 states. Never trust the browser's `aiAssistant`.
4. **Reserve** in a short transaction: take `pg_advisory_xact_lock` for the user, return the existing row if `requestId` was used for this submission (reject it for a different one), then insert `PENDING` only if both limits allow it. `DONE` rows and `PENDING` rows younger than 60 seconds count. `level` is today's count for this problem plus one.
5. **Call the model outside any transaction.**
6. **Validate** the reply (section 6).
7. **Finish** in one statement: mark the row `DONE` or `FAILED`, and add tokens and cost to the month. Tokens are added even when a reply is rejected, because they were paid for.

`FAILED` rows do not count toward limits. To stop a failing model from being called forever, at most 20 requests per student per 10 minutes are accepted, with the same Redis token bucket as submissions under its own key.

A repeated `requestId` returns the stored reply. If it is still `PENDING`, return `state: "AVAILABLE"` with `fallback: "busy"`.

**Statement budget:** at most 4 for `getAiHelp` and 8 for `requestAiHelp`, including authorization, and neither may grow with the number of submissions or replies. **Measured** (`ai-help.integration.spec.ts`): `getAiHelp` 3, `requestAiHelp` 8 including `BEGIN` and `COMMIT`, the same with 1 and with 100 earlier submissions and replies. Opening a problem adds 0.

**As built:** past the rate limit, or with too many calls running, the answer is `fallback: "busy"` rather than an error.

### 4.4 `reportAiHelp({ academyId, replyId })`

Sets `reported_at` on the student's own reply, once.

### 4.5 Error codes

**As built, no new code.** The Korean `errors.json` is close to its size limit, so existing codes are reused: `SUBMISSION_NOT_FOUND` for a submission or reply that is not the student's, `CONTENT_EDIT_CONFLICT` for a `requestId` reused with another submission and for a library edit with an old version, and `EXERCISE_NOT_FOUND` for staff library calls. Being rate limited is `fallback: "busy"`. Limits and unavailability are normal states in the response, not errors.

## 5. Model request

### 5.1 Adapter

```ts
interface AiModelClient {
  complete(input: { instructions: string; content: string; schema: object; model: string; effort: string }, signal: AbortSignal):
    Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }>;
}
```

`OpenAiModelClient` calls `POST https://api.openai.com/v1/responses` with `fetch`, `store: false`, the given model and effort, an output limit and a strict JSON schema, and checks the response with Zod. Tests use `FakeModelClient`. No retry: one click is at most one paid call. Log only status, latency, tokens and failure code. Never log the key, prompt, code or reply.

The unused `openai` package in `packages/web` is not needed. Remove it in a separate change.

### 5.2 Content and instructions, version `v4`

Built from the [Analyze design](2026-11-25-cove-ai-analysis-design.md), sections 4 to 6, in [help-prompt.ts](../../../packages/api/src/ai-assistant/help-prompt.ts):

```text
TASK: <problem text>
STUDENT CODE:
<code>
1| n = int(input())
2| ...
</code>
TESTS: passed 3 of 15. Examples: 3 of 3 passed. Hidden tests: 0 of 12 passed.
FAILED EXAMPLES:
- Test 2 (example): input "…"; expected "…"; printed "…": printed a number that is too small.
PASSED EXAMPLE: Test 1 (example): input "…"; expected "…"; printed "…", which is right.
HIDDEN TESTS (their data is secret): 12 failed: 8 printed a number that is too small; 4 stopped with ValueError on line 2.
MATCHED MISTAKE (a program with this mistake fails exactly the same tests):
- F1 counts only small vowels: Capital vowels are not counted. …
LIKELY MISTAKE (…fails most of the same tests): …
OTHER KNOWN MISTAKES FOR THIS PROBLEM (did not match these results; use one only if the code clearly has it): …
TEACHER'S PATH (the intended way, step by step):
1. …
EARLIER EXPLANATION: (simpler only)
```

| Part | Rule |
| --- | --- |
| Problem text | As before: HTML to text, then the formats and constraints, at most 4,000 characters |
| Code | Numbered, so the answer can name a line. Over 8,000 characters, no call and a fallback |
| Examples | Up to 3 failed public tests in full (values at most 600 characters), the rest counted, and the first passed one |
| Hidden tests | A count by kind only. How an output differs (nothing, too few lines, capital letters, too small, …) is worked out by Cove with the output rules, never by the model. An error is its built-in type and its line in the student's code; a hidden test stores no message, and a type a program invented is not kept |
| Mistakes | Up to 5 active feedback items of the current revision, matched ones first. A match compares fingerprints on the server: `exact` when every test agrees, `likely` when at least 75% of failed tests are shared. Fingerprints and wrong programs are never sent |
| Teacher's path | Hints the teacher wrote, otherwise the library's active hints of the current revision |

The answer is strict JSON: `{ item, result, line, why, think, tryIt, alsoCheck }`. The instructions (English and Korean) ask for the cause of most failures first, words only, a quote of the student's own code allowed in backticks, nothing about hidden tests beyond the summary, the student's own valid method respected, and about 120 words. `simpler` adds that the student did not understand the earlier explanation.

`v4` replaced `v1` to `v3`; the 20-mistake evaluation measured `v1` and must be run again for `v4` (QA section 2).

## 6. Checking a reply

Reject the reply, store `REJECTED` and show a fallback when any of these is true:

| Check | Reject when |
| --- | --- |
| Shape | Not valid JSON, or an empty section. An item id that was not sent links the answer to no mistake |
| Every refusal | Stored as `REJECTED:<check>` (`SHAPE`, `SIZE`, `NEW_CODE`, `CODE`, `LANGUAGE`, `SOLUTION`, `LINK`, `HIDDEN`), so the operator page and the evaluation see which check fired |
| Size | A section over 500 characters, or all of them over 2,000 |
| New code | A piece of code, quoted or not, that is not in what the student sees ([text-check.ts](../../../packages/api/src/ai-assistant/text-check.ts) `newCode`). Not code: a value given to a name the program reads from input or does not use ("For N = 5"), and "in" before the student's own quoted text. Code even with empty brackets: a method call such as `s.lower()` |
| Hidden data | A hidden test's input or expected output, word for word, of at least 3 characters the student cannot already see |
| Language | `ko` without Hangul, or `en` with Hangul that is not in the problem, code or test |
| Code block | Contains three backticks, or two or more lines that look like Python statements |
| Solution leak | Contains a line from a teacher solution or a library correct program that has at least 8 characters after removing spaces, and is not already in the student's code or the problem |
| Links | Contains a URL |

The solution check runs in memory on the server. Solutions are never sent to the model. These checks cannot catch an answer given in words, so the evaluation and reports cover that.

Render replies as plain text.

## 7. Fallbacks

Fixed, translated messages. They do not count toward the limits.

| Key | When | English text |
| --- | --- | --- |
| `trace_public` | A public case failed | "Follow your code by hand with this test. What should it print?" |
| `try_small` | Only hidden tests failed | "Try a small input you can work out by hand. What should your program print?" |
| `time_limit` | Time limit | "Your program ran too long. Which value should change so the loop can stop?" |
| `busy` | Too many calls, or still pending | "Help is busy. Please try again in a moment." |

## 8. Keeping and deleting data

- Replies are deleted with their student, academy or submission through foreign keys. Deleting a class detaches code submissions today, and replies follow them with `class_id` set to null.
- A cleanup every 6 hours (`ai-maintenance.service.ts`) removes, in batches of 2,000: replies older than `AI_HELP_RETENTION_DAYS` (180 days until confirmed), finished library checks older than 7 days, and rejected items older than 30 days that no reply of the last 30 days names. `ai_usage_months` has no personal data and stays.
- Library rows contain no student data. They are deleted with their exercise, or their academy.
- Add every new table with Row Level Security on and no grants to Supabase's public roles, following the existing server-only migrations.

## 9. Counting common mistakes

No new table is needed:

- `python_error_type` counts Python errors in SQL;
- `explainOutput` counts rule matches over stored public cases;
- `library_item_id` counts which library mistakes were seen, and null counts the unmatched ones.

That gives staff "18 of 30 students used the wrong letter case". Read one problem at a time, bounded to the last 30 days.

## 10. AI library

### 10.1 Which exercises get one

`aiFeedbackEnabled` is on, the academy's `AI_ASSISTANT` is on, and it is an `AUTOMATIC`, non-quiz Python exercise in an ordinary lecture with at least one public case.

### 10.2 Tables

**`ai_libraries`**, one row per exercise (`material_id` is the primary key, cascade):

| Column | Notes |
| --- | --- |
| `content_digest` | Hash of the statement text, formats, constraints, language, all test cases and solutions |
| `grading_revision` | The exercise revision it was written for |
| `state` | `WAITING`, `WRITING`, `CHECKING`, `REVIEWING`, `READY`, `FAILED` |
| `attempts`, `next_attempt_at`, `lease_id`, `lease_until`, `last_error_code` | Job control, as `LibrarySyncJob` does |
| `correct_programs` | JSON. Staff only, never sent to a student |
| `model`, `prompt_version`, `ready_at`, `updated_at` | |
| `compared_at` | The exercise's `updated_at` when it was last compared, so an unchanged exercise is not hashed again |
| `grown_at` | Last growth attempt (10.9) |

**`ai_library_items`:**

| Column | Notes |
| --- | --- |
| `id`, `material_id` | Cascade with the exercise |
| `kind`, `position` | `HINT` 1–5, or `FEEDBACK` 1–10 |
| `label` | Short name of the mistake, for staff and the model |
| `text_ko`, `text_en` | At most 400 characters each |
| `wrong_program` | `FEEDBACK` only. Staff only, never sent to a student |
| `public_outputs` | What the wrong program printed on each public case, at most 1,000 characters each |
| `origin` | `AI`, `COPY`, `GROWN` or `STAFF` |
| `state`, `reject_reason` | `CHECKING`, `ACTIVE`, `HIDDEN`, `REJECTED` |
| `version`, `updated_by`, `created_at`, `updated_at` | Edits check the expected version |

Index `(material_id, state)`.

**`ai_library_reports`:** `(item_id, user_id)` unique, `created_at`. Two different students hide an item.

**`ai_library_checks`:** one row per program run: `material_id`, `item_id` (nullable), `role` (`SOLUTION`, `CORRECT` or `WRONG`), `code`, the frozen grading `snapshot`, `status` and `result`. The result keeps the verdict and public outputs only. Rows are removed 7 days after they finish.

### 10.3 Finding work

A job in the API process runs every minute. Writing happens only in `AI_LIBRARY_HOURS`; checking and reviewing finish whenever they are due. Model calls are made one at a time, and **at most 5 libraries wait in the grader at once**, so the grader's background lane stays short. One batched statement finds eligible exercises whose library is missing or whose digest differs, and whose last edit is at least `AI_LIBRARY_QUIET_MINUTES` old. Courses are edited through several writers (editor, workbook import, library sync, course copy). Finding work this way covers all of them without a hook in each.

Claim with a lease and a fencing id, as [sync-job.service.ts](../../../packages/api/src/library-sync/sync-job.service.ts) does. Retry a failure at most 3 times with growing delays. Stop when the monthly limit is reached.

**Copy first.** If another exercise with the same digest has a `READY` library, copy its active `AI` items and correct programs as `COPY`, with no model call. Never copy `STAFF` or `GROWN` items to another academy.

### 10.4 Writing

One call returns strict JSON:

```ts
{
  hints: { ko: string; en: string }[];                                          // 5
  mistakes: { label: string; wrongProgram: string; ko: string; en: string }[];  // 7
  correctPrograms: { approach: string; code: string }[];                        // 3
}
```

The request has the problem text (section 5.2), the public tests, and the teacher's solution while `AI_LIBRARY_SEND_SOLUTIONS` is on. Hidden tests and student data are never included. Ask for hints from general to specific, mistakes that beginners really make, and correct programs that use different methods.

### 10.5 Testing with the grader

Run every program with the exercise's real tests and settings, through the same evaluator as Submit. [practice.runner.ts](../../../packages/api/src/judge/practice.runner.ts) shows how: `GradingService.execute` with a `GradeSink` that writes no student data. Use the background lane, so that the slot reserved for official grading stays free. A check creates no submission, attempt, points or progress.

| Program | Keep it when |
| --- | --- |
| Teacher solution, if any | `PASSED`. If not, stop with `SOLUTION_FAILS` and tell staff |
| AI correct program | `PASSED`. Drop it otherwise |
| AI wrong program | `FAILED`. Drop its item if it passes or the judge fails |
| Two wrong programs with the same code after removing spaces | Keep the first |

Without a teacher solution, at least 2 AI correct programs must pass.

### 10.6 Checking the text

1. Section 6's checks on both languages, with a 400-character limit. Compare with teacher solutions and correct programs on the server.
   Also reject any **code-like** text, because a library item never needs code: a call with arguments, `==`, `!=`, `//`, `%` or `*` between values, an index or slice, an assignment, or `in "..."`. In the test the line comparison alone caught 1 of 10 planted code hints. This check caught all 10 in both languages, with no false alarm in 232 good texts.
2. A second model call, with its own instructions, sees each wrong program, its public result and the feedback, and answers `ok` or a reason for: is it true, is it one small step, and does it avoid the answer? It also reviews the hints. Drop anything not `ok`. In the test it caught every hint that gave the answer in words (10 of 10) and 19 of 20 false explanations, and wrongly rejected none of 20 good hints.

### 10.7 Ready

`READY` needs at least 3 active hints, 2 active feedback items and 1 passing correct program. Keep the first 5 feedback items. Otherwise the state is `FAILED`, and students see no AI hints for that problem.

Items are used only while `grading_revision` equals the exercise's. After a change, `STAFF` items are kept and tested again, and the rest are replaced in one transaction.

### 10.8 Staff operations

**As built**, in their own `aiAssistant` contract (`ai-assistant.contract.ts`), with the `exercises.manage` permission: `getLibrary`, `updateLibraryItem` (edit, hide or restore, with `expectedVersion`) and `regenerateLibrary`. An edit sets `origin` to `STAFF` and writes the audit entry `ai.library_item.updated`; writing again writes `ai.library.regenerated`. Students get `learn.reportAiHint({ academyId, itemId })`. The editor shows this in an **AI library** panel under the hints, read only when opened.

Operators get `aiAssistant.platformUsage()` with `platform.analytics.read`: switches, cost by month, libraries by state, the last 7 days' replies, fallbacks, rejections, reports and p95 time, and academies with AI on. Counts only, never a student's code or words. It is shown at `/admin/ai`.

Teachers read a student's replies on the submission review page, as `aiReplies` on `getSubmissionReview` (one added statement, run beside the statement read, only on that page).

### 10.9 Growing

Weekly, for a `READY` problem with fewer than 10 feedback items: if at least 5 replies from at least 3 students in 30 days had no `library_item_id`, send the problem and those **AI reply texts**, never student code. Ask for one new mistake with a wrong program. It must pass 10.5 and 10.6, and then joins as `GROWN`, in that academy only.
