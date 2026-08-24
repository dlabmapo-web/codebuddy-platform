# Class-Scoped Points Attribution

- Status: approved
- Date: 2026-08-24
- Amends [Student Points and Class Ranking](./2026-08-21-student-points-and-class-ranking-design.md)
- Applies to [Overview Ranking Preview](./2026-08-24-overview-ranking-preview-design.md)

## 1. Decision

Every point used in a class ranking belongs to exactly one class. The class is
the validated learning context in which the student did the work, not a class
inferred later from the current roster.

Points are still earned for the reasons and at the rates already approved:
attendance, counted learning-time tiers, first solves, and lecture, module, or
course completion. Rank remains the result of those points. A ranking position
never awards more points.

This corrects §10.7 of the original design. The previous rule carried one
academy-wide period total into every class a student joined. That made the
roster class-scoped but left the number being ranked academy-scoped, so a
student in two classes could show the same points in both even when their work
in the classes differed.

## 2. Invariant

For a selected class and period, every displayed number is derived only from
records carrying that class:

```text
class total
  = solve awards for class
  + completion awards for class
  + learning-time awards for class
  + attendance awards for class
```

The same scope governs the student's plate, leaderboard rows, active days,
learning minutes, and ledger. Changing the class changes the entire
calculation, not only the roster.

`StudentPointBalance` remains the academy-wide sum of all earned awards. It is
an internal balance for future rewards, not a number displayed beside a
class-scoped ranking.

## 3. Authoritative class context

### 3.1 Resolution

A shared server-side resolver accepts academy, student, course, and requested
class. It returns one class only after proving that:

- the academy, class, and student membership are active;
- the student is actively enrolled in the class; and
- the course is currently assigned to the class.

An invalid or unauthorized class is rejected without revealing whether another
class exists. A client-provided id is a request to validate, never proof of
access.

When a learning URL has no class:

1. If exactly one enrolled class provides the course, resolve it automatically.
2. If more than one class provides the course, require the student to choose.
3. If none provides it, reject the point-producing learning session.

### 3.2 Navigation

Class-to-course, course-to-exercise, resume, and continue-learning links carry
`classId`. The exercise workspace keeps it through solve-session creation,
activity heartbeats, and submission. Refreshing or following a bookmark does
not silently change it.

The overview ranking selector is read-only scope. Changing it does not change
the class of an exercise already open elsewhere.

## 4. Data flow

```text
class/course link
  -> validated learning class
  -> activity and submission retain classId
  -> award retains classId
  -> class-filtered aggregate
  -> points plate, board, preview, and ledger
```

`Submission` stores the validated class so the asynchronous judge does not
reconstruct context from a roster that may have changed. The judge awards the
solve and completion cascade to that stored class.

If two classes share one course, the class chosen before entering the workspace
owns the work. A first solve still pays once globally and is not copied into
the other class. A completion belongs to the class of the solve that completed
it.

## 5. Learning time

Keep `StudentCourseLearningDay` unchanged for existing academy and course
reports. Add a separate class-aware daily projection, conceptually:

```prisma
model StudentClassCourseLearningDay {
  academyId       String   @db.Uuid
  membershipId    String   @db.Uuid
  classId         String   @db.Uuid
  courseId        String   @db.Uuid
  localDate       DateTime @db.Date
  activeSeconds   Int
  activeIntervals Int
  firstActiveAt   DateTime @db.Timestamptz(6)
  lastActiveAt    DateTime @db.Timestamptz(6)

  @@id([academyId, membershipId, classId, courseId, localDate])
  @@index([classId, localDate, membershipId])
}
```

One accepted activity flush updates both projections in the same transaction.
The existing projection answers academy/course reporting. The new projection
answers class minutes, active days, attendance evidence, and ranking enrichment.

The 30, 60, and 120 minute tiers are cumulative independently per class per
academy-local day. Thirty minutes in Class A and thirty minutes in Class B can
earn the first tier in each. No interval is copied: its validated class decides
which class projection receives it.

## 6. Awarding and caps

