# Teacher Solution Status Design

**Date:** 2026-08-12

**Status:** Approved design

**Scope:** V2 teacher-facing, per-class student and problem progress analytics,
including read-only historical submission review

**Companion designs:**

- `2026-08-03-class-course-enrollment-design.md`
- `2026-08-04-class-teacher-assignment-design.md`
- `2026-08-04-teacher-live-monitoring-design.md`
- `2026-08-07-v2-fullscreen-curriculum-navigator-design.md`
- `2026-08-12-student-answer-records-and-course-hierarchy-design.md`

## 1. Decision

Add **Solution status** to each active class assigned to the signed-in teacher.
The page is class-scoped rather than academy-wide and has two complementary
views:

- **By student** starts with the complete class roster and highlights students
  who may need attention. Selecting a student reveals curriculum progress and
  immutable attempt history.
- **By problem** starts with the assigned course hierarchy. Course, module, and
  lecture summaries lead to per-problem analytics and then to the affected
  students.

An individual attempt opens a dedicated full-page, read-only review workspace.
It shows submitted code and the student-safe grading result without mutating a
draft, a submission, or progress.

The feature preserves the useful facts from Cove V1 `/progress`, adopts the
scannable lecture hierarchy demonstrated by Elice, and deliberately replaces
V1's academy-wide first-student selection, long eager lists, client-side
aggregation, and compact code modal.

## 2. Reference findings

### 2.1 Cove V1

The existing page has valuable behavior worth retaining:

- student-first and problem-first perspectives;
- per-attempt result, score, test count, runtime, elapsed time, and timestamp;
- curriculum filtering;
- applicant, attempt, pass-rate, and time aggregates; and
- direct access to submitted code.

Its design also exposes problems V2 must not reproduce:

- the page is academy-wide even though V2 teacher authority is class-based;
- it automatically selects the first student instead of first explaining the
  class;
- the student list becomes a narrow, unsearchable wall of names;
- problem analytics require cascading selects and expand into very long tables;
- summary counts can disagree with the visible rows;
- labels and data mix Korean and English;
- submitted code is loaded into a modal rather than a complete review context;
- problem analytics load and aggregate broad submission data eagerly; and
- client components own API orchestration, aggregation, URL state, and display
  concerns together.

### 2.2 Elice

The referenced Elice course contributes a better scanning model:

- visible course and lecture hierarchy;
- lecture title and description together;
- compact completed/total progress;
- progress bars that remain secondary to content names; and
- clear continuity from a lecture collection into its materials.

V2 retains its own course → module → lecture → material domain. It does not
copy Elice branding, content-management controls, flat course structure, or
platform navigation.

### 2.3 Existing V2 foundations

V2 already provides the important boundaries this feature builds on:

- a class has zero or one assigned teacher;
- a teacher can access only active classes currently assigned to their active
  academy membership;
- class enrollments identify the student population;
- class-course assignments identify the curriculum scope;
- `StudentExerciseProgress` is a write-time progress projection;
- `Submission` stores immutable code, frozen labels, final verdicts, score,
  runtime, and measured solve time; and
- Studio already has shared shell, data-table, faceted-filter, overlay, theme,
  and translation patterns.

The student Answer records service remains student-owned. Teacher progress is a
separate read model with a different authorization boundary and must not be
implemented by weakening that service.

## 3. Goals

- Give an assigned teacher a trustworthy overview of one class.
- Make a student who needs help discoverable without ranking students.
- Make difficult or stalled problems discoverable within recognizable course
  structure.
- Keep every attention signal factual, explainable, and translatable.
- Let a teacher inspect an immutable attempt in a complete review workspace.
- Keep all navigation and filtering shareable through the URL.
- Aggregate in the database without loading all submissions into the browser or
  application process.
- Revoke access immediately when assignment, class, membership, role, or
  enrollment state changes.
- Preserve English/Korean parity, keyboard access, mobile usability, and light
  and dark themes.
- Reuse V2 domain projections and components through small, explicit feature
  boundaries.

