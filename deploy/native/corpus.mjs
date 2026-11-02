/** Reviewed short Python only. Resource-exhaustion probes belong to the separate containment gate. */
export const classroomCorpus = [
    { kind: 'correct', code: 'print(input())', caseOutcome: 'PASSED', status: 'PASSED', score: 100, heading: 'Everything passed' },
    { kind: 'wrong-output', code: 'print("wrong")', caseOutcome: 'WRONG_OUTPUT', status: 'FAILED', score: 0, heading: 'Check your output' },
    { kind: 'unicode-input', code: 'import sys; print(sys.stdin.buffer.read().decode().strip())', caseOutcome: 'PASSED', status: 'PASSED', score: 100, heading: 'Everything passed' },
    // Prompt inclusion deliberately changes output: the expected grade is FAILED.
    { kind: 'prompt', code: 'print(input("이름: "))', caseOutcome: 'WRONG_OUTPUT', status: 'FAILED', score: 0, heading: 'Check your output' },
    { kind: 'runtime-error', code: 'raise ValueError("fixture")', caseOutcome: 'RUNTIME_ERROR', status: 'FAILED', score: 0, heading: 'Fix the runtime error' },
    { kind: 'curriculum', code: 'value = input(); print("".join([c for c in value]))', caseOutcome: 'PASSED', status: 'PASSED', score: 100, heading: 'Everything passed' },
];
