# Cove AI teacher for one campus: AI courses, learning on save, and AI help on every button

**Status:** agreed in conversation on November 26, 2026, and built the same day on branch `feat/cove-ai-learning-assistant` (not released). Where the build differs from the first draft of this document, the text below says what was built.

**Builds on:**
- [the Analyze design](2026-11-25-cove-ai-analysis-design.md)
- [the learning assistant design](2026-11-25-cove-ai-learning-assistant-design.md)
- [the data document](2026-11-25-cove-ai-learning-assistant-data.md)

This document changes four rules from those designs:

| Earlier rule | Now |
| --- | --- |
| Problems are learned only at night | Learning starts as soon as a problem is created or saved (§5) |
| The Analyze button appears only after a failed Submit | An **AI help** button in the toolbar works after Run, Test run and Submit (§6) |
| A new mistake is learned only after 5 answers from 3 students, at most once a week | **Every** new mistake is checked and learned (§7) |
| AI is switched on problem by problem only | A course-level choice comes first (§4) |

## 1. What we want

One campus uses the AI teacher in its own Python courses.

1. A Manager or Team Lead creates a course and chooses **AI teacher: included** or **not included**.
2. In an AI course, each problem has an **AI switch**. It starts **off**, and the Manager or Team Lead turns it on where it helps.
3. As soon as a problem with AI on is **created or saved**, the AI learns it:
   - it writes hints and common mistakes;
   - Cove's grader proves each mistake;
   - a second AI check reads the text.
4. A student whose code is wrong presses **AI help**. This works after Run, Test run or Submit. The AI explains the mistake in words and asks one question. **It never gives the code.**
5. Every mistake the notes don't know yet is checked and, when the grader proves it, added to the problem's notes.

## 2. Scope

**In this version:**
- Only Python courses.
- Only academies with the `AI_ASSISTANT` feature on. Today that is one campus.
- Only the academy's own courses.

**Not in this version:**
- **C/C++:** a later step, with its own quality test.
- **Web courses:** they hold no problems, so the API refuses them.
- **Library courses and sharing notes between campuses:** discussed on November 26 and set aside.
- **Multi-file problems, quizzes, manually graded problems and exam lectures:** the AI stays off for these, as today.

## 3. Who does what

| Role | What they can do |
| --- | --- |
| **Manager, Team Lead** (`curriculum.manage`, `exercises.manage`) | Create courses, choose AI included, add and edit problems, turn each problem's AI switch on, read, edit, hide and regenerate notes |
| **Teacher** (a tutor; `curriculum.review`, `submissions.assigned.review`) | Read the notes, and see the AI answers their own students got. Can't change courses, problems or notes. |
| **Student** | Press **AI help** when their code is wrong |

These are today's permissions, so nothing changes in `roles.ts`.

## 4. The course choice: "AI teacher"

### What the Manager sees

The **Add course** and **Edit course** window ([course-modal.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/_components/course-modal.tsx)) gets one more field below the language:

```
AI teacher
( ) Not included
( ) Included: students can ask the AI teacher for help on problems you choose
```

- **When it shows:** only when the academy has `AI_ASSISTANT` on **and** the language is **Python**. Otherwise it's hidden, and the course is saved as not included.
- **Default:** not included.
- **Language changes:** if the language moves away from Python, which is allowed only while the course has no problems, the choice resets to not included.

### What it does

**When the choice is "included":** it's a master switch, so it gates every problem in the course. It also shows each problem's AI switch in the problem editor.

**When it's switched to "not included":**
- AI help stops at once for every problem in the course;
- no new learning starts, and learning that's already running is discarded when it finishes;
- the notes are **kept**;
- switching back to "included" makes problems whose content hasn't changed ready immediately, and queues the others.

### Data

- **New column:** `courses.ai_teacher_enabled boolean NOT NULL DEFAULT false`.
- **Migration:** set it to `true` for Python courses that already have a problem with `ai_feedback_enabled = true`. Nothing that works today changes.
- **Copying and library sync:** a library update never changes the column (it is excluded in `library-sync/catalog-coverage.ts`), and a library course never has it on, because a library academy cannot have the AI teacher.

## 5. Problems: the AI switch and learning on save

### The switch

The existing **Enable AI feedback** switch ([basic-information.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/basic-information.tsx), `programming_exercises.ai_feedback_enabled`) stays, with these changes:

- **It shows only in AI courses.** In other courses it's hidden, and its saved value is kept.
- **It starts off on new problems.** That's already today's default, and spreadsheet import keeps blank means off.
- **When it's on but the AI can't learn the problem,** the AI panel on the problem page says why, in plain words. These are the conditions:
  - "needs at least one example test";
  - "needs automatic grading";
  - "the AI teacher does not work in exam lectures";
  - "multi-file problems are not supported yet".

### Learning starts on Create and Save

**Today:** learning is queued by a sweep that runs every minute. It waits until a problem has been left alone for 10 minutes, and runs only between 22:00 and 07:00.

**New:**

1. **Create problem** and **Save changes** (`createExercise`, `updateExercise`, and the import commit) queue the problem **in the same database transaction** when two things are true:
   - the problem is learnable;
   - its learnable content has changed, which the existing `digest` decides. Description, input and output format, conditions, solution, tests and extra solutions count. Title, points, time limit and hints don't.

   Queueing is one `INSERT … ON CONFLICT` into `ai_libraries`, with `state = 'WAITING'` and `next_attempt_at = now()`.
2. **Turning the course choice or a problem switch on** queues the same way.
3. **After the commit, the API wakes the learning job** (`LibraryJobService.kick()`), so it doesn't wait for its 60-second timer. Learning starts within about a second.
4. **Learning runs day or night:**
   - `AI_LIBRARY_HOURS` defaults to `0-24` (`withinHours` already treats it as all day);
   - `AI_LIBRARY_QUIET_MINUTES` defaults to `0`.

   The grader checks go to the practice queue, not the students' Submit queue, with at most 5 problems in the grader at once (`MAX_CHECKING`).
5. **Hidden courses and problems are learned too,** so the notes are ready before students see the problem. Learning stops requiring `is_visible`. AI help still needs the student to be able to open the problem.
6. **The one-minute sweep stays as a safety net,** for example after an API restart, but no longer waits 10 minutes.

**Saving again while the AI is learning:** the newest save wins. This is the existing rule, tested by "an edit while the model writes wins": the result for the old content is thrown away, and learning starts again with the new content. A paid call that was already under way is lost, at most about $0.0024.

**What the Manager sees:** the existing AI panel on the problem page shows *waiting → writing → checking → reviewing → ready* and refreshes itself every 30 seconds while learning. The "Waiting" text is now "Starts in a moment". The panel shows only in AI courses, and when a problem cannot be learned it says why (`blocked` in the API).

**How long:** one problem should be ready within a few minutes. Several problems are learned 5 at a time. This is an estimate, not measured on the server yet.

## 6. Students: the AI help button

### Where

It goes at the **end of the toolbar**, after Submit, in [editor-pane.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/editor-pane.tsx):

```
[↺ Reset] [Test run] [▷ Run] [➤ Submit] [✨ AI help]   Last submit score  Last submit datetime
```

- The label is **AI help** in English and **AI 도움** in Korean. On narrow screens only the icon shows.
- This toolbar button is the **only** way to ask. The "Analyze my code" card in the Submit result goes away, and the answer card (Result, Where, Why, Think, Try it) shows in the output area below.

### When it shows, and when it can be pressed

**When it shows:** only when AI can help on this problem. That means the academy feature is on, the course choice is "included", the problem's switch is on, and the problem is a learnable kind (§5). It also has to be a student's own work: not an exam, not staff practice. Otherwise it's hidden.

**When it can be pressed:** only when Cove knows the code is **wrong**. It goes by the latest Run, Test run or Submit.

| What the student just did | AI help |
| --- | --- |
| **Run** ended with a Python error | **On.** The error coach explains it first, free, as today. |
| **Run** with input equal to an example's input (after trimming spaces and line ends), and the output differs from that example | **On.** Cove also shows, free: "This is Example 2. Expected `30`, you printed `-10`." |
| **Run** with an example's input, on a problem whose examples the browser can't compare (`comparesSampleLocally` is false) | **On.** The server decides (see below). |
| **Run** with the student's own input that isn't an example | **Off**, with a tooltip: "Use an example's input, or press Test run." Cove can't know the right answer for that input. |
| **Test run** with at least one example failing | **On** |
| **Submit** not accepted | **On** |
| The latest result passed, or nothing has run yet | **Off**, with a tooltip: "AI help turns on when something is wrong." |
| A Run, Test run or Submit is still going | **Off** |
| A limit is reached, or the AI budget is used up | **Off**, with the limit message |

Editing the code doesn't switch the button off. The server checks the code the student has **now** (below).

