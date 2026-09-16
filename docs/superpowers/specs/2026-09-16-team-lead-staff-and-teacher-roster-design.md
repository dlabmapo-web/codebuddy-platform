# Team Lead rosters, the teacher's student roster, and shared detail pages

Date: 2026-09-16
Status: **Implemented.** Revised during implementation — see §11 for every
decision that changed and why.

## 1. Purpose and scope

Three groups of change, all of them about letting a role read people it cannot
read today.

**Part A — Team Lead rosters.** A Team Lead can open both the Students page and
the Teachers page. Both pages, their tables, and every column already exist;
what does not exist is their permission to load them, and the rule for which
columns they are answered with.

**Part B — the teacher's student roster.** A teacher gets their own Students
page — identity and standing for the students in their classes — beside the
Student analytics table they have now.

**Part C — two detail pages.** One student detail page and one staff detail
page, each serving several roles with sections built from the viewer's
authority. These are new: the only per-member page before this was the
manager's editor, which none of these roles may use.

Related designs, whose decisions this extends rather than revisits:

- [Manager Students & Staff pages](2026-09-11-manager-students-staff-and-password-design.md)
  — the roster contracts, the `people-where` predicate, the meaning of "ID".
- [All-time ranking and the no-class floor](2026-09-07-all-time-ranking-and-no-class-floor-design.md)
  — periods, and what a ranking may claim.

### 1.1 The rule that shapes everything here

`studentAcademyProfileSchema` states it:

> Guardian and emergency details are academy-private: self, active managers, and
> nothing else. A teacher does not receive them merely because they teach the
> class.

**This rule stands.** It is the reason a Team Lead's student table is not
byte-identical to a Manager's, and the reason two of the three detail views omit
a section rather than render it empty. Every widening below is a widening of
identity, assignment, and standing — never of guardian or emergency contact.

### 1.2 Non-goals

- No change to who may read guardian or emergency contact details.
- No new scoring concept. Part B ranks on points the platform already computes.
- No editing anywhere outside the manager's existing editor. Nothing here
  awards or adjusts points, changes a role, or issues a password.
- No change to `requireManager`. See §3.1.

## 2. Findings from the current code

### Rosters

- `staff-roster.tsx` renders avatar, name, ID, roles, academy title, classes
  (homeroom and assistant, separately), phone, status, employee number, joined,
  and a row action. `student-roster.tsx` renders avatar, name, ID, classes,
  points, guardian, status, joined, and a row action.
- Both pages gated on `canManageAcademy(roles)` — `roles.includes('MANAGER')`,
  a role test rather than a permission test.
- `PeopleRosterService.listStudents` and `.listStaff` both called
  `scopes.requireManager(identity, academyId, "academy.members.manage")`.
- `ManagerScopeService.requireManager` checks the permission **and then**
  rejects any actor whose role is not `MANAGER`, with a comment stating the
  explicit conjunction exists so a later widening of a permission Team Leads
  hold cannot quietly hand the surface to another role. That guard works as
  designed and must not be loosened.
- `teamLeadPermissions` holds `academy.members.read`. It does not hold
  `academy.members.manage`, grouped under "administration of the academy itself,
  which a Team Lead does not get".
- **`TEACHER` also holds `academy.members.read`** — it is what lets a teacher
  see the names of the students they teach. This is the single most
  consequential finding in this document; §3.5 is built around it.
- Both row actions linked to `routes.academyPerson(...)` — `/people/[membershipId]` —
  which is itself `canManageAcademy`-gated.
- `studio-sidebar.tsx` built the whole `people` group inside one
  `if (canManageAcademy)`.

### The existing per-member page

- `/people/[membershipId]` is an **editor**: `MemberProfileEditor`,
  `MemberRolesPanel`, and `StudentPasswordPanel`. It is served by
  `academyProfile.getForManager` → `resolveManaged`.
- There was no read-only member view anywhere, and no per-student page on the
  teacher side.

### Teacher students and points

