# Prompt-Aware Console Grading Design

**Date:** 2026-08-04
**Status:** Corrective revision approved; awaiting written-spec review

## Summary

CodeBuddy will grade beginner Python console programs using the same observable
contract as a real command-line program: test-case text is supplied through
standard input, and everything the program writes to standard output—including
the prompt passed to `input(...)`—is part of the expected output.

Manual Run remains interactive. Sample Run becomes a deterministic preview of
official grading: it consumes only the selected sample's fixed input, sends EOF
when that input is exhausted, and compares output using Judge0-compatible
whitespace rules. Teacher-facing guidance will explain how multiple `input()`
calls and visible prompts must be represented in a test case.

The server-side Judge0 execution model, database schema, equal-weight scoring,
and hidden-case privacy remain unchanged.

## Problem

The current platform exposes three related but not fully consistent behaviors:

1. Manual Run pauses for each `input()` call and lets the student type a value.
2. Sample Run initially supplies fixed sample input, but asks the student for
   additional values if that input is exhausted.
3. Official Submit supplies only the teacher-authored fixed input. It cannot ask
   the student for more data and Python receives EOF when the input is exhausted.

This makes it possible for a student to complete a sample run with extra manual
input and then receive a runtime error during official grading.

The local sample output comparator also differs from Judge0 on trailing
whitespace. Local comparison removes whitespace only at the end of the complete
output, while Judge0 removes trailing ASCII whitespace from each line and then
from the complete output. A sample can therefore appear wrong locally and pass
officially.

Finally, the teacher test-case editor labels standard input and expected output
but does not explain two important beginner cases:

- Each separate `input()` call normally consumes one separate input line.
- The prompt in `input("Enter your name: ")` is stdout and must be included in
  the expected output.

## Product Decision

### Prompts are real output

CodeBuddy will not suppress, strip, or reinterpret prompts passed to Python's
`input()` function. Official grading continues sending the student's source code
to Judge0 without source transformation or an `input()` monkey patch.

This program:

```python
name = input("Enter your name: ")
password = input("Enter your password: ")
print(f"Welcome, {name}")
```

with this test input:

```text
Alice
secret123
```

produces this stdout:

```text
Enter your name: Enter your password: Welcome, Alice
```

The input values themselves are not echoed into stdout by Judge0. The two
prompts appear on the same line because Python's `input(prompt)` writes the
prompt without adding a newline. The expected output must therefore contain the
two prompts and final `print()` output in that form.

Prompt spelling, punctuation, case, ordering, and meaningful internal spacing
are graded. Judge0-compatible trailing whitespace normalization still applies.

### Fixed sample runs are non-interactive

The selected sample's `input` is the complete stdin contract for Sample Run.
When student code requests more input than the sample provides, Sample Run sends
EOF immediately. Python will normally raise `EOFError`, which is shown through
the existing Python error presentation.

Sample Run must never fall back to manual input after its fixed queue is empty.
This makes Sample Run deterministic and consistent across interactive-worker
and fallback-browser execution.

### Manual runs remain interactive

The ordinary Run action has no fixed test case. It continues to wait whenever
the program calls `input()` and lets the student type one or more lines. Terminal
input echo is presentation only and is not added to captured stdout.

Manual Run remains a learning tool. It does not calculate an official verdict,
change progress, or promise that the entered values match any teacher-authored
case.

## User Experience

### Teacher test-case editor

The test-case editor will add concise guidance near the stdin and stdout fields:

- "Each `input()` call reads one line. Put values for two `input()` calls on two
  lines."
- "Text inside `input(\"...\")` is output. Include the prompt exactly in expected
  output."
- "Typed input values are not part of expected output unless the program prints
  them."

The guidance will include a compact two-input example using a name and password.
It will not require a new form field, modal, or database column.

When the problem declares a non-empty input format, every test case must contain
stdin. A case whose `input` value is exactly the empty string is invalid: the
editor shows an actionable error and saving is blocked. A single newline remains
valid and represents one intentional blank input line.

This validation uses the problem's explicit input-format metadata rather than
trying to parse starter code with a regular expression. Starter code is not a
reference solution, may contain comments or incomplete examples, and cannot
reliably prove which prompts a correct student solution will print.

The existing labels remain authoritative:

- Standard input (`stdin`) is data provided to the program.
- Expected output (`stdout`) is text produced by the program.

### Student sample run

When Sample Run starts, the terminal continues to say how many fixed input lines
will be supplied. Each consumed value may be visually echoed as terminal input,
but that echo must not enter captured stdout.

If the program requests another value after the queue is empty, the runner sends
EOF and displays the resulting Python error. The current message inviting the
student to type missing sample input is removed.

The ordinary Run button retains the existing waiting-for-input experience on
browsers that support the interactive worker. On browsers without cross-origin
isolation the fallback runner has always used a fixed stdin string and cannot
pause for input at all; Manual Run there now says so explicitly instead of
surfacing a bare `EOFError`.

