# Video viewing progress local verification

Date: 2026-10-26

Approved design: [viewing progress and class report](../superpowers/specs/2026-10-26-video-viewing-progress-design.md).

## Implemented behavior

- The student player shows acknowledged watched percentage, watched video duration versus total duration, status and a progress bar, including after completion. Video sizing leaves space for the panel and playback controls.
- Staff use the existing video tutoring/watch-history route to open a class viewing report. The current active roster includes students without viewing records. Summary counts cover the full roster; name/status filters and pagination apply to the table.
- The new private `/api/videos/report` endpoint reuses material/class authorization, denies student roles, limits teachers to their assigned active classes and courses, and scopes managers/team leads to their academy. It returns no playback-session credentials.
- Parameterized SQL joins progress for the current material/asset/class only. Repeatable-read summary and page queries keep one report response consistent. Page size is 50. Literal substring search treats SQL/wildcard characters as text.
- Existing historical reads remain available. Their UI now formats watched duration and last position as time, with a zero-duration-safe percentage calculation.
- No migration, production setting, scoring rule or watch-credit rule changed. Watched time remains unique video coverage; replay overlap does not increase the measure. Completion remains the existing server decision, which may be reached at 90%.

## Automated and database checks

- 23 focused API tests passed across the report/access, existing video-service, progress and media-controller suites, including the final added tracking-disabled read case.
- Three shared report-contract tests passed, covering status/percentage separation, invalid measurements, input bounds and stripped permission/asset overrides.
- All 140 translation tests passed. API and web typechecks, focused web ESLint and whitespace checks passed.
- `packages/api/scripts/verify-video-viewing-report.mts` passed against the guarded development database. It creates temporary tables that shadow the relevant names inside one connection/transaction and drops them on commit; it changes no persistent roster or progress records.
- Its 54-student active roster included direct and extra student roles, partial/completed/missing progress, old assets, another class, inactive and cross-academy memberships. Verified counts, pagination beyond 50 rows, out-of-range-page clamping, a completed 90% watch, empty roster, state/search filters, literal percent/underscore input and SQL-looking search text.

## Browser checks

- Used existing disposable development manager/student accounts through the normal local sign-in UI. No Elice student records were changed. A local sign-in widget load error resolved after a full page reload; no security settings were changed.
- The real reported local video/class showed 20 active students: 1 completed and 19 not started. Verified visible percentage bars, watched/total duration, last position and recorded date.
- Searching a specific student returned one matching row. Completed filtering returned the completed student, and clearing filters restored the roster. Summary counts remained roster-wide as labelled.
- A student could not obtain the class table; the error view showed no student viewing details. The same student could open their own lesson and see 100% watched, 0:04 of 0:04 and Completed for the existing short fixture.
- Teacher report and student player checked at 390 × 844. The report's overall width remained 390 px; its wide table scrolls inside its container. The student progress panel fit within the viewport with no internal horizontal overflow. Restored the normal browser viewport.
- Screenshots: `/tmp/cove-video-viewing-report-desktop.png`, `/tmp/cove-video-viewing-report-mobile.png`, `/tmp/cove-video-student-progress-desktop.png`, `/tmp/cove-video-student-progress-mobile.png`.

## Reference boundary

Elice course/lecture/student dashboards and report headers were inspected during design. Course progress and completion were confirmed; per-video elapsed viewing minutes were not verified. Cove's new display therefore describes its own existing unique-coverage metric explicitly rather than claiming an unverified Elice time policy.
