# Course language: one language per course

Date: 2026-11-10. Status: approved 2026-11-10. Branch `feat/c-cpp-execution`.

This changes how a language is chosen in
[C and C++ exercises on the native grader](2026-11-09-c-cpp-execution-design.md).
That spec put a language picker on every exercise and enabled C and C++ academy
by academy. Here:
- the **course** has the language, and every coding exercise in it uses that
  language;
- every academy can use Python, C and C++, with no per-academy switch.

Compiling, running and grading C and C++ are unchanged.

## 1. Decisions (owner, 2026-11-10)

| Question | Decision |
| --- | --- |
| Where the language is chosen | When a course is created, in the library and in an academy. |
| What follows it | Every coding exercise in the course: starter code, solutions, test cases, Run, Test and Submit. |
| Course languages (revised 2026-11-11, §10) | **Python** or **C / C++**. A C/C++ course mixes the two: each problem chooses C or C++. |
| Can students switch language? | No. The editor has no language selector. It shows the language as a label. |
| Which academies offer C and C++ | All of them. No per-academy switch. |
| Existing courses | Python, and they stay Python. |
| Changing a course's language later | Allowed only while the course has no problems. Once it has one, the language is locked. |

Why it's locked: a course's starter code, solutions and test cases are written
for its language. Switching a course that has content would leave hundreds of
problems in the wrong language.

## 2. Behaviour

### 2.1 Library courses (platform admins)

- **New library course** gains a **Programming language** choice: Python, C or
  C++. Default Python.
- The library's course list shows each course's language.
- **Importing an academy course into the library** keeps that course's
  language.

### 2.2 Academy courses (authors)

- **New course** gains the same **Programming language** choice, in every
  academy.
- **Course settings** show the language. It can be changed only while the
  course has no problems. After that the field is read-only, with the note
  "The language is fixed once the course has problems."
- **Copying from the library** (adoption) keeps the library course's language.
  The library browser shows each course's language.

### 2.3 Exercises

- The exercise editor loses its language picker. It shows the course's
  language as a label.
- A new coding exercise takes the course's language:
  - **C or C++:** the language's starter template, weighted grading
    (`ELICE_STDIO`, the default weighted profile) and no input-prompt setting,
    exactly as choosing C or C++ does today.
  - **Python:** as today.
- Quiz-style problems have no code. They are unaffected and stay `PYTHON`
  internally, as the quiz schema already requires.
- **Spreadsheet import** into a course creates its new problems in the
  course's language. In a C or C++ course they get the weighted profile, and a
  blank starter becomes the language's template. Problems the import updates
  keep their language.
- Turtle exercises and code-file written responses stay Python. The course
  language governs coding exercises only.

### 2.4 Students and teachers

Unchanged from the C/C++ spec. The workspace opens in the exercise's language
with Run, Test and Submit. Results, history, the teacher's review and the live
view work as already built and tested.

## 3. Rules the API enforces

1. **Create.** `language` is optional on create and defaults to `PYTHON`. Every
   academy and the library accept all three.
2. **Change.** A changed `language` on course update is refused with
   `CONTENT_VALIDATION_FAILED` when the course has a problem: a
   programming-exercise material, quiz-style included. Turtle exercises and
   other materials do not lock it. Quiz-style problems count because the
   course list and the course tree can both count them from the material type
   alone, so the number a form reads and the number the API checks are one
   number, at no extra statement.
3. **Exercises follow the course.** Create, update and import never take a
   language from the client. Create and import copy the course's language;
   update keeps the exercise's stored language. The exercise `language` field
   is removed from the authoring input.

No new error codes. The Korean `errors` catalog is at its size budget, and
the UI never offers a refused action.

## 4. No per-academy switch

- The `C_CPP_EXERCISES` rollout feature no longer gates anything:
  - authoring, Run checks, Test and Submit stop checking it;
  - it leaves the shared feature list and the console's feature board.
