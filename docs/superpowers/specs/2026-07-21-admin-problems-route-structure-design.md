# Admin Problems Route Structure Refactor

Date: 2026-07-21
Status: Awaiting user approval

## Summary

Refactor the `/admin/problems` route so its `page.tsx` becomes a thin Server Component and its curriculum browsing, problem editing, and Excel import implementations live in focused route-private modules.

The organization follows the structure already established in the student and teacher routes: route-owned `_components`, `_hooks`, and `_lib` folders that do not affect the URL. The existing global `CurriculumExcelImportModal` also moves beside the route that owns it.

This is a structure-only refactor. It must preserve the current visual design, Korean copy, navigation, editor behavior, API endpoints, request methods, request timing, validation, ordering, loading states, error messages, and Excel import behavior.

## Goals

- Keep `page.tsx` focused on Next.js routing and screen composition.
- Separate curriculum browsing, problem editing, and Excel import into understandable workflows.
- Keep route-owned implementation beside `/admin/problems`.
- Move the admin-problems-only Excel import module out of the global components folder.
- Extract substantial visual responsibilities without creating shallow pass-through modules.
- Keep form normalization and validation in pure route-private modules where practical.
- Follow the same locality and file-size standards used by the student and teacher refactors.

## Non-goals

- Changing any UI, styling, Korean text, responsive behavior, or accessibility behavior.
- Changing admin API handlers, endpoint paths, request bodies, response shapes, database queries, or authorization.
- Making curriculum ordering atomic or replacing the existing two-request swap behavior.
- Refactoring `/admin/users`, `/admin/ai-feedback`, the admin layout, or non-admin routes.
- Creating a generic admin CRUD framework or global form abstraction.
- Refactoring the shared `RichEditor`, Monaco configuration, database types, or Excel template format.
- Introducing React Query, SWR, a global state library, or a new testing framework.

## Current Problems

### Route entry and screen workflow

`src/app/(admin)/admin/problems/page.tsx` is a 1,042-line Client Component containing:

- the route entry;
- curriculum and problem response/form types;
- difficulty and hierarchy presentation constants;
- subject, stage, chapter, and problem loading;
- four-level curriculum navigation;
- hierarchy create, edit, delete, publish, and ordering mutations;
- problem create, edit, delete, publish, and ordering mutations;
- problem form normalization and validation;
- test-case and hint editing;
- RichEditor and Monaco dynamic imports;
- tooltips, confirmation dialogs, hierarchy dialogs, lists, breadcrumbs, editor sections, loading UI, and toast UI;
- Excel import modal state and completion refresh behavior.

Understanding a single workflow requires reading state, requests, derived navigation values, form algorithms, and large JSX branches together.

### Excel import

`src/components/admin/CurriculumExcelImportModal.tsx` is a 404-line client module used only by `/admin/problems`. It contains:

- workbook parsing through the dynamically imported `xlsx` package;
- problem, test-case, and hint row normalization;
- cross-sheet validation;
- drag-and-drop and file-input state;
- preview summary and validation errors;
- the `/api/admin/curriculum/import` request;
- the complete modal presentation.

Its global placement exposes a misleading shared surface, and keeping parsing, validation, request state, and presentation in one file makes the import workflow difficult to verify independently.

## Considered Approaches

### 1. Mechanical visual split

Move JSX sections into multiple files while keeping all state, requests, and mutations in one screen module.

This would shorten `page.tsx`, but the screen interface would still include nearly every curriculum and form concern. The extracted visual modules would be shallow and the central workflow would remain difficult to understand.

### 2. Route-private workflow split — selected

Give curriculum browsing, problem editing, and Excel import separate workflow hooks. Move pure transformation and validation logic into `_lib`, and compose focused visual modules from one route-private screen.

This matches the existing student and teacher route pattern, improves locality without changing behavior, and keeps the implementation small enough for one refactor cycle.

### 3. Full-stack curriculum authoring redesign

Change both the route and server handlers, including authorization consistency, ordering mutations, validation, and persistence rules.

