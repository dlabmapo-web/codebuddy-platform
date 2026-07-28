import FeedbackClient from './FeedbackClient';
import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { ROLE_HOME } from '@/lib/navigation/capabilities';

interface PageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}

export default async function FeedbackPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher') redirect(ROLE_HOME[user.role]);

  const { sessionId } = await params;
  const { returnTo } = await searchParams;
  return (
    <FeedbackClient
      sessionId={sessionId}
      teacherId={user.id}
      teacherName={user.name}
      returnTo={returnTo}
    />
  );
}
