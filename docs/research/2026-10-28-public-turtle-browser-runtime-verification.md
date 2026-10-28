# Public Turtle browser runtime implementation verification

Date: 2026-10-28, Asia/Seoul. Branch: `feat/public-turtle-browser-runtime`.
Source base: `37dc3c53`; measurements were collected from the local implementation
working tree before the subsequent release commit. Release status is tracked separately.
The [design](../superpowers/specs/2026-10-28-public-turtle-browser-runtime-design.md)
was authorized for implementation. No production service, DNS, release, grading
worker, VPS limit or live student data was changed.

**Status: implemented as a disabled candidate. Performance acceptance is not
complete. Do not enable it broadly on the strength of these local numbers.**
The final full-path diagnostic samples include 188 ms, 213 ms and 1,588 ms;
the 500 ms target is not consistently verified. Late preparation also exceeded
its targets and timed out twice. Collected cohort timings and significant slow/failing observations are retained.

## Implemented behavior

- Public `/turtle` uses a dedicated-origin iframe, fresh dedicated Python worker
  and Canvas bridge when its server-selected pilot profile is available. It
  owns at most one active worker and one unused prepared spare. Python source
  is never evaluated on the application/renderer thread.
- Pinned Brython 3.15.0, native shared `custom`/`shape` helpers, bounded Turtle
  geometry/queries, ordered drawing/output, teaching defaults and useful errors.
  The frame reconnects through an acknowledged MessageChannel even if SSR loads
  it before hydration. Used workers are never recycled.
- Parent-controlled PIN/grant admission, academy/PIN-version revalidation,
  shared start/time quotas, atomic Redis leases and settlement, idempotent
  recovery and one active run across native/browser modes. Browser admission
  carries metadata only and calls no broker readiness/start/lookup endpoint.
- Existing layout, editor/starter buffers, language controls and downloads.
  Project ZIPs use native helpers and are assembled locally in browser mode.
  Unsupported features require an explicit **Run with full Python** action.
- A disabled or mismatched browser grant retains its engine preference on
  refresh, so the generic Run button cannot silently become a source upload.
  Unknown admission recovery for Stop uses GET, including while admission is
  disabled. A DOM component test verifies this source-privacy boundary.
- Distinct effective frame/worker CSPs, immutable manifest/hash verification,
  isolated static hosting, default-off switches and academy selection. Worker
  networking/nested workers/storage/shared channels are denied. Application
  COOP/COEP remains enabled.
- Manual and automatic rollback drain before restoring an unaware API. Browser
  reservations/renewals are blocked atomically, browser records are retired,
  browser-only/inactive grants are revoked, and active native fallback grants
  remain valid. PIN registry, native records and unrelated Redis keys survive.
  The offline tool uses the installed immutable API image and fails closed.

No database migration is needed. See the
[operations guide](../operations/2026-10-28-public-turtle-browser-runtime.md)
for configuration, artifact publication, retained versions, disable/drain/resume
and local-fixture commands.

## Artifacts and environment

The final production artifact is
`brython-3.15.0-2ab1760c5c7107d57457`, built for parent
`https://cs.coveedu.com`, protocol 1, helper API `cove-trial-v1`.
Its required assets total **1,410,816 bytes gzip** (about 1.35 MiB), below 2 MiB.
The exact per-file hashes/sizes are in
[production-manifest.json](assets/2026-10-28-public-turtle-browser-runtime/production-manifest.json).
Local parent origins intentionally produce different content IDs.

Brython is locked to npm 3.15.0; its exact upstream BSD license is included.
Its internal implementation tuple reports `dev` despite the npm/version-info
release label; this is recorded in the package README rather than interpreted
as a promise of full CPython compatibility.

The developer device was an Apple M2 Mac14,7 with 8 GiB RAM and macOS 26.6.2.
The installed Chrome bundle reported 156.0.8078.73; running renderer paths showed
156.0.8078.48. Exact browser UI version was not independently collected.
This Mac is **not** either required classroom reference device.
Late checks observed substantial swapping/compression and `mediaanalysisd`
using about two CPU cores. These are observed confounders, not proof that every
slow sample was caused by the OS. No unrelated process was stopped.

Fixtures used only loopback: runtime harness 3128/4128, real Next workspace
3028, synthetic Nest API 4028, dedicated Redis 6398 DB 1/2, legacy Redis tests
6397 DB 1/2, and static Caddy 4328. PIN `012345`, secrets and all source programs
were synthetic. The API fixture throws on any broker call. No live credentials,
student source, academy records or remote Redis/database were used.

## Timing evidence

The component cohorts measured dispatch through an already prepared interpreter
to a validated new stroke and the next animation frame, observed through the
parent channel. They **exclude API admission** and are not independent video
certification of physical first pixels. Alternating line colors and generation
checks prevent treating an old frame or a turtle cursor as the expected stroke.
Completed drawings were also checked visually. Normal teaching animation was
retained in the product; only startup-isolation fixtures use speed 0.

| Local observation | Samples | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Earlier helper colored line, runtime `f34daf05…` | 100 | 27.72 ms | 67.71 ms | 106.56 ms |
| Earlier standard Turtle colored line, same runtime | 100 | 33.61 ms | 65.46 ms | 83.32 ms |
| Final instrumented helper line, runtime `8dc744cc…`, late contention | 100 | 38.20 ms | 200.14 ms | 333.44 ms |
| Earlier helper preparation, including initial spare | 101 | 324.6 ms | 1,457.1 ms | 2,005.7 ms |
| Earlier standard preparation, including its initial spare | 101 | 1,088.6 ms | 1,466.1 ms | 1,635 ms |
| Final replacement preparation, late contention | 100 | 264.6 ms | 4,526.2 ms | 8,270 ms |