### Official result

Official Submit remains non-interactive. Every sample and hidden case runs as an
independent Judge0 submission with that case's complete stdin and expected
stdout. Prompts are compared as normal stdout.

## Architecture and Component Boundaries

### Sample input policy helper

Fixed-input exhaustion policy should be represented by a small pure helper
rather than remaining implicit inside `ProblemSolveClient` event handling. Given
a fixed input queue, the helper returns one of:

- a queued line to provide to the runner;
- EOF when the fixed queue is exhausted.

Manual input remains a separate path and is not handled by this fixed-input
helper. Keeping these paths distinct prevents later changes from accidentally
making sample execution interactive again.

### Interactive runner

`InteractiveRunner.sendEOF()` is the existing worker boundary for terminating
stdin. Sample Run calls it when fixed input is exhausted. Manual Run continues
using `provideInput()` and waiting for student terminal input.

The worker does not need to know whether an execution is manual or sample-based;
it receives only input lines or EOF commands.

### Output normalization

A shared, pure output-normalization function defines the local preview contract
using Judge0 CE's standard comparison algorithm. It will:

1. split output on LF line boundaries;
2. remove trailing NUL and ASCII whitespace from every line;
3. rejoin lines with LF;
4. remove trailing NUL and ASCII whitespace from the complete output;
5. preserve line order, case, prompts, and meaningful internal whitespace.

Both actual and expected output use this function. CRLF output is handled because
the CR remaining at each split line ending is trailing ASCII whitespace. A lone
internal CR is not converted into LF, matching Judge0 instead of introducing a
more permissive local rule.

The server continues delegating the official comparison to Judge0. CodeBuddy
does not independently replace an official verdict based on local normalization.

### stderr and execution failure

Captured stderr is not itself a failed execution. A program may write warnings or
diagnostics to stderr, exit successfully, and still receive Accepted when stdout
matches expected output. Sample Run therefore displays stderr but continues the
stdout comparison.

Python exceptions and runner/infrastructure failures remain execution failures.
The local execution result carries a failure field distinct from captured stderr
so the UI never infers process status from the presence of stderr text.

### Server grading contract

The existing authoritative path remains:

```text
teacher test-case input
        |
        v
submissionService stdin
        |
        v
Judge0 process stdin ---> student input() calls
        |
student stdout, including input prompts
        |
        v
Judge0 expected_output comparison
        |
        v
case outcome and aggregate score
```

No student-controlled grading fields or provider settings are introduced.

## Grading and Scoring Rules

- All teacher-authored sample and hidden cases participate in official grading.
- Each test case has equal weight.
- `score = round(100 * passed_count / total_count)`.
- All cases accepted produces `pass`.
- At least one but not all cases accepted produces `partial`.
- No accepted cases produces `fail`.
- Syntax errors, `EOFError`, other runtime errors, timeouts, and wrong output are
  student-code outcomes.
- A provider or infrastructure error produces `judge_error` and is not counted
  as a student mistake.

These rules restate the existing authoritative judging design; this feature does
not change them.

## Error Handling

### Missing fixed input

If a sample or hidden case contains fewer lines than the submitted program
requests, stdin closes. The resulting `EOFError` is a normal runtime-error case,
not a platform error.

Teacher guidance is the primary prevention mechanism. The platform will not
guess missing values, repeat the last value, insert an empty string, or pause an
official submission for user interaction.

When a problem declares an input format, the admin UI and admin API reject test
cases whose stdin is exactly empty. This prevents the common configuration error
where the problem statement promises input but Sample Run and Judge0 receive EOF.
Problems without a declared input format may still intentionally use empty stdin.

The shared test-case validator accepts whether the problem declares input. The
create route derives that value from the submitted `input_format`; the update
route uses the submitted value when present and otherwise the problem's stored
value. This keeps partial API updates consistent with the editor.

### Extra fixed input

If a program reads fewer values than a case provides, unused stdin remains
unconsumed. This alone does not fail the case; the program's stdout and execution
status determine the verdict.

### Prompt mismatch

If the expected output omits or misspells an `input()` prompt, the case receives
Wrong Answer. This is a test-case authoring issue when the intended solution
requires that prompt. The teacher guidance must make the relationship explicit.

### Empty input lines

Blank lines inside test input are intentional input values and must be preserved.
A final newline terminates the previous line; it does not create an additional
blank input value. Two final newline characters represent one final blank line,
matching the existing sample queue behavior.

## Testing Strategy

### Pure unit tests

Add or update tests for:

- one `input()` line;
- two sequential `input()` lines;
- internal blank input lines;
- a final intentional blank input line;
- fixed input exhaustion returning EOF;
- manual mode remaining eligible to wait for input;
- CRLF normalization;
- trailing whitespace on each output line;
- prompt text remaining significant;
- output case, order, and meaningful internal whitespace remaining significant;
- stderr with matching stdout remaining eligible to pass;
- Python and runner failures still failing the sample;
- declared-input problems rejecting exactly empty stdin;
- one intentional blank line remaining valid stdin.

