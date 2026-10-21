# DLAB OS automatic student and staff SSO

Date: 2026-10-21 (Asia/Seoul)
Branch: `feat/dlab-os-staff-sso`
Baseline: `origin/feat/cove-studio-v2` at `97953f494cd001dbdf9da499f47696e7e8085c1d`
Status: Approved and implemented on the branch above. [Local verification](../../research/2026-10-21-dlab-student-staff-sso-verification.md) passed; production and the live-HQ release gates remain unchanged.

## 1. Intended result

HQ creates an account in DLAB OS. The person signs into `https://os.dlabcampus.com/`, clicks Cove Studio, and enters their connected Cove academy as a student, teacher, team leader or manager, or enters the platform console as an HQ admin. First login creates the necessary Cove records automatically. Later logins reuse the same identity and history. There is no separate Cove signup, password copying, join request, or per-user operator allowlist in the campus rollout mode.

An operator connects each OS campus to a verified Cove academy once. This is different from manually adding every person. A new or unfamiliar campus never becomes the existing Mapo academy because its name looks similar.

Example: HQ creates a teacher at Daechi. When that teacher opens Cove for the first time, Cove verifies the OS response, creates one managed account and a Daechi `TEACHER` membership, and opens the teaching overview. The teacher sees assigned classes only where the existing class-assignment rules permit. They do not gain access to Mapo or all students automatically.

This is the next SSO release, not a claim that every v1.2.1 API is complete. Automatic OS course/enrollment delivery remains a separate Phase B design.

## 2. Evidence and requirements

The branch baseline was compared with a fresh fetch of v2 and is identical at the SHA above. The supplied `dlab-integration-spec-v1.2.1` ZIP, including `api.yaml`, `contract.md`, `contract.dbml`, and `examples/sso-client/`, is the integration reference. Its contents describe the remote contract; they do not authorize deploying, changing campus mappings, or sending messages to HQ.

The user's later message replaces the old public OS hostname with `os.dlabcampus.com`. The target API base is `https://os.dlabcampus.com/v1`; preserving `/v1` is a design assumption to verify with a real code exchange before release. A rendered OS home page alone does not prove the API path, client registration, or token response works on the new domain.

The ZIP says:

- Students and staff use the same OS site; students use campus/name/login number and staff use email/password.
- `external_user_id` identifies the person. Names, emails, and login numbers are not identity-matching keys.
- The server exchanges a short-lived, single-use authorization code for user information directly. It must not expect an OAuth access-token response.
- Missing `external_campus_ids` means `[external_campus_id]`. The array describes the person's allowed campuses; students have one, authorized staff may have several.
- Unknown roles must be stored and handled without elevated permissions.
- Inactive users cannot log in; records and learning history must remain.

The ZIP's statement that Cove has no existing student accounts is out of date for this deployment. Real Mapo accounts exist. Preserve them and do not automatically merge them into an OS identity.

The signed-in OS page inspected on 2026-10-21 showed Daechi staff navigation and AI Studio / AI Community shortcuts, but no Cove shortcut. This observation is specific to that account and page. Adding the Cove card or staff shortcut requires HQ work outside this repository.

### Current implementation gaps

| Code | Current behavior | Required change |
| --- | --- | --- |
| `packages/api/src/config/env.schema.ts` | Literal old OS base, individual user allowlist | New-domain pin and explicit rollout mode |
| `packages/web/src/app/(auth)/sso/start/route.ts` | Only redirects to the old OS origin | Validate the new fixed authorize origin and path |
| `deploy/scripts/check-dlab-config.py` | Requires old domain and nonempty user allowlist | Validate both safe rollout modes and new-domain wiring |
| `packages/api/src/integrations/dlab/dlab-sso.service.ts` | Requires `student`, singleton campus, always creates `STUDENT` | Role-aware, idempotent provisioning in approved campuses |
| `packages/api/src/integrations/dlab/dlab-source.service.ts` | Suspends non-primary bindings and creates student profiles | Reconcile staff scope and roles, distinguish local restrictions |
| `packages/api/src/integrations/dlab/dlab-policy.service.ts` | Accepts only student / primary-campus binding | Check all effective bindings against current source and mapping |
| Studio SSO callback | Always starts a student inactivity lease | Start it only for effective student access |
| DLAB migration guards | Protect existing managed fields, but do not model suspension ownership | Preserve protection while adding explicit restriction provenance |

`StudentSessionService.begin` itself does not reject staff. The current fatal staff gates are in provisioning and eligibility; starting an unnecessary student lease is an additional behavior to correct. The existing `studentAuthenticated` middleware already applies inactivity checks only to people with student access.

