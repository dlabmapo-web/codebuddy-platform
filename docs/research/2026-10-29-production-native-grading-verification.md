# Production native grading verification

Date: 2026-10-29. Implementation work is isolated to the
`feat/production-native-grading` worktree. Production selection remains disabled;
no live accounts, production database, default dotenv, SSH, system accounts,
daemon configuration, activation, deployment, publication, push, PR, tag or
workflow dispatch was used. The original user checkout was not modified.

This report records code and isolated verification. **Linux AMD64 rootless
acceptance, certification, scans, pilot and production performance are not
passed.** No production acceptance signature/bundle was created. The five-second
ten-case target remains unproven.

## Executed local application/browser verification

`bash packages/api/scripts/test-native-grading-isolated.sh --browser` completed
**17/17 Playwright cases in 2.9 minutes**, with no retries or exclusions. The
fixture created fresh labelled, bounded PostgreSQL 17/Redis 7 containers,
applied all 69 migrations and booted the real Nest API, Next application and
judge worker. Authentication alone uses synthetic provider sessions; admission,
authorization, both real BullMQ queues/QueueEvents, real Pyodide Python execution,
the Python comparator, persisted results/progress/points and browser delivery
remain the application implementations. All listeners bind 127.0.0.1; existing
servers/containers were neither reused nor stopped. Final fixtures use bounded
PostgreSQL/Redis tmpfs and label-verified removal, including signal cleanup.

The dedicated config never invokes the general E2E setup or shared development
Supabase seed. The launcher scrubs inherited environment, chooses explicit
loopback database/Redis URLs, rejects dotenv-bearing checkouts and retains
per-run failure artifacts outside SDD scratch.

The 17 cases cover:

- Ten Unicode cases, first/repeat solve persistence with one solve award and
  distinct new-action UUIDs; wrong output, runtime error and time limit verdicts.
- Staff practice visible results with zero student submissions/progress/points;
  hidden data redaction, different owner/academy denial and revoked membership.
- Lost official admission acknowledgement, same-action UUID retry and only one
  accepted persisted attempt.
- A literal reload of the URL produced by normal Submit while its queue is
  paused. The owned attempt resumes observation and reaches its saved verdict;
  navigation/reload creates neither another action nor another award.
- Both queues' real lazy QueueEvents consumers delayed before first XREAD:
  durable terminal result acknowledged while raw XREAD count stays zero and the
  UI remains pending, followed by real `0-0` replay and visible result. This
  excludes a polling/focus response masking the startup race.
- Both queues retaining an actual failed event for an attempt ID, then retrying
  that same ID under a held real worker. The old failure keeps the current
  browser pending; current committed success is eventually shown. The injected
  failure occurs before source release; actual execution/comparison/commit on
  the retry remain real. It is a transport/replay fault test, not a crash or
  native containment certificate.
- Frozen grading revision across a post-admission material edit, weighted
  prompt-ignore Unicode comparison, completed-before-connect, reconnect after a
  dropped stream and saved-result recovery under deliberately buffered SSE.
- Membership revoked between stream attachment and commit, and navigation away
  from pending official work without an old result appearing in another
  exercise. Pending-abort controller listener count returns to zero.

The no-manifest development path intentionally reports unsupported diagnostic
`/ready` (503) because it has no sandbox resource authority. The fixture waits
for the real worker's post-warmup `/health`; this is not a native readiness or
production guard bypass. Its new legacy runtime snapshots remain null with
recorded `engineVersion:0.27.5`; no historical image provenance is invented.
Descriptor/v4 native routing remains separately covered by the durable contract
suite below, not by these default-path browser results.

## Defects reproduced and fixed

1. Normal Submit did not retain its accepted attempt in its URL. The browser
   regression failed with a real QUEUED row and a missing `submission` query
   value. The hook now uses Next's supported native history API to retain the
   accepted ID and resumes only owner-authorized pending-result observation on
   reload. New submissions retain their action-key/stale-scope behavior.
2. Replacing a broker journal with an empty older journal could report healthy
   even behind durable sealed database epochs. The real broker/journal/DB
   regression reproduced that false health. Coordinator health now compares the
   broker epoch to durable authority before admitting source claims. This adds
   a durable read to health; external DB RTT remains a performance gate. Ordinary
   lost-seal acknowledgement, where the broker is one epoch ahead, still passes
   its original reconciliation regression.