## 4. Non-goals

- Academy-wide teacher access.
- Manager or Team Lead access to the teacher workspace.
- Student rankings, leaderboards, grades, badges, or comparisons.
- AI-generated risk scores or unexplained recommendations.
- Deadlines, attendance, lesson pacing, or curriculum scheduling.
- Teacher editing of submitted code, drafts, verdicts, scores, or progress.
- Regrading historical attempts.
- Showing hidden test inputs, expected outputs, or actual outputs.
- Live presence, cursor, pointer, terminal, or collaboration behavior; those
  stay in Live roster.
- Export, print reports, CSV download, or scheduled reports.
- A persistent analytics warehouse or new summary table in the first version.
- Configurable attention thresholds in the first version.
- Copying Cove V1 or Elice layout and visual identity.

## 5. Navigation and routes

### 5.1 Class navigation

An assigned teacher enters through **My classes**. An active assigned class has
two peer destinations:

1. **Live roster**
2. **Solution status**

The analytics route is:

```text
/studio/academies/:academyId/teach/classes/:classId/progress
```

The existing class route remains the Live roster destination. The class header
or local class navigation links the two destinations without adding a second
global teaching-nav item.

### 5.2 URL state

The progress URL is the shareable source of truth. It supports:

```text
view={students|problems}
q={search text}
course={courseId}
module={moduleId}
lecture={lectureId}
status={not_started|in_progress|solved}  (repeatable)
attention={repeated_failures|stalled|long_solve}  (repeatable)
student={membershipId}
problem={materialId}
sort={supported sort key}
direction={asc|desc}
page={positive integer}
```

Missing `view` means `students`. Child curriculum selections are removed when
their parent changes. Selecting a student and selecting a problem are mutually
exclusive and belong to their corresponding view.

Unknown IDs, values outside the class scope, unsupported sort keys, malformed
directions, and non-positive pages are removed through replace navigation. A
valid deep link opens its own selected panel after the server repeats every
authorization and scope check.

### 5.3 Submission review

An attempt opens:

```text
/studio/academies/:academyId/teach/classes/:classId
  /students/:membershipId/submissions/:submissionId
  ?returnTo=:encodedProgressPath
```

`returnTo` accepts only a same-academy, same-class Solution status path. Invalid
values fall back to the class's student-detail state. Back returns to the exact
filters, sorting, page, and selection that opened the review.

## 6. Authorization and data scope

### 6.1 Teacher class access

Every teacher-progress operation must prove all of these conditions in the
current database state:

```text
class.academyId = requested academy
AND class.status = ACTIVE
AND class.teacherMembershipId = actor academy membership id
AND actor membership.academyId = class.academyId
AND actor membership.status = ACTIVE
AND actor membership.role = TEACHER
AND actor user.status = ACTIVE
```

The client hiding a link is never authorization. A reassignment, archive,
suspension, departure, role change, or user suspension revokes the next read
immediately.

Use one access service for every operation. It returns the authorized actor,
class, active enrolled student user IDs, assigned course IDs, and current
student-visible curriculum scope. Callers must not recreate fragments of this
predicate.

### 6.2 Student scope

A student participates only when all of these remain true:

- the class enrollment exists;
- the referenced membership belongs to the requested academy;
- membership status is `ACTIVE`;
- membership role is `STUDENT`; and
- the related user is `ACTIVE`.

A guessed membership, user, material, or submission ID outside this set fails
closed. List and detail operations use the same scope function so a student
cannot appear in a summary while being forbidden in detail, or vice versa.

### 6.3 Curriculum scope

The page includes only courses currently assigned to the class. Within those
courses, the current module, lecture, and material must be visible. Solution
status concerns `PROGRAMMING_EXERCISE` materials.

Completion denominators include visible, required programming exercises.
Visible optional exercises remain discoverable and show their own activity but
do not reduce completion when unsolved. Hidden or unpublished curriculum never
penalizes a student and never appears in teacher-progress contracts.

