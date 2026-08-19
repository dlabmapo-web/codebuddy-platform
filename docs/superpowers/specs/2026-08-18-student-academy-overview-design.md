# Student Academy Overview

**Date:** 2026-08-18

**Status:** Draft for review

**Scope:** A student-facing academy overview at the academy root, and the
first student-visible class comparison

**Companion designs:**

- `2026-08-14-teacher-overview-student-analytics-redesign.md`
- `2026-08-18-manager-control-tower-and-scalable-people-operations-design.md`
- `2026-08-11-student-class-pages-design.md`
- `2026-08-12-student-answer-records-and-course-hierarchy-design.md`
- `2026-08-07-v2-student-feedback-delivery-design.md`

**Amends:** `2026-08-11-student-class-pages-design.md` §4, which reserves
ranking and in-class comparison for "their own later design". This is that
document, and §9 answers the questions it named — scope, period, scoring, ties,
identity visibility, and teacher controls. Its other non-goals stand.

## 1. Decision

Give the student the third answer at the academy root.

`/studio/academies/:academyId` already answers to two audiences and redirects
the third. A `TEACHER` gets the teaching overview, a `MANAGER` gets the control
tower, and a `STUDENT` is bounced to the course catalog. The Overview link is in
their sidebar, they click it, and they arrive somewhere else.

The student overview is built around one question, the way the other two are:

> What should I work on now, and how am I doing?

It is a starting page, not an analytics workspace. It opens the work the student
was already doing, states their own measurements with the denominators that make
them readable, and hands off to the surfaces that already own the detail — the
course outline, the workspace, Answer records.

It reads as one product with the teacher's and the manager's pages: one column,
full width, top to bottom, no two sections side by side, the same panel
primitives, the same period vocabulary, the same rule that a failing aggregate
says so in its own space rather than printing a zero.

It is not those pages turned inward. A teacher's page prioritizes thirty
children; a manager's page prioritizes an institution. A student's page has one
subject, and that subject is nine years old. The measurements are the same
measurements — deliberately, so a student and their teacher never read different
numbers for the same week — but nothing on this page ranks a child against a
standard, labels them, or tells them they are behind.

## 2. What exists today

| Fact | Evidence |
|---|---|
| The academy root branches on role and redirects `STUDENT` | `packages/web/src/app/(v2-studio)/studio/academies/[academyId]/page.tsx:51` |
| The Overview nav link renders for every role, students included | `_components/studio-sidebar.tsx:274` |
| Panel, ledger, meter, and em-dash primitives are already shared above both overviews | `_components/overview-ui/panel.tsx` |
| Period arithmetic, score definition, and thresholds are pure and reusable | `packages/shared/src/content/teacher-overview.ts` |
| A student's own progress, drafts, courses, classes, and records each have a working procedure | `packages/api/src/learn/learn.router.ts` |
| Counted active learning is already projected per student, course, and academy-local day | `StudentCourseLearningDay`, `packages/api/prisma/schema.prisma:1330` |
| Teacher feedback is durable and has a per-message read state | `TeacherFeedback.readAt`, `packages/api/prisma/schema.prisma:1256` |
| …but a student can only ever see it inside one exercise workspace | `monitoring.listMyFeedback` takes a `materialId`; no list surface exists |
| `bestScore` was designed to be summable for a future comparison | schema comment, `packages/api/prisma/schema.prisma:1191` |
| No student-facing aggregate procedure exists | no read in `learn.router.ts` returns more than one course or one exercise |

Two of these are the load-bearing ones. The measurements this page needs are
already computed, tested, and indexed — this is an assembly and a presentation,
not a new analytics system. And teacher feedback written to a child today is
readable only if that child reopens the exact problem it was written on, which
is a delivery gap this page closes on the way past.

## 3. Goals

- Answer "what should I work on now" above the fold, in one click.
- State the student's own measurements — solved, attempted, score, time, days —
  each with the denominator that makes it readable.
