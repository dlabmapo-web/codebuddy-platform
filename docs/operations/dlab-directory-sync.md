# DLAB directory synchronization rollout and recovery

This runbook accompanies `2026-11-12-dlab-prelogin-directory-sync-design.md`.
It does not authorize a production deployment or backfill. Use the private AWS
release guide for the currently selected environment and its human approval.

## What changes

Authenticated user PUTs finish passwordless OS-managed auth records, Cove users,
academy memberships and applicable student profiles before returning 200. No
login session is issued. Campus PUTs project the OS name and availability onto
stable academy IDs and slugs. Existing local suspensions, archives, deleted-user
tombstones and operator SSO disables survive OS activation.

The additive migration `20261113090000_dlab_directory_sync` must precede the new
runtime. It conservatively marks existing mapped SUSPENDED/ARCHIVED academies as
locally restricted; reviewing an old restriction requires an explicit operator
decision. No data or learning history is deleted.

## Release sequence

1. Agree a retryable inbound maintenance window with HQ. Preserve private
   configuration backups and read-only mapping/source/request-event evidence.
2. Migrate and deploy the matching API/Studio with
   `DLAB_DIRECTORY_SYNC_ENABLED=false`. Authenticated campus/user PUTs return
   **503**, `directory_sync_unavailable`, `Retry-After: 5`. SSO remains available.
3. Verify existing OS and ordinary-account login. Check the selected database,
   auth project and Redis belong to the same deployment. Do not select a target
   from an implicit developer dotenv.
4. Review the campus/user plan below. Resolve `conflict` entries explicitly.
   Preserve existing Mapo and Daechi academy mappings; never merge by display name.
5. Enable `DLAB_DIRECTORY_SYNC_ENABLED=true` in the API only. It requires
   `DLAB_SSO_ENABLED=true` and `DLAB_SSO_ROLLOUT_MODE=campus`.
   `DLAB_AUTO_PROVISION_CAMPUSES` remains an independent control.
6. Apply the reviewed plan, campuses first. Review failures; request HQ's current
   payload for stale/missing-source cases. HQ resends and operator catch-up
   converge on the same reserved identity and membership IDs.
7. Verify distinct source/account/membership totals, restricted outcomes and
   failures. Check the real examples from the approved spec. Confirm pre-login
   roster visibility → class assignment → first SSO, and another-campus denial.
   HQ's reported 1,818 deliveries are evidence to reconcile, not a required count
   of newly created users.

For the eight sample campuses, confirm the latest stored source has one active
ID (`39f763d6-7583-4840-9d39-954f83b12a2c`) and the seven historical IDs in the
spec are inactive. Stop the affected rollout and ask HQ to resend if those facts
disagree. Rename/close their existing mapped academies; do not delete, merge or
move their students/history. The Daechi source name replaces the demo display
name while preserving its mapped UUID and slug.

## Reviewed catch-up

Export `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` explicitly through
the selected private environment, plus a human-readable `DLAB_DIRECTORY_TARGET`
label. Apply additionally requires `MONITORING_REDIS_URL` or `REDIS_URL` and the
three enabled SSO/directory/campus settings above. The auth service key is never
printed. The plan binds the database host/name and auth origin as well as the
label; inspect that target before apply.

From `packages/api`, with the source checkout:

```bash
pnpm dlab:sync-directory plan <active-platform-admin-uuid> /private/dlab-plan.json
pnpm dlab:sync-directory apply <same-platform-admin-uuid> /private/dlab-plan.json
```

The compiled release entry is
`node dist/src/integrations/dlab/scripts/sync-directory.js` with the same arguments.
Plan accepts `--campus=<external-id>`, `--user=<external-id>` and
`--batch-size=100` (1–100). A user filter still reviews campus projections before
that user. A campus filter includes users scoped to that campus.

Plan mode performs read-only keyset reads and no provider writes. The artifact
is created exclusively with mode 0600; do not commit or send this private list.
Review exact source/target IDs and name/status changes, then retain the digest.
Apply verifies the digest, target, active operator and source/local fingerprints.
It processes one provider identity at a time, with 100 ms pacing. No provider
work occurs inside SQL transactions. The final per-user projection and catch-up
completion event commit together, so interruption cannot erase completed work.

Re-run the same apply command to resume. Already completed items are checked
against their recorded post-state and skipped. External drift yields
`plan_changed`; make and review a **new** plan rather than editing its digest.
Any unresolved item makes the command exit nonzero and reports safe IDs/reasons.
Provider retries use the same reserved UUID; never compensate by deleting an
existing auth user. A completion event/audit is evidence of applied work, not a
receipt count. Plans and reports still need authorized handling because they
contain directory IDs and campus names.

## HTTP handling

Existing authenticated routes and payload fields stay unchanged:
`PUT /v1/users/{id}` and `PUT /v1/campuses/{id}`, using the existing independent
Bearer key and a unique UUID `X-Request-Id` per delivery. Successful user results
contain `id`, `request_id`, `provisioning_status: READY`, `membership_ids` and an
`outcome` of `applied`, `unchanged` or `applied_restricted`. READY confirms a real
projection, not login eligibility. Unknown inactive campuses have no academy ID
and return `SOURCE_ONLY_INACTIVE` / `source_only_inactive`.

- 400: invalid input, missing version after timestamped source, invalid scope.
- 401/403: authentication or existing rollout restrictions.
- 409: stale/conflicting source version, missing mapping, identity/membership
  conflict, or changed facts during provisioning. Resolve or resend current data.
- 503: maintenance, contention, lease loss, provider/database/Redis failure.
  Retry with the latest source and a new delivery UUID.

Use source/projected revisions, provisioning status, safe error/request IDs and
`user.provisioned` / `user.provision_failed` / `campus.projected` events to trace
completion. Never log credentials, request payloads, auth codes, provider bodies
or token hashes. The source or provider record can survive a failed request;
retrying completes it. Ordinary Cove-managed people and content remain separate.

## Recovery

Set the directory flag false to stop incoming projection with explicit 503s.
This does not reverse committed users, names or closures. Keep the additive
schema and provenance. Before reverting to an old runtime, pause HQ deliveries
or apply reviewed ingress maintenance: an old image can return source-only 200s.
Do not reopen source-inactive campuses or remove accounts as rollback cleanup.

Local PostgreSQL/Redis and provider doubles verify application behavior, not real
HQ payloads, Supabase credential-hook configuration or production acceptance.
Record those real checks separately after the authorized release.
