# Library Course Sync — Implementation Plan

Scope: [design](../specs/2026-11-18-library-course-sync-design.md) ·
[merge unit catalog](../specs/2026-11-18-library-course-sync-merge-units.md) ·
[findings](../../research/2026-11-18-library-course-sync-findings.md).
Branch: existing `feat/library-course-sync` at `53b4cfa6` during review. No production deployment
in this plan; rollout follows design §20 and gets its own runbook in phase 14.

**Review status (2026-11-18):** documentation reviewed and amended. Findings §11 records static evidence and outstanding runtime/history checks.

## Implementation status (2026-11-18)

The [publish-and-review workflow amendment](2026-11-18-library-sync-review-workflow.md)
supersedes release/history UI requirements below. Publish batches remain explicit;
academy notifications and row-level review replace the history dashboard.

The automatic-sync implementation is present on `feat/library-course-sync`
(uncommitted). The three remaining functional gaps from the earlier review are
implemented: release-backed browsing/previews, conservative existing-copy linking,
and archive guards on publication/move paths. Rollout remains disabled by default.

| Phase | State | Evidence / deliberate boundary |
|---|---|---|
| 0 | Conservative fallbacks established | Real old-copier timestamp experiment disproves timestamp equality. Historical audit coverage is unproved, so legacy identities require academy review and bases remain UNKNOWN. Catalog coverage checks persisted fields. No restored production snapshot was supplied; 64 MiB release ceiling and synthetic fixtures apply. See findings §12. |
| 1–4 | Implemented | Schema, contracts, stable item keys, SQL projection/digests, immutable releases and retained asset references. No shared database migration was performed during this continuation. |
| 5 | Implemented | Independent merge units; preserved exceptions; grouped unknown nested lists; editor-schema validation for additions and merges; PDF dependency protection; retained parent/order bases. |
| 6 | Implemented with archive-only removal | All removed rows/history are retained. Publish/show/move operations respect archived ancestry under the course lock. Archive and restore invalidate editor versions; restore preserves academy edits and earlier visibility. Physical deletion is deliberately excluded until the history-writer lock protocol is proved. |
| 7 | Implemented | Leased/fenced jobs, newest target, feature/pause gates, bounded retries, global kill switch. |
| 8 | Implemented | Listings, previews and adoption use immutable releases. Outline reader excludes private problem definitions, cases, solutions and answer keys. An unreleased master is absent from browsing; explicit initial-release CLI is available. |
| 9 | Implemented | Four-statement updates read; scoped comparisons; stale guards, grouped decisions and durable receipts. All grouped values are displayed; manual merge cannot silently acknowledge other grouped items. Structural decisions expose named placement/order and accept/keep actions. Referenced PDF decisions show live dependents. |
| 10 | Preserved by design | Sync does not regrade/reset past attempts, solved status or points. A replaced video asset starts unwatched. |
| 11 | Implemented using manual identity fallback | Counts-only platform report and atomic per-copy link; academy-only match/add/keep-deleted decisions; quarantined uncertain subtrees; UNKNOWN bases; exact-unique nested identity only; retry receipts. No guessed timestamp/cardinality/audit-absence matching. Candidate metadata is returned once rather than repeated per source node. |
| 12–13 | Implemented | Publish/copies/pause/retry controls, legacy linking, academy banner/badges, comparison/history and matching pages; English/Korean copy. Three-way HTML/code change regions, test-case tables, keyed option answer markers, media metadata/caption cards and ordered placement lists are shown without loading private content into outlines. |
| 14 | Implemented | Isolated real API/Next/Redis/PostgreSQL Playwright harness and [operator runbook](../../operations/library-sync.md). Browser acceptance passes: publish, preserve academy explanation, resolve, reload, retain student solved progress. |

