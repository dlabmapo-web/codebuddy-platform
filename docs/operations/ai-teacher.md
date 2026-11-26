# Cove AI teacher: what was built, how it works, and how to run it

**Built:** November 25, 2026, on branch `feat/cove-ai-learning-assistant`; extended November 26, 2026 for one campus (AI courses, learning on save, AI help after Run, Test run and Submit: the [campus courses design](../superpowers/specs/2026-11-26-cove-ai-teacher-campus-courses-design.md)). **Released:** not yet. AI is off everywhere until an operator switches it on for an academy.

This is the one-page guide to the whole feature. Details live in four documents:

- [Analyze design](../superpowers/specs/2026-11-25-cove-ai-analysis-design.md): what students and teachers see (the current design)
- [First design](../superpowers/specs/2026-11-25-cove-ai-learning-assistant-design.md): goals, privacy and the library idea
- [Data, API and model](../superpowers/specs/2026-11-25-cove-ai-learning-assistant-data.md): tables, endpoints, prompts and checks
- [Plan](../superpowers/plans/2026-11-25-cove-ai-learning-assistant.md) and [checks and results](../qa/2026-11-25-cove-ai-learning-assistant.md)

## 1. In one paragraph

A Manager or Team Lead creates a Python course with **AI teacher: included**, and turns AI on for the problems that need it. Right after each such problem is created or saved, Cove writes, by itself, a **hint bank** and a **library of common mistakes** for it, and proves every mistake with Cove's real grader. When a student's code is wrong, Cove first explains what it can **without AI**: the Python error coach and simple output rules. If the student wants more, the **AI help** button at the end of the toolbar asks an AI teacher, after **Run**, **Test run** or **Submit**. The server re-runs the code first, never trusting the browser. The AI explains in words what happened, which line is wrong, why, and how to think about fixing it. It **never shows the corrected code**. Every new mistake students make is checked and, when the grader proves it, added to the problem's notes.

## 2. What each person sees

