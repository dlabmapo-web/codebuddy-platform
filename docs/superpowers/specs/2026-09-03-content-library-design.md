# The Content Library — Head Office Authors, Branches Copy

**Date:** 2026-09-03
**Status:** Implemented 2026-09-03; §17 records where the build corrected this document
**Scope:** `/admin/content/library`, `academyLibrary.*`, `Academy.kind`, `Course` provenance
**Branch:** `feat/platform-admin-console` (continues)
**Extends:** [Platform Administration](../../design/2026-08-18-cove-v2-platform-administration-design.md),
whose §3.2 anticipated exactly this customer.

## 1. Summary

DLab is a franchise. Head office writes the curriculum once; each branch
academy teaches it, and adapts the parts that do not suit its students. Cove
cannot express that. `Course.academyId` is required, so every course belongs to
exactly one academy, and the only way curriculum has ever moved between two of
them is a person exporting an Excel workbook and importing it somewhere else.

This document adds a **content library**: a platform-owned place where a
platform admin authors master courses, and from which any academy in the same
organization takes a complete copy into itself.

The copy is a copy. It is not a reference, not a link, and not a subscription:

```
  CONSOLE                          BRANCH ACADEMY
  /admin/content/library
    Python Level 1  rev 5   ──copy──►  Python Level 1  (Gangnam's own rows)
                                          sourceContentRevision = 5
                                          hidden until Gangnam publishes it
                                          Gangnam edits anything it likes

  head office edits the master  ──►  Gangnam is untouched, and is told
                                     "a newer version is available"
```

### 1.1 Why a copy and not a shared live course

A live shared course is the obvious alternative and it is wrong here, for three
reasons of increasing seriousness.

1. **One edit would reach live classes everywhere at once.** Head office
   restructuring a module on a Tuesday would rewrite what a Busan teacher is
   teaching that afternoon.
2. **It fights the authorization model.** Every read and write in the product
   passes `AcademyAccessService.requirePermission(userId, academyId, …)`. A
   course belonging to no single academy has no `academyId` to check.
3. **It breaks the class chain.** `Class → ClassCourse → Course → academyId` is
   walked by every roster, ranking, progress and submission read. A course
   shared by Gangnam and Busan makes that chain ambiguous, and the damage is
   spread across surfaces that have nothing to do with this feature.

Copying keeps all three intact. Its cost — a branch's copy does not receive
head office's later fixes — is real, and §8 answers it with a status, not with
a merge engine.

### 1.2 What this is not

- Not a merge, diff, or re-sync system. A branch that wants head office's newer
  version takes a **fresh copy as a separate course** and retires its old one.
- Not module-level cherry-picking. The unit is a whole course.
- Not a route from a branch back into the library. Content flows one way.
- Not cross-branch sharing. A branch never sees another branch's courses.
- Not per-branch entitlement. Every academy in the organization sees every
  published library course. §16 keeps room for this.

## 2. What exists today

| Fact | Evidence |
|---|---|
| A course belongs to exactly one academy | `Course.academyId` required, `onDelete: Restrict` — `packages/api/prisma/schema.prisma:995` |
| No clone, copy, fork or template concept exists anywhere | no match in `packages/{api,shared,web}/src` |
| The only cross-academy content path is a human with a spreadsheet | `packages/api/src/content/import/content-import.service.ts` |
| Every course tree mutation already bumps a revision | `Course.contentRevision` — `schema.prisma:1007` |
| The console already mounts academy editors under console routes | `packages/web/src/app/(platform)/admin/academies/[academySlug]/courses/[courseId]/page.tsx:5` imports `CourseBuilder` from the studio route |
| Editor links are already surface-parameterized | `ContentSurface = 'academy' \| 'console'` — `packages/web/src/components/studio/content-paths.ts` |
| A platform operator may read inside any academy but **never write** | `packages/api/src/authorization/academy-access.service.ts:61` |
| The platform holds exactly one organization, resolved by slug on first use | `packages/api/src/platform/platform-organization.ts` |
| The console has no flat problems list, by decision | `packages/web/src/app/(platform)/admin/content/problems/page.tsx` — permanent redirect |
| An academy's slug is unique within its organization | `Academy @@unique([organizationId, slug])` |

The sixth and seventh rows are the two that shape this design. The editor is
already portable across surfaces, so authoring costs almost nothing; and the
platform axis is read-only inside academies, so the library needs an explicit
answer about who may write in it (§3.2).

## 3. Decisions

### 3.1 The library is an academy of a new kind

