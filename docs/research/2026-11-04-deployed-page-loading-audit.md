# Deployed page-loading audit — 2026-11-04

## Result

Optimize the shared authorization read path before purchasing a larger VPS or
migrating to AWS. Repeated DLAB eligibility snapshots are a demonstrated source
of latency across academy pages for DLAB-managed accounts. Student catalog reads
also fetch substantially more curriculum content than their summaries need.

This is a diagnosis, not a deployed fix. No application code, production
configuration, credentials, memberships, coursework, or database schema changed.

## Scope and provenance

- User symptom: all platform pages feel slow when switching between them.
- Inspected `feat/cove-studio-v2` in the separate sibling worktree
  `codebuddy-platform-performance-audit`; the original checkout and its
  uncommitted student-history work were preserved.
- Local branch: `7f50870d`; fetched origin branch: `0ae56bc6`.
  Their only differences are two documentation files.
- Live Studio, API, judge, and home images reference `0ae56bc6`.
- Used SSH for read-only host/container inspection, existing Prometheus data,
  redacted Caddy logs, and bounded read-only service/database probes.
- Probes reused deployed compiled modules and runtime configuration. No JWTs,
  passwords, connection strings, signed URLs, account identifiers, or student
  content are included in this report.
- The authenticated manager dashboard was visible in Chrome. Browser diagnostic
  calls were unreliable, so no browser click-to-content, LCP, or hydration timing
  is claimed.
- Consulted the installed Next.js linking/navigation guide. The existing app uses
  persistent layouts, `Link`, loading boundaries, and request-local React caching;
  missing navigation skeletons or full-page anchor reloads are not the primary
  finding from this inspection.

## Production measurements

### Host resources

At inspection: load average approximately `0.54 / 0.62 / 0.67`, about 3.5 GB RAM
used and 8.4 GB available, disk 71% used with approximately 57 GB free.
Short `vmstat` samples showed 94–99% idle CPU, no I/O wait, and no CPU steal.
Studio and API had zero container restarts and were not marked OOM-killed.

Existing seven-day Prometheus data showed:

| Measurement | Observed |
| --- | ---: |
| Minimum available host memory | 8.06 GiB |
| Peak host CPU usage, five-minute averages | 50.43% |
| Peak CPU steal, five-minute averages | 0% |

These samples do not rule out brief CPU spikes or future classroom contention.
Studio and API each retain a 1.25-vCPU limit. Lifetime cgroup counters show some
throttling, so host-wide spare capacity must not be confused with unlimited CPU
per container. The measured read-path delays below occur without exhausting host
resources; raising RAM is not a demonstrated remedy.

### Existing request logs

Active log window: **2026-11-04 02:47–10:41 Asia/Seoul**
(`2026-11-03 17:47–2026-11-04 01:41 UTC`). The previous rotated log was not sampled.

| Group | Count | Median | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Successful non-prefetch Next RSC GETs | 330 | 1,013 ms | 1,894 ms | 3,074 ms |
| Successful API POSTs, statuses 200/201 | 427 | 766 ms | 3,399 ms | 16,158 ms |

Caddy durations cover server request handling/response delivery, not complete
browser rendering. API POSTs mix reads and other operations; their tail must not
be attributed to page reads alone. Production deliberately removes request URIs
from access logs, so this data cannot rank individual pages or endpoints.
WebSocket lifetimes were excluded from these latency groups.

### Database round trips

Twelve `SELECT 1` probes from the API container: initial connection/query 207 ms;
subsequent queries 33–39 ms. The database was about 130 MB. This demonstrates a
network/connection round-trip floor rather than expensive execution of `SELECT 1`.
The Japan application / Seoul database placement amplifies sequential queries.

## Findings

### 1. High priority: DLAB eligibility is expanded and repeated on shared reads

Relevant code:

- `packages/api/src/integrations/dlab/dlab-policy.service.ts:34`:
  `eligible()` first reads the identity, then opens a repeatable-read transaction
  whose nested includes fetch user, bindings, memberships, academies, roles,
  campuses, and campus academies.
- `packages/api/src/auth/supabase-auth.service.ts:76`: token verification calls
  `assertSession()`, which calls `eligible()`.
- `packages/api/src/auth/auth.service.ts:480`: presenting `auth.me` calls
  `dlabAcademyIds()`, which calls `eligible()` again.
- `packages/api/src/authorization/academy-access.service.ts:110`:
  permission checking calls `assertAcademy()`, which calls `eligible()` again.
- `packages/api/src/common/request-context.ts` has request-local attribution and
  view-role state but no deduplication for these reads.

Measured deployed-service probes:

| Read | Ordinary account | DLAB account |
| --- | --- | --- |
| DLAB eligibility | 42 ms / 1 query | 644 ms / 10 query events |
| Account SQL snapshot alone | 41 ms / 1 query | 38 ms / 1 query |
| Academy permission service | 73 ms / 2 queries | 459 ms / 11 query events |
| `AuthService.me` handler, three runs | 72–99 ms / 2 queries | 470–545 ms / 11 query events |

Query events include transaction completion when emitted by Prisma; transaction
setup can add time without a corresponding event. These are bounded samples,
not endpoint percentiles.

The important difference is not the account SQL snapshot: that takes around
one round trip for either account. It is repeatedly re-expanding DLAB policy.

### 2. High priority: the web transition serializes account and page-data reads

`packages/web/src/lib/academy-route.ts:66` resolves the account before returning
academy identity. `getAccount()` in `packages/web/src/lib/orpc-server.ts:81` calls
`auth.me`; React `cache()` deduplicates within one server request, not across
independent HTTP requests or subsequent navigations.

