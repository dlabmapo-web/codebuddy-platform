# Teacher Academy Overview Design

**Date:** 2026-08-13

**Status:** Approved design

**Scope:** V2 teacher-facing academy overview, including learning analytics,
active learning time, student participation, and class-level drill-downs

**Companion designs:**

- `2026-08-04-teacher-live-monitoring-design.md`
- `2026-08-12-teacher-solution-status-design.md`
- `2026-08-12-student-answer-records-and-course-hierarchy-design.md`

## 1. Decision

Replace the Teacher placeholder at
`/studio/academies/:academyId` with a **progress-first teaching overview** for
all active classes assigned to the signed-in teacher.

The page keeps the useful analytics from Cove V1 and preserves the CEO's
**Student participation** section. It changes the hierarchy so totals do not
become the product's main message:

1. a deterministic weekly teaching brief explains the most important current
   class signal;
2. four summary cards report participation, pace, attention, and mastery;
3. Student participation defaults to **Usage & score** and retains
   **Submissions & solved** as a second view;
4. class momentum, learning momentum, curriculum bottlenecks, difficult
   problems, common error patterns, and students to check provide supporting
   evidence; and
5. every student, class, course, lecture, and problem signal links to an
   authorized V2 teacher workspace where the teacher can inspect it.

The overview is not a leaderboard, gradebook, attendance register, or AI risk
score. It describes observable learning behavior in plain language and never
ranks elementary-age students against one another.

## 2. Reference findings

### 2.1 Cove V1 dashboard

The current Cove dashboard usefully provides:

- curriculum and date filters;
- submission trends;
- chapter and problem solve rates;
- per-student submissions and solved counts;
- AI feedback error categories; and
- a list of students who may need support.

Its first row gives too much importance to total submissions, total wrong
answers, total solved pairs, and an aggregate solve rate. These numbers measure
volume, but they do not tell an elementary coding teacher whether students are
participating, whether effort is producing understanding, or what to review
before continuing.

The Student participation grouped bars are worth retaining. They make student
activity concrete and satisfy the CEO's requirement, but submissions alone can
reward repeated guessing. The revised section therefore keeps those bars as a
secondary view and adds active learning time and mastery as the default.

### 2.2 Elice course page

Elice contributes a clear curriculum-scanning model: named chapters, short
descriptions, visible completion, and continuity from a course into its
lectures. The V2 overview uses recognizable curriculum names in every
bottleneck and drill-down. It does not copy Elice's branding, flat content
model, content-management controls, or navigation.

### 2.3 Existing V2 foundations

V2 already has the correct production boundaries:

- `Class`, `ClassCourse`, and `ClassEnrollment` define the teacher's class,
  curriculum, and student scope;
- the assigned-teacher access service proves class authority on every read;
- `StudentExerciseProgress` stores attempt count, best score, solved state, and
  last attempt without scanning all historical submissions;
- `Submission` stores immutable score, verdict, solve elapsed time, and frozen
  curriculum labels;
- `ClassEnrollment.lastLearningSeenAt` stores contextual recent activity;
- the class Solution status page already defines factual attention reasons;
- the live-monitoring client already distinguishes active, idle, reconnecting,
  and offline learning state;
- shared oRPC contracts, Nest services, Prisma/PostgreSQL, TanStack Query, and
  Recharts are installed and established; and
- Studio already supplies its shell, visual tokens, responsive tables,
  translations, loading patterns, and error treatment.

The legacy `app/api/teacher/dashboard` Supabase route and
`TeacherAnalyticsDashboard` are reference material, not the V2 architecture.

## 3. Goals

- Tell a teacher, within a few seconds, whether assigned classes are learning
  and where help is most useful.
- Show how students use the learning app, including meaningful active time,
  active days, latest activity, submissions, solved work, and mastery.
- Preserve the CEO-required Student participation comparison.
- Distinguish productive persistence from long effort with low mastery.
- Reuse the same progress and attention definitions as Solution status.
- Make every recommendation deterministic, factual, and explainable.
- Keep the academy overview useful with one class or many assigned classes.
- Keep filters and selected participation view shareable in the URL.
- Aggregate in PostgreSQL and return bounded payloads.
- Meet production expectations for authorization, privacy, accessibility,
  observability, translations, empty states, and tests.

