# Production page-navigation investigation

Date: 2026-10-27 (Asia/Seoul)
Status: observed in production; investigation only. No page-loading fix or
production deployment was performed in this investigation.

The subsequent [local implementation and verification](2026-10-27-navigation-performance-local-verification.md)
addresses these findings. The production measurements below precede those changes.

## Finding

The reported delay is reproducible in authenticated course/class navigation.
The evidence points to server-side data preparation, numerous database reads,
and an oversized course-builder response. This is separate from preparing
Python interpreters for grading. Container CPU ceilings may contribute too;
available host CPU/RAM does not establish that every container has spare quota.

The live assets identify `v2.0.42`, source
`2d6ace8b4d828287fe0de8db4eb95df2e2663ec2`. Earlier local performance changes
have not been deployed. Changes in observed live speed cannot be attributed
to those local changes; warmed assets, caches and varying load remain factors.

The user stopped the proposed native grading test. That later instruction
supersedes the earlier "Run now" reply. Grading was not paused or restarted,
the test slice remained inactive, and no native benchmark was resumed.

## Browser measurements

Used normal supplied-account sign-in and read navigation in Chrome. The table
records milliseconds from the automation's click to a visible destination
heading and first row/card. It includes browser-control overhead. Three
consecutive measurements per surface are exploratory samples, not p95/SLO
acceptance or a classroom-capacity test. Assets were not forcibly evicted, and
device/network conditions were not standardized.

| Account role | Courses | Classes / My classes |
| --- | --- | --- |
| Manager | 2,076 / 1,501 / 1,280 ms | 2,197 / 1,357 / 1,365 ms |
| Platform administrator | 2,306 / 1,247 / 1,002 ms | 1,447 / 785 / 769 ms |
| Teacher | 1,572 / 2,123 / 2,670 ms | 1,645 / 1,460 / 1,138 ms |

The initial manager Courses heading appeared after 2,258 ms; this separate
heading-only observation is not mixed into the table's data-ready samples.

Chrome Network inspection, with cache enabled and no configured throttling:

| Observed request | Network duration | Transferred | Decoded page data | Waiting for response | Content-download phase |
| --- | --- | --- | --- | --- | --- |
| Manager Classes navigation | approximately 1.80 s | 1,229 B | 30,350 B | 60.79 ms | approximately 1.69 s |
| Teacher course containing 427 materials | approximately 3.70 s | approximately 237 kB | approximately 963 kB | 38.78 ms | approximately 3.54 s |

Both returned HTTP 200. The Classes payload is tiny, so bulk-download size is
not a convincing explanation for that request's duration. Next streams the
response: early headers/bytes can arrive quickly while the remaining server
render waits for data. Chrome's "Content download" phase includes waiting for
those later bytes; it is not a measurement of bandwidth alone. The trace by
itself does not split database time from server render/serialization time.

The larger course also triggered subsequent automatic exercise-route prefetches;
29 requests were visible after navigation. That is not 29 SQL statements, and
the experiment does not prove that prefetch causes the initial delay.

One teacher heading wait exceeded the browser tool's deadline during diagnostic
setup; the page later displayed normally. It has no reliable click-to-ready
duration and is retained as an unmeasured observation. The large-course heading
wait also exceeded that deadline; its 3.70-second value comes from the Network
request timing, not a fabricated UI-ready duration.

## Deployed read-method diagnostic

Ran the deployed account/course/class read methods for the supplied manager
account from a short-lived auxiliary process, inside a transaction explicitly
set to **READ ONLY**, with that setting checked before the reads. SQL verbs
were additionally restricted. No full Nest application was booted, no workers
were started, and no authentication token was created/exported by this diagnostic.
Only aggregate statement/table timings and row counts were retained.

| Read method | SQL statements | Fresh-process first call | Subsequent calls |
| --- | --- | --- | --- |
| Account (`auth.me` service) | 11 | 1,059 ms | 490 / 692 ms |
| Academy Courses list | 11 | 576 ms | 456 / 467 ms |
| Academy Classes list | 17 | 748 ms | 736 / 605 ms |

These are diagnostic method measurements, **not production HTTP endpoint
latencies**. They exclude HTTP/token middleware and RSC work. The fresh process
has different caches/JIT state from the live API; the read-only transaction can
serialize independent queries. Individual SQL timers may include queued time
and overlap, so their sums must not be added to method or browser durations.

The Courses read returned 23 course summaries but fetched visibility/type data
for **988 material rows**, plus 170 lecture and 33 module rows in the final
sample. The Classes read returned 21 classes and traversed course assignments,
course/module/lecture availability and teacher/assistant roles. Account reads
also loaded memberships, feature flags, member profiles, assets and join requests.

The normal page path performs its account/route resolution before requesting
the list, so repeated read/authorization work contributes to its critical path.
The diagnostic's statement counts are for those read methods; request middleware
and optional shell reads can add more. They are not asserted as exact totals
for an entire browser navigation.

Initial diagnostic preflight probes refused to proceed when a connection-level
read-only option could not be confirmed. Explicit transaction read-only mode
resolved that guard. Two diagnostic selector mistakes were corrected before
the successful method measurements. Those setup errors are not app failures
or measured request samples.

