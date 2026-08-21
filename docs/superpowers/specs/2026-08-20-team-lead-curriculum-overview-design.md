# Team Lead Curriculum Overview

**Status:** Awaiting written specification review  
**Date:** 2026-08-20  
**Scope:** The Cove Studio academy root for an active `TEAM_LEAD` membership

## 1. Purpose

Replace the Team Lead's placeholder academy root with a curriculum overview.

The academy root already answers three questions, one per role. A Student is
asked "where do I pick up", a Teacher "who needs me today", a Manager "is this
place running". A Team Lead currently gets none of them: the route falls through
to `AcademyOverview`, which renders the academy name, the role, and a hint
paragraph.

This design gives the fourth role its own question:

> **Is what we teach any good, and is it actually reaching anyone?**

Everything in this document exists to answer that sentence. A metric that
answers a different role's question is out of scope even where the Team Lead is
authorized to see it — §4 and §6 say which, and why.

## 2. Current state

`TEAM_LEAD` already owns a working authoring surface:

- one directly editable curriculum tree per course, with hierarchical
  Visible/Hidden at course, module, lecture, and material level;
- programming exercise authoring with test cases, hints, limits, and difficulty;
- class lifecycle, course assignment, and teacher assignment; and
- audited content mutations — `content.*` actions are already written to
  `AuditLog` with an actor, a target type, and before/after values.

What is missing is any read model over it. A Team Lead can open one course and
see that course. Nothing in the product answers "which of my courses is empty",
"which visible exercise cannot be graded", "which class is assigned a course
students cannot see", or "which problem is labelled `EASY` and solved by a
third of the students who try it".

Two existing assets make the read model cheap rather than novel:

1. `content.*` audit rows already carry the actor and the target, so an
   authorship trail exists without a schema change (§9.3).
2. `DifficultProblemOrder` was extracted in `teacher-overview.ts` precisely so a
   second surface could order academy-wide problems with the same comparator
   rather than a near-copy of it. This is that second surface (§10.1).

## 3. Goals

- Give a Team Lead one truthful picture of catalog scale, curriculum defects,
  content effectiveness, and course reach.
- Make every defect a row with a direct link into the editor that fixes it.
- Reuse existing learning definitions without widening Teacher or Manager access.
- Keep student learning data aggregated to content, never to a named person.
- Distinguish period-independent facts from period-scoped measurements on screen.
- Keep English and Korean experiences equivalent and accessible.

## 4. Non-goals

- Any per-student attention queue, roster, or named-student list. A Team Lead
  holds `academy.members.read`, so this is authorizable; it is excluded because
  it is the Teacher's question at the Teacher's altitude, and shipping it would
  make this page a second teaching dashboard. §6.3.
- Enrollment, applications, invitations, member administration, or academy
  profile editing. Not authorized, and the Manager's control tower already
  answers them.
- Live monitoring. `roleCanMonitor` is `TEACHER`-only and this design does not
  change it.
- Revision history, rollback, scheduled releases, or approval workflows. The
  2026-08-03 visibility design ruled these out and this page does not
  reintroduce them by the back door.
- Any surface for `content.import` or `ai-feedback-rules.manage`. Both are
  reserved permissions with no v2 implementation; see §18.
- Automatic correction of authored metadata. §10.2 flags a mislabelled
  difficulty and never rewrites it.
- Combining reach, completion, and calibration into one course score.

## 5. Roles and authorization

The overview requires an **active `TEAM_LEAD` membership** in the requested
academy. It is guarded by `curriculum.manage`, which no other role holds, plus
an explicit role conjunction:

```text
LeadScopeService.requireTeamLead(identity, academyId, "curriculum.manage")
  -> requirePermission(...)                     // named capability
  -> actor.role !== "TEAM_LEAD" ? deny : allow  // explicit conjunction
```

The conjunction is the same defence `ManagerScopeService` uses and exists for
the same reason: it stops a later widening of a permission from quietly handing
this surface to another role. The comment there already names Team Leads as the
hazard; this is the mirror of it.