## 4. Non-goals

- Student ranks, percentiles, leaderboards, public comparisons, badges, or
  competition based on time, score, or submissions.
- Attendance, billing time, payroll time, or proof that a child was physically
  present.
- Counting an open tab, login duration, background time, or idle time as
  learning.
- A single opaque engagement, ability, or risk score.
- Predictive machine learning or an LLM-generated teaching recommendation in
  the first version.
- Teacher-defined grades or manual score editing.
- Deadlines, lesson calendars, or automatic curriculum scheduling.
- Cross-academy reporting or manager analytics.
- A separate analytics warehouse, third-party product analytics dependency,
  or event-streaming platform in the first version.
- Replacing Live roster or per-class Solution status.

## 5. Information architecture

### 5.1 Route and role behavior

The route remains:

```text
/studio/academies/:academyId
```

- `TEACHER` sees the new overview.
- `STUDENT` continues to redirect to My courses.
- `MANAGER` and other management roles retain a management-oriented academy
  overview; they do not receive teacher analytics through this component.
- A teacher with no active assigned classes receives an intentional empty
  state linking to My classes, not zeros that imply a poorly performing class.

### 5.2 URL state

The overview accepts:

```text
class={classId|all}
course={courseId|all}
range={7d|30d|all}
participation={usage|work}
```

Defaults are `class=all`, `course=all`, `range=7d`, and
`participation=usage`. Selecting a class limits course choices to courses
assigned to that class. Changing class clears an out-of-scope course. Unknown,
unauthorized, and malformed values are removed with replace navigation.

The period uses academy-local calendar days. The UI prints the effective date
range and timezone rather than relying only on “7 days.” `all` means all
available data inside the teacher's current authorized scope.

### 5.3 Page order

1. Page title, effective scope, and filters.
2. Weekly teaching brief.
3. Four summary cards.
4. Student participation.
5. Class momentum and learning momentum.
6. Curriculum readiness and bottlenecks.
7. Difficult problems and common error patterns.
8. Students to check first.

On a narrow screen, the same order becomes a single column. The attention list
does not move above the teaching brief because the brief supplies context for
why those students appear.

## 6. Statistic definitions

Every metric is calculated only from active student memberships enrolled in an
active class currently assigned to the teacher, visible assigned curriculum,
and the selected filters. A student enrolled in two selected classes is counted
once in academy-wide person totals and once in each class row.

### 6.1 Summary cards

#### Active this period

The number of scoped students with at least one counted learning-activity
interval during the selected period, displayed as `active / enrolled` and a
percentage. A submission also makes the student active even if an old client
did not emit activity intervals.

#### On track

The number of scoped students who have no current factual attention reason and
have been active during the selected period. It is not a prediction. The card
caption states the rule and opens the filtered student view.

Students with no attempted exercise are not called on track merely because
they have no failure signal. If they were active, they appear as “getting
started”; if inactive for the full selected seven-day period, they contribute
to low participation.

#### Need attention

The number of distinct students with one or more current reason from the shared
teacher-progress vocabulary:

- three or more consecutive failed attempts;
- in-progress work stalled for seven full days; or
- a latest failed attempt with measured solve time of at least 30 minutes.

The overview adds two participation reasons that are equally factual:

- **inactive in selected period**: no counted activity or submission in the
  effective period; and
- **high effort, low mastery**: at least the cohort median counted learning
  time and mastery below 60%, with at least three attempted exercises.

Reasons always travel with their measurements. The UI says “5 consecutive
failed attempts” or “4h 42m active · 48% mastery,” never only “at risk.”

#### Concept mastery

The weighted mean of each student's best score on attempted visible assigned
exercises:

```text
sum(bestScore for attempted student-exercise pairs)
÷ attempted student-exercise pair count
```

