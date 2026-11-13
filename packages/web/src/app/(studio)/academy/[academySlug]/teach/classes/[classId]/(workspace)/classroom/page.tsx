import { ClassroomPage } from '@/components/classroom/classroom-page';
export default async function Page({ params }: { params: Promise<{ academySlug: string; classId: string }> }) {
  return <ClassroomPage {...await params} />;
}
