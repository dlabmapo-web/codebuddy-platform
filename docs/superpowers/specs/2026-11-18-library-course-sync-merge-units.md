# Library Course Sync — Merge Unit Catalog

**Date:** 2026-11-18
**Status:** Reviewed 2026-11-18; implementation deferred. Read with the [library course sync design](2026-11-18-library-course-sync-design.md), including its remaining Phase 0 gates.
**Source of truth once built:** `packages/api/src/library-sync/catalog/`. This
document is the specification for it. The completeness test (§6) keeps the
two from drifting apart.

Every authored field of a course, module, lecture and all seven material
types appears below exactly once: in a unit, or in the exclusion list with a
reason. Field names are Prisma field names (`packages/api/prisma/schema.prisma`)
or keys of the zod schema that validates a JSON column.

## 1. How to read the tables

| Column | Meaning |
|---|---|
| **Unit key** | Stable identifier in snapshots, conflicts and history. `<k>` is an item key. List `@order` is separate from item values. Node `@presence`, `@parent` and per-parent `@order:<parentKey>` are separate structural units; `@placement` below is shorthand, never one indivisible parent-and-order value. |
| **Fields** | What the unit's value contains. Fields in one unit always move together (design D6). |
| **Kind** | `TEXT` plain text · `HTML` sanitized rich text · `CODE` · `SCALAR` one enum, number or boolean · `GROUP` several scalars · `ITEM` one keyed-list entry · `ORDER` · `ASSET` immutable asset reference · `REF` reference to another node · `JSON` versioned definition |
| **Manual merge** | Whether **Merge manually** is offered. Otherwise the choice is one side or the other. |
| **Grading** | Whether an effective value change alters grading (design §11). Reuse editor comparators where complete, with explicit coverage for fields such as execution limits not checked by those comparators. A grouped unit's descriptive-only edit does not automatically bump grading. |
| **Rules** | Validation that must hold after the merge. A failure becomes an `INVALID_RESULT` conflict on the named units. |

Every `HTML` unit carries **lesson images** (`cove-asset:` references), and
every manifest carries asset ids. Both fall under the reference rule of design
§12.

## 2. Structure

### 2.1 Course

| Unit key | Fields | Kind | Manual merge | Rules |
|---|---|---|---|---|
| `course.title` | `title` | TEXT | yes | unique per academy, case-insensitive (`assertTitleAvailable`) |
| `course.description` | `description` | TEXT | yes | |

`Course.language` is captured in the release and used on adoption. It is
immutable for an established copy with problems; incompatible language-family
changes/additions need conflict handling, not silently dropped fields.

### 2.2 Module

| Unit key | Fields | Kind | Manual merge | Rules |
|---|---|---|---|---|
| `module.title` | `title` | TEXT | yes | non-empty |
| `module.description` | `description` | TEXT | yes | |
| `@placement` | order within the course | ORDER | no | dense `1..n` |

### 2.3 Lecture

| Unit key | Fields | Kind | Manual merge | Rules |
|---|---|---|---|---|
| `lecture.title` | `title` | TEXT | yes | non-empty |
| `lecture.description` | `description` | TEXT | yes | |
| `@placement` | parent module, order within it | ORDER | no | parent exists in the copy and is not archived |

### 2.4 Material (every type)

| Unit key | Fields | Kind | Manual merge | Rules |
|---|---|---|---|---|
| `material.title` | `Material.title` | TEXT | yes | 1–128 characters for manual types |
| `material.required` | `Material.isRequired` | SCALAR | no | For Turtle, written response and MC it lives only in `manual.scoring`, derived from `includeInScore`. Explanation, PDF and video editors initialize it false; preserve that invariant for new nodes. |
| `@placement` | parent lecture, order within it | ORDER | no | parent exists and is not archived |

## 3. Material types

### 3.1 `EXPLANATION` — `ExplanationMaterial`

| Unit key | Fields | Kind | Manual merge | Grading | Rules |
|---|---|---|---|---|---|
| `explanation.body` | `body` | HTML | yes | – | `sanitizeExplanation`; images per design §12 |
| `explanation.sideBody` | `sideBody` (nullable) | HTML | yes | – | null when it has no content (`hasExplanationContent`) |

### 3.2 `VIDEO_LESSON` — `VideoLesson`

