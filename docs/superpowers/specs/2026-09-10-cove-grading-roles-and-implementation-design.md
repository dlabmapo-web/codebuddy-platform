# Cove grading: roles, pages, permissions, and implementation design

Date: 2026-09-10  
Status: Proposed implementation design; no application changes or deployment.  
Source baseline: local HEAD `68e12de`. No commit authorized.

## 1. Purpose and relationship to the research

Implement Elice-style grading inside Cove's actual role and navigation structure. Team Leads are curriculum authors, not assistants waiting for Manager approval. Managers inherit Team Lead capabilities. Head office authors shared library content and operates the platform. Teachers deliver assigned classes. Students submit their own work.

This design complements [the Elice grading compatibility specification](../../design/2026-09-10-elice-grading-compatibility-spec.md). That document remains authoritative for observed Elice comparator behavior, generated grader logic, examples, source references, and unresolved verification items V1–V12. This document defines Cove's product surfaces, authority, implementation boundaries, and rollout. Proposed Cove policies are not assertions about Elice's exact permissions or private implementation.

The earlier conversational recommendation was too generic: it omitted Team Lead ownership, the shared head-office library, multi-role staff, and the existing regrade authorization exception. This design replaces that recommendation. Current executable code takes precedence over historical comments and older design documents.

## 2. Current Cove role model — verified in source

| Axis / role | Current meaning and authority relevant to this work |
| --- | --- |
| Platform `USER` | Ordinary platform identity. Academy authority comes from memberships, not this label. |
| Platform `ADMIN` | Head-office operator. Currently receives all named platform permissions. Can manage the library, inspect academies, administer support access, and use platform operations. Not a fifth academy membership role. |
| Academy `STUDENT` | Reads accessible curriculum and submits own work. Must be the only role on that membership. |
| Academy `TEACHER` | Reads/reviews curriculum, including private test definitions in authorized authoring context; holds draft permission but not course/exercise management or publishing. Reviews work through assigned teaching scopes. |
| Academy `TEAM_LEAD` | Creates/manages/publishes curriculum and exercises; imports content; manages classes and teacher assignments; manages AI-feedback rules; can regrade own academy. Reads members/analytics and reviews applications. |
| Academy `MANAGER` | Receives the complete shared Team Lead permission set plus academy settings, member/credential administration, enrollment, and class schedules. |

Important constraints:

1. Staff can hold several academy roles. `rolesHavePermission` checks the union of primary and extra roles. A Manager + Teacher can teach; a Manager alone does not become an assigned teacher through permission inheritance.
2. The member view-role cookie changes presentation, not server authority. Editing the cookie cannot grant a role. Direct links still use the real held-role set.
3. Teacher scope supports both assigned main teachers and assistant teachers. Assignment, active membership/class, student enrollment, and accessible taught material constrain reads.
4. Team Lead does not receive Manager-only enrollment, credentials, academy settings, or schedule controls.
5. Role-specific overview pages remain distinct. A shared content permission is not a reason to remove their held-role checks.
6. Academy access distinguishes `membership`, `support`, and `platform`. Regular academy writes by platform inspection require appropriate support authority; library authoring is a deliberate separate platform-authorized path.
7. Current regrading is another explicit exception: `RegradeService` allows operators through `platform.health.read`, or academy staff through `curriculum.regrade`. Do not claim every existing operator write requires a support grant.
8. Platform inspection can read inside academies with `platform.academies.inspect`. Comments elsewhere describing all learning-data reads as grant-only are not a reliable description of the current access implementation.
9. Support access must never submit work as a real student. Author validation runs must be separate from student submissions.

### Source map

