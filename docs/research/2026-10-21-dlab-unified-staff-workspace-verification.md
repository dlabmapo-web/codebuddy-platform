# DLAB inherited staff roles and unified workspace verification

Date: 2026-10-21 (Asia/Seoul). Branch: `feat/dlab-os-staff-sso`.
Design: [approved scope](../superpowers/specs/2026-10-21-dlab-sso-inherited-staff-roles-design.md).
Production remains on its previous release; this verification did not change production or hosted development database records/configuration.

## Result

OS `lab_head` now derives Manager, Team Lead, and Teacher grants. `instructor`, `so_staff`, and `edu_manager` derive Team Lead and Teacher; `tutor` remains Teacher. Student, unknown-role fallback, and HQ platform Admin boundaries remain separate. Primary identity stays Manager/Team Lead, with one capability-based navigation and activity toolbar. Ordinary academy role-mode selection and its server action were removed; stale mode cookies cannot hide permitted actions.

Managers, Team Leads, and Teachers can tutor/review/grade only their assigned homeroom/assistant classes. Manager self-assignment and Team Lead assignment of a Manager use existing class operations. No Manager-wide student-work bypass was added. The written/quiz grading service previously widened access for higher primary roles; it now enforces assigned teaching for real members as well. Existing platform/support policy remains separate.

Exact role sets are reconciled transactionally and checked during every managed eligibility validation. Reconciliation preserves identity/membership IDs, avoids rewriting unchanged grants, records before/after role events, removes obsolete grants on demotion/campus retirement, and retains existing source-write guards. Existing operator invalidation also performs the required backfill. No new schema migration or secret is needed.

Management summaries and teacher availability now recognize extra Teacher grants, including assistant assignments when counting idle teachers. This prevents an assigned Manager from being reported as an unavailable teacher.

## UI reference and implementation

The signed-in Elice activity at `/courses/765886/lectures/6637913/lecturepages/54487982/admin/users/18498422` was inspected and captured locally. The Cove implementation reuses the shared staff workspace, solution dialog, tutoring drawer, live student editor, feedback dock, and content-authoring route. View solution, Tutoring, and Edit appear together; student selection replaces the work pane while retaining the statement/PDF area and activity navigation.

Cove semantic blue/color tokens and Lucide icons are used. Student code opens read-only until the server confirms explicit edit mode. Personal staff practice, lesson authoring, and student drafts retain separate persistence. On mobile, identity is a dedicated row above submission details, so the selected student's name remains readable. The existing Materials/Code mobile tabs and fullscreen behavior are retained.

## Automated results

`pnpm test:dlab` passed against newly created disposable PostgreSQL/Redis containers, the real Cove API/Studio, and local OS/Supabase provider doubles:

- All 67 existing migrations applied; no migration was added.
- 160 API authorization/authentication/SSO tests passed, including exact grants, backfill idempotency, managed DB guards, source transitions, and real SQL management aggregates.
- 69 shared contract/policy/bulk tests passed.
- 16 Studio SSO callback/session tests passed.
- All 22 Chromium cases passed, including all source role codes, unknown fallback, HQ-admin boundaries, five ordinary login roles, source revocation, account reuse, and the classroom workflow below.

Additional focused checks passed: 410 class/teaching/monitoring tests (22 environment-dependent cases skipped in that separate unit run), 36 manual-assessment/platform tests, 10 curriculum-overview tests, 28 learner-bootstrap tests, 18 PDF document/reference/files tests, 57 Studio access/navigation/workspace tests, and 136 localization tests. These group counts describe individual runs and should not be added as a deduplicated total.

The API build, Studio production build, Studio/E2E typechecks, changed-Studio-file ESLint, canonical-route check, and localization catalog check passed. The isolated Studio uses `.next-dlab` so its server does not contend with the developer's ordinary `.next` server lock. Earlier parallel TypeScript checks caused resource contention; final checks were serialized. Screenshot capture was bounded and animations disabled after one artifact-capture timeout on an already-loaded HQ console.

The broader `theme:lint` check reports three **pre-existing** violations: `bg-white` in `components/manual/gui-viewer.tsx`, and `bg-white` / `text-slate-600` in the drawing placeholder in `components/manual/manual-workspace.tsx`. These files were not modified for this feature. Newly changed workspace styling uses semantic Cove tokens. PDF/manual unit coverage is not a claim that a new real-HQ PDF upload or every assessment screen was manually re-tested in this change.

## Browser classroom evidence

The final Chromium workflow uses three independent contexts for OS Manager, Team Lead, and Student in one isolated academy:

1. Before assignment, the Manager's roster and written-review requests are denied.
2. The Student submits a written explanation through the real API.
3. The Team Lead's teacher picker includes the Manager; assigning them succeeds without editing OS identity fields.
4. The assigned Manager publishes 90/100 feedback; the Student's authenticated result contains that feedback.
5. A different unassigned class and the unassigned Team Lead remain denied.
6. A stale Teacher-mode cookie leaves the Manager identity/overview and My classes link intact; the account menu has no role-mode radio choices.
7. The Manager sees View solution, Tutoring, and Edit together in the shared activity. Tutoring shows only assigned students/classes.
8. Explicit live Edit mode is confirmed by the server. The Manager changes the code to `print(40 + 2)` and the Student editor receives it.
9. Running the inspected code produces `42` in the Manager's local output.
10. Desktop and 390-pixel mobile screenshots are captured. The selected student's full name fits, the code/edit controls remain available, and the page has no horizontal overflow.
11. Removing the assignment revokes roster, student-context, written-review, and open live-edit access while primary role stays Manager.
12. Manager self-assignment restores assigned teaching. A Student cannot perform the assignment operation.

Screenshot artifacts, ignored by Git:

- `test-results/dlab-sso-Manager-and-Team--4111d-ed-only-by-real-assignments/manager-unified-tutoring.png`
- `test-results/dlab-sso-Manager-and-Team--4111d-ed-only-by-real-assignments/manager-unified-tutoring-mobile.png`
- Elice reference: `/tmp/cove-unified-workspace/elice-reference.jpg`.

## Repeat locally and release

For an isolated repeat, run `pnpm test:dlab`. It provisions its own loopback database/services; never substitute production connection strings. It exits after testing and is not the persistent manual-development server.

For the existing manual environment, build shared packages, restart API/Studio with the configured development environment, sign out, and start a fresh flow at `http://localhost:3000/sso/start`. First/repeated login reconciles that person's derived roles. Use the actual verified OS role and existing campus mapping; the account's display label does not define its source role.

As Manager, open the administrative Classes screen and assign yourself, or have a Team Lead choose you as homeroom/assistant teacher. Open My classes and the shared course activity. View solution/Tutoring/Edit coexist without changing role. Check another unassigned class is absent from teaching, remove the assignment, and verify access disappears. Ordinary local accounts keep their explicit grants; a local Manager who teaches still needs a held Teacher role and assignment.

Production requires the coordinated image/backfill/fresh-session procedure in the [SSO runbook](../operations/dlab-sso.md#candidate-inherited-staff-roles-and-unified-workspace). The previously deployed single-role API rejects the new extra roles; do not deploy mixed policies or roll back images alone after backfill. No deployment or hosted-data backfill was performed here. Real HQ credentials/session reuse and HQ staff shortcut placement remain separate external acceptance steps; the local provider double does not certify them.
