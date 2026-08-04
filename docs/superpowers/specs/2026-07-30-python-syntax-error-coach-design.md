# Python Syntax Error Coach Design

## Goal

Reduce the time teachers spend explaining beginner Python syntax errors while keeping AI API usage low. When a student runs invalid Python, the editor will highlight the relevant line and open a teaching-oriented Error Coach. Common errors use teacher-reviewed local rules at no API cost. A student can request an AI explanation only after repeated unsuccessful attempts.

## Scope

The first version handles syntax-related execution failures only:

- `SyntaxError`
- `IndentationError`
- `TabError`

It does not explain logical errors, failed test cases, runtime exceptions, or provide a complete corrected solution.

All student-facing Error Coach lessons, AI explanations, loading states, quota messages, fallbacks, and errors are written in natural Korean. Internal rule identifiers and developer diagnostics may remain in English.

## Student Experience

1. The student clicks **Run**.
2. Pyodide returns structured error information.
3. Monaco highlights the reported line and moves it into view.
4. An Error Coach panel opens automatically.
5. The panel teaches:
   - what happened;
   - why Python requires the relevant syntax;
   - where to inspect the code;
   - a small example unrelated to the exercise answer;
   - what to try next.
6. The student edits the code and runs it again.
7. After three changed attempts that produce the same normalized error category, an **Ask AI for more help** button becomes available.
8. AI produces a short explanation of the syntax concept without returning the complete corrected program.

The technical traceback remains available in the terminal for transparency, but the Error Coach is the primary beginner-facing explanation.

## Architecture

### Structured Python error

Extend `PythonExecutionError` to preserve the useful `SyntaxError` fields returned by Python:

- error type;
- message;
- line number;
- column offset when available;
- formatted traceback.

Both the interactive worker and fallback runner must return the same shape.

### Local lesson registry

Replace the single broad explanation dictionary with an ordered registry of independent lesson rules. Each rule has:

- a stable category identifier;
- one or more supported Python error types;
- a regular expression for the Python error message;
- a function that creates a lesson from the structured error;
- teacher-reviewed title, explanation, unrelated example, and next step.

A generic syntax lesson is returned when no specific rule matches. Rule selection is performed by one registry lookup rather than a growing `if/else` chain.

The MVP registry will cover:

- missing colon;
- expected indented block;
- unexpected indentation;
- inconsistent tabs and spaces;
- unclosed parenthesis, bracket, or brace;
- unterminated string;
- assignment used where comparison is expected;
- missing comma or separator when Python reports it;
- a general invalid-syntax fallback.

Rules depend on Python's reported error message, not on rewriting or executing guessed student code.

### Error Coach panel

Create a focused presentation component that accepts a lesson and renders the five teaching sections. It does not parse errors or track attempts. The problem-solving client owns the current execution error, opens the panel, and applies/removes the Monaco line decoration.

### Attempt tracking

Repeated-help state is kept in the problem-solving client for the current problem session. An attempt counts toward AI unlocking only when:

- the error is syntax-related;
- the code differs from the previous counted attempt;
- the normalized lesson category is unchanged.

Changing to a different error category resets the counter. A successful run clears the current error and counter. Refreshing the page also resets it in the MVP; persistent quotas remain server-side.

### AI escalation

The existing AI endpoint will become an explicit, syntax-only escalation instead of being called automatically for every failed submission.

The request includes only:

- problem and authenticated student identifiers;
- structured syntax error;
- the error line with at most two surrounding lines;
- the local lesson category and explanation already shown.

The server validates that the error is syntax-related and checks for an existing response keyed by student, problem, normalized error, and code hash. Duplicate requests return the cached explanation. The three-attempt unlock is a teaching interaction enforced by the client in the MVP; it is not treated as a security boundary because ordinary Run attempts are not currently persisted.

The model is instructed to:

- respond only in natural, age-appropriate Korean;
- teach the syntax concept in two or three short sentences;
- refer to the relevant line;
- suggest what to inspect;
- avoid a full corrected solution;
- avoid exposing hidden judge data.

The client never calls this endpoint automatically. The call occurs only after the eligible student clicks the button.

## Cost and Abuse Controls

- Local rules are always attempted first.
- AI requires an explicit click after three changed attempts.
- Identical code and error combinations reuse a cached response.
- Input is limited to the error neighborhood rather than the whole program where practical.
- Output is limited to a short explanation.
- The server applies a default limit of five new AI explanations per student per day. Cached responses do not consume the limit.
- Missing configuration, exhausted quota, or provider failure returns the local lesson with a non-blocking message.
- API keys remain server-only.

The daily quota is a configuration constant so the startup can tune it using observed usage without changing the UI contract.

## Error Handling

- Missing line information opens the panel without a Monaco decoration.
- Unknown syntax messages use the generic local lesson.
- Malformed AI responses are discarded and never replace the local lesson.
- AI timeout or provider errors leave the editor and local coaching fully usable.
- Runtime and logical errors continue through their existing terminal/judging flows.

## Testing

### Unit tests

- Each initial Python message fixture selects the intended lesson category.
- Unknown messages select the generic fallback.
- Dynamic line text is correct with and without a line number.
- Attempt tracking ignores unchanged code, resets for a new category, unlocks on the third changed attempt, and clears after success.
- AI prompt construction includes only the allowed context.

### Component tests

- The Error Coach renders every teaching section.
- The AI button is hidden or disabled before eligibility and enabled afterward.
- Local lessons remain visible during AI loading and provider failure.

### Integration checks

- Running code with a missing colon highlights the reported line and opens the panel.
- Fixing the syntax removes the decoration and panel state.
- A failed run does not automatically create an AI request.
- The first two changed attempts do not enable AI; the third does.
- Duplicate AI requests reuse the saved response.

## Non-Goals

- General-purpose chat;
- logical or algorithmic tutoring;
- automatic code correction;
- whole-solution generation;
- semantic linting beyond Python's syntax error;
- persistent client attempt history across refreshes in the MVP.
