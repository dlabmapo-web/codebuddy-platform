# V2 navigation and classes QA verification

Date: 2026-11-05

Branch: `fix/v2-qa`

Spec: [Navigation and classes QA](../superpowers/specs/2026-11-05-v2-navigation-and-classes-qa-design.md)

## Implemented behavior

- A shared primary-role entry mapping sends managers and team leads to Classes,
  teachers to My classes, and students to the existing course catalog.
- Normal sign-in, SSO root destinations, and academy switching use that mapping.
  Explicit SSO course links remain intact. The authenticated academy root is a
  redirect fallback and imports no Overview components or dashboard data client.
  Applicants remain in the lobby rendered by the existing layout.
- Overview is absent from every member role's navigation. Maintenance is the
  final utility group above My page, with scrolling available at icon width.
  Collapsed navigation links now retain accessible names.
- The visible Korean Courses label uses `코스`.
- The classes table uses bounded column widths and wrapping, linked class names,
  secondary descriptions only when present, two rows of course chips with a
  complete hover/focus tooltip, aligned enrollment counts, and visible keyboard
  focus. Existing table state, class mutations, and confirmations are retained.

## Automated checks

- Focused web tests: **92 passed across 7 files**, covering entry mapping,
  authentication access states, root redirects, support/platform role routing,
  applicant handling, SSO destinations and deep links, navigation groups, and
  shared table state behavior.
- Web TypeScript check passed.
- E2E TypeScript check passed.
- Translation check passed: **140 tests**, with no stale keys or copy markers.
- Changed-file ESLint passed with no errors. The shared DataTable retains its
  existing React Compiler warning about TanStack Table's incompatible API.
  The SSO route and its test were also linted explicitly with `--no-ignore`.
- Whitespace validation passed.

New authenticated browser scenarios cover all four entry destinations and root
refreshes. The 12 existing Overview UI scenarios are explicitly skipped while
the feature is hidden; their separate analytics and API authorization scenarios
remain active, with setup warming the active analytics route.

## Browser verification

Ran Chromium against the actual sidebar, table, dialogs, translation providers,
and theme styles in a temporary local fixture harness. Framework navigation and
API/mutation callbacks were stubbed; the fixture used 14 classes including long
Korean names, six assigned courses, zero students, archived classes, missing
teachers, and unavailable teacher assignments.

**23 checks passed**, with no page errors in the main 18-check run. Four
additional checks covered sorting, typed deletion confirmation, mobile sidebar
dismissal, and English label sizing. A final check confirmed that assistant
counts remain visible and accessible in Korean and English, and all five
screenshots were refreshed after allowing teacher details to wrap. The recorded check list is in
[browser-checks.json](assets/2026-11-05-v2-navigation-and-classes-qa/browser-checks.json).

Verified search/reset, archived-status filtering, column visibility, pagination,
numeric sorting/reset, full course titles on keyboard focus, equivalent class
name/Open destinations, edit/create callbacks, archive confirmation, restore,
and typed deletion confirmation. Also verified heading visibility, contained
mobile table scrolling, mobile teacher information, mobile sidebar dismissal,
and Maintenance reachability in short and collapsed sidebars.

Visual inspection covered desktop at 1440px and mobile at 390px in light and dark
themes. English status badges and row actions fit their columns.

- [Desktop light](assets/2026-11-05-v2-navigation-and-classes-qa/desktop-light.png)
- [Desktop dark](assets/2026-11-05-v2-navigation-and-classes-qa/desktop-dark.png)
- [Mobile light](assets/2026-11-05-v2-navigation-and-classes-qa/mobile-light.png)
- [Mobile dark](assets/2026-11-05-v2-navigation-and-classes-qa/mobile-dark.png)
- [English table](assets/2026-11-05-v2-navigation-and-classes-qa/desktop-english.png)

## Limits

The configured development environment points to hosted services, and no local
API/web application servers were running. Full authenticated end-to-end tests
were added but not run against that backend. The browser fixture verifies
component behavior and callbacks, rather than persisted mutations or live SSO.
The root redirect unit tests reject unexpected direct dashboard/account reads;
live server request tracing and overall latency measurement remain unverified.

No production configuration, deployment, schema, or API authorization changes
were made. The unrelated local Lightsail migration document is untouched.
