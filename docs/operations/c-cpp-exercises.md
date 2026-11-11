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
choosing a course's language, a ten-case C++ submission, the teacher's pointer
on a C/C++ problem, and Submit timings (`test-results/c-cpp-browser/timings.json`:
page load apart from Submit-click-to-visible-result, cold compile apart from a
cached resubmission). It works on Linux as on macOS. It does not create
content in an existing academy. Ports 3317, 4317 and 4327 must be free. The image
can be overridden with `COVE_CPP_NATIVE_IMAGE`; logs are saved under
`test-results/c-cpp-local` and browser artifacts under `test-results/c-cpp-browser`.
To repeat just the local kernel containment checks on an immutable image, use
`bash deploy/native/qualify-local-container.sh sha256:<local-image-id>`.

### Qualify before deployment

Three stages, in order, for the exact commit you deploy. The first two are
functional: they prove containment and correctness, not classroom capacity.

**1. GitHub Actions, native amd64.** Workflow *Native grading disposable Linux
qualification* (`.github/workflows/native-grading-qualification.yml`). It runs
by itself on a push to `feat/c-cpp-execution` (or
`feat/native-grading-classroom-capacity`) that touches the grader, judge,
learn, shared, workspace, monitoring or history code. Run it by hand for any
branch, `main` included, before a deployment:

- GitHub → **Actions** → *Native grading disposable Linux qualification* →
  **Run workflow** → choose the branch → **Run workflow**; or
- `gh workflow run native-grading-qualification.yml --ref <branch>`, then
  `gh run watch`.

It passes only when both jobs are green, `qualify` and `verdict`; `verdict`
fails whenever `qualify` was skipped or cancelled. On `ubuntu-24.04` (x86_64,
checked) it:

1. checks out the commit and refuses a dirty tree or a non-amd64 runner;
2. runs the runtime and fixture unit tests;
3. builds the guest and grader images from that commit and records the commit,
   image IDs and architecture (`native-candidate.json`, the run summary);
4. runs `deploy/native/qualify-linux.sh`: a bounded systemd unit with the
   production GCC stores (an executable 256 MiB tmpfs for compiled programs, a
   `noexec` 128 MiB one for staging, both owned by the unit), all CPython and
   GCC kernel checks, the private application cohorts, and crash recovery. The
   step after it requires each gate to report PASS, `actual-linux-gcc`
   included, so a GCC-less image cannot pass;
5. runs the C/C++ browser acceptance (`packages/api/scripts/test-c-cpp-local.sh`)
   on the candidate image: authoring a C/C++ course and problem, Run with
   prompts, line-by-line input, a pasted block and Ctrl+D, Test, Submit and
   grades, compile errors and crashes with hidden cases withheld, teacher
   review and history, staff practice, the teacher's pointer on a C/C++
   problem, and Submit timings.

Evidence is the artifact `native-linux-<commit>`: build log, candidate
identity, kernel and application evidence, browser logs and `timings.json`.

**2. The production host, with the release image, before it is deployed.**
Release builds (`release-v2.yml`) produce their own images from the same
Dockerfiles, with a different identity, and the host's kernel and AppArmor are
not GitHub's. A `v2.*.*` tag builds and publishes the images (`publish`,
`publish-native`), then the `deploy` job waits for approval: the `production`
environment requires a reviewer (`jurabek10`). Qualify in that window:

1. Push the release tag and wait until `publish-native` has finished and
   `deploy` shows *Waiting for review*. The native image is
   `ghcr.io/dlabmapo-web/cove-native:sha-<the tagged commit>`.
2. On the Lightsail host, beside the running node (a separate envelope):

   ```bash
   cd /opt/cove
   NATIVE_IMAGE=ghcr.io/dlabmapo-web/cove-native:sha-<40-hex commit> \
     docker compose --project-directory /opt/cove --env-file deployment.env \
     -f compose.production.yml --profile native run --rm native-grader qualify
   ```

   It must print `"gate":"standby-behaviour","status":"PASS"`,
   `"gate":"cold-start","status":"PASS"`,
   `"gate":"actual-linux-gcc","status":"PASS","passed":53,...` (53 on amd64:
   one check runs only there) and `"gate":"actual-linux-containment","status":"PASS"`.
