# All material moves: implementation and local verification

Date: 2026-10-27 (Asia/Seoul). Implemented against the
[approved design](../superpowers/specs/2026-10-27-all-material-moves-design.md).
User confirmed normal single-item moves, both existing interaction methods, and
preservation of the deployed course-builder appearance.

## Result and preserved UI

PDF and PDF+code can move between lectures/modules inside their current course,
using either the dotted drag handle or three dots → Move to. The selected item
keeps its ID and PDF link; other linked exercises stay where they are. The
existing endpoint also handles Python, Turtle, written response, multiple
choice and video. Student drafts, submission records and progress remain attached
to the same material; no regrading, file copying or implicit group move occurs.

**The existing course-builder layout is preserved.** No CSS, row layout,
production drag-and-drop component, three-dot menu or move-dialog change ships.
Unnecessary generic move-dialog wording/count changes were reverted at the
user's request. A different-looking page seen during testing was an isolated,
temporary harness; it was not a product redesign and has been removed.

The reference picker keeps its existing component/layout. Its data now covers
PDFs in the current course, so a moved exercise still recognizes its reference;
options identify their source lecture/module. PDF dependency lists include the
whole course, and upload/edit targets retain their correct lecture provenance.

The root cause was an intentional same-lecture PDF restriction in the old move
transaction. A PDF or PDF-linked exercise changing parent returned
`PDF_REFERENCE_IN_USE`. Two new database tests reproduced that refusal before
the fix; merely deleting the refusal would have left authoring and visibility
assumptions broken.

## Boundaries and security

- References now allow different lectures in the **same course and academy**.
  Cross-course/academy material moves and references remain refused.
- Existing permissions, course locks, stale-source checks, dense ordering,
  audits, content revision, optimistic rollback and Undo remain in effect.
- Signed delivery reauthorizes the exercise and document, checks the actual
  link and same course, and retains active enrollment/academy lifecycle,
  placement, READY asset and visibility checks. Metadata and publication checks
  account for the PDF's actual ancestors, which may now differ from the exercise.
- Hidden source documents/ancestors do not become readable through a link.
  Moving a PDF under a hidden parent has the existing unavailable-reference
  behavior, rather than silently publishing it or detaching its exercises.
- Deleting a lecture/module containing a PDF used by a surviving exercise
  returns a controlled dependency error. Internal deleted links can still be
  detached under the transaction lock. Whole-course copy keeps remapping links;
  partial copies still reject missing dependencies.
- No database migration, new application route, production content mutation,
  production resource change, deployment or regrading was performed.

## Verification performed

| Check | Result |
| --- | --- |
| API content/PDF/learner/monitoring/library suites | **168 passed**, five external opt-in checks skipped across nine files. |
| Real PostgreSQL move integration (included above) | **24 passed** on a disposable PostgreSQL 17 container with every real migration applied. |
| Frontend PDF, outline, row, move modal and builder-hook suites | **88 passed** across 12 files. |
| Localization suites | **140 passed** across four files; shared/i18n builds passed. |
| API and web TypeScript | Passed. |
| API Nest production compilation | Passed. |
| Targeted ESLint on changed production frontend files | Passed. |
| Whitespace and code review | `git diff --check` passed; no outstanding finding blocks this patch. |

Database checks include moving every MaterialType, both sides of shared PDF
references, wrong course/academy, stale sources, empty/ordered destinations,
reverse moves and blocked external subtree deletion. The PDF+code history test
compares the full draft, progress and submission records, plus exercise settings
and reference IDs, before/after moving and reversing. No scores are recalculated.

Frontend parameterized checks cover seven material variants (the six types plus
PDF+code): each real row registers dragging and opens its menu move action; both
`move` and `moveFromDrag` call the same endpoint with the correct source/destination,
then reverse through the real builder hook's Undo. Existing access gating remains.

Chrome additionally exercised the actual DnD provider/grip, RowMenu,
MoveAnywhereModal, picker and PDF renderer in an isolated harness backed by real
services/PostgreSQL: PDF+code drag across modules, PDF+code menu move back, shared
PDF drag alone, shared PDF menu move back and reverse moves. The PDF rendered
after either endpoint moved; the other exercise stayed in its original lecture.
[Harness evidence and its explicit scope](assets/2026-10-27-all-material-moves/README.md).
This does not claim a full signed-in Next/Supabase or production-storage browser
test. PDF editing at its new location was not completed as a browser check;
relevant authoring/picker unit and type checks passed.

The disposable database, temporary browser server, temporary source/page and
ports 3127/4127 were removed/stopped. Existing user development databases and
services were left running. Test screenshots contain synthetic content only;
no credentials, student records, tokens or production source were saved.

## Reproduce the focused checks

Set `COVE_INTEGRATION_DATABASE_URL` to a separate fully migrated fixture database,
then run from the repository root:

```sh
pnpm --filter @cove/api exec vitest run src/content/course-move.integration.spec.ts src/content/course.service.spec.ts src/documents src/learn/learn.service.spec.ts src/monitoring/monitoring.service.spec.ts src/content/library/academy-library.service.spec.ts
pnpm --filter @cove/web exec vitest run src/components/pdf 'src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_lib' 'src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/lecture-row.spec.tsx' 'src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/move-anywhere-modal.spec.tsx' 'src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_hooks/use-course-builder.spec.tsx'
pnpm --filter @cove/i18n test
```

The five skipped opt-in PDF checks target a separate external development
fixture and were deliberately not redirected to an existing/shared database.
This change has not been pushed or deployed; verification applies to this local
branch, not the currently deployed website.