- `/teach/students` was the Student analytics table, served by
  `academyTeacherStudents.list` → `TeacherStudentsService.list`.
- `TeacherOverviewAccessService.requireScope` bounds a teacher to assigned
  classes and is the single authorization unit for that page.
- `taughtByWhere` is the predicate for "a class taught by this membership" and
  covers **both** the homeroom column and `assistantTeachers`. Its own comment
  warns that a caller remembering only `assignedTeacher` will go on refusing
  assistants after the other is fixed.
- `rankEntries` assigns competition positions (ties share, next skips) ordering
  on points, then solved problems, then active days.
- A board is **period-scoped**. `PointsService` returns
  `eligible: false, reason: "NO_ACTIVITY_YET"` when nobody in the class earned
  anything in the period.
- `StudentPointBalance` holds one row per membership with `earnedTotal` — a
  lifetime, academy-wide total, already read by the platform participation
  surface.
- `TeacherOverviewRepository.workByStudent` defines what "solved" means for
  every teaching surface: a distinct problem with at least one counted passing
  attempt, against the live material relation, at the current grading revision.
- `StudentExerciseProgress` is keyed on user and material and has **no academy
  column**. Counting it directly is therefore cross-academy, and its notion of
  solved is not `workByStudent`'s.
- Points are per-academy: `STUDENT_POINTS`.
- `/points/students/[membershipId]` already serves "their teacher, team lead, or
  manager".

## 3. Part A — the two academy rosters

### 3.1 Authorization

Both roster reads move from a role test to a permission test, with the row
shaped by the caller's authority.

- `listStudents` and `listStaff` require **`academy.members.read`**.
- Both obtain their actor through `ManagerScopeService.requireMemberReader`, a
  sibling of `requireManager` with the same shape: check the permission, then
  assert the role is one of an **explicit list** — `MANAGER` or `TEAM_LEAD`.
  Reproducing the conjunction is the point; dropping it is what the original
  comment warns against.
- The role test reads the **effective role set** (`actor.roles`), not the
  membership's own `role` column. `academy.members.read` was itself decided on
  that set, as is `canManageMembers` below and the web gate in §3.5; asking the
  column here would admit and refuse people by a different rule than the three
  around it. A Teacher carrying Team Lead as an extra role is a Team Lead.
- `canManageMembers` is answered from the roles already in hand
  (`rolesHavePermission`), not by a second `requirePermission` — that would be a
  second user read and a second membership read to learn what the first call
  resolved.
- `requireManager` is not modified. Every other manager surface keeps its valve.

A Student or Teacher calling either procedure is refused exactly as before.

### 3.2 Contract changes

In `staff-roster.ts`, `email`, `contactPhone` and `employeeNumber` become
**optional**. In `student-roster.ts`, `guardianName` and `guardianPhone` become
**optional**. Both page schemas gain:

```ts
viewer: z.object({ canManageMembers: z.boolean() }).strict(),
```

Optional rather than nulled is the whole point. `null` in these contracts
already means *no value is recorded*. A Team Lead sent `guardianPhone: null` is
being told the academy holds no guardian number for this child, which is false,
and the table would print it as an em dash. Absent means *not yours to read*,
and the table can tell the two apart.

`viewer` sits on the page, not the row: it describes the reader, and repeating
it per row would invite a row-level reading it does not have.

The student roster also gains **points**:

```ts
// on the row
points: z.number().int().nonnegative().optional(),
// on the page
pointsEnabled: z.boolean(),
```

`points` is `StudentPointBalance.earnedTotal` — lifetime, academy-wide. A column
is read downwards, so a number meaning something different row to row could not
be. Absent, never zero, when the academy keeps no score: zero is a real total a
child can have. `pointsEnabled` sits on the page rather than being inferred from
the rows, because a filter matching nobody returns no rows and a table deciding
from them would drop the column on an empty search and restore it on the next.

The School column was removed from the student roster. Where a child goes to
school is an admissions record; it is written and read on the manager's editor,
and it answered nothing an office opens this table for.

