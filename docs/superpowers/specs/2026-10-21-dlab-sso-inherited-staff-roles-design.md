# DLAB SSO staff inheritance and unified staff workspace

> Policy update (2026-10-22): the assigned-only Manager and Team Lead restrictions below are superseded by [academy-wide teaching access for Managers and Team Leads](2026-10-22-team-lead-academy-teaching-access-design.md). Teachers still require actual assignments.

Date: 2026-10-21 (Asia/Seoul)
Branch: `feat/dlab-os-staff-sso`
Baseline: `1e7307b4`; production code release `v2.0.38` (`cb793465`).
Status: Implemented on the feature branch. [Isolated API/browser/build verification](../../research/2026-10-21-dlab-unified-staff-workspace-verification.md) passed. Production deployment, hosted-data backfill, and real HQ acceptance are separate and have not been performed for this change.
Amendment: The owner's Elice screenshot/request replaces role-switching with direct capability-based actions. Their subsequent clarification requires assigned-class teaching scope for Managers as well as Team Leads and Teachers; Manager status alone grants no academy-wide tutoring access.

## 1. Result in plain English

One DLAB OS account can manage an academy and teach without signing in again or creating another Cove account.

- Manager has Manager, Team Lead, and Teacher capabilities.
- Team Lead has Team Lead and Teacher capabilities.
- Teacher has Teacher capabilities.
- Student remains a separate role.
- Platform Admin remains a separate platform authority.

For example, an OS `lab_head` enters Cove as Manager. They assign themselves to a class, or a Team Lead assigns that Manager as its homeroom/assistant teacher. The Manager opens that class's activity, views its solution, edits the lesson where permitted, opens Tutoring, and reviews an enrolled student's work or helps edit their live code. They remain Manager throughout, with no role switch or second login. Their teaching list contains their assigned classes only.

The staff workspace exposes all authorized actions together, like the supplied Elice example. Derived roles are internal grants, not modes the user must activate. This changes the first draft's requirement to switch to Teacher before teaching. It does not promise every Elice feature, an identical interface, cross-academy authority, or student impersonation.

## 2. Decision and alternatives

**Selected: derive staff grants from one verified OS role, retain the existing membership-role storage, and expose their capabilities in one unified staff workspace.** Managers, Team Leads, and Teachers all need genuine class assignments for teaching, tutoring, grading, and live monitoring. Higher staff authority does not bypass this requirement.

This reuses one primary `AcademyMembership.role`, additional `AcademyMembershipRole` rows, union-based authorization, the shared course/workspace, staff practice, solution dialog, tutoring drawer, and live editor. It replaces role-dependent operating modes with server-derived actions and scope. Primary role still identifies the person and selects the default overview; it does not hide otherwise permitted work.

Alternatives considered:

1. Make users switch among Manager, Team Lead, and Teacher views. Reuses the old interface but conflicts with the owner's clarified request to act directly inside the activity.
2. Replace all permissions with a global role-rank comparison or manually add roles after login. The former broadens unrelated access; the latter conflicts with managed synchronization. Neither is needed. Keep explicit capabilities and scope instead.

No new role names, OS credentials, or OS database access are needed. This is a Cove authorization/provisioning change; the agreed OS-to-Cove primary-role translation remains unchanged.

## 3. Evidence and existing constraints

Relevant implementation:

- `packages/shared/src/integrations/dlab/policy.ts`: exact OS-to-primary-role mapping and campus-scope policy.
- `packages/shared/src/auth/roles.ts`: existing staff role sets, permissions, primary-role selection, and student exclusivity.
- `packages/api/src/integrations/dlab/dlab-reconciler.service.ts`: currently removes every extra role while reconciling managed memberships.
- `packages/api/src/integrations/dlab/dlab-policy.service.ts`: currently requires the mapped primary role and zero extra roles for managed eligibility.
- `packages/api/src/authorization/membership-roles.ts`: membership and query helpers that recognize additional roles.
- `packages/api/src/classes/assigned-class-access.ts`: teaching access requires a held Teacher role and an eligible class assignment.
- `packages/api/src/classes/classes.service.ts`: teacher-assignment queries already use `holdsRoleWhere('TEACHER')` in relevant paths.
- `packages/web/src/lib/academy-view-role.ts`: the selected view changes presentation; the API authorizes the union of held roles.
- `packages/api/src/learn/learn.service.ts`: returns workspace capabilities such as authoring, solutions, and observation; its assigned-student flag currently depends on holding Teacher.
- Exercise `staff-workspace.tsx` and `staff-tutoring-drawer.tsx`: already render solution/tutoring/edit actions together, but roster access is gated by assigned-teacher behavior.
- `packages/api/src/monitoring/monitoring-access.service.ts`: gates HTTP and socket monitoring; its existing platform/support academy scope is read-only and cannot simply be reused for Manager live editing.
- `packages/api/prisma/migrations/20261021100000_dlab_staff_sso/migration.sql`: managed extra-role writes are allowed only through transaction-local `cove.dlab_sync` source writes.

