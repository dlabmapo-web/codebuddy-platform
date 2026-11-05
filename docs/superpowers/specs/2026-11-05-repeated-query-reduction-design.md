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

### 4.2 Whether DLAB governs an account, in the same snapshot

`readAcademyPermission` and `readAccount` also return
`EXISTS (dlab_identities for this user)`.

- `AcademyAccessService.requirePermission` reads DLAB policy only when that fact
  is true. For a governed account, the policy still runs live on every request.
- `AuthService.present` skips `dlabAcademyIds` only when the fact is explicitly
  `false`. Other callers pass full user records without the fact and keep
  checking as before.
- The platform permission check is unchanged. It serves only administrator
  pages, and folding it would have meant replacing its tested Prisma read for
  one statement.

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

## 5. Rejected alternatives

| Alternative | Result | Decision |
|---|---|---|
| Prisma `relationJoins` | At 35 ms: −43% statements, −30% time. At 0 ms with the large course: 4.2 s → 6.5 s total; course list 98 → 364 ms; exercise bootstrap 118 → 325 ms. Postgres CPU builds per-row LATERAL JSON for wide curriculum trees. | Rejected. It loses once the app sits next to the database (planned AWS Seoul move), loads the Micro compute CPU, and is still a preview feature. |
| Prisma 7.10.1 | Same 34 `IN (NULL)` statements as 7.9.0 in the sample | Rejected; no benefit. |
| Reusing eligibility per request | Conflicts with the request-context rule; after 4.1–4.2 it would save about one statement per request | Not done. |

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
    Browser tests: 35 pass and 2 fail. The failures are the edu_manager and
    lab_head variants of "tutors short answers and quizzes", both timing out
    on the 3-second manual poll. On unchanged `b9ab8851` all three variants of
    that test fail, so the failure predates this change.
  - Web: typecheck clean; 193 test files and 1,483 tests pass, including new
    sign-in landing tests.
  - The five browser password-login tests (student, teacher, team lead,
    manager, admin) pass and now assert that `/welcome` is never visited.
  - Every `COVE_INTEGRATION_DATABASE_URL` suite passes, except
    `sample-check.integration.spec.ts`. Its fixture still sends `solutionCode`,
    and it fails identically on unchanged `b9ab8851`.
  - Full repository `pnpm typecheck` passes.

Results on identical data:

| Scope | Statements | Time |
|---|---|---|
| 80 page-load reads, 35 ms link | 1,827 → 1,112 (−39%) | 61.3 s → 32.0 s (−48%) |
| Same, 0 ms link | 1,825 → 1,112 | 4.20 s → 3.61 s (−14%) |
| 11 DLAB teacher/student page calls, 35 ms link | 422 → 82 (−81%) | 14.8 s → 3.1 s (−79%) |
| DLAB `auth.me`, every page | 25 → 3 | 1,028 → 140 ms |

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
6. **Stale or timing-sensitive tests.** Repair the `sample-check` integration
   fixture, and the "tutors short answers and quizzes" browser test. That test
   fails on unchanged `b9ab8851` (all three variants, waiting on the 3-second
   manual poll).

## 8. Rollout and rollback

There is no migration. Deploy the API and the web together. The web uses only
endpoints that already exist, so neither side depends on the other's
deployment order. Roll back by reverting and redeploying both. After deploying, repeat the audit's
Courses replay for one DLAB and one ordinary account.
