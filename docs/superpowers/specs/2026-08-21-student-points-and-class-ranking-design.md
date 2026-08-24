# Student Points and Class Ranking

- Status: proposed
- Date: 2026-08-21
- Supersedes parts of [Student Academy Overview](./2026-08-18-student-academy-overview-design.md) — see §18
- Amended by [Class-Scoped Points Attribution](./2026-08-24-class-scoped-points-attribution-design.md)

## 1. Decision

Give a student a number that goes up when they do the work, and a class board
that shows them where they sit in it.

Every measurement this platform takes today is a *report*: solved over
attempted, average best score, counted minutes, active days. Each one is
truthful and none of them is a reason to open the app tomorrow. A nine-year-old
does not come back for an accepted rate.

Points are the reason. They are earned for the four things this product can
already observe — turning up during class, working, solving a problem, and
finishing a piece of curriculum. They accumulate in an append-only ledger, they
are never taken away, and they are summed into a class ranking that resets every
month.

The mechanic is borrowed from the scholarship-card products Korean 학원 already
run (스탬프판 → 포인트 → 장학금), with one difference that matters: those
products need a teacher to tap every stamp, because a card reader cannot tell
whether a child understood a `for` loop. Our judge can. **Every point here is
awarded by the server**, at the moment the fact becomes true, inside the
transaction that recorded it. No person can grant one, and §4 says why.

This is a deliberate reversal of §4 of the student academy overview design,
which ruled points out. §18 states the reversal, what survives it, and why.

## 2. What exists today

Everything the earning rules need, except a clock.

| Fact | Where it already lives |
|---|---|
| A student solved an exercise for the first time | `solvedNow` — `packages/api/src/judge/grading.ts` |
| …recorded transactionally | `GradingService.finalize` — `packages/api/src/judge/grading.service.ts` |
| How hard that exercise was | `ProgrammingExercise.difficulty` (`EASY` / `MEDIUM` / `HARD`) |
| Counted active learning seconds, per academy-local day | `StudentCourseLearningDay` + `LearningActivityAccumulator`; the amendment adds a class projection |
| Which materials a student can see | `packages/api/src/learn/curriculum-visibility.ts` |
| Who is in a class | `ClassEnrollment` |
| The academy's day boundary | `Academy.timeZone`, `academyLocalDate` |
| Per-academy rollout switching | `AcademyFeatureFlag` + `AcademyFeature` |
| A sortable, filterable table | `@/components/studio/data-table` (TanStack Table v8) |
| Panels, tones, meters, empty states | `_components/overview-ui/panel.tsx` |

What does not exist:

- **Any notion of when a class meets.** `Class` has a name, a status, a teacher,
  and courses. No weekday, no time, no session. §8 adds the smallest thing that
  can support "was this student here during the lesson".
- **Any attendance record.** `ClassEnrollment.lastLearningSeenAt` disclaims the
  role in its own doc comment: *"Never a presence truth source: a timestamp
  cannot tell a closed laptop from a tab that is still open."*
- **Any student-visible comparison.** §9 of the overview design specifies an
  anonymous standing; it is not built yet. §10 of this document replaces it.

## 3. Goals

- Award points for attendance, learning time, solving, and completion, with the
  award written in the same transaction as the fact that earned it.
- Make every award idempotent by construction, so a retried judge callback or a
  replayed activity flush pays exactly once.
- Scale solve points by difficulty, so attempting a hard problem beats grinding
  easy ones.
- Give teachers, team leads, and managers a read-only view of the same board
  their students see, on the surfaces they already work in.
- Show a student their class ranking as a full, named, sortable list.
- Reset that ranking every month, so no position is permanent and no child is
  buried by a bad start.
- Make the earning rules legible to a nine-year-old — a point system nobody can
  audit is a point system nobody trusts.
- Ship Korean and English, light and dark, keyboard access, and a one-column
  responsive page, using the tokens and primitives that already exist.

## 4. Non-goals

- **Teacher-awarded points.** Every point is earned from an observed fact. A
  teacher cannot grant, adjust, or top up one, and the API has no method that
  would. §5.2 gives the reasoning.
- Deducting points. There is no column for a negative amount. §7.6 says why.
- Levels, XP curves, unlockables, avatars-as-rewards, or streak flames.
- An academy-wide or all-time ranking. §10.2.
- Ranking on active learning time. §10.3 — the reasoning from §9.3 of the
  overview design survives this document intact.
- Real money (장학금), card issuance, or any payment rail.
- A reward catalogue and redemption flow. Designed for, deferred to §20.
- 스탬프판 — the 12-stamp board. Deferred to §20; the balance carries the
  column it will need.
- Guardian access or notifications.
- Storing absence. §8.4.
- Points for logging in, for submitting, or for reading a teacher's message.
  §7.5 says why each one is excluded.

## 5. Roles and authorization

### 5.1 Who sees what

Nobody awards points. The column that would have said so is gone.

| Role | Own points | Whose board | Reached from |
|---|---|---|---|
| `STUDENT` | yes | the classes they are enrolled in | `/points` |
| `TEACHER` | — | the classes assigned to them | the class page in `teach/` |
| `TEAM_LEAD` | — | any class in the academy | the class page |
| `MANAGER` | — | any class in the academy | the class page; also sets the policy |
| Platform admin | — | none | — |

Staff see the identical board their students see — same order, same numbers,
same period — rendered inside the class detail page they already open. One
component, one query, one set of numbers. A teacher and a student comparing
their screens must never see two different third places.

Staff additionally get a per-student ledger link from the roster, because "why
does 지호 have 40 points" is a question a parent will ask a teacher and the
teacher has to be able to answer it.

### 5.2 Why no one can award points

A point is a claim that something happened. Everything on the §7.1 list is a
fact the server observed: a passing verdict, counted seconds, a schedule window,
a completed lecture. A granted point is a claim about a child's effort or
attitude, and it has three problems this design will not carry:

- **It makes the board a record of a teacher's opinion.** Two children who did
  identical work finish in different positions, and neither can see why.
- **It cannot be audited by the person it is about.** Every other line in the
  ledger can be checked against something the student did. A granted line can
  only be checked against what an adult felt.
- **It is a lever, and levers get pulled.** A budget bounds the size of the
  distortion, not its existence, and the pressure to "help" a discouraged child
  up the board is exactly the pressure that makes the board meaningless.

