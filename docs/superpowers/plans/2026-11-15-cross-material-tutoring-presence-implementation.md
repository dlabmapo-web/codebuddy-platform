# Material-aware tutoring presence implementation

Design: [Tutoring presence across different lessons](../specs/2026-11-15-cross-material-tutoring-presence-design.md).

Completed on 2026-11-15. Results: [verification and screenshots](../../research/2026-11-15-cross-material-tutoring-presence-verification.md).

1. Require displayed and accepted source material identity at the shared pointer presentation boundary. Reject unknown/conflicting identity before mounting geometry observers or a portal.
2. Wire programming monitoring, embedded tutoring, student programming peers and observation pointers to their actual content and accepted session/envelope. Retain document binding checks and transport ownership.
3. Add component regressions for immediate removal, movement/geometry events, missing/conflicting identities, same-material placement/fallback, saved-work coverage and independent teachers. Run relevant awareness/workspace tests and type/lint checks.
4. Exercise real localhost student/staff contexts against disposable PostgreSQL/Redis for Manager, Team Lead and Teacher, in English/Korean. Capture matching lesson, different lesson, return-live, mixed-material and recovery states. Assert content updates and socket continuity.
5. Inspect screenshots, record verification and any limits, and clean up temporary servers plus relevant Cove API processes on port 4000.
