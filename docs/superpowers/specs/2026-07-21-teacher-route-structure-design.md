# Teacher Route Structure Refactor

Date: 2026-07-21
Status: Awaiting user approval

## Summary

Refactor the teacher dashboard, progress, and students routes so every `page.tsx` is a thin Server Component and each route owns its screen, workflow, presentation, and type modules in private folders.

The refactor extends the structure already established in the student `/me` and `/problems` routes. It also relocates the teacher-dashboard implementation and dashboard-only charts from global `src/components` folders to the dashboard route that owns them.

This is a structure-only refactor. It must preserve the current visual design, Korean copy, routes, request timing, polling intervals, filters, navigation, loading states, error states, and data interpretation.

## Goals

- Keep teacher `page.tsx` files focused on routing and composition.
- Give dashboard analytics, progress inspection, and live student monitoring separate workflow modules.
- Keep route-owned implementation beside its route.
- Move dashboard-only charts out of global `src/components` folders.
- Share identical difficulty presentation within the teacher route group.
- Separate substantial visual responsibilities without creating shallow pass-through modules.
- Preserve the student refactor as the repository's standard route organization.

## Non-goals

- Changing teacher features, layout, copy, visual styling, or responsive behavior.
- Changing route handlers, database queries, authentication, or response shapes.
- Refactoring student, admin, authentication, fullscreen, or shared layout routes.
- Creating an application-wide curriculum presentation module in this pass.
- Introducing React Query, SWR, a global state library, or a new testing framework.
- Changing the 15-second student polling interval or 20-second online threshold.
- Refactoring `src/app/api/teacher/dashboard/route.ts`, `src/app/api/progress/route.ts`, `src/app/api/students/route.ts`, or submission/session handlers.

## Current Problems

### `/dashboard`

`src/app/(teacher)/dashboard/page.tsx` is already small, but it is unnecessarily a Client Component and imports `TeacherAnalyticsDashboard` from a global folder. The 376-line dashboard implementation and all six chart modules are used only by this route.

The global placement gives route-owned implementation a misleading shared interface.

### `/progress`

`src/app/(teacher)/progress/page.tsx` is a 625-line client module containing:

- student and problem tabs;
- three data requests;
- selected-student and curriculum-filter state;
- submission grouping and problem-stat derivation;
- chapter and problem expansion state;
- difficulty, submission-status, date, and elapsed-time presentation;
- student submission history;
- problem performance tables;
- a dynamically loaded Monaco code viewer.

The student-progress and problem-progress workflows are independent enough to deserve separate internal seams, but they currently share one large interface.

### `/students`

`src/app/(teacher)/students/page.tsx` is a 251-line client module containing:

- student and session requests;
- session-to-student merging;
- online/solving priority sorting;
- initial loading and manual-refresh state;
- 15-second polling;
- online and relative-time presentation;
- summary and student-list UI.

The polling workflow and its visual implementation are mixed in the route entry.

## Target Organization

```text
src/app/(teacher)/
├── _lib/
│   └── problem-difficulty.ts
├── dashboard/
│   ├── page.tsx
│   ├── _components/
│   │   ├── teacher-dashboard-screen.tsx
│   │   ├── dashboard-filters.tsx
│   │   ├── dashboard-summary.tsx
│   │   ├── dashboard-charts.tsx
│   │   ├── students-needing-help.tsx
│   │   └── charts/
│   │       ├── ai-error-category-chart.tsx
│   │       ├── chapter-performance-chart.tsx
│   │       ├── chart-skeleton.tsx
│   │       ├── chart-theme.ts
│   │       ├── problem-performance-chart.tsx
│   │       ├── student-activity-chart.tsx
│   │       └── submission-trend-chart.tsx
│   └── _hooks/
│       └── use-teacher-dashboard.ts
├── progress/
│   ├── page.tsx
│   ├── _components/
│   │   ├── progress-screen.tsx
│   │   ├── student-progress-panel.tsx
│   │   ├── problem-progress-panel.tsx
│   │   ├── progress-filters.tsx
│   │   └── submission-code-modal.tsx
│   ├── _hooks/
│   │   ├── use-student-progress.ts
│   │   └── use-problem-progress.ts
│   └── _lib/
│       ├── presentation.ts
│       ├── progress.ts
│       └── types.ts
└── students/
    ├── page.tsx
    ├── _components/
    │   ├── students-screen.tsx
    │   ├── students-summary.tsx
    │   └── student-status-list.tsx
    ├── _hooks/
    │   └── use-student-monitor.ts
    └── _lib/
        ├── presence.ts
        └── types.ts
```

