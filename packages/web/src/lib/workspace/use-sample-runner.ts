'use client';

import {
  isSampleCheckActive,
  type GradingProfileMode,
  type LearnSampleTestCase,
  type SampleCheckView,
} from '@cove/shared';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import { narrateSampleCheck } from './sample-check-narration';
import {
  comparesSampleLocally,
  resolveSampleVerdict,
  stopActionFor,
  type SampleVerdict,
} from './sample-run';
import type { PythonRunnerState, RunOutcome } from './use-python-runner';
import type { TerminalLifecycle } from './terminal-transcript';

/** How often a server check is asked for news while it runs. */
const POLL_INTERVAL_MS = 1_000;

/** The server check in flight, and what has been asked of it. */
type ServerCheckHandle = {
  abort: AbortController;
  academyId: string;
  /** Null until the server has accepted the check and named it. */
  checkId: string | null;
  /** Stop was pressed before there was an id to cancel. */
  stopRequested: boolean;
  cancelInFlight: boolean;
};

export type SampleRun = {
  /** Null when the runner was already busy and the request was dropped. */
  outcome: RunOutcome | null;
  verdict: SampleVerdict | null;
  /**
   * What to tell a watching teacher, when it is not simply derived from the
   * verdict. A server check that could not judge the program reports itself
   * as cancelled, never as a failed answer: a fault of ours is not the
   * student's zero.
   */
  report?: { lifecycle: Exclude<TerminalLifecycle, 'STARTED'>; passedCount: number };
};

/** Where a server-judged sample check is addressed, for one workspace. */
export type ServerSampleTarget = {
  academyId: string;
  classId: string;
  materialId: string;
  /** The grading revision the workspace loaded; a mismatch asks for refresh. */
  workspaceRevision: number;
  /** The editor's code now, to label a result that belongs to earlier code. */
  currentCode: () => string;
};

/**
 * Running one sample case and narrating the result in the terminal.
 *
 * Two paths, chosen per problem:
 *
 * - **Legacy grading** runs the sample in the browser and compares it here,
 *   with the normalizer that is byte-for-byte the judge's legacy one.
 * - **Enhanced grading**, where the academy has turned server checks on,
 *   sends the code to the grading server, which runs that one public case with
 *   exactly Submit's runner and CPython comparator. The terminal narrates
 *   Queued, Running and the verdict. There is no local fallback: when the
 *   server cannot answer the student is told so, never shown a verdict by
 *   different rules.
 *
 * Enhanced problems without server checks — and every teacher's local copy —
 * run in the browser and leave the verdict to Submit, as before.
 *
 * Shared by the student's workspace and the teacher's live copy, so the two
 * see the same banner and narration for the same code.
 */