Progress counts only when its `gradingRevision` matches the current exercise
revision. A stale progress projection is shown as not started for current
completion, matching the learning workspace's authoritative behavior.

### 6.4 Submission scope and safety

An attempt is reviewable only when:

- it belongs to an active in-scope student's user;
- its course is currently assigned to the class;
- its current material relation resolves to an in-scope visible exercise; and
- its `sourceMaterialId` matches that exercise identity.

Historical frozen titles remain the printed labels. Current relations decide
authorization and filtering. A deleted or no-longer-visible exercise does not
reappear merely because an old submission retained its title.

Review output includes source code and student-visible result data. Hidden
grading cases expose position and outcome only. Their input, expected output,
and actual output are structurally absent from the contract.

## 7. Metric definitions

### 7.1 Counted attempts

An authoritative graded attempt has status `PASSED` or `FAILED`. `QUEUED`,
`RUNNING`, `ERRORED`, and `CANCELLED` do not count toward attempt totals,
accepted rate, attention rules, or solve-time statistics.

### 7.2 Student metrics

For one active class student:

- **Solved problems:** count of eligible required exercises whose current
  progress is `SOLVED`.
- **Eligible problems:** count of visible required exercises in assigned
  courses.
- **Completion:** solved problems / eligible problems, rounded to a whole
  percent; zero when the denominator is zero.
- **Attempts:** count of authoritative graded attempts in current curriculum
  scope.
- **Accepted rate:** `PASSED / (PASSED + FAILED)`, rounded to a whole percent;
  zero when there are no counted attempts.
- **Last activity:** newest counted submission timestamp, or null.
- **Attention count:** distinct exercises currently producing at least one
  attention reason.

Class completion is solved student-exercise pairs divided by eligible active
student-exercise pairs. It is zero when the class has no eligible pairs.

### 7.3 Problem metrics

For one eligible exercise:

- **Students attempted:** distinct active in-scope students with at least one
  counted attempt.
- **Students solved:** distinct active in-scope students with matching-revision
  `SOLVED` progress.
- **Attempts:** counted attempts from active in-scope students.
- **Solved rate:** students solved / active in-scope students, rounded to a
  whole percent; zero when there are no active students.
- **Median solve time:** database median of non-null `solveElapsedSec` across
  counted attempts for this class and exercise; null when none was measured.
- **Attention count:** distinct active students with a current attention
  reason on this exercise.

Lecture, module, and course completion aggregate solved student-exercise pairs
over eligible required pairs below that node. Optional exercise activity is
shown separately and excluded from the denominator.

### 7.4 Attention rules

Attention is a deterministic view over current progress and counted attempts.
It is not stored, scored, or compared with classmates. Reasons may coexist.

An exercise already `SOLVED` at the current grading revision has no attention
reason.

#### Repeated failures

The student's latest three counted attempts for one exercise are all `FAILED`.
The visible reason states the number of consecutive failures when it is greater
than three.

#### Stalled

Current progress is `IN_PROGRESS`, and `lastAttemptAt` is at least seven full
days before the request time.

#### Long solve

The latest counted attempt is `FAILED`, has a measured `solveElapsedSec`, and
that value is at least 1,800 seconds.

No activity is **Not started**, not an attention reason. Without deadlines or
lesson pacing, the system cannot honestly infer that a student is late.

Rules use the database request timestamp so one response cannot disagree with
itself around a threshold. UI text always names the concrete reason; color and
an icon are supporting signals only.

## 8. By-student experience

### 8.1 Class roster overview

The default screen begins with three compact class facts:

- active enrolled students;
- class completion; and
- students with at least one attention reason.

The roster is a server-paginated table with a fixed page size of 25. It shows:

| Column | Content | Sort |
|---|---|---|
| Student | Avatar fallback and display name | Name |
| Progress | Solved / eligible and a labeled progress bar | Completion |
| Attempts | Counted graded attempts | Numeric |
| Accepted | Accepted rate | Numeric |
| Last activity | Localized submission time or Never | Timestamp |
| Attention | Reason chips and affected-problem count | Attention first |