- `packages/shared/src/auth/roles.ts`: platform/academy permissions, Manager composition, library permissions, support permissions, role combinations.
- `packages/api/src/authorization/academy-access.service.ts`: membership precedence, platform reads, support and library authority.
- `packages/api/src/authorization/membership-roles.ts`: primary plus extra role predicates.
- `packages/api/src/classes/assigned-class-access.ts`: held Teacher role, main/assistant assignment and platform/support scope.
- `packages/api/src/teach/teacher-progress-access.service.ts`: current student/material/class restrictions.
- `packages/web/src/lib/academy-view-role.ts`: presentation-only role selection.
- `packages/api/src/platform/regrade.service.ts`: current platform/academy repair authorization.
- `packages/api/src/content/library/academy-library.service.ts`: library preview/adoption; full independent academy copies.
- Studio `studio-sidebar.tsx` and admin `platform-sidebar.tsx`: existing navigation structure.

## 3. Design approach

Three approaches were considered:

| Approach | Trade-off |
| --- | --- |
| Extend existing course editor, class pages, maintenance, library, and console | Recommended. Fits existing access services and avoids duplicate grading implementations. |
| Separate grading application with new role-specific dashboards | Makes grading prominent, but duplicates navigation, scope checks, and curriculum editing. |
| Put every grading control in head office | Central control, but removes Team Lead autonomy and creates unnecessary support requests. |

Choose the first. One authoring workspace, one versioned grading contract, and one result calculation serve academy authors and head-office library authors. Different route wrappers supply scope and permissions.

No new academy role enum is required. Add only named capabilities needed for genuinely new authority. Avoid per-user permission editors in the first release; current role sets plus explicit academy feature policy are sufficient.

## 4. Proposed role-to-page plan

Paths marked **new** are proposed routes, not existing files. `A` means `/academy/[academySlug]`; `E` means `/content/courses/[courseId]/lectures/[lectureId]/exercises/[materialId]` within an academy. Version-specific course routes must receive equivalent behavior.

| Surface | Student | Teacher only | Team Lead | Manager | Head-office Admin |
| --- | --- | --- | --- | --- | --- |
| Existing exercise editor `A + E` | No | Existing review access, no edit | Edit/validate/publish | Same | Academy inspection; authorized support writes |
| Grading section inside that editor | No | Read permitted definitions | Full author controls within ceilings | Same | Same shared component and access rules |
| Existing library exercise editor `/admin/content/library/[courseId]/lectures/[lectureId]/exercises/[materialId]` | No | No admin route | No admin route | No admin route | Author with library authority |
| Existing academy library `A/content/library` | No student entry | Existing preview scope | Preview/adopt | Preview/adopt | Distribute through existing library workflow |
| Existing `A/classes/[classId]`, new Grading tab | No | Use teaching route instead | Class assessment configuration and overview | Same plus existing enrollment/schedule tools | Inspect; support-authorized academy edits |
| **New** `A/grading` | No | Assigned route instead | Academy results board | Academy results board | Read via explicit platform inspection mapping |
| **New** `A/grading/submissions/[submissionId]` | No | Assigned route instead | Academy-scoped result details | Same | Inspect; adjustment requires write support |
| Existing `A/teach/classes/[classId]/progress` | No | Assigned classes | Only if also Teacher and assigned | Only if also Teacher and assigned | Existing operator Teacher-view rules |
| Existing teaching submission detail route | No | Assigned students/materials | Additional Teacher role + assignment | Additional Teacher role + assignment | Existing inspection/support scope; no implied adjustment authority |
| Existing `A/maintenance` | No | No | Own-academy regrading | Same | Existing operator maintenance authority |
| **New** `A/settings/grading` | No | No | View effective limits through editor | Configure academy defaults within ceilings | Inspect; support-authorized academy changes |
| Existing student exercise workspace and `A/learn/records` | Own accessible work | Staff validation elsewhere | Staff validation elsewhere | Staff validation elsewhere | No student impersonation/submission |
| **New** `/admin/settings/grading` | No | No | No | No | Global grading policies and academy ceilings |
| Existing `/admin/operations`, new Grading tab | No | No | No | No | Queue health, repairs, runtime status |
| Existing `/admin/access`, `/admin/audit` | No | No | No | No | Support grants and grading audit history |