3. The Darwin charged-footprint helper's first executable launch exceeded the
   one-second measurement bound in the real browser flow (`ETIMEDOUT`, SIGTERM).
   It now compiles and validates actual physical-footprint telemetry in bounded
   startup work before engine readiness/student deadlines. Normal case readings
   keep their original bound; unreadable telemetry refuses readiness/execution.
   No RSS estimate, zero baseline, fake result or weaker memory policy was added.
4. Actual maximal BuildKit COPY exposed `.env-backups/backup-data` (and the
   uncovered `e2e/.auth/session.json` class). Exact directory exclusions now
   protect both. The real synthetic-canary test ran RED then GREEN with 22
   canaries; no real backup/session content was read.

Fixture corrections were kept distinct from product bugs: legacy weights must
be one, prompt policy/version must agree, STUDENT_POINTS must be enabled for
award assertions, membership revocation uses SUSPENDED, the replacement broker
needs a real warm profile, and filtered old integration tests depend on their
prior setup. Failure traces/screenshots/logs were preserved before covering
reruns. An initial 120-second whole-test bound was too small for 530 normal
jobs plus growing course fixtures; a reused material and explicit 240-second
harness bound preserve each actual execution deadline and all observations.

## Durable contracts, inventory and sustained lifecycle

`bash packages/api/scripts/test-native-grading-isolated.sh` completed **26/26**
real PostgreSQL/Redis/BullMQ/Unix-broker/journal integration cases, then **11/11**
Redis sample-store tests. The trusted guest driver and comparator in this suite
are deterministic: these are durability, routing, scoring-transaction and fencing
proofs, not actual native execution/isolation/latency acceptance.

The normal lifecycle case executed **530 actual application jobs**, with normal
coordinator finish/reconciliation rather than manufactured GC rows or an
unrelated later sweep. It passed all outcomes and advanced epochs **5→7**.
Maximum measured diagnostic job interval was 2502.71 ms. This sequential normal
run exercises rollover above the 256-lease threshold and over 512 total jobs;
it does not claim that it saturated the hard 512-current-epoch claim fence.
That fence/lost-seal behavior remains in the focused contract regressions.

The actual inventory CLI ran against the migrated database and isolated Redis
with all four queues nonzero, a STOPPING sample and recorded descriptors. It
observed pending=4, ephemeralPending=1, queue backlogs official=2/practice=1/
sample=2/regrade=2, and distinguished absent-readiness fencing from live
readiness. These are synthetic fixture counts, not production inventory.
A final focused inventory rerun passed after a test-only boolean type correction;
its 25 unselected integration cases were deliberately filtered, not failures or
additional passing coverage.

`--fixture-contracts` additionally passed the real-DB seed contract: 1/5/10-case
cohorts reuse their pre-certified material/academy identity with distinct fresh
learners/classes, reject organization mismatch and create no grade/award while
seeding. Three subprocess guard tests reject remote/wrong DB/Redis/ownership,
show inherited native settings cannot leak into the default fixture, and reject
a remote Docker context before any fixture mutation. The launcher pins the
verified local Unix Docker endpoint for creation and cleanup.

## Timing evidence and limitations

The [single local ten-case diagnostic](assets/2026-10-29-native-grading-verification/local-ten-case-boundaries.json)
records actual independent boundaries:

| Boundary | Observed |
| --- | ---: |
| Browser clock click→visible | 8491.74 ms |
| Admission handler (monotonic) | 116.69 ms |
| Admission acknowledgement→final transaction acknowledgement | 8101 ms |
| Final transaction duration (monotonic) | 121.90 ms |
| Commit acknowledgement→observed visible read | 382 ms |
| Explicit acknowledged DB transactions in this legacy job | 1 |
| Twenty loopback SELECT RTTs | 0.262–0.907 ms |

`gradedAt` is not used as a commit acknowledgement. Browser automation and the
observed-visible sample add overhead. This is n=1, ARM64/Darwin, loopback
PostgreSQL and default Pyodide; it establishes no percentile or production
latency. External production Supabase RTT/placement may materially change the
many durable source/checkpoint transactions used by descriptor-bound work.
Slowest-case public `runtimeMs` is not job elapsed time. All raw failures/queued
tails remain in the acceptance harness denominators.

## Remaining acceptance and runtime coverage

