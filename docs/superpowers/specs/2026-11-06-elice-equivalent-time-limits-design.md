# Elice-equivalent time limits on the Pyodide grader

Date: 2026-11-06. Status: approved direction, pending implementation on
`fix/grading-and-turtle`.

## User direction

Students' correct solutions to imported Elice problems fail with "Time limit
exceeded" on Cove. The owner asked for **the same behaviour as Elice**: a
program that finishes within a problem's limit on Elice must pass on Cove, and
one too slow for Elice must still fail. The rule applies **until the native
grader** (`feat/native-grading-classroom-capacity`) replaces Pyodide, and to
**all Python problems**, not only imported ones: Cove-authored problems use the
same 3-second default, which assumes native Python speed.

## Current behaviour and evidence

Every case is executed by Pyodide 0.27.5 (CPython compiled to WebAssembly) in
the `judge-sandbox` container. The authored limit (`timeLimitMs`, default
3,000 ms, per-case `timeLimitMsOverride` up to 60 s) is enforced directly on
Pyodide's wall time.

Observed on production (6 Nov 2026, AWS): problem "[도전 기출문제] 대피소"
(brute force over `itertools.combinations`, 50 houses, Manhattan distance).
Cases with small input took 54–68 ms; the 50-house sample case was stopped at
**3,021 ms** with `TIME_LIMIT`. The same program is accepted on Elice.

Local measurement of an equivalent program on the same input size (Apple M2):

| Runtime | Time |
| --- | --- |
| Native CPython 3.13 | 562–623 ms |
| Pyodide 0.27.5 in Node 22 | 1,464–1,566 ms (about 2.5×) |

In production the gap widens: the sandbox is capped at 1.5 CPUs and warms the
next runners while a case executes, so the running case gets less CPU. That
contention is addressed separately (sandbox resources); this design addresses
the systematic interpreter slowdown.

## Approach

Measure student programs in **Elice-equivalent time**. The grader multiplies
every execution limit it gives Pyodide by a fixed **time scale** `s` and divides
every runtime Pyodide reports by `s`:

```
enforced limit (Pyodide wall time) = ceil(authored limit × s)
reported runtime                   = round(Pyodide runtime / s)
```

A program passes exactly when `Pyodide runtime ≤ s × limit`, i.e. when its
Elice-equivalent runtime is within the authored limit. Everything downstream
(verdicts, budgets, soft-limit penalties, displayed times, stored `runtimeMs`)
then works in authored units unchanged.

Rejected alternatives:

- **Raise limits in content** (per problem or by migration): edits authored
  data, needs repeating for every import, and becomes wrong once the native
  grader arrives.
- **Scale only imported problems:** needs a reliable "came from Elice" marker
  that does not exist for all content; Cove problems share the same default
  and the same slowdown.
- **Show raw Pyodide times with larger limits:** students would see times 2.5×
  Elice's for the same program and a limit that does not match the problem.

## Design

### 1. One time scale per execution engine

`ExecutionEngine` gains an optional `readonly timeScale?: number` (default 1).
A new decorator, `TimeScaledEngine` (`packages/api/src/judge/time-scaled-engine.ts`),
wraps any engine:

- `run(request)` calls the inner engine with
  `timeLimitMs: Math.ceil(request.timeLimitMs * scale)` and returns the result
  with `runtimeMs: Math.round(result.runtimeMs / scale)`. Outcome, output,
  truncation and errors pass through untouched.
- `version` and `dispose` pass through. The engine version recorded on
  submissions (`pyodide-0.27.5`) does not change, so existing weighted policy
  snapshots keep matching (`runtimeMismatch`).
- `timeScale` exposes `scale`.

`judge.main.ts` wraps the sandbox engine (and the development in-process
engine) with the configured scale. `GradingService`'s telemetry wrapper and
any other wrapper must forward `timeScale`.

The native grader will use scale 1: it already runs native CPython, so the
rule ends with that engine without further change.

### 2. Wall-clock deadlines in engine-consistent units

Execution limits are in authored units; deadlines are wall clock. Wherever the
two meet, wall-clock time is converted with the same scale:

- `GradingService.gradeElice`: `deadline = claimedAt + totalTimeLimitMs × s +
  GRADING_OVERHEAD_MS`. The cumulative `executionBudgetMs` stays in authored
  units (it subtracts reported runtimes).
- `SampleCheckRunner`: the same for its `deadlineAt`
  (`snapshot.totalTimeLimitMs × s`).
- `evaluateEnhancedCase`: the limit passed to the engine is
  `min(studentLimit, remainingWallMs / s)`, so the scaled limit never exceeds
  the remaining wall-clock budget. The existing rule "a TIME_LIMIT caused by
  the infrastructure deadline is `deadline`, not a student verdict" is kept.
- Legacy (Standard) grading has no whole-run deadline; it only uses the case
  limit, which the engine scales.

### 3. Penalty thresholds and stored times

