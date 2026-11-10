# C and C++ exercises: implementation verification

Date: 2026-11-10. Branch `feat/c-cpp-execution`, not deployed. Implementation
follows the approved [design](../superpowers/specs/2026-11-09-c-cpp-execution-design.md);
§13 there records where it departs from the text. Operating and rollback steps:
[C and C++ exercises](../operations/c-cpp-exercises.md).

## Delivered (phase 1)

- C (`gcc -std=gnu11 -lm`, no `-O`) and C++ (`g++ -O2 -std=gnu++17`), GCC 12.2,
  one language per course, compiled once per attempt on the native node as a
  second runtime family (`native-gcc`). CPython's descriptor, version string
  and queues are unchanged.
- Submit, Test, and a Run whose input is typed into a Program input box first.
  Typing into a running program is phase 2.
- A compile error is an attempt with 0 points. GCC's messages appear in the
  terminal, as editor marks, in the student's result, the teacher's review and
  the history. The teacher's attempt list labels it.
- A runtime error explains a public case's signal or exit code. A hidden case's
  ending is never projected to students or teachers.
- A course's language (Python, C or C++) is chosen when the course is
  created, in the library or an academy, and every coding problem in it
  follows. It is fixed once the course has a problem. Every academy offers all
  three; there is no per-academy switch. See "Follow-up: one language per
  course" below.
- Every editor that shows exercise code highlights by its language: student
  workspace, authoring, preview, live view, staff pane, submission review,
  history and both solution viewers. A staff member's own Run in the live view
  and the staff pane is off for C/C++ in this phase.
- `rollback.sh` refuses to roll the application back below this release once
  any C/C++ exercise or submission exists.

## Automated evidence

| Check | Result |
| --- | --- |
| Native kernel qualification, arm64 Docker Desktop, production container flags, local sizing (2 slots, 2,560 MiB envelope; the VM has 3.9 GB) | CPython 39 checks PASS, GCC 45 checks PASS |
| `@cove/grading-runtime` unit | 67 passed |
| `@cove/shared` | 935 passed |
| `@cove/i18n` | 140 passed |
| `@cove/api` unit | 1,718 passed, 249 skipped (database specs) |
| `@cove/api` database specs, 12 files named on the command line, disposable PostgreSQL 16 and Redis 8 | 122 passed |
| `native-application.integration.spec.ts`, its own isolated harness | 12 passed |
| `@cove/web` unit | 1,566 passed |
| Typechecks and builds: shared, grading-runtime, API (`nest build`), web (`next build`) | passed |
| `deploy/scripts/validate-local.sh` | passed |
| `deploy/native` tests | 13 passed |
| `language-floor.test.py` (new) and `turtle-browser-rollback.test.py` | 6 and 6 passed |

Measured on the qualified image, arm64: C compile 43–52 ms; C++ with
`iostream` 235–251 ms; C++ `bits/stdc++.h` with the precompiled header
218–229 ms; a memory-limited compile stopped after 0.7–1.1 s.

Statement count: admitting a Run check costs 11 statements, the same as a
Test (`compiled-exercises.integration.spec.ts`). Adding `compileFailed` to the
teacher's attempt list adds a column, not a statement.

## Remaining release gates

1. **amd64 qualification.** The amd64 seccomp lists are reasoned, not run.
   On the production host: `docker compose run --rm native-grader qualify`
   must print PASS for `actual-linux-gcc` and for CPython. A missing syscall
   fails closed.
2. **Database migrations.** Production needs both
   `20261110090000_c_cpp_exercises` and `20261110120000_course_language`.
   Development has the first (see below) but **not the second**: this branch's
   API cannot read the development database's courses until it is applied
   there. Both are the owner's to run.
3. **Capacity gates, spec §8, on the production host:**
   - one C++ Run;
   - 30 simultaneous C++ Runs;
   - a Python Submit during that burst;
   - a 10-case C++ Submit;
   - the full-cache memory scenario.

   If a gate fails, the remedy is a larger or separate execution host, never
   higher limits.

## Follow-up: development migration and local acceptance

The owner authorized the development migration and local verification on
2026-11-10. `prisma migrate status` found two pending additive migrations;
`prisma migrate deploy` applied both successfully:

- `20261102090000_native_runtime_routing`
- `20261110090000_c_cpp_exercises`

