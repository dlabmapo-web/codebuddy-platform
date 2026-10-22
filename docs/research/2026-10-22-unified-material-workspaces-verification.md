# Unified material workspaces

Date: 2026-10-22
Branch: `feat/dlab-os-staff-sso`

## Changes

Learning pages now share `LessonHeader`, `LessonFooter` and `WorkspaceCurriculumNavigator`. This covers coding (including PDF plus coding), standalone PDFs, written responses, short answers, native multiple choice, legacy coding quizzes and video lessons.

The course tree is a left column on desktop and an Escape-dismissible overlay on narrow screens. Every page starts with its current module and lecture expanded. Previous/Next uses the same full-course material sequence, button styling and position counter; Fullscreen stays at the right of the footer. PDF pages no longer require opening a different right-hand contents panel, and assessments no longer replace the tree with a modal materials drawer.

Coding and manual activities retain their existing graders, practice separation, editor synchronization and authoring permissions. Manual navigation protects unsubmitted explicit answers with a cancellation dialog and flushes ordinary drafts before moving. A failed draft save blocks navigation. Running sessions/submissions disable sidebar and footer movement.

PDF/video routes pass action visibility from the verified academy identity. Edit uses the existing PDF/video editor; backend authoring authorization and revision checks remain authoritative. Tutoring fetches only the actor's genuinely assigned classes through the existing teacher-roster API. PDF tutoring opens the class activity roster, since a PDF has no answers to grade. Video tutoring opens the existing viewing-progress review. Solution/reference actions appear only on materials that support them.

The hierarchy comes from the existing authenticated course-outline endpoint. Navigator path projection now also recognizes assessment, PDF and video materials. Supplementary PDFs can show their course context without being inserted into the main Previous/Next sequence.

No database migration, SSO role mapping or production configuration change is needed.

## Manual retest

1. Reload the local course after saving any work. Open coding, a written answer, a standalone PDF, a quiz and a short answer in order.
2. Confirm the same left course tree, header identity, Leave action and Previous/Next/Fullscreen footer on each page. The current material should be highlighted and its module/lecture expanded.
3. As assigned staff, check the consistent Tutoring/Edit controls. Open PDF Edit and cancel. Open PDF Tutoring and confirm only assigned classes appear. Written answers and quizzes retain View solution and their grading/tutoring workflow.
4. As a student, confirm staff actions are absent. Select a quiz answer and try another material; dismiss the confirmation and check the selection remains. Accept the confirmation to leave.
5. Check sidebar movement and footer movement across material types, including video. At a narrow viewport, close/reopen the tree and confirm the footer stays reachable without horizontal page overflow.

## Test scope

Automated browser verification uses real Cove application routes, permission checks, WebSockets, PostgreSQL and Redis with local OS/Supabase doubles. PDF bytes come from the existing fixture. The video fixture exercises page framing and navigation with ready metadata, not transcoding or encoded playback. This is local verification; production has not been deployed.

## Results

- Chromium and WebKit flows passed together: 2 tests, 1.7 minutes. They cover the shared tree and footer across material types, PDF rendering, assigned-class tutoring, opening/cancelling PDF Edit, staff written-answer actions, preserved monitor feedback, hidden student staff-actions, unsaved quiz-answer cancellation, video/short-answer/quiz Previous/Next, and narrow-screen overflow.
- The existing Manager/Team Lead workflow also passed with the shared coding frame: actual assignments, synchronized edits, execution and revoked access after unassignment.
- Navigator projections: 12 shared tests passed, including supplementary PDF context without inclusion in the main material sequence.
- Shared chrome and existing coding workspace tests: 11 passed.
- Web and E2E TypeScript: passed.
- Translation checks: 136 tests passed.
- Changed web files: ESLint passed with the three pre-existing hook dependency warnings in ManualWorkspace and VideoLesson.
- The actual local Manager browser displayed the real PDF and written-answer pages with matching headers, left course trees and footers. No real answer or grade was changed.

An early browser run overlapped a heavy TypeScript check and exceeded a development compilation wait on this machine. The final browser run and TypeScript check ran serially and passed. Test selectors were also corrected for the PDF editor's two Cancel controls and the fixture's actual material order.

Screenshots: [PDF](assets/2026-10-22-unified-material-workspaces/pdf.png), [written answer](assets/2026-10-22-unified-material-workspaces/written.png), [student quiz](assets/2026-10-22-unified-material-workspaces/student-quiz.png).