- Its PostgreSQL enum value stays. PostgreSQL cannot drop an enum value
  safely, and an unused value is harmless. Feature rows already stored with it
  are ignored when features are read.
- Production's native eligibility (`compose.production.yml`) lists
  `PYTHON`, `C` and `CPP` and the `run` kind for every academy. Once a release
  carrying this is deployed, C and C++ run everywhere.
- The release gates of the C/C++ spec still apply **before deploying**:
  - amd64 qualification on the production host;
  - the production migration;
  - the §8 capacity gates.

  If GCC fails its readiness self-test on the node, the node withdraws GCC
  only. C and C++ then answer "temporarily unavailable", and Python keeps
  grading.
- Emergency controls stay:
  - removing `C` and `CPP` from the eligibility turns them off everywhere;
  - `docker stop` on the native node stops all native execution, as before.

## 5. Data

- New column `courses.language`, type `ExerciseLanguage`, `NOT NULL DEFAULT
  'PYTHON'`. It is added by a **new** migration. `20261110090000_c_cpp_exercises`
  is already applied to the development database, and an applied migration is
  never edited.
- **Backfill:** a course with C or C++ coding exercises takes the compiled
  language most of them use; every other course stays Python. Production has
  none. Development has one: the "C and C++ Practice" course that
  `start-development-c-cpp.mjs` seeds, with one C and two C++ exercises. It
  becomes a C++ course whose C exercise keeps running as C, because each
  exercise's stored language still decides how it runs. That script changes to
  seed one C course and one C++ course; the old mixed course can then be
  deleted.
- `programming_exercises.language` stays. It is the per-exercise copy that
  admission, grading, Run, Test and every read path already use, and it now
  only ever comes from the course. Keeping it means no read path changes and
  no page gains a statement.
- The copy paths also copy `courses.language`:
  - adoption (`academy-library.service.ts`);
  - library import (`platform-library-import.service.ts`);
  - `course-tree-copy.ts`, which already copies each exercise's language.

## 6. Changes by package

**`packages/shared`**

- `createCourseSchema`, `updateCourseSchema` and `createLibraryCourseSchema`
  gain an optional `language`.
- The course summary, library course and exercise authoring context schemas
  gain `language`.
- The exercise authoring input loses `language`.
- `C_CPP_EXERCISES` leaves the academy feature list.

**`packages/api`**

- Course create and update: the rules in §3.
- `lockCourse` returns the course's language, so exercise create reads it in
  the statement it already runs.
- Exercise create and content import copy the course's language. Exercise
  update ignores language.
- Library course create, adoption and library import: language set and
  copied as in §5.
- `requireCompiledLanguages` and every `C_CPP_EXERCISES` check are removed.

**`packages/web`**

- A language select (`components/studio/course-language-field.tsx`) in:
  - the academy's course form, for creating and editing. It locks from
    `content.problems`, which the course list counts in its existing count
    query and a course tree counts the same way;
  - the platform admin's library course modal, for creating and editing. A
    library row counts every material, so it locks at the first material: a
    little earlier than the API, never later;
  - the admin console's cross-academy content modal, for creating only.
    Changes go through the academy's own course form.
- A language label in course lists and the library browser.
- The exercise editor shows the course's language instead of the picker.
  Templates and grading defaults come from it.
- The feature board loses the C and C++ switch.

**`packages/i18n`**

- Korean and English strings for the select, the label and the locked note,
  in the existing page namespaces.
- The feature board's C/C++ strings are removed.

**`deploy`**

- `compose.production.yml`: the eligibility of §4.
- `docs/operations/c-cpp-exercises.md`: enabling becomes deploying; the
  per-academy steps go.
- `packages/api/scripts/start-development-c-cpp.mjs` seeds one C course and
  one C++ course, sets `courses.language`, and no longer writes a
  `C_CPP_EXERCISES` row.

## 7. Database reads

