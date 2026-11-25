# Cove AI learning assistant: design

**Status:** built November 25, 2026 on branch `feat/cove-ai-learning-assistant`, not released. AI stays off until an operator switches it on for an academy. What is left is the pilot (stage 9 of the [plan](../plans/2026-11-25-cove-ai-learning-assistant.md)), which needs a Korean-speaking teacher, consent and a release.

**Being replaced for students:** the [Analyze design](2026-11-25-cove-ai-analysis-design.md) (proposal, November 25, 2026) replaces the three small AI hint steps and the AI hints in **Need help?** with one **Analyze my code** button. The hint bank and library stay, as what the AI teacher knows about each problem.

Read in this order:

1. This page: what we want and how it works.
2. [Data, API and model](2026-11-25-cove-ai-learning-assistant-data.md): what we store and send.
3. [Implementation plan](../plans/2026-11-25-cove-ai-learning-assistant.md): what to build, in order.
4. [Checks and pilot](../../qa/2026-11-25-cove-ai-learning-assistant.md): how we know it works.

## 1. The goal

When a student is stuck, Cove helps the way a good teacher does. It explains what happened, gives one small hint at a time, and never writes the answer. One problem can be solved in many ways, so the feedback fits the student's own method. Teachers do not have to write any of it.

| # | We succeed when | How we check |
| --- | --- | --- |
| G1 | Help is correct and easy to understand in Korean and English | A teacher passes at least 18 of 20 test replies in **each** language |
| G2 | Cove never gives the solution | No solution code in any hint or reply, in tests or in the pilot |
| G3 | Teachers write nothing | Every library item is written and tested automatically. Editing is optional |
| G4 | Different correct methods are respected | Every problem's library is tested with several correct programs |
| G5 | Help arrives quickly | Help without AI is immediate. AI answers, or a fallback appears, within 10 seconds |
| G6 | Grading is not affected | Same verdicts, and no extra SQL statement on submit or grading |
| G7 | Cost stays small | At most $5 a month for student help and $10 a month for writing libraries, enforced by Cove |
| G8 | Students' data is protected | No name or hidden test ever reaches the AI |

## 2. The product design

```text
 Problem bank ──────▶ AI reference data for each problem
 (exercises)          ├─ Hint bank: 5 step-by-step hints
                      └─ Feedback library: common mistakes
                                   │
 Student code + result ─────▶ AI engine (GPT-6 Luna)
                                   │
                                   ▼
                        Personalized feedback
```

| Part | In Cove |
| --- | --- |
| Problem bank | **Exists:** exercises |
| Hint bank | New: 5 hints per problem, **written by AI** |
| Feedback library | New: about 5 common mistakes per problem with feedback, **written by AI** |
| Student code and grading result | **Exists:** submissions |
| AI engine | New: GPT-6 Luna, through one replaceable adapter |
| Personalized feedback | New: up to 3 replies per problem per day |

**Why AI writes the library.** 500 problems with 5 hints and 5 feedback texts need 5,000 texts. At 3 minutes each, that is about 250 hours of teacher work.

**What makes it safe enough to automate.** Cove runs real programs through its own grader to test each item (section 5). Programs prove that code passes or fails. They do **not** prove that an explanation is good, so staff can edit or hide items, and the pilot includes a teacher's check.

## 3. One example, start to finish

**Problem:** read two numbers and print the bigger one.

**When the teacher saves it**, Cove writes and tests the library. The teacher adds nothing.

| Hint bank | Feedback library |
| --- | --- |
| 1. What two numbers does the program have? | Reversed `if`: "Check which number you print when `a < b`." |
| 2. How can you compare two numbers? | Text, not numbers: "What type does `input()` give?" |
| 3 to 5. Smaller and smaller steps | Three more common mistakes |

**Then three students try it:**

