# Student Sample Input Copy and Runner Design

**Date:** 2026-07-28

**Status:** Approved interaction, pending implementation plan

**Scope:** Student problem-solving workspace only

## 1. Summary

Cove Studio will let students reuse visible sample inputs without typing every
line into the interactive terminal.

Each visible sample-input block will have a small **Copy Input** action. The
terminal header will show one **Run Sample** button for each visible sample,
up to five buttons. Clicking a sample button will execute the current editor
code locally and automatically provide that sample's complete multiline input
to the program.

The existing workflows remain separate:

- **Run** continues to start an interactive local run where the student enters
  input manually.
- **Run Sample N** runs one selected visible sample locally and does not create
  a score or submission.
- **Submit** continues to run all sample and hidden grading cases through
  Judge0 and creates the official score.

## 2. Problem

The current local runner requests input one line at a time. This is reasonable
for short inputs, but it is inefficient for matrices, grids, graphs, and other
problems with many input lines. A student testing a 4-row by 5-column matrix
must repeatedly switch to the terminal and enter every row.

The friction has three effects:

1. Students spend time reproducing data rather than debugging code.
2. Manual typing creates accidental input errors.
3. Students are discouraged from testing more than one sample.

## 3. Product References

The design uses concepts observed in:

- [Elice LXP](https://dlab.elice.io/courses/765886/lectures/all), where coding
  exercises use input/output cases for execution and grading.
- [42.uz](https://42.uz/course/express-algoritm/royxatni-aylantirish/masala),
  which separates Preview, Tests, and Results and provides an action to copy a
  visible input into test execution.

Cove Studio will not copy either interface. It will adapt the useful behavior
to the existing split problem/editor/terminal workspace.

## 4. Goals

- Copy a complete visible sample input, including line breaks, with one action.
- Run one visible sample without manual terminal input.
- Keep manual interactive execution available.
- Show the selected sample's actual output and match result in the terminal.
- Support up to five visible sample-run buttons without crowding the terminal.
- Preserve the security boundary between visible samples and hidden cases.
- Avoid any database or grading-schema change.

## 5. Non-goals

- Running all samples with one button.
- Allowing students to view or locally run hidden cases.
- Creating editable, persistent student-authored testcase collections.
- Replacing official Judge0 grading with browser execution.
- Assigning scores to local sample runs.
- Changing testcase weights or official scoring.
- Supporting languages other than the current local Python runner.

## 6. Terminology

- **Sample case:** A testcase with `is_sample = true`. Its input and expected
  output are visible to the student.
- **Hidden case:** A testcase with `is_hidden = true`. Its input and expected
  output must never be sent to or displayed by the student UI.
- **Manual run:** The existing interactive browser execution started by
  **Run**.
- **Sample run:** Browser execution started by a **Run Sample N** button using
  the selected sample's stored input.
- **Official submission:** Server-authoritative grading started by **Submit**.

## 7. User Experience

### 7.1 Sample input action

Every non-empty sample-input block displays a small copy button in its
top-right area.

Accessible label:

```text
Copy sample input 1
```

When activated:

1. The complete stored sample input is written to the clipboard.
2. All internal line breaks and blank lines are preserved.
3. A non-blocking confirmation appears:

```text
Sample input 1 copied
```

The button is not rendered for an output-only sample whose input is empty.

### 7.2 Terminal sample controls

The terminal header displays buttons for visible sample cases:

```text
Terminal  [▶ Sample 1] [▶ Sample 2] ... [▶ Sample 5]
```

Rules:

- Buttons follow the same order as the sample cases in the problem statement.
- Only visible sample cases receive buttons.
- At most five sample buttons are rendered.
- Hidden cases never receive buttons, labels, or placeholder positions.
- The controls wrap or scroll horizontally on narrow screens without reducing
  the editor or terminal to an unusable width.

This design limits the sample-run surface to five visible samples. It does not
change the number of hidden cases the official judge may use.

### 7.3 Running a selected sample

When the student clicks **Sample N**:

1. The terminal opens if it is closed.
2. The current editor code is used without saving or submitting.
3. The local Python runtime starts or reuses its existing loaded runtime.
4. The selected sample input is converted into an ordered input-line queue.
5. Each Python `input()` request receives the next queued line automatically.
6. Supplied lines are echoed in the terminal as sample input.
7. Program output and errors use the existing terminal presentation.
8. When execution finishes, the actual output is compared with the visible
   sample expected output.
9. The terminal displays either:

```text
✓ Output matches Sample 1
```

or:

```text
✕ Output does not match Sample 1
Expected: ...
```

Because the expected output is already public, displaying it for a failed
sample run does not disclose protected information.

### 7.4 Multiline input queue

Before building the queue:

- Convert Windows line endings (`\r\n`) and standalone carriage returns
  (`\r`) to `\n`.
- Split the input on `\n`.
- Remove one final empty element when it exists only because the stored input
  ends with a newline.
- Preserve intentional blank lines inside the input.

If the program requests more input than the sample provides:

1. Automatic input stops.
2. The terminal displays:

```text
Sample input finished. Enter additional input manually.
```

3. The existing manual input control becomes available so the student may
   continue or stop the program.

Unused sample lines do not cause an error. The program may legitimately stop
before consuming the complete input.

### 7.5 Output comparison

Local sample comparison must use one shared normalization function:

- Normalize line endings to `\n`.
- Ignore trailing whitespace at the end of the complete output.
- Preserve internal spaces, blank lines, capitalization, and line order.

The comparison contract must be documented in code and aligned as closely as
possible with official Judge0 behavior. Local sample execution is guidance;
the official submission result remains authoritative.

### 7.6 Manual run remains unchanged

The main **Run** button:

- Starts the current interactive runner.
- Lets the student type or paste input in the terminal.
- Does not automatically use a sample.
- Does not compare against a sample expected output.
- Does not create a score.

Students may therefore choose either workflow:

```text
Copy Input → Run → paste manually
```

or:

```text
Run Sample N → input supplied automatically
```

### 7.7 Official submit remains unchanged

The **Submit** button:

- Sends only the problem ID and student code to the server.
- Loads official cases server-side.
- Runs sample and hidden cases through Judge0.
- Calculates and stores the official score.
- Keeps hidden inputs and expected outputs private.

Local sample controls must not call the submission API or create submission
records.

## 8. Execution State

Only one local execution may run at a time.

While a manual or sample run is active:

- Disable the main **Run** button.
- Disable all **Run Sample** buttons.
- Keep the existing **Stop** action available.
- Do not queue another sample run.

After completion or stop:

- Re-enable the controls.
- Preserve the completed terminal output until the next run.

The active sample button should have a visible running state and accessible
busy indication.

## 9. Component Boundaries

### `SampleInputActions`

Responsibilities:

- Render the copy action for one non-empty sample input.
- Write the exact input text to the clipboard.
- Announce success or failure.

Dependencies:

- Sample index.
- Sample input string.
- Existing toast or status-message mechanism.

### `SampleRunControls`

Responsibilities:

- Render up to five visible sample buttons.
- Communicate the selected sample ID to the runner.
- Reflect disabled, active, and running states.

Dependencies:

- Ordered visible sample metadata only.
- Current runner state.

### Sample runner orchestration

Responsibilities:

- Build and consume the multiline input queue.
- Reuse the existing `InteractiveRunner`.
- Compare actual and expected public output.
- Append structured messages to the existing terminal.
- Fall back to manual input when the queue is exhausted.

This orchestration should remain separate from official submission logic.

## 10. Data Flow

```text
GET problem
    ↓
Public API returns visible sample cases only
    ↓
Problem statement renders sample input/output
    ├── Copy Input → browser clipboard
    └── Run Sample N
            ↓
        local input queue
            ↓
        InteractiveRunner
            ↓
        actual stdout/stderr
            ↓
        public-output comparison
            ↓
        terminal result
```

Hidden cases remain on the server-authoritative submission path and do not
enter this data flow.

## 11. Error Handling

### Clipboard unavailable

Show:

```text
Unable to copy sample input. Select the text and copy it manually.
```

The sample input remains selectable.

### Local Python runtime fails to load

Use the existing terminal error presentation. Do not fall back to Judge0 for a
local sample run.

### Runtime or syntax error

Show the normal Python error in the terminal and do not show a match result.

### Execution stopped

Show the existing stopped message and do not compare incomplete output.

### Sample input exhausted

Pause for manual input as specified in section 7.4.

### Sample has empty input

The sample may still have a **Run Sample** button. It executes with an empty
input queue. The copy action is omitted.

## 12. Accessibility

- Copy controls are keyboard accessible.
- Every copy control has a unique accessible name containing its sample number.
- Every run control has a unique accessible name such as `Run sample 2`.
- Running and disabled states are available to assistive technology.
- Copy and result messages use a polite `aria-live` region.
- Success and failure are not communicated by color alone.
- Focus remains on the activated button after copying.
- When a sample run starts, focus does not unexpectedly jump into the terminal.

## 13. Responsive Behavior

- Desktop: sample buttons appear in the terminal header.
- Tablet: buttons wrap to a second toolbar line.
- Small screens: the toolbar scrolls horizontally and keeps each button large
  enough for touch.
- The copy action stays inside its sample-input block without covering input
  text; the block reserves space for the control.

## 14. Performance

- Copying input performs no code execution.
- A sample click runs only the selected case.
- The Python runtime is loaded once and reused when possible.
- No **Run All Samples** behavior is included.
- Matrix and grid input sizes are plain text and do not require a new backend
  service.
- The UI must remain responsive while input lines are being supplied.

## 15. Testing Strategy

### Unit tests

- Normalizes `\r\n`, `\r`, and `\n`.
- Preserves internal blank lines.
- Removes only the terminal newline artifact.
- Supplies queued lines in order.
- Detects exhausted input and switches to manual mode.
- Normalizes output according to section 7.5.
- Distinguishes matching and non-matching output.
- Limits controls to five visible samples.
- Excludes hidden cases from controls.

### Component tests

- Copy button appears for non-empty sample input.
- Copy button is omitted for empty input.
- Clipboard receives the complete multiline string.
- Success and failure messages are announced.
- Correct sample labels and order are rendered.
- All sample buttons disable while execution is active.

### Browser end-to-end tests

1. Open a problem with a 4-by-5 matrix sample.
2. Copy the sample and verify all lines are preserved.
3. Paste through the existing manual terminal workflow and run successfully.
4. Click **Run Sample 1** and verify no manual typing is required.
5. Verify the terminal echoes the supplied input and reports a match.
6. Change the code to produce wrong output and verify the mismatch result.
7. Verify another sample button runs only its selected sample.
8. Verify hidden inputs never appear in the DOM or terminal.
9. Verify **Submit** still creates authoritative Judge0 results.
10. Verify stop, runtime error, input exhaustion, dark mode, and narrow viewport
    behavior.

## 16. Acceptance Criteria

The feature is complete when:

- A student can copy a multiline sample input with one click.
- Copied text preserves every required row and line break.
- A student can run any one of up to five visible samples from the terminal
  toolbar.
- The selected sample automatically satisfies sequential `input()` requests.
- The terminal reports whether actual output matches public expected output.
- Manual interactive input still works exactly as before.
- Running one sample does not create a submission or score.
- Submit continues to grade all official sample and hidden cases through
  Judge0.
- No hidden testcase data is rendered, copied, logged, or sent to the local
  runner.
- Automated tests cover multiline input, privacy, comparison, and regression
  behavior.
