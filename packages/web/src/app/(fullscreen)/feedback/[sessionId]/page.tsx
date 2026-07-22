import FeedbackClient from './FeedbackClient';
import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function FeedbackPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/login');

  const { sessionId } = await params;
  return <FeedbackClient sessionId={sessionId} teacherId={user.id} teacherName={user.name} />;
}
