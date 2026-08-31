# Manager Inherits Team Lead Functions

**Date:** 2026-08-31  
**Status:** Implemented  
**Scope:** Academy role permissions, Manager content authoring, and permission-aware Studio controls

## 1. Summary

An academy may operate without a dedicated Team Lead. In that case, its
Manager must be able to perform the Team Lead's operational work without being
assigned a second role.

The current implementation does not provide that fallback. A Manager can open
and review the academy's curriculum, but cannot create or edit courses, manage
programming exercises, publish content, or use the Excel content importer.
Those operations are granted only to `TEAM_LEAD`.

This feature makes `MANAGER` a permission superset of `TEAM_LEAD`:

```text
TEAM_LEAD = team-lead operational permissions

MANAGER = team-lead operational permissions
        + manager-only administration permissions
```

This is permission inheritance, not role inheritance. The actor remains a
`MANAGER`, keeps the Manager control-tower overview, and continues to receive
Manager-only academy administration. Exact-role Team Lead and Teacher surfaces
remain unavailable.

## 2. Goals

- Allow an active Manager to perform every permission-controlled function an
  active Team Lead can perform in the same academy.
- Let a Manager create, edit, publish, and hide curriculum.
- Let a Manager create and edit programming exercises, including starter code,
  correct answer code, test cases, hints, visibility, and AI-feedback settings.
- Let a Manager download, preview, validate, and apply Excel content imports.
- Preserve all existing Manager-only capabilities.
- Make future Team Lead permissions reach Manager automatically when they are
  added to the shared Team Lead permission set.
- Keep authorization based on named permissions and active academy membership.

## 3. Non-goals

- Do not change the Manager control-tower overview.
- Do not give Manager access to the Team Lead curriculum-overview endpoint or
  page. That surface continues to require the exact `TEAM_LEAD` role.
- Do not give Manager access to Teacher live monitoring, assigned-student work,
  or teacher-only submission workflows. Their exact-role and assignment checks
  remain authoritative.
- Do not change what Team Lead can do.
- Do not grant Team Lead any Manager-only authority, including member-role
  changes, student enrollment, academy settings, or class schedules.
- Do not change Student, Teacher, or platform Admin permissions.
- Do not create a second Manager-specific content editor, import flow, API, or
  data model.
- Do not add a database migration or modify persisted academy roles.

## 3.1 What this supersedes

The teacher answer code modal design listed Manager as unable to author
problems or use the Excel workbook. That row is amended there: a Manager
authoring the curriculum necessarily reads and writes model solutions, because
the answer is part of a problem. The monitoring answer modal is unaffected —
it needs an open teaching visit, which no Manager has.

## 4. Current behavior

`packages/shared/src/auth/roles.ts` defines independent permission arrays for
all four academy roles. The current `TEAM_LEAD` array includes curriculum
authoring and content import, while `MANAGER` includes only curriculum review
plus Manager administration.

Compared with Team Lead, Manager currently lacks these permissions:

| Permission | Current purpose |
|---|---|
| `curriculum.draft` | Draft-level curriculum access |
| `curriculum.manage` | Create and edit courses, modules, and lectures |
| `curriculum.publish` | Publish or hide curriculum |
| `exercises.manage` | Create and edit programming exercises and model solutions |
| `content.import` | Download and apply Excel content workbooks |
| `ai-feedback-rules.manage` | Manage exercise AI-feedback configuration |
| `classes.assigned.manage` | Structurally present on Team Lead; assignment gates keep it teacher-only in practice |
| `submissions.assigned.review` | Structurally present on Team Lead; assignment gates keep it teacher-only in practice |

The first six are active content-authoring gaps. The final two are deliberately
inert for both Team Lead and Manager because the teaching domain additionally
requires an exact assigned `TEACHER`. They are still inherited so `MANAGER`
remains a true permission superset of `TEAM_LEAD`.

The web already derives content behavior from named permission helpers:

