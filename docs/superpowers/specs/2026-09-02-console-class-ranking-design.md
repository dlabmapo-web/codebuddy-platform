# Console Class Ranking: Every Academy's Classes, Then One Board

**Date:** 2026-09-02
**Status:** Implemented 2026-09-02
**Scope:** `/admin/ranking` — class rankings across every academy, and one
student's point ledger beneath them, from the console
**Branch:** `feat/platform-admin-console` (continues)

## 1. Summary

A manager opens `points/classes`, picks one of *their* classes, and reads its
ranking. The academy is implicit, and the only question the page asks is
"which class". An operator has no academy, so the console's version asks one
more thing — **which class, out of every class on the platform** — and then
shows the identical board.

The board itself needs no new code and no new endpoint. What is missing is the
step in front of it — a way to see every academy's classes at once, ordered by
something an operator can act on, and to descend from there into one class —
and the step *after* it: the per-student point ledger the manager's board links
to, which is where "why does 지호 have forty points" is actually answered.

Both ends are the same promise: **an operator gets the manager's points
surfaces, unchanged, across every academy.**

### 1.1 What already works

- **The board is already readable by an operator.**
  `PointsAccessService.resolveClassBoard` falls through to `platformScope`
  when the caller holds no membership in the academy, which asks
  `AcademyAccessService.requirePermission(…, "academy.read")`. That resolves
  through `platformRead`, which requires `platform.academies.inspect` and
  grants the permission set of the operator's chosen view role — defaulting to
  `MANAGER`, which holds `academy.read`. So `points.getClassBoard` answers an
  operator today for any active academy.
- **The console client asks with the right role by construction.**
  `shouldForwardViewRole()` is false on console routes (`lib/orpc.ts`), so a
  stale `cove_view_role` cookie from some earlier diagnostic cannot narrow this
  read. The API defaults to `MANAGER`, which is what the board needs.
- **`platformScope` already scopes to every active class in the academy** and
  reports `membershipId: ""` / `isSelf: false`, which is what keeps `isYou` off
  every row instead of landing on whichever row happens to share the blank.
- **The board component is already staff-shaped.** `ClassLeaderboard` takes a
  `rowAction`, which the manager's page uses for the per-student "Points" link,
  and `StaffLeaderboardRow` carries the `membershipId` that link needs.

### 1.2 What is missing

**A cross-academy read.** `points.getClassBoard` takes one `academyId` and
answers about one class. Nothing on the platform can answer "every class on
Cove Studio, and which of them are actually earning points this week" — the
same gap `platform.content.read` and `platform.applications.read` were each
introduced to close.

**A page.** No console route mounts the board. `/admin/content/classes` lists
classes across academies but reads curriculum facts — teacher, courses,
students — and knows nothing about points.

**A subject, for an operator reading one student.** This one is a defect rather
than an absence, and §4.5 is about it: `platformScope` takes
`{ academyId, classId }` and drops `membershipId` on the floor, returning
`membershipId: ""` and `subjectName: ""`. So `points.getPage({ academyId,
membershipId })` — the exact call the manager's student-ledger page makes —
answers an operator with a page about *nobody*: a `subjectName` that fails its
own output contract (`labelSchema` is `.min(1)`), and a ledger filtered on
`membershipId: ""`, which is zero rows. The console cannot mount the ledger
until that is fixed, and no amount of front-end work would fix it.

### 1.3 Why the console needs this at all

The operator questions this answers are the ones support calls actually open
with, and none of them can be answered from inside a single academy:

- *"Is this academy using the product?"* — a class with eighteen students and
  no points this month is an academy that installed Cove and stopped.
- *"Their manager says ranking is broken."* — the row says whether the class
  has students, whether points are switched on, and whether the board is
  eligible, before anybody opens a support grant.
- *"Which of our academies are healthy?"* — the strip across the top counts
  classes earning against classes idle, platform-wide.

Today each of those ends with an operator standing inside a customer's studio
under a support grant, reading a page they are already permitted to read.

### 1.4 What this is not

It is **not a platform-wide student ranking**, and no shape here can grow into
one. §10.2 of the student points design is the constraint: a student can move a
position in a room of eighteen and cannot move one in an academy of four
hundred, so a list of every child on the platform would mostly rank enrolment
date. Children are ranked **within one class**, always. The cross-academy level
ranks *classes*, and only by aggregate.

It is **not a second board, and not a second ledger.** The board is
`ClassLeaderboard` off `points.getClassBoard`; the ledger is
`StudentPointsLedger` off `points.getPage` — both unchanged, both the same
components and the same procedures the manager's own pages mount. It is the
rule the console already follows for curriculum mutations and invitation sends.
A manager, a teacher, a student and an operator comparing screens must never
see two different third places, and must never be told two different stories
about where a child's forty points came from.