`Academy.kind: ACADEMY | LIBRARY`. A library is an `Academy` row whose courses
are ordinary `Course` rows.

The alternative — a parallel `LibraryCourse` / `LibraryModule` /
`LibraryLecture` / `LibraryMaterial` / `LibraryExercise` / `LibraryTestCase`
tree — duplicates six models, and with them the authoring services, the
curriculum builder, the exercise editor, the visibility rules, the Excel import
and export, and every test that covers them. Two content trees would then have
to be kept in step forever, and the first divergence would be a problem
authored in the library that the branch editor could not open.

The second alternative — making `Course.academyId` nullable — is cheaper to
write and far more expensive to own. It puts a null branch into
`AcademyAccessService`, into class assignment, into submissions, into the
import service, and into every content read in the product, to buy a property
this design does not need.

So `Course.academyId` stays required and non-null, and the library gets its
`academyId` like everything else. **Nothing in the existing content, class,
submission or authorization paths changes.**

### 3.2 A library academy has no members; the platform axis is its only authority

`academy-access.service.ts:61` states the rule this design must not break:

> *"A platform operator's standing read, last, and **reads only**. […] Every
> write still needs a grant, so what was done stays attributable even though
> what was read is not."*

That rule protects **a customer's** data: writing into someone else's academy
must be justified and attributable, which is what the time-limited support
grant with its written reason is for. Using that machinery for head office's
routine curriculum authoring would fill the grant log with "authoring" and
destroy the signal the log exists to carry.

A library academy is not a customer's academy. It is platform-owned content.
So the platform axis is the correct authority for it, and the rule above is
untouched for the case it was written for.

| `Academy.kind` | Authority |
|---|---|
| `ACADEMY` | membership → support grant → platform **read-only** *(unchanged)* |
| `LIBRARY` | platform permissions **only** — no memberships, ever |

A library academy therefore has no members, no students, no classes, no
invitations and no applications. Those surfaces go quiet on their own rather
than needing to be told to hide it (§11).

The cost, stated plainly: a library course's author is recorded as the platform
admin who wrote it, not as a named curriculum author with their own academy
account. `Course.createdByUserId` still records the individual, so nothing is
lost if that is later wanted.

### 3.3 Organization scopes who sees which library

`Academy.organizationId` already exists and is already required, so the
visibility rule needs no new column and no new join:

> An academy may copy from library academies where `kind = LIBRARY` **and**
> `organizationId` equals its own.

This matters because Cove is multi-tenant. When a non-DLab academy is onboarded
it must not see DLab's curriculum, and this rule gives that for free. It is
also precisely the move the platform administration design reserved:

> *"If a franchise arrives later wanting several branches grouped under one
> customer, the fix is to add an organization surface and re-point some
> `organizationId` values — a data change against a schema that already models
> it."*

No organization management UI is required by this slice. The admin sets an
academy's organization from the existing academy edit form, and the platform
continues to resolve one organization by configured slug until a second
customer arrives.

**At most one library per organization**, enforced by a partial unique index
(§4.4). Two libraries in one organization would make "the library" ambiguous in
every sentence of the branch UI.

### 3.4 Retire, never delete

Head office needs to withdraw a course without destroying the record that
branches copied it. `isVisible = false` cannot express this: a draft that was
never offered and a course that was offered and withdrawn are different states,
and flattening them would make "retired" unreadable on a branch's copy.

So `Course.retiredAt DateTime?`, matching the `Class.archivedAt` precedent at
`schema.prisma:1045`. Retiring blocks new copies and marks existing ones. It
changes nothing about copies already taken, because those are the branch's own
rows.

`Course.sourceCourseId` is `onDelete: Restrict`, the house style for `Course`,
so the **database** refuses to delete a library course while any copy of it
exists. The service answers that refusal by pointing head office at Retire.
`SetNull` would leave branch courses with amnesia about where they came from,
which is the one fact this feature exists to record.

### 3.5 Sync and customization are two axes, not four states

The four states a branch cares about — up to date, update available, customized,
source retired — are not mutually exclusive. The combination that matters most
is the one a four-state enum cannot express: **customized *and* an update is
available**, which is exactly when re-copying would throw away the branch's own
work.

| | copy untouched | copy customized |
|---|---|---|
| **source current** | Up to date | Customized |
| **source ahead** | Update available — *re-copy is free* | Customized · update available — *re-copy loses your edits* |
| **source retired** | Retired by head office | Retired · customized |

So the UI renders **one sync chip plus a quiet `Customized` marker**, never one
combined label. Six merged strings would each need translating and none of them
would scan.

