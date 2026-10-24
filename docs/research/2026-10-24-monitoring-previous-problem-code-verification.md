# Monitoring previous-problem code: local verification

Branch: `feat/course-turtle-parity`. No production changes.

## Cause and change

The monitoring curriculum's preview endpoint returned only the public exercise.
The preview editor consequently rendered `starterCode`, often an empty string,
even when the selected student had a saved answer.

The endpoint now returns a nullable `studentCode` snapshot, after the existing
academy/class/student/material authorization. Saved drafts take precedence,
including intentionally empty drafts. Without a draft, use the latest original
submission for this class or an older record with no class attribution. Exclude
other classes and regrade repair records. With no saved work, render starter code.

Public exercise metadata stays separate from student snapshots. Previews contain
no draft ID, Yjs state, hidden expectations, or model solutions. Preview Monaco
remains read-only, without Run/Submit or a shared document. Existing request-token
and student-key boundaries prevent an old preview from replacing a new selection.

## Local checks

- Shared package build and API TypeScript passed.
- Monitoring service/access: 74 tests passed. Teacher display reducer: 21 tests
  passed, including stale response/selection boundaries.
- Real local API returned `# LATEST_SUBMITTED_WORK` from the legacy QA submission.
- Browser fixture uses a fresh course and new material UUIDs assigned to the
  development E2E class. Original student drafts are not changed. An incomplete
  initial fixture was removed; the fixture script now uses a transaction.

```sh
pnpm --filter @cove/shared build
pnpm --filter @cove/api exec vitest run src/monitoring/monitoring.service.spec.ts src/monitoring/monitoring-access.service.spec.ts
pnpm --filter @cove/web exec vitest run teacher-display.spec.ts
pnpm --filter @cove/api exec tsx scripts/seed-monitoring-history-e2e.mts
E2E_BASE_URL=http://localhost:3000 E2E_AUTH_STATE_DIR=/tmp/monitoring-history-auth E2E_MONITORING_HISTORY_FIXTURE=/tmp/monitoring-history-fixture.json pnpm exec playwright test --config e2e/monitoring-history.playwright.config.ts
```

Prepared auth states contained only short-lived seeded development sessions
outside the repository and were removed after the browser run. Development
Supabase project guard: `lnrmxjxsjxymgphgatwn` in both auth and database URLs.

## Browser results

Both Chromium and WebKit passed the full real-browser flow (2/2 scenarios).
A student typed code into a problem with a blank starter, autosaved it through
the real API, and moved to another problem. The teacher selected the previous
problem and saw that exact code in a read-only Monaco editor, with no Run/Submit.
The student's current code remained unchanged. The same flow checked latest
submission fallback (including legacy class attribution), starter fallback for
untouched work, preservation of an empty draft, exclusion of another student's
code, return to the synchronized live problem, and reopening the saved work.
No teacher page errors were reported. The Safari screenshot was visually checked.

Logs: `/tmp/monitoring-history-e2e.log`,
`/tmp/monitoring-history-api-tests-final.log`,
`/tmp/monitoring-history-web-tests.log`, and
`/tmp/monitoring-history-web-build.log`. Screenshots:
`test-results/monitoring-history/`. The optimized web build and its TypeScript
check passed. Existing API development watch remains running on port 4000;
the updated optimized web app is running on port 3000. No deployment was made.

Final static checks: API and E2E TypeScript passed; changed web files passed
ESLint with no warnings/errors; `git diff --check` was clean. Logs:
`/tmp/monitoring-history-api-types-final.log`,
`/tmp/monitoring-history-e2e-types.log`, and
`/tmp/monitoring-history-lint.log`.

## Manager / Team Lead follow-up

The shared permission composition already makes Team Lead a superset of Teacher,
and Manager a superset of Team Lead. Added an invariant test so new Teacher
permissions must also reach Team Lead. No permission expansion was necessary.
Active Managers and Team Leads have academy-wide teaching access without a
Teacher grant or homeroom/assistant assignment. Teachers retain their assignment
scope. Manager-only administration and cross-academy/archived access boundaries
remain unchanged.

- Shared role/role-set/monitoring tests: 115 passed.
- API monitoring access, class service, assigned-course access: 86 passed.
- Verified seeded Manager and Team Lead each hold only their named role and have
  no class assignment in the development fixture.
- Six history browser scenarios passed for all three roles across Chromium and
  WebKit before the live-edit follow-up.

The extra live-edit scenarios exposed an intermittent text-reordering defect,
not an authorization failure. Student Monaco was controlled by React code
snapshots while also being bound to Yjs. Lagging snapshots recreated characters
already received from staff, causing CRDT conflicts. A remote-edit batching
experiment did not fix this and was reverted. While collaboration is active,
the shared document now owns the model; React still receives changes for
autosave. Leaving collaboration restores controlled navigation/reset behavior.
Reset already routes through the shared-document replacement path.

The new regression tests cover stale React snapshots, initialization and leaving
collaboration. Editor/document-sync/preview tests: 68 passed. Optimized webpack
build and its TypeScript check passed. The earlier failed browser traces are
retained as diagnostic evidence, not counted as passing checks.

Logs: `/tmp/monitoring-history-roles-shared.log`,
`/tmp/monitoring-history-role-access.log`,
`/tmp/monitoring-history-role-fixture.log`,
`/tmp/monitoring-history-roles-e2e.log`,
`/tmp/monitoring-role-editor-tests.log`, and
`/tmp/monitoring-document-owner-build.log`.

### Final browser verification after the synchronization fix

12/12 scenarios passed against the real local API and optimized web build:
three roles × two engines × two flows. Each history flow checks autosaved
previous work, latest submission fallback, untouched starter, intentionally empty
draft, exclusion of another student's work, read-only controls, return to live,
and the student reopening their saved work. Each live-edit flow checks staff
edits arriving exactly at the student, student follow-up edits arriving exactly
at staff, the helping indicator, and restoration/autosave of the QA starter.
Manager and Team Lead succeeded without class assignments. The Manager Safari
history screenshot and Team Lead Chrome live-edit screenshot were visually
inspected.

Logs: `/tmp/monitoring-document-owner-live.log` (6 passed) and
`/tmp/monitoring-document-owner-history.log` (6 passed). Artifacts:
`test-results/monitoring-document-owner-live/` and
`test-results/monitoring-document-owner-history/`.
E2E TypeScript passed (`/tmp/monitoring-role-e2e-types.log`). Changed studio
components passed ESLint; the shared editor and its regression test also passed
explicit `--no-ignore` lint (`/tmp/monitoring-role-editor-lint.log`).
Temporary prepared authentication states were removed after this final run.
The development QA course remains available; production was not changed.
