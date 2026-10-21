# DLAB OS SSO: students and staff
Design: [automatic student/staff SSO](../superpowers/specs/2026-10-21-dlab-os-automatic-student-staff-sso-design.md).
Implementation branch: `feat/dlab-os-staff-sso`. Deployment and real HQ testing must be recorded separately from local test results.

## What happens

HQ creates the account in OS. The person signs into `https://os.dlabcampus.com/`, then opens the Cove card or staff shortcut. GET `https://cs.coveedu.com/sso/start` redirects to OS authorization. Cove's callback exchanges the one-use code on the API server using Basic client authentication and creates/reuses the managed Cove account, memberships and normal Supabase session. No Cove signup, application or password copying is required.

OS role mappings from the latest HQ table supplied on 2026-10-21: `student` → Student; `tutor` → Teacher; `instructor` / `so_staff` / `edu_manager` → Team Lead; `lab_head` → Manager; `hq_admin` → Platform Admin. The aligned rows in the new table supersede the older inline OS-connection notes and previous mappings. Unknown roles retain primary-campus Student fallback. Staff class assignments and student course enrollment remain separate from login.

## Candidate inherited staff roles and unified workspace

The [inherited-role design](../superpowers/specs/2026-10-21-dlab-sso-inherited-staff-roles-design.md) is implemented on the feature branch; it is **not included in the previously deployed v2.0.38** until a separate release and data cutover complete.

The new runtime derives Manager + Team Lead + Teacher for `lab_head`, Team Lead + Teacher for `instructor`/`so_staff`/`edu_manager`, and Teacher only for `tutor`. Primary role remains Manager/Team Lead. All permitted actions and navigation appear together; an ordinary academy role-mode switch is no longer needed. Existing platform/support inspection controls are separate.

Teaching remains assignment-bound for every staff role. A Manager can assign themselves, or a Team Lead can assign that Manager as homeroom/assistant teacher. My classes, tutoring, student drafts, written/quiz review, grading, and live code editing require that assignment. Administrative assignment screens retain their separate management permissions. No assignment means an empty teaching list, not all academy students. Removing assignment revokes ongoing teaching access while preserving Manager authority.

### Release/backfill order

1. Pass the candidate isolated SSO/browser suite and ordinary-account regression checks. Confirm the exact target database and preserve private before-state evidence of managed IDs, grants, restrictions, mappings, and session generations.
2. Disable new SSO entry temporarily. Deploy matching API/Studio images. The old API rejects inherited extra roles, so do not mix old/new API instances during backfill.
3. Under the new runtime and explicit target environment, preview `dlab:invalidate-sessions <platform-operator-uuid>`, then apply it with `--apply`. The existing audited operator command reconciles source roles into the exact derived grant sets and advances managed session generations. No schema migration is introduced by this feature.
4. Verify primary/additional roles, unchanged user/auth/membership IDs and ordinary-account grants. Re-enable entry and require fresh managed login.
5. Verify Manager/Team Lead unified controls, assignment by self/Team Lead, assigned access, unassigned denial, live-edit revocation on assignment removal, and ordinary username/password login. Confirm real HQ source roles separately from provider-double tests.

Rollback must restore a matched policy/data state: disable entry, invalidate managed sessions, reconcile back to the prior single-role sets through authorized source-write transactions, and only then re-enable the previous single-role runtime. Preserve identity/history/restriction rows and provider guards. Reverting images alone after multi-role backfill is insufficient.

HQ admins retain the same verified active-campus/rollout admission gate, but receive `User.platformRole=ADMIN` rather than an academy role. They land at the fixed `/admin/academies` destination without an academy membership or student lease. Their normal platform inspection, library and audited support rules apply; platform authority does not invent Manager memberships. Source demotion/deactivation, loss of the last admitted campus and existing local restrictions revoke eligibility and reconcile the platform role. Other OS roles never receive platform Admin. Managed profiles, credentials and platform roles remain OS-controlled.

