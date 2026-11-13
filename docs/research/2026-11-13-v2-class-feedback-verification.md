# V2 class feedback verification

Date: 2026-11-13
Branch: `fix/v2-feedback`
Scope: [approved design](../superpowers/specs/2026-11-13-v2-class-feedback-design.md).

Implemented the four feedback items: blue Import from Library action, distinct staff class labels, authorized access from a live class to its editor with a fixed return path, and Team Lead schedule editing. Student class labels and ordinary Teacher editing permissions are preserved.

The live roster now owns its `StudioPage` heading so the heading follows the teaching query cache after edits and Back/Forward navigation. The server still loads the roster and determines whether to offer the editing action. The action uses a small client component because the shared Radix-backed Button cannot be imported into a server component. Teaching caches receive the saved class facts and are invalidated within the same academy/class scope. Server-read tokens prevent an older route payload from being treated as a fresh read after remounting.

Two schedule edge cases were fixed during implementation: time-picker changes retain stored overnight day offsets, and Save is disabled when expanded weekday slots exceed 21.

## Executed checks

- Shared role permissions: 34 tests passed.
- Web capability, navigation, schedule-row and server-read tests: 70 tests passed.
- API class-service and disposable PostgreSQL integration tests: 64 tests passed, including 6 integration cases.
- Library access regression tests: 8 tests passed.
- Translation package/check: 144 tests passed; no stale catalog keys or markers.
- Shared/i18n/API builds, web/API type checks, E2E type check, focused ESLint, canonical route check, shell syntax check and `git diff --check` passed.
- Chromium browser suite: 3 tests passed in 1.2 minutes. Manager (English) and multi-role Team Lead (Korean) completed entry → live roster → edit details → edit schedule → return, including Back/Forward navigation with the updated class name. Both changed hour/minute controls, saved multi-day windows, edited an overnight endpoint without losing its day offset, and removed all windows. Teacher controls were absent and direct class/schedule writes returned 403. Browser observation found zero duplicate roster RPCs during initial hydration.
- Browser tests also checked both blue course actions, unchanged student My Classes headings, desktop light layouts and mobile dark layouts. English and Korean course screenshots were visually inspected under `test-results/class-feedback/`.

The global theme check remains failing on **9 pre-existing literals in untouched files**: `components/manual/gui-viewer.tsx`, `components/manual/manual-workspace.tsx`, `components/monitoring/observed-material-view.tsx`, and `components/video/video-player-controls.tsx`. The changed UI uses existing theme tokens.

## SQL evidence

All database writes and query counts used disposable Docker PostgreSQL, never shared Supabase. Prisma query-event instrumentation measured the same service calls against baseline class-service source from `2fe8f3b9` and the implemented source. The monitoring/access readers are unchanged. Both runs produced:

| Service call | 1 class / 1 student | 13 classes / 21 students | Change from baseline |
| --- | ---: | ---: | ---: |
| `monitoring.listAssignedClasses` | 4 | 4 | 0 |
| `monitoring.getClassRoster` | 13 | 13 | 0 |
| `academyClasses.get` | 26 | 26 | 0 |

These counts include each service's permission reads, and exclude common Next.js layout/account reads and socket activity. Management detail still has its existing deep include; this change does not load it into class cards or the live roster. The regression test pins all three counts and verifies that adding classes/students does not add statements. No endpoints, migrations, new list fields, or polling were introduced.

## Repeatable checks

`pnpm e2e:class-feedback` creates fresh local PostgreSQL and Redis containers, applies migrations, builds the shared/i18n/API packages, runs the SQL/authorization integration cases, and runs the browser suite with the isolated provider harness. It removes its containers on exit. Ports 3309, 4319 and 4320 must be free. Set `COVE_FEEDBACK_SQL_EVIDENCE` to a local output path to retain measured SQL counts.

For an existing disposable test database, run `pnpm --filter @cove/api exec vitest run src/classes/class-feedback.integration.spec.ts` with `COVE_INTEGRATION_DATABASE_URL` pointing to local `cove_dlab_test`. Browser cases use `e2e/class-feedback.playwright.config.ts` and the local database/Redis environment documented by the runner.

## Live class UX follow-up

Implemented the requested blue Edit Class Information action in the consolidated class header, removed the redundant back link, and replaced course badges with larger assigned-course links. Each link opens the canonical staff course detail. Hidden and empty course states have Korean/English copy. Course metadata comes from the existing roster; automatic detail prefetch is disabled.

Validation for this follow-up:

- Web type check, focused ESLint, translation check (144 tests), canonical route check and E2E type check passed.
- The disposable PostgreSQL suite passed all 6 cases with the same 4/13/26 statement budgets for list/roster/management detail.
- Updated Chromium browser cases passed for Manager (English), Team Lead (Korean) and Teacher (English), 3 tests in 2.7 minutes. Every role opened an assigned course from the mobile class page and returned successfully. Authorized edit controls remained blue and Teacher edits remained denied. The checks also verified a single page back link and preserved the existing editing/schedule flow.
- Inspected desktop light and mobile dark live-class screenshots in `test-results/class-feedback/`, including both locales. The isolated cold development build needed longer sign-in/course-navigation waits on this machine; those test waits were adjusted without changing application behavior.
