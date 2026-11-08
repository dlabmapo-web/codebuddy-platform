# DLAB OS multi-campus SSO provisioning

## Purpose

Allow people at every verified HQ campus to enter their own Cove academy from OS using their existing OS account. HQ owns campus IDs, names, source status, user identity, role and campus scope. Cove owns academy mapping, local restrictions and the ordinary teaching/learning data.

The work is isolated on `feat/dlab-multicampus-sso`, in a separate worktree based on local `feat/cove-studio-v2` at `7f50870d` (the fetched remote v2 commit `0ae56bc6` plus one documentation commit). The monitoring worktree is not changed, switched, stashed or merged.

## Current evidence

On November 4, 2026, production received 30 authenticated `campus.updated` events and retained 30 active campus records. Daechi alone is mapped and enabled. HQ confirmed that OS campus `e2a5b14b-64b0-4e5c-9244-969a24054699` is Mapo. Its existing Cove academy is `eec3d5ca-cda7-4638-8875-c871e16b5c22` (`dlab-mapo`). These are identifiers, not credentials.

The inbound controller already validates an independent Bearer secret, UUID request ID and campus payload. The source service stores campus information but does not create academies. Login already provisions managed users and inherited role memberships after the campus gate passes. The existing operator CLI maps campuses and changes SSO access with dry-run, active platform-admin checks, source locking, reconciliation and session invalidation.

## Scope

- Provision on authenticated campus sync; no new HQ endpoint or payload is required.
- Create academies for active HQ records that have no mapping or explicit local disable.
- Preserve existing mappings and data; explicitly map Mapo before processing already-synced campuses.
- Supply an audited, dry-run-first catch-up command for the 30 existing source records.
- Preserve inactive status, local academy suspension/archive, operator SSO disables, account restrictions, role policy and campus isolation.
- Reuse the existing authorization-code login, membership reconciliation and managed-session revocation.
- Document release configuration, one-time mapping/catch-up and real-login acceptance.

No monitoring UI, role changes, automatic course enrollment, teacher assignment, ordinary-account conversion, OS session implementation or production deployment is included in this branch.

## Approaches and decision

1. **Provision during authenticated campus sync (selected).** The directory establishes trust before login, and each campus is created once in a short transaction. Existing records need a catch-up command.
2. Provision during first login. This adds creation to a latency-sensitive path, complicates concurrent first logins and cannot supply the missing trusted campus metadata by itself.
3. Keep manual mapping for every campus. Lowest code impact, but each future campus would need Cove operator intervention and would repeat the current failure.

## Trust and configuration

Add API-only `DLAB_AUTO_PROVISION_CAMPUSES`, default false. With it enabled, an active record accepted by the existing authenticated campus endpoint is a verified HQ campus. No browser-supplied ID, name, SSO user payload or campus name match can create an academy. The feature does not change the global SSO switch or allowlist/campus rollout gate.

Only validated current source state may be provisioned. A stale update cannot reactivate a campus or replace newer metadata. A duplicate accepted campus payload can complete previously missing provisioning after the feature is enabled. Conflicting equal-version payloads retain the existing rejection.

When false, campus sync retains today's behavior. Disabling this flag stops future provisioning; it does not revoke existing user access or delete academies. Existing SSO switches and operator access commands control admission and revocation.

## Provisioning transaction

A small reusable provisioning unit runs under the existing `cove:dlab:write` transaction lock, with no network calls inside the transaction.

1. Read the authoritative stored campus.
2. If already mapped, preserve the academy, its name/slug/profile/features/history and the campus SSO flag. A later sync must never undo an operator disable or reactivate an archived/suspended academy.
3. If source status is inactive, leave it staged without an academy.
4. If an operator has explicitly disabled SSO (`ssoEnabledAt` is non-null and `ssoEnabled` is false), do not create/enable an academy. This distinction permits provisioning older staged rows whose default false was never an operator decision.
5. Resolve the platform organization using the existing configured organization helper.
6. Create one ACTIVE ACADEMY with the HQ campus name and Asia/Seoul defaults. Use a stable URL-safe slug derived from the complete external ID digest, independent of the mutable name. Check both current and retired slugs; never attach a colliding academy. Report a conflict instead.
7. Insert the same non-rollout feature defaults as ordinary academy creation. Do not enable rollout-only features or overwrite existing feature choices.
8. Atomically link the source record, enable initial campus SSO and increment its access revision. System-origin work has no fabricated human actor; record a `campus.provisioned` integration event with campus and academy IDs and the request ID where available.
9. If source status or mapping eligibility changed, reconcile affected identities using the current generation/revision and source access rules. Pending identities remain passwordless and are provisioned as users only through a fresh successful login. Notify existing revocation mechanisms after commit.

An error rolls back source changes, academy creation, defaults, mapping and events together. Existing source retries, the integration lock, and unique academy/campus bindings prevent duplicate creation. Unrelated ordinary academy creation retains its own slug conflict protections.

## Existing academies and catch-up

