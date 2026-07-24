# Team Lead Content Migration Design

**Status:** Awaiting written specification review
**Date:** 2026-07-24
**Scope:** Migrate Cove v1 administrator content features into the Cove v2 Team Lead Content Studio without deleting or modifying the working v1 feature set.

## 1. Purpose

Cove v1 is a full-stack Next.js application whose administrator area manages:

- Subjects, stages, chapters, and programming problems.
- Problem descriptions, starter code, constraints, test cases, and hints.
- Publishing and ordering.
- Excel curriculum import.
- AI feedback patterns.
- User accounts.

Cove v2 separates these responsibilities:

- `MANAGER` owns academy membership, invitations, approvals, roles, suspension, and academy settings.
- `TEAM_LEAD` owns academy curriculum, problem authoring, publishing, content imports, AI feedback rules, and content-level analytics.
- `MANAGER` inherits Team Lead content permissions as an operational override.
- Platform `ADMIN` is a platform operator and does not perform routine academy content management.

This design migrates the content-related v1 administrator features. V1 user management is not part of this migration because its v2 replacement already belongs to academy Manager workflows.

## 2. Non-destructive migration rule

The existing v1 pages, Route Handlers, components, database access, and URLs remain intact while v2 is built.

In particular, this migration must not delete, rename, or repurpose:

- `packages/web/src/app/(admin)`
- `packages/web/src/app/api/admin`
- `packages/web/src/components/admin`
- Existing v1 student, teacher, fullscreen, or authentication routes
- Existing v1 database tables

V2 content is implemented separately through:

- `packages/shared` for contracts, schemas, permissions, and public domain types.
- `packages/api` for NestJS business logic, authorization, Prisma persistence, transactions, and audit logging.
- The `(v2-studio)` route area in `packages/web` for Team Lead and Manager interfaces.
- New Prisma migrations in `packages/api/prisma/migrations`.
- A later, explicit v1-to-v2 data migration script.

V1 and v2 use separate domain models and may use separate database environments until cutover. Building a v2 feature never requires disabling its v1 counterpart.

## 3. Delivery strategy

The migration uses domain-first vertical slices:

```text
Shared contract
    -> Prisma schema and migration
    -> NestJS policy/service/router
    -> Next.js query/form/page
    -> Automated tests
    -> Acceptance verification
```

Copying the v1 page and replacing its URLs is explicitly rejected. The v1 UI mixes hierarchy browsing, forms, ordering, Excel import, and persistence concerns in large client components. Cove v2 will preserve the useful behavior while enforcing tenant isolation, stable contracts, transactions, and versioned publishing.

The first implementation boundary is:

> A Team Lead or Manager can create an academy-owned draft course, add ordered modules and lectures, create a Python programming exercise with test cases and hints, preview the draft, validate it, and publish an immutable course version.

Excel import, AI feedback-rule management, class delivery, student solving, and legacy-data import follow after this boundary works.

## 4. Course and class distinction

A **course** is reusable learning content. A **class** (course section) is a real delivery group with teachers, students, schedules, progress, submissions, and live sessions.

```text
Course: Python Beginner
    -> Published Version 1
        -> reused by Monday Class with Teacher A
        -> reused by Saturday Class with Teacher B
```

This migration builds the reusable course content only. It does not yet create or assign classes.

Class delivery is a later migration phase and will reference a published `CourseVersion`. Teachers and students will be assigned to classes, not to reusable course definitions.

## 5. Legacy-to-v2 domain mapping

| Cove v1 | Cove v2 | Notes |
|---|---|---|
| Subject | Course | Stable reusable course identity |
| Stage | Course Module | Ordered grouping inside one course version |
| Chapter | Lecture | Ordered learning unit inside a module |
| Problem | Programming Exercise material | Coding material inside a lecture |
| Test case | Exercise Test Case | Sample or hidden |
| Problem hint | Exercise Hint | Ordered hint with optional trigger expression |
| AI feedback pattern | Academy AI Feedback Rule | Migrated in a later slice |
| `order_no` | `position` | Positive integer ordering within a parent |
| `problem_no` | `legacyProblemNo` | Historical reference, not the primary identity |
| Excel `문제키` | `externalKey` | Stable idempotent import identity |
| `use_ai_feedback` | `aiFeedbackEnabled` | Exercise-level toggle |

The existing Cove v2 system design requires a module layer to preserve v1 Stage semantics:

```text
Course
    -> CourseVersion
        -> CourseModule
            -> Lecture
                -> Material
                    -> ProgrammingExercise
```

`CourseModule` is added to the v2 domain rather than flattening Stage and Chapter into one level.

## 6. Content data model

### 6.1 Course

A course is an academy-owned reusable identity.

Required fields:

- `id`
- `academyId`
- `title`
- `description`
- `status`: `ACTIVE` or `ARCHIVED`
- `createdByUserId`
- `createdAt`
- `updatedAt`

Course titles need not be globally unique. The initial design requires a case-insensitive unique active title within one academy to prevent accidental duplicates.

### 6.2 CourseVersion

A course version is either editable or immutable.

Required fields:

- `id`
- `courseId`
- `versionNumber`
- `status`: `DRAFT`, `PUBLISHED`, or `ARCHIVED`
- `createdByUserId`
- `publishedByUserId`
- `publishedAt`
- `createdAt`
- `updatedAt`

Rules:

- A course has at most one active draft.
- Version numbers are assigned transactionally.
- Published content is immutable; lifecycle metadata may change when a version is archived.
- Editing a published version creates a new draft copied from it.
- Publishing a draft does not automatically upgrade existing classes.
- Deleting a published version is prohibited; it may be archived only when delivery rules allow it.

### 6.3 CourseModule

Required fields:

- `id`
- `courseVersionId`
- `title`
- `description`
- `position`

Positions are unique within a course version.

### 6.4 Lecture

Required fields:

- `id`
- `courseModuleId`
- `title`
- `description`
- `position`

Positions are unique within a module.

### 6.5 Material

Material is the ordered, typed item displayed inside a lecture.

Initial fields:

- `id`
- `lectureId`
- `type`
- `title`
- `position`
- `isRequired`

The first implemented material type is `PROGRAMMING_EXERCISE`. The structure remains extensible for rich text, quiz, video, document, assignment, and external link types without putting all type-specific fields into one table.

### 6.6 ProgrammingExercise

Required fields:

- `materialId`
- `externalKey`
- `legacyProblemNo`
- `difficulty`: `EASY`, `MEDIUM`, or `HARD`
- `description`
- `inputFormat`
- `outputFormat`
- `constraints`
- `starterCode`
- `language`: initially `PYTHON`
- `timeLimitMs`
- `memoryLimitMb`
- `aiFeedbackEnabled`

`externalKey` is unique inside a course version. It is optional for manually created exercises until first save, when Cove generates a stable key. Excel and legacy imports preserve their supplied key. Re-imports target the active draft and use the key to update or skip the same exercise rather than create duplicates. Creating a new draft from a published version preserves the keys inside the new version without conflicting with the published source.

### 6.7 ExerciseTestCase

Fields:

- `id`
- `exerciseMaterialId`
- `position`
- `input`
- `expectedOutput`
- `visibility`: `SAMPLE` or `HIDDEN`

Hidden expected outputs are never returned by student-facing APIs. Official grading is not part of this content slice but the model must support trusted server-side grading later.

### 6.8 ExerciseHint

Fields:

- `id`
- `exerciseMaterialId`
- `position`
- `content`
- `triggerExpression`

Trigger expressions are optional. Invalid expressions are rejected during authoring validation rather than failing during student use.

## 7. Authorization and tenancy

Every content operation resolves:

1. The authenticated user.
2. The requested `academyId`.
3. An active membership in that academy.
4. The named permission required by the operation.
5. Ownership of every parent and child record by that academy.

Role comparison such as `role >= TEAM_LEAD` is forbidden. Authorization uses named permissions.

Required permissions:

- `curriculum.read`
- `curriculum.draft`
- `curriculum.manage`
- `curriculum.publish`
- `exercises.manage`
- `content.import`
- `ai-feedback-rules.manage`

Initial permission allocation:

| Capability | Manager | Team Lead | Teacher | Student | Platform Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Read academy content | Yes | Yes | Published/assigned later | Released later | Support-only |
| Create/edit drafts | Yes | Yes | No | No | No |
| Manage exercises | Yes | Yes | No | No | No |
| Publish versions | Yes | Yes | No | No | No |
| Execute imports | Yes | Yes | No | No | No |
| Manage AI rules | Yes | Yes | No | No | No |

Platform Admin cross-tenant access, if added later, must use a separately audited support workflow. It is not granted through ordinary content procedures.

