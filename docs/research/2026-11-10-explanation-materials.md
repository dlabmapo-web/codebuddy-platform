# Explanation-only lecture materials

Date: 2026-11-10
Branch inspected: `feat/cove-studio-v2` at `689e5617`.
Status: design approved by the user; [feature specification](../superpowers/specs/2026-11-10-explanation-materials-design.md) written on `feat/explanation-materials`; [implementation verification](2026-11-10-explanation-materials-verification.md) records the completed feature and local evidence.

## Request

Add a lecture material for explaining a topic with editable rich text and images. Reuse the familiar content editor from coding-exercise authoring. Do not require test cases, solutions, code, input/output formats, language, difficulty, or runtime settings. Students should read the explanation without a code editor or terminal.

## Elice evidence

Elice's official [Add Teaching Materials guide](https://elice.io/help/en/docs/elicelxp/for-admin/lecture/material) explicitly lists **Markdown text** separately from PDFs, programming exercises, videos, notebooks, and quizzes. Its documented workflow is lecture → Add Materials → choose type → enter title/content → configure material → save. It also documents supplementary placement and exclusion from grades.

The authenticated DLAB teaching library was accessible through Chrome, and the JavaScript course's lecture list was inspected. Further native browser automation lost its connection before the material authoring form and learner page could be verified. Therefore this research does **not** claim to have verified the live type label, exact editor controls, or completion rules in DLAB. The official guide confirms the separate text-material concept.

## Existing Cove building blocks

- `packages/shared/src/content/course.ts` and the Prisma `MaterialType` enum currently have programming, PDF, Turtle, written response, multiple choice, and video types; no standalone explanation type.
- The material picker is driven by `MaterialCreationKind` and `availableMaterialKinds` in the course builder's `_lib/material-creation.ts`.
- `packages/web/src/components/editor/RichEditor.tsx` already provides rich text, tables, links, code blocks, image upload/paste/drop, and image resizing through an authorized upload callback.
- `packages/api/src/manual/manual-assets.service.ts` already validates PNG, JPEG, GIF, WebP, AVIF, BMP, and static SVG. It rejects unsupported HEIC with an export instruction. The current upload cap is 5 MiB; the web image preparation helper can shrink oversized still images while preserving GIF/SVG originals when they fit.
- `packages/web/src/components/studio/rich-text-frame.tsx` renders authored content in a script-disabled frame and resolves private image references. Its current resolver performs a read per distinct image; a new explanation read path must batch image authorization/resolution to satisfy the repository's statement-count rule.
- `packages/api/src/learn/curriculum-read.ts` reads curriculum outlines in one statement without loading full rich-text bodies. Preserve that property.

## Approaches

1. **Separate Explanation type (recommended).** Reuse the editor and private image infrastructure, with focused content storage/API and a reading page. This keeps authoring validation and student behavior appropriate to reading material.
2. **A mode on programming exercises.** Less initial UI work, but introduces exceptions to solution/test validation, coding routes, runtime loading, and reporting. Hiding fields alone would not remove those dependencies.
3. **Use PDF documents.** Existing delivery works, but authors cannot edit mixed text and images directly, so it does not meet the request.

## Approved design summary

Add **Explanation** to the lecture's Add Material picker. Authoring offers a title, the existing rich-text editor, image controls, preview, and visibility. Only title and meaningful explanation content are required; image-only explanations are valid. New materials begin hidden. Empty content and failed image uploads produce clear validation messages while retaining the draft.

Students open a dedicated reading page with the material title, formatted content and images, the material list, and Previous/Next navigation. No coding runtime, code editor, terminal, Run/Test/Submit actions, grading settings, or assessment payloads apply. The initial scope excludes scoring and automatic completion credit; a page visit alone must not create a graded submission or imply the student understood the content.

Use a distinct material type and focused explanation record rather than a dummy programming or manual assessment record. Reuse parent material ownership, ordering, visibility, move/delete/copy, and authorization conventions. Integrate the new type with mixed navigation, content counts, library copying, and teacher observation where those systems enumerate material types. Explanations count as learning content, not coding exercises or missing-test problems. Keep existing exercise behavior unchanged.

Support the currently validated image formats above, including GIF animation and static SVG, with the existing size rules and translated upload errors. Reuse private immutable assets and sanitized rich-text rendering. This proposal does not include arbitrary executable embeds, arbitrary file attachments, audio/video authoring, or a new editor system.

Read the main explanation and authorized image metadata during server rendering. Resolve image IDs in a batch after access is established; do not issue SQL inside an image loop. Keep outlines body-free, reuse the curriculum/access readers, start independent reads together, and avoid new polling.

Validation should cover create/edit/reopen with formatted text and supported images, hidden/published access and cross-academy image denial, student navigation between explanation and other material types, copy/move behavior, and the absence of coding fields/runtimes/submissions. Count statements with one versus many explanation materials and one versus many images against disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`. Record measured counts after implementation; no statement count has been measured in this research-only change.
