# Elice reference follow-up — 2026-09-30

Reference: [D.LAB Elice course](https://dlab.elice.io/courses/765886/lectures/all), inspected in the user's signed-in Chrome session. Scope follows the [QA slides](https://docs.google.com/presentation/d/1l6yB1eTXZVKzbeR1t-zpdnl_70coIEerFugwchjNfo0/edit), rather than copying every Elice feature.

## Findings and changes

- Slide 25: the course reference presents compact lecture entries. Cove's lecture contents already start collapsed after the previous QA commit; explicit lecture links and search results still expand.
- Slides 28–34: preserve the previously implemented separate outline toggle, vertical examples, bottom navigation, single output region and combined action row. Elice's exercise shell confirms separate navigation and edit controls.
- Slide 43: inspected CH04 problem 4, including its authoring screen. It uses a question, code/text description, four choices, one correct answer and optional explanation. The selected type is “Multiple Choice (Single Answer)”. The live learner body did not load before browser automation disconnected. No Elice answers were submitted or authoring changes saved. Cove quiz implementation and end-to-end feedback verification remain open; single versus multiple answer scope was asked, with the slide's single-answer example as the default.
- Slide 44: the existing `feat/elice-grading-compatibility` branch already implements the five Elice stdout comparators, weighted scores, grading snapshots, authoring controls and optional server sample checks. Integrate this branch instead of adding a second comparison engine. Its Python comparison semantics and versioned legacy compatibility are retained.

## Integration corrections

- Preserve current draft flush/collaboration retirement when moving between problems, together with cancellation of outgoing server sample checks.
- Keep the complete sample-result list. Stop cancels both the queue and the current server check. Server-check progress and failures remain visible below completed cards.
- Label pattern/contains expectations as rules, and distinguish unchecked samples and slow-pass warnings from wrong answers.
- Preserve teacher live weighted totals while continuing to withhold hidden-case input and output.
- Split grading authoring and sample-check translations into page-scoped namespaces. Keep the existing translation payload budgets.
- Keep the current interactive terminal EOF handling while adopting the isolated server runner. The new server runner supplies fd 0 directly; the replaced thread implementation is removed.

## Verification

- Shared suite: 843 passed.
- Web suite after the initial merge: 1,183 passed; focused integration checks follow the final corrections.
- Focused API grading/submission/content/sample checks: 191 passed, 11 skipped for external-service prerequisites.
- Runtime/comparator suite: 106 passed, one memory-limit failure under concurrent load. The failing memory test passed when rerun alone. This is not evidence that the intermittent behavior is fixed.
- Translation suite after namespace split: 120 passed.
- Development database identity checked against the documented development Supabase project before inspecting migrations: all 41 migrations already applied. No production database command was run.
- Final focused web integration checks: 66 passed. Additional teacher/configuration API checks: 37 passed.
- API and judge-worker typechecks passed. Web typecheck passed after the final namespace cleanup.
- Targeted ESLint: no errors; existing unused-import warnings remain in inherited authoring files. Translation catalog extraction: no stale keys or copy markers.

## Remaining verification

Chrome became unavailable to automation during the reference review. Reconnect it to verify the complete multiple-choice learner flow and the merged authoring/test controls in localhost. Slide 43 remains open. No new completion marker was added for slide 44 because the merged UI has not yet had a browser acceptance pass.

This source merge is not a deployment. Its grading/sandbox deployment configuration must receive the release checks documented by the grading feature before production rollout. Memory enforcement measures sampled resident growth; the intermittent macOS test remains a limitation. The prior branch's historical Elice parity evidence is not a newly executed comparison in this pass.

## Follow-up

The single-answer quiz and memory-accounting follow-up are recorded in [2026-09-30-remaining-slides.md](2026-09-30-remaining-slides.md). This supersedes the implementation gaps above; the listed browser acceptance checks remain open.
