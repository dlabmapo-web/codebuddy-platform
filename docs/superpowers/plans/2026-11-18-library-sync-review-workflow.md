# Library sync — publish once, review overlapping changes

User-approved amendment, 2026-11-18. This supersedes the release-oriented
interface in the original design; it preserves its merge and grading rules.

Admin saves are private working changes. One **Publish updates** button at
the top of the library course publishes the complete saved batch. There is
no release-note field or release-history UI. Internal immutable snapshots,
durable jobs, audit records, retention and stale-save protections remain.

Only overlapping disagreements or changes that cannot safely apply require
academy review. Different fields merge quietly; identical values converge
quietly. Notify active Managers and Team Leads (including additional roles),
grouped by academy course. A later publication that only changes an unrelated
field must not make an existing notification unread again. Reading is per
person; resolving is shared. Losing a staff role removes notification access.

Notification opens the normal staff course page. The banner and affected
rows identify pending changes. Review opens in the course, scoped to that
row, with academy/current and admin/latest values together, original shared
values expandable, readable field labels, and **Use admin version** / **Keep
academy version** actions. Review supports every material type. Preserve
existing validation, dependent-PDF and archived-content safeguards. Non-row
structural changes remain reviewable from the banner. Remove history and
release counters from academy screens. Changes to active student content
follow the existing grading and video-completion rules.

Implementation sequence:

1. Add notification revision/read receipts and a compact pending-row projection.
   Update these transactionally with merge/resolve; no recipient fan-out writes.
2. Extend the existing bell with scoped course-review items, race-safe reads,
   and after-commit socket invalidation. No polling.
3. Simplify the admin publish control and remove history reads/UI.
4. Add course-row review links and an embedded comparison; preserve direct
   links to the legacy review route for existing bookmarks.
5. Verify publication batching, overlap/convergence, read/resolve independence,
   role/academy isolation, repeated publications, stale decisions and query
   budgets using disposable PostgreSQL. Run affected UI tests, typechecks,
   lint, and relevant existing sync specs. Never migrate shared databases.

The outline reads the pending-row projection with its existing sync-state
read; it does not fetch each row's conflicts. Notification listing uses three
statements (user, application decisions, grouped course reviews), regardless
of course or recipient count. Confirm actual counts in integration coverage.

## Verification

- All 32 pre-existing/new sync integration checks passed together on disposable
  PostgreSQL; the later selected-material SSR check also passed.
- Notification list: 3 statements, including the user lookup. Review list:
  3 including permission. Selected material comparison: 10 including permission,
  without checking access or reading paths twice. Pending row metadata adds no
  statements to the existing outline relation reads (linked outline remains 15).
- Browser acceptance: publish batch → bell → course row → material comparison →
  keep academy version → reload; solved student progress remains intact.
- Both publish notes/history and academy history/counters are absent from UI.
- Read receipts acknowledge only the version displayed, and current membership
  is checked on listing and acknowledgement. Read and resolve remain separate.
- The additive notification migration was subsequently applied to the configured
  development database for localhost testing; production was not modified.

Final validation details:

- Browser flow rerun after the notification popover fix passes and asserts no
  hydration mismatch. Screenshots: `test-results/library-sync/01-course-review-row.png`
  and `02-material-comparison.png`.
- Focused web coverage: 24 tests pass. Notification and retained-preview unit
  coverage: 11 tests pass. The final notification/guard integration run has
  15 tests passing, including selected-material server rendering.
- API and web typechecks and e2e typecheck pass. Web lint: zero errors,
  existing warnings remain.
- Full API suite: 1,783 passed, 2 failed in existing Pyodide runner memory
  measurement checks (`runner memory could not be measured; refusing to grade`).
  An isolated rerun of that file also fails memory measurement. No grading
  safety check was weakened to make the environment pass.
- Disposable test databases and browser servers are cleaned up; Cove API port
  4000 is left free under AGENTS.md. The development migration and ignored local
  worker flag are recorded in the runbook; no production deployment.
