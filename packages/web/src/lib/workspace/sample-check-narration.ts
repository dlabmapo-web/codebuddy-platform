import type { CaseComparator, SampleCheckView } from '@cove/shared';

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
  | 'workspace.sample_check_earlier_code';

export type SampleCheckLine =
  /** Text exactly as the program printed it. */
  | { kind: TerminalKind; text: string }
  /** A translated sentence, optionally led by a verdict mark. */
  | { kind: TerminalKind; message: SampleCheckMessage; mark?: '✓' | '!' | '✕' }
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
};

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
    };
  }

  const lines: SampleCheckLine[] = [];
  if (result.stdout) lines.push({ kind: 'out', text: result.stdout });
  if (result.stderr) lines.push({ kind: 'err', text: `${result.stderr}\n` });
  if (result.stdoutTruncated || result.stderrTruncated) {
    lines.push({ kind: 'info', message: 'workspace.sample_check_truncated' });
  }

  let verdict: SampleVerdict;
  let lifecycle: Exclude<TerminalLifecycle, 'STARTED'> = 'FAILED';
  let passedCount = 0;
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
  };
}
