import type { CaseComparator, ProgramExitSignal, SampleCheckView } from '@cove/shared';

import type { SampleVerdict } from './sample-run';
import type { TerminalKind, TerminalLifecycle } from './terminal-transcript';

/** Narration a finished server check can add, as translation keys. */
export type SampleCheckMessage =
  | 'workspace.sample_check_passed'
  | 'workspace.sample_check_warning'
  | 'workspace.sample_check_mismatch'
  | 'workspace.sample_check_runtime_error'
  | 'workspace.sample_check_time_limit'
  | 'workspace.sample_check_memory_limit'
  | 'workspace.sample_check_unavailable'
  | 'workspace.sample_check_timed_out'
  | 'workspace.sample_check_cancelled'
  | 'workspace.sample_check_expired'
  | 'workspace.sample_check_truncated'
  | 'workspace.sample_check_refresh'
  | 'workspace.sample_check_earlier_code'
  | 'workspace.compile_error'
  | 'workspace.run_finished'
  | 'workspace.run_runtime_error'
  | 'workspace.run_time_limit'
  | 'workspace.run_memory_limit'
  | 'workspace.run_earlier_code'
  | `workspace.exit.${ProgramExitSignal}`
  | 'workspace.exit.code';

export type SampleCheckLine =
  /** Text exactly as the program printed it. */
  | { kind: TerminalKind; text: string }
  /** A translated sentence, optionally led by a verdict mark. */
  | { kind: TerminalKind; message: SampleCheckMessage; mark?: '✓' | '!' | '✕'; values?: Record<string, string | number> }
  /** The public rule a mismatch is explained against. */
  | { kind: TerminalKind; rule: { comparator: CaseComparator; expected: string } };

export type SampleCheckNarration = {
  lines: SampleCheckLine[];
  verdict: SampleVerdict;
  /**
   * What the run counts as for a watching teacher. A check that did not judge
   * the program — ours to fix, or stopped — is `CANCELLED` with nothing
   * passed: it must never read as a student's wrong answer.
   */
  lifecycle: Exclude<TerminalLifecycle, 'STARTED'>;
  passedCount: number;
  /** The program's own stdout, when it ran. */
  stdout: string | null;
  failed: boolean;
  /** A C/C++ Run whose program is waiting for more input: nothing ended. */
  awaitingInput?: boolean;
  /** C/C++: GCC's messages, for marking the editor, or null. */
  compileDiagnostics: string | null;
};

/** How a compiled program's runtime error is explained, or nothing for Python. */
export function exitExplanation(result: {
  exitCode?: number | null;
  exitSignal?: ProgramExitSignal | null;
}): SampleCheckLine | null {
  if (result.exitSignal) return { kind: 'info', message: `workspace.exit.${result.exitSignal}` };
  if (result.exitCode) return { kind: 'info', message: 'workspace.exit.code', values: { code: result.exitCode } };
  return null;
}

/**
 * What a finished server check says in the terminal, and what it counts as.
 *
 * Pure, so every branch the student can see is testable without a browser:
 * the verdict mark and sentence for each outcome, the public rule under a
 * mismatch (labelled by kind, so a pattern is never presented as literal
 * output), the output exactly as printed, and the notes about truncation,
 * changed problems and code edited since the click.
 */
