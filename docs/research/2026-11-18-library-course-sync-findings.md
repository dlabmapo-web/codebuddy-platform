# Library Course Sync — Codebase Findings

**Date:** 2026-11-18
**Status:** Code/design review updated 2026-11-18 for [Library course sync design](../superpowers/specs/2026-11-18-library-course-sync-design.md). Documentation only; runtime verification still gated by §11.
**Code read at:** `53b4cfa6` on `perf/public-turtle-class-load`

This records what the code does today, with evidence, so the design can be
checked against it. Paths are relative to the repository root. Line numbers
are as of the commit above.

## 1. The facts that shape the design

1. **A library copy is a one-shot copy with no row-level lineage.**
   `copyCourseTree` mints a fresh UUID for every module, lecture and material
   and persists no source-to-copy map
   (`packages/api/src/content/library/course-tree-copy.ts:89-315`). The only
   lineage is course-level: `Course.sourceCourseId`, `sourceContentRevision`
   and `baselineRevision` (`packages/api/prisma/schema.prisma:1372-1394`).
2. **Library masters have no draft/published separation for content.** Head
   office edits the master in place with the ordinary academy editors.
   "Published" is only `Course.isVisible` on the master, which gates adoption
   (`academy-library.service.ts:300-318`). Every adoption copies the working
   tree as it stands, unfinished edits included.
3. **No content history exists.** There is no snapshot of a master at any
   earlier revision. `contentRevision` is a counter
   (`packages/api/src/content/content-positions.ts:231-241`). The `versions`
   route under the academy course builder is a legacy redirect
   (`packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/versions/[versionId]/page.tsx`).
4. **Nested items are replace-all.** Saving an exercise deletes and recreates
   all test cases and hints (`packages/api/src/content/course.service.ts:1447-1467`),
   and solutions too (`packages/api/src/content/exercise-solutions.ts:14-19`).
   The Excel importer does the same (`content-import.service.ts:1057-1068`).
   Write payloads carry no row id (`packages/shared/src/content/course.ts:510`,
   `:572`, `packages/shared/src/content/solutions.ts:3-6`). Row ids are
   therefore not an identity for test cases, hints or solutions.
5. **The existing design explicitly deferred merging.** The content library
   design lists "Merge or diff" as out of scope (§1.2, §16) and chose a status
   chip instead
   (`docs/superpowers/specs/2026-09-03-content-library-design.md`).

## 2. How the library works today

| Fact | Evidence |
|---|---|
| A library is an `Academy` with `kind = LIBRARY`, one per organization | `schema.prisma` `Academy.kind`; partial unique index in the content-library migration |
| Library courses are ordinary `Course` rows edited with the academy editors on the `library` content surface | `docs/superpowers/specs/2026-09-03-content-library-design.md` §3.1, §9.3 |
| Authority over a library academy is the platform axis (`platform.library.manage`, `platform.library.read`) | same design §17.1; `packages/shared/src/auth/roles.ts` |
| Adoption requires the master to be visible and unretired | `packages/api/src/content/library/academy-library.service.ts:300-318` |
| Adoption reads the source tree *before* opening its write transaction | `academy-library.service.ts:217-262` |
| Adoption copies with policy `ACADEMY_ADOPTION`: modules and lectures visible; materials visible except video, short-answer and multiple-choice ones | `course-tree-copy.ts:118-150` |
| Adoption remaps multiple-choice option ids to fresh UUIDs | `course-tree-copy.ts:9-22` |
| Copies keep shared immutable media (PDF, video, manual asset ids) rather than duplicating them | `course-tree-copy.ts:152-211`, `:282-294` |
| Copies keep `externalKey` on modules, lectures and programming exercises | `course-tree-copy.ts:114`, `:127`, `:218` |
| Sync status is two derived booleans from four integers | `packages/shared/src/platform/library.ts:148-178` |
| "Customized" means `contentRevision > baselineRevision` | `library.ts:172-178` |
| Head office's fan-out counts copies behind the master's revision | `packages/api/src/platform/platform-library.service.ts:126-150` |
| The reverse path (academy course → library) is an independent draft copy with its own receipt table | `LibraryCourseImport`, `schema.prisma:2806-2823`; `docs/superpowers/specs/2026-10-13-academy-course-to-library-design.md` |

