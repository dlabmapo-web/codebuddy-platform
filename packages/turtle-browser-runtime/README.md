# Isolated public Turtle runtime

A disabled browser-engine pilot for the public `/turtle` playground. Python
executes in a fresh dedicated Brython worker; a separate-origin iframe validates
bounded drawing data and renders Canvas. The application page owns admission,
drafts and downloads and does not evaluate Python. Course execution and grading
use their existing server runtimes.

## Build and verify

- `pnpm --filter @cove/turtle-browser-runtime build`: immutable production artifact
  for parent `https://cs.coveedu.com`; Docker explicitly supplies its site origin.
- `pnpm --filter @cove/turtle-browser-runtime test`: model, protocol, rendering,
  fresh-worker, cancellation and resource-budget tests. Python 3 is required.
- `COVE_TURTLE_BROWSER_LOCAL=1 TURTLE_BROWSER_PARENT_ORIGIN=http://localhost:3128 pnpm --filter @cove/turtle-browser-runtime build`
  then `node packages/turtle-browser-runtime/scripts/local-server.mjs`: loopback
  harness, no application env/PIN/API. Buttons run square/race/input/loop fixtures
  and two 100-run startup cohorts. They exclude API admission.
- For the real Next workspace fixture, build for `http://localhost:3028` and start
  the asset server with `COVE_TURTLE_BROWSER_PRODUCT_FIXTURE=1`. The separate API
  fixture is documented in the operations guide; all its credentials/data are
  synthetic and it rejects any broker call.

The manifest contains every file hash, full content digest, engine version,
protocol and compressed sizes. The parent-origin module participates in the
hash; local and production builds have different IDs. Never publish a local
artifact. Brython is pinned to npm 3.15.0; upstream's matching BSD license is
included. The shipped engine's internal implementation tuple reports `dev` even
though the npm release/version-info identifies 3.15.0; compatibility is measured,
not inferred from the version label.

## Contract and limits

The actual native `custom.py` and `shape.py` sources are extracted from the
shared bundle at build time. The local `turtle.py` supplies their synchronous
geometry/queries. Standard supported calls and unsupported full-Python cases
are defined in the design. Helpers retain speed 1, delay 25, pen width 5 and
shape size 2; benchmark fixtures alone select speed 0.

Common named colors, hex and normalized RGB are supported. Other Tk colors,
custom desktop windows/shapes/fonts, moving text, arbitrary imports, input and
callbacks raise an explicit unsupported-feature error. Fonts/cursor rasterization
can differ from Tk; positions, curves, fills, queries and helper arguments have
behavioral fixtures. Exact `tracer(n > 1)` Tk update cadence still needs the
staging comparison; the shipped helper uses only 0/1. This is a finite Turtle
profile, not complete CPython/Tk.

Per run: 64 KiB source, 120 s, 256 KiB output, 50,000 logical operations/segments,
8 MiB serialized events, batches of at most 256 operations/64 KiB, at most 256
turtles, and 1,024 characters per Canvas text operation. Compound fill vertices
consume segment budget. A separate 800,000-unit raster-work ceiling bounds
animation/replay amplification; replay yields in 6 ms slices. Coordinates,
world spans, font sizes and pen/shape dimensions are bounded. Browser memory
and wall timers are best effort, not Docker-equivalent hard quotas.

One active single-use worker plus at most one unused prepared spare is owned by
each frame. Preparation loads trusted modules only. Stop terminates the active
worker, cancels animation and invalidates its generation; a used interpreter
is never recycled. Runtime/worker crashes cannot turn into automatic remote
execution. The parent removes a failed/unresponsive frame and closes channels.
Worker output is untrusted; it is never a grading result.

See [operations](../../docs/operations/2026-10-28-public-turtle-browser-runtime.md)
and the [approved design](../../docs/superpowers/specs/2026-10-28-public-turtle-browser-runtime-design.md).
