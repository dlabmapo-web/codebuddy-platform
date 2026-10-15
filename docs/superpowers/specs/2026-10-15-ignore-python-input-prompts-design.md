# Ignore Python input prompts during grading

Date: 2026-10-15
Status: Implementation authorized by the user; local verification recorded below. Not deployed.
Code reviewed: checkout at `e325af1e`.

## Purpose and agreed direction

Teachers need students to practice `input("message")` without the prompt text
causing an otherwise correct answer to fail. Add an exercise-level option that
excludes Python input prompts during automated execution. Keep prompts visible
in interactive Run and keep the selected output comparator unchanged.

The user selected this direction after discussing Elice's alternative. This
document specifies the authorized implementation. Changing production exercises
or regrading existing submissions automatically remains outside this task.

Example student program:

```python
hour = input("몇 시?: ")
minute = input("몇 분?: ")
print(f"현재 {hour}시 {minute}분입니다.")
```

Test input contains values only:

```text
4
30
```

With the option enabled, automated execution produces only
`현재 4시 30분입니다.\n`. An equality comparator accepts that answer using its
existing whitespace rules. Interactive Run still shows both prompts and accepts
typed input normally. Extra text from `print()` remains output and can fail an
equality comparison.

## Evidence from the current code

Paths below are relative to the repository root.

| Source | Current behavior and design implication |
| --- | --- |
| `packages/shared/src/content/course.ts` | Defines legacy and enhanced grading profiles, five comparators, semantic versions, authoring schemas and defaults. Prompt handling must be independent of comparator and score mode. |
| `packages/api/prisma/schema.prisma` | Exercises have `gradingRevision`; submissions retain profile columns, frozen cases and an enhanced policy snapshot. Prompt handling needs exercise and submission persistence. |
| `packages/api/src/judge/grading-profile.ts` | Admission snapshots grading settings; workers resolve stored semantic versions and reject unsupported profiles. Enhanced policy snapshots currently accept versions 1 and 2. |
| `packages/api/src/judge/grading.service.ts` | Legacy grading calls the execution engine directly; enhanced grading uses the shared case evaluator. Both paths need the policy. |
| `packages/api/src/judge/case-evaluator.ts` | Runs enhanced cases for official submissions and server sample checks, then compares `run.stdout`. Suppress prompts before comparison, not in comparators. |
| `packages/api/src/judge/execution-engine.ts`, `sandbox-engine.ts`, `sandbox-protocol.ts` | Execution crosses a validated Unix-socket protocol, currently version 2. New execution behavior must be transmitted and version checked. |
| `packages/api/src/judge/pyodide-engine.ts`, `pyodide-runner.ts` | The engine sends code/stdin to a disposable child; the runner compiles `main.py` and calls Python's native input with byte-backed stdin. Install the input wrapper in the child before student execution. |
| `packages/api/src/judge/sample-check-snapshot.ts`, `sample-check.store.ts`, `sample-check.runner.ts` | Public checks freeze one case in Redis. Both legacy and enhanced checks must freeze prompt handling too. |
| `packages/web/src/lib/workspace/use-sample-runner.ts`, `sample-run.ts` | Browser fallback can currently judge legacy samples locally, while enhanced samples are unchecked without server checking. A new policy must not yield a misleading legacy local verdict. |
| `packages/web/public/pyodide-worker.js` | Browser execution has interactive input and input-echo events. Preserve this runtime's current prompt and transcript behavior. |
| `packages/api/src/content/course.service.ts` | Exercise changes compare grading profiles, increment grading revision and produce audit data. Include the new policy in this lifecycle. |
| `packages/api/src/content/library/academy-library.service.ts` | Library adoption explicitly copies grading fields. Add this policy to explicit copies and any other implemented course-copy path. |

The inspected Elice exercise used `stdout_match`; its grader checks whether the
expected string occurs anywhere in stdout. Our code already supports that
comparison. Elice's behavior is evidence for a workaround, not evidence that
Elice suppresses `input()` prompts. No Elice submission was executed during the
inspection, and the local checkout is not proof of production deployment state.

## Alternatives

