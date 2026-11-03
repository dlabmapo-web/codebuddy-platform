# Native node and disposable qualification

The disposable AMD64 Linux containment, bounded application, actual Next browser
and launcher-crash qualification passed. See the [measured evidence](../../docs/research/2026-11-02-native-grading-linux-qualification.md).
The 200-student classroom/fleet release gates remain unpassed.
Nothing here changes production defaults. No executor port or Docker socket is
exposed to learner execution. An empty eligibility list admits zero new work.

Build locally with `pnpm native:build`. The guest build pins CPython 3.12.12,
Node 22.22.0, NsJail d8415bc8eea43cdd413daba25af63127019a1189 and Debian
snapshot 20260301T000000Z; pnpm 9.15.9 consumes the frozen repository lockfile.
`build-image.sh` records the guest immutable ID and binds it to a digest-derived
local tag, checked before/after BuildKit consumes it. The final image identity
must be recorded separately for each architecture. Never reuse ARM64 hashes on
AMD64. The image contains an exportable `/opt/cove` artifact, with its deployed
worker closure, node binary, Python-only rootfs, NsJail, policy and operator tools.

`package-launcher.py` sets `$ORIGIN/launcher-lib` RUNPATH on the exported NsJail
binary before measuring it. Bundled non-glibc dependencies are hashed in the
rootfs package manifest, checked by packaging startup and bound by the runtime
descriptor. Supported hosts supply glibc >=2.36 and its matching ELF interpreter.
No host protobuf/libnl installation should be needed. Validate the final exported
ELF linkage with `env -i LD_TRACE_LOADED_OBJECTS=1 /absolute/artifact/nsjail`;
all non-glibc dependencies must resolve inside that artifact's launcher-lib.

On ordinary Docker Desktop, run `bash deploy/native/local-gate.sh IMAGE_ID`.
Exit 78 is a failed/unsupported **actual** native gate. Do not grant privileges,
mount host cgroups or change security controls to make it green.
The launcher explicitly requires the pinned NsJail's new mount API
(`open_tree`/`mount_setattr`); it does not fall back to legacy remounts. The
pre-execution gate still verifies the read-only root and writable bounded scratch.

For an approved disposable systemd Linux host only (install Chromium with `PLAYWRIGHT_BROWSERS_PATH=/absolute/fixture-browsers pnpm exec playwright install --with-deps chromium` first and export that same path):

```
pnpm install --frozen-lockfile
pnpm native:build
sudo env PATH="$PATH" HOME=/root PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
  bash deploy/native/qualify-linux.sh \
  --isolated-host sha256:ACTUAL_LOCAL_IMAGE_ID /absolute/new-evidence-directory
```

This uses private owner-labelled Compose DB/Redis, synthetic loopback URLs and
fixture sentinels, all migrations, a bounded delegated systemd unit, actual
NsJail containment probes, actual authorized admission/queues/comparator/atomic
commit, bounded 1/2/4-client application cohorts with 1/5/10 cases, then a running
case launcher-SIGKILL test. It stops growth at the first failure. Cleanup stops
only the generated unit and verifies labels before removing fixture containers.
The crash test proves the known Python source wrote its private marker after GO;
then checks eventual empty cgroups and refused stale restart. Unit-wide shutdown
must independently reap remaining descendants. No Docker-per-case execution is
used. Unsupported kernel/proc protection fails the workflow; it is never a skip.

The unit grants only the trusted launcher/controller CAP_SYS_ADMIN,
CAP_SYS_PTRACE, CAP_SETUID, CAP_SETGID, CAP_SYS_RESOURCE, CAP_DAC_OVERRIDE,
CAP_CHOWN and CAP_SETPCAP. SYS_PTRACE is for inspecting changed-UID jailed /proc
metadata before GO, not for learner code. The worker runs with the same UID so
it can access the 0600 socket in a 0700 directory, but drops every capability and
sets no-new-privileges. Credentials enter only its explicit private environment.
Learner namespaces, capabilities, no-new-privileges and seccomp remain verified
by the actual launcher. No AppArmor/Yama/sysctl/security disable is performed.

