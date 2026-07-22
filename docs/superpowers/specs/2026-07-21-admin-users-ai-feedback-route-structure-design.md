# Admin Users and AI Feedback Route Structure Refactor

Date: 2026-07-21
Status: Awaiting user approval

## Summary

Refactor the `/admin/users` and `/admin/ai-feedback` routes so their `page.tsx` files become thin Server Components and each route owns focused screen, workflow, presentation, and type modules in private folders.

The organization follows the route structure already established for student, teacher, and admin-problems routes. The two routes keep their domain behavior separate. Only their identical bottom toast presentation moves to one shared admin-group module.

This is a structure-only refactor. It must preserve the current visual design, Korean copy, filters, request timing, endpoints, request methods, response assumptions, validation, optimistic updates, rollback behavior, loading states, empty states, error messages, and user interactions.

## Goals

- Keep both `page.tsx` files focused on Next.js routing and composition.
- Separate user administration from AI-feedback-pattern administration.
- Concentrate each route's data and mutation workflow in one route-private hook.
- Separate substantial visual responsibilities without creating shallow pass-through modules.
- Share only the identical admin toast used by both routes.
- Keep route-owned implementation beside the route that owns it.
- Follow the same locality and file-size rules as the completed student, teacher, and admin-problems refactors.

## Non-goals

- Changing either feature's UI, copy, styling, responsive behavior, or accessibility behavior.
- Changing API handlers, endpoint paths, request bodies, response shapes, database queries, or authorization.
- Refactoring `/admin/problems`, the admin layout, authentication, or non-admin routes.
- Creating a generic admin CRUD framework, list framework, modal framework, or form framework.
- Sharing filters, lists, dialogs, role badges, or pattern presentation between unrelated routes.
- Changing user password policy or AI-feedback-pattern validation.
- Introducing React Query, SWR, a global state library, or a new testing framework.

## Current Problems

### `/admin/users`

`src/app/(admin)/admin/users/page.tsx` is a 471-line Client Component containing:

- route entry behavior;
- user, statistics, and edit-form types;
- role labels and colors;
- online and relative-time calculations;
- user fetching and query-parameter construction;
- search, role, and active-status filter state;
- summary statistics;
- activation/deactivation mutations;
- edit-target and toast state;
- edit-form validation and user update requests;
- password visibility and modal state;
- headings, summary cards, filters, loading skeletons, empty state, user rows, modal, and toast presentation.

The route entry has no small interface. Understanding fetching, filters, user mutation, modal behavior, or a visual change requires reading nearly the whole implementation.

### `/admin/ai-feedback`

`src/app/(admin)/admin/ai-feedback/page.tsx` is a 390-line Client Component containing:

- route entry behavior;
- pattern form types and defaults;
- pattern-type presentation rules;
- pattern fetching and type-filter derivation;
- create/edit modal state and save requests;
- deletion confirmation and requests;
- optimistic active-state toggling and rollback;
- toast state;
- headings, filters, loading skeletons, empty state, pattern cards, modal, deletion dialog, and toast presentation.

The optimistic mutation rules and pattern presentation are mixed into the same file as modal form state and route composition.

### Proven shared presentation

Both routes contain the same bottom-center toast implementation with the same success/error colors, typography, shadow, position, and three-second lifetime. Two callers justify one small admin-group presentation seam.

The `/admin/problems` route uses a visually different top-right toast and must not be changed to use the shared bottom toast in this refactor.

## Considered Approaches

### 1. Keep everything route-private

Refactor both routes independently and duplicate their identical toast.

This would preserve maximum route locality, but it would keep a proven two-caller presentation implementation duplicated without providing any domain benefit.

### 2. Route-private workflows with one shared toast — selected

Keep user administration and AI-feedback-pattern administration completely separate while moving only their identical toast visual into the admin route group.

This matches the student-style route organization, preserves domain locality, and introduces only one justified shared module.

### 3. Generic admin management framework

Create shared list, filter, modal, form, loading, and mutation abstractions for both routes.

This would expose an interface almost as complex as both implementations. The routes have different filtering, validation, optimistic mutation, and rollback behavior, so such abstractions would be shallow and are out of scope.

## Target Organization

```text
src/app/(admin)/admin/
├── _components/
│   └── admin-toast.tsx
├── users/
│   ├── page.tsx
│   ├── _components/
│   │   ├── admin-users-screen.tsx
│   │   ├── users-summary.tsx
│   │   ├── users-filters.tsx
│   │   ├── users-list.tsx
│   │   └── edit-user-modal.tsx
│   ├── _hooks/
│   │   └── use-admin-users.ts
│   └── _lib/
│       ├── types.ts
│       └── presentation.ts
└── ai-feedback/
    ├── page.tsx
    ├── _components/
    │   ├── ai-feedback-screen.tsx
    │   ├── pattern-filters.tsx
    │   ├── pattern-list.tsx
    │   ├── pattern-modal.tsx
    │   └── delete-pattern-modal.tsx
    ├── _hooks/
    │   └── use-ai-feedback-patterns.ts
    └── _lib/
        ├── types.ts
        ├── pattern-form.ts
        └── presentation.ts
```

