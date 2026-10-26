# Video viewing progress and class report

Date: 2026-10-26
Status: Approved by the user on 2026-10-26

## Evidence

Inspected the signed-in [Elice course dashboard](https://dlab.elice.io/courses/765886/dashboard), the first video lecture's dashboard and a student-specific report. The inspected views expose course/lecture progress percentages, completed-material counts and programming time. They did not expose a confirmed per-video minutes-watched field. Elice's [administrator dashboard help](https://help.elice.io/help/docs/elicelxp/for-admin/learning-management/dashboard) and [student progress help](https://help.elice.io/help/docs/elicelxp/for-student/learning/info/dashboard) describe progress/completion and coding metrics; they do not establish video-time semantics.

Downloaded the course report through its Course Report button and inspected headings only. Its Summary headers include Lecture Progress, Completions and Hours Programmed. The 49-sheet export contains material metric headers Score, Run/Submits Count, Code Edit Count and Submit Count; no viewing-time header was found in the inspected header rows. The video-only introductory chapter is absent from the export. This limits the findings to this course and report, rather than proving that Elice never offers video analytics. Do not commit the downloaded workbook, student identities or individual student results.

Cove already stores `watchedMs`, `positionMs`, `completed` and timestamps, scoped by user/material/class/asset. The current history view displays watched percentage, last position in raw seconds and completion; it lists only existing progress records, up to 200, so absent students cannot be identified in that table. The learner player replaces its watched percentage with the word Completed after completion and does not show watched duration.

## Proposed outcome

Show a useful viewing report using Cove's existing validated progress data, without claiming an unverified Elice video-time policy.

For students, show a compact progress panel below the video with percentage, watched video duration versus full duration, and completion state. For example: **60% watched · 6:00 of 10:00 · In progress**. Keep the percentage visible after completion. Show a progress bar distinct from the seek slider; seeking alone must not advance watched progress.

For assigned teachers and academy managers/team leads, provide a class video report through the existing Watch history/tutoring entry point. Show class and video context, a completion summary and a paginated student table:

| Student | Status | Video watched | Watched duration | Last position | Last recorded |
| --- | --- | --- | --- | --- | --- |
| Example learner | In progress | 60% with progress bar | 6:00 / 10:00 | 7:15 | Localized date/time |
| Example learner | Not started | 0% | 0:00 / 10:00 | — | — |

List every active enrolled student for the current video asset, including students without progress records. Use Not started, In progress and Completed states, keeping the existing backend completion policy. Old video versions remain available through the existing history contract and must not inflate current-video summaries. Allow teachers to search names and filter states with Cove components. Paginate the roster (50 per page) rather than silently truncating it. Summary counts cover the full current roster and remain consistent with the selected report scope.

## Meaning of watched time

Recommended: display **unique video duration watched**, which Cove already records. For a ten-minute lesson, watching six distinct minutes shows 6:00 and 60%. Replaying those same six minutes does not increase that number. Watching them at 2× still covers six minutes of video, although less clock time passes. Explain this once near the report and personal progress panel.

This is different from total time spent viewing, including replays. Actual elapsed viewing time cannot be reconstructed reliably from the current `watchedMs` field. If requested, that needs a separate definition and tracking design; do not rename unique watched time or playback position to imply elapsed viewing time.

## Approach and boundaries

Recommended: improve the personal progress presentation and add a focused current-video class-report read endpoint. Reuse the current watch-history page as the staff entry point while retaining the existing history endpoint for historical and personal records. No change to watch-credit rules, scoring or storage is needed.

Alternative: only add a watched-duration column to the existing history table. This is smaller but still omits students who never started and mixes video versions. A separate total-time-spent tracker answers a different question and adds new persistence and checkpoint semantics.

Keep report access within the existing academy/course/class authorization boundary. Teachers may report only on assigned classes; managers/team leads may report within their academy. Students cannot fetch the class roster/report and continue to see only their own acknowledged progress. Verify active membership/enrollment and the class-course assignment, not just a supplied class ID.

Use a typed shared report DTO and bounded, paginated queries; avoid one database query per student. Join the current asset's progress to the class roster. Derive percentages and formatted durations from stored values; represent missing dates/positions honestly. The report's Last recorded timestamp represents the last recorded checkpoint, not proof that the student is currently online.

Use Cove's existing blue, card, border and typography tokens, shared selector components and responsive table conventions. Give loading, empty roster, request failure and tracking-unavailable states explicit text and retry actions. Refresh report data periodically, and show an update indicator. Caption/player/upload behavior is outside this change.

## Verification

- Test roster projection with no progress, partial progress, completion, replay overlap, zero-duration safeguards and replacement assets. Check search/state filtering, pagination, summary totals and stale/inactive memberships.
- Test that students cannot obtain other learners' records or the class report; test assigned/unassigned teachers and cross-academy/class/course requests.
- Verify that seeks, playback position and replays cannot be mistaken for unique watched duration. Preserve the backend's 90% completion threshold and server-acknowledged progress display.
- Use disposable development fixtures for unseen, partially watched and completed learners. Verify the teacher report, student personal progress and mobile presentation without changing real Elice records.
- Run focused API/shared tests, web/API typechecks, focused lint and translation checks.

## Review

The proposed scope reuses the current watched-duration metric and distinguishes it explicitly from elapsed viewing time. No database migration or production change is planned. The user approved percentage plus unique watched video time on 2026-10-26. Implementation may proceed.