## 3. Content model by material type

| Type | Rows | Authored fields | Editor write path |
|---|---|---|---|
| (all) | `Material` | `title`, `position`, `isRequired`, `isVisible`, `type` (immutable) | per-type service; builder for order and moves |
| `EXPLANATION` | `ExplanationMaterial` | `body`, `sideBody` | `packages/api/src/explanations/explanation.service.ts:98-117`; `revision` increments |
| `VIDEO_LESSON` | `VideoLesson` → `VideoAsset`, `VideoCaption` | `assetId`, `description`, `placement`, `includeInScore`, `maximumHundredths`, `thresholdBasisPoints`, `captions` (JSON), `assets` (instruction images JSON) | `packages/api/src/videos/video.service.ts:356-513`; schema `packages/shared/src/content/video.ts:49-91` |
| `PROGRAMMING_EXERCISE` | `ProgrammingExercise`, `ExerciseTestCase`, `ExerciseHint`, `ProgrammingExerciseSolution` | statement fields, starter code, language, limits, grading profile, policies, `feedbackPolicy`, `quiz`, `referencePdfMaterialId`, cases, hints, solutions | `course.service.ts:1363-1511` |
| `PDF_DOCUMENT` | `PdfDocument` → `PdfAsset` | `assetId`, `placement` | `packages/api/src/documents/pdf-document.service.ts:142-240`; `revision` increments |
| `TURTLE_EXERCISE` | `ManualMaterial` | `description`, `files`, `entryPoint`, `assets`, `solutionFiles`, `solutionAssets`, `modelAnswer`, `hint`, `width`, `height`, `timeLimitSeconds`, `memoryLimitMb`, `runtimeVersion`, `submitEnabled`, `includeInScore`, `maximumHundredths` | `packages/api/src/manual/manual.service.ts:163-367` |
| `WRITTEN_RESPONSE` | `ManualMaterial` with optional `shortAnswer` JSON | the manual fields plus `shortAnswer` {`question`, `gradingMode`, `expectedAnswer`, `pattern`, `explanationEnabled`, `explanation`} | same; schema `packages/shared/src/content/manual.ts:56-64` |
| `MULTIPLE_CHOICE` | `ManualMaterial` with `multipleChoice` JSON | the manual fields plus {`question`, `problemDescription`, `selectionMode`, `options[{id, content}]`, `shuffleOptions`, `explanationEnabled`, `correctOptionIds`, `explanation`} | same; schema `packages/shared/src/content/multiple-choice.ts:1-51` |

The full field catalog, with how each field merges, is in the
[merge unit catalog](../superpowers/specs/2026-11-18-library-course-sync-merge-units.md).

## 4. Identity: what is stable

| Thing | Stable identity in the library? | Carried into copies? |
|---|---|---|
| Module | Row id; `externalKey` unique per course in the database | `externalKey` copied verbatim; row id new |
| Lecture | Row id; `externalKey` course-unique, enforced in the service | `externalKey` copied; row id new |
| Material | Row id only | Nothing, except `ProgrammingExercise.externalKey` |
| Test case, hint, solution | **None.** Rows are recreated on every save | Nothing |
| Multiple-choice option | `option.id`, client-supplied and preserved across saves (`multiple-choice.service.ts:73-105`) | Remapped to new ids |
| Turtle source file | File path (map key) | Path copied |
| PDF, video, caption, manual and lesson-image assets | Asset id (immutable) | Same asset id |

Moves stay inside one course (`course.service.ts:1065-1100`), so a
course-scoped link survives every move the product supports.

## 5. Revisions and concurrency

- `Course.contentRevision` is bumped in the same transaction by every content
  mutation (`content-positions.ts:231`); visibility writes deliberately do not
  bump it (`docs/superpowers/specs/2026-09-04-adopted-course-readiness-design.md` §4.3).
- Per-type optimistic checks: `ProgrammingExercise.updatedAt`
  (`course.service.ts:1380`, `:1408-1442`), `ManualMaterial.revision`
  (`manual.service.ts:285-289`), `ExplanationMaterial.revision`
  (`explanation.service.ts:108`), `PdfDocument.revision`,
  `VideoLesson.revision`. A writer that changes these makes a concurrent
  editor save fail with a conflict rather than overwrite.