Effort and attitude still matter and are still worth recognising — through
`TeacherFeedback`, which is written to the child rather than to the scoreboard,
and which this platform already has.

Both features are gated per academy through the existing flag table:

```prisma
enum AcademyFeature {
  TEACHER_LIVE_MONITORING
  STUDENT_CLASS_STANDING
  STUDENT_POINTS           // the ledger, the page, and all awarding
  STUDENT_CLASS_LEADERBOARD // the named list; requires STUDENT_POINTS
}
```

Both default off. A missing row means off, so a new academy never starts inside
a rollout — the property `AcademyFeatureFlag`'s doc comment already states.

The flag is read in a `PointsAccessService` before any aggregate runs, the same
shape as `monitoring-access.service.ts`. `STUDENT_POINTS` off means the awarding
hooks return immediately: an academy that does not want a point economy pays no
query cost for one, and its `PointAward` table stays empty rather than
accumulating rows nobody will ever see.

`STUDENT_CLASS_LEADERBOARD` without `STUDENT_POINTS` is a configuration error,
rejected at write time rather than rendered as an empty board.

## 6. Information architecture

### 6.1 Route

```text
/studio/academies/:academyId/points
```

A page of its own, in the student's `learn` section, beside Answer records. Not
a section on the overview: the overview is a starting page that answers "what
should I work on now", and a ranked table of eighteen classmates is the opposite
of a hand-off.

The overview gains one compact card — points today, position, and a link
here — inserted after the ledger. That card is the only thing about points on
that page.

### 6.2 URL state

```text
?period=day|week|month   default: day
?classId=<uuid>          default: the class with the most recent activity
```

Both are shareable and both survive a reload. Ledger paging is cursor state in
the query hook, not in the URL — the ledger is a scroll, not a destination.

The same `classId` scopes the student's period plate, board, learning
measurements, and ledger. Learning links also preserve it so new awards record
the class in which the work occurred. See the class-attribution amendment.

### 6.3 Period

**Three calendar periods in the academy's timezone, never a rolling window.**

| Period | Range | Label |
|---|---|---|
| `day` — the default | the academy-local day | `오늘` |
| `week` | Monday to Sunday | `이번 주` |
| `month` | the 1st to the last day | `이번 달` |

`오늘` is the default because the board is a race and a race wants a start gun.
A student opening the app after class sees what today produced, and tomorrow
morning everyone is level again. The longer periods are one tap away for the
student who wants to know how their week or their month is going.

Refresh and reset are different things, and the distinction matters because it
is easy to read the table above as "the ranking changes once a day". It does
not: **every period is recomputed on every request and nothing is cached**, so a
position moves the instant a point is earned. The period decides only when the
board returns to zero.

Week starts Monday because Korea does and because the class schedule in §8 is
written in weekdays. Months and days are the academy's, from `Academy.timeZone`
and `academyLocalDate` — an evening class must not be split across two dates.

This deviates from `resolveOverviewPeriod`, deliberately. `7d` and `30d` are
right for a report — they answer "how has this student been doing lately" from
any day you happen to ask. They are wrong for a competition: a rolling window
means yesterday's points silently fall out of the bottom, a student's position
changes overnight for something that happened a month ago, and a season can
never end because it never started.

The response carries the resolved range, timezone, both boundary dates, and the
label, so a screenshot stays readable next month.

## 7. The point rules

### 7.1 Defaults

Every value is a column on `AcademyPointPolicy` (§13) with these defaults. An
academy that wants a different economy changes numbers, never code.

| Reason | Points | Awarded when |
|---|---|---|
| `ATTENDANCE` | **5** | ≥10 counted active minutes inside a class window, before the grace cutoff |
| `ATTENDANCE_LATE` | **2** | the same, first activity after the cutoff |
| `LEARNING_TIME` | **3 / +5 / +7** | per-class day totals of 30 min, 60 min, 120 min |
| `EXERCISE_SOLVED` | **3 / 5 / 10** | first solve, by `EASY` / `MEDIUM` / `HARD` |
| `LECTURE_COMPLETED` | **15** | every visible material in the lecture solved |
| `MODULE_COMPLETED` | **40** | every visible lecture in the module completed |
| `COURSE_COMPLETED` | **150** | every visible module in the course completed |

Caps:

| Cap | Default | Why |
|---|---|---|
| Student daily earn per class | **100** | Without it the ranking measures endurance, not learning |

### 7.2 Why the solve values are 3 / 5 / 10

`HARD` at 10 is three and a third `EASY` problems. Set it lower and the
arithmetic tells a student that grinding easy problems beats attempting a hard
one — which is the exact lesson the number exists to prevent. Set it much higher
and a student who is not ready for `HARD` yet watches an unreachable number
climb on somebody else's row.

The mapping lives in `packages/shared` as a pure function:

```ts
export function pointsForSolve(
  difficulty: ExerciseDifficulty,
  policy: PointPolicy,
): number;
```

One function, unit-tested, imported by the awarding service and by the "how to
earn points" legend on the page. A student reading the rules and the server
paying the points must not be able to disagree; one function is how that stays
impossible. This is the same technique §8.1 of the overview design uses for
`averageBestScore`.

### 7.3 Why the learning-time thresholds are a ladder, not a cliff

Counted seconds are not elapsed seconds. `ACTIVITY_MAX_GAP_MS` is 30 000: any
half-minute of stillness closes the interval and stops the clock, and one
heartbeat buys at most `ACTIVITY_HEARTBEAT_MAX_SECONDS` (15). Two counted hours
is two hours of near-continuous engaged work, which is already a long session
for a child.

A single high threshold — five hours, say — is invisible to almost every student
and, for the few who reach it, is a reward for five hours at a screen. The
ladder pays the first rung to everyone who shows up and works, and the top rung
is `learningTimeTier3Minutes`, which an academy may set to 300 if it wants.

Tiers are cumulative and each is paid once per class per academy-local day.

### 7.4 Completion, and the moving denominator

A student solves the last of a lecture's five problems and is paid 15P. A team
lead adds a sixth problem. The lecture is now incomplete.

**Rule: awarded once, ever. Never clawed back, never paid twice.** The dedupe key
is `{membershipId}:{lectureId}:LECTURE_COMPLETED` and it carries no revision, no
material count, and no timestamp. Solving the sixth problem pays the solve, not
the lecture again.

The alternative — recomputing entitlement — means a curriculum edit can take
points from a child who did nothing wrong, which §7.6 rules out, and it means
the same lecture can pay repeatedly to a student who waits for new problems,
which is a farm.

