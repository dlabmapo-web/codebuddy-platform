# Adopted Course Readiness Design

**Date:** 2026-09-04

**Status:** Implemented

**Scope:** What a branch academy receives when it copies a course from the
content library, and how a Manager or Team Lead is told that a course is not
yet teachable.

## 1. The report

A Manager copies a course from the library. The copy lands hidden, which is
correct and documented. They publish it, assign it to a class, and the students
in that class see nothing — not an empty course, not a locked course, no course
at all. The row simply is not in their list.

Nothing in the interface says why.

## 2. What is actually happening

Five facts, each true on its own, compose into that outcome.

**2.1 Every content row is born hidden.** `isVisible Boolean @default(false)`
on `Course`, `CourseModule`, `Lecture` and `Material`
(`schema.prisma:1109,1308,1337,1358`). Hand authoring writes it explicitly
(`course.service.ts:716`) and so does the workbook importer
(`content-import.service.ts:758,822,907,934`). This is decision 2 of the
2026-08-03 curriculum visibility design, and for hand authoring it is right: a
Team Lead writing a module over three afternoons must not be publishing it a
paragraph at a time.

**2.2 A library master's tree is therefore hidden, and stays hidden.** Nobody
studies inside a `LIBRARY` academy. It has no members, no classes and no
students, so head office has no reason to ever toggle a module visible, and no
surface that would look different if they did. The flags sit at their defaults
because in the library they mean nothing.

**2.3 The copy inherits those meaningless flags verbatim.**
`AcademyLibraryService.adopt` writes `isVisible: courseModule.isVisible`,
`isVisible: lecture.isVisible` and `isVisible: material.isVisible` straight
across, while forcing `isVisible: false` on the course row itself. §4.3 of the
content library design lists module, lecture and material visibility in the
*Copied* column. So the branch receives a complete course in which every single
row is hidden.

**2.4 A student needs the whole ancestor chain.**
`effectivelyVisibleMaterialWhere` (`curriculum-visibility.ts:9-22`) and
`visibleCurriculumInclude` (`curriculum-outline.service.ts:25-42`) filter at
all four levels. Course visible plus modules hidden reaches nothing.

**2.5 And then the course disappears rather than reading as empty.**
`courseSummaryFor` returns `null` when a course has zero visible exercises
(`curriculum-outline.service.ts:171-177`), and both callers drop it — the
student catalog (`learn.service.ts:94`) and the class's course list
(`learn-class.service.ts:253`). That silence is the difference between a
confusing product and a broken one. A student who sees "0 problems" asks their
teacher. A student who sees nothing does not know there is anything to ask
about.

**2.6 There is no way to fix it in bulk.** `setModuleVisibility`,
`setLectureVisibility` and `setMaterialVisibility` each flip one row
(`course.service.ts:331,560,862`), and the builder exposes one Hide/Show per
row. Making an adopted ten-module course teachable is several hundred
individual actions. In practice that means the adoption feature does not work.

## 3. The rule

> **Content that arrives complete arrives visible. Content that is written a
> row at a time keeps starting hidden.**

A library copy is a finished course being handed over, not a draft being
written. The one review gate the branch needs is the course-level publish that
`adopt` already leaves off, and that gate is enough: while `Course.isVisible`
is false, no descendant flag can reach a student regardless of its value.

## 4. Decisions

### 4.1 A copy arrives ready to teach

`adopt` writes `isVisible: true` on every copied module, lecture and material,
regardless of the master's flags. The course row stays `isVisible: false`.

Publishing the course then becomes the single switch the operator already
believes it to be.

**Why not preserve the master's flags.** They do not carry the meaning the copy
would read into them. A hidden row in the library means "head office has not
finished this", never "branches should not teach this" — there is no student in
a library academy for it to be hidden from. Head office's real signal for *not
ready* is the course's `DRAFT` state, and that already blocks adoption outright
in `requireAdoptableMaster`. Copying a flag that means nothing at the source
into a place where it means everything is the whole bug.

**Why this is safe.** The copy is hidden at the course level, so nothing
reaches a student until a human at the branch publishes it. The change moves
where the flags start, not who decides.

### 4.2 Head office stops being offered a control that does nothing

Because §4.1 ignores them, the per-row Hide/Show controls on the library
builder are removed on the `library` content surface. `ContentSurface` is
already a parameter (`content-base-path-provider`), so this is a condition in
`module-card.tsx` and `lecture-row.tsx`, not a second builder.

Leaving them in place would be worse than useless: it would let head office
believe they had excluded a module from every future copy when they had not.

The course-level state — `DRAFT` / `PUBLISHED` / `RETIRED` — is untouched. That
one is real and is what gates adoption.

### 4.3 Visibility is not a content edit

`setVisibility` currently calls `bumpContentRevision`
(`course.service.ts:260`), and so would a bulk visibility write. That is wrong,
and it is already producing a visible defect today:

- `adopt` stamps `contentRevision = 1`, `baselineRevision = 1`.
- The Team Lead publishes the copy. `contentRevision` becomes `2`.
- `isCourseCustomized({ contentRevision: 2, baselineRevision: 1 })` is now
  `true`.

So **every adopted course reads as "Customized" the moment it is published**,
before anybody has changed a word of it, on the branch's own course row and in
head office's `behindCount` fan-out. The same bump on a master's side makes
every existing copy read `UPDATE_AVAILABLE` after head office merely
unpublishes and republishes it.

`contentRevision` has exactly two consumers: import-session optimistic
concurrency (`content-import.service.ts:380,417`) and the library's two status
axes (`shared/src/platform/library.ts`). An import plan is matched on
`externalKey` and tree structure; a visibility toggle changes neither, so
holding the revision steady across one cannot make a stale plan apply.

**Decision:** visibility writes — course, module, lecture, material, and the
new bulk write — do not bump `contentRevision`. Every write that changes
titles, ordering, structure or problem bodies still does.

### 4.4 One action for the whole tree

A new procedure, `academyCourses.setContentVisibility`, sets every module,
lecture and material under one course in one transaction.

This is what fixes the courses already adopted before this change and the
courses filled by the Excel importer, which still lands rows hidden (§4.6). It
is three `updateMany` calls, not a walk.

In the builder header, beside the existing course `VisibilityIndicator`:

```
Show all content      → setContentVisibility({ isVisible: true })
Hide all content      → VisibilityConfirmModal, then isVisible: false
```

`Hide all content` reuses `VisibilityConfirmModal` with the counts it already
renders, because it is the one direction that can take a live course away from
students mid-lesson. It also calls `revokeCourseMonitoring`, exactly as the
single-row hides do.

### 4.5 The state is never silent — for staff

A course is **not teachable** when `isVisible` is true and it has zero
effectively visible programming exercises. One predicate, in
`shared/src/content/course.ts`, so three surfaces cannot grow three opinions:

```ts
export function courseHasNoVisibleContent(course: CourseSummary): boolean {
  return course.isVisible && course.content.visibleExercises === 0;
}
```

Surfaced in the three places a Manager or Team Lead can be standing when it
matters:

| Surface | What appears |
|---|---|
| Course builder header | A warning strip — *"Students cannot see this course. No problems are visible."* — with **Show all content** in it |
| Courses table row | A warning chip beside the visibility indicator |
| Class detail, courses panel | A note beside the existing `hidden_note`, for a course assigned to a class that can deliver nothing |

The warning is deliberately *not* shown on a hidden course. A hidden course
with hidden content is an ordinary draft, and warning about it would train
people to ignore the warning that matters.

**The student side is changed too** — reversing this document's first position,
at the product owner's direction, and they were right. The original argument was
that showing a student an empty course converts a staff-side mistake into a
student-side one. What it actually did was convert a *visible* mistake into an
invisible one: a student assigned a published course had no row for it anywhere
and no way to ask about a course that appeared not to exist.

`courseSummaryFor` now always returns a summary, with zero counts, and both
callers list it. The outline behind it already rendered *"This course has no
problems yet"* — that state was built and unreachable. The card shows **Not
ready yet** in place of the **Start →** invitation it cannot honour.

### 4.6 What is deliberately not changed

**The Excel importer still creates hidden rows.** Importing into a course that
is already live and being taught must not publish two hundred new problems the
instant the upload finishes. §4.4's single action turns them all on when the
operator means to.

**Per-row Hide/Show stays** on academy and console surfaces, unchanged. A Team
Lead who wants to hold back one module for next term still can.

**No cascade on write.** Showing a module still does not rewrite its lectures'
stored flags. §4.4 is an explicit bulk action the operator asked for, not an
implicit side effect — that distinction is decision 7 of the 2026-08-03 design
and is what makes hide-then-show non-destructive.

## 5. Server

### 5.1 `AcademyLibraryService.adopt`

Three lines: `isVisible: true` in the `modules`, `lectures` and `materials`
push, replacing the read of the source row. The `Course` row is unchanged and
still lands `isVisible: false`.

### 5.2 `CourseService.setContentVisibility`

```ts
async setContentVisibility(
  identity: SupabaseIdentity,
  input: { academyId: string; courseId: string; isVisible: boolean },
  context: ContentRequestContext = {},
)
```

- `requireCurriculumManager` — `curriculum.manage`, the same permission every
  other visibility write takes.
- `requireCourse(academyId, courseId)` — the academy gate, unchanged.
- One transaction, three `updateMany` writes scoped by the course:
  - `courseModule` where `courseId`
  - `lecture` where `courseModule: { courseId }`
  - `material` where `lecture: { courseModule: { courseId } }`
