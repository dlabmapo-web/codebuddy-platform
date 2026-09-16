# Team Lead rosters, the teacher's student roster, and shared detail pages

Date: 2026-09-16
Status: Designed. Not implemented.

## 1. Purpose and scope

Three groups of change, all of them about letting a role read people it cannot
read today.

**Part A — Team Lead rosters.** A Team Lead can open both the Staff page and the
Students page. Both pages, their tables, and every column already exist; what
does not exist is their permission to load them, and the rule for which columns
they are answered with.

**Part B — the teacher's student roster.** A teacher gets a Roster view of their
students — identity and standing — beside the Student analytics table they have
now. Name, ID, joined, points, class position, grouped by class.

**Part C — two detail pages.** One student detail page and one staff detail
page, each serving several roles with sections built from the viewer's
authority. These are new: the only per-member page today is the manager's
editor, which none of these roles may use.

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
- Date of birth stays manager-only. It appears on no roster today, and nothing
  in Parts A–C needs it.

## 2. Findings from the current code

### Rosters

- `staff-roster.tsx` already renders avatar, name, ID, roles, academy title,
  classes (homeroom and assistant, separately), phone, status, employee number,
  joined, and a row action. `student-roster.tsx` already renders avatar, name,
  ID, student number, classes, school/grade, guardian, status, joined, and a row
  action.
- Both pages gate on `canManageAcademy(roles)` — `roles.includes('MANAGER')`,
  a role test rather than a permission test.
- `PeopleRosterService.listStudents` and `.listStaff` both call
  `scopes.requireManager(identity, academyId, "academy.members.manage")`.
- `ManagerScopeService.requireManager` checks the permission **and then**
  rejects any actor whose role is not `MANAGER`, with a comment stating the
  explicit conjunction exists so a later widening of a permission Team Leads
  hold cannot quietly hand the surface to another role. That guard works as
  designed and must not be loosened.
- `teamLeadPermissions` holds `academy.members.read`. It does not hold
  `academy.members.manage`, grouped under "administration of the academy itself,
  which a Team Lead does not get".
- Both row actions link to `routes.academyPerson(...)` — `/people/[membershipId]` —
  which is itself `canManageAcademy`-gated.
- `studio-sidebar.tsx` builds the whole `people` group inside one
  `if (canManageAcademy)`.

### The existing per-member page

- `/people/[membershipId]` is an **editor**: `MemberProfileEditor` (academy
  fields, student details, student expression read-only, staff fields),
  `MemberRolesPanel`, and `StudentPasswordPanel`. It is served by
  `academyProfile.getForManager` → `resolveManaged`.
- There is no read-only member view anywhere, and no per-student page on the
  teacher side. A teacher's student link today goes to
  `/teach/classes/[classId]/progress?student=…` — a class progress view filtered
  to one student.
- `studentAcademyProfileSchema` holds `dateOfBirth`, `schoolName`,
  `schoolGrade`, guardian and emergency fields, `codingInterests`,
  `learningGoal`, `studentNumber`.

### Teacher students and points

- `/teach/students` is the Student analytics table, served by
  `academyTeacherStudents.list` → `TeacherStudentsService.list`.
- `TeacherStudentRow` carries `order`, `displayName`, `classes`, `courseScope`,
  `averageScore`, `attemptedProblems`, `solvedProblems`, `submissions`,
  `activeSeconds`, `activeDays`, `lastActivityAt`, `reasons`, `primaryClassId`.
  It has **no** `username`, no `joinedAt`, no points.
- `order` renders with `data-testid="student-current-rank"` but is an ordinal
  over the filtered result in the current sort — not a standing. The two must
  stay visibly distinct.
- `TeacherOverviewAccessService.requireScope` bounds a teacher to assigned
  classes and is the single authorization unit for that page.
- `parseStudentsQuery` puts the page's whole state in the URL and parses
  totally, dropping anything unrecognised rather than refusing.
- `rankEntries` assigns competition positions (ties share, next skips) ordering
  on points, then solved problems, then active days.