Manager already has Team Lead permissions, but neither role automatically holds Teacher. Some teaching features explicitly require Teacher membership, not only a permission string. Ordinary Cove accounts can already hold multiple staff roles. The current SSO single-role invariant prevents that behavior for managed accounts.

The Elice reference at `https://dlab.elice.io/courses/765886/lectures/all`, inspected on 2026-10-21, showed the owner's Manager role with lecture creation, content management, and member-management controls. This supports the requested interaction model; inspecting that page does not establish Elice's complete internal authorization policy.

The supplied follow-up screenshot shows View Solution, Tutoring, Edit, a selected person's code pane, and a separate Edit mode switch. It clarifies that the requested parity is direct activity actions, including explicit live-code help, rather than switching the account's role from the top corner. The screenshot does not establish access to unrelated classes. The owner's later clarification explicitly restricts Manager teaching to assigned classes.

This design changes the single-role sections of the [automatic student/staff SSO design](2026-10-21-dlab-os-automatic-student-staff-sso-design.md) only when implemented and released. Existing production behavior remains single-role until that cutover. The [ordinary multi-role design](2026-09-03-student-accounts-and-role-switching-design.md) remains the storage/permission foundation; its role-switching UI is superseded for the unified academy staff flow. Extend the existing [shared workspace design](2026-10-20-shared-course-workspace-role-behavior-design.md) instead of building another code editor. Existing assigned-class tutoring boundaries and platform/support restrictions remain intact.

## 4. Authoritative role table

Store the raw OS `user_role` unchanged on `DlabIdentity`. Derive the following exact role sets in every approved mapped campus:

| OS role | Primary academy role | Additional academy roles | Platform role |
| --- | --- | --- | --- |
| `student` | `STUDENT` | None | `USER` |
| `tutor` | `TEACHER` | None | `USER` |
| `instructor` | `TEAM_LEAD` | `TEACHER` | `USER` |
| `so_staff` | `TEAM_LEAD` | `TEACHER` | `USER` |
| `edu_manager` | `TEAM_LEAD` | `TEACHER` | `USER` |
| `lab_head` | `MANAGER` | `TEACHER`, `TEAM_LEAD` | `USER` |
| `hq_admin` | No active academy role | None | `ADMIN` |
| Unknown code | Existing `STUDENT` fallback | None | `USER` |

The latest owner-approved image controls this translation: `instructor` maps to Team Lead, despite older notes that mapped it to Teacher. Email addresses, names, translated dashboard labels, URL parameters, and frontend cookies never determine grants.

Unknown-code scope restrictions and HQ Admin admission remain as currently implemented. In particular, unknown codes receive no staff inheritance, and HQ Admin does not acquire a student membership or staff-role rows through this feature. Existing platform inspection/support behavior is unchanged.

## 5. Shared policy boundary

Extend the existing shared DLAB policy with one pure helper that returns the canonical held academy roles for a source role. Reuse the current role ordering (`TEACHER`, `TEAM_LEAD`, `MANAGER` for staff), deduplication, and primary-role selection rather than creating another rank table.

Both reconciliation and eligibility must consume this policy. The primary helper must agree with the highest role in the derived set. HQ Admin returns an empty academy-role set; platform authority is evaluated separately.

For an active managed binding, the invariant is:

1. Primary role equals the expected primary role.
2. Additional roles equal the expected set minus that primary role.
3. No extra, missing, or stale grants exist.
4. Account status, binding status, local restrictions, campus approval, academy activity, and session generation pass existing checks.

Compare sets independently of database row order. Do not merely accept any combination of staff roles. A tutor with an unexpected Manager grant, or a lab head missing a required derived role, fails eligibility until authorized reconciliation repairs it.

Do not implement a fallback that treats a policy mismatch as an ordinary/local membership or skips managed session validation.

## 6. Reconciliation and identity lifecycle

Within the existing integration lock and source-write transaction:

1. Derive the desired roles from the current accepted source identity.
2. Preserve user, auth-user, membership, and binding IDs.
3. Compute the role difference and replace additional roles with the exact desired set when a difference exists.
4. Update primary role and active/suspended status using existing restriction ownership rules.
5. Keep the operation idempotent: unchanged source and role sets must not cause repeated role rewrites or people-directory revision bumps.
6. Preserve existing source-change generation invalidation and socket notifications. Audited operator reconciliation must also invalidate pre-change managed sessions.
7. Record changed role sets through existing integration/audit events with before/after roles and source/operator context; exclude credentials, callback codes, and session tokens. No-op reconciliation must not generate repeated role-change events.

Use this path for first login, repeated login, authenticated source updates, campus-access changes, local restoration, and operator backfill. Do not add a second login-only implementation that leaves already provisioned users inconsistent.

Examples:

| Change | Result |
| --- | --- |
| `lab_head` → `edu_manager` | Primary becomes Team Lead; Teacher retained; Manager removed |
| `edu_manager` → `tutor` | Primary becomes Teacher; Team Lead removed |
| `tutor` → `lab_head` | Same membership becomes Manager with Team Lead and Teacher grants |
| Any staff role → `student` | All staff grants removed; existing student provisioning rules apply |
| Staff → unknown code | Existing narrow Student fallback; all staff grants removed |
| `lab_head` → `hq_admin` | Existing HQ transition retires active academy bindings; no inherited staff membership remains active |
| `hq_admin` → `lab_head` | Platform Admin removed; eligible campus memberships become the derived Manager role set |

No demotion may preserve a revoked Manager role merely because it was the academy's last Manager. Retain the existing manager-required event and recovery procedure.

Deactivation, local suspension, campus removal, and disabled campus mappings deny access as before. Historical class assignments, submissions, grades, audit records, and suspended bindings are retained. Reactivation must follow existing source/local restriction rules; it must not clear an unrelated local suspension.

## 7. Teaching capability and class scope

Having Teacher in the derived role set makes an active SSO Manager or Team Lead eligible to be selected as a class teacher. A real homeroom/assistant assignment is required for their teaching list, tutoring, student answer review, grading, and live-code help.

| Actor | Tutoring, answer review, grading, and monitoring scope |
| --- | --- |
| Manager holding inherited or explicitly granted Teacher | Assigned homeroom/assistant classes only |
| Team Lead holding inherited or explicitly granted Teacher | Assigned homeroom/assistant classes |
| Teacher | Assigned homeroom/assistant classes |
| Student | Own learning and records only; no tutoring |
| Platform/support actor | Existing separate inspection/support policy; no new live editing authority |

- Reuse role-set-aware teacher candidate queries, homeroom assignment, assistant assignment, and assigned-class predicates.
- A Manager may assign themselves through existing class-teacher management permission. A Team Lead may assign an eligible Manager to a class; selecting the Manager must not fail merely because their primary role is not Teacher.
- Team Leads retain their existing class-teacher management permission, including self-assignment when otherwise eligible.
- A Teacher without class-teacher management permission cannot self-assign by changing a cookie or request payload.
- Teaching lists, tutoring, student-level teaching analytics, answer review, grading, and live monitoring are assignment-bound for every academy staff role. Manager authority alone must not expose another teacher's students through those surfaces.
- Administrative class/teacher-assignment screens and academy-management analytics keep their existing separate permissions. An administrative list needed to assign a teacher must not become a route to unassigned student drafts or teaching records. It does not populate the staff member's My classes/Tutoring list.
- Preserve active-class, student enrollment, material/course relationship, feature-flag, local restriction, and source-eligibility checks. Academy-wide tutoring does not make an unrelated material available to the selected student.
- Cross-academy classes remain inaccessible unless the source identity has a separate eligible binding for that academy.

Resolve teaching access through active held Teacher membership and genuine assignments for Manager, Team Lead, and Teacher alike. Use the same assigned-class scope in class/roster queries, progress/answer/grade APIs, live-watch authorization, and every socket command. Never accept scope from a client field or infer it from a view cookie. Existing platform/support inspection remains a separate policy and grants no new live writes.

Audit teacher-only consumers for primary-role comparisons. Recognize Teacher in a Manager's/Team Lead's held role set while preserving assignment checks. Reuse existing predicates instead of adding a Manager scope bypass or accepting every staff role in `roleCanMonitor`.

