# Student grading results and completion updates

User-directed refinement of the existing manual-grading design. Keep the editor, terminal/output location and right grading sidebar. No API, data model, permissions, reads or publication behavior changes.

Use Cove's existing Pretendard text and monospaced score, brand blue (#1B64DA, dark-theme #5B93F5), success green (#15803D / #45C97F), warning amber (#B45309 / #E3A008), and existing neutral surfaces. The signature element is a compact assessment receipt: colored state icon, prominent blue score tile, distinct learning-outcome badge, teacher feedback and a contextual next-step message. Color describes grading/learning state, never a guessed passing-score threshold. Dark editor surfaces require explicit readable foregrounds; preserve mobile wrapping and focus visibility.

Pending: amber clock and saved/pending labels; retain the required manual-grading notice and invite the student to talk to their teacher. Graded/incomplete: show the actual score, amber Needs more work badge and a message to discuss what to improve with their teacher. Graded/complete: show green completion, feedback and a message that learning is complete. Do not ask an already graded student to obtain their first grade. Practice-only receipts remain distinct. Feedback and reviewer/date remain visible; Refresh remains a real action.

For existing grades, Correction reason stays mandatory for every update, including completion-only updates. Add a visible Required marker, explanatory hint/example and a footer message when a missing reason disables Update grade. Associate field help with the input and footer help with the button. Keep the existing score when only completion changes; verify that path without editing any user's stored grade.

Validation: focused result-state and completion-only update regressions, web/i18n/E2E types and lint, and the isolated Chromium/WebKit workflow with EN/KO, light/dark and mobile screenshots. No SQL/read-count changes.
