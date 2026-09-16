# Team Lead staff roster access, and the teacher's student roster

Date: 2026-09-16
Status: Designed. Not implemented.

## 1. Purpose and scope

Two changes, independent of each other, both about letting a role read a roster
it cannot read today.

**Part A.** A Team Lead can open the Staff page and see who teaches in this
academy. The page, its table, and every column they need already exist; what
does not exist is their permission to load it.

**Part B.** A teacher gets a Roster view of their students — identity and
standing — beside the Student analytics table they have now. Name, ID, when the
student joined, their points, and their position in their class, grouped by
class, with a link into the ledger that explains the points.

Related designs, whose decisions this one extends rather than revisits:

- [Manager Students & Staff pages](2026-09-11-manager-students-staff-and-password-design.md)
  — the roster contracts, the `people-where` predicate, and the meaning of "ID".
- [All-time ranking and the no-class floor](2026-09-07-all-time-ranking-and-no-class-floor-design.md)
  — periods, and what a ranking is allowed to say.

### Non-goals

- The **Students** roster (`/academy/[slug]/students`) stays Manager-only. It
  carries guardian names and guardian phone numbers, and widening it is a
  larger decision than this design makes.
- No new scoring concept. Part B ranks on points, which the platform already
  computes; it does not invent a score.
- Nothing here awards, adjusts, or edits points, and nothing here lets a Team
  Lead change a staff member.
- No change to `requireManager`. See §3.1.

## 2. Findings from the current code

### Part A

- `staff-roster.tsx` already renders avatar, name, ID, roles, academy title,
  classes (homeroom and assistant, as separate lists), phone, status, employee
  number, joined, and a row action. Every column this design needs to show a
  Team Lead is built.
- `staff/page.tsx` gates on `canManageAcademy(roles)`, which is
  `roles.includes('MANAGER')` — not a permission check.
- `PeopleRosterService.listStaff` calls
  `scopes.requireManager(identity, academyId, "academy.members.manage")`.
- `ManagerScopeService.requireManager` checks the permission **and then**
  rejects any actor whose role is not `MANAGER`, with a comment stating that
  the explicit conjunction exists so a later widening of a permission Team
  Leads hold cannot quietly hand the surface to another role. That guard is
  working as designed and must not be loosened.
- `teamLeadPermissions` holds `academy.members.read`. It does not hold
  `academy.members.manage`, which is grouped under "administration of the
  academy itself, which a Team Lead does not get".
- The staff row's action column links to `routes.academyPerson(...)` —
  `/people/[membershipId]` — which is itself `canManageAcademy`-gated.
- `studio-sidebar.tsx` builds the whole `people` group inside one
  `if (canManageAcademy)`.

### Part B

- `/teach/students` exists as the Student analytics table
  (`student-analytics.tsx`), served by `academyTeacherStudents.list` →
  `TeacherStudentsService.list`.
- `TeacherStudentRow` carries `order`, `displayName`, `classes`, `courseScope`,
  `averageScore`, `attemptedProblems`, `solvedProblems`, `submissions`,
  `activeSeconds`, `activeDays`, `lastActivityAt`, `reasons`, and
  `primaryClassId`. It has **no** `username`, no `joinedAt`, and no points.
- `order` is rendered with `data-testid="student-current-rank"`, but it is an
  ordinal over the filtered result in the current sort — not a standing. The
  two must stay visibly distinct.
- The name cell already links to `solutionStatusPath(...)`.
- `TeacherOverviewAccessService.requireScope` bounds a teacher to their
  assigned classes and returns `students`, `classOptions`, and the selected
  scope. It is the single authorization unit for this page.
- `parseStudentsQuery` puts the page's entire state in the URL, parses totally,
  and drops anything unrecognised rather than refusing.
- Points: `rankEntries` assigns competition positions (ties share, next skips)
  ordering on points, then solved problems, then active days. `LeaderboardRow`
  is `{ position, displayName, avatar, points, solvedProblems, activeDays,
  breakdown, improved, isYou }`.
- A board is **period-scoped**. `PointsService` returns
  `eligible: false, reason: "NO_ACTIVITY_YET"` when no member of the class has
  earned anything in the period, and ranks the class otherwise.
  `TOO_FEW_STUDENTS` exists in `leaderboardIneligibleReasons` but no code path
  emits it today; this design does not add one.
- Points are a per-academy feature: `STUDENT_POINTS`, read in `studio-chrome.tsx`
  as `academyPointsEnabled(academyId)` or from the membership's `features`.