`eliceCaseDecisionFor` compares the reported runtime with `softTimeLimitMs`.
Because the reported runtime is already Elice-equivalent, soft-limit
penalties keep their authored meaning without change.

`SubmissionCase.runtimeMs` and `Submission.runtimeMs` written after the
release are Elice-equivalent; older rows remain raw Pyodide time. Teacher and
analytics views that show runtimes are informational only, so no data
migration is needed. The scale is logged in the judge's startup
`judge.config` record for audit.

### 4. Stuck-job threshold

`judge.main.ts` marks a submission or staff practice attempt that stays
`RUNNING` past `STALE_AFTER_MS` (10 minutes) as lost. With scaled budgets the
longest legitimate weighted run is `300 s × s` plus overhead. The threshold
becomes `max(10 minutes, 300_000 × s + 60_000)` (13.5 minutes at `s = 2.5`).

### 5. Configuration

- New judge setting `JUDGE_TIME_SCALE`, decimal, **1–5**, default **1** in the
  environment schema, so local development and tests are unchanged.
- `deploy/compose.production.yml` passes
  `JUDGE_TIME_SCALE: ${JUDGE_TIME_SCALE:-2.5}` to `judge-worker`;
  `deploy/deployment.env.example` documents it. Production starts at **2.5**
  (the measured slowdown) and can be tuned in `/opt/cove/deployment.env`
  without a release, followed by a redeploy.
- The upper bound keeps every scaled case limit within the sandbox protocol's
  300 s ceiling (60 s × 5).
- The sandbox container is unchanged: it enforces whatever limit it receives.

### 6. What does not change

- Authored content, problem editor and limits shown to authors.
- Memory limits, output limits, comparator budgets and their timeouts.
- The in-browser **Run** button (no time limit) and Turtle runtimes.
- Results of past submissions. Students resubmit; a platform admin may regrade,
  which applies the current scale.

## Risks

- **The real slowdown varies by program** (about 1.5–4×; string-heavy and
  recursion-heavy code differs from arithmetic loops). A single scale is an
  approximation; 2.5 is the measured value for typical brute-force code. Too
  high lets some Elice-TLE solutions pass; too low keeps some false TLEs.
  Mitigation: tune with `JUDGE_TIME_SCALE` after measuring on AWS with
  `JUDGE_TRACE_TIMINGS=true`.
- **Longer worst-case occupancy:** a genuinely infinite loop now holds a
  runner 2.5× longer (7.5 s instead of 3 s at the default limit), reducing
  throughput during classes. Acceptable at current load; the native grader and
  the sandbox resource work reduce it.
- **Mixed stored runtimes** before and after the release (section 3).

## Acceptance criteria

1. With `JUDGE_TIME_SCALE=2.5`, a case whose Pyodide run takes 6,000 ms under a
   3,000 ms limit is `PASSED` and reports 2,400 ms; one taking 8,000 ms is
   `TIME_LIMIT`, and its reported runtime does not exceed the limit by more
   than rounding.
2. Weighted grading: a 10-case run whose Elice-equivalent total fits the
   whole-run limit completes without `TOTAL_DEADLINE`; one exceeding it still
   aborts as today. Soft-limit penalties apply on Elice-equivalent time.
3. Run sample uses the same scaled limits and deadlines as Submit for the same
   case, so a sample passes in Run sample exactly when it passes on Submit.
4. Standard (legacy) grading uses the scaled case limit; its stop-after-timeout
   behaviour is unchanged.
5. With the default scale 1, every existing judge test passes unchanged.
6. The 50-house brute-force program from the evidence above passes its sample
   with a 3 s limit through the real Pyodide engine at scale 2.5.
7. The judge logs `timeScale` at startup; production `judge-worker` runs with
   2.5 after deployment.

## Implementation surfaces and validation

| Surface | Change |
| --- | --- |
| `packages/api/src/judge/execution-engine.ts` | optional `timeScale` |
| `packages/api/src/judge/time-scaled-engine.ts` (new) + spec | decorator |
| `packages/api/src/judge/judge.main.ts` | wrap engine; stale threshold; log scale |
| `packages/api/src/judge/grading.service.ts` | forward `timeScale`; scaled weighted deadline |
| `packages/api/src/judge/case-evaluator.ts` | remaining wall time ÷ scale |
| `packages/api/src/judge/sample-check.runner.ts` | scaled deadline |
| `packages/api/src/config/env.schema.ts` | `JUDGE_TIME_SCALE` (1–5, default 1) |
| `deploy/compose.production.yml`, `deploy/deployment.env.example` | production default 2.5 |
| `docs/operations/runtime-performance.md` | document the setting |

Validation: unit tests for the decorator, deadlines (weighted, sample check),
soft limits and the stale threshold; existing judge suites at scale 1; one
real-Pyodide test for criterion 6; then the full release checks in
`deployment-guide-aws.local.md` §2 and `validate-local.sh`. Release as the next
v2 tag; after deployment confirm the judge's `judge.config` log shows
`timeScale: 2.5` and resubmit the 대피소 problem.