It **grants no new authority over points.** There is no award control, no
adjustment, and no void anywhere in this design, because the API has no method
for the first two and §7.6's correction path is deliberately unexposed. An
operator reads exactly what a manager reads.

---

## 2. The design

### 2.1 Where it goes

`CURRICULUM` already holds Courses and Classes. A ranking is a read of what a
class produced, so it sits directly beneath Classes:

```
CURRICULUM
  📖  Courses     /admin/content/courses
  🎓  Classes     /admin/content/classes
  🏆  Ranking     /admin/ranking
```

No badge. A badge counts work only an operator can do; a quiet class is the
academy's own business and a permanently lit badge is one nobody reads.

The route is `/admin/ranking` rather than `/admin/content/ranking`: the content
lens machinery (`contentLensHrefs`, `contentLensFromReferrer`, `lensTones`)
describes two lists that share one input schema and one table, and a third
member that shares neither would make that abstraction a coincidence.
`contentLensFromReferrer` therefore does not match this path, and the rail
lights it by ordinary path matching through `activeNavHref`.

### 2.2 The page

```
Class ranking
Every class on Cove Studio, and what its students earned.

┌────────────────┬────────────────┬────────────────┬────────────────┐
│▌🏆 4,182 P     │ 🎓 38 / 61     │ 👥 214         │ ⚠ 5            │
│  earned this   │  classes       │  students      │  classes with  │
│  week across   │  earning       │  earned some-  │  points off    │
│  9 academies   │                │  thing         │                │
└────────────────┴────────────────┴────────────────┴────────────────┘

[Search class or academy] [Academy ▾] [Today | This week | This month]  [Columns ▾]

Academy          Class      Students  Earning  Points ▼  Solved  State
─────────────────────────────────────────────────────────────────────────
D.Lab Mapo       3반           18        14       412      37    Ranked
  /mapo
D.Lab Mapo       4반           16         9       288      21    Ranked
  /mapo
Seoul Coding     Python A      22        18       255      19    Board off
  /seoul-coding
Busan Academy    입문반         12         0         —       —    Points off
  /busan
─────────────────────────────────────────────────────────────────────────
                                              25 of 61   ‹ 1 2 3 ›

▼ selected: D.Lab Mapo · 3반

┌─ Class ranking · 18 students · Today ──────────────────────────────┐
│ Pos    Name        Total   From solving  From finishing  …  Detail │
│ 🥇 1   지호  ↑     40P     18P · 3 easy   12P · 1 lecture    [Points]│
│ 🥈 2   민서        31P     15P · 2 easy    8P               [Points]│
│  3     하윤        22P      9P · 1 easy    5P               [Points]│
└─────────────────────────────────────────────────────────────────────┘
```

