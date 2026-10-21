# Elice assessment layout adaptation

Adapt Cove's assessment screens to the layout and interaction patterns inspected in the authenticated DLAB Elice course on 2026-10-21. Use Cove theme tokens and Lucide icons; retain Cove content, APIs, permissions, grading, immutable submissions, and private staff practice.

## Reference observations

- Written response: compact course/material toolbar; equal-width instruction and answer panels; question prefixed with `Q.`; textarea directly within the answer panel; Submit in a separate bottom-right action row.
- Multiple choice without instructions: one centered question panel, approximately 750 pixels wide, with full-width radio rows and a distinct selected background. The card keeps its Submit action at the bottom.
- Material navigation opens in a left drawer. Previous, lesson count, Next, and Fullscreen live in a fixed bottom toolbar.
- Tutoring uses a searchable learner drawer and a compact toolbar showing the selected learner, submission count, latest submission, and score.

Inspected written reference: `https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487946`. Quiz reference: `https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487949`. Reference inspection did not submit answers or change curriculum.

## Cove implementation

Use canvas `#F4F7FC`, white cards, ink `#16181D`, secondary text `#5A6270`, blue `#1B64DA`, green success `#15803D`, amber attention `#B45309`, and red leave/error `#DC2626`, through existing theme tokens. Keep Pretendard for interface text and tabular numerals for scores and counts. Dark mode uses existing token overrides.

Use modest eight-pixel panel corners, equal desktop columns, quieter borders, and no nested shadow cards. Written/short answers share a question heading, textarea, hint, and character count. Choice questions use radio/checkbox rows; do not invent extra correct-answer cues before submission. Results, feedback, and expandable history stay within the answer area so completing a quiz does not move it into a different column layout.

Use blue `Q.` markers and action icons, green completed results, amber incomplete results, and readable labels alongside status icons. A Radix modal drawer supplies focus trapping, Escape dismissal, focus restoration, and a visible close control for material and learner lists. Teacher and Manager review retain the side-by-side answer and grading form beneath their summary toolbar.

On phones, stack instruction and answer panels, allow the page to scroll, keep controls within the viewport, and use a drawer narrower than the screen. Preview shows a disabled Submit button with its existing explanatory notice. Staff practice continues to submit privately.

## Validation

Check real local student short answers and quizzes, preview, drawer keyboard behavior, visible submit/result/feedback states, immutable history, staff review and publication, responsive layouts, and dark mode. Run focused component/authoring tests, TypeScript, scoped lint, locale tests, and whitespace checks. Use the existing development demo academy; do not change production or the Elice reference course.
