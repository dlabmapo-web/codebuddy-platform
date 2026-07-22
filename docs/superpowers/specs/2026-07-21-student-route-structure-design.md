# Student Route Structure Refactor

Date: 2026-07-21
Status: Awaiting user approval

## Summary

Refactor the `/me` and `/problems` student routes so their `page.tsx` files remain thin route entries and their implementations live in route-private modules. The organization follows the strongest pattern in `jurabek10/kichkintoy/packages/web`: colocated `_components`, `_hooks`, and `_lib` folders that do not affect the URL.

This is a structure-only refactor. It must preserve the current visual design, Korean copy, navigation, URL query parameters, API calls, loading behavior, and user interactions.

## Goals

- Make each student route understandable from its folder structure.
- Keep `page.tsx` focused on Next.js routing and composition.
- Concentrate each route's data workflow in one route-private hook module.
- Separate substantial visual responsibilities without creating a file for every small JSX fragment.
- Keep route-specific knowledge beside the route.
- Establish a repeatable structure for later teacher and admin refactors.

## Non-goals

- Refactoring the fullscreen problem-solving or feedback routes.
- Changing API routes, response shapes, database queries, or authentication.
- Changing the UI, styling, text, accessibility behavior, or responsive layout.
- Introducing React Query, SWR, a new state library, or a new testing framework.
- Consolidating application-wide difficulty/status presentation rules in this pass.
- Refactoring teacher, admin, authentication, or shared layout modules.

## Current Problems

### `/me`

`src/app/(student)/me/page.tsx` is a 381-line client module containing:

- route entry behavior;
- submission response types;
- data fetching;
- hierarchical curriculum normalization;
- filter state and derived options;
- summary calculations;
- date and elapsed-time formatting;
- statistics, filters, loading UI, empty UI, and submission rows.

The module has no small route interface: understanding or changing one concern requires reading nearly the whole implementation.

### `/problems`

`src/app/(student)/problems/page.tsx` is already a good thin route entry, but `ProblemsPageInner.tsx` is a 654-line client module containing:

- URL selection state;
- curriculum and draft fetching;
- draft mutation behavior;
- search and expansion state;
- derived progress calculations;
- catalog, stage, draft, loading, error, empty, and problem-list UI.

Moving this file unchanged into `_components` would improve placement but would not improve locality enough.

## Target Organization

```text
src/app/(student)/
├── me/
│   ├── page.tsx
│   ├── _components/
│   │   ├── my-history-screen.tsx
│   │   ├── history-summary.tsx
│   │   ├── history-filters.tsx
│   │   └── submission-list.tsx
│   ├── _hooks/
│   │   └── use-submission-history.ts
│   └── _lib/
│       ├── presentation.ts
│       ├── submissions.ts
│       └── types.ts
└── problems/
    ├── page.tsx
    ├── _components/
    │   ├── problems-screen.tsx
    │   ├── curriculum-catalog.tsx
    │   ├── stage-problems.tsx
    │   └── drafts-panel.tsx
    ├── _hooks/
    │   └── use-problems-catalog.ts
    └── _lib/
        ├── presentation.ts
        └── types.ts
```

Private folder names follow the installed Next.js 16 guidance: folders prefixed with `_` are excluded from routing and are safe for route-owned implementation.

## Module Responsibilities

### `/me` route

#### `page.tsx`

- Remains a Server Component.
- Imports and renders `MyHistoryScreen`.
- Contains no local data types, state, effects, formatting, or large JSX branches.

#### `_components/my-history-screen.tsx`

- Is the client entry for the route.
- Uses the submission-history workflow hook.
- Composes the page heading, summary, filters, and submission list.
- Owns navigation from a submission row to its problem.
- Does not implement response normalization or filtering algorithms.

#### `_components/history-summary.tsx`

- Renders the three existing statistic cards.
- Receives already-derived total attempts, solved-problem count, and correct rate.
- Keeps the small statistic-card implementation private in the same file.

