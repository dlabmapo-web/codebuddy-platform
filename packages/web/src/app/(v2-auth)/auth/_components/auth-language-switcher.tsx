'use client';

import {
  locales,
  type Locale,
} from '@cove/i18n/settings';

import { useLayoutTranslation, useLocale } from '@/i18n';
import { setBrowserLocale } from '@/i18n/client/set-locale';
import { cn } from '@/lib/utils';

/**
 * A two-locale segmented control rather than the sidebar's dropdown: on the
 * auth screens there is nothing else competing for the header, and one tap
 * beats open-then-pick.
 */
export function AuthLanguageSwitcher() {
  const { t } = useLayoutTranslation('common');
  const current = useLocale();

  function changeLocale(next: Locale) {
    if (next === current) return;
    setBrowserLocale(next);
  }

  return (
    <div
      aria-label={t('language.label')}
      className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
      role="group"
    >
      {locales.map((locale) => (
        <button
          aria-pressed={locale === current}
          className={cn(
            'rounded-md px-2.5 py-1 text-[13px] font-semibold transition-colors',
            locale === current
              ? 'bg-brand text-white'
              : 'text-sub hover:text-ink',
          )}
          key={locale}
          onClick={() => changeLocale(locale)}
          type="button"
        >
          {t(`language.${locale}`)}
        </button>
      ))}
    </div>
  );
}
