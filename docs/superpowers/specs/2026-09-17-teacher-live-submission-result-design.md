# The student's submission result in the teacher's live view

Date: 2026-09-17
Status: implemented on `fix/student-editor-cross-platform`; see §13 for differences from this design
Source baseline: `609f530` on `fix/student-editor-cross-platform`
Scope: the teacher's live monitoring workspace (`/teach/classes/[classId]/students/[membershipId]/live`), the student's submit flow as it reports to a watching teacher, and the teacher submission-review read it reuses
Builds on: `2026-08-04-teacher-live-monitoring-design.md` (realtime result summaries), `2026-08-03-result-panel-guided-diagnostic-design.md` (the student's result panel)

## 1. Purpose

A teacher watching a student live sees the student's code as it is typed, their pointer, and the terminal when they press Run. When the student presses **Submit**, the student gets a full verdict: the score, whether it was accepted, and which test cases passed and failed, with the input, expected output, and actual output of each failing sample. The teacher gets almost none of that. They cannot see which case failed, so they cannot help with the one thing the student is looking at.

This design gives the watching teacher the same verdict the student sees, as it arrives, under the same rules for hidden test cases.

## 2. Current state

Web paths are relative to `packages/web/src/app/(studio)/academy/[academySlug]/`.

### 2.1 Student side

- **Submit:** `learn/exercises/[materialId]/_components/workspace.tsx` `handleSubmit` flushes the draft and calls `useSubmission.submit`. `_hooks/use-submission.ts` calls `orpc.learn.submit`, follows progress over SSE (`submissionProgressEventSchema`: position, outcome, isSample), and sets `result` (`SubmissionResult`) only once the status is terminal (`isTerminalStatus`).
- **Result panel:** `_components/result-panel.tsx` renders `ResultHero` (verdict), `ResultMetrics` (score, passed/total, runtime), and `TestResultList` (a case per row; sample cases expand to input, expected output, and actual output; hidden cases show only their outcome).
- **Reporting to a teacher:** when `submission.result.submissionId` changes, `workspace.tsx` calls `monitoring.publishResult(resultId)`. `lib/monitoring/use-student-monitoring.ts` emits `resultPublish` with `{ draftId, submissionId }` and nothing else. The student cannot choose what the teacher is told.

A result is therefore published once, after grading has finished. Nothing is published when the submission is accepted or while it is being graded.

### 2.2 Server

- **Result broadcast:** `packages/api/src/monitoring/monitoring.gateway.ts` `resultPublish` checks the socket is the student's and the draft is theirs, then reads the submission scoped to that user and draft. It records `latestSubmissionId` in the class presence registry (`presence.registry.ts`) and emits `resultChanged` to the draft room with status, score, passedCount, totalCount, runtimeMs, and gradedAt (`resultChangedEventSchema` in `packages/shared/src/monitoring/events.ts`).
- **The realtime rule:** the original monitoring design (§ "Submission and run integration") keeps realtime payloads to that safe summary. Hidden inputs, expected outputs, internal failure reasons, and worker diagnostics never travel over the socket.
- **Full review for teachers:** `teacherProgress.getSubmissionReview` (`packages/api/src/teach/teacher-progress.service.ts`) already returns one submission to the assigned teacher of the class: score, accepted, passed/total, runtime, solve time, submitted code, statement, and `cases`. Sample cases carry input, expected output, and actual output; hidden cases carry position and outcome only, plus `hiddenPassed` and `hiddenTotal`. The read is scoped to the class's current exercises and that student. It is the only read that selects submitted code. The same data is shown on `(framed)/teach/classes/[classId]/students/[membershipId]/submissions/[submissionId]`.

### 2.3 Teacher's live view

- `lib/monitoring/use-live-workspace.ts` stores the last `resultChanged` as `result`.
- `teach/classes/[classId]/students/[membershipId]/live/_components/live-output.tsx` has two tabs: `you` (the teacher's private runner) and `student` (the mirrored terminal). The page opens on `you`.
- On the `student` tab, `student-run-panel.tsx` prints one grey line above the terminal: `RESULT 60 · 3/5`.

### 2.4 What is missing

| # | Gap |
|---|---|
| G1 | The verdict is a grey line on a tab the teacher is usually not on. There is no signal that a new verdict arrived. |
| G2 | No per-case detail: which cases failed, and for failing samples, what went in, what was expected, and what the student's code printed. |
| G3 | No sign that the student has submitted and grading is in progress; the teacher learns of the submission only when it finishes. |
| G4 | A teacher who opens the live view after the student submitted sees nothing, although the presence registry already holds the student's `latestSubmissionId`. |
| G5 | No way from the live view to the full review (submitted code, statement), which already exists as a page. |

## 3. Scope

### In scope

1. A **Submission result** tab in the teacher's live output, with an unread marker when a new verdict arrives.
2. The same verdict the student sees: accepted or not, score, passed/total, runtime, and a case list whose failing samples expand to input, expected output, and actual output. Hidden cases show outcome only.
3. A **grading** state from the moment the student's submission is accepted until the verdict is in.
4. The latest result for the exercise the student is on, shown to a teacher who joins after it was graded.
5. A link to the existing full submission review.

### Out of scope

- Streaming case-by-case progress to the teacher while grading. The student sees cells fill in over SSE; the teacher sees "grading" and then the full result. The case progress stream is per-student and is not re-broadcast.
- Submission history in the live view. The review pages already list history.
- Anything that lets a teacher submit for the student.
- Hidden case inputs or outputs for anyone. They remain absent by construction.
- `failureReason`: the student's result panel does not render it today, and the review does not return it.

## 4. Design principles

1. **The socket carries only the summary.** The realtime rule in §2.2 is unchanged. The socket says *that* a verdict exists; the detail is read through the existing authorized review, which already applies the hidden-case rule on the server.
2. **One source of truth for disclosure.** The teacher sees exactly what `getSubmissionReview` returns and nothing the socket adds. No new server code decides what a hidden case shows.
3. **Parity with the student's view.** The student and the teacher read the same verdict through the same components, so "which case failed" means the same row on both screens.
4. **Never steal the teacher's attention mid-task.** A new verdict marks the tab as unread and updates the status line; it does not switch tabs while the teacher is typing or running code.

## 5. Interaction

### 5.1 Output tabs

`LiveOutputTab` becomes `'you' | 'student' | 'result'`:

```
[ 내 실행 ]  [ 김성은 터미널 ]  [ 제출 결과 ● ]              ▶ 테스트 1   ▶ 실행
```

- **Tab label:** `제출 결과` / `Submission result`, with the student's peer colour underline like the student terminal tab.
- **Unread marker:** a violet dot when a verdict (or a new grading state) arrives while another tab is open. It clears when the tab is opened.
- **No automatic switch.** The one exception: if the teacher is on the student's terminal tab, which exists to watch the student, and a new verdict arrives, the view switches to the result tab. This is the student's own workspace behaviour (Submit opens the result tab).
- **Status line link:** the existing line in `StudentRunPanel` gains a trailing `결과 보기 →` button that opens the result tab.

### 5.2 Result tab states

```
┌ 제출 결과 ─────────────────────────────────────────────────────────┐
│  ✗ 오답                              60점 · 3/5 통과 · 42 ms  14:32:05 │
│  [실습] 문자열 함수 - split()                    전체 검토 열기 ↗        │
│ ───────────────────────────────────────────────────────────────── │
│  ✓ 예제 1                                                    12 ms │
│  ✗ 예제 2   출력이 다릅니다                                    ▾      │
│      입력        a b c                                             │
│      예상 출력   c b a                                             │
│      학생 출력   a b c                                             │
│  ✓ 비공개 테스트 3                                                  │
│  ✓ 비공개 테스트 4                                                  │
│  ✗ 비공개 테스트 5   시간 초과                                       │
│  비공개 테스트의 입력과 출력은 선생님에게도 공개되지 않습니다.              │
└──────────────────────────────────────────────────────────────────┘
```

| State | When | Shows |
|---|---|---|
| Empty | No submission yet for this exercise | `아직 제출하지 않았습니다.` |
| Grading | A `resultChanged` with `QUEUED` or `RUNNING` for this exercise | Spinner, `채점 중…`, submission time |
| Loading | Terminal status arrived; the review is being read | The summary from the event (verdict, score, passed/total) with a skeleton case list, so the numbers appear immediately |
| Result | Review loaded | As drawn above |
| Judge fault | Status `ERRORED` | `채점 서버 오류로 결과가 없습니다. 학생에게 다시 제출하도록 안내하세요.` It is not presented as a wrong answer, matching `isJudgeFault` on the student side |
| Cancelled | Status `CANCELLED` | `제출이 취소되었습니다.` |
| Read failed | The review read failed | The summary line from the event, plus `자세한 결과를 불러오지 못했습니다 · 다시 시도` |

- **First failing sample:** it starts expanded, as on the student's panel (`firstFailedSample`).
- **Full review link:** `전체 검토 열기 ↗` opens the existing submission review page in a new tab, keeping the live watch open.
- **Hidden-case note:** the note about hidden cases is shown once, under the list, and only when there are hidden cases.

### 5.3 Exercise changes

The result tab describes the exercise the student is on:

- When the student opens another exercise (`studentContextChanged`, which also restarts the watch on the new draft), the tab clears to Empty unless the latest submission belongs to the new exercise (§6.3).
- When the teacher previews a different exercise while the student stays put, the result tab still shows the student's exercise, labelled with its problem title so it is never mistaken for the previewed one.

## 6. Data flow

### 6.1 Student: publish on acceptance as well as on verdict

`use-submission.ts` already returns `submissionId`, set as soon as `orpc.learn.submit` accepts. In `workspace.tsx`, publish on both:

```ts
const pendingId = submission.submissionId;           // set on acceptance
const resultId = submission.result?.submissionId;   // set on a terminal status
useEffect(() => { if (pendingId) monitoring.publishResult(pendingId); }, [pendingId]);
useEffect(() => { if (resultId) monitoring.publishResult(resultId); }, [resultId]);
```

No payload change: `resultPublish` stays `{ draftId, submissionId }`. The gateway already reads the stored status, so the first publish arrives as `QUEUED` or `RUNNING` and the second as the verdict.

### 6.2 Server: materialId on the summary and the review

- `resultChangedEventSchema` gains `materialId: z.uuid()`. The gateway selects `materialId` in the same query and adds it to the event. The teacher uses it to match the result to the exercise on screen (§5.3); it discloses nothing new, because the live view already knows which material the student is on.
- `teacherSubmissionReviewSchema` gains `materialId: z.uuid()` (the submission's live `materialId`, which `getSubmissionReview` already requires to equal `sourceMaterialId`). This covers the late-join path, where no event carried it.
- No other server change. `getSubmissionReview` keeps its authorization, class scope, and case disclosure unchanged.

### 6.3 Teacher: `useLiveSubmissionResult`

A new hook in `teach/.../live/_hooks/use-live-submission-result.ts`, driven by `use-live-workspace` state:

1. **Inputs:**
   - `academyId`, `classId`, `membershipId`
   - the student's current `materialId`
   - the latest `resultChanged` event
   - the student's presence entry's `latestSubmissionId`
2. **Latest submission:** it tracks the newest submission for the current material.
   - A `resultChanged` whose `materialId` is the current material replaces it when `submissionId` differs, or when the status moved from non-terminal to terminal.
   - An event for another material is ignored.
3. **Reading the review:** on a terminal status it calls `orpc.teacherProgress.getSubmissionReview({ academyId, classId, membershipId, submissionId })` with TanStack Query, keyed by `['teacher-live-result', submissionId]`.
   - Submissions are immutable once graded, so the query has `staleTime: Infinity`.
   - A retry reuses the key.
4. **Late join:** when the watch starts and there is no event yet, if the presence entry has a `latestSubmissionId`, it reads that review. It shows the review only if `review.materialId` is the student's current material; otherwise it shows Empty.
5. **Output:** `{ state, summary, review, unread, markRead, retry }`, where `state` is one of `empty | grading | loading | result | fault | cancelled | error`.
6. **Superseded reads:** a review response for a submission that has since been superseded is dropped (compared by `submissionId`).

### 6.4 Rendering: shared result components

The student panel's pieces take `SubmissionResult`; the teacher's review is `TeacherSubmissionReview`. Rather than duplicate the markup:

- Move `ResultHero`, `ResultMetrics`, and `TestResultList`, plus the pure helpers they use from `_lib/scoring.ts`, to `components/workspace/submission-result/`. They take a neutral view model:

  ```ts
  type VerdictView = {
    status: SubmissionStatus;
    score: number;
    passedCount: number;
    totalCount: number;
    runtimeMs: number | null;
    cases: Array<{
      position: number;
      isSample: boolean;
      outcome: CaseOutcome;
      runtimeMs: number | null;
      input: string | null;
      expectedOutput: string | null;
      actualOutput: string | null;
    }>;
  };
  ```

- **Adapters:** `fromSubmissionResult(result)` for the student, `fromTeacherReview(review, status)` for the teacher. The review has `accepted` rather than a status; the status comes from the `resultChanged` event, or is `PASSED` or `FAILED` from `accepted` on the late-join path.
- **Student panel:** `result-panel.tsx` keeps its own state handling (submitting, SSE cells, errors) and renders the shared pieces.
- **Teacher panel:** a new `teach/.../live/_components/student-result-panel.tsx` renders the states in §5.2 around the same pieces, styled for the dark output pane like the terminal.
- **Copy:** the shared pieces read the `learn` namespace, which the live page already loads for the terminal.

## 7. Authorization and privacy

- **No new socket data.** `resultChanged` gains `materialId` only.
- **Detail read:** the detail comes from `getSubmissionReview`, which requires an assigned, active teacher of the class, a student in that class, and an exercise the class currently teaches. Monitoring itself (`roleCanMonitor`) is limited to the same teachers, so everyone who can watch can already open this review from the class progress pages.
- **Hidden cases:** inputs, expected outputs, and actual outputs are absent from the review payload by construction. The panel cannot show what it never receives.
- **Wrong-student guard:** a teacher watching student A who receives a stale event for student B cannot read B's review through this path. The read names `membershipId` from the route, and the server scopes the submission to that student.
- **Student side:** unchanged in what is shared. The student already knows they are watched (the monitoring indicator), and a teacher could already open this submission from the progress pages.

## 8. Copy

Keys in `packages/i18n/src/locales/{ko,en}/monitoring.json`, in a new `workspace.result` object. The existing flat `workspace.result_title`, `result_score`, and `result_cases` keys stay for the status line:

| Key | ko | en |
|---|---|---|
| `tab` | 제출 결과 | Submission result |
| `open` | 결과 보기 | View result |
| `empty` | 아직 제출하지 않았습니다. | No submission yet for this problem. |
| `grading` | 채점 중… | Grading… |
| `submitted_at` | {{time}} 제출 | Submitted {{time}} |
| `accepted` | 정답 | Accepted |
| `rejected` | 오답 | Not accepted |
| `fault` | 채점 서버 오류로 결과가 없습니다. 학생에게 다시 제출하도록 안내하세요. | Grading failed on our side, so there is no verdict. Ask the student to submit again. |
| `cancelled` | 제출이 취소되었습니다. | The submission was cancelled. |
| `load_failed` | 자세한 결과를 불러오지 못했습니다. | Couldn't load the detailed result. |
| `retry` | 다시 시도 | Try again |
| `open_review` | 전체 검토 열기 | Open full review |
| `hidden_note` | 비공개 테스트의 입력과 출력은 선생님에게도 공개되지 않습니다. | Hidden test inputs and outputs aren't shown to teachers either. |

Case rows, outcomes, and metrics reuse the student's existing `learn` copy through the shared components.

## 9. Verification

### 9.1 Unit (web)

- **`useLiveSubmissionResult` reducer** (pure, extracted):
  - QUEUED → RUNNING → PASSED transitions.
  - An event for another material is ignored.
  - A newer submission supersedes an older one.
  - A late-join review for another material shows Empty.
  - A superseded review response is dropped.
  - Unread is set on a new verdict and cleared by `markRead`.
- **Adapters:** `fromSubmissionResult` and `fromTeacherReview` produce the same `VerdictView` for the same submission; hidden cases never gain input or output.
- **`student-result-panel.tsx`** (static render): each state in §5.2; the first failing sample is expanded; the hidden-case note appears only when there are hidden cases.
- **Student `result-panel.tsx`:** unchanged output after moving to the shared components (existing tests keep passing).

### 9.2 Server

- The gateway `resultPublish` emits `materialId`, and emits the stored status on the acceptance publish (`QUEUED`).
- `getSubmissionReview` returns `materialId`, and existing authorization tests still pass.

### 9.3 End to end

`e2e/specs/monitoring-submission-result.spec.ts`, teacher and student contexts, on the seeded exercise with sample and hidden cases:

1. The teacher opens the live view; the result tab shows Empty.
2. The student submits a wrong answer. The teacher's tab shows the unread dot and "grading", then `오답`, the matching passed/total, and the failing sample expanded with the same input, expected output, and actual output the student sees.
3. The hidden cases show outcome only; no hidden input or output text appears anywhere on the teacher's page.
4. The student submits a correct answer; the teacher's tab updates to `정답` and 100.
5. A second teacher context that opens the live view afterwards shows the latest result immediately.
6. The student moves to another exercise; the teacher's tab returns to Empty.
7. `전체 검토 열기` opens the existing review page for the same submission.

## 10. Rollout

- Additive schema fields (`materialId` on the event and on the review). A web client from before this change ignores them; this design's client requires them, so deploy the API with or before the web app.
- No migration.
- Deploy with `docs/operations/deployment-guide.local.md`.

## 11. Open decisions

1. **Auto-switch:** only from the student terminal tab (proposed), or never?
2. **Case-by-case progress for the teacher while grading:** out of scope here. Worth a follow-up if teachers ask for it; it would need the progress stream re-broadcast as position and outcome only.

## 12. Completion criteria

- [ ] A watching teacher sees "grading" as soon as the student submits, and the full verdict when grading finishes, without reloading.
- [ ] The teacher's case list matches the student's: same rows, same outcomes, same sample detail.
- [ ] Hidden case inputs and outputs never reach the teacher's browser.
- [ ] A teacher who joins late sees the latest result for the exercise the student is on.
- [ ] A new verdict marks the result tab unread and never interrupts the teacher's own run.
- [ ] The full review opens from the result tab.
- [ ] Tests in §9 pass; typecheck, i18n check, and theme lint pass.

## 13. Implementation record

Implemented with no case-by-case progress for the teacher. Where the code differs:

- **Auto-switch (§5.1, §11.1).** Changed after trying it: a new submission brings the result tab forward as soon as the student submits (at "grading"), from whichever output tab is open. The one exception is while the teacher's own run is in progress, when the tab is only marked unread. Each submission moves the tab once, so a teacher who switches away while it grades is not pulled back when the verdict lands, and a submission already there when the teacher arrived moves nothing.

- **Late join (§6.3 step 4).** The design used the presence registry's `latestSubmissionId`. That only knows submissions announced while the student's socket was connected. Instead, `monitoring.getStudentContext` now returns `exercise.latestSubmission: { submissionId, status } | null`, read from `submissions` for the monitored student and exercise under the existing monitoring authorization. The live page already loads that context for the student's current exercise.
- **Rendering (§6.4).** The student's result components were not moved. The teacher panel imports `ResultMetrics`, `TestResultList`, and the `scoring` helpers from the student route as they are, and `reviewAsSubmissionResult` adapts the review into the `SubmissionResult` shape those components read, keeping hidden cases' text null even if a review carried any. The student's `ResultHero` is not reused: its copy addresses the student. The teacher panel has its own header with the verdict word, problem title, submission time, and full-review link.
- **Nullable material.** `Submission.materialId` is nullable (set to null when the exercise is deleted). The gateway does not announce such a submission, and the review returns `sourceMaterialId`, which the service already requires to equal the live `materialId`.
- **Theme lint.** `student-result-panel.tsx` is registered as a dark surface in `scripts/check-theme.mjs`, like the terminal and the student run panel.

Files:
- **Shared:** `events.ts` (`materialId` on `resultChangedEventSchema`), `teacher-progress.ts` (`materialId` on the review), `monitoring.ts` (`latestSubmission` on the exercise context).
- **API:** `monitoring.gateway.ts`, `monitoring.service.ts`, `teacher-progress.service.ts`.
- **Web, student:** `workspace.tsx` publishes on acceptance.
- **Web, teacher:** `_lib/live-submission-result.ts`, `_hooks/use-live-submission-result.ts`, `_components/student-result-panel.tsx`, `live-output.tsx`, `live-workspace.tsx`, `student-run-panel.tsx`.
- **Copy:** `monitoring.json` (`workspace.result.*`).

Verification on this branch:

- **Shared:** `vitest run`, 824 passed.
- **API:** `tsc --noEmit`; `vitest run`, 1115 passed and 21 skipped. Tests cover `materialId` on the review and `latestSubmission` on the exercise context.
- **Web:** `tsc --noEmit`; `vitest run`, 1103 passed, including `live-submission-result.spec.ts` (10 tests: state transitions, superseded submissions, exercise changes, late join, view states, and the hidden-case guard in the adapter). `i18n:check` and `theme:lint` pass, and ESLint on the changed files reports no errors.
- **E2E:** `e2e/specs/monitoring-submission-result.spec.ts` passed 5 of 5 against the local dev servers with a judge worker running, as `student10@cove.test` (`E2E_STUDENT_EMAIL`, `E2E_STUDENT_USERNAME`), so that a person signed in as the default student elsewhere cannot move the watch. The teacher starts on their own terminal and is moved to the result tab by the submission. The watch opened; a real submission reached the teacher with the same score and passed count the student saw, and the result tab opened from the student terminal tab. The seeded hidden-case sentinel was absent from the teacher's page, a second teacher arriving afterwards saw the latest verdict, and the full-review link pointed at the submission in a new tab.
