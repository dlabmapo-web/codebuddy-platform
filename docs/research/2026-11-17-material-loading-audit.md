# Material loading and reference PDF audit

Date: 2026-11-17 (Asia/Seoul)
Branch reviewed: `feat/web-courses` at `b74da53e`.
Production runtime inspected: API and Studio images at `cf1db2f35cf8f04f59cc06a87acd186d3def4ee2`.
Status: investigation complete; no application fix or deployment performed.

Related design: [Material loading reliability](../superpowers/specs/2026-11-17-material-loading-reliability-design.md).

## Confirmed incident

The reported Mapo programming activity opens an academy-unavailable page:

- Course: `3faba0bb-9657-4c24-a356-f428e019554e`.
- Material: `b9e9ebab-e67f-4c57-8f59-2364288cce45`, `[실습] 시간복잡도와 공간복잡도`.
- Delivery class: `f4e68195-0760-4b7b-9102-929a196bc238`.
- The test student's account, OS identity, academy membership and class enrollment are active. The class delivers this course.
- The course, module, lecture and material are visible. The material has a programming record, Python language and `PRACTICE_ONLY` submission policy.
- This course has 35 visible programming activities, seven of which link a reference PDF. Seven is a population at risk, not seven individually executed failures.

Read-only execution of the deployed `LearnService` using the existing student's resolved identity and normal access policy produced:

1. `getMaterialType`: success, `PROGRAMMING_EXERCISE`.
2. `getCourseOutline`: success for the selected class.
3. `getExerciseBootstrap`: service returns a result.
4. `learnExerciseBootstrapSchema.safeParse(result)`: fails only at `workspace.exercise.referencePdf.title` (expected string, received undefined).
5. Adding the real PDF title to a copy of the result **in process memory only** makes the same schema pass.

No production data or deployed code was changed by this diagnostic. It bypassed neither the academy access policy nor class/course visibility checks. It did not exercise the browser's complete HTTP/session flow, create a session, submit an answer, mark a material viewed, or run code.

## Root cause

`packages/api/src/learn/submission-admission-read.ts` constructs the reference document's nested `material` JSON with `id`, `isVisible` and ancestor visibility/course fields, but omits `title`.

`referencePdfMetadata` in `packages/api/src/documents/pdf-reference.ts` consumes `pdf.material.title`. Its declared input requires that field, but the raw SQL reader's asserted object type does not prove the selected JSON contains it.

The result violates the existing oRPC output schema. In `learn/exercises/[materialId]/page.tsx`, the bootstrap rejection becomes `null`, then `notFound()`. The academy-level not-found page describes an academy/membership problem, hiding this response-construction error.

The SQL reader and catch-all behavior remain present on the current branch. This is a Cove reader/response error; it does not establish an OS login or account-synchronization defect.

## Other material checks

Checked the current branch's entry routes, shared DTOs, service readers and client failure handling. Also executed a fixed, small set of authorized deployed-service reads for visible materials assigned to the existing test student. Every database transaction was explicitly `READ ONLY`; service lifecycle hooks, workers, view mutations, execution and submissions were not started.

