# Teacher Overview and Student Analytics Redesign

**Date:** 2026-08-14

**Status:** Draft for review

**Scope:** A from-scratch teacher-facing academy overview, a dedicated student
analytics page, active-learning measurement, and student inactivity logout

**Replaces when approved:**
`2026-08-13-teacher-academy-overview-design.md` for overview information
architecture and presentation. Its authorization, pair-preserving scope,
durable activity accumulation, and aggregate-query correctness requirements
remain valid unless this document explicitly changes them.

**Companion designs:**

- `2026-08-12-teacher-solution-status-design.md`
- `2026-08-12-student-answer-records-and-course-hierarchy-design.md`
- `2026-08-06-v2-live-terminal-mirroring-design.md`

## 1. Product decision

Rebuild the teacher academy overview around one question:

> Who needs the teacher's attention, and what should the teacher teach next?

The overview is a concise decision page, not the complete analytics workspace.
It shows full-width sections in a single vertical reading order and provides
short, useful previews. A new **Student analytics** page owns detailed student
lists, teacher-private score ordering, active-learning time, and deep filters.

The redesigned overview contains:

1. page title, scope, effective dates, and filters;
2. a Teaching queue containing the students who should be checked first;
3. a compact metrics ledger for students, courses, active-learning time,
   active days, and average score;
4. the CEO-required Student participation graph;
5. a five-student score-order preview;
6. a five-student active-learning-time preview;
7. Curriculum readiness, lowest three;
8. Difficult problems, top five; and
9. links from every preview to a dedicated authorized detail view.

The page does not place two independent sections side by side. Every section
occupies the available content width and appears below the previous section.
Small metrics may form one horizontal ledger inside their single section.

## 2. Audience and jobs

The primary user is an elementary coding-academy teacher responsible for one
or more assigned classes. The interface is teacher-private.

The overview must let the teacher answer, in order:

1. How many students and courses are in the current scope?
2. Which students should I check first?
3. How much did students use the learning app?
4. How much work did they submit and solve?
5. Who currently has the highest measured scores in this scope?
6. Which lectures are least ready to continue?
7. Which problems are difficult for the most students?

The Student analytics page must let the teacher answer:

1. What is each student's score, active-learning time, activity recency,
   submission volume, and solved count?
2. How does the order change for a specific class, course, module, lecture, or
   problem?
3. Which students have high results, low participation, or factual attention
   reasons?
4. What evidence produced each value?

## 3. Goals

- Keep the overview readable in under ten seconds.
- Show the totals explicitly requested by the product team: students, courses,
  learning time, active days, and score.
- Preserve Student participation and make its measurement understandable.
- Provide teacher-private contextual score ordering without exposing a public
  student leaderboard.
- Make all detailed student data filterable and sortable in TanStack Table.
- Measure active interaction rather than browser-open or login duration.
- Automatically end an inactive student login after 30 minutes, with a visible
  15-minute countdown warning.
- Reuse current V2 authorization, progress, submission, curriculum, and daily
  activity foundations when they satisfy this specification.
- Ship English and Korean, accessible chart/table equivalents, responsive
  behavior, dark mode, observability, and tests.

## 4. Non-goals

- A ranking shown to students, parents, or other students.
- Rewards, badges, prizes, or public competition based on rank or app time.
- A permanent academy-wide rank independent of the teacher's current filters.
- Treating active-learning time as attendance or proof of physical presence.
- Counting an open background tab or the 30-minute logout grace period as
  learning.
- An opaque engagement, ability, or risk score.
- Predictive AI recommendations in the first version.
- Teacher-authored grades or manual score changes.
- Cross-academy management analytics.
- Reusing the V1 Supabase dashboard implementation.

## 5. Information architecture

### 5.1 Routes

Teacher academy overview:

```text
/studio/academies/:academyId
```

Student analytics:

```text
/studio/academies/:academyId/teach/students
```

Existing class Solution status remains:

```text
/studio/academies/:academyId/teach/classes/:classId/progress
```