Both axes derive from `contentRevision`, which is already bumped by every
mutation anywhere in a course tree, in the same transaction as the mutation
(`schema.prisma:1007`). No new bookkeeping is introduced; §8 gives the
arithmetic.

### 3.6 The library is its own page, not a third content lens

`/admin/content/{courses,classes}` share one input schema and one table through
`contentLensHrefs`. A library course has no academy column, different row
actions, and a different question behind it, so it shares neither. The sidebar
already argues this, about Ranking:

> *"That machinery describes two lists sharing one input schema and one table,
> and a member sharing neither would make the abstraction a coincidence."*

## 4. Data model

Four changes. Everything else already exists.

### 4.1 `AcademyKind`

```prisma
enum AcademyKind {
  /// A customer's academy: has members, classes, and students.
  ACADEMY
  /// Platform-owned curriculum. Has courses and nothing else — no members,
  /// no classes, no students, no invitations. Authored through the platform
  /// permission axis (§3.2) and excluded from every tenant listing (§11).
  LIBRARY
}

model Academy {
  kind AcademyKind @default(ACADEMY)
}
```

Defaulted, so every existing row is correct without a backfill.

### 4.2 `Course` provenance

```prisma
model Course {
  /// The library course this was copied from, or null for a course the
  /// academy authored itself.
  ///
  /// Restrict, not SetNull: the database refuses to delete a library course
  /// while copies of it exist, and head office is pointed at Retire (§3.4).
  /// Losing this pointer would lose the only record of where a branch's
  /// curriculum came from.
  sourceCourseId        String? @map("source_course_id") @db.Uuid
  /// The source's `contentRevision` at the instant of copying. Compared
  /// against the source's current revision to decide whether head office has
  /// moved on (§8).
  sourceContentRevision Int?    @map("source_content_revision")
  /// This course's *own* `contentRevision` immediately after the copy
  /// transaction. Anything above it is the branch's own editing.
  ///
  /// Stored rather than assumed to be 1, so a future change to the copy path
  /// — one that bumps the revision while building the tree — cannot silently
  /// make every copy read as customized.
  baselineRevision      Int?    @map("baseline_revision")

  sourceCourse Course?  @relation("CourseSource", fields: [sourceCourseId], references: [id], onDelete: Restrict)
  copies       Course[] @relation("CourseSource")

  /// Set only on a library course. Withdrawn from the library: no new copies
  /// may be taken, and existing copies are marked. Null is the ordinary state
  /// for every course in the product.
  retiredAt DateTime? @map("retired_at") @db.Timestamptz(6)

  @@index([sourceCourseId])
}
```

All four are nullable, because every course that exists today was authored in
place and has no source.

### 4.3 What is copied, and what is not

| Copied | Not copied |
|---|---|
| `Course` — title, description | `isVisible` (a copy always lands hidden, §7) |
| `CourseModule` — including `externalKey` | `contentRevision` (the copy starts its own) |
| `Lecture` — including `externalKey` | `ExerciseDraft`, `Submission` — student work |
| `Material` — type, title, position, `isRequired`, `isVisible` | `ClassCourse` — delivery is the branch's decision |
| `ProgrammingExercise` — every authored field | `legacyProblemNo` — identifies an MVP-era problem, which a branch copy is not |
| `ExerciseTestCase` — input, expected output, visibility, position | `gradingRevision` — restarts at 1; the copy has graded nothing |
| `ExerciseHint` | `ContentImportSession`, `StudentCourseLearningDay` |

`externalKey` is copied verbatim rather than regenerated. It is unique per
course (`@@unique([courseId, externalKey])`), and the copy is a new course, so
the keys cannot collide — and preserving them means the branch can round-trip
its copy through the Excel import exactly as it could round-trip a course it
authored by hand.

### 4.4 One library per organization

Prisma cannot express a partial unique index, so the migration adds it in raw
SQL:

```sql
CREATE UNIQUE INDEX academies_one_library_per_org
  ON academies (organization_id)
  WHERE kind = 'LIBRARY';
```

## 5. Shared contracts

### 5.1 Platform permissions — `packages/shared/src/auth/roles.ts`

```ts
export const platformPermissions = [
  …,
  /**
   * Reading the library: its courses, and which academies copied them.
   *
   * Apart from `author` so a support or billing operator can see which course
   * a branch is asking about without being able to rewrite the master
   * curriculum every academy on the platform is teaching from.
   */
  "platform.library.read",
  /** Creating, editing and retiring library courses, and everything beneath
   *  them. Deleting one is refused by the database while copies exist (§3.4). */
  "platform.library.author",
] as const;
```

