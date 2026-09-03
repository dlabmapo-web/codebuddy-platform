'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Moon, Sun, UserRound } from 'lucide-react';
import { locales, localeCodes, type Locale } from '@cove/i18n/settings';
import type { AcademyRole } from '@cove/shared';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { RoleBadge, roleDotClass } from '@/components/studio/role-badge';
import { LocaleFlag } from '@/components/studio/locale-flag';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { setBrowserLocale } from '@/i18n/client/set-locale';
import { routes } from '@/lib/routes';
import { setViewRoleAction } from '@/lib/view-role-action';
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

/**
 * The reader's own menu: who they are here, which of their roles they are
 * working as, and the way into My Page.
 *
 * A face rather than a gear, and a menu rather than a link. The destination is
 * the person's own account, and an avatar is the one control on this bar whose
 * meaning nobody has to be taught — so it is also the right place for the one
 * other control that is about them rather than about the page: the role they
 * are viewing as.
 *
 * The role switcher lived beside the academy name in the bar, where it read as
 * a property of the academy. It is a property of the reader.
 */
export function ProfileControl({
  className,
  academyId,
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
  /** Where a role switch lands — the academy's overview. */
  academySlug?: string;
  /** The current membership's academy override. */
  academyImageUrl?: string | null;
  /** The Cove image, when the account has uploaded one. */
  imageUrl?: string | null;
  /** The external OAuth photo, as the fallback beneath it. */
  avatarUrl?: string | null;
  name?: string | null;
  /** The role being viewed as, when inside an academy. */
  role?: AcademyRole | null;
  /** Every role held here. One or none renders no switcher. */
  roles?: readonly AcademyRole[];
}) {
  const { t } = useLayoutTranslation(['nav', 'common']);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const held = roles ?? [];
  const canSwitch = Boolean(academyId && role && held.length > 1);

  function selectRole(next: AcademyRole) {
    if (!academyId || next === role) return;
    /*
     * Close before navigating, and this is not cosmetic.
     *
     * While the menu is open Radix marks everything behind it
     * `aria-hidden="true"` so screen readers see only the overlay. Navigating
     * from under an open menu renders a new tree into content still carrying
     * those attributes, and React reports a hydration mismatch listing every
     * background node — plus whatever text differs beneath them.
     *
     * Closing first lets Radix remove them, which it does on close, so the
     * incoming page is rendered into clean markup.
     */
    setOpen(false);
    startTransition(async () => {
      await setViewRoleAction(academyId, next);
      // Back to the academy's front door, not wherever they happened to be.
      //
      // The roles do not share a navigation. Switching from Manager to Teacher
      // while standing on Members left the reader on a page their new role has
      // no link to and, on some pages, no permission for — a dead end reached
      // by a control that was supposed to help. The overview is the one page
      // every role answers, so it is where every switch lands.
      if (academySlug) {
        router.push(routes.academy(academySlug));
      }
      // The sidebar lives in a layout above the page and is built from the
      // role that just changed, so the tree is refreshed either way.
      router.refresh();
    });
  }

  return (
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
            {held.length > 0 ? (
              <span className="mt-1 flex flex-wrap gap-1">
                {held.map((held_role) => (
                  <RoleBadge key={held_role} role={held_role} />
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
        {name ? <DropdownMenuSeparator /> : null}

        <DropdownMenuItem asChild>
          <Link href={routes.account}>
            <UserRound aria-hidden className="size-4" strokeWidth={1.75} />
            {t('my_page')}
          </Link>
        </DropdownMenuItem>

        {/* Only when there is a choice. A switcher offering one role is
            furniture, and most members hold exactly one. */}
        {canSwitch ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('role_switcher.label')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(next) => {
                selectRole(next as AcademyRole);
              }}
              value={role ?? undefined}
            >
              {held.map((option) => (
                <DropdownMenuRadioItem
                  className="gap-2"
                  key={option}
                  value={option}
                >
                  <span
                    aria-hidden
                    className={cn('size-2 rounded-full', roleDotClass(option))}
                  />
                  {t(`common:role.${option}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
