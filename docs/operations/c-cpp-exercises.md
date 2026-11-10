# C and C++ exercises: enabling, operating and rolling back

Design: [C and C++ exercises on the native grader](../superpowers/specs/2026-11-09-c-cpp-execution-design.md).
C and C++ compile and run only on the native node (`native-grader`), as a second
runtime family (`native-gcc`) beside CPython. There is no browser runtime and no
Pyodide fallback for them.

## Use the regular localhost:3000 app

To add the practice course to **Cove Development Academy** and connect the
regular development API to the local native grader:

```bash
pnpm dev:c-cpp:regular
pnpm dev
```

If the API is already running, restart it after the first command so it reads
the new `packages/api/.env.local` native settings. The web address stays
**http://localhost:3000**. Open the course:

http://localhost:3000/academy/development-academy/learn/courses/c1000000-0000-4000-8000-000000000001

The course is **C and C++ Practice**, with C addition, C++ addition, and a
ten-case C++ problem. It is assigned to **C/C++ Practice Class**, including the
existing development student (`cove-student`). Sign in with that student to
use **Program input**, **Run**, **Test run**, and **Submit**. Staff can inspect
and author the course and submit their own graded practice; C/C++ Run/Test in
their private staff copy is deferred.

This command deliberately uses the configured **shared development database**
and enables `C_CPP_EXERCISES` only in Development Academy. It does not replace
existing course content or student drafts when rerun. Docker runs
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
problem to sign in as the local student; no password is required. The course
**C and C++ Practice** contains C addition, C++ addition, and a C++ exercise with
ten grading cases. All three have working starter code.

1. Type `40 2` into **Program input** and click **Run**; it prints `42`.
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

## What a release changes by itself

Nothing visible. A release that carries the GCC trees publishes a version 2
manifest with a `gcc` descriptor, but:

- the production `NATIVE_ELIGIBILITY` entry lists no `languages`, which means
  Python only, so no C/C++ work is admitted;
- `C_CPP_EXERCISES` is a rollout feature, off for every academy, so nobody can
  author C or C++;
- Python's descriptor, version string and queue names are unchanged.

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
the language picker, and a ten-case C++ submission. It does not enable or create
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
compile timings, then the CPython gate. Anything else: do not enable C/C++.

Then check readiness on the running node:

```bash
docker exec cove-production-native-grader-1 /opt/cove/node -e \
  "fetch('http://127.0.0.1:4102/ready').then(r=>console.log(r.status))"
docker logs cove-production-native-grader-1 2>&1 | grep -i gcc
```

## Enabling for one academy

1. Add the languages and the `run` kind to the eligibility in
   `compose.production.yml`, scoped to the pilot academy first:

   ```json
   [{"contexts":["live","preview"],"kinds":["official","staff-practice","sample","regrade"],"maxCaseTimeLimitMs":60000},
    {"organizationId":"<org>","academyId":"<academy>","contexts":["live","preview"],
     "kinds":["official","staff-practice","sample","regrade","run"],"maxCaseTimeLimitMs":60000,
     "languages":["PYTHON","C","CPP"]}]
   ```

2. Deploy. The node republishes its manifest; the API rereads it on change.
3. Turn on **C and C++ exercises** for that academy in the console's feature
   board.
4. Measure the capacity gates of spec §8 on this host before widening:
   one C++ Run, 30 simultaneous C++ Runs, Python Submit during that burst, a
   10-case C++ Submit, and the full-cache memory scenario. If a gate fails, the
   remedy is a larger or separate execution host, never higher limits.

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

- C is compiled like Elice compiles it: `gcc -std=gnu11 -lm`, no optimization.
  C++ uses `g++ -O2 -std=gnu++17`. `ONLINE_JUDGE` is defined.
- Visual Studio–only code does not compile: `scanf_s`, `<conio.h>`,
  `<windows.h>`. `#define _CRT_SECURE_NO_WARNINGS` is harmless.
- Run takes its input from the **Program input** box (prefilled with example 1).
  Typing into a running program is not available yet.
- Programs may write and read files in their working directory; author-supplied
  input files are not supported yet.

## Rollback

- Switching C/C++ off: remove `C`/`CPP` from the eligibility entry and turn the
  feature off. Python is untouched. This is the supported rollback.
- **Application rollback** below the C/C++ release is refused by
  `deploy/scripts/rollback.sh` once any C/C++ exercise or submission exists,
  because an older API cannot read those rows (submissions keep their language
  even after an exercise is deleted). The check
  (`deploy/scripts/check-language-floor.sh`) looks for `CPP` in the target API
  image's Prisma client. Roll forward instead.