- One audit row, `content.course.content_visibility_changed`, with
  `after: { isVisible, modules, lectures, materials }` — the counts, so the log
  says how much moved and not merely that something did.
- **No** `bumpContentRevision` (§4.3).
- `revokeCourseMonitoring(courseId)` after the transaction when
  `isVisible === false`, matching `setVisibility`.

Returns `courseTreeSchema`, like every other builder write, so the client
re-renders from one response.

### 5.3 Removing the revision bump

Drop `bumpContentRevision` from `setVisibility` (`course.service.ts:260`) and
from the `isVisible`-only branches of `updateModule`, `updateLecture` and
`setExerciseVisibility`. Those three procedures carry visibility alongside
title and description, so the bump becomes conditional on whether anything
other than `isVisible` was supplied.

### 5.4 The visible-exercise count

`content.exercises` counts every material under the course, visible or not, so
the courses table can read "190 problems" on a course delivering none. §4.5
needs the other number beside it.

Prisma cannot alias two counts of the same relation, so the summary include
stops asking for a count and asks for the flags instead:

```ts
const courseSummaryInclude = {
  modules: {
    select: {
      id: true,
      isVisible: true,
      lectures: {
        select: {
          id: true,
          isVisible: true,
          materials: { select: { isVisible: true } },
        },
      },
    },
  },
  ...sourceCourseInclude,
} as const satisfies Prisma.CourseInclude;
```

One boolean per material rather than one integer per lecture. The builder's
`treeInclude` already reads every material in full on the same page, so this is
not a new order of magnitude — and it keeps both numbers derived in one place
rather than as two queries that can disagree.

`toCourseSummary` already tolerates both shapes — it reads
`lecture._count?.materials ?? lecture.materials?.length` — and gains one
accumulator: a material counts toward `visibleExercises` only when it, its
lecture and its module are all visible.

The one other caller that passes a `_count` shape is `summaryInclude` in
`academy-library.service.ts`, which `adopt` uses to build its response. It
takes the same three fields, so the copy's summary reports its visible count
correctly on the response that creates it.

## 6. Shared

- `courseSummarySchema.content` gains
  `visibleExercises: z.number().int().nonnegative()`.
- `setCourseContentVisibilitySchema` — `{ academyId, courseId, isVisible }`.
- `academyCoursesContract.setContentVisibility`, input that schema, output
  `courseTreeSchema`.
- `courseHasNoVisibleContent(course)` and its unit tests, in
  `shared/src/content/course.ts` beside the schema it reads.

## 7. Web

| File | Change |
|---|---|
| `_hooks/use-course-builder.ts` | `setContentVisibility` mutation, same optimistic/rollback shape as the existing visibility mutations |
| `builder-header.tsx` | Show all / Hide all control; readiness strip above the outline |
| `module-card.tsx`, `lecture-row.tsx` | Hide the per-row visibility control when `useContentSurface() === 'library'` (§4.2) |
| `courses-table.tsx` | Warning chip in the `visibility` cell |
| `class-courses-panel.tsx` | Second note, beside `hidden_note` |
| `class-courses-panel` data | `ClassDetail.courses` carries `isVisible` today; it needs `visibleExercises` too, from `classes.service.ts:98,108` |

## 8. i18n

Both `en` and `ko`.

`content.json`

```
builder.show_all_content        Show all content
builder.hide_all_content        Hide all content
builder.not_teachable_title     Students cannot see this course
builder.not_teachable_body      The course is visible, but no problems inside
                                it are. Show its content to make it teachable.
visibility_confirm.all_content  all content in this course
courses.no_visible_content      No visible content
```

`classes.json`

```
detail.courses_panel.no_content_note
    Assigned and visible, but no problems inside it are visible to students.
```

## 9. Courses adopted before this change

No migration, and deliberately so. A data migration would have to guess which
hidden rows were hidden on purpose by a Team Lead and which arrived hidden from
the library, and it would guess wrong on academies that had already started
fixing theirs by hand.

Instead the readiness warning (§4.5) finds every affected course on the next
page load, and **Show all content** fixes each in one action. The set is small
and known — the feature shipped four commits ago — and the warning is how an
academy discovers a course they had not noticed was broken.

## 10. Tests

**Unit**

- `academy-library.service.spec.ts` — a master whose whole tree is hidden
  produces a copy whose modules, lectures and materials are all visible, and
  whose course row is not. This replaces the current assertion that flags are
  copied verbatim.
- `course.service.spec.ts` — `setContentVisibility` writes all three levels;
  refuses without `curriculum.manage`; refuses across academies; revokes
  monitoring only when hiding; does **not** move `contentRevision`.
- `course.service.spec.ts` — publishing a course leaves `contentRevision`
  where it was, so `isCourseCustomized` stays false on a fresh copy. This is
  the §4.3 regression, stated as a test.
