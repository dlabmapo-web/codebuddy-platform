# Page-load query and request reduction

Date: 2026-11-05 (Asia/Seoul)
Status: implemented on `perf/reduce-repeated-queries` (from `feat/cove-studio-v2`
at `b9ab8851`) and verified locally. Uncommitted; awaiting user review.
Evidence: [deployed page-loading audit](../../research/2026-11-04-deployed-page-loading-audit.md)
and the local measurements recorded below.

## 1. Goal and constraints

Make page loads issue fewer sequential database statements, without changing
what any page shows or whom it admits.

- Every request keeps checking authorization fresh. Nothing is cached within or
  between requests: `common/request-context.ts` forbids ambient authority, and
  the 2026-10-27 performance spec keeps DLAB rules live.
- Response bodies must be identical before and after for every page-load read.
- No schema migration, Prisma preview feature, dependency upgrade, container
  resource limit or hosting change belongs to this work. Settings change only
  where the result is identical and only waiting is removed (4.5).

## 2. Method

The measurement harness used the real compiled API with only external services
replaced:

- **API:** the compiled API, unchanged.
- **Database:** a disposable PostgreSQL 17 with statement logging, loaded with
  the repository's demo dataset (`db:demo`).
- **Auth:** a local Supabase Auth double issuing HS256 test tokens.
- **Network:** a TCP proxy adding 17 ms in each direction, approximating today's
  Contabo Tokyo → Supabase Seoul round trip (production measured 33–39 ms).

Every `page.tsx` was mapped to the RPC procedures it reaches: 97 pages, of which
81 call the API. All 80 read procedures used on page load were then called as a
manager, team lead, teacher, student and platform administrator. DLAB numbers
used a DLAB-managed teacher and student. A large-course check grew one assigned
course to 1,604 materials.

For each call, the harness recorded:

- the statements it executed, with their parameters;
- its response time;
- its response body.

Background pollers were excluded from the counts. These measurements are local
and service-level; they are not production page p95.

## 3. Findings

| Finding | Evidence |
|---|---|
| DLAB eligibility ran as ~11–12 statements inside an interactive `REPEATABLE READ` transaction, twice per academy request | DLAB `auth.me`: 25 statements, ~1.0 s; DLAB exercise bootstrap: 63 statements, ~1.9 s |
| Ordinary accounts paid the DLAB `managed()` pre-check twice per request (gate + permission) | 156 of 1,184 baseline statements |
| `monitoring.getObservedMaterial` re-ran its whole access chain by calling the public `getStudentCurriculum` | 8 exact duplicate statements per call |
| `points.getPage` re-resolved points access by calling the public `listLedger` | 3 exact duplicate statements per call |
| Prisma (7.9 and 7.10.1) issues `... IN (NULL)` relation queries for empty optional relations | 130 of 1,184 statements (11%) |
| The short-answer and manual-submission workers each poll about once per second | Continuous database load, independent of pages |

## 4. Changes

### 4.1 One-statement DLAB eligibility

`integrations/dlab/dlab-eligibility-read.ts` reads, in one SQL statement:

- the identity and its user;
- every binding, with its membership, extra roles and academy;
- the candidate campuses.

The decision code in `DlabPolicyService.snapshot` is unchanged; only its data
loading moved. One `SELECT` is one snapshot, so the `REPEATABLE READ`
transaction and the separate `managed()` pre-check are no longer needed.
`activate()` still runs the snapshot after the integration advisory lock.

- **Campus predicates.** SQL applies `desiredDlabCampuses`' row predicates over
  the superset `{primary} ∪ external_campus_ids`. The effective scope, the
  account-status check and the allowlist stay in TypeScript, in the extracted
  `dlabCampusScope`, which `desiredDlabCampuses` now calls too. Each copy of the
  predicates carries a comment pointing to the other.
- **NULL campus list.** A NULL `external_campus_ids` is read as an empty list.
  Prisma reads it that way, and an empty scope grants nothing. The parity test
  caught an early draft that passed NULL through, which widened the scope to the
  primary campus.
- **Narrower result type.** The result is a narrow projection. The typecheck
  confirms that no consumer reads a dropped field.

### 4.2 DLAB policy facts inside the access reads

