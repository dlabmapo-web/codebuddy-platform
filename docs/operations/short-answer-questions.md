# Short-answer questions

Short-answer questions extend `WRITTEN_RESPONSE` and work without the turtle GUI service. Existing written responses without a short-answer definition retain manual grading and autosaved drafts.

## Enablement

Apply database migrations before deploying the API/web change. The additive migration `20261008150000_short_answers` adds a nullable typed definition to manual materials and a private per-attempt assessment/job table. The follow-up `20261008223000_short_answer_snapshot_guard` enforces immutable definition snapshots and terminal automatic grades at database level. Existing attempts/reviews are unchanged. The assessment table denies direct anonymous/authenticated Supabase access; authenticated application endpoints enforce academy, class, and learner scope.

API environment:

```dotenv
SHORT_ANSWER_ENABLED=true
```

Studio **build-time** environment:

```dotenv
NEXT_PUBLIC_SHORT_ANSWER_ENABLED=true
```

The release workflow reads the corresponding GitHub repository variable for the studio build argument. Setting a container environment variable after an image was built does not reveal the authoring button. Both examples default to false. Production was not enabled as part of implementation.

`GUI_ENABLED` and `NEXT_PUBLIC_GUI_ENABLED` can remain false. No VNC, Python image, or GUI secret is needed. Legacy written-response creation is also independent of GUI enablement. Author Save checks API capabilities first, so an older API cannot silently discard new grading fields.

Disabling the API flag stops new short-answer admission, author matching preview, author definition saves, and job processing. Existing question/history/review/explanation reads remain available. Disabling the studio flag removes the new authoring action; existing question links remain valid. Redeploying older binaries after applying the additive migration preserves stored records, but those older binaries do not understand short-answer grading. Disable admission and keep the new read/review API until that data has an explicit compatibility plan.

## Evaluation and recovery

Each automatic submission atomically stores its immutable answer and definition snapshot plus a PENDING job. Every enabled API instance polls once per second and claims up to four jobs using conditional database updates and a 30-second lease. Expired EVALUATING leases recover after a process restart. Results are written only by the current lease owner; published teacher reviews remain authoritative.

A single instance's evaluator admits four concurrent regex workers and at most 16 queued requests shared by author preview and submission evaluation. Regex compilation/test has a 100 ms deadline after worker startup; startup is bounded to five seconds. Workers have a 32 MiB V8 old-generation limit. Pattern and response bounds are 2000 and 10,000 JavaScript string units. Exact mode compares strings directly. Neither mode invokes Python, the ordinary judge, or user code.

Monitor the private assessment table by status/age, without exporting definitions or student text to logs. ERROR means matching/infrastructure failure, not an incorrect answer or zero grade. Students can retry the same attempt through Retry evaluation; the stored answer/rule remain unchanged. Teachers can publish an explicit override. Malformed patterns are rejected at author Save. For repeated runtime timeouts on a published pattern, create a new question with a simpler rule rather than editing historical assessment definitions.

## Local verification

The fixed disposable fixture is development-only and uses its own `ee030…` course namespace. It does not delete the PDF/turtle fixture. Run the API/web with short-answer flags enabled and GUI flags disabled, then:

```bash
E2E_SHORT_ANSWER_ENABLED=1 pnpm e2e --project=chromium e2e/specs/short-answer-materials.spec.ts
E2E_SHORT_ANSWER_ENABLED=1 pnpm e2e --project=webkit-short-answer e2e/specs/short-answer-materials.spec.ts
```

When servers are already running, `E2E_BASE_URL=http://localhost:3000` skips server startup. `E2E_SHORT_ANSWER_API` can select a separate localhost API (the implementation verification used `http://localhost:4300/api/manual`). The studio's `NEXT_PUBLIC_API_URL` must point to that same API's `/api/rpc` endpoint, and API `WEB_ORIGIN` must match the studio origin. `E2E_SKIP_SEED=1` is valid only when the standard development identities already exist; the feature fixture still prepares its own course.

Reference inspection did not create real Elice submissions. Exact normalization, submission feedback, final-attempt scoring, and explanation timing remain documented parity gaps in the [research](../research/2026-10-08-short-answer-questions.md).

For feature tests that encounter browser sign-in/Turnstile failures, prepare sessions only for fixed development identities (no email is sent):

```bash
NODE_ENV=development pnpm --filter @cove/api exec tsx --import dotenv/config ../../packages/web/scripts/prepare-short-answer-auth.mts
E2E_AUTH_STATE_DIR=/tmp/cove-short-answer-auth E2E_SHORT_ANSWER_ENABLED=1 pnpm e2e --project=chromium --project=webkit-short-answer e2e/specs/short-answer-materials.spec.ts
```

Pass the same `E2E_SHORT_ANSWER_API` value to preparation and testing when using an alternate localhost API. Session files have mode 0600 and stay outside the repository. This verifies feature behavior with real authorized accounts; it does not cover browser sign-in.

## Implementation verification — 2026-10-08

- Three Chromium and three WebKit localhost scenarios passed across the final targeted runs, with GUI disabled: exact authoring/private grading/explanation/teacher override, regex and manual review, and stale-prompt/timeout recovery including a narrow viewport.
- Browser checks used prepared sessions for fixed development accounts after WebKit's browser sign-in failed. An initial duplicate-navigation race in the test helper was corrected before the successful WebKit rerun. This is feature coverage, not a claim that browser sign-in passed in WebKit.
- 41 focused API tests passed, including the original manual-material regression tests, private DTOs, disabled admission, literal/regex boundaries, timeout recovery, durable lease ownership, unsupported evaluator versions, and progress/review precedence.
- 124 translation tests passed; API/web/E2E typechecks and API/web builds passed.
- Development migrations applied. The storage verification script confirmed RLS/direct-access denial, immutable snapshots, and terminal automatic grades without retaining attempted mutations:

```bash
pnpm --filter @cove/api exec tsx scripts/verify-short-answer-storage.mts
```

No Elice submissions or production deployment were performed. PDF, turtle, and short-answer changes remain together on the same feature branch.