- Use the *same* definitions the teacher's page uses, so the two never disagree.
- Surface teacher feedback outside the workspace it was written in.
- Give the student a truthful, bounded picture of where they stand in their
  class, without naming a classmate or creating a permanent rank.
- Make every section a hand-off to a surface that already owns the detail.
- Reuse the existing panel primitives, period vocabulary, and partial-failure
  behavior rather than growing a third visual language.
- Ship English and Korean, accessible chart equivalents, keyboard access,
  responsive one-column behavior, and dark mode.

## 4. Non-goals

- A permanent, academy-wide, or all-time rank.
- Any student-visible classmate name, avatar, username, email, or membership id.
- Points, badges, levels, streak flames, prizes, or unlockables.
- An opaque engagement, ability, effort, or risk score.
- Ranking on active learning time (§9.3 states why).
- Telling a student they are behind, weak, slow, at risk, or failing.
- A student-facing view of another student's work, code, records, or progress.
- Guardian or parent access, notifications, or reports.
- Replacing My Courses, the course outline, Answer records, or the workspace.
- Predictive recommendations or AI-selected next problems in the first version.
- A new denormalized summary table, projection, or cron in the first version.

## 5. Roles and authorization

The page requires an active `STUDENT` membership in the requested academy. It
uses `access.studentAuthenticated`, the middleware every existing `learn`
procedure already uses.

- A `TEACHER`, `TEAM_LEAD`, or `MANAGER` opening the root keeps their current
  page. There is no role that sees a student's overview but the student.
- Staff curriculum preview does not grant this page, for the same reason it does
  not grant Answer records.
- Every scoped identifier is derived from the identity, never accepted as input.
  The response is about the caller and there is no parameter that could make it
  about anyone else — the same rule `listMyFeedback` already enforces, and for
  the same reason.
- Class standing (§9) additionally requires the academy feature flag. A student
  in an academy without it receives `standing: null`, not an empty section.

## 6. Information architecture

### 6.1 Route

```text
/studio/academies/:academyId
```

The existing `redirect` to `/learn/courses` is replaced by a fourth branch
rendering `StudentAcademyOverview`, alongside the teacher and manager branches
already there. The branch stays in the page rather than inside a shared
dashboard, for the reason that file already documents: a component that decided
its audience internally would be one edit away from handing a student surface to
a role the API would refuse.

`authDestination` (`packages/web/src/lib/academy-access-state.ts:74`) changes to
send a signing-in student here rather than to the catalog. The overview's first section is the work they were already doing, which
is strictly faster than the catalog they currently land on.

The Learning nav group is unchanged. My Courses remains the catalog and keeps
its own Continue drawer; both read `learn.listDrafts`, so the duplication is a
second presentation of one fact, not a second fact.

### 6.2 URL state

```text
range={7d|30d|all}
```

The default is `30d`. This is the one place the student page deliberately
departs from the teacher's `7d`: a student attends one or two lessons a week, so
a seven-day window shows an empty page to a child who is doing fine. `7d` and
`all` remain selectable and deep-linkable.

There is no class or course filter. A student's whole scope is small enough to
read at once, and a filter bar above a page whose job is "open my work" would be
furniture in front of the door. Invalid values canonicalize with `replace`, as
elsewhere.

The response prints the exact academy-local start date, end date, and timezone,
plus `Tracked since <date>` beside active learning — time before the projection
existed is never reconstructed and must not read as a decline.

## 7. Page design

### 7.1 Visual direction

The subject is a child of about nine to thirteen opening the app at the start of
a lesson. The page's visual job is *resumption*, not celebration and not
assessment.

Reuse the Studio palette and the existing `Panel` tones. The panel primitive
already fixes the rule this page most needs: colour identifies a section or a
measurement, never a child. There is no green student and no red student on the
teacher's page, and there is none here.

Section tones, in page order:

| # | Section | Tone | Question |
|---|---|---|---|
| 1 | Continue | `primary` | what do I open |
| 2 | My learning | `brand` | how much have I done |
| 3 | My courses | `success` | how far along am I |
| 4 | My time | `teal` | when did I work |
| 5 | From my teacher | `peer` | what was I told |
| 6 | Worth another look | `warning` | what is not finished |
| 7 | Class standing | `brand` | where am I in my class |
| 8 | Recent attempts | none | what did I do last |

Class standing gets the quietest tone available and no rail accent, on purpose.
It is the one section that could read as a prize, and the palette should not
help it.

Avoid: a gradient hero, a trophy, a podium, confetti, medals, flame or streak
iconography, a large avatar, four equal cards before the primary action, and any
empty chart area reserved for data that is not there.

### 7.2 Header

```text
Overview
Pick up where you left off.
```

The header carries the student's academy-scoped display name, their class or
classes with the effective assigned teacher, the range control, the effective
period and timezone, and an `Updating` state during refetch. Class and teacher
come from `learn.listClasses` and carry no roster data, per the class pages
design.

### 7.3 Continue — the signature surface

The first content section, and the only one with a large primary action.

It resolves, in order:

1. the most recent draft — problem title, course, module → lecture, when it was
   last touched, and `Continue`;
2. failing that, the next unsolved visible exercise in the course with the most
   recent activity — same shape, labelled `Start`;
3. failing that, the first exercise of the first available course, labelled
   `Start learning`.

At most three rows: the primary and two more recent drafts. The full drawer
stays on My Courses. A student with no available course at all gets the
catalog's existing empty state, not an empty panel.

Every row links to the workspace with the material id already in the path, so
the click lands in the editor rather than in an outline.

### 7.4 My learning — the ledger

One compact full-width ledger, mirroring `metrics-ledger.tsx`, not five hero
cards. Five measurements, each carrying its own denominator and its own
missing-data disclosure:

#### Problems solved

Distinct visible exercises with at least one passing submission in the period,
over distinct exercises attempted in the period. Both numbers are shown.

#### Average score

The student's period-aware average best score, defined in §8.1. Displayed with
the attempted-problem count beside it, because 100% on one problem and 100%
across twenty are not the same claim. A student with no scored attempt sees an
em dash and an explanation, never `0%`.

#### Learning time

Counted active seconds in the period, formatted as hours and minutes, with the
raw value available to assistive technology, and `Tracked since <date>` when the
period starts before the projection did.

#### Active days

Academy-local calendar days in the period with at least one counted interval,
over the days the period contains. Presented as a count, not a streak: `12 of 30
days` is a fact, and `12 day streak 🔥` is a reward mechanic §4 rules out.

#### Accepted rate

`PASSED / (PASSED + FAILED)` for submissions in the period, matching the
definition Answer records already prints so the two pages agree. Judge faults
and cancelled work are not attempts.

### 7.5 My courses

One row per available course: title, a progress meter of solved over visible
exercises, the module → lecture the student last worked in, and a link to the
next unsolved exercise.

Numbers come from `learn.listCourses`, which already returns `progress` and
`counts`. They are not recomputed here. A dashboard that derived its own copy
would eventually disagree with the catalog the student can see on the next
screen.

Courses reachable through more than one class appear once, preserving the
catalog's existing deduplication.

### 7.6 My time

A bar per academy-local day in the period: counted active minutes, with
submissions as a second series. It is the student-facing sibling of the
teacher's participation chart and reads from the same projection.

Above 30 days the chart aggregates to weeks rather than shrinking bars past
legibility. It carries an accessible table with the complete returned series and
a one-sentence text summary, as every chart in this product does.

The section states what the measurement is: time actively working in Cove. It is
not attendance, it is not time signed in, and the page says so in a sentence
rather than leaving a child to infer that a number went down because they were
away from a screen.

### 7.7 From my teacher

At most five, newest first, each with its exercise label, its text, and a link
into that exercise.

