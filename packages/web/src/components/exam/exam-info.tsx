'use client';

import { examDefaultRules } from '@cove/shared';
import { CalendarClock, ListChecks, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { formatDuration, formatPeriod, guideRules } from './exam-format';

/** 응시 기간 · 제한 시간 · 문제 수, the three tiles Elice shows everywhere. */
export function ExamInfoTiles({
  schedule, timeLimitMinutes, itemCount, icons = false,
}: {
  schedule: { opensAt: Date | string | null; closesAt: Date | string | null };
  timeLimitMinutes: number | null;
  itemCount: number;
  icons?: boolean;
}) {
  const { t } = useTranslation('exam');
  const tiles = [
    { icon: CalendarClock, label: t('period'), value: formatPeriod(t, schedule) },
    { icon: Timer, label: t('time_limit'), value: formatDuration(t, timeLimitMinutes) },
    { icon: ListChecks, label: t('problem_count'), value: t('problem_count_value', { count: itemCount }) },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-start gap-3 rounded-xl bg-surface px-4 py-3.5">
          {icons ? <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-sub" /> : null}
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-ink">{label}</div>
            <div className="mt-1 text-[13px] text-sub">{value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExamRules({ guide, compact = false }: { guide: string; compact?: boolean }) {
  const { i18n } = useTranslation('exam');
  const rules = guideRules(guide, i18n.language, examDefaultRules);
  return (
    <ol className={`list-decimal rounded-xl bg-surface ${compact ? 'space-y-1 px-8 py-4 text-[12.5px]' : 'space-y-2 px-9 py-5 text-[13px]'} leading-relaxed text-ink`}>
      {rules.map((rule, index) => <li key={index}>{rule}</li>)}
    </ol>
  );
}