Sections that read learning aggregates additionally assert
`academy.analytics.read` before any aggregate runs.

**Managers do not receive this page.** The 2026-07-24 content migration design
states that "`MANAGER` inherits Team Lead content permissions as an operational
override", but `academyRolePermissions` does not implement that: `MANAGER` holds
`curriculum.read` and `curriculum.review` and neither `curriculum.manage` nor
`curriculum.publish` nor `exercises.manage`. The current permission map is
treated as the truth here and the stale sentence in the older document should be
corrected separately. Managers keep the control tower.

Every query carries an explicit `academyId`. Cross-academy identifiers fail
closed. A platform `ADMIN` without an active Team Lead membership receives no
access.

## 6. What this page is not, stated once

Three exclusions are load-bearing enough to survive a later edit.

### 6.1 No manager-owned work in the blocker queue

`classGapKinds` has three members. Two of them — `no_teacher` and `no_course` —
are fixable by a Team Lead, who holds `class-teachers.manage` and
`classes.manage`. The third, `no_students`, requires `class-enrollments.manage`,
which they do not hold.

`no_students` therefore never enters the queue. A queue seeded with rows its
reader cannot action is a queue its reader learns to skim. Enrolled student
count still appears as a **column** on class rows so an empty class is visible
as context, never as an assignment.

### 6.2 No teaching surfaces

`classes.assigned.manage` and `submissions.assigned.review` appear in the
`TEAM_LEAD` permission set but are inert: `assignmentGrantsAccess` requires
`role === "TEACHER"`, so no class can name a Team Lead as its teacher, and
`roleCanMonitor` is `TEACHER`-only. No section of this page depends on either
permission.

### 6.3 No named students

Every learning figure on this page is an aggregate over content. Rows are
courses, classes, lectures, and exercises. No section returns a `membershipId`,
a display name, or an avatar. This is a contract-level rule, not a UI
preference: the response schema has nowhere to put a student identity.

## 7. Module architecture

A new `lead` module, completing the `learn` / `teach` / `manage` / `lead` set —
one module per role's read model.

### 7.1 `packages/shared/src/content/team-lead-overview.ts`

Contracts, thresholds, comparators, and every arithmetic rule, alongside its
three siblings. The rules in §8–§11 are implemented here as pure functions and
tested at their boundaries. No rule in this design may live only in SQL or only
in a React component.

Imports rather than redefines: `overviewRangeSchema`, `overviewPeriodSchema`,
`resolveOverviewPeriod`, `difficultProblemSchema`, `compareDifficultProblems`,
`DifficultProblemOrder`, `lectureReadiness`, `sharePercent`, `classGaps`,
`assignmentGrantsAccess`, and `LocalDate` helpers.

### 7.2 `packages/api/src/lead/`

- `lead-scope.service.ts` — §5's guard, returning actor, academy id, timezone.
- `team-lead-overview.service.ts` — one instant, one settler, one payload.
- `team-lead-overview.repository.ts` — every aggregate, in PostgreSQL.
- `curriculum-blockers.repository.ts` — §9's defect scans.
- `lead.router.ts` — `academyCurriculumOverview.get`.

The service reuses `TeacherOverviewRepository.problemDifficulty` for §10.1 and
`TeacherProgressRepository` for lecture readiness, rescoped from "one teacher's
assigned classes" to "every active class in the academy". Rescoping happens in
the scope argument the repository already accepts; the SQL is not copied.

### 7.3 `packages/web/.../_components/lead-overview/`

`lead-academy-overview.tsx` (server, prefetch), `lead-overview-workspace.tsx`
(client, one query), and one component per section. `_hooks/use-lead-overview.ts`
follows `use-manager-overview.ts` exactly: URL-backed range, `replaceState` on
change, `keepPreviousData`, `initialData` honoured only for the range the server
rendered.

