# V2 navigation and classes table QA

- Date: 2026-11-05
- Branch: `fix/v2-qa`
- Base branch: `feat/cove-studio-v2`
- Status: Ready for review; implementation pending.

## User direction

Temporarily hide the academy Overview for every user type. Send staff directly
to their class work after sign-in, move Maintenance to the bottom of the sidebar,
and use **코스** for the Korean Courses navigation label. Improve the existing
classes table's appearance and usability while preserving its capabilities.

The two supplied screenshots are the reference for the current manager Overview
and classes list. Preserve Cove's existing typography, blue accent, theme tokens,
and overall studio layout.

## Current behavior

- `studioNavGroups` adds an Overview group unconditionally, linking to
  `/academy/[academySlug]`.
- The academy root renders a different dashboard for students, teachers,
  managers, and team leads. Hiding the navigation alone would still allow these
  dashboards to render after login, academy switching, or a bookmarked root URL.
- `authDestination` currently sends active members to the academy root.
- Maintenance appears in a Curriculum group before Teaching and People.
- The visible Courses row uses `nav:link.shared_courses`, whose Korean value is
  `강좌`. The separate `nav:link.courses` value already says `코스`.
- `ClassesTable` uses the shared `DataTable` and already supports search, status
  filtering, sorting, column visibility, pagination, and class actions.

## Approach

Use role-based entry routes and a focused refinement of the existing table.
Merely hiding Overview would leave its dashboard requests on the default entry
path. Replacing the table with cards would change the established workflow and
make comparison across classes harder. Neither meets the full request as well as
keeping the table and bypassing the dashboards before they render.

### 1. Hide Overview and bypass its data loading

Remove the Overview link and its otherwise empty group from the academy sidebar
for every role, including the collapsed and mobile sidebar.

Turn `/academy/[academySlug]` into an authenticated server redirect to the
appropriate work page:

| Primary academy role | Destination | Label |
| --- | --- | --- |
| Manager | `/academy/[academySlug]/classes` | Classes / 반 |
| Team lead | `/academy/[academySlug]/classes` | Classes / 반 |
| Teacher | `/academy/[academySlug]/teach/classes` | My classes / 내 반 |
| Student | `/academy/[academySlug]/learn/courses` | My courses/catalog |

Students use the existing course catalog as the replacement entry page. This
does not create a new student page or change enrollment visibility.

The redirect must happen before any Overview component renders or any
Overview-specific data is requested. Keep the existing Overview components and
API endpoints available in source for later restoration; this task disables
their academy entry point rather than deleting the feature implementation.

Use one shared role-to-destination mapping for normal sign-in and root fallback
routing. Active members should land directly on their destination after normal
sign-in. Audit the SSO callback and academy-switch paths so they follow the same
policy. Explicit valid deep links, such as a requested lesson after login, must
retain their existing behavior.

For members with multiple held roles, use their primary academy role consistently
with the current root-page behavior. Do not select an entry route by whichever
permission happens to be checked first. For authorized platform/support access
without a membership, use the role resolved by the existing route guard. Preserve
the lobby, suspended-account handling, onboarding, platform console routing, and
all destination-page authorization checks.

Do not catch a Next.js redirect as a recoverable data error. Update outdated
comments and route expectations that still describe Overview as the landing page.

### 2. Navigation order and Korean label

- Place Maintenance in the bottom utility area of the sidebar, after all normal
  navigation groups and immediately above the existing My page footer. On short
  screens it must remain reachable through the sidebar's existing scrolling.
- Remove its old upper Curriculum group when that group becomes empty.
- Preserve the existing `canRunMaintenance` visibility requirement and route.
- Change the visible Korean Courses row from `강좌` to `코스` by updating the
  translation key actually used by that row (`nav:link.shared_courses`). Preserve
  the English label and unrelated course/lesson terminology.
- Maintain correct active-link highlighting, collapsed tooltips, mobile dismissal,
  application badges, and the fixed My page footer.

### 3. Classes table refinement

The list's job is to help managers and team leads quickly identify a class,
check its staffing and enrollment, and open or manage it.

- Keep the existing table and its seven columns: Class, Status, Assigned courses,
  Students, Teacher, Updated, and Actions.
- Keep the page title and count clearly visible below the studio header; check
  the clipped heading visible in the supplied screenshot during visual QA.
- Align search and status filters on the left and column visibility and New class
  actions on the right. Let the toolbar wrap cleanly on smaller viewports.
