import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/studio/sidebar';
import {
  canManageAcademy,
  canManageContent,
} from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';
import { StudioSidebar, type StudioAcademy } from './studio-sidebar';

export async function StudioShell({
  academyId,
  title,
  description,
  actions,
  bleed = false,
  children,
}: {
  academyId: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Skip the white content card so a page can lay out its own panels. */
  bleed?: boolean;
  children: React.ReactNode;
}) {
  let academies: StudioAcademy[] = [];
  let role = null;
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
    role = active.find((membership) => membership.academy.id === academyId)?.role
      ?? null;
  } catch {
    redirect('/auth/login');
  }

  const sidebarState = (await cookies()).get('cove_sidebar_state')?.value;

  return (
    <SidebarProvider defaultOpen={sidebarState !== 'false'}>
      <StudioSidebar
        academies={academies}
        academyId={academyId}
        canManageAcademy={canManageAcademy(role)}
        canManageContent={canManageContent(role)}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1" />
          <span className="truncate text-[14px] font-semibold text-sub">
            {title}
          </span>
        </header>

        <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-7">
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

          {bleed ? (
            children
          ) : (
            <section className="rounded-card border border-border bg-white p-6">
              {children}
            </section>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
