# Public Turtle: ten-visitor live concurrency audit

Date: 2026-10-28, Asia/Seoul. Target: `https://cs.coveedu.com/turtle`.
Production release v2.0.46 / `0ae56bc6`; production browser artifact
`brython-3.15.0-2ab1760c5c7107d57457`.

**Ten prepared sessions passed the concurrent Run check. Fresh-entry acceptance
is not clean: earlier setup attempts exposed an intermittent missing drawing
frame/full-Python fallback before Run.** No product fix was made in this audit.

## Concurrent Run result

Ten separate Chromium browser contexts entered the actual public page using
the supplied classroom code. Cookie values and admitted run IDs were checked
for independence in memory: ten distinct grants and ten distinct runs. Their
identities and credentials were never saved in the evidence.

Each visitor reloaded once after authorization, waited for its production
runtime and editor, and entered this synthetic program through the editor UI:

```python
from custom import *; speed(1); color("blue"); [(TForward(160), TLeft(90)) for i in range(200)]
```

The one-line form avoids editor autoindent changing pasted test input. Slow
teaching animation intentionally keeps the drawing active; it is not the
`speed(0)` fixture used for the previous single-visitor startup diagnostic.

Run click commands were dispatched together. Each page produced its first
stroke; authenticated recovery requests then independently confirmed all ten
run records ACTIVE at three observations. Every page reported RENDERING and
none offered full Python during those observations:

| Observation | Active browser runs |
| --- | ---: |
| After all first strokes | 10 |
| After normal lease renewal | 10 |
| End of hold | 10 |

The first and last observations span **31.577 seconds**. Every visitor completed
**two successful automatic lease renewals**. No concurrent Run/renewal failed
and no page crashed in this prepared cohort. All ten access grants were revoked
and all isolated contexts/browser processes closed afterward.

Read-only native broker snapshots before, during and after showed **zero open
native sessions and zero allocated guests**. Browser execution did not consume
the one-slot server runtime. Full-Python fallback was never clicked.

## Timings

These are the toolbar's browser-reported click-to-stroke/renderer-frame values,
including live public BFF/API admission. They are not independently video-timed
physical pixel timestamps. Screenshots separately confirm drawing in every
visitor after the synchronized start.

First stroke: **323.9–835.6 ms**, median **651.3 ms**.
Admission: **251.9–539.6 ms**, median **460.9 ms**.

| Visitor | Reported first stroke | Reported admission | Successful renewals |
| --- | ---: | ---: | ---: |
| 1 | 801.1 ms | 479.3 ms | 2 |
| 2 | 616.6 ms | 436.2 ms | 2 |
| 3 | 802.3 ms | 489.4 ms | 2 |
| 4 | 833.7 ms | 539.4 ms | 2 |
| 5 | 611.5 ms | 457.1 ms | 2 |
| 6 | 323.9 ms | 251.9 ms | 2 |
| 7 | 493.6 ms | 400.4 ms | 2 |
| 8 | 835.6 ms | 539.6 ms | 2 |
| 9 | 686.0 ms | 464.6 ms | 2 |
| 10 | 607.9 ms | 361.6 ms | 2 |

This is one ten-visitor cohort, not a p95 distribution or maximum capacity.
Its fixture, browser and timing boundary differ from the earlier single-user
`speed(0)`/independent-screenshot diagnostic; do not calculate a controlled
before/after speedup from these different tests.

## Startup finding retained separately

Six preparation attempts ended before any simultaneous Run was sent. All their
created test contexts were closed and their access cleanup checks succeeded:

- Attempt 1 expected English labels, but a fresh context used the Korean
  default. The harness subsequently requested `en-US` explicitly.
- Attempts 2–4 corrected editor-readiness/focus handling and input simulation.
  These are automation setup errors, not recorded runtime latency samples.
- Attempts 5 and 6 timed out waiting for a visitor's Drawing iframe. In the
  captured attempt 6 failure, access returned HTTP 200; the workspace showed
  Run with full Python and had no drawing frame before Run was clicked.
  No page JavaScript error was recorded. This is an observed startup failure,
  not simply the earlier selector problem. Attempt 5 lacks equivalent complete
  response diagnostics, so its exact cause remains unknown.

The successful cohort used an authorized-page reload for **every** visitor
before runtime readiness. This is a normal UI action and a test workaround,
not a deployed fix. It separates execution concurrency from the unresolved
first-entry behavior; it must not be described as a clean cold-entry pass.
No deadline, isolation policy, quota or admission control was disabled.

Source review identified startup/Stop handshake and preparation watchdogs as
areas for investigation. A precise root cause was **not** established in this
audit. Further work should reproduce fresh-entry failure and cover it before
claiming a dependable classroom first-entry experience.

## Environment and practical limits

The user explicitly requested Playwright to obtain independent sessions. This
used ten ephemeral contexts on **one Apple M2 / 8 GiB Mac**, macOS 26.6.2,
Chromium **151.0.7922.34**. It is not ten physical student computers. The machine
already had over 6 GiB of swap in use before the earlier setup attempts; client
resource contention is a confounder, not an established cause of the failure.
The contexts competed for this same computer's CPU, memory and network.

Setup was sequential, followed by concurrent Run. This does not exercise ten
cold visitors entering/downloading at exactly the same instant. It does exercise
ten real public-page/BFF/API grants and ten actual production browser runtimes
with overlapping execution and real lease renewal.

Single server container samples were retained before/during/after. The mid-run
sample showed Studio 4.87% CPU and API 0.54% CPU, with their memory below configured
limits. These are snapshots after admission, not measured peak CPU or a
capacity ceiling. No production configuration, deployment, grading worker,
student coursework or official submission was changed by this audit.

## Evidence

- [Summary](assets/2026-10-28-ten-visitor-turtle/summary.json)
- [Successful cohort timings, active snapshots and cleanup](assets/2026-10-28-ten-visitor-turtle/concurrent-results.json)
- [Exact bounded audit script](assets/2026-10-28-ten-visitor-turtle/audit-script.cjs)
- [Ten drawing screenshots contact sheet](assets/2026-10-28-ten-visitor-turtle/ten-running-contact-sheet.png)
- [HTML contact sheet and original-image references](assets/2026-10-28-ten-visitor-turtle/contact-sheet.html)
- [Captured fresh-entry failure](assets/2026-10-28-ten-visitor-turtle/fresh-entry-frame-unavailable.png)
- [Runtime before](assets/2026-10-28-ten-visitor-turtle/runtime-before.json), [during](assets/2026-10-28-ten-visitor-turtle/runtime-during.json), [after](assets/2026-10-28-ten-visitor-turtle/runtime-after.json)

All six failed setup JSON records, ten unaltered full screenshots and selected
server resource snapshots are retained alongside these links. The contact sheet
uses CSS cropping/scaling of those originals and labels its observation boundary;
it is not a platform screen or a single simultaneous camera frame.
Classroom codes, cookie values, grant/run identifiers and student source are
excluded. Only the supplied public classroom access and synthetic programs were
used; load clients required no internal BFF secret or authenticated account.
