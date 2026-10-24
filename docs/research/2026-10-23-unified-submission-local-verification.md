# Unified submission local verification

Scope: the approved [submission design](../superpowers/specs/2026-10-23-unified-workspace-submission-design.md).
No production deployment or production test records.

## Implementation

- Students retain coursework submissions. Actual academy teachers, team leaders,
  and managers can submit private self-tests, including authorized manual preview.
- Manual previews use `manual-preview:<revision>` independently of live practice,
  other staff, and student submissions. Stale content is rejected on admission.
- A shared English/Korean summary displays the newest accepted attempt's server
  timestamp, state, score, and frozen maximum. History selection and best scores
  do not determine this strip. Query keys include the owner and delivery context.
- Ungraded staff work shows “Not automatically graded”; student work awaits review.
  Pending/error evaluations never masquerade as zero scores. Reading-only media
  and intentional Run-only activities retain their existing controls.
- Summary polling is bounded; focus/reload retrieves the latest server state.

## Environment and reproducible checks

Development Supabase project only: `lnrmxjxsjxymgphgatwn`; API localhost:4000,
web localhost:3000, Redis-backed real local Python judge. Development identities:
`student`, `teacher`, `teamlead`, `manager` at `cove.test`.

`packages/api/scripts/seed-unified-submission-e2e.mts` creates a separate QA course
with fresh UUIDs and a development-project guard. It does not reset user courses.
Metadata is written to `/tmp/unified-submit-fixture.json`. Browser tests require
short-lived prepared development auth states in `E2E_AUTH_STATE_DIR`; credentials
and auth state are never committed.

Commands:

```sh
pnpm --filter @cove/api exec tsx scripts/seed-unified-submission-e2e.mts
node packages/api/scripts/verify-unified-submission-e2e.mjs
COVE_PRACTICE_INTEGRATION=1 pnpm --filter @cove/api exec vitest run src/learn/staff-practice.integration.spec.ts
E2E_BASE_URL=http://localhost:3000 E2E_AUTH_STATE_DIR=/tmp/unified-submit-auth E2E_SUBMISSION_FIXTURE=/tmp/unified-submit-fixture.json pnpm exec playwright test --config e2e/unified-submission.playwright.config.ts
```

## Results

- Shared semantics: 4 checks passed (real zero, decimal maximum, review semantics,
  evaluation errors, bounded polling).
- Database integration: 8 checks passed. Includes all three staff roles across
  Turtle, written response, manual/exact/regex short answers, and multiple choice;
  owner isolation, latest lower score, stale preview rejection, revision/live
  separation, unauthorized student/unassigned teacher rejection, idempotency, and
  absence of student submission/progress/points side effects.
- Real HTTP/API + Redis judge: all four roles submitted Python earning 100 and
  then 0; latest persisted the newer zero. All four roles submitted six manual
  activity types with the expected graded/recorded/awaiting-review state.
- Published manual review through the real API: the student's summary changed
  to 12.34 / 25.5 and retained the original submission timestamp.
- Focused API unit checks: 40 passed. Web summary/workspace checks: 6 passed (including polling-budget/focus recovery).
  PDF reference/Run-only regressions: 8 passed. Translation consistency: 117 passed.
- API build and API/web/E2E TypeScript: passed. Lint: no errors; two existing
  ManualWorkspace effect-dependency warnings remain.
- Final browser matrix after the editor-loading fix: **40/40 passed** in
  Chromium/WebKit (32 general scenarios + 8 linked graded PDF scenarios).
  Covers all four roles and
  Python, linked graded PDF, legacy quiz, Turtle, written/manual/exact/regex
  short answers, multiple choice, Run-only, and reading-only PDF/video controls.
- The initial production-build run had external CDN worker errors. The final
  fresh run passed 32/32 without retries, including actual Turtle editor input,
  language changes, mobile controls, and local worker loading with jsDelivr
  deliberately blocked.
- Linked graded PDF: all 8 checks passed (four roles × two engines), verifying
  8.5 / 25.5 then 0 / 25.5 and reload persistence with an actual PDF reference.
