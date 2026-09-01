# Console-Native Content Management

**Date:** 2026-09-01
**Status:** Proposed
**Scope:** The platform console's course, class and curriculum surfaces
**Branch:** `feat/platform-admin-console` (continues), or a fresh `feat/console-native-content`

## 1. Summary

A platform operator who opens a course from an academy's detail page is
currently thrown out of the console. They land on
`/academy/mapo-dlab/content/courses/<id>`, inside the customer's own sidebar
and branding, under a banner reading *"Standing in as Team lead."*

Everything about that is working as built, and all of it is wrong for the
person doing it. The operator is not standing in as anybody. They are an
administrator of the platform, and they are doing administration.

This spec replaces the impersonation trip with console-owned routes at
`/admin/academies/[academySlug]/courses/[courseId]` and
`/admin/academies/[academySlug]/classes/[classId]`, plus the two index pages
above them. The editors themselves are not rebuilt — the existing course
builder and class detail manager are mounted under a second shell.

### 1.1 What this is not

It is **not** a new permission. §3 shows the API already permits every
operation this spec exposes. The work is entirely in `@cove/web`.

It is **not** a second editor. If this spec results in two course builders,
it has failed; the whole design in §5 exists to prevent that.

## 2. The problem, precisely

Three distinct things are wrong, and only the first is obvious.

**The operator leaves the console.** URL, chrome, sidebar and page title all
become the academy's. Returning means the back button, and any deep link an
operator shares points into a customer's URL space.

**The banner is describing a mechanism, not a fact.** `cove_view_role` is a
cookie holding a *global mode* — it is not scoped to one academy or one tab.
An operator who opens a course as `TEAM_LEAD`, then navigates to a different
academy, is still `TEAM_LEAD` there. Persisting a mode switch in a cookie to
answer a per-page question was expedient and is now the source of the
confusion.

**The role picker is doing nothing.** See §3. Both roles resolve to the same
permission set for every operation the console offers.

## 3. The API already allows this

`AcademyAccessService` (`packages/api/src/authorization/academy-access.service.ts`)
resolves access in four ordered steps: account status, membership, live support
grant, then `platformRead`. That last branch is the one platform operators take,
and it returns:

```ts
platformViewPermissions(currentViewRole())   // default: MANAGER
```

Since the Manager-inherits-Team-Lead change
(`docs/superpowers/specs/2026-08-31-manager-inherits-team-lead-permissions-design.md`,
Implemented), `academyRolePermissions.MANAGER` is:

```ts
MANAGER: [...teamLeadPermissions, ...managerOnlyPermissions]
```

A strict superset. So `platformViewPermissions('MANAGER')` already contains
`curriculum.manage`, `curriculum.draft`, `curriculum.review`, `classes.manage`
and `content.import` — every permission the console's content work needs.

**Consequence:** the console never needs to send `x-cove-view-role` for CRUD.
The default already grants more than the Team Lead view it currently asks for.
The header stays in the codebase for support grants and for the deliberate
"see it as a Teacher sees it" case in §8 — it is simply not on this path.

`platformViewPermissions` also filters `submissions.own.create`, so an operator
cannot submit work as a student. That guarantee is unchanged and is the reason
this spec adds no new permission: the existing filter is the safety property,
and widening the surface does not widen the grant.

## 4. Routes

```
/admin/academies/[academySlug]                       ← exists; tables link inward
├── courses/                                          NEW  index
│   └── [courseId]/                                   NEW  builder
│       └── lectures/[lectureId]/exercises/[materialId]   NEW  problem editor
└── classes/                                          NEW  index
    └── [classId]/                                    NEW  detail
```

Four new page files plus the exercise workspace. The two index routes exist so
that the "View all" links already rendered by `AcademyContent`'s `Section`
have somewhere to go that is not `/admin/content/courses?academy=<id>` — the
cross-academy lens, which answers a different question.

Deliberately **not** in scope: `versions/`, `imports/new`. Course version
history and the Excel importer stay academy-side. An operator needing them has
the support-grant path, and neither is part of "CRUD a course".

## 5. Mounting one editor under two shells

The editors are already client components taking data and capability flags as
props — `CourseBuilder`, `CoursesManager`, `ClassDetailManager`. The server
page is the only academy-coupled part. So the split is:

| Layer | Academy | Console |
|---|---|---|
| Route | `(studio)/academy/[slug]/(framed)/…` | `(platform)/admin/academies/[slug]/…` |
| Guard | `requireAcademyRoute` | `requirePlatformAcademyRoute` (exists, §6) |
| Shell | `StudioChrome` | the console's existing chrome |
| Body | `CourseBuilder` | **the same `CourseBuilder`** |

### 5.1 The one real obstacle: link building

The editors build their own hrefs. `CoursesTable` calls:

```ts
function curriculumPath(academySlug: string, course: CourseSummary) {
  return `${routes.academy(academySlug)}/content/courses/${course.id}`;
}
```