- Moves and material saves use the course lock (`course.service.ts:2237-2240`,
  `manual.service.ts:219`). Do not assume all structural writers acquire it
  first: reorder methods (`course.service.ts:735,905,1582`) rewrite positions
  before bumping the course revision. Phase 2 must standardize lock ordering
  and stale checks for sync concurrency.
- Learners' manual submissions are refused when the material's `revision`
  changed since they loaded it (`manual.service.ts:840`), so any content write
  makes an open workspace ask the student to reload.

## 6. Grading and student history

| Relation to `Material` | On material delete | Source |
|---|---|---|
| `Submission.materialId` | `SetNull` (row kept; `sourceMaterialId` kept) | `schema.prisma:1915` |
| `StudentExerciseProgress` | `Cascade` (lost) | `schema.prisma:2042` |
| `ExerciseDraft.materialId` | `SetNull` | `schema.prisma:1760` |
| `ManualSubmission.materialId` | `Restrict` (delete refused) | `schema.prisma:2542` |
| `ManualDraft` | `Cascade` | `schema.prisma:2521` |
| `VideoWatchProgress` | `Cascade`; also keyed by `assetId` | `schema.prisma:2694-2719` |
| `StudentMaterialView`, `ExerciseSolveSession` | `Cascade` | `schema.prisma:2867-2876`, `:1958-1960` |
| `TeacherFeedback`, `TeacherMonitoringVisit`, `StudentHelpRequest` | `SetNull` | `schema.prisma:2079`, `:2130` |

Deleting a material therefore destroys progress, views and watch history even
where submissions survive. An archival policy must hide, not delete.

Grading snapshots: each submission freezes its grading profile and cases
(`Submission`, `SubmissionGradingCase`, `schema.prisma:1841-1991`), and each
manual attempt freezes its definition (`MultipleChoiceAssessment.definition`,
`ShortAnswerAssessment.definition`, `schema.prisma:2587-2617`). History stays
readable whatever the current content says.

**Editor progress reset.** When an exercise's grading definition changes,
`updateExercise` bumps `gradingRevision` and resets every
`StudentExerciseProgress` row for the problem to `NOT_STARTED` with zero
attempts and best score (`course.service.ts:1468-1486`). When only manual
assessment or policy changes, it rolls the rows' `gradingRevision` forward
without resetting (`:1469-1471`).

**Why the reset is load-bearing.** `nextProgress` keeps `SOLVED` permanently
once set (`packages/api/src/judge/grading.ts:329-375`), and the grading service
passes the stored row as `previous` without comparing revisions
(`packages/api/src/judge/grading.service.ts:650-660`). Before updating progress,
the grader locks the exercise `FOR SHARE` and refuses stale submission
revisions (`:646-648`). Preserve that existing fence. Readers skip progress
whose `gradingRevision` differs from the exercise's
(`packages/api/src/learn/curriculum-outline.service.ts:240-259`).

**Regrade is already explicit.** `REGRADE_STALE_SUBMISSIONS`
(`schema.prisma:1266-1350`, `packages/api/src/platform/regrade.service.ts`)
re-grades submissions whose `gradingRevision` is below the exercise's. It is a
platform operation; `RegradeService.authorize` also permits an academy actor
with `curriculum.regrade` in the target academy (`regrade.service.ts:150-173`).
Sync must not silently remove that existing permission.

## 7. Rules that sync must respect or deliberately override

1. **Answer-key lock.** The manual editor refuses to change multiple-choice
   structure (selection mode, option ids and order, correct ids, shuffle) or
   written-response rules (grading mode, expected answer, pattern, or
   converting to/from automatic) once the material is visible or has any
   submission (`manual.service.ts:290-333`). The MC and short-answer specs
   require a new material in that case
   (`docs/superpowers/specs/2026-10-08-multiple-choice-questions-design.md` §4,
   `…-short-answer-questions-design.md` line 58). The design overrides this for
   library sync only (decision D1).
2. **Lesson image references are authorization.** An HTML statement may add a
   `cove-asset:` image only if the image belongs to the same course or the
   statement already showed it; "showing an image is what grants reading it"
   (`packages/api/src/content/lesson-images.ts:14-41`).
