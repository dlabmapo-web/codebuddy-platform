# Faster public Turtle with browser execution

Date: 2026-10-28 (Asia/Seoul)
Status: proposed specification for user review. The user requested this design
after the browser-execution recommendation. Implementation and production
enablement have not occurred. All latency numbers below are targets unless
explicitly identified as measurements.

## 1. Purpose

Make the first drawing appear quickly after pressing **Run** on `/turtle`.
Move supported public-playground programs to the visitor's browser so ordinary
drawing does not create a server container, connect a remote desktop or wait
for the public broker's single execution slot.

Keep the current page appearance, editor, classroom-code entry, academy name,
Korean/English support, teaching animation and beginner commands. This work
changes execution behind the existing controls; it is not a Turtle UI redesign.

The proposed engine is **Brython**, evaluated first in a local prototype.
Its stock DOM-dependent Turtle implementation is not assumed to work inside
a worker. A worker-compatible Turtle model and drawing bridge are required.
Engine selection is conditional on the prototype gates in section 12; a failure
does not authorize running student code on the page's main thread or silently
substituting another engine.

## 2. Evidence and relationship to previous designs

Production release `v2.0.44`, revision
`d096a7ed19fff70d91ae9a4f9d97560b8dc8558a`, was verified on October 28.
The October 28 live verification in the requesting session
records three first-visible-drawing brackets of 3.020–3.136, 3.025–3.158 and
3.110–3.209 seconds. Another attempt remained queued beyond its 5.218-second
capture window while another session occupied the one-slot public pool.
These are small diagnostics, not production p95 measurements.

The cold-path readiness refinement saved approximately 0.15 seconds in one
[local preparation component](../../research/2026-10-27-turtle-cold-start-verification.md).
It did not remove server allocation, Python/Tk initialization or the viewer
connection. Browser execution addresses those architectural costs separately.

