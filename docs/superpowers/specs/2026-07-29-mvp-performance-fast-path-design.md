# Reversible MVP Performance Fast Path

**Date:** 2026-07-29
**Status:** Approved for specification review
**Deployment:** Next.js 16 on Netlify, Supabase, managed Judge0

## 1. Objective

Improve the production response time of the student learning flow without
removing or weakening current behavior.

The first release focuses on the measured bottlenecks:

- learning-path catalog load;
- stage load;
- initial problem load;
- Previous and Next problem transitions;
- student submission history;
- authoritative grading status polling.

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

The current browser account is a student. Teacher and administrator pages were
reviewed from their code paths but were not timed with production role access.
The code review found growth risks in teacher progress aggregation, monitoring
polling, and unpaginated administrator user lists. Those areas are documented
as follow-up work and are not part of the first student fast-path release.

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
- no regression in saved drafts, session ownership, progress, grading results,
  AI feedback eligibility, or curriculum order.

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
6. add lightweight server timing and structured duration logs.

The optimized client path is selected by the non-secret build variable
`NEXT_PUBLIC_STUDENT_PERFORMANCE_FAST_PATH`. Missing or `false` uses the current
client requests. `true` uses the focused requests described below. Turning the
variable off and redeploying is the primary fast rollback; a Netlify deployment
rollback is the secondary rollback.

The first release does not add PostgreSQL RPC functions. Database-side
aggregation and transactional session switching remain a later optimization
after the lower-risk request reductions are measured.

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

## 11. Teacher and Administrator Follow-Up

The following work is explicitly deferred:

- database aggregation for teacher progress and dashboard analytics;
- pagination for administrator users;
- restricting teacher session polling to active sessions and assigned
  students;
- caching published curriculum metadata for teacher analytics;
- optimizing teacher feedback session bootstrap.

These require teacher/admin production timing or a safe role-specific
environment before implementation. They must be planned separately so the
student release stays small and reversible.

## 12. Observability

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
- delayed reconciliation poll.

## 13. Rollout and Rollback

1. Add contract and regression tests before switching consumers.
2. Implement focused fast-path requests without deleting old behavior.
3. Verify locally against the development database.
4. Build and run the complete automated test suite.
5. Deploy a preview, remembering it currently points to production data.
6. Perform read-only preview smoke tests.
7. Enable the fast path in production.
8. Re-run read-only production measurements.

Rollback is an application deployment rollback or disabling the fast-path
consumer. Because existing endpoints and database schema remain compatible,
rollback does not require reversing data migrations.

No destructive migration or existing-column change is allowed in this release.

## 14. Error Handling

- Focused request failure falls back once to the existing request path.
- Deferred context failure does not disable the editor or navigation.
- Prefetch failure is silent and normal navigation performs a fresh request.
- History page failure preserves already loaded records and exposes retry.
- Draft-query failure hides draft continuation without blocking curriculum.
- Read-only status failure keeps the result drawer open and retries with the
  existing bounded polling interval.
- Delayed reconciliation failure is logged safely and does not convert a
  student attempt to a wrong answer.

Fallbacks must be bounded. The client must not enter retry loops that multiply
traffic during an outage.

## 15. Testing

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
- hidden cases and Judge0 credentials never enter student responses.

### Regression checks

- draft code survives Previous, Next, list return, and reload;
- destination problem draft takes precedence over starter code;
- curriculum drawer still selects the displayed problem;
- passing a problem updates progress;
- failed and partial submissions still trigger eligible AI feedback;
- teacher collaboration session ownership is unchanged;
- browser Back and Forward still restore the correct problem;
- submission result drawer still displays scored case results.

### Required verification

- targeted unit tests;
- complete Vitest suite;
- ESLint;
- production build;
- read-only preview smoke test;
- read-only production timing comparison.

## 16. Non-Goals

- Replacing Netlify or Supabase.
- Creating a general caching platform.
- Adding Redis.
- Rewriting collaboration or realtime messaging.
- Changing curriculum structure.
- Changing grading rules, scoring, hidden-case security, or Judge0 provider.
- Optimizing every teacher and administrator page in the same release.
- Deleting legacy endpoints before production verification.
