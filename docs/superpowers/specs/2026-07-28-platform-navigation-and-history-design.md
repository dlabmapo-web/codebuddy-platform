# Platform Navigation and Browser History Design

**Date:** 2026-07-28
**Status:** Approved for implementation planning
**Scope:** Student, teacher, and admin navigation, browser history, role access, and fullscreen return behavior

## 1. Summary

Cove Studio will use one URL-first navigation model across every role.
Meaningful application state belongs in the URL, fullscreen workspaces carry
an explicit validated return destination, and browser Back/Forward follows the
same state transitions as visible Back and List controls.

The first implementation keeps the existing Next.js pages and visual
structure. It does not perform a full nested-route rewrite. It introduces:

- exact return-state restoration for student and teacher fullscreen pages;
- URL-backed drill-down, selection, tab, search, and filter state;
- predictable browser history behavior for admin problem management;
- one capability model shared by middleware, layouts, navigation, pages, and
  APIs;
- a unified admin navigation shell that includes monitoring and management;
- a supported pre-hydration theme script that does not trigger React's
  executable-script warning during client navigation; and
- end-to-end coverage for the critical navigation journeys.

## 2. Current Problems

### 2.1 Student catalog return

The problem workspace currently reconstructs its List destination from the
active problem's stage and chapter. This loses the actual catalog state the
student left:

- subject selection;
- search query;
- expanded chapter set;
- scroll position; and
- entry source, such as personal submission history.

If curriculum navigation metadata is unavailable, List falls back to bare
`/problems`, which opens the catalog's first page.

### 2.2 Teacher state restoration

The teacher feedback workspace always links to `/students`. This is acceptable
as a fallback, but it does not restore:

- student search and status filters;
- list scroll position; or
- the exact monitoring context that opened the session.

Teacher Progress stores its active tab, selected student, curriculum filters,
expanded problem sections, and code modal only in component state. Refresh and
browser history discard that context.

### 2.3 Admin browser history

Admin problem management stores subject, stage, chapter, selected problem,
edit mode, and expanded form section only in component state. All drill-down
and edit actions leave the URL at `/admin/problems`. Browser Back therefore
leaves the page instead of reversing the most recent admin navigation step.

Admin Users and AI Feedback filters and edit targets have the same
refresh/history limitation.

### 2.4 Conflicting role authorization

The current route layers disagree about admin access:

- middleware permits admins to access Dashboard, Students, and Progress;
- the related APIs permit teacher and admin access;
- the feedback page permits teacher and admin access;
- the teacher layout rejects every non-teacher; and
- middleware restricts `/feedback` to teachers.

This disagreement can create redirect chains and surprising Back behavior.

### 2.5 Root executable script warning

The root layout renders an executable native `<script>` element for theme
initialization. React 19 can encounter that element while reconstructing a
layout during client history navigation and report that scripts inside React
components are not executed.

## 3. Goals

- Make visible Back/List controls and browser Back/Forward agree.
- Restore the exact useful context a user left.
- Make meaningful route state refreshable, shareable, and testable.
- Keep transient presentation state out of the URL.
- Preserve the smooth, mounted student coding workspace during Previous/Next.
- Provide admins with intentional access to monitoring and management tools.
- Define route authorization once and enforce it consistently at every layer.
- Remove the React script warning without reintroducing a theme flash.
- Deliver the change incrementally within the existing MVP architecture.

## 4. Non-Goals

- Rebuilding the application as a new nested-route hierarchy.
- Persisting unsaved form drafts across browser sessions.
- Adding breadcrumbs to every page in the first release.
- Changing curriculum ordering, judge behavior, or collaboration semantics.
- Giving students access to teacher or admin routes.
- Preserving arbitrary external return URLs.
- Treating every modal, dropdown, toast, or accordion as history state.

## 5. Navigation State Policy

Every UI state belongs to one of three categories.

### 5.1 URL state

Use the URL for state that changes what resource or dataset the user is
viewing and should survive refresh:

- selected subject, stage, chapter, problem, student, or submission;
- primary tab;
- search query;
- status and role filters;
- sort order when applicable;
- edit/create mode when it represents a navigable panel; and
- a validated fullscreen return destination.

### 5.2 Session restoration state

Use tab-scoped `sessionStorage` for view state that should be restored when
returning but should not make a shared URL behave differently:

- scroll position;
- expanded chapter or result groups that are not primary navigation;
- cursor/focus restoration when safe; and
- the last catalog return target as a fallback.

Keys must include the route and relevant entity identity so one stage,
student, or admin hierarchy does not overwrite another.

### 5.3 Local component state