No existing global module is moved or deleted in this refactor. All new shared implementation stays inside the admin route group.

## Shared Admin Presentation

### `(admin)/admin/_components/admin-toast.tsx`

- Renders the existing bottom-center success/error toast used by `/admin/users` and `/admin/ai-feedback`.
- Accepts only the message and `ok` or `err` type.
- Preserves the current fixed position, colors, typography, radius, shadow, and z-index.
- Does not own timeout state or mutation behavior.
- Is not applied to `/admin/problems`, whose toast has different placement and presentation.

Each route's workflow owns its own transient toast message and three-second clearing behavior. The shared module is presentation only.

## Users Route

### `users/page.tsx`

- Becomes a Server Component with no `'use client'` directive.
- Imports and renders `AdminUsersScreen`.
- Contains no local state, effects, requests, types, filter definitions, time calculations, modal implementation, or large JSX branches.
- Remains under 30 lines.

### `_components/admin-users-screen.tsx`

- Is the client entry for user administration.
- Uses the user-administration workflow hook.
- Composes the heading, summary, filters, user list, edit modal, and shared admin toast.
- Does not construct query parameters, calculate online status, perform mutations, or implement modal validation.

### `_hooks/use-admin-users.ts`

- Owns user rows, statistics, loading, query text, role filter, status filter, edit target, and toast state.
- Preserves the request to `/api/admin/users` with `q`, `role`, and `status` query parameters.
- Preserves current request timing: changing query text, role, or status triggers the effect-driven fetch, and submitting the search form explicitly fetches again.
- Preserves the current initial fetch and loading transitions.
- Preserves activation/deactivation through `PATCH /api/admin/users/:id`.
- Preserves the current local row update after successful activation changes without separately recalculating summary statistics.
- Preserves success and failure toast messages.
- Provides the user-update operation used by the edit modal.
- Preserves the post-save row update, modal close, success toast, and full list refresh.
- Exposes route-ready values and focused actions to the screen.

### `_components/users-summary.tsx`

- Renders the four existing statistic cards: total members, students, teachers, and active accounts.
- Keeps the small statistic-card implementation private in the same file.
- Receives the statistics response without recalculating values.
- Preserves the current four-column layout, icons, colors, and typography.

### `_components/users-filters.tsx`

- Renders the search form plus role and status tab groups.
- Preserves the current query placeholder and explicit form submission.
- Preserves role options: all, student, and teacher.
- Preserves status options: all, active, and inactive.
- Receives current values and selection/submission actions from the workflow hook.

### `_components/users-list.tsx`

- Renders five loading skeletons, the existing search-aware empty state, or user rows.
- Preserves role badge colors, account opacity, online indicator, recent activity, teacher names, student counts, signup time, and activation/edit actions.
- Receives prepared users and actions; it performs no network requests.
- Uses route-local presentation helpers for online and time display.

### `_components/edit-user-modal.tsx`

- Owns temporary edit-form values and password visibility.
- Preserves the admin-role fallback behavior: an admin row, if ever supplied, initializes the editable role as student.
- Preserves required-name and minimum-eight-character password validation with the same Korean messages.
- Preserves name, role, active-status, and optional password fields.
- Calls the workflow's user-update action and displays returned server errors inside the modal.
- Preserves saving, disabled, close, and successful completion behavior.
- Does not own user-list replacement, toast timing, or post-save refetch rules.

### `_lib/types.ts`

- Contains user row, statistics, edit form, role filter, status filter, and toast-message types used only by this route.
- Continues to use `UserRole` from `src/lib/types/db.ts`.

### `_lib/presentation.ts`

- Contains role labels and styles.
- Contains the five-minute online threshold and relative-time formatting.
- Contains role and status tab definitions.
- Contains no React state, browser requests, or generic admin presentation.

## AI Feedback Route

### `ai-feedback/page.tsx`

- Becomes a Server Component with no `'use client'` directive.
- Imports and renders `AiFeedbackScreen`.
- Contains no local state, effects, requests, types, pattern defaults, modal implementation, or large JSX branches.
- Remains under 30 lines.

### `_components/ai-feedback-screen.tsx`

