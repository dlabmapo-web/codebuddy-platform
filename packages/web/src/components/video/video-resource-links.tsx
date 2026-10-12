"use client";
import { useQuery } from "@tanstack/react-query";
import { videoApi } from "@/lib/video-api";
import { VideoResource } from "./video-resource";
export function VideoResourceLinks({
  academyId,
  materialId,
  classId,
  preview = false,
}: {
  academyId: string;
  materialId: string;
  classId?: string;
  preview?: boolean;
}) {
  const query = useQuery({
    queryKey: ["video-resources", academyId, materialId, preview],
    queryFn: () => videoApi.resources({ academyId, materialId, preview }),
    retry: false,
  });
  if (!query.data?.length) return null;
  return (
    <aside className="flex flex-wrap gap-3 p-3">
      {query.data.map((r) => (
        <VideoResource
          key={r.id}
          academyId={academyId}
          materialId={r.id}
          classId={classId}
          title={r.title}
        />
      ))}
    </aside>
  );
}
