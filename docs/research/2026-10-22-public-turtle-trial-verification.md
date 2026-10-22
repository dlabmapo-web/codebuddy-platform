# Public turtle trial implementation and local verification

Date: 2026-10-22 (Asia/Seoul)
Branch: `feat/public-turtle-trial`
Design: [public turtle trial](../superpowers/specs/2026-10-22-public-turtle-trial-design.md)
Operations: [configuration and rollout](../operations/public-turtle-trial.md)

## Implemented behavior

- `/turtle` is separate from Studio auth layouts and requires no account.
  A server-verified, shared six-digit PIN issues a two-hour HttpOnly guest grant.
  PIN configuration and rotation stay on the API; browser bundles contain no PIN.
- A public workspace reuses the existing Monaco editor and noVNC viewer, with
  side-by-side code/drawing, output/input, resizable panes, mobile tabs, font
  sizes, fullscreen, Stop, per-starter tab-local drafts, help, and downloads.
- Cove-owned `custom`/`shape` modules implement the PPT's helper names, polygons,
  shared speed/color, four racers, signed movement/turns, real x coordinates,
  finish-line behavior, and the optional welcome drawing. A guest runner holds
  finite drawings without requiring the student to write an event loop.
- Guest operations use a standalone Nest module, strict input schemas, shared
  Redis limits/ownership/reservations, origin-checked same-origin handlers, and
  a separate broker configuration. Guest access never grants course authority.
- The broker supports bounded guest output, source-complete display state,
  idempotent owner/request recovery, authorization expiry, and pool-aware cleanup.
  Production flags remain off by default. The dedicated guest host is configured
  through a separate Compose file; it is not added to the course Docker daemon.

## Cove controls, localization and drawing defaults

Settings now use Cove's shared Popover and ChoiceSelector instead of native
HTML details/select elements. Clicking outside or pressing Escape dismisses the
popover; actions close it before executing. The nested example/font selectors
use the same styled radio menus as the rest of Cove. Both support fullscreen
portals. The existing Cove language control was extracted without account
controls, re-exported at its old path, and reused on the gate and workspace.
Selecting 한국어 or English uses the normal locale cookie/reload behavior.

All turtle-page labels, help, error hints and metadata now use the typed,
feature-scoped `turtle-trial.json` locale resources. Locale parity and root
payload budgets pass. Language switches retain the existing draft and guest
grant; no account is required and user-written code/output is preserved.

The cursor defaults to double size. The guest runner adapts standard
Turtle/RawTurtle construction and reset to a 5-pixel pen and double-size cursor,
covering code that never imports the lesson helpers and any pen color. Class
identity and explicit pen/cursor overrides are preserved. The adaptation stays
inside the isolated guest process. Helpers/racers/demo exports also select the
larger cursor.

Validation: ten Chromium/WebKit scenarios including nested menu selections,
outside/Escape dismissal, action dismissal, Korean/English switching with draft
retention, localized help, and a purple standard turtle asserting the new
width/size defaults. Sixteen focused web/control tests and 115 locale checks pass, alongside
shared build, web/E2E type checks and targeted lint. The real Docker helper test
now executes the guest runner and checks standard Turtle, RawTurtle, module-level
commands, reset, explicit overrides and class identity, plus existing lesson
geometry/race tests.

- [English workspace and larger standard turtle](assets/2026-10-22-public-turtle-trial/standard-turtle-english.png)
- [Cove settings controls](assets/2026-10-22-public-turtle-trial/cove-settings.png)

## Animation and disconnect follow-up

The classroom helpers now initialize their default turtle once with a 5-pixel
pen and speed 1, preserving later explicit speed/pen choices. The guest screen
uses a 30 ms animation delay; speed 0 remains available without interpolated
movement. New starter buffers use speed 1; existing student code is preserved.
Race turtles use the same pen width and slow movement after instant track setup.

The reported noVNC console error came from calling disconnect during React
cleanup after the server had already disconnected the RFB instance. The shared
viewer now clears only the matching reference on the disconnect event and
clears a live reference before initiating cleanup, avoiding a second disconnect.

Validation for this follow-up: three viewer lifecycle regressions (peer close,
session replacement, reconnect), seven existing access/boundary tests, shared
build, web/E2E TypeScript checks, and the real CPython/Tk helper assertions for
pen width, default speed, explicit speed preservation, speed 0 and race turtles.
Eight Chromium/WebKit browser scenarios cover the existing behavior plus the
user's blue star, a runtime assertion of pen width, visible drawing time, and a
real server-side disconnect followed by viewer cleanup without the reported
console error. Targeted lint has no errors and retains the existing shared
viewer image warning.

[Blue star with the thicker pen](assets/2026-10-22-public-turtle-trial/bold-star.png)

## Simplified workspace follow-up