This could provide deeper server-side improvements, but it expands risk beyond the approved structure-only scope. It remains follow-up work.

## Target Organization

```text
src/app/(admin)/admin/problems/
├── page.tsx
├── _components/
│   ├── admin-problems-screen.tsx
│   ├── curriculum-browser.tsx
│   ├── hierarchy-list.tsx
│   ├── hierarchy-modal.tsx
│   ├── problem-list.tsx
│   ├── problem-editor-panel.tsx
│   ├── problem-basic-fields.tsx
│   ├── problem-test-cases.tsx
│   ├── problem-hints.tsx
│   ├── delete-confirmation-modal.tsx
│   └── curriculum-import/
│       ├── curriculum-import-modal.tsx
│       └── import-preview.tsx
├── _hooks/
│   ├── use-curriculum-browser.ts
│   ├── use-problem-editor.ts
│   └── use-curriculum-import.ts
└── _lib/
    ├── types.ts
    ├── problem-form.ts
    ├── curriculum-import.ts
    └── presentation.ts
```

After migration, the route-owned global module is removed:

```text
src/components/admin/CurriculumExcelImportModal.tsx
```

The shared `src/components/editor/RichEditor.tsx`, Monaco theme module, Excel sample file, API handlers, and `src/lib/types/db.ts` remain in their current locations because they have callers or responsibilities outside the route-private structure.

## Module Responsibilities

### `page.tsx`

- Becomes a Server Component with no `'use client'` directive.
- Imports and renders `AdminProblemsScreen`.
- Contains no state, effects, request code, local types, dynamic editor imports, or large JSX branches.
- Remains under 30 lines.

### `_components/admin-problems-screen.tsx`

- Is the client entry for the route.
- Composes the curriculum browser, problem editor, dialogs, toast, and Excel import modal.
- Uses the curriculum-browser and problem-editor workflow hooks.
- Owns transient toast state and supplies one message-reporting callback to the workflows.
- Owns only small cross-workflow coordination, such as refreshing the current list after a problem save or a completed import.
- Does not implement request bodies, hierarchy traversal, form validation, workbook parsing, or large list/editor sections.

### Curriculum browsing workflow

#### `_hooks/use-curriculum-browser.ts`

- Owns the current navigation level: subjects, stages, chapters, or problems.
- Owns subject, stage, chapter, and problem rows plus the selected curriculum path.
- Owns initial loading and hierarchy-dialog/delete-target state.
- Preserves requests to:
  - `/api/admin/subjects`;
  - `/api/admin/stages?subject_id=:id`;
  - `/api/admin/chapters?stage_id=:id`;
  - `/api/admin/problems?chapter_id=:id`;
  - the existing hierarchy and problem detail endpoints for mutations.
- Preserves child-count normalization from `stage_count`, `chapter_count`, and `problem_count`.
- Preserves hierarchy enter/back navigation and selection resets.
- Preserves create, edit, delete, publish, and ordering behavior for subjects, stages, and chapters.
- Preserves problem-list deletion, publish toggles, and ordering behavior.
- Preserves the current two parallel `PATCH` requests used to swap adjacent order numbers.
- Exposes route-ready navigation values, lists, dialog state, and actions to the screen.

#### `_components/curriculum-browser.tsx`

- Renders the existing heading, breadcrumb navigation, action controls, loading state, current hierarchy list, or problem list.
- Chooses `HierarchyList` or `ProblemList` based on the current navigation level.
- Preserves the Excel import and add-item actions.
- Receives prepared rows and actions; it performs no requests.

#### `_components/hierarchy-list.tsx`

- Renders subject, stage, or chapter rows using the existing visual treatment.
- Preserves child counts, publish indicators, row navigation, edit/delete actions, and up/down ordering controls.
- Receives the current hierarchy kind, labels, rows, and actions.

#### `_components/problem-list.tsx`

- Renders problems in the selected chapter.
- Preserves problem number, order, title, difficulty, publication and AI-feedback presentation, edit/delete actions, and up/down controls.
- Preserves the existing empty state and create action.

