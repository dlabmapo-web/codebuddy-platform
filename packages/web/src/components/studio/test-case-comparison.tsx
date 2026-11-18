'use client';

import { useTranslation } from 'react-i18next';
import { caseComparators } from '@cove/shared';

const settings = [
  'visibility', 'comparator', 'weight', 'timeLimitMsOverride', 'softTimeLimitMs', 'softPenalty',
] as const;

/** Literal input/output first; fixed-order settings only when an editor needs them. */
export function TestCaseComparison({ value, previous }: {
  value: Record<string, unknown>;
  previous?: unknown;
}) {
  const { t } = useTranslation('library-sync');
  const before = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous as Record<string, unknown> : null;
  const changed = settings.some(key => before && (value[key] ?? null) !== (before[key] ?? null));

  function settingValue(key: typeof settings[number]) {
    const item = value[key];
    if (item === null || item === undefined) {
      return t(key === 'timeLimitMsOverride' ? 'compare.case.inherit_limit' : 'compare.case.not_set');
    }
    if (key === 'visibility' && (item === 'SAMPLE' || item === 'HIDDEN')) return t(`compare.case.visibility_${item}`);
    const comparator = caseComparators.find(candidate => candidate === item);
    if (key === 'comparator' && comparator) return t(`compare.case.comparator_${comparator}`);
    return String(item);
  }

  return <div className="space-y-4">
    {typeof value.label === 'string' && value.label.trim() ? <p className="text-[13px] font-semibold text-ink">{value.label}</p> : null}
    {(['input', 'expectedOutput'] as const).map(key => {
      const text = typeof value[key] === 'string' ? value[key] : '';
      return <div className="min-w-0" key={key}>
        <h3 className="mb-1.5 text-[12px] font-semibold text-sub">{t(`compare.case.${key}`)}</h3>
        <div className="min-h-16 rounded-lg border border-border bg-card px-3 py-3">
          {text ? <pre tabIndex={0} aria-label={t(`compare.case.${key}`)} className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-ink">{text}</pre>
            : <p className="text-[13px] italic text-sub">{t('compare.case.empty')}</p>}
        </div>
      </div>;
    })}
    <details className="border-t border-border pt-3" open={changed}>
      <summary className={`cursor-pointer text-[12px] font-semibold ${changed ? 'text-brand' : 'text-sub'}`}>
        {t(changed ? 'compare.case.settings_changed' : 'compare.case.settings')}
      </summary>
      <dl className="mt-3 space-y-2">
        {settings.map(key => <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12.5px]" key={key}>
          <dt className="text-sub">{t(`compare.case.${key}`)}</dt>
          <dd className={`font-medium ${before && (value[key] ?? null) !== (before[key] ?? null) ? 'text-brand' : 'text-ink'}`}>{settingValue(key)}</dd>
        </div>)}
      </dl>
    </details>
  </div>;
}