| Who | Where | What |
| --- | --- | --- |
| Student | Toolbar: **Reset · Test run · Run · Submit · ✨ AI help** | **AI help** shows only where AI is on for the problem, and can be pressed only after a Run that ended in an error or printed the wrong output for an example's input, a failed Test run, or a failed Submit. Run with an example's input also says, free: "This is Example 1. Expected 15, you printed 10." The answer card above the output has *Result*, *Where* (line, the student's own line, **Show in editor**), *Why*, *Think*, *Try it*, sometimes *Also check*, and is labelled *after Run / Test run / Submit*. One **Explain more simply**. **Ask your teacher**. **Report** |
| Student | Problem statement | Only hints a teacher wrote, as before. AI hints are **not** shown |
| Teacher | Student's attempt (class → student → submission) | **AI teacher on this attempt**: the same sections the student read, and whether the student reported it; below it, **AI help after Run and Test run on this problem**, with the code the server checked |
| Manager / Team Lead | Add course / Edit course | **AI teacher: Not included / Included**, only for Python courses at an academy with the AI assistant. Not included by default. A master switch: off stops help and learning for the whole course; notes are kept |
| Teacher / manager | Problem editor → **What the AI teacher knows about this problem** | The hint bank, the mistakes with the wrong program used to test each, dropped items and why, correct programs, and common mistakes of the last 30 days. **Edit**, **Hide**, **Write again** |
| Operator | `/admin/ai` | Switches, cost this month against each limit, libraries by state, last 7 days (answers, students, fallbacks, refusals, reports, p95 time), academies with AI on. Counts only, never a student's code or words |
| Operator | Admin → Features | The **AI assistant** switch per academy (managers cannot turn it on themselves) |

## 3. Workflow 1: the AI learns each problem right after it is saved

Nobody presses anything else. **Create problem** and **Save changes** queue the problem in the same database transaction, and wake the job inside the Cove API, which starts within about a second, day or night (`AI_LIBRARY_HOURS=0-24`). A sweep every minute catches problems changed by imports and other writers. It runs on the server, so a laptop can be closed. Students' Test run and AI help checks go before learning checks in the grader, and each wrong program runs for at most 10 seconds.

```
Problem created or saved (AI on for its course and for the problem)
        │
        ▼
1. WRITE    one AI call: 5 hints, about 7 common mistakes (each with a small
            wrong program), 3 correct programs
        │
        ▼
2. CHECK    Cove's real grader runs every program on every test, hidden ones too
            · a "wrong" program that passes is dropped
            · the teacher's solution must pass (if not: FAILED, "your own solution fails")
            · each mistake keeps its FINGERPRINT: which tests it fails, e.g. FFFP
        │
        ▼
3. REVIEW   a second AI call reads every text: true? easy? no answer given?
        │
        ▼
4. READY    saved in the database; used from the next analysis on
```

- **Which problems:** the academy's AI switch is on, the course includes the AI teacher, the problem's **AI teacher for this problem** switch is on (off by default), Python, one file, automatic grading, at least one public example, ordinary lecture. Hidden problems are learned too, so the notes are ready before students see them. The problem page says why when one cannot be learned.
- **Once per problem.** A library is written again only when the problem's text, tests or solution change (Cove compares a fingerprint of the content); a new title, points or time limit do not count. A save while the AI is learning wins: the old run is discarded. The same problem in another course or academy gets a **copy, with no AI call**.
- **Speed:** up to 5 problems are written, and 5 reviewed, at the same moment, in OpenAI's Fast mode (one write took about 5.6 s instead of 11.5 s). While work is under way the job looks again every 10 seconds instead of every minute. At most 5 problems wait in the grader at once, so the grader, not the model, sets the pace.
- **Text checks before anything is kept:** size, language, links, code, an answer line from the solution, and code-like text inside a hint.

## 4. Workflow 2: a student asks for an analysis

```
Student presses "AI help" (after Run, Test run or Submit)
        │
        ▼
1. Cove checks: AI on for the academy, the course and the problem? Python,
   automatic, not an exam? limits left (5 per problem a day, 15 a day, shared
   by the three buttons)? Nothing is spent otherwise.
   · after Submit, with that code still in the editor: that submission, every test
   · otherwise: the server runs the editor's code on the EXAMPLES ONLY, in the
     grader's interactive lane. All pass → "All examples pass. Press Submit to
     check the rest." (free, not counted). The same code again reuses the check.
        │
        ▼
2. Cove builds a short, safe summary of every test (the model never sees hidden data):
   · examples (public tests): input, expected, what was printed, how it differs
   · hidden tests: counts by kind only, e.g. "12 failed: 8 printed a number that is
     too small; 4 stopped with ValueError on line 2"
   · known mistakes: the server compares the student's fingerprint with each mistake's:
       mistake "counts only small vowels"   ✓✓✓✗✗✗✗✗✗✗✗✗✗✗✗
       this student                         ✓✓✓✗✗✗✗✗✗✗✗✗✗✗✗   → MATCHED
   · the teacher's path: the problem's hints
        │
        ▼
3. One AI call (Luna). Answer in fixed sections, words only.
        │
        ▼
4. Cove checks the answer before showing it:
   new code the student did not write · a hidden test's data · a solution line ·
   language · size · a line number that does not exist
   ok → shown and saved      refused → a fixed message and "Ask your teacher"
```

- A second press on the same submission, or on the same code after Run or Test run, shows the saved answer, free. **Explain more simply** is allowed once.
- After Run or Test run the model is told only the examples ran, and hears nothing about hidden tests.
- A refusal is saved as `REJECTED:<check>` (for example `REJECTED:NEW_CODE`) so the operator page and the evaluation can see which check fired. The refused text itself is never stored.

## 5. Workflow 3: the library grows from new student mistakes

When students make a mistake the library does not know, they still get a full analysis (step 3 explains from the code). Cove marks those answers **"matched no known mistake"**. **Every** such answer is learned from (since November 26, 2026), from Run, Test run and Submit alike, within about a minute:

1. The AI reads the answers since the problem last grew, up to 30, only **AI answers** (never a student's code), and returns up to 3 different new mistakes. It skips one that is already known, a typo or syntax error, or no clear mistake.
2. Each is written as a new mistake with a wrong program; Cove's grader proves it fails, the teacher's solution must still pass; the second review reads the text.
3. It is **added** as mistake *grown*, in that academy only. Old hints and mistakes are kept.

At most **30** mistakes per problem; an analysis still sends the model only the 5 closest. So every new mistake is checked, and only proven ones are saved.

Example: "Sum from 1 to N" has mistakes A–E. A student prints the total inside the loop (not recognised, still helped). About a minute later mistake F "prints inside the loop" is added, and the next student who makes it gets the proven explanation.

## 6. What is stored

| Table | What | Kept |
| --- | --- | --- |
| `ai_libraries` | One row per problem: state (WAITING, WRITING, CHECKING, REVIEWING, READY, FAILED), content fingerprint, correct programs, attempts, last error | With the problem |
| `ai_library_items` | Hints and mistakes, Korean and English, wrong program, public outputs, **fingerprint**, origin (AI, COPY, GROWN, STAFF), state | With the problem; dropped ones 30 days |
| `ai_library_checks` | One row per program run, verdict and fingerprint | 7 days |
| `ai_library_reports` | Which students reported which mistake (two students hide it) | With the item |
| `ai_help_replies` | Each analysis: sections (`analysis`), level, locale, cost, the mistake it used, report, or the reason it was refused | `AI_HELP_RETENTION_DAYS` (180) |
| `ai_usage_months` | Requests, tokens and cost per month, for help and for libraries | Always (no personal data) |
| `submission_cases` (new columns) | Python error type, message and line; for a **hidden** test only a built-in error type and line. How a wrong output differed, as one word (`too_small`, `nothing`, …), for every test. A hidden test's output is still never stored | With the submission |

Every new table has Row Level Security on and no grants to Supabase's public roles. A cleanup runs every 6 hours.

## 7. Safety and privacy

- **Never sent to the model:** hidden test inputs or outputs, a hidden test's staff label, students' names or ids, other students' work. While writing a library, the teacher's solution **is** sent (decided November 25, 2026); during an analysis it is not.
- `store: false` on every OpenAI call. The key lives only in the API process (`OPENAI_API_KEY`), never in the browser, a log or Git.
- **Words only:** a quote of the student's own code is allowed; new code, a corrected line or expression is refused. Descriptions such as "For N = 5" or "vowels in `"aeiou"`" are allowed.
- Students can report an answer; two reports on answers that used the same mistake hide that mistake until a teacher looks.
- **Known small risk:** a hidden test's built-in error type and line, and "too small/too big", reach the analysis as counts. A determined student could learn a few bits about hidden tests per analysis; the daily limits keep this small.
- **Rollback:** an older API cannot read the `AI_ASSISTANT` switch value. `deploy/scripts/rollback.sh` runs `clear-ai-gates.sh` first, which removes only those switch rows when the target image is older (tested in CI by `deploy/scripts/ai-gates.test.py`).

## 8. Cost

Measured with GPT-6 Luna on invented problems, November 25, 2026:

| What | Cost | When |
| --- | --- | --- |
| Learning one problem (write + review) | about **$0.0012**, **$0.0024** in Fast mode | Once, and again only if the problem changes |
| One analysis | about **$0.0002**, **$0.00035** in Fast mode | Each press by a student |

Fast mode (`AI_*_SERVICE_TIER=fast`, the default since November 26, 2026) costs twice the standard price. Cove counts it at twice the price, and counts a call OpenAI moved to the standard tier at the standard price.

| Example, in Fast mode | Cost |
| --- | --- |
| 5 courses × 150 problems = 750 problems | about $1.80, once |
| 100 students × 3 analyses × 22 school days | about $2.30 a month |
| 100 students, all using 10 analyses every school day | about $7.70 a month |
| 500 students × 3 analyses × 22 school days | about $12 a month |

**Limits in Cove** (OpenAI shows no spend limit for this account): `AI_ASSISTANT_MONTHLY_BUDGET_USD` = $30 for analyses and `AI_LIBRARY_MONTHLY_BUDGET_USD` = $10 for libraries (about 4,000 problems in Fast mode), $40 a month at most against the $100 monthly credit. At a limit that kind of AI stops until the 1st of next month (Seoul); the error coach, rules and grading keep working.

## 9. Settings (`packages/api/.env.local` locally, `secrets/api.env` in production)

| Setting | Default | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Server only |
| `AI_ASSISTANT_ENABLED` | `false` | Students' **AI help** |
| `AI_LIBRARY_ENABLED` | `false` | Writing libraries (saved libraries are used either way) |
| `AI_ASSISTANT_MODEL`, `AI_LIBRARY_MODEL` | `gpt-6-luna` | Model names |
| `AI_ASSISTANT_EFFORT`, `AI_LIBRARY_EFFORT` | `none`, `low` | Reasoning effort |
| `AI_ASSISTANT_SERVICE_TIER`, `AI_LIBRARY_SERVICE_TIER` | `fast`, `fast` | OpenAI's tier: `fast` is quicker at twice the price, `default` is standard |
| `AI_ASSISTANT_TIMEOUT_MS` | `8000` | Then a fixed message |
| `AI_ASSISTANT_PROBLEM_LIMIT`, `AI_ASSISTANT_DAILY_LIMIT` | `5`, `15` | Per student, shared by Run, Test run and Submit (were 3 and 10 before November 26, 2026) |
| `AI_ASSISTANT_CONCURRENCY` | `30` | Calls at once per API process |
| `AI_ASSISTANT_MONTHLY_BUDGET_USD`, `AI_LIBRARY_MONTHLY_BUDGET_USD` | `30`, `10` | Monthly limits |
| `AI_LIBRARY_HOURS` | `0-24` | Seoul hours for writing: all day since November 26, 2026 (was `22-7`) |
| `AI_LIBRARY_QUIET_MINUTES` | `0` | How long the sweep waits after an edit (the editor queues its own saves at once; was `10`) |
| `AI_LIBRARY_SEND_SOLUTIONS` | `true` | Send the teacher's solution while writing |
| `AI_HELP_RETENTION_DAYS` | `180` | How long answers are kept |

Release settings must be in place **before** the release tag.

## 10. Run it on localhost

Needs Docker. Uses its own database, never the shared Supabase databases.

```sh
# The automatic browser test: 9 steps, a local stand-in for the model, no OpenAI call
bash packages/api/scripts/test-ai-assistant.sh

# A playground to click through yourself (keeps running until --stop)
bash packages/api/scripts/test-ai-assistant.sh --playground              # stand-in model, 1 problem
bash packages/api/scripts/test-ai-assistant.sh --real-model --playground  # real model, 6 invented problems
bash packages/api/scripts/test-ai-assistant.sh --stop
```

The playground prints its accounts: `ai_manager`, `ai_teacher`, `ai_student`, `ai_student2` (Korean) and `ai_admin`, all with the password `LocalLegacyTest123!`, at http://127.0.0.1:3309/login. Libraries are ready about 6 minutes after start. `--real-model` reads the key from `packages/api/.env.local` inside the API process only, and caps each monthly limit at $1.

The integration tests need a disposable PostgreSQL in `COVE_INTEGRATION_DATABASE_URL`:

```sh
COVE_INTEGRATION_DATABASE_URL=postgresql://… pnpm --filter @cove/api exec vitest run src/ai-assistant
```

## 11. Turn it on in production

1. Release a version containing this branch, with `OPENAI_API_KEY` in `secrets/api.env`.
2. Set `AI_LIBRARY_ENABLED=true` first, and switch AI on for **one** academy (Admin → Features). Let the libraries be written at night; teachers read them in the problem editor.
3. When the conditions in [section 5 of the checks](../qa/2026-11-25-cove-ai-learning-assistant.md#5-before-real-students) are met, set `AI_ASSISTANT_ENABLED=true` and restart the API.
4. Watch `/admin/ai` for cost, fallbacks, refusals and reports.

**Turning it off:** the academy switch, or `AI_ASSISTANT_ENABLED=false` / `AI_LIBRARY_ENABLED=false` and a restart. Nothing needs migrating; the error coach and rules stay.

## 12. What changed in the code

| Area | Files |
| --- | --- |
| Database | `prisma/schema.prisma`; migrations `20261125100000_submission_case_python_error`, `20261125110000_ai_assistant_feature`, `20261125120000_ai_assistant` |
| Grader | `judge/python-error-fields.ts`, `judge/output-difference.ts`, `judge/grading.service.ts`, `judge/library-check.runner.ts`, `judge/judge.queue.ts`, `judge/judge.main.ts`, `judge/native-worker.ts`, `judge/practice.runner.ts` |
| AI teacher (API) | `src/ai-assistant/`: `ai-help.service.ts`, `ai-help-read.ts`, `help-prompt.ts` (prompt `v4`), `text-check.ts`, `fingerprint.ts`, `ai-model.ts` (OpenAI Responses API, `store: false`), `ai-settings.ts`, `usage.ts`, `ai-usage.service.ts`, `ai-maintenance.service.ts`; `library/` (job, prompt `lib-v1`, read, staff service) |
| Other API | `learn/` (workspace switch, routes, submission results), `teach/teacher-progress.*` (answers on the attempt, +1 statement there), `manage/academy-features.service.ts` (operator-only switch), `config/env.schema.ts`, oRPC router and context |
| Shared contracts | `content/ai-help.ts`, `content/output-rules.ts`, `content/statement-text.ts`, `content/python-error.ts`, `api/orpc/ai-assistant.contract.ts`, learn contract (`getAiHelp`, `requestAiHelp` with `mode`, `reportAiHelp`) |
| Web | Exercise workspace `learner-help.tsx`, `use-ai-help.ts`, `result-panel.tsx`; editor `ai-library-panel.tsx`; teacher `submission-review.tsx`; operator `/admin/ai`; feature settings; texts in `learning-help`, `ai-library`, `platform-ai` (Korean and English) |
| Tests and tools | Unit and integration specs beside the code; `e2e/specs/ai-assistant*.spec.ts`; `packages/api/scripts/test-ai-assistant.sh` and the local model stand-in in `dlab-e2e-server.mjs` |
| Deploy | `deploy/scripts/clear-ai-gates.sh`, its test, `rollback.sh`, CI |

**Statements per request** (`AGENTS.md` budget): opening a problem +0; `getAiHelp` 3; `requestAiHelp` 8; both the same with 1 and 100 earlier submissions; a teacher's submission review +1.

**November 26, 2026: the AI teacher for one campus** ([design](../superpowers/specs/2026-11-26-cove-ai-teacher-campus-courses-design.md))

| Area | Files |
| --- | --- |
| Database | migration `20261126100000_ai_teacher_courses_and_checks`: `courses.ai_teacher_enabled` (on for Python courses that already had an AI problem), `ai_help_checks`, `ai_help_replies.check_id` and `source`, one of submission or check |
| Courses | `content/course.service.ts` (the choice, the master switch, queueing on Create and Save), `ai-assistant/library/library-wake.ts`, `library-sync/catalog-coverage.ts` (never synced) |
| Learning | `library/library-read.ts` (eligibility with the course and without visibility, `queueLibraries`, `claimGrowth` for every new mistake, `FEEDBACK_MAX` 30), `library/library-job.service.ts` (wake, up to 5 growths a pass, 10-second cap on wrong programs), `library/library-prompt.ts` (`lib-v2`: up to 3 mistakes) |
| AI help on Run and Test run | `ai-help.service.ts` (`requestForCode`, one `explain` for every button), `ai-help-read.ts` (`readCheckHelpContext`), `help-prompt.ts` (`v5`: examples only), `judge/ai-help-check.runner.ts`, `judge/sample-check-snapshot.ts` (`examplesSnapshotFor`), `judge/execution-capacity.ts` (interactive before batch), `judge/judge.queue.ts`, `judge/judge.main.ts` |
| Teachers | `teach/teacher-progress.*` (`aiCodeReplies`, +1 statement in parallel), web `submission-review.tsx` |
| Web | course window `course-modal.tsx` and `use-courses-manager.ts`; problem editor `basic-information.tsx`, `ai-library-panel.tsx`; workspace `ai-help.tsx` (button, panel, the free example note), `use-ai-help.ts`, `workspace.tsx`, `editor-pane.tsx`, `lib/workspace/ai-help-target.ts`; texts in `courses`, `content`, `ai-library`, `learning-help` |

**Statements:** AI help after Run or Test run 12 on the first press of some code and 4 for the same code again; after Submit unchanged (3 and 8); a Save +1 (the queue, in its transaction).

## 13. How it was tested (November 25, 2026)

| Test | Result |
| --- | --- |
| Unit and integration (disposable PostgreSQL) | 220 AI and grader, 1,773 web, 1,061 shared, 164 texts: all pass. Types and lint clean |
| Localhost browser test, stand-in model | 9 of 9 steps pass |
| Real model, invented problems | Libraries for 6 problems in about 6 minutes for $0.0074. Offline: 20 of 20 analyses passed every check. Live demo: 5 of 6 analyses shown, 2 recognised a known mistake by fingerprint, the vowels case explained capitals failing only in hidden tests without hidden data |

**November 26, 2026 (the campus courses):** unit tests 1,941 API, 1,786 web and 1,061 shared, all pass; types and lint clean. Integration on a disposable PostgreSQL: the AI teacher 173 (new: the course switch, learning on Create and Save, Run and Test run help, growth from every new mistake, statement counts) and content, learn, grader, teach, library sync and explanations 1,068, all pass; the one known statement-count difference above was already in the committed code. The localhost browser test passes all 10 steps, including Run with an example's input, the free example message, AI help from the server's check of the examples, the same answer free after Test run, the button off for a student's own input, and the teacher seeing that answer with its code. **With the real model** (Luna, Fast mode, invented problem "Sum from 1 to N" and invented students; `test-ai-assistant.sh --real-model`, 3.5 minutes, about 10 calls, under one cent estimated): the problem was learned (5 hints, 5 proven mistakes, 2 dropped). Six answers, all shown, none refused, none with the fix or a hidden value: after **Run** with Example 1's input it explained the loop stopping before n from the examples only; after **Submit** it used every test, then explained more simply; in Korean after **Test run** it said 1 of 2 examples passed and 5 gave 120 instead of 15 (multiplying), which is right; a running-total mistake the library did not know was explained, and within about a minute the AI learned **two new proven mistakes** from the 4 unmatched answers ("prints running totals", "multiplies instead of adds"). Answers after Run and Test run never mentioned hidden tests. Results in `test-results/ai-assistant-real-model/`. Not yet: a larger scored evaluation, and speed on a copy of production.

Problems found and fixed during testing: hidden outputs are never stored, so the grader now stores how they differed as one word; the new-code check refused good answers ("For N = 5"), so it now tells a description from a fix and every refusal names its check.

## 14. The OpenAI account (checked November 25, 2026)

Read on platform.openai.com. Amounts change; check again before relying on them.

**Where the money comes from**

| | |
| --- | --- |
| Organization / project | "Personal" organization, project **`cove-ai-assistant`**. Only this project's key is used by Cove |
| Credit | A **credit grant from the linked ChatGPT Pro subscription** (the company pays for the subscription). The account shows "Free trial" and "ChatGPT subscription linked" |
| First grant | **$61.00**, received Nov 25, 2026, **expires Dec 13, 2026**. It covers only the days until the subscription renews |
| After that | A new grant each month when the subscription renews; about **$100 a month** was shown at setup. Unused credit **expires** and does not carry over. Confirm on **Billing → Credit grants** after Dec 13 |
| Payment method | **None.** When the credit runs out, OpenAI refuses further calls: Cove shows "AI not available" and grading, the error coach and rules continue. There is no bill beyond the credit |
| Used so far | **$0.06** for all testing on Nov 25 (252 requests, about 228,000 tokens): 12 problem libraries and dozens of analyses |
| Depends on | The subscription staying active and linked. Before many students rely on it, move to an OpenAI account owned by the company |

**Speed limits for `gpt-6-luna`** (Analytics → Rate limits → Models)

| Limit | Value | Peak while testing |
| --- | --- | --- |
| Tokens per minute | **2,000,000** | 0.1% |
| Requests per minute | **5,000** | 0.04% |
| Requests refused by OpenAI | – | 0 (Analytics → API errors: none) |

One analysis uses about 1,000–3,000 tokens, so a class of 30 pressing **Analyze** in the same minute uses about 1% of requests and 4% of tokens; even 500 students in one minute fit. OpenAI's limits are not the bottleneck.

**Cove's own limit is.** `AI_ASSISTANT_CONCURRENCY` (now `30`) is how many answers run at the same moment per API process; one more student in the same second sees "The AI teacher is busy". It makes no single answer faster; it lets more students be answered at once. Libraries are written and reviewed 5 problems at a time.

**Speed, measured November 26, 2026** (from Seoul, the `v4` and `lib-v1` prompts on an invented problem; OpenAI's dashboard: Analytics → Service health → Responses):

| Call | Standard tier | Fast mode |
| --- | --- | --- |
| One analysis (about 925 tokens in, 165 out) | 2.5 s (slowest 3.9 s) | **1.6 s** (slowest 2.1 s) |
| One library write (effort `low`, about 1,500 tokens out) | 11.5 s | **5.6 s** |
| Four library writes at the same moment | 12.4 s in all, as long as one | |

Tried and not worth it: streaming (first words about 0.7 s sooner with Fast mode, but every answer must be checked whole before a student sees it), `text.verbosity: "low"` (no shorter), and prompt caching (an analysis prompt is under OpenAI's 1,024-token minimum, so the dashboard's cache hit rate stays 0%). The Decisions API returns labels and scores, not explanations.

**Second lock, optional:** Analytics → Spend shows the project's limit as "Not set". Set a monthly limit (for example **$50**) and an email alert (for example at **$25**) under **Settings → Limits → Spend alerts**. Cove already stops itself at $30 (analyses) and $10 (libraries) a month.

**Where to look**

| Question | Page |
| --- | --- |
| How much credit is left, and when it expires | Billing → Overview, Billing → Credit grants |
| Requests and tokens | Analytics → Usage (tabs: API keys, Projects, Models) |
| Money spent, by project | Analytics → Spend |
| How close to the speed limits | Analytics → Rate limits |
| Refused or failed calls | Analytics → API errors |

**The key:** created in the `cove-ai-assistant` project. Locally it is `OPENAI_API_KEY` in `packages/api/.env.local` (ignored by Git); in production it goes in `secrets/api.env`. Never in `packages/web`, a `NEXT_PUBLIC_` variable, Git, a log or a chat. The key is named `cove-local-test` (ends `fKUA`), created November 25, 2026, permissions "All", and **expires February 23, 2027**: record who replaces it before then. Older OpenAI keys in `.env` and `packages/web/.env*` belong to a previous developer's account and must not be used.

## 15. Not done yet

- **One refused answer in the live demo is unexplained** (`REJECTED:NEW_CODE` on "Sum from 1 to N"); 12 replays passed. The local playground now keeps the raw answer to find it next time.
- **Evaluation of prompt `v4`** with the new test set (patterns over many tests, hidden-only failures, two mistakes, with and without the library), and a **Korean-speaking teacher** scoring a sample.
- **Before real students:** academy and parents' consent, Korean privacy law, OpenAI's rules for minors, the account owner and key expiry recorded, someone reading reports each school day.
- A load test (30 analyses while 30 submissions are graded), and screen-reader and narrow-width checks.
- `programming-review.integration.spec.ts` expects 14 statements and measures 13; this was already so before this work.
- **For the campus courses (November 26, 2026):**
  - a larger, scored evaluation of prompt `v5` (one real-model run passed on November 26) and of growth prompt `lib-v2` on real students' answers;
  - the speed of AI help after Run and Test run on a copy of production (2 grader slots), and how long a student waits while a 100-problem course is being learned;
  - set `AI_ASSISTANT_PROBLEM_LIMIT=5`, `AI_ASSISTANT_DAILY_LIMIT=15`, `AI_LIBRARY_HOURS=0-24` and `AI_LIBRARY_QUIET_MINUTES=0` in production `secrets/api.env` before the release tag, if it sets them;
  - a teacher sees a student's AI answers after Run and Test run only from a submission review, so not for a student who never submitted the problem;
  - C/C++ courses, with their own quality test.