- `/points/students/[membershipId]` already serves "their teacher, team lead, or
  manager" and exists to answer *why does this student have these points*.

## 3. Part A — Team Lead staff roster

### 3.1 Authorization

The read moves from a role test to a permission test, and the row shape follows
the caller's authority.

- `listStaff` requires **`academy.members.read`**.
- It obtains its actor through a new `ManagerScopeService.requireMemberReader`,
  a sibling of `requireManager` with the same shape: check the permission, then
  assert the role is one of an **explicit list** — `MANAGER` or `TEAM_LEAD`.
  The explicit conjunction is the property worth keeping, so the new method
  reproduces it rather than dropping it.
- `requireManager` is not modified. Every other manager surface keeps its valve.
- The actor's authority to *manage* members is resolved once, in the service,
  and returned on the response as `viewer.canManageMembers`.

A Student or a Teacher reaching `academyPeople.staff` is refused exactly as
today.

### 3.2 Contract (`packages/shared/src/memberships/staff-roster.ts`)

`email`, `contactPhone`, and `employeeNumber` change from **nullable** to
**optional and nullable**, and `staffRosterPageSchema` gains:

```ts
viewer: z.object({ canManageMembers: z.boolean() }).strict(),
```

Optional rather than nulled is the whole point. `null` in this contract already
means *no value is recorded*. A Team Lead who is sent `contactPhone: null` is
being told the academy has no phone number for this teacher, which is a
falsehood the table would then print as an em dash. Absent means *not yours to
read*, and the table can tell the two apart.

`viewer` is on the page rather than on each row because it describes the reader,
not the member, and repeating it 25 times per response would invite a row-level
interpretation it does not have.

### 3.3 Service (`packages/api/src/manage/people-roster.service.ts`)

`listStaff` narrows its Prisma `select` when `canManageMembers` is false, so the
withheld columns are never read out of the database. Suppressing them during
serialisation would be enough for correctness and not enough for the property
worth having: data a reader may not see should not travel.

Facets, paging, sorting, and search are unchanged. Sorting by `employeeNumber`
is accepted from a Team Lead and produces a stable order on a field they cannot
see; this is harmless, and rejecting it would be a second authorization rule to
keep in step with the first.

### 3.4 Table (`staff-roster.tsx`)

The column list is built from `page.viewer.canManageMembers`. When false, the
`phone`, `employeeNumber`, and `actions` columns are not constructed at all —
not hidden, not disabled. `actions` goes because its only destination is
Manager-only and would 404.

Column visibility state (`data-table-state.ts`) must not resurrect a column
that was never built; the hideable-column set is derived from the columns
actually passed, so this follows from building the list conditionally.

### 3.5 Web gate and sidebar

- New helper in `academy-access-state.ts`:

  ```ts
  export function canReadAcademyMembers(roles: readonly AcademyRole[]): boolean {
    return rolesHavePermission(roles, 'academy.members.read');
  }
  ```

  This matches the existing shape of `canManageClasses` and
  `canReviewApplications`, which are permission-derived; `canManageAcademy`
  stays the role test it is, for the surfaces that genuinely mean "Manager".

- `staff/page.tsx` gates on `canReadAcademyMembers`. Every other page in the
  group is untouched.

- `studio-sidebar.tsx`: the Staff link moves out of the `if (canManageAcademy)`
  block into its own `if (canReadAcademyMembers)`. Members, Students, and
  Invitations stay Manager-only, so a Team Lead sees a People group containing
  Staff and — where they already qualify — Applications.

### 3.6 Scope decisions

- **All staff, not only teachers.** The page lists managers, team leads, and
  teachers, and its role facet already narrows to Teacher in one click. A second
  teachers-only route would be one more table of the same memberships.
- **Students roster unchanged.** Stated again here because it is the most likely
  next request, and because guardian contact details deserve their own decision.

## 4. Part B — the teacher's Roster view

### 4.1 Route and URL state

The view is a parameter on the existing route, not a new route:

```
/academy/[slug]/teach/students?view=roster
```

`StudentsQuery` gains `view: 'analytics' | 'roster'`, default `'analytics'`, so
existing links keep their meaning. Parsing stays total: an unknown value falls
back to `analytics` rather than refusing.

`classId` and `search` are shared by both views and survive the switch. The
analytics-only scope parameters (`courseId`, `moduleId`, `lectureId`,
`problemId`, `range`, `attention`) are preserved in the URL while in Roster view
but are not applied to it, so switching back restores the teacher's work.

