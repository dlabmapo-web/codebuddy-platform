# Reversible MVP Performance Fast Path

**Date:** 2026-07-29
**Status:** Approved for specification review
**Deployment:** Next.js 16 on Netlify, Supabase, managed Judge0

## 1. Objective

Improve the production response time of the student, administrator, and
teacher workflows without removing or weakening current behavior.

The first release focuses on the measured bottlenecks:

- learning-path catalog load;
- stage load;
- initial problem load;
- Previous and Next problem transitions;
- student submission history;
- authoritative grading status polling;
- administrator problem-hierarchy navigation;
- teacher student monitoring;
- teacher dashboard analytics and filters;
- teacher student-history navigation;
- teacher problem-level progress analytics.

The implementation must be incremental and reversible. Existing API behavior
remains available until the optimized path has passed regression and production
smoke testing.

## 2. Production Findings

The authenticated production audit observed:

| Surface | Observed behavior |
| --- | --- |
| Login and signup | 0.3-0.7 seconds; no immediate optimization required |
| Public demo shell | About 0.6 seconds |
| Public demo editor | Appears several seconds later because Monaco is loaded dynamically |
| Student catalog shell | About 1.3 seconds |
| Student catalog useful content | About 4.9 seconds |
| Stage opening | About 3 seconds |
| Problem-detail API | About 2.8-3.6 seconds |
| Previous and Next | Several seconds because the full transition snapshot is blocking |
| Student history shell | About 0.8 seconds |
| Student history records | About 4.5 seconds for 42 records |
| Grading | Status polls perform reconciliation work instead of a cheap read |

The production measurements above used a student account. A separate
authenticated administrator audit was performed against the warm local
development application:

| Administrator surface | Warm local observation |
| --- | --- |
| Problem Management initial content | About 1.04 seconds |
| Subject to Stage | About 3.18 seconds |
| Stage to Chapter | About 3.11 seconds |
| Chapter to Problems | About 3.16 seconds |
| Problem editor opening | About 1.04 seconds |
| Users, 28 records | About 0.59 seconds |
| AI Feedback, 41 patterns | About 0.64 seconds |

Local development timings are not production performance guarantees, but the
consistent hierarchy delay is supported by the code path: the click handlers
load data while also initiating a same-page Next.js route transition, and URL
rehydration effects can request the same hierarchy level again. The hierarchy
count endpoints also download unrelated child rows: Stage loads all chapters,
and Chapter loads all problems, solely to calculate displayed counts.

The administrator hierarchy fix is included in this MVP because it is
additive, does not change stored data, and can be verified without mutating
production records.

An authenticated production teacher audit observed:

| Teacher surface | Warm production observation |
| --- | --- |
| Students useful content | About 2.54 seconds |
| Dashboard analytics | About 3.48 seconds |
| Dashboard date filter | About 3.21 seconds |
| Progress student view | About 1.52 seconds |
| Selecting and loading a student's history | About 1.61 seconds |
| Progress problem view, 398 problems | About 2.75 seconds |

The teacher code paths explain the measured delays:

- Students requests the student list and full active collaboration-session
  records every 15 seconds.
- Dashboard filter changes repeat student-scope, curriculum, problem,
  submission, and AI-feedback work.
- Progress preloads problem analytics even while the teacher is using the
  student view.
- Student history downloads unpaginated submissions including source code and
  deeply nested curriculum data.
- Problem analytics downloads all published problems and matching submissions,
  aggregates them in application code, and may render 398 rows.

The audit also found authorization-scope inconsistencies that must be corrected
before performance optimizations are enabled: teacher session monitoring,
teacher-selected student history, and problem analytics do not consistently
use the shared resolved teacher-student scope.

The production browser was automatically translating the Korean interface and
reported React hydration text mismatches. This may add visible delay and
produce incorrect translated counters. It must be reproduced with browser
translation disabled before attributing it to application code.

Administrator user pagination remains follow-up work because the measured
28-user page is currently fast.

## 3. Constraints

- Production and Deploy Previews currently share the same Supabase project and
  Judge0 configuration.
