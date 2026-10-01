# Cove grading: buildable implementation spec

Date: 2026-09-10
Status: Milestones 0–2 implemented and tested, including the student-code sandbox (§7.2). Milestone 3 authoring is partly delivered: the editor writes weighted profiles, but reference validation runs and publication diffs remain. Milestones 4–7 proposed.
Source baseline: local HEAD `68e12de`, verified by reading the files cited below.

## 1. What this document is for

Two documents already exist and both remain authoritative in their own domain:

- [Elice grading compatibility spec](../../design/2026-09-10-elice-grading-compatibility-spec.md) — observed Elice comparator behavior, generated grader logic, worked examples, and the V1–V12 verification register. **Authoritative for what Elice does.**
- [Cove grading roles and implementation design](./2026-09-10-cove-grading-roles-and-implementation-design.md) — role-to-page mapping, permission grants, class assessment policy, adjustment lifecycle, head-office operations. **Authoritative for who may do what, and where.**

Neither is buildable as written, by design: the first says "names are proposed schema concepts, not existing API fields," and the second says "names are design concepts, not existing Prisma model names." This document supplies the missing layer — real model names, real field names, real function signatures, real file paths, real migration order — to guide implementation. Milestones 0–4 are the immediate delivery scope; milestones 5–7 require their own concrete data/API additions before implementation. Security exit gates require demonstrated behavior, not merely following the proposed mechanism.

Where this document and the other two disagree about the current state of the code, this one wins, because its claims were re-verified against HEAD. Where they disagree about intent, they win.

The original draft records an execution experiment below. Its output is retained as reported evidence; this correction reviewed source but did not independently rerun that experiment. Reproduce it in isolated local tests before treating it as verified release evidence. They are in sections 2 and 3 because they must be settled before any Elice feature work starts.

## 2. P0: warm-interpreter poisoning is a live vulnerability at HEAD

This is not a compatibility gap and it does not wait for a milestone.

### 2.1 The defect

