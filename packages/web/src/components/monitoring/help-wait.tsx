'use client';
import { helpWaitSeconds, type HelpRequest } from '@cove/shared';
import { useTranslation } from 'react-i18next';

export function HelpWait({ request, now }: { request: HelpRequest; now: number }) {
  const { t } = useTranslation('monitoring');
  const seconds = helpWaitSeconds(request, now);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  const duration = [days ? t('help.days', { count: days }) : '', hours ? t('help.hours', { count: hours }) : '', t('help.minutes', { count: minutes }), !days && !hours ? t('help.seconds', { count: seconds % 60 }) : ''].filter(Boolean).join(' ');
  return <span className={`whitespace-nowrap tabular-nums text-xs font-semibold ${request.status === 'WAITING' ? 'text-warning' : 'text-brand'}`}>{t(request.status === 'IN_PROGRESS' ? 'help.waited' : 'help.waiting')} · {duration}</span>;
}
