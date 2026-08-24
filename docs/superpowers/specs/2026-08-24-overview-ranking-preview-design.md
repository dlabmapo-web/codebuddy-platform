# Overview Ranking Preview

- Status: proposed
- Date: 2026-08-24
- Extends [Student Points and Class Ranking](./2026-08-21-student-points-and-class-ranking-design.md)
- Amends the student overview described by [Student Academy Overview](./2026-08-18-student-academy-overview-design.md)

## 1. Decision

Show today's first five ranked students on every academy overview: student,
teacher, team lead, and manager.

The preview is one shared, class-scoped card. It contains a class selector and
defaults to the overview's current class when one is explicitly selected;
otherwise it chooses the first class the reader is authorized to see. Changing
the card's class changes only the card, never the reporting scope around it.

On the student overview, this card replaces the existing points-summary card.
The student overview also removes two unrelated sections:

- **From your teacher** (`messages`)
- **Worth another look** (`practice`)

Teacher feedback remains available inside the exercise where it was written.
Removing its overview preview does not remove feedback, read state, or the
teacher's ability to leave feedback.

## 2. Why

The complete points page is the place to inspect a class ranking, change the
period, audit how points were earned, and read the rules. The overview needs a
smaller answer: who currently occupies the first five rows in this class?

Staff can already reach the full board from class surfaces, but their academy
overviews do not expose it. Students see only their own total and position on
the overview. A common preview gives all four roles the same current snapshot
without copying the full ranking table into four pages.

The two removed student sections compete with the overview's primary jobs.
Feedback belongs with the exercise it discusses, and unfinished work already
has the stronger **Continue learning** entry point. Their removal shortens the
page before the ranking preview adds another section.

## 3. Goals

- Render the same top-five calculation for every role.
- Keep rankings class-scoped; never combine several classes into one board.
- Show the academy-local day period only on the preview.
- Let readers switch among only the classes they are authorized to see.
- Preserve the selected class when opening the complete ranking.
- Show a student's own position when they are outside the first five.
- Reuse one contract, service path, component, and localization namespace.
- Avoid fetching or serializing a complete class board for a five-row preview.
- Remove the student messages and practice overview work end to end, rather
  than hiding rendered panels while their queries continue to run.

## 4. Non-goals

- Replacing the complete points or class-ranking pages.
- Adding week or month controls to the preview.
- Creating an academy-wide or cross-class ranking.
- Allowing staff to grant, change, or deduct points.
- Changing ranking order, tie behavior, eligibility floors, or point rules.
- Adding ranking filters to the manager or team-lead overview itself.
- Removing teacher feedback from exercise workspaces.
- Removing unfinished-work calculations used by other teacher or staff tools.

## 5. Shared card

### 5.1 Contents

`OverviewRankingCard` renders:

- title: **Today's class ranking**;
- the resolved academy-local date;
- a class selector when more than one authorized class exists;
- the first five rows in canonical leaderboard order;
- position, avatar, academy display name, and points per row;
- a restrained **You** marker on the student's row;
- the student's own position and points in a separate footer when that row is
  outside the first five; and
- **See full ranking**, preserving the selected `classId` and `period=day`.

“First five” means the first five ordered rows, not every row whose numeric
position is at most five. Ties keep their canonical shared position labels, so
five rows can read `1, 2, 2, 4, 5`. The preview remains bounded at five even
when a tie crosses its boundary; the full board is the complete record.

The card does not show point breakdowns, solved counts, active days, movement
arrows, rules, or ledger entries. Those belong to the complete board.

### 5.2 Placement

| Overview | Placement | Reason |
|---|---|---|
| Student | after **Your learning**, replacing **Your points** | the ledger establishes the student's work before comparison |
| Teacher | after the metrics ledger | class filters and denominators are already established |
| Team lead | after the class roster | the roster establishes which classes exist before ranking one |
| Manager | after learning health | the class comparison establishes academy scope first |

The existing one-column overview rule remains. The ranking preview is a full
width panel, not a side card.

### 5.3 Class selection

The endpoint returns the picker options and selected board together, so the UI
never shows a class that the following board request would reject.

Default resolution is:

