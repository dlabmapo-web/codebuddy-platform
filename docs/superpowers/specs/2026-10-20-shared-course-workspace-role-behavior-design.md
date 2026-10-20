# Shared course pages and role-aware problem workspaces

Date: 2026-10-20 (Asia/Seoul)
Status: Implemented on `feat/shared-course-staff-practice` following user approval.
Validation: [implementation and local verification](../../research/2026-10-20-shared-course-staff-practice-verification.md).
Request: Study Elice and specify the same shared course/problem experience for Cove.

## 1. Product decision

Every authorized academy member uses the same course outline and material routes.
Opening a programming problem opens its statement, personal code editor, terminal,
Run and Submit controls. Staff do not need a student enrollment or an active
student monitoring session to try a problem themselves. Editing curriculum is an
explicit action from that experience, governed by server-resolved capabilities.

The shared experience covers Student, Teacher, Team Lead and Manager. Existing
role-specific academy dashboards, class monitoring and academy administration
remain available; sharing course pages does not require sharing every dashboard.

This specification adopts Elice's interaction model. It does **not** claim that
Elice course roles and Cove academy roles have identical authority. The mapping
below deliberately retains Cove's curriculum ownership rules. Exact Elice role
permission cloning would be a separate authorization-policy change.

## 2. Live Elice evidence

Inspected in the signed-in browser on the date above:

- [Course lecture list](https://dlab.elice.io/courses/765886/lectures/all).
- [CH01 problem lecture](https://dlab.elice.io/courses/765886/lectures/6637912).
- [Problem 1 workspace](https://dlab.elice.io/courses/765886/lectures/6637912/lecturepages/54487968).
- [Problem 1 editing mode](https://dlab.elice.io/courses/765886/lectures/6637912/lecturepages/54487968/edit).

The initial course permission label was Manager. The course permission selector
offered Non-registered User, Student, Temporary Team Lead, Team Lead, Manager,
Teacher and Admin. Manager, Teacher, Team Lead and Student views were inspected;
the selector was returned to Manager afterward. These are observations through
one account's role selector, not independent-account authorization tests.

| Selected Elice view | Observed lecture behavior | Observed problem behavior |
| --- | --- | --- |
| Manager | Lecture list plus New Lecture/Reorder; lecture has Settings, Unpublish, Edit, New Material and Reorder | Statement, personal editor, terminal, Run, Submit, last score/date, View Solution, Tutoring and Edit |
| Teacher | Lecture management controls were visible in the inspected view | Same problem route and editor; Run, Submit, View Solution, Tutoring and Edit visible |
| Team Lead | Start and material list; editing controls absent after view settled | Same problem route; personal editor, Run, Submit and Tutoring; Edit and View Solution absent |
| Student | Learning completion and material points; course administration absent after view settled | Same problem route and editor, Run and Submit; Edit, View Solution and Tutoring absent |

Additional observations:

1. Manager Run actually executed the existing personal buffer. Its final `1 / 0`
   produced a `ZeroDivisionError` in the terminal and a completed-run message.
   The code was not edited, and Submit was not pressed.
2. Edit opened a separate `/edit` route with description/instructions/solution,
   Skeleton Code, Grader Code, Basic Info, Grading settings, environment settings
   and Save. No content was saved or publication state changed.
3. Problem navigation includes material list, Previous/Next, position, Leave and
   fullscreen. The role changes retained the same personal code and previous
   submission metadata for this account.
4. Immediately after changing the selected role, old controls could remain
   visible briefly. The settled page, not the transition snapshot, is the basis
   for comparisons. This flicker is not a behavior to reproduce.

Not established by this inspection: independent Teacher account write authority,
the role selector's persistence mechanism, access to unrelated courses, actual
staff Submit results, staff analytics inclusion, or hidden-content publication
rules. Course scope and record isolation below are explicit Cove design decisions,
not assertions about Elice internals.

## 3. Current Cove behavior and gap

| Existing source | Current behavior / relevance |
| --- | --- |
| `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/page.tsx` | Empty class context redirects staff to the authoring exercise page instead of rendering the runnable workspace. This is the immediate mismatch. |
| `packages/api/src/learn/learn.service.ts` | Staff can read learning content but receive empty class context; bootstrap comments explicitly expect the authoring redirect. |
| `packages/api/src/classes/assigned-course-access.ts` | Students reach enrolled class courses; teachers reach courses taught by their assigned classes; Manager/Team Lead have academy scope. |
| `packages/api/src/learn/learning-class-context.service.ts` | Resolves a real student enrollment and delivery class; unsuitable for staff practice. |
| `packages/api/src/learn/submission.service.ts` | Submission creation requires `submissions.own.create` and a class ID. Staff should not receive this student authority as a workaround. |
| `packages/shared/src/auth/roles.ts` | Teacher has read/review/draft, while Manager and Team Lead own curriculum management. Teacher review can expose hidden test data; private reference solutions are separately controlled. |
| `packages/web/src/lib/academy-view-role.ts` | Member view role controls presentation; API permissions come from held roles. A view cookie is not an authorization boundary. |
| Content exercise `exercise-workspace.tsx` and `preview-modal.tsx` | Authoring form and statement preview exist, but neither replaces a personal runnable practice workspace. |
| `packages/api/prisma/schema.prisma` | ExerciseDraft is keyed by user/material; Submission classId null already means legacy attribution. Neither is sufficient to identify staff practice safely. |

Recent PDF practice and multiple-reference-solution work must continue to work.
See [PDF verification](../../research/2026-10-19-pdf-practice-local-verification.md)
and [multiple solutions verification](../../research/2026-10-19-multiple-solutions-local-verification.md).

## 4. Approaches considered

1. **Shared course/workspace with explicit participation modes — recommended.**
   Reuse the existing learner components and runtime, resolve capabilities and
   scope on the server, and isolate staff practice persistence. This directly
   fixes the observed navigation mismatch while protecting student records.
2. **Add a runnable preview only to authoring.** Smaller UI change, but teachers
   still enter a content form to try a problem, and regular course links remain
   inconsistent. Insufficient for the requested experience.
3. **Enroll staff as students.** Reuses class-bound submissions but mixes staff
   into rosters, points, progress and monitoring. Reject this approach.

## 5. Shared navigation and page behavior

### 5.1 Entry and routes

- All member roles have a Courses entry in the common learning navigation.
  A material's default action is Open, not Edit.
- Keep `/academy/[academySlug]/learn/courses` and its `[courseId]` outline as
  canonical shared browsing routes. Existing PDF, video, quiz, turtle and exercise
  learning routes remain canonical material destinations.
- The existing exercise learning route renders a workspace for an authorized
  staff member with no student class context. Remove the authoring redirect only
  after staff mode is supported end to end.
- Content Management remains an explicit staff destination. Existing authoring
  URLs remain valid and are the targets of Edit; do not silently redirect existing
  edit bookmarks into practice.
- The common outline offers management actions alongside the normal material
  list when permitted. Read-only users see the same titles, hierarchy and Open
  actions without dead management controls.
- Preserve course/material identity and return location across Open, Edit,
  return-to-material, Previous/Next and browser refresh. Do not select an arbitrary
  student or class to make a staff link work.

### 5.2 Default workspace

The workspace contains the existing statement/reference pane, personal code,
terminal/stdin, Run, Submit, result panel, navigator and fullscreen behavior.
Run executes the code currently visible in the personal editor. It never changes
starter code, a reference solution or another user's draft.

For staff, show a persistent `Staff practice` label and the explanation
`Your practice does not affect student grades or points.` Keep the familiar
Submit label; staff results are identified as practice results. This is a full
practice experience, not a statement-only preview or a disabled editor.

Edit appears only with content mutation authority. Review details and private
solutions are separate explicit actions; they are not loaded into the ordinary
statement payload merely because the viewer is staff. Student-facing rendering
must never inherit authoring data through a shared component prop.

### 5.3 Authoring and monitoring boundaries

Edit opens the existing authoring workflow with a clear Return to problem link.
Personal code and starter code have independent save paths. Opening Edit must
not copy personal practice code into curriculum. Returning restores the practice
draft; authoring Save must not replace it.

Observe students is a separate action. Teachers open the course-filtered student roster in their assigned active classes, with a live-monitoring link for each student. An unassigned or stale course returns an empty roster. Other staff retain the existing class/student selector
and assignment checks. A staff personal workspace does not join a student room,
enable help mode, emit student presence or reuse a student's terminal.

## 6. Scope and capability policy

### 6.1 Cove role mapping

| Capability | Student | Teacher | Team Lead | Manager |
| --- | --- | --- | --- | --- |
| Common course/material pages | Enrolled courses | Assigned teaching courses | Academy courses | Academy courses |
| Personal editor / Run | Yes | Yes | Yes | Yes |
| Submit | Student attempt in selected enrolled class | Staff practice | Staff practice | Staff practice |
| Edit existing curriculum | No | No; existing draft-authoring workflow remains separate | Existing manage authority | Existing manage authority |
| Publish / reorder / create / archive | No | Existing limited draft workflow only, no new publish authority | Existing permissions | Existing permissions |
| Review hidden tests | No | Existing review authority within scope | Existing review authority | Existing review authority |
| Private reference solutions | Existing student reveal policy only | Read-only for visible exercises taught through assigned active classes | Existing exercise-management authority | Existing exercise-management authority |
| Observe/review student work | Own records only | Assigned classes | Existing authorized review scope | Existing authorized review scope |
| Academy settings / membership administration | No | No | Existing restricted administration | Existing manager authority |

**Intentional difference from Elice labels:** Elice's inspected Teacher view
showed Edit while Team Lead did not. Cove Team Lead is already the curriculum
owner. Do not invert these authorities from the names alone. The required parity
is the common usable page plus permission-dependent controls; the table above is
the binding Cove policy for this specification.

The user requested following Elice when asked about teacher catalog scope.
Cross-course entitlement was not established by the supplied course inspection.
Consequently this spec preserves Cove's assigned-teaching-course scope rather
than asserting that Elice grants every teacher all academy courses.

### 6.2 Server policy contract

Resolve a workspace access result on the server containing:

- authorized academy/course/material identity and content revision;
- participation mode: `student` or `staff-practice`;
- real student delivery class context only for student mode;
- capabilities for run, submit, author, review, solutions and observation;
- explicit visible-content or authorized-author-preview context.

Add named `practice.own.create` authority for Teacher, Team Lead and Manager;
it authorizes personal practice persistence and grading, not student submissions.
Keep content mutation, review and student submission permissions separate.
Every draft, submit, result and media request rechecks the relevant resource scope.

For multiple held roles, derive accessible resources from the union of authorized
role scopes, not only the primary role. A Teacher view cannot erase Manager
authority, and a role-view cookie cannot add it. Participation mode is separate:
staff defaults to practice; a dual Student/staff member can explicitly choose
student participation only with an active qualifying enrollment. The server
validates that choice. A forged mode or class ID never grants enrollment.

Platform inspection remains read-only. Do not grant staff-practice writes merely
because an operator is viewing as staff. Existing support/library authority must
be checked separately; this feature does not widen platform support grants.

### 6.3 Visibility

Ordinary browsing/practice observes the full visible ancestor chain. Hidden or
unpublished material is available only via an explicit author preview to an
actor with existing review authority for that course. Show an Unpublished preview
badge, keep it out of student navigation and never let a URL flag grant access.
Version previews remain tied to the selected version and cannot mutate or grade
against an unrelated live revision.

## 7. Practice persistence and grading

Use separate staff practice draft and attempt records. Reuse runtime, judge
execution and result presentation through adapters, not student-write endpoints.

- A practice draft belongs to academy + user + material + preview revision
  context. Normal live practice uses one live draft per user/material; explicit
  historical previews use separate version contexts. Last-write/conflict handling
  and unsynced recovery follow the existing draft UX.
- A practice attempt stores owner, academy, material/source identity, context,
  submitted code, immutable grading snapshot/revision, status and result cases.
  Practice has no student membership, class attribution or student solve session.
- Share the grading profile/snapshot builder, queue resource controls, comparator,
  runtime limits and feedback redaction. The worker dispatches student and
  practice results to distinct persistence handlers.
- Staff Submit produces queued/running/completed results, last practice score
  and personal practice history. Runtime errors and wrong answers use the normal
  result UI. Repeated requests use an idempotency key to avoid duplicate attempts.
- Practice completion must never update student progress, completion, attempts,
  points, attendance, rankings, analytics, teacher intervention queues or regrade
  repair records. Operational grading-load metrics may count practice separately.
- Personal practice results are private to their owner; academy management alone
  does not create a practice-history directory. Authorized inspection must not
  accidentally return another staff member's private buffer.
- Do not reinterpret existing null-class submissions as practice or migrate old
  student attempts. Additive practice tables leave historical meaning unchanged.

All roles may use their own local buffer and Run without a grading service.
If grading is unavailable, preserve code, keep Run available and show a retryable
Submit error. Resource/rate limits apply to practice as well as student grading.

## 8. Existing material and runtime compatibility

- PDF theory remains a document page. PDF + coding practice retains PDF/statement
  tabs and independent page position. Switching tabs or viewport must preserve
  editor, waiting stdin and runtime state.
- Videos retain playback and supplementary materials. Staff viewing does not
  generate student completion or attendance.
- Quiz/short-answer materials reuse the correct answer UI and use isolated staff
  practice results. Do not display a programming editor for a non-code question.
- Turtle practice retains canvas, stop/reset and supported runtime behavior.
- Preserve current language support, input-prompt policy, grading limits, sample
  checks and multiple private reference solutions. This feature introduces no
  new execution engine. Teachers may explicitly read private reference solutions for visible exercises delivered by their assigned active classes; curriculum editing remains restricted.
- Starter-code changes never silently overwrite a saved personal draft. Surface
  a revision-change notice and an explicit reset action that requires confirmation
  before discarding unsaved personal work.

## 9. Implementation boundaries and failure behavior

1. **Access resolver:** one server policy for resource scope, participation and
   capabilities. Existing assigned-course and academy access helpers are inputs.
2. **Workspace bootstrap:** normal statement/navigator plus participation and
   capabilities. Separate calls obtain privileged review/solution data.
3. **Workspace component:** common editor/material/result presentation; persistence
   adapters implement student or staff operations. Student-only presence, points
   and collaboration hooks mount only for student participation.
4. **Practice service/repository:** owner-scoped drafts, attempts and histories;
   shared grading interface; no dependencies on student rewards or progress writes.
5. **Authoring integration:** existing form and mutations; shared outline adds
   capability-based links/actions and precise cache invalidation after save.

No unrelated shell rewrite or global role renaming is needed. Implementation must
read the installed Next.js guides required by AGENTS.md before changing routes.

Unauthorized, deleted and out-of-academy resources remain non-disclosing not-found
responses. Revoked access stops future reads, saves and submits; retain an unsynced
local buffer with download recovery rather than silently discarding it. Do not
mistake a grading outage for missing content. Navigation away from unsaved authoring
changes uses the existing unsaved-change guard. Never render stale write controls
while a role/context capability request is pending.

## 10. Acceptance criteria

1. Independent Student, Teacher, Team Lead and Manager accounts open the same
   authorized course and exercise learning URLs. Staff with no student enrollment
   get a runnable personal workspace without an authoring redirect or class picker.
2. Each staff role edits its personal buffer, runs Python with stdin and sees its
   own terminal output. Starter code, reference solutions and student drafts remain
   unchanged. Two staff accounts cannot read or overwrite each other's buffers.
3. Staff Submit grades normally and persists practice history. Database assertions
   prove no student submission, progress, point, attendance or monitoring event was
   created. A worker retry cannot create duplicate results or rewards.
4. Student Submit still requires the correct enrolled delivery class and updates
   existing student records exactly once. Multiple-class choice remains intact.
5. Direct draft/result/submit/media requests enforce academy, course assignment,
   owner and visibility scope. Unassigned teachers and forged class/mode/view-role
   values cannot bypass checks.
6. The permissions matrix is verified through both UI visibility and direct API
   mutation refusal. Hiding Edit alone is not sufficient. Student bootstrap and
   cached responses contain no privileged answer/test/solution payloads.
7. Manager/Team Lead can enter Edit explicitly, save through the existing content
   flow and return to their personal code. Teacher retains only existing permitted
   draft authoring. Shared page navigation never implies a new publish grant.
8. A dual-role member defaults to staff practice and can deliberately enter valid
   student participation. Cookie edits change neither authority nor record type.
9. PDF practice, quiz, turtle and video flows work at desktop and mobile widths;
   changing tabs retains code, runtime and reader state. Keyboard navigation and
   accessible names cover the new mode label/actions.
10. Author preview is explicitly labeled and revision-bound; hidden items remain
    unreachable to students. Access revocation, stale revisions, failed draft saves
    and unavailable grading retain recoverable personal work.
11. Platform read-only inspection cannot create practice records. Existing support
    restrictions and monitoring permissions still apply.

Verification should combine focused policy/service tests, real database checks
for record isolation, and browser journeys with independent role accounts. The
Elice selector observations are research evidence, not substitutes for those tests.

## 11. Delivery and review

Implement in dependency order: access/participation contract; additive practice
storage and grading; common runnable workspace; outline/authoring links; cross-role
browser verification. Each stage belongs to this single feature, with no production
rollout until the complete isolation and role journeys pass.

Existing authoring links and student records remain compatible. Rollback can
disable staff practice entry without modifying student data; practice tables can
remain dormant. No production data migration, deployment or application code change
was performed while preparing this specification.

The user approved implementation on 2026-10-20, including Elice-inspired UI with
Cove colors. Section 6 remains the binding role mapping. The validation report
records delivered behavior, tests and the existing legacy-version route boundary;
this is not a claim of full Elice backend parity.


## Teacher correction (2026-10-20)

Teachers can explicitly open reference solutions while practicing. Reading a solution
requires curriculum review permission and rechecks the academy, active teaching
assignment, and visible material ancestors. It grants no exercise editing authority.
For members who also hold Teacher, Observe students opens the current course's
roster across their own assigned classes, including students who have not started.
Each seat links to the existing authorized live-monitoring page. The course filter
is applied on server and client reads and survives reload. Unassigned courses
produce no rows, rather than falling back to all classes.
