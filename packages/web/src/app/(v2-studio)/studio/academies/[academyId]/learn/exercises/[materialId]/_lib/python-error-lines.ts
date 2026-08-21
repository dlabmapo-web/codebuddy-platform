'use client';

import {
  classifyPythonError,
  classifySyntaxError,
  pythonErrorFamily,
  pythonErrorSourceLine,
} from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { PythonExecutionError } from '@/lib/pyodide/pythonError';
import type {
  PythonErrorFormatter,
  TerminalLine,
} from '@/lib/workspace/use-python-runner';

/** Just enough of i18next's `t` to compose with, and to fake in a test. */
export type Translate = (
  key: string,
  values?: Record<string, unknown>,
) => string;

/**
 * A raised exception, as the terminal reports it.
 *
 * The multi-line traceback is dropped and Python's own one-line error kept —
 * the part a student can search for verbatim and a teacher reads at a glance —
 * followed by a pointer to the coach, which is already open on the next tab.
 *
 * The teaching itself is deliberately not repeated here. Saying the same thing
 * twice in one pane trains a reader to skip both.
 *
 * Only the five wire-fixed terminal kinds are used, so the teacher's mirrored
 * terminal renders this exactly as the student sees it without a schema
 * change: `err` for Python's own words, `info` for the app's own narration.
 *
 * See docs/superpowers/specs/2026-08-21-python-error-explanation-design.md.
 */
export function pythonErrorLines(
  error: PythonExecutionError,
  code: string,
  t: Translate,
): TerminalLine[] {
  const source = pythonErrorSourceLine(code, error.line);

  const lines: TerminalLine[] = [
    {
      kind: 'err',
      text: error.message
        ? `${error.type}: ${error.message}\n`
        : `${error.type}\n`,
    },
  ];

  if (source !== null) {
    lines.push({
      kind: 'info',
      text: `  ${t('line_label', { line: error.line })}:  ${source}\n`,
    });
  }

  lines.push({ kind: 'info', text: `\n  ${t('coach.terminal_pointer')}\n` });
  return lines;
}

/**
 * The composer, bound to the reader's language.
 *
 * It lives under the route rather than beside the runner for two reasons: the
 * copy is in a namespace this route mounts, and `check-i18n.mjs` only scans
 * `(v2-auth)`, `(v2-studio)`, and `components/studio` for the template literals
 * that keep `explanation.*` and `family.*` off its stale list.
 */
export function usePythonErrorLines(): PythonErrorFormatter {
  const { t } = useTranslation('python-errors');

  return React.useCallback(
    (error, code) => pythonErrorLines(error, code, t as Translate),
    [t],
  );
}

/**
 * The one-line headline for an error: the syntax lesson's title, or the family
 * a runtime error belongs to.
 *
 * Shared by the coach's own heading and the editor's hover on the marked line,
 * so the two can never say different things about the same error.
 */
export function pythonErrorHeadline(
  error: PythonExecutionError,
  t: Translate,
): string {
  const category = classifySyntaxError(error.type, error.message);
  return category
    ? t(`lesson.${category}.title`)
    : t(`family.${pythonErrorFamily(classifyPythonError(error.type))}`);
}

export function usePythonErrorHeadline(): (
  error: PythonExecutionError,
) => string {
  const { t } = useTranslation('python-errors');
  return React.useCallback(
    (error) => pythonErrorHeadline(error, t as Translate),
    [t],
  );
}
