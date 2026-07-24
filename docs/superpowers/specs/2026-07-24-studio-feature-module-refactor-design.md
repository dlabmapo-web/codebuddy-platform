# Studio Feature Module Refactor Design

**Date:** 2026-07-24  
**Status:** Approved for implementation  
**Scope:** New Studio academy management and new authentication routes

## Goal

Make the new Studio and authentication code easy to read, navigate, test, and
extend by replacing large route files with focused, feature-local modules.
Preserve every existing route, permission, translation, request, response, and
visible behavior.

The organization follows the useful pattern in `jurabek10/kichkintoy`: route
files remain thin, feature-specific modules live beside their route, and
shared UI is promoted only when it is genuinely reused.

## In Scope

- `packages/web/src/app/(v2-studio)/studio/academies/[academyId]/content`
- `packages/web/src/app/(v2-studio)/studio/academies/[academyId]/applications`
- `packages/web/src/app/(v2-studio)/studio/academies/[academyId]/invitations`
- `packages/web/src/app/(v2-studio)/studio/academies/[academyId]/members`
- `packages/web/src/app/(v2-auth)/auth/login`
- `packages/web/src/app/(v2-auth)/auth/pending`
- `packages/web/src/app/(v2-auth)/auth/signup`

The main refactor targets are:

- `exercise-workspace.tsx`
- `course-builder.tsx`
- `courses-manager.tsx`
- `applications-manager.tsx`
- `invitations-manager.tsx`
- `members-manager.tsx`
- `pending-approval.tsx`
- `signup-form.tsx`
- Supporting login modules when an extraction improves locality or creates a
  genuinely reused authentication module
- Supporting content modules when extracting a responsibility improves
  locality

## Out of Scope

- Old Next.js admin routes and modules
- API, database, shared-contract, or permission behavior changes
- UI redesign
- Translation-copy changes
- New functionality
- Academy shell/sidebar refactors
- Authentication routes other than login, pending, and signup
- Introducing a global state library
- Moving route features into a global `features` directory

## Architecture

### Feature-local organization

Each route owns its implementation. A feature may use:

- `_components` for focused rendering modules
- `_hooks` for coordinated client state, mutations, and navigation behavior
- `_lib` for pure feature types and transformations

Directories are created only when the feature needs them. Small modules stay
small; the refactor must not create pass-through files solely to reduce line
counts.

### Thin route modules

`page.tsx` remains responsible for:

- Reading route parameters
- Loading server data
- Applying server-side access decisions
- Rendering the route's top-level screen module

Client-side authoring and management behavior must not move into page modules.

### Deep feature modules

The primary screen module presents a small interface to its route. Internally,
it composes focused rendering modules and a feature hook where coordinated
state exists.

The deletion test applies to every extraction: deleting an extracted module
should force its responsibility to reappear in a caller. Pure pass-through
modules are not acceptable.

## Content Structure

### Exercise authoring

Target organization:

```text
exercises/
├── _components/
│   ├── exercise-workspace.tsx
│   ├── exercise-header.tsx
│   ├── basic-information.tsx
│   ├── starter-code-editor.tsx
│   ├── answers-editor.tsx
│   ├── hints-editor.tsx
│   ├── exercise-readiness.tsx
│   ├── preview-modal.tsx
│   └── authoring-fields.tsx
├── _hooks/
│   └── use-exercise-authoring.ts
└── _lib/
    ├── exercise-draft.ts
    └── exercise-preview.ts
```

Responsibilities:

- `exercise-workspace` composes the screen.
- `use-exercise-authoring` owns draft state, dirty-state detection, save
  mutation, concurrency state, preview state, and navigation warnings.
- `exercise-draft` owns draft types, server-to-draft conversion,
  draft-to-payload conversion, serialization, collection replacement, and
  client keys.
- Section modules render and update one authoring responsibility each.
- `preview-modal` and `exercise-preview` own preview rendering and safe preview
  document generation.
- Shared authoring fields remain private to the exercise feature.

### Course builder

Target organization:

```text
versions/[versionId]/
├── _components/
│   ├── course-builder.tsx
│   ├── builder-header.tsx
│   ├── module-card.tsx
│   ├── lecture-row.tsx
│   └── builder-controls.tsx
├── _hooks/
│   └── use-course-builder.ts
└── _lib/
    └── course-tree.ts
```

Responsibilities:

- `course-builder` composes the builder screen.
- `use-course-builder` owns tree state, mutation orchestration, pending state,
  errors, publishing, and navigation refreshes.
- `course-tree` owns tree aliases and pure ordering helpers.
- Module and lecture modules render their corresponding curriculum concepts.
- Reusable edit, move, delete, and statistic controls remain together in
  `builder-controls` rather than becoming one-file shallow modules.

### Course list

Target organization:

```text
courses/
├── _components/
│   ├── courses-manager.tsx
│   ├── courses-table.tsx
│   ├── create-course-dialog.tsx
│   └── lifecycle-guide.tsx
└── _hooks/
    └── use-courses-manager.ts
```

The manager hook owns querying, creation state, mutations, and navigation.
Presentation modules own the table, create dialog, and lifecycle guidance.

## Invitations Structure

Target organization:

```text
invitations/
├── _components/
│   ├── invitations-manager.tsx
│   ├── invitation-form.tsx
│   └── invitations-list.tsx
└── _hooks/
    └── use-invitations-manager.ts
```

The hook owns form state, query state, mutation behavior, cache invalidation,
and error state. The form and list expose focused interfaces and do not know
how ORPC cache keys are managed.

## Applications Structure

Target organization:

```text
applications/
├── _components/
│   ├── applications-manager.tsx
│   ├── applications-list.tsx
│   └── application-card.tsx
└── _hooks/
    └── use-applications-manager.ts
```

The hook owns application querying, review mutation, cache invalidation,
pending state, and error state. Each application card owns only its local role
and review-reason input state. ORPC behavior remains behind the feature hook
and is not repeated in rendering modules.

## Members Structure

Target organization:

```text
members/
├── _components/
│   ├── members-manager.tsx
│   └── members-table.tsx
└── _hooks/
    └── use-members-manager.ts
```

The hook owns member querying, role mutation, cache invalidation, pending
state, and error state. The table owns column construction and role controls.

## Authentication Structure

Authentication modules remain route-local under `(v2-auth)`. Shared
authentication fields and social-login modules that are already reused remain
under `auth/_components`; route-specific behavior stays beside its route.

### Login

The current login form is already small. It remains a single route-local
module unless a repeated visual concept can be shared with signup without
increasing its interface. The route page remains a thin server module.

No hook is introduced for `useActionState`; wrapping one action-state call
would create a shallow module.

### Pending approval

Target organization:

```text
pending/
├── _components/
│   ├── pending-approval.tsx
│   ├── pending-status-card.tsx
│   └── pending-actions.tsx
├── _hooks/
│   └── use-pending-approval.ts
└── _lib/
    └── pending-presentation.ts
```

Responsibilities:

- `pending-approval` composes the state view.
- `use-pending-approval` owns account querying, manual status refresh,
  cancel/reapply mutation behavior, and last-checked state.
- `pending-presentation` owns the typed state-to-copy map, icon selection, and
  status-tone mapping without importing React or ORPC.
- `pending-status-card` renders academy, membership/application status, role,
  and rejection reason.
- `pending-actions` renders the state-dependent enter, refresh, cancel,
  reapply, and sign-out actions.

### Signup

Target organization:

```text
signup/
├── _components/
│   ├── signup-form.tsx
│   ├── academy-selector-field.tsx
│   └── signup-notice.tsx
└── _hooks/
    └── use-signup-academies.ts
```

Responsibilities:

- `signup-form` composes academy selection, credential fields, social login,
  role notice, and the login link.
- `use-signup-academies` owns the signup-academy query and selected-academy
  state, including invited-academy locking.
- `academy-selector-field` owns the selector trigger and academy loading/error
  presentation.
- `signup-notice` owns the role-notice presentation.

`useActionState(signupAction)` stays in the form because it is the native form
submission seam and does not benefit from another module interface.

## Interface and Dependency Rules

- Route-local modules may import shared Studio UI and project libraries.
- Rendering modules must not call ORPC directly when their feature hook already
  owns that behavior.
- Feature hooks return named state and actions rather than exposing mutation
  objects wholesale.
- Pure `_lib` modules must not import React, Next.js navigation, ORPC, or
  translations.
- Avoid prop drilling through more than one pass-through module. When several
  tightly coupled values travel together, expose a focused feature interface.
- Do not add a context provider unless sibling depth makes direct composition
  materially harder to understand.
- Do not introduce index-barrel files; explicit imports keep dependencies
  visible.
- Prefer kebab-case filenames, matching the current project.

## Size and Readability Guidance

- Substantial rendering modules should generally remain between 80 and 250
  lines.
- Hooks may exceed that range only when splitting would expose mutation
  ordering or invariants across a seam.
- Tiny modules are allowed only when they represent a stable, reusable concept.
- Line count is a diagnostic, not a success criterion. Responsibility and
  locality determine the extraction.

## Behavior Preservation

The refactor must preserve:

- Team Lead editing and Manager read-only behavior
- Course, module, lecture, and exercise workflows
- Manual problem draft conversion and fixed service limits
- Login and signup form actions
- Signup academy loading and invitation locking
- Pending-account state resolution, refresh, cancellation, and reapplication
- Application review role and reason handling
- Dirty-state and navigation warnings
- Concurrent-edit conflict handling
- Query invalidation and route refresh behavior
- Loading, empty, error, and pending states
- Responsive layout and accessibility names
- English and Korean translation keys

No network payload or route URL may change.

## Testing and Verification

### Static verification

- Focused ESLint for all changed and new Studio modules
- Web TypeScript check
- Translation catalog check
- `git diff --check`
- Verify no old admin path changed

### Automated verification

- Existing web unit tests
- Existing shared and API tests because the uncommitted feature implementation
  remains in the working tree
- Production build
- Add focused pure-function tests when logic moves into `_lib`

### Browser regression

Using the signed-in local Studio sessions:

- Team Lead can open courses and the course builder.
- Team Lead can open the all-in-one problem authoring page.
- The continuous problem form still renders all sections.
- Inline answer and hint controls still work.
- Manager remains read-only.
- Academy applications retain review controls and states.
- Members and invitations retain their current controls and states.
- Login and signup retain credentials and social-login flows without
  submitting test data.
- Pending approval retains every membership/application state and manual
  refresh behavior.
- No new browser console errors appear.

Browser checks must not create or save test data.

## Git Safety

- The specification may be committed separately.
- Refactor implementation remains uncommitted for user review.
- Existing uncommitted feature work must be preserved.
- Unrelated user changes and `.superpowers/` remain untouched.

## Acceptance Criteria

- No targeted route or feature changes behavior.
- The large files are replaced by focused feature-local modules.
- Route pages remain thin server modules.
- ORPC mutation and cache behavior has one locality per feature.
- Pure transformations have a React-free test seam.
- No arbitrary pass-through modules are introduced.
- Tests, lint, type checks, translation checks, production build, and browser
  regression checks pass.