Unattempted work is excluded from mastery and represented separately by
completion/readiness. Each exercise contributes equally, regardless of hidden
test-case count. The UI labels the metric **Concept mastery**, not grade, and
shows the attempted-pair denominator in its tooltip.

The comparison is the same metric over the immediately preceding period of
equal length. No comparison appears for `all` or when either period has no
attempted pair.

### 6.2 Weekly teaching brief

The brief is generated by deterministic priority rules over the selected
scope, never free-form AI:

1. repeated failures affecting the greatest number of students;
2. high-effort/low-mastery students;
3. the visible lecture with the lowest readiness;
4. inactivity affecting at least 25% of enrolled students;
5. positive progress when none of the above applies.

It contains:

- the affected class and curriculum label;
- one factual headline;
- one sentence containing the measurements that triggered it; and
- one action linking to Solution status with matching class, course, problem,
  or attention filters.

Example: “Review while-loop stop conditions. Seven students made 19 failed
attempts across two CH06 problems this week.” The system does not prescribe a
teaching method or claim to understand a child's intent.

### 6.3 Student participation

This CEO-required section has two URL-backed views.

#### Usage & score — default

The section summary reports:

- median active learning time;
- active students as `active / enrolled`;
- average concept mastery; and
- students needing a check-in, separated by factual reason.

Its main chart is a scatter plot:

- x-axis: counted active learning time in hours;
- y-axis: concept mastery from 0–100%;
- one point per student; and
- color encodes a factual interpretation, not relative rank:
  - quick understanding: below median time and mastery at least 80%;
  - on track: mastery at least 60% and active in the period;
  - low participation: no activity or below 30 counted minutes in seven days;
  - high effort, needs support: at least median time, mastery below 60%, and at
    least three attempted exercises; or
  - getting started: insufficient attempts to interpret.

The tooltip shows name, counted time, active days, mastery, attempted/solved
exercises, submissions, and last activity. Selecting a point opens that
student's class Solution status detail. If `class=all` and a student belongs to
multiple selected classes, the tooltip shows one row per class and the action
first asks which class to open.

The adjacent **Teacher attention** list is not a top/bottom ranking. It is
ordered by explicit priority: repeated failures, high effort/low mastery,
stalled, inactivity, long failed solve; then oldest activity; then display name
for stable output. It is capped at five with a “View all” action.

#### Submissions & solved — retained

The existing grouped-bar idea remains:

- submissions are all counted final attempts in the selected period;
- solved is the number of distinct student-exercise pairs first solved or
  solved at the current grading revision in the selected period; and
- the tooltip also shows mastery and counted active time so a tall submission
  bar is not mistaken for success.

The chart defaults to display-name order, not submission order. With more than
12 students it becomes a horizontally scrollable plot with a visible scrollbar
and a parallel accessible data table. It never labels a highest or lowest
student.

### 6.4 Class momentum

One row per active assigned class shows:

- enrolled students;
- active students;
- median active learning time;
- exercise completion;
- concept mastery;
- students needing attention; and
- most recent learning activity.

Exercise completion is solved visible assigned student-exercise pairs divided
by all visible assigned student-exercise pairs. Unlike mastery, unattempted work
therefore lowers completion. Clicking a row opens that class's Solution status.

### 6.5 Learning momentum

The time-series chart shows, by academy-local day:

- unique active students as a line;
- solved submissions as bars; and
- unsuccessful counted submissions as stacked bars.

The chart replaces raw “submission trend” as the default because it shows
participation and outcome together. A legend can hide a series locally without
changing server filters. The accessible table exposes every date and value.

### 6.6 Curriculum readiness and bottlenecks

The overview groups by visible lecture, using the existing course → module →
lecture hierarchy.

Readiness is the percentage of enrolled students who solved at least 80% of the
lecture's visible exercises at the current grading revision. Lectures without
exercises show completion of visible student-completable materials when that
projection exists; otherwise they display “No scored exercises” and do not
enter mastery comparisons.

The section shows:

- the three lowest-readiness lectures with at least three student attempts;
- readiness percentage and student numerator/denominator;
- completion and mastery;
- change from the previous equal period when available; and
- a direct problem-first Solution status action.

