# Local native grading prototype verification

Date: 2026-10-27. User approved this local-only experiment. Production was not
paused, reconfigured or deployed; no grades, points or historical records were
changed. The approved experiment is complete. Production acceptance is not.

## Result

Fresh native CPython guests substantially reduced multiple-case execution time
in this local fixture. A single prepared Pyodide case remained faster. Native
execution still exceeded five seconds under two simultaneous submissions, before
admission, queueing or saving a grade. Keep Pyodide as the production engine.
The evidence justifies a separate production runtime design, not a default switch.

| Synthetic submission | Runs per engine | Pyodide median / slowest (s) | Native median / slowest (s) |
| --- | ---: | ---: | ---: |
| 1 case, sequential | 3 | 0.042 / 0.066 | 0.137 / 0.268 |
| 5 cases, sequential | 3 | 6.435 / 6.859 | 1.822 / 2.070 |
| 10 cases, sequential | 3 | 12.397 / 13.777 | 2.626 / 3.038 |
| 10 cases, two simultaneous submissions | 4 in two batches | 24.830 / 31.802 | 4.800 / 5.887 |

Each engine completed 13 synthetic submissions / 88 timed cases with zero
incorrect results or transport errors. These are small diagnostic cohorts.
The table uses nearest-rank p50 (including the lower central observation for
four runs), and the raw nearest-rank p95 equals the maximum at these sample sizes; it is not a
production p95 estimate or the original 100-submission acceptance cohort.

[Native 1](assets/2026-10-27-native-grading-prototype/native-c1.json),
[5](assets/2026-10-27-native-grading-prototype/native-c5.json),
[10](assets/2026-10-27-native-grading-prototype/native-c10.json),
[10 with parallel 2](assets/2026-10-27-native-grading-prototype/native-c10-p2.json).
[Pyodide 1](assets/2026-10-27-native-grading-prototype/pyodide-c1.json),
[5](assets/2026-10-27-native-grading-prototype/pyodide-c5.json),
[10](assets/2026-10-27-native-grading-prototype/pyodide-c10.json),
[10 with parallel 2](assets/2026-10-27-native-grading-prototype/pyodide-c10-p2.json).

## Reproducibility and timing boundary

The baseline was built locally from a clean `git archive` of deployed revision
`af8c54aedfcc69adac07dd3e0435b3827a1a5c27`, using
`deploy/docker/judge-worker.Dockerfile` and the frozen lockfile. It is a
**deployed-source rebuild, not the exported live image**. Its upstream Node
base resolved to `node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d`.
The Dockerfile still uses package repositories; rebuilding later is not
bit-for-bit guaranteed. Actual immutable image IDs were used during these runs:

- Baseline: `sha256:1f316925b64d864b31b11b5281db80fc2d4e10efe2da6aadbd6487846c752c8e`.
- Native guest: `sha256:4d3668cc872e8026e752418563793e670a33f73efa3caf06cdd67ffcd3e20595`.
- Native trusted controller: `sha256:013fb961cd573bacf6d5c93e6d09dedbdb92a3e0ae3548f9cfa567cbb0d9be3c`.

Both used local Linux containers under Docker Desktop, ARM64 and Node v22.23.4
for the controllers. Native Python was pinned by official image digest; its
3.12.7 patch version matches actual Pyodide 0.27.5 Python. Matching patch numbers
do not imply ABI equivalence: [Pyodide](assets/2026-10-27-native-grading-prototype/pyodide-abi.json)
reported Emscripten, 4-byte pointers and `sys.maxsize = 2147483647`;
[native](assets/2026-10-27-native-grading-prototype/native-abi.json) reported Linux,
8-byte pointers and `sys.maxsize = 9223372036854775807`.

Native and baseline cohorts alternated, native first at each case count, with
no overlapping builds or fixture cohorts. Programs alternated trivial stdout
and Unicode stdin/echo. All timed requests retained 256 MiB / 1,000 ms limits,
case order, INCLUDE prompt policy and exact expected output. Separate native
smokes also exercised IGNORE prompt policy. These are synthetic programs, not
representative student-program or package compatibility coverage. Invalid-byte
output and Unicode truncation boundaries were not certified by the ASCII flood
probes; they remain compatibility checks for a production design.

The table compares baseline sandbox `wallMs` with native `engineOnlyMs`:
acquisition, execution, replenishment waits and, for native, acknowledged guest
removal. Native `wallMs` additionally includes the current real STDOUT comparator
(`pyodide-0.27.5`) in its bounded trusted controller. Native submission totals
including comparison had nearest-rank p50 values of approximately 0.145, 1.831, 2.635 and 4.809 s,
respectively; the slowest simultaneous total was 5.901 s.

Pool initialization was outside these submission samples. Native pool warmup
ranged 0.509–2.483 s and comparator warmup 3.491–4.532 s, measured separately
with safety probes between them. This is not a cold end-to-end startup test.
Recorded Pyodide pool warmup ranged 6.550–7.752 s; the first one-case baseline
run preceded the addition of the warmup clock and has no warmup field. No
five-second cold-start guarantee follows from these samples.

Current snapshot validation requires `runtime.engine = "pyodide"`. Native
results were not falsely relabeled to exercise admission, queues, points,
committed grades or replay. Those stages remain unassessed for native. Local
Docker Desktop timings also do not establish production VPS performance.