1. Use the requested `classId` when it is in the authorized class list.
2. Otherwise use the first authorized class.
3. When the list is empty, return the existing `NOT_ENROLLED` state.

The teacher overview passes its explicit `query.classId` as the initial
request. Its “all classes” scope passes no class and therefore resolves to the
first assigned class. Student, team-lead, and manager overviews have no shared
class filter and initially pass no class.

Picker state belongs to the card and is not written into an overview's URL.
The complete-ranking link does write the resolved class into its destination:

```text
student: /studio/academies/:academyId/points?period=day&classId=:classId
staff:   /studio/academies/:academyId/points/classes?period=day&classId=:classId
```

### 5.4 Loading and refresh

The card is a client query independent of the larger overview response. On a
class change it keeps the previous rows visible at reduced opacity until the
new response arrives, matching existing overview filter behavior. The selector
and full-ranking link are disabled while those rows are stale so neither can be
read as belonging to the new class prematurely.

Rankings are recomputed on each request. No cache or snapshot is introduced by
this design; the query library may retain a response according to the same
short-lived client policy as the complete points page.

## 6. Contract

Add one bounded read to the points contract:

```ts
getOverviewBoard: oc
  .input(overviewPointsBoardInputSchema)
  .output(overviewPointsBoardSchema)
```

Input:

```ts
{
  academyId: string;
  classId?: string;
}
```

The period is deliberately absent. An overview preview always means the
academy-local day; accepting a period would create an unrendered API feature
and let the card drift from its title.

Eligible output:

```ts
{
  period: PointsPeriodView;          // always kind: "day"
  leaderboard: {
    eligible: true;
    classId: string;
    className: string;
    classes: LeaderboardClass[];
    participants: number;
    rows: LeaderboardRow[];          // schema maximum: 5
    viewer: LeaderboardRow | null;   // student outside top five, else null
  };
}
```

Ineligible output reuses the complete board's discriminant and reasons:

```ts
{
  period: PointsPeriodView;
  leaderboard: {
    eligible: false;
    reason: "TOO_FEW_STUDENTS" | "NO_ACTIVITY_YET" |
            "NOT_ENROLLED" | "UNAVAILABLE";
    classes: LeaderboardClass[];
    classId: string | null;
  };
}
```

The compact response always uses the child-safe `LeaderboardRow` shape. It
does not return membership ids, including to staff, because the preview has no
per-student action. Staff membership ids remain confined to the complete staff
board and roster links.

`rows` has a schema maximum of five. `viewer` is non-null only for a student
whose canonical row is outside `rows`; staff receive `null`, and a student in
the first five is already represented by `isYou` in `rows`.

## 7. Authorization and feature flags

`PointsAccessService.resolveOverviewBoard` resolves classes by the reader's
active academy membership:

| Role | Authorized classes |
|---|---|
| Student | active classes in which the student is enrolled |
| Teacher | active classes assigned to the teacher |
| Team lead | every active class in the academy |
| Manager | every active class in the academy |

A requested class outside that list returns the same not-found access error as
an absent class, preventing class enumeration.

Both `STUDENT_POINTS` and `STUDENT_CLASS_LEADERBOARD` must be enabled. The web
overview omits the card when the session feature list says either is off, and
the endpoint independently enforces both flags before running aggregates. A
modified client therefore cannot use a hidden card to read a disabled board.

## 8. Service and data flow

The preview does not implement ranking again.

```text
OverviewRankingCard
  -> points.getOverviewBoard({ academyId, classId? })
  -> PointsAccessService.resolveOverviewBoard
  -> PointsService builds the canonical day board
  -> return rows.slice(0, 5) + optional viewer row
```

Extract the existing private board construction in `PointsService` only as far
as needed for both the complete board and preview to call it. Ordering,
eligibility floors, learning-minute enrichment, ties, and `isYou` remain in
that one path.

The server must find the student's viewer row before truncating. The response
does not perform a second leaderboard query to obtain it.

## 9. Student overview removal

Remove `messages` and `practice` as overview sections through every layer:

- stop `StudentOverviewService` from querying messages, unread-message count,
  and attention candidates for practice;
- remove `messages`, `unreadMessages`, and `practice` from
  `StudentAcademyOverview`;
