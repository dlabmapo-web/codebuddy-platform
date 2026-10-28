# Broader platform performance investigation and shared-read fixes

Date: 2026-10-27 (Asia/Seoul).
Live baseline: `v2.0.43`, `af8c54aedfcc69adac07dd3e0435b3827a1a5c27`.
Candidate: working-tree shared-read changes; not deployed.

## Outcome and coverage

The user's complaint extends beyond Courses and Classes. The expanded audit
reproduced multi-second waits in Members, Student analytics, the manager
overview and a coding workspace. Three measured shared-read optimizations are
implemented. Whole-platform latency, official grading and Turtle targets are
not certified by this patch.

Visited every visible sidebar section using the five supplied role accounts:
14 administrator, 15 manager, 11 team-lead, six teacher and six student entries.
Additional/repeat detail observations bring the retained log to 59 entries.
The administrator includes its global My page entry; the other roles include
their academy profile pages. Teacher live class, Solution status and student
detail, plus student class/course details and a coding workspace, were also
inspected. No edit, official Submit, grading/points mutation, resource change,
restart, pause or concurrent load test was performed in production.

The source inventory contains **95 page templates**, including 46 academy and
36 administrator templates. This is an inventory, not 95 successful browser
tests. Creation/editing flows, every dynamic detail template, media completion,
every chart/filter/pagination state and all curriculum activity types remain
outside the certified live coverage. Testing a sidebar heading alone does not
prove that every component has finished fetching data.

Navigation samples are sequential Chrome observations with naturally warmed
assets and browser-control overhead. Most new timings end at a changed visible
H1; Users/Applications/Invitations used an explicit visible-heading wait. They
are exploratory observations, not comparable p95 cohorts or standardized
first-load measurements. The previous course/class study used the stricter
heading-plus-first-row boundary and must not be mixed into these distributions.

## Additional live waits

| Role / surface | Observation | Boundary |
| --- | ---: | --- |
| Manager overview | 4,409 ms | Changed H1 observed |
| Manager Student analytics | 3,839 ms | Changed H1 observed |
| Manager Members | 3,041 ms | Changed H1 observed |
| Team lead Student analytics | 3,325 ms | Changed H1 observed |
| Teacher Students | 1,630 ms; repeat 1,494 ms | Changed H1 observed |
| Teacher student detail | 1,508 ms | Changed H1 observed |
| Student class detail | 1,428 ms | Changed H1 observed |
| Student course with class context | 1,211 ms | Changed H1 observed |
| Student coding workspace repeat | 2,140 ms | Test run and Submit controls visible; excludes first-keystroke/PDF completion |

The first coding-workspace timing is unavailable: diff-only accessibility
observations did not report both controls in the same snapshot even though the
workspace/editor were subsequently verified. The repeat used stable locator
waits. That diagnostic failure is not recorded as a 15-second application load.
The first ranking wait also used the wrong expected heading; its later correctly
observed visit is retained instead. Login after client-side sign-out showed an
empty security-widget area and required a normal page reload. Automatic security
checks then completed; no CAPTCHA was manually solved or bypassed.

## Proven shared query bottleneck

Read-only deployed service profiling counted **46 SQL statements** in manager
overview and **20** in Members. The same connection ran inside an explicitly
verified `READ ONLY` transaction. This serializes independent work and Prisma
can resolve batched promises together: whole-method and queued-query timings
from that profiler are not HTTP latency or pure SQL execution time.

Individual `EXPLAIN ANALYZE` measurements then separated actual database
execution. The attention-candidate query took **2,307 ms** inside PostgreSQL.
Its plan recomputed the passing-attempt aggregate **2,891 times**, with a nested
loop over the counted-attempt CTE. The query is shared by the manager/teacher
overview and student analytics paths; its cost is not a browser-only loading
indicator or evidence that Contabo host RAM is exhausted.