- Is the client entry for AI-feedback-pattern administration.
- Uses the pattern-management workflow hook.
- Composes the heading, add action, filters, list, pattern modal, deletion dialog, and shared admin toast.
- Does not perform fetches, optimistic updates, rollback, or response normalization.

### `_hooks/use-ai-feedback-patterns.ts`

- Owns pattern rows, initial loading, selected type filter, create/edit modal target, saving, deletion target, and toast state.
- Preserves the initial request to `/api/admin/ai-feedback-patterns`.
- Derives sorted unique type options and visible patterns.
- Preserves create through `POST /api/admin/ai-feedback-patterns`.
- Preserves update through `PATCH /api/admin/ai-feedback-patterns/:id`.
- Preserves create ordering by sorting the appended response pattern by `order_no`.
- Preserves deletion through `DELETE /api/admin/ai-feedback-patterns/:id` and the current local list removal.
- Preserves active-state optimistic update before the request.
- Preserves rollback to the original pattern and the existing error message when active-state mutation fails.
- Replaces the optimistic row with the server response when active-state mutation succeeds.
- Preserves the current success/error toast messages and three-second lifetime.
- Exposes route-ready values and focused actions to the screen.

### `_components/pattern-filters.tsx`

- Renders the all-pattern count and one tab per sorted pattern type.
- Preserves per-type counts and the current selected-tab styling.
- Receives prepared filter options and selection state from the workflow hook.

### `_components/pattern-list.tsx`

- Renders four loading skeletons, the existing empty state, or pattern cards.
- Preserves type badges, error categories, inactive opacity and badge, criteria, optional code block, tutor feedback, and action buttons.
- Preserves active-toggle titles and icons.
- Receives patterns and toggle/edit/delete actions; it performs no requests.

### `_components/pattern-modal.tsx`

- Owns temporary pattern form state.
- Preserves create/edit headings, fields, placeholders, datalist options, active checkbox, and close behavior.
- Preserves the current save eligibility rule: pattern type, error category, criteria, and tutor feedback must be non-empty after trimming.
- Calls the workflow save action and receives the saving state.
- Preserves current server-error reporting through the shared route toast rather than adding new modal error UI.

### `_components/delete-pattern-modal.tsx`

- Renders the existing pattern deletion confirmation.
- Receives confirm and cancel actions.
- Does not select the target or perform requests.

### `_lib/types.ts`

- Contains pattern form, pattern modal, filter, and toast-message types used only by this route.
- Continues to use `DbAiFeedbackPattern` and `AiFeedbackPatternType` from `src/lib/types/db.ts`.

### `_lib/pattern-form.ts`

- Contains the empty pattern-form factory.
- Maps an existing database pattern to editable form values, including the empty-string fallback for optional example code.
- Contains the current required-field save eligibility calculation.
- Contains no React state, requests, or presentation.

### `_lib/presentation.ts`

- Contains the existing `for`, `while`, and default type badge styles.
- Exposes the type-style lookup used by the pattern list.
- Contains no route state or requests.

## Data Flow

### User administration

```text
users/page.tsx
  → AdminUsersScreen
    → useAdminUsers
      → GET /api/admin/users?q=&role=&status=
      → PATCH /api/admin/users/:id
      → preserve row updates, refetch, and toast timing
    → UsersSummary
    → UsersFilters
    → UsersList
    → EditUserModal
    → AdminToast
```

### AI-feedback-pattern administration

```text
ai-feedback/page.tsx
  → AiFeedbackScreen
    → useAiFeedbackPatterns
      → GET/POST /api/admin/ai-feedback-patterns
      → PATCH/DELETE /api/admin/ai-feedback-patterns/:id
      → optimistic active toggle and rollback
    → PatternFilters
    → PatternList
    → PatternModal / DeletePatternModal
    → AdminToast
```

No context provider or global store is required. Each workflow has one screen caller, and the shared toast receives only serializable presentation props.

## Client and Server Placement

- Both `page.tsx` files are Server Components.
- `admin-users-screen.tsx` and `ai-feedback-screen.tsx` are the client seams and contain `'use client'`.
- Hooks and visual modules imported only below those seams do not repeat `'use client'` unless they may be independently imported from a Server Component.
- Pure `_lib` modules contain no React hooks, browser globals, or network requests.
- Props crossing the Server-to-Client seams remain serializable.

## Error and Loading Behavior

- Users keeps its current five-row loading skeleton and search-aware empty state.
- AI feedback keeps its current four-row loading skeleton and empty state.
- Both initial request workflows preserve the current loading transition after a resolved response.
- User activation failures keep the current generic error toast and do not update the row.
- User edit validation stays inside the modal; server failures remain visible in the modal.
- Successful user edits update the row, close the modal, show the success toast, and refetch with current filters.
- Pattern save and delete failures preserve the current toast messages and modal/target behavior.
- Pattern active-state failures restore the exact original row before showing the error toast.
- This structure-only pass does not add abort controllers, retries, debouncing, optimistic user activation, or new error UI.

