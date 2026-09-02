# Console Content Browser Redesign

**Date:** 2026-09-02
**Status:** Implemented; revised 2026-09-02 after the first operator review
**Scope:** `/admin/content/{courses,classes,problems}` — the cross-academy content browser
**Branch:** `feat/platform-admin-console` (continues)

## 1. Summary

The console's content browser answers the one question no academy-scoped
surface can: *where, across every academy, is this course / class / problem.*
It works, and it is the hardest page in the console to read.

Three things are wrong, and they compound:

1. **It states no totals.** An operator lands on a paged table of twenty-five
   rows out of an unstated number and cannot tell whether the platform holds
   forty courses or four thousand, nor how many of them are broken.
2. **The columns hide the answer.** A course's shape arrives as one mono
   string — `4 modules · 31 problems` — with lectures missing entirely; a
   class's assigned courses are absent; a problem's course is set in the
   smallest type on the row as a subtitle.
3. **Every row's action is a detour.** `Edit` opens
   `/admin/access/new?academy=…&next=…` — the support-grant form — and lands
   the operator inside the customer's own studio under a *"Standing in as Team
   lead"* banner. That path was correct when it was written. It is not correct
   now: `2026-09-01-console-native-content-management-design.md` shipped
   console-native editors at `/admin/academies/[slug]/courses/[courseId]`,
   and this table is the last surface still routing through impersonation.

This spec fixes all three, in the console's existing visual language. It adds
one read-only API endpoint. It writes no new editor, no new permission, and no
new design token.

### 1.1 What this is not

It is **not** new authority. §3 of the native-content spec established that
`platformViewPermissions('MANAGER')` already holds `curriculum.manage` and
`classes.manage`. Every mutation here calls the same academy endpoint the
customer's own Team Lead calls.

It is **not** a second row-actions menu. The academy detail page
(`academies/[academySlug]/_components/academy-content.tsx`) already has the
exact menu this page needs. §6 lifts it out rather than copying it.

---

## 2. The design

### 2.1 The rule this page inherits

The users directory states the console's colour rule, and it is the reason
that table is legible at three hundred rows (`user-table.tsx`, §Colour):

> **Two channels, two meanings, never crossed. Hue says what a thing *is*.
> Loudness says whether it is in trouble.**

Applied here:

| Channel | Carries | Values |
|---|---|---|
| **Hue** | which *kind* of content is on screen | Courses `brand` · Classes `teal` · Problems `peer` |
| **Loudness** | whether one row needs attention | quiet dot for settled · filled chip for a fault |

The lens hue is not a per-row decoration — one lens is on screen at a time, so
it is a *page* property. That gives the redesign its one memorable device.

### 2.2 The signature: the page takes the colour of what you are looking at

The active lens hue appears in exactly three places, and they light together:

```
   ▌ the summary tile for the active type carries its rail
   ▌ the type chip in the toolbar wears the hue and the type's icon
   ▌ the table panel's top rail is the same hue
```

Switching to Problems turns the page violet, top to bottom. Nothing else on
the page is tinted. This is `Panel`'s existing `rail` device
(`overview-ui/panel.tsx`) used at page scale, so it costs no new token and it
reads as the same product a manager already uses.

**The accessory removed:** `ContentLensTabs` — the grey segmented pill row
above the table — is deleted. Its job moves into the toolbar chip (§2.4),
where every other narrowing on this page already lives. Keeping both would be
the duplication the users directory removed its lens rail for.

### 2.3 The summary strip

Rendered by the client table, not the page above it, so **the counts move with
the academy filter** — an operator narrowed to one academy is shown that
academy's content, not the platform's. This is `UserComposition`'s contract,
and it is the reason that component sits inside `UserTable`.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Content              🏛  across 12 academies                        │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │▌               │  │▌               │  │▌               │        │
│  │ 📘   148       │  │ 🎓    96       │  │ ⚡  1,284      │        │
│  │      Courses   │  │      Classes   │  │      Problems  │        │
│  │                │  │                │  │                │        │
│  │ 112 published  │  │ 84 running     │  │ 37 cannot grade│  ← red │
│  │ 36 draft       │  │ 6 no teacher ● │  │                │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

**Three tiles, not four.** The academy count is the *denominator* the other
three are measured against, not a fourth kind of content — so it sits in the
header line beside a `Building2` mark, exactly where `UserComposition` puts
its own academies count, rather than in the grid. A fourth identical tile
would read as a fourth content type.

**No proportion band.** `UserComposition` draws one because students,
teachers, team leads and managers are parts of one whole. Courses, classes and
problems are three different things at three different scales — 148 against
1,284 — and a bar splitting them would be a picture of nothing.