`ADMIN` holds both. The split follows the convention the list already
establishes for `academies.create` / `lifecycle` / `delete`.

### 5.2 Library shapes — `packages/shared/src/platform/library.ts`

```ts
/** A master course as head office reads it. */
export const libraryCourseSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  description: z.string(),
  isVisible: z.boolean(),          // listed in the library for branches
  retiredAt: z.iso.datetime().nullable(),
  contentRevision: z.number().int().positive(),
  moduleCount: z.number().int().nonnegative(),
  lectureCount: z.number().int().nonnegative(),
  exerciseCount: z.number().int().nonnegative(),
  /** Problems with no test cases. Loud here: a broken master propagates to
   *  every branch that copies it. */
  problemsWithoutTests: z.number().int().nonnegative(),
  /** How many academies hold a copy, and how many of those are behind. */
  copyCount: z.number().int().nonnegative(),
  behindCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});

/** One academy's copy, as head office reads it on the fan-out panel. */
export const libraryCopySchema = z.object({
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  courseId: z.uuid(),
  courseTitle: z.string().min(1),
  /** The copy's own `sourceContentRevision` — the master revision it was
   *  taken at. Named identically to the column so the fan-out and the branch
   *  chip cannot be read as two different numbers. */
  sourceContentRevision: z.number().int().positive(),
  isCustomized: z.boolean(),
  copiedAt: z.iso.datetime(),
});

/** A master course as a branch reads it, before deciding to copy. */
export const availableLibraryCourseSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  description: z.string(),
  contentRevision: z.number().int().positive(),
  moduleCount: z.number().int().nonnegative(),
  lectureCount: z.number().int().nonnegative(),
  exerciseCount: z.number().int().nonnegative(),
  /** Courses in *this* academy already copied from it. Empty is the ordinary
   *  case; a non-empty list is what stops a branch copying twice by accident. */
  existingCopies: z.array(z.object({ courseId: z.uuid(), title: z.string() })),
});

/** The sync half of §3.5, computed by the server (§8). */
export const librarySyncStateSchema = z.enum([
  "UP_TO_DATE",
  "UPDATE_AVAILABLE",
  "SOURCE_RETIRED",
]);

export const courseProvenanceSchema = z.object({
  sourceCourseId: z.uuid(),
  sourceTitle: z.string().min(1),
  syncState: librarySyncStateSchema,
  isCustomized: z.boolean(),
  copiedAt: z.iso.datetime(),
});
```

`courseProvenanceSchema` is added, nullable, to `courseSummarySchema` in
`packages/shared/src/content/` so the branch's ordinary course list carries it
without a second request.

### 5.3 `packages/shared/src/api/orpc/platform-library.contract.ts`

```ts
export const platformLibraryContract = {
  /** The library, creating it on first read if the organization has none. */
  courses: oc.input(listLibraryCoursesSchema).output({ courses, total }),
  create:  oc.input(createLibraryCourseSchema).output(libraryCourseSchema),
  retire:  oc.input({ courseId, retired: z.boolean() }).output(libraryCourseSchema),
  /** Which academies hold a copy, at which revision, and whether they
   *  have since edited it. */
  copies:  oc.input({ courseId }).output({ copies: [...], total }),
};
```

Registered as `platformLibrary`. Editing a library course's *contents* uses
`academyCourses.*` unchanged — the console mounts the same builder (§9.3), and
this contract deliberately does not restate a single curriculum mutation.
Publishing and unpublishing are `academyCourses.setVisibility` for the same
reason.

`create` is the one exception, and exists because it is the only call that
cannot name an academy: it resolves the organization's library — creating it on
first use, as `resolvePlatformOrganization` already does for the organization
itself — and then creates the course inside it. Every later call has a
`courseId` and needs no such resolution.

### 5.4 The branch side — `packages/shared/src/api/orpc/library.contract.ts`

```ts
export const academyLibraryContract = {
  /** Published, unretired library courses this academy may copy. */
  available: oc.input({ academyId }).output({ courses: [...] }),
  /** The outline, read-only, for the preview before copying. */
  preview:   oc.input({ academyId, libraryCourseId }).output(courseTreeSchema),
  /** The one write. Title is editable so a second copy is distinguishable
   *  from the first (§10). */
  copy: oc
    .input({ academyId, libraryCourseId, title: z.string().min(1).max(200) })
    .output(courseSummarySchema),
};
```

Registered as `academyLibrary`. It is a separate contract from
`academyCourses` because it is the only part of the branch surface that reads
across an academy boundary, and that boundary should be visible in the
contract list rather than buried in a method.

