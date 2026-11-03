# Monitoring workspace parity verification

This follow-up implements the user's four screenshot corrections to the
[all-material monitoring feature](2026-11-03-all-material-live-monitoring-verification.md).
The [design](../superpowers/specs/2026-11-03-monitoring-workspace-parity-design.md)
uses the existing coding monitor as the visual reference.

## Result

All material views reuse the existing monitoring header, student selector, help
queue and course outline. Selecting coding retains the full statement, Monaco
editor, output and feedback dock when the student visits another material.
Attachment-dependent controls become unavailable while the student is elsewhere;
an acknowledged editing mode can resume when that attachment survives the return.

Turtle now follows the student workspace: file tabs, read-only Monaco, resizable
code/drawing layout, actual drawing, execution state and terminal output. Written
answers reuse the student answer component, including question, hint, character
count and adjacent instructions. Up to five last-observed material snapshots stay
in scoped component memory and are explicitly labeled; revocation clears them.

Students publish bounded, ephemeral mouse/focus awareness through their existing
socket. The server derives identity, verifies the selected source and material,
fences sequences and rate-limits forwarding to authorized observers. Manual
answers, instructions, PDF pages, video, drawing and terminal use shared surface
geometry. Turtle adds file-aware Monaco caret/selection and mouse projection,
guarded by a matching content fingerprint. Other selected materials show where the
student is working without placing an arrow over unrelated content. Inactive
markers expire, and disconnect/blur/revocation clear them. Awareness performs no
answer writes or runtime control.

## Reproduction

The isolated runner starts disposable PostgreSQL/Redis, the Docker Python/Tk GUI
runtime, local web/API servers, and a second API instance for the student socket.
Student and staff connect through different API instances. It cleans up its own
resources and does not use the developer's localhost:3000 session.

```sh
pnpm e2e:monitoring:materials --grep tutor --output test-results/monitoring-workspace-parity-qualified
pnpm e2e:monitoring:materials --grep 'lab_head|instructor' --output test-results/monitoring-workspace-parity-other-roles
pnpm e2e:monitoring:materials --config e2e/dlab.playwright.config.ts --grep 'learning UI identifies materials' --output test-results/monitoring-workspace-parity-legacy
```

The full journey checks live/cleared answers and quiz choices, pointer/focus on
answers/PDF/video, Turtle caret/mouse and real red drawing pixels/output, retained
Turtle output after leaving, bidirectional coding, the complete coding layout
while the student reads PDF, editing after return, same-tab navigation, Back,
reload, independent video playback, narrow layout and access revocation. It also
checks that student/unassigned staff cannot use observation read endpoints and
that quiz payloads omit private answer keys.

## Local checks

| Check | Result |
| --- | --- |
| Assigned Teacher, Chromium and WebKit full journeys | 2 passed |
| Manager and Team Lead, Chromium and WebKit full journeys | 4 passed |
| Existing learning UI regressions, Chromium and WebKit | 2 passed |
| Affected frontend suites | 27 files, 243 passed |
| API observation gateway, monitoring service and access suites | 3 files, 87 passed |
| Shared observation and monitoring contracts | 2 files, 76 passed |
| Shared/API builds | Passed through browser runner |
| API TypeScript, including test files | Passed |
| Web TypeScript | Passed |
| E2E TypeScript | Passed |
| Affected frontend lint and whitespace check | Passed |

Frontend command:

```sh
pnpm --filter @cove/web exec vitest run src/lib/monitoring src/components/monitoring src/components/pdf/pdf-canvas.spec.tsx src/components/manual/assessment-ui.spec.tsx src/components/manual/gui-viewer.spec.tsx src/components/video/video-read-recovery.spec.ts
pnpm --filter @cove/api exec vitest run src/monitoring/material-observation.gateway.spec.ts src/monitoring/monitoring.service.spec.ts src/monitoring/monitoring-access.service.spec.ts
pnpm --filter @cove/shared exec vitest run src/monitoring/observation.spec.ts src/monitoring/monitoring.spec.ts
pnpm typecheck:e2e
pnpm --filter @cove/api typecheck
NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter @cove/web typecheck
```

## Artifacts and scope

Each browser journey writes `shared-short-answer-monitor.png`,
`live-turtle-monitor.png`, `coding-workspace-while-student-reads-pdf.png` and
`mobile-pdf-monitor.png` to its role/browser subdirectory. Teacher artifacts are
under `test-results/monitoring-workspace-parity-qualified/`. Desktop answer/Turtle,
the coding workspace while the student reads PDF, and narrow PDF screenshots were
visually inspected.
Manager and Team Lead artifacts are under
`test-results/monitoring-workspace-parity-other-roles/`. All six role/browser
qualification journeys passed on their final runs without retries.
The existing learning UI regression screenshots are under
`test-results/monitoring-workspace-parity-legacy/`; both browser cases passed.

Exploratory runs found and repaired asynchronous surface placement and anchors
attached to the surface element itself. Their unit regressions are included.
Other initial failures were test interactions with PDF text overlays, disabled
feedback placeholders and the valid retained editing mode. Earlier failure
artifacts remain under other `monitoring-workspace-parity-*` directories; they are
not the successful qualification runs.

Runtime coverage is the enrolled-course Docker Python/Tk GUI backend, as in the
original report. This does not qualify the separate public browser trial runtime.
No dependencies or database migrations were added. No merge or deployment was
performed.

After the final browser run, the runner's observation/GUI containers were gone
and ports 3309, 4319, 4320, 4339 and 4029 had no listeners. The developer's existing
application session and unrelated containers were left running.