| Student | Submits | What happens |
| --- | --- | --- |
| Jun | A reversed `if`, prints 2 for `2`, `5` | Luna finds the matching item and adapts it: "With 2 and 5 you printed 2. Look at what you print when `a` is smaller." |
| Mina | `sorted([a, b])[0]` | No item matches. Luna writes feedback for **Mina's** method: "After sorting, which position holds the bigger number?" |
| Ali | `print(max(a, b))` | Passes. No feedback |

Jun and Mina can also open the hint bank at any time, free and without waiting.

## 4. Five kinds of help

| Order | Help | Calls AI when the student asks? | Status |
| --- | --- | --- | --- |
| 1 | **Error coach:** explains a Python error such as a missing bracket | No | **Exists** for Run and Test. Keep it. Stage 1 also shows it after Submit |
| 2 | **Rules:** recognize common output mistakes such as a wrong letter case | No | New, stage 2 |
| 3 | **Hint bank:** 5 saved hints about the problem | No, they are already written | New, stages 4–5 |
| 4 | **Personalized feedback:** up to 3 small hints about the student's own code | **Yes** | New, stages 6–7 |
| 5 | **Ask your teacher:** the existing help request | No | **Exists.** We link to it |

### 4.1 Error coach: keep it

The [error coach](../../../packages/web/src/app/%28studio%29/academy/%5BacademySlug%5D/learn/exercises/%5BmaterialId%5D/_components/error-coach-panel.tsx) explains Python errors with fixed, translated text. It is free, instant and predictable, and it uses no AI. We do not replace it.

Today it appears only after **Run** and **Test**. After **Submit**, Cove discards the Python error, so a student who submits `print(Hello)` sees only "Runtime error". Stage 1 saves the error for public tests and shows the same coach in the result.

### 4.2 Rules