Default ordering is students with attention first, then display name, then
membership ID as the deterministic tie-breaker. The interface explicitly
labels this as attention prioritization rather than a rank.

The toolbar supports student-name search and Course, Progress status, and
Attention facets. Search and filter changes reset the page to one. The server
returns available options; the browser never derives class-wide counts from
one page.

### 8.2 Student detail

Selecting a row preserves the roster state and opens a detail panel or detail
region on the same route. It contains:

- student identity and overall class metrics;
- active attention reasons with exercise links;
- course, module, lecture, status, and result filters;
- one row per visible exercise with current status, best score, attempts, last
  attempt, and attention; and
- expandable or selectable attempt history for one exercise.

Exercise rows follow curriculum order. Attempt history is newest first with
`createdAt DESC, id DESC`, fixed pages of 20, and explicit **Review** links.
Whole-row click is not required for any action.

Changing student clears exercise and attempt selections. A stale response from
the previous student cannot overwrite the new panel.

## 9. By-problem experience

### 9.1 Curriculum overview

The default screen presents assigned courses in course position and title
order. Each course summary shows:

- title and description;
- module and visible-exercise counts;
- class completion; and
- attention count.

Opening a course loads its module and lecture summaries. A lecture row uses the
approved Elice-inspired scan pattern: outline position, title, description,
solved-pair count, total eligible-pair count, progress bar, and attention
count. Only one lecture needs to be expanded initially; the page does not
render every problem in a large course.

The toolbar searches course, module, lecture, and problem titles and filters by
Course, Difficulty, and Attention. Curriculum structure stays visible while a
filtered or expanded child loads.

### 9.2 Lecture problem table

Expanding a lecture requests only its problem analytics. Rows follow material
position and show:

| Column | Content |
|---|---|
| Problem | Outline number and title |
| Difficulty | Localized difficulty badge |
| Attempted | Distinct students attempted |
| Solved | Distinct students solved |
| Attempts | Counted graded attempts |
| Solved rate | Labeled percentage/progress |
| Median solve | Measured median or — |
| Attention | Number of affected students |

### 9.3 Problem student breakdown

Selecting a problem opens a fixed-page table of active class students with
status, best score, attempt count, last activity, latest measured solve time,
and attention reasons. Default ordering is attention first, then unsolved
before solved, then display name and membership ID.

Selecting a student in this breakdown opens the same student/problem attempt
history used by By student. The feature has one attempt-history component and
one response contract, not two implementations with drifting behavior.

## 10. Submission review workspace

The review route is a focused, read-only workspace. Its header contains:

- Back to Solution status;
- student name;
- frozen problem and curriculum labels;
- verdict and score; and
- localized submission time.

The main workspace contains:

- a read-only Python editor showing immutable submitted code;
- passed / total cases;
- program runtime when recorded;
- measured solve time when recorded;
- current problem statement for context when still available;
- student-visible sample-case results; and
- aggregate hidden-case outcomes without hidden case data.

The workspace has no Run, Submit, Reset, edit, feedback, or regrade action.
Copying selected code through normal browser/editor behavior is allowed; the
feature does not add a separate write operation.

Failure to load current problem context does not relabel a forbidden or deleted
exercise as reviewable. The route shows a scoped not-found result and provides
the validated Back destination.

## 11. Shared contracts

Add strict schemas under a focused teacher-progress domain in `@cove/shared`.
Every output schema uses `.strict()` so an accidental source-code, email, hidden
test, or unrelated relation selection fails at the boundary.

Core output types are:

```text
TeacherClassProgressSummary
TeacherStudentProgressRow
TeacherStudentProgressDetail
TeacherCourseProgressSummary
TeacherModuleProgressSummary
TeacherLectureProgressSummary
TeacherProblemProgressRow
TeacherProblemStudentRow
TeacherAttemptSummary
TeacherSubmissionReview
TeacherAttentionReason
TeacherProgressFacets
TeacherProgressPagination
```