### 3.3 Service

Both list methods narrow their Prisma `select` when `canManageMembers` is false,
so withheld columns are never read out of the database. Suppressing them during
serialisation would be enough for correctness and not enough for the property
worth having: data a reader may not see should not travel.

`email` is the one exception, and it is selected for every reader because
`displayNameOf` falls back to it when a member has no name and no username. It
is emitted only to a reader who may manage members.

Point totals are one grouped read of the balance table per page, not a sum over
the ledger per row.

Facets, paging, sorting and search are unchanged.

### 3.4 Tables

Both tables build their column list from `page.viewer.canManageMembers`. When
false:

- Teachers drops `phone` and `employeeNumber`.
- Students drops `guardian`.

Points is built only when `page.pointsEnabled`. Neither table drops `actions` —
see §5.1. Column visibility state derives from the columns actually built, so a
withheld column cannot be restored from a stale preference.

### 3.5 Web gate and sidebar

```ts
export function canReadAcademyMembers(roles: readonly AcademyRole[]): boolean {
  return (
    rolesHavePermission(roles, 'academy.members.read') &&
    (roles.includes('MANAGER') || roles.includes('TEAM_LEAD'))
  );
}
```

**The role half is not optional, and this is the correction that matters most in
this document.** The original design specified a permission test alone, on the
belief that only Managers and Team Leads hold `academy.members.read`. A Teacher
holds it too (§2). A gate testing only the permission therefore drew both links
in a teacher's rail and sent them to a page whose service then answered "You are
not an active manager of this academy."

The gate restates `requireMemberReader`'s rule deliberately, twice. The two
lists are short enough to compare by eye, and a gate that quietly admits more
than the read behind it is the failure this shape exists to prevent.

`canManageAcademy` stays the role test it is, for surfaces that genuinely mean
Manager. `students/page.tsx` and `staff/page.tsx` gate on the new helper.

In the rail, Students and Teachers sit in the People group for a Manager or a
Team Lead; Members and Invitations stay Manager-only. A **Teacher** gets one
People entry instead — their own Students page (§4).

### 3.6 Scope decision — *reversed*

**Teachers only, not all staff.** The original design argued for one all-staff
page narrowed by a role facet, on the grounds that a teachers-only route would
be a second table of the same memberships. That was overruled during
implementation: the page is about teaching.

`teachersOnly(query)` pins `roles: ['TEACHER']` at the **fetch**, not in the
address — a hand-edited `?role=MANAGER` is overridden rather than honoured,
because the heading says Teachers and a list that disagreed with its own heading
would be the more confusing answer. The role facet is gone: a filter over one
value filters nothing. The Roles column stays, so a director who also teaches is
listed here for the teaching they do, wearing every role they hold.

The contract is untouched. `academyPeople.staff` still reads all staff, and the
Members directory still uses it — what narrowed is the page, not the read. A
Manager who needs the full picture of who holds what reads Members, which was
always the surface about roles.

## 4. Part B — the teacher's Students page

### 4.1 Two routes, not two views — *revised*

The original design put both tables on `/teach/students` behind a `view`
parameter. That is reversed. They are separate routes:

```
/teach/students    the teacher's Students list
/teach/analytics   Student analytics
```

Two reasons, and the second is decisive. They ask different questions — "who do
I teach and where do they stand" against "who needs me this week", measured over
a period and narrowed by a lecture — and they carry different controls. And a
nav highlight is decided on the **path**: one path cannot be two rail entries,
so under the original design neither could ever be marked current.

There is no view switch. Each route is reached from its own rail entry. The
analytics components did not move; a route is a URL and a read.

`parseStudentsQuery` no longer carries `view`. `studentsPath` takes the
caller's own `pathname` rather than naming a route, because both pages share
that state hook and a base spelled out in the shared file rewrote one page's
address into the other's the moment a filter changed.

### 4.2 Contract (`packages/shared/src/content/teacher-roster.ts`)