- **Course create, adoption and library import:** one more column in rows
  they already write. No new statement.
- **Course update with a changed language:** the course lock and one count of
  its problems, run only when the language changes. Measured: 14
  statements, against 13 for a rename (whose title check costs one).
- **Exercise create:** the language comes from the existing `lockCourse` row,
  and the feature-flag read is gone: one statement fewer for C/C++. Measured:
  22 statements.
- **Course lists and the library list:** one more selected column; the
  academy list's count query gains one counted column, in the same
  statement.
- **Student and teacher pages:** unchanged.

## 8. Testing

- API unit:
  - create with each language, in an academy and in the library;
  - a language change refused once a problem exists, quiz-style included, and
    allowed while the course is empty;
  - an exercise created in a C course is C with the weighted profile, whatever
    the client sends;
  - adoption keeps the language;
  - a spreadsheet import into a C++ course creates C++ problems;
  - Run, Test and Submit admit C/C++ with no feature row.
- Integration on a disposable PostgreSQL: the migration and its backfill, and
  statement counts for course update and exercise create.
- Web:
  - the course forms;
  - the exercise editor label and template;
  - the feature board without C/C++.
- Deployment validation: the production eligibility parses and lists the
  three languages.
- Browser acceptance (`test-c-cpp-local.sh`): create a C course and a C++
  course, add a problem to each, then Run, Test and Submit as a student.

## 9. Out of scope

- A student language selector, and one problem offered in several languages.
- Changing the language of a course that has problems. To offer a
  course in another language, create a new course in that language.
- Per-language starter code within one exercise.
- C or C++ for Turtle exercises and code-file written responses.

## 10. Revision 2026-11-11: Python or C/C++

After trying the first version on localhost, the owner asked for three changes.

### 10.1 C and C++ share one course language

Some courses mix C and C++, so a course is **Python** or **C / C++**:

- `CourseLanguage { PYTHON, C_CPP }` replaces the three-valued course
  language. Migration `20261111090000_course_language_family` converts
  `courses.language` in place: C and CPP become `C_CPP`, everything else
  `PYTHON`.
- In a C/C++ course each coding problem chooses **C or C++**; it starts in C.
  The exercise editor shows a C / C++ toggle there and nowhere else. Switching
  a problem between them swaps an untouched template and is a grading change
  (a new grading revision), as any change of program is.
- The exercise authoring input carries `language` again. The server checks it
  against the course: Python in a Python course; C or C++ in a C/C++ course;
  anything else is `EXERCISE_VALIDATION_FAILED`. Quiz-style problems stay
  Python. The spreadsheet import gives a C/C++ course's new problems C.
- The lock is unchanged: the course language is fixed once it holds a problem.
- The course forms (academy, library, admin console) use a card selector, a
  radio group of two cards with a coloured mark, title and one-line
  description, instead of a dropdown. Course lists show a coloured
  "Python" or "C / C++" badge.

### 10.2 Run and Test run in staff practice

Staff practice now has **Run** (with Program input) and **Test run** for C and
C++, as students have:

- `learn.startPracticeSampleCheck` and `learn.startPracticeRunCheck` start the
  same sample-check records with no class. They are authorized as staff
  practice Submit is (`staffPracticeMaterial`): a membership with
  `practice.own.create`, and `curriculum.review` for an unpublished preview,
  which runs in the `preview` native context.
- A practice record is marked `practice: true`; reading it back
  (`getSampleCheck`, `cancelSampleCheck`) uses the staff practice material
  rule, so a preview's check reads back too. It is never a submission.
- Admission is **8 statements**: the student Run's 11 less its class context.
- Python staff practice keeps running in the browser.

### 10.3 The language is easy to see

The editor header's language label is a coloured, bold tag: Python blue, C
teal, C++ violet. It appears in the student and staff workspaces, authoring,
the live view and history. The colours are theme tokens (`--lang-*`), with
`-on-editor` shades for the editor chrome, which is dark in both themes.

