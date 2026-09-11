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

/** What a run should do when Python asks for a line of input. */
export type StdinAction =
  | { kind: 'line'; text: string }
  | { kind: 'eof' }
  | { kind: 'prompt' };

/**
 * Whether an exhausted input queue means "ask the student" or "that is all".
 *
 * A sample run carries exactly the input its case supplies, so running out is
 * end-of-input. Reporting it as a prompt left `sys.stdin.read()` — which reads
 * until EOF — waiting for a student with nothing left to type, so the run hung
 * in the browser while the same program passed on Submit. A plain Run has no
 * fixed input and really is waiting for a person.
 */
export function stdinActionFor(input: {
  next: string | undefined;
  hasFixedInput: boolean;
}): StdinAction {
  if (input.next !== undefined) return { kind: 'line', text: input.next };
  return input.hasFixedInput ? { kind: 'eof' } : { kind: 'prompt' };
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
  /**
   * Server-judged only: the output matched, but slower than the case's soft
   * threshold, so on Submit this case would lose points. Never a plain pass.
   */
  | { kind: 'warning' }
  | { kind: 'mismatch'; expected: string; actual: string }
  | { kind: 'skipped'; reason: 'error' | 'stopped' }
  /**
   * The program ran, and this problem is graded by rules the browser does not
   * reproduce — so no verdict is claimed. The server decides on Submit.
   */
  | { kind: 'unchecked' };

/**
 * Whether a sample's verdict can be decided here exactly as the server will.
 *
 * Only legacy comparison is: `normalizeSampleOutput` is byte-for-byte the
 * judge's legacy normalizer. Weighted grading compares in CPython — Python's
 * `splitlines`, `re.search`, substring rules — and a JavaScript imitation
 * would pass samples that fail on Submit, or the reverse. Better to say
 * nothing than to say something the grade will contradict.
 */
export function comparesSampleLocally(gradingMode: string | undefined): boolean {
  return (gradingMode ?? 'LEGACY_STDIO') === 'LEGACY_STDIO';
}

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
  /** False when the server grades by rules not reproduced here. */
  comparesLocally?: boolean;
}): SampleVerdict {
  if (input.stopped) return { kind: 'skipped', reason: 'stopped' };
  if (input.failed) return { kind: 'skipped', reason: 'error' };
  if (input.comparesLocally === false) return { kind: 'unchecked' };
  if (isSampleOutputMatch(input.stdout, input.expectedOutput)) {
    return { kind: 'match' };
  }
  return {
    kind: 'mismatch',
    expected: normalizeSampleOutput(input.expectedOutput),
    actual: normalizeSampleOutput(input.stdout),
  };
}

/** A server check in flight, as far as stopping it is concerned. */
export type StoppableCheck = {
  /** Null until the server has accepted the check and named it. */
  checkId: string | null;
  /** A cancel already on its way; a second press must not double-send. */
  cancelInFlight: boolean;
};

export type StopAction =
  /** Nothing to stop. */
  | { kind: 'none' }
  /**
   * The check is still being accepted, so there is no id to cancel yet.
   * The press is remembered and sent the moment the id arrives — dropping it
   * would leave a student who pressed Stop early watching a check they
   * believed they had stopped.
   */
  | { kind: 'defer' }
  | { kind: 'send'; checkId: string };

/** What a Stop press should do about the check in flight. */
export function stopActionFor(check: StoppableCheck | null): StopAction {
  if (!check) return { kind: 'none' };
  if (check.cancelInFlight) return { kind: 'none' };
  if (!check.checkId) return { kind: 'defer' };
  return { kind: 'send', checkId: check.checkId };
}