**The second line is the point.** A count alone tells an operator the platform
is large. `37 cannot grade` tells them what to do this morning. Each tile
states the one fault its kind can have, and states it in `danger` only when
the number is above zero:

| Tile | Tone | Line 2 | Line 3 (fault) |
|---|---|---|---|
| Courses | `brand` | `{n} published` | `{n} draft` — quiet; a draft is a normal state |
| Classes | `teal` | `{n} running` | `{n} with no teacher` — `danger` when > 0 |
| Problems | `peer` | — | `{n} cannot grade` — `danger` when > 0 |

**Nothing here is a link.** A tile that filtered on click would be the lens
rail again with the tabs repainted. The chip in §2.4 is the control.

### 2.4 The type chip

> *"write the sorting the class, course and problem like in plus included
> component"* — the `+` chip is `FacetedFilter`
> (`components/studio/faceted-filter.tsx`), the dashed `PlusCircle` control
> already used for Academy on this page.

The lens selector becomes a chip of that family, in the table toolbar beside
Academy. `DataTable` already has the prop for it:

> `toolbarFilters` — *"a caller-owned filter control, placed beside the search
> box where the facet chips go. For a choice the table cannot make itself —
> one whose options do not map onto a single column's values."*

```
┌────────────────────────────────────────────────────────────────────┐
│ 🔍 Search courses by title      ⌗ Courses ▾   ⊕ Academy            │
└────────────────────────────────────────────────────────────────────┘
      ↑ search                     ↑ new       ↑ existing facet
```

It is built from the same parts as the Academy chip: the same height, the same
dashed `PlusCircle` trigger, the same popover. **This is a revision.** The first
build gave it a solid trigger in the active lens's hue, on the reasoning that
the type is a page property and should look like one. In the browser that
backfired — a coloured, differently-shaped control sitting between the search
box and a dashed facet chip read as page navigation that had drifted into the
toolbar, not as one of the three controls that narrow the table. To an operator
this row is one row, so the chip joins it.

The type's own icon replaces the facet's generic mark inside the value badge,
which is the one difference worth drawing. Two others are behavioural and the
control has to carry them without a third shape:

| | Academy facet | Type chip |
|---|---|---|
| Selection | multi, optional | **single, required** |
| Bare state | reads `Academy` with nothing chosen | **never bare** — always names the current type |
| Footer | `Clear filters` | **none** — there is no "no type" |

The hue does not disappear; it moves to where it is not competing with a
control. The summary tile and the panel rail still light together (§2.2).

Picking a type is a `router.push` to `/admin/content/{lens}`, so the lens
stays a URL: bookmarkable, shareable, and Back does the obvious thing — the
reason `ContentLensTabs` used links in the first place. That property is not
lost by moving the control into the toolbar.

**What carries across a switch:** the academy filter, always. **What does
not:** the search text and the page number. `python fundamentals` typed
against Courses returns nothing against Problems, and an empty table reads as
*"there are none"* rather than *"your search moved"* — the fastest way to make
a working filter look broken. Page resets to 1 for the same reason.

### 2.5 The columns

Every column below is a field the API **already returns**, except problem
visibility (§5.1).

Each lens carries a **state column** — Visibility for courses and problems,
Status for classes — rendered with the `StateBadge` the academy detail page
already uses for the same fact. It began as a tinted line under the row's name
and moved out for two reasons: a fact set under a title cannot be compared down
a column, which is the only thing a table is for; and a column can be hidden by
an operator who does not need it, while a line under a title cannot.

Under the name goes the academy's own **description** instead. It is already on
the wire, it was rendered nowhere, and it is what tells two courses called
*"Python"* apart.

**Courses** — *"academy, and class and modules, lectures and problems, and
when the last updated"*

```
│ Course              │ Academy    │ Visibility │ Cls │ Mod │ Lec │ Prb │ Updated │  ⋯ │
│ ─────────────────── │ ────────── │ ────────── │ ─── │ ─── │ ─── │ ─── │ ─────── │ ── │
│ Python Foundations  │ D.Lab Mapo │ ● Published│   3 │   4 │  18 │  62 │ 28 Aug  │ →⋯ │
│ Beginner track      │ /mapo-dlab │            │     │     │     │     │         │    │
```

The `Contents` column this replaces collapsed modules and problems into one
mono string and dropped lectures entirely. Split into four `countColumn`s —
the helper that right-aligns, sets tabular numerals, and greys a zero.

**Classes** — *"academy, and which courses assigned to this class, teacher
with avatar, and students number and last updated"*

