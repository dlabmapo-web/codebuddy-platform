# Library Course Sync — Publish Once, Update Every Copy

**Date:** 2026-11-18
**Status:** Design review incorporated on 2026-11-18; documentation only, implementation deferred. D1–D3 retain the decisions recorded by the original draft. §24 records review defaults, not additional product-owner confirmations. Runtime gates remain in plan Phase 0.
**Scope:** Linking every academy copy to its library master, publishing library releases, three-way merging them into copies, conflict review, and migrating copies taken before this feature.
**Supersedes:** §1.2 and §16 ("Not a merge, diff, or re-sync system") of the [content library design](2026-09-03-content-library-design.md), and §12 of the [adopted course readiness design](2026-09-04-adopted-course-readiness-design.md).
**Companions:**
- [Codebase findings](../../research/2026-11-18-library-course-sync-findings.md): the evidence behind every "today" claim below.
- [Merge unit catalog](2026-11-18-library-course-sync-merge-units.md): every authored field of every material type and how it merges.
- [Implementation plan](../plans/2026-11-18-library-course-sync-implementation.md).

## Implementation decisions recorded on 2026-11-18

The implementation uses the conservative alternatives already allowed by this
design. Existing copies are linked one course at a time; uncertain node identity
requires academy matching, adding or keeping deleted. Uncertain subtrees are
quarantined and content/structural bases remain UNKNOWN. No historical audit
absence, timestamp equality or candidate cardinality enables automatic matching.
Exact-unique nested content can preserve item identity without inventing a base.

Listings/previews/adoption read the latest immutable release. Removed content is
always archived, with guarded publication/moves and version invalidation, until
physical-deletion locking is independently proved. Structural conflicts retain
named parent/order bases; decisions use the complete live course fingerprint.
Grouped unknown case/hint/solution/option decisions display all affected values
and accept/keep the group atomically. PDF dependency decisions show the live
referencing exercises and refuse acceptance while references remain.

New additions and merged material definitions use editor validators, with explicit
compatibility for supported older definitions. Existing invalidity is grandfathered
only for the same pre-existing issue, never as a blanket schema exemption. Test/key
corrections preserve historical grades/points and solved state; replacing the video
asset resets completion for the new asset, as the default in §24 specifies.

See the [implementation status](../plans/2026-11-18-library-course-sync-implementation.md)
and [operator runbook](../../operations/library-sync.md) for verification and flags.

## 1. Summary

Head office publishes a library course update once. Every academy copy of
that course receives it automatically in the background. Where an academy
has changed the same content differently, the academy's version stays,
the item is flagged, and an academy editor decides. Nothing else waits on
that decision.

```
 CONSOLE (library master)               BACKGROUND                       ACADEMY COPY
 edit freely (working tree)
 [Publish update]  ─► Release 8 ─► one sync job per copy ─► three-way merge per unit
   immutable snapshot              (durable, leased,          base   = release the copy last synced
   of every unit                    retried, coalesced)       ours   = the copy as it is now
                                                              theirs = release 8
                                                                │
                                          ┌─────────────────────┼──────────────────────┐
                                     library-only          academy-only          both, differently
                                     → apply               → keep                → keep + conflict
```

### 1.1 The example, walked through

An academy adopted "Python Level 1", which holds all seven material types.
It then rewrote the programming problem's instructions and the explanation's
text. Head office publishes release 8 with seven changes:

| Library change | Academy changed it too? | Outcome |
|---|---|---|
| Explanation text corrected | Yes, differently | Academy text kept, **conflict** on `explanation.body` |
| Video replaced | No | New video applied |
| Programming test cases updated | No (academy changed only `description`) | Cases applied; academy instructions kept |
| PDF replaced | No | New PDF applied |
| Turtle starter code changed | No | Applied |
| Written-response answer and grading changed | No | Applied in place, future attempts only (D1) |
| MC options and correct answer changed | No | Applied in place, future attempts only (D1) |

One conflict and six applied changes in one transaction. Students keep every
submission, grade and progress record. Students who already solved the
programming problem still show it as solved (D2). An academy editor opens
**Library updates**, compares the three explanation texts, and picks one or
writes a merged version.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Answer-key changes apply in place**, even on a live question with attempts. Past attempts keep their snapshotted key and grade; there is no automatic regrade. Library sync is the one writer allowed past the editor's answer-key lock. | Confirmed by product owner. Attempts already freeze their definition (findings §6), so history is safe. Matches how programming test cases behave. |
| D2 | **A synced grading change keeps solved problems solved.** `gradingRevision` increments; progress rows roll forward without resetting results. New submissions use the new rules. Only a separately requested regrade may revise results; never clear progress merely to enqueue repairs (§11). | Recorded product decision. The requirement preserves progress and separates regrading. An academy's own editor behavior is unchanged. |
| D3 | **Library additions arrive visible**: modules, lectures and every material type. Adoption keeps its current visibility policy. | Confirmed by product owner. Visibility stays academy-owned after arrival. |
| D4 | **A release is an explicit act.** Head office keeps editing the master's working tree; nothing propagates until **Publish update** records an immutable release. Adoption copies the latest release, never the working tree. | "Unfinished draft edits should not propagate." Today every edit to a published master is live to new adoptions (findings §1.2). |
| D5 | **The unit of merge is a field group, not a material.** Each material type is split into independent units (catalog doc). Conflicts are per unit. | "Two changes are not conflicting merely because they belong to the same material type." |
| D6 | **Fields that must change together form one unit**: an MC question's structure and answer key, a video and its captions, a test case's input, output and scoring. Cross-unit rules are checked after merging, and a failure becomes a conflict, never invalid content. | "Group related fields where necessary to keep content valid." |
| D7 | **Base is stored per copy as a release pointer plus exceptions.** Units in an open conflict keep their older base; everything else advances with the release. | Lets "keep academy" still compare future releases correctly, at near-zero storage per copy. |
| D8 | **Visibility, delivery and student data are never synced.** Course, module, lecture and material `isVisible`, class assignments and student records stay academy-owned. | The library has no students. Its flags mean nothing (readiness design §4.1). |
| D9 | **Content with student history is archived, never deleted, by sync.** | Deleting a material cascades away progress, views and watch history (findings §6). |
| D10 | **Durable database jobs, drained in the API process**, with leases, retries and coalescing. This follows the `ShortAnswerService` pattern. | The work is database-only. The job row is the visible status and the audit anchor. |
| D11 | **Existing copies are linked by evidence, never by title or position alone.** Ambiguous matches are quarantined for academy review; absence of an audit row alone never proves unchanged content. | Identity and historical base are separate questions. Existing keys and assets are useful evidence, not universal proof of lineage. |
| D12 | **Head office never sees academy content.** The console shows states and counts only. Conflict values are shown only to the copy's own editors. | Keeps §15 of the content library design: head office learns *that* a branch edited, never *how*. |

## 3. Vocabulary

