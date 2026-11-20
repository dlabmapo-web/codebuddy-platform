# S-05 — Short-answer hint shown twice

> **Implemented on `qa-feedback` (2026-11-20).** Checked on localhost with a hinted written response.

Registered 2026-11-03 · Jay · P1

## Request

On a short-answer question ("[퀴즈] 이 문자열의 실행 결과는?"), the hint "아래에 실행 결과를 정확히 작성한 후, 아래의 제출 버튼을 클릭하세요." appears twice: as a line above the answer box, and as the box's placeholder. Remove the line above the box (red box in the screenshot); keep the placeholder.

## What is there now

`WrittenAnswerCard`, [assessment-ui.tsx:38-52](../../../packages/web/src/components/manual/assessment-ui.tsx#L38-L52), its only caller is [manual-workspace.tsx:666](../../../packages/web/src/components/manual/manual-workspace.tsx#L666) with `hint={data.config.hint}`:

```
label   ✎ 답안을 작성해 주세요          (ui.write_answer, kept)
<p>     {hint}                           ← removed
textarea placeholder={hint || ui.answer_placeholder}   (kept)
```

The `<p>` also serves as the textarea's `aria-describedby`.

## Plan

1. Make the hint paragraph `sr-only` instead of deleting it. Sighted students see the hint once (placeholder); screen readers still announce it with the box, and keep it after the student starts typing, when the placeholder is gone.
2. No change to the "답안을 작성해 주세요" label or the character counter.

## Tests

- Spec for `WrittenAnswerCard`: with a hint, the hint text is in the placeholder and in an `sr-only` element referenced by `aria-describedby`; nothing visible above the box. Without a hint, the default placeholder and no description.
- localhost as a student: a short-answer material with a hint, ko and en, light and dark.

## Scope

Web only, one component.