- A board is **period-scoped**. `PointsService` returns
  `eligible: false, reason: "NO_ACTIVITY_YET"` when nobody in the class earned
  anything in the period. `TOO_FEW_STUDENTS` exists in
  `leaderboardIneligibleReasons` but no code path emits it today; this design
  does not add one.
- Points are per-academy: `STUDENT_POINTS`, read as `academyPointsEnabled(...)`
  or from the membership's `features`.
- `/points/students/[membershipId]` already serves "their teacher, team lead, or
  manager".

## 3. Part A — Team Lead rosters

### 3.1 Authorization

Both roster reads move from a role test to a permission test, with the row
shaped by the caller's authority.

- `listStudents` and `listStaff` require **`academy.members.read`**.
- Both obtain their actor through a new `ManagerScopeService.requireMemberReader`,
  a sibling of `requireManager` with the same shape: check the permission, then
  assert the role is one of an **explicit list** — `MANAGER` or `TEAM_LEAD`.
  Reproducing the conjunction is the point; dropping it is what the original
  comment warns against.
- `requireManager` is not modified. Every other manager surface keeps its valve.
- Authority to manage members is resolved once, in the service, and returned as
  `viewer.canManageMembers`.

A Student or Teacher calling either procedure is refused exactly as today.

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

### 3.3 Service

Both list methods narrow their Prisma `select` when `canManageMembers` is false,
so withheld columns are never read out of the database. Suppressing them during
serialisation would be enough for correctness and not enough for the property
worth having: data a reader may not see should not travel.

Facets, paging, sorting and search are unchanged. A sort on a withheld field is
accepted and produces a stable order the caller cannot see; refusing it would be
a second authorization rule to keep in step with the first.

### 3.4 Tables

Both tables build their column list from `page.viewer.canManageMembers`. When
false:

- Staff drops `phone` and `employeeNumber`.
- Students drops `guardian`.

Neither drops `actions` — see §5.1, which gives both row actions a destination
every reader may open. Column visibility state derives from the columns actually
built, so a withheld column cannot be restored from a stale preference.

### 3.5 Web gate and sidebar

New helper in `academy-access-state.ts`, matching the permission-derived shape
of `canManageClasses` and `canReviewApplications`:

```ts
export function canReadAcademyMembers(roles: readonly AcademyRole[]): boolean {
  return rolesHavePermission(roles, 'academy.members.read');
}
```

`canManageAcademy` stays the role test it is, for surfaces that genuinely mean
Manager. `students/page.tsx` and `staff/page.tsx` gate on the new helper.

In `studio-sidebar.tsx`, Students and Staff move out of the
`if (canManageAcademy)` block into `if (canReadAcademyMembers)`. Members and
Invitations stay Manager-only, so a Team Lead's People group holds Students,
Staff, and — where they already qualify — Applications.

### 3.6 Scope decision

**All staff, not only teachers.** The Staff page lists managers, team leads and
teachers, and its role facet narrows to Teacher in one click. A teachers-only
route would be a second table of the same memberships.

## 4. Part B — the teacher's Roster view

### 4.1 Route and URL state

A parameter on the existing route, not a new route:

```
/academy/[slug]/teach/students?view=roster
```

`StudentsQuery` gains `view: 'analytics' | 'roster'`, default `'analytics'`, so
existing links keep their meaning. Parsing stays total: an unknown value falls
back to `analytics`.

`classId` and `search` are shared and survive the switch. The analytics-only
scope parameters (`courseId`, `moduleId`, `lectureId`, `problemId`, `range`,
`attention`) are preserved in the URL while in Roster view but not applied, so
switching back restores the teacher's work.

`sort`/`direction` are **not** shared — the views offer different columns, and
`sort=score` in a table with no score column is a dead parameter. Roster view
reads `rosterSort`/`rosterDirection`, defaulting to position ascending.

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

`points` and `position` are optional for the reason §3.2 gives: a student with
no rank is not a student ranked last, and `0` would say the second thing.