A multi-role staff member receives the union of authorized capabilities, while the selected role determines the default sidebar. Neither hiding a link nor showing a disabled button replaces server authorization.

### Navigation changes

- Team Lead and Manager: retain Content → Courses and Maintenance; add Grading → Results. Link class grading to the same scoped board rather than duplicate result tables.
- Manager: add Settings → Grading beside existing academy/points settings.
- Teacher: retain My Classes and Students. Add score filters and detail actions inside the existing progress workflow; no academy-wide Results link for Teacher-only users.
- Student: retain the current learning workspace and Records; no staff grading navigation.
- Head office: add Settings → Grading policies; extend Operations → Maintenance with a Grading health tab. Keep Library as the authoring entry point.

## 5. Exercise authoring experience — Team Lead and Manager equally

Extend `ExerciseWorkspace` and its existing `AnswersEditor` rather than introducing separate Manager and Team Lead editors. The same extension appears in the head-office library workspace.

### 5.1 Grading configuration

Group fields into Test cases, Execution, Scoring, Feedback, and Validation/revisions. These may be panels within the current editor; this spec does not require a visual redesign.

Test cases:

- Ordered case ID, label, stdin, expected literal/pattern, comparator, nonnegative integer weight, public/private visibility.
- All five Elice rules: normalized same-output, contains, not-contains, Python regex search, and negative regex search. Explain each with a small preview.
- Same-output uses the research document's line-wise normalization. Contains and regex must not silently apply that normalizer.
- Case hard timeout override; advanced optional soft threshold and point penalty.
- Show weight total and distinguish sample visibility from whether a case contributes to grading. Explicit weight zero supports demonstration-only cases.
- Validate regex on save and constrain matcher execution; JavaScript regex is not an interchangeable Python implementation.
- Duplicate/reorder cases without losing stable identity. Show whitespace visibly on demand.

Execution:

- Approved runtime/profile, exercise defaults, per-case overrides, total job deadline and output cap.
- Choose only supported limits within effective platform/academy ceilings. Display the effective value and source of restrictions.
- Do not offer an editable memory guarantee before the runner actually enforces it.
- Hide concurrency, host configuration, secrets, and arbitrary networking from academy authors.

Scoring:

- Preserve existing exercises as `LEGACY_STDIO`. New opt-in profiles have explicit semantics/version.
- Store raw earned/possible weights separately from material points and display percentage.
- Initial new-profile default: proportional material score with two decimal places. Represent material points in integer hundredths: `appliedHundredths = roundHalfUp(earnedWeight * maximumHundredths / possibleWeight)`, using integer arithmetic. Display percentage is `roundHalfUp(earnedWeight * 10000 / possibleWeight) / 100`; legacy consumers receive the separately rounded integer percentage. This is a Cove policy, not verified Elice Relative behavior.
- Support explicit absolute-cap compatibility mode where required by imported content. Label it advanced and explain the observed Elice deprecation warning; never silently convert imported grades.
- Reject publication of an automatically scored profile with zero total positive weight. Zero-weight practice remains possible only as explicitly unscored material.
- Keep full correctness, passing threshold, partial credit, and course completion as separate concepts. Default completion remains all required checks correct until a course explicitly adopts a threshold policy.
- AI feedback and reward points do not decide deterministic test outcomes.

Feedback:

- Public case detail policy, hidden-case summary policy, and safe message templates.
- Template preview with supported counters/status variables and maximum message size.
- Students never receive private inputs, expected literals/patterns, private files, grader source, or raw grader diagnostics. Output from private cases is hidden by default because it can echo private input.
- Preview exactly what a student sees using synthetic validation results, not a real student's identity.

### 5.2 Validation and publication

