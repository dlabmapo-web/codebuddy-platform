# Cove AI teacher: what was built, how it works, and how to run it

**Built:** November 25, 2026, on branch `feat/cove-ai-learning-assistant`. **Released:** not yet. AI is off everywhere until an operator switches it on for an academy.

This is the one-page guide to the whole feature. Details live in four documents:

- [Analyze design](../superpowers/specs/2026-11-25-cove-ai-analysis-design.md): what students and teachers see (the current design)
- [First design](../superpowers/specs/2026-11-25-cove-ai-learning-assistant-design.md): goals, privacy and the library idea
- [Data, API and model](../superpowers/specs/2026-11-25-cove-ai-learning-assistant-data.md): tables, endpoints, prompts and checks
- [Plan](../superpowers/plans/2026-11-25-cove-ai-learning-assistant.md) and [checks and results](../qa/2026-11-25-cove-ai-learning-assistant.md)

## 1. In one paragraph

When a student's program fails, Cove first explains what it can **without AI**: the Python error coach and simple output rules. If the student wants more, one button, **Analyze my code**, asks an AI teacher. It reads the problem, the student's own code and the result of **every** test, and explains in words what happened, which line is wrong, why, and how to think about fixing it. It **never shows the corrected code**. The AI teacher knows each problem well because every night Cove writes, by itself, a **hint bank** and a **library of common mistakes** for each problem, and proves every mistake with Cove's real grader. Teachers write nothing, but can read and edit what the AI knows.

## 2. What each person sees

