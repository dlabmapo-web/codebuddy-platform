'use client';

import { AlertTriangle, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import type { TerminalKind, TerminalLine } from '../_hooks/use-python-runner';

const kindClass: Record<TerminalKind, string> = {
  out: 'text-[#D4D4D4]',
  err: 'text-[#F87171]',
  in: 'text-[#9CDCFE]',
  meta: 'text-[#6A9955]',
  info: 'text-[#8C8C8C]',
};

export function TerminalPanel({
  lines,
  awaitingInput,
  onSubmitInput,
  supported,
}: {
  lines: TerminalLine[];
  awaitingInput: boolean;
  onSubmitInput: (value: string) => void;
  supported: boolean;
}) {
  const { t } = useLayoutTranslation('learn');
  const [value, setValue] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, awaitingInput]);

  React.useEffect(() => {
    if (!awaitingInput) return;
    // A frame's delay lets the prompt paint before focus moves, which stops
    // the caret jumping while the last output line is still rendering.
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [awaitingInput]);

  const submit = () => {
    onSubmitInput(value);
    setValue('');
  };

  return (
    <div className="flex min-h-0 flex-col">
      {!supported ? (
        <p className="flex items-start gap-2 border-b border-white/10 bg-warning/10 px-3 py-2 text-[12px] leading-5 text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {t('workspace.interactive_unsupported')}
        </p>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12.5px] leading-[1.65]"
        ref={scrollRef}
      >
        {lines.length === 0 && !awaitingInput ? (
          <p className="text-[#8C8C8C]">{t('workspace.terminal_hint')}</p>
        ) : (
          lines.map((line, index) => (
            <span className={`whitespace-pre-wrap ${kindClass[line.kind]}`} key={index}>
              {line.text}
            </span>
          ))
        )}

        {awaitingInput ? (
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
      </div>
    </div>
  );
}