1. **Runtime input wrapper, selected.** Suppress the native input prompt before
   it reaches stdout. Handles variable prompts, aliases and repeated calls while
   preserving comparison strictness and the student's source line numbers.
2. **Contains or regex comparator.** Already supported and useful when an author
   intentionally wants partial matching. Contains also accepts unrelated output
   and can accept `40` when expecting `4`; it does not satisfy prompt-only
   exclusion. Keep these comparators available without selecting them silently.
3. **Strip prompt text from captured stdout or rewrite source.** Output stripping
   cannot reliably distinguish prompts from identical answer text. Source
   rewriting complicates aliases, dynamic calls and tracebacks. Reject both.

## Authoring contract

Introduce `InputPromptPolicy` with values `INCLUDE` and `IGNORE`, represented in
shared schemas as `grading.inputPromptPolicy` and in persistence as
`inputPromptPolicy`. `INCLUDE` preserves today's behavior.

Add a checkbox or switch alongside exercise-level grading controls:

- Label: **Ignore input prompts during grading**.
- Help: **Exclude messages passed to Python input() from automated grading.
  Prompts remain visible when students run their code. Other output is checked
  using the selected answer rule.**

Provide English and Korean translations. The control is available in both
Standard (`LEGACY_STDIO`) and Weighted (`ELICE_STDIO`) modes and follows existing
edit permissions. Preserve its value when switching score modes; existing
resets of enhanced per-case fields must not reset this exercise-level choice.

Existing exercises and newly created exercises default to `INCLUDE`. Enabling
`IGNORE` is an explicit author decision. Enabling it does not change comparator,
expected output, input, score weights or timing limits. Show a short reminder to
keep only values in test input and omit prompts from expected answers.

Expose the effective policy in learner exercise data. For `IGNORE`, show a
concise notice near sample checking: **Input prompts are excluded during
grading.** Do not expose hidden cases or runtime configuration details.

## Execution semantics

Pass the policy through `ExecutionRequest`, the sandbox request, the child job
and the runner entry point. An omitted internal field on an old job means
`INCLUDE`; an explicitly unknown value is rejected, never treated as a default.

In the disposable Python child, capture native `builtins.input` before student
code runs. When policy is `IGNORE`, replace it with a wrapper that accepts the
same optional positional prompt argument and invokes captured native input
without a prompt. Preserve the positional-only contract: keyword prompts and
too many arguments still raise `TypeError`.

The wrapper must be installed before executing the unmodified compiled source.
Keep the existing `main.py` filename, namespace and exception/exit handling.
Do not wrap all stdout, redirect stdout around input, prepend lines to student
source, or pass expected answers into the child.

Required behavior:

- `input()`, `input("message")`, dynamic prompts, `builtins.input(...)` and
  aliases captured by student code after setup all consume input normally.
- Native input retains its string result, line consumption and EOF behavior.
  `sys.stdin.read()` and `readline()` are unchanged.
- Python still evaluates a prompt argument expression, including its side
  effects. The wrapper does not stringify the resulting prompt object; its
  `__str__` is not called. This is an intentional consequence of not displaying
  that object and must be documented and tested.
- `print("message")`, writes to stdout/stderr and output from evaluating an
  argument expression remain visible and count normally. Identical text in an
  answer is never removed by text matching.
- Student-defined or reassigned input functions remain student code; their
  writes are not automatically suppressed. This is a teaching compatibility
  feature, not a claim to identify every possible request for user input.
- No wrapper state survives to another run. Existing process isolation, output
  limits, timeout, memory, error and exit-status enforcement remain in force.

Server sample results and saved submission output contain the effective stdout
after prompt suppression. Do not add raw prompt transcripts or a second output
channel for this feature. Interactive terminal input echoes remain display
events and are not added to grader stdout.

## Persistence, compatibility and grading versions

Add non-null `inputPromptPolicy` columns to `ProgrammingExercise` and
`Submission`, defaulting/backfilling to `INCLUDE`. Use the existing repository
enum conventions. Historical records must retain their previous behavior.

Include the field in exercise read/write contracts, draft initialization,
serialization, profile comparison, audit payloads and learner reads. New
authoring writes must explicitly include it, following the current profile
schema's protection against silent resets. A stale client missing the field
must receive validation failure and refresh, rather than resetting `IGNORE`.

