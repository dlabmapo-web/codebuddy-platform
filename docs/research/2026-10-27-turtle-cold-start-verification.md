# Public Turtle: reducing the wait after Run

Date: 2026-10-27 (Asia/Seoul). Scope: the gap between pressing Run and the
first visible drawing. Animation defaults, grading and navigation are outside
this patch. This is a cold-path refinement under section 8 of the approved
[performance design](../superpowers/specs/2026-10-27-platform-runtime-performance-design.md).

## Outcome

A small server startup optimization is implemented and tested locally. Each
fresh guest now uses one trusted Python readiness watcher instead of launching
Docker exec/Python again after each unsuccessful display probe. The watcher
checks the same loopback VNC port every 20 ms and exits before learner source
is delivered. The existing 15-second preparation deadline, bounded exec,
transient-exec retry, both isolation/ownership inspections, cancellation and
confirmed container cleanup remain in place.

The final paired component benchmark reduced preparation p50 from **428 ms to
273 ms**, and p95 from **498 ms to 335 ms**. This saves about 0.15 seconds in
that local stage. **It does not prove the full live 3–4-second wait is fixed.**
No runtime was reused, no standby enabled, and no production resource setting
or deployment changed. Two ordinary live public-page checks were followed by
Exit; the production classroom grant/test session was released.

## Timing evidence

All preparations used one immutable locally built guest image,
`sha256:46b3a49c43b386a746d32a4fe4df05cf430bb58de645e0a5c59afbe31a5cb604`,
built from the existing guest Dockerfile. It is a local rebuild, not the live
production image. Linux Docker Desktop ARM64, 1 CPU / 512 MiB per guest,
1024 × 640 display, no network, no warm guests and one allocation at a time.
Baseline source was `739422ec` (same prior readiness loop); candidate source
and watcher hashes are in the raw reports. Baseline and candidate used the same
image, security profile and repeated claim inspection.

| Local paired preparations per version | Baseline p50 / p95 | Candidate p50 / p95 | Failures |
| --- | --- | --- | --- |
| [10](assets/2026-10-27-turtle-cold-start/preparation-paired-10.json) | 551 / 1,850 ms | 388 / 737 ms | 0 |
| [20](assets/2026-10-27-turtle-cold-start/preparation-paired-20.json) | 335 / 481 ms | 289 / 546 ms | 0 |
| [100](assets/2026-10-27-turtle-cold-start/preparation-paired-100.json) | 428 / 498 ms | 273 / 335 ms | 0 |

An [initial five-run diagnostic](assets/2026-10-27-turtle-cold-start/preparation-initial-5.json)
recorded preparation 251–643 ms and display probing 74–304 ms. Its probe misses
identified repeated process launch and 100 ms host sleeps as avoidable work.
The first 10-pair run began alongside the short unit suite, so it is retained as
an exploratory result, not clean acceptance evidence. The second run had a
worse candidate tail, motivating the larger sample. No slow or failed samples
were removed. Final 100-pair timing ran without concurrent agent builds/tests;
unrelated user workloads stayed running. Pair order reversed each iteration.

Percentiles use nearest rank. Preparation includes create, readiness, initial
isolation inspection and claim reinspection. It excludes browser/API requests,
prior-run teardown, source execution, Python/Tk creation, WebSocket/RFB handshake
and visible pixels. `correct` in these component artifacts means preparation
and isolation checks succeeded, not program/grading correctness. Every sample
confirmed container cleanup. **These 100 preparation pairs are not the design's
100 browser Run-to-visible-drawing acceptance runs.** They are not a VPS/rootless
capacity or memory-envelope attestation.

## Functional verification

- Runtime unit/policy/lifecycle suite: **42 passed, eight opt-in skipped**. Four
  new tests exercise an already-ready port, one persistent watcher waiting for
  delayed readiness, bounded failure and cancellation/process exit.
- Separately enabled real Docker startup integration: **one passed**. Exercises
  input, isolation, idempotency, FIFO, queued cancellation, private RFB handshake,
  failed removal, dead standby, delayed creation/crash recovery, late cleanup,
  cold rollback and memory/PID/security enforcement. Its warm setting exists
  only in the isolated local fixture; production warm mode remains off.
- Chrome complete local PIN → BFF → API → broker → guest → noVNC smoke passed
  for initial red drawing and replacement blue drawing, with public capacity
  one and warm mode disabled. Both expected colored drawings were visually
  verified, then Exit released the session. Local startup-log durations were
  1,184 and 542 ms; those broker boundaries exclude browser first drawing and
  are functional diagnostics, not a paired end-to-end speed comparison.
- Node syntax and `git diff --check` passed. Code review found no outstanding
  issue blocking this narrow local patch. No TypeScript/UI source changed.
- The test broker, API, web process, dedicated Redis container and GUI guests
  were stopped/removed. Fixture ports were no longer listening. Existing user
  development services were left running.

Browser automation's read-only DOM scope did not expose canvas pixel APIs, so
no automated browser first-pixel timing is claimed. The first live editor
replacement attempt did not focus Monaco; that run used the default example
and was not a timing sample. A subsequent screenshot verified the intended
red-line program. Browser functional proof is retained separately from timing.

[Live baseline screenshot](assets/2026-10-27-turtle-cold-start/live-baseline-drawing.png),
[local red drawing](assets/2026-10-27-turtle-cold-start/local-candidate-drawing.png),
[local blue rerun](assets/2026-10-27-turtle-cold-start/local-candidate-rerun.png),
[sanitized local broker stages](assets/2026-10-27-turtle-cold-start/local-browser-startup-stages.json).
No PINs, credentials, student programs, grant tokens or session IDs are stored
in timing/log artifacts; screenshot code is a synthetic test program.

## Reproduce and remaining work

```sh
docker build -t cove-turtle-cold:baseline -f packages/gui-runtime/docker/Dockerfile packages/gui-runtime/docker
pnpm --filter @cove/gui-runtime test
node packages/gui-runtime/scripts/benchmark-display-readiness.mjs --pairs 100 --baseline 739422ec --image cove-turtle-cold:baseline --output /tmp/turtle-preparation.json
# The existing real integration expects this local fixture image tag.
docker tag cove-turtle-cold:baseline cove-turtle-trial:dev
GUI_STARTUP_REAL_TEST=1 pnpm --filter @cove/gui-runtime exec node --test src/startup-real.test.mjs
```

The benchmark refuses SSH/remote Docker, uses fresh uniquely owned guests,
retains failed samples and stops after a failure or interrupt. Run timing
without overlapping builds/tests. The source baseline is copied to an owned
temporary directory and removed; no tracked checkout is altered.

A large reduction still requires tracing the complete deployed Run request,
Python/Tk initialization and browser connection, followed by the original real
visible-drawing acceptance cohort. A prepared unused display could remove more
cold setup, but the existing warm resource/recovery/performance gates remain
unsatisfied; this patch does not waive them. The existing resource model must
be resolved separately before enabling production standby. A stronger startup
claim requires new end-to-end evidence after an approved release.
