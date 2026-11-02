# Native grading implementation evidence — 2026-11-02

Source implementation is complete for the three scoped tasks. Native Linux
containment, actual Next browser latency and classroom/fleet release gates remain
**unpassed**. Native production admission remains disabled; manifests generated
from the packaged release have **zero eligibility**. No production access,
deployment, push, purchase, 200-client load, privileged catch-all container,
rootless attestor or host-security weakening was used.

The approved design is
[the classroom specification](../superpowers/specs/2026-11-01-native-grading-classroom-capacity-design.md).
[The operator commands and safety boundaries](../../deploy/native/README.md)
describe the executable packaging and qualification path. Tasks 1/2 are retained
as committed and independently reviewed; this task adds packaging, qualification,
bounded measurement and native telemetry integration.

## Delivered artifacts and boundaries

- `deploy/docker/native-grading.Dockerfile` builds the actual worker closure and
  credential-free Python rootfs from pinned Node22.22.0/CPython3.12.12 images,
  NsJail revision d8415bc8eea43cdd413daba25af63127019a1189 and Debian snapshot
  20260301T000000Z. pnpm9.15.9 uses the frozen lockfile. BuildKit consumes a
  digest-derived local guest tag checked against its immutable ID before/after.
- The final NsJail ELF has `$ORIGIN/launcher-lib` RUNPATH; every bundled library
  has `$ORIGIN` RUNPATH. Final ELF/library hashes are measured after patching.
  Non-glibc dependencies are recorded in the rootfs package manifest and checked
  at artifact generation/startup. A supported host supplies glibc>=2.36 and its
  matching loader. Cleared-environment linkage/import probes pass locally.
- A disposable systemd delegated unit gives launcher/worker/comparator and all
  learner descendants one finite CPU/memory/PID parent. The private0600 Unix
  socket is in a0700 directory; trusted processes use the same UID. Worker
  capabilities are dropped, while only the launcher/controller retains explicit
  namespace/proc-inspection authority. Learner capabilities, NNP, seccomp,
  namespaces, read-only rootfs and kernel controls remain independently verified
  before GO. No Docker socket or public executor API is provided.
- The qualification parent has2CPUs,2560MiB,no swap,256tasks,1024MiB service
  overhead and512MiB maximum authored cases. Host headroom remains at least20%
  and1GiB. Launcher readiness checks actual baseline and ancestor limits; this
  configuration is a qualification budget, not measured classroom capacity.
- `qualify-linux.sh` owns pinned private Compose DB/Redis, fixture sentinels,
  migration and label-checked cleanup. It executes actual NsJail containment,
  bounded1/2/4 application cohorts, real Nest/Next/browser smoke and a running
  learner launcher-SIGKILL test. Crash readiness is proven by the known fixture
  program writing a private marker after GO, not an elapsed startup delay.
- The real application fixture uses valid short Python, actual NativeExecutionService,
  NsJailBackend, bootstrapNativeWorker, authorized admission, frozen queues,
  Pyodide comparison and atomic commits. Its synthetic auth provider exists only
  in this isolated boot. The Next source copy excludes dotenv/auth state, builds
  the real product application and drives existing Monaco/Submit/result/SSE paths.
  `/cohort` returns matching seeded students, URLs and SSR sessions together.
  The real installed Supabase SSR SDK accepts these generated sessions in tests.
- The benchmark defaults to2clients and a60-second budget. Larger workloads
  require explicit owned-fixture authorization. Distinct students and reviewed
  correct/wrong-output/Unicode/input/prompt/runtime-error/curriculum sources are
  recorded by digest. Expected FAILED grades count as correct grading; ERRORED,
  rejected, timeout, wrong case outcomes and missing results remain failures.
  Primary p50/p95/p99/max include all measured elapsed outcomes. Unattempted work
  stays in the denominator. Actual trusted Submit click events determine browser
  arrival windows, with same-generator epoch/monotonic alignment recorded.
- `--assert-slo` refuses application-only timing and incomplete/all-correct
  corpus evidence. It requires actual Next,200clients,10cases,5bursts,<=1-second
  arrivals,512MiB authored reservation, the bounded source/stdin/output workload,
  and every committed expected result visibly displayed in<5seconds at80ms/20Mbps.
  The application currently freezes an8MiB execution-output ceiling; evidence
  records that actual ceiling separately from the corpus's<=128-byte generated
  output bound. No16KiB enforced output ceiling is invented.
