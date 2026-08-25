'use client';

import {
  buildErrorFocus,
  classifyPythonError,
  classifySyntaxError,
  pythonErrorFamily,
  type ErrorFocus,
} from '@cove/shared';
import { CornerDownRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { PythonExecutionError } from '@/lib/pyodide/pythonError';

import type { Translate } from '../_lib/python-error-lines';

/**
 * The error coach: what went wrong, where, why, and what to try.
 *
 * Ported from `SyntaxErrorCoach` on `feat/AI-assistant`, whose two-colour rule
 * is the reason it reads at a glance — amber means "the problem is here",
 * green means "this is what right looks like", and everything else is greyscale
 * so a student's eye goes to those two places and nowhere else. It sits
 * directly on the editor background rather than in a card, so it reads as part
 * of the editor instead of a dialog over it.
 *
 * Syntax errors get the full lesson, because Python's message identifies the
 * actual mistake. Anything else gets the shorter runtime explanation, which
 * knows the kind of error but not the fix.
 *
 * See docs/superpowers/specs/2026-08-21-python-error-explanation-design.md.
 */
export function ErrorCoachPanel({
  code,
  error,
  onFocusLine,
}: {
  error: PythonExecutionError;
  /** The editor's contents, so the coach can show the failing line in place. */
  code: string;
  /** Moves the editor caret to the reported spot. */
  onFocusLine?: (line: number, column: number) => void;
}) {
  const { t: translate } = useTranslation('python-errors');
  const t = translate as Translate;
  const category = classifySyntaxError(error.type, error.message);
  const focus = buildErrorFocus(code, error.line, error.offset);

  const kind = classifyPythonError(error.type);
  const lesson = category
    ? {
        title: t(`lesson.${category}.title`),
        what: t(`lesson.${category}.what`),
        why: t(`lesson.${category}.why`),
        detail: t(`lesson.${category}.where`),
        example: t(`lesson.${category}.example`),
        next: t(`lesson.${category}.next`),
      }
    : {
        title: t(`family.${pythonErrorFamily(kind)}`),
        what: t(`explanation.${kind}`),
        why: null,
        detail: null,
        example: null,
        next: null,
      };

  const where = whereText({
    detail: lesson.detail,
    line: error.line,
    column: focus?.caretColumn === undefined ? null : focus.caretColumn,
    t,
  });

  return (
    <section
      className="px-4 py-4 font-sans text-[13px] leading-[1.75] text-[#d4d4d4] sm:px-5"
      data-testid="error-coach"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        {focus ? (
          <LocationChip
            column={focus.caretColumn === null ? null : focus.caretColumn + 1}
            line={focus.lineNo}
            onClick={
              onFocusLine
                ? () => onFocusLine(focus.lineNo, (focus.caretColumn ?? 0) + 1)
                : undefined
            }
            t={t}
          />
        ) : null}
        <h3 className="text-[16px] font-bold tracking-[-0.01em] text-[#f1f3f6]">
          {lesson.title}
        </h3>
      </header>

      <div className="mt-3.5 grid gap-x-6 gap-y-4 border-t border-[#2a303b] pt-3.5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {focus ? <CodeExcerpt focus={focus} label={t('coach.my_code')} /> : null}
          {where ? (
            <p className={`text-[12px] text-[#8a93a2] ${focus ? 'mt-2' : ''}`}>
              {where}
            </p>
          ) : null}

          {lesson.example ? (
            <>
              <p className="mt-4 text-[11px] font-bold tracking-[0.01em] text-[#6a9955]">
                {t('coach.example_heading')}
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded-md border-l-2 border-[#6a9955] bg-[#14171d] px-3 py-2.5 font-mono text-[12px] leading-[1.65] text-[#d4d4d4]">
                {lesson.example}
              </pre>
            </>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.01em] text-[#8a93a2]">
            {t('coach.why_heading')}
          </p>
          <p className="mt-1.5">{lesson.what}</p>
          {lesson.why ? <p className="mt-2 text-[#8a93a2]">{lesson.why}</p> : null}
        </div>
      </div>

      {lesson.next ? (
        <p className="mt-4 flex items-start gap-2 border-t border-[#2a303b] pt-3">
          <CornerDownRight
            aria-hidden
            className="mt-1 size-[15px] shrink-0 text-[#e8a33d]"
          />
          <span>{lesson.next}</span>
        </p>
      ) : null}
    </section>
  );
}

/**
 * The failing line with its neighbours, and a caret under the exact character.
 *
 * The gutter is `sticky left-0` and opaque: a long line scrolls horizontally
 * underneath the line numbers rather than through them.
 */
function CodeExcerpt({ focus, label }: { focus: ErrorFocus; label: string }) {
  const gutter = `${String(focus.lines[focus.lines.length - 1]!.no).length + 1}ch`;

  return (
    <>
      <p className="text-[11px] font-bold tracking-[0.01em] text-[#8a93a2]">
        {label}
      </p>
      <div className="mt-1.5 overflow-x-auto rounded-md border border-[#2a303b] bg-[#14171d] py-2">
        {focus.lines.map((line) => (
          <div key={line.no}>
            <div className={`flex ${line.isError ? 'bg-[#272420]' : ''}`}>
              <span
                aria-hidden
                className={`sticky left-0 shrink-0 select-none px-3 text-right font-mono text-[12px] leading-[1.65] ${
                  line.isError
                    ? 'bg-[#272420] text-[#e8a33d]'
                    : 'bg-[#14171d] text-[#8a93a2]'
                }`}
                style={{ width: gutter, boxSizing: 'content-box' }}
              >
                {line.no}
              </span>
              <pre
                className={`whitespace-pre pr-3 font-mono text-[12px] leading-[1.65] ${
                  line.isError ? 'text-[#d4d4d4]' : 'text-[#8a93a2]'
                }`}
              >
                {line.text || ' '}
              </pre>
            </div>

            {line.isError && focus.caretColumn !== null ? (
              <div aria-hidden className="flex bg-[#14171d]">
                <span
                  className="sticky left-0 shrink-0 bg-[#14171d] px-3 font-mono text-[12px] leading-[1.65]"
                  style={{ width: gutter, boxSizing: 'content-box' }}
                />
                <pre className="whitespace-pre font-mono text-[12px] leading-[1.65] text-[#e8a33d]">
                  {`${' '.repeat(focus.caretColumn)}^`}
                </pre>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

/** The reported position. Pressing it puts the editor caret there. */
function LocationChip({
  line,
  column,
  onClick,
  t,
}: {
  line: number;
  column: number | null;
  onClick?: () => void;
  t: Translate;
}) {
  const text =
    column === null
      ? t('coach.location_line_only', { line })
      : t('coach.location', { line, column });
  const chip =
    'shrink-0 rounded border border-[#e8a33d]/40 bg-[#e8a33d]/[0.13] px-2 py-0.5 font-mono text-[12px] font-semibold text-[#e8a33d]';

  if (!onClick) return <span className={chip}>{text}</span>;

  return (
    <button
      className={`${chip} transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8a33d]/70`}
      onClick={onClick}
      title={t('coach.goto')}
      type="button"
    >
      {text}
    </button>
  );
}

function whereText({
  detail,
  line,
  column,
  t,
}: {
  detail: string | null;
  line: number | null;
  column: number | null;
  t: Translate;
}): string | null {
  if (detail === null) return null;
  if (line === null) return t('coach.where_no_line', { detail });
  if (column === null) return t('coach.where_line_only', { detail, line });
  return t('coach.where_with_column', { column: column + 1, detail, line });
}
