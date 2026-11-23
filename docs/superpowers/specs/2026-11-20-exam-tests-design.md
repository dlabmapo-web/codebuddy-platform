# Exams (테스트) — design

Date: 2026-11-20 · QA item S-06 (P2, "No exam (midterm/final) feature") · Branch `qa-feedback`

Status: design, not implemented. The implementation plan is [2026-11-20-exam-tests-implementation.md](../plans/2026-11-20-exam-tests-implementation.md).

Reference: [Elice exam research](../../research/elice-exam/README.md) with 24 Elice screenshots and 9 user photos. The goal is the same exam behaviour and the same screens as Elice's, built with Cove's own components and Cove blue.

---

## 1. Goal

Teachers can turn a lecture into a timed exam (중간 평가, 기말 평가) made of the problems Cove already has: multiple choice, short answer and code. Students take it in a dedicated full-screen mode with a countdown, submit each problem, and end the test. Teachers see scores per student and per problem, and decide when students see their results.

### In scope (v1)

| # | Capability | Elice reference |
| --- | --- | --- |
| 1 | A lecture of kind **TEST** in the course outline, marked with the test badge | research §1 |
| 2 | Test page for staff: header, summary rows, tabs **테스트 안내 / 설정 / 문제** | research §2 |
| 3 | Settings: test preparation, time limit, result release, review after completion, self-retake, test type, guide | research §2 Setting tab |
| 4 | Points per problem, total shown, locked once the test is published | research §2 Questions tab |
| 5 | Per-class test period (start and end, or always open) and result release | research §2 period dialog |
| 6 | Student prepare wizard: info and consent, PC clock check, ready | research §4.1 |
| 7 | Student test mode: problem rail with 제출 chips, countdown, 평가 안내, 테스트 종료 dialog, done screen | research §4.2–4.3 |
| 8 | Student post-test card: 테스트 응시 완료, submitted time, 성적 비공개 or the score | research §4.4 |
| 9 | Server-enforced deadline; the last submission per problem counts; no verdicts during the test | research §3.4, §4.1 rules |
| 10 | Teacher results: tiles, per-problem averages, per-student score grid, CSV export, end an attempt, allow a retake | research §5 |

### Later (not v1)

These are listed so the data model does not block them:
- **Group questions:** a random problem per group.
- **Timing rules:** entry deadline and exit time.
- **Prerequisite:** a course-progress condition before a student can start.
- **Proctoring:** webcam/screen proctoring (Liveroom) and ID-card checks.
- **Extras:** the AI assessment report and the language reference link.
- **Imports:** test rows in the Excel content import.

## 2. Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Where does a test live? | A `Lecture` with `kind = TEST` and a 1:1 `LectureTest` row. Its materials are the problems | Elice models a test as a lecture whose pages are problems. Cove already has Module → Lecture → Material, ordering, visibility, moves and library copy for lectures |
| Which problem types? | Every gradable type already in Cove: `PROGRAMMING_EXERCISE` (code, and the native `quiz`), `MULTIPLE_CHOICE`, `WRITTEN_RESPONSE` (short answer, including manual grading). Explanations, PDFs, videos and Turtle are refused inside a test | Matches Elice's problem types; nothing to grade otherwise |
| Points | The existing material maximum: `ProgrammingExercise.materialMaximumHundredths` and `ManualMaterial.maximumHundredths`. The 문제 tab edits these | Elice's "material point" is exactly this. `ABSOLUTE_CAP` (Elice "absolute") and `PROPORTIONAL` (Elice "relative") already use it |
| Period and result release | **Per class** (`ClassLectureTest`), because one Cove course is taught to many classes and each class sits the exam on its own day. No row means "always open, results hidden" | An Elice course is one class run; a Cove course is not |
| Draft or published | The lecture's existing `isVisible`. Visible = published (공개). Points and the problem list lock while the test is published **or** any attempt exists | Elice locks points once published. Locking on attempts too means a score can never be rescaled under a student |
| Which submission counts? | The **last submission made during the attempt** for each problem, whatever its score | Elice rule 4: "마지막 제출한 답안 기준으로 채점" |
| What does the student see during the test? | Only "submitted" with the time. No score, no verdict, no case results, no hints, no solutions, no AI help, no help requests | Elice shows no feedback in a test |
| Run button | Allowed for code problems, and output is shown. Server public tests ("sample checks") are hidden | Elice offers Run in tests |
| Deadline | `deadlineAt = min(startedAt + timeLimit, period end)`, stored on the attempt and enforced by the server on every submit, with a 5 s network grace. No limit and no period end means no deadline | Elice rule: the test ends at the time limit or at the period end, whichever is first |
| Automatic end | No timer job. Every read or write that finds `now > deadlineAt` on an open attempt closes it with `TIME_UP` (or `PERIOD_CLOSED`), in the same statement. Readers treat a passed deadline as ended even before that write | Correct without a scheduler; one fewer moving part |
| Retake | Off by default. With **셀프 재응시 허용** the student may start attempt n+1; the result shows the **latest** ended attempt. A teacher can always grant one retake to a student | Elice "Allow retaking Test" |
| Practice progress and points | Test problems do not change `StudentExerciseProgress`, do not award points, and are excluded from course progress percentages. The test counts as one outline item: done once an attempt has ended | Elice dashboard: "Avg. Progress — Tests excluded" |
| Teacher live monitoring | Keeps working during a test, and presence shows "시험 중". Teachers cannot edit the student's code during an attempt (watch only) | Proctoring without the Liveroom |
| Feature gate | New `AcademyFeature.EXAMS`, off by default, on for pilot academies | Same rollout as other features |

