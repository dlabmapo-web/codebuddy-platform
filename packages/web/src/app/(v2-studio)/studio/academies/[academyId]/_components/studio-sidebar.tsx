'use client';

import type { AcademyRole } from '@cove/shared';
import {
  BarChart3,
  BookOpen,
  ChevronsUpDown,
  ClipboardList,
  GraduationCap,
  Presentation,
  LayoutDashboard,
  LogOut,
  Mail,
  MonitorPlay,
  School,
  UserCheck,
  Users,
  type LucideIcon,
  Trophy,
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
  canLearn,
  canManageAcademy,
  canManageClasses,
  canManageContent,
  canMonitor,
  hasPoints,
  isStudent,
}: {
  academies: StudioAcademy[];
  academyId: string;
  canLearn: boolean;
  canManageAcademy: boolean;
  canManageClasses: boolean;
  canManageContent: boolean;
  canMonitor: boolean;
  hasPoints: boolean;
  isStudent: boolean;
}) {
  const { t } = useLayoutTranslation('common');
  const pathname = usePathname();
  const groups = studioNavGroups({
    academyId,
    canLearn,
    canManageAcademy,
    canManageClasses,
    canManageContent,
    canMonitor,
    hasPoints,
    isStudent,
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
        {/* Theme and language moved to the header's top right; the footer keeps
            only the action that ends the session. */}
        <SidebarSeparator className="mx-0" />
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
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-[13px] font-bold text-on-brand">
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
  canLearn,
  canManageAcademy,
  canManageClasses,
  canManageContent,
  canMonitor,
  hasPoints,
  isStudent,
}: {
  academyId: string;
  canLearn: boolean;
  canManageAcademy: boolean;
  canManageClasses: boolean;
  canManageContent: boolean;
  canMonitor: boolean;
  /** §5 — the academy switched points on. Off means the link is not there. */
  hasPoints: boolean;
  isStudent: boolean;
}): NavGroup[] {
  const base = `/studio/academies/${academyId}`;
  const groups: NavGroup[] = [
    {
      id: 'overview',
      labelKey: 'group.overview',
      items: [{ href: base, labelKey: 'link.overview', icon: LayoutDashboard }],
    },
  ];

  if (canLearn) {
    const learning: NavLink[] = [
      {
        href: `${base}/learn/courses`,
        labelKey: 'link.my_courses',
        icon: GraduationCap,
      },
    ];
    // My Courses stays first and stays the landing destination: it is the
    // fastest route into work. My Classes is the context behind it, and it is
    // a student's alone — staff hold `curriculum.read` so they can preview the
    // curriculum they wrote, and that is not a class to belong to.
    // Answer records is a student's own history and nothing else, so staff
    // previewing curriculum do not gain it either.
    if (isStudent) {
      learning.push({
        href: `${base}/learn/classes`,
        labelKey: 'link.my_classes',
        icon: School,
      });
      learning.push({
        href: `${base}/learn/records`,
        labelKey: 'link.answer_records',
        icon: ClipboardList,
      });
      // Only when the academy runs a point economy. An academy that does not
      // must never show a child a link to a page about points they cannot
      // earn.
      if (hasPoints) {
        learning.push({
          href: `${base}/points`,
          labelKey: 'link.my_points',
          icon: Trophy,
        });
      }
    }
    groups.push({ id: 'learning', labelKey: 'group.learning', items: learning });
  }

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

  // One group, two audiences, two routes. `/classes` is the management view a
  // Team Lead or Manager uses to arrange a class; `/teach/classes` is the
  // assigned teacher's own live view, with no class, roster, or assignment
  // controls on it at all. Nobody sees both entries, because nobody holds both
  // roles at once.
  const teaching: NavLink[] = [];
  if (canManageClasses) {
    teaching.push({
      href: `${base}/classes`,
      labelKey: 'link.classes',
      icon: Presentation,
    });
    // A manager and a team lead hold every class, and asking "who is doing the
    // work this week" through one class's detail page cost one navigation per
    // class. A teacher is deliberately not given this link: they hold two or
    // three classes and arrive at one to teach it, so the board belongs on the
    // page they are already on. Only when the academy runs points at all.
    if (hasPoints) {
      teaching.push({
        href: `${base}/points/classes`,
        labelKey: 'link.class_ranking',
        icon: Trophy,
      });
    }
  }
  if (canMonitor) {
    teaching.push({
      href: `${base}/teach/classes`,
      labelKey: 'link.my_classes',
      icon: MonitorPlay,
    });
    // §5.1 — the detailed roster the overview's previews all link into. It sits
    // under Teaching rather than beside the Overview link because it is scoped
    // to assigned classes, exactly as My classes is, and a teacher looking for
    // "my students" looks where "my classes" already is.
    teaching.push({
      href: `${base}/teach/students`,
      labelKey: 'link.student_analytics',
      icon: BarChart3,
    });
  }
  if (teaching.length > 0) {
    groups.push({ id: 'teaching', labelKey: 'group.teaching', items: teaching });
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
