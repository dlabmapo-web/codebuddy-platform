# Isolated grading verification

Local correctness command (new owned PostgreSQL/Redis, actual Nest/Next/worker,
real Pyodide Python and comparator, synthetic auth only):

```sh
bash packages/api/scripts/test-native-grading-isolated.sh --browser
```

No general E2E global setup runs. The launcher scrubs inherited environment,
refuses dotenv-bearing checkouts, binds all HTTP listeners to 127.0.0.1, refuses
occupied ports and removes only containers carrying its exact random ownership
label. Evidence is retained in a distinct `test-results/native-RUN_ID` directory;
failed traces/screenshots are never overwritten by a later run. The no-manifest
development worker has no sandbox diagnostic readiness authority: `/ready` is
truthfully unsupported/503, while the fixture waits for its post-warmup `/health`.
This neither enables native selection nor claims native containment.

The ordinary durability command remains independent:

```sh
bash packages/api/scripts/test-native-grading-isolated.sh
```

Its guest/comparator driver is deterministic. Real PostgreSQL/Redis/queue/journal
transactions prove durability and epoch behavior; they are not native execution,
isolation or latency acceptance.

## Linux AMD64 acceptance entrypoint

The acceptance driver never installs, starts, stops, activates, deploys, signs or
publishes a service. An operator must first provide an explicitly isolated,
bounded Linux AMD64 rootless/systemd/v2 environment and exact prebuilt immutable
application/broker/guest images, using the operations guide. A standard hosted
runner or this Mac does not satisfy that prerequisite. Do not run this against
production or alongside live services under an assumed spare budget.

```sh
xvfb-run -a node e2e/native-grading-acceptance.mjs /private/baseline.json test-results/paired-baseline
xvfb-run -a node e2e/native-grading-acceptance.mjs /private/candidate.json test-results/paired-candidate
node e2e/native-grading-compare-acceptance.mjs test-results/paired-baseline test-results/paired-candidate test-results/paired-comparison.json
```

Both phases use the same already prepared isolated stack and single two-slot
execution bank. After full host verification, the test-only Linux phase control
requires all four queues, pending attempts, DB leases and private sample authority
to be idle/reconciled before changing the ordinary ConfigService admission flag.
Accepted descriptors are never changed. Each phase creates fresh student and
staff identities against the same pre-certified fixture materials, so first-solve
awards remain real first solves. No second execution pool or service restart is
needed. This control exists only in the synthetic fixture script, excluded from
production images; the API receives no daemon authority. The baseline is the pinned Pyodide compatibility artifact; if its
packaging/acquisition differs from the deployed unchanged baseline, retain that
mismatch and run the deployed baseline separately before making a production
comparison. Config files carry synthetic identities/paths, never real accounts
or production credentials. No example here is an acceptance certificate.

Each JSON config has:

- `version:1`, `isolated:true`, `phase:"baseline"` or `"candidate"`, unique
  `fixtureId` matching `COVE_NATIVE_FIXTURE_ID` in the synthetic fixture process.
- `apiOrigin`, `webOrigin`, `fixtureOrigin`, `workerOrigin`: explicit HTTP
  127.0.0.1 origins with ports. The API/worker/web must be the actual inspected
  immutable containers using Linux host networking and loopback listeners. The
  driver proves each listener socket inode belongs to that container's kernel
  process; an unrelated host dev server cannot supply the claimed image test.
- `hostConfig`: absolute path to the real `host.py` configuration described in
  `deploy/GRADING-OPERATIONS.md`. Full live host validation is mandatory before
  workload. `artifacts` contains all six roles `api,worker,web,broker,native,
  compatibility`, each with `reference` (`registry/name@sha256:...`), actual
  `configId`, explicit absolute local Unix `daemonSocket` path, and `containerId` for app listener roles.
  The roles are unique. Native/compatibility references and config IDs must match
  the full validated host manifest and host image/package inventory; API/worker
  references must match the host application authority. Before phase/seed/admission,
  the fixture also validates the actual worker readiness against its full manifest.
  The broker carrier is inspected through a uniquely owned **stopped** bounded
  container, never executing its code: a bounded tar archive of `/opt/grading-runtime`
  is securely extracted and hashed with the existing strict `artifact.py` policy,
  then compared to the live broker entrypoint tree. Carrier cleanup verifies its
  exact ID/ownership/stopped state. A different installed but unused artifact
  cannot label the run. Python 3.12+ is required for secure tar extraction.
  No mutable tag substitution/build/publication occurs. A rebuild with a new
  config ID needs new evidence even when its source revision matches.
- `placement`: human-readable host/storage/DB placement and differences from
  production. `profile`: the complete intended quotas, concurrency, policies,
  workload version and cold/prepared condition. Paired comparison requires the
  same host and profile; actual live host limits and observed DB query RTT are
  preserved independently of this description.
- `cohorts`: exactly 300 entries, 100 each with `cases:1`, `cases:5`, `cases:10`.
  Each has a unique `key` and `fixtureInput:{ids:{organizationId,academyId,
  materialId}}` matching an independently prepared isolated manifest's live
  revision-1 standard-library certification (128 MiB, 1000 ms). The seed supports
  these explicit UUIDs and refuses academy/organization mismatch; it does not
  mint certification or change the manifest. Baseline/candidate fixture DBs are
  owned fixtures (or reused idle fixture materials with fresh identities). Every first solve gets its own student/material; the repeat
  reuses that same student/material. Runtime snapshots must match the phase's
  expected engine before a sample can pass.
