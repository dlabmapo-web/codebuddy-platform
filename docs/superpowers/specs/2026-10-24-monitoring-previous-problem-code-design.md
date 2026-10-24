# Student code in monitoring problem previews

The teacher's monitoring curriculum currently loads only the public statement
and starter code when selecting a different problem. A blank starter therefore
appears even when the selected student has saved work.

For authorized teaching staff, return a read-only code snapshot after validating the
academy, class access, enrolled student, and visible assigned material. Teachers
need a homeroom or assistant assignment. Managers and Team Leads inherit teaching
abilities and can access active classes in their own academy without a Teacher
grant or class assignment. Existing Manager-only administration remains restricted.
Use the
student's saved ExerciseDraft first, including an intentionally empty draft.
If no draft exists, use the newest non-regrade submission in this class (or
a legacy submission with no class attribution), ordered by creation time and ID.
Exclude attempts attributed to another class. With neither, show the authored starter code.

Keep the public exercise projection separate. Add only nullable studentCode to
the preview response: no draft ID, collaboration state, hidden cases, solutions,
or credentials. Preview remains unable to edit, run, submit, or send feedback.
Selecting another problem/student must not reuse a prior snapshot. Returning to
live still uses the existing authorized watch and synchronization path.

A code-only UI substitution without a server read cannot fix the issue. Joining
old collaboration documents would add unnecessary write and synchronization risk.
An ordinary authorized snapshot is sufficient for reviewing previous problems.

Verify draft precedence, blank drafts, submission fallback/class scope, untouched
problems, access denial, absence of collaboration/hidden data, and stale-preview
races with focused tests. Exercise real student editing, autosave, movement to a
second problem, teacher selection of previous work, read-only behavior, and
return to live in local Chromium and WebKit. Do not modify production data.

Live assistance must preserve exact text in both directions for all three staff
roles. While a collaboration document is active, it owns the student's Monaco
model. React continues receiving editor changes for autosave, but cannot write
lagging code snapshots back into the same model: doing so recreates shared
characters and can reorder incoming edits. Ordinary controlled editing resumes
after collaboration retires. Reset continues through the existing document
replacement path. Verify staff edits, student follow-up edits, restored QA text,
and navigation after leaving collaboration in real browsers.