The existing assertion that all whitespace inside a multi-line output is strict
must be refined: Judge0-compatible trailing ASCII whitespace on an intermediate
line is ignored, while spacing inside the meaningful content remains strict.

### Runner behavior tests

Cover the event-policy boundary without loading Pyodide:

- Sample Run provides queued lines in order.
- On the first stdin request after the last fixed line is consumed, Sample Run
  calls the runner's EOF effect instead of waiting for manual input.
- Sample Run never consults the manual input queue after fixed exhaustion.
- Manual Run continues waiting when no student input is available.

The production event handler and tests must use the same fixed-stdin dispatcher;
testing only a queue-return helper is insufficient because it does not prove that
`sendEOF()` is wired to the runner.

### Server contract tests

Mock the Judge0 HTTP boundary and verify that a two-input test case is encoded as
one multiline `stdin` value and paired with the unchanged expected output.
Decode the Base64 request fields in the assertion so the test verifies their
actual text, not only that encoded properties exist.

Cover at least these source and case combinations:

```python
name = input()
password = input()
print(name, password)
```

and:

```python
name = input("Enter your name: ")
password = input("Enter your password: ")
print(f"Welcome, {name}")
```

The tests must verify request construction and result aggregation. A live Judge0
network dependency is not required in the normal unit suite.

### Regression verification

Run the complete Vitest suite and lint the changed files. Manually verify in a
supported cross-origin-isolated browser that:

1. Manual Run pauses twice and displays both prompts.
2. Sample Run supplies two fixed lines without manual typing.
3. A third `input()` receives EOF during Sample Run.
4. Sample output preview agrees with an official submission for the same case.
5. A hidden case uses the same two-input contract without exposing its values.

## Security and Privacy

- Hidden stdin and expected output remain server-only.
- Prompt support does not expose hidden values or Judge0 credentials.
- Student code is not rewritten before official execution.
- The existing source, test-case, output, time, memory, rate, and network limits
  remain in force.
- Terminal text and program output continue to be rendered as untrusted text,
  never as HTML.

## Rollout and Compatibility

No migration is required. Existing cases continue using their stored input and
expected output.

Existing cases whose expected output intentionally omitted prompts from the
intended student solution are already incompatible with Judge0's current
behavior. Teachers must either:

- add the exact required prompts to expected output; or
- revise the problem and starter code to use plain `input()` when prompt wording
  is not part of the exercise.

The teacher guidance should be deployed with the runner parity changes so new
cases are authored correctly from the start.

## Non-Goals

- Ignoring or automatically stripping arbitrary prompt text
- Rewriting submitted Python or monkey-patching `input()` during grading
- Echoing stdin into Judge0 stdout
- Interactive official submissions
- Custom checker programs or regular-expression output matching
- Per-problem prompt-tolerance settings
- Function-based grading
- Weighted test cases
- Languages other than Python
- Database schema changes

## Corrective revision after implementation review

The implementation review identified four corrections incorporated above:

1. Successful stderr output must not be treated as an execution failure.
2. Local comparison must implement Judge0's code-defined per-line trailing
   whitespace behavior instead of describing it as instance configuration.
3. Regex parsing of starter code is removed because it creates false prompt
   warnings and cannot validate a student's eventual solution.
4. The fixed-input test boundary must exercise the EOF side effect, not only a
   pure queue helper.

The screenshot-driven empty-input case adds one authoring safeguard: when the
problem explicitly declares input, exactly empty test-case stdin is rejected.

## Known gap: failed cases still show no output

A case that fails official grading still reports only an outcome. Judge0's
callback carries `stdout`, and `getJudge0Batch` could request it, but both drop
it, and `submission_test_results` has nowhere to put it. Sample cases are now
diagnosable because a faithful Sample Run reproduces them locally; **hidden cases
are not**, for either the student or the teacher.

Closing this needs a schema change, which this spec rules out as a non-goal. It
is the natural follow-up and should not be treated as covered by this work.

## Acceptance Criteria

- Manual Run displays prompts and accepts student-entered lines interactively.
- Sample Run displays prompts but consumes only the selected sample's fixed input.
- Exhausted sample input sends EOF instead of requesting manual input.
- Two `input()` calls consume two teacher-authored input lines in order.
- `input()` prompt text remains part of captured and officially graded stdout.
- Teacher guidance explains multiline stdin, prompt output, and non-echoed input.
- Declared-input problems cannot save a test case with exactly empty stdin.
- Prompt guidance does not rely on regex parsing of starter code.
- Successful stderr output does not fail a sample whose stdout matches.
- Local sample output normalization matches Judge0's per-line trailing ASCII
  whitespace behavior.
- Tests cover two-input prompt programs, EOF, normalization, Judge0 request
  construction, stderr, empty-input validation, and aggregate grading.
- Existing hidden-case privacy and authoritative server grading are preserved.
- The full automated test suite passes.