Add **Student analytics** under the Teaching navigation group. The overview's
`View all students` and section-specific links open the new page with the
current filters encoded in the URL.

### 5.2 Role behavior

- `TEACHER` sees analytics only for currently assigned active classes.
- `STUDENT` continues to redirect to the student learning experience.
- `MANAGER` retains the management-oriented academy overview.
- A teacher with no assigned class sees a purposeful empty state linking to My
  classes, not zero-valued charts.
- The inactivity logout in this document applies to student learning sessions.
  Staff session policy is separate.

### 5.3 Overview URL state

```text
class={classId|all}
course={courseId|all}
range={7d|30d|all}
```

Defaults are `class=all`, `course=all`, and `range=7d`. Class selection limits
the course options. Changing class clears an out-of-scope course. Invalid or
unauthorized values are removed with replace navigation.

The page prints the exact academy-local start date, end date, and timezone.
`all` means all data available inside the current authorized scope. Active
learning also displays `Tracked since <date>` because time predating the daily
projection is not reconstructed. An old `participation` parameter from the
superseded overview is removed during canonicalization because the redesigned
overview has one required participation view.

### 5.4 Student analytics URL state

```text
class={classId|all}
course={courseId|all}
module={moduleId|all}
lecture={lectureId|all}
problem={materialId|all}
range={7d|30d|all}
sort={score|activeTime|lastActive|submissions|solved|name}
direction={asc|desc}
page={positive integer}
pageSize={25|50|100}
search={student name}
attention={reason|all}
```

Filters are dependent:

```text
class -> course -> module -> lecture -> problem
```

Changing an ancestor clears unauthorized or incompatible descendants. The
server returns already-authorized options; the browser never infers access.
The complete state is deep-linkable and survives reload.

## 6. Overview page design

### 6.1 Visual direction

The subject is an elementary coding-academy teacher's daily teaching desk. The
page's visual job is prioritization, not decoration.

Use the established Studio palette:

- Cove blue `#1B64DA`: selected scope, navigation, and neutral progress;
- ink `#16181D`: headings and primary data;
- canvas `#F4F7FC`: page background;
- paper `#FFFFFF`: reading surfaces;
- action orange `#E8461C`: the single priority rail and urgent teacher action;
- progress green `#15803D`: a threshold met, never a “good student” label; and
- existing warning, danger, border, and dark-theme tokens for status states.

Pretendard Variable remains the display and body family because the same
interface must render Korean and Latin cleanly. Durations, ranks, scores, dates,
and chart axes use the project's tabular/monospace utility treatment. Do not add
a new font dependency solely for this page.

The signature surface is **Teaching queue**: a full-width prioritized list
with a narrow orange action rail. It replaces a generic marketing-style hero
and answers the teacher's first operational question. Other sections remain
quiet white reading surfaces so priority color retains meaning.

Avoid:

- a large gradient KPI banner;
- four equal “important” cards before the action list;
- nested card grids;
- two independent sections in one row;
- decorative illustrations unrelated to teaching;
- excessive rounded pills; and
- charts that occupy large empty areas when data is absent.

### 6.2 Page header and filter bar

The header uses plain copy:

```text
Teaching overview
See who needs support and what to teach next.
```

The filter bar contains Class, Course, and `7 days / 30 days / All time`. It is
sticky below the Studio header on desktop, but must not cover focused controls
or mobile content. It also displays the effective date range, timezone, roster
count, and an updating state.

Class and course filters apply to every section. The date range applies to
activity, submissions, scores, difficult problems, and attention evidence.
Roster and course totals are current scope facts, and Curriculum readiness is
an explicitly labeled current snapshot; neither should pretend to be a
historical snapshot the data model did not record. During refetch, keep prior
values visible at reduced emphasis, label the page `Updating`, and disable
stale drill-down links.

### 6.3 Teaching queue — students to check first

This is the first content section. Show at most five students with:

- student name and class;
- one primary factual reason;
- supporting measurement;
- latest learning activity;
- relevant course/problem label when available; and
- `View progress` action.

