# Production Library verification — 2026-10-13

Release: `v2.0.34`, commit `c1aea604b2d61b926974e2864722e4a80354a49b`.
Workflow: https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/38362870846
Target: https://cs.coveedu.com/

## Deployment

- GitHub release finished successfully after Production approval.
- Server Studio, API, Home, judge and enabled learning workers run the new commit; health-checked containers are healthy.
- Migration runner reported 56 migrations and no pending migrations to apply.
- Deployment reported successful service health checks and production smoke tests.
- Public API readiness returned `status: ok` and `database: reachable`.

## Browser checks

All five user-provided accounts signed in successfully. Passwords are intentionally omitted.

| Account | Result |
| --- | --- |
| `cove-admin` | Library picker displays academy courses; searching narrows 30 courses to the one QA course; Dlab-Mapo filter works. Ascending title sorting loads the expected first-page order, and Next loads different records on page 2 of 3. Library picker and Academy courses row action both create independent drafts and open their builders. |
| `mapo-manager` | Academy Library shows the three published courses; new QA drafts are absent. Platform Library administration returns the inaccessible-page screen. |
| `mapo-teamleader1` | Academy Library shows the three published courses; new QA drafts are absent. Platform Library administration returns the inaccessible-page screen. |
| `mapo-teacher1` | Platform Library administration is blocked. Direct academy Library navigation displays the curriculum-permission error; the account is a teacher without curriculum editing permission. |
| `john10` | Student course list loads without either Library QA draft. Direct access to the copied Library draft is blocked. |

English and Korean Library list, copy preview, builder and authoring labels were observed. The Korean programming authoring page renders grading, test-case and rich-editor translations rather than the raw `exercise.*` keys from the reported screenshot.

The source was the existing synthetic course `[QA 2026-10-12] Five learning features`, revision 10. Both copies contain one module, one lecture and five materials: PDF, turtle, written response/short answer, multiple choice and video. The PDF renderer loads its two-page asset. The video preview loads the nine-second asset and English caption track. The copied short-answer editor contains the original question and expected answer; the copied choice editor contains its question, options and correct-option selection.

No course was published, no class was assigned, and no learner submission or saved code was changed during these checks. The existing source course remains hidden. No production speed benchmark or full six-type cloning regression was run; that coverage was performed locally before release.

## QA drafts left for inspection

- `[QA v2.0.34] Academy copy verification — 2026-10-13`: `981a67ac-402b-49b8-b592-17aa8d8aa73d`.
- `[QA 2026-10-12] Five learning features`: `2a2e3f15-cc6c-40cc-a3bd-10b768987baa` (second entry-point check).

Both are independent, unpublished Library drafts, with no academy adoptions. These were intentionally separate copy operations; this check does not test retry idempotency.

## Open findings

1. **Manual activity preview link is broken on the Library surface.** Open a copied written-response or multiple-choice material, then choose Activity preview. The author dialog uses an empty academy slug and generates `/academy//learn/turtle/<id>?preview=true` or `/academy//learn/quizzes/<id>?preview=true`. The browser normalizes the URL and shows Page not found. Confirmed by following the written-response link. Source: `packages/web/src/components/manual/manual-author-dialog.tsx`, preview link using `useContentAcademySlug()` and `routes.academyLearnAssessment()`.
2. **Some material badges are still English in Korean mode.** The Library builder shows `Turtle`, `Written response`, and `Multiple choice`, while surrounding labels are Korean. Source: `lecture-row.tsx` in the shared course builder hardcodes these three labels. The copy preview itself correctly shows Korean type names.
3. **Copied choice/short-answer grading definitions remain locked in an unpublished Library draft.** The choice editor disables selection mode, options, correct-option radios and shuffle; the short-answer editor disables grading mode and expected answer. Both display the already-published/submitted definition warning. Observed on the first QA draft. The manual read service computes `definitionLocked` from the material's `isVisible` flag or submission count. Investigate whether this policy should exempt unpublished Library drafts before changing it; title and other settings remain editable.

These findings are present in the deployed release. This verification task does not include a second production deployment.