- Native telemetry now shares bounded ExecutionTelemetry with the comparator,
  records trusted acquisition/startup/execution/cleanup timings under actual
  official/practice/sample/regrade context, and exposes private loopback readiness
  and fixed-cardinality metrics. Missing per-job queue/DB-pool/commit-to-display
  stage splits remain explicitly unmeasured; unrelated clocks are not subtracted.

## Local evidence and exact identities

Raw logs are retained under the ignored workflow directory
`.superpowers/sdd/2026-11-02-native-grading-classroom-capacity-implementation/task-3-evidence/`.
They contain synthetic fixture data only. Private credential contents were not displayed or used for a connection; the cancelled broad-copy issue is recorded below.

The strict actual image probe ran using:

```
bash deploy/native/build-image.sh
bash deploy/native/verify-image.sh sha256:RECORDED_FINAL_IMAGE_ID
bash deploy/native/local-gate.sh sha256:RECORDED_FINAL_IMAGE_ID
```

Local host: Docker Desktop Linux ARM64/aarch64, kernel6.10.14-linuxkit,
8vCPU,4109737984bytes RAM. The local actual launcher gate returned **exit78**:
`Unsupported: delegated cpu/memory/pids controls required`. Its source/runtime
hash checks and real comparator measurement executed before that refusal. No
capability/mount/security repair was attempted.1/2/4 actual execution, full native
application and browser cohorts were therefore **not executed**: growth stops
at the failed prerequisite. Ordinary deterministic Task2 fixtures are not native
performance evidence.

Measured ARM64 release identities from this probe:

| Artifact | SHA-256 |
|---|---|
| Guest build image | a7e11b9179ceacf049de15023675dab2b6f1f07c77db064a295a25820afe2662 |
| Python rootfs incl. launcher dependency manifest | fe63ecf6833d5c7ca336e19b0ecc669bdfb48261acbb4a3d7c2a8e5601a11baa |
| Package manifest | b2db20cd4758f7c623908bf33464ee75b00c1d447efd5ba54bcb2f5b72456f5e |
| Final patched NsJail binary | 9925ca019884f80086b1ab94f47d02ad3f9cdc825b34462393e4d0e8766850aa |
| ARM64 sandbox policy | 00ae262624b0ea0a9e7145575afc70cd4df14795b6366cd89d20fff6036ad4c3 |
| Guest bootstrap | 85b71ebe507c4b80f55e2bf34321f8b0a665c3712c0915384a4694217f6372cf |
| Actual Pyodide0.27.5 comparator+harness | 6a80b84db1b620e1fb16c598d9cc7187da4f4a79827ef75c62cf94ac85eefc2a |

Final OCI config identity and compatibility-build results are appended below
once final verification completes. These are local config IDs, not published
registry digests, and are not an AMD64 qualification certificate.

Passing focused checks:

```
node --test packages/api/scripts/benchmark-native-classroom.test.mjs deploy/native/*.test.mjs
DOTENV_CONFIG_PATH=/dev/null pnpm --filter @cove/api exec vitest run --maxWorkers=2 src/judge/native-telemetry.spec.ts src/judge/native-integration.spec.ts
DOTENV_CONFIG_PATH=/dev/null DIRECT_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture pnpm --filter @cove/api exec tsc --noEmit
DOTENV_CONFIG_PATH=/dev/null DIRECT_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture pnpm --filter @cove/judge-worker exec tsc --noEmit
bash -n deploy/native/*.sh
git diff --check
```

The Node harness/deployment/auth set passes6/6, including actual Supabase SSR
getClaims, invalid/expired/private fixture authorities, bounded arguments,
unsafe deployment intent, failed outcome denominators and expected runtime-error
grades. Focused API tests pass15/15. API/worker typechecks pass. Installed Next16.4.1
Environment Variables and Deploying guides were read before writing the sanitized
Next fixture scripts. No product web source was changed.

## Failed iterations and local build-context correction

The first Docker attempt used a bare local config digest in FROM; BuildKit treated
it as a registry repository and refused it. The build now checks a content-ID-derived
local tag before/after consumption. The second attempt reached broad `COPY . .`
before cancellation. Existing private deployment/auth directories were not fully
excluded, so that local intermediate layer may have contained private files. This
was a copy mistake, even though no tool displayed their contents. No resulting
image was pushed or deployed.

