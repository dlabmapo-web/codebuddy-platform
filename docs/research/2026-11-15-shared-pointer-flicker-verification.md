# Shared pointer flicker verification

Date: 2026-11-15
Result: Implemented and verified on localhost against [the design](../superpowers/specs/2026-11-15-shared-pointer-flicker-design.md).

## Changes

- `RemotePointer` now retains an eligible arrow and label during coordinate updates and validates the new projection in a layout effect before paint. Position changes no longer remove and recreate the portal.
- Placement context includes material, surface, space, collaborative draft and optional snapshot file identity. Invalid projection, explicit clear, incompatible content and covered history still remove or replace presentation promptly.
- Geometry notifications are coalesced using the newest committed inputs. Surface/ancestor observers survive ordinary movement, refresh when their targets change, ignore overlay-owned mutations and cancel pending work on teardown. Equivalent measurements do not produce redundant state changes.
- Snapshot pointer consumers pass file identity without treating changing coordinates or content revisions as a new file.

The initial new component regressions reproduced the old renderer's hide/show cycle before implementation: seven of the first eleven checks failed. The resulting regressions cover arrow/label element continuity, normalized and anchored positions, editor/custom projection, snapshot file transitions, failed projection, coalescing, stable subscriptions and immediate cleanup with queued frames.

## Additional issue found by browser testing

The first browser attempts passed student-to-staff continuity but could not display staff pointers on the student's coding screen. Captured traffic showed that the student was receiving awareness packets. Inspection found that coding students never reported completed document synchronization to `StudentPresenceProvider`; its connection remained `resynchronizing`, so the existing `state === 'live'` material guard correctly suppressed presentation indefinitely.

`useStudentMonitoring` now reports synchronization only after the authorized document binds to the editor on a connected socket. The material/source guard remains intact. New regressions cover initial `resynchronizing` state, foreign draft snapshots, pending synchronization, disconnected sockets and restored coding pages. This is a local readiness correction; it does not open another socket, change permissions or add reads.

An early browser harness also referenced an obsolete edit-code toggle. Current live watches already request editing, so verification uses the current UI and checks actual two-way code synchronization.

## Automated checks

- **268 web tests passed across 32 files** in `src/components/monitoring` and `src/lib/monitoring`. The readiness test file was checked again after its lint cleanup: all six cases passed.
- **8 API integration tests passed** against disposable Docker PostgreSQL, including the existing permission and statement-count guards.
- Web and E2E type checks passed. Focused ESLint on changed production files and component/readiness tests passed without warnings. `git diff --check` passed.
- **6 real Chromium browser scenarios passed together**, covering the three staff roles for both continuous pointer movement and the existing cross-material privacy/reconnect journeys.

Commands:

```bash
pnpm --filter @cove/web exec vitest run src/components/monitoring src/lib/monitoring
pnpm --filter @cove/web typecheck
pnpm typecheck:e2e
bash packages/api/scripts/test-cross-material-presence.sh --config e2e/pointer-flicker.playwright.config.ts --output test-results/pointer-flicker-final
```

No API read path or database schema changed. Added database statements: **zero**. The browser harness used disposable local PostgreSQL/Redis and a local identity-provider double with the actual Next/Nest application, authorization and Socket.IO implementation. It did not use shared Supabase data.

## Continuous movement results

Environment: Chromium **151.0.7922.34**, Next at `http://127.0.0.1:3309`, API at port 4319, local provider at port 4320. Staff and students used separate authenticated browser contexts and unequal viewport sizes. Team Lead and student screens also exercised Korean translations.

| Role / locale | Recorded movement segments | Sampled frames | Missing / hidden markers | Replaced markers / marker removals |
| --- | ---: | ---: | ---: | ---: |
| Manager / English | 7 | 1,518 | 0 | 0 / 0 |
| Team Lead / Korean | 7 | 1,485 | 0 | 0 / 0 |
| Assigned Teacher / English | 7 | 1,499 | 0 | 0 / 0 |
| **Total** | **21** | **4,502** | **0** | **0 / 0** |

Each role's recorded segments cover student-to-staff code pointers, staff-to-student code pointers, statement and terminal pointers, reduced-motion movement with a receiver resize, and observation pointers in both directions on a written-response material. Manager additionally passed a second-monitor movement audit, simultaneous independent teacher markers and removal of only the departing monitor.

The tests establish valid capture/projection before starting each measured segment, then move the real mouse through the existing publisher. They sample visibility/identity at animation frames and separately observe DOM removals, including removals hidden between paints. Every segment also requires changing marker positions. They do not merely wait for an eventual visible screenshot.

During code-pointer movement, the student appends code while a Python run streams output into the student's terminal and the staff mirror. Assertions verify that output advances and the final line arrives. Two-way staff/student code edits converge afterward. Teacher pointers expire on the student after inactivity, while the student marker remains visible to staff. Movement and pane activity leave socket creation/closure and watch-start/stop counters unchanged.

The three additional browser journeys verify differing lesson IDs with identical titles, immediate suppression during an independent preview, observation/code transitions, continued code updates on return and compact mobile headers. The Manager journey also verifies actual network interruption/recovery. These tests passed again with the readiness correction applied.

These measurements establish the absence of the reported hide/show cycle in the tested scenarios. Browser verification was Chromium; other browser engines were not run. Snapshot file/content projection also retains its existing component regression coverage; the non-programming browser path used written responses.

## Screenshots and recordings

Open the [complete gallery of 51 screenshots and three student screen recordings](../../test-results/pointer-flicker-gallery/index.html). It includes 19 pointer verification screenshots and 32 lesson-switching/privacy/reconnect screenshots. Generated artifacts are local and ignored by Git. Representative full-resolution screenshots were visually inspected; screenshots supplement the frame/DOM audits rather than proving continuity by themselves.

| View | Manager | Team Lead | Teacher |
| --- | --- | --- | --- |
| Staff sees the student's pointer and mirrored output | [Image](../../test-results/pointer-flicker-gallery/manager-en/01-staff-sees-continuous-student-pointer.png) | [Image](../../test-results/pointer-flicker-gallery/team-lead-ko/01-staff-sees-continuous-student-pointer.png) | [Image](../../test-results/pointer-flicker-gallery/teacher-en/01-staff-sees-continuous-student-pointer.png) |
| Student sees the staff pointer | [Image](../../test-results/pointer-flicker-gallery/manager-en/02-student-sees-continuous-staff-pointer.png) | [Image](../../test-results/pointer-flicker-gallery/team-lead-ko/02-student-sees-continuous-staff-pointer.png) | [Image](../../test-results/pointer-flicker-gallery/teacher-en/02-student-sees-continuous-staff-pointer.png) |
| Observation pointer on written response | [Image](../../test-results/pointer-flicker-gallery/manager-en/06-observed-written-response.png) | [Image](../../test-results/pointer-flicker-gallery/team-lead-ko/06-observed-written-response.png) | [Image](../../test-results/pointer-flicker-gallery/teacher-en/06-observed-written-response.png) |

Raw role metrics and the last bounded awareness-packet samples are available in the gallery's `continuity-results.json` links. The combined export is [measurements.json](../../test-results/pointer-flicker-gallery/measurements.json).

## Cleanup and scope

The harness stopped its Next/API/provider processes and removed its disposable PostgreSQL/Redis containers and isolated API build. Ports **4000, 3309, 4319 and 4320** were checked free. The user's pre-existing development web server on port 3000 was left running.

Chapter-selector pointer eligibility, the reverted same-student Tutoring change and the Output Statements exercise grading issue remain separate work. This change preserves their current behavior.
