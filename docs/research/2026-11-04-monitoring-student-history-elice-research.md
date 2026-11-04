# Student history and tutoring research

Date: 2026-11-04. Work: browser inspection and source review only.

## Reference observed in Chrome

Inspected the authenticated [Elice course list](https://dlab.elice.io/courses/765886/lectures/all), opened the first material in the CH01 exercise lecture, entered Tutoring, selected a student, and inspected the Dashboard → Member flow. Returned the existing browser tab to the original course list afterwards.

### Tutoring

- The exercise statement remains beside the editor.
- Tutoring opens a searchable student drawer with a role selector, class/section context, and submission status or score per student.
- Selecting a student changes the editor context to that student. The workspace displays identity, final submission time, final score, feedback, file navigation, and Run controls.
- Previous/Next material links retain the selected student in the tutoring route.
- The observed Elice editor also offers an edit switch, Submit, and regrading controls. These are observations, not requirements for Cove. The user previously removed Cove's live edit switch and explicitly selected a **private testing copy** for historical review in this request.
- The UI exposes Run. Research did not execute student code, edit work, submit answers, publish feedback, or change grades. The browser view alone does not establish whether Elice's displayed editor is an immutable submitted snapshot or a mutable saved workspace; Cove must explicitly distinguish these.

### Dashboard

Inspected the [course dashboard](https://dlab.elice.io/courses/765886/dashboard), selected Member, then selected one student.

- A searchable member list stays beside the student's information.
- The detail begins with identity and enrollment, course completion, progress and test-score summaries.
- Supporting measures include solved work, learning time, submissions, and class comparisons.
- Materials are grouped by lecture, with a completed count per lecture.
- Tables expose title, Runs, SubmitCount, score and completion. Coding and quiz materials use appropriate icons; unavailable measures show a dash.
- Material links provide a short path back into an exercise. Cove should preserve the student and selected submission explicitly when using this pattern.

The useful pattern is **student → curriculum evidence → specific work**, with stable identity and a runnable workspace. Copying Elice's entire dashboard, grading controls, score terminology or branding is unnecessary.

No reference student names, emails, code, grades or screenshots have been copied into this repository.

## Existing Cove capabilities and gaps

| Area | Source | Finding |
| --- | --- | --- |
| Monitor composition | `packages/web/src/components/monitoring/all-material-monitor.tsx` | Owns general observation, selected material and transitions; returns separate coding/non-coding render branches. A new panel must live above these branches or it will reset during material changes. |
| Coding monitoring | `packages/web/src/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-workspace.tsx` | Owns coding watch, collaborative draft, private runner and transition guard. Historical review must not replace its Yjs text. |
| Student switcher | `packages/web/src/components/monitoring/student-switcher.tsx` | Searchable class roster with guarded live navigation. Live availability restricts switching; historical reads must also work for offline students. |
| Existing course tutoring | `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/staff-tutoring-drawer.tsx` | Searches students and filters online/submitted/not submitted, using class scope and problem status. This is useful roster behavior to share. |
| Existing tutoring editor | `.../learn/exercises/[materialId]/_components/staff-student-pane.tsx` | Uses live collaborative code or a saved draft fallback; runs code privately. Latest submission metadata is displayed, but the editor's saved code comes from the **draft**, not an explicitly selected immutable attempt. Reusing it unchanged would not satisfy historical submission review. |
| Student analytics | `.../(framed)/teach/students/_components/student-analytics.tsx` | Academy teaching analytics table; a different task from contextual monitoring. No global redesign is required. |
| Existing work history | `.../(framed)/teach/classes/[classId]/progress/_components/student-detail.tsx` and `attempt-history.tsx` | Student problem summaries and paginated attempt history already exist. Review currently navigates to a separate page. |
| Coding submission review | `.../(framed)/teach/classes/[classId]/students/[membershipId]/submissions/[submissionId]/_components/submission-review.tsx` | Immutable submitted code, frozen labels, statement and sample results. Editor is structurally read-only and has no runner. Useful read model; a private scratch editor should be separate. |
| History contracts | `packages/shared/src/api/orpc/teacher-progress.contract.ts`, `packages/shared/src/content/teacher-progress.ts` | Class/member-scoped summary, attempts and single-submission review. Lists omit source code; hidden test inputs/outputs are not disclosed. |
| Progress implementation | `packages/api/src/teach/teacher-progress-access.service.ts`, `teacher-progress.service.ts`, `teacher-progress.repository.ts` | Current scope builds rows from programming-exercise relations. Counts use PASSED/FAILED attempts, current revision progress and current visible assigned curriculum. Manual materials need an explicit adapter. |
| Shared access policy | `packages/api/src/classes/assigned-class-access.ts` | Teachers need class assignments; active Managers and Team Leads have academy teaching scope. Recheck this policy for new history reads. |
| Turtle/manual review | `packages/web/src/components/manual/manual-review-workspace.tsx`, `packages/web/src/lib/manual-api.ts`, `packages/api/src/manual/manual.service.ts` | Existing manual history and Turtle reruns, but selected-user roster history is capped at 30. The existing workspace also includes draft writes and grade publication; do not embed it wholesale into private review. |
| Turtle run semantics | `packages/api/src/manual/manual.service.ts`, `start()` | With a submission ID, the server replaces client files with submitted files and restores the saved profile/runtime. Modified private reruns therefore need an explicit authorized review-session path. Existing owner replacement is actor/material based; review runs need separate ownership to avoid replacing another session. |
| Durable data | `packages/api/prisma/schema.prisma` | Programming submissions/progress, manual submissions/reviews, video progress and course/class learning-day projections exist. No durable per-student/material Run counter was found. Daily active time is not an exact problem-session replay. |

Paths beginning `...` use the common prefix `packages/web/src/app/(studio)/academy/[academySlug]`.

## Design implications

1. Add entry points inside monitoring, preserving the existing watch and switching guards.
2. Present an Elice-inspired grouped history with explicit metric definitions. Following the user's clarification, provide both a standalone dashboard with persistent student selection and the contextual monitoring panel. Redesign the class Solution status By-student presentation for the standalone dashboard; the academy aggregate analytics table only needs direct history entry links.
3. Load one immutable submission only when opened. Never substitute a saved draft under a submission label.
4. Reuse read models, rendering and runtimes through focused shared components; keep historical scratch editing independent of live editing and grading.
5. Unify programming/manual history behind narrow, authorized, paginated reads rather than downloading every student's files from manual roster endpoints.
6. Do not invent historical Run counts or PDF completion records. Explain unavailable measures and use existing recorded evidence.
7. Verify live connection, draft integrity and pointer isolation while opening/closing history and switching materials in Chromium, WebKit and native Safari.

The proposed behavior and acceptance criteria are in the [design spec](../superpowers/specs/2026-11-04-monitoring-student-history-and-tutoring-design.md). Product choices in that document are proposals; they are not claims about Elice internals.

## Follow-up: standalone dashboard clarification

The user supplied another Elice member-dashboard screenshot and clarified that an administrative-style page for selecting students is required, because Cove's current student-history presentation is difficult to use. The first draft's monitoring panel did not cover that standalone experience.

Source review confirms that `.../(framed)/teach/classes/[classId]/progress/page.tsx` and `_components/progress-workspace.tsx` already provide a class-scoped destination, By-student/By-problem navigation, and selected-student details. `_lib/progress-url.ts` already serializes student membership as `student` and the course filter as `course`. The revised spec keeps that destination and its existing links, replacing the By-student presentation with a persistent roster and adjacent student dashboard. This is planned behavior, not an existing Elice-style Cove screen.