3. **Manual asset ownership.** A manual material may reference an asset of its
   own course, or one it already referenced (`manual.service.ts:249-262`).
   Video instruction images and captions have the same rule
   (`video.service.ts:427-461`).
4. **Course titles are unique per academy**, case-insensitively
   (`CourseService.assertTitleAvailable`, `course.service.ts:1723`).
5. **Material type is immutable**, and a programming exercise cannot switch
   between quiz and code (`course.service.ts:1377-1379`).

## 8. Background work patterns

| Pattern | Where | Fit for sync |
|---|---|---|
| BullMQ queues on Redis | judge (`packages/api/src/judge/judge.queue.ts`) | Built for runtime isolation, not for database-only work |
| Database-leased job rows drained in-process with a recovery tick | `ShortAnswerService` (`packages/api/src/manual/short-answer.service.ts:13-80`) | **Yes.** Durable, auditable, multi-instance safe with conditional claims |
| Database-leased job rows in a separate worker | `VideoProcessingJob` (`schema.prisma:2681-2692`, `packages/api/src/videos/video-worker.ts`) | Same idea, separate process |
| Platform operation run with a partial unique in-flight index | `PlatformOperationRun` (`schema.prisma:1294-1350`) | Model for visible run status |

## 9. Performance constraints

- `AGENTS.md`: no query inside a loop; Prisma `include` costs one statement per
  level; read lists in one statement; count statements in an integration spec.
- One-statement tree readers exist: `readCurricula`
  (`packages/api/src/learn/curriculum-read.ts:30`). The copier's
  `courseCopyInclude` is a deep Prisma include of about ten levels
  (`course-tree-copy.ts:24-51`).
- `rewritePositions` issues two `UPDATE`s per row (`content-positions.ts:92-128`).
  That is acceptable for one editor action and not for a sync that reorders
  many parents.
- Statement counting pattern: `packages/api/src/content/navigation-performance.integration.spec.ts:38`.
- Isolated Docker PostgreSQL harness pattern: `packages/api/scripts/test-material-loading.sh`.
- Test text can reach 8 Mi characters per case and 16 Mi per problem
  (`packages/shared/src/content/course.ts:510-525`, `:752-765`), so comparing
  full values in the API process is not viable. Hash in SQL.

## 10. Gaps the design closes

| # | Gap | Where the design answers it |
|---|---|---|
| G1 | No notion of a published library version separate from the working tree | Design §6 (releases) |
| G2 | No base version to compare against | §5, §7 (release snapshots, base pointer) |
| G3 | No row-level link from copy to source | §5 (`LibrarySyncLink`) |
| G4 | No stable identity for test cases, hints, solutions | §5 (`syncKey`); plan phase 2 |
| G5 | MC option ids differ between master and copy | §7 (option map on the link) |
| G6 | Editor resets progress on grading change | §11 (decision D2) |
| G7 | Answer-key lock blocks in-place key updates | §11 (decision D1) |
| G8 | Deleting content with student history loses progress | §10 (archival policy) |
| G9 | Reference provenance rules are written for human editors | §12 |
| G10 | Existing copies have no recorded base | §15 (evidence ladder) |
| G11 | Per-row position rewrites | §9; plan phase 6 (set-based rewrite) |
| G12 | Adoption reads outside its transaction and copies drafts | §6.3 (adopt from a release) |

## 11. Review and Phase 0 assumption ledger (2026-11-18)

Reviewed against `53b4cfa6`, the current HEAD on `feat/library-course-sync`.
The four proposed docs were untracked at review time. No product code, live
database, migration, or server was changed for this review. Code inspection
is evidence about current behavior; it is not a successful integration run
or proof about all historical deployments.

### 11.1 Audit coverage — current writers found, historical guarantee unproved

