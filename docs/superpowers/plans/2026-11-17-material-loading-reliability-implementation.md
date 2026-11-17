# Material loading reliability implementation

Approved scope: [design](../specs/2026-11-17-material-loading-reliability-design.md).
Branch: `feat/web-courses`. No production deployment in this task.

1. Repair the reference PDF title in the existing one-statement projection and make its nested type explicit.
2. Preserve read errors in the REST adapters; share material failure classification, localized recovery and unavailable UI.
3. Keep parallel exercise reads settled through Turtle redirection. Route unexpected faults to recoverable boundaries and actual content denial to neutral material unavailable screens; align course, saved-work and monitor catches.
4. Add SQL-to-output contract and invariant query-count coverage against disposable PostgreSQL, plus unit tests for error classification, routes and retry behavior.
5. Run isolated localhost Chromium/WebKit checks using local OS/auth/storage doubles and real API/Studio. Capture the corrected PDF exercise and each material family, including recovery, Korean/dark copy and genuine unavailable content.
6. Run types, focused unit/integration tests and affected route/i18n checks. Review the final diff, record exact evidence and gaps, and stop temporary servers; leave port 4000 free.