- Production smoke tests must therefore remain read-only unless a dedicated
  test account and test records are explicitly selected.
- Current draft preservation, collaboration sessions, curriculum navigation,
  teacher monitoring, judging, AI feedback, and history semantics must remain
  intact.
- Existing uncommitted translation work is outside this change and must not be
  overwritten or reformatted.
- No hosting-provider migration, Redis dependency, or broad architectural
  rewrite is included.

## 4. Success Criteria

The MVP fast path targets:

- catalog useful content in under 2 seconds on a warm request;
- stage content in under 1.5 seconds on a warm request;
- Previous or Next transition in under 1.5 seconds on a warm request;
- history's first page in under 1.5 seconds on a warm request;
- grading-status reads in under 500 milliseconds excluding a Netlify cold
  start;
- each warm administrator hierarchy transition in under 1.5 seconds;
- teacher Students useful content in under 1.5 seconds;
- teacher Dashboard useful analytics in under 2 seconds;
- teacher Dashboard filter updates in under 1.5 seconds;
- teacher Progress student view in under 1.5 seconds;
- a teacher-selected student's first history page in under 1.5 seconds;
- teacher problem analytics for an expanded chapter in under 1.5 seconds;
- no regression in saved drafts, session ownership, progress, grading results,
  AI feedback eligibility, curriculum order, administrator deep links,
  teacher assignment boundaries, or browser Back and Forward behavior.

These are application budgets, not guarantees for every network condition.
Measurements must record the browser-observed duration and server duration
separately where possible.

## 5. Chosen Approach

Introduce a lightweight student fast path while keeping the existing
authoritative behavior as a fallback.

The release is divided into independently testable changes:

1. defer nonessential learning-context data during problem transitions;
2. restrict catalog draft loading;
3. paginate detailed submission history;
4. make normal grading polls read-only and retain delayed reconciliation;
5. prefetch only the immediately adjacent problem;
6. remove duplicate administrator hierarchy work and scope its count queries;
7. enforce teacher assignment scope before returning monitoring or progress
   data;
8. add focused teacher monitoring, history, problem-progress, and dashboard
   requests;
9. add lightweight server timing and structured duration logs.

The optimized student client path is selected by the non-secret build variable
`NEXT_PUBLIC_STUDENT_PERFORMANCE_FAST_PATH`. Missing or `false` uses the current
client requests. `true` uses the focused requests described below. Turning the
variable off and redeploying is the primary fast rollback; a Netlify deployment
rollback is the secondary rollback.

Teacher and administrator changes remain isolated commits and endpoint views
so they can be rolled back independently from the student flag. The first
release does not add PostgreSQL RPC functions. Database-side aggregation and
transactional session switching remain later optimizations after the
lower-risk request reductions are measured.

## 6. Problem Loading and Navigation

### 6.1 Blocking problem snapshot

The blocking snapshot continues to contain everything required to display and
use the workspace:

- current published problem;
- public sample cases;
- hints;
- Previous and Next navigation metadata;
- destination session ID;
- destination saved draft or starter code;
- attempt count.

The full subject-wide `learning_context` is removed from the blocking portion
of the transition.

### 6.2 Deferred learning context

After the workspace is interactive, request the curriculum drawer context
separately.

The client stores successful learning contexts in a bounded in-memory cache
keyed by student and subject. Navigating within the same subject reuses the
cached context. A successful submission updates the current cached progress
locally using the existing `updateLearningProgress` behavior.

If deferred context loading fails:

- the editor, Run, Submit, Previous, and Next remain usable;
- the curriculum drawer shows its existing recoverable loading/error state;
- retrying the drawer request does not reload the problem workspace.

### 6.3 Adjacent prefetch

After the current workspace and deferred context settle, prefetch only the
immediate Next problem's read-only detail. If the user previously navigated
backward in the mounted workspace, the immediate Previous problem may be
prefetched instead.

Prefetch must:

- exclude session creation or mutation;
- exclude submission reconciliation;
- use the same public problem-detail authorization rules;
- keep at most two problem-detail snapshots in memory;
- never delay current-page interaction.

