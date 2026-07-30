'use client';

import type { AcademyRole } from '@cove/shared';
import {
  BookOpen,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Mail,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { SignOutControl } from '@/app/(v2-auth)/auth/_components/sign-out-control';
import { LanguageSwitcher } from '@/components/studio/language-switcher';
import {
  ResponsiveSelector,
  type SelectorItem,
  type TriggerProps,
} from '@/components/studio/selector';
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
  useSidebar,
} from '@/components/studio/sidebar';
import { useLayoutTranslation, type TranslationKey } from '@/i18n';
import { activeNavHref } from '@/lib/nav-active';
import { cn } from '@/lib/utils';

export type StudioAcademy = SelectorItem & { role: AcademyRole };

type NavLink = {
  href: string;
  labelKey: TranslationKey<'nav'>;
  icon: LucideIcon;
};
type NavGroup = {
  id: string;
  labelKey: TranslationKey<'nav'>;
  items: NavLink[];
};

/**
 * The nav is built here rather than in the server shell: `LucideIcon` values
 * are components, so they cannot cross the server/client boundary as props.
 * The shell passes plain booleans and this decides what to show.
 */
export function StudioSidebar({
  academies,
  academyId,
  canManageAcademy,
  canManageContent,
}: {
  academies: StudioAcademy[];
  academyId: string;
  canManageAcademy: boolean;
  canManageContent: boolean;
}) {
  const { t } = useLayoutTranslation('common');
  const pathname = usePathname();
  const groups = studioNavGroups({
    academyId,
    canManageAcademy,
    canManageContent,
  });
  // Decided across every group: the Overview link prefixes all the others, so
  // only the most specific match can be the active one.
  const activeHref = activeNavHref(
    pathname,
    groups.flatMap((group) => group.items.map((item) => item.href)),
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AcademySwitcher academies={academies} academyId={academyId} />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {groups.map((group) => (
          <NavSection activeHref={activeHref} group={group} key={group.id} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
        <LanguageSwitcher />
        <SignOutControl
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-semibold text-sub outline-none transition-colors hover:bg-sidebar-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          label={
            <>
              <LogOut className="size-[1.05rem] shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">
                {t('action.sign_out')}
              </span>
            </>
          }
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavSection({
  activeHref,
  group,
}: {
  activeHref: string | null;
  group: NavGroup;
}) {
  const { t } = useLayoutTranslation(['nav', 'common']);
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) => {
          const active = item.href === activeHref;
          const label = t(item.labelKey);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={collapsed ? label : undefined}
              >
                <Link href={item.href} onClick={() => setOpenMobile(false)}>
                  <item.icon />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

const AcademyTrigger = React.forwardRef<
  HTMLButtonElement,
  TriggerProps<StudioAcademy>
>(function AcademyTrigger({ className, selectedItem, ...props }, ref) {
  const { t } = useLayoutTranslation(['nav', 'common']);
  const { state, isMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  const initial = selectedItem?.name.trim().charAt(0).toUpperCase() ?? 'C';

  return (
    <button
      className={cn(
        'flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-brand/40',
        collapsed && 'justify-center px-0',
        className,
      )}
      ref={ref}
      type="button"
      {...props}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-[13px] font-bold text-white">
        {initial}
      </span>
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold leading-tight">
              {selectedItem?.name ?? t('academy_switcher.select')}
            </span>
            <span className="block truncate text-[12px] leading-tight text-sub">
              {selectedItem
                ? t(`common:role.${selectedItem.role}`)
                : t('academy_switcher.no_membership')}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-sub" />
        </>
      )}
    </button>
  );
});

function AcademySwitcher({
  academies,
  academyId,
}: {
  academies: StudioAcademy[];
  academyId: string;
}) {
  const { t } = useLayoutTranslation(['nav', 'common']);
  const router = useRouter();

  if (academies.length <= 1) {
    return <AcademyTrigger disabled selectedItem={academies[0]} />;
  }

  return (
    <ResponsiveSelector
      align="start"
      drawerTitle={t('academy_switcher.switch')}
      list={academies}
      onSelect={(academy) => router.push(`/studio/academies/${academy.id}`)}
      placeholder={t('academy_switcher.search')}
      popoverClassName="w-60"
      renderItem={(academy) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{academy.name}</span>
          <span className="truncate text-[12px] text-sub">
            {t(`common:role.${academy.role}`)}
          </span>
        </span>
      )}
      selectedId={academyId}
      side="bottom"
      TriggerComp={AcademyTrigger}
    />
  );
}

function studioNavGroups({
  academyId,
  canManageAcademy,
  canManageContent,
}: {
  academyId: string;
  canManageAcademy: boolean;
  canManageContent: boolean;
}): NavGroup[] {
  const base = `/studio/academies/${academyId}`;
  const groups: NavGroup[] = [
    {
      id: 'overview',
      labelKey: 'group.overview',
      items: [{ href: base, labelKey: 'link.overview', icon: LayoutDashboard }],
    },
  ];

  if (canManageContent) {
    groups.push({
      id: 'content',
      labelKey: 'group.content',
      items: [
        {
          href: `${base}/content/courses`,
          labelKey: 'link.courses',
          icon: BookOpen,
        },
      ],
    });
  }

  if (canManageAcademy) {
    groups.push({
      id: 'people',
      labelKey: 'group.people',
      items: [
        { href: `${base}/members`, labelKey: 'link.members', icon: Users },
        {
          href: `${base}/applications`,
          labelKey: 'link.applications',
          icon: UserCheck,
        },
        { href: `${base}/invitations`, labelKey: 'link.invitations', icon: Mail },
      ],
    });
  }

  return groups;
}
