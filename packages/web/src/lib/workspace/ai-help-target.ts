import { comparesSampleLocally, normalizeSampleOutput, resolveSampleVerdict, type SampleVerdict } from './sample-run';

/**
 * The latest result the AI help button answers to (the campus courses design,
 * §6): the code it came from, and the button that made it. Null while nothing
 * is known to be wrong.
 */
export type AiHelpTarget =
  | { source: 'RUN' | 'TEST_RUN'; code: string }
  | { source: 'SUBMIT'; code: string; submissionId: string };

/** What a finished Run says about the code, read in the browser and free. */
export type RunReading =
  /** Python stopped with an error: the error coach explains it, AI help may too. */
  | { kind: 'error' }
  /** The student typed an example's input and the output differs. */
  | { kind: 'mismatch'; number: number; expected: string; actual: string }
  /** An example's input, on a problem the browser cannot judge: the server decides. */
  | { kind: 'unchecked'; number: number }
  | { kind: 'match'; number: number }
  /** Their own input: nobody here knows the right answer for it. */
  | { kind: 'own-input' }
  | { kind: 'stopped' };

/** Lines as a terminal compares them: trailing spaces and blank lines at the end do not count. */
function normalizeInput(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/\s+$/u, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/**
 * Reads a finished Run: an error, or the student's input compared with each
 * example's. An example's input is judged by the same rule Test run uses, so
 * "Expected 30, you printed -10" is never a claim Submit would contradict.
 */
export function readRun(input: {
  typed: string[];
  stdout: string;
  failed: boolean;
  stopped: boolean;
  samples: ReadonlyArray<{ input: string; expectedOutput: string }>;
  gradingMode?: string;
  inputPromptPolicy?: string;
}): RunReading {
  if (input.stopped) return { kind: 'stopped' };
  if (input.failed) return { kind: 'error' };
  const typed = normalizeInput(input.typed.join(''));
  const index = input.samples.findIndex((sample) => normalizeInput(sample.input) === typed);
  if (index === -1) return { kind: 'own-input' };
  const sample = input.samples[index]!;
  const verdict: SampleVerdict = resolveSampleVerdict({
    stdout: input.stdout, expectedOutput: sample.expectedOutput, stopped: false, failed: false,
    comparesLocally: comparesSampleLocally(input.gradingMode, input.inputPromptPolicy as never),
  });
  if (verdict.kind === 'match') return { kind: 'match', number: index + 1 };
  if (verdict.kind === 'mismatch') return { kind: 'mismatch', number: index + 1, expected: verdict.expected, actual: verdict.actual };
  return { kind: 'unchecked', number: index + 1 };
}

/**
 * Whether Test run, or one example's run, found something wrong: an error, a
 * wrong output, or an output the browser cannot judge, which the server will.
 */
export function examplesAreWrong(results: ReadonlyArray<{ outcome: { error?: unknown; [key: string]: unknown } | null; verdict: SampleVerdict | null }>): boolean {
  return results.some((result) => Boolean(result.outcome?.error) || result.verdict?.kind === 'mismatch'
    || result.verdict?.kind === 'unchecked' || (result.verdict?.kind === 'skipped' && result.verdict.reason === 'error'));
}

/** Whether a Run leaves something for AI help to explain. */
export function runIsWrong(reading: RunReading): boolean {
  return reading.kind === 'error' || reading.kind === 'mismatch' || reading.kind === 'unchecked';
}

/** A short output for one line of text: long outputs are cut, an empty one is named. */
export function shortOutput(value: string, max = 40): string {
  const flat = normalizeSampleOutput(value).replace(/\n/g, ' ⏎ ');
  if (!flat) return '(nothing)';
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