export function useSampleRunner(runner: PythonRunnerState) {
  const { t } = useLayoutTranslation('learn');
  const errorText = useErrorText();
  const [active, setActive] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  /**
   * The server check in flight. Its controller is how a newer check, a Stop
   * or a navigation makes sure a late response from this one can never write
   * into a terminal that has moved on.
   */
  const currentRef = React.useRef<ServerCheckHandle | null>(null);

  /**
   * Asks the server to stop a check, and says so when it cannot.
   *
   * A cancel that fails silently is the worst of both: the check is still
   * running and the button that would stop it stays disabled behind
   * "Stopping". So a failure is narrated and Stop becomes pressable again.
   */
  const requestCancel = React.useCallback(
    async (check: ServerCheckHandle): Promise<void> => {
      const checkId = check.checkId;
      if (!checkId || check.cancelInFlight) return;
      check.cancelInFlight = true;
      check.stopRequested = false;
      try {
        await orpc.learn.cancelSampleCheck({ academyId: check.academyId, checkId });
      } catch (error) {
        // Silent for a check nobody is watching any more — a navigation, or a
        // newer check in the terminal — and reported for the one on screen.
        if (currentRef.current === check && !check.abort.signal.aborted) {
          runner.appendLine(`${errorText(error)}\n`, 'err');
          setStopping(false);
        }
      } finally {
        check.cancelInFlight = false;
      }
    },
    [errorText, runner],
  );

  const runServer = React.useCallback(
    async (
      code: string,
      sample: LearnSampleTestCase,
      index: number,
      target: ServerSampleTarget,
      options: { clientRunId?: string; sampleCount?: number },
    ): Promise<SampleRun> => {
      currentRef.current?.abort.abort();
      const abort = new AbortController();
      const current: ServerCheckHandle = {
        abort,
        academyId: target.academyId,
        checkId: null,
        stopRequested: false,
        cancelInFlight: false,
      };
      currentRef.current = current;
      setActive(true);
      setStopping(false);
      const number = index + 1;
      const clientRunId = options.clientRunId ?? crypto.randomUUID();

      runner.beginExternalRun({
        clientRunId,
        sampleCount: options.sampleCount ?? 0,
        banner: [
          { text: `$ ${t('workspace.sample_check_banner', { number })}\n`, kind: 'meta' },
        ],
      });
      runner.appendLine(`${t('workspace.sample_check_queued')}\n`, 'info');

      const finish = (
        run: SampleRun,
        lifecycle: Exclude<TerminalLifecycle, 'STARTED'>,
        passedCount: number,
      ): SampleRun => {
        if (currentRef.current === current) {
          currentRef.current = null;
          setActive(false);
          setStopping(false);
        }
        if (!abort.signal.aborted) runner.finishExternalRun(lifecycle, passedCount);
        return { ...run, report: { lifecycle, passedCount } };
      };
      const abandoned = (): SampleRun => finish({ outcome: null, verdict: null }, 'CANCELLED', 0);

      let view: SampleCheckView;
      try {
        view = await orpc.learn.startSampleCheck({
          academyId: target.academyId,
          classId: target.classId,
          materialId: target.materialId,
          position: sample.position,
          code,
          workspaceRevision: target.workspaceRevision,
          // One per click: a retried or doubled request starts one check.
          clientRequestId: clientRunId,
        });
      } catch (error) {
        if (abort.signal.aborted) return abandoned();
        runner.appendLine(`${errorText(error)}\n`, 'err');
        return finish(
          { outcome: null, verdict: { kind: 'unchecked' } },
          'CANCELLED',
          0,
        );
      }
      current.checkId = view.checkId;
      // Stop was pressed while the check was still being accepted, when there
      // was no id to cancel. Now there is one, so the press takes effect.
      if (current.stopRequested) void requestCancel(current);

      let announcedRunning = false;
      while (isSampleCheckActive(view.status)) {
        if (view.status === 'RUNNING' && !announcedRunning) {
          announcedRunning = true;
          runner.appendLine(`${t('workspace.sample_check_running')}\n`, 'info');
        }
        if (!(await wait(POLL_INTERVAL_MS, abort.signal))) return abandoned();
        try {
          view = await orpc.learn.getSampleCheck({
            academyId: target.academyId,
            checkId: view.checkId,
          });
        } catch (error) {
          if (abort.signal.aborted) return abandoned();
          runner.appendLine(`${errorText(error)}\n`, 'err');
          return finish({ outcome: null, verdict: { kind: 'unchecked' } }, 'CANCELLED', 0);
        }
        if (abort.signal.aborted) return abandoned();
      }

      const narration = narrateSampleCheck(view, {
        codeChanged: target.currentCode() !== code,
      });
      for (const line of narration.lines) {
        if ('text' in line) {
          runner.appendLine(line.text, line.kind);
        } else if ('rule' in line) {
          const label =
            line.rule.comparator === 'STDOUT'
              ? t('workspace.expected')
              : t(`workspace.sample_rule.${line.rule.comparator}`);
          runner.appendLine(`${label}\n${line.rule.expected || '(empty)'}\n`, line.kind);
        } else {
          const sentence = t(line.message, { number });
          runner.appendLine(
            line.mark ? `\n${line.mark} ${sentence}\n` : `${sentence}\n`,
            line.kind,
          );
        }
      }
      return finish(
        {
          outcome:
            narration.stdout === null
              ? null
              : { stdout: narration.stdout, stopped: false, failed: narration.failed, error: null },
          verdict: narration.verdict,
        },
        narration.lifecycle,
        narration.passedCount,
      );
    },
    [errorText, requestCancel, runner, t],
  );

  const runSample = React.useCallback(
    async (
      code: string,
      sample: LearnSampleTestCase,
      index: number,
      options?: {
        /** Shared with the run this student reports to a watching teacher. */
        clientRunId?: string;
        sampleCount?: number;
        /** How the server grades this problem; decides if a verdict is ours to give. */
        gradingMode?: GradingProfileMode;
        /** Present when the server judges this problem's public samples. */
        server?: ServerSampleTarget;
      },
    ): Promise<SampleRun> => {
      if (options?.server && !comparesSampleLocally(options.gradingMode)) {
        return runServer(code, sample, index, options.server, options);
      }

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
        clientRunId: options?.clientRunId,
        sampleCount: options?.sampleCount,
      });
      if (!outcome) return { outcome: null, verdict: null };

      const verdict = resolveSampleVerdict({
        stdout: outcome.stdout,
        expectedOutput: sample.expectedOutput,
        stopped: outcome.stopped,
        failed: outcome.failed,
        comparesLocally: comparesSampleLocally(options?.gradingMode),
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
      } else if (verdict.kind === 'unchecked') {
        runner.appendLine(
          `\n${t('workspace.sample_checked_on_submit', { number: index + 1 })}\n`,
          'info',
        );
      } else if (verdict.kind === 'skipped' && verdict.reason === 'error') {
        // A crash has no output worth comparing, and saying "wrong answer"
        // here would point at the wrong problem entirely.
        runner.appendLine(`\n${t('workspace.sample_skipped')}\n`, 'info');
      }

      // The verdict exists only now, after the comparison. Reporting it here
      // means a mirrored run's pass count arrives with the narration a reader
      // is looking at rather than a moment before it.
      runner.settleRun({
        passedCount: verdict.kind === 'match' ? 1 : 0,
        // A successful process can still fail the sample comparison. Runtime
        // errors and manual stops already carry FAILED/CANCELLED respectively.
        lifecycle: verdict.kind === 'mismatch' ? 'FAILED' : undefined,
      });

      return { outcome, verdict };
    },
    [runServer, runner, t],
  );

  /**
   * Stops the server check in flight. Queued work is removed at once; a
   * running program finishes its bounded run first, so this shows Stopping
   * until the server reports the check over.
   */
  const stopServerCheck = React.useCallback(() => {
    const current = currentRef.current;
    const action = stopActionFor(current);
    if (!current || action.kind === 'none') return;
    setStopping(true);
    runner.appendLine(`${t('workspace.sample_check_stopping')}\n`, 'info');
    if (action.kind === 'defer') {
      current.stopRequested = true;
      return;
    }
    void requestCancel(current);
  }, [requestCancel, runner, t]);

  /**
   * Lets go of the check in flight: its responses can no longer reach the
   * terminal, and the server is told to stop running it.
   *
   * Touches no React state, so unmount cleanup can use it too — nothing here
   * renders into a component that is already gone. `requestCancel` reports a
   * failure only while the check is still the one on screen, and clearing the
   * ref first is what tells it this one is not.
   */
  const releaseServerCheck = React.useCallback(() => {
    const current = currentRef.current;
    if (!current) return;
    current.abort.abort();
    currentRef.current = null;
    if (current.checkId) {
      void requestCancel(current);
      return;
    }
    // Still being accepted: the cancel goes out as soon as it has an id. If
    // this page is gone by then, the check's own queue limit ends it.
    current.stopRequested = true;
  }, [requestCancel]);

  /**
   * Walks away from the check in flight — moving to the next problem, say.
   * The same release, plus the controls returning to rest.
   */
  const abandonServerCheck = React.useCallback(() => {
    releaseServerCheck();
    setActive(false);
    setStopping(false);
  }, [releaseServerCheck]);

  /**
   * Leaving the workspace altogether must stop the check too, not merely stop
   * listening to it: an accepted check would otherwise hold the student's one
   * outstanding slot and occupy the judge for a result nobody will ever read.
   *
   * Through a ref, because the cleanup has to run on unmount and on unmount
   * only — an effect that depended on the release itself would abandon the
   * check every time the terminal's identity changed underneath it.
   */
  const releaseRef = React.useRef(releaseServerCheck);
  React.useEffect(() => {
    releaseRef.current = releaseServerCheck;
  }, [releaseServerCheck]);
  React.useEffect(() => () => releaseRef.current(), []);

  return {
    runSample,
    serverCheck: { active, stopping, stop: stopServerCheck, abandon: abandonServerCheck },
  };
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