## 3. Data model

New migration `20261120120000_exams`:

```prisma
enum LectureKind {
  STANDARD
  TEST
}

enum TestType {
  NONE
  DIAGNOSTIC
  FORMATIVE
  SUMMATIVE
}

enum TestAttemptEndReason {
  STUDENT        // pressed 테스트 종료
  TIME_UP        // startedAt + time limit passed
  PERIOD_CLOSED  // the class's period end passed
  STAFF          // a teacher ended it
}

model Lecture {
  // …existing fields
  kind LectureKind  @default(STANDARD)
  test LectureTest?
}

/// The exam definition, shared by every class that learns the course.
model LectureTest {
  lectureId          String   @id @map("lecture_id") @db.Uuid
  /// 테스트 안내: sanitized rich text shown in the prepare step and in 평가 안내.
  /// Empty means the six default rules (§5.1).
  guide              String   @default("")
  /// One-line subtitle under the title (Elice "Test Guide" in the period dialog).
  summary            String   @default("")
  testType           TestType @default(NONE) @map("test_type")
  /// Null = no time limit. 1–600 minutes.
  timeLimitMinutes   Int?     @map("time_limit_minutes")
  usePreparation     Boolean  @default(true)  @map("use_preparation")
  reviewAfterEnd     Boolean  @default(false) @map("review_after_end")
  allowSelfRetake    Boolean  @default(false) @map("allow_self_retake")
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  lecture Lecture @relation(fields: [lectureId], references: [id], onDelete: Cascade)
  classes ClassLectureTest[]
  attempts TestAttempt[]

  @@map("lecture_tests")
}

/// One class's sitting of one test: when it is open and when results show.
model ClassLectureTest {
  classId            String    @map("class_id") @db.Uuid
  lectureId          String    @map("lecture_id") @db.Uuid
  /// Both null = 상시 (always open).
  opensAt            DateTime? @map("opens_at") @db.Timestamptz(6)
  closesAt           DateTime? @map("closes_at") @db.Timestamptz(6)
  /// Null = results hidden (성적 비공개). A past instant = released.
  /// A future instant = scheduled release (Elice "Date of Test Result").
  resultsReleasedAt  DateTime? @map("results_released_at") @db.Timestamptz(6)
  updatedByUserId    String    @map("updated_by_user_id") @db.Uuid
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  class Class       @relation(fields: [classId], references: [id], onDelete: Cascade)
  test  LectureTest @relation(fields: [lectureId], references: [lectureId], onDelete: Cascade)

  @@id([classId, lectureId])
  @@index([lectureId])
  @@map("class_lecture_tests")
}

/// One student's sitting. Append-only apart from closing it.
model TestAttempt {
  id             String                @id @default(uuid()) @db.Uuid
  lectureId      String                @map("lecture_id") @db.Uuid
  classId        String                @map("class_id") @db.Uuid
  userId         String                @map("user_id") @db.Uuid
  attemptNo      Int                   @map("attempt_no")
  consentedAt    DateTime              @map("consented_at") @db.Timestamptz(6)
  /// Client clock minus server clock at start, in ms, for support only.
  clockDriftMs   Int?                  @map("clock_drift_ms")
  startedAt      DateTime              @default(now()) @map("started_at") @db.Timestamptz(6)
  /// Null = no deadline (no time limit and no period end).
  deadlineAt     DateTime?             @map("deadline_at") @db.Timestamptz(6)
  endedAt        DateTime?             @map("ended_at") @db.Timestamptz(6)
  endReason      TestAttemptEndReason? @map("end_reason")
  endedByUserId  String?               @map("ended_by_user_id") @db.Uuid
  /// Points snapshot so a later edit cannot rescale this attempt:
  /// [{materialId, pointsHundredths, position}].
  itemsSnapshot  Json                  @map("items_snapshot")
  /// A teacher-granted extra attempt for this student, consumed by the next start.
  retakeGrantedAt DateTime?            @map("retake_granted_at") @db.Timestamptz(6)

  test        LectureTest  @relation(fields: [lectureId], references: [lectureId], onDelete: Restrict)
  submissions Submission[]
  manualSubmissions ManualSubmission[]

  @@unique([classId, lectureId, userId, attemptNo])
  @@index([classId, lectureId, endedAt])
  @@index([userId, lectureId])
  @@map("test_attempts")
}

// Additions:
model Submission       { testAttemptId String? @map("test_attempt_id") @db.Uuid  /* + relation, index */ }
model ManualSubmission { testAttemptId String? @map("test_attempt_id") @db.Uuid  /* + relation, index */ }
enum AcademyFeature    { /* … */ EXAMS }
```

