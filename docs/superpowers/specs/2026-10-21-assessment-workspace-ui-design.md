# Assessment workspace UI

Improve Cove's existing written-response, short-answer, and multiple-choice learning and review screens. Use the current theme tokens and Pretendard typography: canvas `#F4F7FC`, card `#FFFFFF`, ink `#16181D`, secondary text `#5A6270`, brand `#1B64DA`, and semantic success/warning colors. Preserve dark-theme token behavior.

The student workspace presents instructions beside a bounded answer card, with a clear question, answer hint, character count, and visible actions directly below the answer. Quiz choices use large selectable cards with letter markers, selected styling, keyboard focus, and explicit single/multiple-selection guidance. Submission results and teacher feedback remain distinct from the editable answer. Preview and staff practice carry an explicit notice describing whether work is saved or counted. Mobile stacks the content without restricting instructions to a small clipped pane.

The review workspace presents a searchable learner roster, submitted work, and a grading panel. Desktop keeps submitted work and score/feedback visible together; mobile stacks them. Read-only submitted answers, draft editing, and published reviews remain separate. Add save progress, publication confirmation, empty/loading/error states, and bilingual copy. Protect an edited review from accidental learner/attempt switches.

Reuse existing APIs, grading rules, authorization, rich-content sanitization, private image resolution, immutable attempts, and review version checks. Do not introduce role selection, alter SSO, or change scores merely to render the new design. Shared presentation components should contain the answer composer and review form so their accessibility/state behavior can be tested independently.

Validate with focused UI tests, TypeScript, lint, desktop/mobile visual checks, and real local demo workflows: upload/read a PDF; run and submit a coding exercise using its reference PDF; author/answer/review short-answer and multiple-choice questions; publish teacher feedback and inspect it as a student. Keep mutations within the confirmed development demo academy. Existing unrelated working-tree changes remain intact.
