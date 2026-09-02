'use client';

import {
  Inbox,
  KeyRound,
  LogOut,
  School,
  type LucideIcon,
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
import {
  contentLensFromReferrer,
  contentLensHrefs,
  lensIcons,
} from '../_lib/content-view';
import { usePendingApplicationsCount } from '../_hooks/use-platform-applications';

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Set only on the row that carries the review queue's count. */
  badge?: number;
};
type NavGroup = { id: string; label: string; items: NavLink[] };

/**
 * The operator's navigation, built from the same parts as the academy one.
 *
 * A studio sidebar switches academies at the top because a member can belong to
 * several. An operator belongs to none, so the header states where they are
 * instead — which is the only thing that has to be different here. Everything
 * below is the studio's own furniture, including the footer's sign-out, so the
 * console does not become the one page in Cove where a person cannot leave.
 *
 * The rows were written as a list for exactly this: the account directory
 * arrived as a second item and needed no rework, and the list has since grown
 * headings of its own — the same grouped shape the studio rail uses, so an
 * operator who works in both is not reading two different kinds of navigation.
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

  // Grouped the way the studio's rail is, because an operator reads the two
  // side by side: the console is where a support call about an academy ends
  // up, and a flat list of six meant scanning all six to find which of them
  // was about people. The headings say what a row acts on — the tenants
  // themselves, the people in them, the curriculum they share, and the
  // operator's own trail through it.
  const groups: NavGroup[] = [
    {
      id: 'platform',
      label: t('nav.group.platform'),
      items: [{ href: '/admin', label: t('nav.academies'), icon: School }],
    },
    {
      id: 'people',
      label: t('nav.group.people'),
      items: [
        { href: '/admin/users', label: t('nav.users'), icon: Users },
        {
          href: '/admin/applications',
          label: t('nav.applications'),
          icon: Inbox,
          badge: needsReview,
        },
      ],
    },
    {
      id: 'content',
      label: t('nav.group.content'),
      // Two rows, named after the things they hold, taking the icons the pages
      // and their summary tiles already wear. They were one row called
      // "Content" leading to a browser whose second list was reachable only
      // through a chip in its own toolbar — the name of a tool, hiding half of
      // what it did.
      items: [
        {
          href: contentLensHrefs.courses,
          label: t('nav.courses'),
          icon: lensIcons.courses,
        },
        {
          href: contentLensHrefs.classes,
          label: t('nav.classes'),
          icon: lensIcons.classes,
        },
      ],
    },
    {
      id: 'operations',
      label: t('nav.group.operations'),
      items: [
        { href: '/admin/access', label: t('nav.access'), icon: KeyRound },
        { href: '/admin/audit', label: t('nav.audit'), icon: ScrollText },
      ],
    },
  ];
  const items = groups.flatMap((group) => group.items);

  /**
   * Which row the operator is *working in*, which is not always what the
   * address says.
   *
   * One editor is mounted under several routes. A course opened from the
   * Courses page lives at `/admin/academies/…`, so a path-only rule lights
   * **Academies** while the page's own Back link says **Courses** — the rail
   * and the page disagreeing about where the reader is, on every row they open.
   *
   * `from` is already the record of where they came from (§2.6.1 of the content
   * browser design). `contentLensFromReferrer` reads it back, and states the
   * rules it follows. It only ever overrides which row is lit, never where a
   * link goes.
   */
  const workingIn = contentLensFromReferrer(from);
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
        {groups.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
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
        ))}
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