`solvedProblems` is always present, and comes from `student-facts` — the same
unit the analytics view measures with — not from the board. The board's copy of
it exists only as a tiebreak and only when points run, so sourcing it there
would make the column vanish in exactly the case it covers. Taking it from
`student-facts` also means a solved count in Roster view and the same count in
Analytics view cannot disagree.

### 4.3 API

A new `academyTeacherStudents.roster` procedure beside `.list`, served by a new
`TeacherRosterService`, resolving its scope through the **same**
`TeacherOverviewAccessService.requireScope`. "Which students may this teacher
see" is one question and stays one unit; two resolutions would eventually be two
answers.

Standing comes from the existing leaderboard computation, per class, at the
**all-time** period. All-time is the only period for which "total score" is a
true description; a weekly board answers a different question, and the ledger
the detail page links to can be read at any period.

`improved` is deliberately not requested: no rising marker is computed for
all-time, because there is no period before everything.

### 4.4 Grouping and order

One section per class, classes by name ascending. Within a class, default order
is `position` ascending — points descending, with `rankEntries`' tie rule.
Students with no standing sort last, in name order.

A teacher with one class still sees a section heading, carrying the class name
and student count; it is where "which class is this" lives once the table is
sorted by name.

Name, ID and joined are sortable. Sorting replaces the within-class order and
never the grouping.

### 4.5 When there is no standing

| State | Contract | Table |
|---|---|---|
| Academy has no points | `pointsEnabled: false` | Points and Position columns not built. Solved remains. |
| Class board not ranked | `board.ranked: false` with a reason | Columns exist for other classes; this section shows students without positions and a short line naming the reason (`NO_ACTIVITY_YET` → "nobody has earned points yet"). |
| Student has no standing | `points`/`position` absent | An em dash — not a zero, not last place. |

A failing board read is `board.ranked: false, reason: "UNAVAILABLE"`, so it costs
the teacher two columns in one class rather than the page.

### 4.6 Paging

Roster view does not page. It returns every student in the teacher's assigned
classes, grouped, up to a hard cap of **500**; past the cap the response sets
`truncated: true` and the table asks the teacher to narrow by class.

This follows the scope the service already reasons about — its own comment says
assigned classes hold "hundreds of students, not millions" — and it is what lets
a class section carry a complete, honest ranking. Paging inside per-class
sections would serve a case teachers do not have, and a page-at-a-time ranking
would renumber itself as the teacher turned pages.

The cap bounds the response, not the product. If a real teacher trips it, that
is the signal to page per class, and `truncated` makes the trip visible rather
than silent.

Analytics view keeps its existing paging.

### 4.7 Row links

- The **name** links to `solutionStatusPath(...)` — the student's work in that
  class — matching the analytics view, so the same click means the same thing in
  both views.
- The **button** opens the student detail page, §5.2. This is the "visit student
  page" action; the points ledger is reached from there rather than being a
  third destination on the row.

## 5. Part C — the detail pages

Two new routes. Each serves several roles from one contract, with sections built
from the viewer's authority — so the fields a role may see are stated once.

### 5.1 Where the row actions go

Every roster's row action — Students, Staff, and the teacher's Roster — points
at one of these two pages, for every role. The manager's existing action
destination therefore **changes**: it opens the detail page, which carries an
Edit link to `/people/[membershipId]` for those who may edit.

This is a deliberate change to manager behaviour. The alternative — managers
keep going straight to the editor — leaves the new page's manager mode
unreachable and gives the academy two student pages, which is the drift this
design is shaped to avoid. The editor itself is untouched and one click further
away.

### 5.2 Student detail — `/academy/[slug]/students/[membershipId]`

**Authorization.** A new `academyPeople.student` read:

- `MANAGER` and `TEAM_LEAD` through `requireMemberReader` (§3.1).
- `TEACHER` through the assigned-class scope, so a teacher may open a student
  they teach and no other. Denial and absence are the same answer.

**Response.**