```ts
teacherRosterStudentSchema = {
  membershipId, displayName, username, joinedAt, avatar,
  points?,          // absent when the academy runs no points
  position?,        // absent when the class has no ranked board
  solvedProblems,
}

teacherRosterClassSchema = {
  classId, name,
  students: teacherRosterStudentSchema[],
  board?: { ranked: true } | { ranked: false, reason: LeaderboardIneligibleReason },
}

teacherRosterSchema = {
  classes, classOptions, pointsEnabled, truncated, generatedAt,
}
```

`points` and `position` are optional for the reason §3.2 gives: a student with
no rank is not a student ranked last, and `0` would say the second thing.

`board` is **optional**, absent when the academy runs no points at all. Every
reason the union carries is a statement about a board, and an academy that keeps
no score has none for `NO_ACTIVITY_YET` to be false about — sending it would be
a claim about the students rather than about a feature nobody switched on.

`solvedProblems` comes from `TeacherOverviewRepository.workByStudent` at a
period with no start — the unit `student-facts` measures with, so the count
beside a name here and the same name in Analytics cannot disagree. Counting
`StudentExerciseProgress` directly was the first implementation and was wrong
twice: no academy column, and a different definition of solved.

### 4.3 API

`academyTeacherStudents.roster` beside `.list`, served by `TeacherRosterService`,
resolving its scope through the **same** `TeacherOverviewAccessService.requireScope`.
"Which students may this teacher see" is one question and stays one unit.

Standing comes from the existing leaderboard computation, per class, at the
**all-time** period. All-time is the only period for which "total score" is a
true description.

Every class's board is read in one `Promise.all`, not serially in a loop — ten
classes was thirty round trips to draw one page.

### 4.4 Grouping, order and the table — *revised*

The contract groups by class, because a board is per class and a standing
belongs to the cohort it was won in.

The **table flattens those groups into one row per seat**. A student in two of
this teacher's classes is two rows, because they have two standings; a single
row would have to pick one or invent a third. The Class column carries which is
which, and sorting or filtering by it is how a teacher with several classes
reads the table one class at a time.

It is the studio's `DataTable`, in client mode: the same search box, sortable
headers, column menu, faceted filters, pagination and page-size control as every
other table in the product. The roster arrives whole, so there is no page to
turn on the server and no order the server has to agree with. The original
design's `rosterSort`/`rosterDirection` URL parameters and its
`compareRosterStudents` helper were therefore never needed and have been
removed.

None of the analytics scope controls appear here.

### 4.5 When there is no standing

| State | Contract | Table |
|---|---|---|
| Academy has no points | `pointsEnabled: false`, `board` absent | Points and Position columns not built. Solved remains. |
| Class board not ranked | `board.ranked: false` with a reason | Students carry no position; the reason names why. |
| Board read failed | `board.ranked: false, reason: "UNAVAILABLE"` | The roster renders; that one class loses its standing. |
| Student has no standing | `points`/`position` absent | An em dash — not a zero, not last place. |

The `UNAVAILABLE` branch is reached by a `catch` around each class's board read.
Without it the throw escaped and cost the teacher the page rather than two
columns in one class.

### 4.6 Paging

The read returns every student in the teacher's assigned classes up to a hard
cap of **500**; past the cap the response sets `truncated: true`.

`truncated` is true only when a student was actually **dropped**. Reaching
exactly the cap drops nobody, and a roster of precisely 500 is complete. A class
the cap never reached is left out of the response rather than returned empty: the
section heading carries a student count, and "0 students" is a claim about the
class, where the true claim is that the roster stopped before reaching it.

The browser pages the flattened rows.

### 4.7 Row links

The row's button opens the student detail page (§5.2). The name is not a second
link; one row, one destination.

## 5. Part C — the detail pages

### 5.1 Where the row actions go

Every roster's row action — Students, Teachers, and the teacher's own Students —
points at one of these two pages, for **every** role, through one
`ProfileLinkCell`. The manager's action destination therefore changed: it opens
the detail page, which carries an Edit link to `/people/[membershipId]` for those
who may edit.