`sort`/`direction` are **not** shared: the two views offer different columns, and
carrying `sort=score` into a table with no score column would be a dead
parameter. Roster view reads `rosterSort`/`rosterDirection`, defaulting to
position ascending.

### 4.2 Contract (new `packages/shared/src/content/teacher-roster.ts`)

```ts
teacherRosterStudentSchema = {
  membershipId: uuid,
  displayName: label,
  username: string | null,        // "ID", as the manager roster means it
  joinedAt: iso datetime | null,
  avatar: memberAvatarUrlsSchema, // reused, not redeclared
  points?: number,                // absent when the academy has no points
  position?: number,              // absent when the class has no board
  solvedProblems: number,
}

teacherRosterClassSchema = {
  classId: uuid,
  name: label,
  students: teacherRosterStudentSchema[],
  board: { ranked: true } | { ranked: false, reason: LeaderboardIneligibleReason },
}

teacherRosterSchema = {
  classes: teacherRosterClassSchema[],
  pointsEnabled: boolean,
  truncated: boolean,             // see §4.6
  generatedAt: iso datetime,
}
```

`points` and `position` are optional for the same reason §3.2 gives: a student
with no rank is not a student ranked last, and `0` would say the second thing.

`solvedProblems` is always present, and it comes from `student-facts` — the
same unit the analytics view measures with — not from the board. The board's
copy of it exists only as a tiebreak and only when points run, so sourcing it
there would make the column vanish in exactly the case it is there to cover.
Taking it from `student-facts` also means a solved count in Roster view and the
same count in Analytics view cannot disagree.

### 4.3 API

A new `academyTeacherStudents.roster` procedure beside `.list`, served by a new
`TeacherRosterService`.

It resolves its scope through the **same**
`TeacherOverviewAccessService.requireScope` the analytics list uses. "Which
students may this teacher see" is one question and stays one unit; two
resolutions of it would be two answers eventually.

Standing comes from the existing leaderboard computation, per class, at the
**all-time** period. All-time is the only period for which "total score" is a
true description — a weekly board answers a different question, and the ledger
the row links to can be read at any period the teacher chooses.

`improved` is deliberately not requested: `PointsService` does not compute a
rising marker for the all-time period, because there is no period before
everything.

### 4.4 Grouping and order

One section per class, classes ordered by name ascending.

Within a class, the default order is `position` ascending, which is points
descending with `rankEntries`' tie rule: equal standings share a position and
the next position skips. Students with no standing sort last, in name order.

A teacher with one class sees one section with its heading — not a special
ungrouped case. The heading carries the class name and the student count, and it
is where the answer to "which class is this" lives when the table is sorted by
name.

Name, ID, and joined are sortable; sorting replaces the within-class order and
never the grouping.

### 4.5 When there is no standing

Three distinct states, three distinct presentations:

| State | Contract | Table |
|---|---|---|
| Academy has no points | `pointsEnabled: false` | Points and Position columns are not built. Solved remains. |
| Class board not ranked | `board.ranked: false` with a reason | Columns exist for other classes; this section shows its students without position, and a short line naming the reason (`NO_ACTIVITY_YET` → "nobody has earned points yet"). |
| Student has no standing | `points`/`position` absent | An em dash, not a zero and not a last place. |

A board read that fails must take down the standing, not the roster. `UNAVAILABLE`
is a `board.ranked: false` reason like any other, so a failing aggregate costs
the teacher two columns in one class and not the page.

### 4.6 Paging

Roster view does not page. It returns every student in the teacher's assigned
classes, grouped, up to a hard cap of **500** students; past the cap the
response sets `truncated: true` and the table tells the teacher to narrow by
class.

This follows the scope the service already reasons about — its own comment says
assigned classes hold "hundreds of students, not millions" — and it is what lets
a class section carry a complete, honest ranking. Paging inside per-class
sections would be machinery serving a case a teacher does not have, and a
page-at-a-time ranking would renumber itself as the teacher turned pages.

The cap is a bound on the response, not a promise about academies. If a real
teacher ever trips it, that is the signal to page per class, and `truncated`
is what makes the trip visible instead of silent.

Analytics view keeps its existing paging, untouched.

### 4.7 Row links

- The **name** links to `solutionStatusPath(...)` — the student's work in that
  class — matching what the analytics view already does, so the same click means
  the same thing in both views.