#### `_components/hierarchy-modal.tsx`

- Owns only temporary modal input state for title, description, publication, and order number.
- Preserves create/edit labels, placeholders, validation, disabled state, and save/cancel behavior.
- Receives the hierarchy target and save action from the workflow hook.

#### `_components/delete-confirmation-modal.tsx`

- Renders the existing problem or hierarchy deletion confirmation copy.
- Receives already-resolved title, description, confirm action, and cancel action.
- Does not decide what entity is deleted or perform requests.

### Problem editing workflow

#### `_hooks/use-problem-editor.ts`

- Owns create/edit/closed panel mode, edited problem ID, problem form state, expanded editor section, and saving state.
- Opens a new problem form for the selected chapter.
- Preserves loading a problem, test cases, and hints from `/api/admin/problems/:id`.
- Uses pure form helpers to normalize detail responses and construct the existing save payload.
- Preserves create through `POST /api/admin/problems` and update through `PATCH /api/admin/problems/:id`.
- Preserves the current required chapter, title, description, and at-least-one-expected-output validation.
- Preserves filtering of empty test cases and hints before submission.
- Preserves fixed `time_limit_ms: 3000` and `memory_limit_mb: 256` values.
- Owns add, update, and remove actions for test cases and hints.
- Exposes form values and focused actions to the editor visual modules.

#### `_components/problem-editor-panel.tsx`

- Renders the existing create/edit side panel, header, section expansion, save action, and close action.
- Keeps the RichEditor and Monaco editor dynamic imports at the closest visual module that uses them.
- Composes basic fields, starter code, test cases, and hints without implementing their mutations.
- Preserves the current editor loading fallbacks and Monaco options.

#### `_components/problem-basic-fields.tsx`

- Renders title, difficulty, publication, AI-feedback, description, input format, output format, and constraints fields.
- Preserves labels, tooltips, required indicators, styling, and RichEditor behavior.
- Small field and tooltip helpers remain private in this file or the editor panel unless another substantial caller justifies extraction.

#### `_components/problem-test-cases.tsx`

- Renders test-case inputs, expected outputs, sample/hidden settings, add/remove controls, and ordering presentation.
- Receives test-case rows and mutation actions from the problem-editor hook.

#### `_components/problem-hints.tsx`

- Renders hint text, trigger patterns, add/remove controls, and ordering presentation.
- Receives hint rows and mutation actions from the problem-editor hook.

### Excel import workflow

#### `_hooks/use-curriculum-import.ts`

- Owns selected filename, normalized rows, validation errors, parsing, importing, and drag state.
- Dynamically imports `xlsx` only when a file is parsed, preserving the current client-only loading behavior.
- Reads the same required and optional sheets from `.xlsx` and `.xls` files.
- Uses pure helpers for row normalization, grouping, counts, and validation.
- Preserves the request to `POST /api/admin/curriculum/import` and its current request body.
- Preserves the success callback that closes the modal and refreshes the curriculum browser.
- Resets import state when a fresh modal workflow begins.

#### `_components/curriculum-import/curriculum-import-modal.tsx`

- Replaces the global `CurriculumExcelImportModal` as the route-private import composition module.
- Renders instructions, sample-template download, drag-and-drop/file selection, validation errors, import action, and close behavior.
- Preserves accepted extensions, the 200-problem message, current loading/disabled states, and all existing copy and styling.
- Uses the import workflow hook and composes `ImportPreview`.

#### `_components/curriculum-import/import-preview.tsx`

- Renders the existing normalized import summary and preview rows.
- Receives already-derived counts, rows, and validation results.
- Contains no workbook parsing or network requests.

### Pure route modules

#### `_lib/types.ts`

- Contains hierarchy, problem-row, form, test-case, hint, navigation, dialog, import-row, and raw-sheet types.
- Continues to use shared database types and `ProblemDifficulty` from `src/lib/types/db.ts` where appropriate.
- Does not duplicate full database types when a `Pick` or shared type is sufficient.

