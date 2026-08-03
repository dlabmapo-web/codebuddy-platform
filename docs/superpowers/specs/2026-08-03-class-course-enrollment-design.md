# Academy Classes, Course Assignments, and Student Enrollment Design

**Date:** 2026-08-03

**Status:** Approved for implementation planning

**Scope:** Academy class management, many-to-many course assignment, manager-owned student enrollment, and class-gated student learning access

## Summary

Cove Studio will introduce academy-scoped classes as the delivery boundary between reusable courses and students. A class may learn multiple courses, a course may be assigned to multiple classes, and a student may belong to multiple classes in the same academy.

Team Leads and Managers manage class structure and course assignments. Managers alone manage student enrollment because enrollment changes a student's learning access and belongs with academy membership administration. Teachers are deliberately excluded from class management in this phase; a later teacher-monitoring feature will assign teachers to classes and build on these boundaries.

Students see the union of visible courses assigned to their active classes. Removing a course assignment, removing an enrollment, or archiving a class revokes access without deleting drafts, submissions, scores, or progress.

## Goals

- Let Team Leads and Managers create and maintain academy classes.
- Let one class learn multiple academy courses.
- Let one course be assigned to multiple classes.
- Let a student belong to multiple classes in the same academy.
- Restrict student enrollment changes to Managers.
- Restrict student learning access to courses assigned through active classes.
- Enforce assignment access on lists and direct URLs.
- Preserve all student work when access is removed.
- Establish a clean boundary for later teacher assignment and monitoring.
- Match the existing v2 Studio visual language and interaction patterns.

## Non-goals

- Assigning teachers to classes.
- Teacher monitoring, live presence, collaborative editing, or feedback.
- Class schedules, attendance, rooms, recurring lessons, or calendars.
- Per-student course assignments outside classes.
- Course sequencing, prerequisites, due dates, or paced releases.
- Class announcements, messaging, grading dashboards, or reports.
- Permanent class deletion.
- Moving students between academies.
- Changing course authoring or hierarchical visibility behavior.

## Product decisions

1. A class belongs to exactly one academy.
2. A class may have many courses, and a course may belong to many classes.
3. A student may be enrolled in many classes within one academy.
4. Team Leads and Managers can create, edit, archive, and restore classes.
5. Team Leads and Managers can assign and remove courses.
6. Only Managers can enroll and remove students.
7. Only active academy memberships with the `STUDENT` role are eligible for enrollment.
8. A course and class must belong to the same academy before they can be related.
9. Students receive access through active enrollments in active classes.
10. A course must also be effectively visible under the existing curriculum visibility rules.
11. Removing access never deletes drafts, submissions, scores, or progress.
12. Archived classes remain visible to authorized staff and can be restored.
13. Class names do not have to be unique; stable UUIDs are authoritative.
14. Teachers do not manage classes in this phase.

## Domain model

### Class

Add a Prisma model mapped to `classes`:

```text
Class
- id: UUID
- academyId: UUID
- name: string, 1-120 trimmed characters
- description: string, default empty, maximum 2,000 characters
- status: ACTIVE | ARCHIVED
- createdByUserId: UUID
- archivedAt: timestamp or null
- createdAt: timestamp
- updatedAt: timestamp
```

Relations:

- `academy` restricts deletion while classes exist.
- `createdBy` restricts deletion of the creator profile.
- `courseAssignments` contains assigned courses.
- `enrollments` contains enrolled academy memberships.

Indexes:

- `(academyId, status, updatedAt DESC)` for the management list.
- `(academyId, name)` for search and deterministic sorting support.

Class names are intentionally not unique. Academies may reuse a human-friendly name across years or programs. The UI shows status and other context rather than treating a name as an identifier.

### ClassCourse

Add a join model mapped to `class_courses`:

```text
ClassCourse
- classId: UUID
- courseId: UUID
- assignedByUserId: UUID
- assignedAt: timestamp
```

Constraints and indexes:

- Composite primary or unique key `(classId, courseId)` prevents duplicate assignments.
- Index `(courseId, classId)` supports student-access queries from courses.
- The service verifies that the class and course have the same `academyId` in the transaction that creates the relation.

The assignment stores its actor and time for operational traceability. Full before/after state also remains available in `AuditLog`.

### ClassEnrollment

Add a join model mapped to `class_enrollments`:

```text
ClassEnrollment
- classId: UUID
- membershipId: UUID
- enrolledByUserId: UUID
- enrolledAt: timestamp
```

Constraints and indexes:

- Composite primary or unique key `(classId, membershipId)` prevents duplicate enrollment.
- Index `(membershipId, classId)` supports student course-access queries.
- Enrollment references `AcademyMembership`, not only `User`. This makes academy scope explicit and supports one user having different memberships in different academies.
- The service verifies that the membership belongs to the class academy, is `ACTIVE`, and has role `STUDENT` in the transaction that creates the enrollment.

