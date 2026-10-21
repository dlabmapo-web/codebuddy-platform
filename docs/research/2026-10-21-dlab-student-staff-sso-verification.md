# Automatic DLAB student/staff SSO verification

Date: 2026-10-21 (Asia/Seoul)
Branch: `feat/dlab-os-staff-sso`
Baseline: v2 `97953f494cd001dbdf9da499f47696e7e8085c1d`; approved design commit `1de1eead`.

## Result and environment

The initial automatic-account SSO verification passed the isolated database tests and 15 Chromium browser E2E cases. The owner-approved role correction below subsequently passed 16 browser cases. The browser tests run the actual Cove Nest API, Studio routes, session bridge, authorization, and role dashboards. DLAB OS and Supabase are local service doubles; this is not evidence that HQ's live registration, supplied accounts, or provider-side SQL guard work on the new domain.

The initial isolated run made no hosted changes. Later user-authorized development setup and real-HQ checks are recorded below. No production deployment, campus remapping or message to HQ was performed. Real user passwords, OS login numbers, client secrets, and inbound keys are not included in this report or fixtures. All committed test credentials are clearly local stand-ins.

Each `pnpm test:dlab` run creates a new disposable PostgreSQL/Redis pair on loopback ports, applies all 67 migrations, builds the API, runs the focused tests, then starts the real API and Studio with external-service doubles. The supplied development and production database settings are never selected as test targets. Test containers are cleaned up afterward. The initial failed fixtures were kept and stopped; no existing database was reset.

## Implemented behavior

- The fixed OS base is `https://os.dlabcampus.com/v1`; the old Render domain and arbitrary authorize origins are rejected.
- The final owner-confirmed mappings are `student → STUDENT`, `instructor/tutor → TEACHER`, `edu_manager → TEAM_LEAD`, `lab_head → MANAGER`, and `hq_admin → platform ADMIN`. The later final-mapping section supersedes the intermediate mapping recorded below.
- Other roles are stored and get only primary-campus Student fallback access. Only the exact eligible `hq_admin` source role becomes a Cove platform Admin.
- Campus mode creates or reuses accounts automatically in approved, enabled campuses. Allowlist mode remains available for controlled rollout and defaults closed.
- Staff can have multiple verified campus memberships. Removed, disabled, or unapproved campuses do not grant access, including when a stale membership row still looks active.
- Source role changes replace old permissions. Independent local suspensions survive OS reactivation. Local restoration cannot override OS, campus, or local account restrictions.
- Managed roles are marked in the people directory and cannot be edited locally. Ordinary, bulk, platform and database paths retain guards against changing managed identity ownership or granting extra roles.
- SSO activation starts the inactivity lease for students and fallback accounts, and skips it for staff. Existing password/social login routes remain available.
- Source updates and rollout commands invalidate managed session generations. New login is required after revocation/reactivation; learning history and stable user/membership IDs are preserved.

The identity snapshot uses a repeatable-read transaction. Only integration writes and activation checks acquire the shared integration advisory lock; ordinary non-managed logins do not contend on it. Provider network calls remain outside database transactions. Canonical source hashes are computed from persisted fields before version comparison, including pre-migration records.

## Automated results

| Check | Result |
| --- | --- |
| Fresh PostgreSQL migration deployment | All 67 migrations applied, including `20261021100000_dlab_staff_sso` |
| API auth, authorization, managed memberships and DLAB tests | 152 passed; isolated PostgreSQL/Redis integration suites actually ran |
| Shared DLAB policy and bulk eligibility | 44 passed |
| Studio SSO route boundary tests | 11 passed |
| Chromium browser E2E | 15 passed in 42.2 seconds |
| Translation consistency and payload budgets | 136 passed |
| Prisma schema validation | Passed |
| API production build | Passed as part of the isolated run |
| Studio production build | Passed; optimized compilation, TypeScript and route generation completed |
| API and E2E TypeScript checks | Passed after Prisma generation completed |
| Studio TypeScript | Passed separately and in the production build |
| Deployment configuration validation | Passed; mode/domain negative cases also checked |
| Targeted Studio lint | No errors; two pre-existing unused-variable warnings in the people directory |

The focused backend/shared/Studio suites total 207 passing tests; translation validation adds 136. The browser suite finished with exit code 0, and its disposable containers were cleaned up. Earlier test-fixture failures were corrected before this successful complete run. In particular, the runner waits for PostgreSQL's final TCP listener, the dev server uses the browser's loopback hostname, controlled login inputs wait for hydration, and revocation tests return to the login page before starting a new authorization flow. No code exchange is retried to work around a failed test.

