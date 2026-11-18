# Library course synchronization

Implementation branch: `feat/library-course-sync`. No production rollout is
performed by the implementation/test commands below.

## Verified localhost setup (2026-11-18)

The configured Cove development Supabase database has both library-sync
migrations applied, including `20261118160000_library_sync_notifications`.
Applied migration checksums matched the repository before deployment; the
new columns and row-level security on notification read receipts were verified
afterward. Production was not modified.

The ignored API `.env.local` enables `LIBRARY_SYNC_ENABLED=true`. Gangnam
DLab Academy’s existing `LIBRARY_COURSE_SYNC` flag was already enabled for
its copy of **Library Sync Practice — All Material Types**. Restart the local
API to load the current code and flag. Port 4000 is left free for that restart.
No academy organization or feature-flag rows were changed by this setup.

## Publishing and adoption

Admin saves collect a batch; they never notify academies. **Publish updates**
shares that batch once. There is no release-note or history interface. Only
new overlapping changes produce grouped course-review notifications for active
Managers and Team Leads. Notifications open the course; marked rows lead to
academy/current versus admin/latest comparisons. Reading does not accept a
change. The notification bell and review list each use three SQL statements
for an ordinary member. A server-rendered material comparison uses ten statements
(one permission check, reusing the resolved paths); resolving private lesson
images adds one batched image-metadata read. Counts do not grow per material.

Deploy the additive `20261118160000_library_sync_notifications` migration before
starting this API version. It backfills existing pending reviews and enables
RLS on per-user notification read receipts. The test harness applies it only
to disposable PostgreSQL.

Admin library courses have a working tree and immutable releases. Use **Publish updates** to publish a validated snapshot. Academy listings, previews and new
adoptions use the latest release. Unpublished changes stay in admin authoring.
A visible course with no release is omitted from academy browsing until its
initial release is created. The initial-release command below is also available
for a deliberate migration of a pre-existing published master:

```sh
DIRECT_URL='<explicit database connection>' pnpm --filter @cove/api library:initial-release <master-course-uuid>
```

It is idempotent, operates on one master, and never implicitly loads `.env`.
Choose the destination explicitly; the verification harness never uses a
shared database.

Updates are transactional per academy copy. Independent fields merge;
overlapping edits remain the academy's content and appear on the course’s marked rows. Repeated releases do not erase an unresolved conflict's original
base. Private solutions, tests and answer keys are available only to authorized
staff, never through bare value hashes or the platform linking report.

Answer-key/test corrections affect future attempts. Existing grades, solved
status and awarded points are retained. Sync never invokes regrade. Replacing
a video's actual media asset starts the new media unwatched while retaining
old viewing history. Caption/instruction edits on the same asset preserve
completion.

## Rollout controls

`LIBRARY_SYNC_ENABLED` defaults to `false`. Set it only on the API process(es)
intended to drain jobs. Each copy's academy must also have an enabled
`LIBRARY_COURSE_SYNC` feature row. Publishing persists targets/jobs even while
draining or the academy feature is off. Enable one pilot academy first, then
expand deliberately after inspecting its history, conflicts and job failures.

In the admin release panel, **Pause** retains the newest target and queued
work; **Resume** reconciles the target with the newest release. A pause takes
effect at the next transaction boundary. **Retry** queues a fresh attempt.
Jobs use a two-minute lease, bounded transactions and exponential backoff;
eight ordinary failures require an operator retry. Review `last_error_code`
and the actual failing asset/definition before retrying repeatedly.

Turning the global flag off and restarting affected API processes stops new
draining. It does not reverse already committed content. A failed run rolls
back its own writes. Never delete release/base/conflict data as a rollback:
those records retain historical comparisons and their assets.

## Existing academy copies

1. Publish an initial release of the library master if it has none.
2. In the admin master page, **Existing academy copies → Review linking**
   produces an opaque evidence fingerprint and counts. **Link this copy**
   establishes its course-level sync state. No uncertain node is copied or
   overwritten as a result of linking.
3. An academy editor opens **Library updates → Match existing materials**.
   Match modules, then lectures, then materials to existing academy rows.
   Select **Add this as a new library item** only after verifying there is no
   corresponding local item. **Keep this library item out of this course**
   acknowledges deletion of the node and its upstream subtree. Academy-only
   rows are retained.
4. After identity is established, equal values converge. Different values
   with no proven historical base create `UNKNOWN_BASE` decisions. Keep the
   academy version, accept the library version, or merge supported text/code.
   Unproved nested case/hint/solution/MC identities are reviewed as a group;
   they are not paired by position. Exact unique nested values can retain
   identity without guessing.
5. New published updates then use the recorded baselines normally. A stale
   linking report/decision is refused; reload it and review the current data.

Historical audit coverage and source snapshots are insufficient to automate
all legacy matching. This implementation intentionally requires academy review
of legacy node identity; B2/B3 and timestamp heuristics are disabled. The
PostgreSQL/Prisma experiment found different timestamps inside the same
adoption transaction, so timestamp equality is not an automation prerequisite
or a proof of lineage. This is the conservative migration fallback, not a
claim that historical content was reconstructed.