`page.tsx` gains a fourth branch. With four roles branched, the
`AcademyOverview` fallback is dead and is deleted; the branch closes with an
exhaustiveness check so adding a fifth role fails to compile rather than
silently rendering nothing.

### 7.4 `packages/i18n/src/locales/{en,ko}/lead.json`

A new namespace beside `manager.json`. Blocker kinds, calibration verdicts, and
audit action names are keyed by their enum members and tested against them.

## 8. Route, period, and the payload

The existing route is reused:

`/studio/academies/:academyId`

`7d`, `30d`, and `all` are URL-backed; the default is `30d` and never appears in
the address. The default is the Manager's rather than the Teacher's seven days:
a Team Lead is asking whether a curriculum works, and a week of submissions is
noise on a course that takes a term.

One request returns one snapshot of one instant. Five independently clocked
reads would let the catalog, the blockers, and the effectiveness panel describe
three different moments while sitting on one screen.

```ts
export const teamLeadOverviewSchema = z.object({
  academy: z.object({ id: z.uuid(), name: labelSchema, timeZone: z.string() }),
  period: overviewPeriodSchema,
  generatedAt: z.iso.datetime(),
  activityTrackedSince: z.iso.datetime().nullable(),
  catalog: curriculumCatalogSchema,          // §9.1 — core
  blockers: z.array(blockerGroupSchema),     // §9.2
  changes: z.array(curriculumChangeSchema).max(LEAD_MAX_PREVIEW_ROWS), // §9.3
  effectiveness: curriculumEffectivenessSchema, // §10
  courses: z.array(courseReachRowSchema).max(LEAD_MAX_COURSE_ROWS),    // §11
  coursesTruncated: z.boolean(),
  unavailable: z.array(teamLeadOverviewSectionSchema),
}).strict();
```

Bounds, as constants in the shared module:

```text
LEAD_MAX_PREVIEW_ROWS            = 5
LEAD_MAX_COURSE_ROWS             = 100
MIN_STUDENTS_FOR_CALIBRATION     = 8
MIN_SOLVERS_FOR_GRIND            = 5
LECTURE_DROPOFF_READINESS        = 50
GRIND_SUBMISSIONS_PER_SOLVER     = 6
GRIND_MIN_SOLVE_RATE             = 60
```

### 8.1 Period independence, on screen

`catalog` and `blockers` are facts about the curriculum as it stands. They do
not move when the range changes. The period control is therefore rendered
**below** them, adjacent to the sections it governs, and the two period-
independent sections carry an "as of now" timestamp rather than a period label.

Placing one range control at the top of a page where half the sections ignore it
teaches the reader that the blocker count is a seven-day figure. It is not.

## 9. Curriculum state

### 9.1 Catalog

The page's own claim, and deliberately not settleable: if it cannot be read
there is no narrower page to render, so the failure reaches the caller as a
retryable error. Same rule as academy identity on the control tower.

- Courses, split visible / hidden.
- Modules, lectures, and exercises, each split effectively visible / not.
- Exercises by declared `difficulty`: `EASY`, `MEDIUM`, `HARD`.
- Courses **taught** — assigned to at least one active class — and courses
  **shelved** — visible, assigned to none.
- Students reached: distinct active Student enrollments in active classes
  holding at least one assigned course.

**Effective visibility**, used by every count above and every rule below: a
material is effectively visible when its own `isVisible` is true and every
ancestor — lecture, module, course — is also true. Defined once in the shared
module as a pure function over the four flags and applied identically in SQL.

### 9.2 Blockers

Seven kinds. Each is a curriculum defect a Team Lead alone can fix, each carries
the measurement that triggered it, and each row links to the editor for the
thing named.

| Kind | Fires when |
|---|---|
| `hidden_course_assigned` | An active class is assigned a course with `isVisible = false`. |
| `empty_visible_course` | A visible course contains zero effectively visible exercises. |
| `ungradeable_exercise` | An effectively visible exercise has no test cases, or none with `visibility = 'HIDDEN'`. |
| `unfinished_exercise` | An effectively visible exercise has an empty `description`. |
| `class_without_teacher` | An active class has no `teacherMembershipId`. |
| `class_teacher_unavailable` | An active class stores a teacher for whom `assignmentGrantsAccess` is false. |
| `class_without_course` | An active class has no `ClassCourse` row. |

