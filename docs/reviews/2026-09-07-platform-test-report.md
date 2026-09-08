# Platform test report — 2026-09-07

Tested local checkout `2df7f04` plus the test-only corrections described below. API, web, and judge ran locally against the documented development Supabase project and local Redis. No deployment or production test was performed. Development identities and fixture data were reseeded by the existing E2E setup.

## Result

Package tests and the production build passed. Focused browser checks passed, but the full end-to-end suite did not complete. This is not an all-platform release sign-off.

| Check | Result |
| --- | --- |
| Shared package tests | 761 passed, 38 files |
| Translation package tests | 107 passed, 4 files |
| API package tests | 921 passed, 91 files |
| Web package tests | 863 passed, 98 files |
| Total package tests | 2,652 passed, 231 files |
| Workspace typecheck | Passed after regenerating stale Next.js route types |
| E2E typecheck | Passed after test changes |
| Workspace lint | Passed; 79 warnings, zero errors |
| Canonical route check | Passed |
| Translation check | Passed |
| Production workspace build | Passed |
| Interactive Python, Chromium | All 3 passed |
| Interactive Python, WebKit | All 3 passed after installing the missing browser |
| Assigned teacher class access, Chromium | Passed |
| Team lead denied teaching access, Chromium | Passed |
| Student sidebar role visibility, Chromium | Passed |

The three Python checks cover terminal input and worker isolation, syntax-error explanation and recovery, and output without a final newline staying with the correct run. WebKit is Playwright's browser engine, not a test on an actual student's Safari device.

## Corrections made

1. `packages/api/prisma/seed/e2e-content.ts`: select the known development academy by its fixed ID. The old organization-wide `findFirstOrThrow` selected the secondary profile academy and failed because its teacher membership did not exist. The corrected seed completed repeatedly.
2. `e2e/specs/interactive-python.spec.ts`: pass the fixture class ID when opening an exercise. The development student belongs to multiple classes using the course, so omitting class context legitimately opens a class chooser.
3. In the same Python suite, assert the visible `1:8` location button directly. The previous word-boundary regex failed when adjacent element text was concatenated as `1:8This...`.
4. Select the Terminal tab before asserting terminal content. The error coach tab is selected after a syntax error and the terminal is not mounted then.

No application behavior was changed. These edits are local and uncommitted.

## Remaining test-suite blockers

### Student navigation expectations are stale

`e2e/specs/student-journey.spec.ts:94` expects login to land at `/learn/courses`, but the application opens the student academy overview. The newer student-overview design documents the change. Other tests in that file click a course card immediately after login, so they wait on the overview instead of reaching the catalog.

Update the landing assertion to the current intended behavior and explicitly navigate to the catalog in tests that exercise course content. Do not change the app back simply to satisfy this old assertion.

### Live monitoring stops at class selection

`e2e/specs/teacher-live-monitoring.spec.ts:128` reaches “Choose your class” after opening the student's exercise. It then waits for Monaco, which cannot appear until a class is selected. The fixture class and an older Playwright-created class both use the course. Because the monitoring suite is serial, the following 22 tests did not run.

Make the test choose its fixture class through the UI or supply explicit class context. The shared development fixtures also need reliable cleanup or isolation. Live updates, reconnect behavior, and later monitoring checks remain unverified by this run.

### CI browser installation does not match its projects

`.github/workflows/e2e.yml` installs only Chromium but invokes `pnpm e2e`, whose configuration also includes WebKit and Firefox projects. Install all configured browsers or explicitly split/filter the projects. Local WebKit checks initially failed to launch for exactly this missing-browser condition; installation resolved it.

This separate workflow already exists. Its development-secret preflight can skip the suite when secrets are absent. Remote secret configuration and actual workflow results were not inspected.

### Stale local Next.js output

Initial typechecking found conflicting generated production/development route types, and an early browser trace showed a missing-page screen. Stopping test servers, preserving the previous `.next` directory outside the repo, and regenerating route types cleared the typecheck errors. Later exercise pages rendered successfully. No production route failure was established.

## Run history and scope limits

The initial 165-test Chromium run could not seed. After the seed correction, its first course journey failed and the run was stopped to investigate the shared blocker. Focused retries exposed the issues above. Interrupted and unrun tests must not be counted as passes.

The final focused Python suites passed separately in Chromium and WebKit. The teacher access and sidebar passes came from earlier focused runs. Package tests include mocked dependencies and do not replace real multi-user browser testing.

Not completed: the full 165-test Chromium suite, full grading/submission journey, complete monitoring sequence, Firefox/mobile coverage, classroom load testing, production smoke checks, backup recovery, and a comprehensive security review.

## Reproduction

Use development database settings only. The E2E command reseeds fixture data.

```bash
pnpm --filter @cove/shared --filter @cove/i18n build
pnpm -r test
pnpm typecheck:e2e
pnpm e2e interactive-python.spec.ts --project=chromium --project=webkit-python
pnpm e2e teacher-live-monitoring.spec.ts --project=chromium
pnpm e2e student-journey.spec.ts --project=chromium --max-failures=3
```

Stop development/test servers before `pnpm -r build`. Run `pnpm --filter @cove/web exec next typegen` to regenerate route types when needed.

Local diagnostic evidence (temporary, not committed): `/tmp/cove-test-unit.log`, `/tmp/cove-test-build.log`, `/tmp/cove-test-python-final.log`, `/tmp/cove-test-webkit.log`, `/tmp/cove-test-student-results/`, and `/tmp/cove-test-monitoring-results/`. Failure folders contain error context and Playwright traces. Traces can contain test authentication data; keep them local.
