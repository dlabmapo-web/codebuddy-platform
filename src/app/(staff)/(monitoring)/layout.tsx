import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { ROLE_HOME } from '@/lib/navigation/capabilities';

export default async function MonitoringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher') redirect(ROLE_HOME[user.role]);

  return children;
}