Removing a homeroom/assistant assignment revokes that class's teaching access, including open watches/edit sessions, even if the user remains Manager. Revalidate on source, local restriction, assignment, and scope changes using existing session-generation and socket backstops. A source-demoted staff member may retain teaching only after valid reauthorization and only if they still hold Teacher and a genuine assignment. Existing help-request notification routing stays unchanged.

Class assignment is an academy operation, not an edit to OS-managed identity fields. Allow legitimate class assignments while retaining the prohibition on locally changing the managed user's identity, source role, credentials, or derived grant set.

## 8. Studio behavior

### 8.1 One identity and navigation

Use one academy staff interface. A Manager remains labelled Manager; a Team Lead remains Team Lead. Build navigation and workspace actions from the union of held permissions and server tutoring scope. Do not require an academy role picker to reveal teaching, curriculum, or management actions.

The primary role selects the default overview. Navigation includes permitted management sections and teaching/tutoring destinations together. My classes and tutoring class choices show assigned classes only for Managers, Team Leads, and Teachers. Preserve separate administrative assignment screens where existing management permissions allow them; they must not imply teaching access.

Retire the ordinary academy staff role selector as an operating-mode control. Ignore/expire the old `cove_academy_role` selection for this unified layout; old bookmarks and stale Teacher/Team Lead cookies must not hide Manager controls or grant unavailable actions. Keep the account menu, academy switcher, and platform/support role-inspection controls, which serve different purposes. Direct teaching URLs use the same capability/scope policy as activity buttons.

### 8.2 Activity actions, like the Elice example

- View solution opens the existing authorized reference-solution dialog.
- Edit opens the existing content-authoring route, with Return to activity; it edits instructions/starter code/tests/settings under existing authoring permissions.
- Tutoring opens the existing student drawer in the activity. Manager, Team Lead, and Teacher receive only their assigned classes and eligible enrolled students for the current course.
- Student selection changes the inspected code/work pane while keeping the activity, material navigator, and PDF visible. Name and class context identify whose work is shown.
- Feedback and grading use the selected student's authorized record and retain the actual staff actor for attribution.
- Run/Submit in personal practice use the existing isolated staff-practice model, preserving student scores and points.
- Existing share, materials, Previous/Next, fullscreen, and editor features remain available according to their existing capabilities. Reuse them; no parallel workspace or duplicate sharing engine is introduced.

Show permitted actions together on the initial page without a role switch. A Manager gets View solution, Tutoring, and Edit. A Team Lead gets existing authoring/solution actions plus assigned teaching. A Teacher gets solutions/tutoring within their scope; this request does not grant Teachers curriculum-management writes. Student does not receive staff actions.

### 8.3 Editing a student's code

Edit content and Edit student code are different operations. Tutoring first opens the selected draft read-only. Reuse the existing explicit live Edit mode handshake, synchronization, presence, reconnect behavior, and server-confirmed write authorization. Enable student-code editing only when the selected student is live on that material and the existing collaboration prerequisites pass; show a clear reason when they do not.

An authorized Manager can use this live-edit mode only for an eligible student in their assigned class, just like an assigned Team Lead or Teacher. Reconnect/student changes reset edit mode to read-only. Every write remains subject to current assignment and scope. Student history/submitted snapshots are immutable; live edits affect the draft and are attributed to staff. Tutoring does not grant a student login session or silently submit a graded answer as the student. Execution commands follow the existing tutoring protocol, not the personal staff-practice save path.

Returning to personal practice restores the Manager's own code. Entering content authoring must not overwrite the student's draft, copy their code into starter code, or lose the personal practice buffer. Query caches and socket subscriptions must be separated by actor, academy, class, student, and material as appropriate, and cleared/revalidated on identity or scope changes.

### 8.4 Directory and empty states

Show the primary role prominently and identify inherited grants as derived from DLAB OS when shown. Do not expose editable role checkboxes for managed accounts. Use existing Korean/English translation patterns for new copy.

Role filters and teacher-assignment lists recognize inherited Teacher membership. A member may match multiple role filters, but total member counts count the person once. A Manager with no teaching assignment sees an empty My classes/Tutoring list, with guidance to assign themselves or ask a Team Lead to assign them. Do not show all academy students, a Student dashboard, or a request to switch role.

No automatic switch to Teacher, separate login, second user record, separate academy membership, or student inactivity lease is introduced for staff.

## 9. Data and backward compatibility