- English/Korean summaries, mobile Submit controls, preview/live privacy,
  latest-zero persistence, and student coursework versus staff private attempts
  passed their functional assertions.

## Reference limits

Elice's supplied screenshot establishes the score/time toolbar reference. Its
browser bridge could not initialize, so this is not a fresh all-role Elice audit.
Initial browser attempts were interrupted by local development compilation
timeouts, a Turbopack cache panic, and a 1 GiB Node heap exhaustion. These are
recorded separately from application assertions; they are not passing E2E checks.

One initial student coding check changed a Monaco model directly, submitting the
old Yjs-backed draft. The helper now selects through the public editor API,
types with real input events, and asserts the outgoing code. The focused retest
passed (100 then 0 with reload). This was a test-input problem; the collaboration
adapter deliberately treats whole-model replacement differently from typing.

## Production-build browser setup

The final browser checks use a local optimized webpack build on port 3000 and
API port 4000. Development HMR reloads had interrupted WebKit navigation during
on-demand route compilation. No live deployment was involved.

```sh
COVE_COURSE_TURTLE_E2E=1 NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter @cove/web exec next build --webpack
COVE_COURSE_TURTLE_E2E=1 pnpm --filter @cove/web exec next start --port 3000
pnpm --filter @cove/api exec tsx scripts/seed-unified-submission-pdf-e2e.mts
E2E_AUTH_STATE_DIR=/tmp/unified-submit-auth E2E_SUBMISSION_PDF_FIXTURE=/tmp/unified-submit-pdf-fixture.json pnpm exec playwright test --config e2e/unified-submission-pdf.playwright.config.ts
```

Reading-only media checks accept `E2E_SUBMISSION_MEDIA_FIXTURE`, containing an
existing authorized class ID and a `materials` array of ready `{type, id}` rows
(`documents`/`videos`). They assert a successful material read and actual lesson
heading before checking that Submit and the summary are absent; they do not play
or complete the existing media.

## Editor-loading fix and final verification

The strict WebKit student scenario initially exposed `NetworkError: Load failed`
from a blob worker and an ErrorEvent from the external Monaco 0.55.1 CDN.
Monaco 0.55.1 is now an explicit pinned web dependency; predev/prebuild copies
its complete browser distribution and license into versioned public assets.
Every dynamic editor entry point uses one shared loader configured for
`/monaco/0.55.1/vs`. Solution, review, authoring, and monitoring editors use the
same configuration. The existing Docker build copies these public assets.

The browser regression blocks jsDelivr, types into the actual editor, submits,
changes language, reloads, and checks for a successful local editor worker
request and no page errors. It passed for all four roles in both engines.
The worker returned HTTP 200 with same-origin CORP and immutable caching; COOP
and COEP remain enabled for Python interactive input. No errors were suppressed.

Final logs: `/tmp/unified-submit-resume-e2e.log` (32 passed),
`/tmp/unified-submit-resume-pdf.log` (8 passed), and
`/tmp/unified-submit-resume-build-final.log` (optimized build and TypeScript
passed without the preliminary JSON named-import warning). Screenshots are in
`test-results/unified-submission-resume/` and
`test-results/unified-submission-pdf-resume/`. Earlier failure traces remain as
historical evidence in `test-results/unified-submission-editor-ready/`.

Follow-up editor/summary regression checks: 5 Vitest suites, 9 tests passed.
E2E TypeScript passed; lint of changed web files passed with only the two
pre-existing ManualWorkspace effect-dependency warnings. The default lint also
reported that CodeEditor is ignored; its explicit `eslint --no-ignore` check
passed (`/tmp/unified-submit-resume-editor-lint.log`). `git diff --check`
was clean. Logs: `/tmp/unified-submit-resume-unit.log`,
`/tmp/unified-submit-resume-e2e-types.log`, and
`/tmp/unified-submit-resume-lint.log`.

## Local state

The current local UI on localhost:3000 is the verified optimized build, backed
by API localhost:4000 and the real local judge. No production changes were made.
Temporary authentication state is removed after testing. Fresh QA material IDs
are recorded in `/tmp/unified-submit-fixture.json` and
`/tmp/unified-submit-pdf-fixture.json`; original material drafts were not reset.