**Run and Test run don't change and don't get slower.** Python still runs in the browser. Run, Test run and the button's on/off state send **no request** to the server or the AI. The browser decides everything from results it already has, including the free "This is Example N" message. Whether the button shows comes in the existing workspace bootstrap. The server and the AI do work only after the student presses **AI help**.

### What one press does

1. **Which code is checked.** If the editor still holds exactly the code of the latest failed Submit, Cove explains **that submission**. This is today's analysis: every test, with hidden tests as counts only. Otherwise Cove checks the **current code against the examples**.
2. **An example check runs on the server, never in the browser.** A student could change the browser's results, so Cove never trusts them. Cove runs the current code on **all example tests**, and only those, on the judge's sample queue. It uses the same evaluator and comparator as Test run checks on the server, and the same 10-second "busy" limit, which fails closed.
3. **If every example passes on the server:** "All examples pass. Press Submit to check the rest." This is free and doesn't count toward the limit.
4. **Otherwise the AI explains**, using only what the server saw:
   - the examples, with their inputs, expected outputs and the student's outputs;
   - any Python error;
   - the problem and the closest notes.

   The prompt says only the examples were run, so the AI never talks about hidden tests. All of today's text checks still apply: no code, no corrected expression, no hidden values, and the line it names must exist.
5. **Explain more simply, Ask your teacher and Report** work as today.

### Limits and reuse

- **One shared limit** covers Run, Test run and Submit: **5 per problem and 15 per day** for each student. The defaults move from 3 and 10, via `AI_ASSISTANT_PROBLEM_LIMIT` and `AI_ASSISTANT_DAILY_LIMIT`.
- "All examples pass", "busy" and repeated answers are free and don't count.
- **Same code again,** for the same student, problem, grading revision and kind (examples or submission): the saved answer comes back, free.

## 7. The AI learns every new mistake

**Before:** a problem grew one mistake only after 5 unmatched answers from 3 students within 30 days, at most once a week, and up to 10 mistakes.

**New:**

1. Each AI answer records which note it used, or none (`ai_help_replies.library_item_id IS NULL`). Answers from **Run, Test run and Submit** all count. Free messages ("All examples pass", "busy") aren't AI answers: they are not saved as answers and never start growth.
2. **A problem is ready to grow as soon as it has one unmatched answer** newer than its last growth (`ai_libraries.grown_at`), at the same grading revision. There's no student count and no weekly wait.
3. **The learning job handles it on its next pass,** within about a minute, day or night. All new unmatched answers for the problem go into one batch, up to 30.
4. **The growth prompt may now return up to 3 different new mistakes** from a batch, instead of 1. Each is checked separately:
   - the grader must prove its wrong program fails;
   - the correct solution must still pass;
   - the review must accept the text.
5. **The AI skips an answer when:**
   - it's really the same mistake as an existing note;
   - it isn't a logic mistake (the error coach covers those);
   - the grader can't prove it.

   So every new mistake is **checked**, and only proven ones are **saved**.
6. **Up to 30 mistakes per problem,** up from 10 (`FEEDBACK_MAX`). Analyze still sends the AI only the **5 notes closest** to the student's results (`HELP_LIBRARY_MAX`), so more notes don't make a press more expensive. When a problem is full, growth stops and the panel says: "Full: hide old notes to make room."
7. **Answers from Run and Test run only know the examples,** so they're matched against the notes using the **example tests only**: the notes' fingerprints restricted to example positions.
8. **The growth step reads only AI answers, never a student's code.** That's unchanged.
9. **Learned notes are marked as learned from students** (origin `GROWN`). Managers and Team Leads can edit or hide them, as today.

## 8. Technical design

### Data (one migration, all additive)

| Change | Why |
| --- | --- |
| `courses.ai_teacher_enabled boolean NOT NULL DEFAULT false`, plus the backfill in §4 | The course choice |
| New table `ai_help_checks` (see the list after this table) | The server's example check of the current code |
| `ai_help_replies.submission_id` becomes nullable; new `check_id uuid NULL` references `ai_help_checks ON DELETE CASCADE`; `CHECK (num_nonnulls(submission_id, check_id) = 1)` | An answer belongs to a submission **or** to an example check |
| New enum `AiHelpSource` (`SUBMIT`, `TEST_RUN`, `RUN`) and `ai_help_replies.source` (default `SUBMIT`) | Teachers see where an answer came from, and usage is counted per source |