**Raw SQL in the migration:**
- **One open attempt at a time:** `CREATE UNIQUE INDEX test_attempts_one_open ON test_attempts (class_id, lecture_id, user_id) WHERE ended_at IS NULL;`
- **Indexes for the "last submission in this attempt" lookup:**
  - `CREATE INDEX submissions_attempt_last ON submissions (test_attempt_id, material_id, created_at DESC) WHERE test_attempt_id IS NOT NULL;`
  - The same index on `manual_submissions`.
- **Tests hold only gradable problems:** a `CHECK` on `lecture_tests` is not possible across tables, so the service enforces it inside the course lock, as imports already do.

## 4. Scoring

Implemented once in `@cove/shared` (`content/test-score.ts`) and used by both the API and the web.

- **Item points `P`:** taken from the attempt's `itemsSnapshot`.
- **Item score**, from the last submission of the attempt for that material:

| Submission | Item score |
| --- | --- |
| Programming, weighted (`appliedScoreHundredths` not null) | `min(P, appliedScoreHundredths)`. The exercise's `materialMaximumHundredths` equals `P` while the test is locked, so this is just the applied score |
| Programming, legacy (0–100 `score`) | `round(P × score / 100)` |
| Native quiz (`quizSnapshot`) | `P` if correct, else 0 |
| Multiple choice (`MultipleChoiceAssessment`) | `scoreHundredths` (already scaled to the material maximum) |
| Short answer, automatic (`ShortAnswerAssessment`) | `scoreHundredths` |
| Short answer / code, manual review | The latest `ManualReview.scoreHundredths` / `ProgrammingSubmissionReview`; **pending** until reviewed |
| Queued or running | pending |
| No submission | 0, shown as 미제출 |

- **Attempt total:** the sum of item scores; the maximum is the sum of `P`.
- **Status:** an attempt is "graded" when no item is pending.
- **Results grid:**
  - shows `—` for pending items;
  - shows the total only when nothing is pending, otherwise "채점 중" with the partial total in the tooltip.
- **Units:** all arithmetic is in integer hundredths, displayed as points with up to two decimals ("7 점", "6.5 점").

## 5. Student experience

The visual reference is the user's photos, provided/01–07, in Cove's dark workspace theme. Primary actions use Cove blue (`bg-brand`). Elice's green is used only for the "done" states (100% bar, done check, 제출 chips), matching the success colour Cove already uses.