Use existing `AcademyMembershipRole` rows and existing source-write database guards. No schema migration is expected: the existing guard already allows integration-controlled insert/update/delete and rejects ordinary managed-role mutations. Verify this with integration tests before declaring a migration unnecessary.

The security model is unchanged: OS controls the source role and campus scope; Cove derives the agreed permissions. Local administrators cannot add or remove derived roles through ordinary member-management endpoints, bulk operations, platform edits, or direct unmarked database writes.

Ordinary username/password and social accounts keep their existing explicitly granted role sets. The unified UI applies consistently to ordinary and SSO staff, and all teaching remains assignment-bound. It does not add stored roles to ordinary users. A legacy Manager needs an explicitly held Teacher role and assignment as before; SSO derives the Teacher role automatically. Do not convert ordinary accounts to OS identities, merge accounts by email/name, or modify Mapo membership grants during backfill.

No additional environment variable, client registration, key rotation, callback URL, OS host change, or inbound API contract change is required. Retain `https://os.dlabcampus.com/v1`, the existing callback, and the existing campus rollout configuration.

## 10. Implementation boundaries

| Area | Responsibility |
| --- | --- |
| Shared DLAB policy | Exact deterministic primary/held role derivation |
| DLAB reconciler | Idempotent persisted roles and source-driven transitions |
| DLAB policy service | Exact role-set eligibility with existing status/scope/session checks |
| Auth/account response | Return all held roles through the existing role-set contract |
| Class/teaching/monitoring authorization | Recognize held Teacher roles and enforce assignments consistently across HTTP and sockets for every staff role |
| Shared workspace capabilities | Return authoring/solution/assigned-tutoring capabilities from held grants; Manager rank never means all-class tutoring |
| Studio navigation/directory | Unified permitted actions, primary-role identity, managed grant provenance, and obsolete view-cookie handling |
| Existing workspace/tutoring/editor | Reuse solution/edit actions, scoped roster, read-only inspection, explicit live-edit handshake, and separate staff practice |
| Operator tool/runbook | Preview, backfill, invalidate, verify, and roll back existing managed identities |

Prefer focused changes to these existing boundaries. Do not redesign SSO code exchange, introduce a second permission engine, or broaden class access. Platform/support monitoring authority remains separate. Before any Next.js code changes, read the relevant installed guides required by `AGENTS.md`.

## 11. Acceptance tests

Extend the existing `pnpm test:dlab` disposable-database/provider-double suite and `e2e/specs/dlab-sso.spec.ts`. Automated OS doubles establish Cove behavior, not HQ's actual account roles or main-site session reuse.

### Shared and database tests

- All seven OS codes and unknown fallback produce the exact primary, additional, and platform roles above.
- First login provisions the exact role set; repeated login reuses IDs and does not accumulate grants.
- An existing deployed single-role Manager/Team Lead becomes multi-role through audited reconciliation without losing history.
- Promotion, demotion, staff/student transitions, and HQ Admin transitions remove obsolete privileges and invalidate old sessions.
- Missing expected roles and unexpected elevated roles fail eligibility; arbitrary extras are not silently accepted.
- Source version conflicts/stale updates cannot restore removed grants.
- Local suspension, inactive source, campus disable/removal, and wrong-campus requests remain denied.
- Managed role changes remain blocked through ordinary API, bulk, platform, and database paths; transaction-local integration writes succeed.
- Ordinary account role sets and existing login options are unchanged.
- Manager teaching access requires an active held Teacher role, genuine class assignment, and managed eligibility; cookies, forged scope fields, and platform/support inspection cannot bypass those requirements.
- Assignment removal revokes an open live-edit watch even while Manager status remains. Source demotion removes management rights and requires reauthorization before any retained assigned teaching access.
- HTTP roster/review/grading gates and socket watch/edit gates agree. Tutor scope never bypasses student enrollment, course/material association, or live-monitoring feature flags.

### Browser workflow tests

