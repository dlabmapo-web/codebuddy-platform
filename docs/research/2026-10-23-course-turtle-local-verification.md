# Course Turtle repair: local verification

Date: 2026-10-23 · Branch: `feat/course-turtle-parity` · Base: `9015fda7`

This implements the [approved repair design](../superpowers/specs/2026-10-23-course-turtle-elice-parity-design.md) following the [Elice/Cove audit](2026-10-23-course-turtle-elice-parity-audit.md). No deployment, production publication, production content conversion or production grading occurred.

## Result

Course Turtle source runs through isolated CPython/Tk. Source completion and graphical-window lifetime are separate: pending Turtle drawing is flushed, the real completion/error/exit code is reported, and the window is retained for at most 30 seconds within its original execution/authorization budget. The browser caches one transient frame while connected, so disconnection does not replace the drawing with noVNC's cleared canvas. A returning non-GUI program never creates a Tk window. Explicit `done()`/`mainloop()` remains interactive; completed course results become read-only.

The fixed material viewport initially fills the virtual desktop. Explicit `Screen.setup()` remains effective, and standard course pen/shape defaults are unchanged. Docking, fitting and foreground expansion never resize the Python world. The public trial retains its separate beginner defaults and admission policy.

The workspace supports drawing below/right, adjustable editor height, a collapsed course navigator, and mobile Code/Drawing/Terminal tabs. The foreground drawing uses the browser's dialog top layer with visible Close/Stop controls, contained Tab focus, two-stage Escape and focus return. One noVNC viewer survives placement and expansion changes. Its mouse capture is explicitly released on mouseup/close so it cannot block the workspace afterward. Connection and execution states have Korean/English labels.

File creation uses Cove's dialog and inline safe-path/duplicate/quota validation. Creating an empty module marks the draft dirty. New runs use generation guards; old polls and late start responses cannot replace newer results. The course broker serializes replacement of an authenticated learner/material owner's previous run through confirmed sandbox removal, including after reload, without replacing another owner or changing public trial behavior.

Authorized staff preview requests the complete scoped hierarchy. Students cannot request it. A loaded outline missing the current material becomes a finite unavailable/retry state rather than endless loading. Navigation stops the owned run before committing the transition.

## Content and history

[The conversion operator](../../packages/api/src/migrations/course-turtle/README.md) requires explicit source/material/hierarchy mapping, reviewed assessment flags, verified assets, a private dry-run artifact, an exact fingerprint, an academy actor and backup confirmation. It retains the original programming record, solutions, drafts and historical submissions/grades; copies learner draft code into the new manual entry point; and preserves material IDs/visibility/order. It does not infer execution from source text. Current graded progress follows the typed material and score policy, without counting its retained programming child twice.

Legacy ordinary lesson URLs redirect through an authorized material-type read. Historical programming attempt URLs remain readable. New programming submission/draft writes and staff programming submissions for converted Turtle materials are refused. Student grading admission shares a material lock with conversion. Public sample checks query programming materials only. Old staff practice records remain separately readable. Running Turtle never creates a submission or review.

The development fixture exercises dry-run → conversion → rollback → conversion. A historical programming score of 75 remains 75 after a separate Turtle review of 87.5. Rollback after new learner work/review is refused without deleting that work. Private artifacts are under `/tmp/course-turtle-parity-conversion.json`, mode `0600`, and are not committed.

The fixture uses only course `ee430000-0000-4000-8000-000000000001` in the development Supabase project; its reset refuses an unexpected course title. An initial QA-ID collision was corrected and the existing short-answer QA fixture was restored before the final runs.

## Checks completed

| Check | Result |
|---|---|
| Next.js 16.4.1 optimized standalone build, including TypeScript | Passed |
| API build | Passed |
| Course E2E against the real standalone app/API/Tk broker | **8 passed**, Chromium and WebKit |
| Extended included/excluded assessment policy E2E | **2 passed**, Chromium and WebKit |
| Focused public `/turtle` E2E against its separate real runtime | **6 passed**, Chromium and WebKit |
| Real course runtime integration | **6 passed**, 1 optional retained-image upgrade test skipped |
| Runtime unit/policy/scheduler suite | **38 passed**, 8 opt-in integration tests skipped in this invocation |
| Manual/public Turtle web component tests | **31 passed** |
| Focused API authorization, grading, navigation and conversion tests | **96 passed** |
| Shared package tests | **920 passed** |
| i18n tests | **138 passed** |
| Comparator pool isolated rerun | **45 passed** |
| Web/API/E2E TypeScript checks and whitespace check | Passed |
| Affected web ESLint | 0 errors; 5 existing/expected warnings (hook dependency notices and the transient data-URL image) |

The course browser scenarios verify actual red pixels, not only printed markers: instant `tracer(0)` completion, partial drawing plus traceback, corrected rerun, helper import, empty-file persistence, path/duplicate errors, both docking modes, foreground focus/Close/Escape, reconnect, keyboard/timer/input callbacks, stopped-frame retention, cancellation during preparation, mobile expansion, navigation cleanup, hidden-preview authorization, immutable submissions, teacher rerun/review, stale-review conflict and legacy attempt access. Expansion is tested with native `requestFullscreen()` forced to reject. No application page errors occurred in the standalone run.

