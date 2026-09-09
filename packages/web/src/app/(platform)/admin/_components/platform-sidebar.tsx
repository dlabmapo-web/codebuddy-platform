'use client';

import {
  Coins,
  Inbox,
  KeyRound,
  Library,
  LogOut,
  Mail,
  School,
  type LucideIcon,
  ScrollText,
  Shield,
  SlidersHorizontal,
  Trophy,
  Users,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { SignOutControl } from '@/app/(auth)/_components/sign-out-control';
import { MyPageRow, type MyPageViewer } from '@/components/studio/nav/my-page-row';
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
import { routes } from '@/lib/routes';
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
 *
 * My Page closes the last difference between the two rails. It was always
 * reachable here — the header's avatar menu has linked `/account` all along —
 * but the studio carries it in *both* places, and an operator who learns the
 * rail in one product should not have to learn a different one here.
 */
export function PlatformSidebar({ viewer }: { viewer: MyPageViewer | null }) {
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
        // Beside Applications, because the two are the ways into an academy —
        // one pull, one push — and a manager's own rail puts them together.
        {
          href: '/admin/invitations',
          label: t('nav.invitations'),
          icon: Mail,
        },
      ],
    },
    {
      id: 'content',
      label: t('nav.group.content'),
      // Rows named after the things they hold, taking the icons the pages and
      // their summary tiles already wear. They were one row called "Content"
      // leading to a browser whose second list was reachable only through a
      // chip in its own toolbar — the name of a tool, hiding half of what it
      // did.
      //
      // "Courses" became "Academy courses" when the library arrived beside it.
      // The two answer different questions — what head office publishes, and
      // what one customer is running right now — and with both present the
      // bare word named neither.
      items: [
        // First, because it is the only row here about the platform's own
        // work: the other two answer support questions about somebody else's
        // academy, and this one is what head office opens the console to do.
        {
          href: '/admin/content/library',
          label: t('nav.library'),
          icon: Library,
        },
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
        // Under Classes, because a ranking is a read of what a class produced.
        // It is not a third content lens and deliberately carries no
        // `contentLensHrefs` entry: that machinery describes two lists sharing
        // one input schema and one table, and a member sharing neither would
        // make the abstraction a coincidence.
        { href: '/admin/ranking', label: t('nav.ranking'), icon: Trophy },
      ],
    },
    {
      // Its own group, as it is in the studio rail: what is switched on here
      // decides what every other group's academies show.
      //
      // Both rows are boards across every academy, which is why they are in
      // the rail at all. One academy's settings live on that academy — the
      // rail is platform-scoped, and a row that had to ask "which academy?"
      // before it could show anything would not belong in it.
      id: 'settings',
      label: t('nav.group.settings'),
      items: [
        {
          href: routes.adminSettings,
          label: t('nav.features'),
          icon: SlidersHorizontal,
        },
        {
          href: routes.adminPointPolicies,
          label: t('nav.point_policies'),
          icon: Coins,
        },
      ],
    },
    {
      // Work the platform does *to* an academy, rather than a setting it holds
      // or a record of what an operator did. Every row here dispatches
      // something onto a queue and reports back what happened.
      //
      // Fifth rather than second on purpose: a rail is read top to bottom by
      // how often a row is opened, and a page an operator reaches when a
      // teacher reports a broken problem does not belong above the academy
      // list they open every morning.
      id: 'operations',
      label: t('nav.group.operations'),
      items: [
        {
          href: routes.adminOperations,
          label: t('nav.maintenance'),
          icon: Wrench,
        },
      ],
    },
    {
      // Renamed from "Operations", which is what these two rows were called
      // while nothing else claimed the word. Neither of them is an operation:
      // one is the authority an operator borrows to work inside an academy, and
      // the other is the record of how it was used. Naming that honestly is
      // what freed the word for the group above.
      //
      // Last, because it is the record of every group before it — the one an
      // operator opens after the fact rather than to do something.
      id: 'accountability',
      label: t('nav.group.accountability'),
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
        {/*
         * Last and outside every group, exactly where the studio puts it: the
         * groups above describe the platform, and the reader is not part of
         * the platform's shape.
         *
         * `isActive` is hardcoded false rather than computed, and that is not
         * an oversight. `/account` lives outside `/admin` and renders its own
         * chrome, so this rail is never on screen while its destination is —
         * the row cannot light, and asking `activeNavHref` would only add a
         * href that can never match. Leaving the academy is what the link does.
         */}
        <MyPageRow
          href={routes.accountFrom('admin')}
          isActive={false}
          viewer={viewer}
        />
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
