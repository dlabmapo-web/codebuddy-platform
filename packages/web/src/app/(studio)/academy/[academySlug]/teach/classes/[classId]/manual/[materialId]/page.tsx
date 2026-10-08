import { requireAcademyRoute } from '@/lib/academy-route';
import { ManualReviewWorkspace } from '@/components/manual/manual-review-workspace';
export default async function Page({params}:{params:Promise<{academySlug:string;classId:string;materialId:string}>}){const {academySlug,classId,materialId}=await params;const {academyId}=await requireAcademyRoute(academySlug);return <ManualReviewWorkspace key={materialId} academyId={academyId} classId={classId} materialId={materialId}/>;}