Metadata identified exactly task-owned record `k4iwqt67gedgiogzd6kz119hb`,
279.1MB, created2026-11-02 05:33:22UTC, `[builder4/5] COPY . .`, private/reclaimable,
with no recorded descendants. It was removed using only
`docker buildx prune --force --filter id=k4iwqt67gedgiogzd6kz119hb`; subsequent
ID-filter inventory was empty. No unrelated cache, image or container was pruned.
Source and tools now use explicit COPY allowlists. Shared `.dockerignore` excludes
actual deployment.env/secrets/generated, e2e/.auth, .env-backups, authority JSON
and generated fixture-browser state. Final artifact filename checks find no
runtime dotenv/authority/auth-state files.

Build logs also retain optional `msgpackr-extract` node-gyp failure messages when
its native accelerator cannot compile in the slim builder; pnpm completes and
BullMQ's JavaScript implementation remains available. Prisma generation reports
an OpenSSL detection warning in the Node-only builder; the generated Prisma7
client uses the pg adapter. These are not silently promoted to runtime correctness
or performance qualification; the supported-Linux application gate must exercise
that actual artifact.

## Mandatory bridge and remaining release gates

The deployed old sweeper is incompatible with enabling native admission. Deploy
this branch's filtered compatibility worker with admission **OFF first**, verify
no unmodified worker/sweeper remains, then acknowledge the bridge and enable only
explicit certified scope. API and compatibility-worker Dockerfiles now build
shared/runtime before their consumer, and every existing dependency recipe includes
the runtime workspace manifest. No bridge deployment was performed.

Rollback disables new admission and drains accepted native snapshots on retained
matching descriptor queues/workers. It never switches accepted work to Pyodide.
A later agreed VPS window needs exact image/config/queue-state capture and a
separately tested independent watchdog restoring original images and pause states;
the operator README gives the required sequence. No prior maintenance permission
is reused and no unattended deployment manager is added.

Unpassed release gates: actual delegated Linux/AMD64 containment and crash reaping;
complete native semantic compatibility; actual full application/Next measurement;
forced DB/Redis/node failure; measured generator/fleet/DB sizing; cold readiness;
background/reference/drawing load with<=10% p95 regression; higher-memory
availability; and five separate all200-visible-results-under5s qualifying bursts.
No capacity or production-ready claim follows from the source/tests/image build.

## Final Task 3 verification

Final native ARM64 OCI config ID:
`sha256:01f955bc83fe565d8c75393ea0e5ae7983aa5ac3bfc7a59516fa8402f8d2432b`.
`image-build-final-committed-source.log` passes; `image-contract-final-passed.log`
passes relocated ELF loading with a cleared environment, measured dependency
hash validation, actual native-worker module import and the complete `.env*`/
authority/auth-state filename inventory. Relocation uses a dedicated executable
`/verify` tmpfs only for the trusted ELF probe; learner tmpfs noexec protection
is unchanged. An initial probe hit Docker's default noexec `/tmp` and failed
EACCES; that failed log is retained rather than treated as a runtime/linkage pass.
The final actual launcher still returns exit78 for missing delegated controllers
(`local-native-final.log`), and the host Linux runner itself returns78 on macOS
(`linux-runner-local.log`). No actual native/application/browser cohort ran.

Compatibility packaging checks pass:

- All four clean frozen dependency targets: API, judge-worker, web and home.
- Clean compatibility judge-worker `builder`, including shared/runtime compilation
  and production deployment closure: `sha256:44105b2ba7992fd5ca6e55898e98700ed752387409a6b1d2bde132b026eb74d7`.
- API dependency target: `sha256:c571cc3a6a6613f924aea29053409b997028b14dee31db79eab4e96d930002da`.
- Judge dependency target: `sha256:825e993ee817ceda2a173a48f8feadffaa72933753f382dc2f1ef18d55dee0b7`.
- Web dependency target: `sha256:f47f5ac673acd39fd600e34c7f2e471e59de82e05635f4d640e64d44b5082b9e`.
- Home dependency target: `sha256:8bffc0eae1ec0ba8d6f2588b4bdda76f643acce18a2f3663f443f5c78fa232e4`.

