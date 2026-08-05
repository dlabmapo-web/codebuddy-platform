'use client';

import type { LearnSampleTestCase } from '@cove/shared';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import { resolveSampleVerdict, type SampleVerdict } from './sample-run';
import type { PythonRunnerState, RunOutcome } from './use-python-runner';

export type SampleRun = {
  /** Null when the runner was already busy and the request was dropped. */
  outcome: RunOutcome | null;
  verdict: SampleVerdict | null;
};

/**
 * Running one sample case and narrating the result in the terminal.
 *
 * Shared by the student's workspace and the teacher's live copy of it, so the
 * two see the same banner, the same tick or cross, and the same expected
 * output for the same code. Only the student's side reports the run to the
 * class; the narration itself belongs to neither of them in particular.
 */
export function useSampleRunner(runner: PythonRunnerState) {
  const { t } = useLayoutTranslation('learn');

  return React.useCallback(
    async (
      code: string,
      sample: LearnSampleTestCase,
      index: number,
    ): Promise<SampleRun> => {
      const outcome = await runner.run(code, {
        stdin: sample.input,
        banner: [
          {
            text: `$ python solution.py · ${t('workspace.sample_n', {
              number: index + 1,
            })}\n`,
            kind: 'meta',
          },
        ],
      });
      if (!outcome) return { outcome: null, verdict: null };

      const verdict = resolveSampleVerdict({
        stdout: outcome.stdout,
        expectedOutput: sample.expectedOutput,
        stopped: outcome.stopped,
        failed: outcome.failed,
      });

      if (verdict.kind === 'match') {
        runner.appendLine(
          `\n✓ ${t('workspace.sample_match', { number: index + 1 })}\n`,
          'meta',
        );
      } else if (verdict.kind === 'mismatch') {
        runner.appendLine(
          `\n✕ ${t('workspace.sample_mismatch', { number: index + 1 })}\n`,
          'err',
        );
        runner.appendLine(
          `${t('workspace.expected')}\n${verdict.expected || '(empty)'}\n`,
          'info',
        );
      } else if (verdict.reason === 'error') {
        // A crash has no output worth comparing, and saying "wrong answer"
        // here would point at the wrong problem entirely.
        runner.appendLine(`\n${t('workspace.sample_skipped')}\n`, 'info');
      }

      return { outcome, verdict };
    },
    [runner, t],
  );
}