The eligibility read is a SQL fragment (`dlabEligibilityJson`), correlated to
the user row. `readAcademyPermission` and `readAccount` embed it, so permission
facts and DLAB facts come from one statement and one snapshot. (An earlier
revision returned only whether a DLAB identity existed.)

- **Academy permissions.** `AcademyAccessService.requirePermission` calls
  `DlabPolicyService.assertAcademyFrom` on the embedded facts. For an ordinary
  account the facts are null, and no policy runs.
- **Account reads.** `AuthService.present` calls `dlabAcademyIdsFrom` on facts
  from `readAccount`. Callers that pass full user records without facts keep
  reading the policy themselves.
- **Decision code.** The policy's decision (`decide`) is the former snapshot
  logic, unchanged. It now applies the rollout mode's `ssoEnabled` rule in code
  to candidate campuses that carry the flag, so the fragment needs no
  configuration.
- **Platform permissions.** The platform permission check is unchanged. It
  serves only administrator pages.

A DLAB account's academy request therefore costs two statements before its
data: the session gate and one permission read. It used to cost about 25.

### 4.3 Reuse of checks already made within one call

- `getObservedMaterial` passes its own material claim to the extracted
  `navigatorFor`. Its checks are a superset of `getStudentCurriculum`'s (they
  add the live watch).
- `points.getPage` passes its own scope to the extracted `ledgerFor`. In the
  ledger's resolution, `classId` is only validated against the scope, and the
  page passes a class taken from that same scope.

### 4.4 Sign-in lands directly (web)

Password login and signup with a session previously redirected to `/welcome`.
That page then ran `auth.bootstrap` and redirected again, so every sign-in
briefly showed `/welcome` and paid for a second page render.

The actions in `app/(auth)/actions.ts` now run the same bootstrap with the new
session's token. They apply the same `authDestination` and redirect once to the
final page, with `RedirectType.replace` as before.

- **Fallback.** `/welcome` remains the answer for an account that still needs
  it (no username, no academy). It is also the fallback when the bootstrap
  fails, where it shows its unavailable card exactly as before.
- **Unchanged flows.** Invitation and DLAB SSO flows are unchanged, and so is
  the username claim, which already happens on `/welcome`.

### 4.5 Connection reuse and preflight caching

- **Connection reuse.** `PrismaService` passes `idleTimeoutMillis: 120_000` to
  the pg pool; the default was 10 s. A reconnect to the remote pooler costs a
  TLS handshake, measured at ~207 ms in production. Two minutes stays well
  under the pooler's ~350 s network idle limit, so a kept connection is never
  silently cut. The pool size is unchanged (10).
- **Preflight caching.** CORS now sends `Access-Control-Max-Age: 600`. Every
  authenticated browser RPC is preflighted, and browsers otherwise forget the
  answer within seconds.

### 4.6 Curriculum outline loads only what outlines read

`visibleCurriculumInclude` selects only the fields its consumers read:

- **Programming exercise:** difficulty, submission policy and reference PDF.
- **Manual material:** whether it counts toward the score, and its maximum.
- **Video and PDF:** the metadata fields and asset state.

It no longer loads, once per material of a course, the exercise descriptions,
starter code, solutions and manual content. `pdfMetadata` now declares the five
fields it reads. The typecheck proves that no consumer reads a dropped field.

### 4.7 Independent page reads run together (web)

- **Student exercise page.** Starts `getExerciseBootstrap` alongside the
  `getMaterialType` Turtle check instead of after it. A Turtle exercise still
  redirects, and a failure is still a 404.
- **Staff exercise editor.** Requests the solutions alongside the exercise
  when the role allows editing. A failed solution read still fails the page
  closed, as before.
- **Points settings.** Requests the policy alongside the feature check. A
  points-off academy is still a 404.
- **Shared feature switches.** `getAcademyFeatures` (React `cache`, like
  `getAccount`) shares the feature switches between the studio frame and the
  settings pages within one render. Before, the same call ran twice.
- **Student home.** On the API, the student home reads its "continue" drafts
  in the same parallel group as its other independent sections.

### 4.8 Keep-alive outlasts the proxy