Every content mutation writes an audit log containing academy, actor, action, target, request identifier, and meaningful before/after values.

## 8. Team Lead Content Studio

### 8.1 Routes

The v2 web application adds:

```text
/studio/academies/[academyId]/content/courses
/studio/academies/[academyId]/content/courses/new
/studio/academies/[academyId]/content/courses/[courseId]
/studio/academies/[academyId]/content/courses/[courseId]/versions/[versionId]
/studio/academies/[academyId]/content/imports
/studio/academies/[academyId]/content/ai-feedback-rules
```

The import and AI-rule pages are reserved routes until their later slices are implemented.

### 8.2 Course library

The course list displays:

- Title
- Latest published version
- Active draft indicator
- Module, lecture, and exercise counts
- Last editor
- Last modified time
- Course status

Actions:

- Create course
- Open active draft
- Preview published version
- Create a draft from the latest published version
- Archive course

### 8.3 Course builder

The builder displays an ordered tree:

```text
Course Draft
    -> Module
        -> Lecture
            -> Material
```

Supported first-slice actions:

- Add, edit, reorder, and remove draft modules.
- Add, edit, reorder, and remove draft lectures.
- Add, edit, reorder, and remove programming-exercise materials.
- Save continuously through explicit mutations with visible success/error state.
- Preview the complete draft using a student-like read-only view.
- Run publish validation.
- Publish after validation succeeds.

Reordering uses one transactional API mutation per parent list. The client sends the complete ordered child-ID list. The server verifies that all IDs belong to the same academy, version, and parent before assigning positions.

### 8.4 Exercise editor

The editor is divided into:

- Basic information
- Problem description and constraints
- Starter code
- Execution limits
- Sample and hidden test cases
- Hints
- AI feedback toggle

React Hook Form owns form state. Shared Zod schemas provide matching client and API validation. Tiptap handles rich problem descriptions; Monaco handles Python starter code.

Unsaved changes trigger navigation protection. Saving an exercise and its tests/hints is atomic.

## 9. Contracts and API boundaries

Shared oRPC contracts define stable inputs, outputs, pagination, and error codes. Next.js never accesses PostgreSQL directly for v2 content.

Initial procedures cover:

- List and create courses.
- Read, update, and archive a course.
- Create a draft from an empty course or published version.
- Read a complete draft tree.
- Create, update, remove, and reorder modules.
- Create, update, remove, and reorder lectures.
- Create, update, remove, and reorder materials.
- Read and atomically save a programming exercise with tests and hints.
- Validate a course version.
- Publish a valid draft.

All mutations use NestJS services and Prisma transactions where more than one record changes.

## 10. Validation and errors

Stable error codes include:

- `COURSE_NOT_FOUND`
- `COURSE_TITLE_CONFLICT`
- `COURSE_VERSION_NOT_FOUND`
- `COURSE_VERSION_PUBLISHED`
- `COURSE_DRAFT_ALREADY_EXISTS`
- `CONTENT_PARENT_MISMATCH`
- `CONTENT_POSITION_CONFLICT`
- `EXERCISE_EXTERNAL_KEY_CONFLICT`
- `EXERCISE_INVALID_TEST_CASE`
- `EXERCISE_INVALID_HINT_TRIGGER`
- `COURSE_PUBLISH_VALIDATION_FAILED`
- `FORBIDDEN`
- `MEMBERSHIP_INACTIVE`

Publish validation reports structured issues:

```text
{
  path: "modules[0].lectures[1].materials[2].testCases",
  code: "TEST_CASE_REQUIRED",
  message: "Programming exercises require at least one test case."
}
```

The web UI links each issue to the relevant builder item. It does not parse server message text to determine behavior.

Publishing requires:

- A nonempty course title.
- At least one module.
- Every module to contain at least one lecture.
- Every programming exercise to have a title and description.
- Every programming exercise to have at least one test case.
- Every test case to have a nonempty expected output.
- Valid, unique ordering inside every parent.
- Unique exercise external keys inside the course version.
- Valid hint trigger expressions.

Drafts may remain incomplete; validation issues block publishing, not ordinary draft saving.

## 11. Excel import slice

Excel import follows manual authoring so both interfaces reuse the same domain services and validation.

The redesigned import is:

```text
Upload
    -> parse and normalize
    -> validate headers and rows
    -> build planned actions
    -> preview create/update/skip/conflict
    -> confirm
    -> one transactional commit
```

Rules:

- Maximum row counts are configurable.
- Repeated hierarchy cells may inherit the previous nonempty value.
- Keys are trimmed and normalized consistently.
- Unknown difficulty and boolean values are validation errors, not silent defaults.
- `externalKey` makes re-upload idempotent.
- The user selects create-only, update-matching, or skip-matching behavior.
- Errors include sheet, Excel row, column, received value, and correction guidance.
- One failed action rolls back the entire confirmed import.
- A downloadable error workbook may be added after the core import works.

The existing v1 sample workbook remains available to v1. V2 receives its own versioned template.

## 12. AI feedback-rule slice

V1 global AI feedback patterns become academy-scoped rules in v2.

Team Leads and Managers can:

- Create and edit a rule.
- Set type, category, criteria, example code, and tutor feedback.
- Reorder rules.
- Activate or deactivate rules.
- Preview how a rule will be included in an AI prompt.

Rule migration occurs after programming exercises exist. The AI generation job and student feedback delivery remain later feature slices.

## 13. Legacy data migration

Legacy data is migrated only after v2 manual authoring and import behavior pass acceptance testing.

The migration script:

1. Reads v1 data without modifying it.
2. Transforms Subject, Stage, Chapter, Problem, test case, and hint records.
3. Preserves legacy IDs in mapping records or explicit legacy fields.
4. Writes v2 content into a chosen academy as Draft Version 1.
5. Produces source/destination count and relationship reports.
6. Is safe to rerun without duplicating records.
7. Requires Team Lead review before publishing.

Even content published in v1 enters v2 as a draft so test visibility, HTML descriptions, ordering, starter code, and AI settings can be verified before v2 release.

## 14. Testing strategy

### 14.1 Shared package

- Schema acceptance and rejection tests.
- Permission-map tests for Manager, Team Lead, Teacher, Student, and platform Admin.
- Stable error-code and contract tests.

### 14.2 API

- Academy isolation tests.
- Inactive membership rejection.
- Team Lead and Manager success cases.
- Teacher, Student, and ordinary platform-user rejection.
- Draft creation and single-active-draft enforcement.
- Published-version immutability.
- Atomic exercise/test/hint saving.
- Transactional reordering.
- Publish validation.
- Audit-log creation.
- Concurrent version-number and draft-creation behavior.

### 14.3 Web

- Role-aware navigation.
- Course list loading, empty, error, and permission-denied states.
- Builder create/edit/reorder flows.
- Exercise validation and unsaved-change protection.
- Draft preview.
- Publish issue navigation and successful publishing.

### 14.4 Browser acceptance

At minimum:

1. Team Lead creates and publishes a complete Python course.
2. Manager performs the same operation through inherited permissions.
3. Teacher cannot enter draft-management routes or call their mutations.
4. A Team Lead from Academy A cannot read or modify Academy B content.
5. A published version cannot be edited.
6. V1 `/admin/problems` and its APIs continue to operate after v2 changes.

## 15. Implementation phases

### Phase A: Content foundation

- Permissions and shared contracts.
- Prisma content models and migrations.
- NestJS course/version/module/lecture/exercise services.
- Team Lead course library, builder, exercise editor, preview, and publishing.

### Phase B: Excel import

- V2 workbook template.
- Parsing, validation, preview, idempotent actions, and transactional commit.

### Phase C: AI feedback rules

- Academy-scoped rule management.

### Phase D: Legacy content migration

- Read-only v1 extraction, transformation, draft import, and reconciliation.

### Later, separate specifications

- Classes, teacher assignments, and student enrollments.
- Student learning experience.
- Trusted submission grading.
- Teacher monitoring and progress.
- Live collaboration.
- AI feedback delivery.
- Analytics and production cutover.

## 16. Acceptance criteria

This migration design is complete when:

- V1 source behavior remains available and unchanged.
- Manager and Team Lead permissions are enforced in the NestJS API.
- Content is explicitly academy-scoped.
- A draft course preserves the v1 Subject -> Stage -> Chapter -> Problem semantics as Course -> Module -> Lecture -> Exercise.
- Programming exercises atomically store starter code, tests, and hints.
- Hidden test outputs cannot be read through student-facing contracts.
- Published version content is immutable.
- V2 publishing provides structured validation issues.
- The manual authoring vertical slice is complete before Excel import begins.
- V2 imports can be rerun safely using stable external keys.
- Legacy migration is read-only against v1 and produces a verifiable reconciliation report.