export function narrateSampleCheck(
  view: SampleCheckView,
  context: { codeChanged: boolean },
): SampleCheckNarration {
  const result = view.status === 'COMPLETED' ? view.result : null;
  if (!result) {
    const message: SampleCheckMessage =
      view.status === 'TIMED_OUT'
        ? 'workspace.sample_check_timed_out'
        : view.status === 'CANCELLED'
          ? 'workspace.sample_check_cancelled'
          : view.status === 'EXPIRED'
            ? 'workspace.sample_check_expired'
            : 'workspace.sample_check_unavailable';
    return {
      lines: [{ kind: 'info', message }],
      verdict:
        view.status === 'CANCELLED'
          ? { kind: 'skipped', reason: 'stopped' }
          : { kind: 'unchecked' },
      lifecycle: 'CANCELLED',
      passedCount: 0,
      stdout: null,
      failed: false,
      compileDiagnostics: null,
    };
  }

  const run = view.kind === 'run';
  const lines: SampleCheckLine[] = [];
  if (result.outcome === 'COMPILE_ERROR') {
    // Nothing ran: GCC's own messages are the whole story, in red.
    lines.push({ kind: 'err', text: result.compileDiagnostics ?? '' });
    lines.push({ kind: 'err', message: 'workspace.compile_error', mark: '✕' });
    if (context.codeChanged) lines.push({ kind: 'info', message: run ? 'workspace.run_earlier_code' : 'workspace.sample_check_earlier_code' });
    return {
      lines,
      verdict: { kind: 'skipped', reason: 'error' },
      lifecycle: 'FAILED',
      passedCount: 0,
      stdout: null,
      failed: true,
      compileDiagnostics: result.compileDiagnostics ?? null,
    };
  }
  // Warnings of a program that compiled come before what it printed.
  if (result.compileDiagnostics) lines.push({ kind: 'info', text: result.compileDiagnostics });
  if (result.stdout) lines.push({ kind: 'out', text: result.stdout });
  if (result.stderr) lines.push({ kind: 'err', text: `${result.stderr}\n` });
  if (result.stdoutTruncated || result.stderrTruncated) {
    lines.push({ kind: 'info', message: 'workspace.sample_check_truncated' });
  }

  let verdict: SampleVerdict;
  let lifecycle: Exclude<TerminalLifecycle, 'STARTED'> = 'FAILED';
  let passedCount = 0;
  const ending = result.outcome === 'RUNTIME_ERROR' ? exitExplanation(result) : null;
  if (run && result.awaitingInput) {
    // Still reading: what it printed so far, and the terminal asks for more.
    return {
      lines, verdict: { kind: 'unchecked' }, lifecycle: 'COMPLETED', passedCount: 0,
      stdout: result.stdout, failed: false, compileDiagnostics: result.compileDiagnostics ?? null,
      awaitingInput: true,
    };
  }
  if (run) {
    // A Run judges nothing: it says how the program ended and stops there.
    if (result.outcome === 'PASSED' || result.outcome === 'PASSED_WITH_WARNING') {
      lines.push({ kind: 'meta', message: 'workspace.run_finished' });
      lifecycle = 'COMPLETED';
    } else {
      lines.push({
        kind: 'err',
        message:
          result.outcome === 'TIME_LIMIT'
            ? 'workspace.run_time_limit'
            : result.outcome === 'MEMORY_LIMIT'
              ? 'workspace.run_memory_limit'
              : 'workspace.run_runtime_error',
        mark: '✕',
      });
      if (ending) lines.push(ending);
    }
    if (context.codeChanged) lines.push({ kind: 'info', message: 'workspace.run_earlier_code' });
    return {
      lines,
      verdict: { kind: 'unchecked' },
      lifecycle,
      passedCount: 0,
      stdout: result.stdout,
      failed: result.outcome !== 'PASSED' && result.outcome !== 'PASSED_WITH_WARNING',
      compileDiagnostics: result.compileDiagnostics ?? null,
    };
  }
  switch (result.outcome) {
    case 'PASSED':
      lines.push({ kind: 'meta', message: 'workspace.sample_check_passed', mark: '✓' });
      verdict = { kind: 'match' };
      lifecycle = 'COMPLETED';
      passedCount = 1;
      break;
    case 'PASSED_WITH_WARNING':
      // Correct, and still not a plain pass: on Submit it loses points.
      lines.push({ kind: 'info', message: 'workspace.sample_check_warning', mark: '!' });
      verdict = { kind: 'warning' };
      lifecycle = 'COMPLETED';
      passedCount = 1;
      break;
    case 'WRONG_OUTPUT':
      lines.push({ kind: 'err', message: 'workspace.sample_check_mismatch', mark: '✕' });
      if (result.rule) lines.push({ kind: 'info', rule: result.rule });
      verdict = {
        kind: 'mismatch',
        expected: result.rule?.expected ?? '',
        actual: result.stdout,
      };
      break;
    case 'RUNTIME_ERROR':
    case 'TIME_LIMIT':
    case 'MEMORY_LIMIT':
      lines.push({
        kind: 'err',
        message:
          result.outcome === 'RUNTIME_ERROR'
            ? 'workspace.sample_check_runtime_error'
            : result.outcome === 'TIME_LIMIT'
              ? 'workspace.sample_check_time_limit'
              : 'workspace.sample_check_memory_limit',
        mark: '✕',
      });
      if (ending) lines.push(ending);
      // The program's own limit or crash, not a wrong answer.
      verdict = { kind: 'skipped', reason: 'error' };
      break;
  }
  if (view.refreshRequired) lines.push({ kind: 'info', message: 'workspace.sample_check_refresh' });
  if (context.codeChanged) {
    lines.push({ kind: 'info', message: 'workspace.sample_check_earlier_code' });
  }
  return {
    lines,
    verdict,
    lifecycle,
    passedCount,
    stdout: result.stdout,
    failed: result.outcome === 'RUNTIME_ERROR',
    compileDiagnostics: result.compileDiagnostics ?? null,
  };
}