Reasons reuse Solution status definitions plus factual participation reasons:

- repeated failed attempts;
- work stalled for seven full days;
- latest failed attempt after at least 30 measured solving minutes;
- no active learning or submission in the selected period; and
- active learning below the period-adjusted participation floor.

Order by reason priority, then most recent relevant evidence, then stable
student membership ID. Never label a child “bad,” “weak,” “lazy,” or “at risk.”
The header links to Student analytics filtered to students requiring attention.

### 6.4 Metrics ledger

Use one compact full-width ledger, not five disconnected hero cards.

#### Total students

Distinct active student memberships enrolled in the selected assigned classes.
A student in two selected classes is counted once in this academy-wide total.

#### Courses

Distinct currently visible courses assigned to the selected classes. The
caption states whether the number is distinct courses or class-course
assignments; the primary value is distinct courses.

#### Active learning time

Sum of de-duplicated scoped student-course daily active seconds in the selected
period. Display the total and average per enrolled student. Do not sum the same
student-course time twice when two selected classes share it.

#### Active days

The count of academy-local calendar days in the selected period with at least
one counted active-learning interval from any scoped student. Also display
`active students / enrolled students` as supporting context.

#### Average score

The mean of each scoped student's period-aware average best score defined in
§7.4. Students with no scored attempt are excluded from the numeric mean and
reported separately as `N without a score`. The interface must not silently
treat missing scores as zero.

### 6.5 Student participation

Preserve the grouped bar chart requested by the CEO:

- first series: number of submissions;
- second series: number of distinct solved problems; and
- category axis: student display name.

Both series use submissions created inside the selected period. A problem is
solved for this chart when the student has at least one passing submission for
that problem in the period; an old solve with no selected-period work does not
appear as new participation.

The title is **Student participation** and the description states the selected
scope and date range. The tooltip contains student, class when one class is
selected, submissions, solved problems, active-learning time, and average best
score.

For more students than fit without unreadable labels, use a horizontal
scrolling plot with a fixed minimum width. Do not silently show only the most
active students. Provide an accessible table with the complete returned set and
a direct link to Student analytics.

### 6.6 Score order preview

Show five students ordered by score for the current scope:

```text
Order | Student | Class | Average best score | Problems attempted | Last active
```

This is teacher-private contextual ordering. The order is recalculated whenever
scope, range, or curriculum filters change. It is not stored as a permanent
rank and is never exposed in student-facing APIs or UI.

Students without scored attempts appear after scored students with `—`, not
zero. `View full score order` opens Student analytics with `sort=score`.

### 6.7 Active-learning-time preview

Show five students ordered by active-learning time for the current scope:

```text
Order | Student | Class | Active learning | Active days | Last active
```

The section can switch between `Most active` and `Least active`, with the
choice encoded in the destination link. Time is formatted as hours and minutes;
raw seconds remain available to assistive technology. `View all activity`
opens Student analytics with the corresponding time sort.

### 6.8 Curriculum readiness — lowest three

Show the three lectures least ready to continue, full width. The section title
includes **Current readiness** because readiness describes present cumulative
curriculum progress, not only work created during the selected date range. Each
row contains:

- course, module, and lecture names;
- eligible student count;
- students who attempted;
- students ready;
- readiness percentage; and
- a progress drill-down.

A student is ready for a lecture when the student has solved at least 80% of
its visible scored exercises. Require at least three eligible students with
attempts before comparing a lecture. Otherwise show an explanatory
insufficient-data state rather than `0%`.

Sort by readiness ascending, then attempted-student count descending, then
curriculum position. Class and course filters apply; the 7/30/all control does
not rewrite current readiness and the UI states this exception beside the
section title.

### 6.9 Difficult problems — top five

Show five problems with the lowest distinct-student solve rate, then the most
students affected. Each row contains:

- course, module, lecture, and problem names;
- students attempted;
- students solved;
- solve rate;
- total submissions; and
- `View attempts` action.

