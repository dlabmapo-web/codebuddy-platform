# Tutoring presence verification

Date: 2026-11-15
Branch: `fix/v2-feedback`
Design: [Tutoring presence across different lessons](../superpowers/specs/2026-11-15-cross-material-tutoring-presence-design.md).

## Result

The shared pointer renderer requires a known displayed material and a matching accepted source material before mounting placement observers or rendering a portal. An embedded pointer material must also agree with that source. A different or unknown material therefore produces neither an arrow nor the misleading “looking at code” fallback. Same-material geometry failures retain the existing truthful fallback and direction controls.

Programming monitoring, embedded tutoring, observation pointers and student receivers supply material context from their accepted session/envelope and displayed content. Student programming receivers require a bound session for the displayed class/material and a live connection. Instructor previews suppress outgoing cursor/pointer publication and reliably clear prior markers while continuing to receive the watched student's document. Saved-work coverage and existing model/draft/sequence/generation guards remain in place.

Returning to an already authorized, synchronized coding document now resumes that document instead of leaving the saved preview on screen or reopening its watch. Selecting a different live material retains the existing authorization flow. The outer material selector resets its preview request guard when returning to the active watch, allowing repeated navigation. No header rows, visible controls, permissions, database reads or protocol fields were added.

## Checks

- 277 web monitoring/component/awareness/display-controller regression tests passed across 33 files. These cover unknown/conflicting identities, immediate removal of cached arrows/banners, subsequent geometry events, same-material direction/fallback placement, late-mounted media, saved-work coverage, independent teachers, source loss, outgoing suppression with continued reception, and resuming the same watch.
- 8 existing class-feedback/classroom integration tests passed against disposable Docker PostgreSQL, including the existing permission and statement-count guards. No production read path changed and no database round trips were added.
- 3 real Chromium browser scenarios passed together: Manager in English, Team Lead in Korean and assigned Teacher in English. Each used separate student/staff browser contexts, the actual Next/Nest applications and real Socket.IO traffic with disposable PostgreSQL/Redis and a local SSO provider double.
- Browser assertions verified new pointer packets while viewing another chapter without drawing a marker/banner, independent preview selection, current student location, live code changes after returning, code/written-response transitions, and no changes to socket creation/closure or watch-start/stop counts during coding preview/return. Identical titles on different material IDs did not match accidentally.
- Manager additionally verified network interruption/recovery, removal of stale pointers, preservation of the selected preview, and live code/cursor updates after the student returned from a written response. The test waits for the observation channel to announce that return and for synchronized live presentation before checking the cursor.
- Web and E2E type checks, focused ESLint on changed production files/new regressions, shell/JavaScript syntax checks and `git diff --check` passed. The existing student-monitoring test retains its two pre-existing lint warnings.

Verification used controlled local materials before the original customer screenshot was supplied. The later screenshot shows the same cross-material banner scenario covered by these tests. Browser verification was Chromium only. Media placement also has component regressions; the interactive mixed-material browser cases used coding and written responses.

## Screenshots

32 screenshots were captured and visually reviewed, including desktop and 390px mobile layouts. These generated artifacts are local and ignored by Git. Open the [complete screenshot gallery](../../test-results/tutoring-presence/index.html), or a role overview: [Manager](../../test-results/tutoring-presence/manager-en.html), [Team Lead](../../test-results/tutoring-presence/team-lead-ko.html), [Teacher](../../test-results/tutoring-presence/teacher-en.html). Click any gallery image for its full resolution original.

| State | Manager · English | Team Lead · Korean | Teacher · English |
| --- | --- | --- | --- |
| Student current lesson | [Screenshot](../../test-results/tutoring-presence/manager-en/en-01-student-current-lesson.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-01-student-current-lesson.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-01-student-current-lesson.png) |
| Private teaching view | [Screenshot](../../test-results/tutoring-presence/manager-en/en-02-private-teaching.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-02-private-teaching.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-02-private-teaching.png) |
| Matching lesson with cursor | [Screenshot](../../test-results/tutoring-presence/manager-en/en-03-same-lesson-pointer.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-03-same-lesson-pointer.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-03-same-lesson-pointer.png) |
| Different chapter, no cursor/banner | [Screenshot](../../test-results/tutoring-presence/manager-en/en-04-different-chapter-no-pointer-or-banner.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-04-different-chapter-no-pointer-or-banner.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-04-different-chapter-no-pointer-or-banner.png) |
| Return to live with updated code/cursor | [Screenshot](../../test-results/tutoring-presence/manager-en/en-05-return-live-updates-and-pointer.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-05-return-live-updates-and-pointer.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-05-return-live-updates-and-pointer.png) |
| Student moves; instructor stays | [Screenshot](../../test-results/tutoring-presence/manager-en/en-06-student-changes-lesson-instructor-stays.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-06-student-changes-lesson-instructor-stays.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-06-student-changes-lesson-instructor-stays.png) |
| Matching written response | [Screenshot](../../test-results/tutoring-presence/manager-en/en-07-matching-written-response.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-07-matching-written-response.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-07-matching-written-response.png) |
| Preview across material types | [Screenshot](../../test-results/tutoring-presence/manager-en/en-08-mixed-material-preview.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-08-mixed-material-preview.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-08-mixed-material-preview.png) |
| Network interruption | [Screenshot](../../test-results/tutoring-presence/manager-en/en-09-reconnecting-no-stale-pointer.png) | Covered by Manager scenario | Covered by Manager scenario |
| Network recovery, preview retained | [Screenshot](../../test-results/tutoring-presence/manager-en/en-10-reconnected-preview-still-independent.png) | Covered by Manager scenario | Covered by Manager scenario |
| Return from another material | [Screenshot](../../test-results/tutoring-presence/manager-en/en-11-live-code-after-material-return.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-11-live-code-after-material-return.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-11-live-code-after-material-return.png) |
| Compact mobile header | [Screenshot](../../test-results/tutoring-presence/manager-en/en-12-compact-header-mobile.png) | [Screenshot](../../test-results/tutoring-presence/team-lead-ko/ko-12-compact-header-mobile.png) | [Screenshot](../../test-results/tutoring-presence/teacher-en/en-12-compact-header-mobile.png) |

The mobile screenshots retain the same-material surface fallback when the student's pane is unavailable in the narrow layout. Suppression applies when material identity differs or cannot be established.

## Reproduce

Run `bash packages/api/scripts/test-cross-material-presence.sh`. The harness creates disposable PostgreSQL/Redis, migrates only that database, compiles an isolated API output directory, runs integration checks and starts the application on localhost ports 3309/4319 with the local provider on 4320. It preserves the normal API build and removes its containers/build directory on exit. Raw screenshots are written to `test-results/cross-material-presence`.

## Cleanup

The task's browser/API/provider processes and disposable containers/build directory were removed after verification. The existing Cove API listener and its Nest watcher were identified by their working directory before graceful termination. Ports 4000, 3309, 4319 and 4320 were verified free at handoff.