The clean run is reproducible from the repository root:

```bash
pnpm test:dlab
```

Docker, installed workspace dependencies and Playwright Chromium are required. Test services use Studio port 3309 and API/provider ports 4319/4320 and refuse to reuse an existing server on those ports. The browser dev server binds to `127.0.0.1`. Tests fetch Cove's real start redirect without following it and route only the test browser to the OS double. The API still constructs and validates the fixed production OS authorize URL. The test double checks Basic client authentication and privileged provider-admin headers; application runtime code has no test-host bypass.

To focus browser cases while retaining fresh isolation and backend checks:

```bash
pnpm test:dlab --grep "HQ role changes"
```

## Browser cases that passed

| Case | Observed result |
| --- | --- |
| New OS student | Student dashboard; no signup; one account/membership; student lease |
| New OS instructor | Teaching overview; Teacher role; no student lease |
| New OS education team leader | Curriculum overview; Team Lead role; no student lease |
| New OS campus head | Control tower; Manager role; no platform Admin grant |
| Unknown future OS role | Student fallback, no staff permissions |
| Repeat login and reload | Same user/membership IDs and valid academy session |
| Campus and permission isolation | Wrong academy and platform endpoints denied; member management allowed only for Manager |
| Unapproved campus | Safe SSO failure, no Cove user or membership provisioned |
| Forged callback | Safe failure, no browser auth session |
| Existing student password login | Correct academy landing |
| Existing teacher password login | Correct academy landing |
| Existing team-leader password login | Correct academy landing |
| Existing manager password login | Correct academy landing |
| Existing platform-admin password login | Admin console landing |
| OS deactivation/reactivation | Old token denied while inactive and after reactivation; fresh SSO succeeds |
| OS teacher-to-team-leader change | Old session denied; next login has the new role |
| Cove logout | Browser session cookies removed and login page shown |

There are 15 browser test functions: the per-role functions include the repeat-login, permission and isolation assertions. The legacy fixtures are disposable accounts, not actual Mapo production users. No test logged into the real HQ accounts or real Mapo accounts.

Screenshots from the final local run (generated artifacts, not committed): [student](../../test-results/dlab-sso-OS-student-automa-650d9-DENT-and-reuses-the-account/dashboard.png), [teacher](../../test-results/dlab-sso-OS-instructor-aut-105de-CHER-and-reuses-the-account/dashboard.png), [team leader](../../test-results/dlab-sso-OS-edu-manager-au-1b35c-LEAD-and-reuses-the-account/dashboard.png), [manager](../../test-results/dlab-sso-OS-lab-head-autom-b6fab-AGER-and-reuses-the-account/dashboard.png). These links are replaced when the local suite is rerun. The teacher screenshot was visually inspected and shows the correct assigned-class empty state.

The database suites additionally cover concurrent first logins, provider provisioning failure/recovery, raw managed-field/identity/binding mutation rejection, staff scope removal, last-manager source demotion, stale/equal-version events, local restriction provenance, secondary-campus deactivation, and operator dry-run/apply behavior. Browser tests do not independently certify live multi-instance socket timing; real socket/provider validation remains part of release testing.

## Before enabling this in production

1. Apply the additive migration through the reviewed release workflow and deploy matching API/Studio versions. The activation response has a new required role-aware flag.
2. Privately update the OS base and validate the exact registered callback and a real code exchange on the new domain. Do not assume a working home page proves the client registration was migrated.
3. Verify the actual returned role/campus fields of HQ's student, teacher and team-leader fixtures. Obtain a controlled manager fixture before claiming live manager verification.
4. Verify the intended campus-to-academy mapping and enable it explicitly. Keep the isolated Daechi demo separate from real Mapo users until existing-account duplication/linking is reviewed.
5. For campus rollout, select campus mode explicitly and run the audited session invalidation/reconciliation command with that same mode. Prove first login for a new OS identity that has no per-user allowlist entry.
6. HQ must expose the student Cove card and staff shortcut at GET `https://cs.coveedu.com/sso/start`.
7. Retain and validate the existing Supabase provider credential guard. Obtain HQ acceptance of the existing browser-session cookie model, or finish the separately reviewed HttpOnly-session redesign before claiming full contract compliance.

Course catalog/enrollment import, OS class assignment, global OS logout and automatic conversion of existing Cove accounts are excluded from this release. An empty course/class list after successful login is expected until ordinary enrollment or assignment is configured.