Use only submissions created in the selected period. Require at least three
distinct student attempters. Repeated submissions by one student increase
submission volume but not the distinct-student denominator.

### 6.10 Empty and failure states

Every section owns a compact state appropriate to its measurement:

- no assigned classes;
- no enrolled students;
- no activity in the selected period;
- no scored attempts;
- insufficient students for comparison;
- activity tracking began after the selected range; and
- one optional aggregate unavailable.

Do not reserve a large blank chart area. Replace it with a short explanation and
the next useful action. Authorization errors use the Studio no-access behavior,
not an empty analytics state.

## 7. Student analytics page

### 7.1 Page structure

The page contains:

1. title and a short explanation;
2. dependent filter bar;
3. search, attention filter, column visibility, and export controls;
4. one server-driven TanStack Table; and
5. pagination and result count.

The table is the primary surface; do not place another dashboard above it.

### 7.2 Columns

Default columns:

```text
Order
Student
Class
Course scope
Average best score
Problems attempted
Problems solved
Submissions
Active learning time
Active days
Last active
Attention
```

The Student cell links to authorized progress detail. Curriculum labels link to
the relevant course or problem context. Attention shows factual reason chips,
not a computed risk level.

### 7.3 Teacher-private order and ranking behavior

TanStack Table controls the user interaction, but ordering and pagination are
server-side so the order covers the entire filtered result, not only the
current page.

`Order` equals `offset + row index + 1` after the full authorized filter and
stable server sort. It behaves as the teacher's contextual ranking. The value
changes when filters or sort change and is not written to the database.

For score descending, use these deterministic tie-breakers:

1. average best score descending;
2. attempted-problem count descending;
3. solved-problem count descending;
4. most recent activity descending; and
5. membership ID ascending.

Students without score data sort after scored students. For time ordering,
sort active seconds, then active days, then latest activity, then membership ID.
The UI explains `Order follows the current filters and sort` in a tooltip.

### 7.4 Score definition

For each student and current curriculum scope:

```text
student average best score =
  sum(best score for each attempted visible problem)
  / number of attempted visible problems
```

For `7d` and `30d`, a problem's best score is the maximum immutable submission
score created inside the selected period and using the current grading
revision. For `all`, the current-revision best score may come from the existing
progress projection. This keeps the date filter honest: a score earned months
ago does not appear as a seven-day result merely because it remains the
student's lifetime best.

Display attempted-problem coverage beside the value so 100% on one attempted
problem is not visually confused with 100% across twenty problems.

When a single problem is selected, score is that student's best score for that
problem. When a lecture or module is selected, only descendant visible problems
participate.

### 7.5 Export

If CSV export ships in the first version, it must repeat authorization and use
the same filters, definitions, stable sort, and row limit as the table API. The
export contains teacher-visible learning measurements only—no email, auth ID,
private feedback text, source code, or hidden tests. Export may be deferred
without blocking the first page release.

## 8. Active-learning measurement

### 8.1 Meaning

**Active learning time** is the measured time during which an authenticated
student is actively using an assigned Cove learning surface. It is not login
duration and is independent from the 30-minute inactivity logout window.

Example:

```text
10:00  student begins learning
10:00–10:20  student continues using learning surfaces
10:20  last detected learning activity
10:20–10:50  no activity; still signed in, but no learning time is added
10:50  automatic logout

reported active learning time: approximately 20 minutes
```

### 8.2 Qualifying activity

Count time only while all of the following are true:

- the authenticated student is in a visible, assigned learning surface;
- the tab is foreground-visible;
- recent activity includes navigation, scrolling through learning content,
  editor input, pointer/keyboard input, run, submission, hint, or feedback
  interaction; and
- accepted activity heartbeats remain within the bounded cadence.

An actively playing assigned lesson video counts and keeps the learning
interval open. A paused, ended, hidden, or background video does not.

Do not count:

- login alone;
- profile/settings/admin pages;
- a hidden or background tab;
- background API requests;
- a disconnected or sleeping device;
- the inactivity warning countdown; or
- the time between the last qualifying activity and automatic logout.

### 8.3 Accounting

Reuse the current server-accounted heartbeat model:

- the browser reports authenticated activity signals, never a duration total;
- accepted heartbeats can add at most 15 seconds each;
- a gap greater than 30 seconds closes the counted interval;
- hidden, disconnected, or inactive state closes the interval;
- the first heartbeat opens an interval and the next valid heartbeat measures
  its bounded elapsed time; and
- PostgreSQL stores daily per-student, per-course projections rather than raw
  pointer or keystroke trails.

This can undercount by approximately one heartbeat at the end of an interval,
which is preferable to inventing inactive time. The UI labels the value as an
estimate and never presents second-level precision to teachers.

### 8.4 Storage and durability

Keep `StudentCourseLearningDay` as the durable source with academy, membership,
course, academy-local date, active seconds, interval count, first activity, and
last activity.

Redis holds only short-lived accumulation state. PostgreSQL increments are
batched and idempotent through a stable flush receipt. Failed or ambiguous
flushes retry with the same ID and increment. A Redis loss may lose at most the
unflushed bounded interval; it cannot create time.

Do not reconstruct historical active time from submissions, login timestamps,
solve sessions, or last-seen values.

## 9. Student inactivity logout

### 9.1 Timing

The student session becomes inactive 30 minutes after the latest qualifying
student interaction anywhere in the Cove student experience. Session activity
is deliberately broader than learning-time activity: a visible click,
keyboard/pointer action, navigation, editor action, submission, or active video
on any authenticated student page resets logout. Time on a non-learning page
may keep the account signed in but does not earn active-learning time.

- `00:00–14:59` inactive: no warning;
- `15:00` inactive: header countdown appears with `Automatic logout in 15:00`;
- final five minutes: warning receives stronger danger emphasis;
- final two minutes: show a dialog with `Continue session` and `Sign out now`;
- `30:00` inactive: invalidate/end the student session and navigate to sign-in.

Any qualifying activity or `Continue session` resets the inactivity timestamp,
hides the warning, and begins a new 30-minute window. Video playback counts;
paused video does not. Background network requests do not reset the timer.

### 9.2 Cross-tab and server authority

All Cove student tabs share one inactivity deadline. Coordinate visible client
state with `BroadcastChannel`, with a storage-event fallback. The server remains
authoritative: protected requests reject an expired inactivity session even if
a client timer was suspended or modified.

Do not depend only on `setTimeout`; recompute remaining time from an absolute
server-issued deadline after focus, visibility change, wake, reconnect, and
route navigation.

### 9.3 Work preservation and return

Before automatic logout:

- flush the existing autosave path for draft code where possible;
- do not submit code automatically;
- store a safe relative return URL, without secrets or answer content; and
- after successful sign-in, offer to return to the same authorized learning
  page.

If autosave fails, the final dialog states that unsaved work could not be
confirmed. Logout still occurs at the security deadline.

### 9.4 Relationship to active-learning time

The two timers must remain separate:

- learning time is earned only by bounded active heartbeats; and
- session inactivity expires 30 minutes after the latest qualifying action.

The remaining 30 minutes after a student's last action are never added to
active-learning time.

## 10. Data and technology architecture

Use the established V2 stack:

- PostgreSQL and Prisma for durable projections and aggregate queries;
- NestJS services and typed oRPC/Zod contracts for validation and
  authorization;
- Redis and BullMQ only for bounded activity accumulation and retry;
- Next.js App Router and React for role-aware server pages and focused client
  interactions;
- TanStack Query for URL-filtered fetching, cancellation, and retained previous
  data;
- TanStack Table for the Student analytics table; and
- Recharts through the shared Studio chart primitive for Student participation,
  with a semantic table equivalent.

Do not add a second chart library, a client aggregation pipeline, PostHog,
ClickHouse, Kafka, a new state library, or a legacy Next Route Handler proxy.
Recharts renders already-calculated values; it does not own definitions,
sorting, permissions, or classification.