```ts
{
  identity: { membershipId, userId, displayName, username, studentNumber,
              status, joinedAt, avatar },
  school?:   { schoolName, schoolGrade },
  guardian?: { guardianName, guardianRelationship, guardianPhone,
               emergencyContactName, emergencyContactPhone },
  expression: { codingInterests, learningGoal },
  classes:   { classId, name, teacherName }[],
  standing?: { points, position, className }[],   // per class, all-time
  work?:     { solvedProblems, submissions, activeSeconds, lastActivityAt },
  viewer:    { canManageMembers },
}
```

`viewer` carries only `canManageMembers`, because that is the only authority any
section on this page turns on. A flag per section would invite a reader to
consult it instead of checking whether the section arrived, and the absent
section is already the answer.

| Section | Manager | Team Lead | Teacher |
|---|---|---|---|
| identity | ✅ | ✅ | ✅ |
| school | ✅ | ✅ | ✅ |
| guardian | ✅ | ✗ | ✗ |
| expression | ✅ | ✅ | ✅ |
| classes | ✅ all | ✅ all | ✅ theirs only |
| standing | ✅ | ✅ | ✅ |
| work | ✅ | ✅ | ✅ |
| Edit link | ✅ | ✗ | ✗ |

`guardian` is **absent**, not nulled, for the two roles that may not read it —
§1.1, and the same optional-vs-null rule as §3.2. The Prisma select omits it.

