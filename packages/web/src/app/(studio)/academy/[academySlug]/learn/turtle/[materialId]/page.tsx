import { getAccount } from '@/lib/orpc-server';
import { readManualWorkspace } from '@/lib/manual-server';
import { requireAcademyRoute } from '@/lib/academy-route';
import { ManualWorkspace } from '@/components/manual/manual-workspace';
export default async function Page({params,searchParams}:{params:Promise<{academySlug:string;materialId:string}>;searchParams:Promise<{classId?:string;preview?:string}>}){
 const {academySlug,materialId}=await params;const {academyId}=await requireAcademyRoute(academySlug);const query=await searchParams;
 const preview=query.preview==='true';
 // The activity is read during the render so the page arrives with it.
 const [{user},initialWorkspace]=await Promise.all([getAccount(),readManualWorkspace({academyId,materialId,preview,classId:query.classId})]);
 return <ManualWorkspace key={`${user.id}:${materialId}:${query.preview ?? "false"}`} userId={user.id} academyId={academyId} materialId={materialId} classId={query.classId} preview={preview} initialWorkspace={initialWorkspace}/>;
}
