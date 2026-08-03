# Guided Diagnostic Result Panel Design

**Date:** 2026-08-03  
**Status:** Approved for implementation

## 1. Goal

Redesign the Version 2 submission result so it keeps the efficient resizable
bottom panel while gaining Version 1's stronger verdict hierarchy, readable
metrics, and per-test explanations. The result should answer, in order:

1. Did the submission pass?
2. What score did it earn?
3. Which case failed, and why?
4. What should the student check next?

The redesign must not reveal hidden test inputs, expected output, or actual
output.

## 2. Chosen Direction

Use the approved **Option B — Guided Diagnostic** inside the existing
Terminal/Result pane. Do not open a modal or right-side drawer. The output pane
remains vertically resizable and scrolls internally when its contents exceed
the selected height.

The Terminal/Result tabs and the sample/Run controls do not change.

## 3. Information Hierarchy

### 3.1 Verdict hero

The result starts with a compact hero:

- a large status icon in a tinted square;
- a short verdict eyebrow;
- a direct headline;
- one sentence explaining the most useful next step.

Tone is derived from the result:

| State | Tone | Headline purpose |
| --- | --- | --- |
| Grading | Neutral/brand | Confirm that judging is in progress |
| Accepted | Success | Celebrate completion without excess animation |
| Wrong output | Danger | Direct attention to output and formatting |
| Runtime error | Danger | Direct attention to code execution |
| Time limit | Warning | Direct attention to efficiency or termination |
| Memory limit | Warning | Direct attention to memory use |
| Judge failure | Warning | Explain that grading failed and did not count |

### 3.2 Metrics

The hero is followed by Score, Passed, and Runtime cards.

- **Score is dominant:** it is wider, has the largest numeral, and receives the
  verdict tint and stronger border.
- Passed and Runtime remain neutral supporting cards.
- Score reads `N / 100`; Passed reads `N / M`; Runtime reads `N ms`.
- Judge failures show no metrics because no result was earned.
- While grading, the metrics use quiet placeholders rather than invented
  values.

At narrow widths the three cards stack without horizontal scrolling.

### 3.3 Test results

Replace the compact judge tape with one row per case. Each row contains:

- a status icon;
- `Case N`;
- a short outcome description;
- an outcome label at the trailing edge.

Passed rows are compact. Skipped rows are muted and explain that judging stopped
after the first failure. The first failed visible sample is expanded by default
and shows Expected and Actual output in two monospaced blocks.

Hidden cases are deliberately non-expandable. They show only case position and
outcome. A note explains that hidden cases reveal results only.

## 4. State Behavior

### 4.1 Grading

Show a rotating loader in the hero, the grading headline, metric placeholders,
and case rows updating as streamed cells arrive. Motion respects reduced-motion
preferences.

### 4.2 Accepted

Use a success hero and a prominent `100 / 100` score. All completed case rows
show Passed. The guidance confirms that every case passed.

### 4.3 Not accepted

Derive the hero copy from the first meaningful failure:

- Wrong output: compare output content and formatting.
- Runtime error: inspect the failing line and runtime behavior.
- Time limit: check loops and algorithmic efficiency.
- Memory limit: reduce retained data or allocation.

When a visible sample failed, expand its diff automatically. When the first
failure is hidden, show no diagnostic values and use outcome-only guidance.

### 4.4 Judge failure

Use a warning hero, explain that the judge could not grade the submission, and
state that it did not count as an attempt. Do not show a score, metrics, or
misleading failed-case rows.

### 4.5 Empty and transport-error states

The empty state remains a quiet invitation to submit. Client/API errors use an
inline danger notice beneath a clear failure heading. They do not fabricate a
judge verdict.

## 5. Actions

Do not add Version 1's bottom action bar:

- The code editor is already directly above the result, so “Edit code” adds no
  navigation value.
- Hint remains in the workspace header.
- Run remains in the Terminal toolbar.

The result panel focuses on diagnosis rather than duplicating workspace
controls.

## 6. Components

Keep the result-specific logic isolated:

```text
result-panel.tsx          state orchestration and overall hierarchy
result-hero.tsx           verdict icon, headline, and guidance
result-metrics.tsx        dominant score plus passed/runtime cards
test-result-list.tsx      accessible per-case rows and visible-sample diff
_lib/scoring.ts           pure tone/failure derivation helpers
```

Small components may remain in `result-panel.tsx` if extraction would make them
harder to follow, but state derivation stays pure and testable.

## 7. Accessibility

- Status is conveyed by icon and text, never colour alone.
- Test results use an ordered list so case order is semantic.
- Every case names its outcome for assistive technology.
- Loading changes are announced politely and do not steal focus.
- Contrast meets the existing dark editor-pane quality floor.
- Reduced-motion users receive static loading indicators.

## 8. Responsive Behavior

- The panel remains usable at its minimum supported height by scrolling its
  content, not clipping it.
- Metric cards use a dominant-score grid on desktop and stack at narrow widths.
- Test-row labels wrap without pushing outcome text outside the panel.
- Expected/Actual blocks become one column when two columns would be too narrow.

## 9. Testing

### Unit

- Failure guidance and tone derive correctly for every outcome.
- The first failed visible sample is selected for the diff.
- A hidden failed case never produces diff content.
- Judge failure suppresses score metrics.

### End-to-end

- Accepted results show the dominant score, pass count, runtime, and passed
  rows.
- A visible wrong-output case expands Expected and Actual values.
- A hidden failure shows its outcome but no private values.
- Skipped cases explain why they did not run.
- Submitting switches to Result and grading transitions into the final state.
- The redesigned content remains usable after resizing the bottom panel in both
  directions.

## 10. Out of Scope

- Right-side result drawer or modal.
- Attempt number.
- Duplicate total-solving-time metric; the workspace header timer remains the
  source for that information.
- AI feedback.
- New submission actions or backend schema changes.