```
│ Class          │ Academy    │ Status    │ Courses         │ Teacher      │ Std │ Updated │  ⋯ │
│ ────────────── │ ────────── │ ───────── │ ─────────────── │ ──────────── │ ─── │ ─────── │ ── │
│ Spring Cohort  │ D.Lab Mapo │ ● Running │ ⟨Python⟩ ⟨Algo⟩ │ (◕) Jin-ho   │  24 │ 28 Aug  │ →⋯ │
│ Evenings       │ /mapo-dlab │           │                 │     Teacher  │     │         │    │
│ ────────────── │ ────────── │ ───────── │ ─────────────── │ ──────────── │ ─── │ ─────── │ ── │
│ Night Class    │ D.Lab Gang │ ● Archived│ No courses      │ ▮No teacher▮ │   8 │ 27 Aug  │ →⋯ │
```

`courses[]` and `teacherAvatarUrl` are already on `platformClassSchema` and
already rendered by `CoursesCell` and `TeacherCell` — this table simply
stopped short of using them.

**Problems** — *"academy, courses, and difficulty and test cases"*

```
│ Problem            │ Academy    │ Visibility │ Course         │ Difficulty │ Tests │ Updated │  ⋯ │
│ ────────────────── │ ────────── │ ────────── │ ────────────── │ ────────── │ ───── │ ─────── │ ── │
│ Two Sum            │ D.Lab Mapo │ ● Published│ Python Founda… │ ⟨Easy⟩     │    12 │ 28 Aug  │ →⋯ │
│                    │ /mapo-dlab │            │ Lecture 4      │            │       │         │    │
│ ────────────────── │ ────────── │ ────────── │ ────────────── │ ────────── │ ───── │ ─────── │ ── │
│ Exercise 3         │ D.Lab Gang │ ● Hidden   │ Algorithms     │ ⟨Hard⟩     │     0 │ 26 Aug  │ →⋯ │
```

Course gets its own column, with the lecture as its second line — a problem
title alone does not identify one, because every academy has an *"Exercise
3"*, and that fact used to be set in 12px under the title.

**Difficulty becomes a pill**: `Easy` = `success`, `Medium` = `warning`,
`Hard` = `danger`, `—` when unset. This is the codebase's own rule, not a
loosening of it: `panel.tsx` forbids colouring a *child*; difficulty is a
measurement of a problem, and measurements already carry tone throughout the
product.

#### The columns menu

`showColumnVisibility` is **on**. Courses alone now offers nine columns, and
which of them matter depends on whether the operator is auditing curriculum
size or chasing a delivery question — that is a choice only they can make.

TanStack lists sortable columns in that menu by default, which is what keeps an
Actions column out of it. Nothing here sorts, so every data column opts in with
`meta.hideable`, and the two that must never go — the name and the actions —
set `enableHiding: false`. A table of rows you cannot name is not a shorter
table.

**Width budget.** `PlatformShell` caps the column at `max-w-6xl`, leaving about
1,078px inside the panel. `layout="fixed"` requires every column but one to
declare a `size`; the name column absorbs the slack and truncates.

| Lens | Fixed columns | Fixed total | Name column |
|---|---|---|---|
| Courses | Academy 156, Visibility 104, Cls 78, Mod 78, Lec 78, Prb 78, Updated 88, Actions 96 | 756 | ~322 |
| Classes | Academy 156, Status 104, Courses 176, Teacher 164, Students 80, Updated 88, Actions 96 | 864 | ~214 |
| Problems | Academy 156, Visibility 104, Course 180, Difficulty 108, Tests 80, Updated 88, Actions 96 | 812 | ~266 |

Classes is the tight one. Updated carries `max-xl:hidden` on every lens — it
dates a row rather than identifying one — which buys back 88px below 1280px.
Declared as `meta.className` on the column itself, **not** as a `nth-child`
rule from outside: a positional selector hides whichever column happens to be
seventh today and says nothing when one is inserted before it. The first build
did exactly that, and on the classes lens it was hiding **Students**.

### 2.6 Row actions

> *"in the actions column there should be 3 dots to delete, and hide and
> archive based on content type … and near the 3 dots we need one button to
> visit the content detail … it should go to that content detail page to
> edit"*

```
                                       ┌─────────────────────┐
   … │  →   ⋯                          │ Python Foundations  │
             └──────────────────────▶  ├─────────────────────┤
                                       │ 👁  Hide            │
                                       ├─────────────────────┤
                                       │ 🗑  Delete course   │
                                       └─────────────────────┘
```