`ai_help_checks` has these columns:
- `id`, `user_id`, `academy_id`, `class_id`, `material_id`;
- `grading_revision`, `source`;
- `code`, with the same size limit as a submission, and `code_hash`;
- `status`: `QUEUED`, `RUNNING`, `PASSED`, `FAILED` or `ERRORED`;
- `results jsonb`, per example: position, outcome, the student's output (trimmed to 1,000 characters), Python error type, line and message;
- `fingerprint`, over the examples;
- `created_at`, `finished_at`.

Rows are deleted with their answers, after `retentionDays`, by `AiMaintenanceService`.

### API

- **`learn.requestAiHelp`** keeps its current shape for Submit.
- **New `learn.requestAiHelpForCode`:**
  - takes `academyId`, `materialId`, `code`, `source` (`RUN` or `TEST_RUN`), `locale`, `requestId` and `mode`;
  - admits the check with the same access rules as a Test run check on the server (`SampleCheckService`);
  - waits up to the existing sample-check wait for the judge;
  - answers with the same `aiHelpResponseSchema` and adds `examplesPassed: boolean`.
- **The workspace bootstrap** keeps its `aiAssistant` flag, which now also needs the course switch and an ordinary (not exam) lecture. It is part of a statement the page already makes, so it costs nothing. The remaining counts come back with each answer, not with the page.
- **Statement budget (AGENTS.md), measured in the integration specs on November 26, 2026:**
  - AI help after Run or Test run: **12 statements** on the first press of some code (access, reach, one read, the class, the exercise in one read, the check, its result, the reservation and the answer, with BEGIN and COMMIT), **4** for the same code again.
  - AI help after Submit: unchanged, **3** to look and **8** to ask.
  - Saving a problem: **one more statement**, the queue, inside its existing transaction.

### Judge

The new job kind is `ai-help-check`, on the sample queue. It's like `LibraryCheckRunner`:
- it uses `GradingService.execute` with a sink that writes no submission, attempt, points or progress;
- its snapshot holds **only example cases**.

**Priority (new, required by learning during the day).** Production runs the judge with `JUDGE_CONCURRENCY=2`. `ExecutionCapacity` already keeps Submit first: official grading never waits, and background work can hold at most one slot. But today all background work waits in one line:
- Test run checks on the server (every C/C++ Test run);
- AI learning checks: each learned problem runs about 10 programs on every test;
- regrades.

If learning a course ran in class time, a student's Test run or AI help could wait behind hundreds of learning checks and hit the 10-second "busy" limit.

So `ExecutionCapacity` gets two lines for background work:
- **interactive:** Test run checks on the server and AI help checks. A student is waiting for these.
- **batch:** AI learning checks and regrades.

When the background slot frees up, the interactive line goes first. A student's check then waits for at most the **one** batch job already running, which normally takes under a second.

A wrong program that hangs on every test can hold the slot for up to the problem's time limit on each test. Learning checks therefore get their own overall cap of **10 seconds per program**. A program over the cap counts as "fails", which is still proof that it is wrong.

### Learning job

- **`kick()`** runs a pass right away, or after the running pass finishes.
- **`claimGrowth`** uses the new rule in §7, and `growSchema` allows up to 3 mistakes.
- **`FEEDBACK_MAX`** becomes 30.
- **Eligibility** adds `c.ai_teacher_enabled` and drops the visibility conditions. The help gate in `ai-help.service.ts` and `ai-help-read.ts` adds `c.ai_teacher_enabled`.

### Web

- The course modal field.
- The problem switch visibility.
- The toolbar button with the rules in §6.
- The free "This is Example N" message after Run. The browser keeps the lines the student typed during the Run.
- The Submit result card loses its Analyze button.
- The teacher's submission review shows, beside that attempt's answers, the student's last 10 answers after Run and Test run on the same problem, each labelled and with the checked code. A student who never submitted the problem has no review page yet, so a teacher does not see their Run answers.

### Settings

| Setting | Before | Now |
| --- | --- | --- |
| `AI_LIBRARY_HOURS` | `22-7` | `0-24` |
| `AI_LIBRARY_QUIET_MINUTES` | `10` | `0` |
| `AI_ASSISTANT_PROBLEM_LIMIT` | `3` | `5` |
| `AI_ASSISTANT_DAILY_LIMIT` | `10` | `15` |
| `FEEDBACK_MAX` (code) | 10 | 30 |

Production `secrets/api.env` may override these. Set them before the release tag.

## 9. Safety and failure

