# Native grading Linux qualification — 2026-11-02

The disposable AMD64 containment, grading correctness and crash qualification
**passed** on source
`53ba52c171e9b79590f3a73294aa1b01faf6bb78`:
[GitHub Actions run 41420002243](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41420002243).
The user authorized pushing `feat/native-grading-classroom-capacity` and running
this workflow. Production admission remains disabled. This result is not
200-student capacity acceptance or approval to merge/deploy.

**The five-second speed target is not consistently met.** A fresh repeat passed
correctness but its two browser results took 5.007 and 5.533 seconds. The green
smoke workflow does not enforce the full classroom speed gate; see the repeat
results below. Production admission must remain disabled pending release gates.

## What actually passed

- **32 real kernel/CPython checks**, first before DB/frontend preparation and
  again inside the full protected fixture. These exercise actual NsJail and its
  private socket, Unicode/prompts, exit/error distinctions, environment/file/network
  restrictions, closed control FD, CPU/wall/memory/output limits, fresh scratch,
  authored memory classes through 512 MiB, cancellation, cleanup and concurrent
  1/2/4-case acquisition. Learner code was never executed outside NsJail.
- **Nine application cohorts**, 1/2/4 distinct students with 1/5/10 cases:
  **21/21 correct committed grades** through authorized service admission,
  immutable snapshots, descriptor-bound BullMQ queues, the real native worker,
  fresh jailed CPython per case, Pyodide comparison and atomic persistence.
  The four-client cohorts actually arrived together; all arrival windows were
  below 1.3 ms. Wrong-output and prompt sources correctly received FAILED grades.
- **Two real Next browser submissions**, ten cases each, distinct prepared
  student sessions, real Monaco/Submit/API/SSE/result rendering. Both expected
  grades were visibly displayed and independently verified committed. Trusted
  clicks arrived 19.79 ms apart, with clock alignment within 0.78 ms. Chromium
  configured 80 ms latency and 20 Mbps upload/download through CDP.
- **Launcher SIGKILL after execution**: the known Python program wrote the marker
  after GO, eventual case cgroups emptied, and restart refused the exact retained
  stale case. The crash-marker and actual-linux-crash gates both report PASS.
- Owned Compose PostgreSQL/Redis containers and their network were removed;
  cleanup logs are retained. No production server or database was used.

## Measured latency

These are single bursts in this disposable fixture, not a production SLA.
Application timing starts before service admission and ends at a committed read.
Browser timing starts at the actual trusted Submit click and ends after the
expected changed result heading is visible; page/auth preparation is separate.

| Simultaneous students | Cases per program | First service maximum | Repeat service maximum |
| --- | --- | --- | --- |
| 1 | 1 / 5 / 10 | 0.294 / 0.547 / 1.055 s | 0.343 / 0.702 / 1.329 s |
| 2 | 1 / 5 / 10 | 0.255 / 0.846 / 1.377 s | 0.379 / 1.081 / 1.620 s |
| 4 | 1 / 5 / 10 | 0.431 / 1.707 / 3.068 s | 0.563 / 2.005 / 3.682 s |

The two browser results took **4.642 and 4.694 s**. The second was an intentionally
wrong program with the expected FAILED/WRONG_OUTPUT grade, not an infrastructure
failure. Browser preparation took 9.012 s; worker/comparator warmup took 1.761 s.
Neither is included in click-to-display timing. They must be budgeted separately
for startup and classroom preparation.

The parent enforced **2 CPUs, 2560 MiB, no swap and 256 tasks**. Its manifest
reserved 1024 MiB service overhead, 128 MiB case overhead, 16 MiB scratch,
512 MiB maximum authored cases and an official slot/656 MiB reserve. The host
had four CPUs and 16,760,340,480 physical bytes. The recorded parent memory peak
was 1,621,397,504 bytes. The single OOM kill in its cumulative counters belongs
to the deliberate containment OOM test; the application cohorts did not fail.

The browser generator is co-located in this same constrained unit. PostgreSQL
and Redis are owned external fixture containers on that disposable host.
Consequently these functional measurements do **not** establish an independently
provisioned generator, production platform budget or grading fleet capacity.

In the service-only phase, startup/attestation dominated short-program time.
During the browser phase, the worker's aggregate deltas show 20 case preparations
averaging 300.27 ms, execution 23.34 ms and cleanup 40.93 ms; comparator execution
averaged 1.18 ms per case. The two job service durations averaged 3.897 s.
These are aggregate durations from the worker's own clock, not inferred per-job
queue/display splits. Browser contention and CPU throttling were recorded;
independent generator resources are necessary before fleet sizing. No same-host
old-engine baseline was measured, so no speedup multiplier is claimed.

## Exact measured identities

- AMD64 image: `sha256:bced2b35255974105b36e89318f70e37bf54b0e589439db7768982dc289b5f82`
- Next BUILD_ID digest: `sha256:da197d9bf3f3eb1def74539c95bd98aa23d11e419d8f2496a9230296ffdc496f`
- Runtime fingerprint: `native-cpython-dd2140c695913c604afc772f0f2ee937abed9f3a0a439c52a080da26e9d68bbf`
- Rootfs: `sha256:f1c478cc9e61edb2bbb38a8de19dccf58f2a62140d468d3695c5c92e23d8472d`
- Package manifest: `sha256:9618ae5c15e5d02786ae80d103b86e799b5a43b36bd39a50f6962fae3988700c`
- NsJail revision: `d8415bc8eea43cdd413daba25af63127019a1189`
- NsJail ELF: `sha256:15c34813549ef90ea5177d36a4af0631d835627d585ab572d18a1bb8d9639f85`
- Sandbox policy: `sha256:73b12f256c3bf8abdb1ee7d75c0c4db689d36ce3d9b0a03f83d2f4d00ae89006`
- Bootstrap: `sha256:85b71ebe507c4b80f55e2bf34321f8b0a665c3712c0915384a4694217f6372cf`
- Comparator Pyodide 0.27.5 package: `sha256:6a80b84db1b620e1fb16c598d9cc7187da4f4a79827ef75c62cf94ac85eefc2a`

