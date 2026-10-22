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
