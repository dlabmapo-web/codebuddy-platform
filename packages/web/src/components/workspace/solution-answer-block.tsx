'use client';
import type { ExerciseSolutionEntry } from '@cove/shared';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';
const MonacoEditor = dynamic(() => import('@/lib/monaco/editor'), { ssr: false });

export function SolutionAnswerBlock({ solution, index, fontSize }: { solution: ExerciseSolutionEntry; index: number; fontSize: number }) {
  const { t } = useTranslation('solutions');
  const { t: tm } = useTranslation('monitoring');
  const ref = React.useRef<HTMLElement>(null);
  const [visible, setVisible] = React.useState(index === 0);
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  return <section ref={ref} aria-label={t('answer', { number: index + 1 })} className="min-w-0 space-y-2">
    <div className="flex items-center justify-between gap-3">
      <h3 className="min-w-0 break-words font-semibold">{t('answer', { number: index + 1 })}{solution.title ? ` · ${solution.title}` : ''}</h3>
      <button type="button" className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm" aria-label={t('copy', { number: index + 1 })} onClick={async () => {
        try { await navigator.clipboard.writeText(solution.code); setCopied(true); setFailed(false); }
        catch { setCopied(false); setFailed(true); }
      }}>{copied ? tm('answer.copied') : tm('answer.copy')}</button>
    </div>
    <div className="h-[280px] overflow-hidden rounded-xl border border-border">
      {visible && <MonacoEditor beforeMount={registerPaircodeTheme} height="280px" language="python" theme="paircode-dark" value={solution.code}
        options={{ ariaLabel: t('answer', { number: index + 1 }), automaticLayout: true, fontFamily: EDITOR_FONT_FAMILY, fontSize, lineNumbers: 'on', minimap: { enabled: false }, readOnly: true, scrollBeyondLastLine: false, tabSize: 4, wordWrap: 'off' }} />}
    </div>
    {failed && <p role="alert" className="text-sm text-danger">{tm('answer.copy_failed')}</p>}
  </section>;
}