The cell is a brand-tinted square that fills on hover, and its glyph is an arrow
out rather than a pencil: every one of these opens a read-only page, and a
pencil promised an edit the destination does not offer. The icon is not a
parameter — every roster in the studio means the same thing by this cell.

### 5.2 Student detail — `/academy/[slug]/students/[membershipId]`

**Authorization.** `academyPeople.student`:

- `MANAGER` and `TEAM_LEAD` through `requireMemberReader` (§3.1).
- `TEACHER` through `taughtByWhere` — homeroom **and** assistant, with the same
  active-membership and `TEACHER`-role predicates `assignedClassWhere` applies.
  An assistant sees these students on their roster, so a detail page that turned
  them away would be a row action that leads nowhere. Denial and absence are the
  same answer.

**Response.**

```ts
{
  identity: { membershipId, userId, displayName, username, status, joinedAt, avatar },
  courses:  { courseId, title, classNames[], activeSeconds }[],
  classes:  { id, name, teacherName, studentCount, courses[] }[],
  standing?: { classId, className, points, position? }[],
  work:     { solvedProblems, submissions, activeSeconds, lastActivityAt },
  guardian?: { …five fields },
  viewer:   { canManageMembers },
}
```

| Section | Manager | Team Lead | Teacher |
|---|---|---|---|
| identity | ✅ | ✅ | ✅ |
| courses | ✅ | ✅ | ✅ |
| classes | ✅ all | ✅ all | ✅ theirs only |
| standing | ✅ | ✅ | ✅ |
| work | ✅ | ✅ | ✅ |
| guardian | ✅ | ✗ | ✗ |
| Edit link | ✅ | ✗ | ✗ |

`guardian` is **absent**, not nulled, for the two roles that may not read it.
The guardian pair is now the only thing this page reads off `student_profiles`,
so for those readers the relation is not selected at all — an empty `select` is
not a narrower query, it is one Prisma refuses.

`work` is measured through `workByStudent` over an academy-wide aggregate scope
narrowed to this one student's seats, at a period with no start. `activeSeconds`
keeps its own already-academy-scoped projection.

`courses` are the visible courses assigned to the student's classes,
de-duplicated — two classes teaching Python is one course being studied — each
carrying the class names it is taught in and this student's counted time on it.
Learning time is the one measurement that is genuinely per course.

**Removed from the original design**: `school`, `studentNumber`, and
`expression` (coding interests and learning goal). All three are written and
read on the manager's editor, none answered a question these three readers open
this page with, and each rendered as a labelled em dash for most students.

**Links out.** The points ledger when points run; the class progress view; Edit
for managers.

The class progress link is drawn **only for a teacher**. Solution status is a
teaching surface bounded by assignment — a Manager or Team Lead may read every
class on this page and open none of them. The page knows which reader it has
because a reader who did not come from the academy roster was admitted by
teaching this student, and their class list is already filtered to their own.
A Manager who also teaches loses a link they could technically have followed;
that trade is deliberate, and the honest fix if it ever matters is a per-class
flag from the server.

### 5.3 Staff detail — `/academy/[slug]/staff/[membershipId]`

**Authorization.** `academyPeople.staffMember`, `MANAGER` and `TEAM_LEAD`
through `requireMemberReader`. Teachers have no access.

```ts
{
  identity, roles, academyTitle,
  classes: { homeroom: MemberClassRef[], assistant: MemberClassRef[] },
  contact?: { email, contactPhone, employeeNumber },
  viewer:  { canManageMembers },
}
```

`contact` is absent for a Team Lead, consistent with §3.4 — a field withheld in
the list is not recovered by opening the row.

`MemberClassRef` is shared with the student page: name, `studentCount`, and the
courses the class teaches. One shape, so the two pages cannot come to describe a
class differently. The page's eyebrow is the member's **highest role**, not the
word "Teacher": the list that links here is Teachers, but this page still
answers for a manager opened by link.

### 5.4 Presentation

