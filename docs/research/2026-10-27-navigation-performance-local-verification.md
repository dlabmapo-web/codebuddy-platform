# Navigation performance implementation: local verification

Date: 2026-10-27. Status: implemented and verified locally; not deployed.
Based on the [production investigation](2026-10-27-production-page-navigation-performance.md)
and the approved [performance design](../superpowers/specs/2026-10-27-platform-runtime-performance-design.md).

## Implemented

- `AuthService.me` reads a fresh, minimal account graph in one SQL statement.
  The existing serializer, suspension/deletion refusal, missing-user bootstrap,
  DLAB academy filtering and avatar signing remain in place. No permissions
  are cached between requests. Sign-up/onboarding write paths are unchanged.
- Course lists load course/provenance metadata plus one batched aggregate for
  the displayed academy/course IDs. Empty parents, hidden ancestors, PDFs and
  other material types preserve their existing counts and meanings.
- Class lists load assignments, staff roles/status and roster counts in one
  projected statement, followed by batched course counts. Student identities,
  emails, rosters, schedules and course bodies are excluded from that read.
  Class detail still uses its complete, separately authorized projection.
- Authenticated `academyCourses.getOutline` is a distinct DTO/read. It returns
  only builder metadata and badges. Full tree/authoring endpoints still return
  the complete editor data. API permission and tenant guards match `getTree`.
- Academy, platform academy and library builders use the outline, as do parent
  lookups for new exercises, moved-exercise redirects, import preparation and
  the PDF reference picker. Complete editor drafts still use `getExercise`
  and the separately authorized solution endpoint.
- Builder/PDF outline queries have a distinct key under the existing shared
  course invalidation prefix. A 30-second builder freshness window avoids the
  duplicate mount read; exercise saves/imports still invalidate the prefix.
- Administrator rows render without waiting for supplementary counts. The
  existing client summary query loads the optional strip afterward.
- Server RPC accepts runtime-only `INTERNAL_API_RPC_URL`; production Compose
  supplies `http://api:4000/api/rpc` on the existing backend network. Browser
  API URLs, bearer tokens, BFF headers and role-view behavior are unchanged.

## Deterministic size and query-count evidence

The disposable local PostgreSQL fixture has 427 mixed materials, empty parents,
hidden ancestors, a copied course, multiple staff roles, enrolled students,
archived classes and an unrelated academy. Rich exercise bodies are synthetic.
This is not a copy of production content.

The complete fixture tree is **734,935 bytes**; its outline is
**110,492 bytes**, a **84.97% reduction** in serialized JSON.

| Projection | SQL statements, old → new | Illustrative local median |
| --- | --- | --- |
| Account graph | 10 → 1 | 2.54 → 1.00 ms |
| Course count projection | 6 → 1 | 3.65 → 0.84 ms |
| Class metadata | 12 → 1 | 3.13 → 1.12 ms |

These are five consecutive local reads per variant. The account comparison
covers graph loading, excluding the separate DLAB policy query and avatar
signing. Course count projection is not the complete course list endpoint:
metadata/provenance still require their own reads. Class metadata excludes
its separate aggregate. Authorization is excluded on both sides of these
projection comparisons, but is exercised by the service/permission tests.
The current complete local course/class list services made 8/6 SQL statements
respectively, including authorization.

Local timings are illustrative, not controlled production CPU/quota results,
HTTP response times, classroom capacity or p95. A local database removes the
network penalty of repeated remote queries. Payload size and statement counts
are the stronger evidence here. The <=1.5-second production navigation target
has not been demonstrated by this implementation.

## Validation

- 928 shared-contract/domain tests passed.
- 514 related backend regression tests passed (authentication, authorization,
  content, classes, learning, profiles and platform).
- 23 real PostgreSQL integration tests passed, including new navigation checks,
  existing course moves and manager academy access. Coverage includes SQL count
  equivalence, tenant isolation, hidden/empty/mixed-type content, copied-course
  provenance, class status and roster counts, teacher extra roles, suspended
  staff, student denial, account membership/features/application timestamps,
  DLAB filtering, suspension denial, outline privacy and full authoring data.
- 150 related frontend tests passed, including outline cache freshness and
  prefix invalidation, full editor/import/move behavior, PDF/manual/video
  dialogs, account/role routing, server transport headers and non-blocking
  administrator summaries.
- Shared build, API/web/shared type checks, focused frontend ESLint and the
  optimized production web build passed. `git diff --check` passed.

Shared typechecking also identified four obsolete `verdict` properties in
existing latest-submission test fixtures after earlier work. Those unused fixture
properties were removed; runtime submission behavior was not changed here.

Reproduce database verification with:

```sh
bash packages/api/scripts/test-navigation-performance.sh
```

It creates a disposable local PostgreSQL container on a random loopback port,
uses a fixture-only URL, applies existing migrations and removes the container
on exit. It never reads a deployment database URL. Optional
`COVE_NAVIGATION_EVIDENCE_PATH` writes aggregate evidence only. The fixture
contains no supplied login passwords, tokens or student records.

[Recorded local projection samples](assets/2026-10-27-navigation-implementation/local-projections.json)
contain counts, synthetic payload sizes and durations only.

## Release and remaining acceptance

No new database migration is required. Deploy the additive API first, verify
it is healthy and exposes `getOutline`, then deploy the matching web image and
Compose configuration. The previous web remains compatible with the new API;
a web rollback must precede an API rollback that removes the outline endpoint.
Pin images to the reviewed source revision and retain the prior release pair.

After rollout, repeat the manager/admin/teacher course/class journeys and a
large course; separately measure click-to-usable-content and request durations.
Check student and team-lead access, current roles, editing/saving, PDF references,
imports, API errors and container throttling. Keep the navigation SLO as a
release gate; do not infer capacity or buy more VPS resources from local tests.

Production was not changed in this implementation turn. The stopped native
grading benchmark remains stopped, with no production pause/restart, quota
change or deployment. Earlier uncommitted grading work remains separate.
