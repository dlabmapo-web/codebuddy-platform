import { FeedbackDraftProvider } from '@/lib/monitoring/feedback-draft-provider';
import { requireAcademyRoute } from '@/lib/academy-route';
import { readClassWorkspaceRoster } from '@/lib/class-workspace-server';
import { ClassLiveProvider } from '@/components/classroom/class-live-provider';

/** Shared by teaching and live monitoring; navigation retains the class transports. */
export default async function ClassWorkspaceLayout({ params, children }: {
  params: Promise<{ academySlug: string; classId: string }>; children: React.ReactNode;
}) {
  const { academySlug, classId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const roster = await readClassWorkspaceRoster(academyId, classId).catch(() => null);
  return <ClassLiveProvider key={`${academyId}:${classId}`} academyId={academyId} classId={classId} academySlug={academySlug} initialRoster={roster} serverReadToken={crypto.randomUUID()}><FeedbackDraftProvider>{children}</FeedbackDraftProvider></ClassLiveProvider>;
}
