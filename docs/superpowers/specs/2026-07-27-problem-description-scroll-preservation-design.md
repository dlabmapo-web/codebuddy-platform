# Problem Description Scroll Preservation

## Problem

On the problem-solving page, horizontally scrolling a wide code block inside the
problem description resets to the beginning after about one second. The page's
elapsed-time state updates every second, rerendering `ProblemSolveClient`. Its
`dangerouslySetInnerHTML` description subtree is recreated, so the browser loses
the nested `<pre>` element's `scrollLeft`.

## Design

Render the problem description through a small memoized React component. It
receives only the description HTML and keeps the existing `tiptap-render`
styling. React can then skip that subtree when unrelated state such as the timer
changes, preserving the existing DOM element and its horizontal scroll position.

The description should still rerender when its HTML value actually changes.
No manual scroll-state tracking, content wrapping changes, or broader page
refactor is included.

## Verification

- Open the affected problem and horizontally scroll its long code block.
- Wait through multiple one-second timer updates.
- Confirm the code block remains at the selected horizontal position.
- Confirm the problem description and its existing styles still render normally.
- Run the relevant lint/type checks.