After migration, these route-owned global modules are removed:

```text
src/components/dashboard/TeacherAnalyticsDashboard.tsx
src/components/charts/AiErrorCategoryChart.tsx
src/components/charts/ChapterPerformanceChart.tsx
src/components/charts/ChartSkeleton.tsx
src/components/charts/ProblemPerformanceChart.tsx
src/components/charts/StudentActivityChart.tsx
src/components/charts/SubmissionTrendChart.tsx
src/components/charts/chartTheme.ts
```

The chart modules have one caller—the teacher dashboard—so moving them preserves locality. The shared dashboard response types remain in `src/lib/types/teacherDashboard.ts` because both the dashboard route handler and dashboard screen depend on them.

## Shared Teacher Presentation

### `(teacher)/_lib/problem-difficulty.ts`

- Contains the Korean difficulty labels and teacher-specific difficulty colors.
- Is shared only by `/progress` and `/students`.
- Continues to use `ProblemDifficulty` from `src/lib/types/db.ts`.
- Does not absorb student, admin, feedback, or solver presentation in this pass.

Two teacher callers justify this route-group seam. Route-specific submission status, date, elapsed-time, presence, and relative-time knowledge remains local to the route that uses it.

## Dashboard Route

### `page.tsx`

- Becomes a Server Component with no `'use client'` directive.
- Imports the route-private `TeacherDashboardScreen`.
- Preserves the current dashboard heading and description, either directly or through the screen module.
- Contains no state, effects, chart imports, or request construction.

### `_components/teacher-dashboard-screen.tsx`

- Is the client entry for dashboard analytics.
- Uses the dashboard workflow hook.
- Composes filters, loading/error states, summary, charts, and the support-needed list.
- Does not construct query parameters or perform network requests.

### `_hooks/use-teacher-dashboard.ts`

- Owns range, subject, stage, chapter, reload, loading, error, and data state.
- Preserves dependent filter resets.
- Preserves request cancellation through `AbortController`.
- Preserves the request to `/api/teacher/dashboard` and its existing query parameter names.
- Exposes route-ready curriculum options, data, state, filter actions, and retry behavior.

### Dashboard visual modules

- `dashboard-filters.tsx` renders curriculum and range selection.
- `dashboard-summary.tsx` renders the four existing statistic cards.
- `dashboard-charts.tsx` dynamically loads and arranges dashboard charts, retaining `ssr: false` and chart skeleton fallbacks.
- `students-needing-help.tsx` renders the existing support-needed section.
- `_components/charts/*` preserves the current Recharts implementations, accessibility labels, theme values, tooltip behavior, and dimensions.

## Progress Route

### `page.tsx`

- Becomes a thin Server Component.
- Imports and renders `ProgressScreen`.
- Contains no client state, effects, data types, formatting, or Monaco import.

### `_components/progress-screen.tsx`

- Is the client entry for the route.
- Owns only the active `student` or `problem` tab selection.
- Composes the page heading, tab switcher, selected panel, and submission code modal.
- Uses the two progress workflow hooks without merging them into one oversized facade.

### `_hooks/use-student-progress.ts`

- Owns the student list, selected student, selected student's submissions, loading state, expanded problem rows, and selected code submission.
- Preserves the initial `/api/students` request.
- Preserves `/api/submissions?student_id=:id` whenever the selected student changes.
- Clears expanded problem rows when a different student's submissions load.
- Derives grouped submissions and the ordered unique problem list.

