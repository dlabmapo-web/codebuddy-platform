# Public Turtle startup: implementation and local verification

Date: 2026-10-23 (Asia/Seoul)
Branch: `feat/public-turtle-trial`

The user approved the [startup performance design](../superpowers/specs/2026-10-23-turtle-startup-performance-design.md)
for implementation and real local tests, and explicitly deferred deployment.
No production service, release, GitHub approval, production PIN or production
resource setting was changed during this work.

## Implementation

- A single-use standby pool prepares trusted Xvfb/VNC infrastructure without
  student files, Python globals, grant ownership or display capabilities.
  Every claimed environment is destroyed rather than reset/reused.
- The trial remains one active execution with four bounded FIFO queue slots.
  Creation and draining retain physical reservations; execution slots are not
  released until deletion is acknowledged. Queue release is event-driven.
- Stable instance-scoped slot names, generation labels and immutable IDs fence
  delayed creates across crashes. Inventory reconciliation removes late old
  generations and ignores snapshots racing known completed removals.
- Cancellation waits for bounded creation acknowledgement, then retires the
  known ID. Actual timeout ambiguity quarantines the slot. Failed cleanup
  returns a controlled error and blocks new execution until reconciliation.
- Python execution accounting starts after preparation for public guests;
  the course path retains its existing accounting and cold-only behavior.
- Empty asset setup is skipped. The initial assets mount is root-owned mode
  0555; nonempty course assets still install in one trusted root exec and end
  read-only. Shared sandbox validation verifies these permissions.
- Admission preloads noVNC JavaScript without creating a run or socket.
  Failed preloads remain retryable from Run.
- Stage telemetry, private metrics with a separate credential, a host cgroup
  collector, monitoring overlays, a combined resource preflight, an explicit
  slice migration and rollback instructions are implemented. Warm mode defaults
  off in the production Compose configuration.

## Local environment and tests

Real Docker Desktop Linux containers ran the existing
`cove-turtle-trial:dev` image, ID
`sha256:2c9191326003ba0c48ebfe4f30bbf9ae618b87570dc7e80dfad741a9a2387bb0`.
The public browser fixture used web/API/broker ports 3067/4037/4017 and dedicated
test Redis on 6397. Authorization suites used separate disposable Redis DBs
1/2; the normal application Redis on 6380 was not flushed.

| Check | Result |
| --- | --- |
| Runtime unit/policy/lifecycle suite | 37 pass; six real-runtime/retained-image tests are opt-in in this command. |
| Real warm runtime integration | Pass: actual helpers, stdin, private RFB handshake, duplicate request recovery, FIFO, queued cancellation, denied networking, 512 MiB/64 PID cgroup ceilings, read-only assets, fresh files/processes, metrics credential separation, failed Docker removal, dead standby, crash during delayed refill, late orphan cleanup, cold rollback, and final cleanup. |
| Existing real course runtime suite | Four pass; retained-image upgrade test skipped because no second approved local runtime version was supplied. Covers course assets, input, Python errors, timeout, output quota, queue cancellation, seccomp/capabilities, memory/PID limits and descendant removal. |
| API/manager authorization with real Redis | 24 pass across four files. |
| Affected web unit suites | 14 pass across four files: viewer lifecycle, guest boundaries, route DTO and manager settings. |
| Chromium/WebKit complete public fixture suite | 20 pass, including PIN, drawing, exports, race, infinite loops, starter changes, animation, custom commands, bold standard turtle, menus, drafts and language changes. |
| Additional Chromium/WebKit preload/retry run | Four pass; includes two new failure/retry cases and repeats the successful preload checks. Total unique browser cases across both runs: 22. |
| API, web and E2E TypeScript | Pass. |
| Targeted frontend ESLint and whitespace | Pass. |
| Deployment configuration validation | Pass, including cold/warm/monitoring overlays, Caddy, Prometheus with and without the optional scrape job, 14 alert rules, dashboards, shell syntax and five resource/collector unit checks. |

Commands:

```bash
pnpm --filter @cove/gui-runtime test
GUI_STARTUP_REAL_TEST=1 pnpm --filter @cove/gui-runtime exec node --test src/startup-real.test.mjs
# The existing runtime suite also requires a separately started local cold broker.
GUI_SERVICE_SECRET=local-course-regression-never-production GUI_SERVICE_URL=http://127.0.0.1:4028 pnpm --filter @cove/gui-runtime exec node --test src/runtime.test.mjs
TURTLE_TRIAL_TEST_REDIS_URL=redis://127.0.0.1:6397/1 pnpm --filter @cove/api exec vitest run src/turtle-trial src/manage/academy-turtle.router.spec.ts
COVE_TURTLE_REUSE_FIXTURE=1 TURTLE_LOCAL_WARM=1 pnpm exec playwright test --config e2e/turtle-trial.playwright.config.ts
bash deploy/scripts/validate-local.sh
```

The explicit local warm exception accepts only a test process, loopback binding
and a fixture instance. These tests do not establish production rootless behavior;
production refuses that exception and requires the independent rootless daemon,
controllers, a current combined resource envelope and fresh slice metrics.

## Browser timing evidence and release gates

Both 100-run reports use actual PIN admission, BFF/API requests, Python Docker
execution, noVNC and recognition of expected drawing pixels. Repeat timing
includes deletion of the old drawing. No admission limits were bypassed.

| Local development cohort | Samples / failures | First drawing p50 | First drawing p95 |
| --- | --- | --- | --- |
| Original cold baseline | 100 / 0 | 1.535 s | 3.714 s |
| Initial standby-enabled implementation | 100 / 0 | 1.185 s | 4.220 s |
| Final-code smoke check, confirmed ready-standby claims | 20 / 0 | 0.882 s | 1.745 s |

The median improved about 23%; the tail did not improve. These are development
server/Docker Desktop measurements under variable host contention, not a paired
production-equivalent acceptance experiment. An unrelated container reported
very high CPU during the standby run; browser/type-check workloads also changed
local resource pressure. Those workloads were not stopped or reconfigured to
make the result look better. Failed or slow samples were not discarded.

Raw data: [baseline](assets/2026-10-23-turtle-startup/baseline-100.json) and
[standby enabled](assets/2026-10-23-turtle-startup/warm-enabled-100-contended.json).
The initial reports predate per-run private allocation diagnostics, so their
standby cohort is not asserted to contain only ready-standby hits. The benchmark
now records allocation mode and server queue wait for each sample, without
exposing those internal fields through the anonymous API.

The final-code [20-run smoke report](assets/2026-10-23-turtle-startup/final-warm-20.json)
classifies all 20 claims as warm. Its slowest first drawing was 7.629 seconds;
that sample is retained. Broker launch logs for this same cohort had a median
of 29 ms and p95 of 100 ms. Broker launch ends at spawning the Python exec,
not at Python/Tk readiness or visible drawing. The
[private metric snapshot](assets/2026-10-23-turtle-startup/final-broker.prom)
contains only bounded labels/counters, with no credentials or session IDs.
This smaller follow-up does not replace the required 100-run acceptance test.

**The full performance release gates have not passed.** The 100-run results do
not meet the spec's p50/p95 targets or 40% p95 improvement requirement. A later
production-equivalent Linux/rootless benchmark and combined host budget remain
mandatory before enabling production standbys. The main Compose validation alone
reports 8.97 GiB of always-on ceilings; that is not evidence that another 2 GiB
slice plus broker/course/deployment budgets fit the current host. No verified
production envelope was generated, and no resource ceiling was increased.

## Review and handoff

The code review focused on cleanup barriers, cross-pool ownership, late Docker
acknowledgements, idempotency, bounded memory and private credential boundaries.
Issues found and fixed include empty assets losing their read-only permissions,
ambiguous cancellation during creation, stale inventory snapshots, and startup
racing a removal already in progress. Their regression checks are included.

Local manual entry: `http://127.0.0.1:3067/turtle`, disposable fixture PIN
`012345`. The local warm fixture can remain running for manual testing. These
values are not production credentials. See
[operations](../operations/turtle-startup-performance.md) for fixture commands,
resource gates and the later rollout/rollback process.