A subsequent status check reports **Database schema is up to date**. Read-only
verification confirmed C/CPP and the feature enum, runtime routing columns,
compile diagnostics columns, and case exit columns. Counts before and after
were identical: 880 exercises, 586 submissions, and 1,689 submission cases.
No development academy feature or runtime eligibility was enabled. Production
was not accessed.

Local acceptance uses `packages/api/scripts/test-c-cpp-local.sh`: disposable
PostgreSQL and Redis containers, the real native grader image, the real API and
Next application, and a synthetic local identity provider. It refuses remote
database/Redis URLs and checks database/container ownership. Test data and
runtime eligibility are confined to this fixture; cleanup removes its containers
and private authentication files. Logs go to `test-results/c-cpp-local`.

Build the image first with
`bash deploy/native/build-image.sh cove-native-node:cpp-local-verification`,
then run `bash packages/api/scripts/test-c-cpp-local.sh`.

The local browser pass exposed an intermittent `getSampleCheck` output
validation failure. Clock differences between API acceptance and worker
dispatch can produce a negative queue duration, which the response contract
rejects. A regression test reproduced this contract failure before the fix;
`SampleCheckRunner` now clamps queue durations to zero. It does not change
admission, deadlines, verdicts or scores, and adds no database statements.

The rebuilt native image is
`sha256:12ab69d22535747ea54e335d3b6c7e76700a69983e5338edb39831edc021b8bc`.
Real-kernel qualification on the local arm64 Docker VM passed again: **45 GCC
checks and 39 Python checks**. In this run C compiled in 94 ms, C++ with
`iostream` in 357 ms, `bits/stdc++.h` in 327 ms, and the compile-limit check
stopped in 1,597 ms. These are local smoke measurements, not production
capacity acceptance. `deploy/native/qualify-local-container.sh IMAGE_ID`
repeats this local container qualification using the production containment
flags and the 2-slot/2,560 MiB local envelope.

The focused runner/grading/native admission suite passed **49 tests**, including
the new clock-skew regression. The runtime suite passed **67 tests**. API and
browser-test typechecks, the API build and native image build passed. The two
rollback regression suites passed **6 tests each**.

The final isolated acceptance run against the exact image above passed:

| Follow-up check | Result |
| --- | --- |
| C/C++ database integration (`compiled-exercises.integration.spec.ts`) | 8 passed; Run admission still 11 statements |
| Chromium with real native execution | 5 passed (1.3 minutes) |
| C and C++ student workspaces | Run with edited input, server Test, correct Submit, compile failure and exit-code crash all passed |
| Hidden-case protection | Raw case exit code persisted internally; student response redacted it |
| Teacher review, history and live view | GCC diagnostics, visible history result, language highlighting and no live-view Run control passed |
| Ten-case C++ Submit | 10/10 passed, score 100 |
| Repeated C++ sample checks | 20 consecutive checks passed; no invalid polling response |
| Authoring | C and C++ selectable in the enabled fixture academy |

The final browser run ended successfully, its PostgreSQL/Redis/grader containers
and private authentication files were removed, and no local test listener was
left running. Screenshots are under `test-results/c-cpp-browser`, including
`C-compile-history.png`, `CPP-compile-history.png` and `cpp-authoring.png`.
Neither production nor existing academy rollout settings were changed. Nothing
was committed, pushed or deployed.

## Manual local practice

At the owner's request, `pnpm dev:c-cpp` now leaves the isolated environment
running for manual practice. Open **http://127.0.0.1:4327/** and choose C, C++, or
the ten-case C++ exercise. The course is **C and C++ Practice**; its starter
programs already work. The start page also signs into the synthetic teacher or
manager account, without changing existing development identities or courses.

Verified in the user's Chrome browser: the C++ workspace opens through the
local student sign-in link, and Run with `40 2` prints `42` and "The program
finished." The portal and all three role redirects passed HTTP smoke checks.
The environment was left running for the user. Stop with `pnpm dev:c-cpp:stop`
or Ctrl+C in its terminal. Stopping removes the disposable practice database;
the next start recreates the course. Details are in the operations guide.

The startup health probe now waits for the published manifest before using
`docker exec`, preventing its probe process from racing initial cgroup
delegation. No production runtime or containment policy was changed.

## Regular localhost:3000 setup

The owner subsequently requested the existing Development Academy on
localhost:3000, rather than the disposable app. This request explicitly
authorized creating manual practice content in the configured shared
development database. The disposable app was stopped; its test containers
were removed.

