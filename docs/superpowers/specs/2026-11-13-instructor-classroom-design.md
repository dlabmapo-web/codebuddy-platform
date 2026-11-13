# Instructor classroom for projection

Date: 2026-11-13
Status: implemented; projection/screen-sharing confirmed by the user.

## Intended behavior

Enter Classroom is available from a staff member's live class page. It opens a fullscreen teaching workspace, independently of any student's tutoring session. The workspace shows the class name, a class-scoped lesson picker, previous/next lessons, fullscreen and exit controls. Its picker covers assigned, published courses and visible modules, lectures and materials, including coding, manual/quiz/Turtle activities, explanations, PDFs and video lessons.

Use the existing lesson workspaces for content and execution. Demonstration code and attempts belong to the instructor's existing staff-practice identity; they never become a student's submission, progress or points. The teaching header omits authoring, tutoring and private history controls. It does not automatically reveal solutions. Student devices are not synchronized: the user chose projection/screen-sharing.

The entry page selects the first available lesson without a redirect/read round trip. A lesson URL selects only a material in this class's authorized outline. An empty class shows a useful empty state. The class name and lesson context persist while switching content. Existing saves, dirty-answer confirmation and runtime stop behavior must finish before switching or exiting.

## Role hierarchy and review of the four earlier fixes

Manager inherits every Team Lead and Teacher permission; Team Lead inherits every Teacher permission. Manager and Team Lead cover active classes in their academy without a separate Teacher assignment. A Teacher needs an active homeroom or assistant assignment for this classroom. Students receive no classroom access.

The existing permission sets already implement this hierarchy. Audit the UI gates and tests as well as the permission arrays. The four prior fixes should behave identically for a Manager and Team Lead: blue Import from Library, Class Management/Enter My Classes labels, class edit access and schedule editing. Ordinary Teachers retain their current read/teaching tasks and do not gain class CRUD or schedule changes. Add explicit coverage for single-role Manager and Team Lead accounts so additional Teacher roles cannot mask a defect.

## Design and implementation boundaries

Prefer a class-aware provider around the existing fullscreen lesson components. A shared teaching header/footer and picker replace ordinary workspace navigation during classroom use. An embedded iframe would duplicate navigation and complicate draft guards; a separate content renderer would duplicate grading, media and editor behavior. Neither is needed.

Add a read-only `academyClasses.getClassroom` projection using the shared assigned-class policy. Resolve permission/membership once, read the authorized class once, fetch its assigned course headers and visible outline metadata together in one statement through the curriculum reader. Supplementary-only PDF/video resources remain available inside their lessons and are excluded from the main teaching sequence. Main media appears in the picker only when its asset is ready. Read titles, types, IDs and ordering only; do not load descriptions, code, solutions, rosters or student results in the picker. The query count must remain constant as courses/materials grow. Do not require live-monitoring sockets or its rollout flag for the classroom reader.

Read main content during server rendering and seed the reused client workspace. PDF/video reads need the same server-seeding convention as coding/manual/explanation content. Reuse request-cached account/route reads. Preserve the existing content API authorization on every request. No migration, new polling, student session impersonation or remote broadcast is required.

## Acceptance

- Manager, Team Lead and assigned Teacher enter from My Classes and open content without selecting a student.
- Single-role Managers and Team Leads retain all four prior fixes and academy-wide class coverage.
- Student, foreign-academy, unassigned Teacher, suspended membership and archived-class requests are denied.
- The picker cannot open an unassigned or unpublished material; IDs in URLs are checked server-side.
- Exercise code runs privately; selecting a lesson or exiting preserves draft/runtime guards. No student work or points are written.
- Mixed material navigation, empty classes, keyboard controls, fullscreen, English/Korean and narrow/dark layouts work.
- Tests count SQL against disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`, include small/large fixtures, and document measured counts.
