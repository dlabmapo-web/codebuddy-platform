# C and C++ exercises: releasing, operating and rolling back

Design: [C and C++ exercises on the native grader](../superpowers/specs/2026-11-09-c-cpp-execution-design.md)
and [Course language](../superpowers/specs/2026-11-10-course-language-design.md).
C and C++ compile and run only on the native node (`native-grader`), as a second
runtime family (`native-gcc`) beside CPython. There is no browser runtime and no
Pyodide fallback for them.

Every academy offers Python, C and C++. The language belongs to a course: it is
chosen when the course is created (in the library or an academy), every coding
problem in the course uses it, and it is fixed once the course has a coding
problem. Existing courses are Python.

## Use the regular localhost:3000 app

To add the practice courses to **Cove Development Academy** and connect the
regular development API to the local native grader:

```bash
pnpm dev:c-cpp:regular
pnpm dev
```

If the API is already running, restart it after the first command so it reads
the new `packages/api/.env.local` native settings. The web address stays
**http://localhost:3000**. Open the courses:

- http://localhost:3000/academy/development-academy/learn/courses/c1000000-0000-4000-8000-000000000101
- http://localhost:3000/academy/development-academy/learn/courses/c1000000-0000-4000-8000-000000000201

**C Practice** has C addition; **C++ Practice** has C++ addition and a ten-case
C++ problem. Both are assigned to **C/C++ Practice Class**, including the
existing development student (`cove-student`). An earlier version of this
command seeded one **C and C++ Practice** course mixing both languages
(`c1000000-0000-4000-8000-000000000001`); delete it from the course list. Sign in with that student to
use **Run**, **Test run**, and **Submit**. Staff can inspect
and author the course, and Run, Test and Submit their own staff practice.

This command deliberately uses the configured **shared development database**.
It does not replace existing course content or student drafts when rerun. Docker runs
`cove-native-development`, using the existing local Redis; its eligibility
admits C/C++ in this academy. Python keeps its existing grading path. Database
credentials stay in the trusted worker and are never passed to learner jails.

To stop only this native worker, preserving the course and submissions:

```bash
pnpm dev:c-cpp:regular:stop
```

## Optional disposable practice app

With Docker running, start the practice environment from the repository root:

```bash
pnpm dev:c-cpp
```

Open **http://127.0.0.1:4327/** when the terminal says it is ready. Choose a
problem to sign in as the local student; no password is required. **C
Practice** contains C addition; **C++ Practice** contains C++ addition and a C++
exercise with ten grading cases. All three have working starter code.

1. Click **Run**, type `40 2` in the terminal and press Enter; it prints `42`.
2. Click **Test run** to check the public example.
3. Click **Submit** to check all grading cases.
4. Remove a semicolon to see GCC's compile diagnostics, or use
   `int main(void) { return 3; }` to see a runtime error. **Reset** restores the
   starter code.

The start page also has teacher and manager links for reviewing submissions
and authoring more exercises. Switching roles changes the account in that
browser; use another browser/private window to keep both roles open.

Keep the terminal running. Stop with Ctrl+C, or from another terminal:

```bash
pnpm dev:c-cpp:stop
```

This environment uses its own local database, Redis and native grader. Its
practice course and submissions are removed when stopped, and recreated on
the next start. It does not modify shared development/production courses.
If the native image is missing, build it first with
`bash deploy/native/build-image.sh cove-native-node:cpp-local-verification`.

## What a release turns on

Deploying turns C and C++ on for every academy at once:

- the production `NATIVE_ELIGIBILITY` lists `PYTHON`, `C` and `CPP` and the
  `run` kind for every academy;
- any author can create a C or C++ course;
- Python's descriptor, version string and queue names are unchanged, and
  existing courses stay Python.

So the checks below come **before** the deploy, not after it.

## Qualify on the production host first

For repeatable acceptance on a development computer, build the current native
image and run the isolated browser suite:

```bash
bash deploy/native/build-image.sh cove-native-node:cpp-local-verification
pnpm test:c-cpp:local
```

It uses new local PostgreSQL and Redis containers, a synthetic identity
provider, and the real API, Next application and native grader. It checks C/C++
Run, Test and Submit, diagnostics, hidden-case redaction, teacher review/history,
choosing a course's language, and a ten-case C++ submission. It does not create
content in an existing academy. Ports 3317, 4317 and 4327 must be free. The image
can be overridden with `COVE_CPP_NATIVE_IMAGE`; logs are saved under
`test-results/c-cpp-local` and browser artifacts under `test-results/c-cpp-browser`.
To repeat just the local kernel containment checks on an immutable image, use
`bash deploy/native/qualify-local-container.sh sha256:<local-image-id>`.

