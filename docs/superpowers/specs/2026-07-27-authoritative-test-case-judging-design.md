# Authoritative Test-Case Judging for MVP Version 1

Date: 2026-07-27  
Status: Ready for user review  
Deployment: Next.js 16 on Netlify, Supabase, managed Judge0

## Objective

Replace the current browser-authoritative output check with a trustworthy
standard-input/standard-output judge for Python problems.

Teachers define sample and hidden input/output cases. When a student submits
code, the platform must run that code once per case in an isolated environment,
calculate the result on the server, save the authoritative submission, and
return feedback without exposing hidden answers.

The feature should follow the useful parts of Elice's programming-practice
workflow while staying intentionally smaller for MVP Version 1.

## Current-State Findings

The project already has:

- A `test_cases` table with input, expected output, sample/hidden flags, and
  ordering.
- An admin problem form for creating multiple test cases.
- A browser-based Pyodide runner.
- Submission history, progress reporting, and AI feedback.

The current submission path is not a real test-case judge:

- The student browser can request all judge cases, including hidden expected
  outputs.
- Student code is executed only once.
- Test-case input is not supplied to the submitted program.
- The single output is accepted if it matches any registered expected output.
- The browser calculates and posts its own status and score.
- The configured problem time and memory limits are not authoritatively
  enforced.

This design removes those trust and correctness problems.

## Product Rules

### Run

`Run` remains a local, interactive learning tool powered by the existing
browser Pyodide worker.

- It may accept terminal input from the student.
- It displays stdout, stderr, and Python errors immediately.
- It does not load hidden cases.
- It does not create an official submission or update progress.
- Its result is never used as an official grade.

### Submit

`Submit` is authoritative and non-interactive.

- The browser sends only the problem ID, Python code, and elapsed solving time.
- The server loads the current problem and its test cases.
- Judge0 executes the code separately for every test case.
- Each execution receives exactly one case's `input` as standard input.
- Judge0 applies the problem's time and memory limits.
- Each execution is evaluated only against its corresponding expected output.
- The server derives the final status and score.
- Only the server writes grading fields to Supabase.

### Test-case visibility

A sample case is public and a hidden case is private.

- Sample: `is_sample = true`, `is_hidden = false`
- Hidden: `is_sample = false`, `is_hidden = true`

Problem creation and update validation must reject any other flag
combination. Existing inconsistent rows must be corrected by the migration.

Students may receive sample input and expected output through the existing
problem-detail endpoint. Hidden input, expected output, Judge0 tokens, callback
credentials, and provider diagnostics must never appear in a student response.

## Architecture

```text
Student browser
├── Run ──────> Pyodide Web Worker
└── Submit ───> Next.js submission API on Netlify
                     │
                     ├── authenticate and load private cases from Supabase
                     ├── create a judging submission
                     └── submit one Judge0 execution per test case
                                      │
                                      ▼
                              Isolated Judge0 workers
                                      │
                                      ▼
                           authenticated callback API
                                      │
                                      ├── store case result
                                      ├── finalize aggregate result
                                      └── return safe status to student
```

Netlify remains the web and application API host. Judge0 is an internal
execution dependency and is never called directly by the browser.

Managed Judge0 is the MVP choice. Self-hosting Judge0 is deferred until volume,
cost, data-location requirements, or provider reliability justify operating a
separate execution cluster.

## Submission Lifecycle

Submission status expands from the current final-only states to:

- `judging`: accepted by the platform and awaiting complete judge results
- `pass`: every test case passed
- `partial`: at least one, but not all, test cases passed
- `fail`: no test cases passed, or the solution produced a student-code error
- `judge_error`: the platform could not produce a trustworthy grade

The normal sequence is:

```text
judging -> pass
judging -> partial
judging -> fail
judging -> judge_error
```

Final states do not transition back to `judging`. Callback handling and
finalization must be idempotent so duplicate or out-of-order provider callbacks
cannot change an already finalized submission.

`judging` and `judge_error` are not counted as wrong answers in student,
teacher, or dashboard statistics. AI feedback is requested only after a
student-result final state (`partial` or `fail`), never for provider failures.

## API Design

### Create and start a submission

Keep the existing endpoint:

```text
POST /api/submissions
```

Accepted request:

```json
{
  "problem_id": "uuid",
  "language": "python",
  "code": "print(input())",
  "elapsed_sec": 42
}
```

The endpoint must ignore and reject client-supplied grading fields such as
`status`, `score`, `passed_count`, `total_count`, and `runtime_ms`.

Server behavior:

1. Authenticate the current user and require the student role.
2. Validate problem existence and publication.
3. Validate Python as the only supported language.
4. Validate code size and elapsed time.
5. Load every test case through the server-only Supabase client.
6. Reject submission if the problem has no valid cases.
7. Create a submission with `status = judging`, zero score, and the authoritative
   total case count.
