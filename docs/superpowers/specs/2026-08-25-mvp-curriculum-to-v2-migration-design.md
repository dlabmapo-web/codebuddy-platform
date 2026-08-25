# MVP Curriculum to Cove Studio v2 Migration Design

**Date:** 2026-08-25
**Branch:** `feat/cove-studio-v2`
**Status:** Implemented; production curriculum migration applied and verified

## 1. Context

The production MVP and Cove Studio v2 use separate Supabase projects and
different data models:

- MVP source project: `hsxaxlwlnbdwckimznvd`
- v2 target project: `sfesugoedobirmeqjcvp`
- target academy: `dlab-mapo`

The MVP curriculum is a four-level hierarchy of subjects, stages, chapters,
and programming problems. V2 represents reusable academy curriculum as
courses, modules, lectures, materials, exercises, test cases, and hints.

A direct database copy cannot preserve these relationships correctly. The
migration must explicitly transform source rows into the v2 model while
leaving all existing v2 data intact.

## 2. Goals

- Copy the complete MVP programming curriculum into the existing `dlab-mapo`
  academy.
- Preserve all meaningful curriculum content and ordering.
- Include exercise test cases and hints.
- Make dry runs and repeated execution safe.
- Detect incomplete, inconsistent, or colliding data before it can damage the
  target.
- Produce an auditable report that proves what was and was not imported.
- Provide a deterministic rollback that affects only rows created by this
  migration.

## 3. Non-goals

This migration does not copy or modify:

- MVP users, usernames, passwords, or sessions;
- teacher/student relationships or v2 academy memberships;
- v2 classes or class enrollments;
- submissions, grading results, drafts, or progress;
- collaboration sessions, teacher feedback, or AI feedback history;
- existing curriculum already stored in `dlab-mapo`; or
- any other academy in the v2 project.

Migrating those domains would require separate designs because their identity
and authorization models differ materially.

## 4. Migration architecture

A repository-owned, one-time TypeScript command performs an extract,
transform, validate, load, and verify workflow. It reads the source through a
read-only Supabase client and writes the target through a direct PostgreSQL
connection so each course can use a real database transaction. Both use
narrowly scoped migration credentials. Credentials are supplied through
environment variables, never arguments, generated reports, logs, source
files, or Git.

The command has explicit modes:

- `inspect`: read schemas, target academy identity, migration actor, and source
  counts without constructing writes;
- `dry-run`: extract and transform every row, validate the complete plan, and
  write a local report without changing either project;
- `apply`: require the successful dry-run report's fingerprint and insert the
  approved plan; and
- `verify`: independently read the target and compare counts and checksums to
  the approved plan.

There is no implicit apply mode. A command without an explicit mode makes no
database changes.

## 5. Source-to-target mapping

| MVP source | Cove Studio v2 target | Mapping |
| --- | --- | --- |
| `subjects` | `courses` | One course per subject, owned by `dlab-mapo` |
| `stages` | `course_modules` | One module per stage under its subject course |
| `chapters` | `lectures` | One lecture per chapter under its stage module |
| `problems` | `materials` + `programming_exercises` | One programming material and exercise per problem |
| `test_cases` | `exercise_test_cases` | All test cases under the mapped exercise |
| `problem_hints` | `exercise_hints` | All hints under the mapped exercise |

### 5.1 Field preservation

- Titles and descriptions are copied without translation or rewriting.
- Source `order_no` determines relative order within the source parent.
- `is_published` maps to the corresponding v2 visibility field at every
  hierarchy level.
- Problem difficulty maps `easy`, `medium`, and `hard` to the matching v2 enum.
- Input format, output format, constraints, starter code, time limit, memory
  limit, and AI-feedback setting are preserved.
- `problem_no` is stored as `legacyProblemNo`.
- Every migrated exercise uses the v2 `PYTHON` language because the MVP judge
  and editor support this curriculum as Python.
- A source test case marked `is_sample` maps to `SAMPLE`; every other test case
  maps to `HIDDEN`. A row marked both sample and hidden is invalid and stops
  its course during validation.
- Hint text maps to `content`; its optional trigger pattern maps to
  `triggerExpression`.
- Source creation and update timestamps are preserved wherever the target
  model owns equivalent fields. Target-only audit timestamps use migration
  time and are listed in the report.

### 5.2 Stable identities

Every inserted target UUID is derived deterministically from:

1. a fixed namespace identifying this migration and source project;
2. the source table name; and
3. the source row UUID.

External keys use a reserved `mvp:` prefix plus the source identity. This makes
the import idempotent without depending on mutable titles or positions.

If a deterministic ID is absent, apply inserts it. If it already exists with
the same source fingerprint, apply records it as already imported. If it exists
with different content or ownership, apply aborts before modifying that course.

## 6. Ordering and visibility

V2 requires unique positive positions within a parent. Source siblings are
sorted by `order_no`, then `created_at`, then source UUID. They receive
contiguous v2 positions beginning at one. The report records every case where
the resulting position differs from the original `order_no`, including
duplicate, zero, negative, or missing source positions.

