# Public turtle trial implementation

Approved design: [public turtle trial](../specs/2026-10-22-public-turtle-trial-design.md).
Branch: `feat/public-turtle-trial`.
Status: completed and locally verified; see the [verification record](../../research/2026-10-22-public-turtle-trial-verification.md).

1. Add a shared guest contract and versioned, downloadable Python helper bundle.
   Implement race coordinates, exact lesson commands, and a guest-only runner.
2. Extend the broker with trusted output limits, source-complete state,
   idempotent owner/request lookup, and a trial-only execution policy. Preserve
   course defaults and isolate the guest deployment on its own Docker daemon.
3. Add a standalone Nest module for server-verified PIN access, Redis grants,
   atomic limits/reservations, owner-scoped execution, and controlled exports.
   Add strict environment validation and an operator credential utility.
4. Add same-origin Next handlers with HttpOnly cookies, origin checks, bounded
   bodies, and safe private-API forwarding. Keep studio login independent.
5. Build the public workspace using the existing Monaco and noVNC surfaces.
   Palette: Cove blue, slate ink, white canvas, pale blue chrome, race colors.
   Use the existing Pretendard UI face and editor monospace. The visible Python
   and live turtle canvas are the visual focus; avoid marketing decoration.
   Include resizable panes, mobile tabs, recovery, errors, help, and downloads.
6. Wire disabled-by-default deployment/build settings and document the separate
   guest host, code rotation, capacity rehearsal, and rollback.
7. Verify helpers, Redis access/concurrency, broker policy, web boundary and
   browser flows. Run relevant package typechecks/builds and existing runtime
   regressions. Record actual results and environmental limitations.

The writing-plans skill referenced by brainstorming is not installed in this
workspace; this repository-native plan records the implementation sequence.
No production deployment or class-sized capacity claim is part of local work.