`pnpm dev:c-cpp:regular` now starts the local `cove-native-development`
container against the existing development Redis and database. It enables
`C_CPP_EXERCISES` only for Development Academy and admits only C/CPP in that
academy. Existing Python routing is unchanged. It writes the native manifest
settings to the ignored API `.env.local`; the regular API was restarted to
load them.

The persistent course **C and C++ Practice** is at:

http://localhost:3000/academy/development-academy/learn/courses/c1000000-0000-4000-8000-000000000001

It contains C addition, C++ addition and a ten-case C++ exercise, assigned to
**C/C++ Practice Class** for the existing `cove-student` development account.
Both manager and student course outlines were observed in Chrome on
localhost:3000, and the student C editor was opened there. Real ephemeral Run
checks using `SampleCheckService` with that student's existing development
identity and class, the configured Redis and the native worker passed for
**both C and CPP**: input `40 2`, stdout `42\n`, outcome `PASSED`. These manual
checks did not create official attempts or change scores. Automated database
integration tests were not run against the shared database.

This setup exposed a missing guard in the staff's own practice workspace:
its C/C++ editor could still launch Pyodide. It now uses language-aware
highlighting, never downloads/runs Python for C/C++, and keeps practice Submit
available while directing Run/Test to the student workspace, matching the
phase-1 staff-copy limitation. The regression suite passed **5 tests**, i18n
passed **140 tests**, and the web typecheck passed. No production read path or
SQL statement count changed.

Unlike the disposable app, stopping this worker preserves the course and
submissions: `pnpm dev:c-cpp:regular:stop`. Development credentials are passed
only to the trusted worker through a temporary private env file (removed
after container creation), never to compiler/program jails. Production was
not modified.

## Follow-up: one language per course

On 2026-11-10 the owner moved the language choice from each exercise to the
course ([Course language](../superpowers/specs/2026-11-10-course-language-design.md))
and asked for Python, C and C++ in every academy without a switch.

- The course create and edit forms (academy, library and the console's
  content modal) offer **Programming language**. The exercise editor has no
  picker: a new problem takes the course's language, template and grading.
- The API sets each exercise's language from its course under the course
  lock, refuses a language change once the course has a problem, enforces
  weighted grading for C/C++ server-side, and copies the language on adoption,
  library import and spreadsheet import.
- `C_CPP_EXERCISES` no longer gates anything and is gone from the feature
  board; production eligibility lists `PYTHON`, `C` and `CPP` and `run` for
  every academy.
- New migration `20261110120000_course_language`: `courses.language`, with
  existing courses Python. A course already holding C/C++ exercises takes the
  language most of them use.

| Check | Result |
| --- | --- |
| `@cove/shared` / `@cove/i18n` | 935 / 140 passed |
| `@cove/api` unit | 1,723 passed, 250 skipped (database specs) |
| `@cove/api` database specs, 12 files named, disposable PostgreSQL 16 and Redis 8 | 123 passed. One earlier run failed once, intermittently, in a Python sample-check test this change does not touch; it passed alone and on the full rerun |
| `@cove/web` unit | 1,570 passed |
| API and web typechecks, ESLint on changed web files, `validate-local.sh`, both rollback suites | passed |
| `test-c-cpp-local.sh` against `sha256:12ab69d2…` (real native grader, API, Next, Chromium) | 5 passed, including creating a C course from the form and a new problem in a C++ course starting from the C++ template with no picker |

Statement counts (`compiled-exercises.integration.spec.ts`): a course
language change is 14 statements against 13 for a rename (the course lock and
one count; a rename's title check is one); exercise creation is 22, reading
the language from the lock it already takes; the course list's count query
gains one column, no statement. The API (`nest build`) and web (`next build`)
production builds passed.

The development seeder (`pnpm dev:c-cpp:regular`) now creates **C Practice**
(`c1000000-0000-4000-8000-000000000101`) and **C++ Practice**
(`…000000000201`) and no longer writes a feature row. It was **not** rerun:
it writes to the shared development database. The mixed **C and C++
Practice** course from the earlier run stays until it is deleted.

## Notes

- Releasing this branch turns C and C++ on for every academy: production
  eligibility lists `PYTHON`, `C` and `CPP`. The release gates above come
  before the deploy.
- On 2026-11-10, three integration specs that are hard-wired to the shared
  Supabase dev database were run once by mistake:
  `staff-practice.integration.spec.ts`, `exercise-solutions.integration.spec.ts`
  and `pdf-reference.integration.spec.ts`. Their cleanup ran, and a read-only
  check found no leftover courses or PDF assets. Every later database run in
  this report used disposable containers.