If a membership later becomes suspended or changes away from `STUDENT`, it stops granting course access even if the enrollment row remains. Managers may remove stale enrollment rows from the class roster.

### Class status

Add:

```text
enum ClassStatus {
  ACTIVE
  ARCHIVED
}
```

Archiving sets `status = ARCHIVED` and `archivedAt`. Restoring sets `status = ACTIVE` and clears `archivedAt`. No class-management endpoint permanently deletes a class.

## Permissions and authorization

Introduce explicit permissions rather than overloading `classes.assigned.manage`:

- `classes.manage`: create, edit, archive, restore, and manage course assignments.
- `class-enrollments.manage`: enroll and remove students.

Role mapping:

| Capability | Student | Teacher | Team Lead | Manager |
|---|:---:|:---:|:---:|:---:|
| View/manage class structure | No | No | Yes | Yes |
| Assign/remove courses | No | No | Yes | Yes |
| View class roster | No | No | Yes | Yes |
| Enroll/remove students | No | No | No | Yes |
| Learn assigned visible courses | Yes | No | No | No |

The existing `classes.assigned.manage` permission remains reserved for the later teacher-assignment and monitoring design. It does not authorize class CRUD in this phase.

Every query and mutation must verify academy scope in the NestJS API. Frontend visibility is only a usability layer and is never the authorization boundary.

## Student course-access policy

### Effective access

A student may access a course only when all conditions are true:

```text
user.status = ACTIVE
AND academy membership.status = ACTIVE
AND academy membership.role = STUDENT
AND class enrollment exists for that academy membership
AND class.status = ACTIVE
AND class-course assignment exists
AND course.academyId = requested academy
AND course.isVisible = true
```

Exercise access additionally requires the existing module, lecture, and material visibility checks.

If a student belongs to several active classes, accessible courses are the distinct union of assignments from all those classes. Duplicate paths to the same course do not duplicate the course in the catalog or progress totals.

### Enforcement points

The same policy must be enforced in:

- student course listing;
- course outline reads;
- exercise workspace reads;
- previous/next exercise navigation;
- draft listing, saving, and discarding;
- submission creation;
- submission result and stream reads where current material access is required.

Filtering only the catalog is insufficient because a student could otherwise open a remembered or guessed direct URL.

Implement a focused reusable Prisma predicate or access service for assigned-course access. Do not duplicate slightly different relationship checks across each method.

### Staff learning access

This phase changes student delivery access only. Existing authorized staff curriculum review and preview behavior remains governed by staff permissions and curriculum visibility rules; staff are not required to enroll themselves in a class.

### Access removal and history

Removing a `ClassCourse`, removing a `ClassEnrollment`, archiving a class, suspending a membership, or changing the membership away from `STUDENT` immediately stops that path from granting access.

The system never deletes or resets:

- `ExerciseDraft`;
- `Submission`;
- `SubmissionGradingCase`;
- `SubmissionCase`;
- `StudentExerciseProgress`.

If another active class still grants the same course, access continues. If access is later restored, the student sees the same saved work and progress.

## API and module design

### Shared package

Add a focused classes domain with Zod schemas for:

- class status;
- class summary;
- class detail;
- assigned course summary;
- enrolled student summary;
- eligible student summary;
- create and update inputs;
- set-course-assignment input;
- add/remove enrollment inputs.

Add an `academyClasses` oRPC contract with operations equivalent to:

```text
list({ academyId, status? })
get({ academyId, classId })
create({ academyId, name, description })
update({ academyId, classId, name, description })
setStatus({ academyId, classId, status })
setCourses({ academyId, classId, courseIds[] })
listEligibleStudents({ academyId, classId })
addStudents({ academyId, classId, membershipIds[] })
removeStudent({ academyId, classId, membershipId })
```

`setCourses` replaces the complete desired course set transactionally. It computes additions and removals on the server, validates every submitted course before writing, and returns the new class detail. `addStudents` accepts a bounded batch for efficient Manager workflows; duplicate existing enrollments are idempotent.

Course-assignment and enrollment mutations also touch `Class.updatedAt`. The Classes list therefore reports the most recent structural, course, or roster change rather than only the most recent name edit.

### API package

Add a `classes` NestJS module containing:

- `ClassesService` for business rules and transactions;
- a classes oRPC router adapter;
- focused query helpers for class detail and access policy;
- tests colocated with the service and access helper.

The module owns class CRUD, course assignments, enrollment, and student assigned-course authorization. It depends on `AcademyAccessService`, `PrismaService`, and the existing audit service.

Register the router in the root oRPC router and the module in `AppModule`.

### Transactions and concurrency

The following mutations run in Prisma transactions:

