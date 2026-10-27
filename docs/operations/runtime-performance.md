# Runtime performance diagnostics and local verification

The implementation follows the [October 27 design](../superpowers/specs/2026-10-27-platform-runtime-performance-design.md).
Production CPU/memory limits, grading deadlines, animation defaults and Turtle
warm enablement are unchanged. Local tests do not establish classroom capacity.

## Grading diagnostics

The sandbox retains network isolation and protocol v3 execution messages. Its
private health reply optionally carries version-1 diagnostics: bounded pool
counts, stage histograms and direct cgroup measurements. Old clients ignore this
extension; a new client reports an old peer's diagnostics as unavailable.

The judge polls every five seconds, keeps one health poll and one queue census
in flight, and treats samples older than 15 seconds as stale. A stalled queue
census cannot consume unlimited Redis commands or make an otherwise healthy
runtime unready. Histograms are cumulative snapshots; scrapes do not add the
same observations again. Process generations reset counters without becoming
metric labels.

Optional `JUDGE_TRACE_TIMINGS=true` enables correlated, restricted worker and
sandbox timing logs through Compose. The existing server-generated protocol
request UUID joins `judge.engine` and `sandbox.run` records; worker logs also
carry an opaque job ID, fixed kind and case-count bucket. Logs contain neither
programs nor program output. The flag defaults to false and must follow the
same retention/access controls as existing judge logs. Aggregate metrics never
carry these IDs.

The judge listener offers:

- `GET /health`: process liveness, retaining the existing healthcheck contract.
- `GET /ready`: Redis/sandbox compatibility, freshness and pool readiness. A
  busy pool executing legitimate long programs is healthy. Empty, starved pools
  and exhausted replacements are degraded.
- `GET /metrics`: requires an independent, at least 32-character bearer secret.
  Without a configured secret this endpoint returns 404. It can read metrics
  only; it cannot execute code or inspect submissions. Unknown paths are 404 and
  non-GET requests are 405.

The default bind remains loopback. Apply `deploy/compose.judge-monitoring.yml`
only with the production Compose project to attach the judge to the existing
private monitoring network and bind its listener inside that network. It
publishes no host port and adds no Caddy route. Prometheus is not attached to
the application backend or given a Docker socket.

Set `JUDGE_METRICS_SECRET` through the existing private judge environment file.
It must differ from application/control credentials. Supply
`JUDGE_METRICS_CREDENTIAL_FILE` pointing to a separate file containing that same
token for Prometheus. Use the existing protected-file workflow: the container's
Prometheus UID 65534 must be able to read the mounted file, while other host
users cannot. Do not make the file world-readable or copy environment files
into reports. The optional scrape job and Python grading runtime dashboard are
provisioned alongside the existing monitoring assets.

The dashboard separates grading after claim/load from interpreter acquisition,
queue wait and browser feedback. Direct worker/sandbox cgroup counters avoid
assuming that cAdvisor exposes Docker container-name labels. Missing counters
are absent, not zero. `cpu_throttled_periods_total / cpu_periods_total` measures
the fraction of scheduling periods that throttled, not total host CPU usage.

`JUDGE_READINESS_GUARD=false` is the default. Enable it only after both upgraded
peers and recovery tests pass. A supported but degraded runtime pauses new
claims across official, staff-practice, sample and regrade queues; current work
retains its deadlines and execution slots. Three healthy five-second samples
resume claims. Initial legacy peers do not activate the guard. Disable the
guard before downgrading only the sandbox, or roll back the coupled peers
together. Do not use liveness restarts to empty a merely busy pool.

## Interpreter replenishment

Initial startup still attempts to prepare the full bounded pool before serving work.
Subsequent replacement initialization is serialized so a burst of WASM compilers
does not compete with executing cases under the same CPU quota. Interpreters
remain single-use. Physical slots remain counted until cleanup is confirmed;
unconfirmed cleanup quarantines the slot and stops new acquisition. Exhausted
initialization retries perform a bounded refill probe after five seconds, so
recovery does not depend on a student claim that the guard has paused.

No student time, memory, output or comparison budget is increased. The result
still waits for real process exit and bounded pipe draining. Grading, progress
and points remain in the existing transaction.

## Reproducible local checks

Run from the repository root with Docker available:

```bash
bash packages/api/scripts/test-runtime-performance.sh
pnpm --filter @cove/web exec vitest run src/components/workspace/submission-polling.spec.tsx src/components/workspace/submission-summary.spec.tsx src/components/workspace/practice-result-recovery.spec.tsx src/components/manual/gui-viewer.spec.tsx
node --test deploy/load/learning-reads.test.mjs
bash deploy/scripts/validate-local.sh
```

The first command creates its own loopback PostgreSQL with minimal Supabase
schema doubles, applies real migrations, and runs backend tests plus the real
weighted grading integration. It deletes only its own container by immutable
ID on exit. It does not contact Supabase Auth or create cloud accounts. The
provider-side auth contract is not tested by these schema doubles. Background
sample-check integrations requiring Redis remain separate opt-in suites.

To benchmark the real Linux execution sandbox without a database or Redis:

```bash
docker build -f deploy/docker/judge-worker.Dockerfile -t cove-judge-performance:candidate --label org.opencontainers.image.revision="$(git rev-parse HEAD)" .
node packages/api/scripts/benchmark-judge.mjs --image cove-judge-performance:candidate --runs 1 --cases 10 --cpus 1.5 --output /tmp/cove-judge-candidate.json
node packages/api/scripts/benchmark-judge.mjs --image cove-judge-performance:candidate --runs 2 --cases 10 --parallel 2 --cpus 1.5 --output /tmp/cove-judge-concurrent.json
```

The harness inspects a local image, executes its immutable ID, creates a unique
credential-free, read-only, network-disabled sandbox with the actual uid/capability
checks, and removes only that fixture. It uses the existing one-second case
budget and a transport wait longer than the engine's allowance. It alternates
trivial output and Unicode stdin echo. Failures are retained and stop the
cohort; no program output or input is saved in the report.

Use `--cases 1`, `5` or `10`; `--runs` is bounded to 1–1,000 and defaults to a
diagnostic smoke, not acceptance. `--parallel 2` requires two execution slots.
CPU variants 1.5, 2.0 and 2.5 follow the design; keep the same memory, architecture,
Node/runtime versions and workload. Compare a baseline image built from the
pre-change revision with a candidate, alternating cohorts on a quiet host.
Check the report's image ID, client revision and dirty-tree flag. An optional
image revision label identifies the image source separately from the harness.

The boundary is **sandbox execution only**. It excludes submission admission,
BullMQ, comparators, database commit, points and browser polling. A passing
microbenchmark is not the end-to-end grading SLO. Docker Desktop also does not
establish Linux VPS performance or rootless Turtle behavior. Full acceptance
requires the design's 100-submission cohorts and paired mixed-load checks.

For real BullMQ queueing and committed grading/progress/points, use
`packages/api/scripts/benchmark-grading.mjs` with its companion trusted fixture.
It creates its own private PostgreSQL/Redis and retains first/repeat-solve
outcomes, queue/engine/comparator/service timing and cgroup counters. It never
uses production data. Native Linux execution requires the transferred cgroup
budget and drained production grading described in the
[maintenance procedure](grading-performance-maintenance.md). Its admission is a
snapshot insert; HTTP/auth, browser feedback and remote Supabase latency remain
outside that fixture. See the
[queue benchmark preparation report](../research/2026-10-27-grading-queue-benchmark-preparation.md)
for development measurements and outstanding native prerequisites.

## Result feedback and read load

Manual workspaces use `/api/manual/latest-submission` for own-result summaries.
It preserves material visibility, academy/class membership, preview permissions
and private staff ownership, but reads no draft, solution, outline or full
attempt history. Automatic pending work polls every second for the existing
120-second window. Human review uses 15 seconds. Hidden tabs pause; focus and
Refresh recover. Transient failures back off 2/4/8 seconds, then stop automatic
retry. Denied reads stop immediately. Pending work remains pending after the
window; it is never automatically resubmitted.

Full workspace/result detail invalidation happens once on a terminal transition.
It does not replace local drafts or remount the drawing. Cached newer accepted
attempts are protected against older requests. Standard coding/PDF-code results
use the same polling policy and expose Refresh without changing grading rules.

`deploy/load/learning-reads.mjs` measures only loopback lesson/status GET reads.
Provide a private JSON fixture with `actors`, each containing `headers` and
`reads` (`surface: "lesson"` or `"status"`, and a local relative `path`). Use a
different fixture actor for each simultaneous client. It accepts only approved
read paths, rejects redirects and cross-origin URLs, saves counts/timings/byte
sizes without headers, URL parameters or bodies, and samples 1/2/5/10/20 clients
up to the supplied actor count. Rounds are paced one second apart. Use a fresh
fixture session and never commit the credentials file.

```bash
node deploy/load/learning-reads.mjs --base-url http://127.0.0.1:4000 --fixture /tmp/private-performance-actors.json --rounds 5 --output /tmp/cove-learning-reads.json
```

Run web lesson and API status surfaces against their respective local origins.
The tool stops growing load after an error or read-latency failure and exits
nonzero for either. It does not submit code, emulate browser readiness, or
establish execution/classroom capacity. Those experiments remain gated by the
grading latency checks.

## Turtle and page loading

Keep the existing [Turtle startup operations](turtle-startup-performance.md).
The browser benchmark now supports `TURTLE_BENCH_BROWSER=chromium` or `webkit`
and records new-context shell/editor timing plus sanitized static-asset resource
timings alongside actual first-drawing pixels. Editor timing includes automated
fixture PIN admission; it is not an authenticated lesson-navigation benchmark.
Public mode still uses one active execution and the original bounded queue.
No default animation or PNG frame-retention behavior changed.

Warm mode stays off until the original combined resource envelope, real Linux
rootless recovery and 100-run performance gates pass. Available idle RAM cannot
replace the 3 GiB worst-case headroom check. If a latency target remains unmet,
record it and use the runtime decision note rather than raising grading limits,
increasing hidden process counts or silently accepting a failed gate.


## Navigation read-path release

The local navigation changes and their evidence are documented in
[local verification](../research/2026-10-27-navigation-performance-local-verification.md).
Deploy the additive API before the new web (`getOutline` must exist). Compose
sets server-only `INTERNAL_API_RPC_URL=http://api:4000/api/rpc`; the browser keeps
its public API URL. No migration or resource-limit change is required. Roll back
the web before an API image that removes the endpoint. Re-measure deployed
navigation and error rates before claiming the performance target is achieved.
