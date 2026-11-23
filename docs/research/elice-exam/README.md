# Elice exam ("테스트") — research for S-06

Researched 2026-11-20 on `dlab.elice.io`. All of it was read only: nothing was saved, published or started.

**Sources**
- **Admin (English UI):** course `[마포] DC-C-1(C언어기본)` (793625), test lecture `[Week6] 중간 평가` (6805498). It has 12 problems, a 50-minute limit, and 0 members, so there are no results to read.
- **User-provided photos (Korean UI):**
  - Admin: course `[마포] DM-PY-M2(파이썬 트랙)`, test `[중간 평가]` with 15 problems and 100 minutes.
  - Student: a full attempt by "kook brooks".

The screenshots are in [screenshots/elice/](screenshots/elice/) (taken by Claude) and [screenshots/provided/](screenshots/provided/) (the user's photos). The numbers below refer to those files.

---

## 1. What a "test" is in Elice

- **A test is a special lecture.** It sits in the course outline next to normal week folders and is marked with a blue check-badge icon instead of a folder. Its children are the problems (문제 1…N).
- **Problems are ordinary materials.** They are quiz types (`?` icon) or code exercises (`</>` icon). A test can mix them; the C midterm has 6 quizzes and 6 code problems.
- **The lecture states:** `Draft` → `Published` (shown as the `Published` / `공개` chip). Some settings can only change in draft ("Use Group Questions", the question type of a quiz).
- **"Settings" (⚙ 설정) menu on the test** (elice/10): Set as preview (disabled), Duplicate, Delete.

## 2. Admin: the test page

The page shows a header, a summary, two buttons and three tabs (elice/01, provided/08).

### Header and summary
- **Chips:** `Published` and the test badge.
- **Title and subtitle:** the subtitle is the test guide line, for example "지금까지 배운 개념으로 문제를 스스로 해결합니다."
- **Two facts:** **Time Limit** ("50 minutes" / "100분") and **Problems** ("12 EA" / "15 개").
- **Summary rows (label → value):**

| Row | Example | Notes |
| --- | --- | --- |
| Test Period / 응시 기간 | Continue / 상시 + **Edit** link | "Continue" means no start/end dates |
| Test Qualification / 응시 자격 요건 | None / 없음 | From the "Test Prerequisite" setting |
| Monitoring / 모니터링 | Unlinked / 미연결 + **Create Liveroom →** / 시험장 만들기 → | Webcam/screen proctoring room |
| Test Result Announcement Dates / 성적 공개 | Hide / 비공개 | |
| Test accessible after completion / 응시 후 문제 다시 보기 | No / 불가능 | |
| Enable retaking Test / 셀프 재응시 허용 | No / 불가능 | |

- **Buttons:** a publish dropdown (`비공개 ▾`, which switches public/private) and `수정하기` (Edit).

### Test Period "Edit" dialog (elice/08, elice/09)
The dialog is titled "New Lecture" even when editing. Its fields:
- **Test Title** (required).
- **Test Guide** (textarea).
- **Test Period:** two `MM/DD/YYYY hh:mm` pickers for start and end; both empty means "Continue".
- **Test Type:** Not selected / Diagnostic Test / Formative Test / Summative Test. This is a label used for reporting.
- **Actions:** Cancel and Save.

### Tab: Test Introduction / 테스트 안내 (elice/04)
A rich-text editor for the rules students read before starting. The default text is the same six-line rule list students see in the prepare step (§4.1).

### Tab: Setting / 설정 (elice/05–07)
Each row is a toggle with an icon, title and helper text. The values below are this test's.

| Setting | Value | Behaviour |
| --- | --- | --- |
| Use test preparation | **on** | Shows the 3-step prepare wizard (§4.1) before the test |
| Entry Deadline Setting | off, disabled | After this time nobody can *start*. ⚠ Needs start and end on the same day |
| Exit Time Setting | off, disabled | When a taker may leave after starting. ⚠ Same-day rule |
| Time limit | **on, 50 m** | Number input in minutes |
| Date of Test Result | off | Whether and when grades are published |
| AI Assessment Report | off | AI report per assessment |
| Allow Test can be accessible after the completion | off | After finishing, students may view questions but not submit |
| Allow retaking Test | off | The student may retake the test on their own |
| Test Prerequisite | off | Students must meet a course-progress condition first |
| Use Group Questions | off, disabled | Random question per group. ⚠ Draft only |
| Monitoring Features | off, disabled | Webcam and screen sharing. ⚠ Needs a linked Liveroom |
| Check Identify Card | off, disabled | ID upload and verification. ⚠ Needs monitoring |
| Language reference | off | Links the language docs ("Reference site >") |

A single **Save** button sits at the bottom.

### Tab: Questions / 문제 (elice/02–03, provided/09)
- **Table:** checkbox, type icon, problem title, a **points input** with "점", and a ⋮ menu. There is a "순서 변경" (reorder) action at the top.
- **Total:** "총점: 100 점", with the note "성적 제외 수업 자료를 제외한 공개된 수업 자료의 배점 총합" (the sum over published materials that count toward grades).
- **Points:** they can differ per problem. The Python midterm uses 5, 5, 6, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8 = 100.
- **Locks:** points inputs are disabled once published.
- **Unverified:** each row shows an orange "broken link" icon. It probably means the problem is a copy no longer linked to its library source; not confirmed.

## 3. Admin: problems and how they are graded

### 3.1 Multiple choice (elice/12–13, 20–21)
- **Question:** a text up to 1000 characters, plus an optional rich "Problem Description".
- **Answer type:** `Multiple Choice (Single Answer)`. The type is locked after publishing.
- **Options:** draggable rows; the correct one is marked with its radio. There is "Add Option", and 4 or 5 options are typical.
- **Shuffle answer order:** a toggle.
- **Write Explanation:** "Use" checkbox; the explanation is shown after solving.
- **Grading:** a correct choice earns the full points; anything else earns 0.

### 3.2 Subjective / short answer (elice/11, 22)
- **Student view:** a textarea, "please fill the answer".
- **Answer type:** `Subjective`.
- **Two answer modes:**
  - **Normal Mode:** a list of accepted answers.
  - **Advanced Mode:** a regular expression. Meta characters must be escaped. There is a test field and an "AI Answer Helper".
- **This test uses `.*`,** which accepts any answer, so the free-text question is effectively a participation point.
- **"Grade manually without specifying answers":** a checkbox that sends the answer to a teacher for grading instead.
- **Input field hint text:** configurable.

### 3.3 Code exercise (elice/14–19)
- **Student view:** problem text with an I/O example on the left (with Copy buttons), and on the right the editor (`main.c`), **Run**, **Submit**, "Last submit score", "Last submit datetime", "Editor connected" and the output panel.
- **Admin view:** a **View Solution** button.
- **Edit tabs:** Skeleton Code (files; `answer.c` hidden with the eye icon, `main.c` visible), Grader Code, Basic Info, Grading settings, Achievement, AI Helpy Guide, and Env Settings.
- **Grader Code:**
  - **Compile and Run Script:** `g++ -std=c++11 main.c -o main` and `./main`.
  - **Grading settings:** a toggle, then **Standard Input/Output (STDIO) Grader** and a list of test cases.
  - **Each test case:** Grading method, **Score (point)**, Input, Output (up to 50,000 B) and Time limit (sec, here 60).
  - **This problem:** 2 cases × 50 points.
- **Grading methods:** STDOUT output is the same / contains a string / does not contain a string / matches regular expression / does not match regular expression.
- **Grading settings: grade type.** It is either **Relative grade (default)** or **Absolute grade**; this test uses Absolute.
  - **Absolute:** score = `min(material points, sum of passed case scores)`. Example: a 20-point material with cases worth 100 gives 20.
  - **Relative:** the passed-case share is scaled to the material points.
  - Elice says Absolute "is scheduled to end support".

### 3.4 Test score
- **Test score** = the sum of the problem scores, out of the Questions-tab total (100).
- **Last submission counts:** each problem is graded on the **last submitted** answer ("마지막 제출한 답안 기준으로 채점").

## 4. Student flow (provided/01–07)

### 4.1 Prepare wizard ("테스트 준비하기")
- **Layout:** a left card with a progress bar (33% → 67% → 100%, turning green at 100%) and three steps; "← 뒤로 가기" (back) at the top.
- **Step 1, 테스트 안내 (test info).**
  - **Greeting:** "안녕하세요. {name} 님".
  - **Three tiles:** 테스트 응시 기간 (상시), 제한 시간 (1시간 40분), 문제 수 (15개).
  - **The six rules:**
    1. Read the conditions, then press "응시하기" to start.
    2. With a time limit or end time, every problem must be solved within it.
    3. Leaving the page keeps submissions and code, but the clock keeps running.
    4. Every problem must be submitted with its Submit button; the last submission is graded.
    5. When done, press "테스트 완료하기". No retake or resubmission afterwards.
    6. Cheating scores 0.
  - **Consent:** a required checkbox, "모든 유의 사항을 숙지하였으며 이에 동의합니다.", then 다음 (Next).
- **Step 2, PC 시간 설정 (clock check).**
  - **Tiles:** 서버 시간 (with refresh) and PC 시간, with the drift in green, for example "(-0.03초)".
  - **Help links:** Windows and Mac time-setting buttons.
  - **Four notes:** the PC clock must match the server; leaving keeps work but the clock runs; the test ends automatically when the period ends, even with time left; no retake after it ends.
  - **Buttons:** 이전 and 다음.
- **Step 3, 유의 사항 확인 (ready).** "모든 응시 준비가 완료되었습니다.", the rules again, then 이전 and a green **테스트 시작** (start).

### 4.2 Taking the test (provided/04–05)
- **Full-screen test mode.** The normal course outline is replaced.
- **Left rail:** the test title and numbered problems 1…N. A green **제출** chip marks submitted problems, the current one is highlighted, and the rail can collapse (`|←`).
- **Top bar:**
  - The breadcrumb `[중간 평가] / [문제1]`.
  - **평가 안내** (shows the rules again).
  - **남은 시간: 01:39:46**, a live countdown.
  - A red **테스트 종료** (end test) button.
- **Body:** the same problem UIs as §3. Each problem has its own **제출** (submit) button; the quiz Submit stays disabled until an option is chosen.
- **Bottom bar:** `이전`, `n / N` and `다음`.
- **No feedback:** no score or right/wrong verdict is shown during the test.

### 4.3 Ending (provided/05–06)
- **테스트 종료 dialog:**
  - The warning "테스트를 종료하면 답안 제출이 불가능합니다." (no more submissions after ending).
  - A list of every problem with **제출** (green) or **미제출** (grey).
  - A required checkbox, "각 문제의 제출 여부를 확인했으며, 테스트를 종료하겠습니다."
  - Buttons: **테스트 종료** and **취소**.
- **Done screen:** a green check, "테스트가 종료되었습니다.", the scrollable 제출/미제출 list and a green **다음** button.
- **Automatic end:** when the time runs out, or the test period ends, the test ends automatically.

### 4.4 After the test (provided/07)
The test lecture page in the course shows:
- **A green box:** "테스트 응시 완료", "26. 11. 20. 12:11 제출 완료" and **성적 비공개** (results hidden, because Date of Test Result is off).
- **The info:** 응시 기간 / 제한 시간 / 문제 수 tiles and the rules.
- **No problem access:** students cannot open problems again, because "accessible after completion" is off.

## 5. Results (elice/23–24)
- **Dashboard → select the test.** Three tiles: **Avg. Test score**, **Exercise Avg. Runs** and **Submitted/Taken (users)**.
- **Per-problem table:** Title (`[QUIZ] - 문제 1`, `[EX] - 문제 7`), Avg. Score, Avg. Runs (quiz shows `--`) and Avg. Submission.
- **Per-member grid:**
  - Columns: Member, Status, **Total Score** and ID Card, then for each problem a **Score** and a count (submitCount for quizzes, Runs/Submissions for code), plus a Tutoring link.
  - The grid has a user search box.
  - A **Course Report** download sits at the top.
- **Not seen:** this course has no members, so a filled grid was not available; it needs a course with real attempts.

## 6. Mapping to Cove

**Already in Cove, and it matches Elice:**
- `MaterialType.MULTIPLE_CHOICE` with `MultipleChoiceAssessment` (option ids, display order, so shuffle is possible).
- `MaterialType.WRITTEN_RESPONSE` with `ShortAnswerAssessment` (an evaluator), and `ManualReview` for manual grading.
- `ProgrammingExercise` cases with the same five comparators (`CaseComparator.STDOUT`, `STDOUT_MATCH`, `STDOUT_NOMATCH`, `STDOUT_REGEX`, `STDOUT_REGEX_NOMATCH`), and per-case weights.
- `MaterialScorePolicy.PROPORTIONAL` (Elice "relative") and `ABSOLUTE_CAP` (Elice "absolute", `min(points, earned)`).

**Missing (S-06 scope):**
1. **A test container:** a lecture kind `TEST` (or a `Test` row on a lecture) with the title, guide, test type, period start and end, time limit, the Setting toggles above, and draft/published.
2. **Points per problem** in the test, with the total shown and locked after publishing.
3. **An attempt model:** one attempt per student and test, holding `startedAt`, `deadline = min(start + limit, period end)`, `endedAt` and the end reason (student / timeout / period end), plus an optional retake.
4. **Test-mode submissions:** no verdict shown to the student, the last submission counts, and submissions are refused after the attempt ends (server-enforced deadline).
5. **The student UI:** the prepare wizard (3 steps, consent, server-clock check), the full-screen test layout (rail with 제출 chips, countdown, 평가 안내, 테스트 종료 dialog), the done screen, and the post-test card with "성적 비공개 / 공개".
6. **The admin UI:** the test page (summary, three tabs, period dialog), the Questions tab with points, and the results dashboard (tiles, per-problem averages, per-member score grid, export).
7. **Later or optional:** group questions, the entry deadline and exit time, the prerequisite, monitoring/ID card (Liveroom), the AI report and language reference.

**Database rule (AGENTS.md):**
- **One statement per read:** the test page and the results grid must each read in one statement; the grid is one query over attempts and submissions keyed by `(classId, testId)`, never one per student.
- **Countdown:** it runs on the client from a server `deadline`, with no polling.

## Next step

Design: [2026-11-20-exam-tests-design.md](../../superpowers/specs/2026-11-20-exam-tests-design.md). Plan: [2026-11-20-exam-tests-implementation.md](../../superpowers/plans/2026-11-20-exam-tests-implementation.md).