Use the [current SSO runbook](../operations/dlab-sso.md) for configuration, dry-run mapping/access commands, rollout and rollback. No release gate above was silently marked complete by a local fake-provider test.

## Follow-up: initial real HQ teacher fixture against local Cove

On October 21, local private configuration was updated to `https://os.dlabcampus.com/v1` and campus rollout mode. The additive staff migration was applied only to the user-confirmed development Supabase project. The existing Daechi-to-demo-academy mapping was enabled through the audited operator command. Production was unchanged.

A fresh Chrome SSO attempt using the supplied, already authenticated HQ teacher fixture completed authorization, server-side token exchange, automatic provisioning and activation, then opened `/academy/daechi-sso-demo`. The browser displayed the Daechi demo academy and the account name. The persisted source identity reports active status, the mapped Daechi campus, and **`user_role=tutor`**, not `instructor`. At the time of that initial attempt, its active Cove membership was **Student**, following the then-current fallback policy. This verifies real authentication and campus mapping, but **does not verify the intended Teacher permissions**. The reference contract describes `tutor` as an assistant instructor; The platform owner subsequently explicitly confirmed `tutor` → Teacher and the other corrected translations, as recorded in the spec. The initial attempt alone did not validate Teacher permissions; the correction requires separate verification below. Roles remain derived from verified OS codes, never email/name.

The user's earlier callback failure was not reproduced with the fresh attempt; no API integration exception was recorded for the earlier request. A missing, expired or replaced transaction cookie/state is a possible explanation, not a confirmed root cause. Use a fresh `/sso/start` attempt in one tab; do not reuse old authorization links. Separately, `/sso/start.` (with a trailing period) was confirmed to return 404, while `/sso/start` returns the expected authorization redirect.

The new OS serves the authorization frontend for browser HTML requests; a default non-browser `Accept: */*` probe can return 404. Browser-style authorization and the OS registration check accepted the local callback. No secrets, login credentials or authorization codes are recorded here. Real team-leader/manager role checks, production rollout, refresh/logout regression and the remaining release gates above are still separate work.

## Approved role correction and development reconciliation

The platform owner explicitly confirmed `tutor`/`instructor` → Teacher, `lab_head` → Team Lead, and `edu_manager` → Manager, including ordinary academy settings/member-management permissions. The shared policy, database expectations, manager-demotion regression and browser role cases now use this mapping. Other role fallbacks, campus restrictions and the separation from platform Admin remain unchanged. No OS database access or new schema migration is required.

The final isolated `pnpm test:dlab` run passed all 67 migrations, **153 API tests**, **44 shared tests**, **11 Studio tests** and **16 Chromium browser cases** (1.1 minutes). `pnpm typecheck:e2e` also passed. New coverage includes tutor Teacher landing without a student lease, the corrected Team Lead/Manager dashboards and permission boundaries, and audited reconciliation of an existing tutor Student membership. The latter retains user/auth/membership IDs and historical profile data, invalidates the old session, and allows a fresh Teacher login. All five legacy password-login role cases still pass. The first browser run encountered the manual Studio dev-server lock; both manual servers were stopped and the complete isolated run then passed with exit code 0. Temporary test containers were cleaned up.

After verifying both database URLs and Supabase settings still targeted the user-confirmed development project, `operator.ts invalidate` was previewed and applied with the private local environment explicitly loaded. It affected exactly two managed development identities. Comparison before/after confirmed unchanged user/auth/membership IDs and advanced generations. The existing tutor membership changed from Student to Teacher; the actual student remained Student. The Daechi demo mapping and production were unchanged. The local API/Studio servers were restarted with the corrected shared build. Old managed sessions require a fresh SSO attempt.

### Real teacher acceptance after the correction

A fresh Chrome authorization through the real OS reused the supplied teacher's existing session. The callback completed and opened local `/academy/daechi-sso-demo`; the academy selector showed **Teacher**, the page heading was **Teaching overview**, and navigation exposed My classes, Student analytics and Students. Refresh preserved the same Teacher dashboard. The empty state correctly says no class is assigned; automatic class assignment remains outside login scope. The successful tab was left open for the user. This confirms real tutor-to-Teacher authentication and UI behavior on the development target, not production or live acceptance of the other staff role fixtures. Local evidence image: `/tmp/cove-dlab-teacher-corrected-role.png` (not committed).

### Real Team Lead acceptance