### 5.5 New error codes — `packages/shared/src/errors/codes.ts`

| Code | Meaning |
|---|---|
| `LIBRARY_COURSE_NOT_AVAILABLE` | Retired, unpublished, or in another organization's library |
| `LIBRARY_COURSE_HAS_COPIES` | Delete refused; retire it instead |
| `LIBRARY_ACADEMY_IMMUTABLE` | A class, membership, invitation or enrollment was attempted in a `LIBRARY` academy |

## 6. Authorization

### 6.1 One branch, in the one gate

`AcademyAccessService.requirePermission` is *"the one gate every academy read
and write passes through"*. The library rule belongs there and nowhere else:

```
requirePermission(authUserId, academyId, permission)
  ├─ load user; refuse suspended / incomplete            (unchanged, first)
  ├─ load academy.kind alongside the membership lookup    (no extra round trip)
  │
  ├─ kind === LIBRARY
  │     platform.library.author  → write permissions granted, via: "platform"
  │     platform.library.read    → read permissions granted,  via: "platform"
  │     otherwise               → PLATFORM_ACCESS_DENIED
  │     (memberships and support grants are never consulted)
  │
  └─ kind === ACADEMY
        membership → support grant → platform read-only    (unchanged)
```

`AcademyAccess.via` already has `"platform"` as a value, so the audit writer
stamps library authoring correctly with no change.

Selecting `kind` in the existing membership query keeps this at the same number
of round trips it makes today.

### 6.2 The branch side needs no new permission

`academyLibrary.copy` runs against the **branch's** `academyId`, so it
authorizes exactly as course creation does today — `curriculum.manage`, which
`TEAM_LEAD` and `MANAGER` hold. It then checks the source separately: the
library course must be visible, unretired, and in a `LIBRARY` academy sharing
the caller's `organizationId`, or `LIBRARY_COURSE_NOT_AVAILABLE`.

`academyLibrary.available` and `.preview` require `curriculum.review`.

### 6.3 A library academy refuses everything that is not a course

`Class` creation, membership creation, invitations, applications and enrollment
all reject a `LIBRARY` academy with `LIBRARY_ACADEMY_IMMUTABLE`. These are
paths nobody will call, and they are cheap guards on the assumption the rest of
the design rests on: a library holds courses and nothing else.

## 7. The copy transaction

`LibraryCopyService.copy(identity, { academyId, libraryCourseId, title })`:

```
1. requirePermission(user, academyId, "curriculum.manage")
2. load source with its full tree; assert
     source.academy.kind === LIBRARY
     source.academy.organizationId === target.organizationId
     source.isVisible && source.retiredAt === null
   else LIBRARY_COURSE_NOT_AVAILABLE
3. in one transaction, generating UUIDs in application code so each level is a
   single createMany with its parents already known:
     course        (1 row)
     modules       createMany
     lectures      createMany
     materials     createMany
     exercises     createMany
     test cases    createMany
     hints         createMany
4. the new course row is written with
     academyId       = target
     isVisible       = false
     contentRevision = 1
     baselineRevision = 1
     sourceCourseId  = source.id
     sourceContentRevision = source.contentRevision
     createdByUserId = the copying user
5. audit: content.course.copied_from_library
     academyId = target, targetId = new course
     metadata  = { sourceCourseId, sourceContentRevision }
```

**Nothing is shared.** No draft, submission, class assignment or learning-day
row crosses. From step 3 the copy is an ordinary academy course, and every
existing endpoint treats it as one.

**Why `createMany` per level rather than a nested create:** a large course is
several thousand rows, and the whole copy runs in one transaction. Six bulk
inserts keep it inside the transaction timeout where a deep nested create with
per-row round trips would not. Step 2's read is the only place the source tree
is materialized, and it is bounded by `CONTENT_IMPORT_MAX_PROBLEMS`, which
already bounds anything authorable through these editors.

**Why the copy starts hidden:** `Course.isVisible` already defaults to false,
and a copy nobody has reviewed must not be teachable. The branch publishes it
deliberately, from the editor it is already standing in.

## 8. Deriving the status

Both axes come from revisions that already exist. For a branch course with a
`sourceCourseId`, the server reads **only** `{ id, title, contentRevision,
retiredAt }` from the source row — never its tree, never anything else in the
library academy. That narrow select is the authorization boundary, and it is
what makes a cross-academy read acceptable on an academy-scoped surface.