Caddy keeps idle upstream connections for two minutes. Node closes them after
five seconds by default, so Caddy could send a request on a connection Node had
just closed. A POST (every RPC) is not retried, and the user would see a 502.
The same race reset a browser test's direct API request (`ECONNRESET`).

- **API.** The HTTP server's `keepAliveTimeout` is now 125 s, and
  `headersTimeout` 126 s.
- **Web.** Compose sets `KEEP_ALIVE_TIMEOUT=125000` for `studio`. The Next
  standalone server reads it, as the installed Next.js docs recommend behind a
  proxy.
- **Verified.** The API answers `Keep-Alive: timeout=125`. A connection left
  idle for 7 s was reused rather than closed. `docker compose config` resolves
  the variable for `studio`.

### 4.9 Targeted DLAB re-checks

Every DLAB login and every HQ user sync published `recheck` to every live
socket, including no-op syncs. Each socket then re-verified its token and read
policy. At 400 sockets and 30 logins at the start of a class, that is about
12,000 checks in a minute through a 10-connection pool.

- **Login and user sync.** These now publish `recheck:<authUserId>`.
  `DlabPolicyService.watch(listener, authUserId)` wakes only that account's
  sessions.
- **Unchanged broadcasts.** Campus changes and the operator CLI still publish
  plain `recheck`, which wakes everyone. Anything unrecognised also wakes
  everyone, so an unknown message can only over-check.
- **No-op syncs** wake nobody. The 10-second periodic check is unchanged.

A change to one account cannot alter another account's policy facts, so no
outcome changes.

### 4.10 DLAB login

The login was measured end to end at 35 ms per round trip (returning user,
average):

| Step | Before | After |
|---|---|---|
| `complete` | 56 statements / 2.29 s | 45 / 1.86 s |
| `activate` | 11 / 0.45 s | 4 / 0.17 s |
| First `auth.me` | 25 / 1.02 s | 2 / 0.10 s |

`desiredDlabCampuses` no longer loads each campus's academy row. The reconcile
needs only `academyId`, which the filter guarantees.

The remaining cost is three locked transactions per login. They hold the one
platform-wide `cove:dlab:write` advisory lock for about 48 round trips. That is
about 1.7 s per login today, so 30 simultaneous logins queue for about 50 s;
in Seoul it would be about 2 s. The serialization is intentional, so changing
the lock is a separate design decision.

### 4.11 One-statement curriculum hierarchy

`learn/curriculum-read.ts` (`readCurricula`, `withCurriculum`, `withCurricula`)
reads each course's hierarchy in one statement instead of Prisma's nine or so.

- **Exact match.** It applies the same visibility filters (none in preview),
  the same `position, id` order and the same narrowed fields. It rebuilds the
  objects in the same key order, with `Date` and `BigInt` restored. Video byte
  sizes travel as text.
- **Call sites.** The learn service (catalog, outline, preview, workspace
  material), the outline service, the student overview, the class pages, video,
  PDF and manual (both reads) all load plain course rows and attach the
  hierarchy. Class pages attach every assigned course in one statement.
- **Types.** `visibleCurriculumInclude` remains the type source and the parity
  baseline.

### 4.12 Short-answer grading on submit

A queued short answer was graded only by a one-second poll, which ran two
statements every second even when idle.

- **Wake on queue.** Submission, resubmission and retry now call
  `requestDrain()`, so grading starts immediately.
- **No waiting between rounds.** A drain requested while one runs runs right
  after it. A drain that returns a full batch continues at once, so bursts no
  longer wait a second per batch of four.
- **Recovery.** The poll remains as recovery (expired leases, other processes)
  every five seconds.

### 4.13 Dashboard and console stages

- **Manager overview.** Reads academy media and role and class totals in its
  first parallel round instead of two later rounds.
- **Admin console.** The academy overview, course detail and class detail
  pages request their data beside the academy read. Existing 404, "load
  failed" and "access denied" outcomes are unchanged.

## 5. Rejected alternatives

