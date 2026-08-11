import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { Gnb } from '@/components/layout/Gnb';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/login');

  return (
    <div className="theme-light flex flex-col h-screen">
      <Gnb user={user} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar role="admin" />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
