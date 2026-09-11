'use client';

import type { AcademyRole } from '@cove/shared';
import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  ChevronsUpDown,
  ClipboardList,
  Coins,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  MonitorPlay,
  Presentation,
  School,
  Settings,
  Trophy,
  Wrench,
  type LucideIcon,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { SignOutControl } from '@/app/(auth)/_components/sign-out-control';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
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
import { NavPendingHint } from './nav-pending-hint';
import { NavCountBadge, NavCountDot } from './nav-count-badge';
import { usePendingApplicationsCount } from '../_hooks/use-pending-applications';
import { activeNavHref } from '@/lib/nav-active';
import { MyPageRow, type MyPageViewer } from '@/components/studio/nav/my-page-row';
import { RoleBadge } from '@/components/studio/role-badge';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

export type StudioAcademy = SelectorItem & { role: AcademyRole; slug: string };

type NavLink = {
  href: string;
  labelKey: TranslationKey<'nav'>;
  icon: LucideIcon;
  /**
   * Whether this row carries the count of applicants waiting.
   *
   * A flag rather than the number itself, so `studioNavGroups` stays a pure
   * function of what the reader may see — it decides which rows exist, and
   * the count is a live value that would make it untestable.
   */
  showPendingApplications?: boolean;
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
  viewer,
  canLearn,
  canManageAcademy,
  canManageClasses,
  canManageContent,
  canRunMaintenance,
  canReviewApplications,
  canMonitor,
  hasPoints,
  isStudent,
  viewRole,
}: {
  academies: StudioAcademy[];
  academyId: string;
  /**
   * The reader's own photographs and name, for the My Page row.
   *
   * That row wears a face where every other row wears a glyph, because it is
   * the only one that leads somewhere about the reader rather than about the
   * academy — and a face is the one icon nobody has to be taught. Null when the
   * account lookup failed; `ProfileAvatar` draws initials, then a stand-in.
   */
  viewer: MyPageViewer | null;
  /**
   * The role this reader is working as, which is what the chip under the
   * academy name shows.
   *
   * Not the membership's primary role: somebody holding three roles who
   * switches to Teacher is a Teacher here until they switch back, and a badge
   * still reading "Manager" contradicts the nav beside it.
   */
  viewRole?: AcademyRole | null;
  canLearn: boolean;
  canManageAcademy: boolean;
  canManageClasses: boolean;
  canManageContent: boolean;
  canRunMaintenance: boolean;
  canReviewApplications: boolean;
  canMonitor: boolean;
  hasPoints: boolean;
  isStudent: boolean;
}) {
  const { t } = useLayoutTranslation('common');
  const pathname = usePathname();
  const academySlug = useAcademySlug();
  const groups = studioNavGroups({
    academySlug,
    canLearn,
    canManageAcademy,
    canManageClasses,
    canManageContent,
    canRunMaintenance,
    canReviewApplications,
    canMonitor,
    hasPoints,
    isStudent,
  });
  const myPageHref = routes.academyMe(academySlug);
  // Decided across every group: the Overview link prefixes all the others, so
  // only the most specific match can be the active one. My Page is in the set
  // although it is in no group — it is a page of this academy, and left out
  // the overview's prefix would claim its path.
  const activeHref = activeNavHref(pathname, [
    ...groups.flatMap((group) => group.items.map((item) => item.href)),
    myPageHref,
  ]);
  // Asked once for the whole sidebar rather than by the badge itself: the
  // collapsed rail puts the same number in a tooltip the button owns, and two
  // components reading it separately is how a dot and its tooltip end up
  // disagreeing about how many people are waiting.
  const pendingApplications = usePendingApplicationsCount(
    academyId,
    canReviewApplications,
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AcademySwitcher
          academies={academies}
          academyId={academyId}
          viewRole={viewRole}
        />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {groups.map((group) => (
          <NavSection
            activeHref={activeHref}
            group={group}
            key={group.id}
            pendingApplications={pendingApplications}
          />
        ))}
        {/*
         * Last, and outside every group.
         *
         * My Page belongs to none of them: it is not part of the academy, of
         * the curriculum, or of the people — it is the reader. Filed under
         * Learning it would sit beside "My courses" and read as a student's
         * page, which it is not; filed under Academy it would read as a
         * setting of the academy, which it also is not.
         *
         * At the end rather than the head because the rail is read top-down as
         * the academy's own shape, and the reader is not part of that shape.
         * It also lands in the same place for every role — a student's rail
         * has three groups above it and a manager's has five, and this is the
         * row both of them find without counting.
         */}
        <MyPageRow
          href={myPageHref}
          isActive={activeHref === myPageHref}
          viewer={viewer}
        />
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
  pendingApplications,
}: {
  activeHref: string | null;
  group: NavGroup;
  pendingApplications: number;
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
          const waiting = item.showPendingApplications
            ? pendingApplications
            : 0;
          const waitingLabel = t('badge.pending_applications', {
            pending: waiting,
          });
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={
                  collapsed
                    ? waiting > 0
                      ? t('badge.pending_applications_tooltip', {
                          link: label,
                          pending: waiting,
                        })
                      : label
                    : undefined
                }
              >
                <Link href={item.href} onClick={() => setOpenMobile(false)}>
                  <item.icon />
                  <span>{label}</span>
                  {/* Hidden while the rail is collapsed to icons: there is no
                      room beside a glyph, and a dot crowding one would be read
                      as part of the icon rather than as a state. */}
                  {collapsed ? null : (
                    <NavCountBadge count={waiting} label={waitingLabel} />
                  )}
                  {collapsed ? null : <NavPendingHint />}
                </Link>
              </SidebarMenuButton>
              {/* The collapsed rail's version of the same number. Outside the
                  button so the dot is positioned against the item rather than
                  inside a flex row that has no space left. */}
              {collapsed ? (
                <NavCountDot count={waiting} label={waitingLabel} />
              ) : null}
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
            {/* The role, in the colour it wears everywhere else in Studio.
                As grey caption text it read as metadata about the academy;
                as a chip it reads as what the person is here, which is what
                the line is for. */}
            <span className="mt-0.5 block truncate leading-tight">
              {selectedItem ? (
                <RoleBadge role={selectedItem.role} />
              ) : (
                <span className="text-[12px] text-sub">
                  {t('academy_switcher.no_membership')}
                </span>
              )}
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
  viewRole,
}: {
  academies: StudioAcademy[];
  academyId: string;
  viewRole?: AcademyRole | null;
}) {
  const { t } = useLayoutTranslation(['nav', 'common']);
  const router = useRouter();

  // The chip shows the role being worked as, so the selected academy carries
  // the view role rather than the membership's highest one. Every *other*
  // academy in the list keeps its own, which is the role the reader would
  // arrive as over there.
  const shown = academies.map((academy) =>
    academy.id === academyId && viewRole ? { ...academy, role: viewRole } : academy,
  );

  if (shown.length <= 1) {
    return <AcademyTrigger disabled selectedItem={shown[0]} />;
  }

  return (
    <ResponsiveSelector
      align="start"
      drawerTitle={t('academy_switcher.switch')}
      list={shown}
      onSelect={(academy) => router.push(routes.academy(academy.slug))}
      placeholder={t('academy_switcher.search')}
      popoverClassName="w-60"
      renderItem={(academy) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{academy.name}</span>
          <RoleBadge className="mt-0.5 self-start" role={academy.role} />
        </span>
      )}
      selectedId={academyId}
      side="bottom"
      TriggerComp={AcademyTrigger}
    />
  );
}