- creating a class and its audit record;
- updating class metadata and its audit record;
- archiving/restoring and auditing the transition;
- validating and replacing course assignments;
- validating and adding student enrollments;
- removing enrollment and auditing the removal.

Class detail responses include `updatedAt`. Metadata and full course-set updates accept `expectedUpdatedAt`; a stale value returns a conflict so two staff members do not silently overwrite each other. Single enrollment addition/removal is naturally idempotent and does not require the class revision.

## Studio information architecture

Add a **Teaching** navigation group with **Classes** for Team Leads and Managers:

```text
Academy
Learning
Curriculum
Teaching
└── Classes
People
```

The group appears according to `classes.manage`, not according to content-management or academy-membership permissions. Teachers do not see it in this phase.

Routes:

```text
/studio/academies/:academyId/classes
/studio/academies/:academyId/classes/:classId
```

Both routes use the existing `StudioShell` and its academy switcher, responsive sidebar, header, content width, and permission-aware error state.

## Visual and interaction design

### Design direction

The Classes feature extends the established Studio design rather than introducing a new visual system.

Palette:

- Brand blue `#1B64DA` for primary actions and active relationships.
- Brand soft `#EAF1FE` for selected rows, chips, and focus context.
- Ink `#16181D` for primary text.
- Subdued slate `#5A6270` for secondary text.
- Canvas `#F4F7FC` and border `#E5E8EC` for structure.
- Existing success, warning, danger, and retired tokens for state.

Typography uses Pretendard Variable with the current Studio scale. Counts use tabular numerals. No new typeface, decorative gradient, or unrelated animation is introduced.

Layout reuses:

- `StudioShell` page title and description;
- `DataTable` search, facets, sorting, pagination, and column controls;
- existing buttons, dropdown menus, badges, modals, responsive selectors, and drawers;
- current card, border, radius, focus-ring, and reduced-motion behavior.

### Signature relationship summary

The class detail page includes one distinctive but functional relationship summary:

```text
[ 3 courses ]  ──▶  [ Class 1 ]  ──▶  [ 18 students ]
```

On narrow screens it stacks vertically. Counts are derived from current assignments and enrollments. This element explains that a class connects curriculum to learners; it is not a decorative statistics dashboard.

### Classes list

The list page contains:

- title and plain-language description;
- `New class` primary action;
- search by class name and description;
- Active/Archived status facet;
- columns for class, status, assigned courses, students, last change, and actions;
- a brand-soft `Open` link and an Actions menu consistent with the Courses table.

Assigned courses appear as up to two compact title chips followed by `+N` when necessary. The accessible name exposes the full course list. Student and course counts use tabular numerals.

The empty state says what to do next and shows `Create class` only when authorized. An archived-only or filtered empty state explains how to change the filter instead of incorrectly claiming no classes exist.

### Create and edit class

The create/edit modal mirrors the existing Course modal:

- required name;
- optional description;
- inline validation;
- Cancel and Create/Save changes actions;
- disabled submit while invalid or pending;
- focus moves into the first field and returns to the trigger on close.

Creating a class does not combine course or student selection into a wizard. After creation, the app opens the class detail page, where the next actions are clear. This keeps creation small and avoids a long modal with mixed permissions.

### Class detail

The detail page contains:

1. Header with class name, status badge, description, edit action, and Archive/Restore action.
2. Relationship summary.
3. Courses panel.
4. Students panel.

The Courses panel shows assigned courses, visibility badges, and an `Assign courses` action for Team Leads and Managers. The responsive selector supports search and multi-selection. Hidden courses may be assigned and display a clear note: assignment is saved, but students cannot open the course until it is visible.

The Students panel is readable by Team Leads and Managers. It shows the student's display name, email, and membership state. Only Managers see `Add students` and removal controls. The add-students selector searches only eligible active same-academy student memberships that are not already enrolled in that class and supports a bounded multi-select batch.

Removing a course or student requires a confirmation that states access will be removed while learning history remains. Archiving a class requires confirmation and reports the number of course assignments and enrollments affected. Restoring does not require confirmation.

### Responsive and accessible behavior

- Tables retain existing responsive overflow and column controls.
- Multi-select popovers become drawers on small screens through the existing responsive selector pattern.
- The relationship summary stacks without horizontal scrolling.
- Status is communicated by text and icon/dot, never color alone.
- Every icon-only action has an accessible name.
- Focus indicators use the current brand ring.
- Pending mutations disable only controls they affect.
- Existing reduced-motion preferences remain respected.

## Frontend state and data flow

Server pages load the initial permission-aware state with the server oRPC client. Client manager hooks own table state, modal state, selection drafts, mutations, and query invalidation following the existing Courses and Members feature patterns.

Recommended component boundaries:

```text
classes/page.tsx
└── ClassesManager
    ├── ClassesTable
    └── ClassModal

classes/[classId]/page.tsx
└── ClassDetailManager
    ├── ClassHeader
    ├── ClassRelationshipSummary
    ├── ClassCoursesPanel
    ├── ClassStudentsPanel
    ├── CourseAssignmentDialog
    ├── StudentEnrollmentDialog
    └── AccessRemovalDialog
```

Managers update local state only from successful server responses. Failed mutations retain the current form or selection so the user can correct or retry it. Query keys include `academyId` and `classId` to prevent cross-academy cache collisions.

## Validation and error behavior

Add stable error codes and localized English/Korean messages for:

- class not found in the selected academy;
- class archived when an active-only mutation is attempted;
- stale class update;
- course not found in the academy;
- ineligible or cross-academy membership;
- enrollment mutation without Manager permission;
- student course not assigned;
- invalid class name or description;
- generic transactional failure.

Student requests for an unassigned, hidden, or nonexistent course use the same not-found/unavailable response family. They must not reveal course titles, class names, or assignment existence.

Management screens distinguish forbidden access from transient loading failure. They keep the last successful snapshot during retryable client errors. Confirmed removals update only after the API succeeds.

## Audit logging

Record these actions with academy, actor, target, and before/after context:

- `class.created`;
- `class.updated`;
- `class.archived`;
- `class.restored`;
- `class.courses.updated`, including added and removed course IDs;
- `class.students.enrolled`, including membership IDs;
- `class.student.removed`.

Audit payloads contain identifiers and operational metadata, not student code or submission contents.

## Migration and seed behavior

This feature introduces new empty tables. It does not infer classes from existing academy memberships or grant every student every existing course.

After deployment, students without an active class-course path see an assigned-courses empty state. Development and E2E seeds must create explicit classes, course assignments, and student enrollments for existing learning fixtures so the current student journey continues to work.

The migration creates enums, tables, foreign keys, unique constraints, and indexes in dependency order. Its rollback drops only the new class-domain objects and does not modify student history tables.

## Testing strategy

### Shared package

- Schema acceptance and rejection for class inputs and outputs.
- Permission-map tests for Student, Teacher, Team Lead, and Manager.
- Contract type coverage for batch assignment and enrollment inputs.

### API unit and integration tests

- Team Lead and Manager class CRUD authorization.
- Manager-only enrollment authorization.
- Cross-academy class, course, and membership rejection.
- Active `STUDENT` membership eligibility.
- Idempotent duplicate enrollment handling.
- Transactional replacement of course assignments.
- Optimistic concurrency conflict on stale class updates.
- Archive and restore behavior.
- Audit records for every management mutation.
- Student access through one class and through the union of multiple classes.
- Duplicate course assignment paths returning one catalog entry.
- Direct course, exercise, draft, and submission authorization.
- Hidden curriculum still overriding class assignment.
- Access removal without deletion or reset of learning history.
- Continued access when a second active class still grants the course.

### Web component and hook tests

- Role-specific action visibility.
- Search, status filtering, and assigned-course presentation.
- Create/edit form validation and retained failure state.
- Hidden-course explanation in the assignment selector.
- Manager-only add/remove student controls.
- Confirmation copy for course, student, and archive actions.
- English and Korean translations.
- Keyboard focus and accessible names.

### End-to-end tests

1. A Team Lead creates a class and assigns multiple courses.
2. The Team Lead can view but cannot change student enrollment.
3. A Manager enrolls a student in the class.
4. The student sees the assigned visible courses and cannot open an unassigned course by URL.
5. The Manager removes one course; its saved work disappears from navigation but remains stored.
6. Reassigning the course restores access to the same draft and progress.
7. Archiving the class revokes its access path; restoring it restores that path.

## Delivery order

1. Shared domain schemas, permissions, error codes, and oRPC contracts.
2. Prisma models, migration, generated client, and seed updates.
3. NestJS classes module, service, router, audit integration, and tests.
4. Shared student assigned-course access helper and enforcement across learning operations.
5. Studio navigation and Classes list.
6. Class detail, course assignment, and Manager enrollment flows.
7. Localization, component tests, and end-to-end coverage.

## Success criteria

- A Team Lead or Manager can create an academy class and assign multiple courses.
- A Manager can enroll a student in multiple classes.
- A Team Lead cannot change enrollment.
- Cross-academy relationships cannot be created.
- A student sees exactly the distinct visible courses granted by active class paths.
- Direct URLs cannot bypass assignment checks.
- Removing access preserves all historical work and restores it when access returns.
- Archived classes grant no access and can be restored.
- Management changes are audited.
- The Classes screens are visually and behaviorally consistent with the existing Studio pages on desktop and mobile.
- The resulting class boundary is ready for a later teacher-assignment and monitoring feature.
