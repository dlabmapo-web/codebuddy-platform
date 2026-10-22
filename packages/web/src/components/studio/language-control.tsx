'use client';

import { locales, localeCodes, type Locale } from '@cove/i18n/settings';
import { useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './overlays';
import { LocaleFlag } from './locale-flag';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { setBrowserLocale } from '@/i18n/client/set-locale';
import { cn } from '@/lib/utils';

const trigger = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sub outline-none transition-colors hover:bg-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 data-[state=open]:bg-accent data-[state=open]:text-ink';
const menu = 'min-w-[8.5rem] p-1.5';

/**
 * The trigger carries the current language as a flag and a code; the menu
 * carries each language's own name beside its flag. The code answers "what am
 * I reading?" at a glance, `한국어` answers "what can I switch to?" in the one
 * form the reader who needs it can read, and the flag answers both before
 * either is read at all.
 *
 * The flag replaces the generic `Languages` glyph rather than joining it. That
 * icon said "this control is about language" — which the code beside it already
 * said — where the flag says *which* language, so keeping both would spend the
 * width on the less useful half.
 *
 * The code sits in a fixed-width box and both spellings are three letters, so
 * switching language never nudges the controls beside it. On a bilingual
 * product every reader presses this at least once, and a button that reflows
 * its neighbours when used is a defect.
 */
export function LanguageControl({ className }: { className?: string }) {
  const { t } = useLayoutTranslation('common');
  const current = useLocale();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <DropdownMenu onOpenChange={open => {
      if (open) setContainer(document.fullscreenElement as HTMLElement | null);
    }}>
      <DropdownMenuTrigger
        aria-label={t('language.label')}
        className={cn(trigger, className)}
        title={t('language.label')}
      >
        <LocaleFlag locale={current} />
        <span className="min-w-[1.75rem] text-center text-[12px] font-bold tracking-[0.06em]">
          {localeCodes[current]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menu} portalContainer={container}>
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            if (value !== current) setBrowserLocale(value as Locale);
          }}
          value={current}
        >
          {locales.map((locale) => (
            // `RadioItem` carries no gap of its own, unlike `MenuItem`.
            <DropdownMenuRadioItem className="gap-2" key={locale} value={locale}>
              <LocaleFlag locale={locale} />
              {t(`language.${locale}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