Inputs include `academyId` and `classId` on every operation. Detail operations
also carry the scoped membership, course, lecture, material, or submission ID
they resolve. Search length, sort keys, enum values, page numbers, and arrays of
UUIDs are bounded in shared Zod schemas.

The browser never sends user IDs to select a student. It sends the class
membership ID, and the service resolves the user only through active class
enrollment scope.

## 12. API surface

Add a read-only `teacherProgress` oRPC router:

```text
teacherProgress.listStudents(input)
  -> class summary, rows, facets, pagination

teacherProgress.getStudentDetail(input)
  -> student summary, exercise rows, attention, facets, pagination

teacherProgress.listAttempts(input)
  -> attempts, pagination

teacherProgress.listCurriculum(input)
  -> class summary and course summaries

teacherProgress.listCourseOutline(input)
  -> module and lecture summaries for one assigned course

teacherProgress.listLectureProblems(input)
  -> lecture summary and problem rows

teacherProgress.listProblemStudents(input)
  -> problem summary, student rows, facets, pagination

teacherProgress.getSubmissionReview(input)
  -> read-only submission review
```

Operations remain task-oriented rather than accepting a generic `view` string.
This keeps scope, selects, pagination, and result shapes explicit and testable.

## 13. Backend architecture

### 13.1 `TeacherProgressAccessService`

This unit owns the class assignment, actor, roster, course, visibility, and
revision scope described in Section 6. It exposes small typed scope results
rather than returning an unrestricted Prisma client or broad relation tree.

It may share a lower-level assigned-class predicate with live monitoring, but
teacher progress must not depend on presence, WebSockets, active-watch state,
or the `TEACHER_LIVE_MONITORING` feature flag.

### 13.2 `TeacherProgressRepository`

This unit owns database reads and aggregation. It accepts only an authorized
scope plus validated filters and returns database-shaped records. It does not
format translated labels or decide HTTP/oRPC errors.

Use ordinary Prisma aggregation where it produces bounded SQL. Use
parameterized SQL inside this repository for operations Prisma cannot express
cleanly, including median solve time and latest-N-attempt window rules. Raw SQL
never appears in routers or UI-facing services.

Queries must:

- apply student and material scope in SQL;
- select no submission code outside `getSubmissionReview`;
- avoid per-row follow-up queries;
- use deterministic order and ID tie-breakers;
- return empty results immediately for an empty roster or curriculum scope;
  and
- keep query count bounded as class size grows.

### 13.3 `TeacherProgressService`

This unit maps repository records into strict contracts, applies the metric and
attention definitions, canonicalizes detail scope, and converts domain failures
into existing application exceptions. Pure metric helpers live beside shared
types and have exhaustive unit tests.

### 13.4 `TeacherProgressRouter`

The router is a thin composition boundary. It obtains identity from oRPC
context, validates the input contract, calls the service once, and returns the
strict result. It contains no authorization branches, Prisma queries, or metric
math.

### 13.5 Frontend boundaries

Keep the route and components small:

```text
progress/page.tsx
  server authorization + initial query + StudioShell

progress/_components/progress-workspace.tsx
  URL-backed view and selection composition

progress/_components/student-overview.tsx
progress/_components/student-detail.tsx
progress/_components/curriculum-overview.tsx
progress/_components/lecture-problems.tsx
progress/_components/problem-students.tsx
progress/_components/attention-reasons.tsx

progress/_hooks/use-teacher-progress.ts
  query orchestration and bounded cache keys

progress/_lib/progress-url.ts
progress/_lib/progress-view.ts
  pure parsing, formatting, and view-model helpers
```

The exact file split may combine very small units, but no component owns URL
parsing, network orchestration, aggregation, and rendering together.

## 14. Data model and indexes

No new table is required. Read from current authoritative class, curriculum,
progress, submission, solve-session, and case tables.