Hidden-to-visible transitions are the same case and get the same answer.

### 7.5 What is deliberately not paid

| Not paid | Why |
|---|---|
| Logging in | Trivially farmable, and measures nothing |
| Submitting | Pays the judge queue to accept garbage |
| Attempt counts, retry bonuses, first-try bonuses | Removed at the product owner's direction; solving is the fact, the route to it is not |
| Reading a teacher's message | `TeacherFeedback.readAt` is the signal a teacher uses to learn whether their sentence landed. Paying for it converts a real measurement into a farm |
| Active learning time as a *ranking* input | §10.3 |
| A re-grade of an already-solved problem | Same dedupe key, no revision in it |

### 7.6 Points are never deducted

`PointAward.amount` is constrained `> 0`. There is no reason code for a penalty
and no service method that writes one.

This is the load-bearing constraint of the whole design. It is what lets the
ranking be public without being a punishment: the bottom row of a class board
reads "12P this month", which is a small number, not a verdict — and next month
it is zero for everyone. A system that could subtract would let a teacher, a
curriculum edit, or a bad week mark a child, and no amount of UI care would
undo that.

Every award is a system award, so the only correction anyone ever needs is for a
platform mistake — a misconfigured difficulty, a double-paid tier after an
incident. That is handled by voiding the row (`voidedAt`, `voidedByMembershipId`,
`voidReason`), which excludes it from every sum.

A void is `MANAGER`-only, it writes an `AuditLog` entry, and it is visible to the
student in the ledger as a struck-through line with its reason. It is not a
deduction and it must not be used as one: a teacher has no access to it, and a
manager voiding a correctly-earned award is a misuse the audit trail records
rather than a feature.

## 8. Class schedule and attendance

### 8.1 The schedule

```prisma
/// When one class meets, as a recurring academy-local rule.
///
/// Minutes from local midnight rather than instants, because the rule is
/// "Tuesdays at four" and not "2026-09-01T07:00Z". Stored as an instant it
/// would be wrong the first time an academy changes timezone, and unreadable
/// to the manager who typed it.
model ClassScheduleSlot {
  id            String    @id @default(uuid()) @db.Uuid
  classId       String    @map("class_id") @db.Uuid
  /// 1 = Monday … 7 = Sunday, ISO-8601, academy-local.
  weekday       Int
  /// Minutes from academy-local midnight. 16:00 is 960.
  startMinute   Int       @map("start_minute")
  endMinute     Int       @map("end_minute")
  /// A term change adds a slot and closes the old one. Nothing is deleted, so
  /// last month's attendance stays explicable.
  effectiveFrom DateTime? @map("effective_from") @db.Date
  effectiveTo   DateTime? @map("effective_to") @db.Date
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  class Class @relation(fields: [classId], references: [id], onDelete: Cascade)

  @@index([classId, weekday])
  @@map("class_schedule_slots")
}
```

`endMinute` may exceed 1440 for a class that crosses midnight. It never wraps.

Managed by a `MANAGER` on the class detail page. A class without slots simply
never pays attendance points; nothing else changes.

### 8.2 What "attended" means

**≥ `attendanceMinMinutes` (default 10) of counted active learning inside the
window.** Not a login, and not an open socket.

This is not a hedge, it is the only signal available that means anything.
`LearningActivityAccumulator`'s own doc comment states the principle: *"It never
accepts a duration from a client — a browser that could report 'I studied for
two hours' would be reporting a number nobody can check."* And presence is a
Redis key with a TTL whose doc comment says it expires precisely because *"a
database flag would leave a roster full of students who went home an hour ago."*

A student who opens a tab at 16:00 and leaves would collect the points under a
login rule. Under this rule they collect nothing, and a student who actually
attends collects within the first ten minutes without noticing the difference.

### 8.3 On time or late

`ATTENDANCE` when the student's first counted interval that day begins at or
before `startMinute + attendanceGraceMinutes` (default 15).
`ATTENDANCE_LATE` after it. One or the other, never both, keyed on
`{membershipId}:{classId}:{localDate}:ATTENDANCE`.

### 8.4 Absence is not stored

There is no `ABSENT` row and no attendance table. A missing `PointAward` already
answers "did this child come on Tuesday" for anyone entitled to ask.

The moment absence is persisted it becomes a discipline record about a minor —
a materially heavier object than a point, with its own retention, disclosure,
and guardian-access questions. If an academy needs a real attendance register,
that is its own design with its own §Privacy, and it should not arrive as a side
effect of a rewards feature.

### 8.5 Attribution

The learning workspace resolves one class before activity begins. The
accumulator retains that validated class and writes both the existing
course-scoped daily projection and the class-aware projection defined by the
class-attribution amendment. Attendance considers only the resolved class and
its schedule window. It never copies one interval into every matching class.

## 9. Awarding

### 9.1 The two hooks

| Hook | Site | Awards |
|---|---|---|
| Grading transaction | `GradingService.finalize`, inside the existing `$transaction`, in the `solvedNow` branch | `EXERCISE_SOLVED`, then the completion cascade |
| Activity flush | `LearningActivityAccumulator`, in the transaction that increments the daily projection | `LEARNING_TIME`, `ATTENDANCE` |

Both write inside transactions that already exist. There is no third hook and no
mutation endpoint: an award is never a second round-trip that can fail after the
fact it describes has been committed — if the solve is recorded, the points are
recorded.

### 9.2 The completion cascade

Only a `solvedNow` can complete a scope, so completion is checked only in that
branch, and each level is checked only if the level below it just completed:

```text
solvedNow
  └─ lecture complete?  no → stop
       └─ module complete?  no → stop
            └─ course complete?
```

In the common case this is one bounded count query per accepted submission. The
full cascade runs at most once per lecture per student, ever.

Visibility comes from `curriculum-visibility.ts`. A raw count of `Material` rows
would pay a student for solving problems their academy cannot see.

### 9.3 Idempotency

`PointAward.dedupeKey` is `@unique`. The awarding service inserts and swallows
the unique-violation. There is no read-then-write, no advisory lock, and no
service that has to remember to check — the same reasoning `LearningActivityFlush`
uses, where *"the row is the idempotency key."*