Selecting a prefetched neighbor still creates or restores the destination
collaboration session through the existing authoritative session path.

### 6.4 Compatibility

The existing `GET /api/problems/[id]` default response remains unchanged during
rollout.

The fast path requests:

```text
GET /api/problems/[id]?view=transition
```

This focused response excludes `learning_context`. Deferred context uses:

```text
GET /api/problems/[id]/learning-context
```

The focused response otherwise preserves the existing problem, sample, hint,
and navigation shapes. The client falls back once to the default problem
request if the focused request fails.

Attempt counting uses a count-only request:

```text
GET /api/submissions?problem_id=[id]&view=count
```

It returns no code or nested curriculum records. The existing problem-specific
submission-list response remains unchanged for old consumers and historical
submission selection.

## 7. Catalog and Draft Loading

The curriculum metadata request and draft request remain independent so draft
failure cannot block the catalog.

The draft request must return only records that can appear in the
"continue solving" experience:

- current student only;
- non-null `problem_id`;
- non-null `final_code`;
- minimal problem title and ordering fields;
- newest record first;
- at most one displayed draft per problem after deterministic deduplication.

Historical sessions with no saved code must not be downloaded by the catalog.
The existing `GET /api/sessions` contract remains unchanged. The catalog uses
the additive focused request:

```text
GET /api/sessions?view=drafts
```

Curriculum overview calculation should continue to return the existing subject
and stage response shape. The first implementation may reduce selected columns
and avoid duplicate submission rows, but it must not change published-record
filtering or solved-count semantics.

Static catalog metadata may be cached briefly on the server only when
user-specific progress is not included in the cached value. User progress must
never be shared across cache keys.

## 8. Student Submission History

Detailed history becomes paginated.

The existing unparameterized `GET /api/submissions` response remains unchanged.
The optimized history page uses `limit`, `cursor`, and `include_summary`
parameters.

### 8.1 Initial request

The first request returns:

- the newest 20 final student submissions;
- existing nested curriculum labels required by the UI;
- a cursor or offset for the next page;
- summary counts required by the three statistic cards.

The response must preserve the current ordering by `submitted_at` descending.
`judging` and `judge_error` remain excluded from learning statistics.
Visible history rows must not include submission code; opening a historical
attempt continues loading its code from the owned submission-detail endpoint.

### 8.2 Additional pages

The page provides a "load more" action after the first 20 records. Loading an
additional page appends records without replacing filters or scrolling to the
top.

Status, subject, stage, and chapter filters are applied by the server so a
matching record is never hidden merely because it was outside the first loaded
page. Changing a filter resets the cursor and loads the first matching page
while preserving the existing URL query parameters.

The initial response also returns lightweight filter-option metadata derived
from the student's complete final-submission history. This metadata contains
only curriculum IDs, labels, and ordering values; it contains no code or
detailed submission rows. Summary cards remain totals for the complete
unfiltered history, matching current behavior.

### 8.3 Safe interim summary

If exact distinct solved counts cannot be returned cheaply without a database
function, the endpoint may make a separate lightweight status-only query for
summary calculation. It must not download code or nested curriculum data for
records outside the visible page.

## 9. Grading Status

### 9.1 Normal poll

Normal browser polling reads the owned submission row and its safe public
status only. It does not:

- contact Judge0;
- update case results;
- finalize every case sequentially;
- repeat reconciliation on each 1.5-second poll.

Final responses may include the safe case-outcome list already shown by the
result drawer.

The read-only poll is selected explicitly:

```text
GET /api/submissions/[id]?mode=status
```

The existing unparameterized endpoint keeps its reconciliation behavior for
compatibility and delayed recovery.

### 9.2 Callback remains authoritative

Judge0 callbacks continue recording case results and finalizing submissions.
Callback authentication, token binding, idempotency, hidden-case protection,
and compare-and-set finalization remain unchanged.

### 9.3 Delayed fallback

Reconciliation is retained as a recovery path:

- do not reconcile during the first 10 seconds after submission creation;
- after 10 seconds, allow at most one reconciliation attempt per submission
  from that browser page;
