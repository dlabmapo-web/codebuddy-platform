import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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
  let role = null;
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
    role = selectedMembership?.role ?? null;
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

  const sidebarState = (await cookies()).get('cove_sidebar_state')?.value;

  return (
    <SidebarProvider defaultOpen={sidebarState !== 'false'}>
      <StudioSidebar
        academies={academies}
        academyId={academyId}
        canLearn={canLearn(role)}
        canManageAcademy={canManageAcademy(role)}
        canManageClasses={canManageClasses(role)}
        canManageContent={canReviewContent(role)}
        canReviewApplications={canReviewApplications(role)}
        canMonitor={canMonitorClasses(role)}
        hasPoints={hasPoints}
        isStudent={isStudent(role)}
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
          <HeaderControls account={viewer ?? undefined} className="ml-auto" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
