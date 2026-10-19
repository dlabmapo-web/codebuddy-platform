# Multiple reference solutions: reference research

Date: 2026-10-19 (Asia/Seoul)
Branch inspected: `feat/ignore-python-input-prompts` at `bf9bab27`
Design: [multiple reference solutions](../superpowers/specs/2026-10-19-multiple-reference-solutions-design.md)

## Request and evidence boundaries

The feedback asks how to handle two correct implementations: add another answer
code, or put `# 방법 1`, `# 방법 2` comments in the existing code. The user asks
for research and a specification, not implementation. The user explicitly
confirmed that answer access must remain teacher-only. Authorized content authors
retain their existing private authoring access.

The supplied `photo_2026-10-19_16-12-48.jpg` shows a Korean **해설 보기** modal
for `[문제] 짝수의 개수`, with `답안1` and `답안2` headings, separate dark code
blocks, an individual Copy button for each, a scrollable body, and Close. The
first implementation counts even numbers with a loop. Only part of the second
implementation is visible; its complete algorithm cannot be inferred.

The screenshot establishes presentation, not a native Add Answer control,
Elice database schema, answer limits, or student access policy. It is reference
content, not an instruction to change permissions or grading.

## Live Elice inspection

Read-only inspection used the existing signed-in browser on 2026-10-19. No
content was typed, saved, submitted, uploaded, or copied to the clipboard.

- The [supplied teaching library](https://dlab.elice.io/my-courses/library/teach?tab=all)
  exposes `[마포] DM-PY-M2(파이썬 트랙)` to the current account.
- The [exact exercise pictured](https://dlab.elice.io/courses/283201/lectures/3236032/lecturepages/27608046)
  redirects to that course's information page, reports **Non-registered User**,
  and displays **You have no permission for the page**. Its authoring UI and
  full second answer could not be inspected.
- An [accessible print exercise](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487942)
  exposes **View Solution** separately from Run and Submit. Opening it shows a
  read-only code block with Copy and Close, without replacing the main editor.
- Its [editor](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487942/edit)
  has Description, Instructions, and **Solution** content sections, separately
  from Skeleton Code and Grader Code tabs. The Solution section exposes text
  formatting and language controls around the current code block. No native
  Add Answer collection control was observed on that surface.
- The browser was returned to the teaching library after inspection.

Inference: the screenshot's headings and multiple code blocks are compatible
with authored solution content. They do not establish that Elice has a native
multiple-answer database feature. Cove's structured collection is a product
recommendation based on this presentation and Cove's existing plain-code model.

## Official documentation

Elice's [Grading Script documentation](https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/script/)
places grading logic in `grader.*` files and distinguishes the run and submission
scripts. It supports separating human-readable reference explanations from
execution/grading configuration. It does not document the screenshot's multiple
answer authoring mechanism or authorize any change to Cove grading.

## Cove source findings

| Source | Current behavior and consequence |
| --- | --- |
| `packages/api/prisma/schema.prisma`, `ProgrammingExercise` | One nullable `solutionCode` text field; language is Python. A collection needs explicit migration and legacy handling. |
| `packages/shared/src/content/course.ts` | Non-quiz manual writes require nonblank code, maximum 100,000 characters. Quiz validation bypasses Python solution requirements. Author-only solution DTO is separate from general exercise DTOs. |
| Exercise `solution-code-editor.tsx`, `exercise-draft.ts`, `use-exercise-authoring.ts` | One editor, one draft string, completeness and dirty/save mapping. Collection changes must cover all of these. |
| Studio and both platform-admin exercise edit routes | Each separately fetches the privileged solution and passes `initialSolutionCode`. All three entry points must change together. |
| `packages/api/src/content/course.service.ts` | Dedicated author read uses `exercises.manage`. Solution edits are outside the grading-change comparison; preserve that property. |
| `packages/shared/src/monitoring/monitoring.ts` and API monitoring service | Live context has only `hasSolution`; lazy read returns code after class/student/material/active-visit checks and records metadata-only audit. |
| Teacher `answer-code-modal.tsx` | One lazy-loaded read-only Monaco editor with Copy/Close; request generation guards discard stale responses. |
| `packages/shared/src/content/import/` | Workbook v2 uses `Problems.solution_code`, planner comparisons, private staged plans and masked presentation. A collection must round-trip without flattening or dropping alternatives. |
| `packages/api/src/content/import/content-import.service.ts` | Import projection and transaction persist the scalar. A new collection must participate in preview ownership, revision checks and atomic commit. |
| `packages/api/src/content/library/academy-library.service.ts` | Adoption copies the scalar explicitly. Collection cloning must generate destination ownership. |
| [Existing answer modal design](../superpowers/specs/2026-08-31-teacher-answer-code-modal-design.md) | Explicitly excludes multiple alternatives; the new design supersedes that exclusion, while preserving disclosure and grading boundaries. Its historical role statements are not a substitute for current permission checks. |

No Next.js code was written or changed during this research. No application
behavior or test execution is claimed by this documentation-only task.

## Design work record

- [x] Inspect current branch, existing design, schema, authoring, monitoring,
  imports, adoption, and relevant tests.
- [x] Inspect supplied screenshot and accessible live Elice solution surfaces.
- [x] Verify the grading distinction against official documentation.
- [x] Ask the access-scope question: user chose existing teacher-only behavior.
- [x] Compare structured alternatives, comments-only, and rich explanation.
- [x] Write and self-review the explicitly requested draft specification.
- [ ] User reviews the written draft before implementation planning.

The supplied screenshot already establishes the requested visual direction;
no separate visual companion or mockup is needed for this text specification.