Add problem-first indexes only after checking generated SQL and `EXPLAIN
ANALYZE` with realistic data. The expected useful access paths are:

```text
StudentExerciseProgress(materialId, status, userId)
Submission(materialId, userId, createdAt DESC)
```

The existing user-first submission index remains useful for By student. A
migration must not add a redundant index whose leading columns and sort order
are already covered.

## 15. Loading, empty, and failure states

### 15.1 Loading

The server renders the first By-student page. Later states show local skeletons
for only the region being replaced:

- roster table;
- student detail;
- course outline;
- lecture problem table;
- problem student table; or
- attempt list.

The last successful parent hierarchy remains visible while a child loads.

### 15.2 Empty states

Empty states are distinct and actionable:

- **No students enrolled:** return to My classes or ask a Manager to enroll
  students.
- **No courses assigned:** explain that the class has no curriculum.
- **No visible required problems:** explain that no graded curriculum is
  available to students yet.
- **No submissions:** identify the selected student or problem as not started.
- **No matching results:** offer Reset filters without implying that data was
  never present.
- **No measured solve time:** render an em dash with an accessible “Not
  recorded” label.

### 15.3 Errors and revocation

An initial server failure renders an error state, never a successful-looking
empty table. Client refetch failures preserve the last successful result and
show an inline Retry action.

Class-assignment or membership revocation routes the teacher to My classes with
a translated notice. Scoped detail IDs that never existed or no longer belong
to the class use the same not-found behavior so the API does not become a data
existence oracle.

Changing a filter or selection cancels or supersedes the prior query. A late
response cannot overwrite the new state.

## 16. Performance and caching

The first page must not preload the full curriculum, every student's attempts,
or problem analytics. Data loads in this order:

1. first roster summary page;
2. selected student's detail, on selection;
3. course summaries, when By problem opens;
4. one course outline, on course expansion;
5. one lecture's problems, on lecture expansion;
6. one problem's students or one exercise's attempts, on selection; and
7. submission code only in the review route.

TanStack Query caches successful results for the mounted page using keys that
include academy, class, view, filters, sort, and page. Cache size is bounded;
old detail selections may be evicted. Concurrent identical requests coalesce.

Teacher-specific analytics are never put in a shared server cache. Stable
student-free curriculum metadata may use the repository's existing short-lived
content cache only if authorization is applied before composition.

Benchmark with at least 30 students, 4 assigned courses, 400 visible exercises,
and 50,000 submissions. On the project benchmark environment:

- the initial roster response should complete within 750 ms at p95;
- each focused drill-down response should complete within 750 ms at p95;
- no operation may issue queries proportional to students or problems; and
- the page should present usable server-rendered content within 1.5 seconds.

If focused indexed queries miss the target, optimize behind the same contracts.
A summary table or asynchronous analytics pipeline requires a separate design;
it is not silently introduced here.

## 17. Visual and interaction design

Solution status uses the established Studio shell, tokens, typography, table,
facets, and theme behavior. Its visual signature is structural rather than
decorative: the same class can be read through two lenses while student and
curriculum context remain visible.

- A compact segmented control switches By student / By problem.
- Summary facts are quiet and secondary to names and curriculum.
- Attention uses warm warning tones, an icon, and plain-language reasons.
- Solved states use the existing success treatment.
- Progress bars always include readable counts or percentages.
- Course and lecture cards use restrained depth; problem tables carry dense
  facts without card-per-row noise.
- Only the selected student, course, lecture, or problem gains strong emphasis.

Desktop uses tables for repeated comparable fields. On narrow screens, student
and problem rows become stacked summaries with explicit Open/Review actions;
no essential column is available only through horizontal scrolling.

## 18. Accessibility and localization

- English and Korean keys ship together.
- Navigation labels live in `nav`; substantial feature copy lives in a focused
  teacher-progress namespace registered in both locales.
- Use sentence case and the vocabulary already established by Answer records:
  Accepted, Not accepted, Score, Tests, Solve time, and Submitted.