### 6.7 Difficult problems

Show up to five visible exercises with at least three attempting students,
ordered by:

1. lowest solve rate;
2. most affected students;
3. most unsuccessful attempts; and
4. curriculum position.

Each row includes course/module/lecture path, attempted students, solved
students, solve rate, unsuccessful attempts, median measured solve time, and a
link to the problem detail. Problems below the sample floor do not receive a
comparative label; they can still be found in Solution status.

### 6.8 Common error patterns

If structured, student-safe AI feedback categories exist in the selected
period, show up to five categories with affected-student count and occurrence
count. Sort by affected students, not raw repeated messages from one student.

If categories are absent, unclassified, or below three affected students, the
section is omitted rather than showing an empty chart. This statistic is
supporting evidence; it never drives the teaching brief by itself.

### 6.9 Students to check first

Show at most five students with:

- display name;
- class;
- exact attention reasons and values;
- active time and active days;
- mastery and completion;
- current/most recent curriculum location;
- last activity; and
- “View progress” action.

This list shares definitions and drill-downs with Student participation. It is
not a second, contradictory risk model.

## 7. Active learning time

### 7.1 What counts

Count time only while all of the following are true:

- the authenticated student is inside a student-visible learning surface for
  an academy and course;
- the page is foreground-visible;
- the user has produced navigation, editor, pointer, keyboard, run, submission,
  hint, or feedback-panel activity within the last 60 seconds; and
- consecutive accepted heartbeats are no more than 30 seconds apart.

Count at most 15 seconds per heartbeat interval, matching the existing
monitoring cadence. A missing heartbeat, hidden tab, disconnect, sleep, or idle
state closes the interval. Reopening resumes a new interval. Durations are
server-accounted from authenticated heartbeats; the client never sends a
duration total.

This is labeled **Active learning time** everywhere. It is an estimate of app
interaction, not attendance or total study effort. Offline work is naturally
absent.

### 7.2 Storage

Add a durable per-course daily projection rather than storing every pointer or
keystroke:

```text
StudentCourseLearningDay
  academyId
  membershipId
  courseId
  localDate
  activeSeconds
  activeIntervals
  firstActiveAt
  lastActiveAt
  updatedAt

unique (academyId, membershipId, courseId, localDate)
index  (academyId, localDate)
index  (membershipId, courseId, localDate)
```

Redis holds only the short-lived last accepted heartbeat timestamp and current
activity state used to calculate the next bounded delta. PostgreSQL receives a
batched, idempotent increment no more than once per minute per student and a
final flush on clean disconnect when possible. Each queued flush has a unique
ID. In one transaction, PostgreSQL inserts a short-lived `LearningActivityFlush`
receipt and increments the daily projection; a duplicate receipt makes a retry
a no-op. Completed receipts may be deleted after seven days, longer than the
queue retry horizon. A BullMQ recovery job retries failed increments. Losing
Redis can lose at most the unflushed minute; it cannot invent time.

Course scope is necessary because the learning route knows the academy and
course, not necessarily which class motivated the work. A class includes time
only when the student is enrolled and the course is currently assigned to that
class. If the same student-course pair legitimately belongs to two selected
classes, each class row may describe that relevant time; the academy-wide
student total de-duplicates the pair and never sums it twice.

The existing `lastLearningSeenAt` remains the contextual last-seen projection.
`solveElapsedSec` remains problem-sitting time and is not summed into active
learning time, which would double count editor activity.

### 7.3 Historical availability

Activity time begins when this projection ships. The interface displays
“Tracked since <date>” for `all` and does not reconstruct old time from
submission timestamps, solve sessions, login sessions, or last-seen values.
Older progress and score analytics remain available.

## 8. Data and service architecture

### 8.1 Technology choice

Use the established V2 stack and its currently installed major versions:

- **PostgreSQL + Prisma 7.9** for source data and aggregate queries;
- **NestJS 11.1 service + oRPC 1.14 contracts** for authorization, validation,
  and typed responses;
