# Continuous monitoring workspace verification

This implements the [continuous workspace design](../superpowers/specs/2026-11-03-monitoring-continuous-editing-design.md)
following the screenshot correction and clarification about removing the edit
switch. It follows the [workspace parity fix](2026-11-03-monitoring-workspace-parity-verification.md).

## Behavior

The coding workspace no longer adds a Preview strip or a separate Return row
when the student opens another material. Return to live sits in the existing
header actions. Statement, editor, output and feedback retain their positions.
Run remains available and executes the displayed snapshot in the monitor's own
runtime. Feedback can be drafted while reading another problem and retains its
scope; sending still requires the authorized live watch.

The edit On/Off control is removed from both the live monitor and the course's
tutoring panel. Both ask for editing when opening
its live watch, and the server returns the authorized mode. The editor still
waits for that watch's document synchronization, and reconnect/reload reauthorize
it. Recovery retains the confirmed editing grant after replaying pending edits.
Existing class, student, material, lease, revocation and document-write checks
remain in force. Clients cannot nominate another material through watch.start;
inactive saved previews retain their existing read-only authority.

Non-coding mouse/caret markers now follow coding's held-marker behavior.
Five-second inactivity, crossing a gap/iframe boundary and switching windows no
longer remove the student's last representable position. Explicit cleanup,
source/material replacement, disconnect and revocation clear or suppress it.
Delayed, out-of-order and wrong-scope frames are still rejected. Turtle sends
sub-character pixel displacement in line-height units, projects through the
matching file/content and current Monaco geometry, and uses the same named
pointer renderer as coding. PDF and other content retain their shared anchors.

## Checks

| Check | Result |
| --- | --- |
| Chromium role journeys: Manager, Team Lead, assigned Teacher | 3 passed |
| WebKit role journeys: Manager, Team Lead, assigned Teacher | 3 passed across runs |
| Existing in-course tutoring and Chromium/WebKit learning UI regressions | 4 passed |
| Frontend monitoring suites | 24 files, 215 passed |
| API monitoring gateway suite | 60 passed |
| Shared event/observation/monitoring contracts | 109 passed |
| Web and E2E TypeScript | Passed |
| API TypeScript, including tests; shared/API builds | Passed |
| Affected frontend ESLint and whitespace checks | Passed |

```sh
pnpm e2e:monitoring:materials --output test-results/monitoring-continuous-editing
pnpm e2e:monitoring:materials --grep tutor --project webkit --output test-results/monitoring-continuous-editing-tutor-webkit
pnpm e2e:monitoring:materials --config e2e/dlab.playwright.config.ts --grep 'learning UI identifies materials|covers academy classes without teaching assignments' --output test-results/monitoring-continuous-editing-regression-final
pnpm --filter @cove/web exec vitest run src/lib/monitoring src/components/monitoring
pnpm --filter @cove/api exec vitest run src/monitoring/monitoring.gateway.spec.ts
pnpm --filter @cove/shared exec vitest run src/monitoring/events.spec.ts src/monitoring/observation.spec.ts src/monitoring/monitoring.spec.ts
NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter @cove/web typecheck
pnpm typecheck:e2e
pnpm --filter @cove/api typecheck
```

Browser assertions exercise live editing without clicking a switch, automatic
editing after Back/reload and actual student convergence. They check that the
statement's vertical position changes by less than one pixel after the student
opens PDF, the monitor can run the selected code, and a feedback draft survives
return. Pointer-tip positions are checked within two pixels against the PDF page
geometry and Turtle Monaco model/pixel displacement. Both remain visible after
6.2 seconds of inactivity and bringing the monitor window forward. Existing
quiz/answer, independent video, actual red Turtle raster/output, cross-instance
Redis delivery, narrow layout and revocation checks remain in the full journey.

## Evidence and scope

Artifacts are under `test-results/monitoring-continuous-editing/`, separated by
role/browser. `coding-workspace-while-student-reads-pdf.png` and
`live-turtle-monitor.png` were visually inspected. Local external PDF/video storage
is doubled by fixtures; authenticated read endpoints, two API instances, sockets,
PostgreSQL, Redis and the enrolled-course Docker Python/Tk runtime execute for
real. This does not qualify the separate public browser Turtle trial.

The initial full run passed five cases. The final WebKit Teacher case encountered
a test selector matching both the Monaco string and the successful terminal
output. The assertion now targets the terminal; that case passed on its focused
rerun. Its complete passing artifacts are under
`test-results/monitoring-continuous-editing-tutor-webkit/`. The initial failure
trace remains in the main run directory.

The first existing-regression run caught the second edit switch in the course's
tutoring panel. That panel now requests automatic editing too and registers its
live editor for the same student pointer renderer. The unused toggle component
was removed. All four regression cases then passed; their artifacts are under
`test-results/monitoring-continuous-editing-regression-final/`.

No dependency or database migration was added. Work remains on the feature
branch; no merge or deployment was performed.

The subsequent bidirectional mouse relay, removal of caret widgets and
saved-buffer return fix are recorded in the
[bidirectional pointer verification](2026-11-03-bidirectional-material-pointers-verification.md).