Built from parts the console already has: `DataTable` in manual mode with the
academy facet and server paging (`ContentTable`'s shape), the summary strip
pattern from `ContentSummary`, and — below it — `ClassLeaderboard` exactly as
the manager's page mounts it.

### 2.3 Two levels, and why the top one ranks classes

The top table ranks **classes by aggregate**; the board beneath ranks
**students within one class**. That split is not a layout convenience, it is
the §10.2 constraint made structural:

- A class total is a fact about a *class*. Ordering classes by it compares
  units that are actually comparable, and the thing being judged is a
  programme rather than a child.
- The table carries **no child's name**. Not the top student, not the leader,
  not "지호 is carrying 3반". That was considered and dropped: it is the one
  field that would make this page a platform-wide ranking of children by the
  back door, and it is available one click down in the board where it belongs
  and is bounded by a class.

This is also what makes the permission story honest — see §4.4.

### 2.4 The period, across academies that keep different clocks

A period is academy-local. `resolvePointsPeriod(kind, now, timeZone)` builds
"today" from the academy's own timezone, so an evening class is never split
across two dates. Every academy carries its own `timeZone`, and the console is
looking at all of them at once.

**The window is resolved per academy, not once for the platform.** A single
UTC-ish window would be simpler and would produce a table that disagrees with
the board an operator opens from it — the row says 412 and the board adds up to
390 — which is the worst failure this page can have, because both numbers look
authoritative.

The cost is bounded by *distinct timezones*, not by academies: the service
groups academies by `timeZone`, resolves one `PointsPeriod` per distinct zone,
and issues one aggregate query whose `where` is an `OR` of
`{ academyId: { in: […] }, createdAt: { gte, lt } }` clauses — one clause per
zone. Cove's academies are overwhelmingly `Asia/Seoul`, so this is one clause
in practice and correct in principle.

### 2.5 Sorting is server-side, over the whole set

The default order is **points, descending** — the question the page exists to
answer. Sortable: points, students, earning students, class name, academy name.

`platform/content.ts` states the rule this has to respect: a page of
twenty-five sorted by a figure computed after loading is twenty-five rows
sorted among themselves, an order that changes on every page and is a lie about
the whole set. Points cannot be an `orderBy` — they are a period-scoped
`groupBy` over `PointAward`, and there is no stored standing anywhere by design
(§10.2 requires that a position expire, and the cheapest guarantee is having
nowhere to keep one).

So this service **does not** page in the database. It:

1. loads every active class in scope (filtered by the academy facet and the
   search term) — ids, names, academy;
2. computes the aggregates for **all** of them in a fixed number of grouped
   queries, regardless of how many classes there are;
3. sorts the complete set in the service;
4. slices the requested page.

That is the honest version of "sorted by points", and it costs a bounded amount:
the aggregate work is driven by `PointAward` rows in the window (which the
database groups), not by the class count, and the in-memory sort is over the
platform's active classes — hundreds, not millions.

`PLATFORM_RANKING_MAX_CLASSES = 2000` caps the row set as a guard-rail. Past
it the response reports `truncated: true` and the table shows a line asking
the operator to narrow by academy. It is a limit that says so rather than a
page that silently describes part of the platform.

Every sort ends on `classId` ascending. Without a unique tiebreaker a page
boundary is undefined for rows that tie — and on a daily period most rows tie
at zero — so an operator paging through them would see one row twice and
another never.

### 2.6 Three states a class can be in, and the flags behind them

`PointsAccessService` refuses `points.getClassBoard` with `POINTS_UNAVAILABLE`
when `STUDENT_POINTS` is off, and `points.service` substitutes an unavailable
board when `STUDENT_CLASS_LEADERBOARD` is off. Both are per-academy flags, both
default on for a new academy, and a manager may switch either off.

A console page that simply omitted those academies would answer "why is this
academy missing from ranking" with silence. So every active class appears, in
one of three states:

| State | Flags | Points column | Selecting the row |
|---|---|---|---|
| `ranked` | both on | real totals | the board |
| `board_off` | `STUDENT_POINTS` on, `STUDENT_CLASS_LEADERBOARD` off | real totals | an explanation: the academy switched the named board off; points are still earned |
| `points_off` | `STUDENT_POINTS` off | em dash, never `0` | an explanation: points are switched off for this academy |

Em dash rather than zero is the house rule for a missing measurement on every
points surface, and it is load-bearing here: `0` would put an academy that
turned the feature off at the bottom of a table sorted by points, next to an
academy that is failing.

Only `ACTIVE` academies and `ACTIVE` classes are listed. A suspended or
archived academy is refused by `platformScope` anyway, so listing one would
offer a row whose board cannot open.

### 2.7 Selecting a class, and the address

Selecting a row reveals the board **beneath the table** on the same page rather
than navigating to a detail route. The manager's own page is one page with a
picker and a board, and an operator's job here is comparison — open a class,
read it, go back to the table, open the next — which a navigation would charge
for three times over.

The selection lives in the address, so a class and a period can be sent to a
colleague:

```
/admin/ranking?class=<classId>&academy=<academyId>&period=week&sort=points&dir=desc
```

`academy` rides beside `class` because `points.getClassBoard` is scoped by
`academyId` and the board must be loadable from a cold link without first
finding the class in the table. Defaults are omitted from the URL, exactly as
`serializeContentQuery` does, so an untouched table and a default-sorted table
serialize identically and the server's `initialKey` matches on first paint.

The period toggle is **shared**: it drives both the table's aggregates and the
board, because two period controls on one screen showing two different weeks is
a bug report waiting to be filed.

### 2.8 One student's ledger, the same page a manager reads

The manager's points surface is three routes. Two of them are staff work and
come to the console; the third is not, and §6 says why.

| Manager | Console | |
|---|---|---|
| `points/classes` — pick a class, read its ranking | `/admin/ranking` — pick a class *out of every academy*, read its ranking | §2.2 |
| `points/students/[membershipId]` — one student's ledger | `/admin/academies/[academySlug]/points/students/[membershipId]` | this section |
| `points` — the reader's *own* points page | — | §6 |

The board's per-row action is the manager's "Points" link, and it goes where it
goes on the manager's page: to that student's ledger — the plate-less,
staff-shaped `StudentPointsLedger`, which prints the period total, the rules
panel, and every line that produced the number.

§5.1 of the student points design is why it has to come along: *"why does 지호
have forty points"* is a question a parent asks a teacher, the teacher asks the
manager, and — when the academy has no manager, which is the whole reason the
console exists — the manager's question arrives at an operator. A ranking an
operator can read but cannot explain answers half of the support call.

**It is mounted inside the console**, at a route that mirrors the studio's own:

```
studio    /academy/[academySlug]/points/students/[membershipId]
console   /admin/academies/[academySlug]/points/students/[membershipId]
```

the same mirroring `/admin/academies/[academySlug]/classes/[classId]` already
uses for the class editor. The page is a thin server component that resolves
the academy through `requirePlatformAcademyRoute`, fetches `points.getPage`
through `createPlatformServerORPCClient()`, and renders the *existing*
`StudentPointsLedger` inside `PlatformShell`. No copy of the ledger, no console
variant of it.

**Back returns to the ranking.** The link that opened the page carries
`?from=/admin/ranking…`, which `consoleBackTarget` resolves — see §5.5 for the
allowlist change that requires. Without it the reader presses Back and lands on
the academy's own index, a page they have never been to.

**What it deliberately does not gain.** No season plate: §11.2's signature
element is a gap to chase, written in the second person to the child it is
about, and "you are 6 points behind" is nonsense on a page an operator is
reading about somebody else's nine-year-old. `StudentPointsLedger` already
makes that exclusion, and the console inherits it by using the component rather
than assembling its own.

---

## 3. The contract

New file `packages/shared/src/platform/ranking.ts`, and
`packages/shared/src/api/orpc/platform-ranking.contract.ts`, registered in
`orpc-contract.ts` as `platformRanking` and exported from
`packages/shared/src/platform/index.ts`.

```ts
/** Which academy a row belongs to — the first thing an operator reads. */
export const rankingAcademySchema = z.object({
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  /** The clock this row's period was measured in. §2.4. */
  timeZone: z.string().min(1),
});

export const classPointsStates = ["ranked", "board_off", "points_off"] as const;
export const classPointsStateSchema = z.enum(classPointsStates);

export const platformRankedClassSchema = rankingAcademySchema.extend({
  classId: z.uuid(),
  name: z.string().min(1),
  /** Null when nobody is assigned — the condition managers are asked about. */
  teacherName: z.string().nullable(),
  /** Active student memberships enrolled in the class. */
  students: z.number().int().nonnegative(),
  /** Of those, how many earned anything in the period. The measurement that
   *  separates a quiet class from an unused one. */
  earningStudents: z.number().int().nonnegative(),
  /** Null when points are off, never 0 — §2.6. */
  points: z.number().int().nonnegative().nullable(),
  solvedProblems: z.number().int().nonnegative().nullable(),
  state: classPointsStateSchema,
});

export const rankingSortKeys = [
  "points",
  "students",
  "earning",
  "class",
  "academy",
] as const;

export const listPlatformRankingInputSchema = z.object({
  query: z.string().trim().max(120).optional(),
  academyIds: z.array(z.uuid()).max(50).optional(),
  period: pointsPeriodKindSchema.default("day"),
  sort: rankingSortKeySchema.default("points"),
  direction: rankingSortDirectionSchema.default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(PLATFORM_RANKING_PAGE_SIZE),
});

export const listPlatformRankingResultSchema = z.object({
  rows: z.array(platformRankedClassSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** True when the platform holds more classes than one pass may aggregate. */
  truncated: z.boolean(),
  summary: z.object({
    academies: z.number().int().nonnegative(),
    classes: z.number().int().nonnegative(),
    earningClasses: z.number().int().nonnegative(),
    students: z.number().int().nonnegative(),
    earningStudents: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
    pointsOffClasses: z.number().int().nonnegative(),
  }),
  /** Every academy, for the facet — the same list the other console lists
   *  offer, so the surfaces filter by the same names. */
  academyOptions: z.array(
    z.object({ id: z.uuid(), name: z.string().min(1), slug: z.string().min(1) }),
  ),
});
```

```ts
export const platformRankingContract = {
  classes: oc
    .input(listPlatformRankingInputSchema)
    .output(listPlatformRankingResultSchema),
};
```

One method. There is deliberately no `platformRanking.board`: the board is
`points.getClassBoard`, which already answers an operator, and a platform twin
would be a second implementation of a ranking — the exact thing §1.4 forbids.

The summary rides on the list response rather than on a second method. Unlike
`platformContent.summary`, it follows the *same* filters as the rows including
the search term — every figure in it is a fold over the aggregate set the
service has already computed in step 2 of §2.5, so a second endpoint would be a
second round trip to recompute what is in hand.

---

## 4. The API

New `PlatformRankingService` (`packages/api/src/platform/platform-ranking.service.ts`),
registered in `PlatformModule`, `ORPCDeps` and `orpc/router.ts` beside
`PlatformContentService`; new `platform-ranking.router.ts` following
`platform-content.router.ts`.

### 4.1 The queries

Five, and the count does not grow with the number of classes:

1. **Academies in scope** — `academy.findMany({ where: { status: "ACTIVE",
   …facet }, select: { id, name, slug, timeZone } })`. Also serves
   `academyOptions` and the summary's `academies`.
2. **Feature flags** — `academyFeatureFlag.findMany({ where: { academyId: { in },
   feature: { in: ["STUDENT_POINTS", "STUDENT_CLASS_LEADERBOARD"] },
   isEnabled: true } })` → a `Map<academyId, Set<feature>>`, which decides
   `state` per row and which academies contribute point rows at all.
3. **Classes** — `class.findMany({ where: { academyId: { in }, status: "ACTIVE",
   …search }, select: { id, name, academyId, teacher… } })`, capped at
   `PLATFORM_RANKING_MAX_CLASSES + 1` so `truncated` is knowable.
4. **Rosters** — `classEnrollment.groupBy({ by: ["classId"], where: { classId:
   { in }, membership: { status: "ACTIVE", role: "STUDENT" } }, _count: … })`.
   The same population `LeaderboardRepository.roster` ranks, so the "18
   students" in the row and the "18 students" on the board agree.
5. **Points** — `pointAward.groupBy({ by: ["classId", "membershipId"], where: {
   voidedAt: null, classId: { in }, OR: [ …one clause per distinct timezone… ]
   }, _sum: { amount }, _count: { _all } })`.

   Grouping by membership as well as class is what makes `earningStudents`
   answerable: Prisma has no count-distinct in `groupBy`, so the distinct
   students are the row count per class. `points` is the sum of `_sum.amount`
   — **what was actually paid**, never a figure derived from the rate table,
   because the daily cap truncates an award and a derived figure would disagree
   with the ledger on exactly the days a class worked hardest.

   `solvedProblems` needs a reason filter and is a sixth grouped query
   (`by: ["classId"], where: { …, reason: "EXERCISE_SOLVED" }, _count`) rather
   than a third `by` column, which would multiply the result set by seven for
   one column.

`voidedAt: null` is not optional: a manager's void excludes a row from every
sum, and a console figure that counted voided awards would be the one place on
the platform where a correction did not take.

### 4.2 Assembling a row

Per class, in the service:

- `state` from the flag map: `points_off` when `STUDENT_POINTS` is absent,
  `board_off` when `STUDENT_CLASS_LEADERBOARD` is absent, else `ranked`.
- `points` / `solvedProblems`: `null` when `points_off`, else the aggregate,
  defaulting to `0` for a class with no awards (a real zero — the class *can*
  earn and did not, which is precisely what the operator is looking for).
- `earningStudents`: the number of grouped rows for the class whose
  `_sum.amount` is greater than zero.

### 4.3 Sorting, and the tiebreak

A comparator per key, ending on `classId` ascending (§2.5). `points_off` rows
sort as though below zero when the key is `points` or `earning` — they are not
a measurement of anything and must not float to the top of an ascending sort
where they would read as "worst".

### 4.4 The permission

`platform.analytics.read`, which already exists in `platformPermissions` and is
so far unused. It is the right one and the fit is not a coincidence: this
endpoint returns *aggregates about classes* — counts and sums, no child's name,
no membership id, no submission, no grade.

The board an operator opens from a row is a different read with a different
gate: `points.getClassBoard` resolves through `platformScope`, which requires
`platform.academies.inspect` — the wide, deliberately-named permission that
reaches inside an academy. Keeping the two apart is what makes §2.3's exclusion
of the leader's name structural rather than a style choice: a narrower operator
role, if one is ever added, can hold the browser without holding the boards.

Guarded the way every other platform service is — the first act inside the
service method is `PlatformAccessService.requirePermission`, never a branch in
the router.

### 4.5 The one change to existing code: `platformScope` must resolve a subject

Everything above is additive. This is not, and it is the only edit this design
makes to a file that already works.

`PointsAccessService.platformScope` is declared as:

```ts
private async platformScope(
  identity: SupabaseIdentity,
  input: { academyId: string; classId?: string },   // ← no membershipId
): Promise<PointsScope>
```

and returns `membershipId: ""`, `subjectName: ""`. That is correct for the two
callers it was written for — `resolveOverviewBoard` and `resolveClassBoard`,
where an operator is not on the board and the blank is exactly what keeps
`isYou` off every row instead of landing on whichever row happens to share it.

It is wrong for `resolve`, which is the path `points.getPage` and
`points.listLedger` take. There, `membershipId` names **the student being read**
— a staff reader's subject, not the reader. Dropping it means an operator's
ledger request comes back as a page about nobody: `subjectName: ""` fails
`labelSchema`'s `.min(1)`, and `listLedger` builds `where: { membershipId: "" }`,
which matches nothing. Today no console page calls it, so the defect is
invisible; §2.8 is the page that would trip over it.

**The fix**, mirroring `requireReadableStudent` one level up:

```ts
private async platformScope(
  identity: SupabaseIdentity,
  input: { academyId: string; membershipId?: string; classId?: string },
): Promise<PointsScope>
```

When `input.membershipId` is present, resolve it as a subject: an `ACTIVE`
`STUDENT` membership **in this academy**, taking `academyDisplayName` then the
account's `displayName`, falling back to an em dash — the same `displayNameOf`
chain, so the console prints the name the academy itself uses and never an
email, a username, or an id (§17). Absent or unresolvable, the scope keeps
today's blank and today's behaviour, so the board callers are untouched.

Three properties this must preserve:

- **`isSelf` stays false.** An operator holds no membership, is on no ranking,
  and must never light a row as *you*. The subject is somebody else by
  construction here, which is a stronger guarantee than the membership path's.
- **A student in another academy is not found.** The lookup is scoped by
  `academyId`, so an operator cannot read a child through the wrong tenant's
  route — and a membership that exists elsewhere answers exactly as one that
  does not exist, which is what stops the error being used to test ids.
- **The refusal is `POINTS_ACCESS_DENIED` / `NOT_FOUND`**, the same answer
  `requireReadableStudent` gives, so the console's page and the studio's page
  fail identically. §2.8's page turns that into `notFound()`, as the manager's
  does.

`scope.classes` stays the academy's full active list, which is what makes the
ledger's class selection work for an operator the way enrolment-derived classes
work for a student.

This is also why the ledger inherits its authority correctly: `platformScope`'s
first act is still `requirePermission(…, "academy.read")` through
`AcademyAccessService`, which means `platform.academies.inspect` — the wide,
deliberately-named permission — gates reading a child's ledger, while §4.4's
`platform.analytics.read` gates only the aggregate table. The two stay apart.

---

## 5. The web

```
packages/web/src/app/(platform)/admin/
  ranking/
    page.tsx                       server-renders the first page
    _components/
      ranking-table.tsx            DataTable, manual mode, summary strip
      ranking-summary.tsx          the four tiles
      ranking-board.tsx            ClassLeaderboard + its own query
  academies/[academySlug]/points/students/[membershipId]/
    page.tsx                       the ledger, mounted in the console  §2.8
  _lib/
    ranking-query.ts               parse / serialize / path  (+ .spec.ts)
    back-target.ts                 one allowlist entry added       §5.5
  _hooks/
    use-platform-ranking.ts        list state + query, board query
  _components/platform-sidebar.tsx  one row added
```

### 5.1 The page

`page.tsx` parses `searchParams` with `parseRankingQuery`, fetches page one
through `createPlatformServerORPCClient()` — the non-view-role-forwarding
client, matching the console's own client — and hands it to `RankingTable`
keyed by `serializeRankingQuery(query)`, so a filtered address renders its
filtered page directly and only a *change* costs a round trip.

Its failure branch tells the two cases apart the way every other console list
does: `isAccessDeniedError` for a genuine permission answer, otherwise the
server not answering. Reporting a connection fault as "you do not have
permission" sends an operator hunting for a role they already hold.

The board's vocabulary arrives through `PlatformShell`'s `namespaces` prop:

```tsx
<PlatformShell bleed namespaces={['points']} …>
```

Not a nested `PageTranslationsProvider`. `PlatformShell`'s own documentation
says why: `useTranslation` resolves to the nearest i18next instance, and a
nested one holds only what it was given — every console namespace beneath it
stops resolving and falls back to that instance's `defaultNS`, rendering
another page's copy under this page's keys.

### 5.2 The table

`DataTable` in manual mode, which is what `DataTableManualMode` exists for: the
server sorted, filtered and sliced, so the browser's row models must not run
over the page it was handed. `singleSort` keeps the header from claiming a
two-column order the server does not honour. `facetSelection` /
`withFacetSelection` carry the academy facet, whose selection is not backed by
a rendered column.

Columns: Academy (name over slug, as the content table draws it), Class,
Teacher (`max-xl:hidden`, `meta.hideable`), Students, Earning, Points, Solved,
State. Points and the counts are `meta: { align: 'right' }` — an operator
comparing figures down a column needs the digits to line up, which is what that
meta field is for.

Row click selects; `rowClassName` marks the selected row with the brand tint
and inset rail the board already uses for "your row", because it is the same
statement — *this is the one you are looking at*.

### 5.3 The board

`RankingBoard` is thin on purpose, and — corrected during implementation — it
does **not** wrap the board in a `Panel`. `ClassLeaderboard` *is* a panel: it
renders its own header, trophy, participant count and period. Wrapping it
produced two nested cards titled the same thing, which is exactly what the
manager's own page avoids by rendering it bare. The only chrome around it is a
line naming the open class and a Close control, because that question is
answered by a picker on the manager's page and by a table row here.

The query:

```tsx
const result = useQuery({
  queryKey: ['platform-class-board', academyId, classId, period],
  queryFn: () => orpc.points.getClassBoard({ academyId, classId, period }),
  placeholderData: keepPreviousData,
  staleTime: 30_000,
});
```

and renders `<ClassLeaderboard board={…} hideClassFilter … rowAction={…} />`
with `onSelectClass` / `onSelectPeriod` wired back into the page's query state.
`hideClassFilter` because the table above has already chosen the class, and the
same control twice on one screen is how two controls end up disagreeing.

`rowAction` is the manager's "Points" link, pointed at the console's own mount
of the student ledger (§2.8) and carrying the ranking page's current address as
`from`:

```tsx
href={`/admin/academies/${row.academySlug}/points/students/${row.membershipId}`
      + `?from=${encodeURIComponent(path)}`}
```

`academySlug` comes off the selected class's row, which already carries it —
the board's rows do not, and asking `points.getClassBoard` to grow a slug for
one link's sake would put a routing detail on a schema that also renders for
children.

The `POINTS_UNAVAILABLE` refusal (an academy whose `STUDENT_POINTS` flag went
off between the list and the click) is caught and rendered as the same
explanation the `points_off` state gives, not as an error card.

### 5.4 The ledger page

Twenty-odd lines, and deliberately no more:

```tsx
const { academySlug, membershipId } = await params;
const { academyId } = await requirePlatformAcademyRoute(academySlug);

let page: PointsPage | null = null;
try {
  page = await createPlatformServerORPCClient().points.getPage({
    academyId,
    membershipId,
  });
} catch {
  notFound();
}
if (!page) notFound();
```

then `<StudentPointsLedger academyId membershipId page />` inside
`PlatformShell`, with `namespaces={['points']}` and a `BackLink` from
`consoleBackTarget`.

Denial and absence collapse to the same `notFound()`, exactly as the studio
page does it: an operator must not be able to tell a student who does not exist
from one they may not read, or the 404 becomes an id oracle.

The heading is `page.subjectName` — the name the academy calls the child, which
is the whole reason §4.5 has to resolve a subject before this page can exist.

### 5.5 One allowlist entry in `back-target.ts`

`consoleBackTarget` accepts `from` only when it matches
`/^\/admin\/content\/(courses|classes)(\?[^#]*)?$/`, because `from` is
attacker-controllable text in a URL and "send the user wherever this says" is an
open redirect. Its own documentation asks the next surface to widen the list
*deliberately*, which is what this does: `/admin/ranking` joins the pattern, and
the `labels` parameter widens from `Record<ContentLens, string>` to a small
union `ConsoleBackPage = ContentLens | 'ranking'`.

The safety property is unchanged — `//evil.example`, `https://evil.example` and
`/admin/../..` all still fail the anchored prefix test.

### 5.6 Copy

New namespace `platform-ranking`, added to `platformNamespaces` — the same
choice `platform-invitations` made, and for the same reason: it is console copy
and a student's RSC payload must not carry it. `points` is *not* added to that
list; it is mounted per-route by the two pages that need it — the ranking page
and the ledger — through `PlatformShell`'s `namespaces` prop, because it is a
large namespace and the console's other seven pages have no board on them.

`platform.json` gains `nav.ranking`. Both locales, `en` and `ko`, and the
`locales.spec.ts` per-namespace budget (15KB) has ample room for a namespace
this size.

---

## 6. What is deliberately absent

- **A platform-wide student ranking.** §1.4. There is no field in the contract
  for one and no query that could serve one.
- **The top student's name on the table.** §2.3, and the permission split in
  §4.4 is what enforces it.
- **A stored or cached standing.** Every figure is recomputed per request, as
  the board's are. §10.2 requires that a position expire; the guarantee is
  having nowhere to keep one.
- **Awarding, voiding, or any write.** The contract is one read. Points are
  written only by the transaction that recorded the fact they describe — §5.2
  of the student points design — and no console page is going to be the first
  exception.
- **The manager's own `points` page.** The third route in §2.8's table is the
  *reader's* points page — a season plate, a gap to chase, and their own
  ledger, all in the second person. An operator holds no membership, sits on no
  ranking, and has no points, so a console copy would print a plate about
  nobody. It is the one manager surface deliberately not carried across, and
  §4.5's blank-subject branch is what it would have rendered.
- **A CSV export.** The users directory has one because an operator is asked
  for a member list; nobody has been asked for a spreadsheet of class point
  totals. It would be a small addition later off the same aggregate.

---

## 7. Settled: the ledger is mounted in the console

An earlier draft left this open — whether the board's per-student "Points" link
should leave the console for the studio route, or be mounted under `/admin/…`.
**It is mounted in the console.**

- It is the console's own rule. Every Open link on the content pages stays
  inside it, and the class and course editors are already mounted at
  `/admin/academies/[academySlug]/…` for exactly this reason.
- Leaving would drop the operator into the customer's studio chrome —
  a different rail, a different header, an academy switcher for an academy they
  are not a member of — mid-question, with only the browser's Back to return.
- The cost is one thin server component (§5.4) and one allowlist entry (§5.5).
  The ledger component, its query, and its rules panel are reused unchanged.

What that decision *did* surface is the real work: §4.5. The page cannot be
mounted until `platformScope` resolves a subject, and no front-end choice would
have avoided that.

---

## 8. Failure and empty states

| Condition | What the page shows |
|---|---|
| List call refused | The console's forbidden card, `isAccessDeniedError` |
| List call failed | The console's unavailable card — distinct copy, so a connection fault is never reported as a permission answer |
| No academies match the facet | Empty state naming the facet, with a reset |
| No class selected | The table alone; the board's slot is absent, not an empty panel |
| Board query failed | The board's own `UNAVAILABLE` state — the table above stays readable, which is the §12.3 rule: a failing aggregate takes down the board, never the page |
| Ledger refused, or the student does not exist | `notFound()` for both, as the studio page does — an operator must not be able to tell the two apart |
| Ledger's own ledger section failed | `points.getPage` already returns `ledger: null` on a failed read rather than an empty page; a service outage can never render as "this child earned nothing" |
| `truncated` | A line above the table asking the operator to narrow by academy, naming the cap |

---

## 9. Testing

**Shared** (`ranking.spec.ts`): the input schema's defaults and clamps; that
`points_off` serializes `points: null` and not `0`.

**API** (`platform-ranking.service.spec.ts`), the cases that carry the design:

1. Two academies in different timezones get two period windows, and a row's
   total matches the window of *its* academy.
2. A voided award is excluded from `points` and from `earningStudents`.
3. `STUDENT_POINTS` off → `state: "points_off"`, `points: null`, and the class
   still appears.
4. `STUDENT_CLASS_LEADERBOARD` off → `state: "board_off"` with real totals.
5. Sorting by points orders the *whole* set: page 2 of a points-sorted list
   holds rows strictly below every row on page 1.
6. Ties break on `classId`, so no row appears on two pages.
7. A suspended academy's classes are absent.
8. The permission is required — `platform.analytics.read`.
9. A class's `students` equals what `LeaderboardRepository.roster` would count
   for it, which is the promise that the table and the board agree.

**API** (`points-access.service.spec.ts`), for §4.5 — these are the cases that
keep the ledger honest, and the third is the one that would otherwise be a
silent tenant leak:

10. An operator calling `resolve({ academyId, membershipId })` gets that
    student's `membershipId` and their academy display name, not a blank.
11. `isSelf` is false, and no board row comes back marked `isYou`.
12. A `membershipId` belonging to **another academy** is refused, with the same
    answer an absent id gets.
13. A membership that is not an `ACTIVE` `STUDENT` is refused.
14. `resolveClassBoard` and `resolveOverviewBoard` are unchanged — still a
    blank subject, still `isSelf: false`. A regression here would put `isYou`
    on a child's row on somebody else's screen, so it is asserted rather than
    assumed.
15. `points.getPage` for an operator returns a `subjectName` that satisfies
    `labelSchema`, and a ledger with the student's rows in it.

**Web** (`ranking-query.spec.ts`): defaults omitted from the serialized URL;
an unparseable address falls back to a page rather than an error; narrowing a
filter resets to page 1.

**Web** (`back-target.spec.ts`, which exists): `/admin/ranking` and
`/admin/ranking?sort=points` resolve; `//evil.example`,
`https://evil.example/admin/ranking` and `/admin/../..` still do not.

**E2E**: an operator opens `/admin/ranking`, sorts by points, filters to one
academy, selects a class, reads the board — asserting the board's participant
count equals the row's Students figure — then opens a student's Points link and
lands on their ledger with their name in the heading, and Back returns to the
ranking with its filters intact.

---

## 10. Implementation order

1. **`platformScope` resolves a subject** (§4.5) + its specs. First, because
   it is the only change to existing code, it is independently verifiable, and
   everything in §2.8 is blocked on it.
2. `packages/shared/src/platform/ranking.ts` + contract + registrations, and
   `pnpm --filter @cove/shared build`.
3. `PlatformRankingService` + router + module/deps wiring, with its spec.
4. `ranking-query.ts` + spec (pure, and the server needs it before the page).
5. `use-platform-ranking.ts`, `ranking-summary.tsx`, `ranking-table.tsx`.
6. `ranking-board.tsx`.
7. The ledger route (§5.4) and the `back-target.ts` allowlist entry (§5.5).
8. `page.tsx`, the sidebar row, `platform-ranking.json` (en + ko),
   `platformNamespaces`, `nav.ranking`.
9. `pnpm typecheck`, then the e2e.

Steps 1–3 are the API and stand alone; 4–8 are the web and can be reviewed as
one change. Step 1 is worth landing on its own regardless of the rest — it is a
latent defect on a path an operator can already reach through the contract.
