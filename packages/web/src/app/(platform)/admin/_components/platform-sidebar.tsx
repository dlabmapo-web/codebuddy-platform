'use client';

import {
  BookOpen,
  Inbox,
  KeyRound,
  LogOut,
  School,
  ScrollText,
  Shield,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { SignOutControl } from '@/app/(auth)/_components/sign-out-control';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/studio/sidebar';
import { useLayoutTranslation } from '@/i18n';
import { activeNavHref } from '@/lib/nav-active';
import { usePendingApplicationsCount } from '../_hooks/use-platform-applications';

/**
 * The operator's navigation, built from the same parts as the academy one.
 *
 * A studio sidebar switches academies at the top because a member can belong to
 * several. An operator belongs to none, so the header states where they are
 * instead — which is the only thing that has to be different here. Everything
 * below is the studio's own furniture, including the footer's sign-out, so the
 * console does not become the one page in Cove where a person cannot leave.
 *
 * The group was written as a list for exactly this: the account directory has
 * arrived as the second item and needed no rework. The audit log and the
 * feature switchboard land beside it the same way.
 */
export function PlatformSidebar() {
  const { t } = useTranslation('platform');
  const { t: common } = useLayoutTranslation('common');
  const pathname = usePathname();
  const from = useSearchParams().get('from');

  // Only the applications nobody else can review. A badge counting every
  // pending application would sit permanently at a manager's workload, and a
  // badge that is always lit is a badge nobody reads.
  const needsReview = usePendingApplicationsCount();

  const items = [
    { href: '/admin', label: t('nav.academies'), icon: School },
    { href: '/admin/users', label: t('nav.users'), icon: Users },
    {
      href: '/admin/applications',
      label: t('nav.applications'),
      icon: Inbox,
      badge: needsReview,
    },
    { href: '/admin/content', label: t('nav.content'), icon: BookOpen },
    { href: '/admin/access', label: t('nav.access'), icon: KeyRound },
    { href: '/admin/audit', label: t('nav.audit'), icon: ScrollText },
  ];

  /**
   * Which section the operator is *working in*, which is not always what the
   * address says.
   *
   * One editor is mounted under several routes. A course opened from the
   * content browser lives at `/admin/academies/…`, so a path-only rule lights
   * **Academies** while the page's own Back link says **Content** — the rail
   * and the page disagreeing about where the reader is, on every content row
   * they open.
   *
   * `from` is already the record of where they came from (§2.6.1 of the content
   * browser design). Reusing it here keeps one answer on screen. It only ever
   * overrides the section, never the destination: the sidebar links are
   * unchanged, so Content still goes to the content browser.
   */
  const workingIn = from?.startsWith('/admin/content') ? '/admin/content' : null;
  const activeHref =
    workingIn ??
    activeNavHref(
      pathname,
      items.map((item) => item.href),
    );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-11 items-center gap-2.5 rounded-lg px-2">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"
          >
            <Shield className="size-[1.05rem]" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-[14px] font-bold leading-tight text-ink">
              {t('shell.brand')}
            </span>
            <span className="block truncate text-[12px] text-sub">
              {t('shell.eyebrow')}
            </span>
          </span>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.group')}</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={activeHref === item.href}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon className="size-[1.05rem] shrink-0" />
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span
                        aria-label={t('nav.applications_waiting', {
                          count: item.badge,
                        })}
                        className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 font-mono text-[11px] font-bold tabular-nums text-on-danger group-data-[collapsible=icon]:hidden"
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
        <SignOutControl
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-semibold text-sub outline-none transition-colors hover:bg-sidebar-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          label={
            <>
              <LogOut className="size-[1.05rem] shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">
                {common('action.sign_out')}
              </span>
            </>
          }
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