#### `_components/history-filters.tsx`

- Renders status, subject, stage, and chapter filters.
- Receives current selections, available options, and selection callbacks.
- Preserves dependent reset behavior: changing subject clears stage and chapter; changing stage clears chapter.

#### `_components/submission-list.tsx`

- Renders loading skeletons, the existing empty state, or submission rows.
- Keeps the submission-row implementation in the same file unless extraction materially reduces the module during implementation.
- Preserves the existing problem URL, hover treatment, curriculum breadcrumb, status, difficulty, timing, and submitted date.

#### `_hooks/use-submission-history.ts`

- Owns submission fetching and loading state.
- Owns status and curriculum filter selections.
- Derives curriculum options, filtered submissions, and summary values.
- Exposes route-ready values and selection actions to the screen module.
- Preserves the current single request to `/api/submissions` on mount.

#### `_lib/submissions.ts`

- Contains pure curriculum normalization and derivation functions.
- Handles Supabase relationship values that may be an object, array, or null.
- Contains no React state and performs no network requests.

#### `_lib/presentation.ts`

- Contains route-local difficulty/status presentation values and date/time formatting.
- Does not become a global shared module during this pass.

#### `_lib/types.ts`

- Contains the route's submission, curriculum relationship, filter, and option types.
- Continues to use `ProblemDifficulty` from `src/lib/types/db.ts`.

### `/problems` route

#### `page.tsx`

- Remains a Server Component.
- Keeps the existing `Suspense` behavior required by `useSearchParams` in the client subtree.
- Imports `ProblemsScreen` from `_components/problems-screen.tsx`.
- Preserves the current fallback text and styling.

#### `_components/problems-screen.tsx`

- Is the client entry for the route.
- Uses the curriculum-browser workflow hook.
- Chooses between catalog and selected-stage views.
- Composes the drafts panel and loading/error states.
- Does not contain fetch chains or large repeated list implementations.

#### `_components/curriculum-catalog.tsx`

- Renders the catalog heading, subject groups, empty-subject states, and stage cards.
- Keeps stage visual selection and the stage-card implementation together because they change as one concern.
- Receives subjects and a stage-selection action.

#### `_components/stage-problems.tsx`

- Renders the selected-stage heading, progress, search field, chapter accordions, problem rows, and no-results state.
- Owns only visual interaction callbacks supplied by the workflow hook.
- Preserves automatic chapter expansion while a search query is active.

#### `_components/drafts-panel.tsx`

- Renders saved draft sessions and its open/closed state.
- Preserves keyboard activation, navigation, line-count display, and draft deletion.
- Receives route-ready draft data and actions from the workflow hook.

#### `_hooks/use-problems-catalog.ts`

- Reads `stage` and `chapter` from `useSearchParams`.
- Owns catalog/stage loading, error, search, chapter expansion, drafts, and draft-panel state.
- Owns catalog and problem navigation through the Next.js router.
- Preserves request cancellation for curriculum requests.
- Preserves the current requests to `/api/curriculum/subjects`, `/api/curriculum/chapters`, `/api/sessions`, and `/api/sessions/:id`.
- Derives visible chapters, stage progress, and the set of problem IDs with drafts.

#### `_lib/presentation.ts`

- Contains stage visual configuration, difficulty presentation, and solve-status presentation.
- Contains no React state or network requests.

#### `_lib/types.ts`

- Contains catalog, stage, chapter, problem, curriculum metadata, solve-status, and draft-session types.
- Continues to use `ProblemDifficulty` from `src/lib/types/db.ts`.

## Data Flow

### Submission history

```text
page.tsx
  → MyHistoryScreen
    → useSubmissionHistory
      → /api/submissions
      → normalize curriculum relationships
      → derive filters, visible submissions, and summary
    → HistorySummary
    → HistoryFilters
    → SubmissionList
```

### Problems catalog