[Python & Turtle](https://pythonandturtle.com/turtle/) identifies Brython as its
runtime. Its [public Run-handler source](https://pythonandturtle.com/static/py/turtle.py)
executes editor code through the loaded browser runtime. This demonstrates the
approach, not compatibility with Cove helpers or proof of Cove's latency target.

This is the separate browser-runtime project excluded from the October 23
[startup design](2026-10-23-turtle-startup-performance-design.md) and October 27
[runtime performance design](2026-10-27-platform-runtime-performance-design.md).
It changes runtime selection only for newly enabled public-playground runs.
Existing server isolation, resource ceilings, standby gates and historical
course-runtime requirements remain applicable to the server path.

## 3. Scope and alternatives

| Approach | Benefit | Trade-off / decision |
| --- | --- | --- |
| Browser execution with Brython and an isolated worker | Removes container and remote-display startup; visitors do not compete for a drawing slot. | Requires a defined Turtle subset, helper parity and browser resource testing. Recommended, subject to prototype gates. |
| Prepared server guests | Retains real CPython/Tk behavior and removes some cold setup. | Retains remote display and central capacity; existing host-budget and recovery gates remain unsatisfied. Not included. |
| More server CPU/slots or a larger execution host | Can increase server throughput. | Does not remove per-run startup and adds operating cost. A separate classroom-capacity decision. |

Included:

- Public `/turtle` browser execution, preparation, Stop/reset and local drawing.
- Compatibility for the existing Drawing, Race and Free starters, public help
  commands and spiral example.
- Existing PIN/grant validation, admission limits, downloads and explicit access
  to the current server runtime when a program needs unsupported features.
- A feature flag, staged rollout, measurements and rollback.

Excluded:

- Changing course Turtle/Tkinter activities, immutable submissions, replay,
  grading, scoring, points or native grading experiments.
- Claiming arbitrary CPython, Tkinter, pip packages, subprocesses, filesystems
  or browser modules are supported in the fast drawing mode.
- Enabling warm containers, raising server limits, purchasing infrastructure,
  pausing production or running production load tests.

## 4. User behavior

1. Open `/turtle`. Download public runtime assets and prepare trusted runtime
   infrastructure while the classroom-code form is visible. Do not execute
   student source, create a remote session or consume a broker slot.
2. Enter the academy code using the existing flow. The editor remains usable
   while initialization finishes. Show a truthful preparing state and disable
   Run until both admission and runtime preparation are ready.
3. Press Run. Immediately acknowledge the click, obtain normal server admission,
   then execute the source in a clean prepared local worker. Draw in the same
   Drawing pane. Browser mode has no remote-display connection or broker queue.
4. Run again. Cancel the previous generation, stop its animation and worker,
   and use a separate clean prepared worker. No previous Python globals survive.
5. Stop immediately ends computation and pending animation, preserving the last
   rendered frame. Clear ends the run and clears the drawing/output. Existing
   starter-change, Reset confirmation, resize, font, theme and fullscreen behavior
   remain intact.
6. Exit ends the local execution, revokes the guest grant and clears the tab's
   draft as today. Expiry/revocation preserves the code for re-entry, as today.

Do not change default `speed(1)`, screen delay, line width or race pacing merely
to improve a startup benchmark. First drawing and completed animation are
different measurements.

An unsupported feature produces a specific English/Korean explanation and an
explicit **Run with full Python** action. That action requires a new user click
and uses the existing public server pool. Explain that it can wait for space.
Do not silently rerun source remotely, allocate a server guest after an ordinary
Python error, or send source to the server while executing in browser mode.

## 5. Runtime architecture

```text
Existing Cove page / PIN / editor / output / controls
   | same-origin BFF: admission and bounded lease metadata only
   v
Existing API + Redis: current grant, academy status, limits, ownership

Cove page
   | validated, versioned MessageChannel; source only after admission
   v
Dedicated static runtime origin, cross-origin iframe
   | trusted controller + Canvas renderer, no student execution on its thread
   +-- active Brython worker: Python, local Turtle model, bounded events
   +-- at most one unused prepared worker: engine/helpers only, no student code
```

| Component | Responsibility / interface |
| --- | --- |
| Playground controller | Owns the editor, admission, generation ID, status, input/fallback controls and draft. Calls a small execution adapter rather than embedding both engines in the React component. |
| Execution adapter | Offers prepare, run, stop, clear and dispose; emits readiness, output, render progress and terminal states. Browser/server session types are a discriminated union. |
| Runtime iframe controller | Owns workers, renderer and bounded local queues. Receives source and non-authority run metadata, never cookies or capabilities. |
| Worker bootstrap | Loads a pinned engine and bundled modules, announces readiness and executes one program. A used worker is terminated, never reset for another run. |
| Turtle model / bridge | Implements supported synchronous Python Turtle calls, maintains logical position/heading, and emits validated drawing operations. It has no DOM or server access. |
| Canvas renderer | Applies an allowlisted command stream, teaching animation and output events in order. Uses fixed virtual coordinates compatible with the current 1024×640 drawing surface, scaled to its pane. |
| Browser admission service | Issues and reconciles browser-run metadata without calling the Docker broker. Reuses current authority and atomic quota primitives. |

Only one active and one unused prepared worker may exist per playground tab.
Preparation loads libraries and trusted helpers, not student code. Refill the
unused worker after dispatch. If it is not ready on a rapid rerun, display and
measure preparation rather than hiding that wait or reusing a used interpreter.
Destroy both workers and their channels when the runtime is disposed.

Preparation states are loading, ready and failed. Run states distinguish
admitting, starting, computing, rendering and displaying; terminal outcomes
include stopped, timed out, unsupported, failed and lease expired. Browser
mode must not display the server's queued-for-space state. A completed worker
may be terminated after handing off its bounded event stream; finished-frame
display and the admitted run's deadline continue independently.

Each operation/event carries protocol version, run generation and sequence.
Drop stale generations after Stop, Clear, starter change, Exit and replacement.
Only the current validated channel can update the visible output or drawing.

Python computes Turtle queries locally: `BlueX()` cannot require an asynchronous
round trip to Canvas. Drawing and stdout share an ordered timeline so a print
after movement is not displayed before the preceding teaching animation. A
program can finish computing before queued drawing finishes; report those
states separately. `done()` signals completion without hanging a worker.

## 6. Compatibility contract

The initial browser release supports this finite contract; it does not claim
to implement the complete standard-library Turtle or CPython API.

| Surface | Required browser behavior |
| --- | --- |
| Language | Variables, numeric operations, functions, lists/dictionaries, loops, conditions, normal exceptions and imports used by the supported examples. |
| Modules | Bundled `custom`, `shape`, `math`, `random` and the documented Turtle subset. `from random import *`, `from shape import *`, and `from custom import *` keep working. |
| Beginner drawing | `TForward`, `TLeft`, `color`, `speed`, and `CircleTurtle`, with current argument validation and shared-pen semantics. |
| Racing | `ReadyToRace`; Blue/Pink/Yellow/Green Forward, Left and X functions; current initial positions, finish x=330, track, coordinate ratios, colors and independent pen states. |
| Standard Turtle | `Turtle`, `Screen`, `getturtle` and module-level shared-pen calls; forward/backward, left/right, goto/setpos, home, position/xcor/ycor/heading, penup/pendown/isdown, color/pencolor/fillcolor, width/pensize, shape/shapesize, speed, circle, begin/end fill, write, clear/reset, show/hide turtle and done/mainloop. |
| Screen calls needed by helpers | setup, title, delay, bgcolor, window_width/height, setworldcoordinates, tracer, update, clearscreen and turtles. Title cannot alter the parent page. |
| Output | Ordered `print` and useful syntax/runtime errors, rendered as text. Preserve student line numbers despite internal bootstrap modules. |

Create a fixture for every listed function, aliases actually used by helpers,
invalid/negative/fractional values and cross-run reset. The bundled helpers
currently call real Tk-specific internals through the server runner; that
runner must not be copied into the worker. Implement a compatible public
surface, then compare command semantics and visible examples against CPython.
Do not approximate curves/fills in ways that change lesson outcomes. Font
rasterization can vary by device; document tolerances for geometry and text.

Browser v1 deliberately routes `input()`, keyboard/mouse/timer callbacks,
arbitrary Tkinter/widgets, unsupported imports and native/OS operations to
the explicit full-Python option. They must produce an unsupported-feature
error, not a fake result or a blocking browser dialog. Test detection at the
actual call/import; text matching source is not a security or compatibility
mechanism. No broad AST rewriting, SharedArrayBuffer requirement or application
COOP/COEP change is included to simulate synchronous input.

Keep `.py` and project downloads usable with real Python/Tk. Export the current
native helper bundle and instructions, not a browser-only bridge that breaks
offline projects. In browser mode, assemble these downloads locally from the
pinned native helper assets; do not post student source to the project-packaging
endpoint. Leave the existing server-mode export endpoint compatible with old
clients. Version the helper API separately from each engine's helper
implementation hash. Keep the existing API version only if parity passes;
record intentional incompatibilities explicitly before implementation changes it.

Randomized programs retain their documented ranges and independent racer
behavior. Do not promise that the same random seed produces an identical
CPython/Brython sequence. Cross-engine geometry fixtures use recorded random
inputs; each engine also tests its own seeded reproducibility.

## 7. Isolation and bounded execution

Serve the trusted iframe and immutable runtime assets from a dedicated static
origin, proposed `https://turtle-runtime.coveedu.com`. It must never serve the
Studio app, BFF, API, authentication redirects or user uploads. Verify all Cove
authority cookies are host-only and are not readable/sent as parent-domain
cookies on that origin. Strip incoming credentials before static upstream
forwarding, do not set cookies there, and pass no secrets through messages.

The iframe uses `sandbox="allow-scripts allow-same-origin"` solely on this
dedicated cross-origin host, allowing fixed-URL workers to load. Never apply
that combination to a Studio-origin execution frame. Deny forms, popups,
top navigation, permissions and downloads. Parent-owned downloads remain in
the existing controls. Set no-referrer and exact frame-ancestor restrictions.

Use explicit response CSPs for the frame **and worker script**. The frame
permits only its pinned scripts/assets and fixed worker bootstrap. The worker
denies network connections, nested workers, arbitrary imports and remote code;
only the fixed, hashed runtime scripts can load. No service worker registration
or persistent runtime storage is allowed. Brython's required dynamic compilation
permission, if necessary, is limited to this runtime origin; never widen Studio's
script policy. Test the effective policies, not just a configuration string.

The parent validates origin, frame identity, protocol, schema, generation and
size, then uses a dedicated MessageChannel. Worker events are untrusted data.
Accept finite coordinates and allowlisted primitive/text/color commands only;
no HTML, SVG markup, URLs, JavaScript, CSS or DOM selectors supplied by programs.
The trusted iframe must not relay arbitrary worker messages to the parent.

Initial client limits:

- Source: existing 64 KiB; run wall time: 120 seconds, including input/finished
  display where applicable; stdout/stderr combined: existing 256 KiB.
- At most 50,000 logical drawing operations and 8 MiB of serialized pending
  drawing/text events per run. Bound both worker batching and renderer queues;
  terminate on overflow rather than accumulating an unbounded message backlog.
- At most 256 operations / 64 KiB per batch. Renderer work yields between
  batches to keep Stop responsive. Count curve expansion/render work within
  a bounded segment budget, not as unlimited work hidden in one operation.
- Output or drawing overflow ends the run with a clear limit error. Preserve
  the last completed frame and allow a clean new run.

Stop uses `Worker.terminate()` and discards pending animation; it must not
depend on the Python loop cooperating. An iframe failure removes the iframe
and closes its channels. Memory exhaustion and CPU limits in a visitor browser
are best-effort safeguards, not Docker-equivalent hard quotas. Malicious or
modified clients cannot be made authoritative by these limits. Browser output
must never award points, persist an official grade or attest sandbox security.

## 8. PIN, run admission and server integration

Keep the HttpOnly guest cookie, same-origin BFF boundary, academy/PIN-version
checks, two-hour grant duration, ownership and replacement/revocation behavior.
Browser mode must not wait for `TrialRuntime.ready()` or touch the server pool:
current access/bootstrap code calls the broker, so this dependency must be
split explicitly, not merely bypassed in React.

Bootstrap adds an allowlisted execution profile and manifest/protocol version.
New pilot grants pin a preferred browser profile and a server-authorized
full-Python fallback profile; legacy grants remain server-only. Each admitted
run pins its actual selected profile. An explicit fallback request is validated
against that grant's allowed profiles, never accepted as arbitrary client choice.
Preserve the legacy session response for server grants; introduce an explicit
browser-run representation without VNC token, display URL or container ID.
Never fake a remote `TurtleSession` to satisfy existing types. Existing server
sessions stay recoverable and retain their original engine during rollout.

For browser Run:

1. Validate the current grant/academy/PIN version on the server. The server
   selects an enabled browser profile; a client-supplied engine name is not authority.
2. Atomically reserve admission using a request UUID, profile, starter/helper
   versions and source fingerprint. Browser request bodies contain metadata,
   not source, stdin, output or drawing contents. Fingerprints are idempotency
   data, never metric labels or evidence of correct execution.
3. Return an opaque owned run ID, profile version and lease deadline. Only
   the parent keeps admission credentials; the iframe receives non-authority
   routing/deadline metadata. Execute source only after successful admission.
4. Renew from the parent every 15 seconds; the lease lasts at most 30 seconds
   without successful revalidation. A revocation, expiry or lost lease stops
   the controlled local runtime and preserves the student's draft.
5. Stop/end is idempotent. Reconcile an uncertain admission by its request UUID;
   never create a second admission or rerun automatically after a lost response.

Retain twelve accepted starts/minute, sixty/hour, one admitted active run per
grant across both engines and the existing 1,800-second admission budget.
Reserve 120 seconds atomically. For browser mode, charge elapsed admitted time
using server timestamps and bounded leases; stop/expiry settles once, never
trusting client-reported elapsed time. Expired/uncertain records are charged
conservatively. Name browser time as admitted practice time, not container CPU
time. Test all old server settlement/recovery paths unchanged and old Redis
records explicitly; missing engine fields mean legacy server mode.

The parent uses local messages for drawing/output rather than one-second
remote-session polling. Lease renewal remains necessary; local execution does
not remove server authority from the hosted workflow. A visitor can modify
their own browser or run public libraries offline, so PIN expiry is not a
claim that downloaded Python software can no longer execute independently.

Mode changes terminate and settle the old owned run before admitting the new
one. No shared public-browser execution semaphore is introduced. API request
limits remain; other visitors' local drawings do not consume the server broker.

## 9. Packaging and integration boundaries

- Add a focused browser runtime package, proposed `packages/turtle-browser-runtime`,
  containing pinned engine assets, worker/bootstrap, Python compatibility
  modules, validated protocol and renderer. Avoid adding execution logic to
  the authenticated course GUI runtime or growing `turtle-trial.tsx` further.
- Keep shared contract changes in `packages/shared/src/turtle-trial/`; add a
  browser-run service/store adapter alongside the existing API trial modules.
  Do not weaken or reuse course submission/replay contracts.
- Package runtime assets with the web release and expose only their immutable
  versioned paths on the static origin. Configure DNS/TLS/Caddy during a later
  approved rollout; this spec does not create domains or change live routing.
  No additional dynamic Python service is required for browser drawings.
- Pin exact tested Brython/package versions and content hashes in the prototype
  manifest and lockfile before implementation integration. Self-host the tested
  assets; do not depend on mutable third-party CDN URLs at runtime. Record
  licenses/attributions, compressed size, Python feature version and protocol.
- Cache only public immutable runtime assets. Grants, admission, source and
  output remain uncached. Do not use a service worker to retain an older engine.
- Keep the existing server public pool available for explicit full-Python runs,
  at its current limits and warm-disabled configuration. No extra broker slot
  is implied by two local prepared workers.

Read the relevant installed Next.js guides under
`packages/web/node_modules/next/dist/docs/` before changing client/worker asset
integration, response headers or build behavior. This document is not a claim
that familiar framework defaults apply to this installed version.

## 10. Performance targets and measurement

These are proposed release gates for supported simple drawing programs after
the runtime signals readiness, not promises for arbitrary programs or devices.

| Metric | Gate |
| --- | --- |
| Click feedback | p95 ≤100 ms. |
| Run to first expected stroke, runtime ready | p50 ≤250 ms; p95 ≤500 ms, including admission, previous-run retirement, worker dispatch, compile and actual visible drawing. |
| Stop to last possible update | p95 ≤100 ms for a busy loop or drawing/output flood on the reference device; no stale frame/output after acknowledgement. |
| Local spare-worker preparation | p95 ≤2 s with cached assets; rapid-rerun waiting reported separately. |
| Runtime readiness from playground/PIN page entry | p95 ≤3 s with cached assets, ≤5 s on a cold cache at 10 Mbps / 50 ms RTT. Measure editor interactivity separately; initialization must not block typing. |
| Runtime transfer budget | ≤2 MiB compressed for required initial engine/helper assets; publish actual totals. Exceeding the budget requires an explicit reviewed adjustment, not hiding lazy downloads in first Run. |
| Multi-visitor behavior | Twenty supported simultaneous browser runs require zero new Docker guests and no shared drawing queue; no >10% regression in reference API/navigation p95 under the same staging load. |

Use actual named reference devices: at least a mid-range classroom Windows
laptop and a lower-powered Chromebook, with recorded CPU, RAM, OS, viewport
and browser version. Include current supported Chrome/Edge and Safari functional
coverage. Unsupported browser features expose the full-Python option; do not
claim that one developer Mac represents classroom hardware.

Collect at least 100 ready-runtime runs per performance reference device,
separating first run, prepared repeats and reruns before refill. Use normal
PIN/admission endpoints and paced disposable grants to respect rate/budget
limits. Include a simple colored line with `speed(0)` to isolate startup, plus
separate default-animation square/spiral/race correctness tests. Do not turn
off teaching animation in the shipped defaults.

The measured end is the new run's expected non-background drawing pixels,
not a turtle cursor, retained old frame, READY message, renderer instruction or
successful POST. Independently verify visible frames; generation IDs must rule
out stale content. Keep initial-download, readiness waiting, admission,
compilation, first paint and animation completion as separate durations.

Run a production-equivalent staging twenty-visitor cohort with recorded client
hardware and realistic network conditions. Several contexts sharing one
computer do not prove twenty-device classroom performance. No production
maintenance or load-test permission is inferred from this specification.
Retain failures, cold misses, timeouts, memory pressure and browser crashes;
publish counts, raw timings, p50/p95 and exact assets/configuration.

## 11. Verification

Required functional and adversarial coverage:

- All three starters, spiral, every help-panel command, seeded random race
  fixtures, helper edge cases, normal Python errors and unsupported-feature flow.
- Geometry/heading/query state, fills, screen coordinate transforms, colors,
  pen defaults and output/animation order against the current CPython fixtures.
- Infinite loop, recursive failure, huge allocation, output/drawing floods,
  malformed/oversized messages, NaN/infinite coordinates and URL/HTML injection.
- Stop, immediate rerun, Clear, reset, switching starters, resize, background tab,
  tab close, browser back/forward and iframe/worker load/crash failures. Confirm
  used workers are terminated and no globals/random/pen state leak into reruns.
- Denied application-cookie/storage/parent-DOM access; denied network, nested
  workers, popup/navigation and unsupported imports. Check real CSP response
  headers in each target browser, including direct runtime-origin navigation.
- Invalid/rotated PIN, suspended academy, expired grant, replayed request UUID,
  conflicting source fingerprint, duplicate tabs, cross-grant run IDs, exhausted
  limits, lost responses, lease failure and Redis/API outage. Use real isolated
  Redis tests for reservation, recovery and exactly-once settlement.
- Browser-mode access/bootstrap/Run never calls broker readiness, session creation
  or VNC. Server mode still uses its current authorization and isolated rootless
  broker; authenticated course Turtle and grading regressions remain green.
- Native project export, English/Korean copy, current visual layout and mobile
  splits. Avoid screenshots of a redesigned test harness as product UI evidence.

All local fixtures use isolated ports/data/staging origins. Production student
source and existing coursework must not be copied into prototype artifacts.
Telemetry is limited to version/profile, fixed failure categories and bounded
durations/counts. Client reports are untrusted observations, never grade facts;
exclude source, PINs, output, tokens and identifiers from logs/metric labels.

## 12. Implementation stages and rollout

**Stage A — local feasibility.** Pin Brython and build the smallest isolated
worker/Canvas bridge proving first drawing, fresh worker preparation, Stop on
an infinite loop, current helper/race semantics and CSP isolation. Measure all
readiness costs. Keep production unchanged. If these fail, publish the failed
gate and compare alternatives in a design revision; do not evade the worker
requirement by moving execution to the page thread.

**Stage B — integration behind a disabled flag.** Add execution adapters,
explicit browser contracts, atomic admission/lease accounting, static packaging,
the full-Python option and required regressions. Existing grants/sessions remain
server mode; new browser grants are selected only when enabled. No database
migration is expected; version and test Redis record compatibility.

**Stage C — staging acceptance.** Run the full compatibility/isolation suite,
reference-device cohorts and realistic multi-visitor test. Publish a dated
verification report with source revision, asset hashes, browser versions,
fixtures, failed gates and rollback rehearsal. Security and compatibility gates
cannot be waived to obtain a faster benchmark.

**Stage D — reviewed release.** Use the normal v2 merge, exact-commit CI, new
release tag and human production approval workflow. Introduce server-controlled
`TURTLE_TRIAL_BROWSER_ENABLED=false` and a separate browser-admission kill
switch, both off by default. Enable first for operator test grants, then a
selected pilot academy, then broader new grants only after recorded evidence.
Record allowed/preferred profiles per grant and actual profile per run; refresh
cannot silently change an active program's engine. Keep older pinned assets
while their grants can remain live.

Rollback stops new browser admission and denies lease renewal for affected
browser profiles; controlled workers terminate within the 30-second lease bound.
Preserve drafts and offer explicit full Python after the old run is settled.
Before an API rollback to a release unaware of browser records, automated and
manual rollback hooks must drain/revoke browser admissions and settle/clear
their active bindings. Provide a bounded Redis cleanup path for this engine
version if the new API cannot start; never flush unrelated grants or the PIN
registry. Verify this ordering against the actual previous release so its
legacy recovery code cannot interpret a browser run as a remote session.
Restore the previous web/API/static manifest if needed. Never automatically
convert every active browser run into a server guest: the server still has one
public slot. Rollback does not touch course history, PIN registry, rootless
limits, grading or another service's containers.

## 13. Completion criteria

The feature is complete only when:

1. Supported public examples draw through the browser path with the unchanged
   playground UI and documented helper semantics.
2. Stop/reset, fresh-run isolation and server admission/revocation tests pass.
3. Browser runs allocate no remote guests and do not wait on the shared pool.
4. Reference-device first-stroke, preparation, cold-load and staging concurrency
   gates pass with raw evidence; unmet targets remain explicitly open.
5. Unsupported features keep an explicit working full-Python path, with its
   capacity limits retained and visible rather than hidden by automatic retries.
6. A reviewed release and rollback have been verified, with course execution,
   official grading and existing student history unchanged.

Writing this specification completes the requested design work. It does not
mean the 500 ms target has been achieved or that browser execution is deployed.

## 14. Technical references

- [Brython](https://brython.info/): browser Python implementation and engine candidate.
- [Brython workers](https://brython.info/static_doc/3.13/en/browser.worker.html):
  message-based worker execution without access to the page DOM. This is why
  the drawing bridge must be designed and tested explicitly.
- [Worker termination](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate):
  the non-cooperative Stop mechanism, distinct from asking Python to exit.
- [Web workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
  and [worker CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy#csp_in_workers):
  separate execution contexts and effective worker policy requirements.
- [Iframe sandboxing](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox):
  cross-origin isolation and why script/same-origin permissions must never be
  combined for an execution frame served from the application origin.
- Existing [public Turtle operations](../../operations/public-turtle-trial.md),
  [runtime helper bundle](../../../packages/shared/src/turtle-trial/bundle.ts)
  and [production deployment](../../operations/production-deployment.md).
