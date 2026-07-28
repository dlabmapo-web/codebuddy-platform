'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

type CopyState = 'idle' | 'copied' | 'error';

export function SampleInputCopyButton({
  input,
  sampleNumber,
}: {
  input: string;
  sampleNumber: number;
}) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  if (!input) return null;

  const copyInput = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(input);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopyState('idle'), 2200);
  };

  const visibleMessage = copyState === 'copied'
    ? '복사됨'
    : copyState === 'error'
      ? '복사하지 못했습니다'
      : '복사';
  const announcement = copyState === 'copied'
    ? `예제 입력 ${sampleNumber} 복사됨`
    : copyState === 'error'
      ? `예제 입력 ${sampleNumber}을 복사하지 못했습니다`
      : '';

  return (
    <>
      <button
        type="button"
        onClick={copyInput}
        aria-label={`예제 입력 ${sampleNumber} 복사`}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md px-2 transition-colors"
        style={{
          height: 26,
          border: '1px solid var(--code-border)',
          backgroundColor: copyState === 'copied' ? '#14352C' : '#242424',
          color: copyState === 'error' ? '#F87171' : copyState === 'copied' ? '#6EE7B7' : '#D4D4D4',
          fontSize: '11px',
          fontWeight: 600,
        }}
      >
        {copyState === 'copied' ? <Check size={12} /> : <Copy size={12} />}
        {visibleMessage}
      </button>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
