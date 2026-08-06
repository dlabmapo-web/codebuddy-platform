'use client';

import { AlertTriangle, ChevronRight, LoaderCircle } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import type { TerminalKind, TerminalLine } from '@/lib/workspace/use-python-runner';

const kindClass: Record<TerminalKind, string> = {
  out: 'text-[#D4D4D4]',
  err: 'text-[#F87171]',
  in: 'text-[#9CDCFE]',
  meta: 'text-[#6A9955]',
  info: 'text-[#8C8C8C]',
};

/**
 * One terminal, in one of two modes.
 *
 * `interactive` owns a Python process: it renders an input field, and what the
 * reader types reaches that process. `mirror` renders somebody else's terminal —
 * the same lines, the same colours, the same auto-scroll — and has no way to
 * write to it. The distinction is a mode rather than a second component so the
 * two can never drift apart visually, and a prop rather than a permission check
 * so a mirrored panel has nothing to be given.
 */
export function TerminalPanel({
  awaitingInput,
  emptyHint,
  lines,
  mode = 'interactive',
  onSubmitInput,
  supported,
  synchronizing,
  synchronizingLabel,
  waitingLabel,
}: {
  lines: TerminalLine[];
  awaitingInput: boolean;
  /** Absent in mirror mode: there is no process on this side to feed. */
  onSubmitInput?: (value: string) => void;
  supported: boolean;
  mode?: 'interactive' | 'mirror';
  /** What an empty terminal says. Whose terminal it is decides the wording. */
  emptyHint?: string;
  /** How a waiting program is described when nobody here can answer it. */
  waitingLabel?: string;
  /** Mirror mode only: a gap is being repaired from a snapshot. */
  synchronizing?: boolean;
  synchronizingLabel?: string;
}) {
  const { t } = useLayoutTranslation('learn');
  const [value, setValue] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const mirrored = mode === 'mirror';

  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, awaitingInput]);

  React.useEffect(() => {
    if (!awaitingInput || mirrored) return;
    // A frame's delay lets the prompt paint before focus moves, which stops
    // the caret jumping while the last output line is still rendering.
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [awaitingInput, mirrored]);

  const submit = () => {
    onSubmitInput?.(value);
    setValue('');
  };

  return (
    // `h-full` rather than auto: the log scrolls inside this box, which is what
    // lets the effect above keep the newest line in view instead of leaving an
    // ancestor to scroll and the caret to drift off screen.
    <div className="flex h-full min-h-0 flex-col">
      {!supported && !mirrored ? (
        <p className="flex items-start gap-2 border-b border-white/10 bg-warning/10 px-3 py-2 text-[12px] leading-5 text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {t('workspace.interactive_unsupported')}
        </p>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12.5px] leading-[1.65]"
        data-testid={mirrored ? 'mirrored-terminal' : 'terminal'}
        ref={scrollRef}
      >
        {lines.length === 0 && !awaitingInput ? (
          <p className="text-[#8C8C8C]">
            {emptyHint ?? t('workspace.terminal_hint')}
          </p>
        ) : (
          lines.map((line, index) => (
            <span className={`whitespace-pre-wrap ${kindClass[line.kind]}`} key={index}>
              {line.text}
            </span>
          ))
        )}

        {awaitingInput && mirrored ? (
          // Passive on purpose: the program is waiting for the student, and a
          // field here would offer to answer for them.
          <p
            className="mt-1 flex items-center gap-1.5 text-[#9CDCFE]"
            data-testid="mirrored-waiting"
          >
            <ChevronRight className="size-3.5 shrink-0" />
            {waitingLabel ?? t('workspace.stdin_prompt')}
          </p>
        ) : null}

        {awaitingInput && !mirrored ? (
          <div className="mt-1 flex items-center gap-1.5">
            <ChevronRight className="size-3.5 shrink-0 text-[#9CDCFE]" />
            <input
              aria-label={t('workspace.stdin_prompt')}
              className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-[#9CDCFE] outline-none"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
              ref={inputRef}
              value={value}
            />
          </div>
        ) : null}

        {synchronizing && synchronizingLabel ? (
          <p
            className="mt-1 flex items-center gap-1.5 text-[#8C8C8C]"
            data-testid="mirrored-synchronizing"
          >
            <LoaderCircle
              aria-hidden
              className="size-3.5 shrink-0 motion-safe:animate-spin"
            />
            {synchronizingLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}