## 3. Scope and selected approach

The selected approach is **first-login provisioning plus immediate updates for already provisioned accounts**. An authenticated user PUT can stage an identity before first login; login does not require that PUT to have arrived first. Once an account exists, authenticated source updates reconcile role and campus changes without waiting for another login.

Alternatives considered:

1. Pre-provision every account only from HQ pushes. This makes availability depend on queue delivery and requires creating auth identities for people who may never visit Cove.
2. Retain manual user approval indefinitely. This keeps the current controlled demo but does not meet the user's requirement for automatic new-user access.

Included: new OS hostname; six explicit OS role mappings to five Cove roles; campus-controlled rollout; multi-campus staff; repeated-login reuse; source updates and revocation; managed-account restrictions; explicit Mapo isolation; local and production verification procedures.

Excluded: full course catalog and enrollment APIs, OS class/teacher-assignment import, OS account creation, OS hub implementation, global cross-application logout, automatic academy creation, existing-account conversion, and administrator grants from any OS role other than the explicitly approved `hq_admin`. The Supabase session-cookie compatibility question is retained as a release gate in section 13, not silently resolved by this design.

## 4. Role mapping and permissions

**Final owner-approved mapping (supersedes the intermediate correction below):** `student` → Student, `instructor`/`tutor` → Teacher, `edu_manager` → Team Lead, `lab_head` → Manager, `hq_admin` → Platform Admin. The final request explicitly authorizes HQ platform administration. Use an exact shared platform-role helper and nullable academy-role helper; do not represent HQ Admin as a Manager membership. Existing schema and transaction-local OS field guards support this without a new migration.

HQ admins must still pass active identity, local restriction, allowlist/campus-mode admission and at least one verified approved-campus check. Platform authority is global after admission; it is not restricted to that academy's membership. Empty/unapproved/inactive scope grants no admin access. Existing locally suspended bindings also block HQ promotion. Reconciliation derives platform roles, retires old academy bindings and records role transitions. Source demotion/deactivation or campus revocation removes admin status even when it is the last OS admin; retain a separate local operator for recovery.

Activation returns only the fixed `/admin/academies` console destination for an eligible HQ admin. The browser must verify the activated account's platform role and exact auth identity, skip student leases, and reject any other admin destination. User-controlled `return_to` remains restricted to academy paths. API platform authorization revalidates managed eligibility, and academy inspection for HQ uses normal platform/support rules rather than historic suspended memberships. Existing ordinary login and local-managed-field guards remain intact. Validate new/repeated admin login, promotion and demotion, source/local/campus restrictions, blocked unknown roles, callback destination forgery and all legacy role logins. Reconcile development identities with the audited invalidation command and require fresh sessions before live verification.

