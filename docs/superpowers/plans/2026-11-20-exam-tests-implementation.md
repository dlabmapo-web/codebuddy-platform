# Exams (테스트) — implementation plan

Design: [2026-11-20-exam-tests-design.md](../specs/2026-11-20-exam-tests-design.md) · Research: [docs/research/elice-exam](../../research/elice-exam/README.md) · QA S-06

Six phases. Each phase ends green (typecheck and tests) and is one or more commits; nothing is pushed. Section numbers (§) refer to the design.

## Phase 0: Ground rules for every phase

- **After each phase, run:**

  ```sh
  pnpm --filter @cove/shared build && pnpm --filter @cove/shared test
  pnpm --filter @cove/api typecheck && pnpm --filter @cove/api test <touched specs>
  pnpm --filter @cove/web typecheck
  NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x pnpm --filter @cove/web test <touched specs>
  pnpm --filter @cove/i18n test   # when locale keys change
  ```
- **Integration specs:** run against a disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`, never Supabase.
- **Statement counts:** stated in the commit message whenever a read path changes.
- **Dev servers:**
  - Never run `next build` while the web dev server runs.
  - Touch files after `sed -i` so Turbopack does not serve stale server code.
  - Stop the port-4000 (and 4011/3001) processes at the end.
- **Feature gate:** everything is behind `AcademyFeature.EXAMS`. With the flag off, nothing renders and the API refuses `exam.*`, except reads by staff of an existing test.

---

## Phase 1: Data model and shared rules

**Goal:** the schema exists and the scoring rules are proven in isolation.

1. **Migration `packages/api/prisma/migrations/20261120120000_exams/`:**
   - `LectureKind`, `TestType`, `TestAttemptEndReason`, and `AcademyFeature.EXAMS`.
   - `lectures.kind`; the tables `lecture_tests`, `class_lecture_tests` and `test_attempts`.
   - `test_attempt_id` on `submissions` and `manual_submissions`, with an FK `ON DELETE RESTRICT`.
   - Raw SQL: the partial unique index `test_attempts_one_open` and the two partial `*_attempt_last` indexes (§3).
   - Update `schema.prisma` to match, then run `pnpm --filter @cove/api prisma generate`.
2. **Shared schemas, `packages/shared/src/content/exam.ts`:**
   - `lectureTestSchema` (guide ≤ 100k sanitized HTML, summary ≤ 200, `timeLimitMinutes` 1–600 or null, booleans, `testType`).
   - `classTestScheduleSchema` (opensAt < closesAt when both are set).
   - `examAttemptStateSchema`, `examItemSchema`, `examResultsSchema`.
   - The error codes `EXAM_NOT_STARTED`, `EXAM_ENDED`, `EXAM_ITEM_NOT_IN_ATTEMPT`, `EXAM_PERIOD_NOT_OPEN`, `EXAM_PERIOD_CLOSED`, `EXAM_LOCKED`, `EXAM_RETAKE_NOT_ALLOWED` and `EXAM_FEATURE_OFF`.
   - Export from `content/index.ts`.
3. **Shared rules, `packages/shared/src/content/test-score.ts`:**
   - `computeDeadline({startedAt, timeLimitMinutes, closesAt})` returns the earliest, or null.
   - `attemptPhase({attempt, now})` returns `OPEN | ENDED`, treating a passed deadline as ended.
   - `periodState({opensAt, closesAt, now})` returns `BEFORE | OPEN | AFTER`.
   - `resultsVisible({resultsReleasedAt, now})`.
   - `itemScore(submission, pointsHundredths)`: every row of the §4 table, with pending as `null`.
   - `attemptTotal(items)` returns `{earned, possible, pending}`.
   - `formatPoints(hundredths)` gives "7", "6.5" or "6.25".
   - `defaultExamRules(locale)` returns the six rules (§5.1).
4. **Specs:** `exam.spec.ts` and `test-score.spec.ts`. Cover:
   - every `itemScore` branch;
   - legacy rounding;
   - the cap;
   - pending manual review;
   - deadline min-of-three;
   - deadline exactly at `now`;
   - a period with only an end;
   - scheduled release in the future and the past.

**Commit:** `feat(exam): schema and shared scoring rules for tests (S-06)`

## Phase 2: API core (attempts and test-mode admission)

**Goal:** a student can start, submit and end through the API with server enforcement and no verdict leak.

1. **New Nest module `packages/api/src/exam/`:**
   - `exam.module.ts` and `exam.router.ts` (oRPC; contract added in `shared/src/api/orpc-contract.ts`).
   - `exam-read.ts`: the raw SQL readers `readStudentTest`, `readAttemptShell` (with the close-if-expired CTE), `readStaffTest` and `readExamResults`. Each is **one statement**; the results reader assembles in memory.
   - `exam-attempt.service.ts`: `studentTest`, `start`, `attempt`, `end`, `staffEnd`, `grantRetake`.
     - `start` checks: feature on, student enrolled in the class, the class has the course, the lecture is visible, the period is OPEN, no open attempt (otherwise return it), and retake rights (`allowSelfRetake` or `retakeGrantedAt` on the last attempt).
     - It then snapshots the items (material id, position and points from the problem's maximum) and inserts in one transaction with the audit log row.
     - A unique-violation race returns the existing open attempt.
   - `exam-authoring.service.ts`: `staffTest`, `createTest`, `convertLecture`, `updateTest` and points updates.
     - Everything runs under the existing course lock and bumps `contentRevision`.
     - Refuses non-gradable materials.
     - Points are refused while locked (visible, or any attempt `EXISTS`).
   - `exam-schedule.service.ts`: upsert `ClassLectureTest`, with the teacher-of-class or manager check reused from `authorization/`.
   - `exam-results.service.ts`: `results` and `exportCsv`.
   - `exam.time.ts`: `serverTime`.
2. **Admission for test materials:**
   - `learn/submission-admission-read.ts`: add `lecture.kind`, and for a TEST a lateral subquery returning the caller's open attempt id, deadline and items snapshot. The statement count stays the same.
   - `learn/submission.service.ts` `submit`: when the lecture is a TEST, run `assertExamAdmission` (attempt open, `now ≤ deadline + 5 s`, material in snapshot) and stamp `testAttemptId`. Refuse sample checks, staff practice and AI feedback for test materials.
   - `manual/manual.service.ts` `submit`, `multiple-choice.service.ts` and `short-answer.service.ts`: the same, through their admission reads.
   - Hints, solutions and help requests (`StudentHelpRequest` create) refuse test materials while an attempt is open or results are hidden.
3. **Grading side effects:**
   - `judge/grading.service.ts` around `nextProgress` (line ~661): skip the progress upsert and point awarding when `testAttemptId` is set.
   - Manual and multiple-choice graders: the same.
   - Monitoring `result.changed` to teachers is unchanged.
4. **Redaction:**
   - Add `redactForExam` in `packages/api/src/exam/exam-redaction.ts`.
   - Apply it in the student read paths:
     - `learn/latest-submission.ts`;
     - the submission result read in `learn/submission.controller.ts`;
     - `learn/manual-assessment-read.ts`;
     - the quiz feedback read;
     - `learn/answer-records.service.ts` (records page);
     - `learn/student-overview.service.ts`.
   - The attempt state comes from the same read (join `test_attempts` on `test_attempt_id`, plus `class_lecture_tests.results_released_at`), so no extra statement.
   - A test material's "submitted" view shows only `submittedAt`.
5. **Material page guard:** the learn material reads (exercise, quiz and manual workspace) return `EXAM_NOT_STARTED` for a test material unless the caller has an open attempt, or an ended attempt with `reviewAfterEnd`.
6. **Specs:**
   - **Unit:** `exam-attempt.service.spec.ts` covers start in each period state, retake rules, the race, and end idempotency.
   - **Unit:** `exam-redaction.spec.ts`.
   - **Integration, `exam-attempt.integration.spec.ts`:**
     1. Start, submit MCQ, short answer and code, then end.
     2. Submit after the deadline → `EXAM_ENDED`.
     3. Submit without an attempt → `EXAM_NOT_STARTED`.
     4. `StudentExerciseProgress` untouched and no points awarded.
     5. The student read shows no score until release.
   - **Integration, `exam-performance.integration.spec.ts`:** the statement counts from design §11, including the 40×15 results grid at 1 statement.

**Commit (split):**
- `feat(exam): start, end and enforce test attempts on the server`
- `feat(exam): hide verdicts and keep progress and points out of tests`

## Phase 3: Authoring UI

**Goal:** a team lead can create a test, set it up and publish it.

1. **Course builder** (`content/courses/[courseId]/_components/`):
   - "테스트 추가" in the add menu (`builder-controls.tsx`).
   - A test row variant in `lecture-row.tsx`: badge icon, "N 문제 · 제한 시간 M분", and a link to the test page.
   - "테스트로 전환" in `row-menu.tsx`, shown only when every material is gradable.
   - `course-tree.ts` learns `kind`.
2. **Test page route** `content/courses/[courseId]/lectures/[lectureId]/test/page.tsx`:
   - The server read goes through `server-read.ts` (one statement), then the client component `_components/test-page.tsx`:
     - header, chips, facts, summary rows;
     - the publish dropdown (reuses the visibility mutation);
     - the 수정하기 dialog (title, summary, test type).
   - **Tab 테스트 안내:** reuse the existing rich-text editor used by explanation materials. Its empty state shows the default rules with "기본 안내 사용".
   - **Tab 설정:** `test-settings-form.tsx` with toggle rows (icon tile, title, helper) and disabled "준비 중" rows (§7.1), then 저장.
   - **Tab 문제:** `test-problems-table.tsx`:
     - points inputs, total, the locked state;
     - drag reorder (reuse `_lib/drag-drop.ts`);
     - "문제 추가", reusing `_lib/material-creation.ts` filtered to gradable types;
     - ⋮ menu: open the editor, move, delete.
3. **Problem editors:** where the max-score field is rendered, show "배점은 테스트의 문제 탭에서 설정합니다" when `lecture.kind === 'TEST'`.
4. **Strings:** the i18n `exam` namespace (ko, en) for authoring.
5. **Specs:**
   - `test-problems-table.spec.tsx`: total, locked state, refusal of a non-gradable type.
   - `lecture-row.spec.tsx`: the test variant.
6. **Localhost check:**
   - Create "[Week6] 중간 평가" with 2 MCQ, 1 short answer and 2 code problems.
   - Set points to 20 each, a 50-minute limit, and publish.
   - Confirm the points lock.
   - Check Korean and English, light and dark, and 390px.

**Commit:** `feat(exam): create and configure tests in the course builder`

## Phase 4: Student experience

**Goal:** the full Elice flow from photos provided/01–07.

1. **Outline:**
   - `learn/curriculum-read.ts` and `curriculum-outline.service.ts` gain `kind` and the time limit.
   - Shared `learn.ts` counters exclude test problems and count an ended attempt as a done item.
   - The navigator and course outline render the test row with its status chip.
   - Update `navigator.spec.ts` and `course-summary-counts.spec.ts`.
2. **Routes**, under `(studio)/academy/[academySlug]/learn/tests/[lectureId]/`:
   - **`page.tsx`:** the test card (§5.1), with three states: before, during and after (성적 비공개 / score), plus review and retake links.
   - **`prepare/page.tsx`:** the wizard (§5.2), with components `prepare-steps.tsx`, `clock-check.tsx` (uses `exam.serverTime` and a round-trip midpoint) and `rules-list.tsx`.
   - **`attempts/[attemptId]/page.tsx`:** test mode (§5.3). Its components:
     - `test-shell.tsx` (rail, top bar, bottom bar);
     - `countdown.tsx` (drift-corrected, `role="timer"`);
     - `end-test-dialog.tsx`;
     - `test-done.tsx`;
     - `guide-dialog.tsx`.
   - **Item rendering:** mount the existing problem workspaces with an `examMode` context (`lib/exam/exam-context.tsx`). In exam mode:
     - hide hints, solutions, AI help, help requests, sample-check buttons, result panels and score badges;
     - show only "제출됨 · HH:mm:ss" after a submit;
     - update the rail chip through `queryClient.setQueryData` on the attempt-shell query (no refetch).
3. **Guards:** the existing `learn/exercises|quizzes|…/[materialId]` pages redirect to the test card when the material belongs to a test and there is no review right.
4. **Time:**
   - Toasts at 5 and 1 minutes.
   - At 0, call `exam.end` (idempotent) and show the done screen with the timeout message.
   - On focus or visibility change, re-read the attempt shell so a tab that slept past the deadline lands on the done screen.
5. **Specs:**
   - `countdown.spec.tsx`: drift, colour thresholds, no deadline.
   - `end-test-dialog.spec.tsx`: the checkbox gates the button; the list shows 제출/미제출.
   - `test-card.spec.tsx`: the three states, and release in the past or future.
   - The navigator changes.
6. **Localhost, two sessions** (memory: teacher on `teacher.localhost:3001` with API 4011; student on `localhost:3000` with API 4000; judge worker with `JUDGE_HEALTH_PORT=4101`):
   - The student runs the full flow with a 2-minute limit, submits 3 of 5, and lets it time out. Check the done screen, that a submit after the timeout is refused (try it from devtools), that 성적 비공개 shows, and that no score appears anywhere (records page, outline).
   - Check that the teacher's live monitoring shows the student 시험 중 and that a verdict reaches the teacher.
   - Check Korean and English, dark and light, and 390px (the rail collapses into a drawer).

**Commits:**
- `feat(exam): test card and preparation wizard`
- `feat(exam): full-screen test mode with countdown and end dialog`

## Phase 5: Class schedule and results

**Goal:** the teacher runs the exam for a class and reads the results (elice/23–24).

1. **Class page:** a **테스트** tab on `teach/classes/[classId]/page.tsx`, listing the tests in the class's courses with status, period and averages. One statement; extend the class read if possible.
2. **Results route** `teach/classes/[classId]/tests/[lectureId]/page.tsx`:
   - The server read is `exam.results` (one statement).
   - Components:
     - `schedule-card.tsx`: the period pickers and "상시", plus result release 비공개 / 지금 공개 / 날짜 지정.
     - `result-tiles.tsx`.
     - `problem-stats-table.tsx`.
     - `student-score-grid.tsx`: sticky name column, a pending "—", search and sort. A cell click goes to the existing submission review page or opens the manual grading sidebar.
     - `attempt-actions.tsx`: 응시 종료 and 재응시 허용 with a confirm dialog.
   - **CSV 내보내기:** a download from `exam.results.export`.
   - **Refresh:** `refetchInterval: 30_000` only while an attempt is open (AGENTS.md rule 7).
3. **Teacher progress:** `teach/teacher-progress.repository.ts` excludes test problems from problem progress and adds the test row linking to results.
4. **Specs:**
   - `student-score-grid.spec.tsx`: pending, totals, sorting.
   - `schedule-card.spec.tsx`: validation `opensAt < closesAt`.
   - The API results integration spec: manual review pending, then reviewed, changes the total.
5. **Localhost:**
   - Set a period that opens in 2 minutes and confirm the student sees "부터 응시 가능", then that it opens.
   - Release results and confirm the student card shows `NN / 100 점`.
   - Grade the short answer manually and confirm the total updates.
   - End a running attempt from the teacher side.
   - Grant a retake.
   - Export the CSV and check it in Numbers.

**Commit:** `feat(exam): class test schedule, results grid and export`

## Phase 6: Library, monitoring, polish and docs

1. **Library:**
   - `content/library/course-tree-copy.ts` copies `kind` and `LectureTest`.
   - Library sync merges `LectureTest` as part of the lecture unit. A points change on a locked copy becomes a conflict.
   - Specs: `academy-library-adoption.integration.spec.ts` and the sync specs.
2. **Monitoring:**
   - Presence carries `exam: true` while the student is on an attempt page, so the teacher's roster shows the "시험 중" chip.
   - Teacher co-editing is disabled for test materials (watch only).
3. **Audit:** check that every exam action writes `AuditLog` and appears in the existing audit views.
4. **Docs:**
   - Mark S-06 done in `docs/qa/2026-11-20-student-feedback/README.md` with links.
   - Add a teacher how-to, `docs/operations/exams.md` (create a test, set the period, release results, retakes).
5. **Final verification:**
   - The full Phase 0 command set plus the API integration specs.
   - A two-session localhost run of the whole Elice flow, compared side by side with the research screenshots.
   - Stop every server started for the check and confirm port 4000 is free.

**Commit:** `feat(exam): copy tests with library courses and show 시험 중 to teachers`

---

## File map (new)

```
packages/api/prisma/migrations/20261120120000_exams/migration.sql
packages/api/src/exam/{exam.module,exam.router,exam-read,exam-attempt.service,exam-authoring.service,
  exam-schedule.service,exam-results.service,exam-redaction,exam.time}.ts (+ specs)