8. Create one private case-result row per test case.
9. Send the executions to Judge0 using its batch API.
10. Save the returned provider token for each matching case-result row.
11. Return HTTP `202`.

Response:

```json
{
  "submission": {
    "id": "uuid",
    "problem_id": "uuid",
    "status": "judging",
    "passed_count": 0,
    "total_count": 3
  }
}
```

If the initial Judge0 request fails, the submission becomes `judge_error`.
It must not be recorded as a student wrong answer.

### Receive Judge0 results

Add a server-only callback endpoint:

```text
POST /api/judge/callback/[callbackToken]
```

Each case receives a cryptographically random, single-purpose callback token.
Only a hash is stored in Supabase. The endpoint also confirms that the Judge0
submission token matches the expected case-result row.

Callback behavior:

1. Validate the callback token and provider submission token.
2. Bind the provider token if the callback arrives before the initial batch
   response has saved it; otherwise require an exact match with the saved token.
3. Treat an already recorded terminal case result as a successful duplicate.
4. Map the Judge0 result to the platform's case outcome.
5. Store runtime and memory metadata.
6. Check whether every expected case has a terminal result.
7. If complete, finalize the parent submission with a compare-and-set update
   that only accepts `status = judging`.
8. Return HTTP `200` without exposing application data.

Binding the token from whichever trusted path arrives first removes the race in
which a very fast Judge0 callback reaches Netlify before the batch-create
response has been persisted. The second path must observe the same token or mark
the submission as `judge_error`.

### Read submission status

Keep the existing endpoint:

```text
GET /api/submissions/[id]
```

Students may read only their own submissions. Teachers and administrators
continue to use their explicitly authorized progress endpoints.

For a judging submission, return aggregate lifecycle data only:

```json
{
  "submission": {
    "id": "uuid",
    "status": "judging",
    "passed_count": 0,
    "total_count": 3
  }
}
```

For a final submission, return:

```json
{
  "submission": {
    "id": "uuid",
    "status": "partial",
    "score": 67,
    "passed_count": 2,
    "total_count": 3,
    "runtime_ms": 81,
    "cases": [
      { "case_no": 1, "visibility": "sample", "outcome": "accepted" },
      { "case_no": 2, "visibility": "hidden", "outcome": "accepted" },
      { "case_no": 3, "visibility": "hidden", "outcome": "wrong_answer" }
    ]
  }
}
```

The status endpoint opportunistically reconciles outstanding Judge0 tokens when
a callback was delayed. This is a recovery mechanism, not the primary completion
path. A submission still unresolved ten minutes after creation is reconciled
once against Judge0 and then finalized or marked `judge_error`; it must not
remain in `judging` indefinitely.

### Remove student access to judge cases

The current student-accessible judge-cases response must be removed.

`GET /api/problems/[id]` continues returning only sample cases. Any endpoint
that returns all cases or expected outputs must require a teacher or admin role.

## Judge Execution Contract

For each test case, the server sends Judge0:

- The same submitted Python source code
- Python 3 as a server-selected language/runtime ID
- That case's input as `stdin`
- That case's expected output
- `problem.time_limit_ms`, converted to the provider's seconds unit
- `problem.memory_limit_mb`, converted to the provider's required unit
- A case-specific callback URL
- Output and process limits supported by the provider

The client cannot override any provider option.

MVP output comparison uses Judge0's standard expected-output verdict with one
expected value per input. The current behavior that accepts an expected value
when it merely matches the tail of a larger output is removed. Prompts,
debugging text, and other extra stdout therefore cause a wrong answer.

Every case has equal weight:

```text
score = round(100 * passed_count / total_count)
```

Weighted cases are outside MVP Version 1.

## Judge0 Result Mapping

Provider results map to stable platform outcomes:

| Judge0 category | Platform case outcome | Student-code result? |
|---|---|---|
| Accepted | `accepted` | Yes |
| Wrong Answer | `wrong_answer` | Yes |
| Time Limit Exceeded | `time_limit_exceeded` | Yes |
| Compilation/Syntax Error | `compilation_error` | Yes |
| Runtime error categories | `runtime_error` | Yes |
| Internal Error | `judge_error` | No |
| Network, malformed response, or unavailable provider | `judge_error` | No |

If any case has an infrastructure `judge_error`, the entire submission becomes
`judge_error`; the platform must not guess a grade from incomplete results.

If all cases have student-code outcomes:

- All accepted: `pass`
- Some accepted: `partial`
- None accepted: `fail`

