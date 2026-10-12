import { requireAcademyRoute } from '@/lib/academy-route';
import { ManualWorkspace } from '@/components/manual/manual-workspace';
export default async function Page({params,searchParams}:{params:Promise<{academySlug:string;materialId:string}>;searchParams:Promise<{classId?:string;preview?:string}>}){
 const {academySlug,materialId}=await params;const {academyId}=await requireAcademyRoute(academySlug);const query=await searchParams;
 return <ManualWorkspace key={materialId} academyId={academyId} materialId={materialId} classId={query.classId} preview={query.preview==='true'}/>;
}