3. All PASS: approve the deployment. Anything else: reject it, and do not
   deploy a release that admits C/C++; remove `C` and `CPP` from the
   eligibility first (Rollback).

The grader does not run these checks when it starts.

**3. Capacity on the production host** (below), before classes use C/C++.

**Evidence so far.** Stage 1 passed on native amd64, 2026-11-11: run
[42976662105](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/42976662105),
commit `f88d1d1c`, image `sha256:44832b5a…`, `ubuntu-24.04`, kernel
7.0.0-1017-azure, 4 vCPU Intel Xeon 6973P-C. Every gate passed: standby,
cold start, CPython containment, 53 GCC checks (a held Run waits 24 ms),
crash recovery, the twelve 1–10-client application cohorts, the Python
production-build browser cohorts (1 client 0.98 s, 2 clients p95 1.39 s,
80 ms emulated latency) and the nine C/C++ browser tests. The amd64 seccomp
lists and the x86 `read` numbers are therefore proven on that kernel; stage 2
proves them on the production host. arm64 (Docker Desktop) passes 52 GCC
checks.

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
- **Check limits.** A student may start `SAMPLE_CHECK_PER_MINUTE` (default 6)
  Runs and Tests a minute. The input lines of a Run that waits for them are
  charged to `SAMPLE_CHECK_CONTINUATIONS_PER_MINUTE` (default 60) instead, and
  a student still holds one check at a time.
- **Deploy the API before the web.** The workspace now asks the API to hold a
  check's read until it changes (`waitWhile`) and names the Run an input line
  continues (`continues`); an older API refuses both fields.
- **The grader needs SYS_PTRACE.** It reads a Run's program's system call to
  tell waiting for input from sleeping. Production Compose already grants it.
  Where it is missing, Runs fall back to the 150 ms rule, and
  `docker compose run --rm native-grader qualify` fails; the grader's own
  startup does not check it.

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
  input the terminal takes a line (Enter). Prompts are on screen before the
  terminal asks, C's `printf("Enter: ")` included: a Run's input and output are
  line-buffered, as a terminal's are. Each line re-runs the compiled program
  with all the input so far and the terminal adds only what is new, so a
  program using random numbers or the clock can print different output after
  each line. Ctrl+D ends the input, for programs that read until the end of
  it; a line still in the field goes with it. A program that sleeps or
  computes keeps running; only a read of more input than was typed ends it to
  ask for a line.
- Programs may write and read files in their working directory; author-supplied
  input files are not supported yet.

## Rollback

- Switching C/C++ off: remove `C` and `CPP` from the eligibility entry and
  deploy. Run, Test and Submit then answer "temporarily unavailable" in C and
  C++ courses, and Python is untouched. This is the supported rollback.
- **Application rollback** below the C/C++ release is refused by
  `deploy/scripts/rollback.sh` once any C/C++ course, exercise or submission
  exists, because an older API cannot read those rows (submissions keep their
  language even after an exercise is deleted), and would let Python problems
  into a C/C++ course. The check (`deploy/scripts/check-language-floor.sh`)
  looks for `C_CPP` in the target API image's Prisma client. Roll forward
  instead.
- **The grader image** is replaced like any release: on stop the node
  withdraws readiness and finishes queued native work for up to five minutes,
  and the API admits native work only while a node reports ready, so queued
  work is not stranded. Work admitted for one grader identity runs only on that
  identity; a submission still queued for an image that no longer runs stays
  QUEUED until that image runs again. After a grader fault the node withdraws
  C/C++ until it restarts (Python continues); restart `native-grader`.