### 5.1 Entry point
- **Outline:** a test row in the course outline and the curriculum navigator shows the test badge (`BadgeCheck` icon, brand colour), its title and a status chip: 응시 가능 / 응시 중 / 응시 완료 / 기간 아님.
- **Opening the row:** `/academy/[slug]/learn/tests/[lectureId]?classId=…` shows the **test card**: title, summary, three tiles (응시 기간, 제한 시간, 문제 수), the guide or the six default rules, and the button:
  - **응시하기** (start). It goes to the wizard when `usePreparation` is on, otherwise to a single consent dialog.
  - **이어서 응시하기** (continue) when an attempt is open.
  - **After the test:** the green "테스트 응시 완료 · YY. MM. DD. HH:mm 제출 완료" box with 성적 비공개, or the score `72 / 100 점` when results are released. When `reviewAfterEnd` is on, there is also a **문제 다시 보기** link that opens the attempt read-only.
  - **재응시** when a retake is available.
  - Disabled with the reason when the period has not opened ("YYYY.MM.DD HH:mm 부터 응시 가능") or has closed.
- **The six default rules** (Korean; English in `en`):
  1. 테스트 조건을 충분히 숙지한 후 '응시하기' 버튼을 클릭하여 테스트를 시작하세요.
  2. 제한시간/종료시간이 있는 테스트 경우, 주어진 시간 안에 모든 문제를 풀어야 합니다.
  3. 테스트 도중 페이지 이탈 시 제출 이력 및 작성한 코드는 저장되며 제한 시간은 계속 진행됩니다.
  4. 모든 문제는 제출 버튼을 클릭해야 제출 처리되며, 마지막 제출한 답안 기준으로 채점됩니다.
  5. 문제를 다 푼 후에 '테스트 종료'를 클릭해 주세요. 테스트 종료 후에는 재응시 및 재제출이 불가합니다.
  6. 부정행위 적발 시 0점 처리됩니다.

### 5.2 Prepare wizard (`/learn/tests/[lectureId]/prepare`)
- **Layout:** a left card "테스트 준비하기" with a progress bar (33 → 67 → 100%) and three steps; the right card holds the step; "← 뒤로 가기" at the top.
- **Step 1, 테스트 안내:**
  - "안녕하세요. {name} 님 / 테스트 정보 및 유의 사항을 확인해 주세요."
  - The three tiles and the rules.
  - The required checkbox "모든 유의 사항을 숙지하였으며 이에 동의합니다.", then 다음.
- **Step 2, PC 시간 설정:**
  - **서버 시간** and **PC 시간**, each ticking every second, with the drift in green when |drift| ≤ 1 s and red otherwise. A refresh button re-syncs.
  - The server time comes from `exam.serverTime`; drift is computed from the round trip (midpoint).
  - Buttons link to the Windows and Mac time-setting help pages.
  - The four notes, then 이전 / 다음.
  - Drift over 60 s shows a warning but does not block, because the deadline is server-enforced.
- **Step 3, 유의 사항 확인:** "모든 응시 준비가 완료되었습니다.", the rules, then 이전 / **테스트 시작**. Starting calls `exam.start` with the consent and the drift, then replaces the URL with the attempt page.

### 5.3 Test mode (`/learn/tests/[lectureId]/attempts/[attemptId]?item=n`)
A full-screen layout. The normal course navigator is replaced.
- **Left rail** (collapsible with `|←`): the test title, then items `1 [문제1] … N`. Each item shows the green **제출** chip once submitted; the current item is highlighted.
- **Top bar:**
  - The breadcrumb `[테스트명] / [문제n]`.
  - **평가 안내**, which opens the guide in a dialog.
  - **남은 시간 HH:MM:SS**, counted down from the server `deadlineAt` corrected by the measured drift. It turns amber under 5 minutes and red under 1 minute. Without a deadline it reads "제한 시간 없음".
  - The red-tinted **테스트 종료** button. This is the one place a danger colour is used, because ending is irreversible.