| Family | Read-only deployed check | Current-branch source findings |
| --- | --- | --- |
| Programming without reference PDF | One sample: complete bootstrap output schema passes. | Uses the shared admission reader; absent reference returns `null`. |
| Programming with reference PDF | Reported material plus another sample reproduce the missing PDF-title field. | Same missing JSON selection. Affects learner workspace reads and staff-practice/preview paths using that reader. Historical-attempt opening shares the bootstrap and needs regression coverage. |
| Standalone PDF | One sample: read succeeds, `pdfMetadataSchema` passes, title/breadcrumbs/delivery URL present. No private delivery URL was printed or saved. | `PdfDocumentService.read` includes the PDF material's actual title; it does not use the broken nested projection. Client failure UI has no retry control and does not distinguish temporary failures. |
| Turtle | One sample: workspace loads, manual configuration parses, required envelope fields and selected class present. | Shares `ManualService.workspace` with other manual types. No identical PDF-title projection. Client treats any failed initial load as unavailable. |
| Written response | One sample: same manual configuration/envelope checks pass. | Same manual route and generic failure presentation. |
| Short answer | One sample: same manual configuration/envelope checks pass. | Represented as written-response material with a short-answer configuration; no separate top-level material enum. |
| Multiple-choice quiz | One sample: same manual configuration/envelope checks pass. | Same manual route; private definitions are handled through the existing public/redacted configuration path. |
| Explanation/text | One sample: read and outline schema pass; title, body and breadcrumbs present. | SQL document reader explicitly selects the title. Client already offers retry, but its adapters lose HTTP status/code distinctions. Current Web-course side-body changes are source/unit-test evidence, not a production browser verification. |
| Video | No visible video material in this Mapo inventory; no live sample executed. | `VideoService.read`, `videoConfigSchema` and `videoAssetSummary` supply their expected fields. Existing retry policy bounds transient read retries; source and unit tests only, not proof of live playback. |

The manual, PDF, video and explanation complete read envelopes are TypeScript types rather than complete shared runtime output schemas. Their successful sample checks validate existing runtime sub-schemas and required envelope fields, **not full-schema parity or every possible saved record**.

Monitoring's programming reader includes the reference material through Prisma with its title, so this exact SQL omission was not found there. Authorization and response behavior still need implementation-time staff regression checks. No live teacher session was started in this audit.

## Related error-handling gaps

- Exercise bootstrap failures are all converted to `null`; material-type failures are all converted to `notFound()`.
- The learner course-outline page also catches every failure as not-found.
- Manual SSR preload failures return `null`, causing a client retry. Its final failure message calls the material unavailable even for an internal/transport failure and has no explicit retry button.
- PDF failures similarly show unavailable without an explicit retry action. Video and explanation have retry controls, but do not consistently distinguish a real content denial from a load failure.
- REST adapters vary: PDF/explanation throw a plain error and discard HTTP status; manual/video preserve status but generally not a typed application error code.
- `isExplicitAccessDeniedError` deliberately avoids treating an untyped proxy 404 as authorization evidence, but its code list does not currently include `EXERCISE_NOT_AVAILABLE` or `PDF_NOT_AVAILABLE`. Reusing it unchanged would misclassify expected material denials.
- Saved-student-work and live-monitor route catches also mask unexpected failures as not-found. These are adjacent source findings, not reproduced production incidents; do not describe them as having the missing-title defect.

## Validation run on the current branch

API command:

```sh
pnpm --filter @cove/api exec vitest run \
  src/learn/learn.service.spec.ts \
  src/documents/pdf-document.service.spec.ts \
  src/manual/manual.service.spec.ts \
  src/manual/short-answer.service.spec.ts \
  src/manual/multiple-choice.service.spec.ts \
  src/videos/video.service.spec.ts \
  src/explanations/explanation-html.spec.ts
```

Result: **7 files, 105 tests passed**.

Web command:

```sh
pnpm --filter @cove/web exec vitest run \
  src/lib/api-errors.spec.ts \
  src/components/video/video-read-recovery.spec.ts
```

Result: **2 files, 20 tests passed**.

These are existing mocked/unit checks. They pass while the real joined SQL projection remains defective, demonstrating why the fix needs a disposable-PostgreSQL reader-to-output-contract regression. No database integration suites were run on shared Supabase. In particular, the older `pdf-reference.integration.spec.ts` targets a shared development database and must not be used for this work without replacing its fixture/environment guard.

## Limits and next work

- This is not a complete Chromium/WebKit material-navigation audit. Browser control was interrupted and the fresh tab rendered blank during the original incident investigation; the precise failure was established by deployed-service reads/output validation instead.
- No new SQL statement budget was measured or claimed. The design requires measuring changed readers against disposable local PostgreSQL during implementation.
- No PINs, tokens, guardian contacts, solutions, student answers, private image data or signed URLs are included in this document.
- No application code, account, role, course assignment, content, schema or production configuration was modified. No development server was started for this audit.