- **Redis + BullMQ**, already installed, only for bounded activity accumulation
  and retry—not as the analytics source of truth;
- **Next.js 16.2 App Router + React 19.2** for the server page and small
  interactive client islands;
- **TanStack Query 5.100** for filter-driven client refetch, cancellation, and
  retained previous data; and
- **Recharts 3.9** for charts, accompanied by semantic tables.

Do not add PostHog, ClickHouse, Kafka, Timescale, a second chart system, or a
new client state library. The expected academy/class scale and existing domain
projections do not justify another operational system.

The chart mapping is explicit:

- Recharts `ComposedChart` renders daily active students as a line together
  with solved and unsuccessful submission bars;
- `ScatterChart` renders active learning time against concept mastery;
- grouped `BarChart` renders submissions and distinct solved exercises per
  student;
- horizontal `BarChart` renders curriculum readiness, difficult lectures, and
  difficult problems; and
- ordinary Studio React components render summary cards, the weekly brief,
  class momentum, attention lists, filters, and accessible data tables.

Every chart uses the V2 Studio color tokens and a shared V2 chart primitive for
axes, tooltip, legend, empty state, loading skeleton, responsive sizing, and
semantic-table fallback. Recharts is a rendering dependency only; calculation,
classification, sorting, and authorization never live in chart components.

### 8.2 V2-only implementation boundary

The new overview must be implemented inside the V2 domain and route structure.
The older dashboard is research input, not a code foundation.

Do not import, wrap, extend, or copy implementation from:

- `app/api/teacher/dashboard/route.ts`;
- `components/dashboard/TeacherAnalyticsDashboard.tsx`;
- the existing V1-specific files under `components/charts`;
- `lib/types/teacherDashboard.ts`;
- the V1 `teacher_student`, global `users.role`, subjects/stages/chapters, or
  legacy problem hierarchy; or
- Supabase client/admin queries used by the old dashboard.

The implementation may study the old screen's observable behavior and chart
labels, but all new data comes through current V2 class assignment,
enrollment, course, curriculum, progress, submission, and activity models. New
chart primitives belong under the Studio/V2 component boundary and accept
shared oRPC contract types rather than legacy dashboard types.

This boundary prevents the new page from inheriting V1's academy-wide access,
client-side aggregation, mixed data models, and inconsistent statistics. Once
the V2 overview is accepted in production, removing the old dashboard becomes
a separate migration with its own usage and route audit.

### 8.3 Shared contract

Add an `academyTeacherOverview` contract with one bounded query:

```text
get({ academyId, classId?, courseId?, range })
```

The response contains:

- effective scope and date range;
- filter options already limited to authorized assigned classes/courses;
- summary;
- teaching brief;
- participation summary and student points;
- work comparison rows;
- class momentum;
- daily momentum;
- curriculum bottlenecks;
- difficult problems;
- common error patterns; and
- attention students.

Shared Zod schemas bound every array. Student references use membership IDs,
not raw user IDs. The response has no code, hidden test data, email, auth ID,
or private AI-feedback text.

### 8.4 Service boundaries

- `TeacherOverviewAccessService` resolves the teacher's authorized active
  classes, enrollments, assigned courses, and visible curriculum. It should
  reuse/extract the same assigned-teacher predicate as monitoring and teacher
  progress rather than creating a weaker version.
- `TeacherOverviewService` coordinates one consistent read timestamp and maps
  database aggregates into the contract.
- `TeacherOverviewRepository` owns aggregate SQL/Prisma queries. Complex
  grouping uses parameterized Prisma TypedSQL/raw SQL where Prisma's query API
  would require loading broad rows into Node.
- Pure shared functions own period boundaries, mastery, readiness, point
  classification, attention merging, and teaching-brief selection.
- `LearningActivityAccumulator` converts authenticated monitoring activity into
  bounded daily increments. Analytics never read live presence as historical
  time.

The service executes independent aggregates concurrently after one access
scope is established. It must not fetch all submissions and aggregate them in
the browser or application process.

### 8.5 Rendering and client state

