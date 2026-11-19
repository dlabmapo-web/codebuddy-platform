# C and C++ multi-file exercises

Date: 2026-11-19. Status: Phase A implemented 2026-11-19 on `feat/c-cpp-multi-file`, not yet deployed. §11 records where the implementation departs from the text.
Builds on [C and C++ exercises on the native grader](2026-11-09-c-cpp-execution-design.md)
and [Course language](2026-11-10-course-language-design.md). The behaviour it
copies is recorded in
[Elice C/C++ multi-file exercises](../../research/2026-11-19-elice-c-cpp-multi-file.md)
(cited below as "research §n").

## 1. Goal

A C/C++ problem can have several files, as on Elice (research §2).

Roles are Cove's, not Elice's. On Elice the teacher authors, but in Cove only
holders of `curriculum.manage` author: **Team Lead** and **Manager** in an
academy, and library authors for library courses
(`packages/shared/src/auth/roles.ts`). **Teachers** read the curriculum, hidden
cases included (`curriculum.review`), and review the work of their own classes
(`submissions.assigned.review`).

- **Authors (Team Lead, Manager)** give students a set of starting files (for
  example `main.cpp`, `sum.c` and `sum.h`), mark files read-only or hidden,
  choose which files open as tabs, and choose which files are compiled.
- **Students** edit the files in tabs, link them with `#include "sum.h"`, may
  add their own files, and use Run, Test and Submit. Every source is compiled
  together into one program.
- **Teachers, Team Leads and Managers** see a learner's work, history and
  grading as files, not as one string. Teachers see only their assigned
  classes.

Done means that DC-C-1 Week 9's practice and mission (research §2) can be
authored, solved, run, tested, submitted and reviewed in Cove with the same
files and the same results. Single-file exercises do not change.

Not copied from Elice:

- **Teacher-written shell scripts** (`runner.sh`, `grader.sh`). A structured
  build list (§3.3) replaces them.
- **Custom grader programs** (`grader.cpp` with `EliceUtils`).
- **Recompiling for every test case.** Cove compiles once per submission and
  caches the result.
- **Hiding compile errors on Submit.** Cove keeps showing them.

## 2. Phases

| Phase | Contents |
| --- | --- |
| **A** (this spec, implement now) | Several source and header files; read-only, hidden and open-by-default flags; a build list; learner-created files (create, rename, delete); Run, Test and Submit over files; diagnostics per file; per-file reset; file snapshots in drafts, submissions, history, live monitoring and teacher views; multi-file solutions; library sync and course copy. |
| **B** | Data files (`input.txt` …) placed in the program's working directory; a folder UI and upload; per-file revision history; Elice exercise import/export (zip). |
| Out of scope | Shell scripts, custom grader programs and `EliceUtils`, per-exercise compiler flags, VNC/HTTP, students choosing the language. |

## 3. Behaviour

### 3.1 Authoring (Team Lead, Manager, library authors)

Teachers see this editor read-only, through `curriculum.review`, and cannot
save it.

- **When an exercise is multi-file.** An exercise is multi-file once it has
  more than one file. The exercise editor's code area becomes a file tree with
  tabs, as Elice's Skeleton Code does (research §3.3).
  - **Add file** (name, or one of the templates below), **Rename** and
    **Delete**.
  - Per-file switches: **Read-only**, **Hidden** and **Open by default**. At
    least one visible file must open by default.
  - A hidden file can be neither open by default nor read-only; it is never
    shown to learners.
