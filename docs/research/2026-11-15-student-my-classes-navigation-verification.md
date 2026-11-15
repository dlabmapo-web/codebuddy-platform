# Student My Classes navigation verification

Date: 2026-11-15
Branch: `fix/v2-feedback`
Spec: [Student learning entry through My Classes](../superpowers/specs/2026-11-15-student-my-classes-navigation-design.md).

## Delivered behavior

Students enter through My Classes after sign-in/SSO, academy entry and account return. Their sidebar contains My Classes rather than both Courses and My Classes. Class details reuse the existing assigned-course cards. Course detail returns to its API-resolved class, and programming/quiz return paths now retain the delivery class. Course and lesson URLs remain valid; only the old student catalog index redirects. Staff retain their existing Courses screen and entry routes.

Continue solving now appears on My Classes using an independent server-seeded drafts query. A drafts failure does not hide classes, a class-list failure does not hide saved work, and an expired learning session uses the existing sign-out action. Failed discards restore the optimistic row and show an error. The drafts cache has a server-read scope and does not fetch/invalidate an unused catalog. Class, course and continuation links disable automatic detail prefetch. A single saved draft fills its row rather than leaving a gray unused grid cell.

## Executed checks

- Web destination, sidebar, class-home composition, continuation/discard and navigation tests: 14 files, 167 tests passed. The continuation test also passed with React Strict Mode enabled, verifying no initial client draft read and rollback on discard failure.
- Existing API student-class and delivery-context permission/visibility regressions: 33 tests passed.
- Disposable PostgreSQL integration: 2 tests passed. Covered fixed read budgets, expanded classes/courses/drafts, shared-course class choice and rejection of inaccessible class identifiers.
- English/Korean translation parity and namespace payload budgets: 148 tests passed. The three continuation-state messages use a small page-specific namespace to keep the existing Korean learn namespace within budget.
- Chromium: 2 scenarios passed together, English and Korean. Covered student sign-in landing, a fresh My Classes render with zero catalog/draft hydration requests, hidden Courses navigation, class/course cards, keyboard course entry, selected-class Back links, programming exit, written/short-answer/choice/PDF/video parent links, a shared-course class chooser, reload, legacy catalog redirect, saved-draft resume with class choice, and academy-root entry. A Manager browser context also retained access to the staff Courses index.
- Web/API/E2E type checks, focused ESLint and `git diff --check` passed.

These are local application tests with isolated SSO/storage doubles, real API authorization and disposable PostgreSQL/Redis. Media checks verify the learning route and class-aware navigation, rather than production PDF delivery or video playback. No shared Supabase database was used. No schema migration was required.

## SQL statement evidence

Prisma query events used `COVE_INTEGRATION_DATABASE_URL` against disposable local `cove_dlab_test`. The fixture grows from 1 to 13 enrolled classes and from 1 to 20 visible courses and saved drafts; the shared course is assigned to all enrolled classes. These fixtures have no assigned teacher/photo. Counts are service statements, excluding common layout/account/session middleware reads and storage requests.

| Service read | Small | Expanded |
| --- | ---: | ---: |
| `learn.listClasses` | 11 | 11 |
| `learn.getClass` | 21 | 21 |
| `learn.listDrafts` | 6 | 6 |
| `learn.getCourseOutline` | 14 | 14 |
| My Classes main reads: class list + saved drafts | 17 | 17 |

Production service readers were reused unchanged. The assertions pin both individual budgets and their combined home-page budget. Class attribution comes from the existing delivery-context reader, without an extra class-detail request for the course Back link. Replayed router payloads may refresh by design; the hydration network check uses a fresh document and the seed behavior is also covered by a component regression.

## Screenshots

Desktop (1440 × 1000) and narrow (390 × 844) screenshots were captured from the real running application in both locales and visually inspected. Stable copies live in the ignored `test-results/student-my-classes/` directory:

- `en-my-classes-desktop.png` and `en-my-classes-mobile.png`.
- `en-class-courses-desktop.png` and `en-class-courses-mobile.png`.
- Equivalent `ko-` files and course-outline screenshots.

The isolated runner removed its temporary API build, PostgreSQL/Redis containers and test servers. Port 4000 was verified free at handoff. Screenshots remain local ignored artifacts.