| Writer | Audit target / evidence | Consequence for legacy inference |
|---|---|---|
| Course create/update/delete | Course; `content/course.service.ts` methods `create`, `update`, `deleteCourse` | Course metadata audit is not a child-content snapshot. |
| Module create/update/delete | CourseModule; same service methods | Deleting a container affects descendants without one audit per descendant. |
| Lecture create/update/delete | Lecture; same service methods | Ancestor/descendant effects must be included. |
| Module reorder | **Course**, `course.service.ts:735-765` | Looking only for a module target falsely says its order was unchanged. |
| Lecture reorder | **CourseModule**, `course.service.ts:905-952` | A lecture-target-only search misses it. |
| Material reorder, across material types | **Lecture**, `course.service.ts:1582-1620` | A material-target-only search misses it. |
| Lecture/material moves | Moved Lecture/Material, `moveLecture`, `moveExercise` | Source and destination sibling orders also change. |
| Programming create/update/delete and solutions/cases/hints | Material, `course.service.ts:1280-1580` | Nested item edits are covered by the parent action, not item-level history. |
| Explanation save/delete/visibility | Material, `explanations/explanation.service.ts:98-139` | Current editor is audited; historical completeness is not established. |
| PDF save/delete/visibility | Material, `documents/pdf-document.service.ts:142-280` | Reference-detachment helper writes are part of a parent operation. |
| Video save/delete/visibility | Material, `videos/video.service.ts:356-555` | Asset upload/processing is not proof of lesson content lineage. |
| Turtle/written-response/MC save/delete/visibility | Material, `manual/manual.service.ts:163-400` | Audit says revision/type, not the old full definition. |
| Excel import | Course receipt plus module/lecture/material rows, `content/import/content-import.service.ts:470,803,828,871,891,997,1080` | An import invalidates simple positional/item provenance. |
| Adoption and shared copier | Course adoption audit, `content/library/academy-library.service.ts:225-262`; copier has no individual child audit | Creation provenance is course-level. |
| Maintenance/conversion and purge | `migrations/course-turtle/cli.ts`, `platform/academy-purge.ts`; direct database writes are possible | Operational scripts and historical deployments also need inventory; today's editor audit coverage cannot prove they never changed a row. |

No unaudited ordinary academy content-save path was established by this
static inventory. That is deliberately narrower than saying all historical
writes were audited. B3's original test, "no audit targeting this node since
adoption", is unsafe even with current writers because reorder targets are
parents and container operations affect children. Retention and historical
writer/revision coverage have not been verified. **B3 stays disabled by
default**, falling back to `UNKNOWN_BASE` for unproved units. Human matching
proves identity only; it does not reconstruct lost content or order.

### 11.2 Adoption timestamps — runtime verification still required

Course, module, lecture, material and audit timestamps use database
`@default(now())` (`schema.prisma`); adoption writes them in one transaction
(`academy-library.service.ts:225-262`). This suggests matching transaction
timestamps, but no disposable adoption experiment was run in this docs-only
review. Phase 0 must verify actual Prisma/default behavior and historical
copier variants. Do not substitute a fuzzy time window for proof. Even exact
timestamps only corroborate identity; a unique same-type candidate is not
automatically the original source node.

### 11.3 Grading comparators — verified statically

- `sameGradingDefinition` (`content/course.service.ts:1842-1872`) compares
  list length/order, input, expected output, visibility, comparator, weight,
  hard override, soft limit and soft penalty. It does **not** compare label.
- `sameGradingProfile` (`:1874-1881`) compares keys returned by
  `exerciseProfileColumns` (`judge/grading-profile.ts:369-397`): mode,
  input-prompt policy, continuation/exit policies, total/comparator limits,
  maximum score and score policy. It compares neither `feedbackPolicy` nor
  exercise-level `timeLimitMs`/`memoryLimitMb`. Those limits are relevant to
  grading and require explicit sync detection; do not blindly mirror an
  incomplete editor comparator.
- `sameQuizGrading` (`packages/shared/src/content/quiz.ts:68-81`) compares
  correct choice id and choice count/order/id/text. Non-grading presentation
  fields are not included.
- `updateExercise` (`course.service.ts:1395-1402`) separately includes
  language, submission policy and manual-assessment changes. It changes the
  semantic version for changed definitions/profiles; the sync design must
  explicitly preserve old semantics for test-only changes.
- `nextProgress` (`judge/grading.ts:329-378`) keeps SOLVED and best scores
  sticky. `isRepair` only prevents incrementing attempt count. Resetting
  progress when enqueuing repairs can lose results on repair failure and
  zero counters unnecessarily; the revised design removes that proposal.

### 11.4 Type-specific fields and required flags — static facts and gate

