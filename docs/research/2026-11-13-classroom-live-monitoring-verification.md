# Classroom live monitoring verification

Date: 2026-11-13
Branch: `fix/v2-feedback`
Design: [Classroom teaching and live monitoring](../superpowers/specs/2026-11-13-classroom-live-monitoring-design.md).

This update supersedes the simple classroom header described in the [initial classroom verification](2026-11-13-instructor-classroom-verification.md). Teaching now uses the existing monitoring header, curriculum trigger and student selector, with a class lesson tree on the left. Demonstration work remains private and uses the existing staff workspaces.

The selector shows enrolled, online and solving totals and returns to the last teaching lesson. Class presence and roster are shared by the selector and help queue. A persistent route-group layout retains a bounded pool of three lazy transports for class presence, material observation and collaborative coding. Student/lesson navigation and opening/closing the dropdown do not close those transports. Leaving the class closes them. Network loss uses the existing reconnect and snapshot flows; this does not promise a connection can survive a real network outage.

Watch-stop requests are serialized with pending watch starts. Coding cleanup includes the component session ID as well as any confirmed identity, preventing an in-flight replacement from leaving an old watch active. Cleanup from another component session cannot stop its successor. Consumers remove only their own listeners from shared transports.

## Automated verification

- Web monitoring and classroom navigation guards: 27 files, 234 tests passed.
- API monitoring and material-observation gateways: 2 files, 76 tests passed, including pending-start cleanup and successor protection.
- English/Korean translation parity and namespace budgets: 146 tests passed.
- Disposable PostgreSQL class feedback/classroom integration: 8 tests passed, including role inheritance, assignment scope, hidden/unready content and fixed statement counts.
- Existing feedback Chromium scenarios passed for Manager (English), Team Lead (Korean) and Teacher (English). These cover the four earlier feedback fixes, classroom entry, private drafts, lesson navigation, discard/cancel guards, media renderers and class return links.
- Realtime Chromium scenarios passed together for Manager, Team Lead and Teacher (3 tests). Each used two independent student browser contexts and real isolated API/Redis sockets. They covered `2 online · 2 solving`, closed/reopened dropdowns, repeated current-student selection, student-to-student switching with live answer updates, return to the previous teaching lesson, student departure to `1 online · 1 solving`, and closing all earlier class transports on exit. Transport creation/closure counts stayed unchanged through navigation.
- Manager additionally covered the tutoring-overlay/current-student regression, live Monaco code updates across student switches, offline/online count resynchronization, and live code updates after reconnecting.
- Desktop and 390px mobile screenshots were visually inspected. The selector, counts and return-to-teaching control remain usable in the narrow layout.
- Shared build, web/API/E2E type checks, focused ESLint, translation catalog checks, canonical route checks and `git diff --check` passed. No schema migration was needed.

The browser harness used disposable PostgreSQL/Redis, a local SSO/storage provider double, and a separate API build plus Next output directory. It did not replace the user's development build. The existing feedback scenarios and the realtime scenarios passed in separate runs. Initial realtime test failures were corrected by waiting for guarded save/navigation completion and restoring the desktop viewport before reading the visible code editor after network recovery.

## Compact header follow-up

Moved live totals out of the selector trigger into one horizontal line beside it, restoring the original two-line trigger and its original maximum width. Added offline totals in English and Korean using the existing enrolled/online counts. Updated the realtime browser scenario's expected labels. The compact layout change passed 234 monitoring/navigation tests, 146 translation tests and focused ESLint; it does not change reads or socket lifecycles.

## Full toolbar follow-up

Teaching now mounts the existing history/tutoring host without a student identity. Its toolbar includes class history, the current lesson's tutoring roster and a grading entry that selects a student's saved submission. Actual grading stays in the existing authorized submission workspace. Lesson-specific edit and answer actions are mounted into the shared header through a portal, preserving each workspace's server-provided capabilities. Coding uses the same difficulty badge, statement canvas and split proportions as live monitoring. Fullscreen is in the footer and the privacy explanation is on the teaching status tooltip, reclaiming vertical space.

The instructor's workspace stays mounted under the tutoring layer. Returning to teaching closes that layer; private draft guards and student grading guards also run on navigation. Class history omits the student filter until an actual student is selected. Teacher editing permissions remain the same as the existing live entry.

- Monitoring, classroom, history, grading, edit navigation and staff practice regressions: 40 files, 271 tests passed.
- Web/E2E type checks passed. Focused ESLint passed with the same two existing manual-workspace hook warnings.
- Disposable PostgreSQL integration: 8 tests passed; outline metadata remains 4 statements and populated metadata plus roster remains 22 at both fixture sizes. Actions reuse existing on-demand readers; no additional page-entry read was introduced.
- The browser fixture now seeds the canonical solution relation, allowing Show answer to verify real reference code instead of only checking the dialog shell.
- All 6 Chromium scenarios passed together: Manager/Team Lead/Teacher feedback flows plus realtime classroom flows for each role. The toolbar checks exercised Show answer against real reference code, class-scoped Tutoring, localized labels and authoring visibility. Each realtime scenario opened a saved student's code through the teaching grading entry and returned to teaching before checking student switches, live updates, departure counts and transport continuity. Manager also covered network recovery. Desktop and mobile screenshots were inspected after the toolbar change.

## Database statement counts

Prisma query events were counted against disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`; no shared Supabase database was used.

| Read | Small fixture | Large fixture |
| --- | ---: | ---: |
| Classroom outline metadata | 4 | 4 |
| Existing roster with populated curriculum | 18 | 18 |
| Combined classroom entry metadata and roster | 22 | 22 |
| Existing teaching class list | 4 | 4 |
| Existing roster without course curriculum | 13 | 13 |
| Existing class-management detail | 26 | 26 |

The populated fixture grew from 1 course/1 lesson to 6 courses/46 lessons, with valid content records. Empty-curriculum fixtures grew from 1 to 13 classes and 1 to 21 students; combined entry stayed at 17 statements in that separate fixture. These entry counts cover outline metadata and the shared roster; individual lesson content readers remain separate. The roster reader is reused unchanged, with one authorized server read shared across the class workspace. Enrollment refresh is every 30 seconds; presence/counts use socket snapshots and deltas.