| Who | Where | What |
| --- | --- | --- |
| Student | Result panel after a failed **Submit** | The error coach and output rules at once (no AI). Then **Analyze my code** → a card with *Result*, *Where* (line number, the student's own line, **Show in editor**), *Why*, *Think*, *Try it*, sometimes *Also check*. One **Explain more simply**. **Ask your teacher**. **Report** |
| Student | Problem statement | Only hints a teacher wrote, as before. AI hints are **not** shown |
| Teacher | Student's attempt (class → student → submission) | **AI teacher on this attempt**: the same sections the student read, and whether the student reported it |
| Teacher / manager | Problem editor → **What the AI teacher knows about this problem** | The hint bank, the mistakes with the wrong program used to test each, dropped items and why, correct programs, and common mistakes of the last 30 days. **Edit**, **Hide**, **Write again** |
| Operator | `/admin/ai` | Switches, cost this month against each limit, libraries by state, last 7 days (answers, students, fallbacks, refusals, reports, p95 time), academies with AI on. Counts only, never a student's code or words |
| Operator | Admin → Features | The **AI assistant** switch per academy (managers cannot turn it on themselves) |

## 3. Workflow 1: the AI learns each problem, at night, by itself

Nobody presses anything. A job inside the Cove API wakes up every minute; it writes only between **22:00 and 07:00 Seoul time** (`AI_LIBRARY_HOURS`). It runs on the server, so a laptop can be closed.

```
New or changed problem (left alone for 10 minutes)
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

- **Which problems:** the academy's AI switch is on, the problem's **AI feedback** box is ticked, Python, automatic grading, at least one public example, visible, ordinary lecture.
- **Once per problem.** A library is written again only when the problem's text, tests or solution change (Cove compares a fingerprint of the content). The same problem in another course or academy gets a **copy, with no AI call**.
- **Speed:** about one minute per problem; at most 5 problems wait in the grader at once, so 100 problems are ready by about midnight.
- **Text checks before anything is kept:** size, language, links, code, an answer line from the solution, and code-like text inside a hint.

## 4. Workflow 2: a student asks for an analysis

```
Student presses "Analyze my code"
        │
        ▼
1. Cove checks: AI on? Python, automatic, not an exam? the student's own submission?
   limits left (3 per problem a day, 10 a day)? Nothing is spent otherwise.
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

- A second press on the same submission shows the saved answer, free. **Explain more simply** is allowed once.
- A refusal is saved as `REJECTED:<check>` (for example `REJECTED:NEW_CODE`) so the operator page and the evaluation can see which check fired. The refused text itself is never stored.

## 5. Workflow 3: the library grows from new student mistakes

When students make a mistake the library does not know, they still get a full analysis (step 3 explains from the code). Cove marks those answers **"matched no known mistake"**. At night, for a problem with **at least 5 such answers from at least 3 students in 30 days**:

1. The AI reads only those **AI answers** (never a student's code) and names the one mistake they share.
2. It writes it as a new mistake with a wrong program; Cove's grader proves it fails, the teacher's solution must still pass; the second review reads the text.
3. It is **added** as mistake *grown*, in that academy only. Old hints and mistakes are kept.

At most one new mistake per problem per week, and at most 10 mistakes per problem. Five students with five *different* new mistakes add nothing: there is nothing shared to learn.

Example: night 1 writes mistakes A–E for "Sum from 1 to N". In the morning, 5 students make A or B (recognised) and 5 print the total inside the loop (not recognised, still helped). Night 2 adds mistake F "prints inside the loop". On day 3 that mistake is recognised.

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
| Learning one problem (write + review) | about **$0.0012** | Once, and again only if the problem changes |
| One analysis | about **$0.0002** (measured; $0.0004 was the estimate) | Each press by a student |

| Example | Cost |
| --- | --- |
| 5 courses × 150 problems = 750 problems | about $0.90, once |
| 100 students × 3 analyses × 20 school days | about $1.20 a month |
| 500 students × 3 analyses × 20 school days | about $6 a month |

**Limits in Cove** (OpenAI shows no spend limit for this account): `AI_ASSISTANT_MONTHLY_BUDGET_USD` = $5 for analyses and `AI_LIBRARY_MONTHLY_BUDGET_USD` = $10 for libraries. At a limit that kind of AI stops until the 1st of next month (Seoul); the error coach, rules and grading keep working.

## 9. Settings (`packages/api/.env.local` locally, `secrets/api.env` in production)

| Setting | Default | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Server only |
| `AI_ASSISTANT_ENABLED` | `false` | Students' **Analyze my code** |
| `AI_LIBRARY_ENABLED` | `false` | Writing libraries at night (saved libraries are used either way) |
| `AI_ASSISTANT_MODEL`, `AI_LIBRARY_MODEL` | `gpt-6-luna` | Model names |
| `AI_ASSISTANT_EFFORT`, `AI_LIBRARY_EFFORT` | `none`, `low` | Reasoning effort |
| `AI_ASSISTANT_TIMEOUT_MS` | `8000` | Then a fixed message |
| `AI_ASSISTANT_PROBLEM_LIMIT`, `AI_ASSISTANT_DAILY_LIMIT` | `3`, `10` | Per student |
| `AI_ASSISTANT_CONCURRENCY` | `8` | Calls at once per API process |
| `AI_ASSISTANT_MONTHLY_BUDGET_USD`, `AI_LIBRARY_MONTHLY_BUDGET_USD` | `5`, `10` | Monthly limits |
| `AI_LIBRARY_HOURS` | `22-7` | Seoul hours for writing |
| `AI_LIBRARY_QUIET_MINUTES` | `10` | Wait after the last edit |
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

## 13. How it was tested (November 25, 2026)

| Test | Result |
| --- | --- |
| Unit and integration (disposable PostgreSQL) | 220 AI and grader, 1,773 web, 1,061 shared, 164 texts: all pass. Types and lint clean |
| Localhost browser test, stand-in model | 9 of 9 steps pass |
| Real model, invented problems | Libraries for 6 problems in about 6 minutes for $0.0074. Offline: 20 of 20 analyses passed every check. Live demo: 5 of 6 analyses shown, 2 recognised a known mistake by fingerprint, the vowels case explained capitals failing only in hidden tests without hidden data |

Problems found and fixed during testing: hidden outputs are never stored, so the grader now stores how they differed as one word; the new-code check refused good answers ("For N = 5"), so it now tells a description from a fix and every refusal names its check.

## 14. Not done yet

- **One refused answer in the live demo is unexplained** (`REJECTED:NEW_CODE` on "Sum from 1 to N"); 12 replays passed. The local playground now keeps the raw answer to find it next time.
- **Evaluation of prompt `v4`** with the new test set (patterns over many tests, hidden-only failures, two mistakes, with and without the library), and a **Korean-speaking teacher** scoring a sample.
- **Before real students:** academy and parents' consent, Korean privacy law, OpenAI's rules for minors, the account owner and key expiry recorded, someone reading reports each school day.
- A load test (30 analyses while 30 submissions are graded), and screen-reader and narrow-width checks.
- `programming-review.integration.spec.ts` expects 14 statements and measures 13; this was already so before this work.