- Korean uses natural product language rather than direct word-by-word English
  order; the feature title is **풀이 현황**.
- View controls expose selected state and work as links or an accessible
  tablist whose navigation behavior matches its semantics.
- Expansion controls are buttons with names and `aria-expanded`.
- Tables have real headers; sortable headers announce direction.
- Progress bars include student/problem context in their accessible labels.
- Attention and result states never depend on color alone.
- Focus moves into an opened detail region and returns to the originating row
  when the detail closes.
- The review editor is labeled read-only and remains keyboard navigable.
- Reduced motion disables nonessential transitions.

## 19. Testing

### 19.1 Pure logic

- completion with zero eligible problems;
- optional exercises excluded from denominators;
- stale grading revisions excluded from solved counts;
- accepted rate excludes non-final and judge-fault statuses;
- class, course, module, lecture, student, and problem aggregates;
- median solve time with null, odd, and even samples;
- each attention threshold and combinations of reasons;
- solved progress suppresses every attention reason;
- deterministic sorting and tie-breakers;
- URL parsing, canonicalization, and validated `returnTo`; and
- localized duration and missing-value view models.

### 19.2 Authorization and service tests

- only the currently assigned active teacher can access an active class;
- another academy, teacher, class, student, material, or submission ID fails
  closed;
- reassignment, archive, membership suspension, role change, user suspension,
  enrollment removal, and course removal revoke access immediately;
- Managers and Team Leads do not gain teacher-progress access;
- hidden curriculum and stale progress do not enter counts or facets;
- optional curriculum does not reduce completion;
- source code is selected only by submission review;
- hidden test data is absent from every output; and
- strict output schemas reject surplus fields.

### 19.3 Repository integration tests

- aggregate results match seeded authoritative records;
- pagination remains stable for equal timestamps;
- latest-three failure windows are scoped per student and exercise;
- median and distinct-student counts are class-scoped;
- an empty roster or curriculum exits without broad submission scans;
- query count is bounded; and
- realistic-data query plans use the intended indexes.

### 19.4 Frontend tests

- roster and curriculum default states;
- both view URLs and browser Back/Forward;
- cascading curriculum selections;
- student, lecture, and problem drill-downs;
- stale-request protection;
- preserved successful data on Retry;
- every distinct empty and error state;
- attention reason text and accessible names;
- responsive row/card presentation;
- light and dark theme contrast; and
- English/Korean parity.

### 19.5 End-to-end journeys

1. Assigned teacher opens a class, enters Solution status, filters attention,
   opens a student, reviews an attempt, and returns to the same state.
2. Teacher switches to By problem, expands course → lecture, opens a difficult
   problem, and reviews one student's failed attempt.
3. Another teacher cannot open the class or guess its detail URLs.
4. Reassigning the class revokes an already-open teacher on the next request.
5. Removing an enrollment or course removes its data from summaries and detail.
6. Hidden exercises and hidden test data never appear in the browser payload.
7. Mobile and keyboard-only users complete both drill-down journeys.

## 20. Observability

Emit structured timing and result metadata for each operation:

- operation name;
- academy and class IDs;
- duration;
- result row count;
- page and filter-presence flags;
- authorized roster and material scope sizes; and
- outcome category, without search text, student names, email, code, or test
  data.

Log slow requests at the benchmark threshold and count forbidden/not-found,
retry, and repository failures through existing monitoring. Logs must never
contain submitted code or hidden test content.

## 21. Delivery boundaries

Implementation may be delivered in vertical slices, but contracts and access
scope are shared from the first slice:

1. shared contracts, authorization scope, repository foundation, and indexes;
2. By-student roster and student detail;
3. attempt history and read-only submission review;
4. By-problem hierarchy and problem-student drill-down;
5. performance, accessibility, localization, and end-to-end hardening.

The feature is complete only when both views, the review workspace, all access
revocation cases, and English/Korean responsive states ship together. A partial
slice may remain behind local development routing but is not presented as the
finished teacher experience.