Ordering is by date alone. An earlier draft put unread ahead of read so that
nothing could be missed; in a list that prints a date on every row, that reads
as a sorting bug rather than as emphasis. Unread messages are carried by the
count in the section header and by a marker on the row, which does the same job
without making the dates lie.

This section closes the delivery gap named in §2: today a message is readable
only from inside the workspace it was written on. Opening a message marks that
exercise's thread read through the existing `markMyFeedbackRead`, so the badge
here and the badge in the workspace are one state.

The author stays anonymous — `Teacher`, no name and no initial — preserving the
deliberate divergence the feedback delivery design already documents.

The section renders nothing at all when there has never been a message. A child
with no feedback should not see an empty inbox implying one was expected.

### 7.8 Worth another look

The student-facing counterpart of the Teaching queue, and the section where the
wording matters most.

At most three exercises the student has started and not finished, selected by
the same factual rules the teacher's page uses — repeated failed attempts,
in-progress work stalled for seven full days, a long measured solve on the
latest failed attempt — reusing `consecutiveFailures` and the attention rules in
`packages/shared/src/content/teacher-progress.ts`.

What the teacher's page prints as a reason, this page prints as a to-do. The row
says what the exercise is, when it was last attempted, and `Try again`. It does
not print the reason kind, the failure count, or the measured solve minutes: the
teacher needs the evidence because they are deciding where to spend a lesson,
and the child needs the door.

Never a label, never a severity, never a count of failures. The schema for this
row has no field that could carry one.

### 7.9 Class standing

See §9.

### 7.10 Recent attempts

Five most recent submissions — problem title, verdict, score, when — and a link
to Answer records. A preview of a page that already exists, sharing its
definitions.

## 8. Measurement definitions

### 8.1 Score

Identical to §7.4 of the teacher redesign, deliberately:

```text
average best score =
  sum(best score for each attempted visible problem)
  / number of attempted visible problems
```

For `7d` and `30d`, a problem's best score is the maximum immutable submission
score created inside the period at the current grading revision. For `all`, the
`StudentExerciseProgress.bestScore` projection may serve it directly.

`averageBestScore` and `meanOfScores` in
`packages/shared/src/content/teacher-overview.ts` already implement this. This
page imports them; it does not restate them. A student and their teacher reading
different averages for the same week would be a defect neither could diagnose,
and one function is how that stays impossible.

An unattempted problem is never a zero. A missing score is an em dash with a
spoken label.

### 8.2 Active learning

The same counted seconds the teacher's ledger reports, read from
`StudentCourseLearningDay` by `membershipId`. The measurement, its heartbeat
cap, and its interval rules are unchanged and live in §8.3 of the teacher
redesign.

### 8.3 Period

`resolveOverviewPeriod` unchanged, with `30d` as the student default. The
response carries the full `OverviewPeriod` — range, timezone, start and end
dates, start and end instants, and counted days — so a screenshot stays readable
next month.

## 9. Class standing

### 9.1 What it is, and what it is not

A student sees, for one class, one course scope, and one period: how many
students are in the comparison, where they sit in it, and the measurements of
the positions near them.

It is not a leaderboard. The distinction is structural rather than editorial:

- **No identity.** A standing row has no name, no display name, no membership
  id, no user id, and no avatar. The schema has nowhere to put one. Turning this
  into a named leaderboard is not a UI change, it is a deliberate edit to a
  contract whose doc comment says why it must not happen — the same technique
  §4 of the teacher redesign uses to keep an opaque risk score from growing into
  the queue.
- **No permanence.** The standing is a function of the period and course
  currently on screen, recomputed per request, never written to a table.
- **No tail.** The section shows the top three and the student's own
  neighbourhood — their position and the two on either side. It never renders a
  complete ordered list, because a complete list ends, and something has to be
  last.

### 9.2 The exposure decision

Three exposure levels were considered. This document specifies the middle one.