- `canManageContent` checks `curriculum.manage`.
- `canManageExercises` checks `exercises.manage`.
- `canPublishContent` checks `curriculum.publish`.
- `canImportContent` checks `content.import`.

The API already enforces the same permissions in `CourseService` and
`ContentImportService`. The missing behavior therefore comes from the role map,
not from missing Manager-specific routes.

## 5. Chosen design

### 5.1 Composable permission sets

Define the Team Lead permission array once as a named, typed constant. Use that
same constant for `TEAM_LEAD`, and spread it into `MANAGER` before appending the
permissions that belong only to Manager.

Conceptually:

```ts
const teamLeadPermissions = [
  // every current Team Lead permission
] as const satisfies readonly AcademyPermission[];

const managerOnlyPermissions = [
  "academy.settings.manage",
  "academy.members.manage",
  "class-enrollments.manage",
  "class-schedule.manage",
] as const satisfies readonly AcademyPermission[];

export const academyRolePermissions = {
  STUDENT: studentPermissions,
  TEACHER: teacherPermissions,
  TEAM_LEAD: teamLeadPermissions,
  MANAGER: [...teamLeadPermissions, ...managerOnlyPermissions],
} as const satisfies Record<AcademyRole, readonly AcademyPermission[]>;
```

The implementation may keep Student and Teacher arrays inline if extracting
them adds no clarity. The load-bearing requirement is that Team Lead permissions
have one source and Manager composes that exact source.

This structure makes the policy mechanically visible and prevents drift. A
future permission added to `teamLeadPermissions` automatically appears in
Manager's permission set without a second edit.

### 5.2 Why not a global role hierarchy

The application must not interpret `MANAGER` as `TEAM_LEAD` at every role
check. Several surfaces intentionally depend on role identity rather than only
capability:

- `LeadScopeService.requireTeamLead` protects the Team Lead curriculum overview.
- the academy root selects a role-specific overview;
- teacher monitoring and submission access require an assigned `TEACHER`.

A general numeric or ordinal hierarchy would blur those boundaries. Composing
named permissions grants operational capability while preserving exact-role
guards.

### 5.3 Manager-only additions

Manager keeps the following permissions beyond the complete Team Lead set:

- `academy.settings.manage`
- `academy.members.manage`
- `class-enrollments.manage`
- `class-schedule.manage`

These remain absent from Team Lead. Existing last-active-manager protection,
membership transactions, invitation controls, enrollment checks, academy
settings guards, and schedule rules are unchanged.

## 6. Manager experience

No new page or component is required. Once the shared role map grants the
permissions, the existing permission-aware Studio pages expose their current
editable behavior to Manager.

### 6.1 Course catalog

On **Content → Courses**, Manager can:

- create a course;
- rename or edit a course;
- publish or hide a course;
- open the course builder in editing mode.

### 6.2 Course builder

Within a course, Manager can perform the same mutations as Team Lead:

- create, rename, move, reorder, and remove modules;
- create, rename, move, reorder, and remove lectures;
- create and manage programming-exercise materials;
- apply existing visibility and confirmation workflows.

No Manager-specific variation is introduced. Dirty-state protection,
optimistic locking, conflict messages, route refresh, and cache invalidation
continue to use the existing course-builder implementation.

### 6.3 Programming exercises

Manager can use the existing exercise-authoring workspace to edit:

- title and difficulty;
- description, input format, output format, and constraints;
- starter code;
- correct answer or model-solution code;
- sample and hidden test cases;
- hints and trigger expressions;
- AI-feedback configuration;
- student visibility.

The solution-code endpoint continues to require `exercises.manage`. Granting
that permission to Manager allows authoring access without adding the solution
to general curriculum, student-learning, collaboration, or submission payloads.

### 6.4 Excel import and export

Manager receives `content.import` and can use the same current-course workbook
flow as Team Lead:

1. Download the academy course workbook.
2. Edit or add content, including exercise `solution_code`.
3. Upload the workbook.
4. Review the generated plan and validation issues.
5. Apply a valid plan against the expected content revision.