Keep short-lived presentation state in React:

- dropdown menus;
- hover and tooltip state;
- toast messages;
- destructive confirmation dialogs;
- active drag/resize gestures;
- loading indicators; and
- transient validation messages.

## 6. Browser History Rules

### 6.1 Push history

Create a new browser entry for actions a user reasonably expects Back to
reverse:

- opening a subject, stage, chapter, problem, student, or submission;
- opening an edit/detail panel;
- changing a primary tab;
- entering a fullscreen workspace; and
- student Previous/Next problem navigation.

### 6.2 Replace history

Replace the current entry for refinements that should not create a long Back
stack:

- debounced search input;
- status, difficulty, role, and similar filters;
- sort order;
- expanded form section; and
- correcting an invalid or unavailable URL parameter.

### 6.3 Back and explicit return

Do not implement important List or Back controls with unconditional
`router.back()`. Previous/Next, direct links, redirects, and new tabs make the
previous history entry unreliable.

Fullscreen pages use an explicit `returnTo` value when available and a
role-specific deterministic fallback otherwise. Browser Back still follows
the actual history stack.

## 7. Safe Return Destinations

### 7.1 Contract

Fullscreen routes may receive:

```text
?returnTo={encoded internal path and query}
```

Examples:

```text
/problems/{problemId}?returnTo=%2Fproblems%3Fstage%3Dstage-1%26chapter%3Dchapter-2
/problems/{problemId}?sid={submissionId}&returnTo=%2Fme%3Fstatus%3Dfail
/feedback/{sessionId}?returnTo=%2Fstudents%3Fstatus%3Donline
```

### 7.2 Validation

A shared parser must:

1. decode the value once;
2. require a leading `/`;
3. reject protocol-relative paths beginning with `//`;
4. reject values containing an origin, scheme, or control characters;
5. allow only route prefixes approved for the active role; and
6. return a deterministic fallback when validation fails.

The validated value is the only value passed to Link, `router.push`, or native
History APIs.

### 7.3 Propagation

Student Previous/Next must preserve the same validated `returnTo` query while
changing only the problem ID. Historical `sid` does not propagate into normal
Previous/Next navigation.

## 8. Student Experience

### 8.1 Catalog URL

The student catalog supports:

```text
/problems
/problems?subject={subjectId}&stage={stageId}
/problems?subject={subjectId}&stage={stageId}&chapter={chapterId}
/problems?subject={subjectId}&stage={stageId}&chapter={chapterId}&q={search}
```

The URL is authoritative for subject, stage, chapter, and search. Invalid
combinations are normalized by removing the invalid child parameters while
preserving the nearest valid parent.

### 8.2 Opening a problem

Problem cards and Continue Solving entries should be real links when possible
so standard browser behaviors such as opening in a new tab remain available.
They include a validated `returnTo` built from the current catalog URL.

Before navigation, save the catalog scroll position under a tab-scoped key.

### 8.3 Problem List control

The List control resolves its destination in this order:

1. validated `returnTo`;
2. tab-scoped last catalog route for this workspace;
3. current problem's published subject/stage/chapter route; and
4. `/problems`.

Returning restores URL-backed state first, then scroll and non-primary
expansion state after the list has loaded.

### 8.4 Previous and Next

The existing mounted-workspace transition remains:

- load the complete destination snapshot in the background;
- keep the current workspace visible and read-only;
- apply the destination atomically;
- write the new problem URL with native `history.pushState`; and
- preserve the validated `returnTo`.

Browser Back/Forward continues using the same background transition path.

### 8.5 Personal history

Submission-history filters become URL-backed. Opening a historical submission
uses:

```text
/problems/{problemId}?sid={submissionId}&returnTo={encoded /me route}
```

The fullscreen List/Back label should reflect its origin:

- `목록` for the curriculum catalog;
- `풀이 기록` for personal history.

## 9. Teacher Experience

### 9.1 Teacher shell

Dashboard, Students, and Progress remain inside the persistent teacher shell.
Sidebar navigation creates normal top-level history entries.

### 9.2 Students

Students supports:

```text
/students?q={search}&status={all|online|solving|offline}
```

Search uses debounced replace navigation. Status changes replace the current
entry. Scroll restoration is tab-scoped.

Opening a live session creates:

```text
/feedback/{sessionId}?returnTo={encoded current students route}
```

### 9.3 Feedback workspace

The header Back control returns to the validated teacher/admin monitoring
route. Its fallback is `/students`.

The feedback workspace remains fullscreen because the editor benefits from
maximum horizontal space. Leaving it stops local execution and releases
collaboration resources through existing cleanup behavior.

### 9.4 Progress