- subsequent normal polls remain read-only;
- the existing stale-submission safety behavior remains available;
- a reconciliation failure keeps the result in `judging` unless the existing
  stale threshold is reached.

This preserves resilience when provider callbacks are delayed while removing
Judge0 and multi-row database work from the common polling path.

## 10. Public Demo and Editor Loading

The public demo shell is already fast enough for the first release. Monaco's
dynamic load is visible but does not block reading the problem.

The only approved MVP change is an optional same-origin module prefetch after
the shell becomes interactive. Pyodide remains lazy and must not download its
approximately 13 MB local runtime until execution is requested or deliberate
idle preloading is proven not to harm slower connections.

The demo must not become part of the critical student fast-path scope.

## 11. Administrator Problem Hierarchy

The administrator fast path applies only to the Subject, Stage, Chapter, and
Problem drill-down in Problem Management. Creating, editing, reordering,
publishing, and deleting curriculum records retain their current authoritative
API behavior.

### 11.1 One request owner per hierarchy transition

The URL remains the durable representation of the selected subject, stage,
chapter, problem, and panel mode. Direct links and browser Back and Forward
must continue to restore the correct hierarchy.

Same-page hierarchy changes must not initiate both a direct load and a second
load from URL synchronization. The implementation uses one transition path:

1. update the visible selection and URL;
2. let the URL synchronization path request only missing hierarchy data;
3. coalesce in-flight requests by hierarchy level and parent ID;
4. cache successful responses for the lifetime of the mounted admin page.

Before implementation, the applicable Next.js 16 documentation in the
installed package must be checked for the supported same-page search-parameter
history API. The chosen API must avoid a needless server route refresh while
remaining integrated with `useSearchParams` and browser history.

A failed request is not cached. It leaves the current breadcrumb intact,
displays the existing recoverable error state, and permits a retry. Rapid
repeated clicks for the same destination reuse the in-flight promise and do
not create parallel API calls. A late response for an older destination cannot
replace the currently selected level.

### 11.2 Scoped child counts

The existing endpoint response shapes and count fields remain unchanged:

- Subjects returns `stage_count`;
- Stages returns `chapter_count`;
- Chapters returns `problem_count`.

For the MVP, each endpoint may still calculate counts in application code, but
it must fetch child IDs only for the parent IDs in the current response:

- Subjects restricts Stage rows to the returned subject IDs;
- Stages restricts Chapter rows to the returned stage IDs;
- Chapters restricts Problem rows to the returned chapter IDs.

An empty parent result skips the child query. This prevents hierarchy latency
from growing with unrelated curriculum records while avoiding a database RPC
or schema migration. Database-side grouped counts can be reconsidered only if
the scoped queries remain material after measurement.

### 11.3 Rendering and interaction

The current full problem list remains unchanged for the MVP because the
measured chapter contains 35 problems and editor opening is acceptable.
Pagination or virtualization is deferred until a measured chapter size makes
rendering material.

While a hierarchy request is pending:

- the destination level displays a lightweight loading state;
- repeated activation of the same destination is disabled;
- breadcrumbs and previously cached levels remain interactive;
- no create, update, reorder, publish, or delete request is issued.

The problem editor keeps its current lazy detail request. Duplicate Tiptap
`link` and `underline` extension registration and repeated
`immediatelyRender` warnings should be corrected as an isolated editor cleanup,
with editor content and toolbar behavior covered by regression checks.

### 11.4 Administrator growth follow-up

The Users page is acceptable at the current 28-user MVP size, but its API
returns every matching user and related teacher-student rows. Server-side
pagination, paginated statistics, and bounded relationship loading are
required before the account count becomes large; they are not included in this
release.

AI Feedback is also acceptable at the current 41-pattern size. Pagination is
deferred until production measurement shows a material delay.

## 12. Teacher Monitoring and Analytics

Teacher performance work is divided into independently deployable changes.
Authorization scope is corrected first because request reduction must never
cache or accelerate data that the teacher is not allowed to access.

### 12.1 Assigned-student boundary