| Reason | Key |
|---|---|
| `EXERCISE_SOLVED` | `{membershipId}:{materialId}:SOLVE` |
| `LECTURE_COMPLETED` | `{membershipId}:{lectureId}:LECTURE` |
| `MODULE_COMPLETED` | `{membershipId}:{moduleId}:MODULE` |
| `COURSE_COMPLETED` | `{membershipId}:{courseId}:COURSE` |
| `LEARNING_TIME` | `{membershipId}:{classId}:{localDate}:TIME:{tierMinutes}` |
| `ATTENDANCE` | `{membershipId}:{classId}:{localDate}:ATTENDANCE` |

No key contains a grading revision, a difficulty, a point value, or a timestamp
finer than a day. Every one of those would let the same fact pay twice after an
ordinary edit.

The daily cap is applied per membership and class at insert: an award that
would exceed that class's cap is truncated to the remainder, and truncated to
nothing rather than skipped, so the ledger still shows the line with a
`cappedAt` marker and the student can see why the number stopped moving.

### 9.4 The balance projection

`StudentPointBalance` is an all-class projection, rebuildable at any time by
`SUM(amount) WHERE voidedAt IS NULL`. It is incremented in the same transaction
as the award. It is not displayed as a class total. The ledger is the truth;
the balance is the fast answer — the same relationship
`StudentCourseLearningDay` has to the heartbeats that built it.

## 10. Ranking

### 10.1 Shape

```text
leaderboard: null                          -- flag off for this academy
leaderboard: { eligible: false, reason }   -- below the participation floor
leaderboard: {
  eligible: true,
  classId, className,
  period: { kind: "day" | "week" | "month", start, end, timeZone, label },
  participants,
  you: { position, points, solved, activeDays, gapToNext, gapToHeld },
  rows: [ {
    position,            -- competition ranking; ties share, next skips
    displayName,         -- AcademyMemberProfile.academyDisplayName
    avatarAssetId,       -- may be null
    points, solved, activeDays,
    improved,            -- true only when the position rose vs last period
    isYou,
  } ]
}
```

Ordered by points in the period descending, then distinct problems solved, then
active days, then membership id ascending — the last used only as a stable
tiebreak and never emitted. Equal points share a position and the next position
skips, the way competition ranking normally does.

### 10.2 Class-scoped, and never permanent

Two decisions carry the ethics of this feature.

**One class.** A student can move a position in a room of eighteen. They cannot
move one in an academy of four hundred, and an academy-wide list would mostly
rank enrolment date and class level. Never academy-wide, and the contract has
no field for an academy scope.

**Nothing lasts past the period, and the default period is one day.** An
all-time board is a verdict a child cannot appeal: a student who joined in March
could never catch one who joined in September, and the bottom three would learn
only that they are permanently the bottom three. Every period here expires —
tomorrow morning, Monday morning, the 1st — so the worst a bad day can cost is a
day. There is no all-time tab and no lifetime total anywhere on the page. The
balance's `earnedTotal` exists for the future rewards ledger, not for a ranking.

**What a daily default costs, and why it is still right.** A day is a small
sample. Early in the morning most rows read 0P, and a student whose class meets
on Monday and Wednesday will see a quiet board on Tuesday. Two things keep that
from reading as failure: §10.4's floor hides the board entirely until three
students have done something today, so nobody is ranked against an empty room;
and the week and month tabs are right there, where a Tuesday student's real
standing is visible. The compensating gain is that a daily board is the only
one where every student in the class starts level, every single morning.

### 10.3 What it does not rank

**Active learning time is not an ordering key**, unchanged from §9.3 of the
overview design: *"A child who understands the material solves the same problem
in less time, and a ranking on minutes would place them below a child who
struggled."* Time earns points through the §7.3 ladder, which is a threshold and
not a race, and it appears in the table as a column you may sort by — the
student's own choice to look — never as the default order.

### 10.4 Floors

The board renders only when the class has at least `MIN_STUDENTS_FOR_COMPARISON`
(3, reused from `packages/shared/src/content/teacher-overview.ts`) actively
enrolled students with any activity in the period. Below that the section
explains what is missing and shows the student's own points instead. A position
out of two is not information.

The floor does most of its work on the daily board, where it is reached and
crossed every morning. Before three classmates have earned anything today the
section reads `오늘은 아직 조용해요` and offers the week — it never shows a child
that they are first of one, and never that they are last of two.

Unlike the anonymous standing it replaces, there is **no floor on the requesting
student's own activity**. A standing that says "you are 3rd of 4" to a child who
has attempted two problems is a judgement; a board that says "you have 8P, the
top row has 240P" is a target, and hiding it from the student who most needs a
target would be the wrong way round.

### 10.5 Every point on the board was earned by the student

There is no granted, adjusted, or gifted point in the sum, because §5.2 means
none exists. The consequence is worth stating plainly, because it is the
strongest thing this board has going for it: **a student can always work out why
somebody is above them, and always work out what would move them up.** Both
answers are on the same screen — the row above them, and the rules section that
says what each action pays.

That is also the honest limit of the feature. The board measures what the
platform can see, which is solving and turning up, and it does not measure a
child who is trying hard on something difficult. The product answers that with
teacher feedback, not with a number.

### 10.6 Membership state

Only `ACTIVE` memberships appear. A `SUSPENDED` or `LEFT` student keeps their
ledger — their points are theirs — and simply does not appear in a comparison
they are not part of.

### 10.7 Transfers and multiple classes

Awards used by a ranking are class-scoped. A student who moves from Class A to
Class B keeps every award in the academy balance and personal history, but
Class B's board counts only work attributed to Class B. A student enrolled in
two classes may therefore have different totals and positions in each.

The class is fixed when the learning action occurs. It is never reconstructed
later from the current roster, so a transfer cannot rewrite a finished period.
Historical classless awards are backfilled only when one class can be resolved
without guessing; ambiguous rows remain outside class rankings.

### 10.8 Class versus class

Deferred, and worth naming because it is the version many directors will
actually want: the same `GROUP BY` one level up, ranking *classes* by total
points. It carries the competitive energy with no exposure of any individual
child, and it makes strong students pull weak ones up rather than race past
them. §20.

## 11. Page design

### 11.1 Visual direction

The house rules are not negotiable and are not a limitation here:

- Token colours only. No `dark:` variants, no hex in components. `globals.css`
  owns the palette; `bg-card` and `text-ink` switch on their own.
- One column, full width, top to bottom. No two sections side by side.
- Measurements in `font-mono tabular-nums`. A number that jitters between
  renders is a number nobody trusts.