Progress supports URL state for:

```text
tab={student|problem}
student={studentId}
subject={subjectId}
stage={stageId}
chapter={chapterId}
```

Opening a submission code modal may add `submission={submissionId}` if the
modal is intended to survive refresh and be shareable. Accordion expansion
remains session/local state.

Invalid selected students, curriculum descendants, or submissions are
removed with replace navigation and an inline empty/error state.

## 10. Admin Experience

### 10.1 Unified admin shell

Admin navigation contains two labeled groups:

**Monitoring**

- Dashboard
- Students
- Progress

**Management**

- Problem Management
- AI Feedback Standards
- User Management

The same admin identity and shell remain mounted across both groups. Admins do
not pass through a teacher-only layout or bounce through `/login`.

### 10.2 Problem management URL

Admin hierarchy is represented as:

```text
/admin/problems
/admin/problems?subject={subjectId}
/admin/problems?subject={subjectId}&stage={stageId}
/admin/problems?subject={subjectId}&stage={stageId}&chapter={chapterId}
/admin/problems?subject={subjectId}&stage={stageId}&chapter={chapterId}&problem={problemId}&mode=edit
/admin/problems?subject={subjectId}&stage={stageId}&chapter={chapterId}&mode=create
```

Subject, stage, chapter, and problem drill-down use push navigation. Changing
an expanded form section uses replace navigation or local state.

### 10.3 Admin Back behavior

Repeated browser Back follows:

```text
Edit/create panel
→ problem list
→ chapter list
→ stage list
→ subject list
→ previous platform page
```

Visible breadcrumbs and Close/Back controls write the same URLs as browser
history. Closing a panel that was opened through a history entry uses Back;
directly opened edit URLs replace or navigate to their parent hierarchy.

### 10.4 Users and AI Feedback

Admin Users uses URL state for:

```text
q={search}
role={all|student|teacher}
status={all|active|inactive}
user={userId}
```

Admin AI Feedback uses URL state for:

```text
type={all|patternType}
pattern={patternId}
mode={create|edit}
```

Destructive confirmation dialogs remain local and do not create history
entries.

## 11. Role Capabilities

### 11.1 Capability matrix

| Capability | Student | Teacher | Admin |
| --- | ---: | ---: | ---: |
| View student catalog and own history | Yes | No | No |
| Solve student problems | Yes | No | No |
| View teacher dashboard | No | Yes | Yes |
| View student monitoring | No | Yes | Yes |
| View progress analytics | No | Yes | Yes |
| Open live feedback workspace | No | Yes | Yes |
| Manage curriculum and problems | No | No | Yes |
| Manage AI feedback standards | No | No | Yes |
| Manage users | No | No | Yes |

### 11.2 One source of truth

Create a shared route/capability definition that supplies:

- route prefix;
- permitted roles;
- role home destination;
- navigation visibility; and
- safe `returnTo` prefixes.

Middleware/proxy, server layouts, sidebar composition, fullscreen pages, and
API role checks must derive from or be tested against the same capability
matrix.

Server layouts may still make an independent authorization check for defense
in depth, but that check must use the same permitted-role list instead of a
different hard-coded rule.

### 11.3 Unauthorized navigation

- Missing or invalid authentication goes to `/login`.
- An authenticated user without a capability goes directly to their role
  home.
- Do not redirect an authenticated user to `/login` merely because their role
  is wrong; this creates unnecessary redirect chains.
- Redirect responses replace history where possible so Back does not loop
  through forbidden routes.

## 12. Root Theme Script

Replace the executable native script in the root layout with Next.js
`Script`:

```tsx
import Script from 'next/script';

<Script
  id="cove-theme-init"
  strategy="beforeInteractive"
  dangerouslySetInnerHTML={{ __html: themeInitScript }}
/>
```

The script remains in the root layout, runs before hydration, and keeps the
existing no-flash theme behavior. The stable ID lets Next.js track it across
route transitions.

The implementation must confirm:

- saved light and dark themes apply before first paint;
- system preference still supplies the initial fallback;
- client navigation does not add duplicate theme scripts; and
- Safari and Chrome consoles do not report executable-script rendering
  warnings.

## 13. Shared Navigation Utilities

Introduce small focused modules rather than duplicating route strings:

### 13.1 Return destination

Responsibilities:

- encode a current internal route;
- validate and decode `returnTo`;
- choose role-specific fallbacks; and
- preserve return state across fullscreen sibling navigation.

### 13.2 URL parameter helpers

Responsibilities:

- update query parameters while preserving unrelated valid parameters;
- remove empty/default parameters;
- distinguish push from replace operations; and
- normalize dependent parameters such as subject → stage → chapter.