- **Build** (the replacement for Elice's script):
  - **Compiled files:** a checklist of the exercise's source files. It
    defaults to every `.c` / `.cpp` file, in tree order, and at least one is
    required.
  - **Also compile files the learner adds:** off by default. Off matches Elice,
    where a script that names files ignores new ones (research §4.3). On is
    Elice's `gcc *.c`.
  - A read-only preview of the resulting command, for example
    `g++ main.cpp sum.c -o main`, with Cove's fixed flags (§4.3).
- **File tree for learners:** Closed (default), Open, or Disabled, as in
  Elice's Basic Info (research §3.5).
- **Solutions** become file sets: one tab per file, in the same tree. The
  "View solution" dialog shows them per file.
- **Templates** for a new multi-file exercise:
  - C: `main.c` + `sum.c` + `sum.h` (`sum.h` read-only);
  - C++: `main.cpp` + `rectangle.cpp` + `rectangle.h`.
- **Language rules:**
  - A **C** exercise allows `.c` and `.h`.
  - A **C++** exercise allows `.cpp`, `.cc`, `.c`, `.h` and `.hpp`. Every
    compiled file, `.c` included, is compiled as C++ by `g++`, so R1's
    `main.cpp` + `sum.c` links as it does on Elice (research §2).

### 3.2 Learning

- **The workspace:**
  - tabs for the files that open by default;
  - a file explorer, closed, open or absent as the author chose;
  - hidden files never listed;
  - read-only files with a banner, "This file is read-only.", and not editable.
- **Learner-created files:**
  - **New file** creates a file with an extension allowed by §3.1;
  - the learner may rename and delete their own files;
  - the author's files cannot be renamed or deleted (Elice shows both
    disabled).
- **Run, Test and Submit** send every visible file (§5.2). When a learner's
  file is not compiled (§3.1), the explorer marks it "not compiled". This fills
  the gap Elice leaves silent (research §4.3).
- **Diagnostics** keep GCC's text in the terminal (`sum.c:6:1: error: …`) and
  put markers in the matching tab. A diagnostic in a hidden file shows the file
  name and the message, but never its source line (§6).
- **Reset** resets the active file to the author's version, after confirmation,
  as on Elice. It deletes a learner-created file only on an explicit
  "Delete file".
- **History** keeps, for every Test, Submit and server Run, the file set that
  was compiled. The history view shows a file list beside the output (research
  §4.5).

### 3.3 Teaching and managing (Teacher, Team Lead, Manager)

A Teacher sees only assigned classes; Team Leads and Managers see the whole
academy. No permission changes.

- **Tutoring** (the staff student pane, live monitoring and the submission
  review) shows the learner's file tree and tabs, read-only. Edit mode works
  file by file, as live editing does today.
- **Submission history and manual review** show the file snapshot of each
  attempt. Score override and feedback are unchanged.
- **Dashboards** are unchanged. Run/Submit counts, scores and progress do not
  depend on files.

## 4. Files

### 4.1 Shape

One shared schema, `packages/shared/src/content/source-files.ts`:

```ts
type ExerciseFile = {
  path: string;          // §4.2
  content: string;
  readOnly: boolean;     // author files only
  hidden: boolean;       // author files only; never sent to learners
  openByDefault: boolean;
};
type ExerciseBuild = {
  sources: string[];               // paths, compile order
  includeLearnerSources: boolean;  // §3.1
};
type LearnerFiles = Record<string, string>; // path → content, visible files only
```

`sourceFilesSchema` in `packages/shared/src/content/manual.ts` is reused for
its limits only after the fix in §4.2. Manual materials keep their current
rule set.

### 4.2 Names, sizes and limits

- **Path:** 1–4 segments joined by `/`. Each segment matches
  `^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$`: it never starts with `-` or `.`, and is
  never `.` or `..`.
  - **Must fix:** the current `sourceFilesSchema` accepts a leading `-`. With
    file names on a compiler command line, `-wrapper,…` or `-o` would become a
    compiler option.
- **Uniqueness ignores case**, so `Sum.h` and `sum.h` cannot both exist (Linux
  would compile both, while macOS and Windows checkouts of an export would
  collide).
- **Extensions** are as in §3.1. In phase B, data files add `.txt`, `.csv` and
  `.dat`.
