import {requireAcademyRoute} from "@/lib/academy-route";
import {VideoClassViewingReport} from "@/components/video/video-class-report";
export default async function Page({params}:{params:Promise<{academySlug:string;classId:string;materialId:string}>}){const {academySlug,classId,materialId}=await params,{academyId}=await requireAcademyRoute(academySlug);return <VideoClassViewingReport academyId={academyId} materialId={materialId} classId={classId}/>;}
