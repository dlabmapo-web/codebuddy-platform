import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignOutControl } from '@/app/(v2-auth)/auth/_components/sign-out-control';
import { canManageAcademy } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';

export async function StudioShell({
  academyId,
  title,
  children,
}: {
  academyId: string;
  title: string;
  children: React.ReactNode;
}) {
  let role = null;
  try {
    const account = await createServerORPCClient().auth.me({});
    role = account.user.memberships.find(
      (membership) =>
        membership.academy.id === academyId &&
        membership.status === 'ACTIVE',
    )?.role ?? null;
  } catch {
    redirect('/auth/login');
  }
  const canManage = canManageAcademy(role);

  return (
    <main className="min-h-screen bg-canvas px-5 py-8 text-ink">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link className="text-lg font-black tracking-tight" href={`/studio/academies/${academyId}`}>
            COVE <span className="text-brand">STUDIO</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            {canManage ? (
              <nav className="flex flex-wrap gap-2 text-sm font-semibold">
                <Link className="rounded-lg px-3 py-2 hover:bg-white" href={`/studio/academies/${academyId}/applications`}>Applications</Link>
                <Link className="rounded-lg px-3 py-2 hover:bg-white" href={`/studio/academies/${academyId}/members`}>Members</Link>
                <Link className="rounded-lg px-3 py-2 hover:bg-white" href={`/studio/academies/${academyId}/invitations`}>Invitations</Link>
              </nav>
            ) : null}
            <SignOutControl
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-sub hover:text-ink"
            />
          </div>
        </header>
        <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-2xl font-bold">{title}</h1>
          {children}
        </section>
      </div>
    </main>
  );
}
