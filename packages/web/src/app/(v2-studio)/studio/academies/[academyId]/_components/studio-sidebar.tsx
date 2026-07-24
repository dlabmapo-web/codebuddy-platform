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
import { cn } from '@/lib/utils';

export type StudioAcademy = SelectorItem & { role: AcademyRole };

type NavLink = { href: string; label: string; icon: LucideIcon };
type NavGroup = { id: string; label: string; items: NavLink[] };

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
  const groups = studioNavGroups({
    academyId,
    canManageAcademy,
    canManageContent,
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AcademySwitcher academies={academies} academyId={academyId} />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {groups.map((group) => (
          <NavSection group={group} key={group.id} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
        <SignOutControl
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-semibold text-sub outline-none transition-colors hover:bg-sidebar-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          label={
            <>
              <LogOut className="size-[1.05rem] shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </>
          }
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavSection({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={collapsed ? item.label : undefined}
              >
                <Link href={item.href} onClick={() => setOpenMobile(false)}>
                  <item.icon />
                  <span>{item.label}</span>
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
              {selectedItem?.name ?? 'Select academy'}
            </span>
            <span className="block truncate text-[12px] leading-tight text-sub">
              {selectedItem ? formatRole(selectedItem.role) : 'No membership'}
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
  const router = useRouter();

  if (academies.length <= 1) {
    return <AcademyTrigger disabled selectedItem={academies[0]} />;
  }

  return (
    <ResponsiveSelector
      align="start"
      drawerTitle="Switch academy"
      list={academies}
      onSelect={(academy) => router.push(`/studio/academies/${academy.id}`)}
      placeholder="Search academies…"
      popoverClassName="w-60"
      renderItem={(academy) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{academy.name}</span>
          <span className="truncate text-[12px] text-sub">
            {formatRole(academy.role)}
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
      label: 'Academy',
      items: [{ href: base, label: 'Overview', icon: LayoutDashboard }],
    },
  ];

  if (canManageContent) {
    groups.push({
      id: 'content',
      label: 'Curriculum',
      items: [
        { href: `${base}/content/courses`, label: 'Courses', icon: BookOpen },
      ],
    });
  }

  if (canManageAcademy) {
    groups.push({
      id: 'people',
      label: 'People',
      items: [
        { href: `${base}/members`, label: 'Members', icon: Users },
        { href: `${base}/applications`, label: 'Applications', icon: UserCheck },
        { href: `${base}/invitations`, label: 'Invitations', icon: Mail },
      ],
    });
  }

  return groups;
}

function formatRole(role: AcademyRole): string {
  return role
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}