A subsequent fresh Chrome authorization used the supplied HQ team-leader account's existing OS session. OS returned **`user_role=lab_head`**, active status and the approved Daechi campus. Cove automatically provisioned an active **TEAM_LEAD** membership in `daechi-sso-demo`. The browser showed **Team Lead** in the academy selector and the curriculum overview headed **What Daechi SSO Demo Academy teaches**, with curriculum, classes, student and teacher navigation. Refresh preserved that dashboard. No per-user allowlist addition, manual user creation or OS database access was used. Local screenshot: `/tmp/cove-dlab-team-lead-live-result.png` (not committed); the successful tab was left open.

Teacher (`tutor`) and Team Lead (`lab_head`) now have real OS-to-local-Cove acceptance evidence. Manager (`edu_manager`) is implemented and passed automated database/browser dashboard and permission tests, but a real active OS `edu_manager` fixture has not been provided or tested. Existing Cove admin/manager password accounts do not establish real OS Manager acceptance. The student mapping and legacy login regressions passed the automated suite; the previously provisioned student retained its Student membership during reconciliation. `so_staff`, `hq_admin` and unreviewed codes continue to receive only the documented Student fallback, never platform Admin access. Production remains unchanged.

## Final approved mapping: academy roles and HQ Platform Admin

The user's final explicit role table supersedes both earlier staff-role translations: `student` → Student; `instructor`/`tutor` → Teacher; `edu_manager` → Team Lead; `lab_head` → Manager; `hq_admin` → Platform Admin. OS role labels remain separate from Cove permissions. The supplied account described as a team-leader fixture actually returns `lab_head`, so its final Cove role is Manager.

The shared policy now derives platform and academy roles separately. An eligible HQ admin receives `User.platformRole=ADMIN`, no academy-role membership and no student lease, with a fixed `/admin/academies` destination. Admission retains active source/local-account checks and the existing allowlist or enabled/mapped-campus rollout policy. HQ administrators use normal Cove platform permissions, inspection/library access and support-operation rules. Historical academy bindings are retained but suspended/source-blocked, and local restrictions are preserved. Role transitions are recorded as integration events. Demotion/deactivation and loss of the last admitted campus revoke admin eligibility and remove the derived platform role. Managed profile, credential and platform-role DB guards remain enabled. No new migration or OS database access was needed.

Final verification:

- Complete isolated `pnpm test:dlab`: all 67 migrations, **156 API tests + 55 shared tests + 16 Studio tests = 227 focused tests**, and **20 Chromium browser cases**, passed; browser duration 1.7 minutes. New coverage includes HQ creation/reuse without academy memberships, promotion/demotion, deactivation, campus rejection, local restrictions, platform access after a historical academy membership, safe callback destinations, and all five legacy password-login roles.
- A subsequent focused run of `pnpm test:dlab --grep 'OS HQ admin enters'` repeated the 227 focused checks and passed the strengthened console case, asserting the visible **Academies** heading and capturing the actual platform UI. [Automated HQ console screenshot](../../test-results/dlab-sso-OS-HQ-admin-enter-ff44e-ship-and-reuses-its-account/hq-admin-console.png). This is an isolated OS/provider double, not a real HQ-admin credential test.
- API, Studio and E2E TypeScript checks passed; the API build ran successfully in both isolated runs. Disposable containers/services were cleaned up.
- The verified development target was previewed and reconciled through `operator.ts invalidate --apply`, affecting three existing managed identities. Before/after comparisons confirmed identical user/auth/membership IDs and higher session generations. The actual student remains Student, the tutor remains Teacher, and the existing `lab_head` changed from Team Lead to Manager. Both manual servers were restarted with the compatible build. Production and private credentials were unchanged.

A real OS `hq_admin` fixture and a real `edu_manager` fixture are still required for those live acceptance checks. Existing local/admin password credentials do not prove either OS role. This release does not enable `so_staff` as a staff role or complete course/enrollment synchronization.

### Real Manager acceptance under the final mapping

A fresh real OS login with the existing `lab_head` fixture completed the code/session bridge and landed at local `/academy/daechi-sso-demo`. The selector displayed **Manager**, the heading displayed **Control tower**, the roster showed one Student, one Teacher and one Manager, and manager navigation exposed Members, Invitations and Academy settings. Refresh retained the Manager dashboard. The page was left open for the user. Screenshot: `/tmp/cove-dlab-final-manager-live.png` (not committed). This supersedes the earlier Team Lead landing for the same source account, without changing its OS role, account ID or membership ID.