`ManualService.save` persists common manual fields and optional definitions
and derives `Material.isRequired` from `includeInScore` for all three manual
types (`manual/manual.service.ts:163-367`). Turtle uses starter files,
entry point, canvas and execution settings; written response uses answer
text and optional short-answer grading; MC uses its question/options/key.
All share scoring, instructions, hints, model answers and asset/solution
metadata where supported. Carry unused persisted values faithfully instead
of silently deleting them during type-specific projection.

Explanation, PDF and video creation explicitly initializes `isRequired:
false` (`explanation.service.ts:113-114`, `pdf-document.service.ts:213-214`,
`video.service.ts:493`). Their save paths do not expose a required toggle.
Phase 0 must still inventory the learner, staff, preview and export readers
field by field before the catalog-completeness gate is considered passed;
this paragraph is not a substitute for that matrix.

### 11.5 Referenced PDF placement — verified statically

`documents/pdf-document.service.ts:157-159` refuses saving `placement = MAIN`
when any exercise references that PDF. `documents/pdf-reference.ts` requires
the reference to be a READY PDF with placement BOTH/SUPPLEMENTARY in the same
academy/course; publishing a referencing exercise additionally requires the
PDF and its ancestors to be visible. A local academy PDF reference is valid
even when the PDF is not library-linked. Removing or archiving a PDF can
therefore conflict with an exercise in another lecture, including a local
academy exercise. Validate the merged course graph, not materials alone.

### 11.6 Largest-course size — not measured, remains a gate

No restored production snapshot was supplied or queried during review.
Largest DLab row counts, actual bytes, and transaction/memory timings remain
unverified. Phase 0 must measure on an authorized restored snapshot or record
its absence and choose explicit, conservative supported limits plus synthetic
fixtures; do not claim observed production size. Proposed statement budgets
are targets until measured with the final retention/receipt/locking paths.

### 11.7 Additional review findings incorporated in all companions

| Priority | Original gap | Required correction |
|---|---|---|
| High | Snapshot hashes alone do not retain referenced assets. PDF cleanup checks `documents`; video cleanup checks lessons/watch progress (`pdf-document.service.ts:399-446`, `videos/video-worker.ts:225-254`). | Retained release/base/conflict values pin every asset kind before cleanup can remove it, including a release never adopted by any academy. |
| High | Unknown/absent bases, structural bases and resolution receipts were not fully modeled. | Persist VALUE/ABSENT/UNKNOWN distinctly, structural exceptions, grouped membership and durable request receipts. |
| High | Ambiguous legacy nodes were treated as upstream additions, risking duplicates or restored local deletions. | Quarantine affected source nodes/dependencies pending academy review; allow unrelated proved nodes to sync. |
| High | Equal list length was used to justify positional key reuse. | Require same-version identity proof, otherwise invalidate item lineage and review the list; no positional guesses. |
| High | Pending-job uniqueness alone does not fence running workers or prevent old targets from regressing state. | Verify leases/gates under locks and make release advancement monotonic. |
| High | Archive was only `isVisible=false`; restoration forced visible and could overwrite edits made while archived. | Persist archive/delivery state, guard readers/writers, and merge restoration from the pre-archive base. |
| High | Course lock alone does not serialize student history writes. Video checkpoints lock materials (`video.service.ts:846-856`), and view/draft paths have other protocols. | Prove a shared material/history lock protocol before allowing physical removal. |
| High | Per-material validation missed referenced PDF removals and local wording on removed MC options. | Validate dependency groups across the merged graph to a fixed point. |
| Medium | Q4 described regrade as platform-only, contrary to `authorize`. | Preserve existing `curriculum.regrade` access and keep sync separate. |
| Medium | Resetting `baselineRevision` would hide retained customizations; course language was excluded from creation metadata. | Activate divergence-aware readers with sync, and capture language for adoption with mismatch conflicts. |
| Medium | Academy library preview/listing still read the working tree; adoption accepts an academy-chosen title. | Read the published release consistently and treat a deliberate local title as a customization, including legacy inference. |

The product direction matches the requested feature. The revised docs are
planning input, not evidence that these safeguards have been implemented or
that runtime Phase 0 has passed.

## 12. Implementation evidence and conservative fallbacks (2026-11-18)