The delegated parent enforces 2 CPUs, 2560 MiB/no swap and 256 tasks. Launcher,
worker/comparator and trusted controller live together in its direct `service`
leaf; learner cases are separate child groups of the same parent. There are no
populated sibling service groups. The manifest reserves 1024 MiB service overhead,
128 MiB case overhead, 16 MiB scratch, 512 MiB maximum authored cases and an
official slot/656 MiB reserve. Baseline overhead is a **measured gate**, not an
assumption that this budget is enough for every fleet size. At least 20%/1 GiB
physical RAM must remain outside this parent; fixture DB/Redis/controller budgets
must also fit that headroom on the approved host. Source/rootfs are read-only.
Only the owned work/socket and delegated cgroup paths are writable. Production
needs separately measured API/DB/Redis/OS budgets; this fixture is not sizing proof.

The launcher prewarms jails: after a case with a given memory/time certificate it
keeps up to four fully verified jails gated before GO for the next cases (a case
then starts in milliseconds instead of paying NsJail and CPython startup). Each
idle standby is kernel-capped at 32 MiB, raised to the authored limit only when
claimed, recycled after 30 seconds and not replaced once its certificate sees no
real demand for a minute (recycling is not demand). Standbys hold no CPU slot and
draw on a fixed memory budget: what remains when every slot of either lane holds a
maximum-size case (224 MiB, seven standbys, on the qualification node; none when
slots fill the envelope). A standby stays charged until its cleanup is proven.
Warming starts only on CPU slots no admitted work holds, and a waiting standby runs
at cpu.weight 1 until claimed. NsJail's own namespace setup runs in the service
leaf and is not weighted, so warming still costs some CPU next to running cases;
measure wall-limit outcomes under load. Each result reports `timings.prewarmed`.
They hold `case-*` groups until the service closes; if the launcher dies
their request pipe closes and they exit without running learner code. The guest
rootfs ships unchecked-hash stdlib bytecode, since `-B` on the read-only root would
otherwise recompile the stdlib in every case.

`manifest.mjs` produces measured descriptor/config plus deployment intent with
**empty eligibility**. `validate-deployment.mjs` rejects mismatched family/identity,
public ports, host network/root/socket/privileged plans, writable artifacts,
different socket UIDs, missing capability drops and inadequate envelopes.
`start-node.sh` is an executable launcher/worker supervisor for an already
provisioned delegated service, not a host provisioner/deployer. Supply its explicit
config, matching intent and private worker environment JSON. It drains the worker
before stopping the launcher. Set native worker health port to zero (default) or
a private loopback port; `/ready` and fixed-cardinality `/metrics` expose no student
identity/code/output. The native family is explicit; the ordinary worker's
`JUDGE_RUNTIME_FAMILY=pyodide` retains compatibility queues. Keep descriptor-bound
workers/images for every accepted native queue until its replay window expires.

## Bounded measurement

`pnpm --filter @cove/api benchmark:native-classroom --fixture /private/authority.json
--output /new/report.json` defaults to two clients, ten cases and a 60-second
budget. Cohorts 1/2/4/5/10/20/50/100/200, cases 1/5/10, one to five bursts and a
5..600-second budget are supported. More than two clients/concurrency or one burst
requires `--authorize-isolated-load`; authorization means an owned isolated
fixture, never permission for production. Generator concurrency is finite (max200),
with a 512 MiB Node heap in the package entrypoint. Record OS/container generator
budgets and saturation independently before accepting fleet numbers.

Application mode starts the timer before service admission and ends at a
committed read. It executes short valid Python using the actual launcher/worker,
real authorization/snapshots/BullMQ/comparator and commit. Managed token-provider
verification is replaced by synthetic fixture identities only in this isolated
boot. Application mode is **not browser timing** and cannot pass `--assert-slo`.
The mixed corpus contains correct/wrong-output/Unicode/input/prompt/runtime-error
and short curriculum programs; expected FAILED grades are correct observations.
Wrong case outcomes, infrastructure ERRORED, admission errors, timeouts and missing
results stay in the denominator. All-result five-second acceptance uses maximum
latency, never p95. Prewarm, preparation, replenishment and measured stages are
reported separately; unknown stage splits remain explicitly unmeasured.

## Actual Next browser driver

An explicitly prepared isolated **real Next application** can use
`--mode next-browser`. It must supply the owned fixture authority described below.
The driver loads real `/academy/.../learn/exercises/...` pages with distinct
synthetic students' private storageState, edits the actual Monaco model, clicks
the real Submit button, observes a changed visible result heading and separately
verifies that submission's committed grade, case outcomes and runtime identity.
There are no intercepted/mock Next/BFF/SSE routes and no production auth bypass.
A standalone fixture UI cannot pass this mode. Chromium is visible; use Xvfb on
Linux. CDP applies 80 ms latency and 20 Mbps up/down. The independent fixture read
is outside browser latency; cross-machine commit-to-display remains unmeasured.