## Isolation, resources and failures

Before each native timing cohort, all 25 smoke checks passed: Unicode/prompt
policies, credential-free environment, read-only root, supervisor process access
and signal denial, Internet/Unix socket denial and absent Docker socket, ptrace
denial, forged result stdout, exit/error classification, fresh temporary files,
large consumed/unconsumed stdin, stdout/stderr floods, memory and wall limits,
setsid/fork descendants, PID/thread exhaustion and active cancellation.
No learner survived a completed case; the host acknowledged container removal
before releasing its allocation. Final source hashes matched the actual guest
and controller images. All four controller exits were zero with no controller
OOM. All fixture containers were removed; the final labeled-container inventory
was empty. These smoke checks are not an adversarial security certification.

Thirteen Node unit checks passed for bounded admission, fresh guests, cleanup
acknowledgement, queued/active cancellation, quarantine after uncertain creation
or cleanup, shutdown during creation, reviewed container-budget arithmetic and
remote/SSH refusal before any Docker access. Python AST and Node syntax checks
and `git diff --check` passed. The code-review skill was applied to the prototype;
no outstanding finding blocks this local-only experiment. The open production
gates below remain explicit limitations.

The two-active/one-spare native pool allocates three 384 MiB / 0.5 CPU guests
plus a 768 MiB / 0.75 CPU trusted controller/comparator: container ceilings total
1,920 MiB / 2.25 CPUs. Baseline sandbox stays at 1,280 MiB / 1.5 CPUs; its
production worker/comparator allowance is another 768 MiB / 0.75 CPUs, though
that worker is not part of this execution-only baseline fixture. Static guest
quotas cannot borrow idle guests' CPU. Native timing includes Docker CLI/API
operations, whose daemon overhead is outside these cgroups.

**Full system-budget compliance is unassessed.** Docker daemon/VM and outer
harness overhead are not charged to guest/controller cgroups. The guest memory
ceiling includes supervisor/interpreter overhead above the sampled learner RSS
limit. RSS sampling can overshoot between observations and is not equivalent
to WASM heap accounting. Four-slot timing was deferred; a container-budget unit
check is not its capacity or official/background reservation acceptance.

Timed native guest peaks were at most about 18 MiB each, with no timed guest
OOM kills; controller peaks were 191–203 MiB. Baseline sandbox peak was at most
about 486 MiB, with zero OOM kills. These trivial programs do not establish a
worst-case memory budget. CPU throttling occurred in both configurations;
per-case cgroup counters, controller counters, baseline before/after counters
and preparation/acquisition/execution/cleanup observations are retained in the
raw files. Native controller counters include safety and comparator warmup;
they must not be compared directly with baseline timing-only CPU deltas.

All earlier attempts are retained under the same artifact directory:

| Attempt | Outcome and correction |
| --- | --- |
| [First](assets/2026-10-27-native-grading-prototype/cove-native-first-smoke.json) | Warmup rejected equivalent Docker capability spelling. No timed cases. |
| [Second](assets/2026-10-27-native-grading-prototype/cove-native-second-smoke.json) | Diagnostic identified Docker CLI 28 `CAP_SETUID` versus CLI 29 `SETUID`. Normalize only the prefix; retain exact three-capability and learner kernel checks. |
| [Third](assets/2026-10-27-native-grading-prototype/cove-native-third-smoke.json) | Allocation probe hit its one-second deadline at roughly 245 MiB, below 256 MiB; TIME_LIMIT was correct. The test incorrectly required MEMORY_LIMIT. |
| [Fourth](assets/2026-10-27-native-grading-prototype/cove-native-fourth-smoke.json) | Setup smoke passed with a three-second allocation probe, using the earlier controller baseline. Its timing is excluded from the paired table. |
| [Source-matched smoke](assets/2026-10-27-native-grading-prototype/cove-native-source-matched-smoke.json) | Under host pressure, even a three-second allocation probe timed out at roughly 235 MiB. Preserve the valid first-limit outcome; use a deterministic 64 MiB memory diagnostic plus a separate 256 MiB deadline/memory race check. |

All five attempts confirmed cleanup. Final performance budgets remain unchanged;
the 64 MiB diagnostic is not used to make timing cases fit. Source hashes now
prevent stale built files from entering a timing cohort. A
[manifest](assets/2026-10-27-native-grading-prototype/manifest.json) records source
and artifact hashes; no source programs, student stdout/stderr, credentials or
student records are stored in these artifacts.

## Next decision

Keep the shared-read patch (`64160384`) separate from this experimental runtime.
Its page/data improvements are documented in the
[platform-wide investigation](2026-10-27-platform-wide-performance-verification.md);
this prototype adds no production page-loading or Turtle change.

A production native-runtime design must specify runtime/snapshot identity,
package/ABI/memory/error compatibility, sandbox threat review, full aggregate
resource accounting, cancellation/recovery, official/background reservations,
queue-to-commit correctness, observability and rollout/rollback. Then run the
original 100-submission cohorts on an isolated production-equivalent Linux host.
The simultaneous native maximum here already exceeds five seconds, so the
existing end-to-end target is still unmet. Public Turtle is already native
CPython/Tk and requires its separate cold-start/resource-budget work.

Reproduction commands and implementation boundaries are in the
[prototype README](../../packages/api/prototypes/native-grading/README.md).