These results supersede the docs-only status in §11. They do not establish
historical audit completeness or production snapshot parity.

### 12.1 Legacy adoption experiment

`legacy-link.integration.spec.ts` runs the original `copyCourseTree` adoption
transaction on PostgreSQL 17 with Prisma 7.9.0. One run recorded course creation
`2026-11-18T04:35:06.988Z`, module creation `2026-11-18T04:35:07.011Z`, and
adoption audit `04:35:07.138Z`. Another run recorded `04:24:26.292Z`, `.296Z`,
and `.307Z`. Equal timestamps are therefore not a dependable property of an
adoption, even before historical copier versions are considered.

All uncertain legacy node identities require academy review. An exact unique
nested content match may align a case/hint/solution/option identity; differing
values never acquire an invented historical base. The platform reports counts
and opaque evidence only. The academy sees its own metadata/candidates, reviews
identity, then resolves UNKNOWN_BASE content where needed. Unsupported historical
B2/B3 recovery and automatic I4/I5 heuristics are disabled. This removes historical
audit coverage from the correctness prerequisites of the shipping fallback.

### 12.2 Authored field coverage

The persisted-field catalog is checked by `catalog-coverage.spec.ts`, including
all three manual types and their JSON definitions. Usage groups are:

| Authored group | Authoring and staff | Learner / assessment | Preview / adoption / export |
|---|---|---|---|
| Manual instructions, hints, model answer, ordinary/solution assets | `manual/manual.service.ts` save/detail and review execution | `manual/manual.service.ts` authorized detail, private solution/review access; model answers stay permission-gated | Safe outline has type/title/scoring only; projection/catalog carries full values for authorized adoption/export |
| Turtle files, solution files, entry point, canvas, execution/runtime settings | manual save and review execution | Turtle workspace/runtime uses saved definition; private solutions retain their access boundary | `manual.runtime`, per-file units and solution-map presence; no source in outline |
| Written response and short-answer rule | manual save and short-answer grading | Attempt snapshots and grading use rule/settings; old snapshots remain | Presence boolean only in release outline, full rule only in authorized definition |
| Multiple-choice prompt, keyed options, answer key, explanation | manual save and option identity map | Attempt snapshots retain the submitted definition/key | Outline excludes options/key; release projection carries full keyed units |
| Shared scoring and required flags | `ManualService.save` derives required from scoring | Score/required readers retain existing derivation | `manual.scoring`; optional fields remain explicit, never dropped just because unused by a type |
| PDF/video media and placement | Own editor save schemas and asset readiness checks | Media access/watch progress and reference-PDF rules | Metadata joined from immutable release asset IDs; no private object/storage key |

The catalog is a persistence coverage gate, while editor-schema validation and
integration tests protect composition and dependency behavior. Future persisted
fields require an explicit catalog classification.

### 12.3 Runtime safeguards

Sync integration fixtures exercise all seven types, grading-revision roll-forward,
asset replacement, private-field exclusion, UNKNOWN_BASE migration decisions,
reference dependencies, editor-version invalidation and archive/restore. Archive-only
removal retains every history row and avoids relying on unproved history-writer
locking. Publishing and accepting a merge validate through editor schemas with
narrow, named compatibility for supported old definitions.

The isolated Playwright harness uses real Nest/Next/ORPC code with a synthetic
local identity provider and disposable PostgreSQL/Redis. It verifies admin publish,
academy keep/reload, and a student's solved progress after the correction.

### 12.4 Read budgets and supported size

Library list: 4 statements including membership access. Updates: 4, or 5 with a
support grant. Builder: 15 including access and one archival metadata statement.
Release history: 5; on-demand MC comparison including all grouped values: 10.
Legacy preview: 6 in the measured fixture (test ceiling 7 including transaction
boundaries). Adoption: 52 for both small and larger synthetic fixtures; a full
all-type update: 40. Counts come from Prisma query events on disposable PostgreSQL.

No authorized restored production snapshot was supplied. The implementation caps
one release's authored values at 64 MiB and uses bounded per-table writes. Production
row/byte/memory/transaction-time measurements remain a rollout activity; no largest
DLab master parity is claimed. Historical-content reconstruction and physical
history deletion remain excluded from this conservative implementation.
