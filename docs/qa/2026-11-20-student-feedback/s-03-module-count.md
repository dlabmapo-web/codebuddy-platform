# S-03 — Unlabelled "92" in the module header

> **Implemented on `qa-feedback` (2026-11-20).** Checked on localhost.

Registered 2026-10-27 · Sunny · P2

## Request

On the course page, each module's header shows a bare number ("92") beside the collapse arrow. Students cannot tell what it means. Remove it.

## What is there now

[module-section.tsx:80-82](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/courses/[courseId]/_components/module-section.tsx#L80-L82) prints `exerciseCount`, computed at [module-section.tsx:51-54](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/courses/[courseId]/_components/module-section.tsx#L51-L54): the number of problems in the module (for a WEB course, explanations, manual materials, videos and main PDFs instead). It has no label and is hidden below the `sm` breakpoint.

Each lecture row inside the module already shows "10문제 중 10문제 완료" with a bar, which is the number students do use.

## Plan

1. Delete the `<span>` and the `exerciseCount` computation (nothing else reads it).
2. Leave the module number tile, the title and the arrow as they are.

## Tests

- localhost as a student: a course with several modules, expanded and collapsed, desktop and 390px. No number beside the arrow.
- Any spec that asserts the count (search `module-section` specs) is updated.

## Scope

Web only, one component.