| Alternative | Result | Decision |
|---|---|---|
| Prisma `relationJoins` | At 35 ms: −43% statements, −30% time. At 0 ms with the large course: 4.2 s → 6.5 s total; course list 98 → 364 ms; exercise bootstrap 118 → 325 ms. Postgres CPU builds per-row LATERAL JSON for wide curriculum trees. | Rejected. It loses once the app sits next to the database (planned AWS Seoul move), loads the Micro compute CPU, and is still a preview feature. |
| Prisma 7.10.1 | Same 34 `IN (NULL)` statements as 7.9.0 in the sample | Rejected; no benefit. |
| Reusing eligibility per request | Conflicts with the request-context rule; after 4.1–4.2 it would save about one statement per request | Not done. |
| Starting page data before `auth.me` | Needs every page (about 40) to guess its academy id from a cache and re-check it; saves one `auth.me` round trip (about 0.1 s today, about 10 ms in Seoul) | Not done; the risk to access paths outweighs the gain. |
| Trimming `auth.bootstrap` | Serves only password and social sign-ins, which an all-DLAB platform does not use | Not done. |

## 6. Verification

- **Response bodies.** All 80 page-load reads were compared. Bodies are
  identical except `generatedAt`, `asOf` and the session `deadline`.
- **Parity test.** `dlab-eligibility-read.integration.spec.ts` keeps the
  previous Prisma snapshot as a test-only baseline. It compares 25 cases plus an
  ordinary account, in both allowlist and campus rollout modes. The cases cover:
  - students, tutors, instructors, lab heads and HQ administrators;
  - NULL, empty, duplicate and unsorted scopes;
  - suspension, deactivation and the allowlist;
  - SSO-disabled, archived, suspended, library, inactive and unmapped campuses;
  - blocked and suspended bindings, role mismatch, tampered grants, foreign
    memberships and academy mismatch.
- **Unit test.** `dlab-policy.service.spec.ts` asserts one `$queryRaw` and no
  transaction.
- **Updated tests.**
  - `academy-access-read.integration.spec.ts` asserts that DLAB policy is read
    only for a governed account.
  - `navigation-performance.integration.spec.ts` asserts that DLAB filtering
    applies only once a DLAB identity exists.
- **Test runs.**
  - API unit tests: 148 files, 1,631 tests pass.
  - Official `pnpm test:dlab` on fresh containers, run to completion
    (`--max-failures=100`): all vitest stages pass (17 + 164 + 69 + 16 tests).
    Browser tests: 35 pass. The "tutors short answers and quizzes" variants
    also failed on unchanged `b9ab8851`, for two reasons:
    - The test waited for a 3-second workspace poll that `47e4385a`
      (2026-10-27) replaced with a lighter status check. The test now triggers
      the workspace's real refetch, on returning to the tab, and still proves
      that a refetch does not reset the open editor.
    - A keep-alive race reset a direct API request (4.8).

    After both fixes, all three variants pass.
  - Web: typecheck clean; 193 test files and 1,483 tests pass, including new
    sign-in landing tests.
  - The five browser password-login tests (student, teacher, team lead,
    manager, admin) pass and now assert that `/welcome` is never visited.
  - Every `COVE_INTEGRATION_DATABASE_URL` suite passes, except
    `sample-check.integration.spec.ts`. Its fixture still sends `solutionCode`,
    and it fails identically on unchanged `b9ab8851`.
  - Full repository `pnpm typecheck` passes.

Results on identical data (`b9ab8851` vs this branch, demo dataset with a
1,604-material course, DLAB teacher and student):

| Scope | Statements | Time |
|---|---|---|
| 80 page-load reads, 35 ms link | 1,829 → 1,004 (−45%) | 61.3 s → 28.6 s (−53%) |
| Same, 0 ms link | 1,828 → 1,003 | 4.40 s → 3.80 s (−14%) |
| DLAB student, 15 calls, 35 ms | 610 → 225 | 21.0 s → 6.9 s (−67%) |
| DLAB teacher, 16 calls, 35 ms | 666 → 261 | 25.1 s → 8.3 s (−67%) |
| DLAB returning login, 35 ms | 92 → 48 | 3.94 s → 2.04 s (−48%) |

### Browser page-to-page navigation

Production builds of the original `b9ab8851` (API and web) and of this branch
(API and web) were each served against a fresh disposable database. The
runner checks that the web server on port 3309 runs from that variant's build
folder; an earlier run had reused one web server for both variants, and its
figures were withdrawn.

