# S-02 — Course card counts: "이론 15개 · 문제 95개"

> **Implemented on `qa-feedback` (2026-11-20), option A.** Theory = main/both PDFs + explanations. The student card's counts come from `courseSummaryFor` in [curriculum-outline.service.ts](../../../packages/api/src/learn/curriculum-outline.service.ts), not the staff SQL below; there `exercises` already counts only graded items (a video only when it is scored), matching `progress.total`, so videos were left there.

Registered 2026-10-27 · Sunny · P2

## Request

On My Courses (and a class's course list) the card reads **"문제 95개 · 15 PDF"**. QA wants **"이론 15개 · 문제 95개"**: call the reading material "theory", put it first, and count it in the same "N개" style.

## What is there now

[course-card.tsx:119-123](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/_components/course-card.tsx#L119-L123):

```
{t('catalog.problems', { count: counts.exercises })}                              문제 95개
{counts.documents ? ` · ${t('pdf.documents', …)}` : ''}                           · 15 PDF
{counts.explanations ? ` · ${t('materials.explanation')} ${counts.explanations}` : ''}   · 설명 자료 3
```

The counts come from one SQL statement per list, [course-counts.ts](../../../packages/api/src/content/course-counts.ts):

| Field | Material types |
| --- | --- |
| `exercises` | everything except `PDF_DOCUMENT` and `EXPLANATION`: coding, turtle, short answer, multiple choice, **and video** |
| `documents` | `PDF_DOCUMENT` (main and supplementary) |
| `explanations` | `EXPLANATION` |

## Decision needed: what is "이론"?

| Option | Card | Note |
| --- | --- | --- |
| **A (recommended)** `documents + explanations` | 이론 18개 · 문제 95개 | Both are reading material; Elice's "이론" lessons arrive as either. One number, as QA drew it. |
| B `documents` only | 이론 15개 · 문제 95개 · 설명 자료 3 | Literal reading of the screenshot; keeps a third part. |

Also worth deciding while here: a **video** lesson is counted as a "문제" today. Option A could count videos under 이론 too, which is closer to what a student expects. Recommended: yes, but only if the progress numbers (`progress.total`) agree. Check how `progress.total` is computed before moving videos, so the card never says "이론 20 · 문제 90" next to "95문제 중 …".

## Plan (option A)

1. New key `catalog.theory`: ko `"이론 {{count}}개"`, en `"{{count}} theory lessons"` / `_one` `"{{count}} theory lesson"`, plus the other locales the app ships.
2. In the card, build the line as `[theory, problems].filter(Boolean).join(' · ')`, with theory = `(counts.documents ?? 0) + (counts.explanations ?? 0)` and shown only when above 0. Keep `문제 0개` hidden when a course has only theory, so a reading-only course does not lead with zero.
3. Remove the `pdf.documents_*` keys if nothing else uses them (only the card does today).
4. Supplementary-only PDFs: `documents` counts them as well. If S-08 removes them from the reader, count only main/both PDFs (`placement` filter in the same statement), so the card does not promise theory the student cannot open from Next/Previous. One `FILTER` change, still one statement.

## Tests

- Card spec: problems only; theory only; both (order "이론 · 문제"); zero hidden.
- localhost as a student: My Courses and a class detail page, ko and en, 390px (the line must not wrap awkwardly next to the "완료" chip).

## Scope

Web and locales; API only if step 4 is taken (no new statement either way).
