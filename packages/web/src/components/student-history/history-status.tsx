'use client';

import {CheckCircle2, Circle, CircleDashed, ClipboardCheck, Clock3} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {HistoryMaterial} from '@cove/shared';
import {useReviewTranslation} from '@/components/programming-review/use-review-translation';

export function HistoryStatus({status, manualReview}: Pick<HistoryMaterial,'status'|'manualReview'>) {
  const {t} = useTranslation('teach'), reviewText = useReviewTranslation();
  if (manualReview?.state === 'GRADED' && status !== 'previous_revision') return <span className="inline-flex flex-col items-start gap-1.5" data-testid="history-manual-assessment">
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-1 text-[11px] font-semibold text-brand"><ClipboardCheck aria-hidden className="size-3.5" />{reviewText('graded_short')}</span>
    <span className={`text-[11px] ${manualReview.completed ? 'text-success' : 'text-warning'}`}>{reviewText(manualReview.completed ? 'complete' : 'needs_work')}</span>
  </span>;
  const Icon = status === 'completed' ? CheckCircle2 : status === 'pending' ? Clock3 : status === 'in_progress' ? CircleDashed : Circle;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${status === 'completed' ? 'bg-success/10 text-success' : ['in_progress','pending'].includes(status) ? 'bg-warning/10 text-warning' : 'bg-canvas text-sub'}`}>
    <Icon aria-hidden className="size-3.5" />{t(`history.statuses.${status}`)}
  </span>;
}