Notes on three of them:

- `hidden_course_assigned` is first because it is the only defect where a class
  is live, staffed, enrolled, and learning nothing. It is the most likely
  failure mode of the 2026-08-03 visibility model and the hardest to notice from
  inside a course editor.
- `ungradeable_exercise` treats "only `SAMPLE` cases" as a defect. A student can
  read every sample and pass without solving anything, which is not a grading
  outcome anybody authored on purpose.
- `class_without_teacher` and `class_teacher_unavailable` are separate kinds
  because the fixes differ — assign, versus decide whether to replace or clear —
  and `unavailableReason` already distinguishes account, suspension, and role.
  `classGaps` supplies the first; the second reuses `assignmentGrantsAccess`.

`unfinished_exercise` deliberately does not test `starterCode`. An empty editor
is a legitimate authoring choice and flagging it would train the reader to
dismiss the panel.

**Shape.** Counts with a bounded way in, not one flat list:

```ts
const blockerGroupSchema = z.object({
  kind: blockerKindSchema,
  total: countSchema,
  studentsAffected: countSchema,
  preview: z.array(blockerRowSchema).max(LEAD_MAX_PREVIEW_ROWS),
}).strict();
```

Group order is the table's order, **declared and not derived**, so the same
academy reads identically on every request. Within a group, rows order by
students affected descending, then label, then id — most consequential first,
and never reshuffling between two identical requests.

`studentsAffected` is distinct active Students enrolled in an active class that
reaches the defective content. Zero is a meaningful and common value: a defect
in an unassigned course affects nobody yet, and the number says so instead of
implying urgency the situation does not have.

A group with `total: 0` is not returned. An empty `blockers` array renders as a
clear "nothing is blocking students" state, which is a real answer and must not
look like a failed section.

### 9.3 Recent curriculum changes

Sourced from `AuditLog`, filtered to `content.*` actions on target types
`Course`, `CourseModule`, `Lecture`, and `Material`.

This section is deliberately doing two jobs that were separately proposed. It is
the authorship trail — who last touched what, so a Team Lead can resume — and it
is the change history. Merging them is what makes both free: `Material` carries
no author column, so a personal "continue editing" list would need a schema
change, while `AuditLog.actorUserId` already records exactly that and has since
the content module shipped.

Each row: actor display name, action, target label, whether the target was
effectively visible at the time, and timestamp. At most five.

Raw `before`/`after` values never appear here, matching the control tower's rule
for the same table.

Two pieces of shared vocabulary are required, mirroring `academyAuditActions`:

- `curriculumAuditActions` — the eighteen `content.*` actions the panel renders,
  in `@cove/shared`, with the API's action helpers typed against it and the
  locale catalogues tested against it, so both halves fail until a new audited
  content action is named.
- `SUMMARISABLE_CONTENT_TARGETS` — the four target types above, in the
  repository, beside the existing membership allow-list.

The comment on `academyAuditActions` records what happens without this: three
lists disagreed, and a real change in a real academy rendered as a raw dotted
code. That outcome is the reason both lists are required before the panel ships.

## 10. Curriculum effectiveness

The payoff sections. Not "who is struggling" and not "is the place growing" —
**which of my problems are built wrong.**

Every figure here is scoped to effectively visible exercises reachable through
an active class, measured inside the selected period, and subject to the
existing counted-attempt rules: the frozen `source_material_id` must agree with
the live relation, and only work whose `grading_revision` matches the exercise's
current revision counts. A Team Lead who edits a problem's grading is asking a
new question about it, and yesterday's answers are not evidence about today's.

### 10.1 Hardest problems, academy-wide