The candidate calculates the newest passing rank with a window aggregate once
per user/material pair. It keeps the original ordering, thresholds, progress
revision comparison, source identity and pair-preserving authorization predicate.

Three alternating baseline/candidate SELECT pairs ran in the **same enforced
read-only production snapshot**. Only equality/count/timings were retained:

| Query | Three observations, ms | Median |
| --- | --- | ---: |
| Deployed self-join | 2,021.7 / 1,885.8 / 2,013.8 | 2,013.8 ms |
| Candidate window | 390.3 / 164.3 / 297.0 | 297.0 ms |

All **1,006 returned rows were identical** in each pair, including their facts.
This is approximately 85% lower median query wall time in this small diagnostic.
It includes database/network time and excludes the surrounding page. It is not
an 85% whole-page improvement or a deployed performance result.

## Fresh permission snapshot across academy reads

The common member permission check made five database queries: account status,
the ordinary DLAB-identity check, membership, academy state and extra roles.
The candidate fetches account/member/academy facts together in one scoped SQL
projection, then runs the unchanged policy and fresh DLAB lookup. There is no
cross-request authorization cache. Support, platform and library fallback reads
keep their existing rules.

Three alternating service comparisons per supplied role ran in the same
read-only snapshot. Both implementations returned identical access results:

| Role | Deployed median / queries | Candidate median / queries |
| --- | ---: | ---: |
| Platform admin inspecting academy | 288 ms / 6 | 195 ms / 4 |
| Manager | 189 ms / 5 | 75 ms / 2 |
| Team lead | 182 ms / 5 | 80 ms / 2 |
| Teacher | 206 ms / 5 | 72 ms / 2 |
| Student | 221 ms / 5 | 79 ms / 2 |

These auxiliary service measurements exclude JWT/provider checks, HTTP, server
rendering and browser work. They improve a common dependency of academy pages,
admission and result reads; they do not prove every route now meets its target.
Platform-only administration has a separate permission service and does not
inherit every academy-path saving.

## Sample checks, official grading and the reported four workers

Sample status polling previously reloaded a full exercise, all test cases and
the lecture/course relation to ask whether one expected rule was still public.
It now selects only the grading revision and the selected public case's
position/visibility. Current ownership, permission and curriculum reachability
checks remain. Admission still validates all cases through the existing grading
profile; public-rule withholding on edits/hides/reordering remains intact.

The [earlier post-release audit](2026-10-27-post-release-performance-verification.md)
measured two-example Test run actions at 5.299, 4.324 and 11.406 seconds, with
short queue waits but an engine/acquisition outlier and time outside the accepted
job lifecycle. Those are earlier observations, not a new official submission
benchmark. This patch improves admission/read overhead. It does not eliminate
single-use interpreter startup or certify the five-second official grading SLO.

Read-only inspection showed these effective values:

- Deployment manifest `JUDGE_CONCURRENCY=2`; running worker **2**, sandbox **2**,
  one spare. Sandbox CPU ceiling **1.5**, worker **0.75**.
- API environment `JUDGE_CONCURRENCY=1`; the worker's Compose environment
  explicitly overrides this env-file value.
- The TypeScript environment schema defaults to **4**. A source default or an
  edit to `api.env` does not override the deployment manifest interpolation.

Do not change production to four simply because the source says four. More
claims share the same sandbox CPU/memory envelope and fresh-interpreter refill;
they do not make one sequential submission execute four times faster. The
stopped production maintenance benchmark was not resumed.

## Turtle and resource evidence

Eight recent existing API/broker log pairs, internally correlated with IDs then
sanitized, show cold broker launch **1.636–2.023 seconds** and API start
**1.727–2.108 seconds**. They may include other users and are not a controlled
cohort. They exclude browser/RFB connection and visible drawing. The earlier
actual fast-drawing observations were 3.777–4.307 seconds. Intervals from these
different observations must not be subtracted as a precise per-run waterfall.