`qualify-linux.sh` now produces the whole isolated path: a tracked-source Next
copy excluding dotenv/auth state, a real Next production build, its measured
BUILD_ID digest, a real Nest/oRPC API bound to loopback and a small synthetic
Supabase-compatible provider in the fixture process. `/cohort` returns newly
seeded authorized users together with matching URLs and SSR cookie storageState;
there is no stale prepared-ID/material mismatch. All 1/5/10-case materials and
fixture-only eligibility are created before cached API admission starts. The
provider validates only its generated sessions. The installed real Supabase SSR
SDK's getClaims path is tested against it; production auth code is unchanged.
The scripts install no production auth bypass. The API fixture redirects only
its reserved synthetic HTTPS provider name to this owned loopback provider.

Authority JSON is an owned 0600 regular file with a live fixture PID and short
expiry. The benchmark validates exact loopback origins, distinct users, matching
exercise URLs, reviewed corpus sources and the independently committed grade.
The fixture's `/ready`, `/cohort`, `/submit`, `/result` and `/commit` endpoints
are implemented in `application-fixture.mjs`; operators do not need to author
another server. The qualifier runs the actual Next two-client/ten-case smoke
under Xvfb after application cohorts. The bounded actual Linux/Next execution passed on the disposable AMD64 runner.
Docker Desktop remains unsupported when its delegated kernel prerequisites fail;
that local refusal is not skipped or repaired. See the linked evidence for the
exact tested counts and remaining classroom gates.

The frozen application profile currently enforces an 8 MiB output ceiling. This
fixture records that actual ceiling and its separate <=128-byte generated-output
bound, along with authored 512 MiB memory, source-character and aggregate-stdin
bounds. It does not invent a 16 KiB enforced ceiling. Every SLO cohort checks the
512 MiB authored reservation and <=16 KiB workload output constraint.

Actual Submit click events provide the arrival window and monotonic latency start,
with `performance.timeOrigin + performance.now()` clock alignment recorded within
five milliseconds on the same generator. Driver task-dispatch times cannot pass
the one-second arrival gate. Percentiles/max include failed elapsed observations;
unattempted work remains explicitly failed in the overall denominator.

For an owned running fixture:



```
xvfb-run -a node --max-old-space-size=512 packages/api/scripts/benchmark-native-classroom.mjs \
 --mode next-browser --fixture /private/authority.json --output /new/browser.json \
 --clients 2 --cases 10 --max-seconds 120
```

`--assert-slo` refuses anything except actual Next mode, 200 distinct clients,
ten cases, five complete mixed-corpus bursts, 200 generator concurrency, every
expected committed result displayed within five seconds and <=1-second arrival
window per burst. It requires explicit isolated-load authorization. **Do not run
this locally or against production.** It still does not by itself certify fleet
background/reference/drawing load, <=10% regression, generator saturation, node
failure, deploy/cold readiness or higher-memory availability; those remain
separately measured release gates in the approved spec.

## Bridge, rollback and a later VPS window

Native admission stays OFF while deploying the new **filtered compatibility
worker first**. Verify every old worker/sweeper is retired; old `0ae56bc6` sweepers
query all queued submissions and can send native IDs to legacy queues. Only after
inventory verification may an operator assert
`NATIVE_GRADING_BRIDGE_ACK=filtered-compatibility-workers-v1` and enable explicitly
certified scope. No coexistence promise is made for unmodified old sweepers.
This bridge deployment is not authorized by these scripts.

For a separately agreed future VPS maintenance test, first record exact original
image digests, configuration checksums, queue pause states and stopped/running
services. Provision an independent systemd watchdog **outside the test unit**
with a fixed deadline and an already reviewed restore script. The restore script
must disable new native admission, stop load generation, restore original image
references/configuration and each recorded queue pause state, restart prior
services and verify application health. It must not re-execute accepted native
snapshots under Pyodide; retain matching native workers for drain/recovery. Test
that watchdog on a disposable fixture first, and keep an independent operator
session. Restore in `finally` as well; cancel the watchdog only after independent
health verification and the restoration record. No previous/cancelled maintenance
window authorizes such a test now. No broad unattended deployment manager,
production connection discovery, blanket prune, purchase, push or deployment is
included here.
