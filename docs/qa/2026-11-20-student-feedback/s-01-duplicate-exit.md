# S-01 — Two exit buttons in a lesson

> **Implemented on `qa-feedback` (2026-11-20).** Checked on localhost for every student lesson type, including a problem opened from Answer records.

Registered 2026-10-27 · Sunny · P2

## Request

A lesson screen has two ways out: "코스로 돌아가기" (Back to course) at the bottom of the left course panel, and "나가기" (Exit) at the top right. Keep one: remove the bottom-left link. Elice has a single exit at the top right ("학습 종료").

## What is there now

The bottom-left link is the required `footer` prop of `WorkspaceCurriculumNavigator`, rendered at [curriculum-navigator.tsx:272-283](../../../packages/web/src/components/workspace/curriculum-navigator.tsx#L272-L283).

Every student lesson type already has the top-right Exit (`leaveHref`) pointing to the same place:

| Student surface | Footer (to remove) | Exit (kept) |
| --- | --- | --- |
| Coding problem | [workspace.tsx:689-692](../../../packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/workspace.tsx#L689-L692) | [workspace.tsx:601](../../../packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/workspace.tsx#L601) |
| Quiz | [quiz-workspace.tsx:118](../../../packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/quiz-workspace.tsx#L118) | [quiz-workspace.tsx:104](../../../packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/quiz-workspace.tsx#L104) |
| PDF | [pdf-lesson.tsx:50](../../../packages/web/src/components/pdf/pdf-lesson.tsx#L50) | [pdf-lesson.tsx:42](../../../packages/web/src/components/pdf/pdf-lesson.tsx#L42) |
| Video | [video-lesson.tsx:133](../../../packages/web/src/components/video/video-lesson.tsx#L133) | [video-lesson.tsx:103](../../../packages/web/src/components/video/video-lesson.tsx#L103) |
| Explanation | [explanation-lesson.tsx:52](../../../packages/web/src/components/explanation/explanation-lesson.tsx#L52) | [explanation-lesson.tsx:46](../../../packages/web/src/components/explanation/explanation-lesson.tsx#L46) |
| Short answer / manual | [manual-workspace.tsx:582](../../../packages/web/src/components/manual/manual-workspace.tsx#L582) | [manual-workspace.tsx:559](../../../packages/web/src/components/manual/manual-workspace.tsx#L559) |

When a coding problem is opened from the records page, both buttons go to `returnTo`. The footer's label changes to "Back to records", but the Exit button already goes back to records, so nothing is lost.

`LessonHeader` hides itself in classroom mode ([lesson-chrome.tsx:22](../../../packages/web/src/components/workspace/lesson-chrome.tsx#L22)). That mode is a teacher presenting to the class, and it has its own exit (`ClassroomLessonFooter`, `exitHref`), so removing the footer does not strand anyone.

## Plan

1. Make `footer` optional in `WorkspaceCurriculumNavigator`. Render the `<footer>` only when it is passed.
2. Stop passing it on the six student surfaces above.
3. Keep it on teacher surfaces: `live-workspace.tsx` ("back to roster", `footer_teacher`), `all-material-monitor.tsx` and `submission-workspace.tsx`. They have no other way back to the roster. `staff-workspace.tsx` has the same duplication as the student screen; leave it unless asked, since this sheet is about students.
4. Remove the `navigator.footer_student` key from every locale if nothing else uses it.

## Tests

- Navigator spec: no footer link when `footer` is omitted; a link when it is passed.
- localhost, as a student: coding, quiz, PDF, video, explanation and short-answer lessons show only the top-right Exit. Exit goes to the course; from the records page it goes back to records.
- As a teacher in live view: the panel's back-to-roster link is still there.

## Scope

Web only. No API or read-path change.
