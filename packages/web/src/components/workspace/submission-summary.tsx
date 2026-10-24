'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LatestSubmission } from '@cove/shared';
import { formatDateTime } from '@cove/i18n/format';
import { useLocale } from '@/i18n';
import { initTranslationsSync } from '@/i18n/init-translations';
import en from '@cove/i18n/locales/en/submission-summary.json';
import ko from '@cove/i18n/locales/ko/submission-summary.json';

export function SubmissionSummary({ latest, loading = false, failed = false, dark = false }: {
  latest?: LatestSubmission | null; loading?: boolean; failed?: boolean; dark?: boolean;
}) {
  const locale = useLocale();
  const instance = useMemo(() => initTranslationsSync(locale, ['submission-summary'], { en: { 'submission-summary': en }, ko: { 'submission-summary': ko } }), [locale]);
  const { t } = useTranslation('submission-summary', { i18n: instance });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const unavailable = loading ? t('loading') : failed ? t('unavailable') : '—';
  const score = latest ? latest.status === 'GRADED' && latest.scoreHundredths !== null
    ? `${number.format(latest.scoreHundredths / 100)} / ${number.format(latest.maximumHundredths / 100)}`
    : t(`states.${latest.status}`) : unavailable;
  return <dl data-testid="latest-submission-summary" aria-live="polite" className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs ${dark ? 'text-white/55' : 'text-sub'}`}>
    <div className={`min-w-24 border-l pl-3 ${dark ? 'border-white/15' : 'border-border'}`}>
      <dt className="text-[11px] leading-5">{t('score')}</dt>
      <dd className={`font-semibold tabular-nums ${dark ? 'text-white/90' : 'text-ink'}`}>{score}</dd>
    </div>
    <div className={`min-w-0 border-l pl-3 ${dark ? 'border-white/15' : 'border-border'}`}>
      <dt className="text-[11px] leading-5">{t('datetime')}</dt>
      <dd className={`font-medium tabular-nums ${dark ? 'text-white/90' : 'text-ink'}`}>
        {latest ? <time dateTime={latest.createdAt}>{formatDateTime(latest.createdAt, locale, true)}</time> : unavailable}
      </dd>
    </div>
  </dl>;
}