Both pages are read-only, one column, in reading order. A rail down the right
split short blocks across two reading paths and left whichever ran shorter
trailing white space beside the other.

Colour carries facts or is not used:

- The hero band takes the member's own tone — a teacher is `peer` purple
  wherever the studio draws one, a student is `brand`.
- Section icons are solid plates in the section's subject tone.
- A class or course chip takes its identity from `courseAccent`, so the same
  class is the same colour here, on the other detail page, and on its course
  card.
- A standing takes gold, silver or bronze **only when it has been won** —
  `rankMarker`'s vocabulary, already used on the points surfaces. A student with
  no position gets no medal and no colour, because not being placed is a
  different fact from placing last.

Record cards are a three-up grid. The card's action is a sibling of its text
column, not inside it, so a long class name cannot push the button onto a second
line and leave three cards with their buttons at three different heights.

A section the viewer may not see renders nothing at all — no heading, no
placeholder, no lock icon. A page that advertises what it is withholding tells a
Team Lead which children have a guardian on file.

## 6. Internationalisation

- Part A renames the Staff page's copy to Teachers in both locales and drops the
  role-facet and student-number strings.
- Part B adds roster table strings to `teaching` and drops the view-switch and
  bespoke sort-control strings.
- Part C adds a `member-detail` namespace, mounted by the two detail routes
  only.
- The page-size control's label moved to `common`, which the studio layout
  always mounts. It previously read from `manager`, so on a teaching page it
  rendered as the literal key `people.page_size`.
- Both locales ship together. Dates and numbers use the existing formatters.

## 7. Error handling

| Failure | Answer |
|---|---|
| Team Lead loads a roster or detail page they may not | The route's existing refusal path. Denial and absence stay indistinguishable. |
| Roster read fails | Existing `RosterFailure` with retry. |
| Teacher roster read fails | Client retries and says what happened. |
| One class's board read fails | `board.ranked: false, reason: "UNAVAILABLE"`. The roster renders. |
| Detail page read fails | The route's not-found answer, not an empty profile. |
| Teacher opens a student they do not teach | Not found. |
| Teacher with no assigned classes | The existing not-found answer. |

## 8. Testing

**Unit (shared).** Optional-vs-null on both roster rows and both detail
responses; absent `points`/`position` surviving a round trip; a position of zero
refused.

**Unit (API).**

- `requireMemberReader` admits `MANAGER` and `TEAM_LEAD`, admits a `TEACHER`
  carrying Team Lead as an extra role, refuses a plain `TEACHER`, refuses a role
  holding the permission but not on the list, and asks the permission map once.
- `listStudents` omits guardian fields for a Team Lead, and the Prisma select
  does not request them; `listStaff` the same for contact fields.
- The points column carries a lifetime total when the academy keeps score, and
  is absent when it does not.
- `academyPeople.student` omits `guardian` for a Team Lead, and does not select
  `studentProfile` at all for them.
- An assistant teacher is admitted, not only the homeroom teacher.
- Work is measured over this academy through the analytics unit, at no start.
- Courses are de-duplicated across classes; classes carry their seat count.
- `TeacherRosterService`: a failing board costs one class its standing and not
  the page; the board is absent when the academy runs no points; a roster of
  exactly the cap is not truncated; past the cap the untouched classes are left
  out; solved problems are measured through the analytics unit.

**Unit (web).** `activeNavHref` matches a link carrying a query string, lets an
entry own a path it does not link to, and keeps the two teaching routes apart.
The rail gives a Team Lead the two academy rosters, a Teacher only their own
Students, and a Manager the directory as well. `routes` covers the four new
paths.

**Not covered.** `packages/web/vitest.config.ts` deliberately runs without a DOM
environment, so `DataTable`'s rendered paging — including the controlled
client-pagination path added for the page-size control — has no test. Adding
jsdom for it was judged out of scope; the behaviour was verified by hand.

