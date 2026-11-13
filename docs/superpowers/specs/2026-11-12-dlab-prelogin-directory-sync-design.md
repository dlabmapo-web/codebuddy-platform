# DLAB accounts before login and campus directory synchronization

Date: 2026-11-12

Status: Implemented and locally verified on the feature branch. No production changes performed.

Branch: `feat/dlab-prelogin-directory-sync`

Base: `origin/feat/cove-studio-v2` at `6d74cfd9c2b4c38addaf62a6aa170f8c3258cb62`

## 1. Required outcome

An OS manager creates a student or staff account. OS sends an authenticated user PUT. Before Cove returns success, the real Cove user and correct academy memberships exist. Authorized managers can find that person in Members and the applicable Students/Teachers roster, and enroll or assign them to a Cove class before their first login. Later SSO reuses the same auth/user/membership IDs, preserving assignments and history.

Campus PUTs update the displayed name and effective availability of the existing mapped academy. Preserve academy UUIDs, slugs, courses, files and history. Independent Cove restrictions take precedence over upstream activation. HQ platform administrators remain platform accounts, not invented ordinary members of every campus.

HQ reports 1,818 transmitted people (1,744 students and 74 staff), HTTP 200 responses, and 113 accounts in Cove. These are reported figures, not a verified production inventory or hard-coded backfill target. HQ currently sends students in its Cove courses, all staff and all campuses, but no classes/enrollments. Cove cannot discover people HQ has not sent.

## 2. Existing behavior and scope of replacement

Verified at the base commit:

- `DlabInboundController.user` validates the current user contract and delegates to `DlabSourceService.user`.
- `DlabSourceService.user` stores a `DlabIdentity`; identical current inbound replays return early.
- `DlabReconcilerService.reconcile` returns immediately if `identity.userId` is null.
- `DlabSsoService.complete` currently creates the managed auth user, Cove user and memberships during first login.
- Campus source and academy name/status are separate fields. Multi-campus provisioning intentionally preserves mapped academy names/local status.
- Directories and class selectors read real memberships, not pending identities.

This design supersedes first-login-only account provisioning in [automatic student/staff SSO](2026-10-21-dlab-os-automatic-student-staff-sso-design.md) and mapped-name preservation in [multi-campus provisioning](2026-11-04-dlab-multicampus-sso-design.md). Retain identity isolation, approved roles, source ordering, credential guards and independent restrictions from those designs.

## 3. Selected approach

| Approach | Trade-off | Decision |
| --- | --- | --- |
| Synchronous shared provisioning | HTTP 200 confirms committed accounts/memberships. Provider failures are explicit and retryable. Reuses existing SSO provisioning/recovery. | Selected |
| Durable worker and HTTP 202 | Faster intake but requires queue operations and a pending-status contract; account availability cannot be promised on HTTP 200. | Outside this release |
| Virtual roster rows for pending identities | Smaller change, but leaves account counts, class assignment and identity-dependent screens inconsistent. | Rejected |

Extract the existing provisioning into a shared service called by inbound sync, SSO and the catch-up CLI. Create passwordless, OS-managed auth records and normal Cove accounts/memberships during sync. Do not issue a token hash, magic link, activation ticket, login session or student-session lease. Do not set `lastSignInAt` until an actual successful login.

Provider operations stay outside SQL transactions. Incomplete operations remain recoverable through the reserved UUID and durable source record. An identical retry must finish incomplete provisioning rather than returning a misleading no-op success.

## 4. Roles, records and visibility

Preserve the approved mapping:

| OS role | Primary Cove role | Effective academy roles |
| --- | --- | --- |
| student | Student | Student |
| tutor | Teacher | Teacher |
| instructor / so_staff / edu_manager | Team Lead | Team Lead, Teacher |
| lab_head | Manager | Manager, Team Lead, Teacher |
| hq_admin | Platform Admin | No invented academy memberships |

Unknown roles retain the existing conservative primary-campus Student fallback, with a bounded diagnostic; they never acquire staff/platform authority. Do not reinterpret instructor as Teacher in this work.