### `_hooks/use-problem-progress.ts`

- Owns curriculum hierarchy, problem statistics, subject/stage/chapter filters, and collapsed chapter state.
- Preserves the initial `/api/progress` request.
- Preserves dependent filter resets.
- Derives filter options, visible problem statistics, and grouped chapter rows.

Both hooks remain mounted from the screen so `/api/students` and `/api/progress` continue loading on initial route mount, matching current behavior regardless of the active tab.

### Progress visual and pure modules

- `student-progress-panel.tsx` renders the student selector and grouped submission history.
- `problem-progress-panel.tsx` renders chapter groups and problem-stat tables.
- `progress-filters.tsx` renders subject, stage, and chapter selectors.
- `submission-code-modal.tsx` owns the dynamically loaded read-only Monaco editor and preserves its current options.
- `_lib/progress.ts` contains pure grouping, filtering, option, and chapter-derivation functions.
- `_lib/presentation.ts` contains route-local submission-status presentation plus date and elapsed-time formatting.
- `_lib/types.ts` contains student, submission, problem-stat, hierarchy, tab, filter-option, chapter-group, and code-modal types.

## Students Route

### `page.tsx`

- Becomes a thin Server Component.
- Imports and renders `StudentsScreen`.
- Contains no polling, network, presence, or sorting implementation.

### `_components/students-screen.tsx`

- Is the client entry for live student monitoring.
- Uses the student-monitor workflow hook.
- Composes the heading, manual refresh action, summary, and student status list.

### `_hooks/use-student-monitor.ts`

- Owns student rows, initial loading, manual refreshing, last-updated time, and the initialized marker.
- Preserves concurrent `/api/students` and `/api/sessions` requests.
- Preserves active-session merging by `student_id`.
- Preserves priority ordering: solving students, online students, then offline students.
- Preserves the immediate load and 15-second polling interval.
- Clears the interval when the route unmounts.
- Derives total, online, and solving counts.

### Students pure and visual modules

- `_lib/presence.ts` contains the 20-second online calculation, relative-time formatting, session merging, and priority sorting.
- `_lib/types.ts` contains student-session, student-row, and student-response types.
- `students-summary.tsx` renders total, online, and solving counts.
- `student-status-list.tsx` renders loading skeletons, empty state, presence indicators, active problem details, difficulty labels, and feedback-session links.

## Data Flow

### Dashboard analytics

```text
dashboard/page.tsx
  → TeacherDashboardScreen
    → useTeacherDashboard
      → /api/teacher/dashboard
      → filter reset and request cancellation
    → DashboardFilters
    → DashboardSummary
    → DashboardCharts
    → StudentsNeedingHelp
```

### Progress inspection

```text
progress/page.tsx
  → ProgressScreen
    → useStudentProgress
      → /api/students
      → /api/submissions?student_id=...
    → useProblemProgress
      → /api/progress
    → StudentProgressPanel OR ProblemProgressPanel
    → SubmissionCodeModal
```

### Live student monitoring

```text
students/page.tsx
  → StudentsScreen
    → useStudentMonitor
      → Promise.all(/api/students, /api/sessions)
      → merge, presence, priority sort
      → repeat every 15 seconds
    → StudentsSummary
    → StudentStatusList
```

## Client and Server Placement

- All three `page.tsx` files are Server Components.
- Each route's screen module is its client seam and contains `'use client'`.
- Hooks and visual modules imported only below a client seam do not repeat `'use client'` unless required by an independent Server Component import.
- Recharts modules retain `'use client'` because they remain dynamically imported client modules.
- Pure `_lib` modules contain no React state, browser globals, or network requests.
- Props crossing a Server-to-Client seam remain serializable.

## Error and Loading Behavior