1. Save a draft; validate schema, capabilities, weights, files, and regex syntax.
2. Run the reference solution in the same runtime/profile used for submissions. Store a validation run, not a `Submission` owned by a student.
3. Show case outcomes, raw/material/display scores, warnings, runtime and enforced limits.
4. Require a successful reference run for publication of a new or changed automatic profile; changing grader-affecting fields invalidates validation. Custom profiles use their own approved validation contract.
5. Review a before/after grading diff. Publishing requires `curriculum.publish` in addition to relevant authoring authority.
6. Freeze a profile revision. Future submissions snapshot it. Existing submissions remain unchanged.
7. Offer a link to Maintenance if historical records are stale. Publishing does not automatically regrade them.

Team Leads publish without mandatory Manager approval, matching current authority. Introducing approval chains later would be a separate policy change.

## 6. Class and academy assessment policies

Separate an exercise's algorithm from rules about when a class can submit it. Add an immutable assignment assessment policy keyed to the existing class/course assignment context; do not mutate the shared exercise to implement one class's exam deadline.

Proposed class Grading tab controls, shared by Team Lead and Manager:

- Practice default versus assessment mode.
- Submission opening/closing times, displayed timezone, optional maximum student attempts.
- Feedback release: immediate, after deadline, or explicit release.
- Grade selection: best by default; latest when explicitly chosen before assessment opens.
- Participation in class grade and passing threshold for an opted-in assessment.

These are new Cove features, not confirmed complete Elice parity. Default existing classes to current unrestricted practice behavior. Store the policy revision on submissions. Server time governs deadlines; concurrent final-slot submissions must consume attempt allowance atomically. Repairs and author validation never consume attempts. For a student with multiple class contexts, require an explicit authorized class context and preserve current `Submission.classId`; do not guess the easiest policy. Legacy null class IDs remain labeled as historical/unattributed.

Manager academy settings provide defaults, not retroactive changes: default runtime, limit presets within head-office ceilings, feedback and assessment defaults, and whether assigned teachers may request manual adjustments. Team Leads choose exercise/class settings within these limits. Existing attendance schedules remain Manager-only; assessment deadlines are a separate new curriculum capability and must not reuse `class-schedule.manage`.

## 7. Results, teacher workflow, and manual adjustments

### 7.1 Academy Results — new authority

Team Lead and Manager receive an academy-scoped paginated board filtered by class, course, problem, student, date, revision, verdict, and stale grading. Columns show automatic score, effective adjusted score, verdict, revision, and completion time. Detail shows submitted code, authorized private case diagnostics, scoring explanation, revision snapshot, and audit trail.

This is an explicit expansion of staff access to student records. Do not unlock existing Teacher-only monitoring routes to implement it. Introduce a dedicated academy result scope service and a read permission; every query must constrain academy, submission owner, and content context. Restricted/archived history needs a deliberate read policy; default the new board to active academy access and retain existing history rules rather than bypass them.

### 7.2 Teacher

Extend current assigned progress and submission detail pages with weighted results and grade explanations. Preserve current main/assistant assignment and role-set checks. Teachers can propose an adjustment with a reason and private note for Team Lead/Manager review; they cannot directly publish grading definitions or launch class-wide regrades.

Teachers' existing authorized access to hidden test definitions is preserved. Model-solution access continues through its existing dedicated author/teaching authorization; do not add solutions to generic result payloads.

### 7.3 Adjustment lifecycle

Proposed initial policy: Team Lead and Manager can apply manual adjustments within their academy. Teachers request them for assigned work. Requests and actions require a real prior submission.

- States: requested, applied, rejected, withdrawn; retain immutable events and reason.
- Apply against a specific grading-result version using optimistic concurrency. Store actor, roles, academy, submission, reason, delta, previous/new effective score, request ID, and support grant if applicable.
- Use material-point units; bounds are 0 through the snapshotted material maximum. Preserve the automatic score and verdict. An adjustment does not change a failed test into a passed test.
- Adjust only that attempt. Selected best/latest grade is recalculated under the assignment policy; no invisible adjustment transfers to future attempts.
- If automatic regrading changes the underlying result, retain the adjustment history and mark it for review. Until resolved, show the corrected automatic result as the effective grade and explicitly label the suspended adjustment.
- Grade-based completion follows the configured assessment policy; code-correctness achievements remain tied to deterministic results. Point awards must follow the existing idempotent reconciliation path, never a second ad hoc award loop.
- Head-office adjustment of academy work requires a write-capable support grant and the same service. Platform inspection alone cannot adjust.

