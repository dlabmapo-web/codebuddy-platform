/**
 * Sample-case execution helpers, ported from v1 (`main`, `src/lib/pyodide/
 * sampleRun.ts`) with the comparison rules made explicit.
 *
 * These decide only what the *student* is told after a local run. The server
 * re-runs every case at submit time and its verdict is the one that counts, so
 * nothing here is trusted for grading.
 */

/**
 * Splits sample input into the lines a program will consume through `input()`.
 *
 * A trailing newline terminates the last line rather than starting an empty
 * one — otherwise every sample would feed one phantom blank line and a program
 * reading exactly n lines would hang waiting for input that never comes.
 */
export function createSampleInputQueue(input: string): string[] {
  const normalized = input.replace(/\r\n?/g, '\n');
  if (normalized === '') return [];

  const lines = normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  return lines;
}

/**
 * Trailing whitespace is invisible in the editor, so holding a student's answer
 * wrong over a missing final newline teaches nothing. Interior whitespace is
 * preserved: `1 2` and `1  2` are genuinely different answers.
 */
export function normalizeSampleOutput(output: string): string {
  return output.replace(/\r\n?/g, '\n').replace(/\s+$/u, '');
}

export function isSampleOutputMatch(actual: string, expected: string): boolean {
  return normalizeSampleOutput(actual) === normalizeSampleOutput(expected);
}

export type SampleVerdict =
  | { kind: 'match' }
  | { kind: 'mismatch'; expected: string; actual: string }
  | { kind: 'skipped'; reason: 'error' | 'stopped' };

/**
 * A run that crashed or was stopped has no output worth comparing — reporting
 * "wrong answer" for a syntax error would point the student at the wrong
 * problem entirely.
 */
export function resolveSampleVerdict(input: {
  stdout: string;
  expectedOutput: string;
  stopped: boolean;
  failed: boolean;
}): SampleVerdict {
  if (input.stopped) return { kind: 'skipped', reason: 'stopped' };
  if (input.failed) return { kind: 'skipped', reason: 'error' };
  if (isSampleOutputMatch(input.stdout, input.expectedOutput)) {
    return { kind: 'match' };
  }
  return {
    kind: 'mismatch',
    expected: normalizeSampleOutput(input.expectedOutput),
    actual: normalizeSampleOutput(input.stdout),
  };
}

/** What a running program gets when it asks for a line of stdin. */
export type StdinAnswer =
  | { kind: 'line'; line: string }
  | { kind: 'eof' }
  | { kind: 'prompt' };

/**
 * Answers one stdin request, consuming the queue.
 *
 * `queue` is `null` when the run was given no stdin at all — a plain Run, where
 * the student types answers. Any supplied stdin, the empty string included,
 * ends in EOF exactly as the judge's does: a sample run of
 * `sys.stdin.read()` must finish rather than wait for a student who was never
 * asked, and an extra `input()` raises `EOFError` in both places.
 */
export function answerStdinRequest(queue: string[] | null): StdinAnswer {
  if (queue === null) return { kind: 'prompt' };
  const line = queue.shift();
  return line === undefined ? { kind: 'eof' } : { kind: 'line', line };
}

/**
 * An identifier for a run, including where `crypto.randomUUID` is missing.
 *
 * It exists only in secure contexts; a page opened over plain http on a LAN
 * address must still be able to run code.
 */
export function createRunId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