A rule compares the expected and actual output of a failed **public** test, in the browser, with no request. The first rules are: no output, letter case, spacing, line breaks, number format, punctuation, missing lines, extra lines and extra text. Their exact conditions are in the [data document](2026-11-25-cove-ai-learning-assistant-data.md#2-rules-without-ai). If no rule clearly matches, Cove stays silent rather than guess.

On our 20 test mistakes, the coach covers 5, the rules cover 4, and 11 need personalized feedback.

### 4.3 Hint bank

- The five hints go from general to specific and never contain the answer.
- They use the existing hints dialog. If the teacher wrote hints, only the teacher's hints are shown. If not, the AI hints are shown with an **AI** label.
- They can be read before the first submission, without limit.
- Student and teacher receive the same hints, because the statement must be the same height on both screens for the shared pointer.

### 4.4 Personalized feedback

It is available only when **all** of these are true:

- the server setting is on, and the academy's `AI_ASSISTANT` switch is on;
- the exercise has AI feedback on (`aiFeedbackEnabled`, which exists);
- it is an automatically graded, non-quiz Python exercise in an ordinary lecture;
- the submission is the student's own final **failure** on the current version of the problem;
- the student has no exam in progress.

Luna receives the problem, the student's code, one failed public test and the problem's feedback library. It picks the item that fits and adapts it, or writes new feedback when none fits. It works even when a problem has no library yet.

| Reply | Purpose | Example |
| --- | --- | --- |
| 1 | Where to look | "Look at what you print when `a` is smaller." |
| 2 | What to think about | "If `a < b` is true, which number is bigger?" |
| 3 | The next step, in words | "In that branch, print the bigger number instead." |

**Limits:** 3 replies per problem per day, and 10 per student per day. A day starts at midnight in Seoul. A fallback message does not count.

**When AI cannot answer** (off, too slow, over budget or an unsafe reply), the student sees a short fixed message and **Ask your teacher**. Submitting and grading keep working.

### 4.5 Ask your teacher

After the third reply, and beside every fallback, Cove shows the existing help request. If the class has no teacher assigned, the existing message says so.

## 5. How the library is written and tested

```text
Teacher saves a problem with AI feedback on
        ↓  (Cove waits until editing stops)
AI writes: 5 hints · 7 common mistakes, each with a wrong program · 3 correct programs
        ↓
Cove runs every program in the grader
   wrong program must FAIL · correct program must PASS
        ↓
Cove checks every text: size, language, no answer, no code
        ↓
A second AI request reviews each text against the test result
        ↓
Good items become active. Bad items are dropped.
```

- **Many methods.** The correct programs use different methods, such as `if`, `max()` and sorting. They must all pass. If the teacher's own solution fails its tests, staff are told.
- **Not enough good items.** The problem simply has no library yet. Students still get the coach, rules and personalized feedback.
- **The problem changes.** Cove writes the library again. Items that staff edited are kept.
- **The same problem in another academy.** Cove copies the tested library without calling AI.
- **Two languages.** Every item has Korean and English text.

**Growing the library (stage 10).** When several students get feedback that matched no item, AI drafts a new item from those AI replies. It never uses a student's code. The draft passes the same tests before it joins.

**Staff control is optional.** Staff can edit, hide or restore any item, and ask Cove to write the library again. An item reported by two different students is hidden until staff look at it.

## 6. What the student sees

```text
┌────────────────────────────────────────────┐
│ Wrong answer            Score 0 / 100       │
│ Case 1   expected 5     your output 2       │
├────────────────────────────────────────────┤
│ [Explain my result]                         │
│                                             │
│ AI  With 2 and 5 your program printed 2,    │
│     but 5 was expected. Look at what you    │
│     print when a is smaller.                │
│     Written by AI. It can be wrong. [Report]│
│                                             │
│ [More help (2 left)]     [Ask your teacher] │
└────────────────────────────────────────────┘
```

- A Python error opens the coach by itself, as it does after Run.
- **Explain my result** shows a matching rule at once. If none matches and AI is available, it offers personalized feedback. Opening it never spends a reply.
- Every AI text says it was written by AI and can be reported.
- Everything works with a keyboard and a screen reader, in Korean and English.
- Today's replies for the problem return when the student reopens the help.
- Nothing appears on a passed submission, a judge error, a quiz, a manual review or an exam.

## 7. What teachers and operators see

- **Operators** switch AI on for one academy at a time. Academy managers cannot, because Cove pays for it.
- **Teachers** choose the exercises, using the existing AI feedback checkbox, and can read the replies their students received.
- **Staff who may edit a course** see each problem's library and its state.
- **Common mistakes:** staff see the most frequent mistakes of a problem, counted from saved submissions.
- **Operators** see usage, cost, failures and reports.

## 8. Privacy and safety

| When | Sent to the AI | Never sent |
| --- | --- | --- |
| **A student asks** | Problem text, the submitted code, one failed **public** test, the feedback library, earlier replies today | Name, account, class, academy, hidden tests, teacher solutions, other students' work |
| **The library is written** | Problem text, public tests and the teacher's solution | Any student data, hidden tests |

- Requests tell OpenAI not to store the response (`store: false`). OpenAI's abuse monitoring can still keep data for up to 30 days unless zero data retention is approved.
- Data sharing for training stays off. We do not fine-tune. The model does not remember earlier students; Cove's saved library is what improves.
- Student code is treated as data. Instructions written inside it are ignored.
- The server checks every text before showing it. Programs written by AI run only in the existing grading sandbox.

Students may be children, and code can contain personal details they typed themselves. Before real students use personalized feedback, we need the academy's and parents' consent, a check of Korean privacy law, and OpenAI's rules for minors. For children under 13, OpenAI requires zero data retention before processing their personal data. These are release conditions in the [pilot checks](../../qa/2026-11-25-cove-ai-learning-assistant.md#5-before-real-students). The library itself uses no student data.

## 9. Model and cost

**Model:** GPT-6 Luna for students. The library uses Luna too, because it passed the first [library test](../../qa/2026-11-25-cove-ai-learning-assistant.md#24-library-evaluation). Both are settings.

On November 25, 2026, the same 20 fake mistakes were run once per language, **without a library**, with the same short prompt:

| Model | English | Korean | Typical time |
| --- | --- | --- | --- |
| **GPT-6 Luna** | **20 / 20** | **19 / 20** | about 2.2 s |
| Qwen3.5-4B on a Mac | 16 / 20 | 9 / 20 | about 2.7 s |

Claude scored these replies. A Korean-speaking teacher has not checked them. Replies 2 and 3 are **not tested yet**.

**Library test, November 25, 2026,** with 10 invented, easy problems and Luna:

| Measure | Result |
| --- | --- |
| Problems that became `READY` with no teacher work | 10 of 10 |
| Items kept after all checks | 50 of 50 hints, 66 of 70 feedback items |
| Correct programs that passed, with different methods | 30 of 30 |
| Bad items planted on purpose that were caught | 49 of 50 |
| Replies using the library, judged correct and safe | 10 of 10 English, 9 of 10 Korean |
| Cost | $0.0013 per problem, $0.00008 per reply |

Real problems are longer and harder, so treat this as a good first sign, not as proof.

**Cost estimate: 5 courses × 100 problems, 100 students.** Prices are OpenAI's list prices on November 25, 2026, per million tokens: Luna $0.10 in and $0.50 out, Terra $1 in and $5 out. Tax is extra.

| What | How often | Luna | Terra |
| --- | --- | --- | --- |
| Write and test the library for 500 problems | Once | **about $1 to $3** | about $27 |
| Personalized feedback, normal (3,600 a month) | Monthly | **about $0.70** | about $7 |
| Personalized feedback, maximum (12,000 a month) | Monthly | **about $2.40** | about $24 |
| Growing the library (50 items) | Monthly | about $0.10 | about $1 |
| Coach, rules, reading hints | – | $0 | $0 |

| Total with Luna | Normal | Maximum |
| --- | --- | --- |
| First month | **about $2 to $4** | **about $3.50 to $6** |
| Each later month | **about $1** | **about $3** |

The test measured 2,100 tokens in and 2,200 out per problem ($0.66 for 500) and 535 in and 54 out per reply. The upper amounts assume longer real problems and retries: 3,000 in and 10,000 out per problem, and 1,500 in and 100 out per reply. Students study 12 days a month and ask 3 (normal) or 10 (maximum) times a day. Writing the 500 libraries also runs about 20,000 short test runs on our own grader, outside class hours.

**Funding risk:** the current OpenAI project uses free credits that come with a ChatGPT Pro subscription and expire every month. They cover these amounts. If that subscription ends, writing libraries and personalized feedback stop, while saved hints keep working. Use a company OpenAI account before relying on it beyond the pilot.

## 10. What we are not building, and why

| Not building | Why |
| --- | --- |
| Teachers writing hints and feedback | Too much work. AI writes, Cove tests, staff may edit |
| A second record of every mistake | `Submission` and its cases already keep it permanently |
| Fine-tuning | The model does well without it, it needs many checked examples and consent, and OpenAI has closed it to new users |
| A document search system | Each problem's library is small enough to send whole |
| Personalized feedback before the first submission | There is no failed test to explain. The hint bank covers this |
| A model on our AWS server | Memory limits there already total about 15.3 of 15.6 GiB, and grading needs the CPU |

## 11. Decisions

| Decision | Choice |
| --- | --- |
| Who writes hints and feedback | AI. Staff may edit or hide |
| Order of help | Coach, rules, then personalized feedback. Hint bank and teacher at any time |
| Existing syntax-error coach | Keep it, without AI |
| Limits | 3 replies per problem per day and 10 per day for each student. Hint bank unlimited |
| First language | Python. Rules also work for C and C++ output |
| Pilot | One academy, 5 courses, about 500 problems and 100 students |
| Who switches AI on | Operators, per academy |
| API key | The existing key, in `OPENAI_API_KEY`, on the API server only |
| Teacher's solution while writing a library | **Yes**, decided November 25, 2026. Never during student help |

**Still open:**

1. Who pays after the pilot?
2. How long to keep AI replies (proposed: 180 days)?
3. Who signs the consent form?
