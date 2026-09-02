# Console Curriculum: Courses and Classes, Across Every Academy

**Date:** 2026-09-02
**Status:** Proposed (revised the same day — problems are no longer a page)
**Scope:** `/admin/content/*` — the console's curriculum surfaces
**Branch:** `feat/platform-admin-console` (continues)

## 1. Summary

The console should have **the manager's two curriculum pages, widened to every
academy**: a **Courses** page and a **Classes** page, each with the create,
rename, hide/archive and delete the manager already has — and **problems
reached by opening a course**, exactly as a manager reaches them, not as a
list of their own.

Today the console has neither shape. It has one rail row called **Content**
leading to a three-lens browser, where the lens is chosen by a chip inside the
table's toolbar. That is confusing for four compounding reasons:

1. **The rail advertises one page.** `/admin/content/classes` and
   `/admin/content/problems` exist and nothing in the navigation says so.
2. **The chip reads as a filter.** `ContentTypeChip` is built from the same
   parts as the Academy facet beside it — same height, same dashed border,
   same popover, same toolbar row. It *is* navigation, dressed as narrowing.
3. **All three pages are titled "Content."** One `platform-content:title`
   string across three routes.
4. **The CRUD is split in half.** The cross-academy tables can hide, archive,
   restore, delete and open. They cannot **create** and cannot **rename** —
   those exist only at `/admin/academies/[slug]/courses`, which mounts the
   manager's own `CoursesManager`. So an operator learns two surfaces for one
   job, and the complete one is buried three clicks inside a single academy.

And a fifth, which is the reason for this revision: **Problems is a page that
should not exist.** Nobody navigates to a problem. They navigate to a course,
open a lecture, and find the problem inside it — which is how the manager
works and how the console's own editors are already mounted
(`/admin/academies/[slug]/courses/[courseId]/lectures/[lectureId]/exercises/[materialId]`).
A flat list of every problem on the platform is a different tool wearing the
same chrome.

This spec: two rail rows, two real pages, full CRUD on both, problems reached
through a course. It deletes more code than it adds.

### 1.1 What this is not

It is **not** a second content model. Every mutation calls the academy endpoint
a customer's Team Lead calls — `academyCourses.create`, `academyCourses.update`,
`academyClasses.create`, `academyClasses.update` — exactly as `ContentTable`
already calls `academyCourses.setVisibility` and `academyClasses.setStatus`.
The console owns discovery and chrome, not a second implementation of
curriculum mutations. That rule is from
`2026-09-01-console-native-content-management-design.md` and is untouched here.

It is **not** new authority. `platformViewPermissions('MANAGER')` already holds
`curriculum.manage` and `classes.manage`; `courseService.create` guards on
`requireCurriculumManager` — the same guard `setVisibility` passes today from
this very table. If hiding a course works from the console, so does creating
one.

It is **not** the per-academy pages' replacement. `/admin/academies/[slug]/courses`
and `/classes` stay: they are the right surface once the operator has already
chosen an academy from the academy detail page.

---

## 2. The design

### 2.1 Two rows, named after things

The rail was regrouped on 2026-09-02 to match the studio's: headings that say
what a row *acts on*. Under `CURRICULUM` the console offers one row called
**Content** — the name of a *tool*, not of a thing anyone is looking for.
Nobody files a ticket about "content." They file one about a class with no
teacher, or a course a customer cannot see.

```
CURRICULUM
  📖  Courses     /admin/content/courses
  🎓  Classes     /admin/content/classes
```

Two rows, matching the two things a manager manages. Both live under
`CURRICULUM` rather than splitting Classes into its own `TEACHING` group as the
studio does: a manager's rail separates them because a manager *teaches* out of
one and *authors* out of the other, and an operator does neither. To an
operator both are records of what an academy runs.

The icons and hues are already decided and exported — `lensIcons` and
`lensTones` in `_lib/content-view.ts`. The rail rows take `lensIcons`, so the
mark beside **Classes** in the rail is the mark on the page's panel and on its
summary tile. Nothing new is drawn.