`expression` (the student's coding interests and learning goal) is shown to all
three. It is the student's own statement about what they want to learn, it is
named in no privacy rule, and it is the one field on this page that helps a
teacher teach. It is read-only everywhere, including for managers, exactly as
the existing editor already treats it.

Links out: the points ledger (`routes.academyPointsStudent`) when points run,
the class progress view for each class, and Edit for managers.

### 5.3 Staff detail — `/academy/[slug]/staff/[membershipId]`

**Authorization.** A new `academyPeople.staffMember` read, `MANAGER` and
`TEAM_LEAD` through `requireMemberReader`. Teachers have no access; nothing in
Parts A–C gives a teacher a colleague's page.

**Response.**

```ts
{
  identity: { membershipId, userId, displayName, username, roles, status,
              joinedAt, avatar, academyTitle },
  contact?: { email, contactPhone, employeeNumber },
  classes:  { homeroom: RosterClassRef[], assistant: RosterClassRef[] },
  viewer:   { canManageMembers },
}
```

| Section | Manager | Team Lead |
|---|---|---|
| identity | ✅ | ✅ |
| contact | ✅ | ✗ |
| classes | ✅ | ✅ |
| Edit link | ✅ | ✗ |

`contact` is absent for a Team Lead, consistent with §3.4 — a field withheld in
the list is not recovered by opening the row.

### 5.4 Presentation

Both pages are read-only views built from `SectionCard`, the primitive the
existing profile surfaces already use. Neither embeds `MemberProfileEditor`,
`MemberRolesPanel`, or `StudentPasswordPanel`: those are editors, and mixing an
editor with a viewer in one component is what option C of the design discussion
was rejected for.

A section the viewer may not see renders nothing at all — no heading, no
placeholder, no lock icon. A page that advertises what it is withholding tells a
Team Lead which children have a guardian on file.

## 6. Internationalisation

- Part A adds no keys; withheld columns keep their existing `staff.column.*`
  and `students.column.*` keys for managers.
- Part B adds to the `teaching` namespace: view switch labels, roster column
  headers, the class-section heading with its count, board-unavailable lines
  keyed by `LeaderboardIneligibleReason`, the truncation notice, and the row
  button's accessible label.
- Part C adds a `member-detail` namespace: section headings, field labels, the
  link labels, and the empty states. It is mounted by the two detail routes
  only, so no other studio page pays for it in its RSC payload.
- Both locales ship together. Dates and numbers use the existing formatters.

## 7. Error handling

| Failure | Answer |
|---|---|
| Team Lead loads a roster or detail page they may not | The route's existing refusal path. Denial and absence stay indistinguishable. |
| Roster read fails | Existing `RosterFailure` with retry. Unchanged. |
| Teacher roster read fails | Client retries and says what happened. An empty roster and an unreachable one must not look alike. |
| One class's board read fails | `board.ranked: false, reason: "UNAVAILABLE"`. The roster renders. |
| Detail page read fails | The route error boundary, not an empty profile. |
| Teacher opens a student they do not teach | Not found. |
| `view=roster` without points | Renders, without points columns. |
| Teacher with no assigned classes | The existing not-found answer. Unchanged. |

## 8. Testing

**Unit (shared).** Optional-vs-null on both roster rows and both detail
responses; absent `points`/`position` surviving a round trip; the roster
ordering rule including ties sharing a position and no-standing sorting last.

**Unit (API).**

- `requireMemberReader` admits `MANAGER` and `TEAM_LEAD`, refuses `TEACHER` and
  `STUDENT`, and refuses a member holding `academy.members.read` without one of
  those roles — the conjunction tested as a rule, not as a consequence.
- `listStudents` omits guardian fields for a Team Lead, and the Prisma select
  does not request them.
- `listStaff` omits contact fields for a Team Lead; returns them for a Manager.
- `academyPeople.student` omits `guardian` for Team Lead and Teacher.
- A teacher may read a student they teach and not one they do not.
- `academyPeople.staffMember` refuses a teacher outright.
- `TeacherRosterService` scopes to assigned classes; another teacher's class
  never appears.
- The board is read at the all-time period.
- A class with no activity yields `board.ranked: false` and students without
  positions, not students at position 1.
- With `STUDENT_POINTS` off, every student and `solvedProblems` are still
  returned, and no `points` or `position`.

**Component (web).** Both roster tables build no withheld column when
`canManageMembers` is false, and the hideable set matches. Both detail pages
render no heading for a withheld section.

**E2E.** Extend `e2e/specs/manager-people-rosters.spec.ts`: a Team Lead opens
Students and Staff, sees rows, finds no guardian and no phone column, opens a
row into the detail page, and finds no guardian section and no Edit link. Add a
teacher case: switch to Roster view, assert class sections, assert a tie shares
a position, follow the row button into the student page, and confirm the
guardian section is absent. Needs a seeded Team Lead and a class with points.

## 9. Acceptance

1. A Team Lead opens `/staff` and `/students` and sees every member with avatar,
   name, ID, classes, status and joined.
2. A Team Lead sees no guardian columns, no staff phone, email or employee
   number, in lists or on detail pages.
3. A Manager's lists are unchanged in every column.
4. A Teacher or Student calling either roster procedure is refused.
5. Every manager surface other than the two rosters still runs through
   `requireManager` unchanged.
6. A teacher opens `?view=roster` and sees their students grouped by class with
   name, ID, joined, points, position and solved.
7. Equal standings share a position and the next position skips.
8. A student with no standing shows an em dash, not zero and not last place.
9. An academy without `STUDENT_POINTS` gets the roster with no points columns.
10. Switching to Roster and back preserves the teacher's analytics scope.
11. Every roster row action opens a detail page its reader may view.
12. A teacher opens a student they teach and is refused one they do not.
13. A withheld section renders nothing — no heading, no placeholder.
14. A Manager reaches the editor from the student detail page's Edit link.

## 10. Delivery

The order is **A → C → B**, and it is forced rather than preferred. Part C reuses
`requireMemberReader` from Part A, and Part B's row button opens a page Part C
builds. Landing B first would mean shipping a button with nowhere to go.

**Part A**: shared contracts → `requireMemberReader` → both list services →
web gate and helper → both tables → sidebar → tests.

**Part C**: detail contracts → the two reads → the two routes and their
sections → row actions repointed → tests.

**Part B**: roster contract → `TeacherRosterService` and the `roster`
procedure → `view` in `StudentsQuery` → the view switch → the roster table with
class sections → empty and unranked states → tests.

Each part is one pull request into `feat/cove-studio-v2`.