packages/api/src/exam/{exam-attempt,exam-performance,exam-results}.integration.spec.ts
packages/shared/src/content/{exam,test-score}.ts (+ specs)
packages/i18n/locales/{ko,en}/exam.json
packages/web/src/lib/exam/{exam-context.tsx,use-exam-attempt.ts,clock-drift.ts}
packages/web/src/app/(studio)/academy/[academySlug]/learn/tests/[lectureId]/{page,prepare/page,attempts/[attemptId]/page}.tsx + _components
packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/test/page.tsx + _components
packages/web/src/app/(studio)/academy/[academySlug]/(framed)/teach/classes/[classId]/tests/[lectureId]/page.tsx + _components
```

## Changed (existing)

- `schema.prisma`.
- `learn/submission-admission-read.ts`, `learn/submission.service.ts`, `learn/latest-submission.ts`, `learn/manual-assessment-read.ts`, `learn/answer-records.service.ts`, `learn/curriculum-read.ts`, `learn/curriculum-outline.service.ts`.
- `manual/manual.service.ts`, `manual/multiple-choice.service.ts`, `manual/short-answer.service.ts`.
- `judge/grading.service.ts`.
- `teach/teacher-progress.repository.ts`.
- `content/library/course-tree-copy.ts`.
- Shared `content/learn.ts`, `api/orpc-contract.ts`.
- Web: course builder components, the navigator, problem editors (points note), the class page tabs.

## Size and order

| Phase | Size | Depends on |
| --- | --- | --- |
| 1 Data and rules | S | — |
| 2 API core | L | 1 |
| 3 Authoring UI | M | 2 |
| 4 Student UI | L | 2 (3 for creating test data, or seed it) |
| 5 Results | M | 2, 4 |
| 6 Library, monitoring, docs | S–M | all |

Phases 3 and 4 can run in parallel after 2. A seed script, `packages/api/scripts/seed-exam.ts`, creates a test with 5 problems in the dev academy so phase 4 does not wait for phase 3.
