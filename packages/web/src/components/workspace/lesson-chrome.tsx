'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, LogOut, Maximize2 } from 'lucide-react';
import { useLayoutTranslation } from '@/i18n';
import { usePracticeTranslation } from './use-practice-translation';

const lessonButton = 'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40';
export const lessonAction = `${lessonButton} border-border bg-card text-ink hover:border-brand/40 hover:bg-brand-soft`;
export const lessonPrimary = `${lessonButton} border-transparent bg-brand text-on-brand hover:bg-brand-deep`;

/** Shared navigation chrome; individual workspaces retain their own save and permission guards. */
export function LessonHeader({ curriculum, courseTitle, lectureTitle, title, badge, children, leaveHref }: {
  curriculum?: ReactNode; courseTitle: string; lectureTitle?: string; title: string;
  badge?: ReactNode; children?: ReactNode; leaveHref?: string;
}) {
  const { t } = usePracticeTranslation();
  return <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2.5">
    {curriculum}
    <div className="min-w-0 flex-1 basis-40">
      <p className="truncate text-xs text-sub">{courseTitle}{lectureTitle ? ` / ${lectureTitle}` : ''}</p>
      <div className="mt-0.5 flex min-w-0 items-center gap-2"><h1 className="truncate text-[15px] font-bold leading-tight">{title}</h1>{badge}</div>
    </div>
    <div className="flex max-w-full flex-wrap items-center gap-2">{children}
      {leaveHref ? <Link href={leaveHref} className={lessonPrimary}><LogOut aria-hidden className="size-3.5" />{t('leave')}</Link> : null}
    </div>
  </header>;
}

export function LessonFooter({ previous, next, index, total, disabled = false, onFullscreen }: {
  previous?: { href?: string; onClick?: () => void } | null;
  next?: { href?: string; onClick?: () => void } | null;
  index: number; total: number; disabled?: boolean; onFullscreen?: () => void;
}) {
  const { t } = useLayoutTranslation('learn');
  const { t: pt } = usePracticeTranslation();
  function navigation(direction: 'previous' | 'next', item: typeof previous) {
    const label = t(`workspace.${direction}`);
    const contents = <>{direction === 'previous' ? <ChevronLeft aria-hidden className="size-4" /> : null}<span>{label}</span>{direction === 'next' ? <ChevronRight aria-hidden className="size-4" /> : null}</>;
    const className = direction === 'next' ? lessonPrimary : lessonAction;
    return item?.href && !disabled ? <Link aria-label={label} className={className} href={item.href}>{contents}</Link>
      : <button aria-label={label} type="button" className={className} disabled={disabled || !item} onClick={item?.onClick}>{contents}</button>;
  }
  return <footer className="relative flex min-h-14 shrink-0 flex-wrap items-center justify-center gap-3 border-t border-border bg-card px-3 py-2 pr-12 text-sm">
    {navigation('previous', previous)}
    <span className="text-xs font-semibold tabular-nums text-sub" aria-live="polite">{index > 0 ? index : '—'} / {total}</span>
    {navigation('next', next)}
    <button type="button" className="absolute right-3 grid size-9 place-items-center rounded-lg text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand" aria-label={pt('fullscreen')}
      onClick={onFullscreen ?? (() => { if (document.fullscreenElement) void document.exitFullscreen?.(); else void document.documentElement.requestFullscreen?.().catch(() => undefined); })}>
      <Maximize2 aria-hidden className="size-4" />
    </button>
  </footer>;
}
