import { displayTimeZone } from '@cove/i18n/settings';
import type { TFunction } from 'i18next';

/** "26. 11. 20. 12:11", Elice's short form, in the academy's time zone. */
export function formatExamDate(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: displayTimeZone, year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}. ${get('month')}. ${get('day')}. ${get('hour').replace('24', '00')}:${get('minute')}`;
}

/** "01:39:46" from milliseconds, never negative. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function formatDuration(t: TFunction<'exam'>, minutes: number | null): string {
  if (minutes == null) return t('time_limit_none');
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return t('duration_hm', { hours, minutes: rest });
  if (hours) return t('duration_h', { hours });
  return t('duration_m', { minutes: rest });
}

export function formatPeriod(t: TFunction<'exam'>, schedule: { opensAt: Date | string | null; closesAt: Date | string | null }): string {
  const { opensAt, closesAt } = schedule;
  if (opensAt && closesAt) return t('period_range', { from: formatExamDate(opensAt), to: formatExamDate(closesAt) });
  if (opensAt) return t('period_from', { from: formatExamDate(opensAt) });
  if (closesAt) return t('period_until', { to: formatExamDate(closesAt) });
  return t('period_always');
}

/** The test's own guide as rules (one per line), or the six defaults. */
export function guideRules(guide: string, locale: string, defaults: { ko: readonly string[]; en: readonly string[] }): string[] {
  const own = guide.split('\n').map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  if (own.length) return own;
  return [...(locale.startsWith('ko') ? defaults.ko : defaults.en)];
}
