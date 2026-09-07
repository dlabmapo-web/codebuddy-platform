# All-Time Class Ranking, and No Floor on Class Size

**Date:** 2026-09-07
**Branch:** written on `feat/applicant-lobby`; implementation branch TBD
**Status:** Draft — awaiting approval

## 1. Purpose

Two changes to the class ranking, asked for together because they have the same
victim: a small class that has just started.

**A class of one or two sees no ranking at all.** The board refuses to render
below three students and tells them so. A real academy opening its first class
puts two children in it, and the feature they were sold is a paragraph
explaining why they cannot have it.

**And the board resets every night.** `Today` is the default period, so a
student who worked hard last week opens the app on a quiet Monday and sees an
empty board. There is no way at all to ask "how have we done since this class
started" — the three periods are today, this week, and this month, and none of
them reaches back further than the 1st.

This document removes the class-size floor and adds an **All time** period,
defaulted, on every surface that ranks a class.

## 2. Diagnosis

### 2.1 The floor is three students, and it is checked twice

`packages/api/src/points/points.service.ts:272` refuses a class with fewer than
`MIN_STUDENTS_FOR_COMPARISON` enrolled students (`TOO_FEW_STUDENTS`), and
`:281` refuses again when fewer than three of them have *any* activity in the
period (`NO_ACTIVITY_YET`). Both return `eligible: false` and the page renders
an explanation instead of a board.

The constant is 3 and lives in
`packages/shared/src/content/teacher-overview.ts:59`, where it is described as
the point below which "a curriculum or problem signal … is a coincidence."

### 2.2 The rationale, and what has changed since

§10.4 of `2026-08-21-student-points-and-class-ranking-design.md` argues it
plainly, and the argument is a good one:

> A position out of two is not information. […] it never shows a child that
> they are first of one, and never that they are last of two.

That was written for a **daily** board, and the same section says so: "The floor
does most of its work on the daily board, where it is reached and crossed every
morning." The floor and the daily default were designed as one thing — a race
that resets nightly needs a floor, because on any given morning two children
have earned nothing and a ranking of them is noise.

Change the default to all-time and the floor's main job disappears. A board
covering the whole life of the class is not a coincidence at any class size; it
is the record.

### 2.3 The same constant means something else in three other places

`MIN_STUDENTS_FOR_COMPARISON` is also read by
`student-overview.service.ts:459` and `teacher-overview.service.ts:481,512`.
Those are **not** the board. They decide whether a curriculum signal — "this
problem is stopping people" — has enough students behind it to be worth
reporting, which is a statistical claim and genuinely needs a floor.

**Only the points board stops reading it.** The constant keeps its name, its
value and its docstring.

### 2.4 Periods are calendars, and there are only three

`packages/shared/src/points/period.ts` defines `day`, `week` and `month`,
resolved in the academy's timezone, with `DEFAULT_POINTS_PERIOD = "day"`. Its
own docstring explains the choice, and it is right about what it rejects:

> `7d` and `30d` are right for a report […] They are wrong for a competition: a
> rolling window means yesterday's points silently fall out of the bottom, a
> position changes overnight for something that happened a month ago, and a
> season can never end because it never started.

All-time is not a rolling window. It is the widest possible calendar period,
with a fixed start and no silent expiry — it is the one period where nothing
ever falls out of the bottom.

### 2.5 Four surfaces, one period vocabulary

| Surface | Route | Period control |
| --- | --- | --- |
| A student's own points | `/academy/{slug}/points` | `points-workspace.tsx:165` |
| Staff class ranking | `/academy/{slug}/points/classes` | `class-ranking-workspace.tsx:189` |
| Console ranking | `/admin/ranking` | `ranking-table.tsx:442` |
| Every role's overview preview | the overview cards | none — fixed to today |

The first three render their buttons by mapping `pointsPeriodKinds`, so a
fourth kind appears on all three from one edit. The console's input schema
carries its own default (`platform/class-ranking.ts:156`).

## 3. Decisions

### 3.1 `all` becomes a period, and the default

`pointsPeriodKinds` gains `"all"` **first** in the array, so every selector that
maps it renders **All time · Today · This week · This month** without a second
edit. `DEFAULT_POINTS_PERIOD` becomes `"all"`, and
`platform/class-ranking.ts:156` follows it.

