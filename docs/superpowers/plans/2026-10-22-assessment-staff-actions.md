# Assessment staff actions

Status: Implemented and verified locally. See the [verification record](../../research/2026-10-22-assessment-staff-actions-verification.md). Not deployed.

Extension of the approved [inherited staff design](../specs/2026-10-21-dlab-sso-inherited-staff-roles-design.md), requested for short-answer and quiz activities on October 22.

Use the existing Cove assessment layout and Lucide icons. Add one shared toolbar to the answer and review pages, ordered View solution, Tutoring, Edit. Derive capabilities on the server from all held grants. Tutoring lists only active, assigned classes delivering this course, then opens the existing learner roster, immutable submission, grading and feedback workspace. Keep a return-to-personal-answer link. No role switching and no Manager assignment bypass.

Use the existing author dialog for content editing, preserving published answer-definition locks and optimistic revisions. Fetch private references only when staff open View solution; show the short-answer reference/pattern, model answer, or correct quiz choices and explanation. Students receive no staff capabilities or private answer data. Text/choice submission snapshots stay immutable; tutoring means reviewing and giving feedback, not changing the student's answer.

Verify native short-answer and multiple-choice submission, staff solutions and author save, assigned-only review, student feedback, unassigned denial and access after assignment removal. Use isolated PostgreSQL/Redis and provider doubles, with real Cove UI and APIs. Capture desktop/mobile evidence and run relevant type/lint checks.