Every new award created by solve, completion, learning time, or attendance must
carry `classId`. `PointAward.classId` remains nullable only so unresolved
historical rows can remain truthful in the personal ledger.

The learning-time idempotency key includes class:

```text
{membershipId}:{classId}:{localDate}:TIME:{tier}
```

Solve and completion keys remain globally once-per-fact. Their stored award
receives the class from the validated submission that first made the fact true.
Attendance already keys and stores its scheduled class.

The daily earn cap is evaluated per membership, class, and academy-local day.
Reaching the cap in Class A cannot suppress valid points in Class B. The academy
balance still increments by every written class award.

## 7. Ranking and ledger reads

The canonical leaderboard builder passes the selected `classId` to every
aggregate:

- `PointAward` totals filter by academy, class, roster memberships, and period;
- learning minutes and active days read the class-aware projection;
- the participation floor uses activity from the selected class; and
- previous-period movement compares the same class.

The overview preview continues to slice the canonical board. It does not gain a
second calculation.

On the complete student points page, one selected class scopes the period
plate, board, gap, learning measurements, and ledger rows. Staff class boards
and their student-ledger links use the same class. An all-class personal ledger
may remain available as a separate view, but it cannot be presented as the
receipt for one class total.

## 8. Historical data

A migration backfills only records whose class can be determined without a
guess:

- keep awards that already carry a class;
- for a classless row with a course, find the student's retained enrollments
  whose class-course assignment predates the row;
- assign the row when exactly one class matches; and
- leave zero-match or multi-match rows classless.

The same rule may seed the new class learning-day projection from an old
course-day row only when exactly one class matches. Ambiguous history stays in
the academy balance and personal all-class ledger but is excluded from every
class ranking.

Development fixtures write explicit class ids and intentionally use different
activity patterns per class. Cove Student must therefore have visibly different
class totals when the underlying work differs.

## 9. Errors and compatibility

- A direct link with one valid class continues without interruption.
- A shared-course link with no class renders **Choose a class to continue**.
- An inactive, unenrolled, or course-mismatched class is rejected before a
  solve session, activity flush, or submission can produce points.
- Old classless awards remain readable and are never deleted or guessed.
- A class aggregate failure remains local to the ranking surface.
- Feature flags and role authorization remain unchanged.

## 10. Verification

### 10.1 Resolution and security

- One matching class resolves automatically.
- Multiple matching classes require an explicit choice.
- Invalid enrollment and mismatched course/class pairs are rejected.
- A modified submission cannot redirect an award to another class.

### 10.2 Awarding

- Solve and completion awards retain the submission class.
- A shared-course solve pays once in the chosen class only.
- Two classes independently reach learning-time tiers on the same day.
- Two classes independently apply the daily cap.
- Attendance continues to use the scheduled class.

### 10.3 Aggregation and migration

- Class A totals never include Class B awards or learning time.
- Plate, board row, active days, and ledger reconcile for one class.
- Changing class changes the complete calculation and preview.
- Safe history is backfilled; ambiguous history remains null and excluded.
- The academy balance equals all non-voided awards across classes.

### 10.4 Product verification

- Cove Student can show four solved problems in one class and eight in another,
  with different totals and ranks.
- The overview preview and complete ranking agree for the same class and day.
- Direct, resume, class, course, and exercise navigation preserve class context.

## 11. Delivery order

1. Add class-context contracts, resolver, and authorization tests.
2. Add submission class storage and the class learning-day projection.
3. Carry class through navigation, solve sessions, activity, and submissions.
4. Make every award and cap class-aware.
5. Backfill safe history and update development fixtures.
6. Filter the canonical board, plate, learning measurements, and ledger.
7. Verify both overview and complete ranking across student and staff roles.

## 12. Settled decisions

- Explicit learning context is the source of class attribution.
- Missing context auto-resolves only when exactly one class is valid.
- Ambiguous links require a class choice.
- Learning-time tiers and daily caps are independent per class.
- Existing point reasons and rates do not change.
- Ranking position awards no points.
- Historical rows are backfilled only when attribution is unambiguous.
- Academy balance remains the sum across classes.

## 13. Open questions

None for implementation.