export function studioNavGroups({
  academySlug,
  canLearn,
  canManageAcademy,
  canManageClasses,
  canManageContent,
  canRunMaintenance,
  canReviewApplications,
  canMonitor,
  hasPoints,
  isStudent,
}: {
  academySlug: string;
  canLearn: boolean;
  canManageAcademy: boolean;
  canManageClasses: boolean;
  canManageContent: boolean;
  canRunMaintenance: boolean;
  canReviewApplications: boolean;
  canMonitor: boolean;
  /** §5 — the academy switched points on. Off means the link is not there. */
  hasPoints: boolean;
  isStudent: boolean;
}): NavGroup[] {
  const base = routes.academy(academySlug);
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

  if (canManageContent || canRunMaintenance) {
    const content: NavLink[] = [];
    if (canManageContent) {
      content.push({
        href: `${base}/content/courses`,
        labelKey: 'link.courses',
        icon: BookOpen,
      });
    }
    // Under Curriculum rather than a group of its own: what it repairs is the
    // damage a curriculum edit does to work already answered, and the person
    // who reaches for it has just come from the course they edited. A group
    // holding one row would also be a heading for a page opened twice a term.
    if (canRunMaintenance) {
      content.push({
        href: `${base}/maintenance`,
        labelKey: 'link.maintenance',
        icon: Wrench,
      });
    }
    groups.push({ id: 'content', labelKey: 'group.content', items: content });
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

  const people: NavLink[] = [];
  if (canManageAcademy) {
    people.push({ href: `${base}/people`, labelKey: 'link.members', icon: Users });
    // Two read-only views of the same memberships, beside the directory that
    // changes them: the students an office looks up by class and guardian,
    // and the staff it looks up by role. Manager-only, as the directory is.
    people.push({
      href: routes.academyStudents(academySlug),
      labelKey: 'link.students',
      icon: GraduationCap,
    });
    people.push({
      href: routes.academyStaff(academySlug),
      labelKey: 'link.staff',
      icon: BriefcaseBusiness,
    });
  }
  if (canReviewApplications) {
    people.push({
      href: `${base}/applications`,
      labelKey: 'link.applications',
      icon: UserCheck,
      showPendingApplications: true,
    });
  }
  if (canManageAcademy) {
    people.push({ href: `${base}/invitations`, labelKey: 'link.invitations', icon: Mail });
  }
  if (people.length > 0) {
    groups.push({
      id: 'people',
      labelKey: 'group.people',
      items: people,
    });
  }
  if (canManageAcademy) {
    // Its own group: the features here decide what every other group shows,
    // so it does not belong filed under People.
    const settings: NavLink[] = [
      {
        href: routes.academySettings(academySlug),
        labelKey: 'link.settings',
        icon: Settings,
      },
    ];
    // What each kind of work pays. Only where the academy runs points at all —
    // a page configuring an economy nobody has is worse than no page.
    if (hasPoints) {
      settings.push({
        href: routes.academyPointPolicy(academySlug),
        labelKey: 'link.point_policy',
        icon: Coins,
      });
    }
    groups.push({ id: 'settings', labelKey: 'group.settings', items: settings });
  }

  return groups;
}
