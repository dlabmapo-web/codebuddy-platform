# Student grading results and completion updates

Implemented and verified. [Checks and screenshots](../../research/2026-11-12-student-grading-result-verification.md).

User-directed refinement of the existing manual-grading design. Keep the editor, terminal/output location and right grading sidebar. No permission or read changes. The user's follow-up explicitly makes correction reasons optional in the UI, request validation and database constraint. A small migration relaxes only the nonempty-reason check while preserving its length limit and review history.

Use Cove's existing Pretendard text and monospaced score, brand blue (#1B64DA, dark-theme #5B93F5), success green (#15803D / #45C97F), warning amber (#B45309 / #E3A008), and existing neutral surfaces. The signature element is a compact assessment receipt: colored state icon, prominent blue score tile, distinct learning-outcome badge, teacher feedback and a contextual next-step message. Color describes grading/learning state, never a guessed passing-score threshold. Dark editor surfaces require explicit readable foregrounds; preserve mobile wrapping and focus visibility.

Pending: amber clock and saved/pending labels; retain the required manual-grading notice and invite the student to talk to their teacher. Graded/incomplete: show the actual score, amber Needs more work badge and a message to discuss what to improve with their teacher. Graded/complete: show green completion, feedback and a message that learning is complete. Do not ask an already graded student to obtain their first grade. Practice-only receipts remain distinct. Feedback and reviewer/date remain visible; Refresh remains a real action.

Correction reason is optional for every update, including completion-only updates. Hide the optional note under a collapsed disclosure in the sidebar; never block Update grade for an empty reason. Accept an omitted or empty reason in the shared/API request schema, retaining the 1,000-character limit. Keep review versions, concurrency checks, idempotency and audit records. Keep the existing score when only completion changes; verify that path without editing any user's stored grade.

Validation: focused result-state and completion-only update regressions, web/i18n/E2E types and lint, and the isolated Chromium/WebKit workflow with EN/KO, light/dark and mobile screenshots. No SQL/read-count changes.