**There is no `Edit` item.** It pointed at the same href as `Open`, so the menu
offered a second name for one destination — and an operator who tries both
learns the menu is not telling the truth about what it does. The destination
*is* the editor; `Open` is the honest word for going there. This corrects the
first build, which carried both, and it removes the `editDisabled` branch with
it: an archived class opens in the same editor every other row opens in.

**`Open` is a quiet arrow, not a filled button.** A brand-soft pill on every row
of twenty-five competed with the row's own content and made the actions column
the loudest thing on the page. It is now the users directory's control exactly:
an icon-sized link, colour on hover, beside the `⋯`. The whole row is clickable
too (`onRowClick`), so the arrow is the mouse shortcut's discoverable anchor and
the keyboard reader's real link rather than the only way in.

`Open` is a plain console link — **not** `editInAcademyHref`:

| Row | Destination |
|---|---|
| Course | `routes.adminAcademyCourse(academySlug, id)` |
| Class | `routes.adminAcademyClass(academySlug, id)` |
| Problem | `routes.adminAcademyExercise(academySlug, courseId, lectureId, materialId)` |

All three exist and all three already mount the real editor with
`canEditCurriculum` / `canAssignCourses` set. The menu's items by type:

| Type | State | Delete | Endpoints |
|---|---|---|---|
| Course | Hide / Show | needs `confirmTitle` | `academyCourses.setVisibility`, `.delete` |
| Class | Archive / Restore | needs `confirmName` | `academyClasses.setStatus`, `.delete` |
| Problem | Hide / Show | no confirm token | `academyCourses.setExerciseVisibility`, `.deleteExercise` |

### 2.6.1 Where Back goes

The console mounts one editor under several routes, and a course is reachable
from the academy's own index, from this browser, and from a shared link. The
detail pages hardcoded their way out to the academy index — so an operator who
arrived from the cross-academy browser pressed Back, landed somewhere they had
never been, and lost their academy filter on the way. That is what makes Back
feel broken rather than merely wrong.

The link that opens a row therefore carries where it came from:

```
/admin/academies/mapo-dlab/courses/<id>?from=%2Fadmin%2Fcontent%2Fcourses%3Facademy%3D…
```

A search param and not browser history: the destination stays visible in the
URL, survives a reload, and a shared link still goes somewhere sensible.

#### One arrow, not two

The shell's `BackLink` was not the only way out on screen. `BuilderHeader` and
`ClassHeader` each render their own *"All courses"* / *"Back"* link, and under
the console shell that put two back arrows within about forty pixels of each
other, pointing at different places — the operator has to read both to find out
which is the one they want, every time.

The editors already know which shell they are in: `useContentSurface()` returns
`'console'` or `'academy'`, from the provider the console layout mounts. Under
the console, their inline link stands down; the shell's wins, because it is the
one that knows which list the operator actually arrived from. On the academy
side nothing changes — there is no shell back link there, and the inline one is
the only way out.

`ExerciseHeader` keeps its own. That control is not a duplicate link: it is a
button that checks for unsaved work before leaving, and removing it would drop
the check.

#### The rail has to agree with the page

Verified in a browser, and it did not. A course opened from the content browser
lives at `/admin/academies/…`, so `activeNavHref` — which reads the path alone —
lit **Academies** in the sidebar while the page's own Back link said
**Content**. Two answers to "where am I", on every content row an operator
opens, and the one they can see first is the wrong one.

`from` already records which section they are working in, so `PlatformSidebar`
reads it: a `from` under `/admin/content` marks Content current. It overrides
only the *highlight*, never a destination — the links themselves are untouched,
so Content still goes to the content browser.

#### The allowlist

`consoleBackTarget` (`admin/_lib/back-target.ts`) resolves it, and **accepts
only the content browser**. `from` is attacker-controllable text arriving in a
URL, and the general form of *"send the reader wherever this says"* is an open
redirect. An allowlist of the one surface that needs it costs nothing today and
cannot be widened by passing a different string — `//evil.example`,
`https://evil.example` and `/admin/content/courses/../..` all fail it, and the
page falls back to the academy label it used before. Extending it means adding
a case, which is the point.

**Confirmation asymmetry is deliberate and pre-existing.** Hiding a course and
archiving a class remove student access, so both confirm through the existing
`VisibilityConfirmModal` / `ArchiveClassDialog`. Showing and restoring are
reversible and apply immediately. Deleting a course or class asks for its name
typed back; `deleteProgrammingExerciseSchema` asks for no token, so a problem
deletes behind the ordinary confirm — do not invent a token the contract does
not ask for.