After the user's visual review, the workspace follows the reference's compact
Run/Light/Clear toolbar and plain split editor/canvas/output layout. Stop is
available during an active run; examples, font size, reset, help, downloads,
fullscreen and Exit move into More options. The guest viewer hides desktop
keyboard controls, connection labels, pane headings and live badges, and uses a
white background. The fixed guest runner removes the Tk canvas bevel. New tabs
start with a small square at animated speed 3; existing drafts are preserved.

Run stops the previous owned session before starting a fresh one. Polling pauses
while this happens, and a generation guard rejects responses from an older run.
This fixes an intermittent WebKit failure where a late STOPPED response replaced
the new run and hid Stop. A captured frame survives Stop or expiry; expired
viewers do not attempt to reconnect. Opening without a guest grant now uses a
204 bootstrap response to show the PIN gate without expected 401 console noise.
Execution endpoints still require a valid grant.

Follow-up validation: seven focused web/boundary tests, shared build, web/E2E
TypeScript checks, and six Chromium/WebKit browser scenarios. Browser coverage
includes actual animated frames and green turtle pixels with standard Python,
lesson square/race helpers, direct rerun into an infinite loop, Stop/frame
retention, Clear preserving code, theme changes, downloads, PIN access and mobile.
The real Docker helper geometry/race checks also pass. Targeted lint reports no
errors; the pre-existing no-img-element warning remains in the shared viewer.

Updated captures:

- [Simplified desktop workspace](assets/2026-10-22-public-turtle-trial/workspace-simple.png)
- [Animated standard turtle example](assets/2026-10-22-public-turtle-trial/animated-turtle.png)
- [Simplified mobile controls](assets/2026-10-22-public-turtle-trial/mobile-simple.png)

The original checks below describe the initial implementation, before the visual
simplification.

## Local checks

The dedicated fixture uses Redis port 6397 (browser DB 0, unit-test DB 1),
guest API port 4037, GUI port 4017, and web port 3067 with `.next-turtle`.
It loads the current API source, uses disposable secrets, and never connects
to the application database or a real identity provider.

- Shared build/type check, API TypeScript check, web TypeScript check, E2E
  TypeScript check, and a web production build with the trial enabled pass.
  The production build includes dynamic `/turtle` and `/turtle/api/[...path]`.
- API tests exercise actual Redis across service instances: leading-zero PINs,
  cold-connection concurrency, ownership, concurrent Run, lost create responses,
  start limits, cumulative budget, refunds, NAT classroom admission, grant
  expiry/rotation/Exit, and rejection of client-selected runtime fields.
  Additional transport tests cover the guest-only pool and narrow public DTO.
  All 19 API/configuration tests pass.
- Web unit/route tests pass for origin checks, forwarding allowlists, streamed
  body bounds, draft recovery, and user-code error locations (11 tests).
- Real CPython 3.12.3/Tk 8.6 helper checks pass in the built Docker image:
  import isolation, square/triangle/pentagon/hexagon/dodecagon closure, fractional
  turns, shared pen color/speed, invalid arguments, race reset and independent
  racers, negative movement, equal world-coordinate scale, finish crossing,
  victory turns, and repeatable optional demo.
- Chromium and WebKit exercise PIN errors/success, visible red-square pixels,
  output, Stop/frame retention, project ZIP, refresh recovery, 390px controls,
  Exit, real race helpers, and an infinite loop that remains stoppable. The
  scenarios assert there are no requests to an identity provider. All four
  scenarios pass in the final combined run.
- Existing broker/runtime regressions pass with real Docker: drawing, input,
  private assets, errors, timeout/output limits, queued cancellation, seccomp,
  network/filesystem isolation, passive display, and memory/process ceilings.
  Eleven tests pass. One historical-runtime test is skipped because a separate
  retained runtime version was not supplied; this does not verify image-upgrade
  replay for this task.
- Nine release-manifest regression tests pass. Main deployment validation and
  dedicated guest Compose validation pass, including Caddy adaptation and the
  existing application memory ceiling.

WebKit revealed an early-input hydration race; PIN entry is now disabled until
the nonce/bootstrap is ready. Simultaneous initial requests now share one Redis
connection. Browser fixtures wait for real Monaco model changes and tab-local
persistence before pressing Run, rather than racing synthetic IME events.

## Visual review

Development captures (the Next development badge is absent in production):

- [Desktop editor and real drawing](assets/2026-10-22-public-turtle-trial/workspace.png)
- [PIN screen, wrong-code feedback](assets/2026-10-22-public-turtle-trial/access.png)
- [390px code tab](assets/2026-10-22-public-turtle-trial/mobile.png)

## Deployment boundary

No production configuration, PIN, release, or student data was changed.
No production host was provisioned and no 20-student capacity rehearsal was
performed. A classroom launch still requires a separate execution daemon/host,
private connectivity, operator-generated PIN/secrets, active PIN-version setup,
and a rehearsal at the expected class size. Local checks establish behavior and
isolation, not production throughput.
