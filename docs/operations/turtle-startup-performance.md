# Public Turtle startup performance

The standby feature is off by default. It accelerates startup; it does not add
student execution capacity. The rootless pilot remains one active drawing and
at most four queued requests. Never reuse a container that ran student code.

## Local testing

Use the existing trial fixture from [public Turtle operations](public-turtle-trial.md).
Start its broker with `TURTLE_LOCAL_WARM=1 node packages/gui-runtime/scripts/trial-local.mjs`
to exercise one active run plus one unused standby on local Docker Desktop.
The explicit fixture exception requires a test process, a loopback bind and a
fixture instance label. Production rejects that exception and still requires
rootless Docker, enforced controllers and a verified resource envelope.

The fixture uses ports 3067/4037/4017 and the disposable `012345` code. Do not
start a second broker on the same fixture port. The normal application servers
do not need to be stopped. Local instances clean up only their own labeled
containers. Stop the previous fixture broker before restarting it in another mode.

Run `node packages/gui-runtime/scripts/benchmark-startup.mjs` against the public
fixture page for 100 real browser runs. `TURTLE_BENCH_MODE` labels the report;
`TURTLE_BENCH_OUTPUT` selects the JSON artifact; `TURTLE_BENCH_RUNS` supports a
smaller smoke check. The script uses ten runs per disposable grant, honors
normal limits, detects actual colored pixels and includes old-run teardown in
repeat timings. It refuses remote hosts. Docker Desktop timings are local
evidence, not proof of the Linux/rootless production SLOs.

## Resource gate before a later production release

Drain public execution before any broker or slice migration. Render the
actual enabled main Compose stack and independent trial project to JSON.
These raw JSON files can contain resolved environment secrets: keep them in a
private directory (0700), create files with umask 077, never print them, attach
them to reports or commit them. The preflight outputs only resource totals.

For the first upgrade from the old random container names to stable slot names,
drain and stop the old trial broker, then restart only the dedicated rootless
daemon before starting the new broker. This fences outstanding legacy create
requests. Preserve its socket-rebinding hook and leave course Docker untouched.
Subsequent stable-slot broker restarts reconcile delayed creates automatically.

Run `python3 deploy/scripts/turtle-resource-envelope.py --help` for arguments.
Supply both rendered configurations, the full configured course guest memory
ceiling (not just current use), deployment overlap, approved runtime digest,
and a private output file. First use `--plan` while the original slice is
active. An over-budget host is rejected: retain cold mode and review capacity
separately. Do not silently reduce unrelated limits to force the check through.

If the budget fits, run `bash deploy/scripts/configure-turtle-warm.sh --apply
PATH_TO_BUDGET_PLAN` as the deployment user. It backs up and changes only the
known 1 GiB Turtle slice to the approved 2 GiB envelope, preserving no-swap,
CPU and task ceilings. It does not restart either daemon. Rerun the preflight
without `--plan` to read actual kernel limits and write `envelope.json` into a
private directory. Install the metrics collector below before enabling warm
mode: broker startup also requires its current slice sample (less than 60 seconds
old) and an independent metrics credential. A plan alone cannot enable warm mode.

Merge `compose.turtle-trial-warm.yml` with `compose.turtle-trial-rootless.yml`
in the **existing independent trial project**. Set the private envelope directory
and the non-secret metrics directory plus `GUI_WARM_STANDBY=1` in that project's manifest. Never combine this broker
overlay with the main production project. The envelope must match the pinned
runtime, be less than 24 hours old at broker startup, and attest at least 3 GiB
of host headroom after all allocations. Regenerate it before a later restart or
image upgrade. Missing/stale/mismatched attestations fail startup closed.

Before enabling, also run the spec's Linux/rootless resource/recovery and
performance checks. The implementation existing locally is not authorization
to skip these gates. Keep warm mode off if any gate fails.

## Monitoring

Set a separate, random `GUI_METRICS_SECRET` (at least 32 characters) in the
private broker environment. The broker rejects reuse of its control secret.
The metrics credential authorizes only GET `/metrics`; it cannot start runs,
read sessions or open drawing sockets. Health/control keep their existing
credential. The public gateway exposes neither health nor metrics.

Run `bash deploy/scripts/install-turtle-metrics.sh` as the deployment user to
install the user timer/collector. It reads the known rootless cgroup every
20 seconds and atomically writes non-secret textfiles. It does not need sudo,
Docker access or execution credentials. It can monitor the original cold-mode
slice too. Check the timer and file timestamps before enabling warm mode.

Apply `compose.turtle-monitoring.yml` **only to the main production project**.
It gives Prometheus private control-network access and mounts the optional
scrape configuration. Supply `TURTLE_METRICS_CREDENTIAL_FILE` containing the
metrics-only token and `TURTLE_METRICS_DIRECTORY` pointing only at the collector
output directory. The token file must be readable by the Prometheus container
user (UID 65534), protected from other host users, and mounted read-only. Prepare
its ownership through the deployment's existing protected-file workflow; do
not make a secret world-readable to work around permissions. Never mount a
whole home directory or a Docker socket into monitoring.

The optional job has no effect without its overlay. Existing host monitoring
continues to work. The Public Turtle startup dashboard distinguishes broker
timings from browser first-drawing latency. Inspect warm hits/misses, stage
durations, failures, allocated/draining containers, queue pressure, memory and
CPU throttling. Stale host collector metrics and OOM events alert separately.

## Failure and rollback

No ready standby is a normal cold miss. Failed isolation or an ambiguous Docker
create outcome closes admission rather than creating another container. Failed
removal keeps both the physical slot and execution slot occupied until confirmed
cleanup. Ordinary preparation failures use backoff and a bounded circuit breaker.
The broker maintenance sweep retries known cleanup; an uncertain create needs
operator reconciliation or a controlled broker restart after draining.

Physical slots use stable, instance-scoped Docker names across broker generations.
Every assignment still gets a fresh immutable container ID. An old create RPC
finishing after a broker crash cannot create a third named guest slot. Creation
cancellation waits for the bounded acknowledgement before removing the known
ID; actual deadline/transport ambiguity retains a quarantined allocation.

To return to cold mode, close new admission, let existing public runs finish,
set `GUI_WARM_STANDBY=0` in the trial manifest and restart only the trial broker.
Verify old standbys are removed, then reopen admission. Keep the 2 GiB ceiling
until cleanup is confirmed after the five-second inventory sweep as well as
the initial cleanup. `configure-turtle-warm.sh --restore` restores the
known old ceiling if needed; do not shrink while containers remain allocated.
Do not rotate PINs, change course Docker or remove unrelated containers.
