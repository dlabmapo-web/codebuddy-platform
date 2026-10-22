# Learning material navigation and statement consistency

## User direction

Use the supplied Cove screenshots and the authenticated Elice lecture list as the visual reference. Preserve Cove's blue palette, typography and existing role permissions. Improve the class facts, material identification, direct navigation and consistency of the student and monitoring statement panes.

## Design

- Student class cards show class name, teacher, available courses and active student count. Hide the free-form description on student and teaching cards; it currently contains a demo sentence naming students. Expose only an aggregate count to students, never a roster.
- Use a shared material identity: a colored icon tile, title and secondary type label. Coding, PDF plus coding, PDF documents, videos, written answers, quizzes and graphics exercises have distinct labels/icons. Show progress separately from material type.
- Use the same identity in the course outline, workspace tree, manual assessment drawer and PDF/video contents. Give each row a full-width click target, keyboard focus, consistent spacing and selected/loading states. Keep module and lecture folders visually separate from materials.
- Open non-code materials through their authenticated destination routes without an extra pre-navigation API fetch. Preserve the existing code workspace's transition/saving gate. Fix video destinations when leaving a PDF or assessment.
- The monitoring tree includes published non-code materials. These are explicit new-tab links, preserving the live code view and feedback in the original tab. Programming exercises continue through the existing authorized live/preview controller. Resource routes independently verify staff access.
- Continue using the shared public `ProblemStatement` for students and staff. Add matching section icons and fix intrinsic rich-text measurement: measure a content wrapper, not iframe viewport/body height. Retain HTML sandboxing, the shared statement canvas and remote-pointer alignment.
- Give the monitor header two wrapping rows: student/navigation/save/connection above, problem title and staff actions below. This prevents the long identity and controls from crushing the problem title.

## Boundaries

No SSO role mapping, enrollment, grading, hidden-answer policy, production environment, course ownership or database migration changes. The student count is a filtered database aggregate in the existing class query, without per-class queries or student identifiers. Omit it when an older API has not supplied it.

## Acceptance

1. Student cards show teacher and student count, with no demo relationship sentence.
2. Every supported material has an icon and readable type, including in narrow navigation.
3. Clicking the third PDF row opens its document route and renders the PDF; the next quiz opens correctly from PDF contents.
4. Student and assigned staff see the same public problem, input/output, examples and constraints; a short description does not create a viewport-sized gap.
5. Monitoring still requires a real class assignment, keeps private answers protected, and live code editing continues to synchronize.
6. Verify in Chromium and WebKit and check a narrow viewport. Record browser screenshots and automated validation.