- A missing measurement is an em dash with a spoken label, never `0`.
- Pretendard, one family, Korean and Latin. Display sizes tighten tracking;
  body does not.

And one that this page is specifically bound by, from `panel.tsx`:

> *"colour identifies a **section** or a **measurement**, never a child. There is
> no green student and no red student on any of these pages."*

That rule is why this page can be colourful without being cruel. See §11.4.

### 11.2 The signature: the gap, not the number

Named "the season plate" throughout, though the default season is one day.

The template answer for a points page is a large number with a small label, a
gradient, and three stat tiles. It would be the wrong answer here, because a
total is a fact about the past and this page exists to be a reason to come back
tomorrow.

The signature element is **the gap to the next position**, rendered as the one
piece of motion on the page: a short track under the student's total, filling
from their points to the points of the row above them, with the distance stated
in the plainest possible sentence.

```text
┌──────────────────────────────────────────────────────┐
│  오늘                                    8월 21일     │
│                                                      │
│    38 P                           3위 / 18명          │
│    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░                          │
│    2위까지 7P                                         │
└──────────────────────────────────────────────────────┘
```

The eyebrow and the date on the right are the resolved period's label and range,
so the plate says which race it is showing. Switching to `이번 주` or `이번 달`
changes both, along with every figure beneath them.

For the student in first place the sentence inverts — `1위 유지 중 · 2위와 61P
차이` — so the top of the board has something to defend rather than nothing to
chase. For a student in last place it still reads as a distance to the row
above, which is always the smallest gap on the board and therefore always the
most reachable thing on the page. That asymmetry is the whole design: **every
student sees the same widget, and for every student it points one row up.**

The plate uses `--brand-soft` as its wash with `--brand` figures. It is the only
element on the page allowed a full-width tint.

### 11.3 Page structure

```text
┌────────────────────────────────────────────────────────┐
│  내 포인트             [ 오늘 | 이번 주 | 이번 달 ]     │  header
├────────────────────────────────────────────────────────┤
│  ╔══════════════════════════════════════════════════╗  │
│  ║  the season plate — §11.2                        ║  │  signature
│  ╚══════════════════════════════════════════════════╝  │
├────────────────────────────────────────────────────────┤
│ ▌우리 반 랭킹                        [ 반 선택 ▾ ]      │  tone: primary
│                                                        │
│    👑 1  김민준             52P     6문제    1일        │
│    🥈 2  이서연             45P     5문제    1일        │
│    🥉 3  박지호  나         38P     4문제    1일        │
│    ─────────────────────────────────────────────       │
│       4  최유진             30P     3문제    1일        │
│       …  (all rows, sortable, no pagination)           │
├────────────────────────────────────────────────────────┤
│ ▌포인트 받는 방법                                       │  tone: teal
│    the rules, from the same function that pays them    │
├────────────────────────────────────────────────────────┤
│ ▌포인트 내역                                            │  tone: success
│    the ledger — reason icon, label, date, amount        │
└────────────────────────────────────────────────────────┘
```

Each section is a `Panel` with its tone rail, exactly as the teacher and manager
overviews are built. The tones say what the section is: primary for the
comparison, teal for time and rules, success for what was earned.

### 11.4 Rank markers

Icons for the first three positions, as requested — and confined to the marker.

| Position | Icon (lucide) | Token |
|---|---|---|
| 1 | `Crown` | `--rank-gold` |
| 2 | `Medal` | `--rank-silver` |
| 3 | `Medal` | `--rank-bronze` |
| 4+ | tabular numeral, no icon | `text-sub` |

**The metal appears on the marker and nowhere else.** Not on the row
background, not on the name, not on the avatar ring, not on the points figure.
This is how the page stays inside the `panel.tsx` rule: gold is colouring a
*position in a period that resets in three weeks*, which is a measurement, and
it is not colouring 김민준, who is a child. Tint the row and you have made a
golden student and, by contrast, a colourless one.

For the same reason there is no colour anywhere on the lower rows, no red, no
fading, no "needs improvement" tone, and no visual treatment that distinguishes
row 18 from row 4.

The student's own row is marked — `bg-brand-soft`, a `나` chip after the name,
and `aria-current="true"`. That is identity-neutral: it marks *your* row, on
*your* screen, and every student sees exactly one.

New tokens, following the contrast reasoning `globals.css` already applies to
`--success` and `--warning` (both were darkened because they must be able to
carry a word, not just fill an icon):

```css
/* Light */
--rank-gold:   #A16207;  --rank-gold-soft:   #FDF3DC;
--rank-silver: #64748B;  --rank-silver-soft: #F1F5F9;
--rank-bronze: #9A5B2D;  --rank-bronze-soft: #FBEEE4;

/* Dark: lift each hue, keep the softs as low-alpha fills */
--rank-gold:   #E0B341;  --rank-gold-soft:   rgba(224,179,65,0.12);
--rank-silver: #A9B4C4;  --rank-silver-soft: rgba(169,180,196,0.12);
--rank-bronze: #D08B58;  --rank-bronze-soft: rgba(208,139,88,0.12);
```

The light values are the darkened metals rather than the bright ones, because
each is used as the numeral beside its icon and must clear 4.5:1 on `--card`.

### 11.5 The table

`@/components/studio/data-table` — the existing TanStack Table v8 wrapper — with
its features scoped down:

| Feature | Setting | Why |
|---|---|---|
| Sorting | on: `points` (default, desc), `solved`, `activeDays` | Position is the point; letting a student re-sort is letting them ask their own question |
| Sorting `position`, `student` | off | Position is derived from the sort that matters; alphabetising eighteen children serves nobody |
| Pagination | **off** | A class is one screen. Page 2 of a leaderboard is where "last" hides |
| Search | **off** | A search box on a list of classmates is a tool for finding one child |
| Faceted filters | **off** | Nothing here has facets |
| Column visibility | `activeDays` hideable | §11.8 |
| `activeDays` on `오늘` | **column dropped** | It reads 0 or 1 for everyone. A column with two possible values is not a measurement, it is noise |

The primitive already does all of this and needs no change: omitting `pageSize`
renders every row without pagination, and the toolbar renders only when `facets`,
`toolbarFilters`, or `toolbarActions` are passed. The leaderboard passes none of
them. Nothing here justifies a second table component — two data tables that
drift apart is the outcome `overview-ui/panel.tsx` was written to prevent.

Columns:

```ts
const columns: ColumnDef<LeaderboardRow>[] = [
  { id: 'position',   enableSorting: false, cell: RankMarker },
  { id: 'student',    enableSorting: false, cell: StudentCell },  // avatar + name + 나
  { id: 'points',     accessorFn: r => r.points,      cell: PointsCell },
  { id: 'solved',     accessorFn: r => r.solved,      cell: mono },
  { id: 'activeDays', accessorFn: r => r.activeDays,  cell: mono,
    meta: { hideable: true } },
];
```

`improved` renders as a small `ArrowUp` in `--success` after the position, and
renders **nothing** when a student's position fell or held. The asymmetry is
deliberate: a rising arrow is information a child can use, and a falling arrow
beside their name on a list their classmates are reading is a small public
demotion that teaches nothing. Documented in the component so it survives the
next person who notices the gap.

### 11.6 The ledger, and the receipt that was cut

Plain rows: a reason icon in its tone chip, the frozen subject label, the
academy-local date, and the amount in `+12P` in `--success`.

Reason tones are taken from what the tokens already mean, not invented:

| Reason | Icon | Tone | Because |
|---|---|---|---|
| `EXERCISE_SOLVED` | `CircleCheck` | `success` | it is an accepted verdict |
| `LECTURE_COMPLETED` | `BookOpenCheck` | `success` | |
| `MODULE_COMPLETED` | `Layers` | `success` | |
| `COURSE_COMPLETED` | `GraduationCap` | `brand` | the one that deserves weight |
| `LEARNING_TIME` | `Clock` | `teal` | `--teal` is documented as *measured time* |
| `ATTENDANCE` | `CalendarCheck` | `teal` | it is a fact about time |
| `ATTENDANCE_LATE` | `CalendarClock` | `teal` | same hue; lateness is not a warning colour |

An earlier draft styled the ledger as a printed receipt — perforated edge, mono
column, running total — on the argument that points are money-adjacent and a
child trusts a system they can audit. It was cut. The page already spends its
boldness on the season plate, two signature elements compete rather than
compound, and the mono tabular figures the house style already uses give the
audit quality without the costume.

Difficulty appears as a neutral text label inside the solve row
(`어려움 · +10P`), not as a colour. Three difficulty colours next to eight reason
colours is a palette nobody can learn.

### 11.7 Motion

One orchestrated moment on load: the total counts up over 400ms and the gap
track fills behind it. Nothing else animates. Row hover is a background change
with no transform.

Both are behind `prefers-reduced-motion: reduce`, under which the number renders
final and the track renders filled.

### 11.8 Responsive

One column at every width. Below `sm` the table drops `activeDays`, the avatar,
and the season plate's secondary line; the rank marker, name, and points never
drop. Horizontal scroll on a leaderboard is how a child fails to find their own
row.

### 11.9 Copy

Korean first — these are Korean words a student already owns: 포인트, 순위,
오늘, 이번 주, 이번 달, 우리 반 랭킹, 포인트 받는 방법.

Rules:

- Say what happened, not what the system did. `문제를 풀었어요 +5P`, never
  `EXERCISE_SOLVED`.
- The rules section states amounts as facts, in the same order the ledger prints
  them, from `pointsForSolve` and the policy — never a hand-written list that
  can drift from what the server pays.
- Empty is an invitation: `아직 포인트가 없어요. 문제를 하나 풀면 시작돼요.`
- Below the floor, name what is missing: `우리 반 학생이 3명 이상이면 랭킹이
  열려요.` Never a rank out of two, and never a blank panel.
- No superlatives about a child, no "최고", no "부진", no exclamation marks on
  another student's row.

## 12. Contract and module architecture

### 12.1 One bounded read

```ts
// packages/shared/src/api/orpc/points.contract.ts
export const pointsContract = {
  page:      oc.input(pointsPageInputSchema).output(pointsPageSchema),
  ledger:    oc.input(ledgerInputSchema).output(ledgerPageSchema), // class-scoped on ranking pages
  /// MANAGER only. Corrects a platform mistake; never a deduction. §7.6.
  voidAward: oc.input(voidAwardInputSchema).output(pointAwardSchema),
  policy: {
    get:    oc.input(academyIdSchema).output(pointPolicySchema),
    update: oc.input(pointPolicyUpdateSchema).output(pointPolicySchema),
  },
};
```

`page` returns the plate, the leaderboard, the rules, and the first ledger page
in one call — one request per page load, as §10.1 of the overview design
requires. `ledger` serves the cursor after that.

Registered in `packages/shared/src/api/orpc-contract.ts` as `points`.

A doc comment on `leaderboardRowSchema` states that the row carries exactly one
identity field, that `position` is period-scoped, and that no field may be added
that survives a season — the same technique §9.1 of the overview design used to
keep the anonymous standing anonymous, pointed the other way.

### 12.2 Where the code goes

```text
packages/shared/src/points/          rules, tiers, ranking, period — pure
packages/api/src/points/
  points.module.ts
  points-access.service.ts           flags + role, before any aggregate
  point-award.service.ts             the only writer of PointAward
  leaderboard.repository.ts          the grouped sums
  points.router.ts
packages/web/src/app/(v2-studio)/studio/academies/[academyId]/points/
  page.tsx  _components/  _hooks/  _lib/
packages/i18n/src/locales/{ko,en}/points.json
```

`PointAwardService` is injected into `GradingService` and
`LearningActivityAccumulator`. Those two keep their existing transactions and
gain one call each; neither learns anything about points beyond the fact it
already had.

### 12.3 Partial failure

The leaderboard and the ledger fail independently. A failing section renders its
own unavailable state and the rest of the page still answers — the rule the
overview design's §10.3 already sets. A student's own total is the one thing
that must not silently become zero: if the balance read fails, the plate says so.

## 13. Data model