The public broker is healthy, one active execution slot, no active session at
inspection, standby disabled and private stage metrics not configured. The
existing log boundary establishes startup cost, but cannot split Docker create,
display readiness and browser handshake for every run. `speed(0)` changes
animation, not that startup. No Turtle speedup is claimed for the current patch.

Host memory use was approximately 2,646 MiB, with 9,313 MiB available, swap zero
and load averages 0.36/0.45/0.72 at the snapshot. Idle headroom alone does not
approve warm standby. The running main-service memory ceilings totaled
**11,456 MiB**, plus **256 MiB** for the independent broker. Adding the approved
2,048 MiB warm slice and 3,072 MiB required headroom requires **at least 16,832
MiB**, against **11,960 MiB** physical RAM. This lower bound already fails before
counting dynamic course guests and deployment overlap. It is not a complete
resource attestation and does not authorize reducing unrelated limits.

The current measured page bottlenecks do not establish that buying a VPS fixes
them. Warm Turtle is nevertheless a real resource-budget decision under the
existing design, separate from average current memory consumption.

## Validation and release boundary

- Broad related API regressions: **47 files / 531 tests passed**, six opt-in
  files / 62 tests skipped. Focused permission/sample unit checks: 50 passed
  within the affected coverage.
- Disposable local PostgreSQL: **13 tests passed** across the attention facts
  and permission projection suites. Temporary tables are removed at transaction
  end; the script removed its own database container by immutable ID.
- A second disposable database with all real migrations passed **10 existing
  navigation/manager-access integration tests**, exercising the new projection
  through real application tables and course/class read services.
- API `tsc --noEmit` and `pnpm --filter @cove/api build` passed.
- Self-review using the code-review skill covered parameter binding, tenant
  scoping, status/grant precedence, DLAB HQ handling, result privacy and window
  equivalence. No unresolved correctness finding in this patch.
- Root ESLint could not run: this repository has no root/API flat configuration.
  No lint result is claimed. No web/contract changes require a web rebuild here.
- No deployment, migration or container setting change. Rollback is the prior
  API/worker image; contracts and schema are unchanged. Use the existing release
  workflow, then repeat data-ready/browser and committed-grade measurements.

Credentials, tokens, classroom codes, student code/output, roster bodies, SQL
parameters, returned facts and identifiers are absent from the retained evidence.
Normal sign-in/activity events occurred; all audit sessions were signed out.

## Next decision

Ship and verify the shared-read patch through the normal release process.
Grading startup needs the separately proposed
[local native-runtime feasibility experiment](../superpowers/specs/2026-10-27-native-grading-prototype-design.md).
The user approved the local-only prototype after reviewing that design;
production runtime changes remain unapproved. Public Turtle warm mode
must remain off until a full resource plan and the existing Linux/rootless
performance/recovery gates pass. These are distinct workstreams, not hidden
exceptions to declaring every page and execution fast.

## Evidence

- [Role navigation observations](assets/2026-10-27-platform-wide-performance/browser-observations.json)
- [All page templates](assets/2026-10-27-platform-wide-performance/route-inventory.json)
- [Shared read profile](assets/2026-10-27-platform-wide-performance/shared-read-profile.json)
- [Heavy method query counts](assets/2026-10-27-platform-wide-performance/heavy-read-profile.json)
- [SQL execution plans, sanitized](assets/2026-10-27-platform-wide-performance/sql-plan-detail-summary.json)
- [Attention query comparison](assets/2026-10-27-platform-wide-performance/attention-query-comparison.json)
- [Permission comparison](assets/2026-10-27-platform-wide-performance/permission-comparison.json)
- [Effective settings and budget lower bound](assets/2026-10-27-platform-wide-performance/effective-runtime-settings.json)
- [Recent Turtle startup log summary](assets/2026-10-27-platform-wide-performance/turtle-startup-summary.json)