The aggregate runtime is the maximum case runtime. Judge0 executes each case as
an independent batch item and the problem time limit applies per case, so
summing runtimes would make the displayed value grow artificially with the
number of teacher-created cases. Each private case row retains its individual
runtime. The aggregate score is based only on accepted cases.

## Data Model

### `submissions`

Retain the existing table and fields, with these changes:

- Extend the allowed `status` values with `judging` and `judge_error`.
- Set `total_count` when judging starts.
- Keep score and passed count at zero until finalization.
- Store only server-derived score, counts, runtime, and status.

### `submission_test_results`

Add a private table with:

- `id`
- `submission_id`
- `test_case_id`, nullable to preserve history if a problem case is later deleted
- `case_no`
- `is_sample_snapshot`
- `outcome`, nullable while judging
- `judge_token`, nullable until bound, unique and private
- `callback_token_hash`, unique and private
- `runtime_ms`, nullable
- `memory_kb`, nullable
- `created_at`
- `completed_at`, nullable

The table intentionally snapshots case order and visibility so later problem
edits cannot change what a past student is allowed to see.

Raw hidden input, expected output, stdout, and stderr are not duplicated in this
table for MVP. Provider diagnostics may be logged server-side with secrets and
hidden answers redacted, but are not part of the student API.

The migration must add indexes for:

- `submission_test_results.submission_id`
- Unique `judge_token`
- Unique `callback_token_hash`
- Judging submissions by status and submission time
- A partial unique constraint allowing only one `judging` submission for a
  student/problem pair

### `submission_rate_limit_buckets`

Add a durable per-user rate-limit table with:

- `user_id`
- `window_started_at`
- `submission_count`
- `updated_at`

A Supabase database function atomically increments the current one-minute
bucket and rejects attempts above ten submissions per user per minute. This
limit is separate from the one-active-submission constraint and works across
concurrent Netlify Function instances.

## Security and Abuse Controls

- Keep Judge0 URL, API key, and provider host headers in Netlify environment
  variables.
- Never expose provider credentials through `NEXT_PUBLIC_*` variables.
- Call Judge0 only from server-only modules.
- Use at least 256 bits of randomness for callback tokens and store only their
  hashes.
- Compare callback credentials without leaking whether a partial credential was
  correct.
- Restrict the callback body size and reject unexpected fields/types.
- Enforce a maximum source-code size of 64 KiB.
- Enforce a maximum of 50 test cases per problem for MVP.
- Limit test-case input and expected output to 64 KiB each.
- Limit captured output to 1 MiB per test-case execution.
- Enforce at most ten submission attempts per user per minute through the
  database-backed rate-limit bucket.
- Permit at most one active `judging` submission per student and problem.
- Do not give the Judge0 execution environment application secrets, Supabase
  credentials, or unrestricted access to internal services.
- Treat all code, stdout, stderr, and provider messages as untrusted text.
- Never render execution output as HTML.

## Reliability and Error Handling

- A duplicate Submit click must not create parallel judging jobs for the same
  student and problem while one is active.
- Judge0 batch tokens must be matched to cases by array position only during the
  initial response, then stored and addressed by token.
- A provider token is bound by the initial batch response or authenticated
  callback, whichever arrives first; the other path must match it.
- Partial batch creation becomes `judge_error`; it is not graded from a subset.
- Duplicate and out-of-order callbacks are safe.
- A callback for an unknown or mismatched token returns a generic unauthorized
  or not-found response.
- Provider unavailability returns a retryable message and leaves an auditable
  `judge_error` submission.
- Judging submissions older than ten minutes are reconciled once and then
  finalized or marked `judge_error`.
- Student syntax, runtime, time-limit, and wrong-answer outcomes are normal
  grading results, not platform errors.
- Progress is marked solved and collaboration draft code is cleared only after
  an authoritative `pass`.
- AI feedback failure does not alter the judge result.
- Dashboard and progress queries must explicitly exclude `judging` and
  `judge_error` from correctness statistics.

## Internal Component Boundaries

### Judge0 client

A server-only adapter owns authentication, batch submission, result retrieval,
provider response validation, and provider-status mapping. Route handlers do not
construct provider requests directly.

### Submission service

Owns authorization, input validation, creation of submission/case rows, provider
dispatch, and initial error recovery.

### Finalizer

A deterministic server-only unit accepts all case outcomes and returns aggregate
status, score, counts, and runtime. It performs no network calls and is unit
tested independently.

### Student response serializer

Builds the safe API representation. Hidden case details and all provider
credentials are impossible to include through its public type.

These boundaries keep provider-specific behavior separate from product grading
rules and allow Judge0 to be replaced later without rewriting student progress.

## Testing Strategy

### Unit tests