```prisma
enum PointReason {
  ATTENDANCE
  ATTENDANCE_LATE
  LEARNING_TIME
  EXERCISE_SOLVED
  LECTURE_COMPLETED
  MODULE_COMPLETED
  COURSE_COMPLETED
}

/// One earned point award. Append-only.
///
/// The ledger is the truth and `StudentPointBalance` is a fast answer derived
/// from it, the same relationship `StudentCourseLearningDay` has to the
/// heartbeats that built it. Nothing here is ever updated except a void, and a
/// void is an exclusion rather than a subtraction: `amount` has a positive
/// check constraint and there is no reason code for a penalty.
model PointAward {
  id           String      @id @default(uuid()) @db.Uuid
  academyId    String      @map("academy_id") @db.Uuid
  membershipId String      @map("membership_id") @db.Uuid
  reason       PointReason
  /// Always > 0, enforced by a check constraint. §7.6.
  amount       Int
  /// The idempotency key. A retried judge callback or a replayed activity
  /// flush collides here and writes nothing. Never contains a grading
  /// revision, a difficulty, or a sub-day timestamp — §9.3.
  dedupeKey    String      @unique @map("dedupe_key")

  /// What it was for. All nullable: not every reason has every subject.
  materialId String? @map("material_id") @db.Uuid
  lectureId  String? @map("lecture_id") @db.Uuid
  moduleId   String? @map("module_id") @db.Uuid
  courseId   String? @map("course_id") @db.Uuid
  /// Required by every new earning path. Nullable only for unresolved history.
  classId    String? @map("class_id") @db.Uuid
  localDate  DateTime? @map("local_date") @db.Date

  /// The label this row printed when it was written. History has to stay
  /// readable after ordinary curriculum edits — the same reason
  /// `Submission.problemTitle` is frozen.
  subjectLabel String  @map("subject_label")
  /// Set when the daily cap truncated this award, so the ledger can say why.
  cappedAt              DateTime? @map("capped_at") @db.Timestamptz(6)

  voidedAt             DateTime? @map("voided_at") @db.Timestamptz(6)
  voidedByMembershipId String?   @map("voided_by_membership_id") @db.Uuid
  voidReason           String?   @map("void_reason")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  academy    Academy           @relation(fields: [academyId], references: [id], onDelete: Cascade)
  membership AcademyMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  /// The class-period sum behind every leaderboard row.
  @@index([academyId, classId, membershipId, createdAt])
  /// One student's ledger, newest first.
  @@index([membershipId, createdAt(sort: Desc), id(sort: Desc)])
  @@map("point_awards")
}

model StudentPointBalance {
  academyId    String   @map("academy_id") @db.Uuid
  membershipId String   @map("membership_id") @db.Uuid
  earnedTotal  Int      @default(0) @map("earned_total")
  spentTotal   Int      @default(0) @map("spent_total")
  /// For the deferred 스탬프판. Written by nothing yet; the column exists so
  /// the board does not need a migration to arrive.
  stampCount   Int      @default(0) @map("stamp_count")
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@id([academyId, membershipId])
  @@map("student_point_balances")
}

/// One academy's economy. Numbers, not code.
model AcademyPointPolicy {
  academyId String @id @map("academy_id") @db.Uuid

  solveEasy   Int @default(3)  @map("solve_easy")
  solveMedium Int @default(5)  @map("solve_medium")
  solveHard   Int @default(10) @map("solve_hard")

  lectureCompleted Int @default(15)  @map("lecture_completed")
  moduleCompleted  Int @default(40)  @map("module_completed")
  courseCompleted  Int @default(150) @map("course_completed")

  attendance             Int @default(5)  @map("attendance")
  attendanceLate         Int @default(2)  @map("attendance_late")
  attendanceMinMinutes   Int @default(10) @map("attendance_min_minutes")
  attendanceGraceMinutes Int @default(15) @map("attendance_grace_minutes")

  learningTimeTier1Minutes Int @default(30)  @map("learning_time_tier1_minutes")
  learningTimeTier1Points  Int @default(3)   @map("learning_time_tier1_points")
  learningTimeTier2Minutes Int @default(60)  @map("learning_time_tier2_minutes")
  learningTimeTier2Points  Int @default(5)   @map("learning_time_tier2_points")
  learningTimeTier3Minutes Int @default(120) @map("learning_time_tier3_minutes")
  learningTimeTier3Points  Int @default(7)   @map("learning_time_tier3_points")

  studentDailyCap Int @default(100) @map("student_daily_cap")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  academy Academy @relation(fields: [academyId], references: [id], onDelete: Cascade)
  @@map("academy_point_policies")
}
```

`ClassScheduleSlot` as given in §8.1. `AcademyFeature` gains `STUDENT_POINTS`
and `STUDENT_CLASS_LEADERBOARD`.

No cron and no nightly job. Every row is written by a transaction that was
already happening.

## 14. Failure and empty states

| State | What the page does |
|---|---|
| Flag off | The route 404s for students; no nav entry |
| No points yet | The plate shows `0P` with the invitation from §11.9, and the rules section |
| Class below the floor | The board explains the floor and shows the student's own points |
| Leaderboard query fails | That panel says so; plate, rules, and ledger still render |
| Balance read fails | The plate says so. It never prints `0P` for an unknown total |
| Not enrolled in any class | No board, no error — the plate and ledger stand alone |
| One class only | No class selector |

## 15. Performance

- `page` is one round trip. The leaderboard is one grouped sum over
  `PointAward` filtered by class, the roster's membership ids, and the period,
  served by `[academyId, classId, membershipId, createdAt]`.
- Rows are bounded at `OVERVIEW_MAX_PARTICIPATION_STUDENTS` (250). A class
  larger than that is a data problem, and the response says it was truncated.
- The awarding path adds, per accepted submission: one insert, one balance
  upsert, and one bounded count when `solvedNow`. Nothing on the failing path.
- The activity flush updates the existing course-day projection and its
  class-course-day counterpart, then adds at most three tier awards for that
  class.
- `improved` costs a second grouped sum over the previous period. It is computed
  in the same query with a `FILTER` clause, not a second round trip.

## 16. Accessibility, responsive behaviour, localization

- Every rank marker carries a text alternative (`1위` / `1st`); the icon is
  never the only cue, and positions 4+ are numerals already.
- The metals are decorative. Position is conveyed by order and by the numeral,
  so a colour-blind or monochrome reader loses nothing.
- The table has a caption naming the class and period, and the student's row
  carries `aria-current`.
- The gap track has `role="img"` and a label reading the same sentence printed
  beside it.
- Sorting controls are the existing `DataTable` buttons: real buttons, focusable,
  with `aria-sort` on the header.
- Motion respects `prefers-reduced-motion`.
- Every string in `points.json`, both locales. Numbers through
  `@cove/i18n/format`. Korean wraps on 어절 via the existing `:lang(ko)` rule.

## 17. Privacy

This page shows one child's name and score to their classmates. That is the
feature, and it is bounded:

- **Class only.** No student sees anyone outside a class they are in.
- **This period only.** No history, no lifetime total, no archive of past
  seasons on a student surface.
- **Name only.** `academyDisplayName` and an optional avatar — the academy-scoped
  identity a manager set, never an email, username, real name from the user
  account, membership id, or user id.
- **Aggregates only.** A row carries points, a solved count, and a day count. No
  code, no submissions, no scores, no teacher notes, no attendance detail.
- **No absence data**, per §8.4.
- **Off by default.** An academy that does not want a named board never gets
  one, and gets the anonymous standing instead if it wants a comparison at all.

Staff read the same board and the same ledger a student reads, and nothing more.
There is no staff-only column, no per-student note attached to a point, and no
export. A ledger is a list of things the student did.

## 18. Amendments to existing designs

### 18.1 Student academy overview §4

The non-goal

> - Points, badges, levels, streak flames, prizes, or unlockables.

is replaced by

> - Badges, levels, XP curves, streak flames, and unlockables.
> - Points that can be **lost**. Points are earned, never deducted, and never
>   ranked outside one class and one calendar period. §7.6 and §10.2 of the
>   student points design carry the reasoning §4 originally protected.

What §4 was really protecting was not the absence of a number. It was four
properties, and all four survive: nothing tells a child they are behind; no
permanent rank exists; no comparison extends past one class; and the product
never sorts children into good and bad. A monthly, earn-only, class-scoped board
holds every one of them.

### 18.2 Student academy overview §9

Class standing is superseded by §10 of this document *when
`STUDENT_CLASS_LEADERBOARD` is on*. Both must never render: two comparison
surfaces computed differently will eventually disagree, and neither a student
nor their teacher would be able to say which is right.

Resolution order in the student overview access service:

1. `STUDENT_CLASS_LEADERBOARD` on → the overview shows the points card and links
   here; no standing section.
2. `STUDENT_CLASS_STANDING` on, leaderboard off → §9 unchanged.
3. Neither → no comparison, unchanged.

§9.3 (what may be ranked) and §9.4 (floors) survive in §10.3 and §10.4 and are
not re-litigated.

### 18.3 `overview-ui/panel.tsx`

The rule stands, with one sentence added to the doc comment:

> Rank markers on the class leaderboard carry the metal tokens. They colour a
> position inside a period that resets monthly — a measurement — and they are
> confined to the marker. Nothing tints a row, a name, or an avatar, because
> that would colour a child.

## 19. Verification

### 19.1 Pure — `packages/shared`

- `pointsForSolve` across all three difficulties and a custom policy.
- Learning-time tiers: exact boundaries, a day crossing two tiers in one flush,
  a day already past all three.
- Period resolution: day, week, and month boundaries in `Asia/Seoul`; a Monday
  start; a class window crossing midnight; a DST-observing timezone; and the
  academy-local day rolling over while a student is mid-session.
- Ranking: ties share a position and the next skips; the full tiebreak chain;
  membership id never appears in output.
- Gap-to-next for first place, last place, and a tie.

### 19.2 Service — `packages/api`

- Two identical grading callbacks award once.
- A re-grade of a solved problem awards nothing.
- A lecture completed, then extended, then completed again awards once.
- A replayed activity flush awards no extra tier.
- Two classes reach learning-time tiers independently on the same day.
- The daily cap truncates and marks `cappedAt` per class; reaching it in one
  class does not suppress another.
- A void excludes the row from the balance and from the leaderboard sum.
- The flag off means no rows written and no queries run.
- A `SUSPENDED` membership keeps its ledger and leaves the board.
- A class below the floor returns `eligible: false` with a reason.
- Class A totals, active days, and ledger rows exclude Class B records.
- Safe historical rows are backfilled and ambiguous rows remain classless.

### 19.3 Web and e2e

- The leaderboard renders every row with no pagination control.
- Sorting by `solved` reorders without changing the `position` column.
- The student's own row is marked and is the only one marked.
- Reduced motion renders the total final and the track filled.
- A failing leaderboard leaves the plate and ledger intact.
- e2e: solve a problem, see the toast, see the ledger line, see the position
  move.
- e2e: the same student works different amounts in two classes and sees
  different totals and positions after changing the selector.

## 20. Delivery stages

1. **Ledger, silent.** Schema, policy, `STUDENT_POINTS` flag, awarding on
   solve / time / completion. No UI, no student-visible anything. Let points
   accrue for two weeks in one academy and look at the real distribution before
   tuning a single default.
2. **Schedule and attendance.** `ClassScheduleSlot`, the manager editor, the
   flush-time award.
3. **The points page.** Season plate, rules, ledger. Still no comparison.
4. **The leaderboard.** `STUDENT_CLASS_LEADERBOARD`, the table, §18.2's
   resolution order.
5. **Staff views.** The same board inside the class page for teachers, team
   leads, and managers, plus the per-student ledger link from the roster.
6. **Deferred, in order of likely demand:** the reward catalogue and redemption
   approval; the 스탬프판; class-versus-class (§10.8); a guardian summary, which
   needs its own privacy design and must not be bolted onto this one.

## 21. Decisions taken and open questions

### Settled

- **The board ranks `오늘` by default**, with `이번 주` and `이번 달` one tap
  away. Every period is recomputed per request and never cached, so the
  numbers move the moment a point is earned; the period decides only when the
  board returns to zero. §6.3 and §10.2.
- **Learning-time tier 3 is 120 minutes.** Two hours of *counted* time is a long
  day for a child, and a higher rung would be invisible to nearly everyone.
  `learningTimeTier3Minutes` remains a policy column for any academy that wants
  a different number. §7.3.
- **Names only on the board.** No avatars in the first version. `avatarAssetId`
  stays in the row shape so photos are a UI change later, never a migration.
  §11.5.
- **No one awards points.** Removed entirely; §5.2.
- **Every ranked point belongs to one class.** The validated learning context
  is stored on submissions, activity, and awards; tiers and caps are per class.
  The academy balance remains their all-class sum. See the class-attribution
  amendment.

### Open

1. **Snapshotting a finished period.** Only relevant if a finished day, week, or
   month must stay exact after a student leaves the class. Not needed for the
   first version.
2. **`improved` on the daily board.** The rising arrow compares against the
   previous period, which on `오늘` means yesterday. For a student whose class
   met yesterday and not today that comparison is noise. Options: suppress the
   arrow on `오늘`, or compare against the same weekday. Suppressing is the
   cheaper first answer.