Never guess an academy from its name or slug. Before catch-up, link Mapo with the existing `dlab:map-campus` command using the HQ-confirmed external ID and existing academy UUID, then enable it with `dlab:set-campus-access`. Keep Daechi unchanged. Review any other existing academy associations before applying catch-up.

Add `dlab:provision-campuses <platform-operator-id> [--apply]`:

- Require explicit database selection, active platform admin and provisioning flag enabled; apply also requires Redis.
- Default to a read-only plan showing every record as already mapped, locally disabled, inactive or create, with target slug and source identifiers.
- Before apply, print/review the plan to ensure all known existing academies are mapped. The command must not create or rename anything in dry-run.
- Process each eligible campus in its own locked transaction; re-read state before each mutation. Avoid one long transaction for the whole directory.
- On apply, use the same provisioning unit as inbound sync, reconcile affected managed identities, record the human operator catch-up audit and publish revocation notifications. Repeated runs are harmless.
- Report failures without credential values and return a nonzero exit code. Already committed per-campus work remains visible and a rerun resumes safely.

This command is a release data operation, not an automatic schema migration or a request to change live data during implementation.

## Login and tenant isolation

The entry link stays `https://cs.coveedu.com/sso/start`. Existing OS authorization-code exchange establishes the identity; the source campus must be active, linked to an active ACADEMY and admitted by rollout policy. Only the identity's source campus scope can yield memberships. Existing primary-campus landing and campus-switching behavior is retained. A requested return destination cannot cross tenant scope.

Keep the current HQ mapping: student → Student; tutor → Teacher; instructor/so_staff/edu_manager → Team Lead; lab_head → Manager; hq_admin → Platform Admin. Inherited staff grants and academy-wide manager/team-lead teaching access remain as implemented on v2. Login creates no course enrollment, assignment or student submission.

OS must reuse the logged-in OS account at its authorization endpoint. Cove cannot remove an OS account chooser or credential prompt on its own.

## Lifecycle

- Campus inactive: deny/revoke managed access through existing reconciliation and session-generation rules; preserve academy data.
- Campus active again: reconcile eligible memberships, retain local suspensions and require a fresh login. Do not override an explicit campus SSO disable.
- Campus rename: update source name only after mapping; preserve the Cove-managed academy name and URL to avoid silently undoing local branding.
- Local academy suspension/archive: continue denying access; source sync never restores it.
- Source user role/scope/status updates: retain existing policy and revocation; no role accumulation or cross-campus fallback.
- Locally disabled mapping: subsequent sync and catch-up do not re-enable it.

## Verification

Use new disposable PostgreSQL/Redis containers; do not read development dotenv credentials or mutate production during tests. No browser flow changes are required.

Required integration coverage:

1. Disabled flag preserves storage-only sync, including authenticated controller behavior.
2. New active campus creates exactly one academy/mapping with expected feature defaults and event.
3. Concurrent/duplicate PUTs and catch-up retries never create a second academy; replay after enabling the feature provisions older staged state.
4. Inactive, stale and conflicting source updates never incorrectly grant access; later active state provisions an unmapped campus.
5. Existing Mapo-like mapping keeps academy UUID, courses, members, slug, feature choices and local status.
6. Explicit disable, suspended/archived academy and local membership/account restrictions remain effective after replay/reactivation/catch-up.
7. Current and retired slug collisions fail atomically without source or academy partial writes.
8. Manager, Team Lead, Teacher and Student first/repeated logins use the correct new campus; another campus and foreign return URL remain inaccessible. HQ Admin policy is unchanged.
9. Deactivation revokes existing managed sessions; a fresh allowed-campus login retains unrelated eligible access.
10. Operator dry-run performs zero writes; apply requires a valid platform operator, feature flag and Redis, uses the same rules, audits and repeats safely.

Run API typecheck/build, DLAB unit/integration/controller/config tests, deployment config checks, and the isolated SSO browser suite where available. Record test doubles separately from real HQ acceptance.

## Release and completion criteria

1. Commit spec and implementation on the isolated branch; leave monitoring changes untouched.
2. Review and merge through the existing v2 release workflow with matching API/Studio; this task does not deploy or enable production automatically.
3. Review the production directory and exact existing-academy mappings. Map/enable Mapo using the audited commands before catch-up.
4. Configure `DLAB_AUTO_PROVISION_CAMPUSES=true`, retain current campus rollout mode and credential separation. Deploy only after the ordinary release approval.
5. Run catch-up dry-run, inspect the plan, then apply explicitly. Check mapped/active/enabled state and verify ordinary accounts and Daechi still work.
6. Perform real OS → Cove login with HQ accounts from Mapo and a newly provisioned campus, checking role, academy isolation, repeated login and OS-session reuse. These results cannot be claimed from test doubles.
7. Future authenticated active-campus sync provisions without a per-user allowlist or per-campus operator command. Class enrollment and teaching content remain separate from login.

Rollback stops further provisioning with the flag, and uses existing campus access disable/session invalidation controls if needed. Preserve created academies and user/history rows; reverting an image is not a deletion or identity conversion operation.
