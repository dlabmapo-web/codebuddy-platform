# QA-004 — Problems cannot be deleted from a course

> **Implemented on `qa-feedback` (2026-11-20)** as planned: `content/student-work.ts` (`deleteStudentWork`, `countStudentWork`), `CourseService.deleteImpact`, the four delete paths and the manual-material delete. The course-editor dialog awaits the delete and shows its error inline; the course list's delete dialog shows the same student-work notice. Verified by `delete-with-student-work.integration.spec.ts` (6 tests, disposable PostgreSQL): `deleteExercise` costs 38 statements for 1 or 12 submissions; `deleteImpact` 3.

> Decision (2026-11-20): **managers and team leads can delete problems and courses whether or not students have submitted.**

Registered 2026-11-04 · Jay · P2

## Request

In the course editor, row menu › 삭제 › confirm does nothing. Deleting the same kind of problem in the library works.

## Reproduction (localhost, manager)

Course `Manual Testing Sandbox`, problem `FizzBuzz for one number` (5 submissions in the dev database):

1. Row menu › Delete opens "Delete this problem? … This cannot be undone." It does not mention the submissions.
2. **Delete problem** closes the dialog. The row stays, and nothing appears near it.
3. The only message, *"This content has student submissions. Hide it instead of deleting it."*, is at the **bottom of the page**, under the "Add module" form. In a long course nobody sees it.

Library problems have no submissions, which is why deleting works there.

## Root cause

| Where | What |
| --- | --- |
| [course.service.ts:1604](../../../packages/api/src/content/course.service.ts#L1604) `deleteExercise` | `assertNoSubmissions({ materialId })` throws `CONTENT_HAS_SUBMISSIONS` (409) |
| [course.service.ts:742](../../../packages/api/src/content/course.service.ts#L742), [:913](../../../packages/api/src/content/course.service.ts#L913) | the same guard on module and lecture delete |
| [course.service.ts:676-681](../../../packages/api/src/content/course.service.ts#L676-L681) `deleteCourse` | counts `submission` by `courseId` and throws the same code |
| [classes.service.ts:292-297](../../../packages/api/src/classes/classes.service.ts#L292-L297) | the same guard on class delete (out of scope, see below) |
| [use-course-builder.ts:279-287](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_hooks/use-course-builder.ts#L279-L287) | the delete mutation has no `onError`; the error reaches only `structuralError` |
| [course-builder.tsx:129-136](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/course-builder.tsx#L129-L136) | `structuralError` is rendered at the bottom of the page |

### What depends on a problem (`Material`) in the schema

| Model | On delete of the material |
| --- | --- |
| `Submission` | `SetNull` on `materialId`; but `courseId` is **`Restrict`** |
| `ManualSubmission` (manual grading) | **`Restrict`** |
| `ExerciseDraft`, `TeacherMonitoringVisit`, `TeacherFeedback`, `StudentHelpRequest` | `SetNull` |
| test cases, solutions, PDF/video/manual rows and the rest | `Cascade` |

So today the database itself would refuse a problem with manual-grading submissions, and a course with any submissions.

### Who may delete

`exercises.manage` (problems) and `curriculum.manage` (modules, lectures, courses) are held by **manager** and **team lead** only ([roles.ts:328-360](../../../packages/shared/src/auth/roles.ts#L328-L360)). Teachers cannot delete. No permission change is needed.

## Decision

Managers and team leads can delete a **problem, lecture, module or course** even when students have submitted. The confirm dialog states what will be lost, and the delete removes the students' records for that content in the same transaction.

Confirmed 2026-11-20: **delete** the dependent student records rather than keep them detached. `Submission.courseId` is required and `Restrict`, so detached rows cannot survive a course delete anyway, and orphaned rows would show in history and analytics with no problem to open.

## Implementation plan

### API

1. Remove `assertNoSubmissions` from `deleteExercise`, `deleteLecture`, `deleteModule`, and the submission count from `deleteCourse`.
2. Add one helper, `deleteStudentWork(tx, scope)`, where `scope` is `{ materialIds }`, `{ lectureId }`, `{ moduleId }` or `{ courseId }`. In the transaction, before the content delete:
   - delete `ManualSubmission` rows of the materials (and their review rows, if not `Cascade`);
   - delete `Submission` rows of the materials (or of the course), with their results, if not `Cascade`;
   - leave the `SetNull` relations as they are; they already let the delete through.
   Each step is one `deleteMany` with `materialId: { in: … }` or a join on the scope: **no statement per row**.
3. Add a `submissionCount` (and `studentCount`) read for the confirm dialog: one `count` per kind for the scope, started together with `Promise.all`. Either a small `getDeleteImpact` procedure or include it in the existing delete-preview path if there is one.
4. Audit: add `deletedSubmissions` and `deletedManualSubmissions` counts to the existing `*.deleted` audit entries.
5. `revokeCourseMonitoring` keeps running after the delete, as today.
6. Library masters adopted by academies keep their own guard (`courses_source_course_id_fkey` is `RESTRICT`). This change does not touch it.
7. Classes keep their guard: QA asked about problems and courses, not classes.

### Web

1. Show the error at the row. Give the delete mutation an `onError` that raises a toast (or an inline message on the row) with `errorText(error)`, and stop routing delete errors into the bottom-of-page `structuralError`. Do the same for module, lecture and course delete.
2. Confirm dialog ([delete-modal.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/delete-modal.tsx)): when the count is above zero, add a red block, for example `학생 제출 5건(학생 3명)이 함께 삭제됩니다. 되돌릴 수 없습니다.` / `5 submissions from 3 students will be deleted with it. This cannot be undone.` Keep the existing cascade list for lectures and modules.
3. Course delete: the same submission line on the course delete dialog, which already asks for the course title.
4. i18n: new keys in `content` (KO and EN). Drop the `CONTENT_HAS_SUBMISSIONS` message from these flows; keep the code for classes.

### Statement count

Delete is a write path. State the number of statements for deleting a problem with submissions in the commit message, measured in an integration spec against disposable Docker PostgreSQL.

## Tests

- API integration (disposable Docker PostgreSQL):
  - delete a problem with `Submission` and `ManualSubmission` rows as a manager → content and submissions gone, audit has the counts;
  - the same as a team lead → allowed; as a teacher → `FORBIDDEN`;
  - delete a course with submissions → allowed; statement count fixed regardless of the number of submissions.
- Web: the delete modal shows the submission line when the count is positive and not when it is zero; a failed delete shows the message at the row.
- e2e: the course builder delete flow with a problem that has a submission.
- Browser: repeat the reproduction above; the row disappears.

## Scope

API, web, i18n. Write path only; no read-path statement change other than the impact count.