Every teacher monitoring and analytics endpoint must use the shared
teacher-student scope helper. The existing MVP rule remains unchanged: a
teacher with explicit mappings receives the assigned scope, while a teacher
with no mappings receives the `all` scope for active students.

The following rules are mandatory:

- active collaboration sessions are limited to the resolved scope;
- `student_id` history requests reject a student outside the resolved scope
  with `403`;
- submission-detail requests verify the submission belongs to a student in the
  resolved scope;
- problem and dashboard analytics include only students in the resolved scope;
- an empty mapping set preserves the existing intentional `all` scope;
- administrators do not inherit teacher endpoints unless the existing route
  explicitly supports them.

Assignment checks occur on the server. Client filtering is never treated as
authorization. No teacher response may include source code, session drafts,
identities, or aggregate contributions from outside the resolved scope.

### 12.2 Student monitoring

The Students page replaces its separate full student and session requests with
an additive focused request:

```text
GET /api/students?view=monitoring
```

It returns only active students in the resolved scope and the fields required
by the page:

- student ID, name, username, `is_active`, and `last_active_at`;
- active session ID, student ID, problem ID, problem number, and problem title;
- no `final_code`, feedback messages, session history, or unrelated students.

The existing `/api/students` and `/api/sessions` default contracts remain
available during rollout. Monitoring polling keeps the current 15-second
freshness target but:

- does not start a new request while the previous poll is pending;
- pauses while the page is hidden;
- aborts stale requests on navigation;
- preserves the last successful rows if a refresh fails;
- uses the same focused request for manual refresh.

If the focused endpoint remains above the target after scoping and column
reduction, the interval may move to 30 seconds. Realtime monitoring is not
introduced in this MVP.

### 12.3 Student progress history

The Progress student tab does not request global problem analytics. It loads
only the resolved-scope student list and the selected student's first summary
page.

The focused history request is:

```text
GET /api/submissions?student_id=[id]&view=teacher-summary&limit=20&cursor=[cursor]
```

It returns:

- final `pass`, `fail`, and `partial` submissions only;
- the existing status, score, case counts, runtime, elapsed time, and timestamp;
- minimal curriculum IDs, labels, and ordering fields required by the list;
- summary totals for the selected in-scope student;
- a cursor for the next page;
- no source code.

Opening "View code" requests the selected submission from the existing
submission-detail route after its teacher-assignment check. Changing students
aborts the previous request, clears stale expanded rows, and uses a bounded
in-memory cache keyed by teacher and student. Failed or partial pages remain
retryable and do not erase already displayed records.

### 12.4 Problem-level progress

Problem analytics are requested only after the teacher opens the Problem tab.
The default response contains curriculum group metadata and total problem
counts, but not every problem row and every submission.

The focused request accepts server-side curriculum filters:

```text
GET /api/progress?view=teacher-summary&subject_id=[id]&stage_id=[id]&chapter_id=[id]
```

Without a chapter selection, the UI renders collapsed chapter summaries.
Expanding a chapter requests that chapter's problem statistics. At most one
chapter's rows are expanded initially, so the page does not render all 398
problem rows.

The endpoint:

- restricts submissions to student IDs in the resolved scope;
- restricts problem and submission queries to the requested curriculum;
- selects no submission code;
- preserves the existing applicant, submission-count, pass-rate, and
  average-time semantics;
- returns empty results immediately for an empty student or problem scope.

Successful curriculum and chapter responses are cached for the lifetime of the
mounted Progress page. Concurrent requests for the same filter key are
coalesced, and stale filter responses cannot overwrite a newer selection.
Database RPC aggregation remains a later option only if focused requests do not
meet the target.

### 12.5 Dashboard analytics

Dashboard curriculum metadata is separated from user-specific analytics.
Published subject, stage, and chapter options may use a short shared server
cache because they contain no student data. Teacher-specific analytics are
never stored in a shared cache.

For each range and curriculum filter, the analytics handler:

- resolves the teacher-student scope once;
- filters problems in the database instead of downloading all published
  problems and filtering in application code;
- restricts submission and AI-feedback queries to students in the resolved
  scope and the requested period;
- starts independent curriculum and analytics queries in parallel where
  dependency ordering allows;
