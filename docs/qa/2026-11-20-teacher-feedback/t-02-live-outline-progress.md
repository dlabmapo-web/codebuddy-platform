# T-02 — Submission result not reflected in the teacher's live outline

> **Implemented 2026-11-20.**
> - **Shared rule:** `applyVerdictToNavigator` in `@cove/shared` mirrors the server's `nextProgress`. It also keeps the header's "N of M solved" in step.
> - **Teacher view:** the live view patches its cached outline when `result.changed` arrives (`useTeacherDisplay().applyVerdict`). No extra read.
>
> **Verified on localhost** with a teacher and a student signed in at once and the judge worker running:
> - **이진 탐색 passed:** the teacher's row went from the clock to the green check without a reload.
> - **팩토리얼 passed:** the icon turned green and the header moved from "2 of 4 solved" to "3 of 4 solved" in the same moment.
>
> **Tests:** shared 984, web 574, typecheck clean.

Registered 2026-11-06 · Sunny · P1

## Request

1. A student submits and passes (100/100).
2. On the teacher's live view of that student, the progress icon next to the problem in the left course outline stays orange (in progress) instead of turning green (solved).
3. F5 sometimes fixes it, sometimes not.

QA asked for the result to show straight away. In the second screenshot the right-hand "제출 결과" already says 정답 100/100 while the outline row 완전 탐색 최대공약수 still shows the orange clock.

## Cause

- **The result panel is live.** [use-live-workspace.ts](../../../packages/web/src/lib/monitoring/use-live-workspace.ts) receives `result.changed` over the socket and updates "제출 결과".
- **The outline is not.** [use-teacher-display.ts](../../../packages/web/src/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_hooks/use-teacher-display.ts) reads the outline once per course (`getStudentCurriculum`) and caches it for 60 s. Nothing updates it when a verdict arrives.
- **Why F5 only sometimes helps.** Grading runs in the background. A reload before the verdict is stored reads "in progress" again, and nothing corrects it afterwards.

## Plan

1. **A shared rule.** Add `applyVerdictToNavigator(context, verdict)` to `@cove/shared` (next to `mergeNavigatorProgress`). It mirrors the server's `nextProgress` in `judge/grading.ts`:
   - PASSED → SOLVED, and SOLVED is permanent.
   - FAILED → IN_PROGRESS unless already solved.
   - The best score only goes up.
   - ERRORED, CANCELLED, QUEUED, RUNNING and RECORDED (manual review) leave the row alone.
2. **The teacher's outline.** When `live.result` changes to a graded verdict, patch the cached outline (`setQueryData` on the live-curriculum query) for that material. No extra database read; the event already carries material, status and score.
3. **Late verdicts.** A reload before grading finishes is corrected when the verdict event arrives, because the patch applies to whatever was read.

## Tests

- **Shared spec:** passed turns green; a failed attempt does not demote solved; the best score keeps its maximum; errored, queued and manual-review verdicts leave the row unchanged; an unknown material is untouched.
- **Localhost, two sessions, judge worker running:** the student submits a passing answer and the teacher's outline icon turns green without F5. A failing answer turns a not-started row orange.

## Scope

Shared helper and the teacher's live hook. No API change, no new statement.