**Refusals are shown, never predicted.** The server refuses to delete a course
or class with student submissions behind it. Surface the returned error in the
dialog without dismissing it. Do not disable the menu item from a rule the
browser guessed at — that rule is wrong the moment another tab changes the
state it guessed from (`user-row-actions.tsx` states this).

### 2.7 Copy

Sentence case, active voice, the same verb from control to result. The current `table.edit_hint` — *"Opens a support session and takes you to this
academy's own editor"* — becomes false the moment §2.6 lands and must be
deleted, not reworded. So must every key the old columns left behind:
`table.edit`, `table.contents`, `table.taught_by`, `table.module_count_*` and
`table.exercise_count_*` all describe a table that no longer exists, and a dead
key is a translator's time spent on nothing.

| Key | English |
|---|---|
| `summary.scope` | `across {{count}} academies` |
| `summary.published` | `{{count}} published` |
| `summary.draft` | `{{count}} draft` |
| `summary.running` | `{{count}} running` |
| `summary.no_teacher` | `{{count}} with no teacher` |
| `summary.no_tests` | `{{count}} cannot grade` |
| `type.label` | `Content type` |
| `table.open` | `Open` |
| `table.visibility` | `Visibility` |
| `table.status` | `Status` |
| `table.lectures` | `Lectures` |
| `table.course_column` | `Course` |
| `table.hidden_problem` | `Hidden` |

`{{count}} cannot grade` over `{{count}} without test cases`: it names the
consequence the operator is being asked to care about. A problem with no cases
lands a student on a Submit button that can only ever say nothing.

---

## 3. Routes

Unchanged. `/admin/content` → `/admin/content/courses`; the three lens routes
stay. Only the control that moves between them changes shape.

---

## 4. What the API already gives you

Verified against `packages/shared/src/platform/content.ts` on 2026-09-02:

| Column | Field | Present? |
|---|---|---|
| Course · modules / lectures / problems | `moduleCount`, `lectureCount`, `exerciseCount` | ✅ all three |
| Course · classes | `classCount` | ✅ |
| Course · state | `isVisible` | ✅ |
| Class · courses | `courses: {id,title}[]` (capped at 4 server-side) | ✅ |
| Class · teacher + avatar | `teacherName`, `teacherAvatarUrl` | ✅ |
| Class · students | `studentCount` | ✅ |
| Problem · course / lecture | `courseId/Title`, `lectureId/Title` | ✅ |
| Problem · difficulty / tests | `difficulty`, `testCaseCount` | ✅ |
| Every row · updated | `updatedAt` | ✅ |
| Problem · state | `isVisible` | ❌ **§5.1** |

`lectureCount` is computed and returned today and nothing renders it. Two of
the three "missing" class columns are likewise already on the wire. The table
is behind its own contract.

---

## 5. API work

### 5.1 `platformProblemSchema.isVisible`

One field. `Material.isVisible` exists in Prisma (`schema.prisma:1182`); add
`isVisible: true` to the `material.findMany` select in
`platform-content.service.ts` and map it through. Without it the Problems menu
cannot offer Hide, and the title cell cannot state Published/Draft the way the
other two lenses do.

### 5.2 `platformContent.summary`

```ts
// packages/shared/src/platform/content.ts
export const platformContentSummaryInputSchema = z.object({
  academyIds: z.array(z.uuid()).max(50).optional(),
});

export const platformContentSummarySchema = z.object({
  /** Academies in scope — the denominator the three counts are read against. */
  academies: z.number().int().nonnegative(),
  courses:  z.object({ total: …, published: … }),
  classes:  z.object({ total: …, running: …, withoutTeacher: … }),
  problems: z.object({ total: …, withoutTests: … }),
});
```

**It narrows by academy only.** The search box is per-lens — *"Search courses
by title"* — and applying a course-title search to a problem count would
produce a number that is true of nothing. State that in the contract comment,
because the next person to touch this will otherwise wire `query` through as
an obvious consistency win.

**Every predicate already exists.** `academy-stats.ts` computes all four
non-trivial ones against a single academy:

- `publishedCourses` → `course.count({ isVisible: true })`
- `classesWithoutTeacher` → the `teacherMembershipId: null` OR
  `role != TEACHER` OR `status != ACTIVE` disjunction
- `problemsWithoutTests` → `programmingExercise is null` OR `testCases none`
- `activeClasses` → `status: 'ACTIVE'`

The platform-wide version is the same predicates with `academyId` swapped for
`academyId: { in: ids }` or omitted. **Do not retype them.** Extract each
predicate into a shared module taking a scope filter, and have
`readAcademyStats` call the extracted versions. The comment already in
`academy-stats.ts` says why the teacher rule in particular must not be written
twice:

> *"Written out rather than as a `NOT`, so the two surfaces cannot drift into
> disagreeing about whether a class is covered."*

That argument now covers three surfaces.

Guard with `platform.content.read` — the same permission the three lists use,
via the same `this.authorize(identity)`. The summary is strictly less
information than the rows it sits above.

**Cost:** eight `count` calls against indexed predicates in one
`Promise.all`, on a page already issuing a `count` and a `findMany`. If it
measures slow on production data, cache it for 30s at the service — do not
drop counts to make it fast, because the fault counts are the reason the strip
exists.

**It fails apart from the rows.** Being the slowest call on the page makes it
the likeliest to time out, and the rows are what the operator came for. The
server component must settle the two independently — `Promise.allSettled`, not
`Promise.all` — and render the table with no strip above it; the client refetches
the summary on mount, so it is usually on screen a moment later. Folding both
into one `Promise.all` made a slow count answer *"Content is unavailable"* over
a table that had loaded, which is the first build's most user-visible defect.

---

## 6. Component work

### 6.1 Lift the row actions — do not copy them

`academy-content.tsx` (831 lines) already contains, working and reviewed:

`RowActions` · `DeleteDialog` · `CoursesCell` · `TeacherCell` ·
`StateBadge` · `countColumn`

They were written for `PlatformCourse` and `PlatformClass` — **the exact row
types this table renders.** Copying them would put the delete confirmation and
the teacher-coverage rule in two files that must never disagree.

Move them to `admin/_components/content-row-actions.tsx` and
`admin/_lib/content-columns.tsx`, then have `academy-content.tsx` import them.
**Ship that as its own commit, with no behaviour change**, exactly as §5.1 of
the native-content spec sequenced its path-provider refactor. The existing
academy-detail behaviour is the check.

Two extensions the lift needs:

- **A third kind.** `RowActions` and `DeleteDialog` take
  `kind: 'course' | 'class'`; add `'problem'`, routing to
  `deleteExercise` with no confirm token.
- **A pending-state owner.** `academy-content.tsx` keeps `statusPending` /
  `statusError` in the page component and calls `router.refresh()`. The
  cross-academy table is a React Query surface, so it must call
  `result.refetch()` *and* `router.refresh()` — the pattern `UserTable`'s
  `refetch` callback already establishes and comments. Make the refresh
  callback a prop rather than reaching for the router inside the shared
  component.

### 6.2 New components

| File | What |
|---|---|
| `content/_components/content-summary.tsx` | §2.3. Modelled on `user-composition.tsx` — same card, same `Stat` tile shape, same `toneStyles` plates. |
| `content/_components/content-type-chip.tsx` | §2.4. Same `Popover` + `Command` parts as `FacetedFilter`, single-select. |
| `admin/_lib/content-view.ts` | Extend: add `lensTones`, `lensIcons`, and `contentDetailHref` — three functions typed to their row shape, each taking the `from` of §2.6.1. One function over a loosely-typed row could only accept every field as optional, which moves the guarantee from the compiler to a runtime throw inside a cell renderer. |
| `admin/_lib/back-target.ts` | §2.6.1. The allowlist, and the only place a `from` becomes an href. |

### 6.3 Deleted

| File | Why |
|---|---|
| `content/_components/content-lens.tsx` | Replaced by the toolbar chip (§2.2). |
| `editInAcademyHref` + `contentPaths` in `_lib/content-view.ts` | The last callers go with §2.6. Grep before deleting — `enter-academy.ts` is a separate module and **stays**; §8 of the native-content spec still wants it for the diagnostic "view as" path. |

### 6.4 The table panel

Wrap the `DataTable` in the existing `Panel` with `frameless` set on the
table — the prop exists for this: *"Drops the table's own card, for a table
rendered inside one already."* `Panel` then supplies the §2.2 rail, the hued
header icon, and `meta` for the row count, with no new markup.

`PlatformShell` keeps `title="Content"`; the panel names the lens, and its
`meta` takes the row count as a **string** — as a number, zero is falsy and the
pill vanishes exactly when the operator most needs to be told the count is real.

### 6.5 Two gaps in `DataTable` this surfaced

Both are general, both belong in the shared table, and neither is content-
specific:

**`meta.align` was declared and never consumed.** `ColumnMeta` documents it —
*"right-aligns the header and every cell"* — and two bespoke tables implement it
themselves, but `DataTable` ignored it. So `countColumn` reached for `text-right`
on the value alone and produced four columns with their headers at one end and
their digits at the other. `DataTable` now honours it on `<th>` and `<td>`, and
flips the sortable header's negative margin to match.

