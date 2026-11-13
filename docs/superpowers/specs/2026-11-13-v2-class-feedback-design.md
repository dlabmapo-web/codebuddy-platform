# V2 course actions and staff class management feedback

Date: 2026-11-13

Branch: `fix/v2-feedback`

Source reviewed: `b688c495`

Status: proposed design for review; implementation has not started.

## Purpose and scope

Address Ron Kim's first four feedback items: clarify the library import action, distinguish class management from entering a class, make class editing reachable from the teaching flow, and enable Team Leads to configure class times.

The user confirmed that **Managers and Team Leads may edit class times; Teachers remain read-only**. This intentionally changes the current Manager-only schedule policy. Other class permissions continue to use the existing permission model.

Student navigation, classroom presentation, monitoring/tutoring reconnection, shared pointers, and grading are separate feedback items and outside this change.

## Findings from the current code

These findings come from source inspection, not a reproduction against the deployed platform.

| Feedback | Current implementation | Required change |
| --- | --- | --- |
| Library action wording and color | `CoursesManager` renders `academy-library:action` with `Button variant="outline"`. The New Course action uses the default blue brand button. Korean copy is `라이브러리에서 추가`; English is `Add from library`. | Change the copy and use the same default button variant as New Course. |
| Confusing class destinations | `/classes` uses `nav:link.classes` (`반` / `Classes`). Staff `/teach/classes` and student `/learn/classes` share `nav:link.my_classes`. | Rename the management destination and introduce a separate staff entry label. |
| Editing from My Classes | Clicking a teaching class opens `/teach/classes/[classId]`, a live roster. It has history and presence controls but no class-management action. `/classes/[classId]` already contains the editing forms. | Connect the live roster to the existing class editor for users with `classes.manage`. |
| Class time cannot be entered | `ClassSchedulePanel` already supports weekday selection, start/end time selection, saving, and removal. Its edit controls depend on `canManageClassSchedule(roles)`. Both that helper and the API require `class-schedule.manage`, currently held only by Managers. | Give Team Leads the existing schedule permission; retain the editor and server validation. |

The current schedule restriction explains why a Team Lead sees no entry controls. It does not prove that every reported input issue has the same cause; browser verification must also exercise the time pickers with an authorized account.

Class detail reads and writes are authorized with `classes.manage`, which Managers and Team Leads hold. A Teacher's monitoring access or class assignment does not grant class CRUD. Permission decisions must use the effective role set, including additional roles and the existing platform/support view resolution.

## Approach

**Recommended: reuse the existing management route.** Add a permission-gated entry from the live class page. Keep class details and schedules in their existing editor, and change the shared schedule permission so the web and API agree. This addresses the feedback with a small, reviewable change and adds no editor data read to the live roster.

Alternatives considered:

- Embed editing forms in the live roster. This offers editing without navigation, but requires additional class detail data, translation providers, mutation state, and synchronization while presence remains active.
- Redirect class cards to management for authorized staff. This makes editing immediate but sends staff to different destinations depending on their permissions and interrupts the existing live-class entry flow.

## 1. Import from Library

In the academy Courses view, render the library action as:

| Locale | Label |
| --- | --- |
| Korean | `라이브러리에서 가져오기` |
| English | `Import from Library` |

Use the existing default `Button` variant, matching New Course's `bg-brand`, foreground, hover, focus, and disabled treatment. Keep the Library icon, location, size, destination, and existing `canEdit && inAcademy` visibility gate.

The action still opens the existing library browsing/import flow; clicking it does not import a course immediately. No import service or API behavior changes.

## 2. Distinguish staff class navigation

Use these destination names consistently in the sidebar, destination page heading, and links that return to that destination:

| Destination | Korean | English |
| --- | --- | --- |
| Staff class management, `/classes` | `반 관리` | `Class Management` |
| Staff teaching entry, `/teach/classes` | `내 반 들어가기` | `Enter My Classes` |

Change `nav:link.classes` and `classes:title` to the management name. Add a dedicated staff navigation key such as `nav:link.enter_my_classes` and use it for the teaching group. Keep `nav:link.my_classes` for students, with its current `내 반` / `My classes` wording.

Update `monitoring:classes.title` and `monitoring:roster.back` to match the staff entry name. The live class page's server-rendered BackLink currently labels `/teach/classes` with `nav:link.solution_status`; correct it to the new staff key. Update the management detail back label to `반 관리로 돌아가기` / `Back to Class Management`.