`resolvePointsPeriod("all", now, tz)` returns a period whose `endDate` is today
and whose start is **unbounded**. It does not read the class's creation date,
for two reasons: `resolvePointsPeriod` has no class in scope and the console
resolves one period across many classes at once; and no award can predate the
class that produced it, so an unbounded start and `Class.createdAt` produce
identical sums. The difference is only what a label could say, and §3.4 handles
that.

The academy timezone still decides where "today" ends, so an evening class is
not split across two dates — unchanged from every other period.

### 3.2 The class-size floor is removed

`TOO_FEW_STUDENTS` is no longer returned by the board. A class of one renders,
a class of two renders.

`NO_ACTIVITY_YET` **stays**, with its floor lowered from three students to one
point. The board renders as soon as anybody in the class has earned anything in
the period; a class where nobody ever has is still told it is quiet, because a
table of five students all on zero, ordered by a tiebreak they cannot see, is
not a ranking of anything.

With all-time as the default this state is now reached only by a class that has
genuinely never earned a point — not, as today, by every class before lunchtime.

`TOO_FEW_STUDENTS` stays in `leaderboardIneligibleReasons` and keeps its copy.
Removing the member would break every client holding an older bundle mid-deploy
for the sake of deleting four lines, and a reason nothing emits costs nothing.

### 3.3 A class of one is shown its points, not a position

The one place where §10.4's objection survives intact: "1st of 1" is not a fact
about anybody. So a board with a single row renders the student's points, their
solved count and their days — and **no position column and no medal**. It is
the same board with one column removed, not a different component.

At two students the position is shown. It is a small number and it is honest,
and this is the trade the request makes deliberately; §6 states it plainly.

### 3.4 The plate prints a name, not a date range

The season plate prints the period's `startDate`–`endDate`. For `all` there is
no meaningful start date to print, so it prints the period's own label instead.

Rejected: printing "Since 3 March", from `Class.createdAt`. It reads well on the
student page and is wrong on the console, where one period spans many classes
with many start dates — and a period whose label depends on which class you are
looking at is not one period.

### 3.5 "Moved up" does not render for all time

`points.service.ts:313` already suppresses the rising marker for `day`, because
comparing today with yesterday is noise for a class that did not meet
yesterday. All-time has no previous period at all, so it is suppressed the same
way, and `previousPointsPeriod` gains a guard rather than being asked a question
with no answer.

### 3.6 The overview preview follows the same default

The role overview cards show a fixed top-five for **today**. They move to
all-time with everything else.

The reason is not consistency for its own sake: a manager reading the overview
and then opening the ranking page would otherwise see two different orders for
the same class on two pages of the same product, with nothing on either page
explaining why. The copy changes with it — "Today's class ranking" becomes
"Class ranking".

## 4. What changes, file by file

| File | Change |
| --- | --- |
| `shared/src/points/period.ts` | `"all"` added to `pointsPeriodKinds`, first; `DEFAULT_POINTS_PERIOD` becomes it; `resolvePointsPeriod` grows the unbounded branch; `previousPointsPeriod` guards against being called with it. |
| `shared/src/platform/class-ranking.ts:156` | the console input default follows. |
| `api/src/points/points.service.ts:272-288` | the `TOO_FEW_STUDENTS` branch goes; the `NO_ACTIVITY_YET` floor becomes one point; the rising marker is suppressed for `all` as well as `day`. |
| `api/src/points/leaderboard.repository.ts:176` | the `gte: period.startsAt` window admits an unbounded start. |
| `shared/src/content/teacher-overview.ts:59` | untouched. §2.3. |
| `web/.../points/_lib/points-url.ts` | the param is still omitted at the default, which is now `all`. |
| `web/.../points/_components/season-plate.tsx` | prints the label rather than a range for `all`. Its days-count branch at `:129` is **not** touched: it hides the count on `day` because there the number is 0 or 1 for everyone, and over all time it is the most interesting figure on the plate. |
| `web/.../points/_components/class-leaderboard.tsx` | the single-row board drops the position column; the `TOO_FEW_STUDENTS` branch becomes unreachable and is kept. |
| `web/.../_components/overview-ranking/overview-ranking-card.tsx` | all-time preview; copy. |
| `i18n/{en,ko}/points.json` | `period.all`, `plate.total_label_all`, and the preview's three "today" strings. |
| `i18n/{en,ko}/platform-ranking.json` | whatever the console's own period copy names. |

Nothing in the award pipeline changes. Points are still written by the server
inside the transaction that recorded the fact they describe, and this document
touches only how they are summed and displayed.

## 5. Copy