### 10.4 Run takes input in the terminal, as Python's does (2026-11-11)

The separate Program input box is gone. A C/C++ Run starts at once; when the
program waits for input the terminal shows its prompt, and Enter carries on.

- The exec gate gains a `hold` request (`cove-gate-1 <bytes> <ms> hold`): the
  program reads its input from a pipe whose write end the gate keeps open, so
  reading past the input blocks instead of meeting end of file.
- The launcher ends a held Run whose program the kernel shows parked in a
  read of its held stdin (§10.6; it first used 150 ms without CPU, which took
  a `sleep` for waiting). The result is `awaitingInput: true` with the output
  printed so far.
- A Run check holds its input unless `endOfInput` is set (Ctrl+D; the terminal
  has no End input button, for Python or C/C++).
  The browser re-runs the compiled program, from the artifact cache, with every
  line typed so far; a pasted block travels together. Test and Submit never
  hold their input.
- While the program waits, Stop ends it. Reset stays available then (the
  program does no work), and asks in Cove's own dialog, as every coding
  workspace's Reset now does instead of the browser's confirm: confirming
  clears the output and restores the starter code when it changed.
- Qualified on the real kernel (arm64): GCC 47 checks, adding a C++ program
  waiting for its second number (reported waiting, prompts already flushed by
  `cin`), the same program with complete input, and a busy program never taken
  for a waiting one; CPython 39.
- Known differences from a live terminal: each line re-runs the program, so
  random or clock-based output can differ between lines; C `printf` prompts
  without a newline are buffered and appear when the program finishes.

### 10.5 Run and Test answer at once; input lines are one Run (2026-11-11)

A check on the real grader found Run broken after its first input line and
slow everywhere. On the local grader the program itself was never the slow
part: C compiles in about 0.2 s, C++ in 0.4–1.1 s, a run takes 7–60 ms, and a
held step about 220 ms. The waiting was in the browser and in admission.

- **Conflict after the first line (fixed).** The student workspace passed its
  run id to every step as the request id, so the second step reused the first
  step's id with different input and was refused as a conflicting request.
  Every step is now a request of its own; the run id names the transcript only.
- **Rate limit on input lines (fixed).** Each line was charged as a new check
  against six a minute, so the seventh line of one Run was refused. A step
  names the Run it continues (`continues`); the server confirms the claim in
  Redis (same student, problem and code, that Run ended waiting, the new input
  extends its input) and charges it to `SAMPLE_CHECK_CONTINUATIONS_PER_MINUTE`
  (default 60). A claim that does not hold is a new Run, charged as one. A
  student still holds one check at a time, so this cannot occupy more of the
  judge. Admission stays at 11 statements for a student Run, 8 for staff.
