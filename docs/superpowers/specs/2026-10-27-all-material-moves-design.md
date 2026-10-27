# Moving every material type between lectures

Date: 2026-10-27. Status: proposed; waiting for review of the changed PDF-reference
boundary. User intent: move an item like a normal coding problem, between
lectures/modules of its current course, preserving content and student work.

## Confirmed cause

`CourseService.moveExercise` is the existing generic material move endpoint.
It already accepts PDF, Python, Turtle, written response, multiple choice and
video material rows. PDF+code is a Python material with a reference to a PDF
material, not a separate MaterialType. When changing lecture, the endpoint
counts PDF reference edges and rejects either endpoint with
`PDF_REFERENCE_IN_USE`. This is deliberate protection of the October 19 PDF
spec's same-lecture boundary. The PDF picker and validation also assume that
boundary; deleting the move check alone is insufficient.

The baseline local PostgreSQL move integration plus PDF validation/delivery unit
suites pass all 26 checks. No production content was moved during investigation.

## Proposed behavior

A move relocates only the selected material to the requested position in another
lecture of the same course, including a lecture in a different module. Moving a
lecture still carries its existing contents. Apply this consistently to all six
MaterialTypes and both practice-only/automatically graded PDF+code variants.

Preserve material IDs, attached asset/document IDs, PDF links, grading policy,
revision, cases, solutions, points, progress, drafts, submissions, teacher
feedback and monitoring identity. Do not clone files or materials, detach PDF
instructions, move linked exercises implicitly or trigger regrading.

Permit a PDF reference across lectures **inside the same course and academy**.
Thus moving a PDF+code exercise leaves its PDF reference intact; moving its PDF
leaves referencing exercises in place, still pointing at that document. Cross-
course/academy moves and references remain forbidden. Course enrollment remains
the learning scope, and a link never bypasses authorization to its document.

Alternatives considered: moving all linked items together would unexpectedly
relocate other exercises; copying PDFs would create new material identities and
shared-edit/undo behavior. Course-local references fit normal single-item moves
without either side effect.

## Implementation boundaries

1. Keep the existing move request, transaction/course lock, stale-origin checks,
   exact position rewrites, permission split (curriculum versus exercises),
   audit, contentRevision, hidden-destination warning, optimistic rollback and
   Undo. Remove the blanket reference-edge refusal only after reference
   validation/reading supports the new boundary. No database migration is needed.
2. Validate reference placement (`BOTH`/`SUPPLEMENTARY`), READY asset, Python
   non-quiz target, same academy and same course. Lecture identity no longer
   determines validity. Upload leases keep their original lecture-bound
   provenance; moving a material does not rewrite an uploaded asset's scope.
3. Authoring shows same-course PDF candidates with their lecture/module context.
   A moved exercise's selected PDF must remain visible in the picker and save
   unchanged. New uploads remain attached to the current authoring lecture;
   editing an existing PDF uses that PDF's actual lecture. Dependency lists in
   the picker and PDF row cover the whole course, not only siblings.
4. Student delivery freshly authorizes both the exercise and PDF, checks the
   actual link and same-course boundary, and retains existing enrollment,
   academy lifecycle, placement/asset and visibility checks. Reader metadata
   must not leak titles/files from hidden ancestor lectures/modules or corrupt
   cross-course references. Author preview keeps its existing review permission.
5. Hidden destinations retain normal move visibility behavior. Moving a PDF
   under a hidden parent makes that document unavailable to students, including
   through linked exercises; it must not gain visibility through a link. The
   existing unavailable-reference display applies, like explicitly hiding a
   referenced PDF today. Publishing a PDF-linked exercise must still require
   an effectively visible, ready PDF, including its current ancestors.
6. Extend ancestor-publication validation to the referenced PDF's actual
   ancestors, since they can now differ from the exercise's. Keep deletion and
   MAIN-only conversion protection for referenced PDFs. Subtree deletion must
   not silently detach an external surviving exercise; keep the foreign-key
   restriction and return a controlled dependency error for that case.
7. Whole-course library copy remaps references by ID as today. Partial copies
   continue to reject references outside the copied selection rather than
   silently losing PDF instructions. Workbook round-tripping keeps references
   read-only. No new cross-course copying behavior is part of this change.

## Verification

Use a fully migrated disposable local PostgreSQL database and synthetic records.
Reproduce PDF/PDF+code refusal before the fix and assert successful cross-module
moves after it, including both sides of shared PDF references. Cover each other
material type, first/middle/last/empty destination, same-parent reorder, stale
source, wrong course/academy, permission failures, rollback, dense positions and
Undo. Compare stable IDs, linked asset/reference IDs, exercise settings and
representative draft/submission/progress records before and after moves.

Test PDF delivery and learner metadata after either endpoint moves. Deny hidden
PDFs/ancestors, inaccessible enrollment, mismatched reference, wrong course,
wrong academy, MAIN placement and non-READY assets. Test ancestor publication,
external subtree dependencies and whole-course copy/reference remapping.

Run relevant API and frontend suites/typechecks and installed Next.js guidance
before frontend edits. Browser-verify a local PDF+code move and PDF move, read
and edit after moving, retained instructions, destination order and Undo.
No production material move, deployment or regrading is authorized by this spec.
