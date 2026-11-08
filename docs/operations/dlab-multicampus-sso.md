# DLAB multi-campus SSO rollout

Design: [multi-campus provisioning](../superpowers/specs/2026-11-04-dlab-multicampus-sso-design.md).

## Behavior

With API-only `DLAB_AUTO_PROVISION_CAMPUSES=true`, an authenticated active HQ campus PUT creates its own academy, default non-rollout features and SSO mapping atomically. Login still uses the existing OS code exchange and campus-scoped role policy. No Cove password, per-user allowlist in campus mode, or manual academy creation is needed for future HQ branches.

The default is false. Campus metadata alone does not bypass this flag, `DLAB_SSO_ENABLED`, rollout policy, local campus disables, academy status or user restrictions. A user/login payload cannot invent a campus. Keep `DLAB_SSO_ROLLOUT_MODE=campus` for the production directory rollout. Do not reuse the inbound Bearer key as the OS client or BFF secret.

Mapped academies keep their names, slugs, courses, members, history, feature choices and local status. HQ rename updates only the source-campus name. Source inactive status revokes managed access while retaining learning data; source reactivation never clears independent local restrictions.

## Before enabling

Review every existing Cove academy and decide which exact HQ external ID belongs to it. Never match by name automatically. Existing academies must be mapped before catch-up; otherwise an unmapped active HQ campus will receive a new, empty academy.

HQ confirmed Mapo's OS ID as `e2a5b14b-64b0-4e5c-9244-969a24054699`. Its existing Cove academy UUID is `eec3d5ca-cda7-4638-8875-c871e16b5c22`. Preserve this academy instead of creating another Mapo.

Use the existing audited operator commands in the explicitly selected target environment, with an active Cove platform-admin user UUID. They default to dry-run; inspect their output before adding `--apply`:

```sh
pnpm --filter @cove/api dlab:map-campus e2a5b14b-64b0-4e5c-9244-969a24054699 eec3d5ca-cda7-4638-8875-c871e16b5c22 <operator-user-id>
pnpm --filter @cove/api dlab:set-campus-access e2a5b14b-64b0-4e5c-9244-969a24054699 enabled <operator-user-id>
```

Apply mapping first, then access. Daechi's existing mapping and access should remain unchanged. Confirm all other known existing academies before proceeding. The commands above do not connect to a default database: export the intended DATABASE_URL, rollout policy and Redis configuration explicitly. Do not borrow a development dotenv file for production.

## Deployment and the initial 30-campus catch-up

This branch does not perform live deployment or data changes. Follow the normal reviewed v2 release workflow and required human production approval. No schema migration is added by this feature.

1. Deploy the matching release with automatic provisioning still false.
2. Complete/verify existing-academy mappings, including Mapo, using the operator commands.
3. Configure `DLAB_AUTO_PROVISION_CAMPUSES=true` in the private API environment and recreate the API through the normal deployment procedure. Preserve the existing SSO switch, campus mode, secrets and Redis settings.
4. Preview already received records:

   ```sh
   pnpm --filter @cove/api dlab:provision-campuses <operator-user-id>
   ```

   Each row reports `mapped`, `inactive`, `locally-disabled` or `create`. Creation includes the stable target slug; `slugConflict=true` requires resolving that collision before apply. Confirm no known existing academy is still marked `create`.
5. Apply the reviewed catch-up with the same target/configuration:

   ```sh
   pnpm --filter @cove/api dlab:provision-campuses <operator-user-id> --apply
   ```

   Apply requires Redis. Each campus runs in a separate locked transaction and rechecks the actor/source state. Created campuses get both `campus.provisioned` events and `dlab.provision-campus` operator audit entries. A failure exits nonzero without undoing already committed campuses; inspect the error/plan and rerun safely.

The production API image contains compiled operator programs, not dev-only `tsx`. Inside the API container use the matching compiled paths, with its configured environment:

```text
node dist/src/integrations/dlab/scripts/operator.js map <external-campus-id> <academy-id> <operator-user-id> [--apply]
node dist/src/integrations/dlab/scripts/operator.js access <external-campus-id> enabled <operator-user-id> [--apply]
node dist/src/integrations/dlab/scripts/provision-campuses.js <operator-user-id> [--apply]
```

No HQ resync is necessary for the initial directory once catch-up completes. A repeated current campus PUT can also provision a staged row; a stale event cannot trigger creation. Future campuses are handled by the authenticated sync endpoint directly.

## Verify

Read-only SQL, in the correct production database:

```sql
SELECT c.name, c.external_campus_id, c.status,
       c.academy_id, c.sso_enabled, a.name AS academy_name,
       a.slug, a.status AS academy_status
FROM public.dlab_campuses c
LEFT JOIN public.academies a ON a.id = c.academy_id
ORDER BY c.name;

SELECT created_at, request_id, action, details
FROM public.dlab_integration_events
WHERE action IN ('campus.updated', 'campus.provisioned')
ORDER BY created_at DESC
LIMIT 100;
```

Perform real OS login → Cove shortcut → correct academy tests with HQ Manager/Teacher/Student accounts for Mapo and a newly created campus. Confirm existing Mapo data, correct roles, repeated login/refresh, and rejection of another academy's URL/API. OS must reuse its current account session; a remaining OS account chooser or password prompt is an OS-side acceptance issue, not something campus mapping can change.

Users initially see only the courses/classes their normal memberships and enrollments allow. Academy provisioning creates no class assignment, course enrollment, student answer or score. New empty academies are expected until staff publish content and enroll students.

## Disable and rollback

`DLAB_AUTO_PROVISION_CAMPUSES=false` stops future academy creation; existing mapped campus access remains unchanged. To revoke a campus, use the existing `dlab:set-campus-access ... disabled ... --apply` operator command, which reconciles managed identities and invalidates sessions. A later sync cannot override that explicit disable.

Keep academy/mapping/identity/history rows on rollback. The preceding API understands existing mappings; reverting images is not a request to delete new academies. Retain current SSO rollout controls and follow the normal release rollback procedure.
