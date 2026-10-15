# Input prompt policy: local browser E2E verification

Date: 2026-10-15
Implementation under test: `0222457a`, branch `feat/ignore-python-input-prompts`.

## Environment and scope

Ran the real Next.js application on `localhost:3012`, API on `localhost:4012`,
and judge worker with health on `localhost:4112`. Application data and queues
used disposable local PostgreSQL 17 and Redis 8 containers. All 56 migrations,
including the input prompt policy migration, applied successfully.

Authentication used existing development Supabase test-account sessions. The
local database held corresponding fixture identities; no shared development or
production database was changed. Cached student sessions were registered using
the normal authenticated `studentSession.begin` endpoint so inactivity guards
remained enabled. No application responses or grading services were mocked.

The API ran its compiled output without a compiler watcher; Next.js remained in
development mode. This is functional browser coverage, not a production load or
latency certification. Local judge execution used the supported development
child-process engine; sandbox protocol coverage is recorded in the design spec.

## Final results

**22 unique browser checks passed after correcting the stale outline test.**

| Suite | Browser | Passed |
| --- | --- | ---: |
| New input prompt policy scenarios | Chromium | 4 |
| New input prompt policy scenarios | WebKit/Safari | 4 |
| Existing grading regressions | Chromium | 8 |
| Existing interactive Python regressions | Chromium | 3 |
| Existing interactive Python regressions | WebKit/Safari | 3 |

The regression run initially passed 13 of 14 checks. The remaining test tried
checking an exercise row inside a collapsed lecture. It now expands “Reading
input” before verifying the Solved badge and 100/100 score; its targeted rerun
passed. The other 13 passing regressions were not repeated. The pushed-verdict
check measured 1,049 ms and passed its unchanged 8,000 ms budget.

Regression coverage includes hidden-answer privacy, wrong-answer diagnostics,
time limits, runtime errors, concurrent submissions, solved progress, SSE
verdict delivery, local typing, cross-origin isolation, stdin, the error coach,
and output without a trailing newline. E2E TypeScript checks, including the new
fixture helper, and `git diff --check` passed. This was the focused grading/input
suite, not every unrelated repository E2E suite.

## New feature coverage

`e2e/specs/input-prompt-policy.spec.ts`: four scenarios passed in Chromium and
four passed in WebKit/Safari.

| Scenario | Verified behavior |
| --- | --- |
| Standard grading | Initially off; enable via UI, save, reopen and retain the policy. Server sample and Submit accept the formatted answer while excluding input prompts. Extra printed output fails both sample checking and Submit. |
| Weighted grading | Same checks; switching Standard/Weighted retains the selected policy before saving. |
| Interactive Run | Both prompts remain visible; entering hour/minute produces the expected result. |
| Option disabled | The same prompt-bearing program fails strict equality again. The learner exclusion notice disappears. |
| Browser sample fallback | With server checking disabled in the local fixture, prompts remain visible and the result is explicitly unchecked until Submit. The feature flag is restored afterward. |

The sample uses input values `4` and `30`, expected output `Time: 4:30`, and a
second hidden case with different values. Submit checks both cases and reports
100/100 for the correct program and 0/100 for extra output.

## Reproduction

Prepare the standard development identities, class/course fixtures and valid
browser sessions against a **local** database, then start API, judge and web
with matching local database/Redis settings. The new fixture helper refuses a
non-local database and the browser suite refuses a non-local web origin.

For already prepared base fixtures and cached test sessions:

```bash
E2E_BASE_URL=http://localhost:3012 \
E2E_API_URL=http://localhost:4012/api/rpc \
E2E_SKIP_SEED=1 \
E2E_INPUT_PROMPTS=1 \
E2E_AUTH_STATE_DIR="$LOCAL_TEST_AUTH_STATE_DIR" \
DATABASE_URL="$LOCAL_E2E_DATABASE_URL" \
DIRECT_URL="$LOCAL_E2E_DATABASE_URL" \
pnpm exec playwright test --config e2e/playwright.config.ts \
  e2e/specs/input-prompt-policy.spec.ts \
  --project=chromium --project=webkit-input-prompts
```

The opt-in fixture creates a separate named test course and uses the existing
E2E class. It does not rewrite the baseline echo/sum exercises. Authentication
states, traces and test credentials are not committed. The fixture helper is
included in E2E TypeScript checks.

## Setup corrections

Initial attempts exposed fixture setup errors, not a grading defect: missing
curriculum keys, an absent local inactivity lease when restoring sessions, and
a test selector that used “Run tests” instead of the rendered “Test run” label.
These were corrected. A cold dev-route compilation also exceeded an early
navigation wait; redundant navigations were removed and the authoring save
check allows the route to compile. The final feature runs completed with no
retries. No application code changes were needed for these corrections.


Existing regressions were run with the same local web/API/session environment:

```bash
pnpm exec playwright test --config e2e/playwright.config.ts \
  e2e/specs/grading.spec.ts e2e/specs/interactive-python.spec.ts \
  --project=chromium --project=webkit-python
```

After the outline-selector correction, only that failed check was rerun:

```bash
pnpm exec playwright test --config e2e/playwright.config.ts \
  e2e/specs/grading.spec.ts --project=chromium \
  --grep 'passing a problem marks it solved'
```

No production deployment, migration or test was performed. Temporary local
services and containers were stopped after verification. The pre-existing API
on port 4000 and the user's unrelated research file were left untouched.