Visibility is preserved independently at every level. A published child under
an unpublished parent remains stored as visible but is still unreachable to a
student until the parent becomes visible, matching v2's normal hierarchy.

## 7. Target ownership

Before dry-run can succeed, inspection must resolve exactly one active academy
whose slug is `dlab-mapo`. The command records its UUID but never accepts a
caller-supplied academy UUID as a substitute for the slug lookup.

V2 requires a creator for courses and assignment-style records. Inspection
selects one explicit active `TEAM_LEAD` membership in `dlab-mapo` as the
migration actor. If none exists, or more than one exists without an explicit
actor selection, dry-run stops and reports the eligible memberships. The
actor's v2 user UUID is recorded in the plan and revalidated immediately before
apply.

## 8. Validation and failure behavior

Dry-run aborts the affected course when it finds:

- a stage without its source subject;
- a chapter without its source stage;
- a problem without its source chapter;
- a test case or hint without its source problem;
- an unsupported difficulty or language assumption;
- inconsistent test-case visibility;
- a published problem without runnable grading cases;
- duplicate legacy problem numbers;
- a deterministic-ID or external-key collision in v2; or
- a target academy or actor that changed after inspection.

Warnings that do not alter meaning, such as normalized positions or null
descriptions becoming empty v2 strings, appear separately from errors. Apply
is unavailable while the plan contains any error.

No invalid row is silently discarded. The report identifies the source table,
source ID, parent chain, and reason so it can be corrected or explicitly
handled in a later plan.

## 9. Write and rollback strategy

Apply never deletes or updates pre-existing `dlab-mapo` curriculum. It inserts
one source subject and all of its descendants inside one target database
transaction. A failure rolls back that whole course while leaving successfully
committed courses and all pre-existing rows untouched.

The apply report records the deterministic IDs inserted for each course. The
rollback command accepts only a successful apply report, checks that every
candidate row still has its recorded fingerprint, and deletes descendants
before parents in a transaction. If any migrated row has subsequently changed,
rollback stops rather than deleting edited production content.

Before apply, the operator must also confirm that the target Supabase project's
normal backup is current. The report stores backup confirmation metadata but
never stores a database URL or credential.

## 10. Verification

Verification is a separate read-only pass after apply. It checks:

- one target course per source subject;
- exact descendant counts per course;
- parent relationships for every migrated row;
- canonical field checksums for curriculum content;
- mapped visibility, difficulty, limits, test-case visibility, and hint
  triggers;
- uniqueness and presence of every `legacyProblemNo`;
- absence of migrated rows outside `dlab-mapo`; and
- absence of changes to target rows that were present before apply.

The final report contains source counts, planned counts, inserted counts,
already-present counts, failed course counts, checksums, warnings, errors, and
the IDs required for rollback. A non-zero mismatch makes verification fail.

## 11. Operational sequence

1. Confirm both Supabase project identities and use read-only access for the
   MVP project.
2. Run `inspect` and choose the migration actor if necessary.
3. Export a source snapshot and record its checksum.
4. Run `dry-run`; correct every validation error.
5. Review the human-readable plan, counts, normalized positions, and target
   academy.
6. Confirm a current target backup.
7. Run `apply` with the exact dry-run fingerprint.
8. Run independent `verify` immediately.
9. Open representative imported courses and exercises in Cove Studio as a Team
   Lead and as a Student.
10. Keep the source MVP database read-only and available until production
    acceptance is complete.

The source snapshot contains hidden grading cases and is therefore sensitive.
It is written only to a gitignored local migration-artifact directory with
owner-only filesystem permissions. Human-readable reports contain counts and
checksums, never raw hidden inputs or expected outputs.

## 12. Acceptance criteria

- Every valid MVP subject, stage, chapter, problem, test case, and hint appears
  exactly once under `dlab-mapo`.
- No existing v2 curriculum row is overwritten or deleted.
- No MVP user or activity data is copied.
- Dry-run, apply, verification, and rollback reports contain no credentials.
- Apply cannot run from a stale or failed dry-run plan.
- Verification reports zero unexplained count or checksum mismatches.
- Representative sample and hidden test cases grade correctly in v2.
- A second apply with the same source snapshot inserts zero new rows and
  reports every migrated row as already present.

## 13. Production execution result

The migration was applied to `dlab-mapo` on 2026-08-25 using the reviewed
source snapshot and the Supabase scheduled physical backup from
2026-08-24T18:05:02Z as the recovery reference.

- 5 courses, 8 modules, and 60 lectures migrated.
- 497 programming exercises, 1,100 test cases, and 123 hints migrated.
- Independent verification completed with zero mismatches.
- A second apply reported all 5 courses as already present and inserted zero
  rows.
- The temporary source credential was removed after extraction; sensitive
  snapshots and reports remain in the gitignored, owner-only artifact folder.

Users, memberships, classes, submissions, progress, and other activity data
were not migrated, in accordance with the approved scope.