Workbook schemas, limits, validation, masked issue previews, revision checks,
and audit behavior do not change.

### 6.5 Existing shared operational functions

Manager already holds the Team Lead permissions for curriculum review,
analytics, class management, teacher assignment, member reading, and
application review. Composition preserves these behaviors rather than adding
duplicates.

## 7. Routing and role-specific overviews

The academy root continues to select the view by the actor's actual membership
role:

- `MANAGER` receives the Manager control tower.
- `TEAM_LEAD` receives the Team Lead curriculum overview.
- `TEACHER` and `STUDENT` retain their existing destinations.

`LeadScopeService.requireTeamLead` keeps its explicit
`actor.role === "TEAM_LEAD"` conjunction. Granting `curriculum.manage` to
Manager must not weaken or remove this check.

The Content navigation already appears for Manager because Manager holds
`curriculum.review`. Editable controls inside those routes become available
through the newly inherited permissions. No duplicate navigation group or
Manager content route is added.

## 8. Authorization and security invariants

All inherited functions remain subject to the existing server-side academy
authorization rules:

1. The caller must be authenticated.
2. The caller must have an active `MANAGER` membership in the requested academy.
3. The composed Manager permission set must contain the operation's named
   permission.
4. Every requested course, module, lecture, material, import plan, class, and
   related identifier must belong to that academy and expected parent.
5. Existing validation and concurrency requirements must pass before a write.

The following invariants are unchanged:

- Suspended and inactive Managers are denied.
- A Manager in academy A cannot author or import content in academy B.
- A platform `ADMIN` without an active academy membership receives no normal
  academy authority.
- Teachers and Students do not gain authoring or import permissions.
- Team Lead does not gain Manager-only permissions.
- Hidden tests and model solutions remain absent from Student-facing and
  general learning APIs.
- Teacher monitoring remains limited by exact Teacher role, class assignment,
  enrollment, material access, and an open monitoring visit.
- Existing content mutations continue writing audit records naming the actual
  Manager actor and request ID.

## 9. API, schema, and data impact

No new oRPC procedure, HTTP endpoint, request schema, response schema, database
column, or Prisma migration is required.

Existing endpoints already authorize with named permissions. After the role-map
change, an active Manager follows the same data flow as Team Lead:

```text
Manager action in existing Studio page
  -> existing oRPC or import endpoint
  -> authenticated identity
  -> active academy membership
  -> named permission check
  -> existing ownership, validation, and revision checks
  -> existing transaction and audit record
  -> existing response and cache refresh
```

Authorization failures keep the current error codes and UI treatment. This
feature does not introduce fallback writes or role impersonation.

## 10. Documentation cleanup

Comments and older design statements that describe content authoring or import
as Team Lead-only must be updated where they would become false. In particular:

- `ContentImportService` comments must say that authorized content operators,
  currently Team Lead and Manager, hold `content.import`.
- web access-helper comments must no longer describe hiding import from Manager.
- the Team Lead overview design should retain its exact-role decision while
  acknowledging that Manager now holds the underlying content permissions.
- older behavior-preservation notes that require Manager read-only content
  behavior are historical and must not be treated as current acceptance
  criteria.

Documentation changes must not rewrite unrelated historical decisions.

## 11. Testing strategy

### 11.1 Shared authorization tests

Update `packages/shared/src/auth/roles.spec.ts` to prove:

- every entry in `academyRolePermissions.TEAM_LEAD` is also present in
  `academyRolePermissions.MANAGER`;
- Manager holds `curriculum.draft`, `curriculum.manage`,
  `curriculum.publish`, `exercises.manage`, `content.import`, and
  `ai-feedback-rules.manage`;
- Manager retains `academy.settings.manage`, `academy.members.manage`,
  `class-enrollments.manage`, and `class-schedule.manage`;