### 2.2 Problems live inside a course

There is no Problems row and no Problems page. The path to a problem is the
manager's path, and every step of it already exists in the console:

```
Courses  →  a course row  →  the course editor      /admin/academies/[slug]/courses/[courseId]
         →  a module      →  a lecture
         →  a problem     →  the problem editor     …/lectures/[lectureId]/exercises/[materialId]
```

`/admin/content/problems` is deleted, and with it `ContentTypeChip`, the
`problems` branch of `ContentTable`, `platformContent.problems`, and the
`problems` member of `ContentLens`. §4.1 covers the one thing that must not be
lost with them.

### 2.3 Each page says what it is

`renderContentPage` currently titles all pages `platform-content:title`
("Content") and varies only the description. Invert it: the title becomes the
lens, and the description keeps its existing per-lens string.

| Route | Title | Description |
|---|---|---|
| `/admin/content/courses` | `lens.courses` — "Courses" | "Every course on Cove Studio, across every academy." |
| `/admin/content/classes` | `lens.classes` — "Classes" | "Every class, who teaches it and who is in it." |

Both key families already exist in `platform-content.json` in both locales. The
orphan is `platform-content:title`, which nothing else reads and which is
deleted.

### 2.4 The type chip goes

With two rail rows, `ContentTypeChip` is the same decision offered twice, in
two visual languages, one of which is pretending to be a filter. It is deleted,
along with `queryForContentLens` and `contentPath` if nothing else reads them
(`contentLensHrefs` stays — the rail and the summary strip both need it).

The toolbar keeps the academy facet, the search box and the column menu. It
gets shorter, which is the second reason to do this: the courses toolbar
currently carries search + academy + type + columns, and on a laptop the type
chip is what pushes the column menu onto a second line.

### 2.5 The summary strip: two links and one read-out

`ContentSummary` renders three tiles, and its doc comment states the rule it
was built under:

> Nothing here is a link. A tile that filtered on click would be the lens tabs
> again with the pills repainted; the type chip in the toolbar is the control.

The objection was to a tile that **filters**. With the chip gone, a tile that
**navigates** is its replacement, in a place that already names the types and
prints their totals. So:

- **Courses** and **Classes** tiles are `Link`s to their pages — except the
  active one, which keeps its rail and is not a link, because a link to the
  page you are on is a dead control.
- The **Problems** tile stays, and stays a read-out. It has no page to link to,
  and it is the one place the platform's `n cannot grade` number is stated. Its
  second line is the whole reason it survives §2.2.

The comment is rewritten to say all this. A future reader must not find the old
rule and quietly revert the change.

### 2.5.1 The strip says whose numbers it is showing

The counts have always followed the academy facet — narrow to one academy and
the three tiles are that academy's. The strip only ever said *"across 1
academy"*, which is a number rather than an answer, so an operator handling a
call about D.Lab Mapo had to remember that they were the one who set the filter.

The header therefore states its own scope:

| Facet | Header reads |
|---|---|
| exactly one academy | 🏢 **D.Lab Mapo** · `/mapo` |
| the platform, or several academies | **Curriculum across the platform** · 🏢 across 12 academies |

Scoped, the strip becomes that academy's card and answers "how many courses and
problems does this academy have" in one glance — which is the question that
brings anybody to these pages. Unscoped, it keeps the platform totals it has
always shown. The slug is printed the way every console table's academy column
prints it, because that is the operator's own handle for one academy.

Two or more selected keeps the count rather than listing names: "across 3
academies" is a true summary, and three names in a header is a list nobody
reads.

### 2.6 Create: the academy is a field

This is the one genuinely new interaction, and it is small.

