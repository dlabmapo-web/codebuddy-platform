"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVideoTranslation } from "./use-video-translation";
import { Modal, ModalContent } from "@/components/studio/primitives";
import { videoApi } from "@/lib/video-api";
import { VideoPlayer } from "./video-player";
export function VideoResource({
  academyId,
  materialId,
  classId,
  title,
}: {
  academyId: string;
  materialId: string;
  classId?: string;
  title: string;
}) {
  const [open, setOpen] = useState(false),
    { t } = useVideoTranslation();
  const query = useQuery({
    queryKey: ["video-resource", academyId, materialId, classId],
    queryFn: () =>
      videoApi.read({ academyId, materialId, classId, resource: true }),
    enabled: open,
    retry: false,
  });
  return (
    <>
      <button
        type="button"
        className="text-brand"
        onClick={() => {
          document.querySelectorAll("video").forEach((v) => v.pause());
          setOpen(true);
        }}
      >
        {title}
      </button>
      {open ? (
        <Modal open onOpenChange={setOpen}>
          <ModalContent title={title} className="max-w-5xl">
            <h2>{title}</h2>
            {query.data ? (
              <VideoPlayer
                data={query.data}
                academyId={academyId}
                classId={classId}
                resource
              />
            ) : (
              <p role={query.isError ? "alert" : "status"}>
                {t(query.isError ? "unavailable" : "loading")}
              </p>
            )}
            <button type="button" onClick={() => setOpen(false)}>
              {t("close")}
            </button>
          </ModalContent>
        </Modal>
      ) : null}
    </>
  );
}