- **Latency.** The database sat behind a 35 ms link, and Chromium had 45 ms of
  added latency (Korea → Tokyo).
- **Users.** All users were DLAB accounts created through the real SSO flow: a
  manager, a team lead, a teacher and 15 students in one academy, with a
  1,600-material course.
- **Method.** Each role clicked through its menus the way a person does. Time
  runs from the click until no page, RSC, API or script request is pending;
  link prefetches are excluded. Every step landed on its page with no server
  errors.

| Role | Pages | Warm pass | First visit | Statements |
|---|---|---|---|---|
| Manager | home, courses, course, problem editor, classes, class, people, students, student, staff, points, settings | 40.2 s → 10.8 s (−73%) | −67% | 1,394 → 333 |
| Team lead | home, courses, course, problem editor, classes, class, students, student, points | 29.2 s → 10.9 s (−63%) | −61% | 1,062 → 247 |
| Teacher | home, classes, roster, progress, student work, students, analytics, history, courses, course | 26.3 s → 6.5 s (−75%) | −75% | 1,035 → 116 |
| Student | home, courses, course, exercise, quiz, written answer, Turtle, video, PDF, classes, class, records, points, my page | 46.1 s → 16.0 s (−65%) | −67% | 2,505 → 586 |

Typical page switches are now 0.4–1.1 s, down from 2.2–3.5 s.

### 4.14 Activity pages arrive with their activity (web)

The quiz, written-answer and Turtle pages read the activity in the browser
after hydration, and everything else waited for that read.

- **Server read.** The pages now make that same read during the server render
  (`lib/manual-server.ts`: same endpoint, token and view-role header) and hand
  it to `ManualWorkspace`. Any failure falls back to the browser read.
- **One-time use.** Each server read carries a one-time token
  (`claimServerRead`). The browser uses the data only the first time it sees
  the token, so a payload replayed on back/forward navigation reads as before.
  The data applies only to the class it was read for.
- **Seeded status.** `useSubmissionStatus` no longer re-reads a settled seed
  (graded, recorded, or no attempt) on mount. An in-progress seed is still read
  at once, so grading feedback and its polling keep their timing.

Measured: quiz 4.87 s → 1.53 s, written answer 4.73 s → 1.51 s.

**Exercise page (6.21 s → 2.87 s).** Its client calls already run in
parallel. The remaining wait is the server bootstrap's sequential reads, about
30 at about 35 ms each, then editor hydration. A Seoul deployment reduces those
reads to roughly 50 ms; collapsing the workspace-material read with a
parity-tested reader is the code-side candidate.

**Team lead home (2.54 s → 2.32 s).** This page barely improved. It is the
next dashboard to profile: its aggregate queries scale with curriculum size
rather than round trips.

The final round also covers the new code:

- **Tests added.** Parity tests for embedded DLAB facts and the one-statement
  curriculum read (values, `Date`/`BigInt` types and key order), unit tests
  for targeted re-check notices and short-answer wake-ups, and a real-Redis
  test that a user sync re-checks only that account.
- **Totals.** API 1,638 unit and 87 integration tests pass, and web 1,483.
  Official `pnpm test:dlab` on fresh containers passes every stage
  (17 + 169 + 69 + 16) and all 37 browser tests.

## 7. Next candidates (not in this change)

1. **Curriculum outline statements.** The fields are narrowed (4.6), but the
   outline still loads one relation level per statement, including empty
   optional relations. Exercise bootstrap is still 41 statements. Collapsing
   those levels touches visibility rules and needs its own spec. Its benefit
   shrinks once the API sits next to the database.
2. **Dashboards.** The overview dashboards run 15–23 distinct queries each.
3. **Worker polling.** Lengthen or back off the one-second polls.
4. **Account-then-data waterfall.** Pages still need `auth.me` before their
   own data, because the academy id comes from the account.
5. **Admin console pages.** Several still load two to four reads one after
   another; they serve a few operators.
6. **Stale fixture.** Repair the `sample-check` integration fixture.

## 8. Rollout and rollback

There is no migration. Deploy the API and the web together. The web uses only
endpoints that already exist, so neither side depends on the other's
deployment order. Roll back by reverting and redeploying both. After deploying, repeat the audit's
Courses replay for one DLAB and one ordinary account.
