'use client';

import Link from 'next/link';
import { Languages, Moon, Sun } from 'lucide-react';
import { locales, type Locale } from '@cove/i18n/settings';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { setBrowserLocale } from '@/i18n/client/set-locale';
import { routes } from '@/lib/routes';
import { useTheme } from '@/lib/theme/theme-provider';
import { themes, type Theme } from '@/lib/theme/settings';
import { cn } from '@/lib/utils';

/**
 * Theme and language are the same kind of control: not content, not account
 * actions, but how the interface presents itself to the reader. They sit
 * together at the top right of every page and share one shape, so they read as
 * one unit rather than two unrelated buttons that happen to be adjacent.
 */
const trigger =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sub outline-none transition-colors hover:bg-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 data-[state=open]:bg-accent data-[state=open]:text-ink';

/** Both menus hug the right edge, since both triggers do. */
const menu = 'min-w-[8.5rem] p-1.5';

/**
 * The glyph names the current theme — a sun means the lights are on — and the
 * menu names where you can go. Splitting it that way lets the trigger stay a
 * single icon while every destination is still spelled out in words.
 */
export function ThemeControl({ className }: { className?: string }) {
  const { t } = useLayoutTranslation('common');
  const { theme, setTheme } = useTheme();
  const Icon = theme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('theme.label')}
        className={cn(trigger, 'w-9 px-0', className)}
        title={t('theme.label')}
      >
        <Icon aria-hidden className="size-[1.05rem]" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menu}>
        <DropdownMenuRadioGroup
          onValueChange={(value) => setTheme(value as Theme)}
          value={theme}
        >
          {themes.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t(`theme.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The trigger carries the locale *code* and the menu carries each language's
 * own name. The code answers "what am I reading?" at a glance; `한국어` answers
 * "what can I switch to?" in the one form the reader who needs it can read.
 *
 * The code sits in a fixed-width box so switching language never nudges the
 * controls beside it. On a bilingual product every reader presses this at least
 * once, and a button that reflows its neighbours when used is a defect.
 */
export function LanguageControl({ className }: { className?: string }) {
  const { t } = useLayoutTranslation('common');
  const current = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('language.label')}
        className={cn(trigger, className)}
        title={t('language.label')}
      >
        <Languages aria-hidden className="size-[1.05rem]" strokeWidth={1.75} />
        <span className="min-w-[1.5rem] text-center text-[12px] font-bold uppercase tracking-[0.06em]">
          {current}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menu}>
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            if (value !== current) setBrowserLocale(value as Locale);
          }}
          value={current}
        >
          {locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              {t(`language.${locale}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The way into My Page, from anywhere in Studio.
 *
 * A face rather than a gear: the destination is the person's own account, and
 * an avatar is the one control on this bar whose meaning nobody has to be
 * taught. It sits beside theme and language because all three are about the
 * reader rather than about the page they are on.
 */
export function ProfileControl({
  className,
  academyImageUrl,
  imageUrl,
  avatarUrl,
  name,
}: {
  className?: string;
  /** The current membership's academy override. */
  academyImageUrl?: string | null;
  /** The Cove image, when the account has uploaded one. */
  imageUrl?: string | null;
  /** The external OAuth photo, as the fallback beneath it. */
  avatarUrl?: string | null;
  name?: string | null;
}) {
  const { t } = useLayoutTranslation('nav');

  return (
    <Link
      aria-label={t('my_page')}
      className={cn(trigger, 'w-9 px-0', className)}
      href={routes.account}
      title={t('my_page')}
    >
      <ProfileAvatar
        academyImageUrl={academyImageUrl}
        globalImageUrl={imageUrl}
        externalAvatarUrl={avatarUrl}
        name={name}
        size="sm"
      />
    </Link>
  );
}

/** The set, in the order they appear at the top right of every page. */
export function HeaderControls({
  className,
  account,
}: {
  className?: string;
  /** Absent on surfaces that have no session to describe. */
  account?: {
    academyImageUrl?: string | null;
    imageUrl: string | null;
    avatarUrl: string | null;
    name: string | null;
  };
}) {
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <LanguageControl />
      <ThemeControl />
      {account ? (
        <ProfileControl
          academyImageUrl={account.academyImageUrl}
          avatarUrl={account.avatarUrl}
          imageUrl={account.imageUrl}
          name={account.name}
        />
      ) : null}
    </div>
  );
}