| Unit key | Fields | Kind | Manual merge | Grading | Rules |
|---|---|---|---|---|---|
| `video.media` | `assetId`, `captions[]` {`language`, `label`, `path`} | GROUP · ASSET | no | – | asset `READY` and locked; every caption belongs to `assetId`; caption languages unique (`saveVideoSchema`) |
| `video.instructions` | `description`, `assets[]` {`assetId`, `name`, `byteSize`} | GROUP · HTML | yes: HTML editor, manifest = images the merged text references | – | every image in `description` is in `assets` (`video.service.ts:461`); ≤ 50 images |
| `video.placement` | `placement` | SCALAR | no | – | `SUPPLEMENTARY` ⇒ not `includeInScore` |
| `video.scoring` | `includeInScore`, `maximumHundredths`, `thresholdBasisPoints` | GROUP | no | – | ranges of `videoConfigSchema` |

A changed `assetId` makes new media start unwatched, while old progress rows
remain (design §11, Q1). Caption changes on the same asset do not reset
completion. Preserve existing snapshot behavior for scoring/threshold-only
changes. Retain every referenced asset/caption for the lifetime of its
release and conflict/base values, not just while a live lesson uses it.

### 3.3 `PROGRAMMING_EXERCISE` — `ProgrammingExercise` and children

| Unit key | Fields | Kind | Manual merge | Grading | Rules |
|---|---|---|---|---|---|
| `exercise.difficulty` | `difficulty` | SCALAR | no | – | |
| `exercise.description` | `description` | HTML | yes | – | `assertLessonImages` semantics, per design §12 |
| `exercise.inputFormat` | `inputFormat` | TEXT | yes | – | plain text: a textarea in `basic-information.tsx`, rendered as text |
| `exercise.outputFormat` | `outputFormat` | TEXT | yes | – | |
| `exercise.constraints` | `constraints` | TEXT | yes | – | |
| `exercise.starterCode` | `starterCode` | CODE | yes | – | |
| `exercise.language` | `language` | SCALAR | no | yes | within the course's family (`exerciseLanguageIn`); C/C++ ⇒ `ELICE_STDIO` with `INCLUDE` (`assertLanguageGrading`); unchanged for a quiz |
| `exercise.limits` | `timeLimitMs`, `memoryLimitMb`, `totalTimeLimitMs`, `comparatorTimeLimitMs` | GROUP | no | yes | `assertGradingSupported`; each case's soft limit < its effective hard limit |
| `exercise.gradingProfile` | `gradingMode`, `inputPromptPolicy`, `continuationPolicy`, `exitStatusPolicy`, `materialMaximumHundredths`, `materialScorePolicy` | GROUP | no | yes | `gradingProfileIssues`; `gradingSemanticVersion` recomputed with `semanticVersionForMode` when this unit applies |
| `exercise.submissionPolicy` | `submissionPolicy` | SCALAR | no | yes | `PRACTICE_ONLY` with a reference PDF and no cases is the inferred default (`inferSubmissionPolicy`) |
| `exercise.manualAssessment` | `manualMaximumHundredths`, `manualIncludeInScore` | GROUP | no | yes (no definition change) | |
| `exercise.feedbackPolicy` | `feedbackPolicy` | JSON | no | no gradingRevision change in the current editor; changes feedback policy | versioned feedback policy schema |
| `exercise.aiFeedback` | `aiFeedbackEnabled` | SCALAR | no | – | |
| `exercise.quiz` | `quiz` (legacy single-answer definition) | JSON | no | yes | presence never changes: a quiz stays a quiz (`course.service.ts:1377`); `quizDefinitionSchema` |
| `exercise.referencePdf` | `referencePdfMaterialId`, translated to a master node key or namespaced local reference | REF | no | – | target is a valid non-archived PDF in the same copy; library targets require mapping, local academy targets may remain unlinked (`validatePdfReference`) |
| `exercise.solution:<k>` | `title`, `code` | ITEM | yes (code) | – | `exerciseSolutionEntrySchema`; ≤ 10; ≤ 500,000 characters in total |
| `exercise.solutions@order` | order of solutions | ORDER | no | – | the first entry becomes `solutionCode` (`prepareExerciseSolutions`) |
| `exercise.testCase:<k>` | `input`, `expectedOutput`, `visibility`, `comparator`, `weight`, `timeLimitMsOverride`, `softTimeLimitMs`, `softPenalty`, `label` | ITEM | no | yes, except a label-only edit | `exerciseTestCaseDraftSchema`; 8 Mi per field, 16 Mi per problem, ≤ 50 cases; `0 < soft < hard`; `0 ≤ penalty ≤ weight` |
| `exercise.testCases@order` | order of cases | ORDER | no | yes: legacy grading stops at the first resource failure, so order can change results | dense positions |
| `exercise.hint:<k>` | `content`, `triggerExpression` | ITEM | yes | – | `exerciseHintDraftSchema` |
| `exercise.hints@order` | order of hints | ORDER | no | – | |