`CourseModal` and `ClassModal` (the studio's own) take a `manager` from
`useCoursesManager({ academyId, … })` / `useClassesManager({ academyId, … })`.
The academy is fixed because inside a studio there is only one. On the console
there is not — so the console renders the same modal with **one field
prepended**:

```
┌─ New course ──────────────────────────────┐
│  Academy    [ Dlab-Mapo            ▾ ]    │  ← console only
│  Title      [                        ]    │
│  Description[                        ]    │
│                        [Cancel] [Create]  │
└───────────────────────────────────────────┘
```

Three decisions:

- **The picker is the facet's list.** `academyOptions` already arrives on every
  content page response for the toolbar facet. No new call, and the two
  controls therefore always name the same academies.
- **It is pre-filled and locked when the facet holds exactly one academy.** An
  operator who filtered to Dlab-Mapo and pressed *New course* has already
  answered this; asking again charges them for the filter they set.
- **It has no default when the facet is wide, and the modal cannot submit
  without it.** A course created in the wrong academy is visible to the wrong
  customer's students the moment it is published.

On success the console does what the studio does: routes into the new record's
editor. The href is the console's own — `contentDetailHref.course(created, path)`
— so the editor mounts at `/admin/academies/[slug]/courses/[id]?from=/admin/content/courses`
and Back returns to the page the operator started on. Never `/admin/access/new`;
the impersonation detour was retired by the browser redesign and must not
return through a new door.

### 2.7 Rename without opening the editor

`Rename` (title + description) joins `ContentRowActions` on both pages, opening
the same modal in edit mode against `academyCourses.update` /
`academyClasses.update`. It is the write the cross-academy table cannot do and
the one support asks for most: a customer misspells their own class name, and
fixing it today costs an operator a trip into the academy.

The row menu after this change:

| | Courses | Classes |
|---|---|---|
| Open | ✓ | ✓ |
| Rename | **new** | **new** |
| Show / Hide | ✓ | — |
| Archive / Restore | — | ✓ |
| Delete | ✓ | ✓ |

Problem visibility, which the deleted lens offered, is not lost: it is on the
problem's own editor, which is where a person who is looking at the problem
already is.

### 2.8 The rail's `from` override, corrected

`PlatformSidebar` currently lights **Content** for any editor opened with a
`from` starting `/admin/content`:

```ts
const workingIn = from?.startsWith('/admin/content') ? '/admin/content' : null;
```

With two rows this must resolve to the *specific* row, or an operator who
opened a class from the Classes page sees **Courses** lit while the page's Back
link says Classes — the exact rail/page disagreement §2.6.1 of the browser
redesign added `from` to prevent. It becomes a match against `contentLensHrefs`:
the longer of the two hrefs that prefixes `from`, else null.

A problem editor opened by drilling through a course carries
`from=/admin/content/courses`, so the rail correctly stays on **Courses** for
the whole descent — which is the navigational claim §2.2 makes, enforced.

---

## 3. Routes

| Route | Before | After |
|---|---|---|
| `/admin/content` | redirects to `…/courses` | unchanged |
| `/admin/content/courses` | lens of "Content" | its own page, **Courses** |
| `/admin/content/classes` | reachable only via the chip | rail row, **Classes** |
| `/admin/content/problems` | lens of "Content" | **deleted** — permanent redirect to `…/courses` |
| `/admin/academies/[slug]/courses` | per-academy CRUD | unchanged |
| `/admin/academies/[slug]/classes` | per-academy CRUD | unchanged |
| `…/courses/[courseId]/lectures/[lectureId]/exercises/[materialId]` | problem editor | unchanged — now the only way to a problem |

The problems route redirects rather than 404s: it has been linkable since the
console shipped, and an operator following a link from a ticket should land on
a page, not an error. Query strings on the other two are unaffected — the parse
and serialize functions in `_lib/content-query.ts` are untouched.

---

## 4. API work

Almost none. Every verb this spec needs is already in the contract and already
reachable from the console client:

| Verb | Endpoint | Already called from the console? |
|---|---|---|
| create course | `academyCourses.create` | via `CoursesManager` at `/admin/academies/[slug]/courses` |
| rename course | `academyCourses.update` | same |
| create class | `academyClasses.create` | via `ClassesManager` |
| rename class | `academyClasses.update` | same |
| hide / show | `academyCourses.setVisibility` | yes — `ContentTable` |
| archive / restore | `academyClasses.setStatus` | yes — `ContentTable` |
| delete | `ContentDeleteDialog` | yes |
| the lists | `platformContent.{courses,classes,summary}` | yes |

Confirm before building — a test to write, not a change to make — that
`courseService.create`'s `requireCurriculumManager` resolves platform authority
the same way `setVisibility` does. It does today for the per-academy console
page, which is the same client through the same guard.

### 4.1 The one addition: `problemsWithoutTests` on a course

Deleting the Problems lens costs one real diagnostic. `summary.problems.withoutTests`
still states the platform-wide number in the strip (§2.5), but the lens was the
only way to answer the follow-up: *which* ones. Without a replacement, an
operator reads "37 cannot grade" and has nowhere to go.

Add one field to `platformCourseSchema`:

```ts
/** Exercises under this course with no test cases — the one fault a course
 *  can carry that its own counts hide. Zero is the ordinary case. */
problemsWithoutTests: z.number().int().nonnegative(),
```

computed beside the existing `exerciseCount` in `platformContentService`, and
rendered by the courses table's existing `countColumn` with `flagZero`
inverted — the same loud-when-nonzero treatment the problems lens gave the
`tests` column. An operator sorts or scans the Courses table, finds the three
courses carrying all thirty-seven, and opens one.

This is the whole of the API change, and it makes the deletion a net
simplification rather than a loss: one number on a page that exists, instead of
a page that exists for one number.

### 4.2 Removed

`platformContent.problems` (contract, router, service method),
`listPlatformProblemsResultSchema`, `platformProblemSchema`, `PlatformProblem`,
and the `problems` member of `contentLenses`. Nothing outside the console reads
any of them — verified by grep across `packages/shared`, `packages/api` and
`packages/web`.

---

## 5. Component work

### 5.1 Changed

- **`_components/platform-sidebar.tsx`** — the `content` group's single row
  becomes two, taking `lensIcons`; the `from` override resolves to a lens.
- **`content/_lib/render-content-page.tsx`** — title per lens; renders the
  page's primary action (`New course` / `New class`); loses the problems
  branch of its `Promise.allSettled`.
- **`content/_components/content-table.tsx`** — `Rename` in the row actions;
  hosts the create/edit modal; loses `toolbarFilters` and the entire problems
  column set and `setProblemVisibility` handler. The largest file in the
  console gets materially shorter.
- **`content/_components/content-summary.tsx`** — courses and classes tiles
  link, problems tile stays a read-out; the doc comment's "nothing here is a
  link" rule is rewritten, not silently contradicted.
- **`_components/content-row-actions.tsx`** — an optional `onRename`, rendered
  above the status action.
- **`_lib/content-view.ts`** — `contentDetailHref.problem` stays (the course
  editor's own links use it); `lensIcons` / `lensTones` / `contentLensHrefs`
  lose their `problems` member with the type.

### 5.2 New

- **`content/_components/content-record-modal.tsx`** — the console's wrapper
  around the studio's `CourseModal` / `ClassModal` shape, adding the academy
  field of §2.6. One component with a `kind: 'course' | 'class'`, for the same
  reason `ContentTable` is one component for both lenses: they differ only in
  which endpoint they call and which word they print.

### 5.3 Deleted

- **`content/problems/page.tsx`** (replaced by a redirect).
- **`content/_components/content-type-chip.tsx`** and its `type.label` copy.
- **`contentPath` / `queryForContentLens`** in `_lib/content-query.ts`, if the
  chip was their only caller.
- **`platform-content:title`**, and the problems entries of `lens`,
  `lens_description`, `table.*` and `delete_problem`.

The studio's `CoursesManager` / `ClassesManager` and their hooks are **not**
touched. The console does not gain a second academy-scoped manager; it reuses
the modals and calls the endpoints directly, because those hooks are built
around one academy's query key and bending them to a cross-academy paged table
would be the larger change.

---

## 6. i18n

Reused as-is: `platform-content:lens.{courses,classes}` (the two page titles),
`lens_description.{courses,classes}`, `courses:new_course`, `classes:new_class`,
the `courses:*` / `classes:*` modal field copy, and `destructive` for the
delete confirmations.

New, in `platform.json` under `nav` (both locales), for the rail:

```json
"courses": "Courses" / "코스",
"classes": "Classes" / "반"
```

New, in `platform-content.json` (both locales):

```json
"academy_field": { "label": "Academy", "placeholder": "Choose an academy", "required": "Choose which academy this belongs to." },
"rename_course": "Rename course",
"rename_class": "Rename class",
"table": { "cannot_grade": "No tests" }
```

Removed: `platform-content:title`, `platform-content:type`, and every
problems-only key listed in §5.3.

`platformNamespaces` is unchanged — it already carries `platform-content`. The
create/rename modals need `courses`, `classes` and `destructive`, which the
per-academy console pages already mount through `PageTranslationsProvider`; the
two content pages mount the same way.

---

## 7. Sequence

1. **Rail first** — `platform-sidebar.tsx`, the `nav.*` keys, the `from` fix.
   One commit, shippable alone, and it is the commit that fixes the reported
   confusion: Classes becomes reachable.
2. **Titles** (`render-content-page.tsx`), then **delete the chip** and link
   the summary tiles. The chip must not go before the rail lands, or Classes is
   briefly unreachable.
3. **Retire Problems** — the redirect, the component deletions, the contract
   and service removal, and `problemsWithoutTests` (§4.1) in the same commit so
   the diagnostic never has a gap.
4. **Rename** — the smaller write, and it proves the modal wiring without the
   academy picker.
5. **Create** — the academy field, the pre-fill from the facet, the route into
   the new record's editor.

Steps 1–3 are navigation and deletion; 4–5 are the CRUD.

---

## 8. Testing

- `platform-sidebar` — two curriculum rows; `from=/admin/content/classes`
  lights **Classes**; a problem editor opened with `from=/admin/content/courses`
  keeps **Courses** lit.
- `content-summary` — the active tile is not a link; the other content tile is;
  the problems tile is never a link and still prints its `cannot grade` line in
  `danger` only when non-zero.
- `content-record-modal` — refuses to submit with no academy; pre-fills and
  locks when the facet holds exactly one; a failed create keeps the typed title
  so the operator can correct rather than retype (the rule `useClassesManager`
  already states).
- **API, the assumption §4 rests on:** an operator with no membership in an
  academy can `academyCourses.create` and `academyCourses.update` against it,
  and a Teacher cannot.
- `platformContent.courses` returns `problemsWithoutTests` matching a fixture
  with two untested exercises across two lectures.
- E2E: from `/admin/content/classes`, create a class in an academy the operator
  does not belong to, land in its console editor, press Back, find it in the
  table. And from `/admin/content/courses`, drill course → lecture → problem
  and confirm the rail stayed on Courses the whole way.
- `/admin/content/problems` redirects rather than 404s.

---

## 9. Risks

- **Creating in the wrong academy.** The one real hazard, and why the picker
  has no default when the facet is wide. Mitigated further by routing into the
  new record's editor on success, where the academy name is in the header — so
  the mistake is visible a second after it is made, while it is still one
  Delete away.
- **Losing the cross-academy problem sweep.** Deleting the lens removes the
  only place to ask "show me every problem that cannot grade." §4.1 answers the
  same question one level up, at course granularity. If an operator later needs
  the flat list back, it returns as a *filter on the Courses page* — "only
  courses with untested problems" — not as a rail row.
- **The summary tiles' rule reversal.** A future reader finds a component whose
  comment once said "nothing here is a link." Mitigated by rewriting the
  comment with its reason, not by leaving two rules on the page.

---

## 10. Out of scope

- Creating a problem from anywhere but a lecture.
- Cross-academy **bulk** actions — hide six courses across four academies. The
  table has no selection column and this spec does not add one.
- Moving a course between academies. No endpoint, and no request for one.
- Touching the studio's `CoursesManager` / `ClassesManager` (§5.3).
- Splitting Classes into its own rail group (§2.1).