#### `_lib/problem-form.ts`

- Contains the empty problem form factory.
- Normalizes problem detail, test-case, and hint responses into editable form state.
- Validates required values and returns the same Korean validation messages used today.
- Builds the existing create/update request payload and filters empty test cases and hints.
- Contains no React state, browser globals, or requests.

#### `_lib/curriculum-import.ts`

- Contains workbook-row text, number, boolean, and difficulty normalization.
- Groups test cases and hints by problem key.
- Builds normalized import rows, validates cross-sheet references and duplicates, and calculates summary counts.
- Contains no React state, file-input behavior, modal behavior, or network requests.

#### `_lib/presentation.ts`

- Contains admin-problems difficulty labels/styles and hierarchy labels.
- Contains no state, requests, or generic application-wide presentation rules.

## Data Flow

### Curriculum browsing

```text
page.tsx
  → AdminProblemsScreen
    → useCurriculumBrowser
      → subject/stage/chapter/problem admin endpoints
      → normalize child counts and selected path
      → preserve CRUD, publish, delete, and order swaps
    → CurriculumBrowser
      → HierarchyList OR ProblemList
      → HierarchyModal / DeleteConfirmationModal
```

### Problem editing

```text
AdminProblemsScreen
  → useProblemEditor(selected chapter)
    → /api/admin/problems/:id when editing
    → normalize response with problem-form helpers
    → validate and build payload
    → POST or PATCH existing problem endpoint
    → refresh selected chapter's problem list
  → ProblemEditorPanel
    → ProblemBasicFields
    → Monaco starter-code section
    → ProblemTestCases
    → ProblemHints
```

### Excel import

```text
CurriculumImportModal
  → useCurriculumImport
    → dynamically load xlsx
    → normalize and validate workbook rows
    → POST /api/admin/curriculum/import
    → close modal and refresh subjects
  → ImportPreview
```

The route does not need context or a global store. Each workflow has one screen caller, and small completion callbacks are sufficient for cross-workflow refresh coordination.

## Client and Server Placement

- `page.tsx` is a Server Component.
- `admin-problems-screen.tsx` is the primary client seam and contains `'use client'`.
- Workflow hooks run below that client seam.
- Modules imported only below the client seam do not repeat `'use client'` unless they are dynamically imported or may be imported independently from a Server Component.
- RichEditor, Monaco, and workbook parsing remain client-only.
- Pure `_lib` modules contain no React hooks, browser globals, dynamic UI imports, or requests.
- Props crossing the Server-to-Client seam remain serializable.

## Error and Loading Behavior

- Initial subject loading preserves the current loading state and transition.
- Existing request failures continue to use the same toast messages and timing.
- Problem detail loading preserves the current “문제를 불러올 수 없습니다.” behavior.
- Problem and hierarchy save/delete errors preserve their current Korean messages and dialog state behavior.
- A validation failure must leave the editor open, stop saving, and show the same toast message.
- Publish and ordering actions preserve their current refresh behavior and do not introduce optimistic updates.
- Excel parsing errors, sheet validation errors, importing state, request errors, and successful close/refresh behavior remain unchanged.
- This structure-only pass does not introduce new abort behavior, retry UI, or user-visible error states.

## File-Size and Locality Guidelines

- `page.tsx` must remain under 30 lines.
- New route-private modules should normally remain under 250 lines.
- No new route-private module may exceed 300 lines without a documented locality reason.
- The problem editor and Excel import must not be moved unchanged into new oversized files.
- Do not extract a module solely because a small JSX fragment is visually distinct.
- Keep one-caller helpers private when extraction would only create a pass-through module.
- Apply the deletion test: deleting an extracted module should cause meaningful workflow, validation, parsing, or presentation knowledge to reappear in its caller.

## Migration Sequence

