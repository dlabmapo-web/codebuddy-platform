# Shared courses and staff practice implementation

Approved basis: 2026-10-20 shared course workspace specification. Branch: `feat/shared-course-staff-practice`.

1. Add explicit staff practice permission and role-union course scope. Keep platform inspection read-only.
2. Add separate practice draft/attempt storage, versioned immutable grading snapshots, owner-scoped API contracts, conflict handling and idempotent dispatch.
3. Reuse the judge execution paths with a separate result sink. Recover orphaned practice jobs without student progress/reward writes.
4. Render a staff workspace on the canonical exercise route using shared statement/editor/runtime/result components and staff persistence adapters. Preserve student hooks in the student component only.
5. Add common course navigation, inline management entry points, return-to-problem links and Elice-style workspace chrome using Cove design tokens.
6. Verify scoped access, record isolation, job retries, grading parity, UI and student regressions with focused unit/integration/browser checks. Record any environment-dependent validation explicitly.

Design tokens: existing Cove brand #1B64DA, deep #1450B5, soft #EAF1FE; existing canvas/card/ink and editor tokens, Pretendard UI and existing monospace editor. Compact horizontal toolbar; left statement/reference pane; right persistent editor and terminal; centered previous/position/next footer. Staff practice status is the distinctive factual cue, with no decorative dashboard additions.