| Term | Meaning |
|---|---|
| **Master** | A library course: a `Course` in a `LIBRARY` academy. |
| **Working tree** | The master's current rows, edited live by head office. |
| **Release** | An immutable, numbered snapshot of a master's content, taken by **Publish update**. |
| **Copy** | An academy course linked to a master. |
| **Node** | A course, module, lecture or material. Its **node key** is the master row's id. |
| **Item** | An entry inside a keyed list: test case, hint, solution, MC option, turtle source file, attachment. Keyed by `syncKey`, option id, path or asset id. |
| **Unit** | The smallest thing compared and merged: one field or a declared field group of one node (catalog doc). It has a **unit key** such as `exercise.description` or `exercise.testCase:<syncKey>`. |
| **Base / ours / theirs** | The last acknowledged upstream value for this unit / the copy now / the target release. Kept academy customizations can differ from base. Conflicted units retain an older base. |
| **Conflict** | An open decision on one unit (or one node's presence or placement) that sync could not make. |

These terms go into `CONTEXT.md` with the first commit (plan phase 1).

## 4. Architecture

```
packages/shared/src/library-sync/        DTOs, status derivations, unit-key grammar
packages/api/src/library-sync/
  catalog/                 declarative unit catalog, one file per material type
  projection.ts            course → nodes + unit hashes, one SQL statement per side
  values.ts                content-addressed value store read/write
  release.service.ts       Publish update: snapshot + fan-out
  merge/                   pure three-way merge (units, keyed lists, order, structure)
  validate.ts              post-merge invariants, reusing editor validators
  writer.ts                applies a plan in one transaction, set-based
  sync-job.service.ts      durable job drain: claim, lease, retry, coalesce
  conflict.service.ts      list, compare, resolve
  legacy-link.service.ts   link copies taken before this feature
  *.router.ts              oRPC procedures (§17)
```

The merge core is pure: plain hashes and structure in, a plan out. It is
unit-tested exhaustively without a database. The projection and the writer
are the only modules that touch tables, and they share one catalog, so a field
cannot be compared without also being written, or written without being
compared.

## 5. Data model

All additive. Prisma sketches; final names follow `schema.prisma` style.

```prisma
/// An immutable published version of a library master.
model LibraryRelease {
  id                     String   @id @default(uuid()) @db.Uuid
  libraryCourseId        String   @map("library_course_id") @db.Uuid
  number                 Int                                   // 1, 2, 3 … per master
  /// The master's contentRevision when captured: "unpublished changes" is
  /// master.contentRevision > latest release.libraryContentRevision.
  libraryContentRevision Int      @map("library_content_revision")
  note                   String   @default("")                 // ≤ 500 chars, shown to academies
  publishedByUserId      String   @map("published_by_user_id") @db.Uuid
  publishedAt            DateTime @default(now()) @map("published_at") @db.Timestamptz(6)
  nodeCount              Int      @map("node_count")
  @@unique([libraryCourseId, number])
  @@map("library_releases")
}

/// One node of one release: where it sits and the hash of every unit.
model LibraryReleaseNode {
  releaseId    String  @map("release_id") @db.Uuid
  nodeKey      String  @map("node_key") @db.Uuid               // master row id
  kind         String                                          // COURSE | MODULE | LECTURE | MATERIAL
  materialType MaterialType? @map("material_type")
  parentKey    String? @map("parent_key") @db.Uuid
  ordinal      Int                                             // 0-based among siblings
  /// { "<unitKey>": "<sha256>" }, including keyed-list items and their order units.
  unitHashes   Json    @map("unit_hashes")
  @@id([releaseId, nodeKey])
  @@map("library_release_nodes")
}

/// Content-addressed canonical unit values. Append-only; shared by releases,
/// legacy bases and manual resolutions.
model LibrarySyncValue {
  hash      String   @id                                       // sha256 of the digest form (§7.3)
  value     Json
  byteSize  Int      @map("byte_size")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@map("library_sync_values")
}

/// One copy's link to its master, and where its sync stands.
model CourseSyncState {
  courseId                  String   @id @map("course_id") @db.Uuid        // the copy
  libraryCourseId           String   @map("library_course_id") @db.Uuid
  linkMethod                String   @map("link_method")                   // ADOPTED | LEGACY_LINKED
  /// Last release fully processed. Null only between legacy linking and the first sync.
  baseReleaseId             String?  @map("base_release_id") @db.Uuid
  targetReleaseId           String?  @map("target_release_id") @db.Uuid    // newest release seen
  status                    String                                          // IDLE | PENDING | RUNNING | FAILED | PAUSED
  openConflictCount         Int      @default(0) @map("open_conflict_count")
  divergentUnitCount        Int      @default(0) @map("divergent_unit_count") // ours ≠ base after last run
  lastSyncedContentRevision Int?     @map("last_synced_content_revision")
  lastRunAt                 DateTime? @map("last_run_at") @db.Timestamptz(6)
  lastErrorCode             String?  @map("last_error_code")
  @@index([libraryCourseId])
  @@map("course_sync_states")
}

/// Master node → copy row. Course-scoped, so moves inside the copy keep it.
model LibrarySyncLink {
  copyCourseId String  @map("copy_course_id") @db.Uuid
  nodeKey      String  @map("node_key") @db.Uuid
  kind         String                                          // MODULE | LECTURE | MATERIAL
  localId      String? @map("local_id") @db.Uuid               // null once removed locally
  /// LINKED | LOCAL_DELETED | ARCHIVED | DETACHED | CLOSED
  state        String
  /// ADOPTED | EXTERNAL_KEY | ASSET_IDENTITY | FINGERPRINT | PROVENANCE_UNIQUE | MANUAL
  evidence     String
  /// MC option map { libraryOptionId: localOptionId }; legacy match details.
  meta         Json    @default("{}")
  @@id([copyCourseId, nodeKey])
  @@index([copyCourseId, localId])
  @@map("library_sync_links")
}

/// Exceptions to "base = baseRelease". Present for units in an open conflict,
/// and for every linked unit of a legacy copy until its first sync completes.
model LibrarySyncBase {
  copyCourseId String  @map("copy_course_id") @db.Uuid
  nodeKey      String  @map("node_key") @db.Uuid
  unitKey      String  @map("unit_key")
  baseState    String  @map("base_state")                      // VALUE | ABSENT | UNKNOWN
  baseHash     String? @map("base_hash")                       // required only for VALUE
  @@id([copyCourseId, nodeKey, unitKey])
  @@map("library_sync_bases")
}

model LibrarySyncJob {
  id              String    @id @default(uuid()) @db.Uuid
  copyCourseId    String    @map("copy_course_id") @db.Uuid
  targetReleaseId String    @map("target_release_id") @db.Uuid
  status          String                                        // PENDING | RUNNING | SUCCEEDED | FAILED
  attempts        Int       @default(0)
  nextAttemptAt   DateTime  @default(now()) @map("next_attempt_at") @db.Timestamptz(6)
  leaseId         String?   @map("lease_id") @db.Uuid
  leaseUntil      DateTime? @map("lease_until") @db.Timestamptz(6)
  lastErrorCode   String?   @map("last_error_code")
  summary         Json?                                         // counts by outcome
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  finishedAt      DateTime? @map("finished_at") @db.Timestamptz(6)
  // Partial unique in SQL: one PENDING job per copy, so a newer release retargets it.
  @@index([status, nextAttemptAt])
  @@map("library_sync_jobs")
}

model LibrarySyncConflict {
  id              String    @id @default(uuid()) @db.Uuid
  copyCourseId    String    @map("copy_course_id") @db.Uuid
  nodeKey         String    @map("node_key") @db.Uuid
  unitKey         String    @map("unit_key")                   // content or reserved structural unit
  /// CONCURRENT_EDIT | UNKNOWN_BASE | REMOVED_UPSTREAM_EDITED_LOCALLY |
  /// EDITED_UPSTREAM_DELETED_LOCALLY | REMOVED_UPSTREAM_HAS_LOCAL_CONTENT |
  /// PARENT_MISSING | PLACEMENT | INVALID_RESULT | AMBIGUOUS_LINK
  kind            String
  baseHash        String?   @map("base_hash")
  oursHash        String?   @map("ours_hash")
  theirsHash      String?   @map("theirs_hash")
  theirsReleaseId String    @map("theirs_release_id") @db.Uuid
  detail          Json      @default("{}")                     // validator message, coupled units
  status          String                                        // OPEN | RESOLVED | OBSOLETE
  resolution      String?                                       // ACCEPT_LIBRARY | KEEP_ACADEMY | MANUAL | CONVERGED
  resolvedHash    String?   @map("resolved_hash")
  resolvedByUserId String?  @map("resolved_by_user_id") @db.Uuid
  resolvedAt      DateTime? @map("resolved_at") @db.Timestamptz(6)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  // Partial unique in SQL: one OPEN conflict per (copyCourseId, nodeKey, unitKey).
  @@index([copyCourseId, status])
  @@map("library_sync_conflicts")
}

/// What one sync run did, per unit. The academy's "History" tab.
model LibrarySyncChange {
  id           String   @id @default(uuid()) @db.Uuid
  jobId        String   @map("job_id") @db.Uuid
  copyCourseId String   @map("copy_course_id") @db.Uuid
  releaseId    String   @map("release_id") @db.Uuid
  nodeKey      String   @map("node_key") @db.Uuid
  unitKey      String   @map("unit_key")
  /// APPLIED | KEPT | CONVERGED | CONFLICT | ADDED | REMOVED | ARCHIVED | MOVED | RESTORED
  outcome      String
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@index([copyCourseId, createdAt(sort: Desc)])
  @@map("library_sync_changes")
}
```

Columns on existing tables:

| Table | Column | Purpose |
|---|---|---|
| `exercise_test_cases`, `exercise_hints`, `programming_exercise_solutions` | `sync_key uuid NOT NULL DEFAULT gen_random_uuid()`, unique per parent | Stable item identity across replace-all saves (findings §1.4). Copies carry the master's key verbatim, so no item map is needed. |
| `AcademyFeature` enum | `LIBRARY_COURSE_SYNC` | Per-academy rollout gate (§20). |

Required persistence beyond the sketches above (include in Phase 1):

- `LibrarySyncLink.localId` must be unique within `(copyCourseId, kind)`
  when non-null. Deleting a local row records a tombstone transactionally;
  no dangling id is interpreted as a new library addition.
- Persist structural bases (`presence`, parent, and sibling order), including
  legacy bases and conflict exceptions. `@presence`, `@parent`, and
  `@order:<parentKey>` are distinct reserved units; `@node` alone cannot
  represent simultaneous presence and placement conflicts. Store canonical
  structure values in the value store. Absent and unknown bases are distinct
  states, enforced with check constraints.
- Add `LibrarySyncAssetReference`, unique by owner snapshot/value and asset
  identity, covering PDF, video, caption, manual and lesson-image assets.
  Retained releases, conflict/base values, and resolution values pin assets.
  Typed relations or cleanup checks must prevent physical deletion.
- Add a durable resolution receipt keyed by `(copyCourseId, requestKey)`,
  with actor, canonical request hash and result identity. Reusing a key for a
  different request is rejected. Record multi-unit conflict membership so
  coupled units cannot acquire overlapping open decisions.
- Archive metadata records local visibility immediately before archival and
  per-unit bases for restoration. New models need real foreign keys,
  tenant/course consistency checks, and explicit deletion policies. Immutable
  release node keys intentionally survive deletion of working-tree rows.

Delete actions, as built: a copy's sync state cascades from its copy *and*
from its master, and its base/target release references are set null; jobs
and conflicts cascade from their release. A master still cannot be deleted
while any copy names it, because `Course.sourceCourseId` is `RESTRICT`; these
actions only matter when master and copies go together, where `RESTRICT`
(checked row by row) made the order of one statement's deletes decide success.

Kept for compatibility and updated by sync: `Course.sourceCourseId`,
`sourceContentRevision` (set to the applied release's
`libraryContentRevision`) and `baselineRevision`. Do not reset the baseline
after retaining local customizations and then report the copy as uncustomized.
Switch old readers to the sync state's divergence calculation in the same
activation release; the old integer comparison cannot represent preserved
customizations accurately.

## 6. Releases

### 6.1 Publish update

`platformLibrary.publishUpdate({ courseId, note, expectedContentRevision })`,
with permission `platform.library.manage`:

1. Lock the master (`SELECT … FOR UPDATE` on `courses`, the editors' lock), so
   the snapshot is coherent.
2. Refuse if `expectedContentRevision` is stale (`LIBRARY_RELEASE_STALE`) or
   nothing changed since the last release (`LIBRARY_RELEASE_NO_CHANGES`).
3. Project the working tree (§7), validate the complete release, and refuse
   invalid definitions, broken references or non-READY assets. Fetch full
   values only for new hashes under the same lock. Insert values, asset
   retention references (§12), the release row and nodes atomically.
4. Enqueue one job per linked copy in one statement:
   `INSERT … SELECT … ON CONFLICT (copy_course_id) WHERE status = 'PENDING' DO UPDATE SET target_release_id = …`.
5. Audit `content.library_release.published` with `{ number, nodeCount, changedUnits }`.
6. After commit, wake the drain (§14). Persist jobs even while the global
   drain switch is off; filtering by academy rollout gate is enforced again
   at claim and execution. Enabling the gate reconciles every eligible
   copy's target with the latest release, so no publication is missed.

Releases require the master to be published and not retired. Unpublishing
stops adoption, not sync. Retiring stops new releases; copies keep their last
state and read **Retired by head office**.

### 6.2 What head office sees before publishing

The console computes the change summary against the previous release from
hashes alone: "4 materials changed · 1 added · 0 removed", with types. It
also repeats the existing quality warnings (`problemsWithoutTests`, assets
not ready), because a release reaches every branch. No academy data appears
on this page.

### 6.3 Adoption copies a release

`academyLibrary.adopt` materializes the latest release into a new course
through the writer's insert path (base = ∅, ours = ∅, theirs = release). It
writes the `CourseSyncState` and links in the same transaction. This closes
two defects at once: adoption no longer copies unpublished edits, and it no
longer reads its source outside its transaction (findings §2). The adoption
visibility policy is unchanged (D3 covers only later additions). A master
published before this feature gets release 1 on first publish, or from the
backfill (§15.1). Hold the master's publish lock while selecting the latest
release and creating the copy's link/state. A concurrent publish must either
include that copy in fan-out or finish before adoption selects its release.

`Course.language` is a creation-time input taken from the release. If an
empty master later changes language family, an existing copy is never
silently reinterpreted: incompatible additions raise a language conflict.

Academy library listing and preview must use the same latest release as
adoption, including language, counts and outline/content. Otherwise draft
edits still leak through preview even though adoption is release-based.
The console's authoring view continues to read the working tree.

## 7. Projection and hashing

### 7.1 Nodes and units

The projection turns one course into `{ nodeKey, kind, materialType,
parentKey, ordinal, units: Map<unitKey, hash> }[]`. For a master, node keys
are row ids. For a copy, node keys come from `LibrarySyncLink.localId`.
Rows without a link are **local** (academy-created) and are projected only so
order merging can place around them.

Archive and deletion tombstones participate in structural projection. An
unlinked academy PDF referenced by a local customization uses a namespaced
`local:<id>` reference, never a missing/null master reference.

Units are declared in the catalog doc. Before hashing, the projection
translates the copy's local references to master keys:

| Local reference | Translated through |
|---|---|
| `ProgrammingExercise.referencePdfMaterialId` | link of the referenced PDF material |
| MC option ids in `options[].id` and `correctOptionIds` | `LibrarySyncLink.meta.optionMap`; unmapped local options keep `local:<id>` |
| Test case, hint, solution identity | `syncKey`, identical on both sides |
| Asset ids (PDF, video, captions, manual, lesson images) | none: shared and immutable |

### 7.2 One statement per side

The projection is one raw SQL statement per course, in the style of
`readCurricula` (`packages/api/src/learn/curriculum-read.ts`), joining
`library_sync_links` for copies. It returns small fields raw and **digests**
of large fields (`encode(sha256(convert_to(col, 'UTF8')), 'hex')`): test
input and output, code, HTML bodies, file contents. The API never pulls an
8 Mi test case to decide that it did not change.

### 7.3 Hash definition

`unitHash = sha256(canonicalJson(digestForm(unit)))`. In the digest form,
large strings are replaced by their SQL digest, objects use sorted keys, and
absent optional values are `null`. The same TypeScript function hashes the
master at release time and the copy at sync time, so equal hashes mean equal
content. Full values are stored once per distinct hash in
`library_sync_values`, and the writer and the conflict screen fetch them by
hash in one `IN` query, only for the units they need.

Include catalog version, unit kind and digest markers in the canonical form;
a literal string must not collide with a digest token. Normalize database
JSON null and absent optionals deliberately, but do not trim authored text
or code. Structural absence is distinct from an unknown base. Every hash
referenced by a release, base, conflict or resolution must have its full
value persisted in the same transaction. The hash-only projection needs a
separate batched value read for new/changed local hashes, included in §19's
budgets. Unknown legacy structure is never invented.

## 8. Merging units

### 8.1 The five rules

For every unit present in base, ours and theirs:

| Case | Rule | Outcome | Base afterwards |
|---|---|---|---|
| `ours = theirs` | both agree (including both unchanged) | **CONVERGED** (no write) | theirs |
| `ours = base ≠ theirs` | only the library changed | **APPLIED** | theirs |
| `theirs = base ≠ ours` | only the academy changed | **KEPT** | theirs (= base) |
| all three differ | both changed differently | **CONFLICT**: keep ours | unchanged (exception row) |
| base unknown, `ours ≠ theirs` | legacy copy without evidence (§15) | **CONFLICT** `UNKNOWN_BASE`: keep ours | unknown |

"Both changed different, independent fields → merge" needs no special case:
different fields are different units, and each takes its own row.

### 8.2 Keyed lists

Test cases, hints, solutions, MC options, turtle source files and asset
manifests merge per item, keyed by `syncKey`, option id, path or asset id.
Each list has two kinds of unit: one per item (its content) and one for the
list's order.

| Item in base | in theirs | in ours | Outcome |
|---|---|---|---|
| no | yes | no | add the library item |
| no | no | yes | local item, kept |
| yes | no | unchanged | remove it |
| yes | no | no | both deleted; converge |
| yes | no | changed | conflict `REMOVED_UPSTREAM_EDITED_LOCALLY` on the item |
| yes | unchanged | no | preserve the academy's deletion |
| yes | changed | no (academy removed it) | conflict `EDITED_UPSTREAM_DELETED_LOCALLY` on the item |
| yes | yes | yes | §8.1 on the item's content |
| no | yes | yes | equal values converge; different values under the same key conflict (add/add) |

Order merges with the same algorithm as node siblings (§9.2). Positions are
then rewritten densely. Example: the academy adds a sample case while the
library corrects the expected output of case 3. Both land, and no conflict
is raised.

An unknown legacy list base is not an empty list. Until item lineage is
proved or reviewed, use one explicitly marked unknown list unit; never
match changed rows merely by their current position. This applies equally
to replace-all editor saves and Excel imports (plan phase 2).

### 8.3 Groups and cross-unit rules

Some fields only make sense together, so they form one unit (D6): an MC
question's structure with its answer key, a video with its captions, a case's
input with its output and scoring, an exercise's limit set. The catalog doc
lists every group and its rationale.

Rules that span units are checked after the merge, on the merged material,
by the same validators the editors use. These are extracted into pure
functions where they are inline today (plan phase 5):
`assertGradingSupported`, `assertLanguageGrading`, `multipleChoiceSchema`,
the `saveManualSchema` refinements, `saveVideoSchema` refinements, soft
versus hard time limits, the reference PDF rule and the course title rule.
When a merged result fails, hold back contributing library-side units and
structural operations, then revalidate to a fixed point. A rule can span
nodes: removing or archiving a PDF used by a surviving exercise, deleting an
MC option whose wording was edited locally, or removing a parent containing
a locally moved child must not bypass conflict handling. Preserve the
affected academy content. A grouped conflict records every affected unit
key; unrelated changes still proceed. If no valid plan can be derived,
roll back the run rather than write invalid content.

### 8.4 Side effects of applying a unit

| Unit class | Side effect, same as the editor's |
|---|---|
| any content of a material | bump that type's `revision` / `updatedAt`, so open editors and learner workspaces see a conflict and reload |
| grading-relevant (catalog column) | §11 |
| anything | bump the copy's `Course.contentRevision` once per run, so stale import previews are refused |
| hide, archive, delete | `revokeCourseMonitoring` after commit |

No-op and conflict-only runs do not bump authored-content counters. Content
changes invalidate the existing learner/editor cache or event channel after
commit; job completion alone must not leave an open workspace showing an
obsolete definition indefinitely. Do not add fast polling.

## 9. Structure

### 9.1 Presence

| Base | Theirs | Ours | Outcome |
|---|---|---|---|
| — | present | — | **ADDED** at its merged place, visible (D3), and linked. A key clash with a local `externalKey` gets a fresh key (the manual-create convention) and is logged. |
| present | — | present, untouched | **REMOVED**: deleted, or **ARCHIVED** if it has student history (§10) |
| present | — | present, edited, or holds local children | conflict `REMOVED_UPSTREAM_EDITED_LOCALLY` / `REMOVED_UPSTREAM_HAS_LOCAL_CONTENT`; left in place |
| present | present | deleted locally | theirs equal to base: stays deleted. Changed: conflict `EDITED_UPSTREAM_DELETED_LOCALLY` (Restore / Keep deleted) |
| present | — | deleted locally | link closed |

"Untouched" means every unit of the node and of its descendants equals base,
and no local node sits beneath it.

D3 does not publish an academy-hidden course or override a hidden ancestor.
New material definitions, references and target-academy feature support must
validate before arrival; unsupported additions are held for review, not
silently exposed or partially inserted.

It also includes placement and academy-owned delivery changes: a local move
or intentional visibility override is not discarded by an upstream removal.
Check the merged descendant graph before removing a container. New library
children under a locally deleted/archived parent get `PARENT_MISSING`; do
not recreate that parent silently. A surviving exercise's reference to a
removed PDF blocks that removal and raises a dependency conflict. Detaching
retained content as academy-owned is explicit, with a tombstone preventing
later releases from duplicating it.

### 9.2 Placement and order

Each node has a placement: its parent and its order among siblings.

- **Parent** merges by §8.1. A library move into a parent the academy
  deleted becomes `PARENT_MISSING`, and the node stays where it is.
- **Order within a parent** is computed per parent:
  1. If the academy has not reordered that parent's linked children (their
     relative order in ours equals base), take the library's order.
  2. If the library has not reordered them, keep the academy's order.
  3. If both chose the same relative order, converge without conflict. If
     both reordered differently, keep the academy's order and raise one
     low-severity `PLACEMENT` conflict for the parent.
  4. Library additions are inserted after their nearest preceding library
     sibling. Local nodes keep their position relative to their own
     preceding sibling.
- Compare relative order on surviving shared keys, excluding pure additions,
  removals and moves out. If an anchor disappears, use the nearest surviving
  predecessor, then successor, then a deterministic boundary. Simultaneous
  inserts preserve each side's internal order with a library-before-local
  tie-break. Never lose or duplicate a sibling.
- Positions are rewritten with a set-based two-pass update (park above max,
  then `1..n`) for all affected parents in two statements per table. This
  replaces the per-row `rewritePositions` loop on this path (findings §9).

## 10. Archival policy

A node **has student history** if any of these exist for it or its
descendants: `Submission`, `StudentExerciseProgress`, `ExerciseDraft`,
`ExerciseSolveSession`, `ManualSubmission`, `ManualDraft`,
`VideoWatchProgress`, `StudentMaterialView`, `TeacherFeedback`,
`StudentHelpRequest`, and `TeacherMonitoringVisit`. Include indirect history
and stable source-id references where a live FK was detached. Check this in
one batched statement over all candidates. History-producing writers must
synchronize with removal on the same material rows (or an equivalent
protocol) and revalidate availability after waiting. The course lock alone
does not serialize watch checkpoints, views and drafts.

| Library removes… | No history | Has history |
|---|---|---|
| a material | delete it, with the editor's delete semantics | **archive**: `isVisible = false`, link `ARCHIVED`, builder badge "Removed by head office · kept for student work". Never deleted by sync. |
| a lecture or module | delete it if every descendant was deletable and none is local | archive the container; archived and local descendants stay inside it |

Archival is persistent sync state, not merely a visibility toggle. All
publication, move, editor and learner paths must respect archived ancestry;
staff can inspect history but cannot accidentally republish an archived node.
Normal editor deletion remains subject to its own rules.

If a later release reintroduces the same node key, compare it with the last
upstream values before archival and the retained local rows. Preserve edits
made while archived, conflict on overlapping changes, and restore the saved
local visibility only after dependencies are valid. Reintroduction is not a
new D3 addition and must not turn an academy-hidden item visible. Previously
deleted rows without history can be recreated with fresh local ids and the
existing source key; locally rejected/deleted nodes remain tombstoned.

## 11. Grading, progress and regrade

**Programming exercises (D2).** When a run applies any grading-relevant unit
of an exercise (tests, limits, grading profile, submission policy, manual
assessment, language, quiz):

1. `gradingRevision += 1`, and `gradingSemanticVersion` is recomputed as the
   editor does for a changed profile (`course.service.ts:1426-1436`); a
   test-only change must not silently upgrade the stored semantic version.
2. One statement rolls `StudentExerciseProgress.gradingRevision` forward for
   rows at the previous revision. Status, attempts, best score and solved
   time are untouched.
3. Submissions, grading cases, reviews and points are untouched.
4. New submissions snapshot the new rules at admission, as they already do.
5. The stale-problem board (`regrade.service.ts`) lists the problem when eligible
   latest submissions sit below the current revision. Existing
   platform operators or academy actors with `curriculum.regrade` may request
   regrade explicitly within their existing scope.

**Explicit regrade.** Sync does not call regrade or reset progress. The
existing grader already fences late results by the current authored grading
revision (`grading.service.ts:646-648`), which must remain covered by tests.
`nextProgress` is sticky even for repairs, so lowering a result needs an
explicit repair-completion policy, not a reset in `RegradeService.start`.
Never erase a solved status, attempt count or score merely because repair
jobs were enqueued: failed/cancelled repairs would leave students reset.

Implement and test atomic successful repair completion separately before
claiming downgrade support: verify the target grading revision and that no
newer student submission supersedes the planned one; preserve prior progress
on errors/cancellation; recompute the intended aggregate from authoritative
attempts rather than blindly accepting a stale repair. Historical attempts
and awarded points stay intact. This follow-up is not required to enable
content sync; existing permissions and editor behavior remain unchanged.

**Multiple choice and written response (D1).** Answer-key units apply in
place: the `ManualMaterial` JSON is updated and `revision` increments. Past
`MultipleChoiceAssessment` and `ShortAnswerAssessment` rows keep their
frozen definitions, verdicts and scores, and pending short-answer evaluations
finish against their own snapshot. A student's current state is still
computed from their latest attempt, so a correct answer under the old key
stays correct. The editor's lock still applies to academy edits. The sync
writer does not call `ManualService.save`; it enforces the type's other
validation through `validate.ts`.

**Video.** Replacing a video's media follows today's editor semantics:
watch progress is keyed by asset, so the new video starts unwatched and old
progress rows are retained. This is the explicit Q1 exception: preserving
history does not transfer completion to different media. Caption, title or
instruction changes on the same asset must not reset watch completion.
Scoring/threshold-only changes retain the current watch-policy snapshot
behavior; changing that policy needs a separate decision.

## 12. Assets and reference authorization

Lesson images, manual assets, choice images, video instruction images and
captions are authorized by being referenced (findings §7). Sync therefore
adds references only under this rule:

> A unit written by sync may reference an asset only if the asset appears in
> **theirs** (the master references it), in **ours**, or in **base**, or the
> asset is owned by the copy's course. A manual resolution follows the same
> rule. Captions must belong to the lesson's video asset. PDF and video assets
> are locked `FOR UPDATE` and must be `READY`, as in `copyCourseTree`.

Copies keep pointing at library-owned immutable assets, as adoption does.
Existing cleanup counts live document/lesson references, not release-only
references. Extend PDF cleanup, video cleanup/cancellation, and applicable
image/manual cleanup before enabling releases. A release can be the sole
reference after the working tree replaces an asset, before any academy uses
it. Persist snapshot retention references under cleanup's asset locks. Pin
assets for unresolved conflicts, bases and manual resolutions too. Indefinite
release retention implies indefinite asset retention for now.

Retention does not grant access. Hashes and asset ids are not capability
tokens: fetch only through an authorized release/copy/conflict. Signed URLs
and compare previews reauthorize within that scope; never offer unrestricted
hash-value lookup. Solutions and answer keys remain staff-only, and platform
link reports contain no academy values.

## 13. Conflicts and resolution

### 13.1 Lifecycle

- **Opened** by a run, with base, ours and theirs hashes and the release.
  At most one open conflict per unit (partial unique index).
- **Re-evaluated** by every later run. If theirs now equals ours, it closes as
  `CONVERGED`. If the library reverted to base, it closes `OBSOLETE` and the
  academy keeps its value. If theirs changed again, the same row is updated
  to the newer release.
- **Resolved** by an academy editor:

| Action | Content write | Base becomes | Available for |
|---|---|---|---|
| Use library version | theirs, through the writer and validators | theirs | every unit |
| Keep my version | none | theirs, so the library change is acknowledged | every unit |
| Merge manually | the submitted value, validated with the editor's schema and the asset rule | theirs | text, HTML, code and file units; keyed lists (pick per item) |
| Restore / Keep deleted / Keep as academy content | structural action | per §9 | presence conflicts |

Setting base to theirs on every resolution is what stops the same conflict
returning. The next release is compared against what the academy has
already seen.

### 13.2 Safety

A resolve request carries `expectedOursHash`, `expectedTheirsHash` and a
`requestKey`. It runs under the course lock and refuses with
`LIBRARY_SYNC_CONFLICT_STALE` if the academy edited the unit or a newer
release arrived. A repeated request key returns the first result from the
durable receipt (§5), after rechecking authorization; a different payload
under the same key is rejected. Check expected hashes for every member of
a grouped conflict. Each
resolution writes an audit row `content.library_sync.conflict_resolved` with
the action and the hashes, never the content.

### 13.3 What blocks what

A conflict holds back only its own unit. Units coupled to it by a cross-unit
rule (§8.3) are held back only when that rule actually fails. Additions
under a conflicted node still land.

## 14. Background execution and reliability

- **Claim:** `UPDATE library_sync_jobs SET status='RUNNING', lease_id=…, lease_until=now()+'2 min' WHERE id = (SELECT id … WHERE status='PENDING' AND next_attempt_at <= now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …`.
  This claims a job across instances; it is not by itself a per-copy fence.
- **Drain:** `LibrarySyncJobService` uses the `ShortAnswerService` shape:
  `requestDrain()` after publish, plus a recovery tick (30 s) for expired
  leases and other instances' work. Concurrency is one job per instance by
  default (`LIBRARY_SYNC_CONCURRENCY`). The kill switch is
  `LIBRARY_SYNC_ENABLED`; jobs wait while it is off.
- **One run = one transaction per copy:** lock the copy course, project ours,
  read base and theirs, merge, validate, write, record changes, update state,
  audit. The transaction timeout is 60 s, and `SET LOCAL lock_timeout = '5s'`
  makes a run that meets a held course lock fail fast and retry with backoff.
- **Idempotent by construction:** a run recomputes its plan from persisted
  state. A failed attempt rolls back entirely. A repeated attempt after
  success finds `base = theirs` and does nothing.
- **Retries:** exponential backoff from 30 s to 1 h, eight attempts, then
  `FAILED`. A failure is visible to head office (fan-out) and to the
  academy ("Sync failed · head office has been told"), with **Retry** in the
  console.
- **Coalescing:** a newer release retargets a pending job. Merging base to
  release 9 directly is correct, so intermediate releases need not be
  replayed.
- **Fencing and monotonicity:** after obtaining the course lock, verify the
  current job lease token and expiry, copy/master organization, rollout gate,
  pause state and current applied release number. A stale worker cannot
  commit content or completion status after losing its lease. Serialize
  active work per copy; an older target that runs after a newer target is a
  no-op and cannot move the base backwards. Pending-target upserts and state
  updates only advance release numbers; completing an older running job
  must not clear a newer pending target. Lock the job row for the final
  conditional commit, with a consistent lock order and deadlock retry.
- **Pause/resume:** pause prevents the next application without deleting jobs
  or dropping the newest target. Resume reconciles against the latest
  release and wakes the drain. A pause racing a committed run takes effect
  at the next transaction boundary, as stated in the UI.
- **Audit:** one `content.library_sync.applied` row per run, with system
  actor, academy and course, release numbers and outcome counts. Per-unit
  detail lives in `library_sync_changes`.

## 15. Copies taken before this feature

### 15.1 Backfill

1. Migration: `sync_key` for every existing test case, hint and solution.
2. Release 1 for every published master, from its working tree, labelled
   "Initial release". Today's adoptions already copy the working tree, so
   this matches what branches have been receiving.
3. A **dry-run link report** per master (console), then **Link copies**,
   per master and optionally per academy.

### 15.2 Identity: which copy row is which master node

Evidence is used strongest first. Title and position are never enough
on their own.

| Tier | Applies to | Evidence | Confidence |
|---|---|---|---|
| I1 | modules | same `externalKey`, corroborated adoption provenance, and no evidence of key reuse/recreation | eligible for automatic linking after provenance validation |
| I2 | lectures, programming exercises | same course-unique `externalKey`, compatible kind and adoption provenance; no reuse/recreation | eligible after validation |
| I3 | PDF, video materials | same asset id within a proved parent, unique on both sides and corroborated as adoption-origin rows | eligible after validation; shared asset alone is insufficient |
| I4 | other materials | proved parent, same type, equal fingerprint unique on both sides, corroborated adoption provenance | candidate; manual review unless lineage is proved independently |
| I5 | other materials | same type and one candidate on each side, with matching adoption timestamps | manual candidate only; timestamps and cardinality do not prove identity |
| — | anything else | — | **ambiguous**, listed for review |

"Created in the adoption transaction" uses the copy course's database
`createdAt` and the adoption receipt; Phase 0 must verify exact timestamp
behavior before any automation uses it. A tolerance window is not proof.
Current uniqueness does not exclude historical key reuse, deletion/recreation,
or an old copy made with different copier semantics.

An ambiguous row is shown to academy editors as "Which library material is
this?", with candidates, **It's ours**, or **Keep deleted**. Quarantine the
ambiguous source nodes and dependent subtree: do not add them as new content
until review establishes whether they are existing copies, locally deleted,
or genuinely new library nodes. Proved unrelated nodes can sync immediately.

Item mapping needs its own evidence. Equal length and a known *old* exercise
base do not prove alignment with today's master list. Transfer keys only
when both lists and their order are proved identical at the same version,
or by unique equal-item matches with corroborated lineage. Any remainder
uses an unknown list base until reviewed; do not re-key changed rows by index.
Likewise map MC option ids only from proved corresponding definitions or
unique corroborated option matches, never reordered arrays by index.

### 15.3 Base: what the copy looked like when it was taken

The master's content at adoption time was never stored, so base is
recovered from evidence:

| Tier | Condition | Base |
|---|---|---|
| B1 | master revision still equals the adopted source revision, with proved lineage and version-aware copier normalization | matching upstream content, exact only for the fields proved to have been copied |
| B2 | copy revision equals its baseline, with proved revision coverage for its lifetime and known copier behavior | copy content for proved copied fields; structural base only where independently proved |
| B3 | complete retained historical coverage proves no relevant mutation of the node, ancestors, children or list since adoption, including imports and maintenance writers | current copy values only for units whose unchanged origin is proved |
| B4 | otherwise | **unknown**: equal values converge, different values become `UNKNOWN_BASE` conflicts |

The academy-selected course title is an adoption customization, not necessarily
an unchanged copy of the source title. B2 must not use the local title as a
proved upstream base merely because the copy's revision never advanced.
Use a proved original upstream title or preserve it behind UNKNOWN_BASE review.

Apply these tiers per unit, including presence, parent and order. A current
node audit search cannot recover a removed node or an earlier sibling order.
B3 is **disabled by default**: reading today's writers does not prove all
historical versions, scripts and audit retention were complete. Current
reorders audit their parent, not every affected child (findings §11.1).
Unless historical coverage is established on the restored dataset, fall back
to B4 for affected units. Never turn "no audit row found" into permission to
overwrite academy edits. B4 asks only where ours and theirs differ, and a
manual identity choice does not manufacture a historical base.

### 15.4 Committing

**Link copies** writes links and exception base rows (and `optionMap`), sets
`CourseSyncState { linkMethod: LEGACY_LINKED, baseReleaseId: null }`, and
enqueues the first sync to the latest release. The first run sets
`baseReleaseId` and clears the exception rows that are no longer needed.

The report carries expected master release, copy revision and evidence
fingerprint. Recompute/validate under the master and copy locks at commit;
reject a stale report rather than apply old matches. Console reports expose
only counts/states. Candidate content and manual choices belong to academy
editors. Linking never enables a quarantined node by treating it as absent.

## 16. Authorization

| Act | Permission | Notes |
|---|---|---|
| Publish update, retry, pause/resume, link copies | `platform.library.manage` | the platform axis, as for library authoring |
| Read releases, fan-out, link report | `platform.library.read` | counts and states only (D12) |
| Read a copy's sync status, conflicts and history | `curriculum.review` in the copy's academy | |
| Resolve conflicts and ambiguous links | `curriculum.manage` (Team Lead, Manager) | the same authority as editing the content |
| Sync writer | system actor, scoped to one linked copy | no user; audit `actorUserId = null` |

`AuditService.write` currently types `actorUserId` as a string. Add an explicit
system-audit path for these jobs, with no inherited user support-grant context;
do not invent a user or accidentally attribute a background job to its publisher.

Conflict screens show master values only for units of the viewer's own copy.
These are values that copy receives on **Use library version**; no other
branch's content is ever readable.

## 17. Contracts

`packages/shared/src/library-sync/`: release, sync state, conflict, change
and link-report schemas, plus `courseSyncChip(state)`, the one derivation
every surface uses.

| Procedure | Input | Output |
|---|---|---|
| `platformLibrary.publishUpdate` | `courseId, note, expectedContentRevision` | release |
| `platformLibrary.releaseDraft` | `courseId` | change summary vs last release |
| `platformLibrary.releases` | `courseId, page` | releases with rollout counts |
| `platformLibrary.copies` (extended) | `courseId` | adds per-copy release, status, open conflicts, last run, failure |
| `platformLibrary.retrySync` / `pauseSync` / `resumeSync` | `copyCourseId` | state |
| `platformLibrary.linkReport` / `linkCopies` | `courseId, academyIds?, expected report/release/copy versions` | counts-only report / job ids |
| `academyLibrarySync.status` | `academyId, courseId` | state, release, counts |
| `academyLibrarySync.conflicts` | `academyId, courseId, status, page` | conflict rows (no values) |
| `academyLibrarySync.conflict` | `academyId, conflictId` | base, ours, theirs values rendered for the unit kind |
| `academyLibrarySync.resolve` | `academyId, conflictId, action, value?, expected hashes, requestKey` | updated conflict and state |
| `academyLibrarySync.history` | `academyId, courseId, page` | changes grouped by run |
| `academyLibrarySync.unmatched` / `resolveLink` | `academyId, courseId` / `nodeKey, localId \| null` | ambiguous links |

No new error codes (as built): the shared `errors` namespace is a layout
namespace already at its payload budget, and two short codes put Korean over
it. Stale decisions and publishes answer `CONTENT_EDIT_CONFLICT`, a blocked
publish `CONTENT_VALIDATION_FAILED` with the blockers in its message (the
console shows them before publishing), and an adoption whose release names an
asset that is no longer ready `LIBRARY_IMPORT_CONTENT_INVALID`. New audit
actions are labelled in the console's audit vocabulary and `platform-audit`
(en, ko).

## 18. Interface

### 18.1 Console

- **Master header:** one **Publish updates** button publishes all saved changes
  together. Saves never sync or send notifications. Show a compact pending-change
  summary and validation blockers. No release notes, release history, or visible
  release numbers. Internal immutable releases and retention remain unchanged.
- **Academy copies:** no academy-by-academy sync, approval, pause or review
  tracking in the authoring page. It reads only the course outline and pending
  publish summary. Legacy linking and operational endpoints remain maintenance
  tools, outside the normal library course editor.

### 18.2 Academy

- A targeted notification in the existing bell, grouped by academy course,
  only when a new admin change needs a decision. Active Managers and Team Leads,
  including additional roles, receive it. Independent edits and identical values
  produce no notification. An unrelated publication cannot re-alert an unchanged
  pending decision. Reads belong to each person; decisions affect the academy.
- Notification opens the normal staff course detail page. A compact amber banner
  explains that academy content remains active. Affected material rows carry
  **Admin changes to review**, human-readable field names, and a link to a review
  scoped to that material. Course/module/lecture decisions remain reachable from
  the banner. Ordinary synced/customized copies need no permanent status badges.
- Material review shows **Your academy’s current version** and **Admin’s latest
  version** side by side; original shared values are expandable. Choices are
  **Use admin version** / **Keep academy version**, applying only to the selected
  unit or explicitly grouped dependencies. Preserve backend manual resolution
  for compatibility, without adding a third default product action.
- Finishing every pending decision for the material being reviewed returns to
  the normal course detail page. Course-wide review returns when all decisions
  are finished. Keeping a version completes a decision just like accepting one.
- Test cases show labeled input and expected-output blocks in a stable order.
  Scoring and limits are collapsible, expand if changed, and describe inherited
  limits without exposing raw null values.
- Render rich text with images, code differences, test-case fields, quiz answers,
  PDFs and videos appropriately. Preview assets only through an authorized
  conflict, with short-lived signed URLs. Preview failure must not block keeping
  the academy version. No history tab, release numbers or release notes.
- Reading never accepts content. Completing all decisions removes the banner,
  row labels and active course notification. Keeping the academy version
  acknowledges that admin value; a later different value can request review.
- Preserve grading, video completion, archival, reference-PDF and stale-save
  safeguards. No course-wide overwrite is permitted.

Implementation details: [approved workflow plan](../plans/2026-11-18-library-sync-review-workflow.md).

Strings go in a new page namespace `library-sync` (en, ko), not a layout
namespace (content library design §17.6).

## 19. Performance budget

These are provisional targets, not measured claims. Phase 0 must account for
new value reads, retention, receipts, archive guards and synchronization
locks. Assert final counts on disposable PostgreSQL
(`COVE_INTEGRATION_DATABASE_URL`), including authorization/lock statements on
request paths and stating whether BEGIN/COMMIT are counted. Use the same
counting convention for small and large fixtures. Any necessary adjustment
is documented before enabling sync; no reads or writes inside per-row loops.

| Path | Budget | Independent of course size |
|---|---|---|
| Publish update | ≤ 10 statements | yes |
| Sync run, nothing to do | ≤ 6 | yes |
| Sync run with changes | ≤ 45 (one per table and operation kind) | yes |
| Adopt (materialize release) | ≤ 30 | yes |
| Academy course list | +0 (sync state joined into the existing summary statement) | yes |
| Course builder | +0 statements (compact review rows in existing sync-state projection) | yes |
| Course review list | 3 including member access | yes |
| Selected material comparison, server-rendered | 10 including access; +1 batched image read when needed | yes |
| Notification bell | 3 including user resolution | yes |
| Resolve one conflict | ≤ 12 | yes |

There is no new client polling. Status is read on page load and invalidated
after mutations and worker commits through the existing event/cache path.
The console's rollout view also refetches on focus. The server recovery tick
in §14 is independent of browser tabs.

## 20. Rollout

1. Schema, `sync_key`, and editor round-tripping: no behavior change.
2. Releases recorded with asset retention safe; targets persist but draining
   is off (`LIBRARY_SYNC_ENABLED=false`).
3. Adoption from releases.
4. Sync on for one pilot academy (`LIBRARY_COURSE_SYNC`) and one master.
5. Link reports for existing copies, reviewed with head office; link per master.
6. Widen to every academy holding a copy. The switch must be set for new
   academies too, in the same way the public Turtle pilot list worked.

## 21. Testing

The plan has file-level detail. In summary:

- **Pure merge:** every row of §8.1, §8.2, §9.1 and §9.2. Cross-unit rule
  failures. The example in §1.1 as a table-driven test.
- **Catalog completeness:** a test reads the Prisma DMMF for every content
  model and fails unless each scalar field is either in a unit or in the
  catalog's exclusion list with a reason. A new column cannot be silently
  left out of sync.
- **Projection parity:** a fresh adoption projects identically to its
  release except deliberate academy title overrides; those are tracked as
  customizations. Visibility/remapped identities are normalized separately.
- **Integration (disposable PostgreSQL):** the §1.1 scenario end to end;
  student history row counts unchanged; progress rolled forward, not reset;
  archive instead of delete; idempotent retry after an injected failure;
  concurrent editor save refused rather than overwritten; statement budgets
  from §19; every legacy tier, I1–I5 and B1–B4.
- **E2E:** head office publishes; the academy sees applied changes and one
  conflict, resolves it, and the next release does not raise it again.

## 22. Risks

| Risk | Mitigation |
|---|---|
| The first sync of a long-diverged legacy copy changes a lot at once | Dry-run report first; linking is per master and per academy; the history tab shows exactly what moved |
| A sync lands mid-class and students' open workspaces ask them to reload | Same behavior as an academy editing during class. Runs are short and touch only changed units. Q3 covers quiet hours if wanted. |
| An old client/import drops item identity | Preserve only proved keys; otherwise invalidate item lineage and use safe list-level review, never guess by position |
| Unknown-base conflicts flood a legacy copy | Prove base per unit where possible; otherwise review is necessary. **Keep all mine for this material** is explicit and uses the same stale guards per affected unit |
| Value storage grows with releases | Content addressing stores each distinct value once; test text is bounded at 16 Mi per problem; collection is out of scope |
| A grading change reaches a class without its teacher noticing | The history tab and builder badges show it; points and past grades are untouched (D2) |
| Course lock contention with a long import | Lock waits fail fast and the job retries with backoff |

## 23. Out of scope

- Academy-to-library contribution, which stays the independent copy of the
  2026-10-13 design.
- Cherry-picking modules from several masters, and selective or scheduled
  releases.
- Rolling a master back to an older release. Publishing restored content as
  a new release is possible later.
- Automatic regrading of any kind.
- An academy opting a course out of sync (only head office can pause).
- Garbage collection of `library_sync_values`.

## 24. Open questions

Reviewed defaults below guide implementation planning; they are not new
claims of product-owner confirmation. Q1 is an explicit exception to carrying
completion forward. No additional product decisions block documentation work.

| # | Question | Default |
|---|---|---|
| Q1 | When a synced change replaces a video, should students who completed the old video stay complete, as D2 does for code? | **No, retain this default.** Different asset ⇒ new media starts unwatched; old history remains. Same-asset caption/instruction edits preserve completion. Warn in publish summary and academy history. |
| Q2 | Should adoption also make video, written-response and MC materials visible on arrival, matching D3? | No change to adoption |
| Q3 | Should sync avoid an academy's class hours? | No scheduled quiet window in this scope. Sync runs after publish; measure duration in Phase 0/verification and support pause/resume. Do not assume all runs are small. |
| Q4 | May academies trigger the regrade for their own copies? | Preserve existing authorization: `RegradeService.authorize` already accepts `curriculum.regrade` in the target academy or platform authority. Do not add/remove permission or automatically trigger regrade as part of sync. New regrade UI is out of scope. |
| Q5 | Are release notes shown to academies? | Yes, in the history tab |
