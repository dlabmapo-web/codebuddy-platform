import {requireAcademyRoute} from "@/lib/academy-route";
import {VideoWatchHistory} from "@/components/video/video-watch-history";
export default async function Page({params}:{params:Promise<{academySlug:string;classId:string;materialId:string}>}){const {academySlug,classId,materialId}=await params,{academyId}=await requireAcademyRoute(academySlug);return <VideoWatchHistory academyId={academyId} materialId={materialId} classId={classId}/>;}
