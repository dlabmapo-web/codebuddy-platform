'use client';

import {
  isSampleCheckActive,
  type GradingProfileMode,
  type LearnSampleTestCase,
  type SampleCheckView,
} from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import { narrateSampleCheck, type SampleCheckLine } from './sample-check-narration';
import {
  comparesSampleLocally,
  resolveSampleVerdict,
  stopActionFor,
  type SampleVerdict,
} from './sample-run';
import type { PythonRunnerState, RunOutcome } from './use-python-runner';
import type { TerminalLifecycle } from './terminal-transcript';

/**
 * How long to pause before asking again when the server answered at once
 * with nothing new. A server read is held until the check moves on
 * (`waitWhile`), so this only paces a server that did not wait.
 */
const POLL_INTERVAL_MS = 1_000;
/** Faster than this, with the status unchanged, the server did not wait. */
const UNHELD_ANSWER_MS = 250;

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
  /** A C/C++ Run whose program waits for more input; its transcript stays open. */
  awaitingInput?: boolean;
  /** The server check that ended waiting, which the next input step continues. */
  checkId?: string;
  /** Null when the runner was already busy and the request was dropped. */
  outcome: RunOutcome | null;
  verdict: SampleVerdict | null;
  /**
   * What to tell a watching teacher, when it is not simply derived from the
   * verdict. A server check that could not judge the program reports itself
   * as cancelled, never as a failed answer: a fault of ours is not the
   * student's zero.
   */
  /** Preserve authoritative server verdicts and diagnostics in batch results. */
  serverDetails?: SampleCheckLine[];
  /** C/C++: GCC's messages, to mark the lines they name in the editor. */
  compileDiagnostics?: string | null;
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
  /**
   * A staff member's own C/C++ practice: the same checks, with no class. A
   * preview runs the unpublished revision being edited.
   */
  practice?: { preview: boolean };
};