At most five, with at least `MIN_STUDENTS_FOR_PROBLEM_SIGNAL` attempting
students, ordered by `compareDifficultProblems` — the existing comparator,
called with academy-wide rows. Fields are `difficultProblemSchema` as it stands.

The Manager's control tower shows the same five problems and routes to a
different act: they read it as evidence about a class, and a Team Lead reads it
as evidence about an exercise. One comparator, so the two pages of one product
never disagree about which problem is hardest.

### 10.2 Difficulty calibration

Declared `ProgrammingExercise.difficulty` against measured solve rate.

| Declared | Expected solve rate |
|---|---|
| `EASY` | ≥ 70% |
| `MEDIUM` | 40% – 85% |
| `HARD` | ≤ 60% |

The bands overlap on purpose. A problem near a boundary belongs to two
descriptions at once, and only a problem outside every band its label allows is
flagged. Two verdicts: `harder_than_labelled` and `easier_than_labelled`.

Requires at least `MIN_STUDENTS_FOR_CALIBRATION` = 8 attempting students —
higher than the floor for §10.1 and stated as its own constant. Three children
failing a problem is enough to say a class needs help; it is not enough to ask
somebody to change published metadata, and this flag asks exactly that.

The row shows declared label, measured rate, numerator, denominator, and a link
to the exercise editor. **Nothing on this page writes `difficulty`.** A one-click
"fix" would let a period-scoped measurement rewrite an authored judgement, and
the author is the only one who knows whether the label or the problem is wrong.

### 10.3 Grind

`submissions ÷ distinct solved students`, for exercises with at least
`MIN_SOLVERS_FOR_GRIND` solvers. Flagged when the ratio is at least 6 **and**
the solve rate is at least 60%.

The conjunction is the whole signal. High grind with a low solve rate is a hard
problem, already reported by §10.1. High grind with a high solve rate means
students do get there, but only by brute force — which points at an ambiguous
specification, an unstated output format, or a test case that disagrees with the
description. That is a content defect with a content fix, and it is invisible on
every other page in the product.

### 10.4 Drop-off

Per course, the earliest lecture by curriculum position whose readiness falls
below `LECTURE_DROPOFF_READINESS` = 50% while the preceding lecture is at or
above it, computed with the existing `lectureReadiness` and rolled up across
every active class running the course.

Null when the course has no such transition, and null rather than a number
whenever `lectureReadiness` returns null for the lecture in question. A course
that nobody has reached yet has no drop-off point, and inventing one from two
students is exactly what the existing comparison floor exists to prevent.

### 10.5 Never attempted

Effectively visible exercises assigned to at least one active class with zero
counted attempts in the period, where the course has at least one active learner
in the period.

The trailing qualifier is what makes the section readable. Without it, one
dormant class fills the panel with exercises nobody was ever going to reach, and
the genuine case — content that is live, in front of active students, and still
untouched — is buried. Genuine causes are pacing, or content buried under a
hidden ancestor, and the row links to the curriculum position so the reader can
tell which.

## 11. Course reach

One row per course, at most 100, with `coursesTruncated` when the academy has
more. The Manager compares classes; this compares courses, and that difference
is the difference between the two jobs.

Per row: effectively visible exercises, assigned active classes, students
reached, active students in period, exercise completion, median active learning
minutes, drop-off lecture (§10.4), and last content change (§9.3).

Exercise completion is stated with both its parts, never as a bare percentage:

```text
distinct (student, exercise) pairs with status = 'SOLVED'
÷ students reached × effectively visible exercises
```

A zero denominator returns "No assigned students", not `0%`.

Shelved courses — visible, assigned to no active class — are marked. A shelved
course is not a defect and never enters §9.2; it is a fact about where authoring
effort went, and it is the one thing on this page that a Team Lead can only
learn by looking at every course at once.

The table is TanStack Table with URL-controlled state, sortable by any visible
metric, matching every other data table in Studio.

## 12. Page hierarchy

