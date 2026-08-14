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
  canReviewContent,
  isStudent,
} from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';
import { StudioSidebar, type StudioAcademy } from './studio-sidebar';

export async function StudioShell({
  academyId,
  title,
  description,
  actions,
  bleed = false,
  showPageHeading = true,
  children,
}: {
  academyId: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Skip the white content card so a page can lay out its own panels. */
  bleed?: boolean;
  /** Hide the shell heading when the page owns a live, interactive heading. */
  showPageHeading?: boolean;
  children: React.ReactNode;
}) {
  let academies: StudioAcademy[] = [];
  let role = null;
  let viewer: {
    academyImageUrl: string | null;
    imageUrl: string | null;
    avatarUrl: string | null;
    name: string | null;
  } | null = null;
  try {
    const account = await createServerORPCClient().auth.me({});
    const active = account.user.memberships.filter(
      (membership) => membership.status === 'ACTIVE',
    );
    academies = active.map((membership) => ({
      id: membership.academy.id,
      name: membership.academy.name,
      role: membership.role,
    }));
    const selectedMembership = active.find(
      (membership) => membership.academy.id === academyId,
    );
    role = selectedMembership?.role ?? null;
    // Feeds the header's way into My Page. The name is only for the initials
    // fallback, so the global one is right even inside an academy.
    viewer = {
      academyImageUrl: selectedMembership?.imageUrl ?? null,
      imageUrl: account.user.imageUrl,
      avatarUrl: account.user.avatarUrl,
      name: account.user.displayName ?? account.user.username,
    };
  } catch {
    redirect('/auth/login');
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
        canMonitor={canMonitorClasses(role)}
        isStudent={isStudent(role)}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1" />
          <span className="truncate text-[14px] font-semibold text-sub">
            {title}
          </span>
          {/* Theme and language sit at the far right of every studio page, in
              the one place a reader already looks for account-level controls. */}
          <HeaderControls account={viewer ?? undefined} className="ml-auto" />
        </header>

        <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-7">
          {showPageHeading ? (
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[1.7rem] font-extrabold leading-tight">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-2 max-w-2xl text-[15px] leading-[1.65] text-sub">
                    {description}
                  </p>
                ) : null}
              </div>
              {actions ? <div className="flex gap-2">{actions}</div> : null}
            </div>
          ) : null}

          {bleed ? (
            children
          ) : (
            <section className="rounded-card border border-border bg-card p-6">
              {children}
            </section>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