- selects only fields used by the aggregations;
- keeps the existing summary and chart response shapes.

The client retains the last successful curriculum options while analytics
reload, aborts superseded filter requests, and keeps a bounded in-memory cache
keyed by range, subject, stage, and chapter. A cached filter restores
immediately; a background refresh may update it without blanking the charts.

Database-side grouped aggregation is deferred until the focused and parallel
query path is measured. It may be introduced later behind the same response
contract without changing the dashboard UI.

### 12.6 Rendering and translation observation

Large teacher result sets use incremental rendering:

- student history shows 20 records initially and provides "load more";
- problem chapters are collapsed until selected;
- switching filters keeps previous content visible under a loading indicator;
- no page renders hundreds of hidden detail rows.

The React hydration errors observed while browser translation was active are
tracked separately. Verification must compare the same production page with
translation enabled and disabled. Application translation code is changed only
if the error reproduces without the browser translator or a supported
translation-safe rendering fix is identified.

### 12.7 Deferred teacher work

The following remains outside this release:

- PostgreSQL RPC aggregation for dashboard and problem statistics;
- realtime replacement of monitoring polling;
- long-lived cross-instance application caches;
- redesigning charts or teacher information architecture.

## 13. Observability

Optimized endpoints should report:

- a `Server-Timing` value for total handler time;
- structured server logs for total duration and major external phases;
- no student code, cookies, JWTs, service keys, Judge0 tokens, callback tokens,
  or hidden expected outputs.

Client measurements may log development diagnostics but must not send new
analytics or personal data in this MVP.

The before-and-after checklist records:

- cold and warm catalog load;
- cold and warm stage load;
- direct problem load;
- prefetched and non-prefetched Previous/Next;
- first history page;
- normal grading poll;
- delayed reconciliation poll;
- administrator Subject to Stage;
- administrator Stage to Chapter;
- administrator Chapter to Problems;
- administrator problem editor opening;
- teacher Students initial and manual refresh;
- teacher Dashboard initial analytics and each filter update;
- teacher Progress student-list readiness;
- teacher student-history first page and additional page;
- teacher Problem-tab shell and expanded-chapter statistics.

## 14. Rollout and Rollback

1. Add contract and regression tests before switching consumers.
2. Implement focused fast-path requests without deleting old behavior.
3. Verify locally against the development database.
4. Build and run the complete automated test suite.
5. Deploy a preview, remembering it currently points to production data.
6. Perform read-only preview smoke tests.
7. Enable the student fast path in production.
8. Deploy the administrator hierarchy optimization independently.
9. Deploy teacher assignment-scope corrections before teacher fast consumers.
10. Deploy focused teacher monitoring and progress consumers.
11. Deploy focused teacher Dashboard requests.
12. Re-run authenticated read-only production measurements for every role.

Rollback is an application deployment rollback or disabling the fast-path
consumer. Because existing endpoints and database schema remain compatible,
rollback does not require reversing data migrations.

No destructive migration or existing-column change is allowed in this release.
The administrator and teacher changes must be isolated so either can be
reverted without disabling the student fast path. Authorization-scope
corrections are security fixes and must not be rolled back merely to recover
broader legacy data visibility.

## 15. Error Handling

- Focused request failure falls back once to the existing request path.
- Deferred context failure does not disable the editor or navigation.
- Prefetch failure is silent and normal navigation performs a fresh request.
- History page failure preserves already loaded records and exposes retry.
- Draft-query failure hides draft continuation without blocking curriculum.
- Read-only status failure keeps the result drawer open and retries with the
  existing bounded polling interval.
- Delayed reconciliation failure is logged safely and does not convert a
  student attempt to a wrong answer.
- Administrator hierarchy failure preserves the selected breadcrumb, does not
  cache the failure, and exposes retry.
- Teacher monitoring refresh failure preserves the last successful student
  rows and exposes manual retry.
- Teacher history pagination failure preserves already loaded submissions.
- Teacher problem-progress failure preserves curriculum filters and collapsed
  chapter summaries.