and `useAcademySlug()` comes from `academy-route-provider`, which the console
does not render. Every such call has to become relative to a base the *shell*
supplies.

**Add `ContentBasePathProvider`** in `packages/web/src/components/studio/`,
exposing `useContentBasePath()`. The academy shell provides
`/academy/${slug}`; the console shell provides
`/admin/academies/${slug}`. Then:

```ts
const base = useContentBasePath();
// academy → /academy/mapo-dlab/content/courses/<id>
// console → /admin/academies/mapo-dlab/courses/<id>
```

Note the paths are not parallel — the console drops the `content/` segment,
because the console has no other kind of content to disambiguate against. The
provider returns a small record rather than a string prefix, so neither shell
has to know the other's shape:

```ts
type ContentPaths = {
  courses: () => string;
  course: (courseId: string) => string;
  classes: () => string;
  class: (classId: string) => string;
  exercise: (courseId: string, lectureId: string, materialId: string) => string;
};
```

**Implementation order matters here.** Introduce the provider and migrate the
academy pages to it *first*, with no console routes at all, and ship that as
its own commit. It is a pure refactor with the existing suite as its check. The
console routes then become additive.

### 5.2 Call sites to migrate

Grep targets for the refactor commit:

```
rg "routes\.academy\(" packages/web/src/app/\(studio\)
rg "useAcademySlug\(\)" packages/web/src
```

**Scale check, measured 2026-09-01:** 58 files under `(studio)` call
`routes.academy(`, and 59 call `useAcademySlug()`. Only **17** are under
`content/` or `classes/`. Migrate those 17 and leave the rest alone — the
provider is for the editors the console re-mounts, not a repo-wide swap. The
other 41 are navigation and sidebar code that will never render under the
console shell, and touching them buys nothing but review surface.

### 5.3 What each console page does

Identical to its academy counterpart, with two substitutions:

```ts
// academy page
const { academyId, role } = await requireAcademyRoute(academySlug);
canEdit = canManageContent(role);

// console page
const { academyId } = await requirePlatformAcademyRoute(academySlug);
canEdit = true;  // §3: the platform view already holds curriculum.manage
```

`canEdit = true` deserves the comment. It is not a bypass — the API re-checks
every mutation against `platformViewPermissions`, and a client flag has never
been the boundary. It is the honest statement that this surface is only
reachable by someone the API will say yes to.

## 6. The guard already exists

`packages/web/src/lib/academy-route.ts` already has
`requirePlatformAcademyRoute` (line ~193), and it is almost exactly the guard
this spec needs: it resolves an academy for a platform operator, calls
`notFound()` on failure, and never consults `cove_view_role`.

**Do not add a second guard.** Extend this one. Three changes:

**(a) Its own comment currently forbids what we are building.** Inside
`resolvePlatformAcademyRoute`:

> *"This seam serves the platform academy page alone, which administers
> academies and never branches on role … so an operator does not reach a
> course page from here."*

That sentence is the design being changed. Rewrite it to say what becomes
true: the seam serves every console route, an operator reaches content pages
through it, and the `role: 'MANAGER'` it reports is not a membership but the
platform view's permission set — which §3 shows is the correct superset.

**(b) Return the academy name.** The console shell needs it for the header and
breadcrumb; today the field is dropped. `AcademyRouteIdentity` is shared, so
either widen it or have the console pages read the detail they already fetch.
Prefer the latter — the builder page loads the course tree regardless, and the
academy detail is one more field on a call already being made.

**(c) The lookup is weak.** It calls `platformAcademies.list({ query, limit:
100 })` and filters client-side for an exact slug match. On a platform with
more than 100 academies whose slugs share a prefix, a valid slug can fall off
the end of the page and 404. This is a latent bug today; it becomes a
user-visible one when console routes multiply. Fix it with a proper
`platformAcademies.getBySlug` on the contract, or at minimum assert the
`query` is treated as an exact-slug filter server-side.

Item (c) is worth its own commit, before the routes. It is a real defect, it is
independent of this feature, and it is much easier to reason about on its own.

### 6.1 The `cove_view_role` guarantee

`requirePlatformAcademyRoute` does not read the cookie today, and it must stay
that way. Add a test that pins it:

> With `cove_view_role=TEACHER` set, `requirePlatformAcademyRoute` returns the
> same identity it returns with no cookie.

Without that guarantee, an operator who left the cookie set to `TEACHER` from
an earlier visit opens the console's builder and finds the write controls
missing, with nothing on screen explaining why. The test is cheap and the
failure it prevents is genuinely baffling to debug.

## 7. Retiring the impersonation trip

Once §4 exists, `AcademyContent`'s `RowActions` stops calling
`enterAcademyAs` and becomes a plain `<Link>`. That removes the last
content-path caller of `enterAcademyAs`
(`packages/web/src/app/(platform)/admin/_lib/enter-academy.ts`).

