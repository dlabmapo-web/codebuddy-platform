# DLAB SSO staff role inheritance

Date: 2026-10-21 (Asia/Seoul)
Branch: `feat/dlab-os-staff-sso`
Baseline: `1e7307b4`; production code release `v2.0.38` (`cb793465`).
Status: Written for owner review. Implementation, deployment, and acceptance testing have not started for this change.

## 1. Result in plain English

One DLAB OS account can manage an academy and teach without signing in again or creating another Cove account.

- Manager has Manager, Team Lead, and Teacher capabilities.
- Team Lead has Team Lead and Teacher capabilities.
- Teacher has Teacher capabilities.
- Student remains a separate role.
- Platform Admin remains a separate platform authority.

For example, an OS `lab_head` enters Cove as Manager, creates a class, assigns themselves as its teacher, switches to the Teacher view, and reviews that class's answers. Switching back to Manager restores the management navigation without another login. Their account, academy membership, class assignment, and history remain the same records.

This matches the Elice-style staff behavior requested by the owner, using Cove's existing role switcher and design. It does not promise Elice feature parity, an identical interface, automatic assignment to every class, or student impersonation.

## 2. Decision and alternatives

**Selected: derive multiple Cove staff roles from one verified OS role, and store them through the existing membership-role model.** The owner accepted this direction in the conversation preceding this specification.

This reuses the system already implemented for ordinary Cove members: one primary `AcademyMembership.role`, additional `AcademyMembershipRole` rows, union-based authorization, and a per-academy role-view switcher.

Alternatives considered:

1. Introduce a global hierarchy in every authorization check. This would change ordinary Cove account behavior and require broad changes to teaching and assignment queries. It is unnecessary for this SSO requirement.
2. Manually grant additional roles after SSO login. Existing managed-account reconciliation removes those grants, and manual grants could survive source demotion if protection were relaxed. This would not provide automatic new-user access.

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
- `packages/api/prisma/migrations/20261021100000_dlab_staff_sso/migration.sql`: managed extra-role writes are allowed only through transaction-local `cove.dlab_sync` source writes.

Manager already has Team Lead permissions, but neither role automatically holds Teacher. Some teaching features explicitly require Teacher membership, not only a permission string. Ordinary Cove accounts can already hold multiple staff roles. The current SSO single-role invariant prevents that behavior for managed accounts.

The Elice reference at `https://dlab.elice.io/courses/765886/lectures/all`, inspected on 2026-10-21, showed the owner's Manager role with lecture creation, content management, and member-management controls. This supports the requested interaction model; inspecting that page does not establish Elice's complete internal authorization policy.

This design changes the single-role sections of the [automatic student/staff SSO design](2026-10-21-dlab-os-automatic-student-staff-sso-design.md) only when implemented and released. Existing production behavior remains single-role until that cutover. The [ordinary multi-role design](2026-09-03-student-accounts-and-role-switching-design.md) remains the basis for UI and authorization.

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

Having Teacher in the derived role set makes an active SSO Manager or Team Lead eligible to be selected as a class teacher. It does not assign that person automatically.

- Reuse role-set-aware teacher candidate queries, homeroom assignment, assistant assignment, and assigned-class predicates.
- A Manager or Team Lead may assign themselves through their existing class-teacher management permission.
- A Teacher without class-teacher management permission cannot self-assign by changing the view or request payload.
- Teacher views, manual grading, answer review, student analytics, live monitoring, and help requests retain their existing class-assignment boundaries.
- Staff who can manage academy-wide classes keep those management permissions; switching to Teacher does not expand assigned teaching data to every class.
- Cross-academy classes remain inaccessible unless the source identity has a separate eligible binding for that academy.

Audit teacher-only consumers for comparisons against the primary role alone. Change only the consumers needed to recognize a held Teacher role, using the existing shared/query helpers. Do not replace assignment checks with a role-rank comparison.

Class assignment is an academy operation, not an edit to OS-managed identity fields. Allow legitimate class assignments while retaining the prohibition on locally changing the managed user's identity, source role, credentials, or derived grant set.

## 8. Studio behavior

Reuse the existing academy role switcher:

- Manager: Manager, Team Lead, and Teacher views.
- Team Lead: Team Lead and Teacher views.
- Teacher: Teacher view only.
- Student: Student view only.
- HQ Admin: existing platform console and existing platform inspection controls.

Default to the existing valid saved view for that academy; otherwise use the primary role. A saved view no longer held after demotion must fall back safely to the new primary role. Preserve independent academy selection and its campus eligibility checks.

View selection does not grant, revoke, or narrow API permissions. A Manager viewing Teacher still holds management permissions, as in ordinary multi-role Cove accounts. The view determines navigation and overview presentation only.

Show the primary role prominently in directories and identify inherited staff roles as derived from DLAB OS when additional roles are displayed. Do not expose editable role checkboxes for managed accounts. Use existing Korean/English translation patterns for any new copy.

Role filters and teacher-assignment lists must recognize inherited Teacher membership. A member may match more than one role filter, but an unfiltered people list or total member count must count the person once. A Manager with no assigned class sees the Teacher empty state, not a Student dashboard.

No automatic switch to Teacher, separate login, second user record, separate academy membership, or student inactivity lease is introduced for staff.

## 9. Data and backward compatibility

Use existing `AcademyMembershipRole` rows and existing source-write database guards. No schema migration is expected: the existing guard already allows integration-controlled insert/update/delete and rejects ordinary managed-role mutations. Verify this with integration tests before declaring a migration unnecessary.