```text
page.tsx + Suspense
  → ProblemsScreen
    → useProblemsCatalog
      → URL stage/chapter selection
      → curriculum and draft requests
      → search, expansion, progress, and mutations
    → CurriculumCatalog OR StageProblems
    → DraftsPanel
```

State remains owned by the workflow hook closest to the route. Visual modules receive prepared values and callbacks. No context provider or global store is needed because there is one screen caller for each workflow.

## Client and Server Placement

- Both `page.tsx` files remain Server Components and do not include `'use client'`.
- Each screen module is the client seam and includes `'use client'`.
- Modules imported below a client seam do not repeat `'use client'` unless they must also be independently imported from a Server Component.
- Route-local types and pure functions remain usable without browser dependencies.

This placement follows the installed Next.js 16 documentation and avoids making the route entry part of the client module graph.

## Error and Loading Behavior

- `/problems` keeps its explicit curriculum error state and abort handling.
- Draft-loading failures remain non-blocking, matching current behavior.
- `/me` keeps its current loading-to-empty behavior; this structure-only pass does not add new user-visible error copy.
- A failed request must always leave the loading state, and no state update may occur after an aborted curriculum request.
- Existing Suspense fallback and in-screen skeletons remain visually unchanged.

## File-Size and Locality Guidelines

- Each `page.tsx` should remain under 30 lines unless a Next.js route concern requires more.
- New route-private modules should normally remain under 250 lines.
- A module may exceed that guideline only when splitting it would create shallow pass-through modules or scatter one workflow.
- Do not extract a module solely because a JSX fragment is visually distinct.
- Apply the deletion test: removing an extracted module should cause meaningful route knowledge to reappear in its callers.

## Migration Sequence

1. Refactor `/me` into its target folders without changing rendered output or request behavior.
2. Run lint and build checks; fix only refactor-related failures.
3. Move `ProblemsPageInner.tsx` to `problems/_components/problems-screen.tsx` and update the route import.
4. Extract the catalog, stage, drafts, workflow, presentation, and type modules incrementally.
5. Remove `ProblemsPageInner.tsx` after all imports point to the new modules.
6. Run full validation and inspect the final diff for accidental copy, style, URL, or response-shape changes.

## Validation

### Automated checks

- `npm run lint`
- `npm run build`

No new testing dependency will be introduced in this refactor. Pure derivation modules will be structured so unit tests can be added later through their public functions.

### Manual behavior checks

#### `/me`

- Loading skeletons render before submissions load.
- Summary values match the pre-refactor page.
- Status filters produce the same rows.
- Subject, stage, and chapter filters cascade and reset correctly.
- Empty state links to `/problems`.
- Clicking a valid submission opens `/problems/:problemId?sid=:submissionId`.

#### `/problems`

- Catalog loads subjects and stage cards.
- Selecting a stage updates the query string and loads chapters.
- The requested chapter opens when `chapter` is present.
- Search filters problems and expands matching chapters.
- Progress and solve-status displays match existing values.
- Drafts load, open, navigate, and delete as before.
- Returning to the catalog removes the stage selection.
- Loading, empty, and error states remain unchanged.

## Acceptance Criteria

- Both student route entry files are thin Server Components.
- `ProblemsPageInner.tsx` no longer exists.
- Route-owned implementation lives under its route's private folders.
- No new global module is introduced for code used by only one route.
- No new route-private module exceeds 300 lines without a documented locality reason.
- Existing URLs, API endpoints, request methods, response assumptions, UI text, and styling remain unchanged.
- Lint and production build complete successfully, or any pre-existing unrelated failures are identified separately.
- The diff contains no unrelated changes, including no modification to the user's existing `package-lock.json` work.

## Follow-up Work

After this pilot is approved and implemented, the same organization can be applied to teacher and admin routes. The fullscreen problem solver should receive its own design because its editor, execution, collaboration, and feedback workflows require deeper seams than the student catalog routes.