- `drawing:{url,runSelector,canvasSelector,frameSelector?}` selects an already prepared isolated
  real Turtle editor/drawing surface on the declared artifact-bound web origin.
  Reference and drawing targets cannot select another origin. The driver enters a long-running Turtle
  program, starts it, observes the actual canvas and requires it to advance.
  `referencePath` is a real page/API path on the isolated web origin.
- `mixedRequests`: four entries with distinct `fixtureKey` values from cohorts,
  one each `kind:"official"`, `"practice"`, `"sample"`, `"regrade"`. The driver
  continuously uses the actual submit/practice/sample/regrade-plan/start/read
  RPC contracts for two one-minute windows, creating a fresh action UUID each
  time. The regrade generator inserts a separate synthetic historical row at
  revision zero; it never rewrites accepted work's frozen revision/descriptor.
  The real manager authorization, queue, evaluator and result transactions apply.
  Failed requests/read errors remain failures; no queue/result stub is used.

The test-only provider/worker launchers support `COVE_NATIVE_ACCEPTANCE_ENV`
pointing at a trusted local copy of the phase config in each private container
filesystem; this does not require a shared config/timing mount. Its `runtime` contains
`manifestPath`, `socketPath`, `workerGeneration`. The script requires Linux AMD64;
the operator-side driver and real production broker enforce rootless/systemd/v2.
The API/worker receive no daemon authority. This uses the ordinary manifest,
readiness attestation, descriptor selection, broker and evaluator. It is not a
production flag or broker bypass. Populate a root-owned, app-nonwritable tmpfs at `/app/scripts` with the trusted
fixture launcher/helpers (and the packaged inventory helper), then invoke the
launcher against the unchanged compiled dist in the exact prebuilt image. No
additional host bind mount is permitted by the host verifier. The worker launcher
resolves the API image and packaged-worker dist layouts explicitly. The driver
checks actual fixture file hashes/ownership (including the timing helper) through
  the inspected container and records all harness hashes. These fixture files remain excluded from production
package payloads; instrumentation is declared separately from the tested image. All runtime authority
and existing queues are real; only provider identities and deliberate timing
faults are synthetic.

Timing records travel through the already private, owned fixture Redis, not a
shared writable filesystem. API and worker may use different or absent optional
`COVE_NATIVE_TIMINGS_FILE` diagnostic paths. The API `/timings?jobId=UUID` merges
both producers by the actual job ID. Wall/monotonic acknowledgement samples are
captured before awaited diagnostic transport; the driver retains them. Missing
admission/worker commit/transaction records fail a sample after a bounded wait.
No history is trimmed: oversize/overflow rejects, with 4KiB per record,8192 per
job,4096 job keys and32MiB serialized data per fixture. Keys have a four-hour TTL;
verified idle phase boundaries clear only that fixture's namespace. Local owned
Redis cleanup removes the whole disposable store. No daemon authority or extra
writable app mount is added.

Every new candidate/v4 row must match the **complete** selected runtime descriptor,
including image/package hashes, versions, shim and policies. Recorded baseline
rows have the same check against compatibility. If an explicitly declared
`baselineProvenance:"unrecorded"` historical baseline genuinely has no snapshot,
the evidence retains a null descriptor and original engine version and labels the
separately verified actual compatibility adapter; it does not invent historical
image/package provenance. That gap remains in raw rows and the summary. Manifest,
broker tree and host authority are checked again after measurement.

Focused isolated contracts (the optional image must already exist locally):

```sh
bash packages/api/scripts/test-native-grading-isolated.sh --acceptance-contracts cove-grading-broker:task6-fix1
```

These test two real OS processes with private timing files over owned Redis,
negative artifact/descriptor substitutions, and actual stopped-carrier tree
identity. They are not positive Linux/native execution acceptance.

Each phase executes 600 sequential submissions (100 first plus 100 repeat per
1/5/10-case group), a two-in-flight pair and a ten-client burst. It retains each
failure, queued tail, admission duration, acknowledged final transaction boundary,
observed saved-result latency, slowest-case runtime, private fixed-stage timings
and acknowledged DB transaction count. It additionally runs all four mixed kinds
with reference reads and active Turtle rendering for two one-minute windows, and
records a separate visible browser clock click/render sample. The single browser
sample is diagnostic, not p95 acceptance; a sufficient visible-browser cohort
and commit-to-visible p95 remain independent release gates. Browser launch is
headed (Xvfb is acceptable CI rendering), not a synthetic DOM.

Evidence includes immutable artifact IDs/source labels, live host limits,
CPU/memory/PID/OOM observations, broker/worker continuity, DB placement and 20
observed SELECT RTTs, HTTP clock bounds and wall/monotonic continuity. Volatile
observation timestamps/CPU counters may advance; immutable identity changes and
counter rollback refuse the measurement. Per-guest gauges are not added to
family counters as if they were separate resource families.

`submissions.jsonl` preserves all attempted samples even if later checks fail.
Failures remain in percentile denominators (`unbounded` where appropriate).
The comparator emits cohort target decisions only; it deliberately cannot issue
production acceptance. Remaining independent gates include full compatibility,
containment/restarts/socket permissions, recovery, scans, certification review,
representative DB placement and signed activation evidence. No signing key or
passing acceptance bundle is generated by this harness.

The dedicated workflow triggers only on a feature-branch push, never a PR or
workflow dispatch. Its ordinary hosted jobs run local correctness and report
rootless capability truthfully. The optional isolated runner job additionally
requires repository variable `GRADING_ISOLATED_ACCEPTANCE_ENABLED=true`, the
`cove-grading-isolated-acceptance` runner label, and explicit baseline/candidate
config paths. Adding the workflow does not authorize pushing or provisioning.