| | Shows | Status |
|---|---|---|
| A. Band only | "Top 25% of your class this month" | Available as a per-academy setting; §9.7 |
| **B. Anonymous standing** | Position, count, and the neighbouring measurements | **Specified here** |
| C. Named leaderboard | Classmate display names | Out of scope; §4 and §9.1 |

B is the default because it answers the question a student actually asks —
*am I keeping up?* — with the smallest amount of information about other
children that can answer it. A is available for academies that want less. C
would contradict the class pages design's rule that a student surface shows no
classmate identity, and this document does not open it.

### 9.3 What it ranks

Ordering, in order:

1. distinct problems solved in the period, descending;
2. average best score, descending;
3. active days in the period, descending;
4. membership id ascending — used only as a stable tiebreak, never emitted.

**Active learning time is deliberately not an ordering key.** A child who
understands the material solves the same problem in less time, and a ranking on
minutes would place them below a child who struggled. Time appears on the page,
in §7.6, as their own history. It never decides a position.

Equal measurements share a position. The next position skips accordingly, the
way competition ranking normally does.

### 9.4 Floors

Standing renders only when all of these hold, reusing the constants that already
exist:

- the class has at least `MIN_STUDENTS_FOR_COMPARISON` (3) active enrolled
  students with any activity in the period;
- the requesting student has attempted at least `MIN_ATTEMPTED_TO_INTERPRET`
  (3) visible problems in the period.

Below either floor the section explains what is missing and shows the student's
own progress instead. It never shows a position out of two, and it never shows a
position to a student who has barely started — the first thing that child would
learn from this product would be that they are last.

### 9.5 Scope

One class and one period. Where the student is enrolled in more than one class,
the section defaults to the class with the most recent activity and offers the
others as a selector.

Never academy-wide and never all-time. A student who joined in March cannot
catch a student who joined in September, and a standing they cannot move is not
information, it is a verdict.

### 9.6 Response shape

```text
standing: null                      -- feature not enabled for this academy
standing: { eligible: false, reason }
standing: {
  eligible: true,
  classId, className, courseId | null, period,
  participants,                      -- how many students are in the comparison
  yourPosition,
  top:          [ { position, solvedProblems, averageScore, activeDays, isYou } ],
  neighbourhood:[ { position, solvedProblems, averageScore, activeDays, isYou } ]
}
```

`isYou` is the only thing that distinguishes one row from another. There is no
field a future edit could fill with a name without changing this schema on
purpose.

### 9.7 Academy control

Standing is off by default and enabled per academy through the existing
`AcademyFeatureFlag` table. Add `STUDENT_CLASS_STANDING` to the `AcademyFeature`
enum, beside `TEACHER_LIVE_MONITORING`.

The flag is read in the access service, before any aggregate runs. A disabled
academy costs nothing to compute and returns `null` — distinguishable in the
schema from "enabled but not enough students", so the UI can stay silent in one
case and explain itself in the other.

Whether the flag is set by a manager UI or by seed is out of scope here; the
flag switchboard is already named as deferred work in the platform
administration design.

## 10. Contract and module architecture

### 10.1 One bounded read

```ts
learn.getOverview({ academyId, range?, standingClassId? })
  -> StudentAcademyOverview
```

One procedure, one instant, for the reason both existing overviews state: eight
independently clocked reads would let the ledger, the chart beneath it, and the
standing below that describe three different moments while sitting on one
screen, and a student comparing them would be right that they disagree.

Class standing is a nullable field inside that payload rather than its own
procedure. Splitting it would buy authorization isolation the access service
already provides and cost the single-instant guarantee.

The namespace cannot name a mutation. Marking feedback read continues to use the
existing `monitoring.markMyFeedbackRead`; the overview does not grow a second
way to do it.

Every array is capped by its schema. No range value turns this into an export.

### 10.2 Where the code goes