## Source findings

1. [Server account client](../../packages/web/src/lib/orpc-server.ts) already
   memoizes `getAccount` per React server request. That prevents duplicate reads
   within one render; it does not eliminate the next navigation's account read.
   [Route guards](../../packages/web/src/lib/academy-route.ts) use that account
   to resolve current membership/role before page-specific data is fetched.
2. [Courses service](../../packages/api/src/content/course.service.ts) reads
   nested module/lecture/material flags in `courseSummaryInclude` to build
   counts and visibility. It is lighter than a full editor tree but still
   scales with material count instead of only the number of displayed courses.
3. [Classes service](../../packages/api/src/classes/classes.service.ts) uses
   `classListInclude` to traverse assigned-course availability and staff roles.
   It avoids full student roster PII, but its relational reads still incur
   many DB interactions.
4. [Staff course page](../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/staff-course-page.tsx)
   fetches `academyCourses.getTree` before rendering. The service's tree loads
   exercise descriptions, test cases/hints and manual material data
   for the course, then serializes a broad course-builder model. Full solution
   arrays already have a separate exercise-authoring read. The large response
   is consistent with that implementation, even for a reader initially looking
   at the course outline. This is an authorized staff payload, not a finding
   that students can read hidden cases.
5. [Administrator content page](../../packages/web/src/app/(platform)/admin/content/_lib/render-content-page.tsx)
   starts rows and the summary in parallel, but awaits both before rendering
   the table. Separate error handling prevents one failure hiding the other;
   it does not remove a slow supplementary summary from the loading path.
6. Client queries already have a default 60-second freshness window in
   [query configuration](../../packages/web/src/lib/query.ts). Server-rendered
   page reads can still run before that client cache is used. "Add caching"
   without locating the specific redundant read is not a sufficient fix.

## Resource observations and limits

Two snapshots, approximately 198 seconds apart around the later inspection,
reported five-minute host CPU averages of **12.67% and 10.89%**, zero sampled
CPU steal and **8.66–8.69 GiB available RAM**. API and web containers each have
a **1.25-CPU ceiling** and 1,536 MiB memory ceiling. At the latter snapshot,
their memory use was approximately 277 and 263 MiB respectively.

Both containers stayed healthy with unchanged start times, zero restarts and
no OOM-killed state. In that sampling interval, API counters recorded 19 of 732
scheduling periods throttled; web counters recorded 26 of 111. These ratios
describe active scheduling periods, not percent of host CPU or elapsed time.
The interval includes uncontrolled natural traffic and later login activity;
it is not a controlled CPU-quota comparison attributable solely to our clicks.

The observations do not show exhausted VPS RAM or sustained host CPU saturation.
They also do not rule out burst limits or a web-container quota contribution.
No resource limit was changed, and no host-upgrade or classroom-capacity claim
is supported by these small observations.

## Next implementation priorities

- Replace course/class list graph traversal with correctly scoped database
  aggregates/projections. Preserve visibility, enrollment, archive and role
  semantics; compare the old/new result on the same fixtures.
- Introduce a smaller course-outline/editor bootstrap and fetch individual
  exercise edit details when needed. Change the DTO and consumers together;
  simply dropping test cases from the existing editing contract risks an
  incomplete edit overwriting saved content.
- Reduce account/authorization work on the navigation path with minimal route
  context and request-scoped deduplication where valid. Preserve fresh access
  checks; never use an unscoped global user/permission cache.
- Remove supplementary summaries/widgets from the critical path where they do
  not determine authorization or the primary table. Preserve layout, pending
  feedback and local draft state.
- Re-measure the same browser journeys after local changes pass role/privacy
  tests, then evaluate quota tuning separately if throttling remains material.
  The earlier approved ≤1.5-second usable-navigation target remains a release
  gate, not an achieved result of this investigation.

## Coverage, privacy and production state

Manager, administrator and teacher views were exercised. The team-lead sign-in
was blocked before authentication by the site's security-widget error `300030`
("The security check could not load"). Student sign-in was not attempted after
that blocker. Neither remaining role is represented as measured. The widget
was not bypassed, and its root cause is not established by this page audit.

Normal sign-in/sign-out activity occurred. No course/class configuration,
student work, submissions, grades, permissions or server settings were edited.
Production grading kept running on its original containers. Supplied passwords,
tokens, raw headers, HTML bodies, names/rosters, SQL text and SQL parameter values
are absent from the saved evidence. Login fields were cleared after the block.
The final Redis read confirmed all four grading queues were globally unpaused,
with zero waiting/active/delayed jobs at that instant. The temporary browser tab
was closed and the developer-inspector filter/panel were restored.

Sanitized evidence:
[browser observations](assets/2026-10-27-page-navigation/browser-observations.json),
[read-only method profile](assets/2026-10-27-page-navigation/read-only-service-profile.json),
[resource summary](assets/2026-10-27-page-navigation/resource-summary.json).
[Final grading-queue status](assets/2026-10-27-page-navigation/grading-queue-status.json)
is retained separately; it is not a throughput benchmark.
