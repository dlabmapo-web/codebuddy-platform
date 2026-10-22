# Learning material navigation and statement layout

Date: 2026-10-22
Branch: `feat/dlab-os-staff-sso`

## What changed

The Elice lecture list and the supplied Cove screenshots informed the layout. Cove retains its own blue palette, typography, role controls and authenticated routes.

- Student class cards show the assigned teacher and active student count. Student and teaching cards no longer display the free-form demo sentence naming a teacher and student. Schedule chips and course counts remain.
- Course materials, the coding workspace tree and PDF/video/assessment contents use a common icon and readable type label. Coding, PDF plus coding, standalone PDF, video, written response, multiple choice and graphics exercises are distinguishable without relying on color alone.
- Workspace materials have larger full-row click targets, focus/loading states, separate folder headers and more spacing. A standalone PDF opens its document route directly after the existing save/transition gate; the browser no longer fetches and signs it once before fetching it again at its destination.
- PDF and assessment contents route video lessons to the video page rather than a generic assessment route.
- Monitoring shows non-code resources as explicit new-tab links, preserving the live code view and feedback draft. Programming navigation continues to use the existing live/preview controller.
- Student and staff share the same public problem statement, section icons and rich-text measurement. The rich-text frame measures its intrinsic content wrapper instead of a body that Safari can stretch to the iframe viewport. This removes the oversized gap before input/output and examples while retaining sandboxing and pointer alignment.
- The monitoring header uses two wrapping rows so the student identity, problem title and staff controls do not overlap.

The API adds only a filtered aggregate student count to the existing student class query. It exposes no student roster or identifiers. The field is optional for rolling API/web releases. There is no migration, SSO role mapping change or new access grant.

## Manual check

Keep the API on port 4000 and Studio on port 3000 running. Reload local pages after any work is saved.

1. As an enrolled student, open **My classes**. Check the assigned teacher and student count; the demo relationship sentence should be absent.
2. Open a course and expand a lecture. Check that every material has a type icon and label; progress and grading information appear separately.
3. Open a coding exercise. Expand the course outline and select the third PDF row. It should open the standalone PDF page and display the document.
4. Open **Course contents** on the PDF page. Select a quiz or written response and verify the appropriate activity opens.
5. Compare the same coding exercise as a student and as assigned staff. Both show the same public problem, input/output, examples and constraints, without a tall blank area after a short problem description.
6. As an assigned Teacher, Team Lead or Manager, open the live monitoring view. Type an unsaved feedback note, then open a PDF from its course tree. The PDF opens in another tab. The original live view and note remain available.
7. Check keyboard focus on material rows and narrow screens. Long titles wrap within the sidebar and identify the material type on a separate line.

The actual local Manager browser successfully opened the real two-page reference PDF from row 3. No real student answer or grade was changed.

## Automated validation

- API build and web TypeScript passed.
- E2E TypeScript passed.
- Class service: 30 tests passed, including safe student projections.
- Shared learning contracts: 30 tests passed, including optional/nonnegative integral headcounts and roster rejection.
- Material identities, rich-text frame and statement components: 18 tests passed.
- Translation validation: 136 tests passed.
- Changed web files: ESLint passed with the three existing hook dependency warnings in ManualWorkspace and VideoLesson.
- The existing Manager/Team Lead browser workflow passed: actual assignments, shared code editing, execution, narrow tutoring view and access revocation.
- Chromium and WebKit learning workflows passed together (2 tests) for class facts, material labels, statement parity and intrinsic height, third-row PDF rendering, PDF-to-quiz navigation and narrow-screen overflow. Both also opened a monitoring PDF in a new tab and verified that unsaved feedback survived.

Screenshots: [student materials](assets/2026-10-22-learning-material-navigation/student-materials.png), [local workspace](assets/2026-10-22-learning-material-navigation/workspace.png), [monitoring with feedback preserved](assets/2026-10-22-learning-material-navigation/monitoring.png).

Browser tests use real Cove routes, authorization, PostgreSQL and Redis in disposable containers, with local OS/Supabase provider doubles and an existing PDF fixture. WebKit cannot fulfill an intercepted HTTP redirect, so its test starts through the context's shared-cookie request client before visiting the local OS double; Cove still creates and validates the actual SSO state cookie. This does not change application login behavior.

Video type presentation is covered by component tests; playback/transcoding was not exercised in this task. WebKit automation is not a test of every installed Safari version. Production has not been deployed by this task.

The passing final dev-server run logged one transient Turbopack HMR chunk load error; the tested destination pages still rendered and all assertions passed. Reloading the real local workspace loaded the final styles. This is separate from the corrected PDF navigation and statement-height behavior.