The security model is unchanged: OS controls the source role and campus scope; Cove derives the agreed permissions. Local administrators cannot add or remove derived roles through ordinary member-management endpoints, bulk operations, platform edits, or direct unmarked database writes.

Ordinary username/password and social accounts keep their existing explicitly granted role sets. Do not automatically expand all legacy Managers or Team Leads, convert ordinary accounts to OS identities, merge accounts by email/name, or modify Mapo memberships during the backfill.

No additional environment variable, client registration, key rotation, callback URL, OS host change, or inbound API contract change is required. Retain `https://os.dlabcampus.com/v1`, the existing callback, and the existing campus rollout configuration.

## 10. Implementation boundaries

| Area | Responsibility |
| --- | --- |
| Shared DLAB policy | Exact deterministic primary/held role derivation |
| DLAB reconciler | Idempotent persisted roles and source-driven transitions |
| DLAB policy service | Exact role-set eligibility with existing status/scope/session checks |
| Auth/account response | Return all held roles through the existing role-set contract |
| Class/teaching authorization | Accept eligible held Teacher roles while enforcing assignment scope |
| Studio role switcher/directory | Display derived views and managed grant provenance |
| Operator tool/runbook | Preview, backfill, invalidate, verify, and roll back existing managed identities |

Prefer focused changes to these existing boundaries. Do not redesign SSO code exchange, introduce a second permission engine, or broaden global role permissions for this feature. Before any Next.js code changes, read the relevant installed guides required by `AGENTS.md`.

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

### Browser workflow tests

1. Sign in as an OS Manager; verify Manager is primary and all three staff views are available.
2. Create a test class and attach a course containing coding, quiz, short-answer, and PDF activities using existing workflows.
3. Assign the Manager as a homeroom/assistant teacher; verify they appear in teacher choices despite their primary Manager role.
4. Switch to Teacher without another login; open the assigned class, review a student submission, and save feedback/manual grading.
5. Verify monitoring/help access for the assigned class and denial for an unassigned class and a different academy.
6. Switch to Team Lead to manage curriculum/classes, then back to Manager for academy settings. Refresh preserves a valid selected view.
7. Repeat with an OS Team Lead: Team Lead and Teacher views work; Manager view and manager-only settings/member operations remain denied.
8. Repeat with an OS Teacher: assigned teaching works; role self-promotion, class self-assignment, and management operations remain denied.
9. Sign in as Student: see only assigned learning, submit work, and receive the saved grade/feedback; no staff view is available.
10. Demote an account with a saved higher view and open teacher socket/session; verify old sessions lose access and fresh login has only the newly derived roles.
11. Verify ordinary Mapo Manager/Teacher/Student logins and existing explicitly granted role switching still work.

Use isolated test data for creation/grading checks. Test PDF/coding/quiz/short-answer access here as integration regressions; unrelated activity UI redesign or grading-engine work is outside this feature.

## 12. Rollout and rollback

The old runtime rejects additional managed roles. Deploying mixed old/new API workers or reverting only an image after backfill can deny managed access. Plan the policy/data cutover together.

1. Pass the isolated suite, relevant legacy authorization/UI tests, type/lint/build checks, and deployment validation on the exact candidate commit.
2. Demonstrate the full Manager and Team Lead workflows locally; collect a real HQ fixture for any source role not yet observed. Record returned source codes without credentials/tokens.
3. Capture a bounded private before-state of managed IDs, roles, generation, mappings, restrictions, class assignments, and unaffected legacy account counts. Retain a local recovery operator.
4. Temporarily disable new SSO entry; deploy matching API/Studio/worker images through the existing deployment guide. Keep campus approvals unchanged.
5. Preview and apply the existing audited reconciliation/session-invalidation command under the new runtime. Verify it derives the exact roles for existing managed identities and preserves IDs/restrictions/history.
6. Re-enable SSO entry, require fresh managed login, and test actual Manager and Team Lead view switching, class assignment, teacher review, Student access, campus isolation, and ordinary login.
7. Record actual test outcomes and unverified external dependencies; do not label mock-provider coverage as real HQ acceptance.

For rollback, disable new SSO entry and invalidate managed sessions using a compatible runtime. Restore the previous exact single-role policy and reconcile managed extra-role rows under an integration source-write transaction before re-enabling the previous single-role API. Preserve IDs, assignments, restrictions, and history; do not replay a blind full-database backup or remove managed-account guards. Validate a matched policy/data state before enabling login again.

## 13. HQ dependencies and exclusions

HQ does not need to issue multiple credentials/role codes per person for this change. It must continue to provide the correct verified `user_role`, active status, and allowed campus IDs. Do not equate a test account's email or the phrase “team leader” with a particular source code.

Separate HQ work remains: expose the Cove link at `https://cs.coveedu.com/sso/start` for staff, and verify main OS session reuse in `/v1/sso/authorize`. Cove role inheritance cannot fix the OS `/hub` redirect, add a staff shortcut to OS, or eliminate an OS-owned account chooser.

Also excluded: automatic class/teacher import from OS, full course/enrollment API synchronization, automatic academy creation, account linking with existing local users, student impersonation, cross-application logout, and a new permission editor.

## 14. Completion criteria

This feature is complete when a verified OS Manager can use Manager, Team Lead, and assigned Teacher workflows on the same Cove identity; a Team Lead can use Team Lead and assigned Teacher workflows; source demotion removes inherited privileges; Student/Admin separation and campus restrictions hold; existing local account behavior is preserved; and the matched policy/data rollout is documented with real and automated evidence distinguished.

Until then, this document describes the intended change and does not claim that the deployed single-role SSO already provides it.