- Dashboard keeps its explicit error message, retry action, abort handling, and loading skeletons.
- Progress keeps its current loading fade and empty states; this structure-only pass does not add new user-visible error copy.
- Students keeps its initial loading, manual-refresh indicator, and current polling behavior; this pass does not add new user-visible error copy.
- A dashboard request aborted by a filter change must not update loading, data, or error state after cancellation.
- Polling intervals and abort controllers must be cleaned up when their routes unmount.
- Refactoring must not cause duplicate polling intervals or duplicate requests beyond the current behavior.

## File-Size and Locality Guidelines

- Each `page.tsx` should remain under 30 lines.
- New route-private modules should normally remain under 250 lines.
- No new route-private module may exceed 300 lines without a documented locality reason.
- Do not extract modules solely because a JSX fragment is visually distinct.
- Keep small helpers private when their extraction would create a shallow pass-through module.
- Apply the deletion test: deleting an extracted module should cause meaningful workflow or presentation knowledge to reappear in callers.

## Migration Sequence

1. Add the teacher-group difficulty presentation module.
2. Refactor `/students` first because it is the smallest complete teacher workflow.
3. Refactor `/progress` into separate student-progress and problem-progress workflows.
4. Move dashboard analytics and dashboard-only charts beside `/dashboard`.
5. Remove the old global teacher dashboard and chart modules after all imports use route-private paths.
6. Run scoped lint after each route migration.
7. Run the production build and audit the final diff for behavior, copy, styling, request, polling, and import changes.

## Validation

### Automated checks

- `npm run lint -- 'src/app/(teacher)'`
- Include any moved chart files in scoped lint while they are outside the route during intermediate migration.
- `npm run build`
- `git diff --check`

The repository's full unscoped lint currently has unrelated pre-existing failures in generated Pyodide assets and other routes. Those failures are outside this refactor; every touched teacher module must pass scoped lint.

No new testing dependency is introduced. Pure presence and progress derivation modules are designed so unit tests can be added later through their exported functions.

### Manual behavior checks

#### `/dashboard`

- Initial loading skeletons match the current layout.
- Range filters request `7d`, `30d`, and `all` correctly.
- Subject changes clear stage and chapter; stage changes clear chapter.
- Summary cards, five charts, empty chart states, and support-needed students render unchanged.
- A failed request shows the existing message and retry action.
- Rapid filter changes cancel stale dashboard requests.

#### `/progress`

- Student and problem tabs retain their current labels and selection styling.
- The first student is selected after the student list loads.
- Selecting a student loads only that student's submissions.
- Problem rows expand, sort submissions newest-first, and show the same best status.
- Clicking a submission opens the same read-only Monaco code viewer.
- Curriculum filters cascade and display the same problem totals.
- Chapter groups collapse and preserve the current table values and progress colors.

#### `/students`

- Initial student and session data load concurrently.
- Students sort by solving, online, then offline status.
- Online and solving summary counts match the current page.
- Automatic refresh occurs every 15 seconds with only one active interval.
- Manual refresh shows its spinner and updates the displayed time.
- Active sessions link to `/feedback/:sessionId`.
- Offline relative-time copy and the 20-second threshold remain unchanged.

## Acceptance Criteria

- Dashboard, progress, and students route entries are thin Server Components.
- Teacher route implementation lives in route-private `_components`, `_hooks`, and `_lib` folders.
- Dashboard-only charts no longer live under global `src/components` folders.
- `src/lib/types/teacherDashboard.ts` remains shared between route handler and screen.
- Identical teacher difficulty presentation exists in one teacher-group module.
- Existing routes, endpoints, query parameters, polling cadence, Monaco configuration, dynamic chart loading, UI text, and styling remain unchanged.
- No new route-private module exceeds 300 lines without a documented locality reason.
- Every touched teacher module passes scoped lint.
- The production build completes successfully, or unrelated pre-existing failures are reported separately.
- The diff contains no unrelated changes, including no modification to `package-lock.json`.

## Follow-up Work

After the teacher refactor, evaluate an application-wide curriculum presentation module using the student and teacher route-private implementations as evidence. Then design the admin curriculum-authoring workspace separately. The fullscreen problem solver remains last because editor execution, collaboration, feedback, and navigation require deeper workflow seams.