## Runtime configuration

API private environment (never commit values):

```dotenv
DLAB_SSO_ENABLED=true
DLAB_OS_BASE_URL=https://os.dlabcampus.com/v1
DLAB_CLIENT_ID=cove
DLAB_REDIRECT_URI=https://cs.coveedu.com/sso/callback
DLAB_SSO_ROLLOUT_MODE=allowlist
DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS=<controlled-fixture-ids>
DLAB_CLIENT_SECRET=<private-issued-secret>
DLAB_INBOUND_SERVER_KEY=<private-independent-inbound-key>
```

Studio private environment: `DLAB_SSO_ENABLED=true`. Preserve the matching BFF secret and authenticated Redis settings. DLAB client and inbound secrets belong only on the API. No `NEXT_PUBLIC_*` secret is needed. The API and Studio must run the compatible new version together: activation now returns the role-aware student-session flag.

The new fixed OS base is required; the old Render hostname is refused. Before deploying, stage this environment change for the new image and validate with `deploy/scripts/check-dlab-config.py`. Do not restart an old image with the new pinned-domain settings. Verify that HQ migrated the client registration and that a real code exchange works; a reachable home page is insufficient.

In production Compose, `deployment.env` owns `DLAB_OS_BASE_URL` for the API and judge worker. `set-v2-release.sh` writes the new OS URL into the candidate manifest alongside its image SHAs; preflight validates this effective override. Keep the legacy value in the private API file during this transition. Older manifests lacking the override restore the Render URL, allowing the pinned older image to boot during application rollback. Direct/local API processes still read their own private environment as usual.

`allowlist` keeps controlled per-user admission and defaults closed. `campus` removes the per-user requirement but only admits active users through explicitly enabled, mapped, active campuses. An empty list does not switch modes. No enabled campus means no access in campus mode.

## Connect a campus once

Authenticated HQ campus PUTs store source data without creating or selecting an academy. Verify the external campus ID and the exact Cove academy UUID/slug/kind/status. Never match by name or silently remap a campus. Keep the existing isolated Daechi demo separate from real Mapo users until their identity-linking approach is agreed.

Run operator commands in a shell/container with an **explicitly exported target `DATABASE_URL`**, rollout mode, private Redis configuration and the required runtime values. The tools do not implicitly read dotenv files. Dry-run output includes database host/name and affected identity count but no passwords or tokens. In a local API directory, `node --env-file=.env.local --import tsx src/integrations/dlab/scripts/operator.ts ...` can explicitly select the configured environment.

```bash
pnpm --filter @cove/api dlab:map-campus <external-campus-id> <academy-uuid> <platform-operator-uuid>
pnpm --filter @cove/api dlab:map-campus <external-campus-id> <academy-uuid> <platform-operator-uuid> --apply
pnpm --filter @cove/api dlab:set-campus-access <external-campus-id> enabled <platform-operator-uuid>
pnpm --filter @cove/api dlab:set-campus-access <external-campus-id> enabled <platform-operator-uuid> --apply
```

Mapping and enabling are separate audited actions. The operator must be an active Cove platform Admin. Campus mode allows new users automatically after this one-time setup. Multi-campus staff get only the approved intersection of their verified OS scope. Unmapped secondary campuses receive no invented membership.

## Applying a role-mapping change

Run matching API/Studio builds with the updated shared policy. Temporarily disable new SSO entry, then run the existing `dlab:invalidate-sessions` command in the explicitly selected target environment, first dry run then `--apply`. It reconciles provisioned memberships under the new mapping and invalidates old managed sessions. Re-enable SSO entry and require a fresh `/sso/start` login. Existing user/auth/membership IDs and learning history remain; do not manually edit protected managed roles or modify OS roles to compensate for a local translation change. No new schema migration is needed for this mapping correction.

## Updates and restrictions