| Concern | Location |
|---|---|
| Thresholds, ordering, standing arithmetic, schemas | `packages/shared/src/content/student-overview.ts` |
| Contract | `packages/shared/src/api/orpc/learn.contract.ts` |
| Authorization, scope, feature flag | `packages/api/src/learn/student-overview-access.service.ts` |
| Aggregates | `packages/api/src/learn/student-overview.repository.ts` |
| Assembly, one timestamp, partial failure | `packages/api/src/learn/student-overview.service.ts` |
| Wiring | `learn.module.ts`, `learn.router.ts` |
| Page branch | `studio/academies/[academyId]/page.tsx` |
| Components | `_components/student-overview/*` |
| Primitives | `_components/overview-ui/panel.tsx` — reused, not forked |
| Copy | `packages/i18n/src/locales/{en,ko}/learn.json`, under `overview.*` |

The shared file mirrors `teacher-overview.ts` in kind: thresholds named once,
ordering as pure functions, period arithmetic outside SQL and outside React. A
rule that lives in a query cannot be tested at its boundaries, and a rule that
lives in a chart component is a rule the accessible table will state
differently.

It imports the score, period, and attention functions from `teacher-overview.ts`
and `teacher-progress.ts` rather than restating them. Where a definition is
shared, there is one definition.

### 10.3 Partial failure

```ts
studentOverviewSections = [
  "continue", "ledger", "courses", "activity",
  "messages", "practice", "standing", "records",
]
```

Each aggregate settles independently against the one request timestamp. A
failing aggregate adds its code to `unavailable` and the section renders its own
retryable message while the rest of the page stands. A page that renders an
outage as an empty week is worse than an error, because a child would believe
it.

The header — identity, classes, period — is the page's core claim. Its failure
is a retryable page-level error, matching the manager page's treatment of
academy identity.

## 11. Data model

No new table, column, migration, or denormalized summary.

One enum value: `AcademyFeature.STUDENT_CLASS_STANDING`.

Every read this page needs already has an index that serves it:

| Read | Index |
|---|---|
| The student's progress | `student_exercise_progress @@unique([userId, materialId])`, `@@index([userId, status])` |
| Recent attempts, accepted rate | `submissions @@index([userId, createdAt desc, id desc])` |
| The student's counted time | `student_course_learning_days @@index([membershipId, courseId, localDate])` |
| Feedback and unread count | `teacher_feedback @@index([studentMembershipRef, createdAt desc])` |
| Drafts | existing `exercise_drafts` lookup |

Class standing is the only class-wide aggregate: a roll-up over
`StudentExerciseProgress` for one class's enrolled memberships within one
period. At the stated platform scale — 10,000 total users, classes of tens —
this is a live `GROUP BY`. Should class sizes or academy counts make it
expensive, the fix is a daily projection keyed the way
`StudentCourseLearningDay` already is, and that is the moment to write it, not
now.

## 12. Failure and empty states

Each section owns a state proportionate to its measurement:

- no available course;
- no draft and nothing started;
- no activity in the period;
- no scored attempt;
- activity tracking began after the period start;
- no message ever received;
- standing disabled for this academy;
- too few students in the class to compare;
- too few attempts by this student to compare;
- one aggregate unavailable.

No section reserves a large blank chart. Each replaces it with a short sentence
and the next useful action. Authorization failure uses the Studio no-access
behavior, not an empty analytics state.

The copy rule for every empty state on this page: describe the data, never the
child. "No problems solved yet this month" is a fact about a period. "You
haven't done anything" is a sentence about a person, and this page does not
write those.

## 13. Performance

- One request per page load; the browser joins nothing.
- Aggregates execute in PostgreSQL and never load a full submission history into
  application memory.
- p95 below 1.0 second for a student with 2,000 submissions in a class of 100.
- The activity series is bounded by the period; standing is bounded by §9.1's
  top-three-plus-neighbourhood projection, computed server-side — the full
  ordered class never reaches the browser.
- Structured timings per section, with the range and any failure code, and no
  student PII.

## 14. Accessibility, responsive behavior, and localization