1. Add route-private types, presentation values, and pure problem-form helpers.
2. Extract the curriculum-browser workflow and hierarchy/problem list visual modules.
3. Extract the problem-editor workflow and its basic, test-case, and hint sections.
4. Move the Excel import implementation beside the route and split parsing/validation, workflow state, modal composition, and preview.
5. Replace the route implementation with the thin Server Component and route-private screen.
6. Remove `src/components/admin/CurriculumExcelImportModal.tsx` after all imports use the route-private module.
7. Run scoped lint during each workflow migration.
8. Run the production build and audit the final diff for accidental UI, copy, endpoint, request-body, ordering, validation, editor, or import changes.

## Validation

### Automated checks

- `npm run lint -- 'src/app/(admin)/admin/problems'`
- Include the old Excel import path in scoped lint while it remains outside the route during intermediate migration.
- `npm run build`
- `git diff --check`
- Confirm no imports reference `@/components/admin/CurriculumExcelImportModal` after migration.

No new testing dependency is introduced. The pure problem-form and curriculum-import modules are designed so unit tests can be added later through their exported functions.

The existing unrelated `package-lock.json` modification and `.vscode/` directory must remain untouched and uncommitted.

### Manual behavior checks

#### Curriculum navigation and hierarchy management

- Subjects load on route entry with the same counts and ordering.
- Entering a subject loads stages; entering a stage loads chapters; entering a chapter loads problems.
- Breadcrumb navigation returns to the requested level and clears lower selections consistently.
- Creating and editing a subject, stage, or chapter preserves fields, defaults, and refresh behavior.
- Publish toggles preserve the current request and list refresh behavior.
- Delete confirmations preserve entity-specific copy and child-protection errors returned by the server.
- Up/down controls swap adjacent order numbers and refresh the correct list.

#### Problem management

- Creating a problem starts with the same defaults and selected chapter.
- Editing loads the problem, test cases, and hints into the same fields.
- Basic, starter-code, test-case, and hint sections expand and render unchanged.
- RichEditor and Monaco loading fallbacks and options remain unchanged.
- Required-field and expected-output validation produce the same messages.
- Empty test cases and hints are filtered from save payloads exactly as before.
- Successful create/update closes the panel, shows the same toast, and refreshes the selected chapter.
- Problem publish, delete, edit, and ordering actions preserve current behavior.

#### Excel import

- The modal opens and closes from the same action.
- The sample workbook link remains unchanged.
- File selection and drag-and-drop accept `.xlsx` and `.xls` files.
- Required sheets, optional hints, normalization, cross-sheet validation, duplicate detection, and the 200-problem constraint behave as before.
- Preview counts and rows match the pre-refactor modal.
- Invalid workbooks cannot be submitted.
- Successful import closes the modal and refreshes the curriculum browser.
- Failed parsing or import preserves the current errors and allows another attempt.

## Acceptance Criteria

- `/admin/problems/page.tsx` is a thin Server Component under 30 lines.
- Curriculum browsing, problem editing, and Excel import each have a focused route-private workflow.
- Route-owned visual and pure implementation lives under `/admin/problems/_components`, `_hooks`, or `_lib`.
- `src/components/admin/CurriculumExcelImportModal.tsx` no longer exists.
- No new generic admin framework or global module is introduced for one-route behavior.
- No new route-private module exceeds 300 lines without a documented locality reason.
- Existing URLs, endpoints, request methods, request bodies, response assumptions, UI text, styling, editors, validation, ordering, and import behavior remain unchanged.
- Scoped lint, production build, and diff checks pass, or any unrelated pre-existing failures are reported separately.
- The diff contains no unrelated changes and does not include the user's existing `package-lock.json` or `.vscode/` work.

## Follow-up Work

- Refactor `/admin/users` and `/admin/ai-feedback` in separate focused specs.
- Standardize admin authorization through the existing `requireAdmin` seam.
- Move order swapping to a server-side atomic mutation.
- Deepen curriculum persistence and validation only after agreeing on a full-stack authoring design.
- Add unit tests for problem-form normalization/validation and curriculum-import parsing once a testing framework is selected.