One column, full width, top to bottom. Two sections side by side would ask the
reader to treat them as alternatives, and none of these are — each is the
evidence for the one above.

1. **Catalog** — what exists, and how much of it students can see.
2. **Blockers** — what is broken, most consequential first.
3. **Recent changes** — what moved lately, and who moved it.
4. *Period control.* Everything below is period-scoped; everything above is not.
5. **Effectiveness** — hardest problems, calibration, grind, never attempted.
6. **Course reach** — the table, with drop-off per course.
7. **Quick actions** — new course, new exercise, arrange a class.

On narrow screens the order is preserved. Defects stay above analysis.

A period change keeps the previous numbers on screen marked as updating, and
disables drill-downs until the new window lands: a link opened from stale data
would land on the previous period's rows.

## 13. Failure and empty states

`catalog` is core. Its failure produces a retryable page-level error, because a
curriculum overview that cannot count the curriculum is an error page and not a
narrower one.

`blockers`, `changes`, `effectiveness`, and `courses` may each fail
independently and are named in `unavailable`. The affected panel says its data
could not be gathered while every successful section stands.

A failed section never renders a zero. "No blockers" and "blockers could not be
computed" are different sentences with different stable codes, and a Team Lead
who cannot tell an outage from a clean curriculum will believe the clean
curriculum.

Empty states are distinguished from no-measurement states throughout: an academy
with no courses, a course nobody has attempted, and a rate below its comparison
floor each get their own copy.

## 14. Performance and observability

- Preview lists hold at most five records; the course table at most 100.
- Every aggregate executes in PostgreSQL. No section loads complete submission,
  progress, or membership sets into application memory.
- The blocker scans run as bounded aggregate queries over the curriculum tree,
  not per-course round trips. Existing indexes carry them:
  `courses(academy_id, is_visible, updated_at)`,
  `materials(lecture_id)`, `student_exercise_progress(material_id, status, user_id)`,
  `class_courses(course_id, class_id)`, and `classes(academy_id, status, updated_at)`.
- Target p95 below 1.5 seconds with 200 courses, 4,000 exercises, 100 classes,
  and representative submission volume.
- Structured timings identify each section, the selected range, row counts, and
  any failure code. No student identifiers appear in logs, which follows from
  §6.3 — there are none in the payload to log.

## 15. Accessibility, responsive behaviour, and localization

- English and Korean copy ship together.
- Every chart has an equivalent table and a concise text summary.
- Colour is never the only signal. Blocker severity, calibration verdicts, and
  visibility state each carry text or an icon with an accessible name.
- Visibility state is never conveyed by dimming alone; the effective-visibility
  explanation is available as text, matching the curriculum tree's tooltip rule.
- All interactive tables use TanStack Table with server-controlled state.
- Range control, sorting, and every drill-down are keyboard accessible and
  retain visible focus.
- Mobile preserves the §12 hierarchy in one column; wide tables scroll inside
  labelled regions.

## 16. Security

- Every read is academy-scoped and permission-checked before any aggregate runs.
- The response contains no student identity of any kind (§6.3), so this surface
  cannot leak one.
- Audit rows expose actor display name, action, target label, and timestamp
  only; `before` and `after` never cross the boundary.
- Cross-academy course, class, and material identifiers fail closed.
- Rate-limit the overview read per membership, matching the control tower.

## 17. Verification

### 17.1 Pure and contract tests

- Effective visibility across all sixteen ancestor-flag combinations.
- Each blocker predicate at its boundary: an exercise with only `SAMPLE` cases,
  a whitespace-only description, a visible course whose only exercise is buried,
  a class whose teacher lost the `TEACHER` role.
- Blocker group order is declared; row order is stable across two identical
  inputs; a zero-total group is absent.
- Calibration bands at every edge, including the overlaps, and the
  `MIN_STUDENTS_FOR_CALIBRATION` floor returning no verdict rather than a
  verdict from seven students.
- Grind requiring both conditions; a low-solve-rate high-grind problem is not
  flagged.