- Use `external_user_id` as permanent identity, the existing reserved UUID as the provider/account creation key, and existing user/membership/binding unique keys. Never merge by name, email, username or campus name. Conflicts with ordinary accounts require an explicit separate mapping decision.
- Students remain restricted to valid primary-campus scope. Staff receive only verified OS scopes. Provision all required mapped scopes atomically; a missing/conflicting required mapping is 409, not partially READY success. Do not invent an academy from user input.
- For source-eligible active users/campuses, create ACTIVE memberships. For inactive users or source-blocked mapped campuses, create/preserve restricted directory records with SUSPENDED memberships and `sourceAccessStatus=BLOCKED`; no login is permitted. A source restriction must not create a local-suspension marker.
- `User.status` represents independent Cove account restrictions, not a copied OS status. A new managed user has normal completed-profile local state; source eligibility still controls login. Preserve existing local suspension/deletion, membership restrictions and operator SSO disables. HQ reactivation cannot clear them. An existing locally deleted account remains a tombstone: sync must not recreate its removed provider credentials or substitute a fresh user; an explicitly restricted response reports that preserved state.
- Keep removed-campus memberships/history, source-blocked. Keep the existing eligible-campus/local-restriction conditions for platform Admin. Source-inactive HQ administrators receive no active platform privilege and no academy memberships.
- Ensure student profiles exist and sync only OS-owned name/grade/roles/scope/status. Preserve local numbers, guardian information, preferences, avatars and learning data. Staff do not receive Student profiles just because they have never logged in.
- Bump `peopleRevision` once per affected academy for a logical directory change, including name/grade changes. A complete identical retry adds no new membership, role row or people revision.
- Members, Students, Teachers, platform account counts and class selectors use these real records. Existing effective-role roster rules determine which staff appear in Teachers. Do not add a shadow roster.
- Managed credential/name/role restrictions must apply before first login too. Local password setup, email invitations and password reset cannot become alternate credentials for OS users. Authorized staff assign existing members through Cove's normal enrollment/teacher selectors; membership creation needs no signup application or email invitation.
- A fresh page load/refresh after HTTP 200 shows the person. Never-logged-in users retain the existing empty/never login state. Reuse server-rendered data and directory cache/revision rules; this release does not add live push into idle directory tabs or a polling timer.

## 5. Provisioning flow and concurrency

Separate source intake, provider/account provisioning, directory reconciliation and session activation. Introduce focused shared helpers inside `packages/api/src/integrations/dlab/`, rather than putting auth creation into a database transaction or duplicating the callback.

For each inbound user PUT:

1. Authenticate the exact existing Bearer key and unique UUID request header; validate body size, ID, schema and scope shape before provider work. Preserve existing SSO/rollout policy and campus verification.
2. Acquire the same per-external-user Redis lock used by SSO. All callers share a lock namespace and ownership rules. A caller already holding the lease passes its locked context; do not recursively acquire the same lock. Bound provider calls within the lease, recheck ownership before finalization, and return 503 on contention/lease loss.
3. In a short transaction with the existing global advisory-lock/source-write order, store or resolve the source and stable reserved UUID. Resolve required campus mappings in a bounded read. Keep accepted source/error evidence when a mapping is missing, return 409, and perform no provider creation for that unresolved request.
4. Verify/create the fixed managed auth identity outside SQL. Require exact UUID, placeholder email and `dlab_managed` metadata. An existing mismatched provider identity is 409. No passwords, confirmation mail or login bridge are created.
5. In a second short transaction, recheck current source revision, mappings, source availability and local restrictions. If incompatible facts changed while awaiting the provider, fail with 409 instead of applying older grants. Never overwrite a newer inactive update.
6. Create/reuse the Cove user, all required bindings/role sets/profiles and projected revision; mark READY atomically. Finish each required scope or report failure. Reuse a verified provider record after partial success; never delete a valid preexisting identity as compensation for a failed database finalize.
7. After commit, send the existing targeted session-change/revocation notifications when needed. Authorization continues to use fresh persisted eligibility and the existing bounded socket recheck backstop. Report notification failures through safe diagnostics; do not undo committed directory records or grant access on Redis failure.