1. Sign in as an OS Manager; verify Manager remains the identity and management/teaching actions are available together, with no role-selection step.
2. Create a test class and attach a course containing coding, quiz, short-answer, and PDF activities using existing workflows.
3. Keep a class assigned to another teacher. Verify the unassigned Manager cannot see it in My classes/Tutoring or access its students' answers/live drafts by direct URL/API/socket. Sign in as Team Lead and assign the Manager as homeroom/assistant teacher; verify the Manager is selectable despite their primary role.
4. Select an eligible student in that class, review their answer, and save feedback/manual grading. Verify the student later sees the result.
5. Verify Manager monitoring/live editing in the now-assigned class, default read-only mode, server-confirmed edit mode, synchronized draft updates, reconnect reset, and denial for another unassigned class and a different academy.
6. Return to personal practice and content editing; verify each code buffer, starter code, and submitted snapshot stays separate. Manage curriculum/classes and academy settings without changing role. Refresh and stale old view cookies preserve the unified capability set.
7. Repeat with an OS Team Lead: authoring and assigned teaching actions coexist; manager-only settings/member operations and unassigned-class tutoring remain denied.
8. Repeat with an OS Teacher: assigned teaching works; role self-promotion, class self-assignment, and management operations remain denied.
9. Sign in as Student: see only assigned learning, submit work, and receive the saved grade/feedback; no staff view is available.
10. Remove a Manager's assignment during an open live-edit session; verify access is revoked while their role stays Manager. Separately demote the Manager's source role; verify old sessions lose access and fresh login has only the newly derived roles and assigned scope.
11. Verify ordinary Mapo Manager/Teacher/Student logins and explicit grants remain valid. A local Manager gets direct authorized actions; a legacy view cookie is not required to reveal them.
12. Verify a Manager can assign themselves to a different class through the authorized assignment screen and then access only its eligible teaching records. Repeat assistant assignment and removal. A plain Teacher cannot self-assign.

Use isolated test data for creation/grading checks. Test PDF/coding/quiz/short-answer access here as integration regressions; unrelated activity UI redesign or grading-engine work is outside this feature.

## 12. Rollout and rollback

The old runtime rejects additional managed roles. Deploying mixed old/new API workers or reverting only an image after backfill can deny managed access. Plan the policy/data cutover together.

1. Pass the isolated suite, relevant legacy authorization/UI tests, type/lint/build checks, and deployment validation on the exact candidate commit.
2. Demonstrate the full Manager and Team Lead workflows locally; collect a real HQ fixture for any source role not yet observed. Record returned source codes without credentials/tokens.
3. Capture a bounded private before-state of managed IDs, roles, generation, mappings, restrictions, class assignments, and unaffected legacy account counts. Retain a local recovery operator.
4. Temporarily disable new SSO entry; deploy matching API/Studio/worker images through the existing deployment guide. Keep campus approvals unchanged.
5. Preview and apply the existing audited reconciliation/session-invalidation command under the new runtime. Verify it derives the exact roles for existing managed identities and preserves IDs/restrictions/history.
6. Re-enable SSO entry, require fresh managed login, and test actual Manager/Team Lead unified actions, assignment by self/Team Lead, unassigned-class denial, explicit live editing, assignment removal, teacher review, Student access, campus isolation, and ordinary login.
7. Record actual test outcomes and unverified external dependencies; do not label mock-provider coverage as real HQ acceptance.

For rollback, disable new SSO entry and invalidate managed sessions using a compatible runtime. Restore the previous exact single-role policy and reconcile managed extra-role rows under an integration source-write transaction before re-enabling the previous single-role API. Preserve IDs, assignments, restrictions, and history; do not replay a blind full-database backup or remove managed-account guards. Validate a matched policy/data state before enabling login again.

## 13. HQ dependencies and exclusions

HQ does not need to issue multiple credentials/role codes per person for this change. It must continue to provide the correct verified `user_role`, active status, and allowed campus IDs. Do not equate a test account's email or the phrase “team leader” with a particular source code.

Separate HQ work remains: expose the Cove link at `https://cs.coveedu.com/sso/start` for staff, and verify main OS session reuse in `/v1/sso/authorize`. Cove role inheritance cannot fix the OS `/hub` redirect, add a staff shortcut to OS, or eliminate an OS-owned account chooser.

Also excluded: automatic class/teacher import from OS, full course/enrollment API synchronization, automatic academy creation, account linking with existing local users, student impersonation, cross-application logout, and a new permission editor.

## 14. Completion criteria

This feature is complete when a verified OS Manager can directly use management, curriculum, solution, tutoring, grading, and explicit live-code-edit actions without switching roles, with all teaching/student-work access restricted to genuinely assigned classes; a Team Lead can assign a Manager and directly use curriculum and their own assigned teaching actions; assignment removal and source demotion revoke access correctly; Student/Admin separation and campus restrictions hold; ordinary account grants/login remain valid with the unified UI; and the matched policy/data rollout is documented with real and automated evidence distinguished.

The feature branch implements this design; the previously deployed single-role SSO does not provide it until the coordinated release/backfill completes.
