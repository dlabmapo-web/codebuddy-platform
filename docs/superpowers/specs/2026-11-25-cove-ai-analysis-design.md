# Cove AI teacher: one "Analyze" button

**Status:** agreed and built November 25, 2026 (branch `feat/cove-ai-learning-assistant`, not released). Results are in the [QA document](../../qa/2026-11-25-cove-ai-learning-assistant.md#7-results). It replaces the student-facing part of the [first design](2026-11-25-cove-ai-learning-assistant-design.md): the three small AI hint steps and the AI hints in the **Need help?** dialog. Everything else that is built stays (section 9).

## 1. What we want

A student's program fails. The student presses **one button**. An AI teacher reads the problem, the student's own code and **every test result**, and explains in words:

1. what happened,
2. which line is wrong,
3. why it is wrong,
4. how to think about fixing it.

It **never shows the corrected code** or the corrected expression. The student still writes the fix.

The hint bank and the mistake library stay, but students do not see them. They are what the AI teacher **knows about each problem**, like a real teacher who has seen many students make the same mistakes.

## 2. What we learned from Elice

Tried on November 25, 2026 in a D-LAB teacher account (`print(Hello)`, Run only). The student view may differ.

| | Elice (Helpy 3.0) | Cove (this design) |
| --- | --- | --- |
| Entry | After a Run error, a small popup: "Oops, I think I made an error in your code. Do you need help? Yes / It's okay" | After a failed Submit, one **Analyze my code** button in the result |
| What the AI reads | Problem, code, error | Problem, code, **all test results**, the problem's hint bank and verified mistakes |
| Answer | Explains the cause well, then **shows the corrected code** as a change and the expected output | Explains the cause, points to the line, asks one question. **No corrected code** |
| Many tests | Not seen | Groups the failures and explains the pattern (section 5) |
| After the answer | Free chat, thumbs up and down | **Explain more simply**, Report, Ask your teacher |
| Per-problem knowledge | None visible. Academies can add their own "agents" | Hint bank and mistake library, written by AI and tested by Cove's grader |

What we take from Elice: one obvious entry point, a warm offer at the moment of failure, a clear explanation of the cause in plain words. What we do differently: no answer code, and an explanation of the whole test result, not only the first error.

## 3. What the student sees

```
┌ Result ─────────────────────────────────────────────┐
│ ✗ Not accepted        3 of 15 tests passed          │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 🧑‍🏫 Want the AI teacher to look at your code?      │ │
│ │                         [ ✨ Analyze my code ]    │ │
│ └──────────────────────────────────────────────────┘ │
│  (test list, as today)                              │
└─────────────────────────────────────────────────────┘
                          ↓ one click, about 3 seconds
┌ AI teacher ─────────────────────────────── AI · can be wrong ┐
│ Result   You pass all 3 examples, but 12 hidden tests print │
│          a number that is too small.                        │
│ Where    Line 4 · if ch in "aeiou":            ← highlighted │
│ Why      This line only looks for small vowels. The problem  │
│          says capital letters count too, so capital vowels   │
│          are never counted.                                  │
│ Think    What happens to a capital A when it reaches line 4? │
│          How could your check notice both kinds of letters?  │
│ Try it   Type  Open the door  and count the vowels on paper. │
│          Does your program agree?                            │
│                                                             │
│ [Explain more simply]   [Ask your teacher]   Report         │
└─────────────────────────────────────────────────────────────┘
```

- The button appears only on a **failed Submit**: never on a pass, in an exam, in staff practice, or when AI is off.
- The **Python error coach** and the **output rules** stay. They show at once, with no AI, above the button. The separate **Explain my result** button goes away.
- **Where** highlights the line in the editor, but only while the code is still the code that was submitted.
- **Try it** uses an example from the problem or a new, invented input, never a hidden test.
- A second press on the same submission shows the same saved answer and costs nothing.
- **Explain more simply** gives the same analysis again in shorter, easier words. It counts as one analysis.
- After the daily limit: "You have used today's AI analyses for this problem. Try your idea, or ask your teacher."

**Removed for students:** the three small hint steps, and the AI hints in **Need help?**. Hints a teacher wrote in the problem stay exactly as they are.

**Run** keeps the Python error coach only. An analysis needs the graded result of every test, which only Submit has.

## 4. What the AI reads

| Sent to the model | Why |
| --- | --- |
| The problem as the student sees it: statement, input and output format, constraints | The analysis is "based on the problem description" |
| The student's code, with line numbers | To point to the line |
| The test result summary and details, following section 5 | To explain what happened across all tests |
| The **hint bank**: the problem's 5 hints, as "the teacher's path to a solution" | So "Think" leads toward the intended method, at the right level, in words |
| The **matched mistakes** from the library (section 5.4), with their verified explanations | So a known mistake is recognised and explained the way it was checked |

| Never sent | Why |
| --- | --- |
| A hidden test's input, expected output, printed output or error message | Hidden tests stay hidden. An error message can contain the input |
| A hidden test's staff label | Labels are for staff and may describe hidden data |
| The teacher's solution and the library's correct programs | Words only. They are kept on the server to catch a reply that leaks them |
| Names, ids, other students' work | Privacy |

## 5. Many test cases: "passed 3, failed 12"

Before asking the AI, the server turns the full test result into a short, safe summary. This is the part that makes the explanation good.

### 5.1 Group the failures

Each failed test gets one **kind**:

| Kind | Example |
| --- | --- |
| Error, with its type and the line **in the student's code** | `ValueError` on line 2 |
| Time limit, or memory limit | |
| Wrong output, with how it differs | printed nothing · extra lines · missing lines · only spaces differ · only capital letters differ · number written differently · number too small · number too big · different text |

The server already compares outputs this way for the free output rules, so the difference is computed by Cove, not guessed by the AI.

### 5.2 Public tests: full details

For up to 3 failed public tests: input, expected output and what the program printed. Also one passed public test, so the AI can compare what works with what does not.

### 5.3 Hidden tests: counts and kinds only

> 12 hidden tests failed: 12 printed a number that is too small. No errors. No time limits.

The AI can then reason the way a teacher does, from the problem and the code: "The problem says capital letters count too, and line 4 only checks small vowels." It never learns what the hidden inputs were.

### 5.4 The library recognises the mistake: fingerprints

When Cove tests the library, every known wrong program already runs on **every** test, hidden ones included. We start keeping each one's pass and fail pattern, its **fingerprint**, on the server:

```
Known mistake "counts only small vowels"   ✓✓✓✗✗✗✗✗✗✗✗✗✗✗✗
This student's submission                  ✓✓✓✗✗✗✗✗✗✗✗✗✗✗✗   → same fingerprint
```

When a student's fingerprint and public outputs match a known mistake, the server tells the AI only that it matches: "This student's results match the verified mistake 'counts only small vowels' on all 15 tests." It adds that mistake's checked explanation. The hidden data never leaves the server; only the word "match" does.

A close match (most failed tests the same) is marked as **likely**. No match means the AI explains from the code alone, as Elice does. A library is therefore never required, but it makes the answer surer and the same for every student who makes that mistake.

### 5.5 More than one mistake

The AI is asked to:

- find the cause of the **most** failures, and explain that one fully;
- name a second cause in one sentence, if there is one ("Also check what happens when the word is empty");
- never list more than two, and never invent a cause the tests do not show.

### 5.6 A mistake nobody made before

The library is a help, never a gate. When a student's mistake matches no known mistake:

1. **The analysis still works.** The AI reads the problem, the code and the test summary, and explains this student's own mistake, as Elice does with no library at all. It is told that nothing matched, so it does not force a known mistake onto the code. It is also told never to call a method wrong only because the library does not list it.
2. **The same checks apply:** no code, no hidden data, the line must exist.
3. **The library learns it.** Cove records that the answer matched nothing. When at least 5 answers from at least 3 students on one problem in 30 days matched nothing, Cove asks the AI for **one** new mistake. It reads only those AI answers, never a student's code. The new mistake must come with a wrong program that Cove's grader proves wrong, and must pass the same review. It then joins that academy's library as **grown**, and the next students who make it get the checked explanation. This is built (stage 10).
4. **Teachers see it.** The library panel shows "AI answers that matched no mistake: N", so a teacher can add or fix one.

**The hint bank works the same way for every student.** It is not a list of mistakes. It is the teacher's path to a solution, from general to specific, so it fits any mistake. A student who uses a **different but valid** method is not pushed onto the hint path: the AI is told to help the student finish their own method. A problem with no hint bank yet (new, or still being written) is analysed without one.

### 5.7 Worked example

Problem: "Read a sentence and print how many vowels it has. Capital letters count too." 3 public tests (all small letters) and 12 hidden tests.

```python
1 s = input()
2 count = 0
3 for ch in s:
4     if ch in "aeiou":
5         count += 1
6 print(count)
```

What the AI receives (shortened):

```
RESULT: passed 3 of 15. All 3 examples pass.
12 hidden tests failed: 12 printed a number that is too small. No errors.
PASSING EXAMPLE: input "banana" printed 3, expected 3.
MATCHED MISTAKE (all 15 tests): "counts only small vowels".
  Checked explanation: "Capital vowels are not counted. Which letters does your check look for?"
TEACHER'S PATH: 1. Look at each letter one by one. 2. Decide what makes a letter a vowel. …
```

What the student reads is the card in section 3.

## 6. The answer

The model returns fixed fields, which the card shows as sections: `result`, `line` (a line number or none), `why`, `think`, `tryIt`, `alsoCheck` (optional), `item` (the matched mistake it used, or none).

Rules for every field:

- Words only. Quoting the student's **own** line is allowed. New code, a corrected line or a corrected expression is not.
- Never a hidden input, expected output or printed output.
- Korean in natural, polite 해요 style; English in simple words; about 120 words in all.

Cove checks every answer before showing it, and shows a fixed message plus **Ask your teacher** when a check fails:

| Check | New? |
| --- | --- |
| Size, language, links, code fences | Built |
| A line of the teacher's solution or a correct program | Built |
| Code that is **not** in the student's code or the problem | New: the built code check, told what the student already sees |
| Any hidden test's input or expected output, word for word | New: the server knows them, the model does not |
| A line number that does not exist in the code | New: the line is dropped, the words stay |

## 7. Limits and cost

| Rule | Value | Why |
| --- | --- | --- |
| Analyses per submission | 1, plus **Explain more simply** once | Pressing again shows the saved answer, free |
| Per student, problem and day | 3 | The student should try their own idea between analyses |
| Per student and day | 10 | One student cannot use the month's money |
| All academies, per month | $5 for analyses, $10 for libraries, as built | A safe ceiling. Raise it with one setting |

**Price.** One analysis reads about 2,500 tokens (problem, code, all test results, 5 hints, up to 5 matched mistakes) and writes about 300. With Luna that is about **$0.0004**: $1 pays for about 2,500 analyses, and $5 for about 12,500 a month. This is an estimate; the small hints built before measured $0.00006 each, and an analysis reads more. It will be measured in the evaluation.

**Only clicks cost money, not problems.** The number of problems changes only the one-time library cost, about $0.0013 per problem (measured: 6 problems cost $0.0073). 500 problems cost about **$0.65 once**, and again only when a problem changes.

A month of 20 school days:

| Students | Analyses per student per school day | Analyses a month | Cost a month |
| --- | --- | --- | --- |
| 100 (pilot) | 1 | 2,000 | $0.80 |
| 100 (pilot) | 3 | 6,000 | $2.40 |
| 100 (pilot) | 10, every day (the limit) | 20,000 | $8, stopped at $5 on about day 13 |
| 500 (all students) | 3 | 30,000 | $12: raise the limit to $15 |

When a monthly limit is reached, AI analysis stops until the 1st of the next month (Seoul time). Students see "AI analysis is not available right now" and **Ask your teacher**. The error coach, the rules and grading keep working. The operator page shows this month's spending against each limit.

## 8. How the hint bank and the library teach the AI

| Part | Written by | Checked by | Used for |
| --- | --- | --- | --- |
| Hint bank (5 hints) | AI, overnight | Text checks and a second AI review, as built | The "Think" direction of every analysis of that problem |
| Mistake library (about 5) | AI, overnight | Cove's grader runs each wrong program on every test; the second AI review reads each explanation | Recognising a student's mistake by fingerprint, and explaining it as checked |
| Teacher edits | Teachers, in the **AI library** panel | Cove's grader, again | Correcting what the AI teacher knows about that problem |

The panel in the problem editor becomes **"What the AI teacher knows about this problem"**. Editing a mistake's explanation changes how the AI explains that mistake to every student. Hiding it stops the AI from using it. Later (phase 2), a teacher could add a mistake they keep seeing, with a wrong program, and Cove tests it like the others.

Students no longer see library items directly, so a weak item can only make one analysis less sure. It can never be shown as a hint on its own.

## 9. What changes in the built version

| Keep as built | Change | Remove for students |
| --- | --- | --- |
| Error coach after Submit; output rules | `requestAiHelp` becomes **analyze**: prompt `v4`, fixed answer fields | The 3-step hint ladder |
| Library writing, grader checks, second review, growth | The result summary of section 5, for every test | AI hints in **Need help?** |
| Staff library panel, common mistakes, operator page | A fingerprint on each library check and item, and matching | The separate **Explain my result** button |
| Limits, budgets, reports, teacher view of replies, cleanup, rollback guard | New answer checks in section 6 | |
| Switches: academy, exercise, server | Result card with sections and line highlight; teacher review shows the same sections | |

Data: a fingerprint column on `ai_library_checks` and `ai_library_items`, the answer's fields as JSON on `ai_help_replies`, and on `submission_cases` the grader's one-word difference for every wrong output (hidden tests too, never their output) plus, for a hidden test, a built-in error type and line. No new table. Opening a problem still costs no extra statement; an analysis stays within its 8-statement budget.

## 10. Evaluation before real students

The 20-mistake test showed that the model explains one error well. This design must also show that it explains **patterns**, so the test set changes:

| Set | What it checks |
| --- | --- |
| 20 programs that fail some tests and pass others, 10 to 15 tests each | Finds the right line and cause from a pattern |
| 10 programs that pass every example but fail hidden tests | Explains without hidden data |
| 10 programs with two mistakes | Names the main one first and the second one briefly |
| All of the above in Korean | Natural 해요 style |
| The same sets **with and without** the library | That the library really makes answers better. If it does not, we stop writing libraries and keep only the analysis |

A pass needs at least 18 of 20 right causes in each language, and zero answer code and zero hidden data in every reply. A Korean-speaking teacher scores a sample.

## 11. Decisions

Agreed November 25, 2026:

1. **No free chat after the analysis** for now. **Explain more simply** and **Ask your teacher** cover most needs, and a student cannot use them to ask for the answer.
2. **"Too small" and "too big" for hidden numbers are allowed.** A teacher would say this, and it gives no value away.
3. **No offer after a Run error** for now. Run keeps the error coach. An analysis needs the graded result of every test, which only Submit has.
4. **Words only:** the corrected code is never shown.
5. **The hint bank and library stay**, as what the AI teacher knows, and are no longer shown to students.