- **Body:** the existing problem UIs, mounted in **test mode** (§6.3):
  - **Multiple choice:** options and **제출**, disabled until an option is chosen.
  - **Short answer:** a textarea and 제출.
  - **Code:** the statement on the left; editor, **Run**, **제출**, the "마지막 제출 시각" line and output on the right.
  - **After a submit:** a toast "제출되었습니다" and the rail chip turns green. Students may resubmit; the last one counts.
- **Bottom bar:** 이전 / `n / N` / 다음.
- **Drafts:** they are saved as today, so leaving and coming back restores the code and selections.
- **Time warnings:** a toast at 5 minutes and at 1 minute.
- **Timeout:** at 0 the page shows the done screen with "제한 시간이 종료되어 테스트가 자동 종료되었습니다". The server has already refused anything later.

### 5.4 Ending
- **테스트 종료 dialog:**
  - "테스트를 종료하면 답안 제출이 불가능합니다."
  - Every item with a type icon and **제출** (green) or **미제출** (grey).
  - The required checkbox "각 문제의 제출 여부를 확인했으며, 테스트를 종료하겠습니다."
  - **테스트 종료** (enabled once checked) and 취소.
- **Done screen:** a check icon, "테스트가 종료되었습니다.", the scrollable 제출/미제출 list, then **다음**, which goes back to the test card in the course.

### 5.5 Review after completion
When `reviewAfterEnd` is on, the attempt page opens read-only after the end:
- **Shown:** the student's last submitted answers.
- **Not shown:** the 제출 buttons and the timer.
- **Once results are released:** each item also shows its score.
- **Never shown:** model answers and explanations. That is a later setting.

## 6. API

### 6.1 Procedures (oRPC, `shared/src/api` contract `exam.*`)

| Procedure | Who | Statements | Notes |
| --- | --- | --- | --- |
| `exam.serverTime` | any signed-in user | 0 | `{now}`; no database |
| `exam.studentTest({academyId, classId, lectureId})` | student in class | 1 | Test card: definition, class period, item count, total points, the latest attempt and whether a retake is available |
| `exam.start({…, consent: true, clockDriftMs})` | student | 1 read + 1 transaction | Checks the period, the open attempt, retake rights and the feature. Computes the deadline, snapshots the items, inserts. Concurrent starts are stopped by the open-attempt unique index (returns the existing attempt) |
| `exam.attempt({attemptId})` | owner | 1 | Shell: items (id, type, title, position), the per-item submitted flag and last submitted time, and the deadline. Closes the attempt first if the deadline has passed |
| `exam.end({attemptId})` | owner | 1 | Idempotent `UPDATE … WHERE ended_at IS NULL` |
| `exam.staffTest({academyId, courseId, lectureId})` | content staff | 1 | Test page: definition, items with points, locked flag |
| `exam.updateTest({…})` | content staff | 1 transaction | Settings; points only when unlocked; bumps `contentRevision` |
| `exam.convertLecture` / `exam.createTest` | content staff | 1 transaction | Create a TEST lecture, or convert an empty or gradable-only lecture |
| `exam.classSchedule.update({classId, lectureId, opensAt, closesAt, resultsReleasedAt})` | class teacher or manager | 1 | Upsert |
| `exam.results({academyId, classId, lectureId})` | class teacher or manager | 1 | Tiles, per-problem averages and the per-student grid (§7) in **one** SQL statement |
| `exam.results.export` | same | 1 | CSV with the same columns |
| `exam.staff.endAttempt` / `exam.staff.grantRetake` | class teacher or manager | 1 | Audit-logged |

### 6.2 Submission admission in a test
Both `SubmissionService.submit` and `ManualService.submit` (and the multiple-choice and short-answer services) gain one branch in their **existing** admission read; this adds no extra statement:
- **Detecting a test:** the admission read already joins the lecture, so it adds `lecture.kind` and, for a test, the caller's open attempt for `(classId, lectureId, userId)` via a lateral subquery.
- **Refusals for a test material:**
  - `EXAM_NOT_STARTED` when there is no open attempt;
  - `EXAM_ENDED` when the attempt is ended or `now > deadlineAt + 5 s`;
  - `EXAM_ITEM_NOT_IN_ATTEMPT` when the material is not in the attempt.