- The **button** opens `routes.academyPointsStudent(slug, membershipId)`, the
  points ledger. It is the page that explains the two columns this view added,
  and it already admits teachers.

When `pointsEnabled` is false the button is not rendered: a ledger of a feature
the academy does not run has nothing to show.

## 5. Internationalisation

- Part A adds no keys. The three suppressed columns keep their existing
  `staff.column.*` keys for managers.
- Part B adds to the `teaching` namespace, which `/teach/students` already
  mounts: the view switch labels, the roster column headers
  (`roster.column.student`, `.id`, `.joined`, `.points`, `.position`,
  `.solved`), the class-section heading with its student count, the
  board-unavailable lines keyed by `LeaderboardIneligibleReason`, the truncation
  notice, and the row button's accessible label.
- Both locales ship together. Korean is the primary product language for these
  pages; `joinedAt` renders through the existing date formatting, and points
  through the existing number formatting, so neither introduces a new format.

## 6. Error handling

| Failure | Answer |
|---|---|
| Team Lead loads `/staff`, service refuses | The route's existing refusal path. Denial and absence stay indistinguishable. |
| Staff roster read fails | Existing `RosterFailure` with retry. Unchanged. |
| Teacher roster read fails | The client retries and says what happened, as the analytics view does. An empty roster and an unreachable one must not look alike. |
| One class's board read fails | `board.ranked: false, reason: "UNAVAILABLE"`. The roster renders. |
| `view=roster` on an academy without points | Renders, without the points columns and without the ledger button. |
| Teacher with no assigned classes | The existing not-found answer for this route. Unchanged. |

## 7. Testing

**Unit (shared).** Roster contract parsing: optional-vs-null on the staff row;
absent `points`/`position` surviving a round trip; the ordering rule including
ties sharing a position and students with no standing sorting last.

**Unit (API).**

- `requireMemberReader` admits `MANAGER` and `TEAM_LEAD`, refuses `TEACHER` and
  `STUDENT`, and refuses a member who holds `academy.members.read` without one
  of those roles — the explicit conjunction, tested as a rule and not as a
  consequence.
- `listStaff` omits `contactPhone`, `email`, and `employeeNumber` for a Team
  Lead, and the Prisma select does not request them.
- `listStaff` returns them for a Manager, with `viewer.canManageMembers: true`.
- `TeacherRosterService` scopes to assigned classes only; a second teacher's
  class never appears.
- All-time period is what the board is read at.
- A class with no activity yields `board.ranked: false` and students without
  positions, not students at position 1.
- With `STUDENT_POINTS` off, the response still carries every student and their
  `solvedProblems`, and carries no `points` or `position`.

**Component (web).** `staff-roster.tsx` builds no `actions`, `phone`, or
`employeeNumber` column when `canManageMembers` is false, and the hideable
column set matches.

**E2E.** Extend `e2e/specs/manager-people-rosters.spec.ts` with a Team Lead
opening `/staff`, seeing teachers, and finding no phone column and no row
action. Add a teacher Roster view case: switch views, assert class sections,
assert a tie shares a position, and follow the row button to the ledger.
Both need a seeded Team Lead and a seeded class with points.

## 8. Acceptance

1. A Team Lead opens `/staff` and sees every staff member with avatar, name, ID,
   roles, title, classes, status, and joined.
2. A Team Lead sees no phone, no email, no employee number, and no row action.
3. A Manager's `/staff` is unchanged in every column and behaviour.
4. A Teacher or Student calling `academyPeople.staff` is refused.
5. Every manager surface other than the staff roster still runs through
   `requireManager` unchanged.
6. A teacher opens `/teach/students?view=roster` and sees their students grouped
   by class, with name, ID, joined, points, position, and solved.
7. Equal standings share a position and the next position skips.
8. A student with no standing shows an em dash, not zero and not last place.
9. An academy without `STUDENT_POINTS` gets the roster with no points columns and
   no ledger button.
10. Switching to Roster and back preserves the teacher's analytics scope.
11. The row button opens that student's points ledger.

## 9. Delivery

Part A and Part B share no code and can land in either order, or in parallel.

**Part A**, in order: shared contract → `requireMemberReader` → `listStaff`
select and viewer → web gate and helper → table columns → sidebar → tests.

**Part B**, in order: shared contract → `TeacherRosterService` and the
`roster` procedure → `view` in `StudentsQuery` → the view switch → the roster
table with its class sections → empty and unranked states → tests.

Each part is one pull request into `feat/cove-studio-v2`.