Public `PUT /v1/campuses/:id` and `PUT /v1/users/:id` require the independent exact Bearer key and a UUID `X-Request-Id`. Wrong/missing keys return 401 before body validation. Only narrow Caddy rewrites reach these controllers. Ordinary RPC is unchanged.

User PUTs can arrive before login and remain staged. For provisioned users, PUTs reconcile roles and memberships immediately, preserving IDs and history. Unknown roles remain stored without staff privilege. Inactive users and removed campuses lose access. Source version conflicts/stale events cannot overwrite newer source data. Reactivation after a known OS suspension requires a newer active source update and fresh login.

Local suspensions are tracked independently from OS restrictions. A local restore clears only the Cove restriction and cannot override OS/campus restrictions. The directory reports when access is still blocked. Source role changes never preserve a last manager's revoked OS privilege; operators receive a bounded event that the academy needs a manager. Local last-manager protections continue for ordinary operations.

All managed HTTP requests validate current eligibility and session generation. Academy access is checked separately for each requested campus. Role/status/scope and local restrictions invalidate old generations. Token-bound socket watchers receive change notifications and have a ten-second periodic backstop. Redis/source failure fails managed access closed. No ordinary password/social account is converted by this feature.

## Migrations and provider guard

Apply the additive `20261021100000_dlab_staff_sso` migration through the normal reviewed release workflow. It adds campus rollout/revision fields, binding restriction provenance, integration events, scope indexing and guards. Historical inactive managed memberships remain locally restricted until explicitly restored; do not guess why they were suspended.

Retain the previously installed `deploy/sql/dlab-auth-guard.sql` provider guard. Validate passwordless creation, token-hash bridge, refresh and blocked password/email/provider changes against the selected Supabase project. Managed name, grade, role and identity fields remain protected through API and database guards, including bulk/platform paths. Local preferences remain editable.

The reference asks for HttpOnly session cookies. Cove currently uses normal Supabase browser session cookies; the SSO transaction cookie is HttpOnly. Obtain explicit HQ acceptance or complete a separately reviewed server-session redesign before claiming full contract compliance.

## Test and roll out

Use the [local testing guide](dlab-sso-local-testing.md) for historical manual setup, and the [approved spec's joint test order](../superpowers/specs/2026-10-21-dlab-os-automatic-student-staff-sso-design.md#12-verification-and-acceptance) for this expansion. Automated isolated testing is documented in the implementation verification report; test doubles do not certify real HQ credentials or role codes.

1. Validate locally with disposable PostgreSQL/Redis and OS/provider doubles. Preserve ordinary login regression coverage.
2. Stage the new domain and matching API/Studio versions, apply the migration, and deploy with controlled allowlist admission.
3. Verify actual student, teacher, team-leader, manager and HQ-admin responses and campus mappings with HQ. Do not publish fixture passwords or callback query strings.
4. Enable only the verified demo campus. Temporarily disable new SSO entry, select campus mode on the API, and run `dlab:invalidate-sessions <platform-operator-uuid>` dry run then `--apply` with the new mode in its environment. The command also reconciles existing managed identities. Re-enable matching API/Studio flags.
5. A newly created OS fixture with no per-user allowlist entry must create exactly one Cove user automatically. Check correct role, campus isolation, refresh, logout, source deactivation/reactivation and old-session denial.
6. HQ exposes the student Cove card and staff shortcut at GET `https://cs.coveedu.com/sso/start`. Signing into OS alone does not automatically navigate to Cove.

`GET /v1/courses`, `PUT /v1/enrollments`, automatic class assignment and existing-account conversion remain outside this release. Do not promise the full v1.2.1 contract is complete.

## Rollback

Disable the affected campus with `dlab:set-campus-access ... disabled ... --apply`, or disable new SSO entry and invalidate managed sessions with the operator command. Keep managed policy and provider guards active and preserve all source/binding/history rows. Do not remove the migration or blindly restore the student-only image after staff memberships exist. Restore only a compatible role-aware build. Ordinary non-managed login remains available.
