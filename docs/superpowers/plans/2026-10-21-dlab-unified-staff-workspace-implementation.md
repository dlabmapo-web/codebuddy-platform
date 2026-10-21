# DLAB inherited staff roles and unified workspace implementation

Approved design: [staff roles and unified workspace](../specs/2026-10-21-dlab-sso-inherited-staff-roles-design.md).
Branch: `feat/dlab-os-staff-sso`. Production deployment is outside this implementation task.
Status: Implemented and verified locally. See the [verification record](../../research/2026-10-21-dlab-unified-staff-workspace-verification.md) for actual coverage and remaining production/HQ acceptance.

1. Add canonical derived role sets to the shared DLAB policy; test all OS codes and unknown fallback.
2. Reconcile exact extra-role sets idempotently and audit changes. Validate the same complete set during managed eligibility. Preserve guards, campus boundaries, identity IDs and session invalidation.
3. Use all held roles for academy navigation, primary role for identity/overview, and remove the ordinary staff role-mode selector. Ignore stale mode cookies; retain platform inspection controls.
4. Reuse the existing shared activity workspace with Elice-style action ordering, statement/editor split, tutoring drawer, selected-student header and explicit live-edit mode. Use Cove's semantic color tokens and Lucide icons. Keep personal practice, curriculum authoring and student drafts isolated.
5. Verify Manager/Team Lead inherited Teacher grants work with existing teacher-assignment lists and assigned-class gates. Test self-assignment, Team Lead assigning Manager, unassigned denial, and assignment removal during live access. Do not add a Manager scope bypass.
6. Extend isolated SSO integration and Chromium coverage for inherited roles, unified actions, class-scoped tutoring and legacy logins. Run type/lint/route/i18n checks appropriate to touched files.
7. Inspect the local rendered UI against the captured Elice reference, record screenshots/results, update operational rollout/backfill/rollback instructions and the design's implementation status. Distinguish real-browser results from provider doubles.

Visual direction: keep Cove's existing font stack and semantic palette (`brand`, `brand-soft`, `canvas`, `card`, `border`, `sub`); use the established blue action emphasis, quiet statement pane and high-contrast editor. Header actions appear together in solution/tutoring/edit/leave order. Tutoring keeps the material visible and changes only the student work pane. Responsive layouts retain the existing problem/code mobile switch and keyboard-accessible controls.