The arm64 qualification passed locally (2026-11-10, Docker Desktop, production
container flags): 39 CPython containment checks and 45 GCC checks. **amd64 has
not been qualified**: its seccomp lists (`gcc-run.amd64.policy`,
`gcc-compile.amd64.policy`) carry the x86 legacy syscalls by reasoning, and only
the real host can prove them. Fails closed: a missing syscall kills the program
or the compiler, which the qualification reports.

```bash
docker compose run --rm native-grader qualify
```

It must print `{"gate":"actual-linux-gcc","status":"PASS",...}` with its
compile timings, then the CPython gate. Anything else: do not deploy a release
that admits C/C++; remove `C` and `CPP` from the eligibility first (Rollback).

Then check readiness on the running node:

```bash
docker exec cove-production-native-grader-1 /opt/cove/node -e \
  "fetch('http://127.0.0.1:4102/ready').then(r=>console.log(r.status))"
docker logs cove-production-native-grader-1 2>&1 | grep -i gcc
```

## Capacity before classes use it

Measure the capacity gates of spec §8 on this host: one C++ Run, 30
simultaneous C++ Runs, a Python Submit during that burst, a 10-case C++ Submit,
and the full-cache memory scenario. If a gate fails, the remedy is a larger or
separate execution host, never higher limits.

## Day-to-day facts

- **Emergency stop.** `docker stop cove-production-native-grader-1` sends
  Python back to judge-worker, but **stops all C/C++ execution**: Run, Test and
  Submit answer "temporarily unavailable". No attempt is recorded and nothing is
  marked wrong.
- **GCC alone can fail.** If GCC's readiness self-test or a GCC jail fails, the
  node withdraws GCC only; Python keeps grading natively. Look for
  `GCC runtime not ready` / `gccFailure` in the node's logs. A cleanup
  uncertainty still withdraws the whole node, as for Python.
- **Memory.** The artifact store (256 MiB tmpfs) is charged to the service and
  counted inside `serviceOverheadMb`; every health probe withdraws readiness if
  the service leaf exceeds its overhead.
- **Compile staging** (192 MiB tmpfs) is charged to each compile and freed
  before its cgroup is removed.

## Authoring guidance for teachers

- A course is **Python** or **C / C++**. In a C/C++ course each problem
  chooses C or C++ in the exercise editor, so one course can mix both.
- Choose the course's **Programming language** when creating it. Every coding
  problem in the course uses it; quiz-style problems, Turtle exercises and
  other materials are unaffected. It can be changed only while the course has
  no problems (quiz-style ones included): to teach the same course in another
  language, create a new course.
- C is compiled like Elice compiles it: `gcc -std=gnu11 -lm`, no optimization.
  C++ uses `g++ -O2 -std=gnu++17`. `ONLINE_JUDGE` is defined.
- Visual Studio–only code does not compile: `scanf_s`, `<conio.h>`,
  `<windows.h>`. `#define _CRT_SECURE_NO_WARNINGS` is harmless.
- Run works as Python's does: the program starts at once, and when it waits for
  input the terminal takes a line (Enter). Each line re-runs the compiled
  program with all the input so far, so a program using random numbers or the
  clock can print different output after each line. Ctrl+D ends the input, for
  programs that read until the end of it. C's `printf` prompts without a
  newline appear once the program finishes; C++ `cout` prompts appear at once.
- Programs may write and read files in their working directory; author-supplied
  input files are not supported yet.

## Rollback

- Switching C/C++ off: remove `C` and `CPP` from the eligibility entry and
  deploy. Run, Test and Submit then answer "temporarily unavailable" in C and
  C++ courses, and Python is untouched. This is the supported rollback.
- **Application rollback** below the C/C++ release is refused by
  `deploy/scripts/rollback.sh` once any C/C++ exercise or submission exists,
  because an older API cannot read those rows (submissions keep their language
  even after an exercise is deleted). The check
  (`deploy/scripts/check-language-floor.sh`) looks for `CPP` in the target API
  image's Prisma client. Roll forward instead.