### 13.3 Scroll restoration

Responsibilities:

- generate stable tab-scoped keys;
- save before leaving;
- restore once the destination data and target content are ready; and
- expire or overwrite obsolete values without affecting other tabs.

These utilities must be framework-light and unit-testable.

## 14. Loading and Failure Behavior

- Keep the existing shell visible while a same-shell dataset changes.
- Use localized skeletons for a list or panel rather than replacing the whole
  application shell.
- Fullscreen direct entry may use a full workspace loader because there is no
  previous valid content.
- Failed return-state restoration falls back safely and shows the destination
  page rather than trapping the user.
- A failed detail/workspace load keeps the last valid workspace when one
  exists and offers Retry.
- URL normalization uses replace so invalid entries do not remain in history.

## 15. Accessibility and UI Consistency

- Every Back/List control has an accessible name that describes its
  destination.
- Tooltips may include the destination label but are not the only accessible
  description.
- Disabled controls remain visible where removing them would shift layout.
- Focus moves to the new page heading after a full page transition.
- Focus remains stable during student Previous/Next background loading and
  returns to the relevant control after recoverable failure.
- Breadcrumbs use ordered navigation semantics and expose the current item.
- Loading state uses `aria-busy` on the affected region.

## 16. Testing Strategy

### 16.1 Unit tests

- safe internal `returnTo` acceptance;
- external, protocol-relative, malformed, and role-forbidden return rejection;
- query update and default-parameter removal;
- dependent curriculum parameter normalization;
- capability matrix coverage for every protected route;
- role-specific fallback resolution; and
- scroll key isolation.

### 16.2 Integration tests

- proxy and server layouts agree for every route/role pair;
- APIs enforce the same capabilities as their pages;
- student Previous/Next preserves `returnTo`;
- theme script renders once with the supported Next.js component; and
- direct edit/detail URLs reconstruct their parent state.

### 16.3 Browser E2E journeys

**Student**

1. Open a filtered catalog and scroll.
2. Open a problem.
3. Navigate Next and Previous without workspace remount.
4. Choose List and verify the exact catalog URL, expansion, and scroll.
5. Open a historical submission from `/me` and return to the same filters.

**Teacher**

1. Filter Students.
2. Open a live feedback session.
3. Use visible Back and browser Back in separate runs.
4. Verify filters and scroll restore.
5. Refresh filtered Progress and verify tab/student/curriculum state.

**Admin**

1. Enter subject, stage, chapter, and problem edit mode.
2. Press browser Back repeatedly and verify each hierarchy step.
3. Open the same edit URL directly and close to the correct parent.
4. Navigate between Monitoring and Management without redirecting through
   login.
5. Open live feedback as admin and return to monitoring.

**Cross-role and browser**

1. Exercise every protected route as student, teacher, admin, and anonymous.
2. Verify direct forbidden navigation reaches role home without a loop.
3. Run critical journeys in Chromium and WebKit/Safari-compatible automation.
4. Assert there are no React script, hydration, or duplicate-script console
   warnings.

## 17. Implementation Sequence

Implement in dependency order:

1. Add shared capability and safe-return utilities with unit tests.
2. Align proxy, layouts, fullscreen authorization, APIs, and navigation
   visibility.
3. Replace the root native script with Next.js `Script` and verify theme
   behavior.
4. Add URL-backed student catalog/history state and fullscreen return
   propagation.
5. Add URL-backed teacher Students/Progress state and feedback return
   propagation.
6. Add the unified admin shell and URL-backed problem hierarchy/edit state.
7. Add URL-backed Admin Users and AI Feedback filters/panels.
8. Add scroll restoration and cross-browser E2E coverage.

Each step must leave direct URLs, refresh, visible Back, and browser
Back/Forward working before moving to the next role surface.

## 18. Acceptance Criteria

- Student List returns to the exact originating catalog or personal-history
  context.
- Student Previous/Next remains smooth and preserves return context.
- Teacher feedback returns to the exact monitoring context.
- Teacher filters, tabs, and selected entities survive refresh.
- Admin browser Back reverses edit and hierarchy navigation before leaving
  Problem Management.
- Admin can intentionally access Dashboard, Students, Progress, and Feedback
  from the unified admin shell.
- Student and teacher cannot access admin management capabilities.
- Middleware, layouts, pages, navigation, and APIs agree on role access.
- Forbidden direct routes do not create login/role-home redirect loops.
- The theme applies before paint and produces no executable-script warning.
- Chrome and Safari/WebKit E2E journeys pass without hydration or navigation
  console errors.