- Give class names the strongest text emphasis and enough column width to read
  long Korean names. Use bounded wrapping so one long name cannot stretch the
  entire table. Descriptions remain secondary; avoid repeatedly emphasizing a
  missing-description placeholder.
- Balance column widths so names, course chips, teachers, and row actions do not
  compete for the same space. Use consistent vertical alignment and restrained
  row padding to improve scanning.
- Keep status text alongside its colored indicator. Align student counts
  consistently with tabular numerals. Keep dates quiet and readable.
- Keep teacher initials, name, assistant count, and unavailable-assignment state.
  Truncation must not hide all identifying information.
- Keep the two-course chip limit and `+N` overflow count. Make truncated course
  titles discoverable on hover and keyboard focus, while retaining an accessible
  complete course list. Do not add per-row course requests.
- Keep a clearly identifiable Open link and a separate overflow menu. Add visible
  keyboard focus and a subtle row hover treatment without making the whole row
  an ambiguous clickable target.
- Preserve the existing mobile teacher information inside the Class cell. Allow
  contained table scrolling when necessary; do not cause page-wide overflow.
- Use existing theme tokens for light and dark modes. Avoid new fonts, animations,
  dashboard summary panels, or extra data queries.

Keep search, status filtering, sorting, column visibility, pagination, creation,
opening, editing, archiving, restoring, and deletion behavior. Preserve existing
archive/delete confirmations, pending and disabled states, permission rules, and
error/empty messages. Changes to the shared DataTable should be limited to
optional styling hooks if needed, so other tables retain their current layout.

## Performance and boundaries

The measurable performance requirement is that entry into an academy no longer
loads Overview data. This does not promise a specific overall response-time
improvement or remove normal shell/authentication reads.

No backend schema, role permissions, SSO identity mapping, enrollment, grading,
course ownership, production configuration, or deployment changes are included.
Do not remove shared API endpoints or change class list query semantics. Keep the
unrelated local AWS Lightsail migration document untouched.

## Acceptance criteria

1. Overview is absent for all four roles in desktop, collapsed, and mobile
   navigation. No empty Overview heading remains.
2. Normal login sends managers and team leads to Classes, teachers to My classes,
   and students to the existing course catalog. Explicit valid post-login deep
   links still work.
3. Visiting the academy root, refreshing it, or switching academies reaches the
   same role-appropriate destination without rendering an Overview.
4. Primary-role selection is deterministic for multi-role members. Authorized
   support access works, and onboarding, applicant, suspended, and platform-only
   flows retain their existing access behavior.
5. Network inspection or request instrumentation confirms that root entry and
   sign-in do not invoke Overview-specific data requests. Authentication and
   destination-page requests are expected.
6. Maintenance appears below every normal navigation group, above My page, only
   for authorized users. It remains usable on a short viewport.
7. The Korean Courses navigation row displays `코스`; its English label is
   unchanged. Active highlighting and collapsed tooltips still match the route.
8. The classes title is visible, and long Korean names, multiple courses, empty
   descriptions, zero students, long teacher names, and archived classes remain
   legible without overlapping cells or actions.
9. Search, filters, sorting, column visibility, pagination, and every existing
   class action still work with the same confirmations and access rules.
10. Keyboard users can reach toolbar controls, Open links, course-title details,
    and row menus with visible focus. Light/dark mode and a narrow mobile
    viewport remain usable without page-wide horizontal overflow.

## Implementation surfaces and validation

Expected surfaces:

- `packages/web/src/lib/academy-access-state.ts` and a shared role-entry helper.
- Academy root `page.tsx`, the SSO callback where applicable, and navigation
  entry paths that currently assume the root is a dashboard.
- `studio-sidebar.tsx` and its existing navigation tests.
- `packages/i18n/src/locales/ko/nav.json`.
- Classes page, `classes-manager.tsx`, and `classes-table.tsx`; optional scoped
  DataTable styling hooks only when required.

Before implementation, read the installed Next.js guides for redirects and the
relevant routing APIs under `packages/web/node_modules/next/dist/docs/`, as
required by this repository's AGENTS.md.

Extend focused existing tests for the role-entry mapping, login destinations,
root redirect, sidebar visibility/order, and relevant access-state exceptions.
Do not add tests that merely assert CSS class strings. Run the web typecheck,
focused tests, and applicable lint/i18n checks. Verify the table in a browser
with representative class data, record desktop/mobile and light/dark screenshots,
and check entry requests for unintended Overview loading. Report any validation
that cannot run because local services or test accounts are unavailable.