- **Held reads instead of one-second polls.** `getSampleCheck` takes
  `waitWhile`: the server authorizes once, then watches the check in Redis
  every 50 ms for up to 5 s and answers as soon as it leaves that status. A
  check that has just started running gets 400 ms to finish first, so a short
  program needs one held read, not two. The database reads per request are
  unchanged (permission and the material's visibility); the request's signal
  ends the wait when the browser leaves. A server that answers at once with
  nothing new is asked again a second later, as before.
- **One transcript.** A later step no longer restarts the transcript: the
  terminal keeps the typed lines where they were typed and adds only the output
  past what it already shows. GCC's warnings print once, when the Run begins.
  A line still in the field when Ctrl+D is pressed travels with the end of
  input in one step.
- **Prompts before input.** A Run's source gets a few lines after the
  student's last one: when `<stdio.h>` is present, a constructor makes stdin
  and stdout line-buffered, as a terminal does, so glibc flushes stdout before
  each read and `printf("Enter a: "); scanf(...)` shows its prompt at once.
  Line numbers in GCC's messages are unchanged. Test and Submit compile exactly
  what was written, so a Run's first compile is its own cache entry.
- Known difference that remains: each line re-runs the program, so random or
  clock-based output can differ between lines. Keeping one process alive
  between lines would hold a sandbox slot while a student thinks; re-running
  holds it only while the program runs.

### 10.6 Waiting means a blocked read; `<iostream>` is precompiled (2026-11-11)

Two grader changes, measured side by side on the local grader (same image
apart from them, same container limits, medians of 5–7):

| | Before | After |
| --- | --- | --- |
| Run shows a prompt and waits | 243 ms | 45 ms |
| Each Enter that waits for the next line | 253 ms | 54 ms |
| A Run that sleeps 0.5 s | cut at 216 ms, reported waiting | runs to the end |
| C++ compile, `<iostream>` first | 176 ms | 81 ms |
| C++ compile, `<iostream>`, `<vector>`, `<algorithm>` | 184 ms | 110 ms |
| C++ compile, `<bits/stdc++.h>` (unchanged) | 156 ms | 158 ms |

- **Waiting is a blocked read.** The launcher used to end a held Run once its
  program had used no CPU for 150 ms, so a `sleep` was taken for waiting and
  every prompt cost at least 150 ms. It now reads the program's
  `/proc/<pid>/syscall` every 10 ms and ends the case when two samples show it
  parked in `read`/`readv` of its stdin with no CPU used between them. That is
  exact here: the program is the gate's one child (its filter refuses fork,
  clone and so threads), and every byte of its input is in the pipe before GO,
  so such a read can never return. A program that computes or sleeps runs on
  to its limits. Reading another process's system call needs SYS_PTRACE over
  the jail, which the grader container has; where the kernel refuses, the old
  150 ms rule applies, and the GCC qualification fails on that host because a
  sleeping program is then cut short. A program that ends between samples
  ends normally: NsJail removes its group as the jail ends, a moment before
  the launcher sees the exit, so a missing group or process reads as ended,
  and any other failure of the check falls back to the CPU rule instead of
  failing the Run. The browser acceptance caught a first version failing such
  a Run (the launcher then stopped answering), so qualification now runs
  twenty held Runs that end mid-sample.
- **`<iostream>` is precompiled.** `/opt/cove/pch/iostream.gch` is built from
  the system header with the compile's own flags, beside `bits/stdc++.h.gch`.
  GCC uses it when `<iostream>` is the first include. Messages are the same as
  without it; in a template error's include chain, the line naming the
  student's file is dropped, as it already was for `<bits/stdc++.h>`. When a
  macro defined before the include makes it unusable, GCC reads the system
  header and `-Winvalid-pch` says so. Every such macro found (`endl`, `size`,
  `int`) breaks `<iostream>` anyway. The image build fails if the header is
  not used, and qualification checks that it raises no warning. 28 MB.
- Known: `#define N 100` before `#include <bits/stdc++.h>` compiles but shows
  the `-Winvalid-pch` warning, because `N` appears in that header. This
  predates this change.

### 10.7 Qualification before production (2026-11-11)

- **GitHub Actions.** `native-grading-qualification.yml` now runs for
  `feat/c-cpp-execution` (push, path-filtered) and for any ref by hand. It
  refuses a non-x86_64 runner or a dirty tree, builds the guest and grader
  images from the commit, records commit, image IDs and architecture, runs
  the runtime and fixture unit tests, `qualify-linux.sh`, then the C/C++
  browser acceptance on that image. A step requires every kernel gate,
  `actual-linux-gcc` included, to report PASS; a `verdict` job fails the
  workflow whenever `qualify` did not succeed, skipped included.
