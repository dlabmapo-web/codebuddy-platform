'use client';

import { Languages } from 'lucide-react';
import * as React from 'react';
import {
  locales,
  type Locale,
} from '@cove/i18n/settings';

import {
  ResponsiveSelector,
  type SelectorItem,
  type TriggerProps,
} from '@/components/studio/selector';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { setBrowserLocale } from '@/i18n/client/set-locale';
import { cn } from '@/lib/utils';

/** Matches the sidebar footer's sign-out row, including its collapsed state. */
const LanguageTrigger = React.forwardRef<
  HTMLButtonElement,
  TriggerProps<SelectorItem>
>(function LanguageTrigger({ className, selectedItem, ...props }, ref) {
  const { t } = useLayoutTranslation('common');
  return (
    <button
      aria-label={t('language.label')}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-semibold text-sub outline-none transition-colors hover:bg-sidebar-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40',
        'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
        className,
      )}
      ref={ref}
      type="button"
      {...props}
    >
      <Languages className="size-[1.05rem] shrink-0" />
      <span className="truncate group-data-[collapsible=icon]:hidden">
        {selectedItem?.name}
      </span>
    </button>
  );
});

/**
 * Switching writes the cookie and reloads.
 *
 * A full reload rather than `router.refresh()`: the server tree, the client
 * i18next instance, and every cached React Query entry have to agree on the
 * language, and a reload guarantees that for what is a rare, deliberate action.
 */
export function LanguageSwitcher() {
  const { t } = useLayoutTranslation('common');
  const current = useLocale();
  const localeOptions: SelectorItem[] = locales.map((locale) => ({
    id: locale,
    name: t(`language.${locale}`),
  }));

  function changeLocale(next: Locale) {
    if (next === current) return;
    setBrowserLocale(next);
  }

  return (
    <ResponsiveSelector
      align="start"
      drawerTitle={t('language.label')}
      list={localeOptions}
      onSelect={(option) => changeLocale(option.id as Locale)}
      placeholder={t('state.search_placeholder')}
      popoverClassName="w-44"
      selectedId={current}
      side="top"
      TriggerComp={LanguageTrigger}
    />
  );
}