- `shared/src/content/course.spec.ts` — `courseHasNoVisibleContent` is false
  for a hidden course with hidden content, true for a visible course with
  hidden content, false once one problem is visible.

**E2E**, extending the adopt journey in the existing library spec: head office
authors and publishes a master without touching any row's visibility; a Team
Lead adopts it and publishes the course only; a student enrolled in a class
holding that course opens it and sees the problems.

## 11. Risks and trade-offs

| Risk | Position |
|---|---|
| A branch wanted the master's hidden modules to stay hidden | Not a case that exists: the library has no students, so nothing there was ever hidden *from* anyone. If head office needs to exclude a module from copies, the answer is not to author it in the master. |
| **Show all content** on a live course exposes an unfinished problem | It is an explicit action with the count in front of the operator, and it is reversible by **Hide all content**. The alternative — several hundred clicks — is what people actually do wrong today. |
| Dropping the revision bump loosens import concurrency | An import plan matches `externalKey` and structure. A visibility toggle changes neither, and the apply step re-reads the tree inside its own transaction. |
| A third meaning accretes onto `contentRevision` later | §4.3 records what it means — *the content changed* — so the next writer has something to check against rather than a habit to copy. |

## 12. Out of scope

- Re-copying a master into an existing copy, or any merge of head office's
  later edits. That remains the open question §16 of the library design left
  open.
- Scheduled or dated publishing.
- Any change to `ExerciseTestCase.visibility`, which is a grading concept and
  unrelated to curriculum visibility.

## 13. Where this document was wrong

Written after the build, in the manner §17 of the content library design
established. Six places the plan above did not match the code it described.

**13.1 `toCourseSummary` should refuse the old shape, not tolerate it.** §5.4
proposed keeping the `_count` branch as a fallback that "reports zero rather
than guessing". Zero is not a neutral answer here — it renders as *this course
teaches nothing* on three surfaces. The shipped signature requires the flags at
every level, so a caller with the wrong include is a compile error at the
include. It caught one immediately: a fixture in `course.service.spec.ts`.

**13.2 The audit action had to be registered in `@cove/shared`.** The plan
never mentioned `curriculumAuditActions`, and
`curriculum-audit-vocabulary.spec.ts` fails the moment the content service
writes an action the shared list does not name — which is exactly what it is
for. `content.course.content_visibility_changed` is now in that list and in
both locale catalogues.

**13.3 `RowMenu` needed a signature change for §4.2.** Hiding the library's
inert visibility control is not only a condition in `module-card.tsx` and
`lecture-row.tsx`: `RowMenu.onToggleVisible` was required, so the menu item is
now dropped when no handler is passed. Three call sites pass `undefined` on the
`library` surface.

**13.4 The class panel needed a filtered nested count, not the summary.** §7
implied `visibleExercises` would arrive with the course summary.
`ClassDetail.courses` is `assignedCourseSummarySchema`, a much smaller shape
that never carried counts, so `classDetailInclude` and `classListInclude` grew a
`modules → lectures → _count.materials` selection with `where: { isVisible:
true }` at every level, summed by `visibleExerciseCount`.

**13.5 The e2e seed made the bug unreproducible.** `library-fixture.ts` created
the master's module, lecture and problem with `isVisible: true` — which no real
head office ever does, because a `LIBRARY` academy has no students. The fixture
now seeds them hidden, so the adopt journey walks the case that was actually
broken and would fail if §4.1 were reverted.

**13.6 The revision bump was in more places than §5.3 listed.** Besides
`setVisibility`, `updateModule`, `updateLecture` and `setExerciseVisibility`,
two of those carry title and description on the same call, so the bump became
conditional on a content field being present rather than simply removed.

## 14. The student-side reversal

§4.5 originally kept the student behaviour as it was: a published course with
nothing visible inside it was dropped from **My Courses** and from the class
that carried it. That was wrong, and it is now changed.

The reasoning that replaced it: a zero-count card says *this course is not ready
yet*, which is true and which a student can act on by asking. No card at all
says *this course does not exist*, which is false, and which nothing on any
surface corrects. The staff-side warnings from §4.5 stay — they are how the
academy learns to fix it — but they are no longer the *only* signal, and the
student is no longer the one person kept in the dark about their own curriculum.

| | Before | Now |
|---|---|---|
| `courseSummaryFor` on an empty course | `null` | a summary with zero counts |
| **My Courses** | no row | a card reading "0 problems · Not ready yet" |
| A class's course list | no row, not counted | listed and counted |
| Opening it | unreachable | the existing "no problems yet" outline |

Two tests that pinned the old behaviour were inverted rather than deleted, so
the new rule is asserted where the old one was:
`learn-class.service.spec.ts` now *counts* an assigned empty course, and lists
it with zero counts.