- Drop-off returning null where `lectureReadiness` returns null.
- Completion and reach denominators, and the zero-denominator copy.
- Payload bounds, `coursesTruncated`, partial-section failure, and period
  metadata.
- `curriculumAuditActions` covers every `content.*` action the API writes, and
  both locale catalogues cover every member of the list.

### 17.2 Authorization and integration tests

- Active Team Lead succeeds.
- Teacher, Student, **Manager**, suspended Team Lead, platform `ADMIN` without
  membership, and cross-academy requests are all denied.
- The Manager denial has its own named test. It is the one exclusion a future
  reader is most likely to mistake for an oversight, and §5 is the reason.
- Removing `curriculum.manage` from `TEAM_LEAD` denies the page; adding
  `academy.analytics.read` to another role does not grant it.
- Aggregates respect `grading_revision` currency and the frozen-material
  identity check.

### 17.3 Web and end-to-end tests

- The §12 hierarchy, its responsive order, and the period control's position
  below the period-independent sections.
- Changing the range leaves catalog and blocker figures unchanged.
- Each blocker kind renders and links to the editor that fixes it.
- Section-level failure renders beside successful sections and never as zero.
- Empty curriculum, clean curriculum, and unavailable section are visibly three
  different states.
- Course table URL state, sorting, and focus restoration.
- Korean and English journeys, and automated accessibility checks.

### 17.4 Performance tests

Seed 200 courses, 4,000 exercises, 100 classes, realistic enrollments, progress,
submissions, and content audit history. Verify p95, bounded response shapes, and
the absence of per-course query growth.

## 18. Deferred, and why

`content.import` and `ai-feedback-rules.manage` are held by `TEAM_LEAD` and have
no v2 implementation: a search of `packages/api` and `packages/web` finds
nothing behind either beyond the `ProgrammingExercise.aiFeedbackEnabled` column
and the untouched v1 `(admin)/admin/ai-feedback` pages.

Neither appears on this page in any form, including as a disabled control. A
quick action that cannot act is a defect the reader reports once and routes
around thereafter.

When either ships, it joins §12's quick actions, and AI feedback gains one
blocker kind worth naming now so it is not rediscovered later:
`ai_feedback_without_rules` — an exercise with `aiFeedbackEnabled = true` and no
rule that matches it, which is a visible promise of feedback the academy cannot
keep.

## 19. Implementation order

1. Shared contracts, thresholds, comparators, and their tests (§7.1).
2. `LeadScopeService` and its authorization tests, including Manager denial.
3. Catalog aggregate and the page skeleton with a real §13 error state.
4. Blocker scans, one kind at a time, each with its boundary tests.
5. `curriculumAuditActions`, `SUMMARISABLE_CONTENT_TARGETS`, and the changes panel.
6. Effectiveness, reusing `problemDifficulty` and `lectureReadiness` rescoped.
7. Course reach and the TanStack Table.
8. `page.tsx` fourth branch, deletion of `AcademyOverview`, exhaustiveness check.
9. Localization, accessibility, performance, and end-to-end hardening.

Steps 1–4 are shippable on their own: catalog and blockers answer the second
half of §1's question without any period-scoped aggregate, and they are the
sections a Team Lead opens the page for.

## 20. Acceptance criteria

- The academy root gives an active Team Lead the §12 hierarchy, and no other
  role reaches it.
- Every blocker row names the measurement that triggered it and links to the
  editor that fixes it.
- No section returns, renders, or logs a student identity.
- No manager-owned work appears in the blocker queue.
- Counts and rates follow §9–§11 and expose their denominators and period.
- Period-independent sections are visibly period-independent.
- Difficulty calibration reports a verdict and never writes one.
- Every rate below its comparison floor renders an explanation, not a number.
- Partial failure cannot masquerade as a clean curriculum.
- One comparator orders difficult problems on both the Manager's page and this
  one.
- English, Korean, keyboard, screen-reader, mobile, authorization, and
  performance verification pass before release.