/**
 * Running one sample case and narrating the result in the terminal.
 *
 * Two paths, chosen per problem:
 *
 * Where the academy has turned server checks on, both grading modes run on
 * the server. Legacy uses Submit's normalizer; enhanced uses its comparator.
 * The enabled path sends the code to the grading server, which runs that one public case with
 *   Submit's runner, execution limits and comparison rules. The terminal narrates
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
  const { t: tc } = useTranslation('sample-check');
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
      /** A public sample's check, or a C/C++ Run on the student's own input. */
      check:
        | { kind: 'sample'; sample: LearnSampleTestCase; index: number }
        | {
            kind: 'run'; stdin: string; command: string;
            /** Ctrl+D was pressed: `stdin` is all of it. */
            endOfInput?: boolean;
            /**
             * A later step of one interactive Run: the step it follows, and
             * what the terminal already shows of the program's output. The
             * transcript carries on rather than starting over, and only the
             * output past that point is added.
             */
            continues?: { checkId: string; printed: string };
          },
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
      const number = check.kind === 'sample' ? check.index + 1 : 0;
      // One per request: a retried or doubled request starts one check, and
      // each input step of a Run is a request of its own.
      const clientRunId = options.clientRunId ?? crypto.randomUUID();
      const continues = check.kind === 'run' ? check.continues : undefined;

      if (!continues) runner.beginExternalRun({
        clientRunId,
        sampleCount: options.sampleCount ?? 0,
        banner: [
          check.kind === 'sample'
            ? { text: `$ ${tc('workspace.sample_check_banner', { number })}\n`, kind: 'meta' }
            : { text: `$ ${check.command}\n`, kind: 'meta' },
          // What the program will read, as a terminal would have echoed it.
          ...(check.kind === 'run' && check.stdin
            ? [{ text: check.stdin.endsWith('\n') ? check.stdin : `${check.stdin}\n`, kind: 'in' as const }]
            : []),
        ],
      });
      const quiet = Boolean(continues);
      if (!quiet) runner.appendLine(`${tc('workspace.sample_check_queued')}\n`, 'info');

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
        const address = {
          academyId: target.academyId,
          classId: target.classId,
          materialId: target.materialId,
          code,
          workspaceRevision: target.workspaceRevision,
          clientRequestId: clientRunId,
        };
        const run = check.kind === 'run'
          ? {
              stdin: check.stdin,
              ...(check.endOfInput ? { endOfInput: true } : {}),
              ...(continues ? { continues: continues.checkId } : {}),
            }
          : null;
        if (target.practice) {
          const practice = {
            academyId: address.academyId,
            materialId: address.materialId,
            code: address.code,
            workspaceRevision: address.workspaceRevision,
            clientRequestId: address.clientRequestId,
            preview: target.practice.preview,
          };
          view = check.kind === 'sample'
            ? await orpc.learn.startPracticeSampleCheck({ ...practice, position: check.sample.position })
            : await orpc.learn.startPracticeRunCheck({ ...practice, ...run! });
        } else {
          view = check.kind === 'sample'
            ? await orpc.learn.startSampleCheck({ ...address, position: check.sample.position })
            : await orpc.learn.startRunCheck({ ...address, ...run! });
        }
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
        if (view.status === 'RUNNING' && !announcedRunning && !quiet) {
          announcedRunning = true;
          runner.appendLine(`${tc('workspace.sample_check_running')}\n`, 'info');
        }
        // Held by the server until the check moves on, so the answer comes
        // back the moment it exists rather than at the next poll.
        const seen = view.status;
        const askedAt = Date.now();
        try {
          view = await orpc.learn.getSampleCheck(
            { academyId: target.academyId, checkId: view.checkId, waitWhile: seen },
            { signal: abort.signal },
          );
        } catch (error) {
          if (abort.signal.aborted) return abandoned();
          runner.appendLine(`${errorText(error)}\n`, 'err');
          return finish({ outcome: null, verdict: { kind: 'unchecked' } }, 'CANCELLED', 0);
        }
        if (abort.signal.aborted) return abandoned();
        if (view.status === seen && Date.now() - askedAt < UNHELD_ANSWER_MS) {
          if (!(await wait(POLL_INTERVAL_MS, abort.signal))) return abandoned();
        }
      }

      const narration = narrateSampleCheck(view, {
        codeChanged: target.currentCode() !== code,
      });
      // A continued step ran the program again from the start: the terminal
      // already shows the output up to the last input, so only the rest is new.
      const printed = continues?.printed.length ?? 0;
      if (narration.awaitingInput) {
        // The program waits for input: its output so far, and the transcript
        // stays open for the next line. GCC's warnings come first, once.
        if (!continues && narration.compileDiagnostics) runner.appendLine(narration.compileDiagnostics, 'info');
        const fresh = narration.stdout?.slice(printed);
        if (fresh) runner.appendLine(fresh, 'out');
        if (currentRef.current === current) {
          currentRef.current = null;
          setActive(false);
          setStopping(false);
        }
        return {
          outcome: { stdout: narration.stdout ?? '', stopped: false, failed: false, error: null },
          verdict: null,
          compileDiagnostics: narration.compileDiagnostics,
          awaitingInput: true,
          checkId: view.checkId,
        };
      }
      for (const line of narration.lines) {
        if ('text' in line) {
          if (continues && line.kind === 'out') {
            const fresh = line.text.slice(printed);
            if (fresh) runner.appendLine(fresh, 'out');
            continue;
          }
          // GCC's warnings were shown when the Run began.
          if (continues && line.kind === 'info' && line.text === narration.compileDiagnostics) continue;
          runner.appendLine(line.text, line.kind);
        } else if ('rule' in line) {
          const label =
            line.rule.comparator === 'STDOUT'
              ? t('workspace.expected')
              : t(`workspace.sample_rule.${line.rule.comparator}`);
          runner.appendLine(`${label}\n${line.rule.expected || '(empty)'}\n`, line.kind);
        } else {
          const sentence = tc(line.message, { number, ...line.values });
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
          serverDetails: narration.lines,
          compileDiagnostics: narration.compileDiagnostics,
        },
        narration.lifecycle,
        narration.passedCount,
      );
    },
    [errorText, requestCancel, runner, t, tc],
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
        inputPromptPolicy?: 'INCLUDE' | 'IGNORE';
        /** Present when the server judges this problem's public samples. */
        server?: ServerSampleTarget;
      },
    ): Promise<SampleRun> => {
      if (options?.server) {
        return runServer(code, { kind: 'sample', sample, index }, options.server, options);
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
        comparesLocally: comparesSampleLocally(options?.gradingMode, options?.inputPromptPolicy),
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
          `\n${tc('workspace.sample_checked_on_submit', { number: index + 1 })}\n`,
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
    [runServer, runner, t, tc],
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
    runner.appendLine(`${tc('workspace.sample_check_stopping')}\n`, 'info');
    if (action.kind === 'defer') {
      current.stopRequested = true;
      return;
    }
    void requestCancel(current);
  }, [requestCancel, runner, tc]);

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

  /**
   * A C/C++ Run: the code and the student's input go to the server, which
   * compiles and runs them; the terminal narrates it like a sample check.
   */
  const runOnServer = React.useCallback(
    (
      code: string,
      run: { stdin: string; command: string },
      target: ServerSampleTarget,
      options: { clientRunId?: string } = {},
    ): Promise<SampleRun> =>
      runServer(code, { kind: 'run', ...run }, target, { ...options, sampleCount: 0 }),
    [runServer],
  );

  /**
   * A C/C++ Run that behaves like Python's: it starts at once, and whenever
   * the program waits for input the terminal takes the next line. Each Enter
   * (or a pasted block) runs the compiled program again with every line so
   * far, and the terminal adds only what it printed after the last input;
   * Ctrl+D runs it once more with its input closed. Resolves with the final
   * run, or a cancelled one when stopped.
   */
  const runInteractive = React.useCallback(
    async (
      code: string,
      command: string,
      target: ServerSampleTarget,
      options: { clientRunId?: string } = {},
    ): Promise<SampleRun> => {
      const lines: string[] = [];
      let endOfInput = false;
      let previous: { checkId: string; printed: string } | undefined;
      try {
        for (;;) {
          const stdin = lines.length ? `${lines.join('\n')}\n` : '';
          const result = await runServer(
            code,
            { kind: 'run', stdin, command, endOfInput, ...(previous ? { continues: previous } : {}) },
            target,
            // The caller's run id names the transcript, which the first step
            // opens; every later step is a new request with its own id.
            previous ? { sampleCount: 0 } : { ...options, sampleCount: 0 },
          );
          if (!result.awaitingInput || !result.checkId) return result;
          previous = { checkId: result.checkId, printed: result.outcome?.stdout ?? '' };
          const next = await runner.awaitInput();
          if (next === null) {
            runner.finishExternalRun('CANCELLED', 0);
            return { outcome: null, verdict: null, report: { lifecycle: 'CANCELLED', passedCount: 0 } };
          }
          lines.push(...next.lines);
          if (next.end) endOfInput = true;
        }
      } finally {
        runner.releaseInput();
      }
    },
    [runServer, runner],
  );

  return {
    runSample,
    runOnServer,
    runInteractive,
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