**There was no way to style one column.** Added as `meta.className`, applied to
the header and every cell. It is what carries `max-xl:hidden` on Updated, and it
replaces a `nth-child` rule applied from outside the column list (§2.5).

---

## 7. i18n

All copy goes in `platform-content`, which is **page-scoped**
(`platformNamespaces`) — a student's payload must not carry the vocabulary for
administering their academy.

**The trap, restated from §9 of the native-content spec:** the lifted
components read `courses` and `classes`, which are *layout* namespaces
academy-side. `academy-content.tsx` reaches them through
`useLayoutTranslation`. Confirm those resolve under `PlatformShell`, which
mounts `platformNamespaces` only — if they do not, the console renders raw
keys for `hide` / `show` / `archive` / `restore`. Check this on the **first**
menu rendered, not after three lenses are wired.

Do not move editor copy into `platform-content` to dodge it. That forks the
strings, and `packages/i18n/src/locales.spec.ts` enforces a per-layout payload
cap the repo's rule is to *split, never raise*.

Korean lands with English in the same commit.

---

## 8. Sequence

Each step ships green and is independently reviewable.

0. **Lift the shared components** (§6.1) — pure refactor, no behaviour
   change, academy detail page unchanged. Own commit.
1. **`isVisible` on problems** (§5.1) — one field through shared → service →
   type.
2. **`platformContent.summary`** (§5.2) — extract the shared predicates,
   point `readAcademyStats` at them, add contract + router + service. No UI.
3. **The summary strip** (§2.3) — renders above the existing table,
   untouched. The page is already better here.
4. **Columns** (§2.5) — per lens, plus the difficulty pill. Check widths in
   a browser at 1280 and 1024 before moving on.
5. **Row actions** (§2.6) — Open repointed to the console routes, menu wired.
   **This is the step that retires the impersonation trip.**
6. **The type chip and the lens hue** (§2.2, §2.4) — delete
   `content-lens.tsx`, wrap in `Panel`.

Nothing after step 5 should begin until an operator has actually hidden a
course and deleted a class from this table in a browser — step 5 is where §7's
namespace trap fires, and finding it in step 6 means unpicking the toolbar.

### 8.1 Sorting

**Shipped in the revision pass**, having been deferred as optional. The
academies table sorts because it holds every academy at once and TanStack can
order them in the browser; this table is server-paged, so a client sort would
order the twenty-five rows in hand and present the result as a fact about four
thousand. Sorting here has to reach the database.

`sort` and `direction` join the list input as an **allowlist**, not a column
name — the value reaches an `orderBy`. The service maps each key per lens and
falls back to that lens's default for a key it does not have, so an address
naming `difficulty` while showing classes is a page rather than a 500.

**Only what the database can order is offered.** `lectures`, `problems` and
`tests` are summed from nested `_count`s after the rows load, so ordering by
them would sort a page among itself and change on every page turn. Those
columns stay unsortable rather than appearing to work — a sort control that
silently does nothing is worse than no sort control. What sorts:

| Lens | Sortable |
|---|---|
| Courses | Course, Classes, Modules, Updated |
| Classes | Class, Students, Updated |
| Problems | Problem, Difficulty, Updated |

Every `orderBy` ends on `id: "asc"`. Without a unique tiebreaker a page
boundary is undefined for rows that tie — twenty courses updated in the same
import minute — and an operator paging through them sees one row twice and
another never.

The sort lives in the address as `sort` and `dir`, and **newest-first
serializes to nothing**: an unsorted URL and a default-sorted URL have to
produce the same string or the server's `initialKey` never matches the
client's and the first paint refetches. It does not survive a lens switch, for
the reason the search text does not — `students` means nothing on courses, and
a key the new lens cannot honour would silently become newest-first.

### 8.2 The revision pass (2026-09-02)

Steps 0–6 shipped and were reviewed in a browser. Seven things came back, and
each is folded into the section it belongs to rather than appended here:

| Finding | Now in |
|---|---|
| The type chip read as navigation, not as a toolbar control | §2.4 |
| No column said whether content is visible or hidden | §2.5 |
| Nine columns and no way to choose among them | §2.5, the columns menu |
| `Edit` and `Open` went to the same place | §2.6 |
| The `Open` button dominated every row | §2.6 |
| Back left the operator somewhere they had never been | §2.6.1 |
| Column hiding was positional and dropped the wrong column | §2.5 |

A second round followed the same way:

| Finding | Now in |
|---|---|
| The table could not be sorted, unlike the academies table | §8.1 |
| Switching type left the operator halfway down the page | §8.3 |
| Two back arrows, forty pixels apart, on every detail page | §2.6.1 |
| The sidebar said Academies while the page said Content | §2.6.1 |

The last of those was found by driving the pages in a browser rather than by
reading them, which is the reason §9's manual list exists.

Two more were found in review rather than reported, and are in §5.2 and §6.5:
a failed summary took the whole page down with it, and `DataTable` never
consumed the `meta.align` its own type declared.

### 8.3 Scroll

Switching type or turning a page replaces every row on screen, and the operator
is left halfway down a table whose top — summary strip, toolbar, header row —
they have not seen. Both now return to the top. Narrowing a filter deliberately
does not: that keeps the same question on screen and answers it.

## 9. Testing

**Unit.**
- `parseContentQuery` / `serializeContentQuery` — the academy filter survives
  a lens switch and `q` and `page` do not (§2.4).
- `consoleBackTarget` — the content browser resolves; `//evil.example`,
  `https://evil.example`, a traversal and an unrelated console path all fall
  back. This one is security-relevant, not cosmetic: it is the guard on a
  string that becomes an href.
- The sort round-trip (§8.1) — a sort survives the address, newest-first
  serializes to nothing, and an unrecognised key falls back rather than being
  forwarded to the API.
- The extracted stats predicates — one spec asserting `readAcademyStats` and
  the platform summary return the same `withoutTeacher` count for a fixture
  academy. That test is the guard against the drift §5.2 warns about.

**Component.**
- `ContentSummary` — a zero `withoutTeacher` renders quiet, a non-zero one
  renders `danger`.
- `ContentTable` per lens — the Open link points at
  `/admin/academies/…` and **never** at `/admin/access/new`. Pin it; that
  regression is silent and lands an operator in a support flow.

**Manual, in a browser.** Both suites pass with an empty shell, so this is not
optional:

1. `/admin/content/courses` → summary reads three tiles + academy scope.
2. Narrow to one academy → **the tiles change**. If they do not, the summary
   is on the page component instead of the table (§2.3).
3. Switch to Problems → page goes violet; academy filter survives; search box
   is empty.
4. A course row: Open lands on the console builder, console chrome, **no
   support banner** — and Back returns to the browser with the academy filter
   still applied, not to the academy's own course index.
4b. The Columns menu hides Modules and puts it back.
4c. Sort by Students on the classes lens, page forward, and confirm no row
   appears twice — the `id` tiebreaker of §8.1 is what that checks.
4d. A detail page shows **one** back arrow, it returns to the browser, and the
   sidebar highlights **Content** rather than Academies. Open the same course
   from the academy's own index instead: one arrow again, now pointing at the
   academy, and the sidebar back on Academies.
5. Hide a course → confirm dialog → row updates without a full reload.
6. Delete a class → name typed back → row leaves; the Classes tile drops by
   one.
7. A problem row with 0 tests: red numeral in the table, counted in the
   `cannot grade` line.
8. Zero console errors throughout; keyboard focus visible on the chip, the
   menu, and Open.

---

## 10. Risks

**The lifted components drift back.** A future change to the academy detail
page that re-inlines a menu item reintroduces two delete dialogs silently. The
§9 component test is the guard; keep it pointed at both call sites.

**The summary is slow on production data.** Eight counts is not free. Measure
against the real database before step 3 ships, not after. Cache, do not trim.

**The type chip reads as removable.** Now that it wears the facet's own dashed
`+` trigger (§2.4), this risk is real rather than theoretical: readers learn `+`
chips as optional filters. It is held off by the chip never rendering bare and
never offering a way to clear — the component takes the lens as a required prop
with no null branch, so there is no state in which nothing is selected. Do not
add a `Clear` item to its popover.

**`from` becomes an href.** §2.6.1's allowlist is the whole guard. Anyone
widening it is one regex away from an open redirect out of the console; the unit
test in §9 is what makes that widening deliberate.

**Class column width.** Seven columns plus actions inside `max-w-6xl` is the
tightest layout in the console, and the state column of §2.5 made it tighter. If `layout="fixed"` cannot seat it, the fix is
fewer columns, not a horizontal scrollbar — `data-table.tsx` states why:
*"the reader loses the name column the moment they go looking for the last
column."*

---

## 11. Out of scope

Cross-academy bulk editing. Creating content from the console (creation stays
on the academy's own index routes). Course version history and the Excel
importer, both still academy-side per §4 of the native-content spec. Any
change to `AcademyAccessService`. The content library and distribution
(`platform.library.*`).