**Measured read paths:** library listing 4 statements including membership access;
updates 4 (5 for a support grant); builder 15 including access and archival
metadata (+1 against its existing 14); release history 5; on-demand MC comparison
10 including access and all grouped values; legacy preview 6 (ceiling 7),
including platform access and transaction boundaries. Integration tests enforce these counts. A full
all-type application was measured at 40 statements, adoption at 52 for both small
and larger fixtures (bounded, above the provisional adoption target of 30).

**Implementation choices:** stale decisions use `CONTENT_EDIT_CONFLICT`, blocked
publishes use `CONTENT_VALIDATION_FAILED`, invalid adopted assets use
`LIBRARY_IMPORT_CONTENT_INVALID`. Meta units `@externalKey`/`@semanticVersion` and
manual asset ordering are retained. Structural conflicts retain their original
base until accepted, kept or converged. New definitions pass the same validators
as editor saves, with explicit compatibility for supported older content; an
already-existing issue cannot block unrelated corrections forever.

Final verification: 84 disposable PostgreSQL integration tests, 1 real browser
acceptance, 1,785 API unit tests, 1,702 web unit tests plus 8 new renderer checks,
152 i18n tests, typechecks and web lint (0 errors). Details and reproducible
commands are recorded in the operator runbook. The remaining
production activities are an explicit pilot rollout and measurement on an
authorized restored production snapshot; neither is performed by test commands.

## Ground rules for every phase

- Read `node_modules/next/dist/docs/` before touching web routes (`AGENTS.md`).
- Commit shape, as earlier library work did: `feat(shared)` → `feat(db)` →
  `feat(api)` → `feat(web)` → `test(e2e)`. When a phase changes a read
  path's statement count, the commit message states the count.
