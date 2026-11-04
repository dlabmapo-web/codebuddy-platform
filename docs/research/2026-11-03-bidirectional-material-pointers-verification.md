# Bidirectional material pointer verification

This follows the [mouse-only design](../superpowers/specs/2026-11-03-bidirectional-material-pointers-design.md)
and the [continuous workspace fix](2026-11-03-monitoring-continuous-editing-verification.md).

## Changes

Student and monitor mouse pointers now travel in both directions for PDF, video,
quizzes, written/short answers and Turtle. Teacher-to-student frames require a
current authorized observation lease and matching academy/class/student/material
and active source. The server derives peer identity/generation and rate-limits
the channel. Separate teacher markers expire independently after three seconds.
Student markers keep the existing held lifetime on the monitor. Navigation,
disconnect and permission loss clear or suppress markers. No answer or runtime
authority is granted by the pointer relay.

Turtle editors on both sides register the same snapshot mouse geometry. Mouse
positions include file/content identity and displacement from the nearest text
position in line-height units. Both directions use the common named mouse
renderer. Remote caret, selection and typing-line widgets are removed from
programming and Turtle; the ordinary local editing caret remains.

The browser test reproduced a transition race: a teacher edit arrived while the
returning student's document was synchronizing, then the student's older saved
editor buffer reseeded the document and undid the edit. The student now exposes
whether its buffer has unsaved work; saved buffers take the shared document,
while genuine unsaved first handoffs keep their existing protection. Cached
Activity restoration also recreates retired/destroyed document state and retains
the completed-handoff fence for the same material. A bounded, authenticated
binding fetch recovers a missed watch-start push on mount/reconnect. It can return
only the requesting student's active source and a draft held by authorized
watches; it cannot nominate another student or create a teacher grant.

## Local checks

| Check | Result |
| --- | --- |
| Manager, Team Lead and assigned Teacher in Chromium and WebKit | 6 passed |
| Existing tutoring authorization and Chromium/WebKit learning UI regressions | 4 passed |
| Frontend monitoring, geometry, expiry and cached-session suites | 26 files, 218 passed |
| API observation relay and monitoring gateway suites | 73 passed |
| Shared observation/event/monitoring contracts | 109 passed |
| Affected frontend lint | Passed |
| API, web and E2E TypeScript; shared/API builds | Passed |

The focused total is 400 tests, with 10 additional browser tests. The browser journey checks pointer sharing in
both directions for quizzes, answers, PDF, video, Turtle code and actual drawing;
teacher-marker expiry; absence of remote caret widgets; PDF/Turtle pixel
projection; repeated code → PDF/Turtle → code transitions without refreshing;
student socket continuity; live edits after each return; reload and role
revocation. Student/staff sockets connect to separate API instances with real
Redis delivery. GUI output comes from the actual Docker Python/Tk runtime.

```sh
pnpm e2e:monitoring:materials --output test-results/bidirectional-material-pointers-qualified
pnpm e2e:monitoring:materials --config e2e/dlab.playwright.config.ts --grep 'learning UI identifies materials|covers academy classes without teaching assignments' --output test-results/bidirectional-material-pointers-regression
pnpm --filter @cove/web exec vitest run src/lib/monitoring src/components/monitoring
pnpm --filter @cove/api exec vitest run src/monitoring/monitoring.gateway.spec.ts src/monitoring/material-observation.gateway.spec.ts
pnpm --filter @cove/shared exec vitest run src/monitoring/events.spec.ts src/monitoring/observation.spec.ts src/monitoring/monitoring.spec.ts
NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter @cove/web typecheck
pnpm --filter @cove/api typecheck
pnpm typecheck:e2e
```

## Browser evidence and limitations

Exploratory evidence remains under `test-results/bidirectional-material-pointers-teacher/`
and `test-results/bidirectional-material-pointers-handoff/`. The first exposed the
saved-buffer overwrite race. After that fix Chromium passed; WebKit completed
the functional pointer/transition checks but reported a stackless observer
delivery notice during the Turtle sidebar resize. Only WebKit's exact, stackless
`ResizeObserver loop completed with undelivered notifications.` notice is now
recorded in its own diagnostic attachment. Other application exceptions and all
position/convergence assertions remain failures.

The final six-case qualification run passed without retries. Screenshots and
diagnostic attachments are under `test-results/bidirectional-material-pointers-qualified/`.
The four existing regressions also passed; their artifacts are under
`test-results/bidirectional-material-pointers-regression/`. Visual inspection of
the WebKit teacher's Turtle screenshot confirmed the shared workspace, actual
red drawing output and named mouse pointer without a remote caret label. The
owned test services, GUI containers and Safari probe driver were cleaned up;
unrelated local services were left running.

Native Safari was also probed with the installed Safari 26.6.2 WebDriver. Session
creation was refused because Safari's **Allow remote automation** setting is
disabled. No Safari setting was changed and the probe driver was stopped. WebKit
coverage exercises Safari's engine; it is not a native Safari application run.

External PDF/video storage is served by local fixtures while authenticated reads
and live services execute normally. Enrolled-course Turtle coverage is Docker
Python/Tk; this does not qualify the separate public browser trial. No dependency
or database migration was added. No merge or deployment was performed.