- remove `messages` and `practice` from `StudentOverviewSection` and partial
  failure bookkeeping;
- delete the overview-only `TeacherMessages` and `PracticeList` components;
- remove their rendering and imports from `StudentOverviewWorkspace`;
- remove translation keys that are no longer referenced; and
- remove overview-only schemas, constants, repository methods, and mapping
  helpers once repository-wide search proves they have no remaining consumer.

Do not delete the `TeacherFeedback` model, feedback APIs, unread/read behavior
inside exercise workspaces, or shared attention calculations used by staff.

The old `PointsCard`, `PointsSummary`, and `PointsService.getSummary` are also
removed after the new preview replaces their only consumer.

## 10. Empty and failure states

- No authorized class: the existing `NOT_ENROLLED` explanation.
- Fewer than the comparison floor: the existing `TOO_FEW_STUDENTS`
  explanation; never show a rank out of one or two.
- Too few active students today: the existing `NO_ACTIVITY_YET` invitation.
- Aggregate failure: `UNAVAILABLE` with a retry action local to the card.
- Feature disabled: render no card and make no request.

The rest of an overview remains usable when the preview fails. A ranking error
must not turn a manager control tower, teacher overview, or student overview
into a page-level error.

## 11. Accessibility, responsive behavior, and localization

- The native/select primitive has a visible label and keyboard operation.
- Each row announces position, student name, and points in reading order.
- Avatars are decorative when the adjacent name already identifies the row.
- The student's **You** marker is text, not color alone.
- Loading uses `aria-live="polite"` once; row-by-row updates are not announced.
- Below `sm`, keep position, name, points, selector, and full-board link. Avatar
  may drop; the table must not scroll horizontally.
- Reduced-motion mode removes opacity transitions.
- Shared preview copy lives in the existing `points` namespace in Korean and
  English. Role overview namespaces do not get four copies of the same labels.
- Dates format in the academy timezone carried by the response.

## 12. Verification

### 12.1 Shared

- Input rejects a period and malformed class ids.
- Eligible output rejects more than five rows.
- Student-safe rows cannot contain membership ids.
- Viewer is nullable and uses the same canonical row schema.

### 12.2 API

- Student sees only enrolled classes and receives `isYou` correctly.
- Teacher sees only assigned classes.
- Team lead and manager see all active academy classes.
- Unauthorized `classId` is rejected without revealing whether it exists.
- Requested class wins; absent request chooses the first authorized class.
- Period always resolves to the academy-local day.
- Preview rows equal the first five rows of the complete canonical board.
- Student outside the first five receives one viewer row from the same board.
- Both feature flags are required before aggregate queries run.
- Each ineligible and unavailable state is preserved.
- Removed student sections no longer issue repository queries.

### 12.3 Web

- The shared card renders in all four role overviews at the specified position.
- Teacher's explicit class filter initializes the card selector.
- Changing the card selector does not change the surrounding overview filters.
- The full-board link preserves `classId` and `period=day` for student and staff.
- A student in and outside the first five gets the correct **You** treatment.
- Feature-off sessions render no card and make no points request.
- Loading, stale, empty, unavailable, mobile, keyboard, Korean, and dark-theme
  states are covered.
- Student overview no longer renders **From your teacher** or
  **Worth another look**.

## 13. Delivery order

1. Shared compact schemas and oRPC contract.
2. Unified overview-board access and service method with API tests.
3. Shared query hook and `OverviewRankingCard`.
4. Insert the card into student, teacher, team-lead, and manager overviews.
5. Remove the old student points summary and the two retired overview sections.
6. Update Korean and English copy, then run typecheck, unit tests, i18n checks,
   theme checks, and targeted browser verification for all four roles.

## 14. Settled decisions

- The preview shows today, not the surrounding overview's 7/30/all-time range.
- It shows exactly five ordered rows.
- It has its own class selector.
- It defaults to the overview's explicit current class, otherwise the first
  authorized class.
- Picker state does not change the surrounding overview.
- One bounded endpoint serves every role.
- Student viewers outside the first five still see their own place.
- Student messages and practice previews are removed end to end.
- The complete ranking and exercise feedback remain unchanged.

## 15. Open questions

None for implementation.