`<k>` is the row's `syncKey` (design §5). A test case is one unit because its
input, expected output and scoring only make sense together: a new input with
an old expected output is a wrong test.

Verified comparator detail (findings §11.3): `sameGradingDefinition` checks
array order and every case field above except `label`. `sameGradingProfile`
compares `exerciseProfileColumns` only; it includes neither `feedbackPolicy`
nor exercise `timeLimitMs`/`memoryLimitMb`. Sync must explicitly detect those
execution-limit changes and bump grading. Test-only updates preserve the
existing `gradingSemanticVersion`; profile changes use the deliberate
semantic-version policy in design §11. Never use index-based key reuse after
an unproved reorder, insertion or removal.

### 3.4 `PDF_DOCUMENT` — `PdfDocument`

| Unit key | Fields | Kind | Manual merge | Grading | Rules |
|---|---|---|---|---|---|
| `pdf.file` | `assetId` | ASSET | no | – | `READY`, locked in id order (`lockPdfAssets`) |
| `pdf.placement` | `placement` | SCALAR | no | – | A referenced PDF must be `BOTH` or `SUPPLEMENTARY`; setting it to `MAIN` is refused while any exercise references it (`pdf-document.service.ts:157`). A published referencing exercise also requires visible, READY PDF ancestry (`pdf-reference.ts`). |

### 3.5 Manual materials — `ManualMaterial` (Turtle, written response, MC)

These units exist for all three manual types. Fields a type does not read
are still carried verbatim, so a copy stays byte-faithful to its master.
Phase 0 lists which fields each type reads.

| Unit key | Fields | Kind | Manual merge | Grading | Rules |
|---|---|---|---|---|---|
| `manual.description` | `description` | HTML | yes | – | MC: `sanitizeChoiceHtml` and every choice image in `assets` |
| `manual.hint` | `hint` | TEXT | yes | – | ≤ 1,000 characters |
| `manual.modelAnswer` | `modelAnswer` | TEXT | yes | – | private to staff |
| `manual.file:<path>` | `files[path]` | ITEM · CODE | yes | – | `sourceFilesSchema`: ≤ 64 files, ≤ 1 MiB, valid paths |
| `manual.entryPoint` | `entryPoint` | SCALAR | no | – | Turtle: the merged `files` contain it, and it ends in `.py` |
| `manual.solutionFiles@presence` | whether `solutionFiles` is null | SCALAR | no | – | removing the map conflicts with any local edits to its files |
| `manual.solutionFile:<path>` | `solutionFiles[path]` | ITEM · CODE | yes | – | `sourceFilesSchema`; independent paths merge separately |
| `manual.asset:<assetId>` | one `assets[]` entry | ITEM | no | – | `manualAssetsSchema`: ≤ 64, ≤ 20 MiB, unique names; the asset exists and matches name and size |
| `manual.solutionAsset:<assetId>` | one `solutionAssets[]` entry | ITEM | no | – | same |
| `manual.assets@order`, `manual.solutionAssets@order` | order of each manifest | ORDER | no | – | the manifests are arrays; their order is kept like any keyed list's (added in the build) |
| `manual.canvas` | `width`, `height` | GROUP | no | – | 320–2048 |
| `manual.execution` | `timeLimitSeconds`, `memoryLimitMb`, `runtimeVersion` | GROUP | no | – | ranges of `manualConfigSchema`; the runtime version travels with the unit, as the copier preserves it |
| `manual.scoring` | `submitEnabled`, `includeInScore`, `maximumHundredths`, and `Material.isRequired` | GROUP | no | future attempts | `includeInScore` ⇒ `submitEnabled`; `isRequired = includeInScore` |

### 3.6 `TURTLE_EXERCISE`

The §3.5 units only. Starter and solution files merge per path. If the academy
edits `main.py` while the library adds `helper.py`, both land. A file rename
is remove/add unless explicit identity is provided; removing an edited old
path raises a conflict and must not silently discard local code.

### 3.7 `WRITTEN_RESPONSE` — §3.5 plus `shortAnswer`

| Unit key | Fields | Kind | Manual merge | Grading | Rules |
|---|---|---|---|---|---|
| `sa.prompt` | `shortAnswer.question` | TEXT | yes | – | 1–1,000 characters |
| `sa.rule` | whether `shortAnswer` is present, `version`, `gradingMode`, `expectedAnswer`, `pattern` | GROUP | no | **answer key**: applies in place for future attempts (D1) | `EXACT` ⇒ non-blank `expectedAnswer`; `REGEX` ⇒ a pattern the evaluator compiles; unused fields cleared as `ManualService.save` does |
| `sa.explanation` | `explanationEnabled`, `explanation` | GROUP | yes | – | enabled ⇒ meaningful content |