Add recognized semantic versions `legacy-v2` and `elice-v2` for `IGNORE`.
`legacy-v1` and `elice-v1` remain the versions for `INCLUDE`. Version selection
must depend on both mode and policy; do not make an unrelated save upgrade all
exercises through a changed global default. Reject inconsistent combinations,
such as `legacy-v1` with `IGNORE`, as configuration faults.

Freeze the policy on every new submission through `gradingSnapshotFor`.
Enhanced `IGNORE` submissions use policy snapshot version 3 with an explicit
prompt policy. Existing enhanced v1/v2 snapshots mean `INCLUDE`; keep reading
them unchanged. Validate snapshot version and semantic/prompt policy together.
Do not merely extend a schema that accepts every version with every policy.

Add the policy and semantic version to new Redis sample snapshots as well.
Missing fields on historical sample snapshots resolve to old include behavior;
unknown or inconsistent new combinations produce an unavailable check, not a
student failure. Workers must never read the current exercise to decide how to
execute an already admitted submission or sample check.

Changing the policy increments `gradingRevision` using the existing content
edit path and stale-progress behavior. It does not retroactively edit scores.
An explicit maintenance regrade snapshots the current exercise policy using
the existing regrade workflow; ordinary queued execution honors the admitted
snapshot. Include the policy in all explicit exercise selects used by admission
and regrade, not only the write helpers.

## Samples and interactive Run

Official grading and server public sample checks use identical input policy.
Pass the resolved setting through both the legacy direct execution path and
the enhanced shared evaluator.

Interactive Run continues to use the browser worker with normal prompts. Do
not add suppression to the generic browser runner for this first release.

When server sample checking is unavailable or disabled and policy is `IGNORE`,
the browser may run the sample for practice, but must report **unchecked** with
the existing checked-on-submit guidance. Suppress both pass and mismatch
verdicts from that fallback. It must not fall back to judging prompt-inclusive
stdout as if it were the official output. Existing `INCLUDE` behavior stays
unchanged. Carry policy into `comparesSampleLocally` and all callers; grading
mode alone is no longer sufficient to select a local verdict.

## Content movement and imports

Preserve the policy through library adoption and every implemented course
copy/export/import that carries exercise grading profiles. Locate explicit
field lists in both API services and shared import planning; a spread elsewhere
does not establish that all copies preserve it. New copies retain the source
policy while following the destination's existing revision/identity rules.

For existing workbook formats without this field: new exercises use `INCLUDE`;
updates preserve the stored policy. Add the field to grading-change detection
when explicitly supplied. Do not infer `IGNORE` from prompts in starter code,
from a Contains comparator, or from an imported Elice exercise. Historical
serialized formats must follow the same preserve-on-update rule. No new
workbook column or Elice parser is required in this release.

## Sandbox and rollout

Advance `SANDBOX_PROTOCOL_VERSION` from 2 to 3, validating the policy in requests
and transmitting it through `SandboxExecutionEngine` and `PyodideExecutionEngine`.
An incompatible sandbox fails warm-up; it must not silently discard the field.
Unsupported policies or versions are infrastructure/configuration faults and
must not create wrong-answer grades.

Deploy the additive database migration first. Pause admission and drain active
judge/sample work for the coordinated sandbox and worker protocol upgrade;
resume only when compatible components are healthy. Deploy API and web support
without enabling `IGNORE` for teachers until all consumers, including sample
workers, understand it. Unknown profile versions protect submission grading,
but do not substitute for this rollout ordering: old sample workers do not
necessarily reject new fields.

Validate one designated test exercise with Standard equality and server sample
checks, then Weighted equality and interactive Run. Enable the option only on
teacher-selected exercises. Do not mass-convert courses or automatically
regrade. Rollback must stop admission of `IGNORE` work and drain or hold affected
jobs before older workers return. Keep the additive columns; never reinterpret
`IGNORE` jobs as `INCLUDE` during rollback.

## Verification and acceptance

Extend focused existing tests rather than create a parallel grading harness.

