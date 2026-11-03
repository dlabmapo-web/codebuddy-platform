# All-material live monitoring: local verification

Date: 2026-11-03. Branch: `fix/all-material-live-monitoring-spec`.
Design: [approved specification](../superpowers/specs/2026-11-03-all-material-live-monitoring-design.md).

## Implementation

The monitor now keeps a student observation subscription while its selected
material changes. PDF, video, quiz, written/short answer and Turtle viewers stay
in the monitoring tab. Student location, sidebar LIVE markers and the anonymous
monitoring indicator work independently of the material staff are reading.

Quiz selections and response text are read-only live projections, including empty
answers. Turtle publishes bounded source, execution state, terminal output and
actual raster frames from the student's GUI viewer. Video publishes playback
state and position; explicit Return to live aligns the staff player once, and
staff playback remains independent.

Explicit PDF alignment also carries a revision, so Return to live restores the
student's page after staff browse elsewhere even when the student's page number
has not changed. A focused reader regression covers this case.

The existing coding attachment keeps its own transport and recovery gate.
Leaving it uses the existing pending-update recovery gate before changing viewers. Two regressions found
during browser testing were fixed: selecting a saved preview while the initial
code watch acknowledged, and different initial Yjs histories when two API
instances loaded the same plain draft before its first flush. A focused test
reproduced the latter before the fix. Back/reload restore a live coding view;
temporary observation lease loss requests a freshly authorized watch, and
disconnect cleanup tolerates Redis outages.

The browser run also exposed an unhandled cancellation in Monaco 0.55.1's delayed
word highlighting during editor disposal. The asset build now routes those three
promises through Monaco's existing cancellation-aware error handler. Exact
distribution guards require review on upgrade; asset revision `r1` prevents
clients from reusing the old bundle. Other errors retain their normal handling.

Observation has material-neutral read authorization, versioned bounded payloads,
Redis snapshots with a 90-second TTL, source/revision fencing, audit visits,
lease renewal and revocation. It grants no editor, grading or runtime authority.
Programming write authorization remains on its original narrower predicate.
No database migration is required.

## Test environment and reproduction

Run from the repository root:

```sh
pnpm e2e:monitoring:materials
```

The existing learning UI regressions use the base single-API configuration:

```sh
pnpm e2e:monitoring:materials --config e2e/dlab.playwright.config.ts --grep 'learning UI identifies materials' --output test-results/all-material-legacy-regression
```

Prerequisites: installed workspace dependencies and Playwright Chromium/WebKit,
Docker, `ffmpeg`, `curl`, `lsof`, and the local GUI runtime image
`cove-turtle-trial:dev`. Ports 3309, 4319, 4320, 4339 and 4029 must be available.

The runner creates disposable PostgreSQL 17 and Redis 7 containers, applies all
67 existing migrations, generates real MP4/HLS media, and starts the GUI runtime,
two real Nest API processes and Next.js. It removes its own database/media
fixtures and runtime on exit. Student sockets use API A; staff sockets use API B.
Only external OS/Supabase/storage services are test doubles. Authentication,
authorization, database operations, Socket.IO/Redis delivery, PDF rendering,
media playback and Python/Tk execution are real local paths.

The browser journey covers direct quiz entry from Open live, unsaved and cleared
responses, reload/offline recovery, student sidebar transitions, same-tab PDF
navigation and Back, LIVE rows and
collapsed folders, PDF position, real video play/seek/pause, explicit alignment,
independent staff playback, real Turtle output and red drawing pixels, return
to bidirectional code editing, leaving code for PDF, a 390px viewport, and role
revocation across the two API processes. It also checks that student access and
an unassigned Teacher's other-class access to observed work are denied, and that
private grading keys are absent from quiz metadata.

The test accepts the existing confirmation when deliberately leaving an
unsubmitted fixture answer. It retries at most three Run actions only for an
explicit local Docker `GUI launch failed` response. WebKit's browser-generated
fetch-cancellation diagnostics during controlled navigation/offline checks are
saved separately; JavaScript errors and resource errors outside those windows
still fail the test. Actual drawing pixels, output, media and synchronization
assertions remain required.

## Results

All six role/browser journeys have passed across the matrix run and a focused
WebKit Teacher rerun. Both existing learning UI regressions also passed.

| Monitoring role | Chromium | WebKit |
| --- | --- | --- |
| Manager (`lab_head`) | Passed, 1.9 min | Passed, 4.0 min |
| Team Lead (`instructor`) | Passed, 1.9 min | Passed, 4.5 min |
| Assigned Teacher (`tutor`) | Passed, 2.7 min | Passed on focused rerun, 2.6 min |

The initial matrix finished with five passes and the WebKit Teacher reaching its
six-minute overall timeout after two explicit Docker launch failures. Two focused
attempts then exceeded cold roster/material waits while the host had about 10 GB
of swap in use. The harness now closes the unused setup-account browser after
assignment and gives WebKit more time for startup/navigation. The final focused
Teacher run passed without a GUI launch retry; its cold runtime started in 3.35 s.
The feature, drawing, synchronization and permission assertions remain required.

The existing Chromium (1.5 min) and WebKit (2.0 min) learning UI regressions
passed together: consistent student/monitor statements, feedback draft retention
after same-tab PDF navigation and Back, ordinary staff practice/edit dialogs,
PDF rendering, student quiz leave confirmation and material navigation. Their
screenshots are under `test-results/all-material-legacy-regression/`.

| Check | Result |
| --- | --- |
| Monitoring role/browser journeys | 6 passed across runs; WebKit Teacher passed on focused rerun |
| Existing learning UI browser regressions | 2 passed |
| API monitoring tests, including real Redis registry/revocation tests | 298 passed; 16 unrelated database integration tests skipped |
| Frontend monitoring, PDF canvas, GUI viewer and video tests | 231 passed |
| New shared observation contract tests | 4 passed |
| Shared and API builds | Passed |
| API, web and E2E TypeScript checks | Passed |
| Affected frontend lint and runner shell syntax | Passed |

Unit suites intentionally exercise persistence failures; their expected error logs
do not indicate failed assertions. Existing warnings in the manual/video viewers
are separate from the clean lint checks on the new monitoring components.

Screenshots and failure traces are written under
`test-results/all-material-monitoring/`; each role/browser produces actual Turtle
and narrow PDF screenshots. The successful focused Teacher artifacts are under
`test-results/all-material-teacher-webkit-qualification/`. Earlier unsuccessful
attempts remain under `all-material-teacher-webkit-rerun/` and
`all-material-teacher-webkit-final/` for diagnosis.

## Runtime coverage

The enrolled-course Turtle backend exercised here is the Docker Python/Tk GUI
runtime, image digest
`sha256:46b3a49c43b386a746d32a4fe4df05cf430bb58de645e0a5c59afbe31a5cb604`.
The repository's browser Turtle runtime belongs to the public trial, which is
outside enrolled-student monitoring. This report does not claim browser-trial
monitoring or qualification of another course runtime backend.

The browser suite does not replace exhaustive load/failure-injection testing.
Pending-write recovery, stale generations, independent watch leases and permission
denials also have focused unit/Redis coverage. No production deployment or merge
was performed.