The [actual host capability result](assets/2026-10-29-native-grading-verification/local-capability.json)
is darwin/aarch64 with Docker Desktop cgroup v2/cgroupfs and no rootless/systemd
support. Both the real capability probe and the Linux benchmark entrypoint
refused with exit 2. No native guest was launched through a fake production
startup flag to make browser tests pass.

[e2e/NATIVE-GRADING-ACCEPTANCE.md](../../e2e/NATIVE-GRADING-ACCEPTANCE.md) documents
the executable, separately gated Linux AMD64 entrypoint and push-only CI. It
requires an explicitly prepared isolated rootless host, exact prebuilt immutable
pull/config IDs, actual artifact-owned loopback listeners, real broker/worker
identity, and declared trusted instrumentation hashes. It prepares paired
100-submission first/repeat cohorts for each 1/5/10-case group, two-in-flight and
ten-client bursts, sustained official/practice/sample/regrade mixed work,
reference reads and actual active Turtle drawing, DB RTT/placement and
clock/resource continuity records. It never signs, deploys, purchases a host,
changes system accounts or substitutes a mutable rebuilt tag for tested bytes.
The isolated phase control changes only future admission after all private
execution authority/queues reconcile; accepted descriptors never change.

This Linux driver has not run positively on this host. It does not claim full
containment, compatibility/certification, scan, socket/PID/controller/restart,
paired performance, browser p95, production-equivalent DB placement or pilot
acceptance. Its single visible-browser sample is diagnostic; the required
commit-to-visible p95 and paired mixed-load throughput/reference/drawing p95
comparisons still need reviewed Linux evidence. The comparator emits cohort
measurements/gates, never a production acceptance signature. Any baseline
packaging/acquisition or host difference must be retained in the report.

All production profiles remain on Pyodide because native selection is disabled.
No production course inventory was read, so this report cannot list certified
production revisions or claim support for every configured package/memory
profile. Uncertified revisions, non-standard-library packages, unsupported
budgets, >256 MiB pilot profiles and any unfundable compatibility profile remain
explicit inventory/certification/resource gates; allowances are not reduced.

## Final covering verification and immutable local artifacts

After the broad 17-case run, four transport cases were strengthened with an
independent actual browser EventSource. Both retained-failure retries must emit
RUNNING before old-event replay, remain open without a fatal event and eventually
emit the current saved PASSED result. Both completed-before-connect cases create
a fresh subscription after the saved terminal row and require an actual PASSED
event. A saved-result polling response cannot satisfy those raw-channel checks.

The first stronger run recorded **1 failure and 3 unrun cases**: the actual
one-second exercise produced correct sample output but received a real time-limit
verdict at **1029 ms**. Its [screenshot](assets/2026-10-29-native-grading-verification/transport-one-second-time-limit.png),
trace and acknowledged timings remain preserved. The root cause is not
established; resource pressure is a hypothesis, not a finding. This is a real
diagnostic timing limitation, not evidence of one-second performance.
Only these four transport fixtures now declare a two-second exercise profile.
The dedicated one-second infinite-loop test and Linux simple latency cohorts
retain their one-second policies; no production execution deadline changed.
The subsequent serial covering command passed **4/4 in 1.3 minutes**:

```sh
bash packages/api/scripts/test-native-grading-isolated.sh --browser --grep 'old same-ID|completed-before-connect'
```

Those four overlap the 17-case broad run. No passing-suite repeat was used to
suppress the failed timing observation. A separate actual **production standalone
Next** pending-navigation/abort smoke passed **1/1 in 19.7 seconds**, also an
overlapping case. API health stayed 200, the web stayed responsive and controller
completed/failed/progress listeners returned to zero after abort.

Next **development** mode emitted `Error: The destination stream errored while
writing data.` with digest `1944899728` as EventSources closed/aborted. This is not
a zero-noise run, and no more-specific AbortError subtype was established.
The dedicated production standalone abort smoke did not emit that diagnostic.
The synthetic API also prints a pg adapter deprecation about concurrent
`client.query()` (future pg@9), and the no-manifest worker prints its expected
development child-process warning. Expected negative-unit grading errors remain
in raw logs; stderr was not globally suppressed.

Final grading checks completed with safe explicit fixture configuration:

| Check | Result |
| --- | --- |
| API grading/authorization/comparator/real-Python selection ([exact command](assets/2026-10-29-native-grading-verification/api-regression-command.txt)) | 29 files, 413 passed |
| Shared grading/runtime/submission/learn/course/latest-submission contracts | 5 files, 85 passed |
| Production runtime broker/lease/journal contracts | 41 passed |
| Web official-action/practice-stream/BFF/fallback selection | 4 files, 24 passed |
| Default unavailable-memory readiness rejection (mocked reader) | 1 passed |
| Real isolated paired-material seed contract | 1 passed (1/5/10-case cohorts; before the transport-only deadline extension) |
| Fixture environment/local Docker guards | 3 passed |
| Acceptance statistics/continuity contracts | 2 passed |
| Shared/runtime/API/worker/web and E2E TypeScript | passed |
| Owned web hook/recovery-unit ESLint, shell/Node syntax, `git diff --check` | passed |
| Real maximal Docker COPY | RED then GREEN; 22 synthetic canaries |

These are separate commands with overlapping coverage; there is no summed grand
test count. The 26 durable/11 Redis cases and 530-job lifecycle above remain
explicit deterministic-driver proofs. A mistaken ESLint path selection failed
before linting; the actual owned paths were then linted successfully. A concurrent
web typecheck was interrupted during the heavy build; the subsequent serial
web/E2E typechecks completed successfully.

The final actual Next production build used an empty inherited environment and
explicit synthetic public loopback site/API/provider values, `DOTENV_CONFIG_PATH=/dev/null`,
blank Turnstile site key and a synthetic BFF key. Webpack compilation, TypeScript
and **42 static pages** completed. Its standalone build ID is
`osbjMtB-aCIuwFtlShWm9`; no remote prerender or production dotenv was used.
The fixture's production mode invokes that built standalone server directly,
with its packaged static/public files and explicit loopback HOSTNAME/PORT.

After the final product fixes, actual production runtime targets were rebuilt
serially:

```sh
docker build -f deploy/docker/api.Dockerfile --target runtime -t cove-api:task6 .
docker build -f deploy/docker/judge-worker.Dockerfile --target runtime -t cove-judge:task6 .
```

| Local tested image | Immutable config ID | Architecture |
| --- | --- | --- |
| API | `sha256:0ff791f6b43d30cbc1d6bc81675bf4f51b3174d6b8f420a674abb7248f07c161` | arm64 |
| Worker | `sha256:a3631be8e825c1f2008095687f6ec05b1442284a9bae8722891eb2ce2637eb3b` | arm64 |

Both completed bounded (`768 MiB`, `.75 CPU`, `64 PIDs`), readonly,
network-disabled import/Prisma/runtime/filesystem smokes. New fixture launchers
are absent from both images. API uses its strict package files whitelist;
migration packaging uses explicit COPY and also excludes fixture launchers.
The allowlisted build-warning audit found only reviewed dev-only bin names
(API: acorn/browserslist/esbuild/terser/vite/webpack; worker: prisma).
Broker/native/compatibility sources and packaged runner were unchanged, so their
prior Task5 artifacts were not rebuilt or relabeled as new Task6 tests.

These are local immutable **config IDs**, not registry pull digests, signatures,
AMD64 artifacts or published releases. Images have no source revision label and
were built from the Task6 working tree before its commit; final product source
hashes and standalone-server hash are in the
[sanitized evidence summary](assets/2026-10-29-native-grading-verification/local-verification-summary.json).
Later fixture-only/document edits do not change packaged product code. A Linux
acceptance run must measure the exact independently built/pinned AMD64 bytes.

Raw local evidence remains outside SDD scratch under
`test-results/native-1793249905-28002-a592aec0` (broad),
`test-results/native-1793251208-46363-5d6d45a9` (one-second diagnostic failure),
`test-results/native-1793251403-50880-ecd8a9ac` (stronger covering run), and
`test-results/native-1793250725-40672-9481a479` (production standalone smoke).
Earlier failure traces/screenshots are retained in their own run directories.
No owned PostgreSQL/Redis fixtures remain after cleanup. Tracked assets contain
sanitized observations/synthetic screenshot only, never sessions or credentials.

