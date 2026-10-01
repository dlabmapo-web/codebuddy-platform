'use client';

import type { JoinRequestKind } from '@cove/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/studio/sidebar';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

import { lobbyNav, lobbySectionFor } from './lobby-nav';

/**
 * The applicant's rail.
 *
 * The same component vocabulary as `StudioSidebar` — the same `Sidebar`, the
 * same rows, the same collapse behaviour — because the lobby is not a
 * different product. What is missing is the academy switcher, which would be a
 * control offering one item, and every badge, because nothing here has a count.
 *
 * The academy's own name and initial stand where the switcher does, so the rail
 * still says where you are.
 */
export function LobbySidebar({
  academyName,
  academySlug,
  hasPoints,
  requestedKind,
}: {
  academyName: string;
  academySlug: string;
  hasPoints: boolean;
  requestedKind: JoinRequestKind;
}) {
  const { t: lobby } = useTranslation('lobby');
  const searchParams = useSearchParams();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  const items = lobbyNav({ academySlug, kind: requestedKind, hasPoints });
  const active = lobbySectionFor(searchParams.get('section'), items);
  const initial = academyName.trim().charAt(0).toUpperCase() || 'C';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div
          className={cn(
            'flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left',
            collapsed && 'justify-center px-0',
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-[13px] font-bold text-on-brand">
            {initial}
          </span>
          {collapsed ? null : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold leading-tight">
                {academyName}
              </span>
              {/*
                Where a member's role badge sits, the applicant's state sits —
                in the same amber it wears on the plate and on the manager's
                own queue. The rail should never be silent about why the pages
                beside it are empty.
              */}
              <span className="mt-0.5 block truncate leading-tight">
                <span className="inline-flex items-center rounded-full bg-draft/15 px-1.5 py-0.5 text-[11px] font-bold text-draft">
                  {lobby('status.heading')}
                </span>
              </span>
            </span>
          )}
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map((item) => {
              const label = lobby(
                item.labelKey as 'section.my_courses.heading',
              );
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.id === active.id}
                    tooltip={collapsed ? label : undefined}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpenMobile(false)}
                    >
                      <item.icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
