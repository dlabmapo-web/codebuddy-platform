import { getAccount } from '@/lib/orpc-server';
import { requireAcademyRoute } from "@/lib/academy-route";
import { ManualWorkspace } from "@/components/manual/manual-workspace";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string; materialId: string }>;
  searchParams: Promise<{ classId?: string; preview?: string }>;
}) {
  const { academySlug, materialId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const query = await searchParams;
  const { user } = await getAccount();
  return (
    <ManualWorkspace
      key={`${user.id}:${materialId}:${query.preview ?? "false"}`}
      userId={user.id}
      academyId={academyId}
      materialId={materialId}
      classId={query.classId}
      preview={query.preview === "true"}
    />
  );
}