Self-review covered product scope/action guards, owner/privacy boundaries,
rollback health and legitimate one-ahead recovery, real charged-memory startup,
fixture-only controls/production payload separation, bounded local ownership,
acceptance denominators and immutable artifact/host continuity. It caught and
closed the fixture production-dotenv metadata guard omission and constrained
Linux drawing/reference targets to the inspected loopback web origin. Those
small guard additions have syntax/static review; the Linux positive path remains
unexecuted. Independent scoped
Task6 and whole-branch reviews still follow; no positive Linux or production
acceptance is inferred from this self-review.

## Task6 review fixes: cross-process evidence and exercised artifact identity

Scoped review found two executable Linux-harness defects. They were fixed in
round1 without claiming positive Linux acceptance:

- **I1:** The separate API/worker filesystems could not share `/timings` through
  a common filename. Fixture records now use the existing private owned Redis,
  keyed by fixture/job identity and producer. Actual wall/monotonic acknowledgement
  samples are captured before awaited transport; optional local logs may have
  different paths or be absent. The API returns both producers, and the driver
  retains timestamp/source/producer records. Missing admission/worker commit or
  transaction acknowledgements fail after bounded waiting. No records are trimmed;
  oversize/overflow fails with explicit record/job/total-data bounds, four-hour TTL
  and owned idle-phase cleanup. No extra writable bind or API daemon power was added.
- **I2:** Unique claimed roles now bind to host application references, the full
  shared-schema-validated manifest and actual guest image/package authority. The
  API fixture checks the actual worker readiness against that complete manifest
  before phase/seed/admission. A bounded, labelled, stopped broker carrier supplies
  actual image artifact bytes; secure extraction and the existing strict
  `artifact.py` tree identity bind them to the live broker entrypoint tree. Its
  code never runs, and exact ownership/stopped-state checks precede cleanup.
  Accepted candidate/v4 runtime descriptors must match every identity field,
  including image/package/version/shim/policies, rather than engine alone.
  Explicit unrecorded historical baseline mode retains null recorded provenance
  and separately identifies the actual adapter; it never invents an old image
  hash. Full manifest/broker authority is checked again after measurement.

`bash packages/api/scripts/test-native-grading-isolated.sh --acceptance-contracts cove-grading-broker:task6-fix1`
passed **4/4** focused checks. Two are metadata/schema substitution contracts
(doubles); one is an actual stopped ARM64 image/tree check, and one runs **two
real OS processes** with different local timing paths over owned Redis. The API
collector receives no worker-file path: the old API-file-only negative control
cannot find its commit, while Redis returns both producer acknowledgements.
Missing records and overflow reject; retention/cleanup are checked. This proves
the cross-process transport contract, not separate-container/native isolation.
Swapped installed-unused native/compatibility IDs, changed broker tree, duplicate
roles, alternate app authority, changed full runtime descriptors and missing
candidate provenance reject. The actual carrier proof also rejects changed host
bytes. [Focused output](assets/2026-10-29-native-grading-verification/fix1-contracts-green.txt)
and [sanitized summary](assets/2026-10-29-native-grading-verification/fix1-verification-summary.json)
retain the distinction.

The first real artifact extraction exposed a producer defect in the prior
Task5-fix1 broker image
`sha256:4a0146e4dec3c284ca37a7793ba6f6c4efce0685c4dd2e504f730e5a4154a9c8`:
its unused pnpm self-workspace symlink escaped to the build checkout. Docker
refused extraction. Actual bounded tar metadata confirmed exactly one external
link, `node_modules/.pnpm/node_modules/@cove/grading-runtime` →
`../../../../../build/packages/grading-runtime`; runtime JS has no self-package
imports. [Original3-pass/1-fail output](assets/2026-10-29-native-grading-verification/fix1-contracts-red.txt)
and [link metadata](assets/2026-10-29-native-grading-verification/old-broker-link-metadata.json)
remain preserved. The broker producer now asserts that exact unused link/target
and absence of runtime self-imports before removing only that link. Consumer
symlink/mount/tree policies remain strict.

Only the broker image was rebuilt once after this necessary packaging fix:

```sh
docker build -f packages/grading-runtime/Dockerfile.broker --target runtime -t cove-grading-broker:task6-fix1 .
```