## 8. Head-office library, policies, and operations

### Library

Use the existing shared library exercise editor to author and validate profiles. `platform.library.manage` maps to library author permissions; no support session is needed for head office's own library work. Preserve the distinction between library authoring and `platform.library.distribute`.

Academy adoption currently makes a full independent copy. Extend that copy to carry profile semantics, cases/weights, templates, runtime references, and custom bundle references where permitted. Reset local revision identity according to existing copy behavior and record provenance. Editing a master must not silently change an adopted course or its historical scores. Preview incompatible runtimes/limits before adoption; block unresolved incompatibility instead of silently stripping fields. Preserve pre-adoption private-answer restrictions.

### Global grading policy page — new

- Approved runtime versions and capabilities; publish/deprecate states and affected-profile inventory.
- Hard bounds for case count, input/output size, memory, per-case time, total job time, regex time, and validation concurrency.
- Per-academy resource ceilings and fair queue quotas. Show effective configuration and change history.
- Feature rollout for enhanced STDIO, manual grading, and approved custom graders.
- Custom grader trust policy, approval status, bundle digest, and narrow network exceptions.

No arbitrary shell or secret editor belongs in this page. Actual worker count and host provisioning remain deployment/operator tasks; the UI may show measured/effective capacity and validated application-level quotas. A configuration edit must not claim to have resized the VPS.

Policy changes apply to future profile validations/jobs through an explicit policy version. Runtime retirement must inventory queued and historical profiles; retain reproducible runtime artifacts where feasible. Emergency revocation may refuse queued execution with an infrastructure/policy error and recorded reason, never assign a false zero score.

### Grading operations

Extend `/admin/operations` with queue depth, oldest job age, active capacity, throughput, p50/p95/max queue and execution time, failures, runtime versions, and academy filters. Link to existing repair runs; show planned/running/completed/failed counts and revision used.

Retry an infrastructure failure idempotently. A legitimate wrong answer is not an infrastructure retry. Regrade uses a new immutable repair result and existing `regradeRunId` conventions; preserve attempts and audit identity.

Current platform mutation permission `platform.health.read` is too broad in meaning. Introduce explicit `platform.grading.regrade`, `platform.grading.retry`, `platform.grading.read`, and `platform.grading.policy.manage`. ADMIN initially holds all, preserving current operator capability without requiring a new support grant for platform repair. Update every repair endpoint consistently; do not leave a health-read fallback that defeats separation.

## 9. Permission changes and enforcement

| Capability | Initial grants | Conditions |
| --- | --- | --- |
| Existing `exercises.manage` / `curriculum.publish` | Team Lead, Manager; library mapping | Edit / publish grading profiles respectively |
| Existing `curriculum.regrade` | Team Lead, Manager | Same-academy repair and preview |
| New `grading.results.read` | Team Lead and inherited Manager | Academy-scoped stored work; explicit inspection/read-only support mapping |
| New `grading.adjustments.manage` | Team Lead and inherited Manager | Same-academy apply/reject, version and reason; never read-only support |
| New `grading.adjustments.request` | Teacher | Held Teacher role plus current assignment; does not grant academy-wide reads |
| New `grading.assessments.manage` | Team Lead and inherited Manager | Class/course assignment ownership |
| New `grading.defaults.manage` | Manager only | Academy defaults within platform ceiling |
| New platform grading capabilities | ADMIN through existing platform role map | Platform operations/policies; do not merge into academy permissions |

