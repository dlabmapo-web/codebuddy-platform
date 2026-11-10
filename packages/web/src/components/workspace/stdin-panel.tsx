'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * What a C/C++ program reads when the student presses Run.
 *
 * Its programs run on the grading server, which takes all of their input up
 * front; a program that reads past it gets end-of-file. Prefilled with the
 * first example's input. Typing into a running program is phase 2.
 */
export function StdinPanel({
  value,
  onChange,
  onReset,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Puts the first example's input back, or absent when there is none. */
  onReset?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('sample-check');
  const id = React.useId();
  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-white/10 bg-[#252526] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <label className="font-mono text-[11px] font-semibold text-[#c8c8c8]" htmlFor={id}>
          {t('workspace.stdin_label')}
        </label>
        <span className="truncate text-[10.5px] text-[#8c8c8c]" id={`${id}-hint`}>
          {t('workspace.stdin_hint')}
        </span>
        {onReset ? (
          <button
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10.5px] text-[#9cdcfe] hover:bg-white/10 disabled:opacity-50"
            disabled={disabled}
            onClick={onReset}
            type="button"
          >
            {t('workspace.stdin_reset')}
          </button>
        ) : null}
      </div>
      <textarea
        aria-describedby={`${id}-hint`}
        className="h-16 resize-y rounded bg-[#1e1e1e] px-2 py-1 font-mono text-[12px] text-[#d4d4d4] outline-none ring-1 ring-inset ring-white/10 focus:ring-brand/60 disabled:opacity-60"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={value}
      />
    </div>
  );
}