### 3.8 `MULTIPLE_CHOICE` — §3.5 plus `multipleChoice`

| Unit key | Fields | Kind | Manual merge | Grading | Rules |
|---|---|---|---|---|---|
| `mc.prompt` | `question`, `problemDescription` | GROUP · HTML | yes | – | sanitized; images in `assets` |
| `mc.structure` | `version`, `selectionMode`, option keys **and their order**, `correctOptionIds`, `shuffleOptions` | GROUP | no | **answer key**: applies in place for future attempts (D1) | `multipleChoiceSchema`: 2–20 options, unique ids, `SINGLE` ⇒ exactly one correct, correct ids among the options |
| `mc.option:<k>` | `options[k].content` | ITEM · HTML | yes | – | meaningful content (`meaningfulChoiceHtml`); images in `assets` |
| `mc.explanation` | `explanationEnabled`, `explanation` | GROUP · HTML | yes | – | enabled ⇒ meaningful; images in `solutionAssets` |

`mc.structure` is exactly the set of fields the editor's lock calls
structural (`manual.service.ts:294-300`). Option wording is separate, so an
academy fixing a typo in option B and the library changing the correct
answer do not conflict. An option's text applies only while the option is in
the merged structure. When the library's structure adds an option, the copy
mints a local option id and records it in the link's `optionMap`.

Removing an option is different from merely editing the key: if its local
wording changed, hold back the affected structure removal and raise a grouped
conflict. Do not discard an academy wording edit because the option vanished
from the merged structure. Adding/removing an option and its content is one
validated operation even though wording edits otherwise merge independently.

### 3.9 Meta units (added in the build)

Carried in every snapshot, never merged, conflicted or counted as divergence
(`isMetaUnit`): they exist so a node added by sync is written exactly as its
master holds it.

| Unit key | Fields | Used for |
|---|---|---|
| `@externalKey` | `CourseModule.externalKey`, `Lecture.externalKey`, `ProgrammingExercise.externalKey` | the key an added node is created with (a fresh key on a local clash) |
| `@semanticVersion` | `ProgrammingExercise.gradingSemanticVersion` | the semantics an added exercise grades under, and the version taken when `exercise.gradingProfile` applies; a test-only change keeps the stored version |

## 4. Excluded fields

| Field | Why it is not synced |
|---|---|
| every `id`, parent foreign key, `createdAt`, `updatedAt` | identity and bookkeeping; node identity is the link |
| `isVisible` on course, module, lecture, material | academy-owned delivery (D8); additions arrive visible (D3) |
| `position` | replaced by `@placement` / `@order`, which merge order rather than numbers |
| `CourseModule.externalKey`, `Lecture.externalKey`, `ProgrammingExercise.externalKey` | import identity, not content; carried when a node is added, and used for legacy linking |
| `Material.type` | immutable; a changed type would be a removal plus an addition |
| `Course.language` | release/adoption metadata, immutable once a copy holds a problem; mismatch conflicts on incompatible changes/additions |
| `Course.contentRevision`, `sourceCourseId`, `sourceContentRevision`, `baselineRevision`, `retiredAt`, `createdByUserId`, `academyId` | provenance and bookkeeping (design §5) |
| `ExplanationMaterial.revision`, `ManualMaterial.revision`, `PdfDocument.revision`, `VideoLesson.revision` | local optimistic-concurrency counters, bumped by the writer |
| `ProgrammingExercise.gradingRevision` | local grading counter, bumped by the writer (design §11) |
| `ProgrammingExercise.gradingSemanticVersion` | derived from the grading profile when that unit applies |
| `ProgrammingExercise.solutionCode` | derived from the first solution |
| `ProgrammingExercise.legacyProblemNo` | identifies an MVP-era problem; never copied |
| `VideoLesson.requestKey` | per-row idempotency key; fresh on every insert |
| `ExerciseTestCase.syncKey` and the other `syncKey`s, MC option ids | item identity: the key, not a value |

Never copied or merged as authored content: classes, class assignments, enrollments, drafts,
collaboration documents, submissions and their cases, reviews, assessments,
progress, solve sessions, views, watch progress, feedback, help requests,
monitoring visits, points, learning days, staff practice, import sessions,
and media and asset upload rows. Batched history/existence checks, authorized
asset metadata reads, monitoring revocation and the explicit progress-revision
roll-forward are allowed by design §§10–12. Their records are not overwritten
with library data. Visibility is academy-owned; record local delivery
overrides separately when needed for removal/archive decisions.