Add new Team Lead grants once in `teamLeadPermissions` so Manager inheritance stays structural. Extend library mapping only with author/validation requirements, not student result/adjustment permissions. Add reads explicitly to read-only support sets and prevent all mutations through read-only access. Platform view permissions currently expose some write-named capabilities for UI composition; mutations must continue checking actor path/write authority, not permission membership alone.

All endpoints re-resolve active user, membership/support status, academy lifecycle, object ownership, and applicable assignment. Recheck authority when applying a preview/adjustment. Audit author/policy writes and queued operations; queued jobs record initiating authority and policy revision. No user-supplied academy or class ID may expand a query scope.

## 10. Technical implementation boundaries

### Data and contracts

Extend the research specification's profile/case/snapshot model. Add grading mode/version, case comparator/weight/limits, runtime identity, scoring/material policy, feedback policy, and private bundle reference. Version schema contracts in `packages/shared/src/content/course.ts`, learning/submission contracts, and the corresponding Prisma models.

New domain records: author validation run; assignment assessment policy revision; grading policy revision; score adjustment/request event. Names are design concepts, not existing Prisma model names.

Keep `Submission.score` meaning stable for legacy consumers during transition. Add explicit raw earned/possible and applied material score rather than repurposing the old integer column. Map new scores into existing normalized presentation through a single calculation and reconcile `bestScore`, progress, records, rankings, points, and teacher analytics. Separate displayed runtime, total judge duration, and study time.

### Services

- Pure comparison/scoring kernel: versioned normalization, Python matcher contract, weights, warning/timeout semantics. No database or permissions.
- Profile service: validation, revision publication, capability checks and immutable snapshots.
- Existing execution interface/worker: enforce resource limits, isolated execution, bounded outputs, result protocol.
- Assessment policy resolver: authoritative class context, admission/deadlines/attempts, feedback release.
- Academy grading access/results service: staff result scopes independent of Teacher monitoring.
- Adjustment service: request/apply lifecycle and grade reconciliation.
- Existing regrade service/runner: extend revision snapshots and new scoring fields, preserve repair conventions.
- Existing library/import/copy/version flows: retain all grader fields; reject unsupported import values explicitly.

Custom scripts require private bundle storage, approved runtime, isolated sandbox and trusted score channel. Student code cannot access private grader files or forge grade messages through stdout. Phase this separately; adding a regex selector is not custom-grader support. AI feedback remains outside deterministic scoring.

### Frontend

Reuse the existing `ExerciseWorkspace`, `AnswersEditor`, teacher progress/detail components and shared admin/academy wrappers. Add proposed route wrappers and permission-aware navigation, a reusable score explanation, profile diff, validation results, adjustment form, and policy-source display. Localize strings using current i18n conventions. Cover loading, empty, forbidden, expired grant, conflict, validation failure, and infrastructure failure states.

Read relevant installed Next.js guides in `node_modules/next/dist/docs/` before implementation, as required by AGENTS.md.

## 11. Ordered implementation plan

| Milestone | Deliverables | Exit gate |
| --- | --- | --- |
| 1. Contracts and authority | Profile schema/migrations; named permission changes; source/result scopes; legacy adapter | Role/scope tests pass; existing score meaning unchanged |
| 2. Grading engine | Five comparators, weights, bounded regex, per-case/total budgets, runtime enforcement, snapshot results | Research differential matrix and isolation tests pass for supported runtime |
| 3. Shared authoring | Academy and library grading editor, validation runs, publication diff/revisions; copy/import/version support | Team Lead and Manager independently publish a validated fixture; library adoption preserves it |
| 4. Student and teacher delivery | Workspace/sample agreement, streaming/recovery, weighted records and assigned progress | Real authenticated end-to-end results are consistent and private data stays private |
| 5. Staff review and repairs | Academy Results, adjustment requests/actions, extended Maintenance | Tenant scopes, audit, stale-adjustment handling and repair reconciliation verified |
| 6. Assessment and policy controls | Class deadlines/attempts/release; Manager defaults; head-office ceilings and operations | Concurrent admission tests; default legacy practice unchanged; policy enforcement demonstrated |
| 7. Custom/native compatibility | Approved script bundles/native runtime, controlled imports, remaining Elice probes | Separate custom-grader security and compatibility acceptance |

