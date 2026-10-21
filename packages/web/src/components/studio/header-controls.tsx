'use client';

import Link from 'next/link';
import type * as React from 'react';
import { useState } from 'react';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { locales, localeCodes, type Locale } from '@cove/i18n/settings';
import type { AcademyRole } from '@cove/shared';

import { useSignOut } from '@/app/(auth)/_components/sign-out-control';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { RoleBadge } from '@/components/studio/role-badge';
import { LocaleFlag } from '@/components/studio/locale-flag';
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

  return (
    <DropdownMenu>
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
      <DropdownMenuContent align="end" className={menu}>
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

/** Account identity and navigation; staff capabilities never need a role-mode switch. */
export function ProfileControl({
  className,
  academySlug,
  academyImageUrl,
  imageUrl,
  avatarUrl,
  name,
  role,
  roles,
}: {
  className?: string;
  academyId?: string;
  /** Academy-scoped account destination. */
  academySlug?: string;
  /** The current membership's academy override. */
  academyImageUrl?: string | null;
  /** The Cove image, when the account has uploaded one. */
  imageUrl?: string | null;
  /** The external OAuth photo, as the fallback beneath it. */
  avatarUrl?: string | null;
  name?: string | null;
  /** Primary academy identity. */
  role?: AcademyRole | null;
  /** Held grants; the primary role remains the displayed identity. */
  roles?: readonly AcademyRole[];
}) {
  const { t } = useLayoutTranslation(['nav', 'common']);
  const [open, setOpen] = useState(false);
  const logout = useSignOut();
  const primary = role ?? roles?.at(-1);

  return (
    <>
      <DropdownMenu onOpenChange={setOpen} open={open}>
        {/*
          `rounded-full`, unlike every other control on this bar.
          A focus ring follows the trigger's shape, and a rounded *square* ring
          around a circular avatar reads as a stray border rather than as focus —
          which is how it looked after closing the menu, when Radix returns focus
          to the trigger and the browser treats that as keyboard focus. Made
          concentric with the avatar, the same ring reads as the control being
          focused, which is what it means.
        */}
        <DropdownMenuTrigger
          aria-label={t('my_page')}
          className={cn(trigger, 'w-9 rounded-full px-0', className)}
          title={t('my_page')}
        >
        {/*
          * The ring is the whole reason this is not a bare `ProfileAvatar`.
          *
          * The header sits on `--card`, which is pure white in the light theme,
          * and so is the top of most photographs — a face on a white studio
          * background, or the placeholder's own pale disc. Without an edge the
          * avatar bleeds into the bar and the one control every reader reaches
          * for is the hardest one to find.
          *
          * Drawn from `--sub` at low opacity rather than from `--border`: the
          * border token is `#E5E8EC`, which is tuned for dividing two panels and
          * disappears against white at this size. A muted-foreground ring reads
          * as an edge in both themes, and inverts correctly — `--sub` is light on
          * the dark theme's dark bar.
          */}
        <ProfileAvatar
          academyImageUrl={academyImageUrl}
          className="ring-1 ring-sub/35"
          globalImageUrl={imageUrl}
          externalAvatarUrl={avatarUrl}
          name={name}
          size="sm"
        />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[13rem] p-1.5">
          {/* Who this is, before what they can do. The name alone is ambiguous
              in an academy where somebody wears three hats. */}
          {name ? (
            <div className="px-2 pb-1.5 pt-1">
              <p className="truncate text-[13px] font-bold text-ink">{name}</p>
              {primary ? <span className="mt-1 block"><RoleBadge role={primary} /></span> : null}
            </div>
          ) : null}
          {name ? <DropdownMenuSeparator /> : null}

          {/*
            Inside an academy this goes to that academy's My Page, which is where
            the reader's profile *for this academy* is edited and where the rail
            stays on screen. The bare `/account` is the answer only where there is
            no academy to scope to — the console, and an applicant's lobby — and
            it is still the page an account with no membership gets.
          */}
          <DropdownMenuItem asChild>
            <Link
              href={academySlug ? routes.academyMe(academySlug) : routes.account}
            >
              <UserRound aria-hidden className="size-4" strokeWidth={1.75} />
              {t('my_page')}
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={logout.pending}
            onSelect={() => {
              setOpen(false);
              logout.signOut();
            }}
          >
            <LogOut aria-hidden className="size-4" strokeWidth={1.75} />
            {t('common:action.sign_out')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {logout.feedback}
    </>
  );
}

/** The set, in the order they appear at the top right of every page. */
export function HeaderControls({
  identityLabel,
  className,
  account,
  notifications,
}: {
  identityLabel?: React.ReactNode;
  className?: string;
  /**
   * The bell, rendered by whichever shell mounted this.
   *
   * A slot rather than a component imported here, because the bell needs its
   * own translation namespace loaded on the server and this file is a client
   * module. It sits between the theme control and the avatar: language and
   * theme are about how the interface presents itself, and the bell and the
   * face are both about the reader.
   */
  notifications?: React.ReactNode;
  /** Absent on surfaces that have no session to describe. */
  account?: {
    academyId?: string;
    academySlug?: string;
    academyImageUrl?: string | null;
    imageUrl: string | null;
    avatarUrl: string | null;
    name: string | null;
    role?: AcademyRole | null;
    roles?: readonly AcademyRole[];
  };
}) {
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <LanguageControl />
      <ThemeControl />
      {notifications}
      {identityLabel}
      {account ? (
        <ProfileControl
          academyId={account.academyId}
          academySlug={account.academySlug}
          academyImageUrl={account.academyImageUrl}
          avatarUrl={account.avatarUrl}
          imageUrl={account.imageUrl}
          name={account.name}
          role={account.role}
          roles={account.roles}
        />
      ) : null}
    </div>
  );
}
