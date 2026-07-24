# Team Lead Content Phase A Implementation Plan

## Goal

Deliver the first Cove v2 content-management vertical slice without changing or
removing any Cove v1 route, page, component, API handler, or database table.

The completed slice lets an active `TEAM_LEAD` or `MANAGER` membership:

1. Open an academy-scoped Content Studio.
2. List academy courses.
3. Create a course with its initial draft version.
4. Open the draft content tree.
5. Add ordered modules and lectures.
6. Create and atomically save a Python exercise with tests and hints.
7. Validate and publish an immutable course version.

## Guardrails

- V1 directories remain untouched.
- V2 Next.js code calls the NestJS oRPC API; it never queries PostgreSQL.
- Every API operation resolves active academy membership and a named permission.
- Published content is immutable.
- Multi-record mutations use Prisma transactions.
- Hidden expected outputs are not exposed through future learner contracts.
- Follow the current Next.js 16 async `params` and Server/Client Component rules.

## Phase 1: Shared domain and permissions

1. Add `exercises.manage`, `content.import`, and
   `ai-feedback-rules.manage` to academy permissions.
2. Grant the new permissions to `TEAM_LEAD` and `MANAGER`.
3. Add tests proving:
   - Manager and Team Lead can manage exercises.
   - Teacher and Student cannot manage exercises or import content.
   - Platform role does not imply academy content permission.
4. Add content enums and Zod schemas:
   - Course status and version status.
   - Material type.
   - Exercise difficulty and language.
   - Course summary and draft-tree response schemas.
   - Create course and create/update content inputs.
5. Add stable content error codes and fallbacks.
6. Add academy course contracts to the root `appContract`.

Exit criteria: shared tests and typecheck pass.

## Phase 2: Prisma content foundation

1. Add enums:
   - `CourseStatus`
   - `CourseVersionStatus`
   - `MaterialType`
   - `ExerciseDifficulty`
   - `ExerciseLanguage`
   - `TestCaseVisibility`
2. Add academy, user, and audit relationships required by content records.
3. Add models:
   - `Course`
   - `CourseVersion`
   - `CourseModule`
   - `Lecture`
   - `Material`
   - `ProgrammingExercise`
   - `ExerciseTestCase`
   - `ExerciseHint`
4. Add uniqueness and ordering constraints scoped to the correct parent.
5. Generate and inspect the SQL migration.
6. Regenerate Prisma Client.

Exit criteria: Prisma validation and API typecheck pass.

## Phase 3: Course service vertical slice

1. Create a `ContentModule`.
2. Create a `CourseService` with:
   - `list`
   - `create`
   - `getDraftTree`
   - `updateCourse`
   - `archiveCourse`
3. `create` transactionally creates:
   - Course
   - Draft Version 1
   - Audit record
4. Add course policies through `AcademyAccessService`:
   - `curriculum.read` for list/read.
   - `curriculum.manage` for create/update/archive.
5. Add oRPC router handlers and dependencies.
6. Add service tests for:
   - Academy isolation.
   - Team Lead and Manager access.
   - Teacher rejection.
   - Case-insensitive active-title conflict.
   - Initial draft creation.
   - Audit output.

Exit criteria: focused API tests and typecheck pass.

## Phase 4: Draft structure services

1. Add transactional module create/update/remove/reorder.
2. Add transactional lecture create/update/remove/reorder.
3. Add material and programming-exercise save operations.
4. Save exercise, tests, and hints atomically.
5. Enforce published-version immutability in every mutation.
6. Return structured parent-mismatch and ordering errors.
7. Add focused unit and integration tests.

Exit criteria: a complete draft tree can be created through API contracts.

## Phase 5: Validation and publishing

1. Implement reusable course-version validation.
2. Return structured issues with content paths.
3. Add publish transaction:
   - Lock course and draft.
   - Revalidate.
   - Allocate/check version number.
   - Mark published with actor and timestamp.
   - Write audit entry.
4. Reject all content mutations against the published version.
5. Add tests for incomplete drafts, successful publishing, repeat publishing,
   and concurrency-sensitive state transitions.

Exit criteria: valid drafts publish and published content is immutable.

## Phase 6: Team Lead web experience

1. Extend Studio navigation using named content permission checks.
2. Add course list route:
   - `/studio/academies/[academyId]/content/courses`
3. Fetch the initial list in a Server Component.
4. Add a focused Client Component for creation and mutations with TanStack Query.
5. Add course builder route:
   - `/studio/academies/[academyId]/content/courses/[courseId]/versions/[versionId]`
6. Add builder components for the tree, module/lecture controls, and exercise
   editor.
7. Add loading, empty, error, forbidden, validation, and unsaved-change states.
8. Add draft preview and publish confirmation.

Exit criteria: Team Lead and Manager complete the Phase A workflow in the UI.

## Phase 7: Verification

Run:

```text
pnpm --filter @cove/shared test
pnpm --filter @cove/shared typecheck
pnpm --filter @cove/api test
pnpm --filter @cove/api typecheck
pnpm --filter @cove/web test
pnpm --filter @cove/web typecheck
pnpm --filter @cove/web lint
pnpm --filter @cove/web build
git diff --check
```

Verify manually:

1. Team Lead can create and publish content in Academy A.
2. Manager can perform the same workflow.
3. Teacher cannot open or call content-management operations.
4. Academy A content cannot be accessed through Academy B.
5. Published versions cannot be edited.
6. Existing v1 `/admin/problems` files and routes remain present.

## Follow-up plans

After Phase A acceptance:

1. Excel import and versioned workbook template.
2. Academy AI feedback-rule management.
3. Idempotent v1 content migration into v2 drafts.
4. Classes, teacher assignments, and student enrollments.
