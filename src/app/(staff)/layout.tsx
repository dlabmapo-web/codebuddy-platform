import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { ROLE_HOME } from '@/lib/navigation/capabilities';
import { Gnb } from '@/components/layout/Gnb';
import { Sidebar } from '@/components/layout/Sidebar';
import { Heartbeat } from '@/components/layout/Heartbeat';

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') {
    redirect(ROLE_HOME[user.role]);
  }

  return (
    <div className="flex h-screen flex-col">
      <Heartbeat />
      <Gnb user={user} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar role={user.role} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