Its new local **ARM64** config ID is
`sha256:59ebe6a39abf529dcf099e4f6756d15727d97e4ed25acc98f3bb2d00f991d10c`,
strict extracted tree identity
`e487bc158b0cfd0c0b475d168537b1aae85f561f171cbb711f1d922b474e8a58`.
This supersedes the unextractable prior broker artifact. Bounded readonly,
network-disabled broker imports/filesystem smoke passed; **41/41** runtime
contracts and the broker build-warning audit (no missing-bin names) passed.
API/worker/web product code and their tested artifact identities were unchanged;
those image/build suites were not repeated. This new broker ID needs its own
AMD64 build, scans and acceptance before any deployment.

The weighted browser flow now performs a second real submission against the
changed revision: the weight-one sample passes, weight-two hidden case fails,
and both persistence and authorized public result report exactly **33/100,
earned1/possible3, passed1/total2** (equal weights would yield50). The first
submission still proves frozen revision/prompt-ignore/Unicode at100/100.
Only that covering flow ran, **1/1 in27.9s**, with its original one-second policy.
An initial fixture assertion confused a case outcome with the submission's
`FAILED` status; its screenshot/trace remains retained, and correcting only that
assertion yielded the passing result. An earlier new timing test used the wrong
child-process module-resolution directory and failed before Redis transport;
its corrected API-package cwd then passed. Neither was a product defect.

E2E TypeScript, owned MJS/Python/shell syntax and whitespace checks passed.
No broad passing browser/API/shared/web suites were repeated. Known Next dev/pg
Minor diagnostics remain disclosed above. Positive Linux/native execution,
cohorts/performance/certifications/scans/pilot remain unexecuted; no acceptance
signature, production enablement or external publication occurred.

## Preserved implementation rulings

The following 21 decisions preserve the SDD ledger verbatim, including reason
and cost. Later review decisions may be appended before scratch cleanup.

Ruling: Execute in a new isolated feature worktree without an extra permission question — reversible workspace setup is implied by the implementation request and the developer autonomy instructions — cost if wrong: local worktree/branch cleanup only.

Ruling: Local ARM64 cgroupfs tests cannot attest production rootless/systemd AMD64 readiness; keep those gates closed and produce a separate executable Linux harness — environment capability is measured, not presumed — cost if wrong: additional Linux validation remains before activation.

Ruling: Use synthetic loopback fixture URLs rather than copying ignored dotenv files into the worktree — prevents accidental production seeding — cost if wrong: extra fixture-auth setup.

Ruling: Add required frozen memoryLimitMb to broker reserve and require run-budget agreement — preparation cannot fund the correct guest before run without the declared budget — cost if wrong: coordinated pre-activation wire/client changes.

Ruling: Explicit validated broker warmProfiles configure READY targets; initialization must fund them before readiness, and fresh refill may overlap checkpoint acknowledgement without executing another case — preserves prepared compatibility behavior inside the shared bank — cost if wrong: additional configuration or failed readiness until corrected.

Ruling: Task3 persists immutable per-attempt execution-lease history (including worker/broker generations and reservation ID) before source release, with sample context in Redis — generation/token alone cannot reconstruct original receipt authority after worker restart, and overwriting active owner fields would lose it — cost if wrong: an additional additive private table/migration and recovery coordination. Stable case IDs use frozen positions, not counters.

Ruling: Extend the pre-activation broker contract with persisted monotonic admissionEpoch, reserve-epoch fencing, terminal retire and quiescent seal/compaction — bounded storage cannot preserve every case tombstone forever, and deletion alone would allow delayed replay; durable worker terminal acknowledgement plus irreversible epoch advance keeps prior admissions rejected across restart — cost if wrong: coordinated worker/lease-history/schema changes and epoch reconciliation work before capacity can be reclaimed. No old-attempt engine substitution or execution is authorized by sealing.

Ruling: Retain bounded private sample execution-lease/index context until confirmed broker retirement, independently of public sample-result TTL — expiring the sole original worker/reservation/epoch authority would make a pending receipt unrecoverable after restart; sample results remain ephemeral and non-scoring — cost if wrong: additional private Redis control-state retention and reconciliation, without student grade/history records.

Ruling: Recoverable partial attempts resume from validated receipts/checkpoints within their original wall deadline; use non-scoring WORKER_LOST only for expired or genuinely uncertain/unrecoverable evidence — approved spec13 explicitly requires checkpoint/receipt recovery and forbids known-case rerun; blanket termination of every interrupted partial attempt would omit that behavior — cost if wrong: additional recovery/takeover/comparator integration, while preserving frozen deadlines and points safety.