Use `provisioningStatus` values PENDING, READY and ERROR, with additive nullable `projectedRevision`, `lastProvisionErrorCode` and `lastProvisionRequestId`. Error values are safe allowlisted machine codes. READY means the current directory projection is complete, including an intentionally restricted result; it does not mean login eligibility. A retry may repair PENDING/ERROR even if the source payload is unchanged.

SSO uses this service, then retains its verified code exchange, eligibility/generation, return-destination, token bridge and activation checks. Sync alone changes no sign-in timestamp/session. First/repeated SSO, user sync and CLI apply must reuse the same identity and class assignments. Local account/member restrictions, provider conflicts and source deactivation still block login.

### Source version rules

- Newer timestamps apply. Same timestamp plus canonical payload is idempotent and may repair an incomplete projection.
- Same timestamp with different payload returns 409 `conflicting_source_version`.
- Older timestamp returns 409 `stale_source_version`; no source or projection mutation. HQ must send the latest version rather than retrying old data forever.
- Preserve source timestamps and canonical hashes; never manufacture an upstream version in a replay/migration. A request UUID identifies a delivery, not the user or version.
- Legacy unversioned PUTs remain serialized in receipt order only while the stored source also lacks a timestamp. Once a source version exists, an inbound PUT missing `updated_at` cannot overwrite it and returns 400 `source_timestamp_required`. SSO's verified timestamp-free payload remains a separate path with its existing login-race/reactivation checks.

## 6. Campus names and lifecycle provenance

For a mapped HQ campus, source `name` is authoritative for `Academy.name`. Project onto the existing mapped academy; preserve UUID, slug/history, organization, contacts, features and content. Ordinary/unmapped academies are unchanged. Mapped academy-name controls show OS ownership; API guards reject changed names from local/profile/platform mutation paths while allowing unchanged-name submissions and independent profile edits.

Add nullable `DlabCampus.localAcademyRestriction`, limited to SUSPENDED or ARCHIVED. Initialize existing mapped SUSPENDED/ARCHIVED academies conservatively from their current status in the additive migration; do not assume a historical restriction was caused by OS. Ordinary ACTIVE targets have no local marker. Mapping operations also preserve the target's independent lifecycle intent.

| Local restriction | Source status | Projected Academy.status |
| --- | --- | --- |
| ARCHIVED | Either | ARCHIVED |
| SUSPENDED | Either | SUSPENDED |
| None | inactive | SUSPENDED |
| None | active | ACTIVE |

All mapped-academy lifecycle writers, including `PlatformLifecycleService`, use one projection helper and consistent lock order. Explicit local suspension records the independent marker even when OS already made the effective status SUSPENDED. Local restore while source-inactive returns a source-blocked conflict without clearing the independent marker. ARCHIVED stays terminal under existing lifecycle rules. Source activation never clears local academy/user/member restrictions or a locally disabled SSO flag.

On source availability changes, consistently update the academy projection, existing binding restrictions, access revisions/generations and events. Coordinate the existing academy-change database trigger with the reconciler so the same logical change does not accidentally double-apply generation/revision increments. After commit, revoke academy monitoring on closure, including ordinary and OS-managed participants. Name-only changes invalidate displayed names without forcing session revocation. Even a suspended/archived mapped academy can receive a source rename without reopening.

Source inactive means SUSPENDED, not archive/delete. Exclude it from active choices; retain it in authorized inactive filters with an OS-blocked explanation. Preserve classes, files, submissions, grades, points and identities. A newer active update reopens it only without an independent local restriction.

Unknown inactive campuses are stored as source-only tombstones without creating academies; return an explicit successful restricted outcome. Older active events cannot then create academies. Unknown active campus creation retains `DLAB_AUTO_PROVISION_CAMPUSES`, stable-ID slugs, slug collision checks and explicit existing-academy mapping rules. Identical current campus replay repairs projection drift; stale events cannot repair or reopen anything.

## 7. HTTP contract and diagnostics

Keep the existing authenticated routes and body fields:

```text
PUT https://api.coveedu.com/v1/users/{external_user_id}
PUT https://api.coveedu.com/v1/campuses/{external_campus_id}
Authorization: Bearer <existing independent server-only key>
Content-Type: application/json
X-Request-Id: <UUID for this delivery>
```