Linking is one bounded transaction per selected copy. The platform sees only
copy names, counts and states; candidates and academy content are academy-scoped.
Do not enable old-copy syncing by merely setting `sourceContentRevision` to the
current master: doing so discards the evidence needed to preserve local edits.

## Archiving and assets

Library removal is archive-only: rows and student history are retained. Normal
publication, bulk show and move controls must respect archived ancestry. Staff
can inspect/edit hidden content. Reintroduction merges against its retained
base and restores saved visibility; a locally hidden item stays hidden.

An exercise reference blocks removal of the PDF it uses and any removed
container around that PDF. Removing the reference is an explicit academy
content edit; synchronization must not silently detach it.

Retained releases/base/conflict values pin PDF/video/image/manual assets. Asset
cleanup must honor those pins even if no live course uses an old asset. Value
and asset garbage collection is outside this feature.

## Verification

Run only against disposable PostgreSQL, never shared Supabase:

```sh
bash packages/api/scripts/test-library-sync.sh
COVE_LIBRARY_SYNC_BROWSER=1 bash packages/api/scripts/test-library-sync.sh
pnpm typecheck
pnpm --filter @cove/api test
pnpm --filter @cove/web test
pnpm --filter @cove/web lint
pnpm --filter @cove/i18n test
```

The browser option provisions disposable Redis as well, uses synthetic local
identity with the real API/Next application, and binds API/provider/web to
`127.0.0.1:4342`, `4343`, `3342`. It uses a separate `.next-library-sync`
output directory. Playwright shuts down its servers and the shell trap removes
temporary databases/builds. Port 4000 must be left free after verification.

Statements are counted through Prisma query events, including BEGIN/COMMIT
where present. Current regression targets are: academy library list four
statements including access, library updates four including membership access
(five with a support-grant lookup), one projection statement, and a fixed
number of writes per table. Adoption's measured 52 statements exceed the
initial provisional target of 30; the count is bounded across fixture sizes.
A release is capped at 64 MiB of authored unit values. This is a conservative
supported ceiling; no production snapshot size is claimed.

### Verification recorded on 2026-11-18

- Ten integration spec files: **84 passed**, using disposable PostgreSQL 17.
  This includes all sync, conservative legacy linking (including MC option IDs),
  archive guards/restoration, PDF dependencies, structural/stale decisions,
  release adoption, library import, navigation, moves and import grading versions.
- Isolated Playwright: **1 passed** with the real API/Next application,
  PostgreSQL and Redis. Admin publish → academy conflict/keep/reload → student
  solved progress. The final run also uses server-rendered publish/copy data.
- Full API unit suite: **1,785 passed**, with integration/environment-gated tests
  skipped when their required services are absent. The successful run used two
  workers to avoid sandbox memory-monitoring failures under concurrent test load.
- Full web suite: **1,702 passed**; eight additional comparison renderer checks
  passed separately after their addition. Test-only public Supabase placeholders
  were supplied to load existing configuration-dependent suites.
- i18n: **152 passed**. Root typecheck, final API/web/e2e typechecks passed.
  Web lint: **0 errors**, with the repository's existing warnings retained.
- Prisma event measurements: release-backed library list **4**, updates **4**,
  legacy preview **6** (ceiling 7), release history **5**, on-demand MC
  comparison **10** (including access and all grouped values), builder outline **15**, adoption **52** for
  both fixture sizes, and full all-type update **40** statements.

No shared Supabase/production migration, deployment, flag enablement or commit
was performed during this continuation. Temporary services are stopped after
verification; the API port 4000 is left free.


The final comparison pass also renders all test-case fields in a table, keyed MC
options with answer markers and current wording, PDF/video asset metadata cards,
video caption definitions, named structural order, and bounded text/code change
regions. Large bodies retain complete side-by-side versions without running an
unbounded diff algorithm. The console includes release notes/authors/change counts,
rollout counts and copy last-run times. Main admin data is server-rendered; refresh
uses focus/events rather than polling. These additions preserve the four-statement
academy updates read.

### Detailed localhost walkthrough: 10 library problems + 2 academy problems

```sh
COVE_LIBRARY_SYNC_BROWSER=1 COVE_LIBRARY_SYNC_SCENARIO=ten-problems \
  bash packages/api/scripts/test-library-sync.sh
```

This provisions a fresh local test academy named **Cove Development** with
synthetic admin/academy-lead identities. Every course/problem creation, adoption
and edit uses the real authenticated product APIs. The real browser publishes six
releases and exercises Keep my version, Use library version and Merge manually.
It checks different instructions on problem 02 (one preserved-content conflict),
identical instructions on problem 05 (automatic convergence), independent test
corrections, retained academy problems 11/12, later unresolved releases, new
library additions and untouched upstream archival.

Screenshots and the machine-readable before/after evidence remain in
`test-results/library-sync-ten-problems/evidence/`; open `report.md` after the run.
Temporary application servers and PostgreSQL/Redis are removed automatically.
No existing shared development academy or shared Supabase data is changed.
