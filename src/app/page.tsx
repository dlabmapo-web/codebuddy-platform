import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const homeMap = {
    student: '/problems',
    teacher: '/students',
    admin: '/admin/problems',
  } as const;

  redirect(homeMap[user.role]);
}
