# Video viewing progress implementation

Approved design: [video viewing progress and class report](../specs/2026-10-26-video-viewing-progress-design.md).

1. Add typed report inputs/results and safe progress percentage/status helpers in shared contracts.
2. Add an authorized, paginated current-asset class-report read endpoint. Join active enrolled students to progress, including missing records, with parameterized queries and roster-wide summary counts. Retain historical reads.
3. Add a student progress panel and a teacher report with Cove selectors, search, summary, statuses, readable duration/date values, refresh and paging. Translate English/Korean labels.
4. Verify projection/authorization/input boundaries with focused tests and real development reads/fixtures; check student/staff/mobile UI, typechecks, lint and translations.

The writing-plans skill referenced by brainstorming is unavailable in this workspace. This plan records the approved implementation sequence directly.

Completed. See [local verification](../../research/2026-10-26-video-viewing-progress-local-verification.md) for tests, database fixtures, browser checks and screenshot paths.