Retain `ok`/`id` compatibility and add narrowly validated `request_id`, `outcome`, `provisioning_status` and relevant IDs/restriction reasons. Example completed user response:

```json
{
  "ok": true,
  "id": "<cove-user-uuid>",
  "request_id": "<delivery-uuid>",
  "outcome": "applied",
  "provisioning_status": "READY",
  "membership_ids": ["<membership-uuid>"]
}
```

Use `unchanged` only for complete current projections and `applied_restricted` for fully applied inactive/locally restricted records. An inactive campus tombstone uses `source_only_inactive` and omits academy ID. HQ admin success has a user ID, not invented memberships. Keep the existing sanitized error envelope: `code`, safe `message`, optional `field`, and `request_id`.

| HTTP | Required meaning |
| --- | --- |
| 200 | The described projection is committed, or a complete idempotent/restricted result is confirmed. Active-user success never means only a pending identity. |
| 400 | Invalid ID/field/scope/request UUID/body size or missing required source timestamp. |
| 401 | Missing, duplicate or incorrect server authentication. |
| 403 | Existing authorization/rollout policy forbids the operation. |
| 409 | Stale/conflicting source version, required campus mapping missing, identity/membership/slug conflict, or source changed during provisioning. |
| 503 | Maintenance, lock contention, database/Redis/provider unavailability or incomplete provisioning requiring retry. |

Map provider rate limiting/timeouts to retryable 503, with bounded Retry-After where available. No hidden asynchronous job or login-page redirect from these endpoints. A failure can leave an accepted source or a verified provider record; do not claim cross-system rollback. Record recoverable PENDING/ERROR so the same source version can finish later.

Request events distinguish received, source accepted, provisioned/applied, restricted, stale/conflict and failed. A receipt alone is not completion. Replays must not duplicate domain-change audits. Logs/diagnostics contain safe correlation IDs, external IDs only where authorized, source/projected revisions, reason codes and outcome counts. Never log or commit request bodies, passwords, server/client/BFF keys, token hashes, auth codes, raw provider errors or private user lists.

## 8. Existing-record catch-up and HQ examples

Provide an audited dry-run-first operator CLI using the same services. Require an explicit database, active Cove platform-admin UUID, explicitly selected matching auth provider and Redis for apply. Never infer production from a developer dotenv. Support campus/user filters, bounded keyset batches, resume and safe outcome reports.

The plan records exact source/mapping IDs, existing target IDs, create/update/unchanged/restricted/conflict actions and campus name/status changes. Persist the reviewed plan digest. Apply rechecks source/local revisions and reports `plan_changed` rather than applying unreviewed changes; reruns skip already completed items. Changes produced by this plan's recorded completed items are recognized as resumable progress, not external drift. Per-user committed work survives interruption. Any unresolved requested item is reported and causes a nonzero exit.

Order: initialize local restriction provenance through migration, reconcile stored campus names/statuses, then provision stored users. Count distinct identities and existing/restricted/conflicted records; do not expect exactly 1,818 new accounts. HQ may resend current payloads after readiness; backfill and resend must converge on the same identities.

Trace the supplied examples through stored source and request events:

| Kind | External ID | Delivery request ID |
| --- | --- | --- |
| Staff | c2b443ee-dc55-494f-85d3-2c96c8f81974 | 990f45a2-a8ec-43ee-974b-a235287ae763 |
| Student | 0654aca3-4187-417b-98b2-5fc4f4a5df7d | 71675a06-fd0b-4b4f-934c-fdcef67b6c85 |
| Daechi | a8637c48-c053-4d11-89ae-b2a0bc1edd99 | c7879bff-89eb-4f00-b2a0-2540ee81da2b |

Daechi: apply the latest verified source name to the existing mapped academy currently reported as Daechi SSO Demo Academy. Preserve mapping, academy ID, slug and history. A missing/conflicting mapping needs operator resolution, not creation of another real Daechi academy.

Current sample to retain source-active: `39f763d6-7583-4840-9d39-954f83b12a2c`, subject to independent local restrictions. HQ identified these seven historical source-inactive samples:

```text
e729a2a6-4f37-47f8-b6ff-8509bfb96133
1faeb114-6b5f-440f-a5e3-92e0410f9464
db46687b-3a14-4743-bd1a-e0dc67b1627b
19e74f0a-231a-47b5-b3b1-c92f16f87604
e94762ea-4ab8-4ced-8603-327a01c6c64a
e545fbf2-a058-4dbd-9947-dbb3428663a5
56cce554-49a3-41d8-892a-cc61a3ed10fc
```

Project their latest verified names and inactive status. If stored data disagrees with this list, stop the affected plan and request HQ's latest resend rather than inventing an upstream version. Never delete or merge by name, or move their learners/history into the remaining campus. Distinct IDs remain distinct campuses; effective status fixes the duplicate-looking active list.

## 9. Performance and implementation boundaries

Follow current AGENTS.md. Do not copy the reconciler's existing per-campus lookup/deep include into the new path.

- Add a narrow joined/batched provisioning reader for identity/current user, required campuses/local restrictions and existing memberships/bindings/extra roles. Read scoped lists once, assemble in memory and pass the resolved snapshot down. No SQL inside campus/member loops, including last-manager counts.
- Use set-based/batched projection writes, people-revision/generation updates and manager-loss checks. Campus name-only PUT does not enumerate users. Availability changes reconcile affected existing bindings in a bounded set-based operation.
- Do not attempt provider creation for every pending user inside a campus PUT. Previously failed user requests finish through their retry or explicit catch-up. A successful campus response describes the campus projection, not unrelated failed user deliveries.
- Catch-up uses keyset pages, narrow projections and bounded provider concurrency starting at 1, with rate limiting/resume. No unbounded nested includes or full-population roster reads. Provider requests are measured separately from SQL.
- Preserve server-rendered Members/Students/Teachers reads and shared access/curriculum readers. No row-by-row account requests, new post-hydration dependency chain or short polling. Read relevant installed Next.js documentation before later web code changes.
- Before changing reads, measure the touched paths. Disposable-PostgreSQL integration specs must prove invariant SQL-read counts for one versus 100 staff campuses and one versus 100 roster rows. The shared projection snapshot reader should use one SELECT. Also record total emitted mutation statements, including explicit transaction/guard calls, separately; do not hide N+1 writes/reads behind SELECT-only metrics. Prisma query events do not enumerate SQL executed inside database triggers; assess trigger work separately and do not present the client count as that internal count. State measured statement-count changes in implementation commits. No count in this draft is a claimed test result.

Likely boundaries: shared DLAB provisioner/batch reconciler/reader, source service/controller/contracts, SSO callback, additive Prisma migration and guards, campus lifecycle/name writers, people/class selectors only where needed for never-logged-in managed users, cache invalidation, dry-run CLI, deployment validation/examples, and isolated tests/runbooks. No redesign of learning, grading or unrelated pages.

## 10. Verification required before release

Use disposable Docker PostgreSQL/Redis and existing OS/provider doubles with isolated configurable ports. Never run integration/performance fixtures against shared Supabase.

1. All seven role codes: PUT creates exactly one managed auth/Cove user and correct directory roles before login. HQ admin receives eligible platform authority, with no invented academy membership. Unknown fallback is non-privileged.
2. Inactive-user first arrival, inactive mapped campus and local suspension: restricted real directory records without login eligibility or incorrect local markers. Active updates do not clear local restrictions/deletion or operator SSO disables.
3. Before-first-login roster/profile/class-selector visibility, student enrollment and staff assignment; later SSO/refresh preserve the same IDs/assignments. Sync creates no session, token bridge or last-login timestamp.
4. Identical success replay, partial provider/SQL failures, concurrent PUT/PUT and PUT/SSO, lock loss, interrupted backfill/resume. No duplicates, history loss or deletion of verified provider accounts.
5. Newer inactive update while an active request awaits provider work; role demotion, scope removal/transfer, old session/socket denial and no stale reactivation. One conflicting required scope prevents partial READY success.
6. Authentication/validation, missing mappings, provider 429/timeouts, Redis/database failure and maintenance return sanitized correct non-2xx results. Identical current retries finish incomplete projection.
7. Equal-version conflicts, stale rejection, unversioned compatibility and protection of stored timestamps. Current replay repairs projection drift; older replay cannot reopen a campus.
8. Campus rename/inactive/reactivation/tombstone; stable IDs/slugs/content; local suspension/archive/SSO disable; guarded name writes; already-source-suspended manual hold and concurrent lifecycle writers.
9. Daechi and eight-sample fixtures: one active source sample and seven inactive historical projections, no merging/deletion. Unrelated academy metadata and ordinary-account login remain unchanged.
10. Query-count regression specs and a mixed 1,818-person fixture, including existing/staged/restricted/failed entries. Assert bounded reads, stable unique totals, accurate error reporting and resumability, not a fixed production population.
11. Chromium and WebKit E2E with separate manager/student contexts: manager sees/enrolls a never-logged-in student; later SSO reaches the assigned class. Cover staff assignment, campus name/status filters, refresh and other-campus UI/API denial. No live HQ passwords/private student lists in fixtures or screenshots.

