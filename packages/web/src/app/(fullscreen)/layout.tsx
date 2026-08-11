import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { Heartbeat } from '@/components/layout/Heartbeat';

export default async function FullscreenLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    // v1-era surfaces are pinned to light; see `.theme-light` in globals.css.
    <div className="theme-light contents">
      <Heartbeat />
      {children}
    </div>
  );
}
