# Manual grading from history and live monitoring

Date: 2026-11-12
Status: requested for implementation by the user; replaces the terminal-grading layout.

Keep the existing history problem list, description, editor and Run/Saved result tabs. A **Grade submission** / **Edit grade** button opens a shared, non-modal right sidebar using Cove's Sheet primitive. Use the existing application typography, card/background/border tokens, blue actions and monospace score values. On phones the sidebar uses the viewport width. The form scrolls independently; completion and publication stay at the bottom.

The sidebar names the student, problem and submission time and provides the immutable submitted code for inspection. It grades a pinned saved submission, even if the student changes live code or submits again. Show a newer-submission notice when applicable. Never grade a live draft or turn a help request into an invented submission.

Expose the same control in the live monitor header when the authorized review reader returns a manual submission with publication permission. Watching, help requests and collaboration stay mounted while the sidebar is open. Tutoring and the student selector already open a selected student's saved work; that workspace uses the same grading sidebar, so its target follows the selected student rather than the underlying live student. Hide the underlying live grading action while saved tutoring covers it.

Retain score precision, frozen maximum/inclusion, correction reasons, optimistic version/idempotency rules and existing backend authorization: assigned Teachers, Team Leads and Managers. Preserve existing grading events so student results refresh live. Guard closing, navigation, student/material changes and unload for unsaved grading; block leaving during publication. Compose the live grading guard with existing history and collaboration guards. Opening a sidebar adds no fetch: reuse the already authorized review response. History/Refresh retains the existing review read. No backend services, SQL, contracts or polling changes are planned.

Alternative layouts were an always-open grading column or the previous terminal tab. The requested action-opened sidebar preserves the user's existing workspace until grading is needed.

Verify history controls outside the terminal; live grading after submission/help/tutoring/student selection; pinned attempts during resubmission; guards and publication; all three staff roles; unchanged automatic/Turtle workspaces; phone/desktop geometry and Korean/dark appearance. Use disposable Docker PostgreSQL and isolated browser fixtures for grading writes, never the user's development submission.