**Intermediate October 21 decision (historical; superseded above):** The platform owner confirmed `tutor` means Cove Teacher, `lab_head` means Team Lead, and `edu_manager` has full academy Manager permissions. This supersedes the initial inferred role translations. The [Google Sheet’s Cove `user_role` row (90)](https://docs.google.com/spreadsheets/d/1HsH5lAN9uLEUF0b-eUJmFeRBztiSrq1jZasvKO6cp2s/edit#gid=2068191818&range=A90:L90) is marked as requiring discussion and does not itself finalize this mapping. The live teacher fixture returned `tutor` with the verified Daechi campus. Apply the confirmed mapping through the existing shared policy and audited reconciliation/session-invalidation tool; preserve source roles, account/membership IDs, historical records and campus restrictions. No new schema is needed. Update unit, database and browser tests, including an existing tutor account upgraded from Student.

Use exact, server-verified `user_role` values from `/sso/token` or authenticated user PUTs. Do not infer the role from the email address, a display name, browser parameters, or OS navigation labels.

| OS role | Cove primary academy role | Scope / behavior |
| --- | --- | --- |
| `student` | `STUDENT` | Exactly the source primary campus; supplied scope must equal that singleton |
| `instructor` | `TEACHER` | Approved mapped campuses in the verified scope |
| `edu_manager` | `TEAM_LEAD` | Approved mapped campuses in the verified scope |
| `lab_head` | `MANAGER` | Approved mapped campuses in the verified scope |
| `tutor` | `TEACHER` | Approved mapped campuses in the verified scope |
| `hq_admin` | Platform `ADMIN`; no academy role | Same rollout/approved-campus admission; platform console and normal platform permissions |
| `so_staff` or any unknown value | `STUDENT` fallback | Primary-campus access only, if the primary is in the verified scope and approved; no staff or platform elevation |

The four privileged mappings implement the role table already proposed to the user. Confirm the actual returned values for the supplied teacher and team-leader fixtures during joint testing. If HQ uses a different code, record the evidence and review the mapping; do not silently expand a privileged mapping to make a test pass.

The fallback implements the ZIP's narrow/student-like handling and allows account synchronization and login without granting an unreviewed staff role. An unknown role alone is not an authentication error. Normal inactive-account, invalid-scope, unmapped-campus, and local-suspension checks still apply. The fallback does not create class enrollment or expose all academy courses. Other operations/HQ roles must not be guessed to mean a teacher or manager. Additional staff mappings require an explicit permission decision.

Only an eligible, server-verified `hq_admin` receives `User.platformRole=ADMIN`; all other managed accounts have `USER`. HQ admins have no active academy memberships; historical bindings remain suspended/source-blocked so profile/history IDs are retained. Their platform inspection/library permissions and support-write rules match ordinary Cove Admins. Each ordinary managed membership holds exactly one derived role and no extra roles. Preserve the raw OS role separately on `DlabIdentity`.

Reuse `packages/shared/src/auth/roles.ts`, `AcademyAccessService`, and the existing role-specific academy root. Do not redefine Cove's role permissions. A team leader or manager does not automatically also become an assigned teacher. Existing teacher class assignment and monitoring checks remain authoritative. Managers may perform their ordinary permitted academy work, but managed identity fields and credentials remain OS-controlled.

## 5. Rollout and campus boundaries

Keep `DLAB_SSO_ENABLED` as the API/Studio switch. Add API-only `DLAB_SSO_ROLLOUT_MODE=allowlist|campus`, defaulting to `allowlist` for backward compatibility.

- `allowlist`: retain the existing nonempty `DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS` requirement. The confirmed role mappings still apply, but only specifically listed identities may enter a mapped active campus. This is for controlled fixture tests.
- `campus`: individual identity IDs are not admission requirements. A person may receive access only through a mapped active campus whose new `ssoEnabled` flag is true and whose academy is active and of kind `ACADEMY`.
- An empty allowlist never implicitly means allow everyone. Setting `campus` without enabling any campuses admits nobody. Existing allowlist values are ignored for admission in campus mode and must not obscure the selected mode in diagnostics.

Add `ssoEnabled=false`, `ssoEnabledByUserId`, `ssoEnabledAt`, and `accessRevision=1` to `DlabCampus`. `accessRevision` advances on mapping, source status, or rollout eligibility changes. Mapping and enabling are separate operator actions; mapping alone does not enable campus mode.

Keep `dlab:map-campus` dry-run / explicit `--apply` semantics and its active platform-operator validation. Add `dlab:set-campus-access <external-campus-id> <enabled|disabled> <operator-user-id> [--apply]`, with dry run by default, explicit IDs, and an audit record. These are proposed commands, not available commands in the baseline. Disabled access may be recorded even when the campus or academy is inactive. Enabling requires a valid active mapping. Mapping/access commands and campus source-status updates must reconcile affected provisioned memberships and invalidate affected generations before reporting durable success; revocation publication follows commit. Remapping an existing campus is refused; it needs a separate reviewed migration.

For true students, reject an empty or multi-campus scope or a scope different from the primary campus. For mapped staff, canonicalize the supplied scope as a unique sorted set, maximum 100 IDs; omission defaults to the primary singleton. Do not add the primary to an explicitly supplied scope. Empty explicit scope grants nothing. Only the intersection of verified scope and approved active mappings receives memberships. An unmapped secondary campus does not block access to another approved campus and never produces an invented academy. Record a bounded missing-mapping diagnostic for operators.

Use the primary academy as the default destination if eligible. Otherwise use the eligible academy with the lexicographically first external campus ID. An explicit safe `return_to` may select another eligible academy. A person with no eligible campus gets the existing safe SSO failure page and a bounded reason; do not send them through ordinary signup.

## 6. Identity and membership reconciliation

Retain `DlabIdentity`, its unique external ID, stable `reservedUserId`, managed Supabase identity, and unique `DlabMembershipBinding` per user/campus. One person with two campuses has one Cove user and two memberships, not two auth accounts.

Introduce a pure role/scope policy and a focused membership reconciliation service shared by SSO completion and source updates. The policy calculates desired access; the reconciler applies it. `DlabSsoService` remains responsible for the OS exchange and session bridge, not a second copy of role or membership rules.

### First and repeated login

1. Validate and consume the existing browser-bound, one-use state transaction.
2. Exchange the code server-to-server and validate the direct user response.
3. Apply source version/race checks, derive the rollout admission and effective campus set, and reject inactive/local-restricted identities.
4. If no eligible academy exists, keep any staged source identity but issue no auth session.
5. Create or recover the passwordless managed Supabase identity using the existing stable reserved UUID. Then transactionally create or reuse the Cove user and reconcile desired memberships.
6. Bind every membership to its exact external campus and revision. Never adopt an unbound local membership. A conflicting user/auth/binding association returns `409 conflict`; it is not an instruction to merge records.
7. For `STUDENT`, create/update the existing student profile; only true OS students receive the source grade in that profile. Fallback accounts receive a minimal student profile without inventing grade data. Staff memberships do not create student profiles.
8. Issue and activate the existing server-only session bridge only after fresh eligibility checks.

No OS password, staff login email, or login number is needed in the Cove provisioning payload. Continue using the internal username and placeholder email scheme. No signup confirmation, application, or invitation is created. An existing authenticated browser must switch to the verified externally bound account rather than linking it to the current Cove account.

Retries and concurrent first logins reuse the same reserved auth UUID, user, and membership unique keys. Provider creation remains outside the database transaction; partial provider success is recoverable on retry through its managed metadata and UUID checks. Never delete a valid preexisting account as compensation for a later failed callback.

### Role and campus changes

For provisioned identities, authenticated user PUTs reconcile derived roles and scope in the source transaction. Preserve membership IDs, attempts, submissions, profiles, and learning history. A former student's profile may remain for history; authorization follows the current role. A role update replaces the previous managed role and clears any incompatible extra-role state through the trusted reconciliation boundary. It must not accumulate old staff permissions.

Removed campuses lose access; returning campuses may become active again only if there is no independent local restriction. Additions can create a new membership for an already provisioned user. Unprovisioned PUTs remain staged and do not eagerly create Supabase accounts.

Maintain source timestamps, canonical payload hashes, revision checks, advisory/row locks, stale-update no-ops, and equal-version conflicts from the original implementation. Scope ordering alone must not revoke sessions. A newer inactive update must win over an in-flight active login. The existing requirement for an explicit newer active source update after an OS deactivation remains; a callback must not silently reactivate a staged inactive identity.

Revalidate identity and campus access revisions under transaction locks immediately before granting membership or activation. Use a documented consistent lock order for campus and identity rows across PUT, reconciliation, mapping, and rollout commands; retry bounded serialization/deadlock failures using stable IDs, never by exchanging an OS code twice.

## 7. Independent local restrictions and database guards

The current single membership status cannot explain whether OS or a local operator suspended someone. Automatic reconciliation must not accidentally undo a local restriction.

Extend `DlabMembershipBinding` with:

- `sourceAccessStatus`: `ALLOWED` or `BLOCKED`, derived from current OS user/campus/scope and rollout policy.
- `localSuspendedAt`: nullable timestamp for an independent Cove restriction.

Materialize `AcademyMembership.status = ACTIVE` only when source access is allowed, the local restriction is absent, and existing local account/academy restrictions permit it. Otherwise preserve an inactive status. Source reconciliation never clears `localSuspendedAt`, `User.status`, or the local academy's status. Source restriction and local restriction may coexist.

The migration conservatively marks all existing inactive managed memberships as locally restricted; do not guess the cause of a historical suspension. Backfill `sourceAccessStatus` from stored identity/scope/campus data. Canonicalize stored scope arrays and rebuild their payload hashes using the new canonical policy, without inventing a newer source timestamp or broadening a scope. Any ambiguous legacy restriction requires an explicit audited local restore, not automatic activation on rollout.

Update the database guards in a new additive migration; do not edit the applied October 16 migration. Ordinary membership suspension paths, including academy, platform, and bulk operations, must persist the local marker even if source restriction already made the membership inactive. Use a database guard/trigger as the backstop and route ordinary application mutations through a shared managed-membership restriction helper. Extend local restore paths to clear only the local marker after their existing authorization checks; reactivate only if current source policy permits, and revoke old generations. The UI must explain when OS still blocks access.

Preserve protected OS name/grade/identity/role fields and provider credential restrictions. Normal role edits, extra-role insert/update/delete, academy reassignment, new unbound membership insertion, and deletion/unlinking of managed identity/binding records must be refused outside the trusted reconciliation boundary. Trusted changes use transaction-local integration context; never expose that bypass as a browser parameter. Cover bulk, platform, and import paths as well as the visible forms.

OS demotion or deactivation must remove access even if the person was the last manager. The ordinary local last-manager rule must not preserve a privilege that HQ revoked. Record and alert on the resulting academy-without-manager condition; do not grant a replacement manager automatically. Keep ordinary local last-manager safeguards unchanged for non-source operations.

Use a dedicated integration event record for source-driven changes, with request ID, external identity, before/after role and scope, affected membership IDs, source revision, and timestamp. This avoids attributing source updates to a fabricated human actor: the existing `AuditService.write` requires a real `actorUserId`. Operator mapping/enablement and local restrictions continue using ordinary actor-attributed audits. Do not store provider responses, passwords, authorization headers, codes, or tokens in either audit path.

## 8. Sessions, authorization, and destinations

Replace the student-only `DlabPolicyService.eligible` result with a policy snapshot containing the bound identity, generation, and all currently eligible academy memberships. Check raw source role against the derived role, exact campus-to-academy mapping, campus access revision, rollout admission, source status, local restriction, membership status, and academy kind/status. A stale high-role membership is not authority.

`SupabaseAuthService.verifyAccessToken` keeps enforcing managed session activation and the identity generation for all four roles and fallback accounts. Ordinary non-managed Supabase sessions retain their current behavior. Bind activation tickets to the current generation; revalidate scope and mappings during activation, not only during code exchange.

Advance the identity generation on role/status/effective-scope changes, rollout removal, campus status or enablement changes, and local restrictions/restores. Campus changes affect every identity referencing that campus, including secondary scope and existing bindings, not just `externalCampusId`. Add a GIN index on `DlabIdentity.externalCampusIds` for affected-identity lookup. Add an operator-only `dlab:invalidate-sessions <operator-user-id> [--apply]` command that previews affected managed identities, advances their generations, and records an audit without printing session tokens. When switching rollout mode, temporarily disable new SSO entry, update API runtime configuration, run reconciliation and this invalidation step, then re-enable entry. This command is also proposed implementation work, not a currently available script.

Identity-level eligibility alone is insufficient for multi-campus access. `AcademyAccessService.requirePermission` must check that the requested academy is among this managed identity's current effective bindings before using a membership or considering a support/platform fallback. Apply the same effective set to account presentation/navigation and direct class/monitoring authorization paths that read memberships independently. An eligible Daechi membership must never make an old, removed Mapo membership usable. Add a request-scoped policy lookup where needed; do not allow a stale shared cache to outlive committed revocation.

Extend the trusted activation response with server-derived `requiresStudentSession`. Student and fallback accounts require a successful student inactivity lease before landing. Staff-only accounts skip that lease. Do not derive this flag from query parameters. Then load `auth.me`, clear stale view-role/invitation/OAuth context, and redirect to the selected eligible academy root or validated return path. Reuse the existing academy-root role overview, not separate guessed staff URLs. Validate that Studio's returned destination matches an eligible membership; never send managed users to `/welcome`, `/admin`, an unapproved academy, or an external return URL.

Retain one-use activation tickets, Redis session-to-generation binding, fail-closed managed access on source/Redis failure, and normal refresh/logout behavior. HTTP requests after a committed revocation must fail; sockets must disconnect through the existing notification/monitoring mechanisms with a maximum ten-second periodic eligibility backstop. For academy-specific membership/role changes, publish the existing monitoring membership revocations after commit as well. Recheck authorization at protected write boundaries. Reactivation requires a new login; old tokens and sessions remain invalid.

Cove logout clears Cove's session. It does not claim to log the user out of OS or other products. Re-entering through OS may not require another password if the OS session is still active.

## 9. Domain and deployment configuration

Target registration stays:

| Purpose | Address |
| --- | --- |
| Student/staff website | `https://cs.coveedu.com` |
| Cove API | `https://api.coveedu.com` |
| Cove start, link-compatible GET | `https://cs.coveedu.com/sso/start` |
| Exact registered callback | `https://cs.coveedu.com/sso/callback` |
| New OS API base | `https://os.dlabcampus.com/v1` |

Pin the API and Studio authorize validator to the new production origin and `/v1/sso/authorize` path. Do not accept an arbitrary configured external URL or follow a token-endpoint redirect while sending credentials. Reject URL credentials, non-HTTPS production bases, lookalike hosts, extra paths/query/fragment, and a stale old-domain configuration with an actionable startup/preflight error. Domain migration is explicit; no automatic cross-host fallback.

Update API and deployment env examples, deployment preflight, Studio start tests, operational runbooks, and current example references. Historical evidence may retain the old domain when clearly dated. The Studio validator may use a shared nonsecret fixed-origin constant; DLAB client secret and inbound key remain API-only. No `NEXT_PUBLIC_*` credential is introduced.

Keep `DLAB_CLIENT_ID=cove`, the issued private SSO secret, and the independent inbound Bearer key. A hostname change does not prove the credentials were migrated; verify the new domain with the registered callback and existing private credentials. Never print values during preflight. The existing BFF shared secret and Redis requirements remain.

Keep the server-only Basic-authenticated `POST /sso/token`, exact matching callback, one-use code/state, timeout, and redirect rejection. No requests to the OS token endpoint come from client-side JavaScript. Missing or wrong inbound Bearer keys remain `401`, before payload validation.

No Cove DNS or callback-path change is needed just because OS changed its own hostname. Preserve `/auth/callback` for existing Supabase login. Public `/v1/campuses/:id` and `/v1/users/:id` rewrites stay narrow; this release does not expose unfinished course/enrollment handlers. If Caddy configuration changes, follow the existing single-file bind-mount refresh instructions in the production deployment runbook and verify the loaded container configuration.

## 10. User experience and examples

- Keep existing ID/password, Google, signup, and recovery flows for ordinary accounts. Keep a separate DLAB login link. Label it for DLAB accounts generally, not students only.
- First-time OS student: opens Cove, gets the correct academy student overview with no signup form. An empty course list is valid until a class/course is assigned.
- First-time OS teacher: opens the teaching overview; assigned-class restrictions still apply. No student inactivity prompt.
- First-time OS team leader: opens the curriculum/team-leader overview with existing `TEAM_LEAD` permissions, without manager-only member credential controls.
- First-time OS manager: opens the academy control tower with existing `MANAGER` permissions, never the platform admin console.
- Returning user: same external ID, local user ID, membership IDs, and history. Current source role and scope replace stale grants.
- Inactive or locally suspended user: safe localized failure with a retry/login link and a bounded request ID; no tokens or raw provider details.
- Unsupported role: stored as received, narrow fallback access only; no guessed staff privilege. Operators can diagnose the role mapping without exposing it or credentials in a shared screenshot.

Local managed-field controls should identify DLAB OS as the source of name, role, campus, and credentials. Local preferences remain editable. A manager cannot issue/reveal a Cove password or recovery delivery for a managed identity. The provider SQL guard remains installed and tested; hiding a form is not sufficient enforcement.

## 11. Implementation boundaries

| Unit | Responsibility / affected files |
| --- | --- |
| Shared DLAB policy | Exact role mapping, canonical scope, fallback behavior, safe fixed OS origin; `packages/shared/src/integrations/dlab/` |
| Source ingestion | Versioning, source ownership, transactional reconciliation and event records; `dlab-source.service.ts` |
| Membership reconciler | Stable memberships, role replacement, restriction provenance, profiles, people revisions and post-commit revocation; focused new API service |
| Session orchestrator | OS client, provisioning recovery, token-hash bridge and role-aware activation; `dlab-sso.service.ts` |
| Managed policy | Rollout admission, effective bindings, generation validation and secondary-campus revocation; `dlab-policy.service.ts` |
| Existing access seams | Per-academy managed check, account presentation, local restriction/restore, direct teacher/student gates; authorization, auth, academies, platform/manage services |
| Persistence | Additive Prisma migration for campus rollout/revision, binding restriction provenance, integration events, index and revised guards |
| Studio | New-domain start validator, role-aware callback, neutral DLAB copy; SSO handlers, helpers, EN/KO auth messages |
| Operations | Mapping/access commands, invalidation step, config/preflight and runbooks; API integration scripts and `deploy/` |

Build on latest v2, not on the older SSO branch's snapshot. Preserve unrelated PDF grading, shared-course, library, and staff-practice functionality. Read installed Next route-handler/cookie documentation before implementing web changes, as required by the repository's `AGENTS.md`.

## 12. Verification and acceptance

### Automated coverage required during implementation

| Boundary | Required assertions |
| --- | --- |
| Configuration | New domain accepted; old/lookalike/arbitrary host rejected; modes explicit; empty allowlist denied in allowlist mode; campus mode independent of individual IDs; no enabled campus grants nothing |
| Role mapping | Six source codes map to five Cove roles; only exact `hq_admin` gets platform `ADMIN`; other accounts stay `USER`; unassigned/unknown roles get no staff grant; no extra roles |
| Scope | Student singleton checks; omitted array defaults; duplicate/order canonicalization; staff multiple approved campuses; excluded primary never inferred; empty/unmapped/disabled/inactive scope; no Mapo or library leakage |
| Provisioning | No prior PUT; staged PUT; first/repeat/concurrent login; stable auth/user/membership IDs; provider partial failure; local-account conflict; no name/email merge; staff creates no student profile |
| Reconciliation | Teacher-to-leader and manager-to-student changes remove old privileges; added/removed/returned campus; active/inactive transitions; stale/equal-version events; newer source change during callback; no stale activation |
| Restrictions | OS reactivation does not clear local suspension; local restore cannot bypass OS; restriction while already source-blocked survives; migration conservatively handles old suspensions; local last-manager rules and source revocation differ deliberately |
| Authorization | Both HTTP and direct academy/class/workspace/monitoring paths deny removed secondary campus; account/navigation reflects effective roles; role-view/support context cannot elevate a managed user |
| Database guards | Managed fields and role/binding deletion protected through ordinary, bulk, import, platform and direct SQL paths; trusted reconciliation remains atomic; restrictions cannot be cleared through unrelated writes |
| Browser bridge | GET start; single-use bound state; duplicate/missing/mismatched/expired parameters; Basic token exchange server-only; no redirect retry; direct user schema; activate then student lease when required; staff skips lease |
| Session | All roles refresh and logout; role/status/campus/local changes revoke old generations; reactivation requires fresh login; socket revocation/backstop; Redis/source failure closed; no accidental staff inactivity expiration |
| Legacy regression | Existing Mapo admin, manager, team leader, teacher, and student sign-ins and role pages still work; ordinary signup/Google/recovery remain available; managed credential mutation stays blocked |

Extend existing API `dlab-{config,source,auth,controller}.spec.ts`, the real isolated `dlab.integration.spec.ts`, web `src/lib/dlab-sso.spec.ts`, and the academy membership/access tests. The current database integration fixture refuses non-local/non-isolated databases; retain that safeguard and explicitly run it rather than counting a skipped fixture as passing. Add focused browser SSO journeys with a fake OS for automated cases; use controlled real OS fixtures for the joint test.

Implementation validation includes targeted API/web/shared tests, Prisma validation and migration/guard tests on an isolated database, relevant existing role/inactivity/monitoring E2E cases, typecheck, targeted lint, API/Studio builds, and deployment validation for configuration/routing changes. This design-only change does not claim those implementation tests passed.

### Real OS joint test order

1. Verify the local/test database and production target independently. Use the already approved isolated Daechi demo mapping only after confirming these new fixtures actually belong to its external campus. Do not reuse the old student's external user ID for a new account.
2. Keep supplied student, teacher and team-leader login credentials in private test input only. Obtain the student's campus selection and verify the actual external IDs, status, role code and scope from trusted source results. A real `lab_head` fixture is needed before claiming manager live verification; an automated manager test alone is not real OS evidence.
3. HQ confirms the new `/v1` endpoints, client registration, and exact production callback; confirm a separately registered local callback if using localhost.
4. Deploy first in allowlist mode with controlled fixtures. Validate new-domain authorize and token exchange; record sanitized stage/request IDs, not callback query strings or response bodies.
5. Student enters the demo academy, no signup/password prompt; refresh and repeat login reuse their account. Assign a normal test class/course only if testing learning access.
6. Teacher enters the teacher overview and only assigned-class work; team leader enters the curriculum overview. Verify each is denied manager-only and platform routes. Verify the manager fixture separately, including platform denial.
7. Test controlled role/scope changes, secondary-campus removal, local suspension and newer OS deactivate/reactivate updates. Confirm HTTP denial, socket closure, and old-session rejection after restoration. Mutate only agreed disposable fixtures in the selected environment; never change the real Mapo population for a demo.
8. Recheck legacy Mapo login and permissions. Record results before opening campus mode.
9. Enable campus mode for the verified demo campus, invalidate managed sessions, then test a newly created OS user with no per-user allowlist entry and no prior Cove user. Exactly one account and the expected membership must appear automatically. A user from an unapproved campus must remain outside.
10. Test the actual HQ Cove card/staff shortcut as well as Cove's own DLAB button. Signing into OS alone does not navigate to Cove; the user must open the card/link.

Write results under `docs/research/` with build SHA, environment, nonsecret fixture IDs, actual returned role, expected/actual destination, pass/fail and remaining external blockers. Do not reuse historical student success as evidence for staff or the new domain.

## 13. Release gates, HQ coordination, and rollback

This spec establishes the final five-role SSO target. The following are concrete release conditions, not reasons to stop writing or implementing the design:

- HQ's new domain must complete a real code exchange with the registered callback and private credentials. The `/v1` API prefix and credential migration need live verification.
- Confirm the role codes and campus scopes of the supplied teacher/team-leader fixtures. Obtain a manager fixture before advertising live manager verification. Additional privileged meanings for `so_staff` remain disabled by the fallback policy until separately agreed.
- An operator must explicitly map and enable each rollout campus. Expanding to the real Mapo campus requires an account-duplication assessment; never merge existing accounts by email/name or discard learning history.
- HQ must expose the Cove student card and staff shortcut, both targeting GET `https://cs.coveedu.com/sso/start`. This repository cannot make that change to OS. HQ controls whether its hub requires enrollment/entitlement before displaying the student card; verify that separately from Cove login readiness.
- Keep the existing provider credential guard. Revalidate passwordless creation, OTP bridge, refresh and blocked password/email/provider changes against the selected Supabase project.
- The reference requests HttpOnly session cookies; the current Supabase browser integration uses normal JS-readable session cookies, while the SSO transaction cookie is HttpOnly. Obtain explicit HQ acceptance of that model or complete a separately reviewed server-session/BFF redesign before declaring full contract compliance. This spec does not describe that redesign as already implemented.

Rollout sequence: validate code and additive migration in development; use the existing reviewed v2 release workflow; deploy in controlled allowlist mode; run the new-domain/role/legacy tests; explicitly enable the demo campus; select campus mode and invalidate existing managed sessions; prove automatic creation for a new OS identity; widen campus access only with recorded verified mapping and regression evidence. Do not run migrations against a database inferred from an arbitrary local environment file.

Rollback must use a role-aware compatible build. Disabling a campus or switching rollout mode advances affected generations and disconnects managed sessions. Disabling SSO removes new login entry while managed-account and source-eligibility checks remain enforced. Preserve source rows, bindings, restrictions and learning history. Do not blindly roll back to the student-only image after managed staff memberships exist, and never remove the additive guard migration as a shortcut. Ordinary Cove login continues to serve existing non-managed users.

### HQ coordination message (no credentials)

```text
Cove 연동은 OS 계정으로 최초 접속 시 Cove 계정을 자동 생성하고, 이후 같은 계정으로 접속하는 방식으로 준비하고 있습니다. 기존 Cove 로그인도 유지합니다.

신규 OS 주소 https://os.dlabcampus.com 기준으로 /v1/sso/authorize 및 /v1/sso/token과 기존 client_id=cove 등록이 그대로 유효한지 확인 부탁드립니다.

학생용 Cove 카드와 직원용 바로가기 주소는 모두 https://cs.coveedu.com/sso/start (GET)입니다. callback은 https://cs.coveedu.com/sso/callback 입니다.

제안하는 권한 연결은 student→학생, instructor/tutor→선생님, edu_manager→팀리더, lab_head→매니저, hq_admin→플랫폼 관리자입니다. 전달해 주신 테스트 계정의 실제 user_role, external_user_id, external_campus_id 및 external_campus_ids 확인과 매니저 테스트 계정도 부탁드립니다. 비밀번호는 별도 비공개 경로로 전달 부탁드립니다.

캠퍼스는 최초 1회 연결하고, 연결 완료된 캠퍼스의 신규 사용자는 별도 Cove 회원가입이나 사용자별 수동 등록 없이 이용하도록 합니다. 로그인 연동과 코스/수강 자동 동기화는 별도로 검증할 예정입니다.
```

English: confirm the new domain's API/client registration, expose the Cove GET start link for students and staff, verify the actual role/campus fields for controlled fixtures, and supply a manager fixture privately. Campus connection is a one-time setup; users then provision themselves through trusted SSO. Course/enrollment automation is a separate verification scope.

## 14. Relationship to existing documentation

This design replaces the October 16 student-only role eligibility in both rollout modes, and replaces per-user admission requirements when campus mode is deliberately enabled. It preserves the original transaction, trusted BFF, passwordless provider bridge, inbound Bearer authentication, source ordering, provider guards and revocation requirements unless an explicit section above replaces them.

References:

- [Original SSO design](2026-10-16-dlab-os-sso-connection-design.md)
- [Original implementation plan](../plans/2026-10-16-dlab-os-sso-implementation.md)
- [Current SSO operations](../../operations/dlab-sso.md)
- [Local testing](../../operations/dlab-sso-local-testing.md)
- [Demo rollout](../../operations/dlab-sso-demo-rollout.md)
- [Production deployment](../../operations/production-deployment.md)

The implementation plan, current runbook and verification report now record the branch changes and passing local tests. Production deployment and live HQ acceptance remain separate from this design and its local test evidence.