Keep the module. §8 still wants it, and it remains correct for what it does.

Audit the `Add course` / `Add class` buttons in the same pass — they call
`enterAcademyAs` too, and should point at the new index routes.

### 7.1 Academy-detail action parity

The academy detail page's compact course and class tables keep the same row
actions as their full manager-side tables. Course rows offer Edit, Show/Hide
and Delete; class rows offer Edit, Archive/Restore and Delete.

Use the existing visibility and archive confirmation dialogs. Hiding a course
and archiving a class require confirmation because they remove student access;
showing and restoring are reversible and apply immediately. All mutations call
the same academy endpoints as the full tables, surface failures without
dismissing the action state, and refresh the academy detail after success.

## 8. What "view as" is still for

Keep the existing Manager, Team Lead and Teacher role picker on the academy
detail page. It is a diagnostic surface for opening the academy's own studio as
one of its roles, not the way an operator administers courses or classes.

Only the picker's **Enter academy** action writes `cove_view_role` and leaves
the console. Course and class Open, Edit and Add actions stay on the
console-native routes from §4, where both server and browser API clients omit
`x-cove-view-role` and use the platform Manager permission set. A role selected
for diagnostic viewing therefore cannot narrow console CRUD, even when its
cookie remains set.

The picker belongs on the academy detail page as a secondary action, not on
every row. Its copy must distinguish viewing from administration and make clear
that activity inside the academy is attributable to the operator.

## 9. i18n

The console's copy goes in `platform-content`, which is **page-scoped**
(`platformNamespaces` in `packages/web/src/i18n/namespaces.ts`, and pointedly
not a layout namespace — a student's payload must not carry the vocabulary for
administering their academy).

The editors themselves already translate against `content`, `courses` and
`classes`. Those are layout namespaces academy-side. **The console shell must
mount them explicitly** via `PageTranslationsProvider`, the way
`content/courses/page.tsx` already mounts `destructive`. Missing this is the
most likely way to get a console page rendering raw i18n keys.

Do not move editor copy into `platform-content` to avoid this. That would fork
the strings, and the whole point is one editor.

Watch the budget: `packages/i18n/src/locales.spec.ts` enforces a per-layout
payload cap. Adding to `platform-content` cannot breach it — the namespace is
page-scoped — but if the refactor in §5.1 tempts anyone to move a string into
`courses` or `classes`, it will. The repo's rule is split, never raise.

## 10. Testing

**Unit.** `requirePlatformAcademyRoute` — the cookie-independence test in
§6.1, and an exact-slug case covering the §6(c) pagination defect (an academy
whose slug shares a prefix with 100+ others still resolves).

**Component.** The path provider: one editor, two bases, asserting the hrefs
differ. Mount `CoursesTable` under each.

**Manual, in a browser.** Both suites will pass with the console rendering an
empty shell, so this is not optional:

1. `/admin/academies/mapo-dlab` → Open on a course row → lands at
   `/admin/academies/mapo-dlab/courses/<id>`, console chrome, **no banner**.
2. Create a module. Rename it. Delete it. All three succeed.
3. Open a problem, edit it, save.
4. Same for a class: assign a course, add a student, set a teacher.
5. Set `cove_view_role=TEACHER` by hand, reload the console builder — write
   controls still present (§6).
6. Zero console errors throughout.

## 11. Sequence

Each step ships green.

0. **Fix the slug lookup** (§6c) — independent defect, own commit.
1. **Path provider** — introduce, migrate academy pages, no behaviour change.
2. **Extend `requirePlatformAcademyRoute`** (§6a, §6b) — with its tests.
3. **Console course routes** — index, builder, exercise workspace.
4. **Console class routes** — index, detail.
5. **Repoint `AcademyContent`** — links replace `enterAcademyAs`; retire the
   content-path uses.
6. **Recast "view as"** per §8.

Steps 1 and 2 are independent and can go in either order. Nothing after 3
should begin until a console builder has actually saved a module in a browser
— that is the step where §9's namespace trap fires, and finding it in step 5
means unpicking four routes' worth of work.

## 12. Risks

**The editors assume the studio shell.** `StudioPage` provides `bleed`,
scroll containment and the page header. The console shell may not compose
identically. Mitigation: step 3 mounts exactly one route and looks at it before
anything else is written.

**Two shells, one component, drift.** A future change to the course builder
that reaches for `useAcademySlug()` reintroduces the coupling silently. The
component test in §10 is the guard; keep it.

**Deep links into a deleted academy.** The console's routes outlive the
academy. `requirePlatformAcademyRoute` returning `notFound()` covers it.

## 13. Out of scope

Course versions and the Excel importer (§4). Cross-academy bulk editing.
The content library and distribution (`platform.library.*` — stage 5 of the
console spec). Any change to `AcademyAccessService`, which §3 establishes is
already correct for this.
