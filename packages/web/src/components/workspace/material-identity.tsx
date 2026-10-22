'use client';

import { Code2, FileText, Film, ListChecks, PenLine, Shapes, BookOpen, type LucideIcon } from 'lucide-react';
import { useLayoutTranslation } from '@/i18n';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/** The same material vocabulary in course lists, drawers and workspace trees. */
export function materialAppearance(type: string, hasReferencePdf = false): {
  Icon: LucideIcon;
  label: 'coding' | 'pdf_coding' | 'pdf' | 'video' | 'quiz' | 'written' | 'turtle' | 'material';
  tone: string;
} {
  switch (type) {
    case 'PROGRAMMING_EXERCISE': return { Icon: Code2, label: hasReferencePdf ? 'pdf_coding' : 'coding', tone: 'bg-brand-soft text-brand' };
    case 'PDF_DOCUMENT': return { Icon: FileText, label: 'pdf', tone: 'bg-danger/10 text-danger' };
    case 'VIDEO_LESSON': return { Icon: Film, label: 'video', tone: 'bg-brand-soft text-brand' };
    case 'MULTIPLE_CHOICE': return { Icon: ListChecks, label: 'quiz', tone: 'bg-success/10 text-success' };
    case 'WRITTEN_RESPONSE': return { Icon: PenLine, label: 'written', tone: 'bg-warning/10 text-warning' };
    case 'TURTLE_EXERCISE': return { Icon: Shapes, label: 'turtle', tone: 'bg-brand-soft text-brand' };
    default: return { Icon: BookOpen, label: 'material', tone: 'bg-canvas text-sub' };
  }
}

export const materialRowClass = 'group flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

export function MaterialIdentity({ title, type, hasReferencePdf, number, compact = false }: {
  title: string; type: string; hasReferencePdf?: boolean; number?: string | number; compact?: boolean;
}) {
  const { t } = useLayoutTranslation('learn');
  const { Icon, label, tone } = materialAppearance(type, hasReferencePdf);
  return <span className="flex min-w-0 flex-1 items-center gap-3">
    {number !== undefined ? <span className="w-5 shrink-0 text-center font-mono text-xs font-semibold tabular-nums text-sub">{number}</span> : null}
    <span className={`grid shrink-0 place-items-center rounded-lg ${compact ? 'size-8' : 'size-10'} ${tone}`}><Icon aria-hidden className={compact ? 'size-4' : 'size-5'} /></span>
    <span className="min-w-0 flex-1">
      <span className={`text-ink ${compact ? 'line-clamp-2 text-[13px] font-semibold leading-5' : 'block text-sm font-semibold leading-5'}`} title={title}>{title}</span>
      <span className="mt-1 block text-xs font-medium text-sub">{t(`materials.${label}`)}</span>
    </span>
  </span>;
}

export function MaterialLink({ href, title, type, number, children }: {
  href: string; title: string; type: string; number?: string | number; children?: ReactNode;
}) {
  return <Link href={href} className={materialRowClass}>
    <MaterialIdentity title={title} type={type} number={number} />
    {children ? <span className="max-w-40 shrink-0 text-right text-xs font-medium text-sub">{children}</span> : null}
    <ChevronRight aria-hidden className="size-4 shrink-0 text-sub transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
  </Link>;
}