- **Never run `prisma migrate` without an explicit `DIRECT_URL`.**
  `packages/api/prisma.config.ts` reads `DIRECT_URL` and loads `.env`, which
  points at the shared Supabase. Integration specs run against a disposable
  Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`.
- Add `packages/api/scripts/test-library-sync.sh` in phase 1, modelled on
  `test-material-loading.sh`: labelled `postgres:17-alpine`, Supabase stubs
  (`anon`, `authenticated`, `service_role`, `auth.uid()`, `storage` tables),
  `migrate deploy` with `DIRECT_URL` set, the named specs, and cleanup on
  exit. Every integration step below runs through it.
- Verify before calling a phase done: `pnpm typecheck` at the root,
  `pnpm --filter @cove/api test` and `pnpm --filter @cove/web test` for
  touched packages, and the phase's integration specs through the script.
- Do not run `next build` for `@cove/web` while a dev server is running.
- Stop any API process on port 4000 and any temporary server before handing back.

## Phase 0 — Confirm assumptions (no product code)

Findings §11 now records the review evidence. Finish these six checks before
product code; code inspection must not be presented as a runtime experiment.

1. **Audit coverage:** extend §11.1's current-writer inventory to historical
   deployments, maintenance scripts, revision coverage and audit retention.
   Include parent-targeted reorders, container deletes and affected descendants.
   B3 stays disabled unless complete coverage is proved for that copy's
   lifetime. Missing evidence uses UNKNOWN_BASE, never an unchanged assumption.
2. **Adoption timestamps:** on disposable PostgreSQL, adopt all seven types
   and compare course/descendant/audit timestamps using the actual Prisma
   defaults. Record versions. Matching timestamps corroborate other evidence;
   a tolerance window and I5 cardinality never prove identity. The runtime experiment is recorded in findings §12; timestamp-based automatic linking is disabled.
3. **Grading comparators:** findings §11.3 verifies the static comparisons.
   Confirm the catalog's classification, including label-only edits,
   feedbackPolicy, execution limits omitted by editor comparators, and
   preserving stored semantics for a test-only update.
4. **Type-specific fields:** complete a field-by-field learner/staff/preview/
   export usage matrix for the three manual types. Findings §11.4 verifies
   manual required derivation and false creation flags for explanation/PDF/
   video; the full reader matrix is still outstanding.
5. **Referenced PDFs:** §11.5 verifies the MAIN prohibition and visible,
   READY ancestry for published references. Include cross-lecture references
   and unlinked academy PDFs in dependency test cases.
6. **Size:** measure the largest DLab master on an authorized restored
   snapshot, never shared databases: rows, test/code/HTML bytes, projected
   payload, memory and transaction times. No snapshot was measured here. If
   none is available, explicitly record that limitation and agree conservative
   supported limits and synthetic fixtures rather than claim production parity.

Done when all six have evidence or a documented conservative fallback. Also
settle concrete structural base encoding, history-writer/material locking,
asset retention/cleanup and lease fencing per design §§5, 10, 12 and 14.
Do not defer these architecture choices until rollout. Statement counts in
§19 are targets until integration measurement includes the final paths.

## Phase 1 — Schema, shared contracts, vocabulary

**Files**
- `packages/api/prisma/schema.prisma`, plus a new migration
  `2026111800xxxx_library_course_sync`
- `packages/shared/src/library-sync/` (new): `schemas.ts`, `status.ts`,
  `unit-keys.ts`, `index.ts`
- `packages/shared/src/errors/codes.ts`, the curriculum audit action list,
  and both locale catalogues
- `CONTEXT.md`: Release, Copy, Node, Unit, Base/Ours/Theirs, Conflict
- `packages/api/scripts/test-library-sync.sh`

**Steps**
1. Add the models in design §5. Add the partial unique indexes in raw SQL:
   one `PENDING` job per copy, and one `OPEN` conflict per
   `(copy_course_id, node_key, unit_key)`, plus non-null local-link uniqueness.
   Include structural bases, VALUE/ABSENT/UNKNOWN checks, archive visibility
   metadata, grouped conflict membership, asset retention references and
   durable resolution receipts. Define FKs, tenant consistency and service-only
   access; snapshot values contain private answers.
2. Add `sync_key uuid NOT NULL DEFAULT gen_random_uuid()` to
   `exercise_test_cases`, `exercise_hints` and
   `programming_exercise_solutions`, with `UNIQUE (parent, sync_key)`. The
   default backfills existing rows.
3. Add `LIBRARY_COURSE_SYNC` to `AcademyFeature`.
4. Shared: schemas for release, sync state, conflict, change and link report,
   and `courseSyncChip(state)`, the one derivation every surface uses. Add
   unit tests for every chip state.
5. Register the error codes and the audit actions
   `content.library_release.published`, `content.library_sync.applied` and
   `content.library_sync.conflict_resolved`, so
   `curriculum-audit-vocabulary.spec.ts` passes.

**Checks:** `prisma validate`; the migration applies cleanly on a fresh
disposable database through the script; shared tests pass.

## Phase 2 — Stable item identity and editor invariants

**Files:** shared content/solutions schemas; `course.service.ts`,
`exercise-solutions.ts`, `content-import.service.ts`, `course-tree-copy.ts`;
web exercise draft hooks; all structural/manual/media editor paths as needed.

1. Serialize `syncKey` for cases, hints and solutions. Extend strict payload
   schemas explicitly; web editors round-trip keys through edits and reorder.
   Duplicating an item mints a new server key.
2. Keep supplied keys only if valid and unique for the parent; reject forged
   or duplicate keys. For old-client payloads without keys, preserve identity
   only with proved item correspondence, never by index after an insertion,
   deletion or reorder.
3. Apply the same policy to Excel imports. If mapping cannot be proved,
   persist an unverified-list-lineage marker and use conservative list-level
   comparison/review until reconciled. Define this marker and its recovery
   explicitly before coding the fallback. A workbook without keys does not
   establish identity by position.
4. `copyCourseTree` copies known `syncKey`s verbatim. Backfilled random keys
   on old rows do not establish lineage between existing master/copy rows.
5. Audit common course-lock acquisition before mutation on every writer,
   preserving optimistic checks. Removals record tombstones transactionally.
   Track local delivery overrides needed by removal decisions; guard archived
   ancestry in publication, moves, edits and learner access.

**Tests:** valid keys survive independent edits/reorders; duplicate/foreign
keys are rejected; old-client and Excel insert/reorder cannot misidentify an
item or discard academy work. Test tombstones and archive guards, and retain
existing editor/import regression coverage.

## Phase 3 — Catalog and projection

**Files:** `packages/api/src/library-sync/catalog/*.ts` (one file per
material type plus `structure.ts`), `catalog-completeness.spec.ts`,
`projection.ts`, `projection.integration.spec.ts`, `hash.ts`, `values.ts`.

**Steps**
1. Encode the catalog doc as data: unit key, fields, kind, manual-merge flag,
   grading flag, rule ids, and asset-reference extractors (lesson images,
   choice images, manifests).
2. Write the completeness test (catalog §6) first. It fails until every
   field is classified.
3. Write the projection as one SQL statement per course in the style of
   `readCurricula`. It returns small fields raw and SQL `sha256` digests for
   large ones, joins `library_sync_links` for copies, and translates local
   references (design §7.1).
4. `hash.ts`: digest form, then canonical JSON, then sha256. The same
   function serves masters and copies.
5. `values.ts`: insert values with `ON CONFLICT DO NOTHING` and fetch by
   hash, one statement each. Persist full values for every newly referenced
   local hash as well as release hashes; count batched value reads. Version/
   type-tag digest tokens, structural absence/unknown and local references.
   No unrestricted hash lookup endpoint.

**Tests:** a copy linked by a fixture projects identically to its master
(phase 8 repeats this for real adoptions). One statement per projection,
independent of fixture size. Unit hashes are stable across key order and
whitespace-free JSON differences.

## Phase 4 — Releases

**Files:** `library-sync/release.service.ts`, `platform-library.router.ts`,
the `platform-library` contract, and `release.integration.spec.ts`.

**Steps**
1. `publishUpdate` per design §6.1: lock, compare revisions, project, store
   values, write release/nodes/retention references, enqueue jobs with one
   `INSERT … SELECT … ON CONFLICT … DO UPDATE`, audit. The switch controls
   draining, not persistence of targets. Reconcile targets when rollout gates
   are enabled and recheck the academy flag before application.
2. `releaseDraft`: change summary against the last release, computed from
   hashes only.
3. `releases` listing with rollout counts, read from `course_sync_states`
   in one statement.
4. Backfill command for release 1 (`pnpm --filter @cove/api library:initial-releases`),
   idempotent.
5. Extend PDF/video/caption and applicable image/manual cleanup/cancellation
   to honor retained release/base/conflict assets under the same asset locks.
   This is required before releases are enabled, even with fan-out off.

**Tests:** a stale revision and a no-change publish are both refused. The
snapshot is coherent while an editor write waits on the lock. Statements
≤ 10 as a provisional target, independent of course size. Publishing twice
coalesces pending jobs. A release-only old asset survives cleanup after the
working tree changes and remains usable for adoption and comparison.

## Phase 5 — Merge engine (pure)

**Files:** `library-sync/merge/units.ts`, `lists.ts`, `order.ts`,
`structure.ts`, `plan.ts`, `validate.ts`; extracted validators moved out of
`course.service.ts`, `manual.service.ts` and `video.service.ts` into pure
modules that both the editors and sync import.

**Steps**
1. `units.ts`: the five rules of design §8.1, including unknown base.
2. `lists.ts`: keyed item merge (design §8.2).
3. `order.ts`: per-parent order merge with anchored insertion (design §9.2).
   Equal concurrent reorders converge; missing anchors and simultaneous
   insertions have deterministic fallbacks and retain all local nodes.
4. `structure.ts`: presence, removal, archive candidates, parent-missing,
   restore (design §9.1).
5. `validate.ts`: validate materials and the merged course dependency graph.
   Hold back contributing library units/structure, group conflict membership,
   and revalidate to a fixed point. Cover removed MC options with local wording,
   removed PDFs with surviving references, and removed parents/local moves.
6. Extract each editor validator without changing its behavior. The existing
   editor specs are the regression proof.

**Tests:** table-driven, with no database:
- every row of design §8.1, §8.2, §9.1 and §9.2;
- the design §1.1 example as one fixture, asserting six applies and one
  conflict;
- the requirement cases: the programming instructions kept while test cases
  apply; the same explanation text changed on both sides raises a conflict
  and nothing else is blocked; both sides changed to the same value
  converges; an MC option text fix and an answer-key change do not conflict;
- every cross-unit rule failing and holding back exactly its units.

## Phase 6 — Writer

**Files:** `library-sync/writer.ts`, `writer.integration.spec.ts`, and a
set-based variant of `rewritePositions` in `content-positions.ts`.

**Steps**
1. Apply a plan in one transaction: `lockCourse`, re-project ours under the
   lock, merge, validate, fetch only the needed values, then write with one
   statement per table and operation kind (`UPDATE … FROM jsonb_to_recordset`,
   `createMany`, `deleteMany`).
2. Bump per-type `revision` / `updatedAt` on touched materials, and the
   course's `contentRevision` once per run.
3. Grading (D2): bump `gradingRevision` for effective grading changes and roll
   progress rows forward in one statement. Preserve semantic version for
   test-only changes. No reset, repair enqueue or historical grade change.
4. Answer keys (D1): write `ManualMaterial` JSON directly. Mint local option
   ids for new library options and update `optionMap`.
5. Additions (D3): insert visible. Give a fresh key on an `externalKey`
   clash.
6. Removal (design §10): use the proved history-writer/material lock protocol,
   then batched history/dependency checks. Delete or archive with persistent
   ancestry/visibility metadata. Reintroduction merges from pre-archive bases
   and restores saved visibility. Revoke monitoring and invalidate through
   the existing event/cache path after commit.
7. Asset rule (design §12): lock PDF and video assets in id order and
   require `READY`.
8. Write `library_sync_changes`, update `course_sync_states` (counts,
   `lastSyncedContentRevision`), keep `Course.sourceContentRevision` and
   baseline metadata accurate, and write one system audit row. `AuditInput`
   currently requires a string actor; add a deliberate background-system
   audit path with null actor and no inherited support grant. Activate
   divergence-aware summary readers before enabling sync.

**Tests (disposable PostgreSQL):**
- the design §1.1 scenario end to end, with a course of all seven types;
- row counts of submissions, grading cases, manual submissions and
  assessments, drafts, video progress, views and feedback are unchanged;
- a `SOLVED` progress row stays `SOLVED` at the new revision; a new
  submission grades against new cases;
- an MC key change applies on a published question with attempts, and old
  assessments keep their definitions;
- a removed material with submissions is archived, not deleted;
- an injected failure mid-run rolls back everything, and a retry produces
  the same result; a second run is a no-op;
- an editor save racing a run is refused with `CONTENT_EDIT_CONFLICT`, never
  overwritten;
- an old in-flight grading result cannot overwrite rolled-forward progress;
  no-op/conflict-only runs do not bump authored revisions;
- view/draft/watch creation racing removal retains history; archive guards
  prevent accidental republication; restoration preserves local edits and
  saved visibility; a replaced video asset starts unwatched while same-asset
  caption edits preserve completion;
- statement budgets of design §19: no-op ≤ 6, with changes ≤ 45, on a small
  and a large fixture alike.

## Phase 7 — Jobs

**Files:** `library-sync/sync-job.service.ts`, `library-sync.module.ts`,
`config/env.schema.ts` (`LIBRARY_SYNC_ENABLED`, `LIBRARY_SYNC_CONCURRENCY`),
and `sync-job.integration.spec.ts`.

**Steps:** a `SKIP LOCKED` claim, a two-minute lease with heartbeat, the
recovery tick, backoff and the eight-attempt limit, `FAILED` surfacing,
`requestDrain()` after publish, `retrySync`, `pauseSync`/`resumeSync`, and the kill switch
(design §14).

Implement per-copy serialization, conditional lease fencing, monotonic
release advancement and latest-target reconciliation on gate activation.

**Tests:** two drainers never run one job twice; an expired lease is
reclaimed; a newer release retargets a pending job; a job behind a
long-held course lock retries rather than hangs; with the kill switch off,
jobs wait.
Also run N/N+1 on separate workers in reversed order: state never regresses;
expired workers cannot commit; completing N cannot clear pending N+1; the
academy rollout flag prevents writes even when the global switch is on.

## Phase 8 — Adoption from releases

**Files:** `academy-library.service.ts`, `academy-library.service.spec.ts`,
and the library e2e fixture.

**Steps:** `adopt` materializes the latest release through the writer's
insert path, inside its own transaction, and writes the state and links.
Hold the master publish lock until linkage is durable, preventing missed
fan-out. Include course language and deliberate academy title overrides.
Update academy library available/preview paths to read the latest release,
not working-tree counts, language, descriptions or material content.
The adoption visibility policy is unchanged.

**Tests:** existing adoption specs pass with their assertions retargeted to
the release. A working-tree edit after the last release does not reach a
new copy. Available/preview match the adopted release and reveal no draft
changes. A fresh copy has zero divergent units except deliberate adoption
customizations such as an academy-selected title. Concurrent adoption/publish
cannot leave a copy behind without a pending latest target.

## Phase 9 — Conflicts API and resolution

**Files:** `library-sync/conflict.service.ts`, `academy-library-sync.router.ts`,
the contract, and `conflict.integration.spec.ts`.

**Steps:** list, compare (values rendered per unit kind), and resolve
(design §13), with stale guards, request-key idempotency, the asset rule on
manual merges, audit, and re-evaluation by later runs (converged, obsolete,
or retargeted).

Persist resolution receipts, reject changed payloads under the same key,
check all grouped members' expected hashes, and authorize value/asset reads
through the copy/conflict rather than the global hash.

**Tests:** keeping the academy version stops the conflict from returning on
the next release that leaves the unit unchanged, but a new library change
raises it again. A stale resolve is refused. A manual merge that fails the
editor schema is refused. Statements: page ≤ 4, resolve ≤ 12.

## Phase 10 — Explicit regrade boundary (downgrade follow-up deferred)

Content sync never calls regrade, resets counters, or changes historical
attempts. Preserve existing `curriculum.regrade` and platform authorization.
Verify that an in-flight old-revision grading result cannot overwrite
rolled-forward progress and that ordinary sync enqueues no repairs.

The original enqueue-time progress reset is removed. A later, separately
scoped regrade improvement must apply a successful repair atomically, fence
against newer definitions/submissions, recompute the intended aggregate,
preserve progress on errors/cancellation, and keep history/points intact.
Do not claim that this sync feature makes regrade lower sticky SOLVED results.

## Phase 11 — Existing copies

**Files:** `library-sync/legacy-link.service.ts`, integration specs, and the
console/academy procedures in design §17.

1. Implement identity tiers I1–I5 with corroborated one-to-one lineage.
   Reused keys, shared assets, same-type singleton candidates, and timestamps
   alone are insufficient. I4/I5 candidates require academy review unless
   independently proved. Console reports expose counts only.
2. Recover bases B1–B4 per content/structural unit. Use copier-version-aware
   normalization. Keep B3 off without proved lifetime audit/revision coverage.
   Audit absence cannot establish old content, deleted nodes or sibling order.
3. Map MC options and case/hint/solution keys only from proved corresponding
   same-version definitions or corroborated unique item matches. Equal length
   never proves positional correspondence; unresolved lists get unknown bases.
4. Quarantine ambiguous source nodes and dependent subtrees pending academy
   decisions (match / academy-owned / keep deleted). Do not create duplicates
   by treating unmatched historical source nodes as fresh additions. Allow
   unrelated proved nodes to sync.
5. Dry-run reports include expected release, copy revision and evidence hash.
   Validate under master/copy locks before committing links, explicit
   VALUE/ABSENT/UNKNOWN bases, option maps and state. A stale report is refused.
6. `resolveLink` is academy-authorized, idempotent and stale-guarded. A manual
   identity selection does not manufacture historical base values.

**Tests:** each tier and unknown fallback; reused external keys; multiple
materials sharing one asset; deleted/recreated nodes; two explanations in one
lecture; local deletions/additions/moves; unchanged versus historically
unproved copies; MC reorder and equal-length-but-different case lists; a
concurrent edit after dry-run; no duplicates before ambiguous review; no
academy values in console responses.

## Phase 12 — Console

**Files:** `packages/web/src/app/(platform)/admin/content/library/[courseId]/page.tsx`,
`_components/library-copies-panel.tsx`, `library-table.tsx`, new
`publish-update-dialog.tsx` and `releases-panel.tsx`, and `platform-library`
locale files.

**Steps:** a release state chip and **Publish update** (summary, warnings,
note); a releases panel with rollout counts; copies panel columns plus
**Retry**, **Pause** and **Resume**; the existing-copies link report with **Link copies**. Counts
only, never academy content (D12).

## Phase 13 — Academy

**Files:** `content/courses/_components/courses-table.tsx`, the builder header
and row components, a new route `content/courses/[courseId]/library-updates/`,
compare renderers under `packages/web/src/components/library-sync/`, and a
new `library-sync` page namespace (en, ko).

**Steps**
1. Course list chip from `courseSyncChip`. Extend the existing summary read
   so it adds no statement, and remove the old provenance chip.
2. Builder banner and row badges, from one extra read started in parallel
   (`Promise.all`).
3. The library updates page: needs decision, history and unmatched.
4. Compare renderers per unit kind: HTML (rich-text frame and text diff),
   code diff, test-case table, MC options with correct markers, file map,
   PDF and video asset cards. Resolve actions with consequence text.
5. Read the main data during the server render (`server-read.ts`).

**Tests:** component tests per renderer; statement counts for the course
list (+0) and the builder (+1); i18n payload budget tests in
`@cove/i18n` (`locales.spec.ts`) pass.

## Phase 14 — End to end and runbook

1. Playwright: head office publishes; the academy sees applied changes and
   one conflict, resolves it by keeping its own version, and the next
   release does not raise it again; a student keeps their solved problem.
2. `docs/operations/library-sync.md`: enabling the kill switch and feature
   flag, reading job failures, retrying, pausing, the legacy linking
   procedure, and rollback (switch off; data stays consistent because every
   run is atomic).
3. Final checks: root typecheck, all touched unit suites, every library-sync
   integration spec through the script, the e2e run, and a record of the
   statement counts. Stop temporary servers and leave port 4000 free.

## Dependency order

```
0 → 1 → 2 → 3 → 4 ─┬─► 5 → 6 → 7 ─┬─► 9 → 13
                   │               ├─► 8
                   │               ├─► 10
                   │               └─► 11 → 12
                   └───────────────────► 12 (publish UI can start after 4)
                                                     14 last
```

Phases 1–4 can ship with draining disabled after asset retention is safe.
Release targets persist while `LIBRARY_SYNC_ENABLED` is off. Reconcile the
latest release on gate activation; no copy may miss updates published while
it was disabled. Content sync does not depend on the deferred regrade follow-up.