- **Stamping:** the submission row gets `testAttemptId`.
- **Grading:**
  - `nextProgress` and point awarding are **skipped** for rows with `testAttemptId`.
  - Grading itself is unchanged: same snapshots and same queue.
  - A submission accepted before the deadline is graded even if grading finishes after it.
- **Practice paths are refused for test materials:** staff practice, sample checks, hints, solutions, AI feedback and help requests.

### 6.3 Redaction (no verdict during the test)
- **Student reads redacted while the attempt is open, or after it until results are released:**
  - `latestSubmission`;
  - the submission result poll;
  - manual attempt reads;
  - quiz feedback.
- **What a redacted read returns:** `{status: "SUBMITTED", submittedAt}`, with no score, verdict, cases or feedback.
- **Who does it:** one shared helper `redactForExam(result, attemptState)`, applied where the student read model is assembled. Staff reads are never redacted.
- **Socket:** the student's own `result.changed` event (if subscribed) carries only the submitted state for test materials; the teacher's monitoring stream keeps full results.

### 6.4 Auto-close
- **Every exam read closes an expired attempt first:** a single CTE `UPDATE test_attempts SET ended_at = deadline_at, end_reason = … WHERE id = $1 AND ended_at IS NULL AND deadline_at < now() RETURNING …`, then the select.
- **The results query treats `deadline_at < now()` as ended** in SQL, so the grid is right even for students who never came back.

## 7. Teacher experience

### 7.1 Authoring (content editor)
- **Course builder** (`content/courses/[courseId]`):
  - "+ 수업 추가" gains **테스트 추가**.
  - A test row shows the test badge instead of a folder, plus "N 문제 · 제한 시간 50분".
  - The row menu gains **테스트로 전환** for lectures that contain only gradable problems.
- **Test page** (`content/courses/[courseId]/lectures/[lectureId]/test`), matching elice/01–07:
  - **Header:** a 공개/비공개 chip, the badge, the title and the summary.
  - **Facts:** 제한 시간 and 문제 수.
  - **Summary rows:** 응시 기간 (with "반별로 설정" and a link to the class page), 성적 공개, 응시 후 문제 다시 보기, 셀프 재응시 허용.
  - **Buttons:** the publish dropdown (공개/비공개, the existing visibility toggle) and **수정하기** (title, summary, test type dialog).
  - **Tab 테스트 안내:** the rich-text guide, with an empty state that shows the six default rules and "기본 안내 사용".
  - **Tab 설정:** toggle rows in Elice's layout:
    - 테스트 준비 사용;
    - 제한 시간 (minutes input);
    - 응시 후 문제 다시 보기;
    - 셀프 재응시 허용;
    - 테스트 유형 (select).
    - Disabled rows with a "준비 중" note for the later features: 그룹 문제, 입장 마감, 퇴실 시간, 응시 자격, 모니터링, 신분증 확인, 언어 레퍼런스.
    - One **저장** button.
  - **Tab 문제:**
    - The problem table: checkbox, type icon, title, **배점 input + 점**, and ⋮ (open the editor, move, remove).
    - "순서 변경" (drag) and "문제 추가" (create a new problem of a gradable type, reusing the existing creation flows).
    - The **총점** line, with a warning chip when it is not 100 (allowed but flagged).
    - **Locked:** inputs disabled with "공개 중이거나 응시 기록이 있어 배점을 바꿀 수 없습니다".
- **Problem editors:** unchanged. Inside a test, the per-problem "max score" field is replaced by a note "배점은 테스트의 문제 탭에서 설정합니다".

### 7.2 Class side
- **Navigation:** the class page (`teach/classes/[classId]`) gains a **테스트** tab listing the tests in the class's courses. Each row shows its period, status (예정 / 진행 중 / 종료), submitted/taken and the average.
- **Test results page** (`teach/classes/[classId]/tests/[lectureId]`), matching elice/23–24:
  - **Period card:** start and end pickers or "상시", plus result release: 비공개 / 지금 공개 / 날짜 지정. Saving upserts `ClassLectureTest`.
  - **Tiles:** 평균 점수, 제출/응시 인원, 진행 중 인원.
  - **Per-problem table:** 문제, 유형, 배점, 평균 점수, 정답률 (full score), 평균 제출 수, 평균 실행 수 (code only).
  - **Per-student grid:**
    - Columns: name, status (미응시 / 응시 중 with time left / 종료 with reason), **총점**, then for each problem the score and submit count.
    - Clicking a cell opens the existing submission review page (`students/[membershipId]/submissions/[submissionId]`) or the manual grading sidebar, so manual items are graded there.
    - Sticky first column; search; sort by name or score.
  - **Row actions:** 응시 종료 (end now, confirm) and 재응시 허용 (grant one retake, confirm). Both are audit-logged.
  - **CSV 내보내기.**