| Key | English | Korean |
| --- | --- | --- |
| `points:period.all` | All time | 전체 기간 |
| `points:plate.total_label_all` | Points earned in total | 총 획득 포인트 |
| `points:preview.title` | Class ranking | 반 랭킹 |
| `points:preview.description` | The first five places in this class. | 이 반의 상위 5명입니다. |
| `points:preview.scope` | All time | 전체 기간 |

`plate.total_label_all` is not optional: the plate interpolates
`plate.total_label_${periodKind}` (`season-plate.tsx:109`), so a missing key
renders the key itself. The same shape means adding a period is always a copy
change, never only a code change — worth knowing before the next one.

`preview.scope` currently reads `Today · {{date}}`. All-time has no date to
print, so it loses the interpolation; the plate makes the same move for the
same reason (§3.4).

The rest is unchanged. `board.too_few` and its hint stay in the file against the
reason they answer, which stays in the union.

## 6. What this trades away

Stated plainly, because the 2026-08-21 design argued the other way and a later
reader deserves to know this was a decision rather than an oversight.

**A class of two now has a visible loser, permanently.** The old floor existed
to prevent exactly that, and all-time removes the mercy the daily reset
provided: a child who is second of two is second of two every day, and no
tomorrow makes it level again. §3.3 softens the one-student case, where a
position is meaningless anyway; it does not soften this one, because a ranking
of two people is a ranking and hiding it would be the floor again.

**The daily race is no longer the thing you land on.** The 2026-08-21 design's
best argument for `Today` — "a race wants a start gun … tomorrow morning
everyone is level again" — is real, and it is now one tap away rather than the
default. The counter-argument is that a start gun every morning also means a
board that forgets everything a student has done, which is what the request is
about.

Both periods remain available on every surface. What changes is which one the
reader is handed first.

## 7. Test plan

- Unit, `resolvePointsPeriod('all', …)`: ends at today's academy-local day end;
  admits an award from any date before it; the same answer in two timezones for
  the same instant.
- Unit, `previousPointsPeriod`: refuses `all` rather than returning a period.
- Unit, `rankEntries` over one row: position 1, and the view drops the column.
- Service, one enrolled student with points: `eligible: true` — the case that
  is `TOO_FEW_STUDENTS` today.
- Service, two enrolled students, one with points: `eligible: true`, two rows,
  positions 1 and 2.
- Service, five enrolled students, none with points: `NO_ACTIVITY_YET`.
- Service, `all`: an award from last month is counted; the rising marker is
  absent.
- URL: no `period` param resolves to `all`; `?period=day` still resolves to
  today, so an existing bookmark keeps its meaning.
- E2E: the ranking page opens on All time and lists a class of two.

## 8. Rollout

Additive and backward compatible in both directions, which matters because the
web and the API deploy separately:

- an **older client** against a newer API sends `period: "day"` or omits it. A
  new API defaults an omitted period to `all` — a changed answer, not a broken
  one — and every explicit value it can send is still honoured.
- a **newer client** against an older API sends `period: "all"`, which the old
  `z.enum` rejects. The client must therefore ship *after* the API, the usual
  order in this repo.

No migration. No stored standing exists to backfill — §10.2 of the 2026-08-21
design requires positions be recomputed per request, and this document does not
change that.

## 9. What this supersedes

`docs/superpowers/specs/2026-08-21-student-points-and-class-ranking-design.md`:

- **§6.3** — the period table gains a fourth row, `all`, and the default moves
  from `day` to it. The section's rejection of *rolling* windows stands
  unchanged and is the reason `all` is defined as a calendar period with a
  fixed end rather than as "the last N days".
- **§10.4** — the class-size floor is withdrawn from the board. The paragraph's
  reasoning is not disowned; §6 above records what it costs. The floor's other
  uses, in the curriculum signals, are untouched.

`docs/superpowers/specs/2026-08-24-overview-ranking-preview-design.md`:

- the preview's fixed daily period becomes the shared default. Its bound of
  five rows, its authorization, and its refusal to link a student to another
  student's ledger are unchanged.

## 10. Implementation order

1. `shared`: the `all` kind, the default, `resolvePointsPeriod`, the
   `previousPointsPeriod` guard, and their unit tests. Nothing renders it yet.
2. `api`: the floor removal, the `NO_ACTIVITY_YET` change, the rising-marker
   suppression, service tests. Deployable alone.
3. `web`: the selectors pick up the fourth button from `pointsPeriodKinds`; the
   plate label; the single-row board; the overview preview; i18n.
