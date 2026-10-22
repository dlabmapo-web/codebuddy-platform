# Public Turtle code entry refinement

The requested reference uses six separate code boxes and a prominent entry
button. Keep Cove's logo, campus name, language control, and desktop drawing
preview, while making the admission form easier for new students to use.

## Interaction and appearance

- Render six boxes using one labelled native password input. Keep normal
  keyboard editing, selection, Enter submission, and mobile numeric keyboards.
- Preserve leading zeroes. Accept a pasted code containing spaces or separators.
  Limit the result to six ASCII digits.
- Mask the code initially and provide an explicit show/hide button. Keep the
  entered code in component state only.
- Use Cove's Button component for entry, code visibility, and retry actions.
  Enable entry only when six digits and the admission challenge are ready.
  Preserve the server's attempt limits and show a pending indicator.
- Put wrong-code feedback next to the form and clear it when the student edits
  the code. Explain that students should ask their teacher for the code.
- Use blue focus and active states, readable disabled controls, larger touch
  targets, and a single centered form on phones and tablets. Respect reduced
  motion. Supply matching Korean and English text.

## Verification

Four Chromium/WebKit browser checks pass for paste, leading zeroes, visibility,
editing, incorrect-code feedback, correction, Enter admission, and Korean layouts
at 320, 768, and 1440 pixels. Desktop and mobile screenshots were inspected.
Web TypeScript and targeted ESLint pass. Eleven existing manager, guest boundary,
and draft tests pass; all 138 locale tests pass.
