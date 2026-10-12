import {requireAcademyRoute} from "@/lib/academy-route";
import {VideoLesson} from "@/components/video/video-lesson";
export default async function Page({params,searchParams}:{params:Promise<{academySlug:string;materialId:string}>;searchParams:Promise<{classId?:string;preview?:string}>}){const {academySlug,materialId}=await params,{academyId}=await requireAcademyRoute(academySlug),query=await searchParams;return <VideoLesson key={materialId} academyId={academyId} materialId={materialId} classId={query.classId} preview={query.preview==='true'}/>;}