- English and Korean ship together, under `learn.json` `overview.*`.
- Every chart has an equivalent table and a one-sentence text summary.
- Colour is never the only signal; every tone pairs with an icon and a label.
- Durations, scores, positions, and dates use the tabular-figure treatment.
- Keyboard access and visible focus on the range control, the class selector,
  every link, and every retry.
- One column on mobile in the specified order; the Continue action stays first
  and reachable without scrolling on a phone.
- Dark mode through existing tokens.
- No new font dependency.

## 15. Privacy

This page is read by children, and two rules follow from that rather than from
the threat model.

1. **No student learns anything identifying about another student.** The
   standing schema cannot carry a name. The class detail page already refuses a
   roster. Nothing here reintroduces one.
2. **No measurement on this page becomes a judgement about a person.** No
   labels, no bands, no severity, no risk, no adjectives. Sections carry colour;
   children do not.

Beyond those: hidden test cases remain structurally absent from every student
contract, as they are today. The response is derived from the caller's identity
and accepts no parameter that could aim it at another student. Standing is
off unless an academy turns it on.

## 16. Verification

### 16.1 Pure tests — `packages/shared`

- Period resolution at the `30d` default, across a timezone boundary, and at
  local midnight.
- Score: unattempted excluded from the denominator; no attempts yields null, not
  zero; the `7d` value differs from the `all` value when the lifetime best
  predates the period.
- Standing order: solved, then score, then active days; equal measurements share
  a position and the next position skips; membership id breaks the tie
  deterministically and never appears in output.
- Standing floors: below three students, and below three attempts, each return
  the correct ineligible reason.
- Neighbourhood selection at the first position, the last position, and in a
  class of exactly three.
- A schema test asserting the standing row rejects any unknown key — the
  structural guarantee in §9.1 is only real if something checks it.

### 16.2 Service tests — `packages/api`

- A student in two classes sees deduplicated courses and time counted once.
- A disabled feature flag returns `standing: null` and runs no class-wide query.
- One failing aggregate marks its section and leaves the others populated.
- Every section shares one `generatedAt`.
- A `TEACHER`, `TEAM_LEAD`, and `MANAGER` are each refused.
- An academy id the caller has no membership in fails closed.
- The overview's average score equals the teacher overview's value for the same
  student, class, course, and range. This is the test that keeps §8.1 honest.

### 16.3 Web and e2e

- `e2e/specs/student-academy-overview.spec.ts`: a student signing in lands on
  the overview; Continue opens the draft they left; a range change updates the
  URL and keeps prior values visible while updating; standing is absent when the
  flag is off.
- Component tests for each empty state, including the two standing-ineligible
  reasons.
- Korean parity check on the new `overview.*` subtree.

## 17. Delivery stages

Both stages belong to this design; staging controls risk, not scope.

**Stage 1 — the page.** Sections 1 through 6 and 8: Continue, the ledger, course
progress, activity, teacher messages, worth another look, recent attempts. The
route branch, the contract, the service, and the copy. Everything in this stage
reuses an existing measurement and adds no enum value and no flag.

**Stage 2 — class standing.** §9 in full: the enum value, the access-service
flag read, the aggregate, the schema, and the section. Shipped separately
because it is the only part that shows a student anything about anyone else, and
it should be reviewed on its own.

## 18. Open questions

1. **Does a student get to turn standing off for themselves?** The academy
   controls whether it exists. A child who finds it discouraging currently has
   no way to hide it, and a per-student preference needs a home — plausibly My
   Page — that this document does not create.
2. **Should a teacher see what their students see?** A teacher cannot currently
   preview this page, and a parent asking "what does my child see" has no
   answer. A read-only preview is a small addition and a real authorization
   question.
3. **Stage 1 default range.** `30d` is argued in §6.2 from lesson frequency. It
   is worth checking against real academy schedules before it ships, because the
   choice decides whether the page looks alive on a Monday.