The final initial preparation took **9,154.3 ms**. Two earlier attempts on local
runtime `8db7a742…` hit the 10-second preparation deadline; a clean new-tab retry
then prepared in about 5,323 ms. These were before student execution and are
retained as failures. The late cohort also briefly overlapped targeted software
verification; it is diagnostic evidence, not controlled acceptance.

Final real-workspace teaching-square diagnostics, after removing synchronous
Canvas pixel readback and reducing editor reconfiguration:

| Run | Click to reported first stroke | Admission | Dispatch to reported stroke |
| --- | ---: | ---: | ---: |
| 1 | 213.31 ms | 91.67 ms | 109.29 ms |
| 2 | 188.29 ms | 98.41 ms | 84.98 ms |
| 3 | 1,588.27 ms | 172.61 ms | 1,408.34 ms |

These three samples do not establish a p95. Earlier exploratory full-path
samples also included 229 ms, 380 ms, 436 ms, 522 ms, 580 ms, 979 ms and 1,042 ms.
Do not infer a controlled before/after speedup or a production SLO from them.
The reusable snapshot removes an identified synchronous readback path; the
remaining variance still needs reference-device/staging investigation.

Final busy-loop Stop acknowledgement was **15.915 ms**, measured inside the
fixture, excluding CUA overhead. An earlier final-control Stop was 10.985 ms.
These are functional samples, not the required reference-device p95/flood cohort.

Raw cohorts and diagnostic failures live in
[the evidence directory](assets/2026-10-28-public-turtle-browser-runtime/).
`standard-cohort-100.json` intentionally retained cumulative session preparation;
`cohort-summary.json` documents the slice used for that cohort's preparation
statistics. Earlier data was not overwritten by the later candidate results.

## Functional and software checks

- Final web suite: **1,430 tests / 180 files passed**.
- Shared suite: **928 tests / 53 files passed**; translation suite: **140 tests**.
- Targeted API/Redis/configuration suite: **39 tests / 6 files passed**, including
  actual separate Redis instances, replicas, idempotency, races, quotas, PIN
  rotation, academy suspension, retained profiles, kill switches and drain.
- Focused web suites: **22 tests**, including actual component behavior on
  disabled browser grants and no source upload until explicit full Python.
- Runtime package: **10 Node tests**, including **11 Python model methods**
  against the actual shipped helpers. Covers ordered errors/output, stale
  events, fresh workers, cancellation, animation before completion, resource
  limits and escaped 64 KiB control payloads.
- Existing real CPython/Tk helper suite passed. Additional native controls
  verified reset visibility, invalid speed rejection and matching named colors
  on image `sha256:46b3a49c43b386a746d32a4fe4df05cf430bb58de645e0a5c59afbe31a5cb604`.
- API and optimized web builds, TypeScript, focused ESLint, canonical routes,
  translation checks and frozen-lock installation passed.
- Asset publication tests: **3**; real rollback-shell ordering/CLI safety tests: **6**;
  existing learning rollout tests: **13**. Deployment/Compose/Caddy validation
  passed, retaining the existing always-on resource ceiling.
- Final actual Caddy responses verified different worker/frame CSPs, immutable
  caching, COEP/CORP, no Set-Cookie and denial of application paths, traversal
  and POST. This used production policies on local HTTP transport; it is not
  acceptance of deployed DNS/TLS. See
  [effective headers](assets/2026-10-28-public-turtle-browser-runtime/effective-caddy-headers.json).

Local Chrome visually exercised square, race and independent query output
`-330.0 -370.0`, fills, circle, UTF-8 text, thin pen overrides, screen controls,
ordered errors with student line 4, unsupported input, infinite-loop Stop and
reload without replay. Storage/shared-channel, XHR, parent access and real
nested-worker probes were denied in local checks. Native/browser project
contents were tested as UTF-8 ZIPs without fetching.

During implementation, checks found and corrected: SSR missing the frame's
initial handshake, closed-channel reconnection, explicit thin pen overrides,
clear-during-fill, reset visibility, invalid speed names, synchronous animation
readback, late events after terminal completion, escaped-source envelope size,
and disabled-profile/rollback source-privacy behavior. Early eager traceback
initialization cost about six seconds; removing that dependency improved initial
feasibility. The engine's compile-code-object path broke starred imports; direct
source execution works. No vendor patch or page-thread Python fallback was used.

## Open release gates

Stage B code is reviewable behind flags; Stage C/D acceptance is **open**.
In particular:

1. Windows classroom laptop and lower-powered Chromebook 100-run full-path
   cohorts with normal paced PIN/admission, independent visible-frame evidence,
   current supported Chrome/Edge and Safari/iPad functional coverage.
2. Cached/cold readiness and spare preparation under controlled load, including
   10 Mbps / 50 ms RTT. Late local preparation failed its target. Full-path
   first-stroke consistency remains unproven and has retained >500 ms samples.
3. Stop/output/drawing-flood p95 and memory-pressure/crash recovery on reference
   devices. Browser memory/timers are best effort, not hard sandbox quotas.
4. Twenty actual visitors/devices, zero broker allocations and no >10% API/
   navigation regression in production-equivalent staging.
5. Exact Tk cadence comparison for `tracer(n > 1)`, broader compatibility and
   font/cursor tolerances, full-Python end-to-end fallback with a real guest,
   effective deployed origin policies and the exact previous-image rollback
   rehearsal. Current shipped helper behavior uses tracer 0/1.
6. Exact-commit CI/container images, reviewed pilot selection, DNS/TLS and human
   release approval. Neither browser switch was enabled or deployed here.

All agent-created local browser tabs, fixture servers and labeled test
containers were removed at handoff. Generated versioned build artifacts
remain ignored locally for review; unrelated prior live-audit files are retained.