After deployment, separately record real HQ checks for the example staff/student deliveries and another campus. Test doubles do not certify real HQ payloads or counts. Use an agreed test class/member or read-only views; do not change real student answers/grades for smoke tests.

## 11. Deployment and recovery

Add API-only `DLAB_DIRECTORY_SYNC_ENABLED`, default false. On the new runtime, false makes the two public inbound sync routes return authenticated 503 `directory_sync_unavailable`, not silent source-only 200. Existing SSO remains available through the matching new implementation. The gate cannot override `DLAB_SSO_ENABLED`, campus admission/rollout controls or `DLAB_AUTO_PROVISION_CAMPUSES`; enabling requires intended campus rollout mode. Include effective configuration validation and secret-free env examples.

1. Implementation requires a separate plan/review after this spec. Follow the current private AWS deployment guide for the actual target, additive schema migration, compatible API/Studio images, scans, rollback and human approval. Do not assume the old VPS remains production. No live change is authorized by writing this document.
2. Collect minimal read-only source/account/mapping/restriction/request-event evidence and private config backups. Record preserved Mapo/Daechi identifiers. Do not dump raw payloads or credentials.
3. Coordinate a brief retryable inbound-maintenance window with HQ. Apply the additive migration/provenance initialization and deploy with the gate false. Verify SSO and ordinary login; HQ retains/retries 503 deliveries.
4. Preview campus and stored-user plans, resolve mapping conflicts and review exact IDs/restrictions. Enable the gate in the selected private API environment. Apply campus reconciliation first, user provisioning second; concurrent delivery and CLI share locking/version rules.
5. Verify totals by distinct source IDs and applied/restricted/failed projections plus real membership/roster counts. Receipt counts alone are insufficient. Check preserved IDs/history. Report unresolved issues with request IDs; do not claim full completion while errors remain.
6. Agree readiness for HQ resend and verify pre-login roster → class assignment → SSO, name/status updates and historical sample closures. Commit safe aggregate evidence only. Real production acceptance is separate from local verification.

Disabling the new gate stops inbound projection with explicit retryable failures and leaves matching SSO available. It does not undo completed users/campus closures. Keep new schema/provenance and all provider/account/membership/learning records. Before reverting to an older runtime that does not understand these semantics, pause HQ deliveries or use the reviewed ingress-maintenance mechanism; a legacy image would otherwise resume misleading source-only 200 responses. Preserve campus/local restrictions and matched authorization/session behavior. Do not automatically restore demo display names, reopen source-inactive campuses or delete newly created accounts on rollback.

## 12. Non-goals and definition of done

Excluded: direct OS database access, password copying, name/email account merging, signup applications, OS class/enrollment synchronization, automatic class creation, role-map changes, granting campus managers platform Admin, deleting historical samples, session-cookie redesign and unrelated product changes.

Implementation is done when user PUT creates real accounts/memberships before login, retries and later SSO preserve IDs/history, campus updates appear with independent restrictions intact, responses/recovery pass the full matrix, and stored-record catch-up is reviewable/resumable. Production completion additionally requires its separately approved rollout and real HQ acceptance. Implementation follows the user-approved scope and the 2026-11-13 implementation plan. Production acceptance remains a separate authorized step.
