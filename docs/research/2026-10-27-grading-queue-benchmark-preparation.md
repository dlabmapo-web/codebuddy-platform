# Queue/commit measurements and native VPS preparation

Date: 2026-10-27 (Asia/Seoul)
Status: development measurements completed; native benchmark awaiting an approved
grading maintenance window and administrator resource-budget setup.

Subsequent session update: the user stopped native testing and requested a
[production page-navigation investigation](2026-10-27-production-page-navigation-performance.md).
That stop supersedes the earlier "Run now" response. No grading pause or native
benchmark occurred; do not resume from the earlier approval.

## What was measured

Added `benchmark-grading.mjs` and its companion trusted fixture. Unlike the
earlier sandbox-only microbenchmark, this uses a real disposable PostgreSQL,
all current migrations, real BullMQ/Redis, the pinned sandbox engine, real
comparators, and the real grade/progress/points transaction. A completed queue
event is observed after the transaction commits. First solves must award points;
repeat solves must not award additional points. Incorrect/aborted/resource-limit
outcomes fail the cohort and stop further growth.

The measured acceptance boundary begins after the fixture snapshot insert has
committed. Admission insertion duration is recorded separately. This bypasses
HTTP/auth/authorization and uses a local fixture database, so it excludes the
production Supabase network/pooler and browser polling. These results must not be
called production acceptance-to-visible-result latency.

Before each first/repeat batch, both images must have the same three ready,
unused interpreters. This uses a fixture-only aggregate observation socket,
not a production execution protocol change. Warmup/refill between batches is
outside the action timer; each ten-case action still consumes/replaces runners
beyond that initial pool. Interpreters are never reused after executing a case.

## Development results

Linux ARM64 containers on the existing Docker Desktop VM, Node 22.23.4 and
Pyodide 0.27.5. Sandbox: two slots plus one spare, 1,280 MiB. Worker: 0.75 CPU,
768 MiB and one comparator. Real points are enabled in the fixture academy;
an additional unsolved material prevents lecture/module/course bonuses.

Each table cell is **one sample**, not a percentile or a capacity claim.
The first solve is also the first grading job in a fresh worker process. Its
first-use DB/client/query compilation and point-award path are not isolated
from each other; do not attribute its extra time solely to points or networking.

| Version | Cases | Sandbox CPU | First solve, accepted → completed | Repeat solve | Correctness |
| --- | --- | --- | --- | --- | --- |
| Candidate | 1 | 1.5 | 1.906 s | 0.083 s | Passed; points/idempotency correct |
| Baseline | 5 | 1.5 | 8.425 s | 6.115 s | Passed; points/idempotency correct |
| Candidate | 5 | 1.5 | 3.612 s | 2.943 s | Passed; points/idempotency correct |
| Candidate | 10 | 1.5 | 10.090 s | 9.047 s | Passed; points/idempotency correct |
| Candidate | 10 | 2.0 | 9.449 s | 8.385 s | Passed; points/idempotency correct |
| Candidate | 10 | 2.5 | 8.961 s | 7.550 s | Passed; points/idempotency correct |

All 82 cases across these 12 successful submission-equivalent samples passed.
No successful cohort reported an OOM. The higher quota helps these local
samples, but even 2.5 CPUs does not establish the five-second ten-case target.
No production CPU setting is selected by this experiment.

The baseline five-case engine requests consumed about 7.163 s on its first solve
and 6.039 s on repeat. The candidate five-case engine requests consumed 2.759 s
and 2.879 s. This reinforces the earlier runner-lifecycle attribution, while
queueing and commit work add measurable time beyond sandbox-only timing.

Additional functional checks: two actual clients in flight (`runs=2`,
`parallel=2`), each performing a first and repeat solve, passed all four results
and point checks. That one-case test checks concurrency plumbing only; it was
not a controlled mixed-load throughput experiment. Per-job cumulative stage
deltas are deliberately omitted in concurrent mode because they would overlap.
An earlier functional invocation used `runs=1` with a maximum parallelism of two;
it created only one actor and is retained without treating it as concurrency
evidence.

Raw reports, including failed attempts, are retained under
[`assets/2026-10-27-grading-queue-performance`](assets/2026-10-27-grading-queue-performance).
The original candidate/baseline ARM64 images are identified in each report;
they are the same immutable images used in the prior implementation report.

## Preparation failures retained

- The first driver used a 256 MiB ceiling and exited with code 137 before
  producing a result. An OOM attestation was not captured in that first harness
  version, so the exact cause remains unconfirmed. The driver now has a 768 MiB
  finite ceiling and all container termination/OOM states are retained.
- A later fixture failed during database bootstrap, before starting a sandbox
  or worker. The original generic error did not retain the exact PostgreSQL
  failure. Code review found that a Unix-only temporary initdb server could
  satisfy the old readiness check. The harness now waits for final TCP readiness;
  all three subsequent ten-case CPU cohorts completed successfully.
- Native image transfer initially failed an overly strict equality check between
  the two engines' reported image IDs. Verification of the exported configuration
  SHA-256, runtime settings and ordered root-filesystem layers succeeded. Both
  reported identities are retained in the native artifact integrity record.

These failures are not excluded to present a successful-only acceptance result.
They do not establish a production timeout or OOM: no production fixture workload
was executed. All disposable development containers/networks/volumes were removed.

## Native preparation and remaining prerequisite

Read-only checks confirmed the actual host is Linux x86_64, six CPUs and about
12 GB RAM. It is the only available VPS. The current production worker and
sandbox have respective 768 MiB and 1,280 MiB ceilings. No separate staging
host was supplied. Starting an extra stack alongside them would bypass the
design's transferred-budget requirement.

Prepared a Linux AMD64 candidate from a sanitized source snapshot and copied it
to a separate test-only image tag on the VPS. It has not started or replaced a
production service. The baseline will use the existing deployed image, source
`2d6ace8b4d828287fe0de8db4eb95df2e2663ec2`. Judge/points source between that
revision and pre-change local `9ed4d49` is unchanged.

The [native artifact integrity record](assets/2026-10-27-grading-queue-performance/native-artifact-integrity.json)
contains the local image configuration digest, native engine identity and
filesystem-layer fingerprint. A temporary Node binary exported from the
existing image runs on the host; no global runtime installation was made.
Fixture files/migrations and the administrator helper are in a scoped,
owner-private preparation directory. No app secrets were copied into it.

Both guard/redaction tests passed locally and on native Linux. The native
harness was also checked to refuse execution without an allocated cgroup parent.
No native grading container was launched, no production queue was paused, and
no production submission or database content was changed.

The current SSH account cannot create the required systemd slice: passwordless
sudo is unavailable, and the existing key is not authorized for root SSH.
An administrator must run the prepared
[temporary-budget helper](../../deploy/scripts/prepare-performance-budget.sh).
It creates only a finite test slice; it neither stops production nor starts
tests. The remaining owner decision is a grading-pause window, since accepted
submissions will wait until the original worker resumes.

The [maintenance procedure](../operations/grading-performance-maintenance.md)
records the 2 GiB aggregate budget, unchanged child limits, native quota
variants, drain checks, monitoring stops and mandatory watchdog/restoration
sequence. Do not enable a production CPU increase or deploy the candidate from
these development samples. Native comparisons, full acceptance, remote database
latency, controlled mixed load and rollout remain outstanding.