The Next.js page remains a Server Component that authenticates, selects the
role-specific overview, parses/canonicalizes search parameters, and renders the
Studio shell. The interactive teacher dashboard is a focused Client Component
because filters, chart tabs, tooltips, and TanStack Query need browser state.

Server-render the initial overview data through the typed server oRPC client
and hydrate the matching query. Later filter changes use TanStack Query and
retain the previous result while a labeled refresh indicator appears. Charts
are dynamically loaded client islands with stable skeleton dimensions.

Do not add a Next Route Handler proxy. The V2 web client and server both use the
existing oRPC boundary.

### 8.6 Query and performance budget

- One overview response returns at most 250 unique participation students, the
  existing supported aggregate teacher scope. The chart renders every returned
  point; its accessible table paginates locally rather than removing students.
- Attention, difficult-problem, bottleneck, and error lists return at most five
  rows each.
- Daily momentum returns at most 31 daily points for 7/30-day ranges and at
  most 24 monthly points for `all`; older months aggregate into an earlier
  bucket if necessary.
- Target p95 API time is below 500 ms for a teacher with 10 classes, 250 unique
  students, two years of submissions, and current indexes.
- Target gzipped response size is below 150 KB.
- Add indexes only from observed query plans. Required initial candidates are
  the daily-activity indexes above and submission/progress indexes already
  specified by the Solution status design.
- No shared response cache initially: results are authorization-sensitive and
  filter combinations are small. Database aggregation plus TanStack Query's
  short client stale window is sufficient. Add a server cache only after
  production measurement.

## 9. Authorization and privacy

Every operation must prove, from current database state:

```text
actor user is ACTIVE
AND actor academy membership is ACTIVE TEACHER
AND requested academy matches membership academy
AND every selected class is ACTIVE
AND class.teacherMembershipId = actor membership id
AND every selected course is currently assigned to that class
AND every student is an active STUDENT membership enrolled in that class
```

When `class=all`, the service unions only classes satisfying the complete
predicate. Reassignment, archive, suspension, role change, course removal, or
enrollment removal changes the next response immediately.

The overview is teacher-private. It does not expose comparisons to students or
other classes' teachers. Data retention for daily activity follows the
academy's learning-record retention policy; deleting a membership cascades or
anonymizes according to the existing account-deletion policy.

## 10. Visual and interaction design

The page follows the approved progress-first direction and the existing Studio
token system. Its signature is the dark-blue **weekly teaching brief**, the one
high-emphasis surface. Everything else uses quiet white panels, compact labels,
and curriculum-colored status accents.

- Blue: navigation, neutral progress, and selected data.
- Green: threshold met or positive change, never “good child.”
- Amber: low participation or watch signal.
- Red: a factual attention condition requiring inspection.
- Gray: insufficient data, unattempted work, or unavailable comparison.

Color never carries meaning alone. Charts include shapes/labels, keyboard
focus, tooltips on focus as well as hover, and an accessible data table.
Reduced-motion users receive no animated chart entrance. Point selection and
tabs are reachable by keyboard. Names truncate visually but remain available
to assistive technology and tooltips.

The dashboard uses real curriculum and student labels from the response. Copy
stays in the selected locale; English and Korean ship together. Numbers and
durations use locale-aware formatting.

## 11. Loading, empty, partial, and error states

- Initial page loading preserves the final panel dimensions and page order.
- Filter refetch keeps the previous data visible, marks it as updating, and
  prevents stale tooltips from opening drill-downs until the new scope arrives.
- No assigned class: explain that the overview becomes available when a class
  is assigned and link to My classes.
- Assigned class with no students: name the class and explain that no students
  are enrolled.
- Students with no activity: show the roster denominator and an invitation to
  open the class; do not render a zero-filled scatter plot.
- No score data: show participation time and “No scored attempts yet.”
- No tracked historical time: show the tracking-start disclosure while keeping
  score/progress panels.
- One optional aggregate failure does not falsify the rest of the dashboard.
  The response marks that section unavailable with a stable reason code; the
  panel explains what could not load and retries with the whole query.
- Authorization/scope failures replace the page with the established Studio
  no-access behavior. They are never presented as empty analytics.

