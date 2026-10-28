# All-material moves implementation

Approved source: [design](../specs/2026-10-27-all-material-moves-design.md), user
approved on 2026-10-27. Local implementation and verification; no production
content mutation, deployment or regrading.

1. Reproduce the PDF-link move refusal in the disposable migrated PostgreSQL
   fixture. Add parameterized same-course move coverage for all material types,
   shared PDF endpoints, stable history/IDs, ordering and reverse moves.
2. Change reference validation to same course/academy; remove only the blanket
   move refusal. Retain permissions, course lock, stale checks, ordering/audits,
   visibility and monitoring behavior.
3. Make PDF learner metadata and signed delivery validate current source
   ancestors and the same-course edge. Extend ancestor publication checks and
   controlled subtree dependency handling; cover denied reads and rollback.
4. Update the authoring picker to show same-course PDFs with origin context,
   edit PDFs at their real parent, and list all referring exercises in the
   course. Keep upload scope local. Update English/Korean text and regression
   tests; preserve move/Undo and optimistic state behavior.
5. Run focused unit/integration suites, API/web typechecks and relevant builds.
   Browser-verify synthetic local moves, retained instructions, PDF editing and
   Undo when a representative fixture is available. Review and record actual
   checks/limitations; commit the implementation separately from design.

User clarified both existing interaction paths and preservation of the existing
UI. Parameterized tests verify every type's grip/menu entry points, both builder
move methods and Undo. Local browser checks used the actual DnD provider/grip,
row menu, move modal and PDF reader against real services/PostgreSQL in a
separate temporary harness. That harness is removed and is not a replacement
for the deployed course builder. Unnecessary move-dialog copy changes reverted.

Completed locally: 168 API checks (including 24 real PostgreSQL move checks), 88
frontend checks and 140 localization checks. API/web typechecks, API compilation
and targeted frontend lint passed. Both actual browser interaction methods
passed in the temporary local harness; existing product UI preserved and
harness removed. See [verification](../../research/2026-10-27-all-material-moves-verification.md)
for scope, skipped checks and remaining full-authenticated-app verification.