| Area | Required evidence |
| --- | --- |
| Native runtime | Prompts suppressed only with `IGNORE`; two inputs, Unicode, no-argument input, dynamic prompts, aliases, `builtins.input`, EOF and positional argument errors. Test prompt-expression side effects and the intentional lack of prompt-object stringification. |
| Output strictness | The example passes equality. Wrong values, debug prints and extra stdout still fail equality. Answer text identical to a prompt is retained. Stderr and runtime failures remain correctly classified. |
| Isolation and limits | A following job uses its own policy; timeout, memory/output limits and existing host/exit defenses still apply. Include runtime tests with real isolated child execution. |
| Versioning | Old rows and snapshots include prompts; ignore snapshots select new semantics. Reject inconsistent/unknown policies and versions. Sandbox v2/v3 mismatch fails safely. |
| Snapshots and revisions | A policy edit increments revision. Work admitted before the edit keeps its original policy. Explicit regrade snapshots the updated policy. |
| Sample parity | Server samples and Submit agree for both score modes. Browser fallback for `IGNORE` reports unchecked; interactive Run displays prompts. |
| Authoring | Save/reload in both modes preserves policy; mode switching retains it; read-only users cannot change it; stale writes do not reset it. Verify English/Korean labels. |
| Content movement | Copy/adoption retains policy; old-format imports default new exercises to include and preserve existing ignore settings on update. |

Run shared/API/web type checks, relevant unit/integration suites, lint and
translation validation after implementation. Before any Next.js code changes,
read the relevant installed guide under `node_modules/next/dist/docs/` as
required by repository instructions. A documentation-only change needs no
runtime test run and makes no production verification claim.

Completion means a teacher can enable this option, keep `STDOUT` equality, and
accept the example without prompt text in expected output. Ordinary extra
printed text must still fail. Existing exercises, interactive prompts and
historical grading behavior remain unchanged unless explicitly opted in or
regraded.


## Implementation and verification record

Implemented on branch `feat/ignore-python-input-prompts`:

- Added required authoring policy, exercise/submission persistence and migration
  `20261015080000_input_prompt_policy`. Existing/default content uses `INCLUDE`.
- Added `legacy-v2`/`elice-v2` and enhanced snapshot v3 for `IGNORE`. Stored-version
  dispatch is independent of the version used to author new exercises. Redis
  sample snapshots preserve policy and reject unsupported combinations.
- Advanced the sandbox protocol to v3 and installed the native-input wrapper in
  each opted-in disposable runner. Comparators and interactive Run are unchanged.
- Added the English/Korean authoring control, mode-switch/draft preservation,
  learner notice and unchecked browser fallback. Preserved policy in library
  copies, monitoring data and regrade selection; workbook updates omit the
  policy and therefore retain the stored choice.

Validation performed locally:

- Shared package: 854 tests passed. Web: 1,218 tests passed, including the
  authoring control and sample-workspace regression suites.
- Real runner/sandbox/large-case transport: 94 tests passed with one test worker.
  Focused API suites passed for grading, snapshots, sample checks, submission
  admission, authoring, library copying, import and regrade behavior.
- Type checks passed for shared, API, web and E2E TypeScript. Prisma schema
  validation passed. Web lint had zero errors and 86 warnings in existing code.
  Translation checks passed, including 126 catalog tests.
- Applied all 56 migrations to a disposable PostgreSQL 17 database, including
  the new migration. Database-backed grading and sample integration suites
  cover both modes, save/read, queued-policy preservation and rejection of
  extra printed output: 8 submission integration tests and 16 public-sample
  integration tests passed.

The disposable database needed minimal Supabase roles plus auth/storage schema
stubs to apply existing unrelated migrations. These tests exercise grading,
not Supabase storage authorization. They do not modify the shared development
or production database. An existing integration assertion used an obsolete
100 ms comparator default; it now compares against the profile actually authored.

An initial parallel runner test pass refused two executions because host memory
measurement was unavailable. The subsequent serial runtime suite passed all 94
tests; this does not establish the cause of the earlier measurement failures.
No production build, production migration, deployment, mass opt-in or regrade
was performed. UI verification used component tests, not a manual browser or
mobile session. Follow the coordinated rollout section before enabling this
option in production.