### 10.1 API boundaries

Prefer two bounded teacher operations rather than one oversized response:

```text
teacherOverview.get({ academyId, classId?, courseId?, range })

teacherStudents.list({
  academyId,
  classId?, courseId?, moduleId?, lectureId?, problemId?,
  range, search?, attention?, sort, direction, page, pageSize
})
```

The overview response contains only the metric ledger, participation rows,
five-row preview lists, lowest-three readiness rows, top-five difficult
problems, effective scope, and authorized options.

The student list response contains page rows, total count, authorized dependent
filter options, effective period, tracking-start disclosure, and stable sort
metadata. Student references use academy membership IDs, not raw user IDs.

### 10.2 Query and payload budgets

- Overview preview arrays are bounded to five, except readiness at three.
- Participation returns at most 250 authorized unique students.
- Student analytics uses server pagination with 25 rows by default and 100
  maximum.
- Target overview p95 is below 500 ms at 10 classes, 250 students, and two years
  of submission history.
- Target student-list p95 is below 500 ms for a filtered page at the same scale.
- Target gzipped overview response is below 100 KB.
- Aggregates execute in PostgreSQL and preserve authorized class-student-course
  relationships; do not load broad submission history into Node or the browser.

## 11. Authorization and privacy

Every read proves current actor, academy membership, teacher assignment, active
class, active student enrollment, assigned course, and visible curriculum
relationships. Filters narrow this authorized relationship set; they never
create access.

Repository queries preserve complete class-student-course-material pairs. They
must not combine independent `student IN (...)` and `material IN (...)` sets
that allow work from one class to appear in another.

The teacher-private Order column is absent from student-facing contracts. Do
not log or expose student names, detailed activity trails, source code, private
feedback text, hidden tests, auth IDs, or emails. Store daily activity totals,
not raw interaction histories.

## 12. Accessibility and responsive behavior

- Every chart has a complete semantic table alternative.
- Chart tooltips are reachable by keyboard as well as pointer.
- Color is accompanied by text, shape, or icon.
- Tables retain Student, Order, and the currently sorted measurement on narrow
  screens; secondary columns move behind column controls or horizontal scroll.
- Focus remains visible in light and dark themes.
- Reduced-motion users receive no chart entrance animation or countdown pulse.
- The countdown uses an `aria-live` announcement at meaningful thresholds, not
  every second.
- English and Korean ship together, including empty, error, tracking, ranking,
  activity, and logout copy.

## 13. Observability

Record privacy-safe structured telemetry for:

- overview and student-list operation, authorized scope counts, range, sort,
  duration, row count, and response size;
- aggregate query duration by query name;
- activity heartbeat accepted, capped, deduplicated, flushed, retried, or
  dropped totals;
- inactivity warning shown, continued, and automatically expired counts;
- invalid dependent-filter canonicalization; and
- drill-down destination type.

Never record student names, score values, curriculum answers, source code,
minute-by-minute activity, or full URLs containing search text.

## 14. Testing

### 14.1 Pure unit tests

- 7/30/all academy-local boundaries;
- unique students and student-course time across multiple classes;
- total courses versus class-course assignments;
- active-day calculation;
- average-score denominator and missing-score behavior;
- score and time tie-break ordering;
- global Order values across page boundaries;
- dependent-filter clearing and canonicalization;
- readiness and difficult-problem thresholds;
- heartbeat caps, gaps, hidden state, video play/pause, and disconnect;
- 15-minute warning and 30-minute expiry boundaries; and
- cross-tab inactivity deadline reconciliation.

### 14.2 Service and database tests

- complete teacher/class/student/course/material authorization;
- no cross-class or cross-academy leakage;
- deterministic server sorting across pages;
- pagination totals and bounded search;
- daily activity upsert and ambiguous-retry idempotency;
- active time stops while the account remains signed in;
- inactivity expiry is server-enforced;
- course removal, enrollment removal, reassignment, and suspension revoke the
  next read; and