```ts
const isCustomized = course.contentRevision > course.baselineRevision;

const syncState =
  source.retiredAt !== null                                ? "SOURCE_RETIRED"
  : source.contentRevision > course.sourceContentRevision  ? "UPDATE_AVAILABLE"
  : "UP_TO_DATE";
```

`SOURCE_RETIRED` wins over `UPDATE_AVAILABLE` deliberately: a branch must not
be invited to re-copy a course head office has withdrawn.

The same two values, read the other way, give head office the fan-out on
`platformLibrary.copies` — `behindCount` is the number of copies whose
`sourceContentRevision` is below the master's current `contentRevision`.

These are pure functions of four integers and one timestamp. They live in
`packages/shared/src/platform/library.ts` and are unit-tested there, so the
console and the branch surface cannot disagree about what "up to date" means.

## 9. The console surface

### 9.1 Routes

```
/admin/content/library                          master courses · [Create course]
/admin/content/library/[courseId]               CourseBuilder — modules, lectures
/admin/content/library/[courseId]/lectures/[lectureId]/exercises/[materialId]
                                                statement, solution, test cases
```

The library academy's slug never appears in a URL. It is resolved server-side
from the operator's organization, so head office never sees its own curriculum
addressed as though it were a customer's academy — which is what makes "hidden"
true in the interface and not only in the database.

### 9.2 The rail

`platform-sidebar.tsx`, Content group:

```
Content
  Library            /admin/content/library     ← new
  Academy courses    /admin/content/courses     ← renamed from "Courses"
  Classes            /admin/content/classes
  Ranking            /admin/ranking
```

The rename is required, not cosmetic. `/admin/content/courses` answers *"what
is Busan running right now"* on a support call; the library answers *"what does
head office publish"*. With both present, a row called plain **Courses** names
neither.

### 9.3 Authoring reuses the editor, for the third time

`ContentSurface` gains `'library'`:

```ts
export type ContentSurface = 'academy' | 'console' | 'library';
```

The `'library'` branch of `createContentPaths` ignores `academySlug` and builds
`/admin/content/library/...` paths. `CourseBuilder`, the lecture editor, the
exercise editor and the test-case editor are then mounted under the library
routes exactly as `admin/academies/[academySlug]/courses/[courseId]/page.tsx`
mounts them today. No editor component is copied, forked or modified.

There is deliberately **no library problems list**. A problem is reached by
opening the course that holds it — the rule `admin/content/problems/page.tsx`
already redirects to enforce.

### 9.4 The library list

The columns of the content browser, minus the academy column, plus the fan-out:

| Column | Note |
|---|---|
| Course | title, description |
| Shape | modules · lectures · problems |
| Cannot grade | `problemsWithoutTests`, **loud** — a broken master reaches every branch that copies it |
| Copied by | `copyCount`, opening the fan-out panel |
| Behind | `behindCount`, quiet at zero |
| State | Draft (`!isVisible`), Published (`isVisible`), Retired (`retiredAt !== null`, which wins over both) |
| Updated | |

Row actions: Open (the builder), Rename, Publish/Unpublish, Retire/Restore,
Delete — where Delete is refused by the database while copies exist and answers
`LIBRARY_COURSE_HAS_COPIES`, which the dialog renders as a pointer to Retire.
`ContentRowActions` is reused; the refusal is shown, never predicted, which is
the rule that component already documents.

## 10. The branch surface

```
/academy/[slug]/content/courses     [Add from library]
/academy/[slug]/content/library     browse · preview · copy
```

The library page lists `academyLibrary.available` as cards or rows with their
shape counts. Selecting one opens a **read-only outline preview** — the same
`courseTreeSchema` the builder renders, without its controls — so a Team Lead
decides from the content and not from a title.

