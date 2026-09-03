import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AcademyRole } from '@cove/shared';

import { HeaderControls } from '@/components/studio/header-controls';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/studio/sidebar';
import {
  canLearn,
  canManageAcademy,
  canManageClasses,
  canMonitorClasses,
  canReviewApplications,
  canReviewContent,
  isStudent,
} from '@/lib/academy-access-state';
import { heldRoles, resolveViewRole, viewRoleCookieName } from '@/lib/academy-view-role';
import { getAccount } from '@/lib/orpc-server';
import { StudioSidebar, type StudioAcademy } from './studio-sidebar';

/**
 * The frame every academy page is read inside: the sidebar, the sticky bar,
 * and the account controls.
 *
 * A layout rather than something each page renders. Next does not re-render a
 * shared layout on navigations beneath it, so the sidebar and the header stay
 * on screen — and stay interactive — while the next page loads. That is what
 * makes a page-level `loading.tsx` worth having: it replaces only the content
 * column, instead of blanking the whole viewport including the nav the reader
 * just clicked. It also means the sidebar keeps its scroll position, its open
 * groups, and the focus ring, none of which survived being rebuilt per page.
 *
 * The second reason is cost. This awaits the account, and as a page-level
 * component it did so on every navigation, in addition to the two other reads
 * the route already made. Here it happens once per entry, through the
 * memoised `getAccount`.
 *
 * See docs/superpowers/specs/2026-08-28-loading-states-and-navigation-feedback-design.md §6.1.
 */
export async function StudioChrome({
  academyId,
  children,
}: {
  academyId: string;
  children: React.ReactNode;
}) {
  let academies: StudioAcademy[] = [];
  let academyName = '';
  let academySlug = '';
  let held: readonly AcademyRole[] = [];
  let primaryRole: AcademyRole | null = null;
  let hasPoints = false;
  let viewer: {
    academyImageUrl: string | null;
    imageUrl: string | null;
    avatarUrl: string | null;
    name: string | null;
  } | null = null;
  try {
    const account = await getAccount();
    const active = account.user.memberships.filter(
      (membership) => membership.status === 'ACTIVE',
    );
    academies = active.map((membership) => ({
      id: membership.academy.id,
      name: membership.academy.name,
      slug: membership.academy.slug,
      role: membership.role,
    }));
    const selectedMembership = active.find(
      (membership) => membership.academy.id === academyId,
    );
    academyName = selectedMembership?.academy.name ?? '';
    academySlug = selectedMembership?.academy.slug ?? '';
    held = heldRoles(account, academyId);
    primaryRole = selectedMembership?.role ?? null;
    hasPoints = (selectedMembership?.features ?? []).includes('STUDENT_POINTS');
    // Feeds the header's way into My Page. The name is only for the initials
    // fallback, so the global one is right even inside an academy.
    viewer = {
      academyImageUrl: selectedMembership?.imageUrl ?? null,
      imageUrl: account.user.imageUrl,
      avatarUrl: account.user.avatarUrl,
      name: account.user.displayName ?? account.user.username,
    };
  } catch {
    redirect('/login');
  }

  const cookieStore = await cookies();
  const sidebarState = cookieStore.get('cove_sidebar_state')?.value;

  /*
   * Which of this member's roles the shell is built for.
   *
   * The union decides what they may do; this decides what they are shown. A
   * member with one role — almost everybody — resolves to it and sees no
   * switcher at all, so nothing about this is visible until somebody genuinely
   * holds two.
   *
   * Note the sidebar gates below take `[viewRole]` and not `held`. Leaving
   * every role's navigation on screen would make the switcher change the
   * overview and nothing else, which is not a switcher. The API is unaffected
   * either way: it authorizes against the full set and has never read this.
   */
  const viewRole = primaryRole
    ? resolveViewRole({
        academyId,
        held,
        primary: primaryRole,
        cookie: cookieStore.get(viewRoleCookieName)?.value,
      }).role
    : null;
  const shown: readonly AcademyRole[] = viewRole ? [viewRole] : [];

  return (
    <SidebarProvider defaultOpen={sidebarState !== 'false'}>
      <StudioSidebar
        academies={academies}
        viewRole={viewRole}
        academyId={academyId}
        canLearn={canLearn(shown)}
        canManageAcademy={canManageAcademy(shown)}
        canManageClasses={canManageClasses(shown)}
        canManageContent={canReviewContent(shown)}
        canReviewApplications={canReviewApplications(shown)}
        canMonitor={canMonitorClasses(shown)}
        hasPoints={hasPoints}
        isStudent={isStudent(shown)}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1" />
          {/*
           * The academy, not the page. The bar used to carry the page title
           * and the heading directly beneath it carried the same words, which
           * said nothing twice. Naming the academy here answers the question
           * the bar is actually in a position to answer — which of your
           * academies am I looking at — and it is something the layout knows,
           * so no page has to hand it up.
           */}
          <span className="truncate text-[14px] font-semibold text-sub">
            {academyName}
          </span>
          {/* Theme and language sit at the far right of every studio page, in
              the one place a reader already looks for account-level controls. */}
          {/* The role switcher rides in this menu rather than beside the
              academy name: which role you are working as is a fact about the
              reader, and the bar is about the academy. */}
          <HeaderControls
            account={
              viewer
                ? {
                    ...viewer,
                    academyId,
                    academySlug: academySlug || undefined,
                    role: viewRole,
                    roles: held,
                  }
                : undefined
            }
            className="ml-auto"
          />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