Minimum server-enforced ceilings, authorization, observability and runtime safety belong in milestones 1–2, even though the richer settings UI arrives in milestone 6. Do not enable an authoring control before workers understand and enforce it. Deliver milestones behind feature gates with a pilot academy.

This is an implementation sequence, not a promise of calendar duration. Split each milestone into focused changes with its own acceptance gate; do not replace the entire grading system in one release.

## 12. Verification and acceptance

Required role scenarios:

- Team Lead creates a class/course/problem, configures 30/30/40 weights, validates and publishes, reviews academy results and regrades; cannot enroll students, change credentials or attendance schedules.
- Manager performs the same curriculum operations and changes academy defaults; remains on Manager overview unless holding/switching another role.
- Teacher-only cannot edit/publish profiles or use academy-wide results; main and assistant teachers can review their assigned students and request an adjustment.
- Manager + Teacher and Team Lead + Teacher work through the held-role union and assignment rules. Role cookies never grant authority. Student + staff membership combination remains forbidden.
- Student can submit own accessible work, receives safe progress/results, and cannot retrieve private cases, patterns, source or other students' submissions through guessed IDs or exports.
- ADMIN authors library profiles directly; academy inspection cannot write grading definitions or adjustments; valid support writes retain grant attribution. Explicit platform repair works without falsely claiming membership authority.
- Revoked assignments, suspended users/memberships, expired grants, archived academies and cross-academy IDs fail according to existing lifecycle rules.

Required grading/data scenarios:

- Correct first two weighted cases produce raw 60/100; only the third produces 40/100. Check display/material conversion separately.
- Run/Submit use the same comparison semantic version; Elice unknowns remain labeled until verified.
- Deadline boundary and simultaneous last-attempt requests are race-safe; multiple class contexts cannot bypass policy.
- Public feedback delay is enforced in every HTTP/stream/export route, not just hidden by UI.
- Publishing during queued work preserves submission snapshots; copying/importing/versioning retains fields and private-data policy.
- Duplicate job delivery, SSE reconnect, worker crash and retry do not duplicate attempts, adjustments or rewards.
- Regrade does not mutate the original submission or count as a student attempt; adjustment review and best/latest aggregation remain consistent.
- Library master edits do not rewrite adopted courses. Unsupported runtimes/limits block adoption or require explicit compatible conversion.
- Malicious regex, memory pressure, excessive output, child processes and cross-user interpreter state are contained in staging tests.

Run focused shared/API/web authorization and grading tests, affected typechecks/build/lint/i18n checks, and existing repair/import/library suites. Perform browser smoke tests with isolated role fixtures, followed by representative 1/5/10/50 simultaneous submissions. Record queue, execution, persistence and click-to-score separately. Do not claim 2–3-second results from concurrency settings alone.

## 13. Migration, rollout, and completion definition

Backfill existing exercises to explicit legacy semantics without changing stored grades. Deploy compatible readers/workers before enabling new authoring. Preserve runtime/profile versions and audit history. Pilot a copied practice course; compare reference outputs, permissions, teacher/student presentation and point reconciliation. Expand only after the milestone gates pass.

Rollback disables new-profile authoring/admission and preserves a worker capable of draining supported queued snapshots. Never hand a new snapshot to an old worker that guesses its semantics. Emergency runtime shutdown produces a visible infrastructure error with a repair path.

The first release may claim verified Elice-style STDIO grading, not complete Elice parity. Full grading compatibility additionally requires the custom/manual milestones and applicable V1–V12 probes in the research spec. Completion means the role-appropriate authoring, runtime, results, repair, import, library and policy paths work together—not merely that an editor has five comparison options.