- Teacher Dashboard filter failure preserves the last successful charts,
  identifies the failed filter, and exposes retry.
- A teacher resource outside an assigned scope returns `403`; the client does
  not retry it as a transient failure.

Fallbacks must be bounded. The client must not enter retry loops that multiply
traffic during an outage.

## 16. Testing

### Automated tests

- focused problem-detail contract excludes subject-wide context;
- existing problem-detail contract remains compatible;
- deferred context merges with the currently displayed problem only;
- stale deferred or prefetched responses cannot overwrite a newer problem;
- cache entries are isolated by subject and cleared on identity change;
- draft query excludes empty and unrelated sessions;
- history pagination is stable when timestamps differ;
- history summary excludes `judging` and `judge_error`;
- normal status reads never invoke Judge0 reconciliation;
- delayed fallback invokes reconciliation at most once;
- final grading response remains identical to the current public result;
- hidden cases and Judge0 credentials never enter student responses;
- one administrator hierarchy transition produces at most one API request for
  its destination;
- concurrent requests for the same administrator hierarchy key are coalesced;
- stale hierarchy responses cannot replace a newer selection;
- count endpoints query children only for parents in the current response;
- count endpoint response fields remain backward compatible;
- every teacher session, history, detail, progress, and Dashboard query uses
  the same resolved teacher-student scope;
- zero mappings preserve the intentional all-active-students scope;
- a `student_id` or submission detail outside an assigned scope returns `403`;
- monitoring summaries exclude session drafts and source code;
- teacher history summaries exclude source code and paginate deterministically;
- teacher code detail is fetched only after an authorized explicit request;
- the Progress student tab never requests problem analytics;
- problem summary filters restrict both problem and submission queries;
- stale teacher history, Progress, or Dashboard requests cannot overwrite a
  newer selection;
- teacher Dashboard response shapes and existing metric semantics remain
  compatible.

### Regression checks

- draft code survives Previous, Next, list return, and reload;
- destination problem draft takes precedence over starter code;
- curriculum drawer still selects the displayed problem;
- passing a problem updates progress;
- failed and partial submissions still trigger eligible AI feedback;
- teacher collaboration session ownership is unchanged;
- browser Back and Forward still restore the correct problem;
- submission result drawer still displays scored case results;
- administrator deep links restore every selected hierarchy level;
- administrator Back and Forward restore cached or freshly loaded levels;
- administrator problem create, edit, reorder, publish, and delete behavior is
  unchanged;
- the rich-text problem editor renders saved content and retains its toolbar
  behavior after the Tiptap cleanup;
- teacher Students online and solving classifications remain unchanged;
- manual refresh and background monitoring show only students in the resolved
  scope;
- teacher history totals, grouping, ordering, scores, and elapsed times match
  the legacy view;
- "View code" opens the correct in-scope student's submission;
- problem applicant counts, submission counts, pass rates, and average times
  match the legacy resolved-scope calculation;
- Dashboard summaries and charts match the legacy resolved-scope calculation;
- teacher filter URLs and browser Back and Forward behavior remain intact.

### Required verification

- targeted unit tests;
- complete Vitest suite;
- ESLint;
- production build;
- read-only preview smoke test;
- read-only production timing comparison;
- authenticated local administrator timing comparison;
- authenticated read-only administrator preview smoke test;
- authenticated local teacher timing comparison;
- authenticated read-only teacher preview smoke test;
- teacher scope-boundary tests using assigned, outside-scope, and
  zero-mapping/all-scope fixtures;
- production comparison with browser translation enabled and disabled.

## 17. Non-Goals

- Replacing Netlify or Supabase.
- Creating a general caching platform.
- Adding Redis.
- Rewriting collaboration or realtime messaging.
- Changing curriculum structure.
- Changing grading rules, scoring, hidden-case security, or Judge0 provider.
- Adding administrator Users or AI Feedback pagination before measurement
  requires it.
- Adding PostgreSQL analytics RPC functions before focused-query measurements.
- Replacing teacher monitoring polling with realtime subscriptions.
- Redesigning teacher charts or navigation.
- Deleting legacy endpoints before production verification.