Class names, table column labels, New Class actions, and ordinary uses of the noun “class” keep their existing wording. URLs, active navigation matching, role visibility, monitoring feature gates, and class scopes remain as currently implemented. In particular, a new label must not narrow a Manager or Team Lead's existing academy-wide monitoring scope.

## 3. Reach editing after entering a class

The flow becomes:

1. Open **Enter My Classes**.
2. Click a class card to open its existing live roster.
3. If the effective role set passes `canManageClasses(roles)`, show **반 정보 수정** / **Edit Class Information** beside the class heading.
4. The action opens the same academy's existing `/classes/[classId]` management page. Staff use its existing Edit control to change the class name and description, or its schedule panel to change class times.

Derive the action from the `roles` already returned by `requireAcademyRoute`, and render it through `StudioPage.actions`. Use the canonical route helper. Do not fetch full class detail, memberships, or permissions again merely to render the link. The monitoring roster request must still succeed before this action is presented.

The link is navigation, not a second class editor and not an automatic mutation. Class cards continue to enter the live roster. Teachers without `classes.manage` see no editing action; a Teacher who also holds an effective Team Lead or Manager role receives the permissions of that role set. Students receive no staff entry points. Direct requests continue to be authorized by the class API.

### Return path and fresh data

For this entry, append the fixed context marker `from=teaching` to the management URL. On the academy class detail page, recognize only that exact marker and provide **수업으로 돌아가기** / **Return to Class** leading to the live roster for the same academy and class. Other values use the normal management back link. Construct both paths from route parameters; do not accept a caller-provided return URL. The platform console retains its existing return behavior.

Saving name/description must invalidate the academy's teaching-class list and this class's teaching-roster query in addition to the existing management list. Apply the returned class detail to its existing cache as today. The live page must show the saved name/description when the user returns, including back/forward navigation; do not remount a stale cached roster as fresh. Reuse `server-read.ts` conventions where needed.

Keep the current mutation error handling, optimistic revision checks, and archive rules. An archived class cannot be edited or scheduled. A role or membership change after the link was rendered can still cause an API denial; the UI must show the existing error rather than treating the link as authorization.

## 4. Enable Team Lead schedule editing

Move `class-schedule.manage` from `managerOnlyPermissions` into the shared Team Lead permission set in `packages/shared/src/auth/roles.ts`. Managers inherit that set, so both roles retain exactly one copy of the permission. Do not substitute `classes.assigned.manage` or broaden class editing to ordinary Teachers.

| Effective role | Edit name/description | Edit schedule |
| --- | --- | --- |
| Manager | Yes | Yes |
| Team Lead | Yes | Yes, newly enabled |
| Teacher alone | No | No |
| Student | No | No |

The existing `canManageClassSchedule` helper and `ClassesService.requireScheduleManager` continue to check `class-schedule.manage`. Update Manager-only comments and permission tests to describe the new policy. This spec supersedes the Manager-only schedule rule in the student points design (§8.1); points calculation and historical awards are unchanged.

Retain `ClassSchedulePanel`, `TimePicker`, `WeekdayPicker`, and the `academyClasses.setSchedule` endpoint. For an active class with no schedule, show **시간 추가** / **Add time**. For an existing schedule, show **시간 수정** / **Edit times**. The draft supports selecting weekdays, choosing start/end times, adding/removing ranges, Save, and Cancel.

Preserve existing behavior:

- Store academy-local weekday/minute slots, not free text in the description.
- Submit the entire timetable with `expectedUpdatedAt`; reject stale revisions without overwriting a colleague's changes.
- Require at least one weekday per editor row and an end after the start. Retain shared numeric limits and the maximum of 21 expanded slots, counted across all selected weekdays.
- Preserve existing overnight slots without silently wrapping or altering their day offsets.
- Allow saving an empty timetable after removing every range. Display the existing explanation that a class with no schedule does not award attendance points.
- Keep exact-slot deduplication, ordering, transaction behavior, and the `class.schedule.updated` audit record.
- Keep drafts available after validation/network errors. Cancel discards local edits without writing.

Do not add a second display-only “class time” field or a second schedule table. No Prisma schema change, migration, backfill, or additional attendance calculation is needed.

## Data access constraints