- representative query plans meet the intended indexes and budgets.

### 14.3 Component tests

- single-column full-width section order;
- filter bar and retained-data updating treatment;
- Teaching queue reason and evidence copy;
- metric ledger values and missing-data disclosures;
- Student participation chart and accessible table equality;
- score and active-time previews and links;
- server-driven TanStack Table sorting, columns, pagination, and Order;
- long English/Korean labels and narrow screens;
- light, dark, keyboard, and reduced-motion behavior; and
- countdown appearance, reset, final dialog, and autosave-failure message.

### 14.4 End-to-end tests

- teacher sees only assigned students and curriculum;
- overview defaults to all assigned classes, all courses, and seven days;
- every overview section occupies its own row in the intended order;
- 7/30/all and class/course selection survive reload;
- preview links preserve scope in Student analytics;
- module, lecture, and problem filters change score ordering correctly;
- Order covers the complete server-sorted result across pagination;
- a visible active student earns time while an idle/background student does
  not;
- activity at 29:59 resets automatic logout;
- warning begins at 15:00 inactive and expiry occurs at 30:00;
- playing video keeps the session active and paused video does not;
- unsaved draft preservation runs before forced logout; and
- student and manager roles never receive teacher analytics.

## 15. Migration from the current uncommitted implementation

Treat the current overview presentation as experimental and replaceable. Do not
delete all uncommitted work wholesale.

Before implementation:

1. inventory changed files and classify them as reusable data foundation,
   reusable generic UI, or superseded overview presentation;
2. preserve the daily activity migration, accumulator, authorization service,
   pair-preserving aggregate logic, shared chart primitive, translations, and
   tests when they meet this specification;
3. replace overview-specific React composition and contracts only where the new
   information architecture requires it;
4. add the dedicated student-list contract and route without weakening existing
   Solution status access; and
5. remove obsolete overview components only after equivalent tests pass.

No destructive cleanup occurs as part of writing this specification. A later
implementation plan must name every file it intends to retain, replace, add, or
delete before edits begin.

## 16. Delivery sequence

1. Approve this replacement specification and resolve any copy/metric changes.
2. Audit the uncommitted implementation against the retain/replace boundaries.
3. Finalize shared measurement and inactivity-timer pure functions.
4. Add or revise overview and student-list contracts.
5. Implement authorized server aggregates and server-side table sorting.
6. Build the Student analytics route and TanStack Table.
7. Rebuild the overview in the approved full-width information order.
8. Add student inactivity warning/logout and work preservation.
9. Complete Korean/English copy, accessibility, responsive/dark states,
   observability, and end-to-end coverage.
10. Remove superseded overview presentation files after verification.

## 17. Acceptance criteria

- The overview is a full-width single-column sequence with no two-section row.
- It shows Teaching queue, the five requested summary measurements, Student
  participation, top-five score order, active-time preview, readiness lowest
  three, and difficult problems top five.
- The complete student list lives on a dedicated teacher-only analytics page
  backed by a server-driven TanStack Table.
- Teachers can filter by class, course, module, lecture, problem, and 7/30/all
  time where those dimensions apply; current roster/course totals and current
  curriculum readiness disclose that they are snapshots rather than fabricated
  historical values.
- The Order column represents the full current server sort and filter, not only
  the visible page, and is never exposed to students.
- Score always travels with attempted-problem coverage; missing score is not
  zero.
- Active-learning time counts bounded foreground learning interaction and does
  not include the inactivity grace period.
- Student logout warning begins after 15 inactive minutes and automatic logout
  occurs after 30, with video playback, cross-tab reset, autosave, and server
  enforcement handled as specified.
- All reads preserve current teacher/class/student/course/material authority.
- Existing correct backend/activity work is reused; obsolete current overview
  presentation is replaced only through an explicit implementation plan.
- English/Korean, accessibility, dark mode, responsive behavior, empty/error
  states, observability, and the specified tests ship with the redesign.