**E2E.** Not yet written. The intended cases: a Team Lead opens Students and
Teachers, sees rows, finds no guardian and no phone column, opens a row into the
detail page, and finds no guardian section and no Edit link; a teacher opens
their Students page, asserts the Class column and a tie sharing a position, and
follows the row button into the student page.

## 9. Acceptance

1. A Team Lead opens `/staff` and `/students` and sees every member with avatar,
   name, ID, classes, status and joined. ✅
2. A Team Lead sees no guardian columns, no teacher phone, email or employee
   number, in lists or on detail pages. ✅
3. A Manager's lists are unchanged except where §3.6 and §3.2 changed them for
   everybody. ✅
4. A Teacher or Student calling either roster procedure is refused — **and is
   not shown the link**. ✅
5. Every manager surface other than the two rosters still runs through
   `requireManager` unchanged. ✅
6. A teacher opens their Students page and sees their students with name, ID,
   class, joined, solved, points and position. ✅
7. Equal standings share a position and the next position skips. ✅
8. A student with no standing shows an em dash, not zero and not last place. ✅
9. An academy without `STUDENT_POINTS` gets the roster with no points columns. ✅
10. Every roster row action opens a detail page its reader may view. ✅
11. A teacher opens a student they teach — including one they only assist — and
    is refused one they do not. ✅
12. A withheld section renders nothing — no heading, no placeholder. ✅
13. A Manager reaches the editor from the detail page's Edit link. ✅
14. Each teaching route marks its own rail entry current, and the member detail
    page marks the list that opened it. ✅

## 10. Delivery

Shipped as A → C → B, as designed: Part C reuses `requireMemberReader` from Part
A, and Part B's row button opens a page Part C builds.

## 11. What changed during implementation, and why

Each of these reverses or corrects something stated above. They are listed
because a design document that quietly agrees with whatever was built is worth
less than one that says where it was wrong.

1. **§3.5 — the web gate needed the role test too.** The design specified a
   permission test alone. `TEACHER` holds `academy.members.read`, so that gate
   showed a teacher two links into a page the service refused. The gate now
   restates `requireMemberReader`'s full rule.

2. **§3.1 — decide on effective roles, not the `role` column.** Reading the
   membership's own column would have admitted and refused people by a different
   rule than the permission check beside it and the web gate above it.

3. **§3.6 — reversed to teachers only.** The design argued for one all-staff
   page with a role facet. The product owner overruled it. Managers keep the
   full picture through Members.

4. **§4.1 — two routes, not one route with a `view` parameter.** A rail
   highlight is decided on the path, so one path could not be two entries.
   Sharing the route also meant the shared state hook rewrote the analytics
   page's address into the roster's.

5. **§4.4 — a flat `DataTable`, not bespoke class sections.** Asked for
   consistency with every other table in the product. This removed the
   `rosterSort`/`rosterDirection` URL state and `compareRosterStudents` entirely.

6. **§4.2 — `solvedProblems` and detail-page `work` had to come from
   `workByStudent`.** The first implementation counted `StudentExerciseProgress`,
   which has no academy column and a different definition of solved.

7. **§4.5 — `board` became optional, and `UNAVAILABLE` became reachable.** The
   first implementation claimed `NO_ACTIVITY_YET` for academies with no points,
   and let a failing board read escape and take the page down.

8. **§4.6 — `truncated` was off by one** and trailing classes were returned
   empty, which read as classes with no students.

9. **§5.2 — the teacher path had to use `taughtByWhere`.** The first
   implementation matched only the homeroom column, so an assistant teacher saw
   students on their roster and got a not-found opening one.

10. **§5.2 — `school`, `studentNumber` and `expression` removed; `courses`
    added.** Each of the three rendered as a labelled em dash for most students
    and answered nothing the page is opened for.

11. **§5.2 — the class progress link is teacher-only.** It is a teaching surface
    bounded by assignment; drawn for a Manager or Team Lead it was a button that
    answered with a not-found.

12. **Throughout — one visual vocabulary for "open this".** Row actions, record
    cards and page-level links were grey outlines indistinguishable from the
    furniture around them.