The design adds no API endpoint, list projection, polling, or per-class permission request. The new link uses resolved server roles; schedule authorization uses the existing one-statement academy access reader. Initial page data stays in server rendering, with client caches seeded using existing patterns. Start any independent reads together.

The existing management detail service uses a deep Prisma include. This change reuses its route rather than pulling that data into every teaching page or card. Do not extend that include or use it for a new list. Any implementation that needs new curriculum fields must use `readCurricula`/`withCurriculum`; any new access read must reuse `academy-access-read.ts`.

Expected read-cost change: **zero additional SQL statements for the new teaching-page action, labels, styling, and schedule permission decision**. Opening management performs its existing detail read on navigation. Cache invalidation after a successful edit may refresh active affected views once; it must not introduce a refresh interval or invalidate unrelated academies/classes.

Before implementation is accepted, capture before/after SQL counts for teaching-list, teaching-roster, and management-detail requests using Prisma query events against disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`. Compare small and larger fixtures to prove that the new UI adds no per-row statements. Use `navigation-performance.integration.spec.ts` as the instrumentation pattern. Record measured counts in implementation evidence and state any changed count in the commit message; do not invent a baseline or test against shared Supabase databases.

## Implementation touchpoints

Paths under `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/`:

- `content/courses/_components/courses-manager.tsx`: library action styling.
- `_components/studio-sidebar.tsx`: separate teaching and student label keys.
- `teach/classes/page.tsx`: staff entry heading via monitoring translations.
- `teach/classes/[classId]/page.tsx`: resolved roles, editing action, corrected back label.
- `teach/classes/[classId]/_components/live-roster.tsx`: roster return label and cache freshness if required.
- `classes/[classId]/page.tsx` and `_components/class-header.tsx`: fixed teaching return context.
- `classes/[classId]/_hooks/use-class-detail-manager.ts`: invalidate affected teaching caches after class detail changes.

Other relevant files:

- `packages/i18n/src/locales/{ko,en}/{academy-library,nav,classes,monitoring}.json`.
- `packages/shared/src/auth/roles.ts` and `roles.spec.ts`.
- `packages/web/src/lib/academy-access-state.ts` and its permission tests.
- `packages/api/src/classes/classes.service.ts` and its schedule authorization tests.
- `packages/web/src/lib/server-read.ts`, canonical routes, and content-path helpers as existing conventions.

The implementation must reread the installed Next.js guides relevant to any route/component changes. Source review for this spec consulted the local Server and Client Components and Fetching Data guides under `packages/web/node_modules/next/dist/docs/`.

## Acceptance and verification

1. Korean and English Courses pages show the new import wording and the same blue button treatment as New Course. Existing library routing and permission visibility still work.
2. Manager and Team Lead sidebars distinguish Class Management from Enter My Classes. Teaching headings, tooltips, mobile navigation, and back links agree. Student My Classes copy stays unchanged.
3. Entering a class still opens the live roster. An authorized Manager/Team Lead can reach its existing management page, edit its name/description, save, and return to the same live class with fresh information. The normal management and console return paths still work.
4. A Teacher alone sees no editing entry and receives an API denial if attempting class edits or schedule writes directly. A multi-role Teacher/Team Lead receives Team Lead permissions. Suspended memberships and cross-academy identifiers remain denied.
5. Manager and Team Lead accounts can add a timetable, select multiple weekdays, change both time pickers, save, reload, edit again, and clear it. Test an ordinary daytime range and a stored overnight range. An archived class remains non-editable.
6. Invalid ranges/slot limits, Cancel, pending saves, network errors, stale revisions, and audit records retain their existing behavior. Attendance-point behavior is unchanged apart from the authorized people who can configure the timetable.
7. Focused shared permission, web capability/navigation, and API authorization tests pass. Browser coverage exercises the complete staff flow and verifies the time controls, rather than only inspecting component props. Use isolated fixtures for writes.
8. Run the affected packages' type checks and existing i18n, canonical route, and theme checks. Visually check Korean and English layouts on desktop/mobile and light/dark themes, particularly the longer navigation labels and adjacent blue course actions.
9. SQL-count evidence confirms no added per-row reads or repeated initial hydration fetch introduced by this change.

This document is the reviewable deliverable for the current request. Runtime verification and implementation checks above are requirements for the later code change, not claims that those checks have already run.