- **Limits:**
  - at most 32 files;
  - at most 100,000 characters per file (today's `codeChars`);
  - at most 256 KiB per file set (`DRAFT_MAX_BYTES`).

  Run, Test and Submit refuse a larger set with a message, never by
  truncating.

### 4.3 Compiling

- **Single-file exercises** compile exactly as today:
  - `GCC_COMPILE_ARGV`;
  - `main.c` / `main.cpp`;
  - the same cache key.

  They keep the current runtime identity's behaviour.
- **Multi-file exercises** compile with the same compiler and flags, with the
  build's sources in place of `main.c`:
  - **C:** `gcc-12 <sources…> -o /out/main -std=gnu11 -Wall -DONLINE_JUDGE -lm …`
  - **C++:** `g++-12 <sources…> -o /out/main -O2 -Wall -std=gnu++17 -DONLINE_JUDGE -I/opt/cove/pch …`

  Elice's R1 asks for `-std=c++11`. gnu++17 accepts that code, so no per-exercise
  standard is offered.
- **Headers** are never passed to the compiler. Quoted includes resolve beside
  the including file, so folders work without `-I`.
- **Each source argument is written as `./<path>`.** With the name rule above,
  no argument can begin with `-`.
- **The compile limits** (10 s CPU, 20 s wall, 64 MiB of scratch) cover the
  whole compile. Measure a 4-file C++ compile with `bits/stdc++.h` in every
  translation unit before release (§9).

## 5. Data and contracts

### 5.1 Database (additive, nullable)

| Table | Column | Meaning |
| --- | --- | --- |
| `programming_exercises` | `source_files jsonb null` | `ExerciseFile[]`; null = single-file (`starter_code`) |
| `programming_exercises` | `build jsonb null` | `ExerciseBuild`; required when `source_files` is set (check constraint) |
| `programming_exercises` | `file_tree_mode text not null default 'CLOSED'` | `CLOSED`, `OPEN` or `DISABLED` |
| `programming_exercise_solutions` | `files jsonb null` | Solution file set; null = `code` |
| `exercise_drafts` | `files jsonb null` | `LearnerFiles` (visible author files as edited, plus learner files) |
| `submissions` | `source_files jsonb null` | The **complete** compiled set (hidden files included) and the build, copied at admission |

- **`code` columns stay** and keep a readable value for older readers and
  lists: the first file that opens by default.
- **The submission snapshot holds the hidden files too**, so a regrade compiles
  exactly what was graded, in the same way that the grading profile is copied
  at admission and never read back.
- **Projections to learners** drop hidden files from `source_files`.
- **The staff-practice attempt JSON** gains the same `sourceFiles`.

### 5.2 Requests

The client never chooses read-only or hidden content. The server builds the
compiled set:

1. Take the exercise's files, or the submission snapshot's for regrades.
2. Overlay the learner's content for visible, non-read-only author files.
3. Add learner-created files, refusing any path that clashes with an author
   file.
4. Ignore any content sent for a read-only or hidden path. Content for an
   unknown author path is a validation error.
5. Validate §4.2 limits and compute the source list from the build.

**Contracts that gain an optional `files: LearnerFiles`.** It is required for a
multi-file exercise and refused for a single-file one, beside today's `code`:

- `saveDraftSchema` and the draft read (`packages/shared/src/content/learn.ts`);
- `practiceSubmitSchema`;
- `startSampleCheckSchema` and `startRunCheckSchema`
  (`packages/shared/src/content/sample-check.ts`);
- `submitExerciseSchema` (`packages/shared/src/content/submission.ts`);
- the exercise read for learners (`starterCode` →
  `files: ExerciseFile[]` without hidden files);
- the authoring schemas in `packages/shared/src/content/course.ts`;
- solutions (`packages/shared/src/content/solutions.ts`);
- the teacher progress and submission views (`teacher-progress.ts`);
- monitoring snapshots (`packages/shared/src/monitoring/events.ts`: `files`
  and `activeFile`, as manual materials already send).

### 5.3 Grader runtime (`packages/grading-runtime`)

- **`compileRequestSchema`** (`contract.ts`) gains
  `files?: { path, content }[]` and `sources?: string[]`, in place of `code`
  for multi-file. It validates §4.2 again inside the trusted service.
- **`compile()`** (`launcher.ts`):
  - creates the folders and writes each file `0444` under `/src`, instead of
    the single `GCC_SOURCE_NAME` write;
  - builds argv from the language's flags and `./` sources.
- **`compileKey`** hashes the runtime identity, the language, the sorted
  `(path, sha256(content))` pairs and the source list.
- **The manifest check** (`launcher.ts`, `GCC_COMPILE_ARGV` comparison)
  compares the flags with the source position as a placeholder. The descriptor
  in `packages/shared/src/native-grading.ts` changes, so the GCC runtime
  identity and queue names change. Treat this as a grader release (spec of
  2026-11-09 §9): queued GCC work for the old identity finishes on the old
  image.
- **Qualification** (`deploy/native/gcc-qualification.mjs`, `qualify-linux.sh`)
  gains these checks:
  - cross-file include and link;
  - `undefined reference` for a source left out of the build;
  - a `.c` file compiled as C++;
  - a hidden-file diagnostic that is redacted;
  - refusal of `-o`, `../x.c` and duplicate-case paths;
  - 32 files at the size limits;
  - the 4-file `bits/stdc++.h` compile time.

### 5.4 API (`packages/api`)

- **Composition (§5.2)** lives in one module beside `judge/grading-profile.ts`.
  Sample checks, run checks, submissions, staff practice and regrades all use
  it.
- **The grading service** (`judge/grading.service.ts`) and the sample-check
  store pass files to `compile`. Compile once, then run every case on the
  artifact, as today.
- **Drafts and collaboration:**
  - `ExerciseDraft.files` is saved with the same revision rules as `code`;
  - the collaboration document holds one `Y.Text` per path in a `Y.Map`;
  - `codeHash` hashes canonical JSON of the map.
- **Learner reads strip hidden files.** The authoring read returns everything
  to holders of `curriculum.review`: Teachers read-only, Team Leads and
  Managers editable. Writes require `curriculum.manage`, as today.
- **Library sync, course copy and import** (`library-sync/`,
  `content/import/`) copy `source_files`, `build`, `file_tree_mode` and the
  solution files. Elice zip import is phase B.

### 5.5 Web (`packages/web`)

- **A shared `SourceFileTabs` component** (tree, tabs, read-only banner and
  "not compiled" marker) is extracted from the manual workspace's file list.
  `source-file-name.ts` and `add-source-file.tsx` are generalized from `.py` to
  an allowed-extension list.
- **The learner workspace** (`learn/exercises/[materialId]/_components/editor-pane.tsx`
  and `workspace.tsx`):
  - one Monaco model per path;
  - the draft store (`_lib/draft-store.ts`, `_hooks/use-draft-autosave.ts`)
    keeps `files`;
  - Run, Test and Submit send `files`;
  - per-file reset.
- **Authoring** (`exercises/_components/exercise-workspace.tsx`,
  `_lib/exercise-draft.ts`): the file tree with the switches, the build
  checklist and command preview, the file-tree mode and the templates.
- **Diagnostics:** `parseGccDiagnostics` (`packages/shared/src/content/gcc-diagnostics.ts`)
  accepts any valid path and "In file included from" chains, and returns
  `{ path, line, column }`.
- **Teacher views:** the staff student pane, live monitoring
  (`components/monitoring/`), submission history
  (`components/student-history/submission-workspace.tsx`) and the solution
  dialog all use `SourceFileTabs`.
- **Every new string** goes into the Korean and English catalogs.

## 6. Security

- **Path rules** (§4.2) are enforced in `packages/shared`, the API and the
  grader. The grader never trusts the API's validation.
- **Hidden files:**
  - never in a learner projection: exercise read, draft, history, monitoring,
    submission view or solution;
  - compile diagnostics are filtered before they leave the grader result. For
    a hidden path, GCC's quoted source line and caret are replaced with
    "(hidden file)", and the location line is kept.
- **Read-only files** are enforced on the server, never only in the editor.
- **Learner-created files run with the learner's own code.** They add no
  capability that `main.c` does not have.

## 7. Database statements

Files live in columns of rows that are already read, so no read path gains a
statement. Lists, outlines and curriculum readers (`readCurricula`,
`withCurriculum`) must not select `source_files`, `build` or solution `files`,
following the select-only-what-is-used rule. Extend
`navigation-performance.integration.spec.ts`, or add a learn-workspace
counterpart, to count the statements of the exercise read, draft save, run
check and submit for a 3-file exercise, and record the counts in the commit.

## 8. Compatibility and rollback

- **Single-file exercises keep every column and behaviour.** Converting one
  starts a new `gradingRevision`.
- **Rows with `source_files` cannot be graded correctly by an older API**,
  which would compile `code` alone. Extend `deploy/scripts/check-language-floor.sh`
  (or add a sibling) so that `rollback.sh` refuses a target API image without
  `source_files` once any multi-file exercise or submission exists. Roll
  forward instead.
- **Deploy the API before the web**, as for C/C++ Run: an older API refuses
  `files`.

## 9. Verification

- **Unit:**
  - path and limit validation (leading `-`, `..`, case duplicates, extensions
    per language);
  - composition (read-only overlay ignored, hidden stripped, clash refused);
  - argv building;
  - cache key;
  - diagnostics parsing and hidden redaction.
- **Integration** (disposable Docker Postgres through
  `COVE_INTEGRATION_DATABASE_URL`):
  - authoring, draft, run check, submit and regrade for a 3-file exercise;
  - learner projections without hidden files;
  - statement counts (§7).
- **Grader:** the `gcc-contract` and `gcc-service` tests, plus the
  qualification checks in §5.3.
- **Browser:** extend `pnpm test:c-cpp:local` with R1 as a C++ exercise
  (`main.cpp`, `sum.c`, `sum.h`) and the same files as C (`main.c`).
  - **Learner:** solve, Run with typed input, Test, a compile error in `sum.c`
    with its marker in the `sum.c` tab, Submit 100, add `extra.c` (not
    compiled), and reset a file.
  - **Teacher:** tutoring view and history snapshot.
- **Capacity:** repeat the C++ Submit gate with the 4-file compile.

## 10. Decisions to confirm

| Question | Recommendation |
| --- | --- |
| Compile files the learner adds? | Author's choice per exercise, default **off** (Elice parity). |
| Allow a teacher shell script like Elice? | **No.** Structured build list only. Scripts would be teacher code run as host orchestration, and they cost the compile cache. |
| Folders in phase A? | Paths with `/` work in phase A, shown as a flat list. The tree UI and upload come in phase B. |
| Data files (`input.txt`) in phase A? | **Phase B**, together with the file I/O lessons of DC-C-2. |

## 11. Implementation notes (2026-11-19)

The decisions in §10 were taken as recommended: learner files compile only when
the author allows it (off by default), there is no shell script, folders are
paths shown in a flat list, and data files wait for phase B.

### 11.1 Departures from the text

- **A learner's files travel as one string, a file bundle, in the existing
  `code` field** (`encodeFileBundle` in `packages/shared/src/content/source-files.ts`).
  It replaces the separate `files` columns of §5.1 and the `files` contract
  fields of §5.2. Every file is a marker line `//@cove-file <path>` followed
  by its raw content.
  - **Why:** drafts, the live Yjs document, monitoring snapshots, the
    sample-check store, the judge queue, submissions, history and library
    copies already carry `code`, so they needed no change at all. Only the
    places that interpret code changed: compiling, the editors and the
    viewers.
  - **Raw contents** keep offsets plain for collaboration, and the marker is a
    C comment, so an old reader still shows readable text.
  - **A line starting with `//@cove-file` is refused inside a file.**
  - **Cost:** the whole set shares today's single-file limit of 100,000
    characters, and `ExerciseDraft`, `Submission` and solutions have no new
    columns.
- **The author's side is one column**, `programming_exercises.source_project`
  (jsonb: files with flags, `sources`, `includeLearnerSources`, `fileTree`;
  `exerciseProjectSchema`). It replaces `source_files`, `build` and
  `file_tree_mode`. A check constraint allows it only for C and C++.
  `starter_code` is always derived from it on the server (`starterBundleFor`,
  visible files only), so a hidden file cannot reach a learner through it.
- **Submissions freeze the project in a version 6 GCC policy snapshot**
  (version 5 plus `project`) instead of `submissions.source_files`. A judge
  that predates projects refuses version 6 as a configuration fault rather
  than compiling the bundle as one `main.c`. Regrades and repairs snapshot
  afresh, as before.
- **The GCC runtime identity does not change.** The compile request gains
  `files` and `sources` (`compileRequestSchema`). The argv is the descriptor's
  own, with `main.c` / `main.cpp` replaced by the sources
  (`gccCompileArgvFor`), so the manifest check, the queues and the identity
  are untouched.
- **Sources are passed as plain paths, not `./<path>`.** The path rule (no
  segment starts with `-` or `.`, no `..`, at most 4 segments, checked again in
  the grader) already makes an option impossible, and plain paths keep GCC's
  messages reading `sum.c:4:5`.
- **Composition failures are compile errors.** A bundle that names a reserved
  (hidden) path, a bad name, a duplicate or too many files is explained to the
  learner as `cove: error: …` and nothing is compiled (`compile-input.ts`).
  There is no separate admission check.
- **A Run appends the terminal prelude to every compiled source**, after its
  last line. Each copy is `static` and does the same thing.
- **Live code pointers work across files.** Editing, live collaboration
  and the teacher's live view go through `bindYTextToBundle`
  (`packages/web/src/lib/monitoring/yjs-bundle.ts`), which also registers the
  code pointer. A pointer is anchored in the bundle: the file's start plus
  the offset inside it. It is drawn only when the viewer shows the same file;
  otherwise the viewer's tab for that file shows a "live pointer is here"
  marker (`awareness/code-pointer.ts`). This works in both directions.
- **New strings** are in `common.source_files` (the editor, used everywhere) and
  in a new authoring-only namespace, `exercise-files`, because `content` is at
  its 15 KB cap.

### 11.2 Where it lives

| Layer | Files |
| --- | --- |
| Shared rules | `packages/shared/src/content/source-files.ts` (paths, bundle, project schema, composition, hidden-diagnostic redaction); `gcc-diagnostics.ts` (any path) |
| Grader | `packages/grading-runtime/src/contract.ts`, `policy.ts` (`gccCompileArgvFor`), `launcher.ts` (staging, cache key) |
| API | migration `20261119120000_exercise_source_project`; `judge/grading-profile.ts` (v6); `judge/compile-input.ts`; `judge/grading.service.ts`, `judge/sample-check.runner.ts`; `content/course.service.ts`, `content/exercise-project.ts`; `learn/learn.service.ts`, `learn/submission-admission-read.ts`; library copy, workbook import and library sync |
| Web | `components/editor/multi-file-editor.tsx`; `lib/monitoring/yjs-bundle.ts`; `lib/workspace/file-bundle.ts`; the learner workspace, staff tutoring pane, teacher live view and preview, submission review, history, solutions, authoring `project-editor.tsx` |

### 11.3 Verification

Recorded in
[the verification note](../../research/2026-11-19-c-cpp-multi-file-verification.md).