## File-Size and Locality Guidelines

- Each `page.tsx` must remain under 30 lines.
- New route-private modules should normally remain under 250 lines.
- No new route-private module may exceed 300 lines without a documented locality reason.
- Do not move either current page unchanged into one oversized screen module.
- Do not extract one-line visual fragments solely to reduce line count.
- Keep one-caller helpers private when extraction would create a pass-through module.
- Apply the deletion test: deleting an extracted module should cause meaningful workflow, validation, filtering, mutation, or presentation knowledge to reappear in callers.

## Migration Sequence

1. Add the shared admin toast without changing either caller's presentation.
2. Refactor `/admin/users` into route-private types, presentation, workflow, and visual modules.
3. Replace `/admin/users/page.tsx` with the thin Server Component.
4. Run users-route scoped lint and verify search, filters, activation, and editing.
5. Refactor `/admin/ai-feedback` into route-private form, presentation, workflow, and visual modules.
6. Replace `/admin/ai-feedback/page.tsx` with the thin Server Component.
7. Remove both old local toast implementations after their screens use `AdminToast`.
8. Run admin scoped lint, production build, and final diff audit.

## Validation

### Automated checks

- `npm run lint -- 'src/app/(admin)/admin/users' 'src/app/(admin)/admin/ai-feedback' 'src/app/(admin)/admin/_components/admin-toast.tsx'`
- `npm run build`
- `git diff --check`
- Confirm neither refactored `page.tsx` contains `'use client'`.
- Confirm no duplicate local bottom-toast implementation remains in either route.

No new testing dependency is introduced. Pure time/role presentation and pattern-form modules will be structured so unit tests can be added later through their exported functions.

The existing unrelated `package-lock.json` modification and `.vscode/` directory must remain untouched and uncommitted.

### Manual behavior checks

#### `/admin/users`

- Initial users and statistics load correctly.
- Typing in search preserves the current effect-driven request behavior.
- Search submission performs the explicit request.
- Role and status filters preserve query parameter names, selection behavior, and selected styling.
- Summary values continue to reflect the endpoint response for the active query and filters.
- Loading and both empty-state variants render unchanged.
- Online status uses the five-minute threshold and relative times match the previous page.
- Student teacher-names and teacher student-counts render unchanged.
- Activation/deactivation uses the same request, row update, and toast messages.
- Edit modal values, password visibility, validation, server errors, save state, close behavior, and post-save refresh remain unchanged.

#### `/admin/ai-feedback`

- Initial patterns load and remain ordered by the endpoint response.
- Type tabs remain sorted using Korean locale comparison and display the same counts.
- Loading and empty states render unchanged.
- Pattern type, category, criteria, optional code, tutor feedback, and inactive presentation remain unchanged.
- Create modal uses the empty defaults and existing datalist options.
- Edit modal maps the selected pattern into the same form values.
- Required-field eligibility and save button state remain unchanged.
- Create and edit use the same endpoints, methods, bodies, local list updates, and messages.
- Delete confirmation, request, local removal, and toast behavior remain unchanged.
- Active toggling updates immediately, rolls back on failure, and accepts the server row on success.

#### Shared toast

- Both routes render the toast at the same bottom-center position as before.
- Success and error colors, typography, shadow, z-index, and three-second lifetime remain unchanged.
- `/admin/problems` retains its existing top-right toast and is unaffected.

## Acceptance Criteria

- Both admin route entries are thin Server Components under 30 lines.
- User administration and AI-feedback-pattern administration remain separate route-private workflows.
- The identical bottom toast has exactly two callers through the shared admin-group module.
- No generic CRUD, filter, modal, or form framework is introduced.
- No new route-private module exceeds 300 lines without a documented locality reason.
- Existing URLs, endpoints, query parameters, request methods, request bodies, response assumptions, UI text, styling, request timing, validation, optimistic updates, rollback, loading, empty, and error behavior remain unchanged.
- Scoped lint, production build, and diff checks pass, or unrelated pre-existing failures are reported separately.
- The diff contains no unrelated changes and excludes the user's existing `package-lock.json` and `.vscode/` work.

## Follow-up Work

- Standardize authorization in admin route handlers through the existing `requireAdmin` seam.
- Revisit shared admin presentation only after another identical two-caller pattern appears.
- Align admin password validation with signup/profile policy in a separate authentication design.
- Add unit tests for time presentation, pattern-form normalization, and optimistic rollback once a testing framework is selected.