Ruling: Seal aged idle epochs and collect only terminal/retired private history after durable seal acknowledgement — bounded recovery evidence must not permanently block existing material/course deletion through Restrict FKs at low traffic — cost if wrong: additional bounded idle seal writes and garbage-collection coordination; no early deletion of live or uncertain authority.

Ruling: Live grading availability is an application admission/monitor contract, not only a release-time preflight — a broker cleanup fault must stop new runtime selection even when certificates remain valid; use a bounded private manifest/worker-bound worker attestation with no broker-control access in API — cost if wrong: coordinated readiness publication/configuration and bounded freshness behavior; no engine substitution for accepted attempts.

Ruling: Leave the pre-existing intentional invalid-profile SubmissionService test diagnostic as a non-blocking Minor; assert/capture the newly changed integration negative diagnostic — unrelated logger cleanup adds no product safety or behavior proof to this fix — cost if wrong: existing expected test-log noise remains, explicitly reported separately from real failures.

Ruling: Apply the proven replayable-cursor startup fix to both student and practice QueueEvents, with matching actual-transport regressions — the same confirmed loss window delays official grades as well, and preserving student SSE means preserving reliable behavior rather than retaining this bug — cost if wrong: bounded retained-event replay on first consumer initialization; no change to owner/tenant authorization or result schemas.

Ruling: First-host activation cannot use fabricated host-bound acceptance evidence; bootstrap requires a new explicit bounded resource-transfer/acceptance arrangement with restoration — current task does not revive the production pause the user stopped, and unavailable proof is a real gate — cost if wrong: additional host validation/authorization remains before native production admission.

Ruling: Retained release recovery includes a validated repair-release path, not only same-target resume — an immutable broken target must be replaceable while preserving all work/metadata it may have admitted — cost if wrong: another explicit signed recovery transition and additional state-machine tests, without automatic unsafe downgrade.

Ruling: Finish interrupted Task5fixround2 with a fresh standard integration implementer (/root/deployment_recovery_finish, gpt-6.1-sol high) — original architect agent failed with a provider usage-limit error mid-turn; preserve existing work and retain scoped independent review rather than stall or redo — cost if wrong: additional recovery-context/review effort or a later fix.

Ruling: Warm and validate the actual charged-memory telemetry helper during bounded engine startup before READY/source release — a proved first-launch tool delay belongs to infrastructure preparation, not a learner case deadline, and actual libproc measurements preserve compressed-memory charges — cost if wrong: additional cold-start readiness delay; missing/unreadable telemetry must still fail closed, with no RSS or fabricated fallback.

Ruling: Add exact Docker-context exclusions and synthetic maximal-COPY guards for .env-backups/ and e2e/.auth/ before final builds — .gitignore explicitly identifies these as sensitive but the new Docker exclusions/canaries omitted them, while builder COPY . . accepts arbitrary backup/auth JSON basenames — cost if wrong: two additional excluded local-only directories and focused packaging checks; no real backup/auth contents are read. Task6implementer notified, parent metadata/source-onlycheck.

Ruling: Give only the four transport-correctness fixtures an explicit two-second exercise profile after preserving a real 1029-ms/one-second time-limit outcome — those tests isolate event replay, while the timeout case and matching-Linux simple performance cohorts keep their one-second policies; the Mac root cause is not established — cost if wrong: transport coverage does not prove one-second grading performance, and the original failure remains a disclosed diagnostic limitation rather than being excluded from acceptance evidence. No production deadline changes.

Ruling: Leave the disclosed Next development destination-stream digest and pg client-query deprecation as non-blocking Minor diagnostics — actual production standalone abort/navigation remained healthy with zero listeners, and unrelated framework/driver cleanup supplies no additional grading correctness proof in this fix — cost if wrong: development stderr noise and a future dependency investigation remain; no global suppression or claim of a proven root cause.

Ruling: Fix the exact unused build-only self-workspace symlink in broker packaging and rebuild only that artifact — the new real extraction/tree test exposed a concrete producer defect preventing the required strict artifact verification, so the consumer fix cannot finish honestly without repairing its artifact — cost if wrong: a superseding broker config ID and narrow rebuild/import/tree validation; existing symlink/mount/identity policy stays strict, API/worker images remain unchanged, and the prior failed artifact is disclosed.
