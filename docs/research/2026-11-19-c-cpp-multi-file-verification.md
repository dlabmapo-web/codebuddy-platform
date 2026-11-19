# C/C++ multi-file exercises: verification

Date: 2026-11-19. Branch `feat/c-cpp-multi-file`, uncommitted.
Design: [multi-file exercises](../superpowers/specs/2026-11-19-c-cpp-multi-file-design.md)
(§11 lists where the implementation departs from it). Elice behaviour it
copies: [research](2026-11-19-elice-c-cpp-multi-file.md).

## Passed

| Check | Result |
| --- | --- |
| `@cove/shared` unit suite | 974/974. New: `source-files.spec.ts` (bundle round trips, path rules including `-o.c`, `../x.c`, `.x.c` and case duplicates, project validation, composition, hidden-diagnostic redaction); `gcc-diagnostics.spec.ts` (any project path) |
| `@cove/grading-runtime` suite | 70/70. New: the compile contract accepts a project and refuses option-like, escaping, absolute or duplicate paths, a header as a source, and `code` with `files`; the argv puts the sources in place of `main.c`; the jail config carries them |
| `@cove/api` unit suites (judge, learn, content, library-sync, platform, monitoring) | 1028 passed, 221 skipped (database specs). New in `compiled-grading.spec.ts`: a version 6 submission compiles the composed files, with editable text from the learner and read-only and hidden text from the author; a hidden file's quoted source is removed from stored diagnostics; an uncomposable bundle is a compile error and compiles nothing |
| `@cove/web` suites for the changed areas | 1234 passed. Four suites need `NEXT_PUBLIC_SUPABASE_URL` and pass with `packages/web/.env` loaded (unrelated to this change). New: `yjs-bundle.spec.ts` (two peers converge, concurrent typing in two files merges, Reset replaces everything); `file-bundle.spec.ts` (old single-file drafts are kept as the first source; templates are valid projects) |
| `@cove/i18n` | 131/131, inside the layout payload budget |
| Typecheck | shared, grading-runtime, api, web: clean. ESLint on the changed web files: clean |
| Deploy scripts | `project-floor.test.py` (new), `language-floor`, `turtle-browser-rollback`, `learning-rollout`: OK |
| Database integration (disposable `postgres:16-alpine` and `redis:7-alpine`; every migration, including `20261119120000_exercise_source_project`, applied cleanly) | `compiled-exercises.integration.spec.ts`: the 5 new multi-file tests pass (see below). `weighted-grading` and `sample-check` integration: 24/24. Library sync, guards, legacy links and library adoption: 28/28, run one file at a time |

The new database integration tests prove:

- **Authoring:** a Manager's project is stored; `starter_code` is the visible
  files' bundle; the learner view never lists the hidden file; an invalid
  project is refused.
- **Submit:** freezes a version 6 policy, and the grader is handed `main.c`,
  `sum.c` and the hidden `probe.c` compiled, the author's `sum.h` (not the
  learner's tampered copy), and the learner's `extra.c` present but not
  compiled.
- **Run:** puts the terminal prelude after every compiled source, and its
  admission costs exactly the statements of a single-file Run of the same
  problem.
- **A bundle naming the hidden file** is explained as a compile error, and
  nothing is compiled.
- **Grading revision:** editing an editable file's start keeps the revision;
  changing a hidden file bumps it; turning the project off clears it.

## Earlier statement-count failures, fixed

Five tests in `compiled-exercises.integration.spec.ts` failed on `main`
before this branch, because their statement counts predated two other
changes:

- **Course update** (language change 14 → 15, rename 13 → 14): the library
  course sync release (`562b6cc0`) added the course's sync state to the
  course summary every update returns. That is one fixed statement, not a
  per-row read.
- **Run and Test admission** (11 → 9): `4d6881de` folded the class context
  (membership, enrollment, class) into one query.
- **Cascade:** the three Run tests after them failed only because the first
  Run test stopped early and left a check outstanding.

The assertions and their explanations were updated. The file now passes
17/17, and the unmodified release harness
(`COVE_CPP_NATIVE_IMAGE=cove-native-node:multi-file bash packages/api/scripts/test-c-cpp-local.sh`)
passes end to end: integration 17/17, then the browser 10/10.

## Real grader and browser

The image was built from this tree: `cove-native-node:multi-file`, arm64,
`sha256:c129c034a964…`.

- **The local real-kernel qualification**
  (`deploy/native/qualify-local-container.sh`) passes every gate:
  - `standby-behaviour` and `cold-start`;
  - `actual-linux-gcc`: 56 checks, the earlier 52 on arm64 plus 4
    multi-file ones;
  - `actual-linux-containment`: 39.
- **The new compiler checks run in the real jail:**
  - a three-file C project with a `lib/` folder compiles in 109 ms and runs;
  - reordering its files is a cached build;
  - `main.cpp` + `sum.c` compiles as C++ with `bits/stdc++.h` in 335 ms;
  - leaving `sum.c` out is the linker's `undefined reference to 'sum'`;
  - a missing semicolon reads `sum.c:3:…`;
  - `-wrapper,/bin/sh.c`, `../escape.c`, `/etc/x.c`, `.hidden.c` and a header
    as a source are refused.
- **The descriptor's argv is unchanged**, so the GCC runtime identity is the
  same.
- **The C/C++ browser acceptance** (real API, Next, Chromium and the image
  above, through `packages/api/scripts/test-c-cpp-local.sh` with its
  integration step left out because of the existing failures above): 10/10.
  - **The 9 existing tests pass:** C and C++ Run, Test and Submit; compile
    errors; crashes; teacher review; line-by-line input; ten cases; a course's
    language; staff practice; the teacher's pointer; timings.
  - **The new multi-file test** (seeded `MULTI`: `main.cpp`, `sum.c`,
    read-only `sum.h`, hidden `checks.c`) proves:
    - three tabs and the file list show, and the hidden file is absent from
      the page;
    - `sum.h` is read-only;
    - Run prints 8, and the banner shows `g++ main.cpp sum.c`;
    - Test passes and Submit scores 100, with a bundle without the hidden
      file and a version 6 policy;
    - an error is reported at `sum.c:4` with an error mark on the `sum.c` tab;
    - an added `extra.c` reads "Not compiled";
    - the teacher's review shows the files as tabs.
- **A regression the browser suite caught, and fixed.** The single-file editor
  calls its mount handler as `onMount(editor, monaco)`. Passing that handler
  through as the workspace's `(editor, host)` made Monaco's namespace look
  like a bundle host. That broke live collaboration on single-file problems
  (`host.apply is not a function`; the teacher's-pointer test failed). The
  editor pane now hands the single-file editor's mount only the editor, and
  `registerEditor` accepts a host only if it has `read` and `apply`.

Still to do before release: the production-host qualification of spec
2026-11-09 §6 on amd64, with the release image.
