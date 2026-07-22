'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export type TerminalKind = 'out' | 'err' | 'in' | 'meta' | 'info';
export type TerminalLine = { text: string; kind: TerminalKind };

const KIND_COLOR: Record<TerminalKind, string> = {
  out: '#D4D4D4',
  err: '#F87171',
  in: '#9CDCFE',
  meta: '#6A9955',
  info: '#8C8C8C',
};

export function ConsoleTerminal({
  lines,
  awaitingInput = false,
  onSubmitInput,
  mode = 'interactive',
  supported = true,
  emptyHint,
  headerTitle,
  headerRight,
  height = 200,
}: {
  lines: TerminalLine[];
  awaitingInput?: boolean;
  onSubmitInput?: (value: string) => void;
  mode?: 'interactive' | 'mirror';
  supported?: boolean;
  emptyHint?: string;
  headerTitle?: string;
  headerRight?: React.ReactNode;
  height?: number;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, awaitingInput]);

  useEffect(() => {
    if (awaitingInput && mode === 'interactive') {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [awaitingInput, mode]);

  const submit = () => {
    if (!onSubmitInput) return;
    onSubmitInput(input);
    setInput('');
  };

  return (
    <div className="flex flex-col" style={{ height, backgroundColor: '#1E1E1E' }}>
      {(headerTitle || headerRight) && (
        <div className="flex items-center justify-between px-4 shrink-0" style={{ height: 34, borderBottom: '1px solid #2D2D2D' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#8C8C8C', letterSpacing: '0.02em' }}>{headerTitle}</span>
          {headerRight}
        </div>
      )}

      {!supported && (
        <div className="flex items-start gap-2 px-4 py-2 shrink-0" style={{ backgroundColor: '#3B2E12', borderBottom: '1px solid #5A481F' }}>
          <AlertTriangle size={13} style={{ color: '#F5C451', marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: '#E8C874', lineHeight: 1.5 }}>
            이 브라우저에서는 대화식 입력이 제한됩니다. 최신 Chrome / Edge / Firefox 를 권장합니다.
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto px-4 py-3"
        style={{ fontFamily: "'Fira Code', Consolas, monospace", fontSize: '12.5px', lineHeight: 1.65 }}
        onClick={() => { if (awaitingInput && mode === 'interactive') inputRef.current?.focus(); }}
      >
        {lines.length === 0 && !awaitingInput ? (
          <div style={{ color: '#5A6270' }}>{emptyHint ?? '실행 버튼을 눌러 코드를 실행해보세요.'}</div>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {lines.map((line, i) => (
              <span key={i} style={{ color: KIND_COLOR[line.kind] }}>{line.text}</span>
            ))}
            {awaitingInput && mode === 'interactive' && (
              <span className="inline-flex items-baseline" style={{ color: '#9CDCFE' }}>
                <span style={{ color: '#4EC9B0', marginRight: 4 }}>❯</span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submit(); }
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  className="focus:outline-none"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#9CDCFE',
                    fontFamily: "'Fira Code', Consolas, monospace",
                    fontSize: '12.5px',
                    caretColor: '#9CDCFE',
                    minWidth: 240,
                  }}
                />
              </span>
            )}
            {awaitingInput && mode === 'mirror' && (
              <span style={{ color: '#4EC9B0' }}>❯ <span style={{ color: '#5A6270' }}>입력 대기 중...</span></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