The image was built and measured on the disposable runner, not published to a
production registry. A later deployment must promote and verify its intended
immutable artifact; a mutable tag or separately rebuilt image is not this image.

## Fresh-host repeat

[Run 41421692433](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41421692433)
on `fabf591d24f1de895a241cfcd2c8fab886b4995a` repeated the complete gate after a
documentation-only commit. All 32 containment checks, 21 service results, two
visible committed browser results, execution-marker/crash recovery and owned
container/network cleanup passed again. The runtime descriptor is identical.

Its browser results took **5.007 and 5.533 s**: `allUnder5s: false`. Trusted clicks
arrived 101.75 ms apart with alignment within 0.58 ms. The smoke intentionally
runs without `--assert-slo`; PASS means grading/containment correctness, not the
five-burst/200-client latency certificate. These numbers establish timing
variation and an already-missed two-browser threshold in the co-located 2-CPU
fixture. They cannot justify claiming all 200 students will finish within 5 s.

Repeat image: `sha256:75ed472c02a34e8b58f6dd98a561e4de3ba0a7e6523ed62780bc3e2d03cb142b`. Repeat Next BUILD_ID:
`sha256:b3877b1d8fa4bc3ab2e37631d6674354c1f5c0d2e9ddf3f6b76e32949d319d33`. Its recorded parent memory peak was
1,596,293,120 bytes. Raw results are retained separately from the first run;
no failed timing observation was dropped. The next capacity experiment needs
separately bounded generator resources and production-equivalent grader/platform
budgets before staged larger cohorts. No additional load or deployment was run.

## Fixes supported by failing execution and regression checks

- Relocate pnpm's known worker self-link out of the vanished build source;
  reject other escaping/absolute/dangling links. Five real filesystem tests and
  actual Docker export/relocation validate this closure.
- Return private evidence ownership to the runner without following symlinks.
  Use actual host-loopback Compose ports and apply all 68 migrations before the
  fixture ownership sentinel. The shared real database smoke covers preparation.
- Build Turtle for the exact private loopback parent in a sanitized tracked-source
  copy, then generate real Monaco/noVNC assets and build the actual Next app.
- Correct systemd delegation syntax; keep static credential-free artifacts under
  a traversable asset parent while configuration/socket/case directories stay
  private. Trusted services use the checkout owner's UID with explicit capability
  drops; the learner remains UID 65534 with independently verified containment.
- Specify directory mount targets and require the pinned new mount API, which
  preserves inherited restrictions. Retain the inherited process hard limit;
  per-case PID ceilings and fork/thread restrictions remain mandatory.
- An actual kernel audit identified missing `pread64` killing the Python loader.
  Only that positional read was added to the default-deny syscall policies;
  networking, process restrictions and all pre-GO checks remain enforced.
- Keep bounded startup logs/stderr and supervisor exit information private.
  Socket clients still receive the bounded infrastructure error enum.
- Start Next from its app directory. Handle Nest's non-mutating application
  proxy with an outer listen proxy, confirm actual 127.0.0.1 binding, then set
  API readiness. Wait finitely for exact native fixture readiness before admission.
- Give Chromium private writable home/config/cache directories and no capabilities.
  Begin each synthetic student's inactivity session through the real BFF-authenticated
  API and verify a learning read before returning browser state. Page diagnostics
  confirmed the missing-lease 401/login redirect before this fix.
- Match bounded generator concurrency to client count; previously four-client
  cohorts staggered two at a time. Those earlier runs are not four-student bursts.

Local verification includes 37 runtime contracts, 16 tooling/asset tests,
runtime typecheck/build, both pinned Kafel architecture compilations, exported
worker closure/linkage/import checks, all fixture migrations and a complete
sanitized Next production build. The Mac's unsupported native gate remains an
honest exit 78; actual kernel/browser proof comes from the linked Linux run.

## Remaining release gates

There is **no 200-student/five-second claim**, and even the two-browser threshold
was not consistent across these two hosts. The approved specification still
requires five complete mixed-corpus bursts, all 200 distinct users arriving within
one second and every expected committed result visibly displayed under five
seconds. This run has one two-browser burst, four service clients at most and a
subset of the corpus. Production auth-provider latency, independent generator
saturation, per-job queue/DB-pool waiting, cross-machine commit-to-display, mixed
platform workloads, fleet failure/recovery and production-equivalent hardware
sizing remain unmeasured here. These results cannot certify the existing VPS.

Raw synthetic evidence and failed-run diagnostics are preserved locally in the
ignored `test-results/native-linux-ci-2026-11-02/`; original implementation evidence
is in `test-results/native-grading-2026-11-02/`. GitHub artifacts expire after
14 days. The approved [classroom specification](../superpowers/specs/2026-11-01-native-grading-classroom-capacity-design.md)
and [operator instructions](../../deploy/native/README.md) remain the rollout
boundaries. No merge, deployment, production load test or purchase occurred.