[`pyodide-engine.ts`](../../../packages/api/src/judge/pyodide-engine.ts) keeps a pool of long-lived `RuntimeThread`s, one per `JUDGE_CONCURRENCY` slot, alive for the life of the judge process. Between individual case executions, [`pyodide-thread.ts:120`](../../../packages/api/src/judge/pyodide-thread.ts#L120) resets a thread with:

```js
await pyodide.runPythonAsync("globals().clear()\n" + HARNESS)
```

`globals().clear()` clears the module namespace. It does **not** clear `sys.modules`. The harness re-runs `import sys, io, json, traceback`, which returns the same cached module objects the previous student's code could reach — and the harness serializes every result through `json.dumps`.

### 2.2 Reported local execution experiment — reproduce as a regression

The original draft reports running the exact `HARNESS` and reset sequence against the repo's own `pyodide` (`node_modules/pyodide`, engine version `pyodide-0.27.5`). Student A submitted:

```python
import json
_real = json.dumps
def _evil(obj, *a, **k):
    if isinstance(obj, dict) and 'stdout' in obj:
        obj = {'stdout': 'FORGED-CORRECT-OUTPUT', 'stderr': '', 'error': None}
    return _real(obj, *a, **k)
json.dumps = _evil
```

Every subsequent run on that thread returned:

```text
A (attacker) -> {"stdout": "FORGED-CORRECT-OUTPUT", "stderr": "", "error": null}
B (victim)   -> {"stdout": "FORGED-CORRECT-OUTPUT", "stderr": "", "error": null}
C           -> {"stdout": "FORGED-CORRECT-OUTPUT", "stderr": "", "error": null}
D           -> {"stdout": "FORGED-CORRECT-OUTPUT", "stderr": "", "error": null}
```

Student B's genuine output never reached the grader. The effect is persistent until the judge process restarts, not scoped to one submission.

### 2.3 Impact

`caseOutcomeFor` in [`grading.ts`](../../../packages/api/src/judge/grading.ts) compares this `stdout` against the expected output. So roughly six lines of ordinary Python, submitted by any student with submit access, can:

- replace reported output/error metadata on the current and subsequent executions of a contaminated interpreter; a forged pass depends on the comparator and expected output matching the forged value;
- overwrite the graded output of every other student routed to that thread, producing mass false verdicts in either direction;
- potentially contaminate additional workers through repeated execution; N submissions do not guarantee reaching N workers because pool scheduling determines assignment.

`bestScore`, `StudentExerciseProgress`, point awards and class rankings all read the resulting verdict, and `nextProgress` makes `SOLVED` permanent — so forged passes are not self-correcting after a restart.

The [research spec §9](../../design/2026-09-10-elice-grading-compatibility-spec.md) lists this row as "Isolation | Warm Pyodide interpreter threads | Audit cross-run state." The reported experiment and current harness identify a concrete isolation and result-integrity defect to reproduce and fix; they do not establish that the entire runtime security audit is complete.

### 2.4 Required fix, before milestone 1

Two independent boundaries must hold: one execution cannot contaminate another, and student code cannot forge the trusted result of its own execution. Recycling alone addresses only the first.

**Choose fresh execution state per case for the initial fix.** `GradingService` invokes `engine.run()` once per case; `release()` therefore runs once per case, not once per submission. Retire each used worker and replace it rather than returning it to the available pool. This also matches the observed Elice fresh-process-per-case behavior more closely. A future submission lease would require explicit acquire/runCase/dispose APIs and would still need fresh case state; it is not a one-file optimization.

Bound the number of executing, warming, and spare workers together. A warm spare can reduce startup latency but cannot guarantee zero waits under sustained load. Measure startup, peak memory, throughput and 50-submission latency. Handle initialization failure, shutdown, pending waiters, duplicate replies and replacement failure without stranding promises or reusing failed workers.

**Result integrity is a separate required implementation task.** The current harness calls student-mutable Python functions to create `stdout`, error metadata and JSON. Do not accept that JSON as a trusted verdict channel. Capture output and execution termination through a host-controlled boundary outside the student's mutable interpreter, keep expected outputs and comparators outside it, and validate messages by job identity. Audit Python-to-JavaScript bridging and access to host callbacks/message channels: moving serialization into JavaScript is not sufficient if student code can invoke or modify that boundary. If Pyodide cannot demonstrate this boundary, use an isolated runner process/container with parent-captured stdout/stderr and exit status before shipping the fix. Do not substitute a fresh module registry or module restoration for isolation.

**Hard deadline:** the parent may signal an interrupt at the execution deadline, but must terminate and replace an unresponsive worker after a bounded grace interval (initial policy: 100 ms). Late replies are ignored; each pending request settles exactly once. Include startup watchdogs (initial policy: 30 seconds), shutdown cancellation and bounded replacement retries. Cooperative interruption alone is not a security boundary. Expected execution timeout is distinct from worker startup/crash infrastructure failure.

**Exit gate:** add local regression coverage in `pyodide-engine.spec.ts` and appropriate harness/runner tests; no Git commit is implied. Verify both the attacker's own result integrity and the next execution's genuine output. Cover mutation of serializer, builtins, stdout helpers and error handlers, cross-case and cross-student state, caught/ignored interrupts, worker crashes, late messages and teardown. Demonstrate host/network/filesystem isolation appropriate for student code. Do not release milestone 0 based only on student B's output becoming correct.

### 2.5 Delivered

Implemented as specified in §2.4, with one deviation and one measured cost, both below.

**Execution moved out of the judge process.** Worker threads could not hold this boundary. Probing the current design confirmed that Pyodide hands Python the host `globalThis` as the `js` module and that `js.Function` is arbitrary JavaScript, so student code in a thread could read `js.process.env` — the judge's `DATABASE_URL` and `REDIS_URL` among it — and could call `js.process.exit` to take the whole judge down. `packages/api/src/judge/pyodide-runner.ts` is now a child process, spawned with `env: {}`, used for exactly one case and killed afterwards.

**Fresh state per case, not per submission.** `release()` runs once per case because `GradingService` calls `engine.run()` once per case; `grading.service.ts` is unchanged.

**Result integrity is host-owned.** Nothing student-mutable reports the verdict any more. Program output leaves through the child's real stdout and is read by the parent from the OS pipe; failure is the child's exit status, set in the host frame from the exception `runPythonAsync` raises, not from Python. Expected outputs and the comparator never enter the child. Rebinding `json.dumps`, `print`, `sys.stdout`, `sys.stderr` or `sys.excepthook` now only changes what that student's own program writes.

**Hard deadline.** At the deadline the parent signals `SIGTERM`, then `SIGKILL`s after a 100 ms grace — a WASM loop never services the signal, so the kill is what ends it. Startup watchdog 30 s, bounded spawn retries (3, 1 s apart), waiters rejected rather than stranded when spawning is exhausted, and each request settles exactly once regardless of the order the pipes, timer and exit event arrive in.

**Deviation from the draft:** the control descriptor is a `net.Socket`, not `fs.createReadStream`. A read stream on a pipe goes through the libuv threadpool and parks a thread in a blocking `read` that the process cannot exit out of — which silently defeated the exit status, since that *is* the verdict channel. Diagnosed by instrumenting the runner: `process.exit` and even `process.reallyExit` executed and returned nothing while the process stayed alive.

Verification — `pyodide-engine.spec.ts`, 42 tests across the exit gate's categories:

| Category | Covered |
| --- | --- |
| Result integrity | rebound `json.dumps`; rebound `print` builtin; rebound `sys.stdout`; suppressed error path (`excepthook` + `sys.stderr`) cannot hide a crash; a rebound `process.exit` cannot turn a raised exception into a pass; no exit path is reachable at all |
| Production build | the judge worker's include names the runner, so a built judge ships one |
| Output draining | a large burst before exit arrives whole; stderr survives a crash straight after writing |
| Shutdown | `dispose` does not return while runners it started are still warming |
| Cross-execution state | poisoned module not carried forward; globals not leaked; per-case freshness within one submission |
| Host isolation | canary + `DATABASE_URL`/`REDIS_URL` unreadable from `js.process.env`; judge survives `js.process.exit` |
| Deadlines | busy loop; loop swallowing interrupts; crashed runner reported as `RUNTIME_ERROR`, not a pass; stdout capped at 256 KB |
| Ordinary execution | stdin/stdout round trip; exception type and message; concurrent cases do not share a process |
| Stdio fidelity | output with no trailing newline; non-ASCII bytes; stdin read to EOF, with and without input; `EOFError` past the end |
| Host lockdown | network denied through the `js` bridge; `fetch` gone; `process.binding` gone; `kill`/`ppid`/`abort` gone; Python confined to the in-memory FS |
| Output decoding | multi-byte characters split across pipe chunks; large multi-byte streams |
| Memory monitoring | refuses to grade when memory cannot be measured; enforces the limit from an injected reader |
| Resource limits | memory growth beyond the limit ends the case as `MEMORY_LIMIT`; a runner ignoring SIGTERM leaves no surviving process |
| Pool lifecycle | total processes never exceed `capacity + spare`; waiters rejected on dispose rather than stranded; unspawnable runner fails instead of hanging; a runner killed mid-run settles once, as `RUNTIME_ERROR` |

Writing the bound test found a real defect in the first cut of this milestone: `top_up()` added `waiters.length` to the target, so two executing runners plus two queued cases spawned three more — six processes against a bound of three, roughly 1 GB where 500 MB was intended. A queue spike would have become memory exhaustion rather than a queue. Fixed, and the test fails against the old expression.

`packages/api`: 995 tests pass, no unhandled rejections. Workspace `tsc --noEmit` clean, lint clean. `pyodide-thread.ts` is deleted.

**Review findings, all four fixed.**

*Forced termination could be skipped.* `kill()` guarded the SIGKILL on `child.killed`, which means "a signal was delivered", not "the process is gone" — so after the deadline's SIGTERM it was already true and the kill never happened. The case still settled as `TIME_LIMIT`, so the verdict looked right while the program kept running: a runaway held CPU indefinitely with its slot counted as freed. Now only actual exit ends the job, and the kill targets the process *group* (`detached: true` plus `process.kill(-pid)`), so descendants die too. The regression test asserts the specific pid is gone rather than asserting the verdict, because the verdict never showed the bug.

*Reading stdin until EOF hung.* The `stdin` callback returned `""` for exhausted input, which the line-oriented adapter does not treat as EOF: `sys.stdin.read()` spun until the case died on its time limit. Now `setStdin({ read })` returns `0`, which is EOF. Tested with input present, with no input at all, and reading past the supplied data (`EOFError`, as CPython raises).

*Output without a trailing newline disappeared.* Not the callback losing data — Python block-buffers stdout, so `print(123, end="")` was still in the buffer at exit. The runner now sets `PYTHONUNBUFFERED=1`, which is what `python3 -u` gives Elice's runner, and captures bytes via `setStdout({ write })` rather than lines. Tested for trailing text and non-ASCII.

*The child process is not a security sandbox.* Correct, and it still is not one. Node's permission model was the intended fix and **cannot be used at all**: Pyodide calls `process.binding`, which `--permission` refuses unconditionally with no `--allow-*` flag to re-enable it, so the interpreter never boots. Verified directly. What ships instead is `lockDownHost()` in the runner, applied after Pyodide is warm and before student code runs: the connecting entry points of `net`/`http`/`https`/`http2`/`tls`/`dgram`/`dns`, all of `child_process`, the host-touching surface of `fs` and `fs.promises`, `vm`, `worker_threads.Worker`, the `fetch`/`WebSocket`/`XMLHttpRequest` globals, and `process.binding`/`process.dlopen`. Patching the CommonJS export objects covers `import("node:fs")` too, since builtin ESM namespaces are built from them — verified including through `new Function('return import("node:fs")')`. `worker_threads` matters as much as the rest, because a worker would come up with a fresh, unpatched module registry.

Python's own filesystem view was already confined to Pyodide's in-memory FS, and there is a test pinning that.

**This is a denylist, not a sandbox, and it should not be described as one.** It raises the cost of an escape over a large API surface; it does not prove escape is impossible. OS-level isolation — a container, nsjail, seccomp — remains the boundary to rely on, and is a deployment concern this file cannot assert. Memory is now genuinely enforced: the parent samples the runner's RSS every 100 ms and ends the case as `MEMORY_LIMIT` on growth beyond `memoryLimitMb`, measured as growth from the idle interpreter rather than absolute RSS, since a warm Pyodide is ~170 MB before the student's first statement.

**Second review round, all four addressed.**

*Host isolation still bypassable.* Correct on both counts: `js.process.kill` was callable and `js.process.ppid` exposed the judge, so a student could stop the judge itself. `kill`, `ppid`, `pid` and `abort` are now removed alongside `binding` and `dlopen`, with a test. **The finding's conclusion still stands and is not answered by that patch.** The runner shares the judge's OS identity, filesystem and network namespace, and the container cannot simply be cut off: the database is external (Supavisor), so `judge-worker` genuinely needs `egress`. `cap_drop: ALL` is added to that service with the reasoning recorded beside it, but real separation means running student execution in its own network-isolated sandbox — a separate container, nsjail, or gVisor — which is architecture, not configuration. Until that exists, milestone 0 is closed against the code and open against the deployment.

*Split UTF-8 corrupted.* Real, and reproduced: each pipe chunk was decoded independently, so a character whose bytes straddled a boundary became replacement characters and the comparison failed on correct output. Bytes are now accumulated and decoded once, for stdout and stderr alike. The test writes one Korean character a byte at a time with a flush between, and returns the corrupted form against the old code.

*Memory enforcement vanished when `ps` failed.* Also real, and worse than it looked: the production image installs no `procps`, so the fallback would have been missing in production while passing locally. Measurement now reads `/proc/<pid>/statm` first — a plain file read, nothing to install — and keeps `ps` only for macOS. It fails closed, and measurability is checked *before* the job reaches the runner, because a program finishing in twenty milliseconds would otherwise settle long before any blind-sample threshold and be graded with no ceiling. An unmeasurable case throws, which `GradingService` records as a judge fault costing the student no attempt. The reader is injected, so both the fail-closed path and the limit itself are tested without depending on the host. RSS polling remains a sampling ceiling rather than a hard one — a fast enough allocation can cross the limit between two 100 ms samples — and a real ceiling needs a cgroup on the sandbox.

*Cleanup was asynchronous.* The replacement was spawned while the retired runner was still dying, briefly putting `capacity + spare + 1` interpreters on the host, and more if one died slowly. Termination is now awaited before the slot is released and the replacement started.

**Third review round.**

*The production build omitted the runner.* `packages/judge-worker/tsconfig.json` still named the deleted `pyodide-thread.ts`, and because the runner is spawned by path rather than imported, TypeScript never discovered it through the module graph — a production build shipped an engine whose runner did not exist. The include now names `pyodide-runner.ts`; a clean `rm -rf dist && pnpm build` emits it, and the built engine was run directly from `dist` to confirm the production branch boots a runner and grades (`21` → `42`), which no test had exercised before, since every run so far went through the development transpile path. A test asserts the include, because nothing else fails when it is wrong.

*Student code could still suppress a runtime failure.* Confirmed exactly as reported: replacing `process.exit` through the `js` bridge turned a raised `ValueError` into `PASSED`, traceback and all. The runner now captures `reallyExit` and the stdout/stderr writes into bound module-scope constants **before any student code exists**, and `lockDownHost` deletes `exit` and `reallyExit` from `process` entirely — deciding the exit status is the host's job, never the program's. Termination goes through the captured `reallyExit` rather than `exit`, because `exit` looks up `process.reallyExit` by name at call time and that name is deliberately gone; output is flushed explicitly first. Verified against the reported reproduction, in development and against the production build.

The reviewer's framing is right and worth keeping: this was a same-run integrity defect, and OS isolation would not have fixed it. Sandboxing and result integrity are separate problems, and only the second is now closed.

**Fourth review round — two lifecycle findings, both source-review rather than reproduction.**

*Output was finalized before the pipes finished draining.* `exit` means the process is gone; it does not mean its stdio is drained, and Node documents that the streams may still be open. Normal results now settle on `close`, with the parent deadline unchanged and a 2 s fallback so a lost `close` cannot hang a case past its own limit. `dispose` waits on the same event.

Honest about the evidence: **the tests added here do not fail against the old code on this machine.** Eight runs at 250 KB, and the burst-then-crash case, all delivered complete output before `exit` fired — the runner flushes explicitly before terminating and a local pipe is read quickly. The fix is correct by construction rather than by demonstration, and the two tests are regression coverage for the guarantee, not proof that the race was reachable here. It is likelier to matter under load, on a slower filesystem, or with a busier event loop.

*Shutdown did not await warming processes.* Real, and demonstrable. Warming runners were tracked by a counter, so `dispose` knew how many were booting but not which processes they were, and returned while they were still coming up. They are now held in a set and disposed alongside live and idle runners. The test checks survivors **the instant `dispose` returns**, with no grace period — an earlier version that slept afterwards passed against the broken code too, because a warming runner does eventually tear itself down once its boot finishes. Against the counter-only version it now reports three surviving pids.

**Measured cost — this is the trade and it is not small.** Per-case fresh processes are ~800 ms each, against ~11 ms for a case on an already-warm pool:

| Measure | Result |
| --- | --- |
| Warm-up, 3 processes | 1.08 s |
| Single case, warm pool | 24 ms |
| 50 submissions × 3 cases, concurrency 2 | 56.6 s total, 2.65 cases/s |
| Submission latency | p50 2.22 s, p95 2.88 s, max 3.56 s |
| Peak RSS, 5 processes | 749 MB (~170 MB per runner) |

So a three-case submission costs ~2.4 s and a five-case one ~4 s, and memory scales linearly with `capacity + spare` at roughly 170 MB per runner — the binding constraint on `JUDGE_CONCURRENCY` for a small VPS. The spare shortens the wait but cannot remove it under sustained load, exactly as §2.4 anticipated.

**Still open after this milestone.** OS-level isolation, as above: the lockdown is a denylist and the exit gate's "demonstrate host/network/filesystem isolation" is met by construction rather than by enforcement. Until a container or nsjail profile is in place, milestone 0 should be treated as closed against the code and open against the deployment.

## 3. Use a separate, versioned Python comparator

Both existing specs treat Python-regex parity as a major open architectural question. The research spec §3.3 requires Cove to "either execute a pinned Python-compatible matcher with a parent-enforced resource budget, or clearly publish a restricted supported subset," and the roles spec §5.1 warns "JavaScript regex is not an interchangeable Python implementation." Both are correct, and both were written as if a Python matcher would have to be acquired.

It does not. **The judge already hosts CPython.** Pyodide is CPython compiled to WebAssembly, so `re.search` with real Python semantics — inline flags, `\d` Unicode classes, lookarounds, backreferences, `$` matching before a final newline — is already in the process. So is `str.splitlines()` and `str.rstrip()`, which are exactly the primitives the observed Elice normalizer is built from (research spec §3.1).

Using Python avoids reproducing Python normalization and regex behavior in JavaScript. It does not by itself prove parity with Elice's runtime version or resource behavior. Pin and record both Pyodide and Python versions and verify Unicode/regex fixtures against the supported profile. Remaining Elice runtime differences stay in V5.

### 3.1 Constraint that makes it safe

The comparator must never run in an interpreter that has executed student code — otherwise section 2's attack simply retargets `re.search`. Therefore:

- Add a **second, dedicated worker pool** for comparison, structurally similar to `RuntimeThread` but which never receives `ExecutionRequest.code`. It receives only versioned structured comparator data and returns a discriminated result: match, no-match, invalid-pattern, timeout, or infrastructure-error. Never interpolate strings into executable Python; pass them as data. Matcher timeout/error is not a student wrong answer.
- Give each comparison a parent-owned budget (initial default: 100 ms, recorded in the policy snapshot), bounded inputs/patterns, and the interrupt-plus-forced-termination mechanism from section 2.4. Test catastrophic backtracking and a deliberately nonresponsive worker; do not assume every regex path promptly handles an interrupt.
- Healthy comparator threads may be reused because they never execute submitted code; patterns and strings are still untrusted data. Retire threads after timeout/protocol failure. Comparator threads are not recycled per submission, so section 2's startup cost does not apply here.

### 3.2 Consequence for the browser

Sample runs in [`sample-run.ts:32`](../../../packages/web/src/lib/workspace/sample-run.ts#L32) currently use a JavaScript normalizer that is byte-identical to the server's — an invariant the server file comments demand ("Must stay identical to the browser's `normalizeSampleOutput`"). Under a Python comparator that invariant cannot be preserved in JavaScript for the regex comparators.

Resolution: the browser workspace already runs Pyodide for sample execution. Use a separate clean Web Worker/interpreter for sample comparison, never the interpreter that executed student code. Share versioned comparator source and fixtures between browser and judge. The outer browser context terminates overdue comparator workers and recreates them. Browser results are advisory; the server computes all stored grades independently. Where a comparator cannot run in the browser, mark the sample result explicitly "checked on submit" rather than silently applying different semantics. Hidden patterns are never sent to the browser regardless.

## 4. Schema deltas — real names

The research spec §10.1 proposes a "grading profile" object as if from scratch. Most of it already exists under different names, which makes the migration far smaller than either document implies.

**Already present at HEAD** ([`schema.prisma:1600`](../../../packages/api/prisma/schema.prisma#L1600)): `Submission.gradingRevision`, `Submission.timeLimitMs`, `Submission.memoryLimitMb`, `Submission.engineVersion`, `Submission.regradeRunId`, and — most importantly — **`SubmissionGradingCase`, a per-submission immutable snapshot of every case's `input`, `expectedOutput`, and `isSample`**. The "snapshot the profile on submission" requirement is not new work; it is an extension of a table that already does it.

New fields, all additive and nullable-or-defaulted so existing rows keep their meaning:

| Model | Field | Type / default | Purpose |
| --- | --- | --- | --- |
| new enum | `CaseComparator` | `STDOUT`, `STDOUT_MATCH`, `STDOUT_NOMATCH`, `STDOUT_REGEX`, `STDOUT_REGEX_NOMATCH` | Explicit uppercase internal mapping to Elice's lowercase generated identifiers (research spec §3) so import maps one-to-one |
| new enum | `GradingProfileMode` | `LEGACY_STDIO`, `ELICE_STDIO` | `CUSTOM` is deliberately absent until section 7 |
| `ProgrammingExercise` | `gradingMode` | `GradingProfileMode @default(LEGACY_STDIO)` | Opt-in switch; backfill is a default, not a data migration |
| `ExerciseTestCase` | `comparator` | `CaseComparator @default(STDOUT)` | |
| `ExerciseTestCase` | `weight` | `Int @default(1)` | Nonnegative; equal weights reproduce today's equal-case percentage exactly |
| `ExerciseTestCase` | `timeLimitMsOverride` | `Int?` | Per-case hard limit |
| `ExerciseTestCase` | `softTimeLimitMs` / `softPenalty` | `Int?` / `Int?` | Paired; validated `0 < soft < hard` and `0 <= penalty <= weight` |
| `ExerciseTestCase` | `label` | `String?` | |
| `SubmissionGradingCase` | `comparator`, `weight`, `timeLimitMsOverride`, `softTimeLimitMs`, `softPenalty`, `label` | mirrored | The snapshot must carry them or a regrade reinterprets old work |
| `Submission` | `earnedWeight` / `possibleWeight` | `Int?` / `Int?` | Null on legacy rows |
| `SubmissionCase` | `awardedWeight` | `Int?` | |
| `CaseOutcome` | add `PASSED_WITH_WARNING` | | Soft-timeout result (research spec §5.3) |

### 4.1 Required immutable profile fields

Add these before enabling enhanced profiles; values are copied at submission admission and never read back from mutable exercise settings during grading:

| Models | Fields | Contract |
| --- | --- | --- |
| `ProgrammingExercise`, `Submission` | `gradingMode`, `gradingSemanticVersion` | Legacy defaults `LEGACY_STDIO` / `legacy-v1`; new profiles explicitly use a supported version |
| Same | `totalTimeLimitMs`, `comparatorTimeLimitMs` | Nullable for legacy; required positive bounded values for enhanced mode |
| Same | `continuationPolicy`, `exitStatusPolicy` | Validated enums: `LEGACY_STOP_ON_RESOURCE` / `CONTINUE_WITHIN_BUDGET`; initial exit policy `FAIL_ON_RUNTIME_ERROR` |
| Same | `materialMaximumHundredths`, `materialScorePolicy` | Nullable legacy; enhanced profiles require maximum and `PROPORTIONAL` or `ABSOLUTE_CAP` |
| Same | `feedbackPolicy` | Versioned, runtime-validated JSON for six message templates and permitted case-detail visibility; no arbitrary expressions |
| `Submission` | `gradingPolicySnapshot` | Validated versioned JSON containing effective ceilings, output cap, comparator budget and runtime identity; no secrets |
| `Submission` | `appliedScoreHundredths` | Nullable integer; derived material score, never overwrite normalized `score` |
| `Submission` | `gradingAborted`, `gradingAbortReason` | Default false / nullable typed reason: total deadline, infrastructure failure, or policy revocation |
| `SubmissionGradingCase` | `effectiveTimeLimitMs` | Resolved immutable case limit; nullable for legacy rows that use submission default |
| `SubmissionCase` | `executionState` | `EXECUTED` or `NOT_RUN`; newly persisted skipped cases must not masquerade as executed wrong answers |

Use the existing `engineVersion` plus the policy snapshot to record exact runtime identity. A constant in source selects a version for new profiles; it never replaces a version stored with historical data. Unknown versions fail closed as infrastructure/configuration errors. Preserve compatible workers/readers for supported historical snapshots.

`PROPORTIONAL`: `appliedScoreHundredths = roundHalfUp(earnedWeight * materialMaximumHundredths / possibleWeight)`. `ABSOLUTE_CAP`: `min(materialMaximumHundredths, earnedWeight * 100)`. Raw weights are integer point units. Use bounded integer arithmetic; validate aggregate weights and multiplication against storage limits. Require positive possible weight for scored publication. This proportional formula is Cove policy, not verified Elice Relative parity.

Class assessment revisions, adjustment records, author validation records and policy administration need concrete models/API contracts before their respective milestones. Author validation must bind source/profile/runtime digests and must never create a real student attempt; milestone 3 cannot launch without that contract. The role design specifies their behavior; this table does not pretend those later models already exist.

`Submission.score` keeps its current meaning and its current comment: 0–100, every problem worth the same. Both existing specs are right that it must not be repurposed. New scoring writes `earnedWeight`/`possibleWeight` and *derives* `score` through one function, so `bestScore`, records, rankings, points and teacher analytics keep reading the column they read today.

Adding `PASSED_WITH_WARNING` to `CaseOutcome` is the one change that is not purely additive in effect: it is a shared enum in [`submission.ts:32`](../../../packages/shared/src/content/submission.ts#L32) and every exhaustive `switch` over it must be found and handled before the migration lands. Treat that as a task, not a footnote.

## 5. Shared contract deltas — real names

In [`packages/shared/src/content/course.ts`](../../../packages/shared/src/content/course.ts):

- `exerciseTestCaseDraftSchema` (line 234) gains `comparator`, `weight`, and the optional limit fields. It currently caps `input` and `expectedOutput` at `100_000` characters; the research spec notes Elice's editor displays a 50,000 counter. Do not lower Cove's cap to match an unverified display limit (research spec V11) — validate on import instead.
- `testCases: z.array(...).max(50)` (line 270) stays at 50 until an authoring need is demonstrated.
- Add `programmingExerciseGradingModeSchema` and a registry of supported semantic versions. Persist the selected version in exercise/submission fields and dispatch using that stored value; browser sample payloads carry the version too.

## 6. Grading kernel — real signatures

[`grading.ts`](../../../packages/api/src/judge/grading.ts) is already a pure, dependency-free, tested module and is the right home. It keeps its current exports unchanged for `LEGACY_STDIO`.

`normalizeOutput` stays exactly as it is — it defines legacy semantics and changing it would silently rescore historical work. Elice-mode normalization is a *new* function, not an edit to this one.

Additions:

```ts
export function awardedWeightFor(input: {
  outcome: CaseOutcome; weight: number; softPenalty: number | null;
}): number;

export function scoreWeightedRun(input: {
  earnedWeight: number; possibleWeight: number;
}): number;   // -> 0-100, roundHalfUp, for Submission.score

export function shouldAbortEnhancedRun(input: {
  deadlineExceeded: boolean;
  infrastructureFailed: boolean;
  policyRevoked: boolean;
}): boolean;
```

Keep `shouldStopAfter` unchanged for legacy mode. Enhanced mode continues after wrong output, runtime error and individual case timeout, using fresh case execution state. An isolated enforced memory-limit failure may also continue if the worker can be safely replaced; unrecoverable runner failure aborts as infrastructure failure.

The parent starts the total execution budget when a grading job is claimed; startup/replacement, case execution and matching consume it. Queue wait is measured separately. Enforce each operation against the lesser of its own budget and the remaining total budget. On total expiry, terminate active work, record `gradingAborted=true` with its reason, and mark remaining cases `NOT_RUN`. Partial earned weights remain diagnostic; do not finalize them as a completed grade or update best score/completion/rewards. This is an explicit Cove policy for unverified Elice overall-timeout behavior (V3).

Enhanced decision order: infrastructure/protocol errors abort; hard execution timeout and enforced memory failures produce their resource verdict; runtime error produces `RUNTIME_ERROR`; otherwise compare output, award zero on mismatch, apply a soft penalty only on a match with duration strictly greater than the soft threshold, else award full weight. Comparator timeout/invalid pattern is a grader error, never `WRONG_OUTPUT`. Keep runtime-error-before-comparison as an explicit divergence pending V2.

`PASSED_WITH_WARNING` counts as an output-correct case but awards `weight - softPenalty`. Extend aggregate status/progress logic deliberately: warnings alone do not make a fully executed run fail correctness, while weighted percentage may be below 100. Never infer full points from passed-count or status. Audit rewards and completion consumers against that distinction.

## 7. Milestones

Sequenced so that nothing is authorable before a worker enforces it, per roles spec §11.

| # | Deliverable | Exit gate |
| --- | --- | --- |
| **0** ✅ | Section 2 fresh execution, trusted result capture and hard termination | Result integrity, termination, stdio fidelity, resource limits and the build gap pinned by 42 tests. The sandbox boundary is closed by §7.2: student code runs in a separate network-less, secret-less container, one uid per case, demonstrated against the real image. |
| 1 ✅ | Section 4 migration; section 5 contracts; `PASSED_WITH_WARNING` switch audit; legacy backfill | `grading.spec.ts` and `grading.service.spec.ts` green with zero score changes on existing fixtures |
| 2 ✅ | Python comparator pool (section 3); five comparators; weights; soft limits; per-case + total budgets | Research spec §13 differential matrix passes; hard termination bounds catastrophic matching; wired into grading by §7.2. Elice-executed comparisons are still to be recorded separately. |
| 3 | Authoring in existing `answers-editor.tsx` + library editor; reference-solution validation runs; publication diff | Team Lead and Manager independently publish the 30/30/40 fixture; adoption preserves it |
| 4 | Student/teacher delivery; browser sample agreement (section 3.2); weighted records | End-to-end verdicts consistent; private cases and patterns never leave the server |
| 5 | Academy Results board; adjustment lifecycle; extended Maintenance | Roles spec §12 scope and audit scenarios |
| 6 | Class assessment policy; Manager defaults; head-office ceilings and operations | Concurrent last-attempt admission is race-safe; legacy classes unchanged |
| 7 | Custom graders, native runtime, remaining V1–V12 probes | Separate security acceptance; not in scope for a parity claim |

Milestone 3 onward touches Next.js routes: read the relevant guides in `node_modules/next/dist/docs/` first, per AGENTS.md.

### 7.1 Delivered so far

**Milestone 1 — complete.** Seven enums and every §4/§4.1 field are in `schema.prisma`; migration `20260910000000_elice_grading_profile` is written **and applied** to the development database. It is additive and defaulted, so existing exercises stay `LEGACY_STDIO` with equal weights and unchanged scores; the one data statement backfills `execution_state = 'NOT_RUN'` for historical `SKIPPED` cases, which the `EXECUTED` default would otherwise have made readable as executed wrong answers.

The `PASSED_WITH_WARNING` audit was the real work, as §4 warned. Typecheck found five consumers; a value-comparison sweep found four more it could not see — `submissionStatusFor`, `summarizeRun`, teacher progress and the workspace metrics all read `=== "PASSED"` as "correct". A warning *is* correct and only the points differ, so all four now go through one shared `isOutputCorrect()` predicate rather than four comparisons free to drift apart. EN and KO strings added for the new outcome in three key groups.

Contracts in `@cove/shared`: `caseComparatorSchema`, `programmingExerciseGradingModeSchema`, a `gradingSemanticVersions` registry with `currentEliceSemanticVersion`, and `exerciseTestCaseDraftSchema` extended with comparator, weight and limits — with refinements enforcing soft-limit/penalty pairing, penalty ≤ weight, and soft < hard.

**Milestone 2 — comparator and kernel done, not yet wired.** `comparator-pool.ts`, `comparator-thread.ts` and `comparator-runner.ts` implement all five modes in real CPython, in interpreters that never receive submitted code. Strings cross as data bound to a Python variable, never interpolated into source. Each comparison carries a parent-owned budget (default 100 ms) enforced by interrupt then forced termination, and a thread that misses its deadline is destroyed and replaced rather than trusted to be idle.

28 differential tests from research-spec §13 pass, including the rows a JavaScript port gets wrong: form feed as a line break (Python's `splitlines`), `$` matching before a final newline, inline flags, lookarounds and backreferences, `contains` on empty text making a negative rule unpassable, catastrophic backtracking hitting the budget, an invalid pattern reported as a grader fault rather than `WRONG_OUTPUT`, and quote-laden or Python-looking output treated as text.

The kernel gained `awardedWeightFor`, `scoreWeightedRun`, `appliedScoreHundredthsFor` and `shouldAbortEnhancedRun` with 43 tests, including the 30/30/40 fixture returning 40/60/100 where equal weighting says 33/67/100, and the case §6 insists on: a run of warnings is fully correct and still worth less than full marks.

**Comparator concurrency review — both findings fixed.**

*Overlapping requests corrupted each other.* Round-robin without a lease put two comparisons on one interpreter, and the second overwrote the first's settle handler, so a matching pair returned `timeout`. The pool now leases a thread exclusively with a waiting queue, and the thread checks the reply id, discarding a late answer to an abandoned request instead of delivering it to whoever is waiting now.

*The hard-kill timer was never cancelled.* A comparison that answered inside the grace window left the timer armed, and it later destroyed a worker busy with somebody else's work. Both timers are now owned by the pending record and cleared together, and a thread that was interrupted is retired before anything can reuse it.

Investigating the first fix surfaced something worth recording: **Python's `re` engine does not service the interrupt during catastrophic backtracking.** A standalone probe ran until killed. The interrupt is delivered to Pyodide's asyncio loop instead and surfaces as a `PythonError` whose traceback has nothing to do with the author's pattern — which the pool was reporting as a grader error. Cooperative interruption is a courtesy here; forced termination is the mechanism, exactly as §2.4 says of the runner. Once a deadline has fired the verdict is `timeout`, and a result that genuinely completed in the grace window is still honoured.

Three regression tests cover it, and all three fail against the previous code — the first with the reported symptom, a matching pair returning `timeout`.

**What has not changed:** no submission uses any of this yet. `GradingService` still runs the legacy path exclusively, so student-visible behaviour is identical. Wiring the enhanced path — profile dispatch, per-case comparator selection, weighted totals, continue-within-budget and abort handling — is the remaining half of milestone 2.

`packages/api`: 1038 tests pass; workspace typecheck and lint clean.

### 7.2 Review round: settings dropped, legacy-only grading, comparator lifecycle, sandbox

Four findings against the branch. All four are fixed.

**Grading settings were silently dropped.** The contract accepted comparator, weight and limits, and nothing wrote them. The fields had defaults on the wire too, so the editor — which sent only input, output and visibility — would have saved a 30/30/40 problem back as 1/1/1. Now:

- Every case field and the exercise-level profile (`grading`) are *required* on create and update, never defaulted.
- `gradingProfileIssues` (shared by editor and server) rejects what legacy grading cannot honour, rather than storing it unused. It also rejects a weighted profile worth nothing, a soft limit at or above the hard one, a case limit above the run's, and a negative rule on empty text.
- `CourseService` persists, serializes and audits all of it. A change to any grading-affecting field — including a weight alone — bumps the revision.
- One snapshot function (`grading-profile.ts`) freezes profile, cases, resolved per-case limits and a versioned policy snapshot. Both admission paths use it: `SubmissionService` and maintenance regrade.
- Library adoption copies the profile.
- A workbook cannot express weights, so an import that would change a weighted problem's tests is refused at planning (`weighted_tests_not_importable`). A weighted problem's cases are never rewritten on commit.

**Student submissions used legacy grading.** `GradingService` now dispatches on the snapshotted mode *and* semantic version, and fails closed on anything unrecognised. That includes an unknown version, a missing policy snapshot, a weighted profile worth nothing, and a legacy snapshot carrying enhanced settings. Admission refuses the same profiles before an attempt exists.

The enhanced path follows the §6 decision order:

- Each case gets its own comparator (the CPython pool), its own limit capped by the remaining total budget, and its soft penalty.
- It continues past wrong answers, crashes and individual timeouts.
- A comparator timeout, invalid pattern or failure, an engine fault, and the total deadline all abort as `ERRORED` with `gradingAborted`, remaining cases `NOT_RUN`, and no progress, attempt or points. None of them becomes `WRONG_OUTPUT`.
- Legacy grading is unchanged except that its skipped cases are now written `NOT_RUN`.

The student sees earned/possible points beside the score, and per-case points. A slow-but-correct case is no longer picked as "the failure". A sample run on a weighted problem shows its output and says the verdict is decided on Submit, instead of judging it by the browser's legacy normalizer.

**Comparator shutdown left work running.** The pool tracked only idle threads. It now tracks every thread (idle, leased, starting) and `dispose` returns only once each has stopped; a leased comparison settles as a grader error rather than running to its deadline. A thread that exits unexpectedly settles its request immediately. Replacement retries are bounded, and a failure is persistent: a caller with nothing idle, leased or starting fails at once and triggers a background recovery, instead of queueing forever. A retirement reserves its replacement's slot synchronously, so no caller sees an empty pool mid-replacement. `comparator-thread.ts` was also missing from the judge-worker build include — the same gap the runner had — and is now shipped and pinned by a test.

**Student execution now has an enforced sandbox boundary.** `judge-sandbox` is a separate container from the same image (`sandbox.main.ts`):

- `network_mode: none`, no `env_file`, and a read-only root with a small noexec tmpfs.
- Root with every capability dropped except SETUID, SETGID and KILL, which it uses to spawn each runner under its own uid.
- Each uid is swept of leftover processes before it is reused.
- The judge reaches it only through a Unix socket that is `0660` in the judge's group, over a versioned, size-capped protocol. The judge validates every reply by request id and schema; anything else is an infrastructure fault.
- The sandbox verifies its own isolation at boot and exits 78 if it can see a network interface, a secret-looking variable, or lacks identity switching.
- The production judge refuses to start without `JUDGE_SANDBOX_SOCKET`, and refuses a sandbox whose version differs or that did not verify its isolation.

Demonstrated against the built image, not argued:

| Probe | Result |
| --- | --- |
| Sandbox self-check in its compose configuration | `isolated: true`; socket `srw-rw---- 0:1001`; three warm runners at uids 20000–20002; server CapEff `0xe0` (KILL, SETGID, SETUID); a runner's CapEff `0` |
| Judge-uid container, `network: none`, socket mounted read-only | warm-up verified; `print(a+b)` → `PASSED 42`; each case under a fresh uid; `js.process.env` empty; `js.fetch` gone; `process.kill`/`exit` gone → `RUNTIME_ERROR`; busy loop → `TIME_LIMIT`; memory growth → `MEMORY_LIMIT` |
| A runner uid with native code, i.e. the JS denylist fully bypassed | server and other runners' `environ`/`mem` → `EACCES`; signalling either → `EPERM`; TCP → `ENETUNREACH`; DNS → `EAI_AGAIN`; judge socket → `EACCES`; image filesystem → `EROFS`; interfaces: `lo` only |
| Misconfigured sandbox | with a network, with `DATABASE_URL`/`REDIS_URL`, or as uid 1001: refuses, exit 78 |
| Production judge without a sandbox socket | refuses to start |

The per-case memory limit is still RSS sampling inside the sandbox (see §2.5). The container's own `mem_limit`/`pids_limit` are now the hard ceiling, and they bound a runaway to the sandbox rather than the judge.

**The decisive test** (`weighted-grading.integration.spec.ts`, opt-in with `COVE_INTEGRATION_DATABASE_URL`):

- Setup: a fresh PostgreSQL with every migration applied, real `CourseService`/`SubmissionService`/`GradingService`, a real runner per case and the real comparator.
- A Manager authors E2 at 30/30/40 through the create contract. It reads back as written.
- Real student submissions passing only the third case, the first two, and all three are shown **40, 60 and 100**. They print trailing spaces that only the Elice normalizer forgives, so the legacy path would have scored 0.
- Each row carries the frozen profile, weights, resolved limits and `appliedScoreHundredths` 4000/6000/10000. Progress ends `SOLVED`, best 100, three attempts.
- A submission queued before the Manager reweighted to 50/25/25 still grades 40; the next grades 25.

**Follow-up review: two correctness gaps, both fixed.**

*The total deadline could be exceeded waiting for a comparator.* A comparison's budget started only once it had an interpreter, and nothing checked the deadline before finalizing.
- The pool now takes the submission's absolute `deadlineAt`, so queueing counts. A waiter still queued at the deadline leaves the queue.
- A comparison cut short by the deadline returns `deadline`, distinct from its own `timeout`; the grader aborts it as `TOTAL_DEADLINE`.
- The grader re-checks the deadline after every run, after every comparison, and once more before finalizing. A result that arrives late — for example after waiting for a runner — is aborted, not graded.

*Recorded runtime versions were not enforced.* Weighted grading is now refused as `RUNTIME_VERSION_MISMATCH` (a judge fault, no attempt) unless the runner and comparator running now are the ones the policy snapshot records.
- Both report their *actual* runtime: the engine reads the installed `pyodide` package and refuses a `PYODIDE_VERSION` that disagrees; each comparator thread reports `pyodide.version` when it becomes ready.
- The pool refuses a replacement reporting a different version, or none, so it never mixes runtimes.
- Legacy grading is deliberately not gated this way, to keep its behaviour unchanged. After an upgrade, a maintenance regrade snapshots against the new runtime and is the audited way forward.

**Still open:**

- Reference-solution validation runs and the publication diff (milestone 3).
- Regex syntax is checked by the grader, not on save: a bad pattern surfaces as a judge error, never a wrong answer.
- The browser does not yet run the Python comparator for samples (§3.2).
- Message templates (`feedbackPolicy`) are neither authored nor applied.
- The integration test drives the in-process engine; the sandbox round trip is covered separately in `sandbox.spec.ts` and in the container probes above.

## 8. Explicitly deferred

- **`CUSTOM` grading mode.** Adding a regex selector is not custom-grader support (roles spec §10). Private bundle storage, an approved runtime, an isolated sandbox and a trusted score channel are a milestone of their own.
- **Per-submission memory enforcement.** `memoryLimitMb` is snapshotted on `Submission` and passed into `ExecutionRequest` at [`submission.service.ts:157`](../../../packages/api/src/learn/submission.service.ts#L157), but `pyodide-thread.ts` contains no memory handling at all — the field is accepted and ignored. Roles spec §5.1 is right that no editable memory control may ship before the runner enforces one. Until then hide the editable control and label any displayed value as requested/not enforced. A per-exercise memory guarantee is deferred, but host protection is not: demonstrate an enforceable runner-level memory ceiling and recovery under staging memory pressure before enabling new workloads. A shared container ceiling alone is not per-student isolation.
- **Elice Relative grading.** V1 is unresolved and it is Elice's *default* mode, so no Elice course using defaults can be imported faithfully yet. This is more load-bearing than its single register row suggests. Absolute mode (`min(materialPoints, rawScore)`) is implementable now; Relative is blocked on evidence.

## 9. What a first release may claim

After milestones 0–4, and only for scenarios actually executed and recorded in the verification report (do not relabel local derived fixtures as Elice-tested): *"Cove supports Elice-style weighted STDIO grading with all five comparators and Python-compatible matching, verified against the scenarios in the research spec on this runtime version."*

Not "Elice parity." Parity additionally requires custom graders, manual grading, Relative-mode evidence, and the applicable V1–V12 probes.

## 10. Migration and review gates

1. Inventory schema enums, all result serializers, copy/adoption/import/version flows, snapshots, worker dispatch, browser sample paths, and downstream progress/points consumers.
2. Add compatible nullable/defaulted fields and readers. Default existing rows to legacy semantics; do not recompute scores or infer new metadata for old records. Review generated migration SQL rather than assuming defaults require no migration work.
3. Deploy workers and API readers supporting both modes before any new enum values or enhanced jobs are emitted. Update every exhaustive case-outcome handler, including warning and skipped-result presentation.
4. Enable enhanced authoring only after reference validation, server-enforced ceilings, result privacy and profile snapshot tests pass. Reject unsupported imported grading fields rather than dropping them.
5. Verify immutable queued revisions, duplicate delivery, repair attempt counts, points reconciliation, timeout recovery and role boundaries. Benchmark startup/memory costs of fresh case execution with representative 1/5/10/50 submission batches.
6. Roll back by disabling enhanced admission and authoring while retaining compatible workers for queued snapshots. Never let old workers reinterpret enhanced snapshots.

No production test, deployment, source-code implementation or commit is performed by editing this specification. Implementation begins with milestone 0; passing its tests is required before proceeding to feature rollout.