For example, `content/courses/_components/staff-courses-page.tsx:27` awaits the
route guard, then calls `academyCourses.list` at line 34. Each API request does its
own authentication, and the list handler does academy authorization too.
This makes repeated policy checks part of the page's critical path.

A read-only replay of those deployed service stages, using the adapter's normal
pool defaults, measured:

| Stage | Ordinary, run 1 / 2 | DLAB, run 1 / 2 |
| --- | ---: | ---: |
| First RPC's DLAB gate | 38 / 35 ms | 425 / 568 ms |
| Account handler | 96 / 69 ms | 451 / 666 ms |
| Second RPC's DLAB gate | 35 / 34 ms | 400 / 439 ms |
| Staff course-list handler, including permission gate | 339 / 174 ms | 559 / 612 ms |
| **Total** | **508 / 312 ms; 10 queries** | **1,835 / 2,285 ms; 46 query events** |

This is a controlled service-path replay, not an actual authenticated HTTP
benchmark. It excludes JWT verification, Redis session checks, Next rendering,
HTTP transport, asset downloads, and browser work. The two account samples may
have different academy data, so total response sizes are not controlled; the
repeated-policy query expansion itself is directly observable.

### 3. Medium priority: student catalogs fetch full curriculum content

`packages/api/src/learn/learn.service.ts:96` uses `visibleCurriculumInclude` to
build course summaries. That include, in
`packages/api/src/learn/curriculum-outline.service.ts:29`, loads every visible
module, lecture, and material, plus complete programming/manual records and
video/PDF assets. Programming records include fields such as descriptions,
starter code, and solution content, although the list response needs summaries
and progress.

A sample DLAB student's genuinely assigned-course predicate returned five
courses and 1,276 materials. Serializing the internal Prisma result measured
**3,649,656 bytes**, across 10 query events. That is internal database-to-API
materialization, not the browser response size. The probe used a separate pool
capped at two connections; its 1,604 ms elapsed time is diagnostic and must not be
treated as a measured production endpoint latency.

The same broad include also appears in student-overview scope loading. This is
an additional course/dashboard problem, not the explanation for every ordinary
staff page transition. Staff catalogs already use a separate summary/count path.

## Recommended implementation order

1. Collapse DLAB eligibility into a narrow fresh database snapshot with fewer
   round trips. Preserve suspension, source status, generation, role, campus,
   membership, and academy checks and the required consistency semantics.
2. Reuse eligible-account policy work within an API request where safe. Scope
   reuse to the request; handle mutation invalidation explicitly. Do not introduce
   a long-lived authorization cache or skip independent authorization on page
   endpoints. Separate RPC requests will still need independent validation.
3. Reduce duplicate work across the web account/page-data sequence with an
   explicitly authorized combined read or another design that retains fresh
   server-side authorization. A loading animation alone will not remove this cost.
4. Replace the catalog's full content graph with fields/counts required by its
   summaries and progress states; preserve visibility and assignment predicates.
5. Add bounded, named stage timing for authentication, authorization, database,
   and endpoint handling. Keep tokens, raw query strings, and student content out
   of telemetry. Verify before/after authenticated navigations for ordinary and
   DLAB accounts and each academy role, including suspension/revocation tests.

## Hosting decision

The available measurements do not justify purchasing VPS 8/VPS 12 for page
switching latency. More RAM does not remove repeated database round trips, and
a larger server in Japan leaves the Japan–Seoul hop in place. AWS Seoul could
shorten that hop but is not required to address the demonstrated software work.
Reassess hosting after fixing and measuring the common loading path, including a
representative busy-class window.

## Follow-up: Supabase error logs inspected in the signed-in browser

Inspected the project's Unified Logs page on 2026-11-04, using Chrome's visible
interface after the browser DOM inspection connection failed. Selected Postgres
and expanded the time range from 60 minutes to 24 hours. No database settings or
schema were changed.

The repeated PostgreSQL event in the inspected rows is SQLSTATE `3F000`:

```text
schema "pg_pgrst_no_exposed_schemas" does not exist
```

Consecutive events appeared approximately every 32 seconds. The hour view showed
112 errors; the 24-hour view showed approximately 2.7k errors. A 32-second repeat
would produce about 2,700 events per day, consistent with the user's screenshot
showing 2,640 PostgreSQL errors. This is a cadence comparison, not an exhaustive
classification of every event in that screenshot.

The initial combined log view also showed `/rest-admin/v1/ready` returning 503 to
Supabase infrastructure health checks, alongside successful Auth and Storage
requests. This is consistent with a PostgREST service that cannot load its
configured placeholder schema; it is not evidence that Prisma database queries
or every user page request failed.

Supabase's official article, updated 2026-11-03, documents this exact error when
the Data API is disabled. It explains that PostgREST continues running with a
nonexistent placeholder exposed schema and says the resulting logs should not
adversely affect the project:

https://supabase.com/kb/troubleshooting/schema-pg_pgrst_no_exposed_schemas-does-not-exist

The repository's `docs/design/2026-07-22-cove-v2-system-design.md:545` explicitly
specifies disabling the Data API because NestJS and Prisma own database access.
This architecture and the observed event pattern support treating the repeated
missing-schema errors as known Supabase/PostgREST log noise, rather than the
demonstrated cause of slow page switching. They do not supersede the measured
authorization round-trip bottleneck above.

The official article includes an empty-schema/configuration workaround to quiet
these entries. It was not applied: the requested task was to inspect logs, and
silencing this noise is separate from improving navigation performance.