- Judge0 status-to-outcome mapping
- Aggregate result for all-pass, partial, all-fail, and infrastructure failure
- Aggregate runtime uses the maximum completed-case runtime rather than the sum
- Equal-weight score rounding
- Time and memory unit conversion
- Callback token generation and hashing
- Student serializer redaction for hidden cases
- Rejection of client-supplied grading fields
- Sample/hidden flag validation

### Route and service tests with a mocked Judge0 client

- Unauthenticated and non-student submission rejection
- Unpublished or missing problem rejection
- No-test-case rejection
- Oversized code and case-limit rejection
- Successful batch dispatch and `202` response
- Provider failure producing `judge_error`
- Callback authentication and provider-token verification
- Duplicate and out-of-order callback handling
- Finalization only after every case completes
- Ownership enforcement on submission status reads
- Hidden answers absent from every student response
- Direct attempts to forge `pass`, score, or counts rejected

### Database and query tests

- Status constraint accepts all lifecycle states
- Only one active judging submission per student/problem
- Case-result uniqueness and foreign keys
- Compare-and-set finalization is idempotent
- Progress and dashboard queries ignore non-grade states
- A later test-case edit does not change historical visibility metadata

### End-to-end grading scenarios

Use a small published Python problem with sample and hidden cases:

- Correct solution passes all cases.
- Incorrect solution passes only a subset and becomes partial.
- Always-wrong solution fails.
- Syntax error becomes a compilation error and final fail.
- Exception becomes a runtime error and final fail.
- Infinite loop becomes time-limit exceeded and final fail.
- Extra prompt/debug output becomes wrong answer.
- The browser network log never contains hidden input or expected output.
- Refreshing during judging resumes status polling.
- Closing the page does not prevent callback finalization.
- A forged direct submission request cannot create a passing grade.

Live Judge0 smoke tests are opt-in and environment-gated. Normal automated tests
must not depend on external provider availability.

## Observability

Structured server logs should include:

- Internal submission ID
- Problem ID
- Provider request/callback phase
- Count of completed and total cases
- Final platform status
- Provider latency and error category

Logs must not include source code, hidden input, expected output, API keys,
callback tokens, or unredacted stdout/stderr.

Operational monitoring should track judging latency, callback failure rate,
provider error rate, and submissions left in `judging` beyond ten minutes.

## Configuration

Required server-only Netlify environment variables:

```text
JUDGE0_API_URL
JUDGE0_API_KEY
JUDGE0_API_HOST
JUDGE0_PYTHON_LANGUAGE_ID
JUDGE_CALLBACK_BASE_URL
```

The provider base URL and credentials are configuration, not hard-coded values.
Preview and production deployments must use separate callback base URLs and may
use separate Judge0 credentials.

## Rollout

1. Add the database migration and server-side types.
2. Add the Judge0 adapter and deterministic finalizer with tests.
3. Change submission creation to server-authoritative judging.
4. Add callback processing and safe status serialization.
5. Change the student submission client to poll the saved submission.
6. Remove student access to judge cases and client-side grading.
7. Update progress, dashboard, and AI-feedback integration for lifecycle states.
8. Run mocked automated tests.
9. Run opt-in Judge0 smoke tests in a non-production environment.
10. Publish one internal pilot problem and verify sample and hidden cases before
    enabling the flow for all published problems.

During rollout, problems without valid test cases cannot accept authoritative
submissions. The platform displays a configuration error directing the academy
team to correct the problem rather than silently falling back to browser grading.

## Non-Goals

- UI or visual redesign
- Languages other than Python 3
- Teacher-authored arbitrary grader scripts
- Weighted test cases or partial points configured per case
- Interactive input during submission
- Package installation or per-problem dependencies
- Network access from submitted programs
- Plagiarism or AI-generated-code detection
- Contest ranking, penalties, or proctoring
- Self-hosting and operating Judge0
- Replacing the existing browser Pyodide Run experience

## Acceptance Criteria

- Every official submission is graded outside the browser in an isolated Judge0
  environment.
- Student code runs once per teacher-created test case with the corresponding
  standard input.
- Only the server derives and stores status, score, counts, and runtime.
- Hidden inputs and expected outputs never reach student-facing responses.
- Sample and hidden cases both contribute to the official result.
- Time and memory limits are authoritative.
- Pass, partial, wrong answer, syntax error, runtime error, timeout, judging,
  and provider-error flows are represented correctly.
- Duplicate callbacks and repeated status requests cannot corrupt a final
  result.
- Provider failures never count as student wrong answers.
- Existing progress and dashboard behavior uses only authoritative final grades.
- Automated tests cover grading rules, authorization, redaction, callback
  idempotency, and the primary end-to-end outcomes.
- The feature remains Python-only and introduces no UI redesign in MVP Version 1.