Commands: `docker build -f deploy/docker/judge-worker.Dockerfile --target builder
-t cove-native-bridge-worker:qualification .` and the four sequential dependency
builds in `deploy/native/build-bridge-checks.sh`. A redundant second worker-builder
run was cancelled after the prior clean builder had passed; no second success is
claimed. Final source image builds were serialized after that cancellation.
Legacy full web/home production builds were not repeated; this task changes only
their workspace-manifest/dependency-copy closure, which the clean targets verify.
The new native image compiles/builds the API and its production closure.

Final scoped Node tests remain6/6, focused API15/15, API/worker types pass, shell/
JavaScript syntax and `git diff --check` pass. Native fixture Compose renders
without starting resources. The installed Next CLI guide was also inspected for
production build/start directory/host flags. No CI workflow was pushed or run
remotely; its complete supported-Linux integration remains an explicit open gate.

## Scoped Task 3 review fixes

The two Important findings in `task-3-review.md` are fixed without changing
production code or native containment/admission/queue behavior.

1. `build-next-fixture.sh` now runs the web package's actual `prebuild` lifecycle
   inside the tracked-source sanitized copy, generating both noVNC and Monaco
   before Next compilation. Its bounded `--assets-only` regression mode executes
   those same generators. The regression checks nonempty generated files, starts
   the real installed Next16.4.1 development server with the sanitized web working
   directory, and compares HTTP200 response bytes with generated files for
   `/monaco/0.55.1/vs/loader.js`,
   `/monaco/0.55.1/vs/assets/editor.worker-Be8ye1pW.js` and `/novnc-rfb.js`.
   It does not copy ambient generated assets, dotenv or auth state. This is asset
   generation/serving evidence, not a full native/browser performance result.
2. The benchmark's actual RPC factory now floors/clamps each post-deadline-check
   transport timeout to an integer in1..15000ms. A live sub-millisecond allowance
   gets1ms; the overall watchdog/deadline remains unchanged. The HTTP regression
   uses a fake remaining clock with4999.5ms,50.5ms and0.75ms allowances: readiness
   succeeds, stalled requests abort within the remaining budget, and an expired
   deadline prevents the next request. The former ERR_OUT_OF_RANGE is not a
   successful timeout or hidden failed submission.

Focused verification:

```
node --test packages/api/scripts/benchmark-native-classroom.test.mjs deploy/native/*.test.mjs
bash -n deploy/native/build-next-fixture.sh
node --check packages/api/scripts/benchmark-native-classroom.mjs
node --check packages/api/scripts/benchmark-native-classroom.test.mjs
node --check deploy/native/next-fixture-assets.test.mjs
git diff --check
```

All8 focused tests pass (`review-focused-final.log`,5.96s). The separate bounded
sanitized asset/real-Next HTTP test passes in4.05s; fractional HTTP regression
passes in0.10s. Failed test iterations are retained: the first used an obsolete
Monaco workerMain path (the installed0.55.1 package uses hashed worker assets),
and the second launched the development server from the repository working
folder; the verified test uses the sanitized package working directory. These
failures are not reported as successful asset serving.

Script-only image refresh reused the exact tested immutable base
`sha256:01f955bc83fe565d8c75393ea0e5ae7983aa5ac3bfc7a59516fa8402f8d2432b`
through a digest-derived local tag, verified before/after. A temporary recorded
Dockerfile copied only `deploy/native` and the two changed benchmark script files;
no TypeScript builder, package install or broad application suite was repeated.
Latest local ARM64 config ID:
`sha256:cf7da57aae18754dd8adf666d0115000c19c6ef8036376608ba55ef543616533`
(1336350413bytes). `verify-image.sh` passes relocated cleared-environment ELF
loading, native-worker module import, dependency hashes and private-file inventory
on this refreshed image. Exact recipe/build/identity/contract logs are
`review-tools-refresh.Dockerfile`, `review-tools-image-build.log`,
`review-tools-image-identity.log` and `review-tools-image-contract.log` beside the
Task3 evidence. Rootfs/NsJail/policy/comparator bytes are unchanged from the base.

Actual delegated Linux, complete Next/native application execution and all200/
five-burst acceptance remain unpassed. The known local delegated-controller
exit78 remains applicable; no host setting or resource was changed. No production,
remote CI, deployment, push, purchase,200-client load or subagent was used.
