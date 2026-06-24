import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { Heartbeat } from '@/components/layout/Heartbeat';

export default async function FullscreenLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <><Heartbeat />{children}</>;
}