The copy dialog pre-fills the title and lets it be edited before copying. This
is what makes a second copy usable: course titles are deliberately not unique
(`Class`'s own schema comment makes the same point about names), so two rows
called "Python Level 1" would otherwise be indistinguishable in the branch's
own list. A branch taking head office's newer version names it accordingly,
compares the two, and deletes the old one when it is ready.

Where an academy already holds a copy, `existingCopies` puts a line on the row —
*"You already have a copy: Python Level 1"* — so copying twice is a decision
rather than an accident.

On the branch's ordinary course list, a course with provenance carries the sync
chip and, separately, the `Customized` marker (§3.5), plus one quiet line of
attribution: *"From library · Python Level 1"*.

## 11. Hiding the library

§3.2 removes most of this problem: a library academy has no members, classes,
invitations or applications, so those surfaces have nothing to show. What
remains must be excluded explicitly, and **as one predicate, not seven hand-written
filters** — a missed one means head office's curriculum appearing as a customer
academy in the middle of a support call.

`packages/api/src/platform/academy-kind.ts`:

```ts
/** Every listing that means "the platform's customers" filters on this. */
export const tenantAcademies = { kind: "ACADEMY" } as const;
```

Applied in:

| Where | Why |
|---|---|
| `platform-academy.service.ts` — `list` | the academies table |
| `platform-content.service.ts` — `courses`, `classes`, `summary` | the cross-academy browser and its counts |
| `content-stat-predicates.ts` | the counts behind the summary strip |
| `platform-ranking.service.ts` | a library has no students to rank |
| `platform-users.service.ts` | the academy facet dropdown |
| `platform-applications.service.ts`, `platform-invitations.service.ts` | the academy facet dropdowns |
| the support grant academy picker | a library is not enterable as a role |

A library academy is reachable in the console at exactly one address:
`/admin/content/library`.

## 12. i18n

New namespace `platform-library.json` (en, ko) for the console surface.
Additions to `courses.json` for the branch's Add-from-library entry point, the
preview dialog, the sync chip and the `Customized` marker. `nav.library` and
the renamed `nav.courses` in `platform.json`. The three error codes in
`errors.json`.

The sync chip's three strings and the customization marker are separate keys.
They are never concatenated into a sentence, because the two axes are
independent and Korean does not order them the way English does.

## 13. Sequence

Following the commit shape this branch already uses — shared, then db, then
api, then web:

1. `feat(shared)` — `AcademyKind`, library schemas, the two derivations and
   their tests, the contracts, the permissions, the error codes.
2. `feat(db)` — the migration: enum, `Academy.kind`, four `Course` columns, the
   self-relation, the partial unique index. Seed a library with two courses so
   the flow is exercisable in development.
3. `feat(api)` — the `requirePermission` branch and its tests; `resolveContentLibrary`
   mirroring `resolvePlatformOrganization`; `LibraryCopyService`;
   `platformLibrary` and `academyLibrary` routers; the `tenantAcademies`
   predicate applied at all seven sites.
4. `feat(web)` — `ContentSurface = 'library'`, the console library list and
   mounted editors, the rail rename.
5. `feat(web)` — the branch library page, preview, copy dialog, and the chips
   on the course list.
6. `test(e2e)` — §14.

Steps 1–3 are shippable without any UI: the copy is exercisable from the
contract tests, which is where the risk in this feature actually is.

## 14. Testing

**Unit — `packages/shared`.** The sync and customization derivations across the
2×3 matrix of §3.5, including the precedence of `SOURCE_RETIRED` over
`UPDATE_AVAILABLE`.

**Unit — `packages/api`.**

- `requirePermission` in a `LIBRARY` academy: a platform admin with
  `platform.library.author` may write; with only `platform.library.read` may
  not; a `TEAM_LEAD` membership of another academy is refused; a support grant
  is not consulted.
- `requirePermission` in an `ACADEMY` academy is unchanged — the existing suite
  must pass untouched, which is the evidence that this design did not widen the
  platform axis.
- Copy fidelity: every level of the tree arrives, counts match, `externalKey`s
  are preserved, hints and test cases come across, `legacyProblemNo` and
  `gradingRevision` do not.
- Copy isolation: editing the copy does not touch the source, and editing the
  source does not touch the copy.
- Copy stamps: `isVisible === false`, `contentRevision === baselineRevision`,
  `sourceContentRevision === source.contentRevision` at copy time.
- Refusals: a retired source, an unpublished source, a source in another
  organization's library, and deleting a library course that has copies.

**E2E.** Platform admin creates a library course with one module, one lecture
and one problem with test cases → branch Team Lead opens the library, previews
it, copies it → the copy is hidden and shows "Up to date" → the branch edits the
problem statement → the copy shows "Customized" → head office edits the master →
the copy shows "Customized · update available" → head office retires the master
→ the copy shows "Retired" and the library no longer offers it.

## 15. Risks

| Risk | Mitigation |
|---|---|
| A large course exceeds the copy transaction's time budget | Six `createMany` calls, UUIDs generated in application code; the source read is already bounded by `CONTENT_IMPORT_MAX_PROBLEMS`. Measure against the largest real DLab course before release. |
| A listing is missed and the library appears as a customer academy | One `tenantAcademies` predicate, applied at seven named sites (§11), with a test asserting the console academies list excludes a `LIBRARY` row. |
| Branches drift from the masters over time | Accepted, and the explicit trade of §1.1. The status chip and head office's `behindCount` make drift visible, which is the most this design promises. |
| Head office reading which branches customized their copies | Deliberate and disclosed: it is how a bad master is found. It exposes *that* a course was edited and never *how* — the fan-out reads counts and revisions, never a branch's content. |
| A second organization arrives before the org surface exists | The `organizationId` scope in §3.3 is already correct; only the admin UI for setting it is deferred, and the existing academy edit form covers it. |

## 16. Out of scope

Named so the contracts leave room rather than having to be reshaped.

- **Merge or diff** between a master and a copy. Re-copying as a new course is
  the answer, and §3.5's matrix is what makes it a safe decision.
- **Module-level cherry-picking** from several masters into one course.
- **Branch-to-library contribution.** Content flows one way.
- **Cross-branch sharing.** A branch never sees another branch's courses.
- **Per-branch entitlement** — "Level 3 only for premium branches". The
  `available` endpoint is the single place this rule would attach.
- **Library versioning with named releases.** `contentRevision` is a counter,
  not a tag, and this design does not need tags.
- **Named curriculum authors** inside the library, which §3.2 trades away and
  `Course.createdByUserId` preserves the possibility of.

## 17. What the build corrected

Six things this document got wrong or left out. They are recorded rather than
edited away, because each was a claim about the existing code that turned out
not to hold.

### 17.1 The permission names already existed

§5.1 proposed `platform.library.read` and `platform.library.author`. The list
in `roles.ts` already carried **`platform.library.manage`** and
`platform.library.distribute`, reserved by the console's own permissions
commit. The build added `platform.library.read` beside them and reused
`manage`; `distribute` stays unused, because in this design the branch pulls
rather than head office pushing.

Two of the three error codes existed too: `LIBRARY_COURSE_NOT_FOUND` and
`LIBRARY_ADOPTION_CONFLICT`. Only `LIBRARY_COURSE_HAS_COPIES` and
`LIBRARY_ACADEMY_IMMUTABLE` are new.

### 17.2 Course titles *are* unique per academy

§10 claimed titles are not unique and cited `Class`'s schema comment. That
comment is about classes. `CourseService.assertTitleAvailable` enforces
case-insensitive uniqueness per academy and raises `COURSE_TITLE_CONFLICT`.

So the copy dialog's editable title is **required**, not a convenience: an
academy taking head office's newer version of a course it already holds cannot
adopt at all without renaming it. `suggestedCopyTitle` pre-fills
`Python Level 1 (2)`, and the server answers a genuine clash with
`LIBRARY_ADOPTION_CONFLICT` — which is what that reserved code was for.

### 17.3 The platform axis is not read-only inside an academy

§1.1 and §3.2 lean on `academy-access.service.ts:61`, which says a platform
operator's standing access is *"reads only"*. The comment overstates what the
code does: `platformRead` returns `platformViewPermissions(role)`, which is the
Manager's full set minus `submissions.own.create` — including
`curriculum.manage`. Nothing globally refuses a write on `via: "platform"`;
only monitoring and assigned-class checks look at it.

This is pre-existing and out of scope here, and it does not weaken the library
branch — which is *narrower* than the view-role path (courses only, no classes
or members) and does not depend on the view-role cookie.
`library-access.spec.ts` asserts both paths against what the code actually
does, so the distinction cannot quietly erode.

### 17.4 The workbook importer came with the library

§5.3 said contents are edited through `academyCourses.*`. That is true of
`academyContentImports.*` as well, and `content.import` is in
`libraryAuthorPermissions` — so head office gets the Excel importer over master
courses with no import-specific work at all.

The library route turns it on (`canImport`), where the console's
academy-scoped builder deliberately leaves it off: importing into a customer's
course is their Team Lead's decision, and importing into head office's own
curriculum is head office's.

### 17.5 One endpoint the design did not anticipate

`platformLibrary.academy` returns the library's academy id. The editors mounted
over a master are the academy editors and are addressed by academy, while the
library's routes carry no academy slug — so the id has to be resolved
server-side rather than read from the URL. The adopt call is
`academyLibrary.adopt`, not `.copy`.

### 17.6 The branch copy needed its own i18n namespace

§12 put the branch's library vocabulary in `courses.json`. `courses` is a
layout namespace, so that shipped the whole library vocabulary in the RSC
payload of every page a student loads — and the Korean payload budget in
`@cove/i18n`'s `locales.spec.ts` refused it, 109 bytes over.

It is now `academy-library`, a page namespace mounted by the library route and
by the courses list (whose rows draw the provenance chips). This is the split
that budget exists to force, and it worked.