- **Fixture.** `qualify-linux.sh` mounts the two native-gcc stores the
  launcher requires and production Compose provides: their own tmpfs each,
  owned by the unit's UID, under the 0711 assets directory (NsJail resolves
  bind sources inside the jail's user namespace), 256 MiB executable for
  compiled programs and 128 MiB `noexec` for staging, writable in the unit
  through `ReadWritePaths` and unmounted on cleanup. Without them the GCC gate
  could not start. Checked on Ubuntu 24.04's systemd in a disposable
  container: ownership, 0711, exec in the store, `noexec` staging, read-only
  assets otherwise. `test-c-cpp-local.sh` now runs on Linux (GNU `mktemp`).
- **New GCC checks** (52 in all, arm64): waiting is detected through `dup(0)`,
  `dup2(0, 7)` and `readv`; a read of the program's own pipe runs to its limit
  instead; both precompiled headers are found (a `_GLIBCXX_DEBUG` program is
  told each `.gch` is not used) and used (the plain program compiles
  silently); warnings and errors name `main.c`/`main.cpp` and the line, with
  or without a precompiled header.
- **Browser.** The teacher's pointer on a C/C++ problem lands on the same
  content on unequal screens. The history bookmark race is fixed (the page
  shows a status while it redirects and reads nothing). Submit timings
  separate page load from Submit-click-to-visible-result and a cold compile
  from a cached resubmission, ending each measurement on a new final verdict.
- **Rollback floor.** C/C++ courses now count, through
  `to_jsonb(c) ->> 'language'` (works before and after the column exists),
  and the target API must know `C_CPP`, not only `CPP`.

Local timings (arm64 Mac, Docker Desktop, grader limited to 2 CPUs, `next
dev`, one student, two runs; they vary two to three times between runs):

| | Cold compile | Cached resubmission |
| --- | --- | --- |
| C, 2 cases: Submit click to visible verdict | 0.95–2.5 s | 0.36–0.86 s |
| C, server (admission to commit) | 0.40–1.9 s | 0.11–0.32 s |
| C++ `<iostream>`, 10 cases: click to visible | 0.84–2.5 s | 0.84–0.90 s |
| C++, server | 0.63–1.9 s | 0.36–0.57 s |

Page load is measured apart (1.5–3.7 s under `next dev`). The grader alone
compiles these programs in 30–130 ms, so most of a cold submission's server
time is elsewhere in the submission path; that has not been broken down yet.

**amd64 qualification in GitHub Actions passed** (run 42976662105, commit
`f88d1d1c`, 4 vCPU Xeon 6973P-C, kernel 7.0.0-1017-azure): every kernel gate
with 53 GCC checks, crash recovery, the application cohorts, the Python
browser cohorts and the nine C/C++ browser tests. Two runs before it failed
and were fixed: the identity step counted the workflow's own untracked files
as a dirty tree, and the browser cohort ran the Next server and Chromium in
the grader's service leaf, which the GCC work holds to `serviceOverheadMb` on
every health probe; the node withdrew itself and the submission was never
graded. The fixture now runs them in a sibling group, as production's web is
another container; no limit changed.

On that runner (one student, `next dev`, idle fixture), Submit click to
visible verdict: C 0.40–0.94 s cold and 0.35–0.39 s cached (server 0.15–0.19
and 0.07–0.08 s); C++ `<iostream>` with 10 cases 0.92–1.0 s cold and 0.93 s
cached (server 0.42–0.43 and 0.22–0.25 s). On amd64 the server time is close
to compile plus cases; the Mac's larger gap was Docker Desktop.

Open, for the production host:

- The release image on the host, in the approval window (operations guide).
- Capacity (§8 gates): Actions proves function on one runner, not classrooms.
- After a grader fault the node withdraws GCC until restarted; the client
  treats the resulting `UNAVAILABLE` as busy and retries for 30 s, so each
  C/C++ job then waits 30 s before failing. Distinguishing "withdrawn" from
  "busy" needs a protocol change.
- A submission still queued for a grader identity that no longer runs (the
  five-minute drain on stop did not finish it) stays QUEUED; nothing fails or
  moves it.