## 12. Observability

Record structured, privacy-safe telemetry for:

- overview operation, scope counts, range, duration, and result;
- aggregate query duration by named query, without student names or IDs;
- response size and row counts;
- activity increments accepted, deduplicated, capped, flushed, retried, or
  dropped;
- invalid URL scope canonicalization; and
- drill-down destination type.

Alert on sustained overview p95 latency, activity-flush failure rate, and a
growing BullMQ retry backlog. Do not log individual activity trails, scores,
student names, curriculum answers, or chart coordinates.

## 13. Testing

### 13.1 Pure unit tests

- academy-local 7/30/all period boundaries, including daylight/offset edges;
- unique-student counting across multiple classes;
- mastery and completion denominator differences;
- readiness thresholds and “No scored exercises” behavior;
- participation point classifications at every boundary;
- attention reason merging and deterministic order;
- previous-period comparisons;
- teaching-brief priority and stable tie-breaking;
- heartbeat delta caps, idle/hidden/disconnect closure, and idempotency; and
- URL parsing, canonicalization, and dependent-filter clearing.

### 13.2 Service and database tests

- complete teacher/class/course/student authorization predicate;
- all-classes union without cross-teacher or cross-academy leakage;
- duplicate enrollment/student de-duplication;
- current grading revision and visible curriculum scope;
- bounded aggregate outputs on large fixtures;
- daily activity upsert/retry idempotency;
- no reconstruction of historical time;
- class reassignment and enrollment/course removal revoke the next read; and
- query-plan checks for the highest-volume aggregates.

### 13.3 Component tests

- each summary card's label, denominator, tooltip, and navigation;
- Usage & score and Submissions & solved URL-backed tabs;
- scatter keyboard navigation and accessible equivalent table;
- loading, empty, insufficient-data, tracking-start, and partial-error states;
- long English/Korean names, 0%, 100%, large durations, and narrow layouts;
- light/dark themes and reduced motion; and
- filter refetch with previous-data treatment.

### 13.4 End-to-end tests

- a teacher sees only assigned classes and their enrolled students;
- default all-class/7-day/usage state renders the approved hierarchy;
- class/course/range/tab selections survive reload and deep linking;
- attention and chart selections open the correct Solution status state;
- a participation heartbeat increases only active foreground time and stops on
  idle/hidden state;
- the retained submissions/solved chart remains available;
- a reassigned teacher loses access without signing out; and
- student and manager roles never receive teacher analytics.

## 14. Delivery sequence

1. Add shared overview measurement functions, schemas, and contract.
2. Add daily activity projection, accumulator, idempotent flush, and tests.
3. Add authorized aggregate repository/service and query-plan fixtures.
4. Add URL state and the role-specific academy overview data boundary.
5. Build summary, brief, and participation views with accessible tables.
6. Add momentum, curriculum, problem, error, and attention sections.
7. Add Korean/English copy, responsive/dark/reduced-motion polish, telemetry,
   and end-to-end coverage.
8. Remove the Teacher path's dependency on the placeholder overview. Keep the
   legacy V1 dashboard route untouched until its separate retirement decision.

## 15. Acceptance criteria

- A teacher opening the academy overview sees all active assigned classes by
  default and can filter to one class/course and 7/30/all time.
- The page displays the weekly brief, four summary cards, both Student
  participation views, class and learning momentum, curriculum readiness,
  difficult problems, common error patterns when available, and students to
  check first.
- Active learning time excludes background, idle, disconnected, and untracked
  historical time and discloses its tracking boundary.
- Score, mastery, completion, solve, and attention numbers match their defined
  denominators and the class Solution status projection.
- No chart ranks children, and every attention label includes its factual
  reason.
- Every drill-down repeats current authorization and lands in an existing V2
  class-scoped teacher surface.
- The implementation uses the established V2 technology stack and does not
  aggregate broad submission history in the browser or a legacy Next route.
- English/Korean, keyboard use, mobile, dark mode, reduced motion, empty/error
  states, observability, and the specified tests ship with the feature.
