# Coding watch availability recovery verification

Date: 2026-11-04 (Asia/Seoul).
Design: [approved recovery spec](../superpowers/specs/2026-11-03-coding-watch-availability-recovery-design.md).

## Resulting behavior

A watch-start rejected while the student is between materials or still on PDF
gets four attempts with the existing 1/2/4-second backoff. Only watch-start opts
into retrying `MONITORING_STUDENT_UNAVAILABLE`; other commands keep their existing
policy. Availability retries report resynchronization rather than a service outage.

If the student arrives after that budget, an observation hint for the monitor's
selected coding problem permits one additional cycle for that class, student,
material and source. Repeated heartbeats cannot start unlimited cycles or replace
a healthy watch. Losing availability rearms recovery for a later return. The
recovery effect excludes revocation, protocol refresh, disconnected transport,
student switching and blocked/pending edit recovery. All requests still use the
existing server authorization and exact document synchronization.

When the selected problem is the student's current coding material, the header
uses coding-session readiness even while showing a saved preview. It waits for
the selected draft to synchronize before displaying Live. Exhausted recovery
offers the existing retry-connection action. Independent material browsing keeps
its existing observation status.

## Checks

| Check | Result |
| --- | --- |
| Monitoring unit/component suites | 27 files, 231 passed |
| New unavailable-watch browser regression | 6 passed, 4.5 minutes |
| Existing all-material browser journeys | 6 passed, 8.1 minutes |
| Web TypeScript and E2E TypeScript | Passed |
| Affected frontend lint | Passed |

The new browser regression runs each of Manager, Team Lead and assigned Teacher
in Chromium and WebKit. It selects coding while the student remains on PDF and
waits for four real server refusals before moving the student. Neither person
clicks Follow or refreshes after the student arrives. It verifies the teacher
indicator, automatic edit permission, edits and mouse pointers in both directions,
three-second teacher-pointer expiry, absence of remote caret labels, unchanged
student socket count and no additional main-document requests. It repeats the
sequence after restoring the cached coding page. Six journeys therefore cover
twelve recovered visits. Presence and acknowledgements are not mocked.
Together with the existing all-material journeys, all twelve browser tests passed
without retries. The existing journeys retain the actual Turtle drawing, quiz and
answer mirroring, PDF/video navigation, pointer geometry/expiry, independent staff
browsing, reload, narrow-layout and permission-revocation checks.

The unit tests exercise the actual live-workspace hook: late arrival, an already
available target, bounded exhaustion, source changes, stable heartbeats,
independent reading, switching/disconnection, terminal refusals, cancellation,
late synchronization acknowledgements and retained unacknowledged edits. Separate
tests cover the header readiness decision and the default/opt-in retry policies.

Student and monitor browser sessions use separate API instances with real
PostgreSQL and Redis. External PDF/video objects are fixtures; existing Turtle
checks use the Docker Python/Tk runtime. The API and shared package were unchanged,
so the isolated runner reused their compiled output to avoid restarting the
user's local Nest watcher. The local API health endpoint remained healthy.

## Reproduction and artifacts

```sh
pnpm --filter @cove/web exec vitest run src/lib/monitoring src/components/monitoring
NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter @cove/web typecheck
pnpm typecheck:e2e
pnpm e2e:monitoring:materials --grep 'recovers an unavailable coding watch'
pnpm e2e:monitoring:materials --grep 'monitors live quiz'
```

For these runs, an ignored copy of the runner at
`test-results/coding-watch-recovery/run-existing-api.sh` omitted only the shared/API
build steps, using already-built unchanged artifacts. Recovery screenshots and
results are under `test-results/coding-watch-recovery/browser-results/`; broad
regression evidence is under `test-results/coding-watch-recovery/all-material-regression/`.
Visual inspection of the WebKit second-recovery screenshot confirmed the complete
coding workspace, matching student code, Live sidebar marker and one named mouse
pointer.

This qualification uses Chromium and Playwright WebKit. It does not claim a new
native Safari application run. Authentication token expiry and the existing
30-minute inactivity logout are outside this material-transition fix. No API,
database migration, dependency, merge or deployment change is included.

The isolated browser services and owned GUI/database/Redis test containers were
cleaned up after the runs. The user's local API remained available throughout.
