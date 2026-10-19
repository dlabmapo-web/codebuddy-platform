# PDF theory and coding practice implementation

Approved by the user on 2026-10-19. Work on `feat/ignore-python-input-prompts`.
Design: ../specs/2026-10-19-pdf-theory-and-coding-practice-design.md.

1. Add the optional exercise-to-PDF relation, safe shared contracts, and transactional validation. Preserve omitted links and all grading semantics.
2. Enforce reference integrity on publication, placement, moves, deletion, imports and course adoption.
3. Add reference selection and explicit PDF-practice creation to the shared academy/library editors.
4. Embed the existing PDF reader in the student and teacher workspace without remounting code/runner state; preserve text statement access and suppress invalid PDF pointer geometry.
5. Add targeted integration coverage and run local browser E2E for authoring, reading, interaction, authorization, mobile and unchanged grading.
6. Run required static/build checks, record results and remaining limitations.

The writing-plans skill is not installed in this session; this repository plan records the implementation sequence directly. No production changes are included.

## Completion

All six implementation stages are complete. Seven local standalone production
browser tests passed across Chromium/WebKit; the database integration, unit,
typecheck, lint, route, translation and production build checks passed.
[Verification details](../../research/2026-10-19-pdf-practice-local-verification.md)
include the original input-prompt browser fixture's separate localhost-database
requirement. No production write, push or deployment was performed.
