# Native grading measurements on the current VPS

This is the maintenance procedure for the
[approved performance design](../superpowers/specs/2026-10-27-platform-runtime-performance-design.md).
The current host is the only available Linux server. Do not run another grading
stack beside the live pool: transfer its budget during an owner-confirmed window.
The initial window is for bounded diagnostic comparisons, not an automatic
production release or a classroom-capacity certification.

## Prepared artifacts and administrator prerequisite

The scoped fixture bundle contains a temporary Node 22.23.4 binary exported from
the existing judge image, benchmark scripts, real migrations and the budget
helper. No Node installation, app environment files or production DB credentials
are needed. A Linux AMD64 candidate was built locally from a sanitized source
snapshot; its image is for testing only. The baseline is the existing immutable
production judge image. Judge/points source between deployed revision `2d6ace8`
and pre-change local `9ed4d49` has no differences.

The current `cove` SSH key cannot log in as root and cannot run passwordless
sudo. An administrator must run the prepared helper from their own administrator
console, using the actual bundle location:

```bash
bash "$FIXTURE_BUNDLE/deploy/scripts/prepare-performance-budget.sh"
```

The helper creates only a temporary `/run/systemd/system` slice enforcing
**2 GiB aggregate memory, no swap, 3.5 CPUs and 512 tasks**. It does not stop
production or launch tests. The native harness independently checks the actual
cgroup limits, architecture, host memory headroom and stopped production grading
containers before creating anything. Refusing to run beside live grading is an
intentional preflight condition.

All fixture processes share the parent ceiling, including PostgreSQL, Redis,
driver, worker and sandbox. Child ceilings are not additional host reservations.
The worker retains 0.75 CPU/768 MiB, one comparator and two official slots; the
sandbox retains 1,280 MiB and two slots plus one spare. The aggregate ceiling
may be stricter than the children's sum; any parent OOM fails the experiment.
The slice replaces the existing worker/sandbox's combined 2 GiB ceiling after
they stop. The temporary 3.5-CPU ceiling is recorded explicitly; it does not
alter production container limits or other parent quotas.

## Window execution and stop conditions

1. Record original worker/sandbox immutable container IDs, images and health;
   original global pause states of all four BullMQ queues; memory and CPU
   counters; and a one-minute baseline of public API readiness/Turtle HTML reads.
   Record aggregate counts only, never job bodies or credentials.
2. Globally pause official, practice, sample and regrade claims using their
   existing private Redis connection inside the original worker. Preserve any
   pre-existing pause. Wait for all active jobs to finish. If they do not drain
   within the window's drain allowance, restore only newly paused queues and
   reschedule. Never kill a legitimate long submission to start a benchmark.
3. Stop the drained original worker, then its sandbox. Retain their exact
   containers and pinned configuration for restoration. API/admission and both
   Turtle brokers remain available. New submissions wait until grading resumes.
4. Run paired baseline/candidate one/five/ten-case smokes at 1.5 sandbox CPUs,
   including first-solve points and repeat solves. Then test 2.0 and 2.5 CPU
   candidates only if earlier results justify continuing. Keep all other limits
   fixed. Each cohort has a finite wall-clock allowance and stops on failure.

```bash
"$FIXTURE_BUNDLE/node" "$FIXTURE_BUNDLE/packages/api/scripts/benchmark-grading.mjs" \
  --isolated-fixture --cgroup-parent cove-performance-benchmark.slice \
  --image "$PINNED_FIXTURE_IMAGE" --cases 10 --runs 1 --cpus 1.5 \
  --max-seconds 600 --output "$FIXTURE_BUNDLE/results/candidate-ten-1.5.json"
```

5. Sample host headroom, parent and child counters and reference read latency
   during the run. Stop on isolation failure, OOM, incorrect trivial result,
   unexpected timeout, available memory below 3 GiB, or over 10% reference
   read/API p95 regression in two consecutive one-minute windows. Preserve failed
   results; a failed smoke cannot be replaced by a successful-only percentile.
6. Reserve time for restoration. Do not start a cohort that exceeds the remaining
   approved window. Full 100-submission cohorts, two-in-flight/background/drawing
   acceptance, and subsequent rollout need sufficient approved time and passing
   earlier gates; they are not automatically included in a short smoke window.

## Restoration, including failures and connection loss

Prepare an independent, time-bounded restoration watchdog before pausing claims.
It must know the original container IDs, queue pause states, fixture run labels
and controller process identity. On window expiry or controller/SSH loss:

1. Stop the benchmark controller so it cannot create another fixture. Remove only
   the fixture containers/volumes/network identified by that maintenance run.
2. Start the original sandbox and wait for its original readiness/health check;
   then start the original worker and wait for its health check.
3. Resume only queues that were unpaused before the window. Preserve originally
   paused queues. Accepted production submissions remain in the original Redis.
4. Verify API readiness, grading health and queue drain. Remove only the current
   watchdog after restoration completes. Keep images/configuration unchanged.

After the fixture parent is empty, an administrator may remove its temporary
unit with the helper's `--remove` mode. That mode refuses to stop a populated
slice or remove a unit that lacks this helper's identifying description.

## What this measurement establishes

The harness measures fixture snapshot insertion/admission, real BullMQ queueing,
real sandbox/comparators, and grade/progress/points commit. Completion arrives
after commit; it is not inferred from `gradedAt`. It validates fresh first-solve
awards and no duplicate repeat-solve awards, and records failed outcomes.

Fixtures use their own private PostgreSQL and Redis, unpublished ports and an
internal network. Student interpreters remain network-disabled and receive no
DB/Redis credentials. No Supabase Auth accounts or production submissions are
created. A separate aggregate-only observation socket makes both versions wait
for the same full ready pool before starting each cohort.

The local database excludes the production Supabase network/pooler latency.
The admission is a real snapshot insert, not the authenticated HTTP route.
Browser result polling, background fairness and controlled drawing load are also
outside this fixture. Native sandbox/quota findings are useful, but these
boundaries cannot certify production acceptance-to-visible-result SLOs. Publish
them alongside sample count, cold first-use behavior, pinned image identities,
actual resource settings and failures.