- Team Lead does not receive those Manager-only permissions;
- Teacher and Student permission assertions remain unchanged.

The subset assertion is the regression guard for future inheritance. Tests
must not duplicate only today's six content permissions and call that complete.

### 11.2 API tests

Extend content service and import tests with an active Manager actor to cover:

- creating and editing a course;
- changing curriculum visibility;
- creating and editing an exercise with `solutionCode`;
- reading the author-only solution through `exercises.manage`;
- previewing and applying an Excel import;
- preserving audit actor identity;
- refusing a suspended Manager and a Manager from another academy.

Existing Team Lead success and Teacher/Student denial cases remain required.
Focused tests may reuse existing table-driven authorization fixtures instead of
duplicating full mutation scenarios for every role.

### 11.3 Web tests

Update permission-helper and page/component tests to prove:

- `canManageContent("MANAGER")` is true;
- `canManageExercises("MANAGER")` is true;
- `canPublishContent("MANAGER")` is true;
- `canImportContent("MANAGER")` is true;
- Manager receives editing actions and editable fields on existing content
  pages;
- Team Lead behavior remains editable;
- Teacher and Student behavior remains read-only or inaccessible as currently
  designed;
- academy-root role selection still renders the Manager overview for Manager;
- the Team Lead overview remains unavailable to Manager.

### 11.4 Verification commands

Run verification in proportion to the central authorization change:

- shared, API, and web focused tests;
- complete shared, API, and web test suites;
- repository type-check;
- recursive production build;
- affected web lint and translation checks;
- `git diff --check`.

No Prisma generation or migration deployment is expected because the data model
does not change.

### 11.5 Browser smoke test

Using local signed-in sessions:

1. Sign in as Manager and verify the academy root remains the Manager control
   tower.
2. Open **Content → Courses** and create or edit test content.
3. Create or edit a programming exercise, including correct answer code, test
   cases, and hints.
4. Publish or hide content.
5. Open the Excel import flow and verify download, upload, preview, and apply.
6. Return to Manager people/settings workflows and confirm they remain present.
7. Sign in as Team Lead and confirm existing authoring remains unchanged.
8. Confirm Manager cannot open the Team Lead overview or Teacher monitoring
   routes directly.

Browser-created test data should use clearly identifiable local fixtures and be
removed or left hidden according to the repository's test-data policy.

## 12. Rollout and deployment

This is an authorization expansion, so deployment must treat it as a security-
sensitive application release even though it has no migration.

1. Complete automated and browser verification.
2. Follow `docs/operations/deployment-guide.local.md` for the existing deployed
   Version 2 environment.
3. After deployment, sign in as an active Manager in a test academy and verify
   one content edit and one exercise edit.
4. Confirm a Team Lead still cannot access Manager-only administration.
5. Review application logs and audit records for the Manager mutations.

Rollback is an application rollback that restores the previous permission map.
No database rollback is necessary.

## 13. Acceptance criteria

- [ ] `MANAGER` is constructed from the complete Team Lead permission set plus
      Manager-only permissions.
- [ ] A test proves that Manager's permissions are a superset of Team Lead's.
- [ ] Adding a permission to the Team Lead set requires no second Manager edit.
- [ ] Manager can create, edit, publish, and hide curriculum.
- [ ] Manager can create and edit programming exercises, including correct
      answer code, tests, hints, and AI-feedback configuration.
- [ ] Manager can download, preview, and apply Excel content workbooks.
- [ ] Manager keeps the Manager control-tower overview.
- [ ] Manager cannot open the Team Lead curriculum overview.
- [ ] Manager does not gain Teacher monitoring or assigned-student access.
- [ ] Team Lead does not gain Manager-only academy administration.
- [ ] Suspended and cross-academy Manager requests remain denied.
- [ ] Student-facing payloads still omit hidden tests and model solutions.
- [ ] Existing validation, optimistic locking, import revision checks, audit
      logging, and error handling remain intact.
- [ ] No database migration or API-contract change is introduced.