- **Live:** while an attempt is open, the row shows 응시 중; the page refetches every 30 s while any attempt is open (AGENTS.md rule 7: ≥15 s), or uses the class presence socket if available.

## 8. Course outline and progress

- **Readers:** `readCurricula` / `withCurriculum` gain `lecture.kind` and, for tests, the time limit (one column each; no new statement).
- **Student navigator:** a test lecture is **one item** that links to the test card. Its problems are not listed and cannot be opened outside an attempt.
- **Progress:**
  - Course progress counts the test as done when the student has an ended attempt.
  - Its problems are excluded from solved/total and from `bestScore` sums.
  - `curriculum-outline.service.ts` and the shared `learn.ts` counters get the exclusion.
- **Teacher progress screens:** test problems are excluded from problem progress; the test appears as a row linking to the results page.

## 9. Library copy and sync

- **Copy:** `course-tree-copy.ts` copies `lecture.kind` and `LectureTest`. `ClassLectureTest` and attempts are never copied.
- **Sync:** library sync treats `LectureTest` fields as lecture fields (merge unit: lecture). A synced change to points is refused while the copy's test is locked, which is reported as a sync conflict.

## 10. Security and integrity

- **Who reads what:**
  - Students read only their own attempts.
  - Problem content of a test is served only with an open attempt (or for review when `reviewAfterEnd` is set and the attempt ended).
  - Before starting, the student cannot open `/learn/exercises/[id]` for a test problem; it redirects to the test card.
- **Answer keys:** they never reach the client, as today.
- **Server-side checks:** deadline, consent and the open attempt are all checked on the server. The client timer is only a display.
- **Audit:** an `AuditLog` row for start, end (any reason), grant retake, staff end, schedule change and results release.
- **Multiple tabs:** two tabs share one attempt. A submit from either is accepted, and the last one counts.

## 11. Performance (AGENTS.md)

| Path | Statements | How |
| --- | --- | --- |
| Test card | 1 | One raw query: test + class schedule + latest attempt + item count and points |
| Start | 1 + tx(2) | Admission read; then insert attempt and audit in one transaction |
| Attempt shell | 1 | CTE: close-if-expired, then items with the last submission per item (both submission tables, `DISTINCT ON`) |
| Submit in a test | +0 | The open attempt is joined into the existing admission read |
| Results grid | 1 | CTE over attempts (latest per student), lateral last submissions from both tables, manual reviews; assembled in memory |
| Staff test page | 1 | Test + items with points + locked flag (`EXISTS` attempt) |

Each is pinned in `packages/api/src/exam/exam-performance.integration.spec.ts` with the Prisma query-event counter against a disposable Docker PostgreSQL (`COVE_INTEGRATION_DATABASE_URL`). The results grid is checked at 1 statement with 40 students × 15 problems.

## 12. i18n and accessibility

- **Locales:** new namespace `exam` in `packages/i18n` (ko, en). Korean strings follow Elice's wording above.
- **Countdown:** it has `role="timer"` and announces only at 5 minutes, 1 minute and the end.
- **Dialogs:** they trap focus. Rail items are buttons with an `aria-current` state.
- **Theme:** dark mode is the workspace default; the test card also renders in light mode.

## 13. Open points (defaults chosen, change if needed)

1. **Total ≠ 100:** allowed with a warning (Elice shows the sum; it does not force 100).
2. **Grace period:** 5 s after the deadline for in-flight submits.
3. **Retake result:** a retake replaces the shown result with the latest attempt; earlier attempts stay visible to staff.
4. **Scheduled release:** it shows results at that instant with no job, because it is compared on read.
5. **Elice's green:** used only for done and submitted states; actions are Cove blue.