## 5. Cross-unit rules

Checked on each merged material after the per-unit merge (design §8.3).

| Rule | Units involved | Validator today |
|---|---|---|
| A C/C++ problem uses weighted grading and keeps prompts | `exercise.language`, `exercise.gradingProfile` | `assertLanguageGrading` (`course.service.ts:2262`) |
| Limits are supported, and each case's soft limit is below its hard limit | `exercise.limits`, every `exercise.testCase:<k>` | `assertGradingSupported`, case schema |
| Grading profile is internally consistent | `exercise.gradingProfile`, `exercise.submissionPolicy`, cases | `gradingProfileIssues` |
| Reference PDF exists in this copy and permits exercise use | `exercise.referencePdf`, target's presence, `pdf.placement`, target visibility/ancestry | `validatePdfReference`; local academy references can remain local; library references must map to a target in this copy |
| Combined test text ≤ 16 Mi | every `exercise.testCase:<k>` | `refineGrading` |
| The Turtle entry point exists and is Python | `manual.entryPoint`, `manual.file:<path>` | `saveManualSchema` refinement |
| Score-included work can be submitted | `manual.scoring` | `saveManualSchema` refinement |
| MC images belong to the manifests | `mc.prompt`, `mc.option:<k>`, `mc.explanation`, `manual.asset:*`, `manual.solutionAsset:*` | `MultipleChoiceService.normalize` |
| The MC key is valid | `mc.structure`, `mc.option:<k>` | `multipleChoiceSchema` |
| Removing an option does not lose an academy wording edit | `mc.structure`, removed `mc.option:<k>` | three-way structural merge, then `multipleChoiceSchema` |
| Removing/archiving a node does not lose local descendants or break references | presence, parent/order, descendant units, incoming references | merged course graph and batched history checks |
| Manual files and manifests satisfy aggregate bounds and unique names | all starter/solution paths, presence unit, asset/solutionAsset items | `sourceFilesSchema`, `manualAssetsSchema` |
| Video images are in the manifest; captions belong to the asset | `video.instructions`, `video.media` | `VideoService.save` checks |
| A supplementary video is unscored | `video.placement`, `video.scoring` | `saveVideoSchema` refinement |
| Course title is free in the academy | `course.title` | `assertTitleAvailable` |

When a rule fails, hold back contributing library units and structural
operations, record grouped membership, then revalidate to a fixed point.
Anything the academy already had stays as it is. Validation may span nodes;
per-material checks alone cannot protect a referenced PDF or removed parent.

## 6. Completeness test

`packages/api/src/library-sync/catalog/catalog-completeness.spec.ts`:

1. Reads `Prisma.dmmf` for `Course`, `CourseModule`, `Lecture`, `Material`,
   `ExplanationMaterial`, `VideoLesson`, `ProgrammingExercise`,
   `ExerciseTestCase`, `ExerciseHint`, `ProgrammingExerciseSolution`,
   `PdfDocument` and `ManualMaterial`.
2. Reads the zod shapes behind the JSON columns: `multipleChoiceSchema`,
   `shortAnswerSchema`, `videoCaptionSchema`, video `assets`,
   `manualAssetsSchema`, the feedback policy schema and the quiz definition
   schema.
3. Fails unless every scalar field and every JSON key is claimed by exactly
   one unit, or appears in the exclusion list with a reason string.

A new column or JSON key therefore fails CI until someone decides how it
syncs.


## Implementation notes (2026-11-18)

Catalog-completeness tests cover persisted authored fields for all seven material
types. The full merged definition, including new additions, passes the editor save
schema and dependency rules; supported legacy definitions have explicit narrow
compatibility checks. Existing issues cannot block an unrelated update forever.

Unknown legacy case/hint/solution lists and MC structure/options are reviewed as a
complete group. Exact-unique nested values can align identities; position and
length never prove correspondence. Group comparisons include every member and
manual merging is offered only for a single text/code decision. Parent/order
exceptions persist their original full values across unrelated releases.

Archive/restore and title/required changes invalidate each type's editor version.
A solution manual merge preserves its title/shape. Solution-map removal waits while
any file survives. All surviving exercises participate in PDF dependency checks,
including academy-only exercises and cross-lecture references. A blocked removal
uses `REFERENCED_PDF` detail on the existing conflict kind; acceptance rechecks live
references and keep makes the retained node academy-owned.