- **The browser is never trusted.** Every AI answer is based on a run on the server.
- **Speed of the rest of the platform:**
  - The re-run happens in the judge worker, not in the API or web server. The API only awaits it, so pages and other requests are not slowed.
  - Submit keeps its reserved slot and never waits for AI work.
  - Student-facing checks go before learning checks (§8, Priority).
  - An example check runs only the examples, usually 1–3 short runs, which is less than a Submit, and only when a student presses AI help. A press on a failed Submit reuses that submission and runs nothing.
- **Judge busy for more than 10 seconds:** "Cove is busy, try again in a moment". This is free.
- **The model fails or the text checks reject the answer:** the existing fallbacks apply.
- **The student's code and typed input are data.** The prompts already say to ignore instructions inside the student's code. That now covers the student's input too.
- **Budget:** at the monthly limit ($30 for help, $10 for learning) that kind of AI stops until the 1st. The error coach, the free example messages and grading keep working.
- **Rolling back to an older API:** no extra guard is needed. The AI teacher has never been released, so every API a rollback can reach predates it and never reads these tables. The deploy workflow already switches the AI off for such an API (`clear-ai-gates.sh`). If a version of the AI teacher ships before this one, add a guard then: older AI code reads `ai_help_replies.submission_id` as required.

## 10. Cost for this campus

The campus has 20 students, 5 courses and 500 problems. Prices are in Fast mode, measured November 25 on invented problems. The growth price is an estimate.

| | First month | Each month after |
| --- | --- | --- |
| Learning 250 to 500 problems, about $0.0024 each, up to 3× for repeated saves while writing | $0.60 to $3.60 | about $0.05 (edits) |
| AI help: 20 students, about 5 a school day at $0.00035 each | about $0.80 | about $0.80 |
| AI help if every student uses all 15 a day | $2.31 | $2.31 |
| Learning every new mistake: about $0.002 per batch, a few hundred batches | about $0.20 to $0.80 | about $0.20 to $0.80 |
| **Total, normal use** | **about $1.60 to $5.20** | **about $1 to $1.70** |

This is 1–5% of the $100 monthly OpenAI credit. The worst case after the first month is about $3.

## 11. Testing

**Integration** (disposable Docker PostgreSQL, `COVE_INTEGRATION_DATABASE_URL`):
- the course switch gates learning and help;
- create and save queue learning in the same transaction and wake the job;
- a save while learning wins;
- hidden problems are learned;
- an example check that passes is free, and one that fails gives an answer with its source;
- one shared limit, and repeated answers are reused;
- growth from a single unmatched answer, batched, with up to 3 mistakes and a cap of 30;
- the migration backfill;
- statement counts for saving, pressing and reading.

**Web unit tests:**
- the course field shows only for Python in an AI academy;
- the problem switch shows only in AI courses;
- every row of the button table in §6.

**Browser test:** extend `test-ai-assistant.sh`:
1. create an AI course and a problem, and turn AI on;
2. wait until ready;
3. as a student, Run with an example's input and a wrong program, then press AI help;
4. Test run, then AI help;
5. Submit, then AI help.

**Priority:** unit tests for `ExecutionCapacity`:
- an interactive job queued behind batch jobs takes the next free background slot;
- Submit still never waits;
- the 10-second cap on learning programs.

**Speed, measured before release** on a copy of the production setup (2 judge slots):
- the time of one example check on the server;
- how long a student's Test run and AI help wait while a 100-problem course is being learned.

**Quality:** before release, rerun the 20 English and 19 Korean evaluation with **example-only** evidence, as for Run and Test run answers.

## 12. Decisions (November 26, 2026)

| Question | Decision |
| --- | --- |
| Library courses and other campuses | Set aside. One campus, its own courses. |
| C/C++ | Later, with its own quality test. Python first. |
| Web courses | No AI: they have no problems |
| Course choice | Saved on the course; it's a master switch; default not included |
| Problem switch | Starts off; shown only in AI courses |
| Who sets it up | Managers and Team Leads. Teachers are tutors and read only. |
| When learning starts | Right after Create or Save, day or night, with no 10-minute wait |
| Learning from students | Every new mistake is checked; proven ones are saved; up to 30 per problem |
| AI help | One toolbar button after Submit, on only when the code is wrong, after Run, Test run or Submit |
| Run with the student's own input | Off: Cove can't know the right answer, and we don't run the solution to find it |
| Correct output | Only the examples' outputs, which the problem already shows |
| Limits | 5 per problem and 15 per day, shared by all three buttons |
| Grader fairness | Submit first (as today); then students' Test run and AI help checks; AI learning and regrades last |