The extended assessment run additionally publishes a separate disposable scored mission, submits it as the student and publishes a 90-point teacher review. It verifies that the excluded introduction does not enter the graded denominator, while the included mission does: total 2, solved 1, reviewed manual score 9,000 hundredths. This is independent of stdout comparison. Both browser engines passed that extended scenario.

Real runtime tests cover non-GUI return, destroyed window, `SystemExit(7)`, default pen/shape preservation, explicit viewport size, late-viewer window retention, original deadline enforcement, owner replacement, read-only assets, input, errors, timeout, output quota, queue cancellation, read-only display capability, resource isolation and descendant cleanup. An old approved-image upgrade is not claimed as tested; its optional environment was not configured.

Public regression covers PIN entry, custom helpers, real drawing, export, reload/mobile controls, race helpers, stoppable infinite loops, and switching examples with live/stopped results and independent code buffers. The existing broad public test had an ambiguous alert locator; it now selects the classroom cleanup alert instead of Monaco/Next live regions. The full 22-case public suite is not claimed as completed by this report; the affected flows were rerun in both engines.

A broad API sweep was interrupted during heavy concurrent local load. Two projection fixtures missing their material type were corrected; the affected API tests pass. A comparator timing failure passed all 45 cases when rerun in isolation. The full unrelated API suite is not certified by this report. The host has 8 GB RAM and reached about 13.5 GB swap; a concurrent runtime attempt correctly became unavailable after a Docker preparation timeout. After serializing checks and restarting the isolated test broker, the complete real runtime suite passed. No resource ceilings or security checks were weakened.

The live Browser plugin could not initialize because its bridge referenced a missing module. Visual verification used the repository's Playwright browser workflows and inspection of their captured images. WebKit is engine coverage, not a claim of testing every physical Safari device. A development-only WebKit stack-frame CORS error was eliminated from the acceptance environment by testing the real optimized standalone build.

## Browser evidence and timings

| Chromium | WebKit |
|---|---|
| [Drawing on right](assets/2026-10-23-course-turtle-local/chromium-drawing-right.png) | [Drawing on right](assets/2026-10-23-course-turtle-local/webkit-drawing-right.png) |
| [Partial error retained](assets/2026-10-23-course-turtle-local/chromium-partial-error.png) | [Partial error retained](assets/2026-10-23-course-turtle-local/webkit-partial-error.png) |
| [Mobile foreground drawing](assets/2026-10-23-course-turtle-local/chromium-mobile-expanded.png) | [Mobile foreground drawing](assets/2026-10-23-course-turtle-local/webkit-mobile-expanded.png) |

With the same instant red-line source and a 640 × 480 / 128 MiB cold course profile, the standalone run measured click-to-first-drawing at **2,716 ms Chromium / 2,305 ms WebKit**, and corrected rerun at **2,350 ms / 2,905 ms**. These observations include API preparation, owned-runtime teardown for rerun, Python startup and display connection. They are local samples, not a load test or VPS latency guarantee. There is no comparable numerical pre-change baseline: the audited normal-completion path lost its picture. Dock/expand/close preserved the original socket and canvas dimensions and added no runtime launch.

## Reproduce and review locally

The local optimized app is at `http://localhost:3078`, using API port 4048 and the isolated course broker on 4028. Existing normal development/public trial services were kept separate. Sign in with a development academy account.

Final cleanup check: course broker ready/healthy, active runs 0, allocated sandboxes 0, no remaining `cove-gui-course-parity-*` containers. Web and API health requests returned HTTP 200. The local services remain running for manual review.

- Student legacy class link (redirects to Turtle): `http://localhost:3078/academy/development-academy/learn/exercises/ee430000-0000-4000-8000-000000000031?classId=e0000000-0000-4000-8000-000000000040`.
- Staff preview: `http://localhost:3078/academy/development-academy/learn/turtle/ee430000-0000-4000-8000-000000000032?preview=true`.

With those local services running:

```sh
E2E_GUI_ENABLED=1 E2E_BASE_URL=http://localhost:3078 pnpm exec playwright test --config e2e/course-turtle.playwright.config.ts
COVE_TURTLE_REUSE_FIXTURE=1 pnpm exec playwright test --config e2e/turtle-trial.playwright.config.ts --grep 'PIN, helpers|race helpers|switching examples'
pnpm --filter @cove/api exec tsx scripts/verify-course-turtle-parity.mts
```

Course E2E resets only its guarded disposable development course. Its fixture includes a fake historical programming result for history-preservation testing; it is not a real learner grade.

## Production follow-up

Deploy API and web together (or API first), and provision the new approved course runtime image while retaining older approved images for submitted snapshots. Build and review the explicit production content manifest before applying conversion. Existing live dedicated Turtle materials pinned to old runtime images must be reviewed/re-saved through authorized authoring; historical snapshot versions stay unchanged.

The photographed production introduction `2d83d1db-f1ff-5ac7-b277-45f2f874bdd7` and the other CH09 materials have **not** been converted or published by this local work. The operator README describes the inventory, assessment/progress implications, backup, apply and rollback steps. Do not interpret local fixture success as completion of that production content operation or as exhaustive testing of every Python/Tk application.
