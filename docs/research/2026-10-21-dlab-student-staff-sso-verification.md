# Automatic DLAB student/staff SSO verification

Date: 2026-10-21 (Asia/Seoul)
Branch: `feat/dlab-os-staff-sso`
Baseline: v2 `97953f494cd001dbdf9da499f47696e7e8085c1d`; approved design commit `1de1eead`.

## Result and environment

The automatic-account SSO implementation passes the isolated database tests and all 15 Chromium browser E2E cases. The browser tests run the actual Cove Nest API, Studio routes, session bridge, authorization, and role dashboards. DLAB OS and Supabase are local service doubles; this is not evidence that HQ's live registration, supplied accounts, or provider-side SQL guard work on the new domain.

No production deployment, hosted development migration, campus remapping, private environment-file edit, or message to HQ was performed. Real user passwords, OS login numbers, client secrets, and inbound keys are not included in this report or fixtures. All committed test credentials are clearly local stand-ins.

Each `pnpm test:dlab` run creates a new disposable PostgreSQL/Redis pair on loopback ports, applies all 67 migrations, builds the API, runs the focused tests, then starts the real API and Studio with external-service doubles. The supplied development and production database settings are never selected as test targets. Test containers are cleaned up afterward. The initial failed fixtures were kept and stopped; no existing database was reset.

## Implemented behavior

- The fixed OS base is `https://os.dlabcampus.com/v1`; the old Render domain and arbitrary authorize origins are rejected.
- The mappings are `student → STUDENT`, `instructor → TEACHER`, `edu_manager → TEAM_LEAD`, and `lab_head → MANAGER`.
- Other roles are stored and get only primary-campus Student fallback access. No OS account becomes a Cove platform Admin.
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
