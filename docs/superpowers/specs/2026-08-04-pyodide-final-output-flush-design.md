# Pyodide Final Output Flush Design

**Date:** 2026-08-04
**Status:** Approved design; awaiting written-spec review

## Summary

CodeBuddy will explicitly flush Python's stdout and stderr streams when each
student execution ends in the long-lived Pyodide worker. This makes a completed
browser run behave like `python solution.py` in a normal terminal: output is
delivered even when the program does not print a final newline.

The worker will preserve the student's output exactly. It will not append a
newline, rewrite source code, or require students to add a final `print()`.

## Reproduced Problem

The issue was reproduced in the logged-in student page for problem 449,
"약수", with this code:

```python
n = int(input())

for i in range(1, n + 1):
    if n % i == 0:
        print(i, end=" ")
```

For sample input `6`, the program completed but the terminal showed only the
input echo. The expected stdout `1 2 3 6 ` did not reach the UI. Adding a final
`print()` made the buffered output appear, confirming that the missing
execution-boundary flush is the relevant behavior.

## Root Cause

The interactive runner reuses one Pyodide interpreter for multiple student
runs. Completing the student's `exec(...)` call does not terminate that Python
interpreter. Consequently, Python does not perform the process-exit stream
flush that occurs after `python solution.py` in CPython or VS Code.

The worker already uses Pyodide's byte-oriented `write` handlers and flushes its
JavaScript `TextDecoder` instances after execution. That JavaScript flush can
release an incomplete UTF-8 sequence held by the decoder, but it cannot retrieve
bytes that Python has not yet written to the Pyodide handler. The worker must
first flush Python's streams.

## Behavioral Contract

At the end of every interactive-worker execution, whether student code succeeds
or raises an exception, CodeBuddy will:

1. finish evaluating the student's code and build any structured Python error;
2. flush the Python stdout stream that was active when execution began;
3. flush the Python stderr stream that was active when execution began;
4. flush the JavaScript stdout and stderr decoders;
5. emit any remaining output events;
6. emit the structured Python error event, if execution raised;
7. emit the final `done` event.

The output events must be posted before a related Python error and before
`done`, preserving the worker message order relied on by `InteractiveRunner`
and `ProblemSolveClient`.

This contract applies to successful runs and Python exceptions. If a program
prints partial output and then raises, students should see the partial output
before the exception presentation.

## Output Semantics

The fix does not add content. For example:

```python
print("A", end=" ")
print("B", end=" ")
```

must render exactly:

```text
A B 
```

There is no synthetic newline after the trailing space. Existing local sample
comparison and Judge0 trailing-whitespace rules continue to determine whether
that output matches the teacher's expected output.

Programs that already use normal `print()`, `flush=True`, or an explicit
`sys.stdout.flush()` remain unchanged. Input prompts, terminal input echo,
stderr display, Python error handling, and official Judge0 submission behavior
also remain unchanged.

## Implementation Boundary

The change belongs in `public/pyodide-worker.js`, inside the Python wrapper that
executes student source. The wrapper will retain references to its original
stdout and stderr streams before executing student code and flush those
runner-owned streams in a `finally` path. Retaining the original references
ensures output already written to the platform streams is flushed even if
student code later reassigns `sys.stdout` or `sys.stderr`.

After the Python-level flush completes, the existing JavaScript `flushOutput`
calls remain in place. If execution produced a structured Python error, the
worker will post it after those decoder flushes so partial output is presented
before the exception. The worker URL cache version in `InteractiveRunner` will
be incremented so an open browser cannot continue using the old worker after a
deployment or development refresh.

The fallback runner already captures stdout and stderr with `StringIO`; reading
`getvalue()` is not newline-dependent, so that path needs no behavioral change.
The authoritative Judge0 path runs each case as a real process and already
flushes streams on process exit.

## Error Handling

Student exceptions continue through the existing structured `pythonError`
event. Stream flushing runs after the student-code try/except so buffered output
is not lost on an exception.

A failure in the worker's own execution or stream pipeline continues to use the
existing `fatal` event. The implementation will not silently convert a genuine
runner failure into a successful run.

Stopping a run still terminates and recreates the worker; no final flush is
promised for forcibly terminated code because the Python interpreter no longer
has an opportunity to execute cleanup logic.

## Verification

The implementation will be checked with these cases in the real student runner:

1. `print("hello")` renders normally.
2. `print("hello", end="")` renders `hello` before the program-ended marker.
3. The problem 449 divisor loop renders `1 2 3 6 ` without a final `print()` and
   passes sample comparison.
4. Unicode output without a newline is decoded completely.
5. Partial output followed by a Python exception is shown before the exception.
6. stderr without a newline is displayed.
7. A second execution in the same worker does not contain delayed output from
   the first execution.
8. Existing prompt, fixed-stdin EOF, and output-comparison tests continue to
   pass.

The normal unit suite, TypeScript check, focused lint, and production build will
also run. The browser verification will use the logged-in student problem and
restore any temporarily edited student source afterward.

## Non-Goals

- Adding a newline to student output.
- Rewriting student `print()` calls.
- Replacing Python stdout with a custom unbuffered proxy.
- Changing terminal styling or collaboration broadcasts.
- Changing Judge0 comparison, scoring, or submission behavior.
- Guaranteeing cleanup after a forced worker termination or infinite loop.

## Considered Alternatives

### Require a final `print()`

This exposes an implementation detail to students and differs from normal
Python process behavior. It is rejected.

### Replace stdout with an unbuffered proxy

This could make every write immediately visible, but it changes Python stream
semantics, adds overhead, and risks incompatibility with code that inspects
encoding or stream capabilities. It is unnecessary for the reported problem.

### Flush only the JavaScript decoder

The worker already does this. It cannot release content still buffered by
Python, so it is insufficient.
